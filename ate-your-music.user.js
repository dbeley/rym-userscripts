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
            logoNameElement.style.display = 'inline-block'; // Ensure it's inline with the image
            logoNameElement.style.verticalAlign = 'middle'; // Vertically center with the image
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
            newImg.style.width = '30px'; // Set a smaller width for the image
            newImg.style.height = 'auto'; // Ensure the aspect ratio is maintained
            newImg.style.display = 'inline-block'; // Make sure the image is inline with the text
            newImg.style.verticalAlign = 'middle'; // Vertically center the image with the text
            parent.insertBefore(newImg, logoNameElement); // Insert the image before the logo name
        }

    }, false);


})();

