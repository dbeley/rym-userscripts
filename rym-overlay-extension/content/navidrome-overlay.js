(function () {
  const api = window.__RYM_EXT__ || {};
  const keyFor = api.keyFor || (() => "");
  let cache = null;
  let styleInjected = false;
  let observer = null;
  let scanScheduled = false;
  let needsFullScan = false;

  init().catch((err) => console.warn("[rym-overlay] navidrome init failed", err));

  async function init() {
    if (!isNavidrome()) return;
    cache = await browser.runtime.sendMessage({ type: "rym-cache-request" });
    if (!cache || !cache.index) return;
    injectStyles();
    observe();
  }

  function isNavidrome() {
    return Boolean(window.__APP_CONFIG__ || document.querySelector('meta[content*="Navidrome"]'));
  }

  function observe() {
    scheduleScan(true);
    observer = new MutationObserver(() => {
      needsFullScan = true;
      scheduleScan();
    });
    observer.observe(document.body, { childList: true, subtree: true });
  }

  function scheduleScan(full = false) {
    if (full) needsFullScan = true;
    if (scanScheduled) return;
    scanScheduled = true;
    requestAnimationFrame(() => {
      scanScheduled = false;
      if (needsFullScan) {
        needsFullScan = false;
        runScan();
      }
    });
  }

  function runScan() {
    annotateTrackRows();
    annotateAlbumTiles();
    annotateArtistAlbumList();
  }

  function annotateTrackRows() {
    const rows = document.querySelectorAll('tr[resource="song"]');
    rows.forEach((row) => {
      row.querySelectorAll(".rym-ext-badge").forEach((b) => b.remove());
      const titleCell = row.querySelector(".column-title");
      const artistCell = row.querySelector(".column-artist");
      if (!titleCell) return;

      const title = titleCell.textContent || "";
      const artist =
        artistCell?.querySelector("a")?.textContent ||
        artistCell?.textContent ||
        "";

      attachBadge(titleCell, artist, title, true);
    });
  }

  function annotateAlbumTiles() {
    const tiles = document.querySelectorAll(
      '.MuiGridListTile-root, .jss420, [data-testid="album-card"], a[href*="#/album/"]'
    );
    tiles.forEach((tile) => {
      tile.querySelectorAll(".rym-ext-badge").forEach((b) => b.remove());
      const titleEl =
        tile.querySelector('.jss419 p, a[href*="#/album/"] p') ||
        tile.querySelector('.MuiTypography-root.MuiTypography-body1') ||
        (tile.matches('a[href*="#/album/"]') ? tile : null);
      const artistEl =
        tile.querySelector('.jss417 a[href*="#/artist/"]') ||
        tile.querySelector('a[href*="#/artist/"]');

      const title = titleEl?.textContent || "";
      const artist = artistEl?.textContent || getPageArtist();
      if (!titleEl) return;

      attachBadge(titleEl.parentElement || titleEl, artist, title, false);
    });
  }

  function annotateArtistAlbumList() {
    const listItems = document.querySelectorAll(
      '.artist-albums a[href*="#/album/"]:not([data-rym-annotated]), [data-testid="artist-album"] a[href*="#/album/"]:not([data-rym-annotated])'
    );
    listItems.forEach((item) => {
      item.dataset.rymAnnotated = "1";
      const title = item.textContent || item.getAttribute("title") || "";
      const artist = getPageArtist();
      attachBadge(item, artist, title, false);
    });
  }

  function attachBadge(target, artist, title, preferTrack) {
    const key = keyFor(artist, title);
    if (!key.trim()) return;
    const match = lookupMatch(key, preferTrack, /*strictTrack*/ preferTrack);
    if (!match) return;
    if (target.querySelector(".rym-ext-badge")) return;

    const badge = buildBadge(match);
    target.appendChild(badge);
  }

  function buildBadge(match) {
    const link = document.createElement(match.url ? "a" : "span");
    link.className = "rym-ext-badge rym-ext-badge-navidrome";
    const rating = match.ratingValue || "?";
    link.textContent = `RYM ${rating}`;
    link.title = buildTooltip(match);
    link.style.cursor = match.url ? "pointer" : "default";
    if (match.url) {
      link.href = match.url;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      link.style.textDecoration = "none";
      // Keep Navidrome row handlers from swallowing the click so the link opens.
      link.addEventListener(
        "click",
        (ev) => {
          ev.stopPropagation();
          ev.preventDefault();
          window.open(match.url, "_blank", "noopener,noreferrer");
        },
        true
      );
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

  function lookupMatch(key, preferTrack, strictTrack) {
    const trackHit = preferTrack ? cache.trackIndex?.[key] : null;
    const releaseHit = cache.index?.[key];
    const match = trackHit || (strictTrack ? null : releaseHit) || null;
    console.debug("[rym-overlay][navidrome] lookup", {
      key,
      trackHit: Boolean(trackHit),
      found: Boolean(match),
    });
    return match;
  }

  function getPageArtist() {
    return (
      document.querySelector('header a[href*="#/artist/"]')?.textContent ||
      document.querySelector('main a[href*="#/artist/"]')?.textContent ||
      document.querySelector(".MuiTypography-h4")?.textContent ||
      document.querySelector(".MuiTypography-h5")?.textContent ||
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
        background: #ffeb3b;
        color: #202020;
      }
      .rym-ext-badge-navidrome {
        background: #00bcd4;
        color: #002b36;
      }
    `;
    document.documentElement.appendChild(style);
  }
})();
