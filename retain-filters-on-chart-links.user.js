// ==UserScript==
// @name         RateYourMusic retain filters on chart links
// @namespace    RateYourMusic scripts
// @version      1.2
// @description  Retain filters on chart links.
// @author       dbeley
// @match        https://rateyourmusic.com/charts/*
// @grant        none
// ==/UserScript==

(function () {
  // Utility function to append suffixes to URLs
  function appendSuffixToLinks(suffixes, selector) {
    const links = document.querySelectorAll(selector);

    links.forEach((link) => {
      let href = link.getAttribute("href");

      // Ensure the href ends with a `/` before appending
      href = href.endsWith("/") ? href : `${href}/`;

      // Append all suffixes with a trailing `/`, ensuring they are not duplicated
      suffixes.forEach((suffix) => {
        const segment = `${suffix}/`;
        if (!href.includes(segment)) {
          href += segment;
        }
      });

      // Update the href with the suffixes
      link.setAttribute("href", href);
    });
  }

  const url = new URL(window.location.href);
  const suffixes = url.pathname
    .split("/")
    .filter((segment) => segment.includes(":"));

  // Only proceed if we have any suffixes to append
  if (suffixes.length > 0) {
    appendSuffixToLinks(suffixes, ".ui_button.btn_page_charts_common_charts");
    appendSuffixToLinks(
      suffixes,
      '.page_charts_section_scope a[href*="/charts/top/album/"], .page_charts_section_scope a[href*="/charts/top/song/"]'
    );
  }
})();
