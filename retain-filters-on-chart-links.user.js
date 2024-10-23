// ==UserScript==
// @name         RateYourMusic retain filters on chart links
// @namespace    RateYourMusic scripts
// @version      1.1
// @description  Retain filters on chart links.
// @author       dbeley
// @match        https://rateyourmusic.com/charts/*
// @grant        none
// ==/UserScript==

(function() {

    // Utility function to append suffixes to URLs
    function appendSuffixToLinks(suffixes, selector) {
        const links = document.querySelectorAll(selector);

        links.forEach(link => {
            let href = link.getAttribute('href');

            // Ensure the href ends with a `/` before appending
            href = href.endsWith('/') ? href : `${href}/`;

            // Append all suffixes, ensuring no duplicate "/"
            suffixes.forEach(suffix => {
                if (!href.includes(suffix)) { // Avoid appending the same suffix multiple times
                    href += suffix;
                }
            });

            // Update the href with the suffixes
            link.setAttribute('href', href);
        });
    }

    // Extract genre (g:...) and artist (a:...) parts from the current URL
    const url = window.location.href;
    const genreMatch = url.match(/(g:[^/]+)/);
    const artistMatch = url.match(/(a:[^/]+)/);

    // Collect suffixes found in the URL
    const suffixes = [];
    if (genreMatch) suffixes.push(genreMatch[0]);
    if (artistMatch) suffixes.push(artistMatch[0]);

    // Only proceed if we have any suffixes to append
    if (suffixes.length > 0) {
        appendSuffixToLinks(suffixes, '.ui_button.btn_page_charts_common_charts');
        appendSuffixToLinks(suffixes, '.page_charts_section_scope a[href*="/charts/top/album/"], .page_charts_section_scope a[href*="/charts/top/song/"]');
    }

})();

