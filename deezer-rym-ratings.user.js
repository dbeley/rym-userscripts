// ==UserScript==
// @name         Deezer RYM Ratings Display
// @namespace    https://github.com/dbeley/rym-userscripts
// @version      1.0.0
// @description  Display RateYourMusic ratings on Deezer tracks and albums
// @author       dbeley
// @match        https://www.deezer.com/*
// @grant        GM_getValue
// @run-at       document-idle
// ==/UserScript==

(function () {
  "use strict";

  const SONG_STORAGE_KEY = "rateyourmusic-song-csv::records";
  const RELEASE_STORAGE_KEY = "rateyourmusic-csv::records";

  let songDatabase = {};
  let releaseDatabase = {};
  let processedElements = new WeakSet();

  // Load databases from storage
  async function loadDatabases() {
    try {
      songDatabase = (await GM_getValue(SONG_STORAGE_KEY, {})) || {};
      releaseDatabase = (await GM_getValue(RELEASE_STORAGE_KEY, {})) || {};
      console.info(
        `[deezer-rym-ratings] Loaded ${Object.keys(songDatabase).length} songs and ${
          Object.keys(releaseDatabase).length
        } releases from RYM database`
      );
    } catch (err) {
      console.error("[deezer-rym-ratings] Failed to load databases:", err);
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
      gap: 3px;
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

  // Process now playing bar
  function processNowPlaying() {
    const nowPlaying = document.querySelector('[class*="PlayerBar"]');
    if (!nowPlaying || processedElements.has(nowPlaying)) return;

    // Deezer uses various class names, look for track info
    const trackNameEl = nowPlaying.querySelector('[class*="TrackTitle"], [class*="track-title"]');
    const artistNameEl = nowPlaying.querySelector('[class*="ArtistName"], [class*="artist-name"]');

    const trackName = trackNameEl?.textContent?.trim();
    const artistName = artistNameEl?.textContent?.trim();

    if (!trackName || !artistName) return;

    let match = findMatch(artistName, trackName, songDatabase);
    if (!match) {
      match = findMatch(artistName, trackName, releaseDatabase);
    }

    if (match && match.ratingValue) {
      if (trackNameEl && !trackNameEl.querySelector(".rym-rating-badge")) {
        const badge = createRatingBadge(match.ratingValue, match.ratingCount, match.url);
        trackNameEl.appendChild(badge);
        processedElements.add(nowPlaying);
        console.info(`[deezer-rym-ratings] Added rating to now playing: ${trackName}`);
      }
    }
  }

  // Process track rows
  function processTrackRows() {
    const trackRows = document.querySelectorAll('[class*="Track"], [data-testid*="track"]');

    trackRows.forEach((row) => {
      if (processedElements.has(row)) return;

      const trackNameEl = row.querySelector('[class*="title"], [class*="Title"]');
      const artistNameEl = row.querySelector('[class*="artist"], [class*="Artist"]');

      const trackName = trackNameEl?.textContent?.trim();
      const artistName = artistNameEl?.textContent?.trim();

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

  // Process album cards
  function processAlbumCards() {
    const albumCards = document.querySelectorAll('[class*="Album"], [data-testid*="album"]');

    albumCards.forEach((card) => {
      if (processedElements.has(card)) return;

      const titleEl = card.querySelector('[class*="title"], [class*="Title"]');
      const artistEl = card.querySelector('[class*="artist"], [class*="Artist"]');

      const albumName = titleEl?.textContent?.trim();
      const artistName = artistEl?.textContent?.trim();

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

  // Process album page header
  function processAlbumHeader() {
    const albumHeader = document.querySelector('[class*="AlbumHeader"], [class*="album-header"]');
    if (!albumHeader || processedElements.has(albumHeader)) return;

    const titleEl = albumHeader.querySelector('h1, [class*="title"]');
    const artistEl = albumHeader.querySelector('[class*="artist"]');

    const albumName = titleEl?.textContent?.trim();
    const artistName = artistEl?.textContent?.trim();

    if (!albumName || !artistName) return;

    const match = findMatch(artistName, albumName, releaseDatabase);

    if (match && match.ratingValue) {
      if (titleEl && !titleEl.querySelector(".rym-rating-badge")) {
        const badge = createRatingBadge(match.ratingValue, match.ratingCount, match.url);
        badge.style.fontSize = "14px";
        badge.style.marginTop = "8px";
        badge.style.display = "inline-block";
        titleEl.appendChild(badge);
        processedElements.add(albumHeader);
        console.info(`[deezer-rym-ratings] Added rating to album header: ${albumName}`);
      }
    }
  }

  // Main observer
  function startObserver() {
    const observer = new MutationObserver(() => {
      processNowPlaying();
      processTrackRows();
      processAlbumCards();
      processAlbumHeader();
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true,
    });

    processNowPlaying();
    processTrackRows();
    processAlbumCards();
    processAlbumHeader();
  }

  // Initialize
  async function init() {
    await loadDatabases();
    startObserver();
    setInterval(processNowPlaying, 2000);
  }

  init().catch(console.error);
})();
