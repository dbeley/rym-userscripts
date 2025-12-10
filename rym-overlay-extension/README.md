# RYM Cache Overlay (Firefox WebExtension)

Display cached RateYourMusic ratings on Spotify and YouTube using the data already captured by `rateyourmusic-csv-tracker.user.js`.

## How it works
- The CSV tracker userscript writes its records to `GM_setValue` and now mirrors the JSON blob into `localStorage` under the key `rateyourmusic-csv::records`.
- This extension ships a content script for `rateyourmusic.com` that reads that localStorage entry when you visit an album or chart page and pushes it to the background script.
- The background script builds a lookup index and keeps it in `browser.storage.local`.
- Content scripts on Spotify and YouTube pull the index and inject a small `RYM <rating>` badge next to matching titles.

Visiting a RYM album or chart page automatically refreshes the cache; the next time you open Spotify/YouTube, the overlay uses the new data.

## Loading the extension (Firefox)
1. Open `about:debugging#/runtime/this-firefox`.
2. Click **Load Temporary Add-on…** and select `manifest.json` inside `rym-overlay-extension/`.
3. Keep the `rateyourmusic-csv-tracker.user.js` enabled so it continues to populate the cache.

You can reopen the popup to see the last sync time and number of cached releases.
