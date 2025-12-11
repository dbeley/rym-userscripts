(function () {
  const api = window.__RYM_EXT__ || {};
  const keyFor = api.keyFor || (() => "");
  let cache = null;
  let styleInjected = false;
  let scanScheduled = false;

  init().catch((err) => console.warn("[rym-overlay] bandcamp init failed", err));

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
    annotateAlbumHeader();
    annotateTrackTable();
    annotateReleaseGrid();
    annotateSearchResults();
    annotateNowPlaying();
  }

  function annotateAlbumHeader() {
    const header = document.querySelector("#name-section .trackTitle, h2.trackTitle");
    if (!header || header.dataset.rymAnnotated) return;
    const artist =
      document.querySelector("#name-section h3 span a")?.textContent ||
      document.querySelector("#name-section h3 span")?.textContent ||
      getPageArtist();
    const title = header.textContent || "";
    attachBadge(header, artist, title, false);
    header.dataset.rymAnnotated = "1";
  }

  function annotateTrackTable() {
    const rows = document.querySelectorAll("#track_table .track_row_view:not([data-rym-annotated])");
    rows.forEach((row) => {
      row.dataset.rymAnnotated = "1";
      const title = row.querySelector(".track-title")?.textContent || "";
      const artist =
        row.querySelector(".artist")?.textContent ||
        row.querySelector(".composer")?.textContent ||
        getPageArtist();
      const target = row.querySelector(".title") || row.querySelector(".track-title") || row;
      attachBadge(target, artist, title, true);
    });
  }

  function annotateReleaseGrid() {
    const tiles = document.querySelectorAll(
      "#music-grid .music-grid-item:not([data-rym-annotated]), #music-grid li:not([data-rym-annotated])"
    );
    tiles.forEach((tile) => {
      tile.dataset.rymAnnotated = "1";
      const title =
        tile.querySelector(".title")?.textContent ||
        tile.querySelector(".itemtext")?.textContent ||
        "";
      const artist =
        tile.querySelector(".artist-override")?.textContent ||
        tile.querySelector(".artist")?.textContent ||
        getPageArtist();
      const target = tile.querySelector(".title") || tile;
      attachBadge(target, artist, title, false);
    });
  }

  function annotateSearchResults() {
    const results = document.querySelectorAll(".searchresult:not([data-rym-annotated])");
    results.forEach((result) => {
      result.dataset.rymAnnotated = "1";
      const title = result.querySelector(".heading")?.textContent || "";
      const subhead = result.querySelector(".subhead")?.textContent || "";
      const artist = subhead.replace(/^by\s+/i, "").trim() || getPageArtist();
      const target = result.querySelector(".heading") || result;
      attachBadge(target, artist, title, false);
    });
  }

  function annotateNowPlaying() {
    const nowPlaying = document.querySelector(
      "#trackInfo .title:not([data-rym-annotated]), .now-playing .title:not([data-rym-annotated])"
    );
    if (!nowPlaying) return;
    const artist =
      document.querySelector("#trackInfo .artist span")?.textContent ||
      document.querySelector("#trackInfo .artist a")?.textContent ||
      getPageArtist();
    const title = nowPlaying.textContent || "";
    attachBadge(nowPlaying, artist, title, true);
    nowPlaying.dataset.rymAnnotated = "1";
  }

  function attachBadge(target, artist, title, preferTrack) {
    if (!target || target.querySelector(".rym-ext-badge")) return;
    const { match, key } = lookupMatch(artist, title, preferTrack);
    if (!key.trim()) return;
    if (!match) return;
    const badge = buildBadge(match);
    target.appendChild(badge);
  }

  function buildBadge(match) {
    const link = document.createElement(match.url ? "a" : "span");
    link.className = "rym-ext-badge rym-ext-badge-bandcamp";
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

  function getPageArtist() {
    return (
      document.querySelector('meta[property="og:site_name"]')?.content ||
      document.querySelector("#name-section h3 a")?.textContent ||
      document.querySelector("#name-section h3 span")?.textContent ||
      ""
    ).trim();
  }

  function lookupMatch(artist, title, preferTrack = false) {
    const key = keyFor(artist, title);
    if (!key.trim()) return { key, match: null };
    const trackHit = preferTrack ? cache.trackIndex?.[key] : null;
    const releaseHit = cache.index?.[key];
    const match = trackHit || releaseHit || null;
    console.debug("[rym-overlay][bandcamp] lookup", {
      key,
      title,
      artist,
      cacheSize: Object.keys(cache.index || {}).length,
      trackHit: Boolean(trackHit),
      found: Boolean(match),
    });
    return { key, match };
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
})();
