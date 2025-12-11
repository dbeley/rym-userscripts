(function () {
  const api = window.__RYM_EXT__ || {};
  const keyFor = api.keyFor || (() => "");
  let cache = null;
  let styleInjected = false;
  let pendingNodes = new Set();
  let scanScheduled = false;

  init().catch((err) => console.warn("[rym-overlay] youtube init failed", err));

  async function init() {
    cache = await browser.runtime.sendMessage({ type: "rym-cache-request" });
    if (!cache || !cache.index) return;
    injectStyles();
    observe();
  }

  function observe() {
    scanAll();
    const observer = new MutationObserver((mutations) => {
      for (const m of mutations) {
        m.addedNodes?.forEach((node) => {
          if (node instanceof HTMLElement) {
            pendingNodes.add(node);
          }
        });
      }
      scheduleScan();
    });
    observer.observe(document.body, { childList: true, subtree: true });
  }

  function scanAll() {
    const selectors = [
      "ytd-video-renderer",
      "ytd-compact-video-renderer",
      "ytd-rich-item-renderer",
      "yt-lockup-view-model",
    ];
    document.querySelectorAll(selectors.join(",")).forEach((node) => pendingNodes.add(node));
    scheduleScan();
  }

  function scheduleScan() {
    if (scanScheduled) return;
    scanScheduled = true;
    requestAnimationFrame(() => {
      scanScheduled = false;
      const nodes = Array.from(pendingNodes);
      pendingNodes = new Set();
      nodes.forEach((node) => {
        if (!(node instanceof HTMLElement)) return;
        // If this node was reused with new content, drop old badges.
        node.querySelectorAll(".rym-ext-badge").forEach((b) => b.remove());
        annotate(node);
      });
    });
  }

  function annotate(node) {
    const titleRaw =
      node.querySelector("#video-title")?.textContent ||
      node.querySelector("yt-formatted-string")?.textContent ||
      node.querySelector(".yt-lockup-metadata-view-model__title")?.textContent ||
      "";
    const channelRaw =
      node.querySelector("ytd-channel-name a")?.textContent ||
      node.querySelector("#channel-name a")?.textContent ||
      node.querySelector(".yt-lockup-metadata-view-model__metadata a")?.textContent ||
      "";
    const artist = cleanArtist(channelRaw);
    const titleCandidates = buildTitleCandidates(titleRaw, artist, node);

    let match = null;
    let usedTitle = null;
    for (const title of titleCandidates) {
      const { match: candidate, key } = lookupMatch(artist, title, true);
      usedTitle = title;
      if (candidate) {
        match = candidate;
        break;
      }
    }
    if (!match) return;

    const anchor = node.querySelector("#video-title") || node.querySelector("yt-formatted-string");
    if (!anchor || anchor.querySelector(".rym-ext-badge")) return;

    const badge = buildBadge(match);
    anchor.parentElement?.appendChild(badge);
  }

  function buildBadge(match) {
    const link = document.createElement(match.url ? "a" : "span");
    link.className = "rym-ext-badge rym-ext-badge-yt";
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
    return input.replace(/\s*-\s*topic$/i, "").replace(/\bvevo\b/i, "").trim();
  }

  function buildTitleCandidates(raw, artist, node) {
    const base = (raw || "").trim();
    const aria = node.querySelector("#video-title")?.getAttribute("aria-label") || "";
    const derivedFromAria = deriveFromAria(aria);
    const derivedFromTitle = deriveFromTitle(base);
    const titleAttr = node.querySelector("#video-title")?.getAttribute("title") || "";

    const cleaned = cleanTitle(base, artist);
    const simpler = cleaned.split(/[-|•–—]/)[0]?.trim() || cleaned;
    const noArtist =
      artist && cleaned.toLowerCase().startsWith(artist.toLowerCase() + " -")
        ? cleaned.slice(artist.length + 1).replace(/^[-|•–—]\s*/, "").trim()
        : cleaned;
    const candidates = [
      base,
      cleaned,
      simpler,
      noArtist,
      derivedFromAria?.title,
      derivedFromAria?.artist ? `${derivedFromAria.artist} ${derivedFromAria.title}` : null,
      derivedFromTitle?.title,
      derivedFromTitle?.artist ? `${derivedFromTitle.artist} ${derivedFromTitle.title}` : null,
      titleAttr,
    ].filter(Boolean);
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

  function deriveFromAria(aria) {
    if (!aria) return null;
    // e.g., "Magdalena Bay - Image (Official Video) 3 minutes, 41 seconds"
    const match = aria.match(/^(.+?)\s*[-|•–—]\s*(.+?)\s+\d/);
    if (match) {
      return { artist: cleanArtist(match[1]), title: cleanTitle(match[2], match[1]) };
    }
    return null;
  }

  function deriveFromTitle(title) {
    if (!title) return null;
    const m = title.match(/^(.+?)\s*[-|•–—]\s*(.+)$/);
    if (m) {
      return { artist: cleanArtist(m[1]), title: cleanTitle(m[2], m[1]) };
    }
    return null;
  }

  function lookupMatch(artist, title, preferTrack = false) {
    const key = keyFor(artist, title);
    if (!key.trim()) return { key, match: null };
    const trackHit = preferTrack ? cache.trackIndex?.[key] : null;
    const releaseHit = cache.index?.[key];
    const match = trackHit || releaseHit || null;
    console.debug("[rym-overlay][youtube] lookup", {
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
