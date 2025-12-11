(function () {
  const STORAGE_KEY = "rateyourmusic-csv::records";
  const MAX_RETRIES = 12;
  const RETRY_DELAY_MS = 500;
  syncFromLocal().catch((err) =>
    console.warn("[rym-overlay] sync failed", err)
  );

  async function syncFromLocal() {
    console.debug("[rym-overlay] rym-sync content script loaded");
    const raw = await waitForRecords();
    if (!raw) {
      console.info("[rym-overlay] no CSV tracker data found in localStorage.");
      return;
    }

    let parsed = null;
    try {
      parsed = JSON.parse(raw);
    } catch (err) {
      console.warn("[rym-overlay] unable to parse stored records", err);
      return;
    }

    console.debug("[rym-overlay] sending cache update", {
      entries: Array.isArray(parsed)
        ? parsed.length
        : parsed
        ? Object.keys(parsed).length
        : 0,
      source: location.href,
    });
    await browser.runtime.sendMessage({
      type: "rym-cache-update",
      records: parsed,
      source: location.href,
    });
  }

  async function waitForRecords() {
    for (let i = 0; i < MAX_RETRIES; i++) {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        console.debug("[rym-overlay] found records in localStorage", {
          length: raw.length,
          attempt: i + 1,
        });
        return raw;
      }
      if (raw) return raw;
      await delay(RETRY_DELAY_MS);
    }
    return null;
  }

  function delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
})();
