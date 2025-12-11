(function () {
  const CACHE_KEY = "rym-cache";
  let cache = null;

  browser.runtime.onInstalled.addListener(loadCache);

  browser.runtime.onMessage.addListener((message) => {
    if (!message || !message.type) return;

    if (message.type === "rym-cache-update") {
      console.debug("[rym-overlay][bg] received cache update", {
        source: message.source || "unknown",
        entries: Array.isArray(message.records)
          ? message.records.length
          : message.records
          ? Object.keys(message.records).length
          : 0,
      });
      return handleCacheUpdate(message.records, message.source || "unknown");
    }

    if (message.type === "rym-cache-request") {
      console.debug("[rym-overlay][bg] cache request received");
      return loadCache();
    }

    if (message.type === "rym-lookup") {
      console.debug("[rym-overlay][bg] lookup request", {
        keys: (message.keys || []).length,
      });
      return handleLookup(message.keys || []);
    }
  });

  async function handleCacheUpdate(records, source) {
    const { entries, index, trackIndex } = indexRecords(records || {});
    const next = {
      entries,
      index,
      trackIndex,
      lastSync: Date.now(),
      source,
    };
    cache = next;
    console.debug("[rym-overlay][bg] cache indexed", {
      entries: entries.length,
      source,
      lastSync: next.lastSync,
    });
    await browser.storage.local.set({ [CACHE_KEY]: next });
    return { ok: true, count: entries.length };
  }

  async function handleLookup(keys) {
    const current = await loadCache();
    if (!current) return { matches: {}, trackMatches: {}, lastSync: null };

    const matches = {};
    const trackMatches = {};
    for (const key of keys) {
      if (current.index && current.index[key]) {
        matches[key] = current.index[key];
      }
      if (current.trackIndex && current.trackIndex[key]) {
        trackMatches[key] = current.trackIndex[key];
      }
    }
    return { matches, trackMatches, lastSync: current.lastSync || null };
  }

  async function loadCache() {
    if (cache) return cache;
    const stored = await browser.storage.local.get(CACHE_KEY);
    cache = stored[CACHE_KEY] || null;
    console.debug("[rym-overlay][bg] loadCache", {
      cached: Boolean(cache),
      entries: cache?.entries?.length || Object.keys(cache?.index || {}).length || 0,
    });
    return cache;
  }

  function indexRecords(input) {
    const entries = Array.isArray(input)
      ? input.filter(Boolean)
      : Object.values(input || {}).filter(Boolean);
    const index = {};
    const trackIndex = {};

    for (const entry of entries) {
      const name = entry.name || "";
      const artist = entry.artist || "";
      const key = keyFor(artist, name);
      if (!key.trim()) continue;
      const normalized = {
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
      if (isTrackEntry(entry)) {
        trackIndex[key] = normalized;
        if (!index[key]) {
          index[key] = normalized;
        }
      } else {
        index[key] = normalized;
      }
    }

    return { entries, index, trackIndex };
  }

  function isTrackEntry(entry) {
    const slug = entry.slug || "";
    const url = entry.url || "";
    return /\/track\//i.test(slug) || /\/track\//i.test(url) || /\/song\//i.test(slug) || /\/song\//i.test(url);
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
