// ==UserScript==
// @name         Glitchwave Game CSV Tracker
// @namespace    https://github.com/dbeley/rym-userscripts
// @version      1.2.0
// @description  Capture game metadata on Glitchwave pages and keep a CSV in sync (auto-save or manual download). Provides cross-domain API access.
// @author       dbeley
// @match        https://glitchwave.com/game/*
// @match        https://glitchwave.com/charts/*
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_registerMenuCommand
// @grant        GM_download
// @grant        GM_setClipboard
// @run-at       document-idle
// ==/UserScript==

(function () {
  "use strict";
  const STORAGE_KEY = "glitchwave-csv::records";
  const DB_NAME = "glitchwave-csv";
  const STORE_NAME = "handles";
  const FILE_KEY = "csv-output";

  GM_registerMenuCommand("Set CSV output file", () => {
    pickCsvFile(true).catch(console.error);
  });
  GM_registerMenuCommand("Download CSV once", () => {
    downloadCsv().catch(console.error);
  });
  GM_registerMenuCommand("Copy data as JSON", () => {
    copyDataAsJson().catch(console.error);
  });

  // Expose API for cross-domain/cross-script access
  exposeDataApi();

  main().catch(console.error);

  async function main() {
    // Check if we're on a chart page
    if (window.location.pathname.includes('/charts/')) {
      const records = extractChartRecords();
      if (records.length > 0) {
        for (const record of records) {
          await upsertRecord(record);
        }
        console.info(
          `[glitchwave-csv] Recorded ${records.length} games from chart page`
        );
        await writeCsvToDisk();
      }
      return;
    }

    // Otherwise, extract from game page
    const record = extractGameRecord();
    if (!record) return;

    await upsertRecord(record);
    console.info(
      `[glitchwave-csv] Recorded ${record.name || "unknown"} (${record.slug}) updated at ${record.updatedAt}`
    );
    await writeCsvToDisk();
  }

  function extractGameRecord() {
    const scriptNodes = Array.from(
      document.querySelectorAll('script[type="application/ld+json"]')
    );

    for (const node of scriptNodes) {
      try {
        const parsed = JSON.parse(node.textContent);
        if (parsed && parsed["@type"] === "VideoGame") {
          return buildRecord(parsed);
        }
      } catch (_) {
        /* ignore malformed JSON blocks */
      }
    }

    console.warn("[glitchwave-csv] No VideoGame JSON-LD block found.");
    return null;
  }

  function buildRecord(json) {
    const aggregate = json.aggregateRating || {};
    const urlFromJson = json.url || location.href;
    const urlObj = new URL(urlFromJson, location.href);
    const url = urlObj.href;
    const slug =
      (json["@id"] && json["@id"].split("/").filter(Boolean).pop()) ||
      urlObj.pathname.split("/").filter(Boolean).pop();
    const now = new Date().toISOString();

    return {
      slug: slug || "",
      name: (json.name || "").trim(),
      url,
      description: json.description || "",
      releaseDate: json.datePublished || "",
      genres: toList(json.genre),
      platforms: toList(json.gamePlatform),
      operatingSystems: toList(json.operatingSystem),
      image: json.image || "",
      ratingValue: aggregate.ratingValue ?? "",
      ratingCount: aggregate.ratingCount ?? "",
      reviewCount: aggregate.reviewCount ?? "",
      updatedAt: now,
    };
  }

  function extractChartRecords() {
    // Look for chart cards in the Glitchwave format
    const chartCards = document.querySelectorAll('.chart_card_top');
    const records = [];

    chartCards.forEach((card) => {
      const link = card.querySelector('.chart_title a.game');
      if (!link) return;

      const url = new URL(link.href, location.href).href;
      const slug = new URL(url).pathname.split('/').filter(Boolean).pop();
      if (!slug) return;

      const name = link.textContent.trim();

      // Get the parent container to find metadata
      const container = card.parentElement;
      if (!container) return;

      // Extract release date
      const dateNode = card.querySelector('.chart_release_date');
      const releaseDate = dateNode ? dateNode.textContent.trim() : "";

      // Extract rating info
      const ratingNode = container.querySelector('.chart_card_score .rating_number');
      const ratingValue = ratingNode ? ratingNode.textContent.trim() : "";

      const ratingsText = container.querySelector('.chart_card_ratings b');
      const ratingCount = ratingsText ? ratingsText.textContent.trim() : "";

      const reviewsText = container.querySelector('.chart_card_reviews b');
      const reviewCount = reviewsText ? reviewsText.textContent.trim() : "";

      // Extract genres
      const genreNodes = card.querySelectorAll('.chart_genres a.genre_');
      const genres = Array.from(genreNodes)
        .map(node => node.textContent.trim())
        .filter(Boolean)
        .join('; ');

      // Extract image
      const imageDiv = container.querySelector('.chart_card_image');
      let image = "";
      if (imageDiv) {
        const bgUrl = imageDiv.style.backgroundImage ||
                      imageDiv.getAttribute('data-delayloadurl2x') ||
                      imageDiv.getAttribute('data-delayloadurl');
        if (bgUrl) {
          // Extract URL from url('...') or just use the value
          const match = bgUrl.match(/url\(['"]?([^'"]+)['"]?\)/);
          image = match ? match[1] : bgUrl;
        }
      }

      const now = new Date().toISOString();

      records.push({
        slug,
        name,
        url,
        description: "", // Not available on chart items
        releaseDate,
        genres,
        platforms: "", // Not available on chart items
        operatingSystems: "", // Not available on chart items
        image,
        ratingValue,
        ratingCount,
        reviewCount,
        updatedAt: now,
        isPartial: true, // Mark as partial data
      });
    });

    return records;
  }

  async function upsertRecord(record) {
    const records = await loadRecords();
    const existing = records[record.slug] || {};
    
    // If the new record is partial, only update fields that have values
    // and preserve full data if it exists
    if (record.isPartial && !existing.isPartial) {
      // Merge partial data into full data, keeping full data when available
      records[record.slug] = {
        ...existing,
        slug: record.slug, // Ensure slug is always set
        // Only update these fields from partial data if they're not empty
        ...(record.name && { name: record.name }),
        ...(record.releaseDate && { releaseDate: record.releaseDate }),
        ...(record.ratingValue && { ratingValue: record.ratingValue }),
        ...(record.ratingCount && { ratingCount: record.ratingCount }),
        ...(record.reviewCount && { reviewCount: record.reviewCount }),
        ...(record.genres && { genres: record.genres }),
        ...(record.image && { image: record.image }),
        // Update URL only if it's different
        ...(record.url && record.url !== existing.url && { url: record.url }),
        updatedAt: record.updatedAt,
        firstSeen: existing.firstSeen || record.updatedAt,
      };
    } else {
      // Full data or both partial - do normal merge
      const merged = {
        ...existing,
        ...record,
        firstSeen: existing.firstSeen || record.updatedAt,
      };
      // If incoming record doesn't have isPartial property, remove the flag
      if (record.isPartial === undefined) {
        delete merged.isPartial;
      }
      records[record.slug] = merged;
    }
    
    await saveRecords(records);
  }

  function toList(value) {
    if (Array.isArray(value)) return value.join("; ");
    if (typeof value === "string") return value;
    return "";
  }

  async function loadRecords() {
    try {
      const stored = await GM_getValue(STORAGE_KEY, {});
      return stored || {};
    } catch (_) {
      return {};
    }
  }

  async function saveRecords(records) {
    try {
      await GM_setValue(STORAGE_KEY, records);
    } catch (err) {
      console.error("[glitchwave-csv] Unable to persist records", err);
    }
  }

  function buildCsv(records) {
    const headers = [
      "name",
      "slug",
      "url",
      "releaseDate",
      "ratingValue",
      "ratingCount",
      "reviewCount",
      "genres",
      "platforms",
      "operatingSystems",
      "image",
      "firstSeen",
      "updatedAt",
      "description",
    ];

    const rows = Object.values(records)
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((entry) =>
        headers.map((key) => escapeCsv(entry[key] ?? "")).join(",")
      );

    return [headers.join(","), ...rows].join("\n");
  }

  function escapeCsv(value) {
    const str = String(value ?? "");
    if (/[",\n]/.test(str)) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  }

  async function writeCsvToDisk() {
    const records = await loadRecords();
    const csv = buildCsv(records);
    const handle = await loadStoredHandle();

    if (!handle) {
      console.info(
        "[glitchwave-csv] Pick an output file via the menu to auto-save the CSV."
      );
      return;
    }

    const permission = await ensurePermission(handle);
    if (permission !== "granted") {
      console.warn(
        "[glitchwave-csv] File permission was denied. Re-select the output file."
      );
      return;
    }

    const writable = await handle.createWritable();
    await writable.write(csv);
    await writable.close();
    console.debug("[glitchwave-csv] CSV written to disk.");
  }

  async function ensurePermission(handle) {
    if (!handle.queryPermission || !handle.requestPermission) return "denied";

    let status = await handle.queryPermission({ mode: "readwrite" });
    if (status === "granted") return status;

    if (status === "prompt") {
      try {
        status = await handle.requestPermission({ mode: "readwrite" });
      } catch (_) {
        status = "denied";
      }
    }

    return status;
  }

  async function pickCsvFile(writeCurrentCsv = false) {
    if (!window.showSaveFilePicker) {
      alert(
        "Your browser does not support the File System Access API. Use the 'Download CSV once' menu instead."
      );
      return;
    }

    const handle = await window.showSaveFilePicker({
      suggestedName: "glitchwave-games.csv",
      types: [
        {
          description: "CSV file",
          accept: { "text/csv": [".csv"] },
        },
      ],
    });

    await storeHandle(handle);
    if (writeCurrentCsv) {
      await writeCsvToDisk();
    }
  }

  async function downloadCsv() {
    const records = await loadRecords();
    const csv = buildCsv(records);
    console.info(
      `[glitchwave-csv] Download command triggered (records=${Object.keys(
        records
      ).length || 0})`
    );
    const filename = "glitchwave-games.csv";
    const blob = new Blob([csv], { type: "text/csv" });
    const blobUrl = URL.createObjectURL(blob);

    const isFirefox =
      typeof navigator === "object" && /Firefox/.test(navigator.userAgent);
    const attempts = [
      async () => {
        if (isFirefox) throw new Error("skip GM_download on Firefox");
        if (typeof GM_download !== "function") throw new Error("GM_download missing");
        await GM_download({ url: blobUrl, name: filename, saveAs: true });
        console.info("[glitchwave-csv] GM_download succeeded.");
      },
      async () => {
        const anchor = document.createElement("a");
        anchor.href = blobUrl;
        anchor.download = filename;
        anchor.style.display = "none";
        document.body.append(anchor);
        anchor.dispatchEvent(
          new MouseEvent("click", { view: window, bubbles: true, cancelable: true })
        );
        anchor.click();
        anchor.remove();
        console.info("[glitchwave-csv] Anchor click fallback attempted.");
      },
      async () => {
        const dataUrl = `data:text/csv;charset=utf-8,${encodeURIComponent(csv)}`;
        const win = window.open(dataUrl, "_blank");
        if (!win) throw new Error("Popup blocked");
        console.info("[glitchwave-csv] Opened data URL in new tab.");
      },
    ];

    let success = false;
    for (const attempt of attempts) {
      try {
        await attempt();
        success = true;
        break;
      } catch (err) {
        console.warn("[glitchwave-csv] Download path failed:", err);
      }
    }

    if (!success) {
      alert(
        "CSV download was blocked. Check popup/download permissions for this site and try again."
      );
    }

    setTimeout(() => URL.revokeObjectURL(blobUrl), 1500);
  }

  async function loadStoredHandle() {
    try {
      const db = await openDb();
      return await readHandle(db);
    } catch (err) {
      console.error("[glitchwave-csv] Unable to load stored handle", err);
      return null;
    }
  }

  async function storeHandle(handle) {
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readwrite");
      tx.onerror = () => reject(tx.error);
      tx.oncomplete = () => resolve();
      tx.objectStore(STORE_NAME).put(handle, FILE_KEY);
    });
  }

  function readHandle(db) {
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readonly");
      const req = tx.objectStore(STORE_NAME).get(FILE_KEY);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(req.error);
    });
  }

  function openDb() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, 1);
      request.onupgradeneeded = () => {
        request.result.createObjectStore(STORE_NAME);
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async function copyDataAsJson() {
    const records = await loadRecords();
    const json = JSON.stringify(records, null, 2);
    
    if (typeof GM_setClipboard === "function") {
      GM_setClipboard(json, "text");
      alert(
        `Copied ${Object.keys(records).length} game records to clipboard as JSON.\n\n` +
        `You can now paste this data into another script or application.`
      );
      console.info("[glitchwave-csv] JSON data copied to clipboard");
    } else {
      // Fallback: create a temporary textarea and copy
      const textarea = document.createElement("textarea");
      textarea.value = json;
      textarea.style.position = "fixed";
      textarea.style.opacity = "0";
      document.body.appendChild(textarea);
      textarea.select();
      try {
        document.execCommand("copy");
        alert(
          `Copied ${Object.keys(records).length} game records to clipboard as JSON.\n\n` +
          `You can now paste this data into another script or application.`
        );
        console.info("[glitchwave-csv] JSON data copied to clipboard (fallback)");
      } catch (err) {
        alert("Failed to copy to clipboard. Check console for data.");
        console.log("[glitchwave-csv] JSON data:", json);
      } finally {
        document.body.removeChild(textarea);
      }
    }
  }

  function exposeDataApi() {
    // Expose a read-only API on the window object for cross-script access
    if (typeof window !== "undefined") {
      window.GlitchwaveCsvTracker = {
        // Get all records as a plain object
        async getRecords() {
          return await loadRecords();
        },
        
        // Get a single record by slug
        async getRecord(slug) {
          const records = await loadRecords();
          return records[slug] || null;
        },
        
        // Get records count
        async getRecordsCount() {
          const records = await loadRecords();
          return Object.keys(records).length;
        },
        
        // Search records by name, platform, or genre
        // Note: This performs a linear search. For large datasets, consider limiting results.
        async searchRecords(query, limit = 100) {
          const records = await loadRecords();
          const lowerQuery = query.toLowerCase();
          const results = Object.values(records).filter(record => 
            (record.name && record.name.toLowerCase().includes(lowerQuery)) ||
            (record.platforms && record.platforms.toLowerCase().includes(lowerQuery)) ||
            (record.genres && record.genres.toLowerCase().includes(lowerQuery))
          );
          return limit > 0 ? results.slice(0, limit) : results;
        },
        
        // Get records as CSV string
        async getCsv() {
          const records = await loadRecords();
          return buildCsv(records);
        },
        
        // Listen for data changes (returns unsubscribe function)
        // Note: Uses polling with configurable interval. For large datasets, consider longer intervals.
        onDataChange(callback, intervalMs = 5000) {
          // Poll for changes at specified interval (default 5 seconds)
          let lastRecordCount = 0;
          let lastUpdateTime = "";
          
          const intervalId = setInterval(async () => {
            const records = await loadRecords();
            const recordValues = Object.values(records);
            const currentCount = recordValues.length;
            const latestUpdate = recordValues.length > 0
              ? recordValues.reduce((latest, r) => 
                  r.updatedAt > latest ? r.updatedAt : latest, ""
                )
              : "";
            
            // Only trigger callback if count changed or latest update changed
            if (currentCount !== lastRecordCount || latestUpdate !== lastUpdateTime) {
              lastRecordCount = currentCount;
              lastUpdateTime = latestUpdate;
              callback(records);
            }
          }, intervalMs);
          
          // Return unsubscribe function
          return () => clearInterval(intervalId);
        }
      };
      
      console.info("[glitchwave-csv] API exposed at window.GlitchwaveCsvTracker");
    }
  }
})();
