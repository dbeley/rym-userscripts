document.addEventListener("DOMContentLoaded", () => {
  renderStatus();
  document.getElementById("refresh").addEventListener("click", renderStatus);
});

async function renderStatus() {
  const status = document.getElementById("status");
  status.textContent = "Loading…";
  try {
    const cache = await browser.runtime.sendMessage({ type: "rym-cache-request" });
    if (!cache) {
      status.textContent = "No cache found yet. Visit a RYM album to sync.";
      return;
    }
    const count = cache.entries?.length || Object.keys(cache.index || {}).length || 0;
    const lastSync = cache.lastSync
      ? new Date(cache.lastSync).toLocaleString()
      : "unknown";
    status.textContent = `Cached releases: ${count}\nLast sync: ${lastSync}`;
  } catch (err) {
    status.textContent = `Error loading cache: ${err.message || err}`;
  }
}
