(function (global) {
  const api = (global.__RYM_EXT__ = global.__RYM_EXT__ || {});

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

  api.normalize = normalize;
  api.keyFor = keyFor;
})(typeof window !== "undefined" ? window : this);
