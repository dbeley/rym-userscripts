// ==UserScript==
// @name         RateYourMusic Film CSV Tracker
// @namespace    https://github.com/dbeley/rym-userscripts
// @version      1.0.0
// @description  Capture film metadata on RateYourMusic pages and keep a CSV in sync (auto-save or manual download).
// @author       dbeley
// @match        https://rateyourmusic.com/film/*
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_registerMenuCommand
// @grant        GM_download
// @run-at       document-idle
// ==/UserScript==

(function () {
  "use strict";
  const STORAGE_KEY = "rateyourmusic-film-csv::records";
  const DB_NAME = "rateyourmusic-film-csv";
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
    const record = extractMovieRecord();
    if (!record) return;

    await upsertRecord(record);
    console.info(
      `[rateyourmusic-film-csv] Recorded ${record.name || "unknown"} (${record.slug}) updated at ${record.updatedAt}`
    );
    await writeCsvToDisk();
  }

  function extractMovieRecord() {
    const json = findMovieJsonLd();
    if (json) {
      return buildRecordFromJson(json);
    }

    console.warn("[rateyourmusic-film-csv] No Movie JSON-LD block found.");
    return null;
  }

  function findMovieJsonLd() {
    const scriptNodes = Array.from(
      document.querySelectorAll('script[type="application/ld+json"]')
    );

    for (const node of scriptNodes) {
      try {
        const parsed = JSON.parse(node.textContent);
        const candidates = [];

        if (Array.isArray(parsed)) {
          candidates.push(...parsed);
        } else if (parsed && Array.isArray(parsed["@graph"])) {
          candidates.push(...parsed["@graph"]);
        } else if (parsed) {
          candidates.push(parsed);
        }

        for (const candidate of candidates) {
          if (isMovieNode(candidate)) {
            return candidate;
          }
        }
      } catch (_) {
        /* ignore malformed JSON blocks */
      }
    }

    return null;
  }

  function isMovieNode(node) {
    const type = node?.["@type"];
    if (!type) return false;
    if (Array.isArray(type)) return type.includes("Movie");
    return type === "Movie";
  }

  function buildRecordFromJson(json) {
    const aggregate = json.aggregateRating || {};
    const url = json.url || location.href;
    const slug = getSlug(url, json["@id"]);
    const now = new Date().toISOString();

    return {
      slug: slug || "",
      name: (json.name || "").trim(),
      alternateName: json.alternateName || "",
      url,
      releaseDate: json.datePublished || json.dateCreated || "",
      duration: json.duration || "",
      genres: toList(json.genre),
      languages: toList(json.inLanguage),
      countries: normalizeNames(json.countryOfOrigin || json.locationCreated),
      directors: normalizeNames(json.director),
      writers: normalizeNames(json.author || json.creator || json.writer),
      actors: normalizeNames(json.actor || json.actors || json.cast),
      contentRating: json.contentRating || "",
      image: json.image || "",
      description: json.description || "",
      ratingValue: aggregate.ratingValue ?? "",
      maxRating: aggregate.bestRating ?? "",
      ratingCount: aggregate.ratingCount ?? "",
      reviewCount: aggregate.reviewCount ?? "",
      updatedAt: now,
    };
  }

  function getSlug(url, id) {
    const source = id || url;
    if (!source) return "";
    try {
      return new URL(source, location.href).pathname.split("/").filter(Boolean).pop() || "";
    } catch (_) {
      return String(source).split("/").filter(Boolean).pop() || "";
    }
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

  function toList(value) {
    if (Array.isArray(value)) return value.join("; ");
    if (typeof value === "string" || typeof value === "number") return String(value);
    return "";
  }

  function normalizeNames(value) {
    if (!value) return "";
    if (Array.isArray(value)) {
      return value
        .map((entry) => normalizeNames(entry))
        .filter(Boolean)
        .join("; ");
    }
    if (typeof value === "string") return value;
    if (typeof value === "object") {
      return value.name || "";
    }
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
      console.error("[rateyourmusic-film-csv] Unable to persist records", err);
    }
  }

  function buildCsv(records) {
    const headers = [
      "name",
      "alternateName",
      "slug",
      "url",
      "releaseDate",
      "duration",
      "genres",
      "languages",
      "countries",
      "directors",
      "writers",
      "actors",
      "contentRating",
      "ratingValue",
      "maxRating",
      "ratingCount",
      "reviewCount",
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
        "[rateyourmusic-film-csv] Pick an output file via the menu to auto-save the CSV."
      );
      return;
    }

    const permission = await ensurePermission(handle);
    if (permission !== "granted") {
      console.warn(
        "[rateyourmusic-film-csv] File permission was denied. Re-select the output file."
      );
      return;
    }

    const writable = await handle.createWritable();
    await writable.write(csv);
    await writable.close();
    console.debug("[rateyourmusic-film-csv] CSV written to disk.");
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
      suggestedName: "rateyourmusic-films.csv",
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
      `[rateyourmusic-film-csv] Download command triggered (records=${Object.keys(
        records
      ).length || 0})`
    );
    const filename = "rateyourmusic-films.csv";
    const blob = new Blob([csv], { type: "text/csv" });
    const blobUrl = URL.createObjectURL(blob);

    const isFirefox =
      typeof navigator === "object" && /Firefox/.test(navigator.userAgent);
    const attempts = [
      async () => {
        if (isFirefox) throw new Error("skip GM_download on Firefox");
        if (typeof GM_download !== "function") throw new Error("GM_download missing");
        await GM_download({ url: blobUrl, name: filename, saveAs: true });
        console.info("[rateyourmusic-film-csv] GM_download succeeded.");
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
        console.info("[rateyourmusic-film-csv] Anchor click fallback attempted.");
      },
      async () => {
        const dataUrl = `data:text/csv;charset=utf-8,${encodeURIComponent(csv)}`;
        const win = window.open(dataUrl, "_blank");
        if (!win) throw new Error("Popup blocked");
        console.info("[rateyourmusic-film-csv] Opened data URL in new tab.");
      },
    ];

    let success = false;
    for (const attempt of attempts) {
      try {
        await attempt();
        success = true;
        break;
      } catch (err) {
        console.warn("[rateyourmusic-film-csv] Download path failed:", err);
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
      console.error("[rateyourmusic-film-csv] Unable to load stored handle", err);
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
