(function () {
  const api = window.__RYM_EXT__ || {};
  const keyFor = api.keyFor || (() => "");
  let cache = null;
  let styleInjected = false;

  init().catch((err) => console.warn("[rym-overlay] youtube init failed", err));

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
    const selectors = [
      "ytd-video-renderer",
      "ytd-compact-video-renderer",
      "ytd-rich-item-renderer",
      "yt-lockup-view-model",
    ];
    const nodes = document.querySelectorAll(
      selectors.map((s) => `${s}:not([data-rym-annotated])`).join(",")
    );
    nodes.forEach((node) => {
      node.dataset.rymAnnotated = "1";
      annotate(node);
    });
  }

  function annotate(node) {
    const titleRaw =
      node.querySelector("#video-title")?.textContent ||
      node.querySelector("yt-formatted-string")?.textContent ||
      node.querySelector(".yt-lockup-metadata-view-model__title")?.textContent ||
      "";
    const artistRaw =
      node.querySelector("ytd-channel-name a")?.textContent ||
      node.querySelector("#channel-name a")?.textContent ||
      node.querySelector(".yt-lockup-metadata-view-model__metadata a")?.textContent ||
      "";
    const artist = cleanArtist(artistRaw);
    const titleCandidates = buildTitleCandidates(titleRaw, artist);

    let match = null;
    let usedTitle = null;
    for (const title of titleCandidates) {
      const key = keyFor(artist, title);
      if (!key.trim()) continue;
      match = cache.index[key] || null;
      usedTitle = title;
      console.debug("[rym-overlay][youtube] lookup", {
        key,
        title,
        artist,
        cacheSize: Object.keys(cache.index || {}).length,
        found: Boolean(match),
      });
      if (match) break;
    }
    if (!match) return;

    const anchor = node.querySelector("#video-title") || node.querySelector("yt-formatted-string");
    if (!anchor || anchor.querySelector(".rym-ext-badge")) return;

    const badge = buildBadge(match);
    anchor.parentElement?.appendChild(badge);
  }

  function buildBadge(match) {
    const span = document.createElement("span");
    span.className = "rym-ext-badge rym-ext-badge-yt";
    const rating = match.ratingValue || "?";
    span.textContent = `RYM ${rating}`;
    span.title = buildTooltip(match);
    return span;
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
    return input.replace(/\s*-\s*topic$/i, "").trim();
  }

  function buildTitleCandidates(raw, artist) {
    const base = (raw || "").trim();
    const cleaned = cleanTitle(base, artist);
    const simpler = cleaned.split(/[-|•–—]/)[0]?.trim() || cleaned;
    const noArtist =
      artist && cleaned.toLowerCase().startsWith(artist.toLowerCase() + " -")
        ? cleaned.slice(artist.length + 1).replace(/^[-|•–—]\s*/, "").trim()
        : cleaned;
    const candidates = [base, cleaned, simpler, noArtist].filter(Boolean);
    return [...new Set(candidates)];
  }

  function cleanTitle(input, artist) {
    if (!input) return "";
    let t = input;
    t = t.replace(/\[[^\]]*\]/g, "");
    t = t.replace(/\([^)]*(official|video|audio|album|visuali[sz]er|lyrics?|explicit|full\s+album)[^)]*\)/gi, "");
    t = t.replace(/\b(official\s+(music\s+)?video|official\s+audio|lyric\s+video|lyrics?|visuali[sz]er|full\s+album|album\s+stream|album\s+visuali[sz]er)\b/gi, "");
    t = t.replace(/\s*(\||-|\u2013|\u2014|•)\s*(official.*|full\s+album.*|album\s+visuali[sz]er.*|visuali[sz]er.*|lyrics?.*|lyric\s+video.*)$/i, "");
    if (artist) {
      const prefix = artist.trim();
      const pattern = new RegExp(`^${prefix}\\s*[-|•–—]\\s*`, "i");
      t = t.replace(pattern, "");
    }
    return t.trim();
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
      .rym-ext-badge-yt {
        background: #ffeb3b;
        color: #202020;
      }
    `;
    document.documentElement.appendChild(style);
  }
})();
