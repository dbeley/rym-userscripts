// ==UserScript==
// @name         RateYourMusic add genres on songs charts links
// @namespace    RateYourMusic scripts
// @version      1.0
// @description  Add genres on songs charts links.
// @author       dbeley
// @match        https://rateyourmusic.com/charts/top/*/*/g:*
// @grant        none
// ==/UserScript==

(function() {

// Extract the "g:..." part from the current URL
const url = window.location.href;
const genreMatch = url.match(/(g:[^/]+)/); // This will match "g:something"
const genrePart = genreMatch ? genreMatch[0] : null;

// Only proceed if we found a genre part
if (genrePart) {
    // Select all the anchor tags in the relevant HTML section
    const links = document.querySelectorAll('.ui_button.btn_page_charts_common_charts');

    // Loop through each link and modify the href attribute
    links.forEach(link => {
        const href = link.getAttribute('href');
        // Append the genre part directly to the existing href
        link.setAttribute('href', `${href}${href.endsWith('/') ? '' : '/'}${genrePart}`);
    });
}
})();

