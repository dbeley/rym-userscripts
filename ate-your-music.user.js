// ==UserScript==
// @name         AteYourMusic styling
// @namespace    RateYourMusic scripts
// @version      1
// @description  Change the name of the website and add a custom logo.
// @author       dbeley
// @match        https://rateyourmusic.com/*
// @grant        none
// ==/UserScript==

(function() {
    'use strict';
    // Wait for the DOM to fully load
    window.addEventListener('load', function() {
        // Replace the logo name text and remove text-transform styling
        const logoNameElement = document.querySelector('.logo_name');
        if (logoNameElement) {
            logoNameElement.textContent = 'Ate Your Music'; // Change the logo name text
            logoNameElement.style.textTransform = 'none'; // Disable text-transform
        }

        // Remove the existing logo header div and replace it with a new image
        const logoHeaderElement = document.querySelector('.logo_header');
        if (logoHeaderElement) {
            const parent = logoHeaderElement.parentNode;
            parent.removeChild(logoHeaderElement); // Remove the div

            // Create a new img element and add it before the logo name
            const newImg = document.createElement('img');
            newImg.src = 'https://www.svgrepo.com/show/297216/hamburger-burger.svg';
            newImg.alt = 'New Logo';
            newImg.style.width = '50px'; // Set desired width for the image
            parent.insertBefore(newImg, logoNameElement); // Insert the image before the logo name
        }
    }, false);


})();

