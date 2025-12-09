// ==UserScript==
// @name         Spotify RYM Ratings Display
// @namespace    https://github.com/dbeley/rym-userscripts
// @version      1.0.0
// @description  Display RateYourMusic ratings on Spotify tracks and albums
// @author       dbeley
// @match        https://open.spotify.com/*
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
      console.info(`[spotify-rym-ratings] Loaded ${sc} songs and ${rc} releases`);
      if (sc === 0 && rc === 0) {
        console.warn("[spotify-rym-ratings] No data. Use 'Load RYM CSV' menu commands.");
      }
    } catch (err) {
      console.error("[spotify-rym-ratings] Failed to load:", err);
    }
  }

  // Normalize string for fuzzy matching
  function normalizeString(str) {
    if (!str) return "";
    return str
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "") // Remove diacritics
      .replace(/[^\w\s]/g, "") // Remove punctuation
      .replace(/\s+/g, " ")
      .trim();
  }

  // Calculate similarity score between two strings (0-1)
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

  // Find best match in database using fuzzy matching
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

      // Combined score with more weight on title match
      const combinedScore = titleScore * 0.6 + artistScore * 0.4;

      if (combinedScore > bestScore) {
        bestScore = combinedScore;
        bestMatch = record;
      }
    }

    return bestMatch;
  }

  // Create rating badge element
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
      text-decoration: none;
    `;

    badge.innerHTML = `
      <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
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

  // Process now playing bar
  function processNowPlaying() {
    const nowPlayingBar = document.querySelector('[data-testid="now-playing-widget"]');
    if (!nowPlayingBar || processedElements.has(nowPlayingBar)) return;

    const trackName = nowPlayingBar.querySelector('a[data-testid="context-item-link"]')?.textContent?.trim();
    const artistName = nowPlayingBar.querySelector('a[data-testid="context-item-info-artist"]')?.textContent?.trim();

    if (!trackName || !artistName) return;

    // Try to find in song database first
    let match = findMatch(artistName, trackName, songDatabase);
    let isSong = true;

    // If not found in songs, try releases
    if (!match) {
      match = findMatch(artistName, trackName, releaseDatabase);
      isSong = false;
    }

    if (match && match.ratingValue) {
      const container = nowPlayingBar.querySelector('[data-testid="context-item-info-subtitles"]');
      if (container && !container.querySelector(".rym-rating-badge")) {
        const badge = createRatingBadge(match.ratingValue, match.ratingCount, match.url);
        container.appendChild(badge);
        processedElements.add(nowPlayingBar);
        console.info(`[spotify-rym-ratings] Added rating to now playing: ${trackName} - ${match.ratingValue}`);
      }
    }
  }

  // Process track rows in playlists/albums
  function processTrackRows() {
    const trackRows = document.querySelectorAll('[data-testid="tracklist-row"]');

    trackRows.forEach((row) => {
      if (processedElements.has(row)) return;

      const trackNameEl = row.querySelector('[data-testid="internal-track-link"] span');
      const artistNameEl = row.querySelector('a[data-testid="internal-track-link"][href*="/artist/"]');

      const trackName = trackNameEl?.textContent?.trim();
      const artistName = artistNameEl?.textContent?.trim();

      if (!trackName || !artistName) return;

      // Try to find match
      let match = findMatch(artistName, trackName, songDatabase);
      if (!match) {
        match = findMatch(artistName, trackName, releaseDatabase);
      }

      if (match && match.ratingValue) {
        const titleCell = row.querySelector('[data-testid="internal-track-link"]');
        if (titleCell && !titleCell.querySelector(".rym-rating-badge")) {
          const badge = createRatingBadge(match.ratingValue, match.ratingCount, match.url);
          badge.style.marginLeft = "4px";
          titleCell.appendChild(badge);
          processedElements.add(row);
        }
      }
    });
  }

  // Process album cards
  function processAlbumCards() {
    const albumCards = document.querySelectorAll('[data-testid="card-click-handler"]');

    albumCards.forEach((card) => {
      if (processedElements.has(card)) return;

      const titleEl = card.querySelector('a[data-testid="card-click-handler"] span');
      const subtitleEl = card.querySelector('[data-testid="card-subtitle"] a');

      const albumName = titleEl?.textContent?.trim();
      const artistName = subtitleEl?.textContent?.trim();

      if (!albumName || !artistName) return;

      const match = findMatch(artistName, albumName, releaseDatabase);

      if (match && match.ratingValue) {
        const titleContainer = titleEl?.parentElement;
        if (titleContainer && !titleContainer.querySelector(".rym-rating-badge")) {
          const badge = createRatingBadge(match.ratingValue, match.ratingCount, match.url);
          badge.style.marginLeft = "4px";
          badge.style.fontSize = "11px";
          titleContainer.appendChild(badge);
          processedElements.add(card);
        }
      }
    });
  }

  // Main observer to watch for DOM changes
  function startObserver() {
    const observer = new MutationObserver(() => {
      processNowPlaying();
      processTrackRows();
      processAlbumCards();
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true,
    });

    // Initial processing
    processNowPlaying();
    processTrackRows();
    processAlbumCards();
  }

  // Initialize
  async function init() {
    await loadDatabases();
    startObserver();

    // Periodic refresh for now playing
    setInterval(processNowPlaying, 2000);
  }

  init().catch(console.error);
})();
