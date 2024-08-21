// ==UserScript==
// @name         RateYourMusic Charts Data Extractor
// @namespace    http://tampermonkey.net/
// @version      1.1
// @description  Extract and download song chart data as CSV from RateYourMusic charts pages.
// @author       dbeley
// @match        https://rateyourmusic.com/charts/top/song/*
// @match        https://rateyourmusic.com/charts/popular/song/*
// @grant        none
// ==/UserScript==

(function() {
    'use strict';

    // Function to extract relevant information from each div
    function extractInfo(div) {
        const info = {};

        // Extract song title
        const titleElement = div.querySelector('.page_charts_section_charts_item_title .ui_name_locale_original');
        info.title = titleElement ? titleElement.textContent.trim() : 'N/A';

        // Extract artist name
        const artistElement = div.querySelector('.page_charts_section_charts_item_credited_text .ui_name_locale_original');
        info.artist = artistElement ? artistElement.textContent.trim() : 'N/A';

        // Extract release date
        const releaseDateElement = div.querySelector('.page_charts_section_charts_item_title_date_compact span');
        info.releaseDate = releaseDateElement ? releaseDateElement.textContent.trim() : 'N/A';

        // Extract genre
        const genreElement = div.querySelector('.page_charts_section_charts_item_genres_primary .genre');
        info.genre = genreElement ? genreElement.textContent.trim() : 'N/A';

        // Extract rating
        const ratingElement = div.querySelector('.page_charts_section_charts_item_details_average_num');
        info.rating = ratingElement ? ratingElement.textContent.trim() : 'N/A';

        // Extract rating count
        const ratingCountElement = div.querySelector('.page_charts_section_charts_item_details_ratings .abbr');
        info.ratingCount = ratingCountElement ? ratingCountElement.textContent.trim() : 'N/A';

        return info;
    }

    // Function to convert JSON data to CSV format
    function convertToCSV(data) {
        if (data.length === 0) {
            console.log("No data found.");
            return null;
        }

        const headers = Object.keys(data[0]);
        const csvRows = [headers.join(',')];

        data.forEach(row => {
            const values = headers.map(header => `"${row[header]}"`);
            csvRows.push(values.join(','));
        });

        return csvRows.join('\n');
    }

    // Function to download the CSV file
    function downloadCSV(csvData, filename) {
        if (!csvData) {
            alert("No data available to download.");
            return;
        }

        const blob = new Blob([csvData], { type: 'text/csv' });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.setAttribute('hidden', '');
        a.setAttribute('href', url);
        a.setAttribute('download', filename);
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);

        // Cleanup URL object
        window.URL.revokeObjectURL(url);
    }

    // Function to handle button click and initiate data extraction and download
    function handleDownloadButtonClick() {
        console.log("Download button clicked. Starting data extraction...");

        // Select all div elements with the relevant class
        const divElements = document.querySelectorAll('div.page_charts_section_charts_item');

        // Initialize an array to store the extracted information
        const extractedData = [];

        // Iterate over each div element and extract the information
        divElements.forEach(div => {
            const info = extractInfo(div);
            extractedData.push(info);
        });

        console.log("Data extraction complete. Data:", extractedData);

        // Convert the extracted data to CSV format
        const csvData = convertToCSV(extractedData);

        console.log("CSV data prepared. Starting download...");

        // Download the CSV file
        downloadCSV(csvData, 'rym_charts_data.csv');
    }

    // Function to create and insert the download button
    function addButton() {
        const navDiv = document.querySelector('.page_charts_section_charts_nav_view');
        if (navDiv) {
            const button = document.createElement('button');
            button.textContent = 'Download CSV';
            button.style.marginLeft = '10px';
            button.style.padding = '5px 10px';
            button.style.backgroundColor = '#4CAF50';
            button.style.color = 'white';
            button.style.border = 'none';
            button.style.borderRadius = '5px';
            button.style.cursor = 'pointer';
            button.addEventListener('click', handleDownloadButtonClick);
            navDiv.appendChild(button);
            console.log("Download CSV button added to the page.");
        } else {
            console.log("Navigation div not found. Button not added.");
        }
    }

    // Run the addButton function when the DOM is fully loaded
    window.addEventListener('load', addButton);

})();
