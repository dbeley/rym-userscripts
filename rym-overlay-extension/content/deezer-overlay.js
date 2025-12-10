(function () {
  const api = window.__RYM_EXT__ || {};
  const keyFor = api.keyFor || (() => "");
  let cache = null;
  let styleInjected = false;
  let scanScheduled = false;

  init().catch((err) => console.warn("[rym-overlay] deezer init failed", err));

  async function init() {
    cache = await browser.runtime.sendMessage({ type: "rym-cache-request" });
    if (!cache || !cache.index) return;
    injectStyles();
    observe();
    scanAll();
  }

  function observe() {
    const observer = new MutationObserver(() => scheduleScan());
    observer.observe(document.body, { childList: true, subtree: true });
  }

  function scheduleScan() {
    if (scanScheduled) return;
    scanScheduled = true;
    requestAnimationFrame(() => {
      scanScheduled = false;
      scanAll();
    });
  }

  function scanAll() {
    annotateTrackRows();
    annotateAlbumCards();
    annotateNowPlaying();
  }

  function annotateTrackRows() {
    const rows = document.querySelectorAll(
      '[data-testid="track-row"]:not([data-rym-annotated]), [data-testid="track_row"]:not([data-rym-annotated]), [data-testid="song-row"]:not([data-rym-annotated]), .datagrid-row:not([data-rym-annotated]), .queuelist-track:not([data-rym-annotated]), li.track:not([data-rym-annotated])'
    );
    rows.forEach((row) => {
      row.dataset.rymAnnotated = "1";
      const titleEl =
        row.querySelector('[data-testid="track_title"]') ||
        row.querySelector('[data-testid="track-title"]') ||
        row.querySelector('[data-testid="song_title"]') ||
        row.querySelector(".datagrid-title") ||
        row.querySelector(".track-title") ||
        row.querySelector(".song-title") ||
        row.querySelector('a[href*="/track/"]');
      const artistEl =
        row.querySelector('[data-testid="artist_name"]') ||
        row.querySelector('[data-testid="artist-name"]') ||
        row.querySelector(".datagrid-subtitle a") ||
        row.querySelector(".track-subtitle a") ||
        row.querySelector('a[href*="/artist/"]');
      const title = titleEl?.textContent || titleEl?.getAttribute("title") || "";
      const artist = artistEl?.textContent || artistEl?.getAttribute("title") || "";
      attachBadge(titleEl || row, artist, title, true);
    });
  }

  function annotateAlbumCards() {
    const cards = document.querySelectorAll(
      '[data-testid="album-card"]:not([data-rym-annotated]), [data-testid="album_card"]:not([data-rym-annotated]), a[href*="/album/"]:not([data-rym-annotated])'
    );
    cards.forEach((card) => {
      // Avoid nav links and section headers by ensuring we have a title element.
      const titleEl =
        card.querySelector('[data-testid="album_title"]') ||
        card.querySelector(".datagrid-title") ||
        card.querySelector(".card-title") ||
        (card.matches('a[href*="/album/"]') ? card : null);
      if (!titleEl) return;
      card.dataset.rymAnnotated = "1";
      const artist =
        card.querySelector('[data-testid="artist_name"]')?.textContent ||
        card.querySelector('[data-testid="artist-name"]')?.textContent ||
        card.querySelector(".subtitle")?.textContent ||
        card.querySelector('a[href*="/artist/"]')?.textContent ||
        "";
      const title = titleEl.textContent || titleEl.getAttribute("title") || "";
      attachBadge(titleEl, artist, title, false);
    });
  }

  function annotateNowPlaying() {
    const titleEl = document.querySelector(
      '[data-testid="player_track_title"]:not([data-rym-annotated]), .player-track-title:not([data-rym-annotated])'
    );
    if (!titleEl) return;
    const artist =
      document.querySelector('[data-testid="player_track_artist"]')?.textContent ||
      document.querySelector(".player-track-artist")?.textContent ||
      "";
    const title = titleEl.textContent || "";
    attachBadge(titleEl, artist, title, true);
    titleEl.dataset.rymAnnotated = "1";
  }

  function attachBadge(target, artist, title, preferTrack) {
    if (!target || target.querySelector?.(".rym-ext-badge")) return;
    const { match, key } = lookupMatch(artist, title, preferTrack);
    if (!key.trim()) return;
    if (!match) return;
    const badge = buildBadge(match);
    (target.parentElement || target).appendChild(badge);
  }

  function buildBadge(match) {
    const link = document.createElement(match.url ? "a" : "span");
    link.className = "rym-ext-badge rym-ext-badge-deezer";
    const rating = match.ratingValue || "?";
    link.textContent = `RYM ${rating}`;
    link.title = buildTooltip(match);
    if (match.url) {
      link.href = match.url;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      link.style.textDecoration = "none";
    }
    return link;
  }

  function buildTooltip(match) {
    const bits = [];
    bits.push(`${match.artist} — ${match.name}`);
    if (match.ratingValue) {
      bits.push(`Rating: ${match.ratingValue}${match.maxRating ? "/" + match.maxRating : ""}`);
    }
    if (match.ratingCount) bits.push(`Ratings: ${match.ratingCount}`);
    if (match.reviewCount) bits.push(`Reviews: ${match.reviewCount}`);
    if (match.updatedAt) bits.push(`Cached: ${match.updatedAt}`);
    if (match.url) bits.push(`Source: ${match.url}`);
    return bits.join(" · ");
  }

  function injectStyles() {
    if (styleInjected) return;
    styleInjected = true;
    const style = document.createElement("style");
    style.textContent = `
      .rym-ext-badge {
        margin-left: 6px;
        padding: 2px 6px;
        border-radius: 12px;
        font-size: 10px;
        font-weight: 700;
        letter-spacing: 0.3px;
        vertical-align: middle;
        cursor: default;
        display: inline-flex;
        align-items: center;
        background: #00bcd4;
        color: #002b36;
      }
    `;
    document.documentElement.appendChild(style);
  }

  function lookupMatch(artist, title, preferTrack = false) {
    const key = keyFor(artist, title);
    if (!key.trim()) return { key, match: null };
    const trackHit = preferTrack ? cache.trackIndex?.[key] : null;
    const releaseHit = cache.index?.[key];
    const match = trackHit || releaseHit || null;
    console.debug("[rym-overlay][deezer] lookup", {
      key,
      title,
      artist,
      cacheSize: Object.keys(cache.index || {}).length,
      trackHit: Boolean(trackHit),
      found: Boolean(match),
    });
    return { key, match };
  }
})();
