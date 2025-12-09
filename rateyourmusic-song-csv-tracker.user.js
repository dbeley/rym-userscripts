// ==UserScript==
// @name         RateYourMusic Song CSV Tracker
// @namespace    https://github.com/dbeley/rym-userscripts
// @version      1.0.0
// @description  Capture song metadata on RateYourMusic song and chart pages and keep a CSV in sync (auto-save or manual download).
// @author       dbeley
// @match        https://rateyourmusic.com/song/*
// @match        https://rateyourmusic.com/charts/*/song/*
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_registerMenuCommand
// @grant        GM_download
// @run-at       document-idle
// ==/UserScript==

(function () {
  "use strict";
  const STORAGE_KEY = "rateyourmusic-song-csv::records";
  const DB_NAME = "rateyourmusic-song-csv";
  const STORE_NAME = "handles";
  const FILE_KEY = "csv-output-songs";

  GM_registerMenuCommand("Set song CSV output file", () => {
    pickCsvFile(true).catch(console.error);
  });
  GM_registerMenuCommand("Download song CSV once", () => {
    downloadCsv().catch(console.error);
  });

  main().catch(console.error);

  async function main() {
    if (window.location.pathname.includes("/charts/")) {
      const records = extractChartRecords();
      if (records.length > 0) {
        for (const record of records) {
          await upsertRecord(record);
        }
        console.info(
          `[rateyourmusic-song-csv] Recorded ${records.length} songs from chart page`
        );
        await writeCsvToDisk();
      }
      return;
    }

    const record = extractSongRecord();
    if (!record) return;

    await upsertRecord(record);
    console.info(
      `[rateyourmusic-song-csv] Recorded ${record.name || "unknown"} (${record.slug}) updated at ${record.updatedAt}`
    );
    await writeCsvToDisk();
  }

  function extractSongRecord() {
    const name =
      document.querySelector(".page_song_header_main_info h1 .ui_name_locale_original")
        ?.textContent?.trim() ||
      document.querySelector('meta[property="og:title"]')?.content?.trim() ||
      document.title;

    if (!name) return null;

    const artist =
      document
        .querySelector(".page_song_header_info_artist .artist .ui_name_locale_original")
        ?.textContent?.trim() ||
      document.querySelector(".page_song_header_info_artist .artist")?.textContent?.trim() ||
      "";

    const albumLink = document.querySelector(".page_song_header_info_rest a.album");
    const album = albumLink?.textContent?.trim() || "";
    const albumUrl = albumLink ? new URL(albumLink.href, location.href).href : "";

    const type = extractType();
    const releaseDate = extractReleaseDate();
    const rank = extractRankInfo();

    const ratingValue = cleanNumber(
      document.querySelector(".page_section_main_info_music_rating_value_rating")
        ?.textContent
    );
    const ratingCount = cleanNumber(
      document.querySelector(".page_section_main_info_music_rating_value_number")
        ?.textContent
    );

    const primaryGenres = extractList(
      document.querySelectorAll(".page_song_header_info_genre a.genre")
    );
    const secondaryGenres = ""; // Secondary genres are not surfaced on song pages
    const descriptors = extractDescriptors();

    const description =
      document.querySelector('meta[name="description"]')?.content ||
      document.querySelector('meta[property="og:description"]')?.content ||
      "";

    const image =
      document.querySelector('meta[property="og:image"]')?.content ||
      document.querySelector(".page_song_header_art img")?.src ||
      "";

    const url = new URL(
      document.querySelector('link[rel="canonical"]')?.href || location.href,
      location.href
    ).href;
    const slug = url.split("/").filter(Boolean).pop() || "song";
    const now = new Date().toISOString();

    return {
      slug,
      name,
      artist,
      album,
      albumUrl,
      type,
      releaseDate,
      rank,
      ratingValue: ratingValue ?? "",
      maxRating: "", // Not exposed on song pages
      ratingCount: ratingCount ?? "",
      reviewCount: "", // Not exposed on song pages
      primaryGenres,
      secondaryGenres,
      descriptors,
      image,
      description,
      url,
      updatedAt: now,
    };
  }

  function extractType() {
    const spans = document.querySelectorAll(".page_song_header_info_rest .pipe_separated");
    for (const span of spans) {
      const text = span.textContent.trim();
      if (text && !/^Released/i.test(text) && !/#/g.test(text)) {
        return text;
      }
    }
    return "Song";
  }

  function extractReleaseDate() {
    const spans = document.querySelectorAll(".page_song_header_info_rest .pipe_separated");
    for (const span of spans) {
      const text = span.textContent.trim();
      const match = text.match(/Released\s+(.*)/i);
      if (match) return match[1].trim();
    }
    return "";
  }

  function extractRankInfo() {
    const rankLinks = document.querySelectorAll(".page_song_header_info_rest a");
    const ranks = Array.from(rankLinks)
      .map((link) => link.textContent.trim().replace(/\s+/g, " "))
      .filter(Boolean);
    return ranks.join("; ");
  }

  function extractDescriptors() {
    const descriptorEl = document.querySelector(".page_song_header_info_descriptors");
    if (!descriptorEl) return "";
    return descriptorEl.textContent
      .split(/,|;/)
      .map((part) => part.trim())
      .filter(Boolean)
      .join("; ");
  }

  function cleanNumber(value) {
    if (!value) return "";
    return value.replace(/\s+/g, " ").replace(/ratings?$/i, "").trim();
  }

  function extractChartRecords() {
    const chartItems = document.querySelectorAll(
      ".page_charts_section_charts_item.object_song"
    );
    const records = [];

    chartItems.forEach((item) => {
      const link = item.querySelector(".page_charts_section_charts_item_link.song");
      if (!link) return;

      const url = new URL(link.href, location.href).href;
      const slug = new URL(url).pathname.split("/").filter(Boolean).pop();
      if (!slug) return;

      const nameNode = link.querySelector(".ui_name_locale_original");
      const name = nameNode ? nameNode.textContent.trim() : link.textContent.trim();

      const artistLink = item.querySelector(
        ".page_charts_section_charts_item_credited_links_primary a.artist"
      );
      const artistNameNode = artistLink?.querySelector(".ui_name_locale_original");
      const artist = artistNameNode
        ? artistNameNode.textContent.trim()
        : artistLink?.textContent.trim() || "";

      const dateNode = item.querySelector(
        ".page_charts_section_charts_item_title_date_compact span"
      );
      const releaseDate = dateNode ? dateNode.textContent.trim() : "";

      const typeNode = item.querySelector(".page_charts_section_charts_item_release_type");
      const type = (typeNode ? typeNode.textContent.trim() : "") || "Song";

      const ratingNode = item.querySelector(
        ".page_charts_section_charts_item_details_average_num"
      );
      const ratingValue = ratingNode ? ratingNode.textContent.trim() : "";

      const ratingCountNode = item.querySelector(
        ".page_charts_section_charts_item_details_ratings .abbr"
      );
      const ratingCount = ratingCountNode ? ratingCountNode.textContent.trim() : "";

      const primaryGenres = extractList(
        item.querySelectorAll(".page_charts_section_charts_item_genres_primary a.genre")
      );
      const secondaryGenres = extractList(
        item.querySelectorAll(".page_charts_section_charts_item_genres_secondary a.genre")
      );

      const imgNode = item.querySelector(".page_charts_section_charts_item_image img");
      const image = imgNode ? imgNode.src : "";

      const now = new Date().toISOString();

      records.push({
        slug,
        name,
        artist,
        album: "",
        albumUrl: "",
        type,
        releaseDate,
        rank: "", // Not available on chart items
        ratingValue,
        maxRating: "",
        ratingCount,
        reviewCount: "",
        primaryGenres,
        secondaryGenres,
        descriptors: "",
        image,
        description: "",
        url,
        updatedAt: now,
        isPartial: true,
      });
    });

    return records;
  }

  async function upsertRecord(record) {
    const records = await loadRecords();
    const existing = records[record.slug] || {};

    if (record.isPartial && !existing.isPartial) {
      records[record.slug] = {
        ...existing,
        slug: record.slug,
        ...(record.name && { name: record.name }),
        ...(record.artist && { artist: record.artist }),
        ...(record.type && { type: record.type }),
        ...(record.releaseDate && { releaseDate: record.releaseDate }),
        ...(record.ratingValue && { ratingValue: record.ratingValue }),
        ...(record.ratingCount && { ratingCount: record.ratingCount }),
        ...(record.primaryGenres && { primaryGenres: record.primaryGenres }),
        ...(record.secondaryGenres && { secondaryGenres: record.secondaryGenres }),
        ...(record.descriptors && { descriptors: record.descriptors }),
        ...(record.image && { image: record.image }),
        ...(record.url && record.url !== existing.url && { url: record.url }),
        updatedAt: record.updatedAt,
        firstSeen: existing.firstSeen || record.updatedAt,
      };
    } else {
      const merged = {
        ...existing,
        ...record,
        firstSeen: existing.firstSeen || record.updatedAt,
      };
      if (record.isPartial === undefined) {
        delete merged.isPartial;
      }
      records[record.slug] = merged;
    }

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
      // Also save to localStorage for cross-script access
      localStorage.setItem(STORAGE_KEY, JSON.stringify(records));
    } catch (err) {
      console.error("[rateyourmusic-song-csv] Unable to persist records", err);
    }
  }

  function buildCsv(records) {
    const headers = [
      "name",
      "slug",
      "artist",
      "album",
      "albumUrl",
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
      "image",
      "description",
      "url",
      "firstSeen",
      "updatedAt",
    ];

    const rows = Object.values(records)
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((entry) => headers.map((key) => escapeCsv(entry[key] ?? "")).join(","));

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
        "[rateyourmusic-song-csv] Pick an output file via the menu to auto-save the CSV."
      );
      return;
    }

    const permission = await ensurePermission(handle);
    if (permission !== "granted") {
      console.warn(
        "[rateyourmusic-song-csv] File permission was denied. Re-select the output file."
      );
      return;
    }

    const writable = await handle.createWritable();
    await writable.write(csv);
    await writable.close();
    console.debug("[rateyourmusic-song-csv] CSV written to disk.");
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
        "Your browser does not support the File System Access API. Use the 'Download song CSV once' menu instead."
      );
      return;
    }

    const handle = await window.showSaveFilePicker({
      suggestedName: "rateyourmusic-songs.csv",
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
      `[rateyourmusic-song-csv] Download command triggered (records=${Object.keys(records).length || 0})`
    );
    const filename = "rateyourmusic-songs.csv";
    const blob = new Blob([csv], { type: "text/csv" });
    const blobUrl = URL.createObjectURL(blob);

    const isFirefox =
      typeof navigator === "object" && /Firefox/.test(navigator.userAgent);
    const attempts = [
      async () => {
        if (isFirefox) throw new Error("skip GM_download on Firefox");
        if (typeof GM_download !== "function") throw new Error("GM_download missing");
        await GM_download({ url: blobUrl, name: filename, saveAs: true });
        console.info("[rateyourmusic-song-csv] GM_download succeeded.");
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
        console.info("[rateyourmusic-song-csv] Anchor click fallback attempted.");
      },
      async () => {
        const dataUrl = `data:text/csv;charset=utf-8,${encodeURIComponent(csv)}`;
        const win = window.open(dataUrl, "_blank");
        if (!win) throw new Error("Popup blocked");
        console.info("[rateyourmusic-song-csv] Opened data URL in new tab.");
      },
    ];

    let success = false;
    for (const attempt of attempts) {
      try {
        await attempt();
        success = true;
        break;
      } catch (err) {
        console.warn("[rateyourmusic-song-csv] Download path failed:", err);
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
      console.error("[rateyourmusic-song-csv] Unable to load stored handle", err);
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

  function extractList(nodes) {
    return Array.from(nodes)
      .map((node) => node.textContent.trim())
      .filter(Boolean)
      .join("; ");
  }
})();
