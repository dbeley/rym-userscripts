// ==UserScript==
// @name         YouTube Music RYM Ratings Display
// @namespace    https://github.com/dbeley/rym-userscripts
// @version      1.0.0
// @description  Display RateYourMusic ratings on YouTube Music tracks and albums
// @author       dbeley
// @match        https://music.youtube.com/*
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_registerMenuCommand
// @run-at       document-idle
// ==/UserScript==

(function () {
  "use strict";

  const SONG_STORAGE_KEY = "rateyourmusic-song-csv::records";
  const RELEASE_STORAGE_KEY = "rateyourmusic-csv::records";

  let songDatabase = {};
  let releaseDatabase = {};
  let processedElements = new WeakSet();

  GM_registerMenuCommand("Load RYM release CSV", () => loadCSVFile(RELEASE_STORAGE_KEY, 'releases'));
  GM_registerMenuCommand("Load RYM song CSV", () => loadCSVFile(SONG_STORAGE_KEY, 'songs'));

  function loadCSVFile(storageKey, type) {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.csv';
    input.style.display = 'none';
    input.onchange = async (e) => {
      try {
        const file = e.target.files[0];
        if (!file) return;
        const text = await file.text();
        const records = parseCSV(text);
        await GM_setValue(storageKey, records);
        input.remove();
        alert(`Loaded ${Object.keys(records).length} ${type}`);
        location.reload();
      } catch (err) {
        input.remove();
        alert("Failed: " + err.message);
      }
    };
    document.body.appendChild(input);
    input.click();
  }

  function parseCSV(text) {
    const lines = text.trim().split('\n');
    const headers = lines[0].split(',').map(h => h.replace(/^"|"$/g, '').trim());
    const records = {};
    for (let i = 1; i < lines.length; i++) {
      const values = parseCSVLine(lines[i]);
      const record = {};
      headers.forEach((h, idx) => record[h] = values[idx] || '');
      if (record.slug) records[record.slug] = record;
    }
    return records;
  }

  function parseCSVLine(line) {
    const values = [];
    let current = '', inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (c === '"' && line[i+1] === '"') { current += '"'; i++; }
      else if (c === '"') inQuotes = !inQuotes;
      else if (c === ',' && !inQuotes) { values.push(current); current = ''; }
      else current += c;
    }
    values.push(current);
    return values;
  }

  async function loadDatabases() {
    try {
      songDatabase = (await GM_getValue(SONG_STORAGE_KEY, {})) || {};
      releaseDatabase = (await GM_getValue(RELEASE_STORAGE_KEY, {})) || {};
      const sc = Object.keys(songDatabase).length;
      const rc = Object.keys(releaseDatabase).length;
      console.info(`[youtube-music-rym-ratings] Loaded ${sc} songs and ${rc} releases`);
      if (sc === 0 && rc === 0) {
        console.warn("[youtube-music-rym-ratings] No data. Use 'Load RYM CSV' menu commands.");
      }
    } catch (err) {
      console.error("[youtube-music-rym-ratings] Failed to load:", err);
    }
  }

  // Normalize string for fuzzy matching
  function normalizeString(str) {
    if (!str) return "";
    return str
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^\w\s]/g, "")
      .replace(/\s+/g, " ")
      .trim();
  }

  // Calculate similarity score
  function similarity(s1, s2) {
    const longer = s1.length > s2.length ? s1 : s2;
    const shorter = s1.length > s2.length ? s2 : s1;
    const longerLength = longer.length;
    if (longerLength === 0) return 1.0;

    const editDistance = (s1, s2) => {
      s1 = s1.toLowerCase();
      s2 = s2.toLowerCase();
      const costs = [];
      for (let i = 0; i <= s1.length; i++) {
        let lastValue = i;
        for (let j = 0; j <= s2.length; j++) {
          if (i === 0) costs[j] = j;
          else if (j > 0) {
            let newValue = costs[j - 1];
            if (s1.charAt(i - 1) !== s2.charAt(j - 1))
              newValue = Math.min(Math.min(newValue, lastValue), costs[j]) + 1;
            costs[j - 1] = lastValue;
            lastValue = newValue;
          }
        }
        if (i > 0) costs[s2.length] = lastValue;
      }
      return costs[s2.length];
    };

    return (longerLength - editDistance(longer, shorter)) / longerLength;
  }

  // Find best match in database
  function findMatch(artist, title, database, threshold = 0.75) {
    const normalizedArtist = normalizeString(artist);
    const normalizedTitle = normalizeString(title);
    let bestMatch = null;
    let bestScore = threshold;

    for (const record of Object.values(database)) {
      const recordArtist = normalizeString(record.artist);
      const recordName = normalizeString(record.name);

      const artistScore = similarity(normalizedArtist, recordArtist);
      const titleScore = similarity(normalizedTitle, recordName);
      const combinedScore = titleScore * 0.6 + artistScore * 0.4;

      if (combinedScore > bestScore) {
        bestScore = combinedScore;
        bestMatch = record;
      }
    }

    return bestMatch;
  }

  // Create rating badge
  function createRatingBadge(rating, ratingCount, url) {
    const badge = document.createElement("span");
    badge.className = "rym-rating-badge";
    badge.style.cssText = `
      display: inline-flex;
      align-items: center;
      gap: 4px;
      padding: 2px 8px;
      background: rgba(255, 200, 0, 0.15);
      border: 1px solid rgba(255, 200, 0, 0.4);
      border-radius: 12px;
      font-size: 12px;
      font-weight: 600;
      color: #ffc800;
      white-space: nowrap;
      margin-left: 8px;
      cursor: pointer;
    `;

    badge.innerHTML = `
      <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor">
        <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
      </svg>
      <span>${rating}</span>
      ${ratingCount ? `<span style="opacity: 0.7; font-size: 10px;">(${ratingCount})</span>` : ""}
    `;

    if (url) {
      badge.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        window.open(url, "_blank");
      });
      badge.title = "View on RateYourMusic";
    }

    return badge;
  }

  // Process now playing bar (player bar)
  function processNowPlaying() {
    const playerBar = document.querySelector("ytmusic-player-bar");
    if (!playerBar || processedElements.has(playerBar)) return;

    const trackNameEl = playerBar.querySelector(".title");
    const artistNameEl = playerBar.querySelector(".byline");

    const trackName = trackNameEl?.textContent?.trim();
    const artistName = artistNameEl?.textContent?.trim()?.split("•")[0]?.trim();

    if (!trackName || !artistName) return;

    let match = findMatch(artistName, trackName, songDatabase);
    if (!match) {
      match = findMatch(artistName, trackName, releaseDatabase);
    }

    if (match && match.ratingValue) {
      if (trackNameEl && !trackNameEl.querySelector(".rym-rating-badge")) {
        const badge = createRatingBadge(match.ratingValue, match.ratingCount, match.url);
        trackNameEl.appendChild(badge);
        processedElements.add(playerBar);
        console.info(`[youtube-music-rym-ratings] Added rating to now playing: ${trackName}`);
      }
    }
  }

  // Process track rows in playlists/albums
  function processTrackRows() {
    const trackRows = document.querySelectorAll("ytmusic-responsive-list-item-renderer");

    trackRows.forEach((row) => {
      if (processedElements.has(row)) return;

      const flexColumns = row.querySelectorAll("yt-formatted-string.title");
      if (flexColumns.length === 0) return;

      const trackNameEl = flexColumns[0];
      const artistRun = row.querySelector(".secondary-flex-columns yt-formatted-string a");

      const trackName = trackNameEl?.textContent?.trim();
      const artistName = artistRun?.textContent?.trim();

      if (!trackName || !artistName) return;

      let match = findMatch(artistName, trackName, songDatabase);
      if (!match) {
        match = findMatch(artistName, trackName, releaseDatabase);
      }

      if (match && match.ratingValue) {
        if (trackNameEl && !trackNameEl.querySelector(".rym-rating-badge")) {
          const badge = createRatingBadge(match.ratingValue, match.ratingCount, match.url);
          badge.style.fontSize = "11px";
          trackNameEl.appendChild(badge);
          processedElements.add(row);
        }
      }
    });
  }

  // Process album/playlist cards
  function processAlbumCards() {
    const cards = document.querySelectorAll("ytmusic-two-row-item-renderer");

    cards.forEach((card) => {
      if (processedElements.has(card)) return;

      const titleEl = card.querySelector(".title");
      const subtitleEl = card.querySelector(".subtitle a");

      const albumName = titleEl?.textContent?.trim();
      const artistName = subtitleEl?.textContent?.trim();

      if (!albumName || !artistName) return;

      const match = findMatch(artistName, albumName, releaseDatabase);

      if (match && match.ratingValue) {
        if (titleEl && !titleEl.querySelector(".rym-rating-badge")) {
          const badge = createRatingBadge(match.ratingValue, match.ratingCount, match.url);
          badge.style.fontSize = "11px";
          titleEl.appendChild(badge);
          processedElements.add(card);
        }
      }
    });
  }

  // Process album header (when viewing an album page)
  function processAlbumHeader() {
    const albumHeader = document.querySelector("ytmusic-detail-header-renderer");
    if (!albumHeader || processedElements.has(albumHeader)) return;

    const titleEl = albumHeader.querySelector(".title");
    const subtitleEl = albumHeader.querySelector(".subtitle a");

    const albumName = titleEl?.textContent?.trim();
    const artistName = subtitleEl?.textContent?.trim();

    if (!albumName || !artistName) return;

    const match = findMatch(artistName, albumName, releaseDatabase);

    if (match && match.ratingValue) {
      if (titleEl && !titleEl.querySelector(".rym-rating-badge")) {
        const badge = createRatingBadge(match.ratingValue, match.ratingCount, match.url);
        badge.style.fontSize = "16px";
        badge.style.display = "block";
        badge.style.marginTop = "8px";
        titleEl.appendChild(badge);
        processedElements.add(albumHeader);
        console.info(`[youtube-music-rym-ratings] Added rating to album header: ${albumName}`);
      }
    }
  }

  // Process shelf renderers (for browsing)
  function processShelfItems() {
    const shelves = document.querySelectorAll("ytmusic-shelf-renderer");

    shelves.forEach((shelf) => {
      const items = shelf.querySelectorAll("ytmusic-responsive-list-item-renderer");
      items.forEach((item) => {
        if (processedElements.has(item)) return;

        const titleEl = item.querySelector(".title");
        const artistEl = item.querySelector(".secondary-flex-columns a");

        const trackName = titleEl?.textContent?.trim();
        const artistName = artistEl?.textContent?.trim();

        if (!trackName || !artistName) return;

        let match = findMatch(artistName, trackName, songDatabase);
        if (!match) {
          match = findMatch(artistName, trackName, releaseDatabase);
        }

        if (match && match.ratingValue) {
          if (titleEl && !titleEl.querySelector(".rym-rating-badge")) {
            const badge = createRatingBadge(match.ratingValue, match.ratingCount, match.url);
            badge.style.fontSize = "11px";
            titleEl.appendChild(badge);
            processedElements.add(item);
          }
        }
      });
    });
  }

  // Main observer
  function startObserver() {
    const observer = new MutationObserver(() => {
      processNowPlaying();
      processTrackRows();
      processAlbumCards();
      processAlbumHeader();
      processShelfItems();
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true,
    });

    processNowPlaying();
    processTrackRows();
    processAlbumCards();
    processAlbumHeader();
    processShelfItems();
  }

  // Initialize
  async function init() {
    await loadDatabases();

    // Wait for YouTube Music to load
    const checkYTMusic = setInterval(() => {
      if (document.querySelector("ytmusic-player-bar")) {
        clearInterval(checkYTMusic);
        startObserver();
        setInterval(processNowPlaying, 2000);
      }
    }, 1000);
  }

  init().catch(console.error);
})();
