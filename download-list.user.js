// ==UserScript==
// @name         RateYourMusic List Data Extractor
// @namespace    RateYourMusic scripts
// @version      1.0
// @description  Extract and download list data as CSV or plain text from RateYourMusic list pages.
// @author       dbeley
// @match        https://rateyourmusic.com/list/*/*
// @grant        none
// ==/UserScript==

(function() {
    'use strict';

    function getTimestamp() {
        const now = new Date();
        const year = now.getFullYear();
        const month = String(now.getMonth() + 1).padStart(2, '0'); // Months are zero-indexed
        const day = String(now.getDate()).padStart(2, '0');
        const hours = String(now.getHours()).padStart(2, '0');
        const minutes = String(now.getMinutes()).padStart(2, '0');
        const seconds = String(now.getSeconds()).padStart(2, '0');
        return `${year}-${month}-${day}_${hours}-${minutes}-${seconds}`;
    }

    // Function to extract relevant information from each list item row
    function extractInfo(row) {
        const info = {};

        // Extract position/rank number
        const numberElement = row.querySelector('.number');
        info.position = numberElement ? numberElement.textContent.trim() : 'N/A';

        // Extract artist name
        const artistElement = row.querySelector('.list_artist');
        info.artist = artistElement ? artistElement.textContent.trim() : 'N/A';

        // Extract album/release title
        const albumElement = row.querySelector('.list_album');
        info.album = albumElement ? albumElement.textContent.trim() : 'N/A';

        // Extract release date
        const dateElement = row.querySelector('.rel_date');
        info.release_date = dateElement ? dateElement.textContent.trim().replace(/[()]/g, '') : 'N/A';

        // Extract image URL
        const imageElement = row.querySelector('.list_art img');
        info.image_url = imageElement ? imageElement.src.trim() : 'N/A';

        // Extract album URL
        const albumLinkElement = row.querySelector('.list_album');
        info.album_url = albumLinkElement ? `https://rateyourmusic.com${albumLinkElement.getAttribute('href')}` : 'N/A';

        // Extract artist URL
        const artistLinkElement = row.querySelector('.list_artist');
        info.artist_url = artistLinkElement ? `https://rateyourmusic.com${artistLinkElement.getAttribute('href')}` : 'N/A';

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
            const values = headers.map(header => {
                let value = row[header] ? String(row[header]) : '';
                // Escape double quotes in values by doubling them
                value = value.replace(/"/g, '""');
                // Wrap each value in double quotes
                return `"${value}"`;
            });
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

        return data.map(item => `${item.position}. ${item.artist} - ${item.album} (${item.release_date})`).join('\n');
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

    // Function to get list title for filename
    function getListTitle() {
        const titleElement = document.querySelector('h1.list_title, h1');
        return titleElement ? titleElement.textContent.trim().replace(/[^a-zA-Z0-9\s]/g, '').replace(/\s+/g, '_') : 'rym_list';
    }

    // Function to handle CSV download button click
    function handleDownloadCSVClick() {
        console.log("Download CSV button clicked. Starting data extraction...");

        // Select all table rows with list items
        const rowElements = document.querySelectorAll('#user_list tbody tr');

        // Initialize an array to store the extracted information
        const extractedData = [];

        // Iterate over each row element and extract the information
        rowElements.forEach(row => {
            // Skip rows that don't contain actual list items
            if (row.querySelector('.number') && row.querySelector('.list_artist')) {
                const info = extractInfo(row);
                extractedData.push(info);
            }
        });

        console.log("Data extraction complete. Data:", extractedData);

        // Convert the extracted data to CSV format
        const csvData = convertToCSV(extractedData);

        console.log("CSV data prepared. Starting download...");

        // Generate timestamp and list title
        const timestamp = getTimestamp();
        const listTitle = getListTitle();

        // Generate filename with timestamp and list title
        const filename = `${listTitle}_${timestamp}.csv`;

        // Download the CSV file
        downloadFile(csvData, filename, 'text/csv');
    }

    // Function to handle Plain Text download button click
    function handleDownloadPlainTextClick() {
        console.log("Download Plain Text button clicked. Starting data extraction...");

        // Select all table rows with list items
        const rowElements = document.querySelectorAll('#user_list tbody tr');

        // Initialize an array to store the extracted information
        const extractedData = [];

        // Iterate over each row element and extract the information
        rowElements.forEach(row => {
            // Skip rows that don't contain actual list items
            if (row.querySelector('.number') && row.querySelector('.list_artist')) {
                const info = extractInfo(row);
                extractedData.push(info);
            }
        });

        console.log("Data extraction complete. Data:", extractedData);

        // Convert the extracted data to Plain Text format
        const plainTextData = convertToPlainText(extractedData);

        console.log("Plain Text data prepared. Starting download...");

        // Generate timestamp and list title
        const timestamp = getTimestamp();
        const listTitle = getListTitle();

        // Generate filename with timestamp and list title
        const filename = `${listTitle}_${timestamp}.txt`;

        // Download the text file
        downloadFile(plainTextData, filename, 'text/plain');
    }

    // Function to create and insert the download buttons
    function addButtons() {
        // Look for a suitable container near the list
        let navContainer = document.querySelector('#nav_bottom');
        
        // If nav_bottom doesn't exist, try to find another suitable container
        if (!navContainer) {
            navContainer = document.querySelector('.list_controls, .list_header, h1');
            if (navContainer && navContainer.tagName === 'H1') {
                // Create a container div after the h1
                const containerDiv = document.createElement('div');
                containerDiv.style.marginTop = '10px';
                navContainer.parentNode.insertBefore(containerDiv, navContainer.nextSibling);
                navContainer = containerDiv;
            }
        }

        if (navContainer && !navContainer.querySelector('.download-buttons-container')) {
            const buttonContainer = document.createElement('div');
            buttonContainer.className = 'download-buttons-container';
            buttonContainer.style.marginTop = '10px';
            buttonContainer.style.textAlign = 'center';

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

            buttonContainer.appendChild(csvButton);
            buttonContainer.appendChild(textButton);
            navContainer.appendChild(buttonContainer);
            console.log("Download buttons added to the page.");
        }
    }

    // Set up MutationObserver
    const observer = new MutationObserver((mutations) => {
        mutations.forEach((mutation) => {
            if (mutation.type === 'childList') {
                addButtons();
            }
        });
    });

    // Observe changes in the document body
    observer.observe(document.body, { childList: true, subtree: true });

    // Add buttons initially if the content is already loaded
    setTimeout(addButtons, 1000); // Small delay to ensure page is loaded

})();
