// ==UserScript==
// @name         RateYourMusic Chart Song Player
// @namespace    https://github.com/dbeley/rym-userscripts
// @version      1.2.1
// @description  Adds a play button to each RYM song chart entry and opens a YouTube search for the song.
// @author       dbeley
// @match        https://rateyourmusic.com/charts/top/song/*
// @match        https://rateyourmusic.com/charts/popular/song/*
// @match        https://rateyourmusic.com/charts/esoteric/song/*
// @match        https://rateyourmusic.com/charts/diverse/song/*
// @grant        GM_xmlhttpRequest
// @grant        GM.xmlHttpRequest
// @connect      youtube.com
// @connect      www.youtube.com
// ==/UserScript==

(function () {
    'use strict';

    const CONFIG = {
        youtube: {
            openInNewTab: true,
            extraTerms: 'audio',
            autoPlayFirstResult: true
        }
    };

    const SELECTORS = {
        chartItem: '.page_charts_section_charts_item.object_song',
        title: '.page_charts_section_charts_item_title .ui_name_locale_original, .page_charts_section_charts_item_title .ui_name_locale',
        artist: '.page_charts_section_charts_item_credited_text .ui_name_locale_original, .page_charts_section_charts_item_credited_text .ui_name_locale',
        actionTarget: '.page_charts_section_charts_top_line_title_artist'
    };


    function init() {
        injectStyles();
        enhanceExistingItems();
        observeNewItems();
    }

    function injectStyles() {
        const style = document.createElement('style');
        style.textContent = `
            .rym-play-button {
                margin-left: 0.65rem;
                padding: 0.2rem 0.6rem;
                border-radius: 999px;
                border: 1px solid var(--color-border, #a1a1a1);
                background: var(--color-background-secondary, #fafafa);
                font-size: 0.8rem;
                cursor: pointer;
                transition: transform 0.15s ease, opacity 0.15s ease;
            }
            .rym-play-button:hover {
                transform: scale(1.03);
            }
            .rym-play-button:disabled {
                opacity: 0.6;
                cursor: progress;
            }
        `;
        document.head.appendChild(style);
    }

    function enhanceExistingItems() {
        document.querySelectorAll(SELECTORS.chartItem).forEach(addButtonToItem);
    }

    function observeNewItems() {
        const observer = new MutationObserver((mutations) => {
            mutations.forEach((mutation) => {
                mutation.addedNodes.forEach((node) => {
                    if (!(node instanceof HTMLElement)) {
                        return;
                    }

                    if (node.matches?.(SELECTORS.chartItem)) {
                        addButtonToItem(node);
                    } else {
                        node.querySelectorAll?.(SELECTORS.chartItem).forEach(addButtonToItem);
                    }
                });
            });
        });

        observer.observe(document.body, { childList: true, subtree: true });
    }

    function addButtonToItem(item) {
        if (item.dataset.rymPlayButtonAttached === 'true') {
            return;
        }

        const song = extractSongData(item);
        if (!song.title || !song.artist) {
            return;
        }

        const target = item.querySelector(SELECTORS.actionTarget) || item.querySelector('.page_charts_section_charts_item_title');
        if (!target) {
            return;
        }

        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'rym-play-button';
        button.textContent = '▶ Play';
        button.title = 'Open a YouTube search for this song';
        button.addEventListener('click', () => handlePlayClick(song, button));

        target.appendChild(button);
        item.dataset.rymPlayButtonAttached = 'true';
    }

    function extractSongData(item) {
        const titleElement = item.querySelector(SELECTORS.title);
        const artistElement = item.querySelector(SELECTORS.artist);
        return {
            title: titleElement ? sanitizeText(titleElement.textContent) : '',
            artist: artistElement ? sanitizeText(artistElement.textContent) : ''
        };
    }

    function sanitizeText(text) {
        return (text || '').replace(/\s+/g, ' ').trim();
    }

    async function handlePlayClick(song, button) {
        setButtonBusy(button, true);
        const query = buildYouTubeQuery(song);
        const searchUrl = buildYouTubeSearchUrl(query);
        // Pre-open the tab synchronously so popup blockers keep the user gesture alive.
        const shouldPreOpen = CONFIG.youtube.autoPlayFirstResult && CONFIG.youtube.openInNewTab;
        const preOpenedWindow = shouldPreOpen ? window.open('about:blank', '_blank', 'noopener') : null;
        try {
            const directVideoUrl = CONFIG.youtube.autoPlayFirstResult
                ? await fetchTopYouTubeResult(searchUrl)
                : null;
            const targetUrl = directVideoUrl || searchUrl;
            openTargetUrl(targetUrl, preOpenedWindow);
        } finally {
            setButtonBusy(button, false);
        }
    }

    function openTargetUrl(targetUrl, preOpenedWindow) {
        if (preOpenedWindow && !preOpenedWindow.closed) {
            preOpenedWindow.location.replace(targetUrl);
            return;
        }

        if (CONFIG.youtube.openInNewTab) {
            window.open(targetUrl, '_blank', 'noopener');
        } else {
            window.location.assign(targetUrl);
        }
    }

    function setButtonBusy(button, isBusy) {
        button.disabled = isBusy;
        if (isBusy) {
            button.dataset.originalText = button.textContent;
            button.textContent = 'Loading...';
        } else if (button.dataset.originalText) {
            button.textContent = button.dataset.originalText;
            delete button.dataset.originalText;
        }
    }

    function buildYouTubeQuery(song) {
        return `${song.artist} ${song.title} ${CONFIG.youtube.extraTerms || ''}`
            .replace(/\s+/g, ' ')
            .trim();
    }

    function buildYouTubeSearchUrl(query) {
        return `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`;
    }

    async function fetchTopYouTubeResult(searchUrl) {
        if (!canUseGmRequest()) {
            return null;
        }

        try {
            const responseText = await gmGet(searchUrl);
            const videoId = extractFirstVideoId(responseText);
            return videoId ? `https://www.youtube.com/watch?v=${videoId}` : null;
        } catch (error) {
            console.warn('[RYM Play Button] Unable to fetch first YouTube result:', error);
            return null;
        }
    }

    function extractFirstVideoId(responseText) {
        const match = responseText.match(/"videoId":"([a-zA-Z0-9_-]{11})"/);
        return match ? match[1] : null;
    }

    function gmGet(url) {
        return new Promise((resolve, reject) => {
            const details = {
                method: 'GET',
                url,
                headers: {
                    'Accept': 'text/html'
                },
                onload: (response) => resolve(response.responseText),
                onerror: reject,
                ontimeout: () => reject(new Error('Request timed out'))
            };

            if (typeof GM_xmlhttpRequest === 'function') {
                GM_xmlhttpRequest(details);
            } else if (typeof GM !== 'undefined' && typeof GM.xmlHttpRequest === 'function') {
                GM.xmlHttpRequest(details);
            } else {
                reject(new Error('GM_xmlhttpRequest is not available'));
            }
        });
    }

    function canUseGmRequest() {
        return typeof GM_xmlhttpRequest === 'function'
            || (typeof GM !== 'undefined' && typeof GM.xmlHttpRequest === 'function');
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
