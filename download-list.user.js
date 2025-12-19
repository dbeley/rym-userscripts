// ==UserScript==
// @name         RateYourMusic List Data Extractor
// @namespace    RateYourMusic scripts
// @version      1.2
// @description  Extract and download list data as CSV or plain text from RateYourMusic list pages.
// @author       dbeley
// @match        https://rateyourmusic.com/list/*/*
// @grant        none
// ==/UserScript==

(function () {
  "use strict";

  function getTimestamp() {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, "0"); // Months are zero-indexed
    const day = String(now.getDate()).padStart(2, "0");
    const hours = String(now.getHours()).padStart(2, "0");
    const minutes = String(now.getMinutes()).padStart(2, "0");
    const seconds = String(now.getSeconds()).padStart(2, "0");
    return `${year}-${month}-${day}_${hours}-${minutes}-${seconds}`;
  }

  // Function to detect list type and extract relevant information
  function extractInfo(row, index) {
    const info = {};

    // Extract position/rank number - use index if no number element exists
    const numberElement = row.querySelector(".number");
    info.position = numberElement
      ? numberElement.textContent.trim()
      : (index + 1).toString();

    // Extract image URL (common to all list types)
    const imageElement = row.querySelector(".list_art img");
    info.image_url = imageElement ? imageElement.src.trim() : "N/A";

    // Check if this is a music list item (album/artist)
    const artistElement = row.querySelector(".list_artist");
    const albumElement = row.querySelector(".list_album");

    if (artistElement || albumElement) {
      // Music list (album/artist)
      info.type = "music";
      info.artist = artistElement ? artistElement.textContent.trim() : "N/A";
      info.album = albumElement ? albumElement.textContent.trim() : "N/A";

      // Extract release date
      const dateElement = row.querySelector(".rel_date");
      info.release_date = dateElement
        ? dateElement.textContent.trim().replace(/[()]/g, "")
        : "N/A";

      // Extract URLs
      info.album_url =
        albumElement && albumElement.getAttribute("href")
          ? `https://rateyourmusic.com${albumElement.getAttribute("href")}`
          : "N/A";
      info.artist_url =
        artistElement && artistElement.getAttribute("href")
          ? `https://rateyourmusic.com${artistElement.getAttribute("href")}`
          : "N/A";

      // For music items, set generic fields to N/A
      info.title = "N/A";
      info.description = "N/A";
    } else {
      // Generic list item
      info.type = "generic";

      // Extract title from generic_title
      const titleElement = row.querySelector(".generic_title .rendered_text");
      info.title = titleElement ? titleElement.textContent.trim() : "N/A";

      // Extract description from generic_desc
      const descElement = row.querySelector(".generic_desc .rendered_text");
      if (descElement) {
        // Handle both text and links in description
        let description = "";
        if (descElement.querySelector("a")) {
          // If there's a link, get the href
          const linkElement = descElement.querySelector("a");
          description = linkElement.href || linkElement.textContent.trim();
        } else {
          description = descElement.textContent.trim();
        }
        info.description = description;
      } else {
        info.description = "N/A";
      }

      // For generic items, we don't have artist/album/date fields
      info.artist = "N/A";
      info.album = "N/A";
      info.release_date = "N/A";
      info.album_url = "N/A";
      info.artist_url = "N/A";
    }

    return info;
  }

  // Function to convert data to CSV format
  function convertToCSV(data) {
    if (data.length === 0) {
      console.log("No data found.");
      return null;
    }

    const headers = Object.keys(data[0]);
    const csvRows = [headers.join(",")];

    data.forEach((row) => {
      const values = headers.map((header) => {
        let value = row[header] ? String(row[header]) : "";
        // Escape double quotes in values by doubling them
        value = value.replace(/"/g, '""');
        // Wrap each value in double quotes
        return `"${value}"`;
      });
      csvRows.push(values.join(","));
    });

    return csvRows.join("\n");
  }

  // Function to convert data to plain text format
  function convertToPlainText(data) {
    if (data.length === 0) {
      console.log("No data found.");
      return null;
    }

    return data
      .map((item) => {
        if (item.type === "music") {
          // Music list format
          if (item.artist !== "N/A" && item.album !== "N/A") {
            return `${item.position}. ${item.artist} - ${item.album} (${item.release_date})`;
          } else if (item.artist !== "N/A") {
            return `${item.position}. ${item.artist} (${item.release_date})`;
          } else if (item.album !== "N/A") {
            return `${item.position}. ${item.album} (${item.release_date})`;
          }
        } else {
          // Generic list format
          let result = `${item.position}. ${item.title}`;
          if (item.description !== "N/A" && item.description.length > 0) {
            result += ` - ${item.description}`;
          }
          return result;
        }
        return `${item.position}. ${item.title || "Unknown"}`;
      })
      .join("\n");
  }

  // Function to download a file
  function downloadFile(content, filename, type) {
    if (!content) {
      alert("No data available to download.");
      return;
    }

    const blob = new Blob([content], { type: type });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.setAttribute("hidden", "");
    a.setAttribute("href", url);
    a.setAttribute("download", filename);
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);

    // Cleanup URL object
    window.URL.revokeObjectURL(url);
  }

  // Function to get list title for filename
  function getListTitle() {
    const titleElement = document.querySelector("h1.list_title, h1");
    return titleElement
      ? titleElement.textContent
          .trim()
          .replace(/[^a-zA-Z0-9\s]/g, "")
          .replace(/\s+/g, "_")
      : "rym_list";
  }

  // Function to handle CSV download button click
  function handleDownloadCSVClick() {
    console.log("Download CSV button clicked. Starting data extraction...");

    // Select all table rows with list items
    const rowElements = document.querySelectorAll("#user_list tbody tr");

    // Initialize an array to store the extracted information
    const extractedData = [];

    // Iterate over each row element and extract the information
    let itemIndex = 0;
    rowElements.forEach((row) => {
      // Skip mobile description rows and other non-item rows
      if (row.classList.contains("show-for-small-table-row")) {
        return;
      }

      // Check for list items - either music items or generic items
      if (
        row.querySelector(".list_art") &&
        (row.querySelector(".list_artist") ||
          row.querySelector(".generic_title"))
      ) {
        const info = extractInfo(row, itemIndex);
        extractedData.push(info);
        itemIndex++;
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
    downloadFile(csvData, filename, "text/csv");
  }

  // Function to handle Plain Text download button click
  function handleDownloadPlainTextClick() {
    console.log(
      "Download Plain Text button clicked. Starting data extraction...",
    );

    // Select all table rows with list items
    const rowElements = document.querySelectorAll("#user_list tbody tr");

    // Initialize an array to store the extracted information
    const extractedData = [];

    // Iterate over each row element and extract the information
    let itemIndex = 0;
    rowElements.forEach((row) => {
      // Skip mobile description rows and other non-item rows
      if (row.classList.contains("show-for-small-table-row")) {
        return;
      }

      // Check for list items - either music items or generic items
      if (
        row.querySelector(".list_art") &&
        (row.querySelector(".list_artist") ||
          row.querySelector(".generic_title"))
      ) {
        const info = extractInfo(row, itemIndex);
        extractedData.push(info);
        itemIndex++;
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
    downloadFile(plainTextData, filename, "text/plain");
  }

  // Function to create and insert the download buttons
  function addButtons() {
    // Look for a suitable container near the list
    let navContainer = document.querySelector("#nav_bottom");

    // If nav_bottom doesn't exist, try to find another suitable container
    if (!navContainer) {
      navContainer = document.querySelector(".list_controls, .list_header, h1");
      if (navContainer && navContainer.tagName === "H1") {
        // Create a container div after the h1
        const containerDiv = document.createElement("div");
        containerDiv.style.marginTop = "10px";
        navContainer.parentNode.insertBefore(
          containerDiv,
          navContainer.nextSibling,
        );
        navContainer = containerDiv;
      }
    }

    if (
      navContainer &&
      !navContainer.querySelector(".download-buttons-container")
    ) {
      const buttonContainer = document.createElement("div");
      buttonContainer.className = "download-buttons-container";
      buttonContainer.style.marginTop = "10px";
      buttonContainer.style.textAlign = "center";

      const csvButton = document.createElement("button");
      csvButton.textContent = "Download CSV";
      csvButton.style.marginLeft = "10px";
      csvButton.style.padding = "5px 10px";
      csvButton.style.backgroundColor = "#4CAF50";
      csvButton.style.color = "white";
      csvButton.style.border = "none";
      csvButton.style.borderRadius = "5px";
      csvButton.style.cursor = "pointer";
      csvButton.addEventListener("click", handleDownloadCSVClick);

      const textButton = document.createElement("button");
      textButton.textContent = "Download Plain Text";
      textButton.style.marginLeft = "10px";
      textButton.style.padding = "5px 10px";
      textButton.style.backgroundColor = "#2196F3";
      textButton.style.color = "white";
      textButton.style.border = "none";
      textButton.style.borderRadius = "5px";
      textButton.style.cursor = "pointer";
      textButton.addEventListener("click", handleDownloadPlainTextClick);

      buttonContainer.appendChild(csvButton);
      buttonContainer.appendChild(textButton);
      navContainer.appendChild(buttonContainer);
      console.log("Download buttons added to the page.");
    }
  }

  // Set up MutationObserver
  const observer = new MutationObserver((mutations) => {
    mutations.forEach((mutation) => {
      if (mutation.type === "childList") {
        addButtons();
      }
    });
  });

  // Observe changes in the document body
  observer.observe(document.body, { childList: true, subtree: true });

  // Add buttons initially if the content is already loaded
  setTimeout(addButtons, 1000); // Small delay to ensure page is loaded
})();
