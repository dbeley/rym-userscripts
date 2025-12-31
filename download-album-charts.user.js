// ==UserScript==
// @name         RateYourMusic Album Charts Data Extractor
// @namespace    RateYourMusic scripts
// @version      1.5
// @description  Extract and download album chart data as CSV or plain text from RateYourMusic charts pages.
// @author       dbeley
// @match        https://rateyourmusic.com/charts/
// @match        https://rateyourmusic.com/charts/top/album/*
// @match        https://rateyourmusic.com/charts/popular/album/*
// @match        https://rateyourmusic.com/charts/esoteric/album/*
// @match        https://rateyourmusic.com/charts/diverse/album/*
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

  function getChartInfo() {
    const path = window.location.pathname;
    const searchParams = new URLSearchParams(window.location.search);

    // Extract chart type (top, popular, esoteric, diverse)
    const chartTypeMatch = path.match(
      /\/charts\/(top|popular|esoteric|diverse)\//
    );
    const chartType = chartTypeMatch ? chartTypeMatch[1] : "unknown";

    // Extract filters from URL path and query params
    const filters = [];

    // Year filter
    const yearMatch = path.match(/\/(\d{4})\/?/);
    if (yearMatch) filters.push(yearMatch[1]);

    // Genre/descriptor from path
    const pathParts = path
      .split("/")
      .filter(
        (p) =>
          p &&
          ![
            "charts",
            "top",
            "popular",
            "esoteric",
            "diverse",
            "album",
          ].includes(p) &&
          !/^\d{4}$/.test(p)
      );
    filters.push(...pathParts);

    // Additional query parameters that might be useful
    if (searchParams.has("page"))
      filters.push(`page${searchParams.get("page")}`);

    return {
      type: chartType,
      filters: filters.join("_"),
    };
  }

  // Function to extract relevant information from each album div
  function extractInfo(div) {
    const info = {};

    // Extract album title
    const titleElement = div.querySelector(
      ".page_charts_section_charts_item_title .ui_name_locale_original, .page_charts_section_charts_item_title .ui_name_locale"
    );
    info.title = titleElement ? titleElement.textContent.trim() : "N/A";

    // Extract artist name(s)
    const artistElements = div.querySelectorAll(
      ".page_charts_section_charts_item_credited_text a.artist"
    );
    info.artist =
      Array.from(artistElements)
        .map((el) => el.textContent.trim())
        .join(" ")
        .trim() || "N/A";

    // Extract release date
    const dateElement = div.querySelector(
      ".page_charts_section_charts_item_title_date_compact span:first-child"
    );
    info.release_date = dateElement ? dateElement.textContent.trim() : "N/A";

    // Extract genres (primary and secondary)
    const genreElements = div.querySelectorAll(
      ".page_charts_section_charts_item_genres_primary a, .page_charts_section_charts_item_genres_secondary a"
    );
    info.genres = Array.from(genreElements)
      .map((genre) => genre.textContent.trim())
      .join(", ");

    // Extract average rating
    const ratingElement = div.querySelector(
      ".page_charts_section_charts_item_stats_ratings .page_charts_section_charts_item_details_average_num"
    );
    info.average_rating = ratingElement
      ? ratingElement.textContent.trim()
      : "N/A";

    // Extract number of votes
    const votesElement = div.querySelector(
      ".page_charts_section_charts_item_stats_ratings .page_charts_section_charts_item_details_ratings .abbr"
    );
    info.number_of_votes = votesElement
      ? votesElement.textContent.trim()
      : "N/A";

    // Extract number of reviews
    const reviewsElement = div.querySelector(
      ".page_charts_section_charts_item_details_reviews .abbr"
    );
    info.number_of_reviews = reviewsElement
      ? reviewsElement.textContent.trim()
      : "N/A";

    // Extract image URL
    const imageElement = div.querySelector(
      ".page_charts_section_charts_item_image img"
    );
    info.image_url = imageElement ? imageElement.src.trim() : "N/A";

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

    return data.map((item) => `${item.artist} - ${item.title}`).join("\n");
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

  // Function to handle CSV download button click
  function handleDownloadCSVClick() {
    console.log("Download CSV button clicked. Starting data extraction...");

    // Select all div elements with the relevant class
    const divElements = document.querySelectorAll(
      "div.page_charts_section_charts_item.object_release"
    );

    // Initialize an array to store the extracted information
    const extractedData = [];

    // Iterate over each div element and extract the information
    divElements.forEach((div) => {
      const info = extractInfo(div);
      extractedData.push(info);
    });

    console.log("Data extraction complete. Data:", extractedData);

    // Convert the extracted data to CSV format
    const csvData = convertToCSV(extractedData);

    console.log("CSV data prepared. Starting download...");

    // Generate timestamp
    const timestamp = getTimestamp();

    // Get chart info for filename
    const chartInfo = getChartInfo();
    const chartPart = chartInfo.filters
      ? `${chartInfo.type}_${chartInfo.filters}`
      : chartInfo.type;

    // Generate filename with timestamp
    const filename = `rym_album_charts_${chartPart}_${timestamp}.csv`;

    // Download the CSV file
    downloadFile(csvData, filename, "text/csv");
  }

  // Function to handle Plain Text download button click
  function handleDownloadPlainTextClick() {
    console.log(
      "Download Plain Text button clicked. Starting data extraction..."
    );

    // Select all div elements with the relevant class
    const divElements = document.querySelectorAll(
      "div.page_charts_section_charts_item.object_release"
    );

    // Initialize an array to store the extracted information
    const extractedData = [];

    // Iterate over each div element and extract the information
    divElements.forEach((div) => {
      const info = extractInfo(div);
      extractedData.push(info);
    });

    console.log("Data extraction complete. Data:", extractedData);

    // Convert the extracted data to Plain Text format
    const plainTextData = convertToPlainText(extractedData);

    console.log("Plain Text data prepared. Starting download...");

    // Generate timestamp
    const timestamp = getTimestamp();

    // Get chart info for filename
    const chartInfo = getChartInfo();
    const chartPart = chartInfo.filters
      ? `${chartInfo.type}_${chartInfo.filters}`
      : chartInfo.type;

    // Generate filename with timestamp
    const filename = `rym_album_charts_${chartPart}_${timestamp}.txt`;

    // Download the text file
    downloadFile(plainTextData, filename, "text/plain");
  }

  // Function to create and insert the download buttons
  function addButtons() {
    const navContainer = document.querySelector(
      ".page_charts_section_charts_nav_view"
    );
    if (
      navContainer &&
      !navContainer.querySelector(".download-buttons-container")
    ) {
      const buttonContainer = document.createElement("div");
      buttonContainer.className = "download-buttons-container";

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
  addButtons();
})();
