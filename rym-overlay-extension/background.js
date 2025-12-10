(function () {
  const CACHE_KEY = "rym-cache";
  let cache = null;

  browser.runtime.onInstalled.addListener(loadCache);

  browser.runtime.onMessage.addListener((message) => {
    if (!message || !message.type) return;

    if (message.type === "rym-cache-update") {
      return handleCacheUpdate(message.records, message.source || "unknown");
    }

    if (message.type === "rym-cache-request") {
      return loadCache();
    }

    if (message.type === "rym-lookup") {
      return handleLookup(message.keys || []);
    }
  });

  async function handleCacheUpdate(records, source) {
    const { entries, index } = indexRecords(records || {});
    const next = {
      entries,
      index,
      lastSync: Date.now(),
      source,
    };
    cache = next;
    await browser.storage.local.set({ [CACHE_KEY]: next });
    return { ok: true, count: entries.length };
  }

  async function handleLookup(keys) {
    const current = await loadCache();
    if (!current) return { matches: {}, lastSync: null };

    const matches = {};
    for (const key of keys) {
      if (current.index[key]) {
        matches[key] = current.index[key];
      }
    }
    return { matches, lastSync: current.lastSync || null };
  }

  async function loadCache() {
    if (cache) return cache;
    const stored = await browser.storage.local.get(CACHE_KEY);
    cache = stored[CACHE_KEY] || null;
    return cache;
  }

  function indexRecords(input) {
    const entries = Array.isArray(input)
      ? input.filter(Boolean)
      : Object.values(input || {}).filter(Boolean);
    const index = {};

    for (const entry of entries) {
      const name = entry.name || "";
      const artist = entry.artist || "";
      const key = keyFor(artist, name);
      if (!key.trim()) continue;
      index[key] = {
        slug: entry.slug || "",
        name,
        artist,
        ratingValue: entry.ratingValue || "",
        maxRating: entry.maxRating || "",
        ratingCount: entry.ratingCount || "",
        reviewCount: entry.reviewCount || "",
        updatedAt: entry.updatedAt || "",
        url: entry.url || "",
      };
    }

    return { entries, index };
  }

  function normalize(text) {
    if (!text) return "";
    const stripped = text
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase();
    return stripped.replace(/[^a-z0-9]+/g, " ").trim();
  }

  function keyFor(artist, title) {
    return `${normalize(artist)}|${normalize(title)}`;
  }
})();
