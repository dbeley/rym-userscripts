// ==UserScript==
// @name         Glitchwave Game Charts Data Extractor
// @namespace    Glitchwave scripts
// @version      1.0
// @description  Extract and download video game chart data as CSV or plain text from Glitchwave charts pages.
// @author       dbeley
// @match        https://glitchwave.com/charts/
// @match        https://glitchwave.com/charts/top/game/*
// @match        https://glitchwave.com/charts/popular/game/*
// @match        https://glitchwave.com/charts/esoteric/game/*
// @match        https://glitchwave.com/charts/diverse/game/*
// @match        https://glitchwave.com/charts/bottom/game/*
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

    // Extract chart type (top, popular, esoteric, diverse, bottom)
    const chartTypeMatch = path.match(
      /\/charts\/(top|popular|esoteric|diverse|bottom)\//
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
            "bottom",
            "game",
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

  // Function to extract relevant information from each game div
  function extractInfo(div) {
    const info = {};

    // Extract game title
    const titleElement = div.querySelector(
      ".chart_card_title_line .chart_title a"
    );
    info.title = titleElement ? titleElement.textContent.trim() : "N/A";

    // Extract developer(s) - not displayed in this chart layout
    info.developer = "N/A";

    // Extract release date
    const dateElement = div.querySelector(".chart_release_date");
    info.release_date = dateElement ? dateElement.textContent.trim() : "N/A";

    // Extract genres
    const genreElements = div.querySelectorAll(".chart_genres a");
    info.genres = Array.from(genreElements)
      .map((genre) => genre.textContent.trim())
      .join(", ");

    // Extract average rating
    const ratingElement = div.querySelector(".rating_number");
    info.average_rating = ratingElement
      ? ratingElement.textContent.trim()
      : "N/A";

    // Extract number of ratings
    const ratingsElement = div.querySelector(".chart_card_ratings b");
    info.number_of_votes = ratingsElement
      ? ratingsElement.textContent.trim()
      : "N/A";

    // Extract number of reviews
    const reviewsElement = div.querySelector(".chart_card_reviews b");
    info.number_of_reviews = reviewsElement
      ? reviewsElement.textContent.trim()
      : "N/A";

    // Extract image URL
    const imageElement = div.querySelector(".chart_card_image");
    if (imageElement) {
      const bgUrl =
        imageElement.style.background ||
        imageElement.getAttribute("data-delayloadurl");
      if (bgUrl) {
        const urlMatch = bgUrl.match(/url\(['"](.*?)['"]\)/);
        info.image_url = urlMatch ? urlMatch[1] : "N/A";
      } else {
        info.image_url = "N/A";
      }
    } else {
      info.image_url = "N/A";
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

    return data.map((item) => item.title).join("\n");
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
    const divElements = document.querySelectorAll("div.chart_card");

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
    const filename = `glitchwave_game_charts_${chartPart}_${timestamp}.csv`;

    // Download the CSV file
    downloadFile(csvData, filename, "text/csv");
  }

  // Function to handle Plain Text download button click
  function handleDownloadPlainTextClick() {
    console.log(
      "Download Plain Text button clicked. Starting data extraction..."
    );

    // Select all div elements with the relevant class
    const divElements = document.querySelectorAll("div.chart_card");

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
    const filename = `glitchwave_game_charts_${chartPart}_${timestamp}.txt`;

    // Download the text file
    downloadFile(plainTextData, filename, "text/plain");
  }

  // Function to create and insert the download buttons
  function addButtons() {
    // Try multiple possible locations for button insertion
    const navContainer =
      document.querySelector(".page_chart_nav_top") ||
      document.querySelector(".page_chart_header") ||
      document.querySelector(".page_chart_main");

    if (
      navContainer &&
      !document.querySelector(".download-buttons-container")
    ) {
      const buttonContainer = document.createElement("div");
      buttonContainer.className = "download-buttons-container";
      buttonContainer.style.marginTop = "10px";
      buttonContainer.style.marginBottom = "10px";

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
    } else if (!navContainer) {
      console.log("Nav container not found. Page structure may have changed.");
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
