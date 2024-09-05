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
        }

        // Remove the existing logo header div and replace it with a new image
        const logoHeaderElement = document.querySelector('.logo_header');
        if (logoHeaderElement) {
            const parent = logoHeaderElement.parentNode;
            parent.removeChild(logoHeaderElement); // Remove the div

            // Create a new div with the class 'logo_header'
            const newDiv = document.createElement('div');
            newDiv.className = 'logo_header';


            // Create a new img element and add it before the logo name
            const newImg = document.createElement('img');
            newImg.src = 'https://www.svgrepo.com/show/297216/hamburger-burger.svg';
            newImg.alt = 'New Logo';

            // Append the image to the new div
            newDiv.appendChild(newImg);

            // Insert the new div with the image before the logo name
            parent.insertBefore(newDiv, logoNameElement);
        }

    }, false);


})();

