(function () {
  const api = window.__RYM_EXT__ || {};
  const keyFor = api.keyFor || (() => "");
  let cache = null;
  let styleInjected = false;

  init().catch((err) => console.warn("[rym-overlay] spotify init failed", err));

  async function init() {
    cache = await browser.runtime.sendMessage({ type: "rym-cache-request" });
    if (!cache || !cache.index) return;
    injectStyles();
    observe();
  }

  function observe() {
    scan();
    const observer = new MutationObserver(scan);
    observer.observe(document.body, { childList: true, subtree: true });
  }

  function scan() {
    const rows = document.querySelectorAll(
      '[data-testid="tracklist-row"]:not([data-rym-annotated])'
    );
    rows.forEach((row) => {
      row.dataset.rymAnnotated = "1";
      annotateRow(row);
    });
  }

  function annotateRow(row) {
    const titleRaw = (
      row.querySelector('[data-testid="internal-track-link"]') ||
      row.querySelector('[data-testid="tracklist-row"] span')
    )?.textContent?.trim() || "";
    const title = cleanTitle(titleRaw);
    const artistRaw =
      row.querySelector('a[href*="/artist/"]')?.textContent ||
      row.querySelector('[data-testid="entity-row-subtitle"]')?.textContent ||
      "";
    const artist = cleanArtist(artistRaw);

    const key = keyFor(artist, title);
    if (!key.trim()) return;

    const match = cache.index[key];
    console.debug("[rym-overlay][spotify] lookup", {
      key,
      title,
      artist,
      cacheSize: Object.keys(cache.index || {}).length,
      found: Boolean(match),
    });
    if (!match) return;

    const anchor =
      row.querySelector('[data-testid="internal-track-link"]') ||
      row.querySelector('[data-testid="tracklist-row"] span');
    if (!anchor) return;

    if (row.querySelector(".rym-ext-badge")) return;
    const badge = buildBadge(match);
    anchor.parentElement?.appendChild(badge);
  }

  function buildBadge(match) {
    const link = document.createElement(match.url ? "a" : "span");
    link.className = "rym-ext-badge";
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

  function cleanArtist(input) {
    if (!input) return "";
    // Many Spotify rows list multiple artists; match against the primary one.
    const trimmed = input.replace(/\s*-\s*topic$/i, "");
    const first = trimmed.split(/[,&·]|•/)[0] || trimmed;
    return first.trim();
  }

  function cleanTitle(input) {
    if (!input) return "";
    let t = input;
    // Drop bracketed qualifiers and common remaster/remix markers.
    t = t.replace(/\[[^\]]*\]/g, "");
    t = t.replace(/\([^)]*\b(remaster(ed)?|remix|live|explicit)\b[^)]*\)/gi, "");
    t = t.replace(/-\s*(remaster(ed)?\s*\d{2,4}|live|remix)/gi, "");
    return t.trim();
  }

  function injectStyles() {
    if (styleInjected) return;
    styleInjected = true;
    const style = document.createElement("style");
    style.textContent = `
      .rym-ext-badge {
        margin-left: 8px;
        padding: 2px 6px;
        border-radius: 12px;
        background: #1db954;
        color: #000;
        font-size: 10px;
        font-weight: 700;
        letter-spacing: 0.3px;
        vertical-align: middle;
        cursor: default;
        display: inline-flex;
        align-items: center;
      }
    `;
    document.documentElement.appendChild(style);
  }
})();
