// ==UserScript==
// @name         RateYourMusic Chart Song Player
// @namespace    https://github.com/dbeley/rym-userscripts
// @version      1.0.0
// @description  Adds a play button to each RYM song chart entry and tries to play the song via Navidrome (if configured) or by opening the best YouTube match.
// @author       dbeley
// @match        https://rateyourmusic.com/charts/top/song/*
// @match        https://rateyourmusic.com/charts/popular/song/*
// @match        https://rateyourmusic.com/charts/esoteric/song/*
// @match        https://rateyourmusic.com/charts/diverse/song/*
// @grant        none
// ==/UserScript==

(function () {
    'use strict';

    /**
     * User-facing configuration block.
     * Fill in the Navidrome credentials if you want local playback.
     */
    const CONFIG = {
        preferredSources: ['navidrome', 'youtube'], // Ordered fallback chain.
        navidrome: {
            enabled: false,
            baseUrl: 'http://localhost:4533', // No trailing slash.
            username: '',
            password: '', // Plain password or enc:HEX. Leave blank if token/salt provided.
            token: '', // Token generated via Subsonic token auth.
            salt: '', // Salt paired with the token.
            clientName: 'rym-playback',
            apiVersion: '1.16.1',
            maxBitRate: 0, // 0 keeps original bitrate.
            songCount: 3 // How many songs to request before picking the best match.
        },
        youtube: {
            enabled: true,
            usePipedApi: true,
            pipedInstance: 'https://piped.video',
            openInNewTab: true,
            extraTerms: 'audio'
        }
    };

    const SELECTORS = {
        chartItem: '.page_charts_section_charts_item.object_song',
        title: '.page_charts_section_charts_item_title .ui_name_locale_original, .page_charts_section_charts_item_title .ui_name_locale',
        artist: '.page_charts_section_charts_item_credited_text .ui_name_locale_original, .page_charts_section_charts_item_credited_text .ui_name_locale',
        actionTarget: '.page_charts_section_charts_top_line_title_artist'
    };

    const STATE = {
        audioElement: null,
        playbackPanel: null,
        titleEl: null,
        sourceEl: null,
        currentButton: null
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
            #rym-playback-panel {
                position: fixed;
                bottom: 1rem;
                right: 1rem;
                padding: 0.75rem 1rem;
                border-radius: 10px;
                background: rgba(15, 15, 15, 0.85);
                color: #fff;
                display: flex;
                flex-direction: column;
                gap: 0.5rem;
                box-shadow: 0 10px 25px rgba(0, 0, 0, 0.5);
                max-width: 320px;
                z-index: 9999;
            }
            #rym-playback-panel.hidden {
                display: none;
            }
            #rym-playback-panel audio {
                width: 100%;
            }
            #rym-playback-panel button {
                align-self: flex-end;
                background: none;
                border: none;
                color: inherit;
                cursor: pointer;
                font-size: 0.9rem;
            }
            #rym-playback-panel .rym-playback-title {
                font-weight: 600;
            }
            #rym-playback-panel .rym-playback-source {
                font-size: 0.75rem;
                opacity: 0.8;
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
        button.title = 'Try to play this song via Navidrome or YouTube';
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
        for (const source of CONFIG.preferredSources) {
            try {
                if (source === 'navidrome') {
                    const success = await tryNavidromePlayback(song, button);
                    if (success) {
                        setButtonBusy(button, false);
                        return;
                    }
                } else if (source === 'youtube') {
                    const success = await tryYouTubePlayback(song);
                    if (success) {
                        setButtonBusy(button, false);
                        return;
                    }
                }
            } catch (error) {
                console.warn(`Playback via ${source} failed`, error);
            }
        }

        alert('Unable to play this track with the configured sources.');
        setButtonBusy(button, false);
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

    function ensurePlaybackPanel() {
        if (STATE.playbackPanel) {
            return STATE.playbackPanel;
        }

        const panel = document.createElement('div');
        panel.id = 'rym-playback-panel';
        panel.classList.add('hidden');
        panel.innerHTML = `
            <div>
                <div class="rym-playback-title"></div>
                <div class="rym-playback-source"></div>
            </div>
            <audio controls crossorigin="anonymous"></audio>
            <button type="button" aria-label="Close player">✕</button>
        `;

        const titleEl = panel.querySelector('.rym-playback-title');
        const sourceEl = panel.querySelector('.rym-playback-source');
        const audio = panel.querySelector('audio');
        const closeButton = panel.querySelector('button');

        closeButton.addEventListener('click', () => {
            audio.pause();
            audio.removeAttribute('src');
            audio.load();
            panel.classList.add('hidden');
            if (STATE.currentButton) {
                STATE.currentButton.classList.remove('is-playing');
                STATE.currentButton = null;
            }
        });

        document.body.appendChild(panel);
        STATE.playbackPanel = panel;
        STATE.titleEl = titleEl;
        STATE.sourceEl = sourceEl;
        STATE.audioElement = audio;

        return panel;
    }

    async function tryNavidromePlayback(song, button) {
        if (!CONFIG.navidrome.enabled) {
            return false;
        }

        const authParams = buildNavidromeAuthParams(CONFIG.navidrome);
        if (!authParams) {
            console.warn('Navidrome auth parameters missing.');
            return false;
        }

        const baseUrl = CONFIG.navidrome.baseUrl.replace(/\/$/, '');
        const query = `${song.artist} ${song.title}`;
        const searchParams = new URLSearchParams({
            query,
            songCount: String(CONFIG.navidrome.songCount || 3),
            albumCount: '0',
            artistCount: '0',
            v: CONFIG.navidrome.apiVersion,
            c: CONFIG.navidrome.clientName,
            f: 'json'
        });

        const searchUrl = `${baseUrl}/rest/search3.view?${authParams}&${searchParams.toString()}`;
        const response = await fetch(searchUrl);
        if (!response.ok) {
            throw new Error(`Navidrome search failed with status ${response.status}`);
        }

        const payload = await response.json();
        const songs = payload?.['subsonic-response']?.searchResult3?.song;
        if (!Array.isArray(songs) || songs.length === 0) {
            return false;
        }

        const match = pickBestNavidromeMatch(songs, song);
        if (!match || !match.id) {
            return false;
        }

        const streamParams = new URLSearchParams({
            id: match.id,
            v: CONFIG.navidrome.apiVersion,
            c: CONFIG.navidrome.clientName,
            maxBitRate: String(CONFIG.navidrome.maxBitRate || 0)
        });

        const streamUrl = `${baseUrl}/rest/stream.view?${authParams}&${streamParams.toString()}`;
        playThroughAudioElement(streamUrl, song, `Navidrome • ${match.album || 'Unknown album'}`, button);
        return true;
    }

    function buildNavidromeAuthParams(config) {
        if (!config.username) {
            return null;
        }

        if (config.token && config.salt) {
            return `u=${encodeURIComponent(config.username)}&t=${encodeURIComponent(config.token)}&s=${encodeURIComponent(config.salt)}`;
        }

        if (config.password) {
            const encodedPassword = config.password.startsWith('enc:')
                ? config.password
                : `enc:${stringToHex(config.password)}`;
            return `u=${encodeURIComponent(config.username)}&p=${encodedPassword}`;
        }

        return null;
    }

    function stringToHex(input) {
        return Array.from(input)
            .map((char) => char.charCodeAt(0).toString(16).padStart(2, '0'))
            .join('');
    }

    function pickBestNavidromeMatch(results, targetSong) {
        if (results.length === 1) {
            return results[0];
        }

        const targetTitle = targetSong.title.toLowerCase();
        const targetArtist = targetSong.artist.toLowerCase();

        return results.reduce((best, current) => {
            const currentTitle = (current.title || '').toLowerCase();
            const currentArtist = (current.artist || '').toLowerCase();
            const titleScore = similarityScore(targetTitle, currentTitle);
            const artistScore = similarityScore(targetArtist, currentArtist);
            const totalScore = titleScore * 2 + artistScore;

            if (!best || totalScore > best.score) {
                return { score: totalScore, result: current };
            }
            return best;
        }, null)?.result || results[0];
    }

    function similarityScore(a, b) {
        if (!a || !b) {
            return 0;
        }

        if (a === b) {
            return 1;
        }

        const wordsA = new Set(a.split(/\s+/));
        const wordsB = new Set(b.split(/\s+/));
        const intersection = [...wordsA].filter((word) => wordsB.has(word));
        return intersection.length / Math.max(wordsA.size, 1);
    }

    function playThroughAudioElement(streamUrl, song, sourceLabel, button) {
        ensurePlaybackPanel();
        STATE.audioElement.src = streamUrl;
        STATE.titleEl.textContent = `${song.artist} — ${song.title}`;
        STATE.sourceEl.textContent = sourceLabel;
        STATE.playbackPanel.classList.remove('hidden');
        STATE.audioElement.play().catch((err) => {
            console.error('Unable to autoplay Navidrome stream', err);
        });

        if (STATE.currentButton) {
            STATE.currentButton.classList.remove('is-playing');
        }
        button.classList.add('is-playing');
        STATE.currentButton = button;
    }

    async function tryYouTubePlayback(song) {
        if (!CONFIG.youtube.enabled) {
            return false;
        }

        const query = `${song.artist} ${song.title} ${CONFIG.youtube.extraTerms || ''}`.trim();
        const url = await findYouTubeUrl(query);

        if (url) {
            window.open(url, CONFIG.youtube.openInNewTab ? '_blank' : '_self', 'noopener');
            return true;
        }

        // Fallback to a raw search page so the user can pick a result manually.
        const fallback = `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`;
        window.open(fallback, CONFIG.youtube.openInNewTab ? '_blank' : '_self', 'noopener');
        return true;
    }

    async function findYouTubeUrl(query) {
        if (!CONFIG.youtube.usePipedApi) {
            return null;
        }

        try {
            const instance = CONFIG.youtube.pipedInstance.replace(/\/$/, '');
            const response = await fetch(`${instance}/api/v1/search?q=${encodeURIComponent(query)}&filter=music_songs`);
            if (!response.ok) {
                throw new Error(`Piped search failed with status ${response.status}`);
            }

            const results = await response.json();
            if (!Array.isArray(results) || results.length === 0) {
                return null;
            }

            const video = results.find((entry) => entry.type === 'video' && entry.url) || results[0];
            if (!video?.url) {
                return null;
            }

            if (video.url.startsWith('http')) {
                return video.url;
            }

            // Default to YouTube watch URLs to leverage the native player.
            const videoId = new URL(`https://youtube.com${video.url}`).searchParams.get('v');
            return videoId ? `https://www.youtube.com/watch?v=${videoId}&autoplay=1` : `https://www.youtube.com${video.url}`;
        } catch (error) {
            console.warn('Unable to get YouTube video from Piped API', error);
            return null;
        }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
