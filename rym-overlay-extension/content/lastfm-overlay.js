(function () {
  const api = window.__RYM_EXT__ || {};
  const keyFor = api.keyFor || (() => "");
  let cache = null;
  let styleInjected = false;
  let scanScheduled = false;

  init().catch((err) => console.warn("[rym-overlay] lastfm init failed", err));

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
    annotateHeader();
    annotateChartRows();
    annotateSearchResults();
    annotateNowPlaying();
  }

  function annotateHeader() {
    const titleEl = document.querySelector(
      ".header-new-title:not([data-rym-annotated]), .header-title:not([data-rym-annotated])"
    );
    if (!titleEl) return;
    const artist =
      document.querySelector(".header-new-crumb a")?.textContent ||
      document.querySelector(".header-title .link-block-target")?.textContent ||
      getPageArtist();
    const title = titleEl.textContent || "";
    attachBadge(titleEl, artist, title, false, false);
    titleEl.dataset.rymAnnotated = "1";
  }

  function annotateChartRows() {
    const rows = document.querySelectorAll(".chartlist-row:not([data-rym-annotated])");
    rows.forEach((row) => {
      row.dataset.rymAnnotated = "1";
      const titleEl = row.querySelector(".chartlist-name a") || row.querySelector(".chartlist-name");
      const artistEl =
        row.querySelector(".chartlist-artist a") ||
        row.querySelector(".chartlist-artist") ||
        row.querySelector('[itemprop="byArtist"] a');
      const title = titleEl?.textContent || "";
      const artist = artistEl?.textContent || getPageArtist();
      attachBadge(titleEl || row, artist, title, true, /*strictTrack*/ true);
    });
  }

  function annotateSearchResults() {
    const items = document.querySelectorAll(
      '[data-entity-type]:not([data-rym-annotated]), .resource-list--release .link-block-target:not([data-rym-annotated])'
    );
    items.forEach((item) => {
      const container = item.closest(".search-result-item, .resource-list--release, .resource-list--track") || item;
      if (container.dataset.rymAnnotated) return;
      const titleEl =
        container.querySelector(".link-block-target") ||
        container.querySelector(".resource-list--name") ||
        item;
      const artistEl =
        container.querySelector(".resource-list--secondary, .resource-list--metadata a") ||
        container.querySelector('[data-entity-type="artist"] a');
      const title = titleEl?.textContent || "";
      const artist = artistEl?.textContent || getPageArtist();
      container.dataset.rymAnnotated = "1";
      attachBadge(titleEl || container, artist, title, true, /*strictTrack*/ true);
    });
  }

  function annotateNowPlaying() {
    const nowPlaying = document.querySelector(
      '#now-playing .header-title:not([data-rym-annotated]), .now-playing .header-title:not([data-rym-annotated])'
    );
    if (!nowPlaying) return;
    const artist =
      document.querySelector("#now-playing [data-artist]")?.textContent ||
      document.querySelector("#now-playing .header-crumb")?.textContent ||
      getPageArtist();
    const title = nowPlaying.textContent || "";
    attachBadge(nowPlaying, artist, title, true, /*strictTrack*/ true);
    nowPlaying.dataset.rymAnnotated = "1";
  }

  function attachBadge(target, artist, title, preferTrack, strictTrack) {
    if (!target || target.querySelector?.(".rym-ext-badge")) return;
    const { match, key } = lookupMatch(artist, title, preferTrack, strictTrack);
    if (!key.trim()) return;
    if (!match) return;
    const badge = buildBadge(match);
    (target.parentElement || target).appendChild(badge);
  }

  function buildBadge(match) {
    const link = document.createElement(match.url ? "a" : "span");
    link.className = "rym-ext-badge rym-ext-badge-lastfm";
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
      document.querySelector('meta[property="og:music:musician"]')?.content ||
      document.querySelector('meta[property="music:musician"]')?.content ||
      document.querySelector(".header-crumb a")?.textContent ||
      document.querySelector(".header-new-crumb a")?.textContent ||
      ""
    ).trim();
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

  function lookupMatch(artist, title, preferTrack = false, strictTrack = false) {
    const key = keyFor(artist, title);
    if (!key.trim()) return { key, match: null };
    const trackHit = preferTrack ? cache.trackIndex?.[key] : null;
    const releaseHit = cache.index?.[key];
    const match = trackHit || (strictTrack ? null : releaseHit) || null;
    console.debug("[rym-overlay][lastfm] lookup", {
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
