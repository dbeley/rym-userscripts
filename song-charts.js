// ==UserScript==
// @name         RateYourMusic Charts Data Extractor
// @namespace    http://tampermonkey.net/
// @version      1.2
// @description  Extract and download song chart data as CSV or plain text from RateYourMusic charts pages.
// @author       YourName
// @match        https://rateyourmusic.com/charts/top/song/*
// @match        https://rateyourmusic.com/charts/popular/song/*
// @match        https://rateyourmusic.com/charts/esoteric/song/*
// @match        https://rateyourmusic.com/charts/diverse/song/*
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

        return info;
    }

    // Function to convert data to CSV format
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

    // Function to convert data to plain text format
    function convertToPlainText(data) {
        if (data.length === 0) {
            console.log("No data found.");
            return null;
        }

        return data.map(item => `${item.artist} - ${item.title}`).join('\n');
    }

    // Function to download a file
    function downloadFile(content, filename, type) {
        if (!content) {
            alert("No data available to download.");
            return;
        }

        const blob = new Blob([content], { type: type });
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

    // Function to handle CSV download button click
    function handleDownloadCSVClick() {
        console.log("Download CSV button clicked. Starting data extraction...");

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
        downloadFile(csvData, 'rym_charts_data.csv', 'text/csv');
    }

    // Function to handle Plain Text download button click
    function handleDownloadPlainTextClick() {
        console.log("Download Plain Text button clicked. Starting data extraction...");

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

        // Convert the extracted data to Plain Text format
        const plainTextData = convertToPlainText(extractedData);

        console.log("Plain Text data prepared. Starting download...");

        // Download the Plain Text file
        downloadFile(plainTextData, 'rym_charts_data.txt', 'text/plain');
    }

    // Function to create and insert the download buttons
    function addButtons() {
        const navDiv = document.querySelector('.page_charts_section_charts_nav_view');
        if (navDiv) {
            // Create the Download CSV button
            const csvButton = document.createElement('button');
            csvButton.textContent = 'Download CSV';
            csvButton.style.marginLeft = '10px';
            csvButton.style.padding = '5px 10px';
            csvButton.style.backgroundColor = '#4CAF50';
            csvButton.style.color = 'white';
            csvButton.style.border = 'none';
            csvButton.style.borderRadius = '5px';
            csvButton.style.cursor = 'pointer';
            csvButton.addEventListener('click', handleDownloadCSVClick);

            // Create the Download Plain Text button
            const textButton = document.createElement('button');
            textButton.textContent = 'Download Plain Text';
            textButton.style.marginLeft = '10px';
            textButton.style.padding = '5px 10px';
            textButton.style.backgroundColor = '#2196F3';
            textButton.style.color = 'white';
            textButton.style.border = 'none';
            textButton.style.borderRadius = '5px';
            textButton.style.cursor = 'pointer';
            textButton.addEventListener('click', handleDownloadPlainTextClick);

            // Add buttons to the navigation div
            navDiv.appendChild(csvButton);
            navDiv.appendChild(textButton);

            console.log("Download buttons added to the page.");
        } else {
            console.log("Navigation div not found. Buttons not added.");
        }
    }

    // Run the addButtons function when the DOM is fully loaded
    window.addEventListener('load', addButtons);

})();

