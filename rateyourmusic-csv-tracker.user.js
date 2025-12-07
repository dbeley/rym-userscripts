// ==UserScript==
// @name         RateYourMusic Release CSV Tracker
// @namespace    https://example.com/userscripts
// @version      1.0.0
// @description  Track album metadata from RateYourMusic release pages and keep a CSV up to date on disk.
// @author       You
// @match        https://rateyourmusic.com/release/*
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_registerMenuCommand
// @grant        GM_download
// @run-at       document-idle
// ==/UserScript==

(function () {
  const STORAGE_KEY = "rateyourmusic-csv::records";
  const DB_NAME = "rateyourmusic-csv";
  const STORE_NAME = "handles";
  const FILE_KEY = "csv-output";

  GM_registerMenuCommand("Set CSV output file", () => {
    pickCsvFile(true).catch(console.error);
  });
  GM_registerMenuCommand("Download CSV once", () => {
    downloadCsv().catch(console.error);
  });

  main().catch(console.error);

  async function main() {
    const record = extractReleaseRecord();
    if (!record) return;

    await upsertRecord(record);
    console.info(
      `[rateyourmusic-csv] Recorded ${record.name || "unknown"} (${record.slug}) updated at ${record.updatedAt}`
    );
    await writeCsvToDisk();
  }

  function extractReleaseRecord() {
    const release = document.querySelector(
      '.release_page[itemtype="http://schema.org/MusicAlbum"]'
    );
    if (!release) {
      console.warn("[rateyourmusic-csv] Release blob not found on page.");
      return null;
    }

    const metadata = collectAlbumInfo();
    const agg = release.querySelector('[itemprop="aggregateRating"]');
    const ratingValue = agg?.querySelector('meta[itemprop="ratingValue"]')?.content;
    const ratingCount = agg?.querySelector('meta[itemprop="ratingCount"]')?.content;
    const reviewCount = agg?.querySelector('meta[itemprop="reviewCount"]')?.content;
    const maxRating = agg?.querySelector('meta[itemprop="bestRating"]')?.content;

    const name =
      release.querySelector('meta[itemprop="name"]')?.content?.trim() ||
      document.querySelector(".album_title")?.textContent?.trim() ||
      document.title;
    const artist = metadata["Artist"] || "";
    const releaseDate = metadata["Released"] || "";
    const type = metadata["Type"] || "";
    const rank = metadata["Ranked"] || "";
    const languages = metadata["Languages"] || "";

    const primaryGenres = extractList(
      document.querySelectorAll(".release_pri_genres a.genre")
    );
    const secondaryGenres = extractList(
      document.querySelectorAll(".release_sec_genres a.genre")
    );
    const descriptors = extractDescriptors();

    const description =
      document.querySelector('meta[name="description"]')?.content ||
      document.querySelector('meta[property="og:description"]')?.content ||
      "";
    const image =
      document.querySelector('meta[property="og:image"]')?.content ||
      release.querySelector("meta[itemprop=image]")?.content ||
      "";

    const url =
      release.querySelector('meta[itemprop="url"]')?.content ||
      location.href;
    const slug =
      new URL(url, location.href)
        .pathname.split("/")
        .filter(Boolean)
        .pop() || "other";
    const now = new Date().toISOString();

    return {
      slug,
      name,
      artist,
      type,
      releaseDate,
      rank,
      ratingValue: ratingValue ?? "",
      maxRating: maxRating ?? "",
      ratingCount: ratingCount ?? "",
      reviewCount: reviewCount ?? "",
      primaryGenres,
      secondaryGenres,
      descriptors,
      languages,
      description,
      image,
      url,
      updatedAt: now,
    };
  }

  function collectAlbumInfo() {
    const rows = document.querySelectorAll(".album_info tr");
    const map = {};

    rows.forEach((row) => {
      const header = row.querySelector("th");
      if (!header) return;
      const key = header.textContent.trim();
      const values = Array.from(row.querySelectorAll("td"))
        .map((td) => td.textContent.trim().replace(/\s+/g, " "))
        .filter(Boolean);
      map[key] = values.join(" ");
    });

    return map;
  }

  function extractList(nodes) {
    return Array.from(nodes)
      .map((node) => node.textContent.trim())
      .filter(Boolean)
      .join("; ");
  }

  function extractDescriptors() {
    const element = document.querySelector(".release_pri_descriptors");
    if (!element) return "";
    return element.textContent
      .split(",")
      .map((part) => part.trim())
      .filter(Boolean)
      .join("; ");
  }

  async function upsertRecord(record) {
    const records = await loadRecords();
    const existing = records[record.slug] || {};
    records[record.slug] = {
      ...existing,
      ...record,
      firstSeen: existing.firstSeen || record.updatedAt,
    };
    await saveRecords(records);
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
      console.error("[rateyourmusic-csv] Unable to persist records", err);
    }
  }

  function buildCsv(records) {
    const headers = [
      "name",
      "slug",
      "artist",
      "type",
      "releaseDate",
      "rank",
      "ratingValue",
      "maxRating",
      "ratingCount",
      "reviewCount",
      "primaryGenres",
      "secondaryGenres",
      "descriptors",
      "languages",
      "image",
      "description",
      "url",
      "firstSeen",
      "updatedAt",
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
        "[rateyourmusic-csv] Pick an output file via the menu to auto-save the CSV."
      );
      return;
    }

    const permission = await ensurePermission(handle);
    if (permission !== "granted") {
      console.warn(
        "[rateyourmusic-csv] File permission was denied. Re-select the output file."
      );
      return;
    }

    const writable = await handle.createWritable();
    await writable.write(csv);
    await writable.close();
    console.debug("[rateyourmusic-csv] CSV written to disk.");
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
      suggestedName: "rateyourmusic-releases.csv",
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
      `[rateyourmusic-csv] Download command triggered (records=${Object.keys(
        records
      ).length || 0})`
    );
    const filename = "rateyourmusic-releases.csv";
    const blob = new Blob([csv], { type: "text/csv" });
    const blobUrl = URL.createObjectURL(blob);

    const isFirefox =
      typeof navigator === "object" && /Firefox/.test(navigator.userAgent);
    const attempts = [
      async () => {
        if (isFirefox) throw new Error("skip GM_download on Firefox");
        if (typeof GM_download !== "function") throw new Error("GM_download missing");
        await GM_download({ url: blobUrl, name: filename, saveAs: true });
        console.info("[rateyourmusic-csv] GM_download succeeded.");
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
        console.info("[rateyourmusic-csv] Anchor click fallback attempted.");
      },
      async () => {
        const dataUrl = `data:text/csv;charset=utf-8,${encodeURIComponent(csv)}`;
        const win = window.open(dataUrl, "_blank");
        if (!win) throw new Error("Popup blocked");
        console.info("[rateyourmusic-csv] Opened data URL in new tab.");
      },
    ];

    let success = false;
    for (const attempt of attempts) {
      try {
        await attempt();
        success = true;
        break;
      } catch (err) {
        console.warn("[rateyourmusic-csv] Download path failed:", err);
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
      console.error("[rateyourmusic-csv] Unable to load stored handle", err);
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
})();
