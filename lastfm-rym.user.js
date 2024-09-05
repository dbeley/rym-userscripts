// ==UserScript==
// @name         Add Track Info Button
// @namespace    http://tampermonkey.net/
// @version      0.1
// @description  Adds a button to open a URL with artist and track names
// @match        *://*/*
// @grant        none
// ==/UserScript==

(function() {
    'use strict';

    function addButtonToRow(row) {
        const trackName = row.querySelector('.chartlist-name a').innerText;
        const artistName = row.querySelector('.chartlist-artist a').innerText;
        const url = `https://example.com/search?artist=${encodeURIComponent(artistName)}&track=${encodeURIComponent(trackName)}`;
        
        const buyLinksTd = row.querySelector('.chartlist-buylinks');
        if (!buyLinksTd) return;
        
        // Create the new button
        const button = document.createElement('button');
        button.innerText = 'Open Info';
        button.className = 'chartlist-info-button'; // Add your own class or style here
        button.style.marginLeft = '10px'; // Add spacing from existing button
        button.onclick = () => window.open(url, '_blank');
        
        buyLinksTd.appendChild(button);
    }

    function init() {
        const rows = document.querySelectorAll('tr.chartlist-row');
        rows.forEach(addButtonToRow);
    }

    // Wait until the page is fully loaded
    window.addEventListener('load', init);
})();

