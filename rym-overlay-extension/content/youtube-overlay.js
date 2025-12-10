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
    const title =
      node.querySelector("#video-title")?.textContent ||
      node.querySelector("yt-formatted-string")?.textContent ||
      "";
    const artist =
      node.querySelector("ytd-channel-name a")?.textContent ||
      node.querySelector("#channel-name a")?.textContent ||
      "";

    const key = keyFor(artist, title);
    if (!key.trim()) return;

    const match = cache.index[key];
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
