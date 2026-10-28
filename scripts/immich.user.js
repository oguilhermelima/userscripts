// ==UserScript==
// @name         Immich — YouTube-Style Player, Cards & Album Sidebar
// @namespace    immich-player
// @version      2.5.0
// @author       oguilhermelima
// @description  YouTube-style video player for Immich: original quality with automatic fallback, 0.25x–5x speed, one-click audio boost, seek keys, J/K/L shortcuts, picture-in-picture and video marks (moments and intervals, pasted in bulk, stored on the server); a YouTube-style card view with title, date and duration, grouping and sorting; and an album sidebar that follows the same order. Add your own server as a user @match in your userscript manager.
// @match        https://demo.immich.app/*
// @grant        GM_addStyle
// @grant        GM_getValue
// @grant        GM_setValue
// @run-at       document-start
// @noframes
// ==/UserScript==

(function() {
    'use strict';

    // Immich is self-hosted, so this script ships matching only the public
    // demo; each user adds their own server as a user @match. As a guard
    // for broad matches, it only runs where /api/server/ping answers like
    // Immich. A confirmed origin is remembered, so later visits start at
    // document-start without asking again.
    const KNOWN_ORIGINS_KEY = 'immichOrigins';

    // Safari's Userscripts app only has the promise-based GM.* API, without
    // GM_getValue or GM_addStyle; there, settings live in localStorage and
    // styles go in a plain <style>.
    function getSetting(key, fallback) {
        try {
            if (typeof GM_getValue === 'function') return GM_getValue(key, fallback);
            const raw = localStorage.getItem(`immich-player:${key}`);
            return raw === null ? fallback : JSON.parse(raw);
        } catch {
            return fallback;
        }
    }

    function setSetting(key, value) {
        try {
            if (typeof GM_setValue === 'function') GM_setValue(key, value);
            else localStorage.setItem(`immich-player:${key}`, JSON.stringify(value));
        } catch {}
    }

    function addStyle(css) {
        if (typeof GM_addStyle === 'function') {
            GM_addStyle(css);
            return;
        }
        const style = document.createElement('style');
        style.textContent = css;
        // At document-start there may be no <html> yet.
        if (document.documentElement) {
            (document.head || document.documentElement).append(style);
            return;
        }
        new MutationObserver((_, observer) => {
            if (!document.documentElement) return;
            observer.disconnect();
            document.documentElement.append(style);
        }).observe(document, { childList: true });
    }

    function knownOrigins() {
        const list = getSetting(KNOWN_ORIGINS_KEY, []);
        return Array.isArray(list) ? list : [];
    }

    if (knownOrigins().includes(location.origin)) {
        immichPlayer();
        return;
    }
    fetch('/api/server/ping', { credentials: 'same-origin' })
        .then(response => (response.ok ? response.json() : null))
        .then(body => {
            if (body?.res !== 'pong') return;
            setSetting(KNOWN_ORIGINS_KEY, [...knownOrigins(), location.origin]);
            immichPlayer();
        })
        .catch(() => {});

    function immichPlayer() {
        // Immich 3.x renders videos through media-chrome: <media-controller> wraps a
        // plain <video slot="media"> (or <hls-video> with realtime transcoding).
        // Only the full asset viewer passes extendedControls, which is the one
        // controller that carries a settings menu button. Live photos and memories
        // do not, so they keep Immich's own behaviour.
        const VIEWER = '#immich-asset-viewer';
        const PLAYER = `${VIEWER} media-controller`;
        const NAV_ACTIONS = `${VIEWER} [data-testid="asset-viewer-navbar-actions"]`;
        const ALBUM_ASSET_RE = /^\/albums\/([0-9a-f-]{36})\/photos\/([0-9a-f-]{36})/;
        const ALBUM_PAGE_RE = /^\/albums\/([0-9a-f-]{36})(?:\/photos\/([0-9a-f-]{36}))?\/?$/;
        const HOME_PAGE_RE = /^\/photos(?:\/([0-9a-f-]{36}))?\/?$/;
        const FAVORITES_PAGE_RE = /^\/favorites(?:\/photos\/([0-9a-f-]{36}))?\/?$/;
        // The card view's page types, as their settings are named.
        const TYPE_SUFFIX = { album: 'Album', home: 'Home', favorites: 'Favorites' };
        const ORIGINAL_PREF = 'always-load-original-video';

        const RATE_MIN = 0.25;
        const RATE_MAX = 5;
        const RATE_STEP = 0.25;
        const RATE_PRESETS = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2, 2.5, 3, 4, 5];
        const BOOST_MAX = 2;
        const BOOST_STEP = 0.1;
        const SEEK_SHORT = 5;
        const SEEK_LONG = 10;
        const FRAME = 1 / 30;
        const SIDEBAR_WIDTH = 420;

        const ICONS = {
            previous: 'M6,18V6H8V18H6M9.5,12L18,6V18L9.5,12Z',
            next: 'M16,18H18V6H16M6,18L14.5,12L6,6V18Z',
            loop: 'M17,17H7V14L3,18L7,22V19H19V13H17M7,7H17V10L21,6L17,2V5H5V11H7V7Z',
            // Speaker with a bolt and sound waves, the YouTube script's
            // amplifier: drawn on a 36px grid and rotated, so it carries its
            // own viewBox.
            boost: {
                d: 'm 13,21 h 4 l -6,-3 v 2 H 7 l 6,3 z M 8.0617044,16.561704 8.9050563,17.405056 C 9.7006719,16.609441 10.790665,16.124116 12,16.124116 c 1.209335,0 2.299328,0.493281 3.094944,1.28094 l 0.843352,-0.843352 C 14.927864,15.551273 13.535538,14.930693 12,14.930693 c -1.535537,0 -2.9278644,0.62058 -3.9382956,1.631011 z M 12,24.875884 c -1.209335,0 -2.2993281,-0.493282 -3.0949437,-1.280941 L 8.0617044,24.438295 C 9.0721356,25.448727 10.464463,26.069307 12,26.069307 c 1.535538,0 2.927864,-0.62058 3.938296,-1.631012 L 15.094944,23.594943 C 14.299328,24.382602 13.209335,24.875884 12,24.875884 Z m 0,-11.451211 c 1.86174,0 3.5564,0.755834 4.781647,1.981082 L 17.625,14.562403 C 16.184936,13.122339 14.195898,12.23125 12,12.23125 c -2.1958981,0 -4.1849363,0.891089 -5.625,2.331153 l 0.8433525,0.843352 C 8.4436,14.180507 10.13826,13.424673 12,13.424673 Z m 0,15.344207 c 2.195898,0 4.184936,-0.891089 5.625,-2.331153 L 16.781647,25.594375 C 15.5564,26.819622 13.86174,27.575457 12,27.575457 c -1.86174,0 -3.5564,-0.755835 -4.7816475,-1.981082 L 6.375,26.437727 C 7.8150637,27.877791 9.8041019,28.76888 12,28.76888 Z',
                viewBox: '4.77 4.77 26.46 26.46',
                transform: 'matrix(0,-1.6,1.6,0,-14.800104,37.2)',
            },
            speed: {
                d: 'M12,16A3,3 0 0,1 9,13C9,11.88 9.61,10.9 10.5,10.39L20.21,4.77L14.68,14.35C14.18,15.33 13.17,16 12,16M12,3C13.81,3 15.5,3.5 16.97,4.32L14.87,5.53C14,5.19 13,5 12,5A8,8 0 0,0 4,13C4,15.21 4.89,17.21 6.34,18.65H6.35C6.74,19.04 6.74,19.67 6.35,20.06C5.96,20.45 5.32,20.45 4.93,20.07V20.07C3.12,18.26 2,15.76 2,13A10,10 0 0,1 12,3M22,13C22,15.76 20.88,18.26 19.07,20.07V20.07C18.68,20.45 18.05,20.45 17.66,20.06C17.27,19.67 17.27,19.04 17.66,18.65V18.65C19.11,17.2 20,15.21 20,13C20,12 19.81,11 19.46,10.1L20.67,8C21.5,9.5 22,11.18 22,13Z',
                viewBox: '1 1 22 22',
            },
            pip: 'M19,11H11V17H19V11M23,19V5C23,3.88 22.1,3 21,3H3A2,2 0 0,0 1,5V19A2,2 0 0,0 3,21H21A2,2 0 0,0 23,19M21,19H3V4.97H21V19Z',
            sidebar: 'M3,4H21A1,1 0 0,1 22,5V19A1,1 0 0,1 21,20H3A1,1 0 0,1 2,19V5A1,1 0 0,1 3,4M4,6V18H14V6H4M16,6V18H20V6H16Z',
            heart: 'M12,21.35L10.55,20.03C5.4,15.36 2,12.27 2,8.5C2,5.41 4.42,3 7.5,3C9.24,3 10.91,3.81 12,5.08C13.09,3.81 14.76,3 16.5,3C19.58,3 22,5.41 22,8.5C22,12.27 18.6,15.36 13.45,20.03L12,21.35Z',
            play: 'M8,5.14V19.14L19,12.14L8,5.14Z',
            pause: 'M14,19H18V5H14M6,19H10V5H6V19Z',
            check: 'M21,7L9,19L3.5,13.5L4.91,12.09L9,16.17L19.59,5.59L21,7Z',
            back: 'M20,11V13H8L13.5,18.5L12.08,19.92L4.16,12L12.08,4.08L13.5,5.5L8,11H20Z',
            bookmarkPlus: 'M17,18L12,15.82L7,18V5H12V3H7A2,2 0 0,0 5,5V21L12,18L19,21V11H17M21,7H19V9H17V7H15V5H17V3H19V5H21V7Z',
            bookmarks: 'M15,7V21L10,18.5L5,21V7A2,2 0 0,1 7,5H13A2,2 0 0,1 15,7M13,7H7V17.97L10,16.47L13,17.97V7M17,3H9A2,2 0 0,1 11,1H17A2,2 0 0,1 19,3V17L17,16V3Z',
            chevronDown: 'M7.41,8.58L12,13.17L16.59,8.58L18,10L12,16L6,10L7.41,8.58Z',
            dots: 'M12,16A2,2 0 0,1 14,18A2,2 0 0,1 12,20A2,2 0 0,1 10,18A2,2 0 0,1 12,16M12,10A2,2 0 0,1 14,12A2,2 0 0,1 12,14A2,2 0 0,1 10,12A2,2 0 0,1 12,10M12,4A2,2 0 0,1 14,6A2,2 0 0,1 12,8A2,2 0 0,1 10,6A2,2 0 0,1 12,4Z',
            grid: 'M3,11H11V3H3M3,21H11V13H3M13,21H21V13H13M13,3V11H21V3',
            gridSmall: 'M3,9H7V5H3V9M3,14H7V10H3V14M8,14H12V10H8V14M13,14H17V10H13V14M8,9H12V5H8V9M13,5V9H17V5H13M18,14H22V10H18V14M3,19H7V15H3V19M8,19H12V15H8V19M13,19H17V15H13V19M18,19H22V15H18V19M18,5V9H22V5H18Z',
            groupBy: 'M3,4H21V8H3V4M3,10H21V14H3V10M3,16H21V20H3V16Z',
            sortBy: 'M18,21L14,17H17V7H14L18,3L22,7H19V17H22M2,19V17H12V19M2,13V11H9V13M2,7V5H6V7H2Z',
            pencil: 'M20.71,7.04C21.1,6.65 21.1,6 20.71,5.63L18.37,3.29C18,2.9 17.35,2.9 16.96,3.29L15.12,5.12L18.87,8.87M3,17.25V21H6.75L17.81,9.93L14.06,6.18L3,17.25Z',
            download: 'M5,20H19V18H5M19,9H15V3H9V9H5L12,16L19,9Z',
            trash: 'M19,4H15.5L14.5,3H9.5L8.5,4H5V6H19M6,19A2,2 0 0,0 8,21H16A2,2 0 0,0 18,19V7H6V19Z',
            archive: 'M3,3H21V7H3V3M4,8H20V21H4V8M9.5,11A0.5,0.5 0 0,0 9,11.5V13H15V11.5A0.5,0.5 0 0,0 14.5,11H9.5Z',
            albumAdd: 'M13 19C13 19.7 13.13 20.37 13.35 21H5C3.9 21 3 20.11 3 19V5C3 3.9 3.9 3 5 3H19C20.11 3 21 3.9 21 5V13.35C20.37 13.13 19.7 13 19 13V5H5V19H13M13.96 12.29L11.21 15.83L9.25 13.47L6.5 17H13.35C13.75 15.88 14.47 14.91 15.4 14.21L13.96 12.29M20 18V15H18V18H15V20H18V23H20V20H23V18H20Z',
            albumRemove: 'M17,13H7V11H17M12,2A10,10 0 0,0 2,12A10,10 0 0,0 12,22A10,10 0 0,0 22,12A10,10 0 0,0 12,2Z',
            heartOutline: 'M12.1,18.55L12,18.65L11.89,18.55C7.14,14.24 4,11.39 4,8.5C4,6.5 5.5,5 7.5,5C9.04,5 10.54,6 11.07,7.36H12.93C13.46,6 14.96,5 16.5,5C18.5,5 20,6.5 20,8.5C20,11.39 16.86,14.24 12.1,18.55M16.5,3C14.76,3 13.09,3.81 12,5.08C10.91,3.81 9.24,3 7.5,3C4.42,3 2,5.41 2,8.5C2,12.27 5.4,15.36 10.55,20.03L12,21.35L13.45,20.03C18.6,15.36 22,12.27 22,8.5C22,5.41 19.58,3 16.5,3Z',
            close: 'M19,6.41L17.59,5L12,10.59L6.41,5L5,6.41L10.59,12L5,17.59L6.41,19L12,13.41L17.59,19L19,17.59L13.41,12L19,6.41Z',
            cover: 'M21,17H7V3H21M21,1H7A2,2 0 0,0 5,3V17A2,2 0 0,0 7,19H21A2,2 0 0,0 23,17V3A2,2 0 0,0 21,1M3,5H1V21A2,2 0 0,0 3,23H19V21H3M15.96,10.29L13.21,13.83L11.25,11.47L8.5,15H19.5L15.96,10.29Z',
            folderCog: 'M4,4C2.89,4 2,4.89 2,6V18A2,2 0 0,0 4,20H12.1C12.04,19.67 12,19.34 12,19A7,7 0 0,1 19,12C20.06,12 21.07,12.24 22,12.67V8C22,6.89 21.1,6 20,6H12L10,4H4M18,14C17.87,14 17.76,14.09 17.74,14.21L17.55,15.53C17.25,15.66 16.96,15.82 16.7,16L15.46,15.5C15.35,15.5 15.22,15.5 15.15,15.63L14.15,17.36C14.09,17.47 14.11,17.6 14.21,17.68L15.27,18.5C15.25,18.67 15.24,18.83 15.24,19C15.24,19.17 15.25,19.33 15.27,19.5L14.21,20.32C14.12,20.4 14.09,20.53 14.15,20.64L15.15,22.37C15.21,22.5 15.34,22.5 15.46,22.5L16.7,22C16.96,22.18 17.24,22.35 17.55,22.47L17.74,23.79C17.76,23.91 17.86,24 18,24H20C20.11,24 20.22,23.91 20.24,23.79L20.43,22.47C20.73,22.34 21,22.18 21.27,22L22.5,22.5C22.63,22.5 22.76,22.5 22.83,22.37L23.83,20.64C23.89,20.53 23.86,20.4 23.77,20.32L22.7,19.5C22.72,19.33 22.74,19.17 22.74,19C22.74,18.83 22.73,18.67 22.7,18.5L23.76,17.68C23.85,17.6 23.88,17.47 23.82,17.36L22.82,15.63C22.76,15.5 22.63,15.5 22.5,15.5L21.27,16C21,15.82 20.73,15.65 20.42,15.53L20.23,14.21C20.22,14.09 20.11,14 20,14M19,17.5C19.83,17.5 20.5,18.17 20.5,19C20.5,19.83 19.83,20.5 19,20.5C18.16,20.5 17.5,19.83 17.5,19C17.5,18.17 18.17,17.5 19,17.5Z',
            search: 'M9.5,3A6.5,6.5 0 0,1 16,9.5C16,11.11 15.41,12.59 14.44,13.73L14.71,14H15.5L20.5,19L19,20.5L14,15.5V14.71L13.73,14.44C12.59,15.41 11.11,16 9.5,16A6.5,6.5 0 0,1 3,9.5A6.5,6.5 0 0,1 9.5,3M9.5,5C7,5 5,7 5,9.5C5,12 7,14 9.5,14C12,14 14,12 14,9.5C14,7 12,5 9.5,5Z',
            filter: 'M14,12V19.88C14.04,20.18 13.94,20.5 13.71,20.71C13.32,21.1 12.69,21.1 12.3,20.71L10.29,18.7C10.06,18.47 9.96,18.16 10,17.87V12H9.97L4.21,4.62C3.87,4.19 3.95,3.56 4.38,3.22C4.57,3.08 4.78,3 5,3H19C19.22,3 19.43,3.08 19.62,3.22C20.05,3.56 20.13,4.19 19.79,4.62L14.03,12H14Z',
            plus: 'M19,13H13V19H11V13H5V11H11V5H13V11H19V13Z',
            menu: 'M3,6H21V8H3V6M3,11H21V13H3V11M3,16H21V18H3V16Z',
            tune: 'M3,17V19H9V17H3M3,5V7H13V5H3M13,21V19H21V17H13V15H11V21H13M7,9V11H3V13H7V15H9V9H7M21,13V11H11V13H21M15,9H17V7H21V5H17V3H15V9Z',
            info: 'M11,9H13V7H11M12,20C7.59,20 4,16.41 4,12C4,7.59 7.59,4 12,4C16.41,4 20,7.59 20,12C20,16.41 16.41,20 12,20M12,2A10,10 0 0,0 2,12A10,10 0 0,0 12,22A10,10 0 0,0 22,12A10,10 0 0,0 12,2M11,17H13V11H11V17Z',
            cog: 'M12,15.5A3.5,3.5 0 0,1 8.5,12A3.5,3.5 0 0,1 12,8.5A3.5,3.5 0 0,1 15.5,12A3.5,3.5 0 0,1 12,15.5M19.43,12.97C19.47,12.65 19.5,12.33 19.5,12C19.5,11.67 19.47,11.34 19.43,11L21.54,9.37C21.73,9.22 21.78,8.95 21.66,8.73L19.66,5.27C19.54,5.05 19.27,4.96 19.05,5.05L16.56,6.05C16.04,5.66 15.5,5.32 14.87,5.07L14.5,2.42C14.46,2.18 14.25,2 14,2H10C9.75,2 9.54,2.18 9.5,2.42L9.13,5.07C8.5,5.32 7.96,5.66 7.44,6.05L4.95,5.05C4.73,4.96 4.46,5.05 4.34,5.27L2.34,8.73C2.21,8.95 2.27,9.22 2.46,9.37L4.57,11C4.53,11.34 4.5,11.67 4.5,12C4.5,12.33 4.53,12.65 4.57,12.97L2.46,14.63C2.27,14.78 2.21,15.05 2.34,15.27L4.34,18.73C4.46,18.95 4.73,19.03 4.95,18.95L7.44,17.94C7.96,18.34 8.5,18.68 9.13,18.93L9.5,21.58C9.54,21.82 9.75,22 10,22H14C14.25,22 14.46,21.82 14.5,21.58L14.87,18.93C15.5,18.67 16.04,18.34 16.56,17.94L19.05,18.95C19.27,19.03 19.54,18.95 19.66,18.73L21.66,15.27C21.78,15.05 21.73,14.78 21.54,14.63L19.43,12.97Z',
            cards: 'M20,20H4A2,2 0 0,1 2,18V6A2,2 0 0,1 4,4H20A2,2 0 0,1 22,6V18A2,2 0 0,1 20,20M4,6V18H20V6H4M6,9H18V11H6V9M6,13H16V15H6V13Z',
        };

        // An icon is a 24px path, or { d, viewBox, transform } for one drawn
        // on another grid.
        function icon(path, size = 24, label = '') {
            const { d, viewBox = '0 0 24 24', transform = '' } = typeof path === 'object' ? path : { d: path };
            const text = label ? `<text x="12" y="21.5" fill="currentColor" font-size="10" font-weight="700" text-anchor="middle" font-family="system-ui, sans-serif">${label}</text>` : '';
            return `<svg width="${size}" height="${size}" viewBox="${viewBox}" aria-hidden="true"><path fill="currentColor" d="${d}"${transform ? ` transform="${transform}"` : ''}/>${text}</svg>`;
        }

        // Before 2.3 an album's "Grade" turned the card view off for Immich's
        // own grid; albums now always use the card view, and that choice
        // becomes its grid layout, once.
        if (getSetting('cardsLayoutAlbum', null) === null && !getSetting('cardsAlbum', true)) {
            setSetting('cardsLayoutAlbum', 'grid');
        }
        // Before 2.5 the timeline opened in Immich's grid, without the bar;
        // it now opens in ours, as a grid, once.
        if (!getSetting('cardsHomeMigrated', false)) {
            setSetting('cardsHomeMigrated', true);
            setSetting('cardsHome', true);
            setSetting('cardsLayoutHome', 'grid');
        }

        const state = {
            rate: clampRate(Number(getSetting('rate', 1)) || 1),
            boost: clampBoost(Number(getSetting('boost', 1)) || 1),
            // Immich loops videos by default. Loop and autoplay exclude each
            // other: a looping video never ends, so autoplay would never fire.
            loop: Boolean(getSetting('loop', true)),
            autoplay: Boolean(getSetting('autoplay', false)) && !getSetting('loop', true),
            sidebarOpen: Boolean(getSetting('sidebarOpen', true)),
            filter: getSetting('sidebarFilter', 'all'),
            // Card view per page type, on by default everywhere.
            cardViews: {
                // Albums always: their header and bar belong to every layout.
                album: true,
                home: Boolean(getSetting('cardsHome', true)),
                favorites: Boolean(getSetting('cardsFavorites', true)),
            },
            // How our view lays items out, per page type: cards with titles,
            // or a plain thumbnail grid.
            cardLayouts: {
                album: getSetting('cardsLayoutAlbum', 'cards') === 'grid' ? 'grid' : 'cards',
                home: getSetting('cardsLayoutHome', 'grid') === 'cards' ? 'cards' : 'grid',
                favorites: getSetting('cardsLayoutFavorites', 'grid') === 'cards' ? 'cards' : 'grid',
            },
            // Group and order of the open card view, read per page type
            // when it opens (see CARD_ORDER_DEFAULTS).
            cardGroup: 'month',
            cardSort: 'date-desc',
            albums: new Map(),
            renderedAlbum: null,
        };

        // Choices from the settings dialog.
        const COVER_SIZES = { small: 'Pequenas', medium: 'Médias', large: 'Grandes' };
        const NAV_ALBUM_MAX = 8;
        const prefs = {
            resume: Boolean(getSetting('resume', true)),
            touchGestures: Boolean(getSetting('touchGestures', true)),
            seekPreview: Boolean(getSetting('seekPreview', true)),
            albumNav: Boolean(getSetting('albumNav', false)),
            albumCovers: COVER_SIZES[getSetting('albumCovers', 'small')] ? getSetting('albumCovers', 'small') : 'small',
            pinnedAlbums: [].concat(getSetting('pinnedAlbums', []) ?? []).filter(id => typeof id === 'string').slice(0, NAV_ALBUM_MAX),
        };

        function clampRate(value) {
            return Math.min(RATE_MAX, Math.max(RATE_MIN, Math.round(value * 100) / 100));
        }

        function formatRate(value) {
            return `${Number(value.toFixed(2))}x`;
        }

        function clampBoost(value) {
            return Math.min(BOOST_MAX, Math.max(1, Math.round(value * 100) / 100));
        }

        function formatBoost(value) {
            return value > 1 ? `+${Math.round((value - 1) * 100)}%` : 'Normal';
        }

        // ---------------------------------------------------------------------
        //  Best quality: Immich's own "always load original video" preference.
        //  Set it once, before the app boots, so the player requests /original
        //  instead of the transcoded /video/playback. Turning it off in Immich's
        //  settings afterwards is respected, because only a missing key is set.
        // ---------------------------------------------------------------------
        try {
            if (localStorage.getItem(ORIGINAL_PREF) === null) localStorage.setItem(ORIGINAL_PREF, 'true');
        } catch {}

        const transcodedUrl = src => src.replace(/\/original(\?|$)/, '/video/playback$1').replace(/([?&])size=original&?/, '$1');

        // An original the browser cannot decode (some HEVC/ProRes files) falls
        // back to the transcoded stream instead of showing an error.
        document.addEventListener('error', event => {
            const video = event.target;
            if (!(video instanceof HTMLVideoElement) || !video.closest(VIEWER)) return;
            const src = video.getAttribute('src') || '';
            if (!src.includes('/original')) return;
            const time = video.currentTime;
            video.setAttribute('src', transcodedUrl(src));
            video.addEventListener('loadedmetadata', () => { video.currentTime = time; }, { once: true });
            video.load();
            showHud('Original não suportado — usando transcodificado');
        }, true);

        // ---------------------------------------------------------------------
        //  Styles
        // ---------------------------------------------------------------------
        addStyle(`
            :root {
                --iv-bg: #0f0f10;
                --iv-page-bg: #000000;
                --iv-surface: #1c1c1f;
                --iv-surface-hover: #2a2a2e;
                --iv-border: rgba(255, 255, 255, 0.08);
                --iv-text: #f1f1f1;
                --iv-muted: #a1a1aa;
                --iv-accent: #adcbfa;
                --iv-accent-text: #0f172a;
                --iv-menu-bg: rgba(28, 28, 31, 0.98);
                --iv-danger: #f87171;
                --iv-sidebar-w: ${SIDEBAR_WIDTH}px;
            }

            /* Menus and the sidebar follow Immich's theme (html.dark / html.light);
               controls drawn over the video stay dark. */
            html:not(.dark) .iv-menu,
            html:not(.dark) .iv-popup,
            html:not(.dark) #iv-marks-page,
            html:not(.dark) .iv-modal,
            html:not(.dark) .iv-albums-bar,
            html:not(.dark) .iv-native-bar,
            html:not(.dark) .iv-native-chip,
            html:not(.dark).iv-sharing-page main,
            html:not(.dark) #iv-sidebar,
            html:not(.dark) #iv-cards,
            html:not(.dark) .iv-cards-toggle {
                --iv-bg: #ffffff;
                --iv-page-bg: #ffffff;
                --iv-surface: #f1f5f9;
                --iv-surface-hover: #e2e8f0;
                --iv-border: rgba(15, 23, 42, 0.12);
                --iv-text: #0f172a;
                --iv-muted: #64748b;
                --iv-accent: #4250af;
                --iv-accent-text: #ffffff;
                --iv-menu-bg: #ffffff;
                --iv-danger: #dc2626;
            }

            html.iv-sidebar-open ${VIEWER} {
                width: calc(100% - var(--iv-sidebar-w)) !important;
            }

            /* Top bar: every action lives in the "More" menu, except Back and the
               sidebar toggle. Only collapsed once the menu items are mirrored. */
            ${NAV_ACTIONS}.iv-nav-collapsed > button:not(.iv-nav-sidebar) {
                display: none !important;
            }
            .iv-nav-sidebar {
                display: none;
                place-items: center;
                width: 40px;
                height: 40px;
                border: 0;
                border-radius: 999px;
                background: transparent;
                color: #fff;
                cursor: pointer;
            }
            .iv-nav-sidebar:hover { background: rgba(255, 255, 255, 0.12); }
            html.iv-album-viewer .iv-nav-sidebar { display: grid; }
            html.iv-sidebar-open .iv-nav-sidebar { color: var(--iv-accent); }

            .iv-menu,
            .iv-submenu {
                min-width: 240px;
                padding: 6px;
                border: 1px solid var(--iv-border);
                border-radius: 12px;
                background: var(--iv-menu-bg);
                color: var(--iv-text);
                box-shadow: 0 12px 32px rgba(0, 0, 0, 0.5);
                font: 14px/1.3 system-ui, sans-serif;
            }
            /* No overflow clipping here: submenus are positioned outside the box. */
            .iv-menu {
                position: fixed;
                z-index: 2147483002;
            }
            .iv-menu-entry {
                display: flex;
                align-items: center;
                gap: 12px;
                width: 100%;
                padding: 9px 12px;
                border: 0;
                border-radius: 8px;
                background: transparent;
                color: inherit;
                font: inherit;
                text-align: start;
                white-space: nowrap;
                cursor: pointer;
            }
            .iv-menu-entry svg { flex-shrink: 0; fill: currentColor; }
            .iv-menu-entry:hover,
            .iv-menu-entry:focus-visible,
            .iv-menu-group.is-open > .iv-menu-entry {
                background: var(--iv-surface-hover);
                outline: none;
            }
            .iv-menu-entry.is-danger { color: var(--iv-danger); }
            .iv-menu-entry.is-danger:hover,
            .iv-menu-entry.is-danger:focus-visible { background: color-mix(in srgb, var(--iv-danger) 14%, transparent); }
            /* The chevron sits on the left because submenus open leftwards: the
               menu is anchored to the right edge of the top bar. */
            .iv-menu-group > .iv-menu-entry > svg:first-child { margin-left: -4px; color: var(--iv-muted); }
            .iv-menu-group { position: relative; }
            .iv-submenu {
                position: absolute;
                top: -6px;
                right: calc(100% - 2px);
                display: none;
            }
            .iv-menu-group.is-open > .iv-submenu { display: block; }
            .iv-menu-divider {
                margin: 6px 4px;
                border: 0;
                border-top: 1px solid var(--iv-border);
            }

            /* Bottom bar, laid out like YouTube's: bare icons on one row.
               Left: loop, previous, play, next, volume, audio boost, time.
               Right: mark, marks, autoplay, speed, picture-in-picture,
               fullscreen.
               media-control-bar is a flex host and slotted children are its
               flex items, so order applies. */
            ${PLAYER} media-control-bar {
                gap: 4px !important;
                align-items: center;
                height: 44px !important;
            }
            ${PLAYER} media-control-bar > .iv-loop { order: 1; }
            ${PLAYER} media-control-bar > .iv-previous { order: 2; }
            ${PLAYER} media-control-bar > media-play-button { order: 3; }
            ${PLAYER} media-control-bar > .iv-next { order: 4; }
            ${PLAYER} media-control-bar > .volume-wrapper { order: 5; }
            ${PLAYER} media-control-bar > .iv-boost { order: 6; }
            ${PLAYER} media-control-bar > media-time-display { order: 7; }
            ${PLAYER} media-control-bar > .grow { order: 8; }
            ${PLAYER} media-control-bar > .iv-mark-add { order: 9; }
            ${PLAYER} media-control-bar > .iv-marks { order: 10; }
            ${PLAYER} media-control-bar > .iv-autoplay { order: 11; }
            ${PLAYER} media-control-bar > .iv-dial-rate { order: 12; }
            ${PLAYER} media-control-bar > .iv-pip { order: 13; }
            ${PLAYER} media-control-bar > media-fullscreen-button { order: 14; }

            ${PLAYER} media-control-bar > :is(media-play-button, media-fullscreen-button) {
                display: grid !important;
                place-items: center;
                width: 44px;
                height: 40px;
                padding: 0 !important;
                border-radius: 999px;
                --media-icon-color: #fff;
                --media-control-background: transparent;
                --media-control-hover-background: rgba(255, 255, 255, 0.12);
                --media-button-icon-width: 26px;
                --media-button-icon-height: 26px;
            }
            ${PLAYER} media-control-bar > media-time-display {
                margin-left: 8px;
                padding: 0 !important;
                background: transparent !important;
                color: #fff;
                font: 500 14px/40px system-ui, sans-serif;
                --media-control-background: transparent;
                --media-control-hover-background: transparent;
            }
            ${PLAYER} media-control-bar > .volume-wrapper,
            ${PLAYER} media-control-bar > .volume-wrapper:hover { background: transparent !important; }
            /* Volume slider: Immich opens it on hover; white like YouTube's,
               and as tall as the row, or its track has no height. */
            ${PLAYER} media-control-bar > .volume-wrapper > media-volume-range {
                height: 40px !important;
                --media-range-track-height: 3px;
                --media-range-track-border-radius: 999px;
                --media-range-track-background: rgba(255, 255, 255, 0.3);
                --media-range-bar-color: #fff;
                --media-range-thumb-background: #fff;
                --media-range-thumb-width: 12px;
                --media-range-thumb-height: 12px;
                --media-range-thumb-border-radius: 999px;
                --media-range-thumb-opacity: 1;
                --media-control-background: transparent;
                --media-control-hover-background: transparent;
            }
            ${PLAYER} media-control-bar > .volume-wrapper > media-mute-button {
                --media-icon-color: #fff;
                --media-control-background: transparent;
                --media-control-hover-background: transparent;
            }

            /* Progress bar above the buttons, YouTube style: thin, its dot
               always there, thicker on hover; in Immich's primary colour. */
            ${PLAYER} div:has(> immich-time-range) {
                height: auto !important;
                padding: 48px 16px 12px !important;
            }
            ${PLAYER} div:has(> immich-time-range) > media-control-bar { order: 2; }
            ${PLAYER} div:has(> immich-time-range) > immich-time-range {
                order: 1;
                height: 20px !important;
                margin-bottom: 4px;
                padding-bottom: 0 !important;
                --media-range-track-height: 3px;
                --media-range-track-border-radius: 999px;
                --media-range-track-background: rgba(255, 255, 255, 0.22);
                --media-time-range-buffered-color: rgba(255, 255, 255, 0.4);
                --iv-progress: var(--immich-ui-primary-500, #4250af);
                --media-range-bar-color: var(--iv-progress);
                --media-range-thumb-background: var(--iv-progress);
                --media-range-thumb-width: 13px;
                --media-range-thumb-height: 13px;
                --media-range-thumb-border-radius: 999px;
                --media-range-thumb-opacity: 1;
                --media-range-thumb-transition: opacity 0.12s ease, transform 0.12s ease;
                --media-control-hover-background: transparent;
                --media-control-background: transparent;
            }
            ${PLAYER} div:has(> immich-time-range) > immich-time-range:hover {
                --media-range-track-height: 6px;
                --media-range-thumb-width: 16px;
                --media-range-thumb-height: 16px;
            }

            /* Immich sizes the controller to the video's aspect ratio, which
               squeezes the control bar on portrait videos. Fill the viewer and
               let the video letterbox inside instead. */
            ${PLAYER} {
                width: 100% !important;
                aspect-ratio: auto !important;
            }
            ${PLAYER} [slot="media"] { width: 100%; }

            /* Mute first, slider growing to the right. */
            ${PLAYER} .volume-wrapper {
                display: flex;
                flex-direction: row-reverse;
                align-items: center;
            }
            ${PLAYER} .volume-wrapper > media-volume-range { margin-left: 0 !important; }
            ${PLAYER} media-control-bar > media-settings-menu-button,
            ${PLAYER} media-settings-menu { display: none !important; }

            .iv-control {
                display: grid;
                place-items: center;
                flex-shrink: 0;
                width: 40px;
                height: 40px;
                padding: 0;
                border: 0;
                border-radius: 999px;
                background: transparent;
                color: #fff;
                cursor: pointer;
            }
            .iv-control:hover:not(:disabled) { background: rgba(255, 255, 255, 0.12); }
            .iv-control:disabled { opacity: 0.35; cursor: default; }
            /* On is an "ON" badge over the same glyph, as in the YouTube
               script, in Immich's primary colour. */
            .iv-control,
            .iv-dial-button { position: relative; }
            .iv-badge {
                position: absolute;
                top: 3px;
                right: 2px;
                padding: 2px 3px;
                border-radius: 2px;
                background: var(--immich-ui-primary-500, var(--iv-accent));
                color: var(--iv-accent-text);
                font: 700 9px/1 system-ui, sans-serif !important;
                letter-spacing: 0.02em;
                pointer-events: none;
            }
            .iv-badge:empty,
            .iv-control:not(.is-active) > .iv-badge.is-on { display: none; }

            /* Autoplay switch, YouTube style: a slim track, its knob showing
               pause while off and play while on. */
            .iv-autoplay { width: 52px; }
            .iv-autoplay-track {
                position: relative;
                width: 34px;
                height: 12px;
                border-radius: 999px;
                background: rgba(255, 255, 255, 0.28);
                transition: background 0.2s ease;
            }
            .iv-autoplay-thumb {
                position: absolute;
                top: 50%;
                left: -2px;
                display: grid;
                place-items: center;
                width: 18px;
                height: 18px;
                border-radius: 999px;
                background: #e4e4e7;
                color: #18181b;
                box-shadow: 0 1px 3px rgba(0, 0, 0, 0.45);
                transform: translateY(-50%);
                transition: left 0.2s ease, background 0.2s ease;
            }
            .iv-autoplay-thumb svg { grid-area: 1 / 1; width: 10px !important; height: 10px !important; }
            .iv-autoplay-thumb .iv-autoplay-on,
            .iv-autoplay.is-active .iv-autoplay-off { display: none; }
            .iv-autoplay.is-active .iv-autoplay-on { display: block; }
            .iv-autoplay.is-active .iv-autoplay-track {
                background: color-mix(in srgb, var(--immich-ui-primary-500, #4250af) 70%, transparent);
            }
            .iv-autoplay.is-active .iv-autoplay-thumb { left: 18px; background: #fff; }
            .iv-control svg { width: 24px; height: 24px; }

            .iv-dial {
                position: relative;
                display: flex;
                align-items: center;
                flex-shrink: 0;
            }
            .iv-dial-button {
                display: grid;
                place-items: center;
                width: 40px;
                height: 40px;
                padding: 0;
                border: 0;
                border-radius: 999px;
                background: transparent;
                color: #fff;
                cursor: pointer;
            }
            .iv-dial-button svg { width: 24px; height: 24px; }
            .iv-dial-button:hover,
            .iv-dial.is-open .iv-dial-button {
                background: rgba(255, 255, 255, 0.12);
            }
            .iv-dial-popover {
                position: absolute;
                bottom: calc(100% + 10px);
                left: 50%;
                z-index: 10;
                display: none;
                width: 272px;
                padding: 14px;
                border: 1px solid var(--iv-border);
                border-radius: 14px;
                background: rgba(28, 28, 31, 0.96);
                color: var(--iv-text);
                box-shadow: 0 12px 32px rgba(0, 0, 0, 0.5);
                transform: translateX(-50%);
                font: 13px/1.3 system-ui, sans-serif;
            }
            .iv-dial.is-open .iv-dial-popover { display: block; }
            .iv-dial-head {
                display: flex;
                justify-content: space-between;
                align-items: baseline;
                gap: 8px;
            }
            .iv-dial-title { color: var(--iv-muted); font-size: 12px; font-weight: 600; }
            .iv-dial-hint { color: var(--iv-muted); font-size: 11px; }
            .iv-dial-value { margin: 4px 0 8px; font-size: 20px; font-weight: 700; }
            .iv-dial-range {
                width: 100%;
                margin: 0 0 12px;
                accent-color: var(--iv-accent);
            }
            .iv-dial-presets {
                display: grid;
                grid-template-columns: repeat(4, 1fr);
                gap: 6px;
            }
            .iv-dial-presets button {
                height: 30px;
                border: 0;
                border-radius: 8px;
                background: var(--iv-surface-hover);
                color: var(--iv-text);
                font: 600 12px/1 system-ui, sans-serif;
                cursor: pointer;
            }
            .iv-dial-presets button:hover { background: #3a3a40; }
            .iv-dial-presets button.is-active {
                background: var(--iv-accent);
                color: var(--iv-accent-text);
            }

            /* Marks: list popover in the dial style, ticks on the progress bar. */
            .iv-marks-popover { width: 380px; max-width: calc(100vw - 24px); }
            .iv-mark-list {
                max-height: min(45vh, 320px);
                margin: 10px -6px 8px;
                padding: 0;
                overflow-y: auto;
                list-style: none;
            }
            .iv-mark-row {
                display: flex;
                align-items: center;
                gap: 8px;
                padding: 4px 6px;
                border-radius: 8px;
                cursor: pointer;
            }
            .iv-mark-row:hover { background: var(--iv-surface-hover); }
            .iv-mark-row.is-current { background: color-mix(in srgb, var(--iv-accent) 22%, transparent); }
            .iv-mark-play {
                display: grid;
                flex-shrink: 0;
                place-items: center;
                width: 14px;
                color: var(--iv-muted);
            }
            .iv-mark-row:hover .iv-mark-play,
            .iv-mark-row.is-current .iv-mark-play { color: var(--iv-accent); }
            /* The time chip is a field: click to edit, Enter to apply. */
            .iv-mark-time {
                flex-shrink: 0;
                width: 72px;
                height: 26px;
                padding: 0 6px;
                border: 1px solid transparent;
                border-radius: 6px;
                background: rgba(255, 255, 255, 0.1);
                color: var(--iv-accent);
                font: 600 12px/1 ui-monospace, monospace;
                text-align: center;
                cursor: text;
            }
            /* With any interval listed, every time chip takes its width so
               the names stay in one column. */
            .iv-mark-list.has-range .iv-mark-time { width: 112px; }
            .iv-mark-time:hover { border-color: var(--iv-border); }
            .iv-mark-time:focus { border-color: var(--iv-accent); background: rgba(0, 0, 0, 0.3); outline: none; }
            .iv-mark-time::placeholder { color: var(--iv-muted); font-weight: 500; }
            .iv-marks-new { display: flex; gap: 8px; }
            .iv-marks-new .iv-mark-time { width: 150px; height: 34px; border-radius: 8px; }
            .iv-marks-new .iv-marks-add { flex: 1; }
            .iv-mark-label {
                flex: 1;
                min-width: 0;
                height: 28px;
                padding: 0 8px;
                border: 1px solid transparent;
                border-radius: 6px;
                background: transparent;
                color: var(--iv-text);
                font: 13px/1 system-ui, sans-serif;
            }
            .iv-mark-label:hover { border-color: var(--iv-border); }
            .iv-mark-label:focus { border-color: var(--iv-accent); background: rgba(0, 0, 0, 0.3); outline: none; }
            .iv-mark-label::placeholder { color: var(--iv-muted); }
            .iv-mark-remove {
                flex-shrink: 0;
                width: 26px;
                height: 26px;
                border: 0;
                border-radius: 999px;
                background: transparent;
                color: var(--iv-muted);
                font-size: 18px;
                line-height: 1;
                cursor: pointer;
                opacity: 0;
            }
            .iv-mark-row:hover .iv-mark-remove,
            .iv-mark-remove:focus-visible { opacity: 1; }
            .iv-mark-remove:hover { background: rgba(255, 255, 255, 0.12); color: var(--iv-danger); }
            .iv-marks-empty { margin: 10px 0; color: var(--iv-muted); font-size: 13px; }
            .iv-marks-empty[hidden] { display: none; }
            .iv-marks-add {
                display: flex;
                align-items: center;
                justify-content: center;
                gap: 6px;
                width: 100%;
                height: 34px;
                border: 0;
                border-radius: 8px;
                background: var(--iv-accent);
                color: var(--iv-accent-text);
                font: 600 13px/1 system-ui, sans-serif;
                cursor: pointer;
            }
            .iv-marks-add:hover { filter: brightness(1.08); }
            ${PLAYER} div:has(> immich-time-range) { position: relative; }
            .iv-preview {
                position: absolute;
                left: 0;
                z-index: 3;
                display: flex;
                flex-direction: column;
                align-items: center;
                gap: 4px;
                pointer-events: none;
                will-change: transform;
            }
            .iv-preview[hidden] { display: none; }
            /* Our preview shows the time; media-chrome's own box would repeat it. */
            ${PLAYER} immich-time-range::part(preview-box),
            ${PLAYER} immich-time-range::part(arrow) { display: none; }
            .iv-preview-frame {
                display: block;
                border: 2px solid #fff;
                border-radius: 8px;
                background: #000;
                box-shadow: 0 4px 16px rgba(0, 0, 0, 0.5);
            }
            .iv-preview-frame:not(.is-ready) { visibility: hidden; }
            .iv-preview-label,
            .iv-preview-time {
                max-width: 100%;
                overflow: hidden;
                color: #fff;
                font: 600 12px/1.3 system-ui, sans-serif;
                text-overflow: ellipsis;
                text-shadow: 0 1px 3px rgba(0, 0, 0, 0.9);
                white-space: nowrap;
            }
            .iv-preview-time { font-size: 13px; font-variant-numeric: tabular-nums; }
            .iv-mark-ticks {
                position: absolute;
                z-index: 2;
                height: 4px;
                pointer-events: none;
            }
            /* A mark cuts a small notch in the track, as YouTube's chapters
               do; it rises into a white pin on hover. The button is a wider
               hit area around it. */
            .iv-mark-tick {
                position: absolute;
                top: 50%;
                width: 14px;
                height: 18px;
                padding: 0;
                border: 0;
                background: transparent;
                transform: translate(-50%, -50%);
                cursor: pointer;
                pointer-events: auto;
            }
            .iv-mark-tick::before {
                content: '';
                position: absolute;
                top: 50%;
                left: 50%;
                width: 3px;
                height: 9px;
                border-radius: 2px;
                background: #fff;
                box-shadow: 0 0 0 2px rgba(0, 0, 0, 0.6);
                transform: translate(-50%, -50%);
                transition: height 0.15s ease, width 0.15s ease;
            }
            .iv-mark-tick:hover::before { width: 4px; height: 15px; }
            /* An interval tints its stretch of the track, in the theme's
               colour, rounded like the track. */
            .iv-mark-tick.is-range {
                min-width: 6px;
                height: 14px;
                transform: translateY(-50%);
            }
            .iv-mark-tick.is-range::before {
                left: 0;
                width: 100%;
                height: 3px;
                border-radius: 999px;
                background: color-mix(in srgb, var(--immich-ui-primary-500, #4250af) 45%, #fff);
                box-shadow: 0 0 6px color-mix(in srgb, var(--immich-ui-primary-500, #4250af) 70%, transparent);
                transform: translateY(-50%);
            }
            .iv-mark-tick.is-range:hover::before,
            immich-time-range:hover + .iv-mark-ticks .iv-mark-tick.is-range::before { height: 6px; }
            .iv-mark-tick::after {
                content: attr(data-label);
                position: absolute;
                bottom: calc(100% + 6px);
                left: 50%;
                max-width: 320px;
                padding: 5px 9px;
                overflow: hidden;
                border-radius: 8px;
                background: rgba(20, 20, 22, 0.92);
                color: #fff;
                font: 600 12px/1.2 system-ui, sans-serif;
                text-overflow: ellipsis;
                white-space: nowrap;
                opacity: 0;
                transform: translate(-50%, 4px);
                pointer-events: none;
                transition: opacity 0.12s ease, transform 0.12s ease;
            }
            .iv-mark-tick.is-range::after { left: 0; transform: translateY(4px); }
            .iv-mark-tick:hover::after { opacity: 1; transform: translate(-50%, 0); }
            .iv-mark-tick.is-range:hover::after { transform: none; }
            .iv-progress {
                position: absolute;
                right: 0;
                bottom: 0;
                left: 0;
                z-index: 1;
                height: 4px;
                background: rgba(255, 255, 255, 0.35);
            }
            .iv-progress > span {
                display: block;
                height: 100%;
                background: var(--immich-ui-primary-500, #4250af);
            }
            .iv-card-marks {
                position: absolute;
                left: 8px;
                bottom: 8px;
                z-index: 1;
                display: flex;
                align-items: center;
                gap: 3px;
                padding: 3px 6px;
                border-radius: 4px;
                background: rgba(0, 0, 0, 0.75);
                color: #ffd54a;
                font: 600 12px/1.2 system-ui, sans-serif;
            }
            .iv-card-marks svg { width: 13px; height: 13px; }

            .iv-hud {
                position: absolute;
                top: 50%;
                left: 50%;
                z-index: 50;
                padding: 10px 18px;
                border-radius: 999px;
                background: rgba(0, 0, 0, 0.65);
                color: #fff;
                font: 600 16px/1.2 system-ui, sans-serif;
                pointer-events: none;
                opacity: 0;
                transform: translate(-50%, -50%);
                transition: opacity 0.2s ease;
            }
            .iv-hud.is-visible { opacity: 1; }

            #iv-sidebar {
                position: fixed;
                top: 0;
                right: 0;
                bottom: 0;
                z-index: 2147483000;
                display: none;
                flex-direction: column;
                width: var(--iv-sidebar-w);
                border-left: 1px solid var(--iv-border);
                background: var(--iv-bg);
                color: var(--iv-text);
                font: 13px/1.35 system-ui, sans-serif;
            }
            html.iv-sidebar-open #iv-sidebar { display: flex; }
            .iv-sidebar-head {
                display: flex;
                flex-direction: column;
                gap: 10px;
                padding: 16px 16px 12px;
                border-bottom: 1px solid var(--iv-border);
            }
            .iv-sidebar-row {
                display: flex;
                align-items: flex-start;
                justify-content: space-between;
                gap: 8px;
            }
            .iv-sidebar-title {
                overflow: hidden;
                font-size: 16px;
                font-weight: 700;
                text-overflow: ellipsis;
                white-space: nowrap;
            }
            .iv-sidebar-sub { color: var(--iv-muted); font-size: 12px; }
            .iv-icon-button {
                display: grid;
                place-items: center;
                flex-shrink: 0;
                width: 32px;
                height: 32px;
                border: 0;
                border-radius: 999px;
                background: transparent;
                color: var(--iv-text);
                font-size: 18px;
                cursor: pointer;
            }
            .iv-icon-button:hover { background: var(--iv-surface-hover); }
            .iv-filters { display: flex; gap: 6px; }
            .iv-sidebar-order { display: flex; gap: 6px; margin-top: 8px; }
            .iv-sidebar-order .iv-chip { height: 30px; padding: 0 8px 0 10px; font-size: 12px; }
            .iv-sidebar-order .iv-chip svg { width: 16px; height: 16px; }
            .iv-grid-group {
                display: flex;
                grid-column: 1 / -1;
                align-items: baseline;
                gap: 6px;
                margin: 6px 2px 0;
                color: var(--iv-text);
                font: 600 13px/1.2 system-ui, sans-serif;
            }
            .iv-grid-group:first-child { margin-top: 0; }
            .iv-sidebar-order .iv-chip-icon { display: contents; }

            /* List view, YouTube's "up next": a 16:9 thumbnail, then the
               title and when it was taken. */
            #iv-sidebar.is-list .iv-grid { grid-template-columns: 1fr; gap: 4px; padding: 8px; }
            #iv-sidebar.is-list .iv-grid-group { margin: 10px 4px 2px; }
            #iv-sidebar.is-list .iv-grid-group:first-child { margin-top: 2px; }
            #iv-sidebar.is-list .iv-item {
                display: flex;
                gap: 10px;
                aspect-ratio: auto;
                padding: 4px;
                border-radius: 10px;
                background: transparent;
                color: var(--iv-text);
                text-decoration: none;
            }
            #iv-sidebar.is-list .iv-item:hover { background: var(--iv-surface); }
            #iv-sidebar.is-list .iv-item:hover img { transform: none; }
            #iv-sidebar.is-list .iv-item.is-current { outline: 0; background: var(--iv-surface-hover); }
            #iv-sidebar.is-list .iv-item.is-current::after { display: none; }
            .iv-item-thumb {
                position: relative;
                flex: none;
                width: 160px;
                aspect-ratio: 16 / 9;
                overflow: clip;
                border-radius: 8px;
                background: var(--iv-surface);
            }
            .iv-item.is-current .iv-item-thumb { outline: 2px solid var(--iv-accent); outline-offset: -2px; }
            .iv-item-text {
                display: flex;
                flex-direction: column;
                gap: 4px;
                min-width: 0;
                padding-top: 2px;
            }
            .iv-item-title {
                display: -webkit-box;
                overflow: hidden;
                font: 600 13px/1.35 system-ui, sans-serif;
                overflow-wrap: anywhere;
                -webkit-box-orient: vertical;
                -webkit-line-clamp: 2;
            }
            .iv-item-meta {
                overflow: hidden;
                color: var(--iv-muted);
                font: 12px/1.3 system-ui, sans-serif;
                text-overflow: ellipsis;
                white-space: nowrap;
            }
            .iv-grid-group small { color: var(--iv-muted); font-size: 12px; font-weight: 500; }
            .iv-filters button {
                height: 28px;
                padding: 0 12px;
                border: 0;
                border-radius: 8px;
                background: var(--iv-surface);
                color: var(--iv-text);
                font: 600 12px/1 system-ui, sans-serif;
                cursor: pointer;
            }
            .iv-filters button:hover { background: var(--iv-surface-hover); }
            .iv-filters button.is-active {
                background: var(--iv-accent);
                color: var(--iv-accent-text);
            }
            .iv-grid {
                display: grid;
                grid-template-columns: repeat(2, 1fr);
                grid-auto-rows: auto;
                gap: 8px;
                align-content: start;
                flex: 1;
                min-height: 0;
                padding: 12px;
                overflow-y: auto;
                overscroll-behavior: contain;
            }
            .iv-status {
                grid-column: 1 / -1;
                padding: 24px 8px;
                color: var(--iv-muted);
                text-align: center;
            }
            /* 4:3 cells, sized from their width. Clipped, not hidden: a
               hidden overflow drops the cell's minimum size and the auto
               rows collapse under it. */
            .iv-item {
                position: relative;
                display: block;
                aspect-ratio: 4 / 3;
                overflow: clip;
                border-radius: 6px;
                background: var(--iv-surface);
            }
            .iv-item img {
                display: block;
                width: 100%;
                height: 100%;
                object-fit: cover;
                transition: transform 0.15s ease;
            }
            .iv-item:hover img { transform: scale(1.05); }
            .iv-item.is-current { outline: 3px solid var(--iv-accent); outline-offset: -3px; }
            .iv-item.is-current::after {
                content: '';
                position: absolute;
                inset: 0;
                background: rgba(173, 203, 250, 0.18);
            }
            /* The open item gets YouTube's "now playing" label. */
            .iv-item.is-current::before {
                content: 'Reproduzindo';
                position: absolute;
                z-index: 1;
                top: 6px;
                left: 6px;
                padding: 3px 6px;
                border-radius: 4px;
                background: var(--iv-accent);
                color: var(--iv-accent-text);
                font: 700 10px/1 system-ui, sans-serif;
                letter-spacing: 0.02em;
                text-transform: uppercase;
            }
            .iv-item.is-current[data-video="false"]::before { content: 'Aberta'; }
            #iv-sidebar.is-list .iv-item.is-current::before { top: 10px; left: 10px; }
            .iv-item-badge {
                position: absolute;
                right: 4px;
                bottom: 4px;
                padding: 2px 5px;
                border-radius: 4px;
                background: rgba(0, 0, 0, 0.75);
                color: #fff;
                font: 600 11px/1.2 system-ui, sans-serif;
            }

            /* Card view: covers Immich's grid inside <main>; the grid and its
               scrubber stay mounted but invisible. */
            html.iv-cards-on main:has(> #iv-cards) > :not(#iv-cards, #iv-marks-page) {
                visibility: hidden !important;
            }
            /* The marks page takes the place of the cards while it is open. */
            main:has(> #iv-marks-page) > #iv-cards { display: none; }
            /* The top padding mirrors <main>'s, which sits under the bar, so
               only the scroller takes pointer events. */
            #iv-cards {
                position: absolute;
                inset: 0;
                z-index: 2;
                display: flex;
                pointer-events: none;
                flex-direction: column;
                padding-top: inherit;
                --iv-page: #ffffff;
                color: var(--iv-text);
                font-size: 14px;
                line-height: 1.4;
            }
            html.dark #iv-cards { --iv-page: #000000; }
            .iv-cards-scroll {
                flex: 1;
                min-height: 0;
                padding: 8px 16px 48px;
                overflow-y: auto;
                overscroll-behavior: contain;
                pointer-events: auto;
            }
            /* Album cover beside the name, as a channel page shows its avatar. */
            .iv-cards-head {
                display: flex;
                align-items: center;
                gap: 24px;
                padding: 16px 0 12px;
            }
            .iv-cards-head-text { min-width: 0; }
            .iv-cards-cover {
                flex-shrink: 0;
                width: 160px;
                height: 160px;
                border-radius: 20px;
                background: var(--iv-surface);
                object-fit: cover;
                box-shadow: 0 8px 24px rgba(0, 0, 0, 0.25);
            }
            .iv-cards-cover[hidden] { display: none; }
            .iv-cards-head h1 {
                margin: 0;
                color: var(--iv-accent);
                font-size: 48px;
                font-weight: 600;
                line-height: 1.15;
                overflow-wrap: anywhere;
            }
            .iv-cards-sub { margin: 12px 0 0; color: var(--iv-muted); font-size: 14px; }
            .iv-cards-desc { margin: 8px 0 0; white-space: pre-line; }
            .iv-cards-month h2 {
                display: flex;
                align-items: baseline;
                gap: 10px;
                margin: 32px 0 16px;
                font-size: 20px;
                font-weight: 700;
            }
            .iv-cards-month h2 small { color: var(--iv-muted); font-size: 13px; font-weight: 500; }
            /* Justified rows, like Immich's own grid: every card grows in
               proportion to its picture's aspect ratio (--r), so a row keeps
               one height and no picture is cropped. The filler after the last
               card stops the final row from stretching. */
            .iv-cards-grid {
                --iv-row-h: 260px;
                display: flex;
                flex-wrap: wrap;
                gap: 16px 8px;
            }
            .iv-cards-grid::after {
                content: '';
                flex-grow: 1000000;
            }
            /* YouTube-style hover: the whole card gets a soft panel. Content
               box sizing keeps the padding out of the proportional growth. */
            .iv-card {
                box-sizing: content-box;
                display: flex;
                flex: var(--r) 1 calc(var(--r) * var(--iv-row-h));
                flex-direction: column;
                min-width: 0;
                max-width: calc(100% - 16px);
                padding: 8px;
                border-radius: 16px;
                color: inherit;
                text-decoration: none;
                transition: background 0.15s ease;
            }
            .iv-card:hover { background: color-mix(in srgb, var(--iv-text) 6%, transparent); }
            .iv-card:focus-visible { outline: 2px solid var(--iv-accent); outline-offset: 0; }
            .iv-card-thumb {
                position: relative;
                aspect-ratio: var(--r);
                overflow: hidden;
                border-radius: 12px;
                background: var(--iv-surface);
            }
            .iv-card-thumb img,
            .iv-card-thumb video {
                position: absolute;
                inset: 0;
                width: 100%;
                height: 100%;
                object-fit: cover;
            }
            .iv-card-thumb video { background: #000; }
            .iv-card-thumb .iv-item-badge {
                right: 8px;
                bottom: 8px;
                z-index: 1;
                display: flex;
                align-items: center;
                gap: 3px;
                padding: 3px 6px;
                font-size: 12px;
            }
            .iv-card-thumb .iv-item-badge svg { width: 12px; height: 12px; }
            .iv-card-fav {
                position: absolute;
                top: 8px;
                left: 8px;
                z-index: 1;
                display: grid;
                place-items: center;
                width: 26px;
                height: 26px;
                border-radius: 999px;
                background: rgba(0, 0, 0, 0.55);
                color: #ff4d6d;
            }
            .iv-card-fav svg { width: 15px; height: 15px; }
            .iv-card-title {
                display: -webkit-box;
                margin: 12px 4px 0;
                overflow: hidden;
                font-size: 15px;
                font-weight: 600;
                line-height: 1.35;
                -webkit-box-orient: vertical;
                -webkit-line-clamp: 2;
            }
            /* File names have no spaces to wrap at: one line, cut at the end. */
            .iv-card-title.is-file {
                display: block;
                text-overflow: ellipsis;
                white-space: nowrap;
            }
            .iv-card-meta {
                margin: 4px 4px 0;
                overflow: hidden;
                text-overflow: ellipsis;
                white-space: nowrap;
                color: var(--iv-muted);
                font-size: 13px;
            }
            .iv-card-meta > * + *::before { content: '•'; margin: 0 6px; }
            .iv-card-place {
                margin: 2px 4px 0;
                overflow: hidden;
                color: var(--iv-muted);
                font-size: 13px;
                text-overflow: ellipsis;
                white-space: nowrap;
            }
            /* Selection: a check top left and "⋮" top right, on hover (always
               on touch); a selected card is inset and outlined. */
            .iv-card-check,
            .iv-card-more {
                position: absolute;
                top: 8px;
                z-index: 2;
                display: grid;
                place-items: center;
                padding: 0;
                border: 0;
                color: #fff;
                cursor: pointer;
                opacity: 0;
                transition: opacity 0.12s ease, background 0.12s ease;
            }
            .iv-card-check {
                left: 8px;
                width: 24px;
                height: 24px;
                border: 2px solid rgba(255, 255, 255, 0.9);
                border-radius: 999px;
                background: rgba(0, 0, 0, 0.3);
            }
            .iv-card-check svg { opacity: 0; }
            .iv-card-more {
                right: 6px;
                width: 32px;
                height: 32px;
                border-radius: 999px;
                background: rgba(0, 0, 0, 0.55);
            }
            .iv-card-more:hover { background: rgba(0, 0, 0, 0.8); }
            .iv-card:hover :is(.iv-card-check, .iv-card-more),
            .iv-card-more[aria-expanded="true"],
            #iv-cards.is-selecting .iv-card-check { opacity: 1; }
            .iv-card:hover .iv-card-fav,
            #iv-cards.is-selecting .iv-card-fav { left: 40px; }
            .iv-card.is-selected .iv-card-check {
                border-color: var(--immich-ui-primary-500, #4250af);
                background: var(--immich-ui-primary-500, #4250af);
            }
            .iv-card.is-selected .iv-card-check svg { opacity: 1; }
            .iv-card-thumb img { transition: transform 0.12s ease; }
            .iv-card.is-selected .iv-card-thumb { outline: 3px solid var(--immich-ui-primary-500, #4250af); outline-offset: -3px; }
            .iv-card.is-selected .iv-card-thumb img { transform: scale(0.92); border-radius: 8px; }
            #iv-cards.is-selecting .iv-card-more { display: none; }
            @media (pointer: coarse) {
                .iv-card-more { opacity: 1; }
            }
            .iv-select-bar { display: none; flex: 1; align-items: center; gap: 8px; min-width: 0; }
            .iv-cover-bar { display: none; flex: 1; align-items: center; gap: 10px; min-width: 0; color: var(--iv-accent); font-weight: 600; }
            .iv-cover-bar span { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
            #iv-cards.is-picking-cover .iv-cards-bar > :not(.iv-cover-bar) { display: none; }
            #iv-cards.is-picking-cover .iv-cover-bar { display: flex; }
            #iv-cards.is-picking-cover .iv-card { cursor: copy; }
            #iv-cards.is-picking-cover .iv-card:hover .iv-card-thumb { outline: 3px solid var(--immich-ui-primary-500, #4250af); outline-offset: -3px; }
            #iv-cards.is-picking-cover :is(.iv-card-check, .iv-card-more) { display: none; }
            .iv-cards-cover[title] { cursor: pointer; }
            #iv-cards.is-selecting .iv-cards-bar > :not(.iv-select-bar) { display: none; }
            #iv-cards.is-selecting .iv-select-bar { display: flex; }
            .iv-select-count { font-size: 15px; font-weight: 600; white-space: nowrap; }
            .iv-select-actions { display: flex; gap: 4px; margin-left: auto; }
            .iv-action.is-danger:hover { color: #ff6b6b; }
            .iv-menu-search {
                position: sticky;
                top: -6px;
                z-index: 1;
                width: 100%;
                margin-bottom: 4px;
                padding: 8px 10px;
                border: 1px solid var(--iv-border);
                border-radius: 8px;
                background: var(--iv-surface);
                color: var(--iv-text);
                font: 14px system-ui, sans-serif;
                outline: none;
            }
            .iv-menu-search:focus { border-color: var(--iv-accent); }
            /* Marks page, over the page's content, laid out like Immich's
               own pages: a header row with the title and its controls, then
               the videos across the whole width, one section each. */
            #iv-marks-page {
                position: absolute;
                inset: 0;
                z-index: 4;
                display: flex;
                flex-direction: column;
                padding-top: inherit;
                background: var(--iv-page-bg);
                color: var(--iv-text);
                font: 14px/1.4 system-ui, sans-serif;
            }
            .iv-mp-head {
                display: flex;
                flex-wrap: wrap;
                align-items: center;
                justify-content: space-between;
                gap: 8px 16px;
                min-height: 4rem;
                padding: 8px 1rem;
                border-bottom: 1px solid var(--iv-border);
            }
            .iv-mp-title-block { display: flex; align-items: baseline; gap: 12px; min-width: 0; }
            .iv-mp-head h1 { margin: 0; font-size: 16px; font-weight: 500; }
            .iv-mp-sub { color: var(--iv-muted); font-size: 13px; }
            .iv-mp-tools { display: flex; flex: 1; align-items: center; justify-content: flex-end; gap: 8px; min-width: 0; }
            .iv-mp-searchbox {
                display: flex;
                flex: 0 1 20rem;
                align-items: center;
                gap: 8px;
                min-width: 0;
                height: 40px;
                padding: 0 14px;
                border-radius: 1rem;
                background: var(--iv-surface);
                color: var(--iv-muted);
            }
            .iv-mp-searchbox:focus-within { box-shadow: 0 0 0 1px var(--iv-accent); }
            .iv-mp-searchbox input { flex: 1; min-width: 0; border: 0; background: transparent; color: var(--iv-text); font: 14px system-ui, sans-serif; outline: none; }
            .iv-mp-kinds { display: flex; height: 40px; overflow: hidden; border-radius: 1rem; background: var(--iv-surface); }
            .iv-mp-kinds button {
                padding: 0 16px;
                border: 0;
                background: transparent;
                color: var(--iv-text);
                font: 14px system-ui, sans-serif;
                cursor: pointer;
            }
            .iv-mp-kinds button:hover { background: var(--iv-surface-hover); }
            .iv-mp-kinds button.is-active { background: var(--iv-surface-hover); font-weight: 600; }
            .iv-mp-scroll { flex: 1; min-height: 0; padding: 0 1rem 48px; overflow-y: auto; overscroll-behavior: contain; }
            .iv-mp-status { padding-top: 12px; color: var(--iv-muted); font-size: 12px; }
            .iv-mp-status:empty { display: none; }
            .iv-mp-row {
                display: grid;
                grid-template-columns: minmax(200px, 320px) 1fr;
                gap: 24px;
                padding: 24px 0;
                border-bottom: 1px solid var(--iv-border);
            }
            .iv-mp-cover {
                position: relative;
                align-self: start;
                aspect-ratio: 16 / 9;
                overflow: clip;
                border-radius: 0.75rem;
                background: var(--iv-surface);
            }
            .iv-mp-cover img { width: 100%; height: 100%; object-fit: cover; transition: transform 0.2s ease; }
            .iv-mp-cover:hover img { transform: scale(1.03); }
            .iv-mp-cover .iv-item-badge { right: 8px; bottom: 8px; }
            .iv-mp-body { min-width: 0; }
            .iv-mp-title {
                display: block;
                overflow: hidden;
                color: inherit;
                font-size: 18px;
                font-weight: 600;
                text-decoration: none;
                text-overflow: ellipsis;
                white-space: nowrap;
            }
            .iv-mp-title:hover { color: var(--iv-accent); }
            .iv-mp-meta { margin-top: 2px; color: var(--iv-muted); font-size: 13px; }
            .iv-mp-marks { display: grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); gap: 2px 16px; margin-top: 12px; }
            .iv-mp-mark {
                display: flex;
                align-items: center;
                gap: 12px;
                min-width: 0;
                padding: 6px 8px;
                border: 0;
                border-radius: 0.5rem;
                background: transparent;
                color: var(--iv-text);
                font: 14px system-ui, sans-serif;
                text-align: start;
                cursor: pointer;
            }
            .iv-mp-mark:hover { background: var(--iv-surface); }
            .iv-mp-time {
                flex: none;
                min-width: 56px;
                color: var(--iv-accent);
                font: 600 13px/1.3 system-ui, sans-serif;
                font-variant-numeric: tabular-nums;
                text-align: end;
            }
            .iv-mp-label { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
            .iv-mp-empty { display: grid; justify-items: center; gap: 12px; padding: 64px 16px; color: var(--iv-muted); text-align: center; }
            @media (max-width: 640px) {
                .iv-mp-tools { flex-basis: 100%; flex-direction: column-reverse; align-items: stretch; }
                .iv-mp-searchbox { flex-basis: auto; }
                .iv-mp-kinds button { flex: 1; }
                .iv-mp-row { grid-template-columns: 1fr; gap: 12px; padding: 16px 0; }
            }

            /* Immich's sidebar, rearranged. */
            .iv-nav-hidden { display: none !important; }
            .iv-nav-current { background: color-mix(in srgb, var(--immich-ui-primary-500, #4250af) 16%, transparent) !important; color: var(--iv-accent) !important; }
            .iv-nav-system-head a { cursor: pointer; }
            .iv-nav-chevron { margin-inline-start: auto; transition: transform 0.15s ease; }
            .iv-nav-system.is-open .iv-nav-chevron { transform: rotate(180deg); }
            .iv-nav-system:not(.is-open) > .iv-nav-sub { display: none; }
            .iv-nav-sub a { padding-inline-start: 2.75rem !important; }
            .iv-nav-albums a.is-pinned .grow::after { content: '•'; margin-inline-start: 6px; color: var(--iv-accent); }
            .iv-storage { padding: 10px 14px !important; }
            .iv-storage > div > div:first-child { display: none !important; }
            .iv-storage-label { display: flex; justify-content: space-between; gap: 8px; color: var(--iv-muted); font-size: 12px; line-height: 1.3; }
            .iv-storage-label b { color: var(--iv-text); font-weight: 600; }
            /* The sidebar's copy on an album page. */
            #iv-nav {
                position: fixed;
                top: 0;
                bottom: 0;
                left: 0;
                z-index: 3;
                display: flex;
                flex-direction: column;
                width: 16rem;
                overflow-y: auto;
            }
            /* Immich sizes it to the full height under the top bar; here the
               logo row takes that place, so it fills only what is left. */
            #iv-nav > div:not(.iv-nav-logo) { flex: 1 0 auto; height: auto !important; min-height: 0 !important; }
            /* Section titles ("Biblioteca"), as a heading rather than fine print. */
            :is(#sidebar, #iv-nav) p.text-xs { color: var(--iv-muted); font-size: 14px; font-weight: 600; letter-spacing: 0.01em; }
            /* Matches the page's own: the top bar's logo row, then the
               sidebar's top padding. */
            .iv-nav-logo { display: flex; flex: none; align-items: center; gap: 4px; box-sizing: border-box; height: 76px; margin-bottom: 32px; padding-inline-start: 8px; }
            /* Collapse: the sidebar becomes a rail of icons. */
            .iv-nav-toggle {
                display: grid;
                place-items: center;
                flex: none;
                width: 40px;
                height: 40px;
                margin-inline-end: 4px;
                padding: 0;
                border: 0;
                border-radius: 999px;
                background: transparent;
                color: inherit;
                cursor: pointer;
            }
            .iv-nav-toggle:hover { background: color-mix(in srgb, currentColor 10%, transparent); }
            #dashboard-navbar .iv-nav-toggle { margin-inline-start: -8px; }
            @media (max-width: 1023px) {
                .iv-nav-toggle { display: none; }
            }
            @media (min-width: 1024px) {
                html.iv-nav-collapsed #sidebar,
                html.iv-nav-collapsed #iv-nav { width: 72px !important; }
                html.iv-nav-collapsed div.grid:has(> #sidebar) { grid-template-columns: 72px auto !important; }
                html.iv-nav-collapsed.iv-album-nav #iv-cards { left: 72px; }
                html.iv-nav-collapsed :is(#sidebar, #iv-nav) :is(span.truncate, .iv-nav-chevron),
                html.iv-nav-collapsed :is(#sidebar, #iv-nav) > div > div:not(:has(> div > a[href]), .iv-nav-system),
                html.iv-nav-collapsed :is(#sidebar, #iv-nav) > div > div > div:not(.relative),
                html.iv-nav-collapsed :is(#sidebar, #iv-nav) > div > div > div > button,
                html.iv-nav-collapsed :is(#sidebar, #iv-nav) .iv-nav-sub,
                html.iv-nav-collapsed #iv-nav .iv-nav-logo a { display: none !important; }
                html.iv-nav-collapsed :is(#sidebar, #iv-nav) > div { padding-inline-end: 8px !important; }
            }
            .iv-nav-logo-fallback { display: flex; align-items: center; gap: 8px; color: var(--iv-text); font: 600 22px system-ui, sans-serif; text-decoration: none; }
            @media (min-width: 1024px) {
                html.iv-album-nav #iv-cards { left: 16rem; }
            }
            @media (max-width: 1023px) {
                #iv-nav { display: none; }
            }

            /* Search field that takes the chips' place in a bar. */
            .iv-searchbox {
                display: none;
                flex: 1;
                align-items: center;
                gap: 8px;
                min-width: 0;
                height: 40px;
                padding: 0 6px 0 14px;
                border: 1px solid var(--iv-accent);
                border-radius: 999px;
                background: var(--iv-surface);
                color: var(--iv-muted);
            }
            .iv-searchbox input { flex: 1; min-width: 0; border: 0; background: transparent; color: var(--iv-text); font: 15px system-ui, sans-serif; outline: none; }
            .iv-searchbox input::-webkit-search-cancel-button { display: none; }
            .iv-cards-bar.is-searching .iv-cards-filters > :not(.iv-searchbox),
            .iv-albums-bar.is-searching :is(.iv-ab-chips, [data-ab="search"]) { display: none; }
            .iv-cards-bar.is-searching .iv-searchbox,
            .iv-albums-bar.is-searching .iv-searchbox { display: flex; }
            /* Albums page: Immich's controls stay in the page, unseen, for
               the chips to click through. */
            .iv-out-of-sight {
                position: absolute !important;
                width: 1px !important;
                height: 1px !important;
                overflow: hidden !important;
                clip-path: inset(50%) !important;
                opacity: 0 !important;
            }
            html.iv-albums-page main div.xl\\:hidden:has(fieldset) { display: none !important; }
            .iv-albums-bar {
                display: flex;
                flex: 1;
                align-items: center;
                justify-content: flex-end;
                gap: 12px;
                min-width: 0;
                color: var(--iv-text);
                font-size: 14px;
            }
            .iv-ab-chips { display: flex; align-items: center; gap: 8px; min-width: 0; overflow-x: auto; scrollbar-width: none; }
            .iv-albums-bar .iv-searchbox { max-width: 520px; }
            @media (max-width: 640px) {
                .iv-albums-bar { gap: 6px; }
                .iv-albums-bar .iv-chip { height: 34px; padding: 0 8px 0 10px; font-size: 13px; }
                .iv-albums-bar .iv-chip-value,
                .iv-albums-bar [data-ab="create"] .iv-action-label { display: none; }
                .iv-albums-bar [data-ab="create"] { width: 34px; padding: 0; justify-content: center; }
            }

            /* Album page: bigger covers mean fewer columns. */
            html.iv-covers-medium main .grid-auto-fill-56 { grid-template-columns: repeat(auto-fill, minmax(18rem, 1fr)) !important; }
            html.iv-covers-large main .grid-auto-fill-56 { grid-template-columns: repeat(auto-fill, minmax(24rem, 1fr)) !important; }

            /* Settings dialog and welcome, in the script's colours. */
            .iv-modal-backdrop {
                position: fixed;
                inset: 0;
                z-index: 2147483001;
                display: grid;
                place-items: center;
                padding: 16px;
                background: rgba(0, 0, 0, 0.6);
                animation: iv-fade 0.15s ease;
            }
            @keyframes iv-fade { from { opacity: 0; } }
            .iv-modal {
                display: grid;
                grid-template-columns: 200px 1fr;
                grid-template-rows: auto 1fr;
                width: min(780px, 100%);
                height: min(600px, calc(100vh - 32px));
                overflow: hidden;
                border: 1px solid var(--iv-border);
                border-radius: 20px;
                background: var(--iv-bg);
                color: var(--iv-text);
                font: 14px/1.45 system-ui, sans-serif;
                box-shadow: 0 24px 64px rgba(0, 0, 0, 0.5);
            }
            .iv-modal-head {
                display: flex;
                grid-column: 1 / -1;
                align-items: center;
                justify-content: space-between;
                padding: 14px 14px 14px 24px;
                border-bottom: 1px solid var(--iv-border);
            }
            .iv-modal-head h2 { margin: 0; font-size: 18px; font-weight: 700; }
            .iv-modal-nav { display: flex; flex-direction: column; gap: 2px; padding: 12px; border-right: 1px solid var(--iv-border); }
            .iv-modal-tab {
                display: flex;
                align-items: center;
                gap: 12px;
                height: 40px;
                padding: 0 12px;
                border: 0;
                border-radius: 999px;
                background: transparent;
                color: var(--iv-text);
                font: 600 14px system-ui, sans-serif;
                text-align: start;
                cursor: pointer;
            }
            .iv-modal-tab:hover { background: var(--iv-surface); }
            .iv-modal-tab.is-active { background: color-mix(in srgb, var(--immich-ui-primary-500, #4250af) 20%, transparent); color: var(--iv-accent); }
            .iv-modal-body { display: flex; flex-direction: column; gap: 16px; min-height: 0; padding: 20px 24px; overflow-y: auto; }
            .iv-set-card { display: flex; flex-direction: column; gap: 4px; padding: 8px 16px 12px; border-radius: 14px; background: var(--iv-surface); }
            .iv-set-card h3 { margin: 8px 0 4px; color: var(--iv-muted); font-size: 12px; font-weight: 700; letter-spacing: 0.04em; text-transform: uppercase; }
            .iv-set-row { display: flex; align-items: center; justify-content: space-between; gap: 16px; min-height: 52px; padding: 6px 0; cursor: pointer; }
            .iv-set-row + .iv-set-row { border-top: 1px solid var(--iv-border); }
            .iv-set-text { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
            .iv-set-label { font-weight: 600; }
            .iv-set-hint { color: var(--iv-muted); font-size: 12.5px; }
            .iv-set-about p { margin: 0 0 4px; }
            .iv-toggle {
                position: relative;
                flex: none;
                width: 40px;
                height: 22px;
                margin: 0;
                border-radius: 999px;
                background: var(--iv-border);
                appearance: none;
                cursor: pointer;
                transition: background 0.15s ease;
            }
            .iv-toggle::after {
                content: '';
                position: absolute;
                top: 3px;
                left: 3px;
                width: 16px;
                height: 16px;
                border-radius: 999px;
                background: #fff;
                transition: transform 0.15s ease;
            }
            .iv-toggle:checked { background: var(--immich-ui-primary-500, #4250af); }
            .iv-toggle:checked::after { transform: translateX(18px); }
            .iv-select {
                flex: none;
                height: 34px;
                padding: 0 10px;
                border: 1px solid var(--iv-border);
                border-radius: 10px;
                background: var(--iv-bg);
                color: var(--iv-text);
                font: 13px system-ui, sans-serif;
            }
            .iv-text-button {
                display: inline-flex;
                align-items: center;
                align-self: flex-start;
                gap: 8px;
                height: 36px;
                margin-top: 6px;
                padding: 0 16px;
                border: 0;
                border-radius: 999px;
                background: var(--iv-surface-hover);
                color: var(--iv-text);
                font: 600 13px system-ui, sans-serif;
                cursor: pointer;
            }
            .iv-text-button:disabled { opacity: 0.45; cursor: default; }
            .iv-text-button.is-primary { background: var(--iv-accent); color: var(--iv-accent-text); }
            .iv-pin-list { display: flex; flex-direction: column; gap: 2px; margin: 0; padding: 0; list-style: none; }
            .iv-pin-row { display: flex; align-items: center; gap: 10px; min-height: 44px; }
            .iv-pin-cover { flex: none; width: 32px; height: 32px; border-radius: 6px; background: var(--iv-border) center / cover; }
            .iv-pin-name { flex: 1; min-width: 0; overflow: hidden; font-weight: 600; text-overflow: ellipsis; white-space: nowrap; }
            .iv-pin-row .iv-icon-button:disabled { opacity: 0.3; cursor: default; }
            @media (max-width: 640px) {
                .iv-modal { grid-template-columns: 1fr; grid-template-rows: auto auto 1fr; height: calc(100vh - 32px); }
                .iv-modal-nav { flex-direction: row; overflow-x: auto; border-right: 0; border-bottom: 1px solid var(--iv-border); }
                .iv-modal-tab { flex: none; }
                .iv-modal-body { padding: 16px; }
            }
            .iv-modal.iv-welcome { display: flex; flex-direction: column; width: min(500px, 100%); height: auto; }
            .iv-wl-art {
                display: grid;
                place-items: center;
                height: 230px;
                overflow: hidden;
                background:
                    radial-gradient(120% 90% at 50% 0%, color-mix(in srgb, var(--immich-ui-primary-500, #4250af) 45%, transparent), transparent 65%),
                    linear-gradient(180deg, #17181c, #0b0b0d);
                color: #f1f1f1;
            }
            .iv-wl-enter { animation: iv-wl-in 0.28s cubic-bezier(0.2, 0, 0, 1); }
            @keyframes iv-wl-in { from { opacity: 0; transform: translateY(8px) scale(0.98); } }
            .iv-wl-content { padding: 20px 24px 0; }
            .iv-wl-counter { color: var(--iv-accent); font-size: 12px; font-weight: 700; letter-spacing: 0.04em; text-transform: uppercase; }
            .iv-wl-title { margin: 2px 0 0; font-size: 21px; font-weight: 700; }
            .iv-wl-text { min-height: 64px; margin: 6px 0 0; color: var(--iv-muted); }
            .iv-wl-foot { display: flex; align-items: center; gap: 8px; padding: 16px 24px 24px; }
            .iv-wl-foot .iv-text-button { margin: 0; }
            .iv-wl-dots { display: flex; gap: 6px; margin-right: auto; }
            .iv-wl-dots i { width: 6px; height: 6px; border-radius: 3px; background: var(--iv-border); transition: width 0.2s ease, background 0.2s ease; }
            .iv-wl-dots i.is-on { width: 18px; background: var(--iv-accent); }
            .iv-wl-hero { display: grid; justify-items: center; gap: 18px; color: var(--iv-accent); }
            .iv-wl-chips { display: flex; flex-wrap: wrap; justify-content: center; gap: 6px; max-width: 380px; }
            .iv-wl-chips span { padding: 4px 10px; border-radius: 999px; background: rgba(255, 255, 255, 0.1); color: #f1f1f1; font-size: 12px; }
            .iv-wl-player { position: relative; width: 400px; max-width: 86%; height: 170px; overflow: hidden; border-radius: 12px; background: linear-gradient(135deg, #2b2d36, #101114 60%); box-shadow: 0 12px 32px rgba(0, 0, 0, 0.5); }
            .iv-wl-thumb { position: absolute; bottom: 58px; left: 46%; width: 88px; height: 50px; border: 2px solid #fff; border-radius: 6px; background: linear-gradient(135deg, #5b6bd4, #1f2433); }
            .iv-wl-track { position: absolute; right: 12px; bottom: 44px; left: 12px; height: 3px; border-radius: 2px; background: rgba(255, 255, 255, 0.25); }
            .iv-wl-track i { display: block; width: 52%; height: 100%; border-radius: 2px; background: var(--immich-ui-primary-500, #4250af); }
            .iv-wl-bar { position: absolute; right: 0; bottom: 0; left: 0; display: flex; align-items: center; gap: 10px; height: 40px; padding: 0 12px; }
            .iv-wl-gap { flex: 1; }
            .iv-wl-marks { display: grid; gap: 8px; }
            .iv-wl-marks span { display: flex; align-items: center; gap: 8px; padding: 8px 14px; border-radius: 10px; background: rgba(255, 255, 255, 0.08); font-size: 13px; }
            .iv-wl-marks svg { color: #ffd54a; }
            .iv-wl-grid { display: grid; grid-template-columns: repeat(3, 92px); gap: 8px; }
            .iv-wl-grid span { position: relative; height: 62px; border-radius: 8px; background: linear-gradient(135deg, #3a3f55, #1c1e26); }
            .iv-wl-grid span:nth-child(2) { outline: 3px solid var(--immich-ui-primary-500, #4250af); outline-offset: -3px; }
            .iv-wl-grid span:nth-child(2) i { position: absolute; top: 6px; left: 6px; width: 14px; height: 14px; border-radius: 999px; background: var(--immich-ui-primary-500, #4250af); }
            .iv-wl-menu { display: grid; gap: 4px; width: 280px; padding: 8px; border-radius: 12px; background: #24252b; font-size: 13px; }
            .iv-wl-menu span { display: flex; align-items: center; gap: 10px; padding: 10px 12px; border-radius: 8px; opacity: 0.55; }
            .iv-wl-menu span.is-ours { background: color-mix(in srgb, var(--immich-ui-primary-500, #4250af) 25%, transparent); box-shadow: inset 0 0 0 1.5px var(--immich-ui-primary-500, #4250af); opacity: 1; }
            .iv-toast {
                position: fixed;
                bottom: 24px;
                left: 50%;
                z-index: 2147483003;
                max-width: calc(100vw - 32px);
                padding: 10px 16px;
                border-radius: 10px;
                background: rgba(20, 20, 22, 0.94);
                color: #fff;
                font: 600 14px/1.3 system-ui, sans-serif;
                opacity: 0;
                transform: translate(-50%, 8px);
                pointer-events: none;
                transition: opacity 0.15s ease, transform 0.15s ease;
            }
            .iv-toast.is-visible { opacity: 1; transform: translate(-50%, 0); }

            /* Grid layout: the same justified rows, denser, thumbnails only. */
            #iv-cards.is-grid .iv-cards-grid { --iv-row-h: 200px; gap: 4px; }
            #iv-cards.is-grid .iv-card { padding: 0; border-radius: 0; }
            #iv-cards.is-grid .iv-card:hover { background: transparent; }
            #iv-cards.is-grid .iv-card:hover img { filter: brightness(1.08); }
            #iv-cards.is-grid .iv-card-thumb { border-radius: 4px; }
            #iv-cards.is-grid :is(.iv-card-title, .iv-card-meta, .iv-card-place) { display: none; }
            #iv-cards .iv-status button {
                margin-top: 8px;
                padding: 6px 14px;
                border: 0;
                border-radius: 8px;
                background: var(--iv-surface);
                color: var(--iv-text);
                font: inherit;
                cursor: pointer;
            }
            /* Action bar under the album title: view, group and order on the
               left, the album's actions on the right. Pinned while the list
               scrolls; -8px is the scroller's own top padding. */
            .iv-cards-bar {
                position: sticky;
                top: -8px;
                z-index: 3;
                display: flex;
                align-items: center;
                gap: 12px;
                margin: 0 -16px;
                padding: 12px 16px;
                border-bottom: 1px solid transparent;
                background: color-mix(in srgb, var(--iv-page) 88%, transparent);
                backdrop-filter: blur(16px);
            }
            .iv-cards-filters {
                display: flex;
                flex: 1;
                align-items: center;
                gap: 8px;
                min-width: 0;
                overflow-x: auto;
                scrollbar-width: none;
            }
            .iv-cards-filters::-webkit-scrollbar { display: none; }
            .iv-cards-actions { display: flex; flex-shrink: 0; align-items: center; gap: 8px; }
            .iv-chip,
            .iv-action {
                display: inline-flex;
                flex-shrink: 0;
                align-items: center;
                gap: 6px;
                height: 36px;
                padding: 0 12px 0 14px;
                border: 1px solid var(--iv-border);
                border-radius: 999px;
                background: var(--iv-surface);
                color: var(--iv-text);
                font-family: inherit;
                font-size: 14px;
                font-weight: 500;
                line-height: 1;
                white-space: nowrap;
                cursor: pointer;
                transition: background 0.15s ease, border-color 0.15s ease;
            }
            .iv-chip:hover,
            .iv-action:hover,
            .iv-chip[aria-expanded="true"],
            .iv-action[aria-expanded="true"] {
                border-color: color-mix(in srgb, var(--iv-text) 22%, transparent);
                background: var(--iv-surface-hover);
            }
            .iv-chip svg,
            .iv-action svg { flex-shrink: 0; width: 18px; height: 18px; }
            .iv-chip > svg:last-child { width: 16px; height: 16px; margin-left: -2px; color: var(--iv-muted); }
            .iv-chip-label { color: var(--iv-muted); }
            .iv-chip-value { font-weight: 600; }
            .iv-action.is-icon { justify-content: center; width: 36px; padding: 0; }
            .iv-action.is-primary {
                border-color: transparent;
                background: var(--iv-accent);
                color: var(--iv-accent-text);
                font-weight: 600;
            }
            .iv-action.is-primary:hover { border-color: transparent; background: var(--iv-accent); filter: brightness(1.08); }
            .iv-action[hidden] { display: none; }
            /* Immich's grid chosen: our bar above it holds the view chip. */
            .iv-native-bar {
                position: absolute;
                top: 0;
                right: 0;
                left: 0;
                z-index: 2;
                display: flex;
                align-items: center;
                height: 56px;
                padding: 0 16px;
                background: var(--iv-page-bg);
            }
            html.iv-native-bar-on main > div.absolute.top-0 { top: 56px; height: calc(100% - 56px); }
            .iv-native-chip { flex: none; }

            /* Sharing: Immich's header buttons drawn as the albums bar's. */
            html.iv-sharing-page .border-b:has(#user-page-header) .md\\:block > div { gap: 8px; }
            html.iv-sharing-page .border-b:has(#user-page-header) .md\\:block button {
                height: 36px;
                padding: 0 14px;
                border: 1px solid var(--iv-border);
                border-radius: 999px;
                background: var(--iv-surface);
                color: var(--iv-text);
                font-weight: 600;
            }
            html.iv-sharing-page .border-b:has(#user-page-header) .md\\:block button:hover { background: var(--iv-surface-hover); }
            html.iv-sharing-page .border-b:has(#user-page-header) .md\\:block button:first-child {
                border-color: transparent;
                background: var(--iv-accent);
                color: var(--iv-accent-text);
            }
            .iv-cards-count { flex-shrink: 0; padding: 0 4px; color: var(--iv-muted); font-size: 13px; white-space: nowrap; }

            /* Popup menus of the action bar, in Immich's theme. */
            .iv-popup { min-width: 220px; max-height: min(70vh, 520px); overflow-y: auto; }
            .iv-popup .iv-menu-entry svg { color: var(--iv-muted); }
            .iv-popup .iv-menu-entry.is-danger svg { color: inherit; }
            .iv-popup .iv-menu-check { margin-left: auto; padding-left: 16px; color: var(--iv-accent) !important; visibility: hidden; }
            .iv-popup .iv-menu-entry[aria-checked="true"] { font-weight: 600; }
            .iv-popup .iv-menu-entry[aria-checked="true"] .iv-menu-check { visibility: visible; }
            .iv-menu-heading { padding: 8px 12px 4px; color: var(--iv-muted); font-size: 12px; font-weight: 600; }

            /* In the card view the album's top bar keeps only Back: its
               actions live in the action bar and its menu. */
            /* In an album the card view takes the whole height: Immich's top
               bar goes (its buttons stay in the DOM for the menus to click)
               and Back moves into the page. */
            html.iv-cards-on.iv-cards-album #control-bar,
            html.iv-cards-on .iv-cards-toggle { display: none !important; }
            html.iv-cards-on.iv-cards-album #iv-cards { padding-top: 0; }
            .iv-cards-back {
                display: grid;
                place-items: center;
                flex-shrink: 0;
                width: 40px;
                height: 40px;
                margin: 8px 0 0 -8px;
                padding: 0;
                border: 0;
                border-radius: 999px;
                background: transparent;
                color: var(--iv-text);
                cursor: pointer;
            }
            .iv-cards-back:hover { background: var(--iv-surface-hover); }
            .iv-cards-back svg { width: 24px; height: 24px; }
            /* Once the bar is pinned, Back slides in at its start and nudges
               the chips to the right, so one row holds both. */
            .iv-cards-bar .iv-cards-back {
                width: 0;
                margin: 0 -12px 0 0;
                overflow: hidden;
                opacity: 0;
                transform: translateX(-12px);
                transition: width 0.22s ease, margin 0.22s ease, opacity 0.18s ease, transform 0.22s ease;
                pointer-events: none;
            }
            .iv-cards-bar.is-stuck .iv-cards-back {
                width: 36px;
                margin: 0 0 0 -6px;
                opacity: 1;
                transform: none;
                pointer-events: auto;
            }
            .iv-cards-bar.is-stuck { border-bottom-color: var(--iv-border); }
            .iv-cards-sentinel { height: 1px; margin-bottom: -1px; }

            /* Editing: titles turn into fields in place. */
            #iv-cards.is-editing .iv-card-title {
                margin-inline: 0;
                padding: 2px 4px;
                border-radius: 6px;
                outline: 1px dashed color-mix(in srgb, var(--iv-text) 30%, transparent);
                outline-offset: 0;
                cursor: text;
            }
            #iv-cards.is-editing .iv-card-title:hover { background: color-mix(in srgb, var(--iv-text) 6%, transparent); }
            #iv-cards.is-editing .iv-card-title:focus {
                display: block;
                overflow: visible;
                white-space: normal;
                overflow-wrap: anywhere;
                background: var(--iv-surface);
                outline: 2px solid var(--iv-accent);
                -webkit-line-clamp: unset;
            }
            .iv-card-title.is-saving { opacity: 0.5; }
            .iv-card-title.is-error { outline: 2px solid var(--iv-danger) !important; }

            .iv-cards-toggle {
                display: grid;
                place-items: center;
                flex-shrink: 0;
                width: 40px;
                height: 40px;
                border: 0;
                border-radius: 999px;
                background: transparent;
                color: inherit;
                cursor: pointer;
            }
            .iv-cards-toggle:hover { background: color-mix(in srgb, currentColor 10%, transparent); }
            .iv-cards-toggle.is-active { color: var(--iv-accent); }

            /* Phones: the player keeps what fits in one row; seeking is a
               swipe or the bar there. */
            @media (max-width: 640px) {
                ${PLAYER} div:has(> immich-time-range) { padding: 40px 8px 8px !important; }
                ${PLAYER} media-control-bar { gap: 0 !important; }
                ${PLAYER} media-control-bar > :is(.iv-pip, .iv-autoplay, .iv-previous, .iv-next, .volume-wrapper, .iv-boost) { display: none !important; }
                ${PLAYER} media-control-bar > media-time-display { margin-left: 4px; font-size: 12px; }
            }

            /* Phones: smaller rows and header, a one-line toolbar. */
            @media (max-width: 640px) {
                .iv-cards-scroll { padding: 4px 8px 32px; }
                .iv-cards-head { gap: 14px; padding: 8px 4px 4px; }
                .iv-cards-back { margin-left: -4px; }
                .iv-cards-bar.is-stuck .iv-cards-back { width: 34px; margin-left: -2px; }
                .iv-cards-cover { width: 88px; height: 88px; border-radius: 14px; }
                .iv-cards-head h1 { font-size: 28px; }
                .iv-cards-sub { margin-top: 6px; font-size: 13px; }
                .iv-cards-bar { top: -4px; gap: 8px; margin: 0 -8px; padding: 8px; }
                .iv-chip,
                .iv-action { height: 34px; padding: 0 10px 0 12px; font-size: 13px; }
                .iv-action.is-icon { width: 34px; }
                /* Only the menu stays on the right; the view chip keeps its icon. */
                .iv-chip-label,
                .iv-cards-count,
                [data-pick="view"] .iv-chip-value,
                [data-action="slideshow"],
                [data-action="share"] { display: none !important; }
                .iv-action-label { display: none; }
                .iv-action.is-primary { width: 34px; padding: 0; justify-content: center; }
                .iv-cards-month h2 { margin: 18px 4px 8px; font-size: 17px; }
                .iv-cards-grid { --iv-row-h: 150px; gap: 8px 4px; }
                .iv-card { padding: 4px; border-radius: 12px; }
                .iv-card-thumb { border-radius: 10px; }
                .iv-card-title { margin-top: 6px; font-size: 13px; }
                .iv-card-meta,
                .iv-card-place { font-size: 12px; }
                #iv-cards.is-grid .iv-cards-grid { --iv-row-h: 110px; gap: 2px; }
            }
        `);

        // ---------------------------------------------------------------------
        //  Player
        // ---------------------------------------------------------------------
        const enhancedPlayers = new WeakSet();
        const trackedVideos = new WeakSet();
        let dialControls = [];
        let hudTimer = 0;

        function activePlayer() {
            for (const controller of document.querySelectorAll(PLAYER)) {
                if (controller.querySelector('media-settings-menu-button')) return controller;
            }
            return null;
        }

        function activeVideo() {
            return activePlayer()?.querySelector('[slot="media"]') ?? null;
        }

        function applyRate(video, rate = state.rate) {
            video.defaultPlaybackRate = rate;
            if (video.playbackRate !== rate) video.playbackRate = rate;
        }

        function setRate(rate, { hud = true } = {}) {
            state.rate = clampRate(rate);
            setSetting('rate', state.rate);
            const video = activeVideo();
            if (video) applyRate(video);
            syncDials();
            if (hud) showHud(formatRate(state.rate));
        }

        // ---------------------------------------------------------------------
        //  Audio boost: element volume tops out at 100%, so louder needs a Web
        //  Audio gain stage. createMediaElementSource reroutes the element's
        //  output through the context for good, and a suspended context plays
        //  silence, so the graph is only built once the context is running
        //  (which needs a user gesture) and only when a boost is wanted.
        // ---------------------------------------------------------------------
        let audioContext = null;
        const audioGains = new WeakMap();

        function applyBoost(video) {
            const gain = audioGains.get(video);
            if (gain) {
                gain.gain.value = state.boost;
                return;
            }
            if (state.boost === 1 || audioContext?.state !== 'running') return;
            try {
                const source = audioContext.createMediaElementSource(video);
                const node = audioContext.createGain();
                node.gain.value = state.boost;
                source.connect(node).connect(audioContext.destination);
                audioGains.set(video, node);
            } catch (error) {
                console.warn('[immich-player] audio boost unavailable', error);
            }
        }

        function unlockAudio() {
            if (state.boost === 1) return;
            try {
                audioContext ??= new AudioContext();
            } catch {
                return;
            }
            const video = activeVideo();
            if (audioContext.state === 'running') {
                if (video) applyBoost(video);
                return;
            }
            audioContext.resume().then(() => {
                const current = activeVideo();
                if (current) applyBoost(current);
            }).catch(() => {});
        }

        for (const type of ['pointerdown', 'keydown']) {
            window.addEventListener(type, unlockAudio, true);
        }

        function setBoost(boost, { hud = true } = {}) {
            state.boost = clampBoost(boost);
            setSetting('boost', state.boost);
            unlockAudio();
            const video = activeVideo();
            if (video) applyBoost(video);
            syncPlayerControls();
            if (hud) showHud(`Áudio ${formatBoost(state.boost)}`);
        }

        function showHud(text) {
            const viewer = document.querySelector(VIEWER);
            if (!viewer) return;
            let hud = viewer.querySelector('.iv-hud');
            if (!hud) {
                hud = document.createElement('div');
                hud.className = 'iv-hud';
                viewer.append(hud);
            }
            hud.textContent = text;
            hud.classList.add('is-visible');
            clearTimeout(hudTimer);
            hudTimer = setTimeout(() => hud.classList.remove('is-visible'), 700);
        }

        function trackVideo(video) {
            if (trackedVideos.has(video)) return;
            trackedVideos.add(video);
            applyRate(video);
            applyBoost(video);
            // A new src resets playbackRate to defaultPlaybackRate, but media-chrome
            // and Svelte may also touch it while loading. Re-assert on each load.
            video.addEventListener('loadedmetadata', () => {
                applyRate(video);
                video.loop = state.loop;
            });
            video.addEventListener('play', () => {
                applyRate(video);
                applyBoost(video);
            });
            // Keep a rate changed by anything else, such as media-chrome.
            video.addEventListener('ratechange', () => {
                if (video.readyState === 0 || video.playbackRate === state.rate) return;
                state.rate = clampRate(video.playbackRate);
                setSetting('rate', state.rate);
                syncDials();
            });
        }

        // A dial is a control-bar button that opens a popover with a slider and
        // presets, for the speed.
        const DIALS = {
            rate: {
                label: 'Velocidade de reprodução',
                hint: 'Shift + &lt; / &gt;',
                min: RATE_MIN,
                max: RATE_MAX,
                presets: RATE_PRESETS,
                format: formatRate,
                value: () => state.rate,
                set: value => setRate(value, { hud: false }),
                button: value => `${icon(ICONS.speed, 22)}<span class="iv-badge">${value === 1 ? '' : Number(value.toFixed(2))}</span>`,
            },
        };

        function buildDial(name) {
            const dial = DIALS[name];
            const root = document.createElement('div');
            root.className = `iv-dial iv-dial-${name}`;
            root.dataset.dial = name;
            root.innerHTML = `
                <button type="button" class="iv-dial-button" title="${dial.label}" aria-label="${dial.label}" aria-haspopup="true"></button>
                <div class="iv-dial-popover" role="dialog" aria-label="${dial.label}">
                    <div class="iv-dial-head">
                        <span class="iv-dial-title">${dial.label}</span>
                        <span class="iv-dial-hint">${dial.hint}</span>
                    </div>
                    <div class="iv-dial-value"></div>
                    <input class="iv-dial-range" type="range" min="${dial.min}" max="${dial.max}" step="0.05" aria-label="${dial.label}">
                    <div class="iv-dial-presets">
                        ${dial.presets.map(value => `<button type="button" data-value="${value}">${dial.format(value)}</button>`).join('')}
                    </div>
                </div>
            `;
            const range = root.querySelector('.iv-dial-range');

            // media-chrome toggles playback on pointer events that reach it.
            for (const type of ['click', 'pointerdown', 'pointerup', 'dblclick', 'keydown']) {
                root.addEventListener(type, event => event.stopPropagation());
            }
            root.querySelector('.iv-dial-button').addEventListener('click', () => {
                for (const other of dialControls) {
                    if (other !== root) other.classList.remove('is-open');
                }
                root.classList.toggle('is-open');
            });
            range.addEventListener('input', () => dial.set(Number(range.value)));
            root.querySelector('.iv-dial-presets').addEventListener('click', event => {
                const preset = event.target.closest('[data-value]');
                if (preset) dial.set(Number(preset.dataset.value));
            });
            dialControls.push(root);
            return root;
        }

        function syncDials() {
            dialControls = dialControls.filter(root => root.isConnected);
            for (const root of dialControls) {
                const dial = DIALS[root.dataset.dial];
                const value = dial.value();
                const button = root.querySelector('.iv-dial-button');
                button.innerHTML = dial.button(value);
                root.querySelector('.iv-dial-value').textContent = dial.format(value);
                root.querySelector('.iv-dial-range').value = String(value);
                for (const preset of root.querySelectorAll('[data-value]')) {
                    preset.classList.toggle('is-active', Number(preset.dataset.value) === value);
                }
            }
        }

        document.addEventListener('pointerdown', event => {
            for (const root of dialControls) {
                if (!root.contains(event.target)) root.classList.remove('is-open');
            }
        });

        function enhancePlayer(controller) {
            const video = controller.querySelector('[slot="media"]');
            if (video) trackVideo(video);
            if (enhancedPlayers.has(controller)) return;

            const timeDisplay = controller.querySelector('media-control-bar media-time-display');
            if (!timeDisplay) return;
            enhancedPlayers.add(controller);

            const speed = buildDial('rate');
            // Like YouTube's: one click turns the amplifier on at its top
            // level, another turns it off; Shift+↑/↓ fine-tunes it.
            const boost = controlButton('iv-boost', 'Amplificador', ICONS.boost, () => setBoost(state.boost > 1 ? 1 : BOOST_MAX));
            boost.insertAdjacentHTML('beforeend', '<span class="iv-badge is-on">ON</span>');
            const previous = controlButton('iv-previous', 'Anterior', ICONS.previous, () => stepAsset('previous'));
            const next = controlButton('iv-next', 'Próximo', ICONS.next, () => stepAsset('next'));
            const loop = controlButton('iv-loop', 'Repetir', ICONS.loop, toggleLoop);
            loop.insertAdjacentHTML('beforeend', '<span class="iv-badge is-on">ON</span>');
            const autoplay = controlButton('iv-autoplay', 'Autoplay', '', toggleAutoplay);
            autoplay.innerHTML = `<span class="iv-autoplay-track"><span class="iv-autoplay-thumb">${icon(ICONS.pause, 10).replace('<svg', '<svg class="iv-autoplay-off"')}${icon(ICONS.play, 10).replace('<svg', '<svg class="iv-autoplay-on"')}</span></span>`;
            const pip = controlButton('iv-pip', 'Picture-in-picture', ICONS.pip, togglePictureInPicture);
            pip.hidden = !document.pictureInPictureEnabled;
            // Placement comes from the CSS order rules, so these only need to sit
            // next to static nodes, away from Svelte's block anchors.
            timeDisplay.after(loop, previous, next, autoplay, ...buildMarkControls(controller), boost, speed, pip);
            buildPreview(controller);
            // media-chrome hides the controls 2s after the last input, paused
            // or not; on a touch screen a tap is the only input, so they
            // flashed. Keep them while paused, and longer after a tap.
            if (video && matchMedia('(pointer: coarse)').matches) {
                const syncAutohide = () => controller.setAttribute('autohide', video.paused ? '-1' : '4');
                video.addEventListener('play', syncAutohide);
                video.addEventListener('pause', syncAutohide);
                syncAutohide();
                bindTouchGestures(controller);
            }
            renderMarks();
            syncDials();
            syncPlayerControls();
        }

        // Touch gestures, YouTube style: a double tap on the left or right
        // third seeks TAP_SEEK seconds, each further quick tap adds as much;
        // a vertical drag sets the brightness on the left half and the volume
        // on the right. iOS does not let a page set the volume, so there the
        // whole width sets the brightness.
        const TAP_SEEK = 10;
        const IOS = /iP(hone|ad|od)/.test(navigator.platform) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
        let brightness = 1;

        function applyBrightness(video) {
            video.style.filter = brightness === 1 ? '' : `brightness(${brightness})`;
        }

        function bindTouchGestures(controller) {
            const media = () => controller.querySelector('[slot="media"]');
            const onMedia = target => !target.closest('media-control-bar, immich-time-range, .iv-dial, .iv-mark-ticks, .iv-preview, button');
            let start = null;
            let last = { time: 0, side: 0 };
            let streak = 0;
            let consumed = false;

            const sideOf = x => {
                const rect = controller.getBoundingClientRect();
                const share = (x - rect.left) / rect.width;
                return share < 1 / 3 ? -1 : share > 2 / 3 ? 1 : 0;
            };

            controller.addEventListener('pointerdown', event => {
                consumed = false;
                if (!prefs.touchGestures || event.pointerType !== 'touch' || !onMedia(event.target)) {
                    start = null;
                    return;
                }
                const video = media();
                start = { x: event.clientX, y: event.clientY, time: Date.now(), mode: null, value: 0 };
                if (video) applyBrightness(video);
            }, true);

            controller.addEventListener('pointermove', event => {
                const video = media();
                if (!start || !video || event.pointerType !== 'touch') return;
                const dx = event.clientX - start.x;
                const dy = start.y - event.clientY;
                if (!start.mode) {
                    if (Math.abs(dy) < 16 || Math.abs(dy) < Math.abs(dx) * 1.5) return;
                    const rect = controller.getBoundingClientRect();
                    start.mode = !IOS && start.x > rect.left + rect.width / 2 ? 'volume' : 'brightness';
                    start.value = start.mode === 'volume' ? (video.muted ? 0 : video.volume) : brightness;
                    start.height = rect.height;
                }
                event.stopPropagation();
                const value = start.value + dy / (start.height * 0.7);
                if (start.mode === 'volume') {
                    video.muted = false;
                    video.volume = Math.min(1, Math.max(0, value));
                    showHud(`Volume ${Math.round(video.volume * 100)}%`);
                } else {
                    brightness = Math.min(1.5, Math.max(0.2, value));
                    applyBrightness(video);
                    showHud(`Brilho ${Math.round(brightness * 100)}%`);
                }
            }, true);

            controller.addEventListener('pointerup', event => {
                const video = media();
                const begun = start;
                start = null;
                if (!begun || !video || event.pointerType !== 'touch') return;
                if (begun.mode) {
                    consumed = true;
                    event.stopPropagation();
                    return;
                }
                const moved = Math.hypot(event.clientX - begun.x, event.clientY - begun.y);
                const now = Date.now();
                if (moved > 12 || now - begun.time > 300) return;
                const side = sideOf(event.clientX);
                const quick = now - last.time < (streak ? 700 : 350);
                if (side && side === last.side && quick) {
                    streak++;
                    seekBy(video, side * TAP_SEEK);
                    showHud(side < 0 ? `« ${streak * TAP_SEEK}s` : `${streak * TAP_SEEK}s »`);
                    consumed = true;
                    event.stopPropagation();
                } else {
                    streak = 0;
                }
                last = { time: now, side };
            }, true);

            // The tap that seeks must not also pause or go full screen.
            for (const type of ['click', 'dblclick']) {
                controller.addEventListener(type, event => {
                    if (!consumed && !(type === 'dblclick' && sideOf(event.clientX))) return;
                    event.stopPropagation();
                    event.preventDefault();
                }, true);
            }
        }

        function controlButton(className, label, path, onClick, iconLabel = '') {
            const button = document.createElement('button');
            button.type = 'button';
            button.className = `iv-control ${className}`;
            button.title = label;
            button.setAttribute('aria-label', label);
            button.innerHTML = icon(path, 24, iconLabel);
            for (const type of ['pointerdown', 'pointerup', 'dblclick', 'keydown']) {
                button.addEventListener(type, event => event.stopPropagation());
            }
            button.addEventListener('click', event => {
                event.stopPropagation();
                onClick();
            });
            return button;
        }

        // Immich's own previous/next arrows sit in the first and last grid
        // columns of the viewer; driving them keeps its navigation logic intact.
        function assetNavButton(direction) {
            const column = direction === 'previous' ? 'col-start-1' : 'col-start-4';
            return document.querySelector(`${VIEWER} > div.${column}.row-span-full button`);
        }

        // Inside an album, previous and next follow the sidebar instead: the
        // album page's order, narrowed by the sidebar's filter.
        let immichStepping = false;

        function immichStep(direction) {
            immichStepping = true;
            try {
                assetNavButton(direction)?.click();
            } finally {
                immichStepping = false;
            }
        }

        async function albumNeighbor(direction, { videosOnly = false } = {}) {
            const match = ALBUM_ASSET_RE.exec(location.pathname);
            if (!match) return null;
            const [, albumId, assetId] = match;
            const album = await albumData(albumId);
            const items = orderedAlbumItems(album.items, albumOrder());
            const index = items.findIndex(item => item.id === assetId);
            if (index < 0) return null;
            const ahead = direction === 'next' ? items.slice(index + 1) : items.slice(0, index).reverse();
            const accepts = item => videosOnly
                ? item.isVideo
                : state.filter === 'all' || (state.filter === 'video') === item.isVideo;
            return { albumId, item: ahead.find(accepts) ?? null };
        }

        async function stepAsset(direction) {
            try {
                const step = await albumNeighbor(direction);
                if (step) {
                    if (step.item) navigateTo(`/albums/${step.albumId}/photos/${step.item.id}`);
                    else showHud(direction === 'next' ? 'Fim do álbum' : 'Início do álbum');
                    return;
                }
            } catch (error) {
                console.warn('[immich-player] could not read the album order', error);
            }
            immichStep(direction);
        }

        // Immich's own arrows in the viewer, too.
        document.addEventListener('click', event => {
            if (immichStepping || !ALBUM_ASSET_RE.test(location.pathname)) return;
            for (const direction of ['previous', 'next']) {
                if (!assetNavButton(direction)?.contains(event.target)) continue;
                consume(event);
                stepAsset(direction);
                return;
            }
        }, true);

        function syncPlayerControls() {
            const inAlbum = ALBUM_ASSET_RE.test(location.pathname);
            for (const direction of ['previous', 'next']) {
                const button = document.querySelector(`${PLAYER} .iv-${direction}`);
                if (button) button.disabled = !inAlbum && !assetNavButton(direction);
            }
            // Svelte re-applies its own loop value whenever the player re-renders.
            const video = activeVideo();
            if (video && video.loop !== state.loop) video.loop = state.loop;
            const autoplay = document.querySelector(`${PLAYER} .iv-autoplay`);
            if (autoplay && autoplay.getAttribute('aria-pressed') !== String(state.autoplay)) {
                autoplay.classList.toggle('is-active', state.autoplay);
                autoplay.setAttribute('aria-pressed', String(state.autoplay));
                autoplay.title = state.autoplay ? 'Autoplay: ligado (próximo vídeo ao terminar)' : 'Autoplay: desligado';
            }
            const boost = document.querySelector(`${PLAYER} .iv-boost`);
            const boostTitle = `Amplificador ${state.boost > 1 ? 'ligado' : 'desligado'}: ${formatBoost(state.boost)} (Shift+↑ / Shift+↓)`;
            if (boost && boost.title !== boostTitle) {
                boost.classList.toggle('is-active', state.boost > 1);
                boost.setAttribute('aria-pressed', String(state.boost > 1));
                boost.title = boostTitle;
                boost.setAttribute('aria-label', boostTitle);
            }
            const loop = document.querySelector(`${PLAYER} .iv-loop`);
            if (loop && loop.getAttribute('aria-pressed') !== String(state.loop)) {
                loop.classList.toggle('is-active', state.loop);
                loop.setAttribute('aria-pressed', String(state.loop));
                loop.title = state.loop ? 'Repetir: ligado' : 'Repetir: desligado';
            }
        }

        function toggleAutoplay() {
            state.autoplay = !state.autoplay;
            setSetting('autoplay', state.autoplay);
            if (state.autoplay && state.loop) {
                state.loop = false;
                setSetting('loop', false);
            }
            syncPlayerControls();
            showHud(state.autoplay ? 'Autoplay ligado' : 'Autoplay desligado');
        }

        function toggleLoop() {
            state.loop = !state.loop;
            setSetting('loop', state.loop);
            if (state.loop && state.autoplay) {
                state.autoplay = false;
                setSetting('autoplay', false);
            }
            syncPlayerControls();
            showHud(state.loop ? 'Repetir ligado' : 'Repetir desligado');
        }

        // The end of a video is ours to decide: Immich would advance to the next
        // asset (photo or not) on its own. A capture listener on the document
        // runs before the element's own handler and can stop it. Loop never
        // reaches here, since a looping video does not fire "ended".
        document.addEventListener('ended', event => {
            const video = event.target;
            if (!(video instanceof HTMLVideoElement) || video !== activeVideo()) return;
            event.stopImmediatePropagation();
            if (video === watch.video) {
                saveProgress(watch.assetId, { t: video.duration, d: video.duration }, { done: true });
                watch.last = null;
            }
            if (state.autoplay) playNextVideo();
        }, true);

        // Inside an album the next *video* is known from the album listing, in
        // the album page's order, so photos in between are skipped. Elsewhere,
        // fall back to the next asset.
        async function playNextVideo() {
            try {
                const step = await albumNeighbor('next', { videosOnly: true });
                if (step) {
                    if (!step.item) {
                        showHud('Fim dos vídeos do álbum');
                        return;
                    }
                    showHud('Próximo vídeo');
                    navigateTo(`/albums/${step.albumId}/photos/${step.item.id}`);
                    return;
                }
            } catch (error) {
                console.warn('[immich-player] autoplay could not read the album', error);
            }
            immichStep('next');
        }

        // SvelteKit routes clicks on same-origin anchors client-side.
        function navigateTo(href) {
            const link = document.createElement('a');
            link.href = href;
            link.hidden = true;
            document.body.append(link);
            link.click();
            link.remove();
        }

        async function togglePictureInPicture() {
            const video = activeVideo();
            if (!video) return;
            try {
                if (document.pictureInPictureElement) {
                    await document.exitPictureInPicture();
                } else {
                    // Immich sets disablepictureinpicture on the element.
                    video.disablePictureInPicture = false;
                    await video.requestPictureInPicture();
                }
            } catch (error) {
                showHud('Picture-in-picture indisponível');
                console.warn('[immich-player] picture-in-picture failed', error);
            }
        }

        // ---------------------------------------------------------------------
        //  Video marks: named points in a video, saved on the server in the
        //  asset's own metadata (a free key/value store Immich keeps per
        //  asset), so every browser running this script sees them. Immich
        //  itself does not show them. A mark button adds one at the current
        //  time, a list button opens them all, and the progress bar shows a
        //  tick for each; Shift+M marks, [ and ] jump between them.
        // ---------------------------------------------------------------------
        const MARKS_KEY = 'immich-player-markers';
        const ASSET_ID_RE = /\/photos\/([0-9a-f-]{36})\/?$/;
        const marks = { assetId: null, list: [], loaded: false, duration: 0 };
        let marksControls = [];

        const formatMarkTime = seconds => formatDuration(Math.floor(seconds) * 1000) || '0:00';
        const markLabel = (mark, index) => mark.label || `Marcação ${index + 1}`;
        // A mark is a moment, or an interval when it has an end.
        const markSpan = mark => mark.end ? `${formatMarkTime(mark.t)}–${formatMarkTime(mark.end)}` : formatMarkTime(mark.t);
        const roundMark = seconds => Math.round(seconds * 10) / 10;

        function cleanMarks(value) {
            const list = Array.isArray(value?.markers) ? value.markers : [];
            return list
                .filter(mark => Number.isFinite(mark?.t) && mark.t >= 0)
                .map(mark => ({
                    t: roundMark(mark.t),
                    ...(Number.isFinite(mark.end) && mark.end > mark.t ? { end: roundMark(mark.end) } : {}),
                    label: typeof mark.label === 'string' ? mark.label.trim() : '',
                }))
                .sort((a, b) => a.t - b.t);
        }

        // An asset without marks has no such key, which the API answers
        // with an error; that is just an empty list.
        async function fetchMarks(assetId) {
            try {
                return cleanMarks((await api(`/assets/${assetId}/metadata/${MARKS_KEY}`))?.value);
            } catch {
                return [];
            }
        }

        function syncMarks() {
            const assetId = activeVideo() ? ASSET_ID_RE.exec(location.pathname)?.[1] ?? null : null;
            if (assetId === marks.assetId) return;
            marks.assetId = assetId;
            marks.list = [];
            marks.loaded = false;
            marks.duration = 0;
            renderMarks();
            if (!assetId) return;
            // The asset's own duration places the ticks before the video has
            // loaded its metadata.
            const duration = api(`/assets/${assetId}`).then(asset => durationMs(asset.duration) / 1000).catch(() => 0);
            Promise.all([fetchMarks(assetId), duration]).then(([list, seconds]) => {
                if (marks.assetId !== assetId) return;
                marks.list = list;
                marks.loaded = true;
                marks.duration = seconds;
                updateInfo(assetId, { marks: list });
                renderMarks();
            });
        }

        async function saveMarks() {
            const { assetId, list } = marks;
            if (!assetId) return;
            updateInfo(assetId, { marks: list });
            try {
                if (list.length) {
                    await api(`/assets/${assetId}/metadata`, {
                        method: 'PUT',
                        body: { items: [{ key: MARKS_KEY, value: { markers: list } }] },
                    });
                } else {
                    await api(`/assets/${assetId}/metadata/${MARKS_KEY}`, { method: 'DELETE' }).catch(() => {});
                }
            } catch (error) {
                showHud('Não foi possível salvar as marcações');
                console.warn('[immich-player] marks save failed', error);
            }
        }

        // "1:02:03", "62:03" or "45", seconds possibly with a fraction;
        // null for anything else.
        function parseMarkTime(text) {
            const parts = text.trim().replace(',', '.').split(':');
            if (!parts[0] || parts.length > 3 || parts.some(part => !/^\d+(\.\d+)?$/.test(part))) return null;
            return parts.reduce((total, part) => total * 60 + Number(part), 0);
        }

        function markDuration() {
            const video = activeVideo();
            return video && Number.isFinite(video.duration) && video.duration > 0 ? video.duration : marks.duration;
        }

        // A typed time must fall inside the video and away from other marks.
        function checkMarkTime(t, except = -1, end = null) {
            const duration = markDuration();
            if (t === null || (duration && (end ?? t) > duration)) {
                showHud(duration ? `Tempo fora do vídeo (até ${formatMarkTime(duration)})` : 'Tempo inválido');
                return false;
            }
            if (marks.list.some((mark, index) => index !== except && Math.abs(mark.t - t) < 0.5)) {
                showHud('Já existe uma marcação aqui');
                return false;
            }
            return true;
        }

        function addMark(at = null) {
            const video = activeVideo();
            if (!video || !marks.assetId) return;
            const t = Math.round((at ?? video.currentTime) * 10) / 10;
            if (!checkMarkTime(t)) return;
            marks.list = [...marks.list, { t, label: '' }].sort((a, b) => a.t - b.t);
            showHud(`Marcação em ${formatMarkTime(t)}`);
            renderMarks();
            saveMarks();
            // With the list open, the new mark's name is ready to type.
            const index = marks.list.findIndex(mark => mark.t === t);
            document.querySelector(`${PLAYER} .iv-marks.is-open .iv-mark-row:nth-child(${index + 1}) .iv-mark-label`)?.focus();
        }

        const MARK_TIME = /(?<![\d:])(?:\d{1,2}:)?\d{1,3}:\d{2}(?![\d:])/g;
        // What may sit between an interval's two times.
        const MARK_RANGE = /^\s*(?:[-–—~]|to|a|até)\s*$/i;

        // A pasted list: "12:30 - 15:00, 1:02:10" or one mark per line, as
        // in YouTube comments and chapters: "1:23 Name", "1:23 - Name",
        // "[1:23] Name", "Name (1:23)", "1. 1:23 Name". Two times joined by
        // a dash, "~", "to", "a" or "até" make an interval. Text on a line
        // with a single mark becomes its name.
        function parseMarkList(text) {
            const found = [];
            for (const line of text.split(/\r?\n/)) {
                const times = [...line.matchAll(MARK_TIME)];
                const entries = [];
                for (let i = 0; i < times.length; i++) {
                    const start = times[i];
                    const next = times[i + 1];
                    const between = next && line.slice(start.index + start[0].length, next.index);
                    const t = parseMarkTime(start[0]);
                    const end = next && MARK_RANGE.test(between) ? parseMarkTime(next[0]) : null;
                    if (end !== null && end > t) {
                        entries.push({ t, end, text: line.slice(start.index, next.index + next[0].length) });
                        i++;
                    } else {
                        entries.push({ t, end: null, text: start[0] });
                    }
                }
                const label = entries.length === 1
                    ? line.replace(/^\s*(?:\d+[.)]\s+|[-*•·]\s*)/, '')
                        .replace(entries[0].text, '\u0000')
                        .replace(/[[(]?\u0000[\])]?/, ' ')
                        .replace(/^[\s\-–—:|•·.,]+|[\s\-–—:|•·,]+$/g, '')
                        .replace(/\s{2,}/g, ' ')
                    : '';
                for (const { t, end } of entries) found.push({ t, end, label });
            }
            return found;
        }

        function addMarkList(text) {
            if (!marks.assetId) return false;
            const duration = markDuration();
            let added = 0;
            let skipped = 0;
            for (const { t, end, label } of parseMarkList(text)) {
                const mark = { t: roundMark(t), ...(end ? { end: roundMark(end) } : {}), label: label.slice(0, 200) };
                if ((duration && (mark.end ?? mark.t) > duration) || marks.list.some(other => Math.abs(other.t - mark.t) < 0.5)) {
                    skipped++;
                    continue;
                }
                marks.list.push(mark);
                added++;
            }
            if (!added && !skipped) return false;
            marks.list.sort((a, b) => a.t - b.t);
            showHud(`${added} ${added === 1 ? 'marcação adicionada' : 'marcações adicionadas'}${skipped ? ` · ${skipped} ignorada${skipped === 1 ? '' : 's'}` : ''}`);
            renderMarks();
            if (added) saveMarks();
            return true;
        }

        // The time field takes "1:23" or an interval, "1:23 - 2:10".
        function retimeMark(index, text) {
            const mark = marks.list[index];
            const parsed = parseMarkList(text);
            const next = parsed.length === 1 && !parsed[0].label ? parsed[0] : null;
            if (!mark || !next) {
                if (text.trim()) showHud('Tempo inválido');
                renderMarks();
                return;
            }
            const t = roundMark(next.t);
            const end = next.end ? roundMark(next.end) : null;
            if (t === mark.t && end === (mark.end ?? null)) {
                renderMarks();
                return;
            }
            if (!checkMarkTime(t, index, end)) {
                renderMarks();
                return;
            }
            mark.t = t;
            if (end) mark.end = end;
            else delete mark.end;
            marks.list.sort((a, b) => a.t - b.t);
            showHud(`${markLabel(mark, marks.list.indexOf(mark))} → ${markSpan(mark)}`);
            renderMarks();
            saveMarks();
        }

        function removeMark(index) {
            marks.list = marks.list.filter((_, position) => position !== index);
            renderMarks();
            saveMarks();
        }

        function renameMark(index, label) {
            const mark = marks.list[index];
            if (!mark || mark.label === label.trim()) return;
            mark.label = label.trim();
            renderMarks({ keepInputs: true });
            saveMarks();
        }

        function seekToMark(index, { play = false } = {}) {
            const video = activeVideo();
            const mark = marks.list[index];
            if (!video || !mark) return;
            video.currentTime = mark.t;
            if (play && video.paused) video.play().catch(() => {});
            showHud(`${markSpan(mark)} · ${markLabel(mark, index)}`);
        }

        // Back from just after a mark goes to the one before it, as a
        // chapter skip does.
        function jumpMark(direction) {
            const video = activeVideo();
            if (!video) return;
            const now = video.currentTime;
            const index = direction > 0
                ? marks.list.findIndex(mark => mark.t > now + 0.3)
                : marks.list.findLastIndex(mark => mark.t < now - 1);
            if (index === -1) showHud(marks.list.length ? 'Sem mais marcações' : 'Nenhuma marcação');
            else seekToMark(index);
        }

        function buildMarkControls(controller) {
            const add = controlButton('iv-mark-add', 'Marcar este momento (Shift+M)', ICONS.bookmarkPlus, addMark);

            const root = document.createElement('div');
            root.className = 'iv-dial iv-marks';
            root.innerHTML = `
                <button type="button" class="iv-dial-button" title="Marcações ([ e ] navegam)" aria-label="Marcações" aria-haspopup="true">${icon(ICONS.bookmarks, 22)}<span class="iv-badge iv-marks-count"></span></button>
                <div class="iv-dial-popover iv-marks-popover" role="dialog" aria-label="Marcações">
                    <div class="iv-dial-head">
                        <span class="iv-dial-title">Marcações</span>
                        <span class="iv-dial-hint">Shift+M marca · [ ] navegam</span>
                    </div>
                    <ol class="iv-mark-list"></ol>
                    <div class="iv-marks-empty">Nenhuma marcação neste vídeo.</div>
                    <div class="iv-marks-new">
                        <input class="iv-mark-time iv-marks-at" type="text" inputmode="numeric" spellcheck="false" placeholder="agora ou lista" aria-label="Tempo da nova marcação" title="Vazio marca o tempo atual; digite 1:23:45 ou cole uma lista (12:30, 1:02:10, …)">
                        <button type="button" class="iv-marks-add">${icon(ICONS.bookmarkPlus, 18)}<span></span></button>
                    </div>
                </div>
            `;
            // media-chrome toggles playback on pointer events that reach it.
            for (const type of ['click', 'pointerdown', 'pointerup', 'dblclick', 'keydown']) {
                root.addEventListener(type, event => event.stopPropagation());
            }
            root.querySelector('.iv-dial-button').addEventListener('click', () => {
                for (const other of dialControls) other.classList.remove('is-open');
                root.classList.toggle('is-open');
                renderMarks();
            });
            const at = root.querySelector('.iv-marks-at');
            const addTyped = () => {
                if (!at.value.trim()) {
                    addMark();
                    return;
                }
                const t = parseMarkTime(at.value);
                if (t === null) {
                    if (parseMarkList(at.value).length && addMarkList(at.value)) at.value = '';
                    else showHud('Tempo inválido');
                    renderMarks({ keepInputs: true });
                    return;
                }
                const count = marks.list.length;
                addMark(t);
                if (marks.list.length > count) at.value = '';
                renderMarks({ keepInputs: true });
            };
            root.querySelector('.iv-marks-add').addEventListener('click', addTyped);
            at.addEventListener('input', () => renderMarks({ keepInputs: true }));
            // A text field drops a paste's line breaks, and with them the
            // names in a chapter list, so a list is read from the clipboard.
            at.addEventListener('paste', event => {
                const text = event.clipboardData?.getData('text') ?? '';
                if (parseMarkList(text).length < 2) return;
                event.preventDefault();
                addMarkList(text);
                at.value = '';
                renderMarks({ keepInputs: true });
            });
            at.addEventListener('keydown', event => {
                if (event.key === 'Enter') addTyped();
                if (event.key === 'Escape') at.value = '';
            });
            const list = root.querySelector('.iv-mark-list');
            list.addEventListener('click', event => {
                const row = event.target.closest('.iv-mark-row');
                if (!row || event.target.closest('input')) return;
                const index = Number(row.dataset.index);
                if (event.target.closest('.iv-mark-remove')) removeMark(index);
                else seekToMark(index, { play: true });
            });
            list.addEventListener('change', event => {
                const input = event.target.closest('input');
                if (!input) return;
                const index = Number(input.closest('.iv-mark-row').dataset.index);
                if (input.classList.contains('iv-mark-time')) retimeMark(index, input.value);
                else renameMark(index, input.value);
            });
            list.addEventListener('keydown', event => {
                const input = event.target.closest('input');
                if (!input) return;
                if (event.key === 'Enter') input.blur();
                if (event.key === 'Escape') {
                    const mark = marks.list[Number(input.closest('.iv-mark-row').dataset.index)];
                    input.value = input.classList.contains('iv-mark-time') ? markSpan(mark ?? { t: 0 }) : mark?.label ?? '';
                    input.blur();
                }
            });

            // Ticks over the progress bar, laid over the range's own track
            // (8px in from its sides and its top).
            const range = controller.querySelector('immich-time-range');
            const ticks = document.createElement('div');
            ticks.className = 'iv-mark-ticks';
            ticks.addEventListener('click', event => {
                const tick = event.target.closest('.iv-mark-tick');
                if (!tick) return;
                event.stopPropagation();
                seekToMark(Number(tick.dataset.index));
            });
            for (const type of ['pointerdown', 'pointerup']) ticks.addEventListener(type, event => event.stopPropagation());
            if (range) {
                range.after(ticks);
                const observer = new ResizeObserver(() => placeTicks(range, ticks));
                observer.observe(range);
                observer.observe(range.parentElement);
            }
            const video = controller.querySelector('[slot="media"]');
            video?.addEventListener('durationchange', () => renderMarks());
            video?.addEventListener('timeupdate', () => markCurrentMark(root));

            marksControls.push({ root, ticks, range });
            return [add, root];
        }

        // Hover preview over the progress bar. Immich generates no storyboard,
        // so a hidden, muted copy of the transcoded video seeks to the time
        // under the pointer and its frame is drawn into a canvas. Kept cheap:
        // pointer moves are handled once per animation frame with all layout
        // reads before any write, one seek runs at a time and the latest
        // wanted time wins, fastSeek (nearest keyframe) is used where the
        // browser has it, and frames are cached per PREVIEW_STEP seconds. The
        // copy loads its metadata when the pointer enters the bar and is
        // released with the player. On touch it follows the finger while
        // dragging.
        const PREVIEW_STEP = 2;
        const PREVIEW_CACHE = 200;

        function buildPreview(controller) {
            const range = controller.querySelector('immich-time-range');
            const video = controller.querySelector('[slot="media"]');
            if (!range || !video) return;
            const box = document.createElement('div');
            box.className = 'iv-preview';
            box.hidden = true;
            box.innerHTML = '<canvas class="iv-preview-frame"></canvas><span class="iv-preview-label"></span><span class="iv-preview-time"></span>';
            range.parentElement.append(box);
            const canvas = box.querySelector('canvas');
            const context = canvas.getContext('2d', { alpha: false });
            const label = box.querySelector('.iv-preview-label');
            const time = box.querySelector('.iv-preview-time');
            const listeners = new AbortController();
            const { signal } = listeners;
            const frames = new Map();
            let probe = null;
            let shown = null;
            let wanted = null;
            let seeking = null;
            let busy = false;
            let dragging = false;
            let pending = null;
            let frameRequest = 0;

            function release() {
                listeners.abort();
                cancelAnimationFrame(frameRequest);
                frames.clear();
                if (probe) {
                    probe.removeAttribute('src');
                    probe.load();
                    probe = null;
                }
            }

            // The copy, created on first use and pointed at the current video.
            function ready() {
                const src = transcodedUrl(video.currentSrc || video.getAttribute('src') || '');
                if (!src) return false;
                if (!probe) {
                    probe = document.createElement('video');
                    probe.muted = true;
                    probe.playsInline = true;
                    probe.preload = 'metadata';
                    probe.addEventListener('seeked', captured, { signal });
                    probe.addEventListener('error', () => { busy = false; }, { signal });
                }
                if (probe.dataset.src !== src) {
                    probe.dataset.src = src;
                    probe.src = src;
                    frames.clear();
                    seeking = null;
                    busy = false;
                }
                return true;
            }

            function paint(frame) {
                context.drawImage(frame, 0, 0, canvas.width, canvas.height);
                canvas.classList.add('is-ready');
            }

            function captured() {
                if (seeking === null) return;
                const frame = document.createElement('canvas');
                frame.width = canvas.width;
                frame.height = canvas.height;
                frame.getContext('2d', { alpha: false }).drawImage(probe, 0, 0, frame.width, frame.height);
                frames.set(seeking, frame);
                if (frames.size > PREVIEW_CACHE) frames.delete(frames.keys().next().value);
                if (seeking === shown) paint(frame);
                seeking = null;
                busy = false;
                seekNext();
            }

            function seekNext() {
                if (busy || wanted === null || box.hidden || !ready()) return;
                busy = true;
                if (probe.readyState < 1) {
                    probe.addEventListener('loadedmetadata', () => {
                        busy = false;
                        seekNext();
                    }, { once: true, signal });
                    return;
                }
                const step = wanted;
                wanted = null;
                if (frames.has(step)) {
                    busy = false;
                    if (step === shown) paint(frames.get(step));
                    return;
                }
                seeking = step;
                // The middle of the step stands for all of it.
                const at = Math.min((step + 0.5) * PREVIEW_STEP, Math.max(0, probe.duration - 0.1));
                if (typeof probe.fastSeek === 'function') probe.fastSeek(at);
                else probe.currentTime = at;
            }

            function update() {
                frameRequest = 0;
                if (!range.isConnected) {
                    release();
                    return;
                }
                if (!prefs.seekPreview) return;
                const duration = video.duration;
                if (!pending || !Number.isFinite(duration) || duration <= 0) return;
                // Reads first. The track sits 8px in from the range's sides,
                // as placeTicks assumes.
                const rect = range.getBoundingClientRect();
                const parent = box.parentElement.getBoundingClientRect();
                const fraction = Math.min(1, Math.max(0, (pending.clientX - rect.left - 8) / Math.max(1, rect.width - 16)));
                const at = fraction * duration;
                const ratio = video.videoWidth && video.videoHeight ? video.videoWidth / video.videoHeight : 16 / 9;
                const height = ratio >= 1 ? 90 : 120;
                const width = Math.round(Math.min(200, height * ratio));

                if (canvas.width !== width || canvas.height !== height) {
                    canvas.width = width;
                    canvas.height = height;
                    canvas.classList.remove('is-ready');
                    frames.clear();
                    shown = null;
                }
                const mark = marks.list.findLast(item => item.end
                    ? item.t <= at && at <= item.end
                    : Math.abs(item.t - at) <= duration * 0.006);
                const text = mark ? markLabel(mark, marks.list.indexOf(mark)) : '';
                if (label.textContent !== text) label.textContent = text;
                label.hidden = !text;
                time.textContent = formatMarkTime(at);
                // A fixed width (the frame plus its border) places the box
                // without measuring it.
                const half = (width + 4) / 2;
                const x = Math.min(parent.width - half - 4, Math.max(half + 4, pending.clientX - parent.left));
                box.style.width = `${width + 4}px`;
                box.style.bottom = `${parent.bottom - rect.top + 4}px`;
                box.style.transform = `translateX(${x - half}px)`;
                box.hidden = false;

                const step = Math.floor(at / PREVIEW_STEP);
                if (step === shown) return;
                shown = step;
                if (frames.has(step)) {
                    paint(frames.get(step));
                } else {
                    wanted = step;
                    seekNext();
                }
            }

            function show(event) {
                pending = event;
                frameRequest ||= requestAnimationFrame(update);
            }

            function hide() {
                box.hidden = true;
                pending = null;
                shown = null;
                wanted = null;
            }

            range.addEventListener('pointerenter', ready, { signal });
            range.addEventListener('pointerdown', event => {
                dragging = true;
                show(event);
            }, { signal });
            range.addEventListener('pointermove', event => {
                if (event.pointerType === 'mouse' || dragging) show(event);
            }, { signal });
            range.addEventListener('pointerleave', () => {
                if (!dragging) hide();
            }, { signal });
            window.addEventListener('pointerup', () => {
                if (!range.isConnected) {
                    release();
                    return;
                }
                if (!dragging) return;
                dragging = false;
                if (!range.matches(':hover')) hide();
            }, { signal });
            window.addEventListener('pointercancel', () => {
                dragging = false;
                hide();
            }, { signal });
        }

        function placeTicks(range, ticks) {
            ticks.style.left = `${range.offsetLeft + 8}px`;
            ticks.style.width = `${Math.max(0, range.offsetWidth - 16)}px`;
            ticks.style.top = `${range.offsetTop + 8}px`;
        }

        function markCurrentMark(root) {
            if (!root.classList.contains('is-open')) return;
            const now = activeVideo()?.currentTime ?? 0;
            const current = marks.list.findLastIndex(mark => mark.t <= now + 0.05 && (!mark.end || now <= mark.end));
            for (const row of root.querySelectorAll('.iv-mark-row')) {
                row.classList.toggle('is-current', Number(row.dataset.index) === current);
            }
        }

        function renderMarks({ keepInputs = false } = {}) {
            marksControls = marksControls.filter(control => control.root.isConnected);
            const video = activeVideo();
            const duration = video && Number.isFinite(video.duration) && video.duration > 0 ? video.duration : marks.duration;
            for (const { root, ticks, range } of marksControls) {
                const count = root.querySelector('.iv-marks-count');
                count.textContent = marks.list.length ? String(marks.list.length) : '';
                const typedText = root.querySelector('.iv-marks-at').value;
                const typed = parseMarkTime(typedText);
                const typedList = typed === null ? parseMarkList(typedText) : [];
                root.querySelector('.iv-marks-add span').textContent = typedList.length > 1
                    ? `Adicionar ${typedList.length} marcações`
                    : `Marcar em ${typedList.length ? markSpan(typedList[0]) : formatMarkTime(typed ?? video?.currentTime ?? 0)}`;
                root.querySelector('.iv-marks-empty').hidden = marks.list.length > 0 || !marks.loaded;

                const list = root.querySelector('.iv-mark-list');
                if (!keepInputs || list.children.length !== marks.list.length) {
                    list.replaceChildren(...marks.list.map((mark, index) => {
                        const row = document.createElement('li');
                        row.className = 'iv-mark-row';
                        row.dataset.index = String(index);
                        row.innerHTML = `
                            <span class="iv-mark-play" aria-hidden="true">${icon(ICONS.play, 14)}</span>
                            <input class="iv-mark-time" type="text" inputmode="numeric" spellcheck="false" aria-label="Tempo da marcação" title="Edite o tempo: 1:23:45, ou um trecho 1:23 - 2:10">
                            <input class="iv-mark-label" type="text" spellcheck="false" aria-label="Nome da marcação">
                            <button type="button" class="iv-mark-remove" title="Apagar" aria-label="Apagar marcação">×</button>
                        `;
                        const time = row.querySelector('.iv-mark-time');
                        time.value = markSpan(mark);
                        const input = row.querySelector('.iv-mark-label');
                        input.value = mark.label;
                        input.placeholder = markLabel({ label: '' }, index);
                        return row;
                    }));
                }
                list.classList.toggle('has-range', marks.list.some(mark => mark.end));
                markCurrentMark(root);

                if (range) placeTicks(range, ticks);
                ticks.replaceChildren(...(duration ? marks.list.map((mark, index) => {
                    const tick = document.createElement('button');
                    tick.type = 'button';
                    tick.className = 'iv-mark-tick';
                    tick.dataset.index = String(index);
                    tick.dataset.label = `${markSpan(mark)} · ${markLabel(mark, index)}`;
                    tick.setAttribute('aria-label', tick.dataset.label);
                    tick.style.left = `${Math.min(100, (mark.t / duration) * 100)}%`;
                    if (mark.end) {
                        tick.classList.add('is-range');
                        tick.style.width = `${(Math.min(mark.end, duration) - mark.t) / duration * 100}%`;
                    }
                    return tick;
                }) : []));
            }
        }

        document.addEventListener('pointerdown', event => {
            for (const { root } of marksControls) {
                if (!root.contains(event.target)) root.classList.remove('is-open');
            }
        });

        // How many marks a video has, for its card; read once per asset, a
        // few at a time.
        // ---------------------------------------------------------------------
        //  The script's own data on an asset (marks, watch progress), read in
        //  one request per video and shared by the cards, the sidebar and the
        //  marks page. A few requests run at once.
        // ---------------------------------------------------------------------
        const assetInfos = new Map();
        const infoQueue = [];
        let infoRequests = 0;

        function assetInfo(assetId) {
            if (!assetInfos.has(assetId)) {
                assetInfos.set(assetId, new Promise(resolve => {
                    infoQueue.push({ assetId, resolve });
                    pumpAssetInfo();
                }));
            }
            return assetInfos.get(assetId);
        }

        function pumpAssetInfo() {
            while (infoRequests < 6 && infoQueue.length) {
                const { assetId, resolve } = infoQueue.shift();
                infoRequests++;
                api(`/assets/${assetId}/metadata`)
                    .catch(() => [])
                    .then(items => resolve(readInfo(items)))
                    .finally(() => {
                        infoRequests--;
                        pumpAssetInfo();
                    });
            }
        }

        function readInfo(items) {
            const value = key => (Array.isArray(items) ? items : []).find(item => item.key === key)?.value;
            return { marks: cleanMarks(value(MARKS_KEY)), progress: cleanProgress(value(PROGRESS_KEY)) };
        }

        // Keeps the shared copy current after a save.
        function updateInfo(assetId, change) {
            const current = assetInfos.get(assetId) ?? Promise.resolve({ marks: [], progress: null });
            assetInfos.set(assetId, current.then(info => ({ ...info, ...change })));
        }

        // ---------------------------------------------------------------------
        //  Continue watching. The position of each long video is kept in its
        //  metadata, so it follows from phone to computer: saved every few
        //  seconds while playing, on pause and on leaving; a video watched to
        //  (nearly) the end is marked done. Opening it again resumes there.
        //  A time handed over by the marks page wins over the saved one.
        // ---------------------------------------------------------------------
        const PROGRESS_KEY = 'immich-player-progress';
        const PROGRESS_EVERY = 10000;
        const PROGRESS_MIN = 60;
        const SEEK_KEY = 'immich-player:seek';
        const watch = { assetId: null, video: null, last: null, savedAt: 0 };
        const watchedVideos = new WeakSet();

        function cleanProgress(value) {
            if (!Number.isFinite(value?.t) || !Number.isFinite(value?.d) || value.d <= 0) return null;
            return { t: Math.max(0, value.t), d: value.d, done: Boolean(value.done) };
        }

        // The share watched, for the bar under a thumbnail.
        const progressShare = progress => (progress ? (progress.done ? 1 : Math.min(1, progress.t / progress.d)) : 0);

        function saveProgress(assetId, { t, d }, { done = false, keepalive = false } = {}) {
            if (!assetId || !Number.isFinite(d) || d <= 0) return;
            done ||= t >= d - Math.min(10, d * 0.1);
            // Short clips only count once watched to the end.
            if (!done && (d < PROGRESS_MIN || t < 5)) return;
            const progress = done ? { t: 0, d: roundMark(d), done: true } : { t: roundMark(t), d: roundMark(d), done: false };
            updateInfo(assetId, { progress });
            api(`/assets/${assetId}/metadata`, {
                method: 'PUT',
                body: { items: [{ key: PROGRESS_KEY, value: progress }] },
                keepalive,
            }).catch(error => console.warn('[immich-player] progress save failed', error));
        }

        function flushProgress({ keepalive = false } = {}) {
            if (watch.assetId && watch.last) saveProgress(watch.assetId, watch.last, { keepalive });
            watch.savedAt = Date.now();
        }

        function takePendingSeek(assetId) {
            try {
                const pending = JSON.parse(sessionStorage.getItem(SEEK_KEY) || 'null');
                if (pending?.id !== assetId) return null;
                sessionStorage.removeItem(SEEK_KEY);
                return Number.isFinite(pending.t) ? pending.t : null;
            } catch {
                return null;
            }
        }

        function seekWhenReady(video, t) {
            if (video.readyState >= 1) video.currentTime = t;
            else video.addEventListener('loadedmetadata', () => { video.currentTime = t; }, { once: true });
        }

        function syncWatch() {
            const video = activeVideo();
            const assetId = video ? ASSET_ID_RE.exec(location.pathname)?.[1] ?? null : null;
            if (assetId === watch.assetId && video === watch.video) return;
            flushProgress();
            Object.assign(watch, { assetId, video, last: null, savedAt: Date.now() });
            if (!video || !assetId) return;
            if (!watchedVideos.has(video)) {
                watchedVideos.add(video);
                // Immich may reuse the element for the next asset, so the
                // position only counts while its source is this asset's.
                video.addEventListener('timeupdate', () => {
                    if (video !== watch.video || !watch.assetId || !video.currentSrc.includes(watch.assetId)) return;
                    watch.last = { t: video.currentTime, d: video.duration };
                    if (!video.paused && Date.now() - watch.savedAt > PROGRESS_EVERY) flushProgress();
                });
                video.addEventListener('pause', () => {
                    if (video === watch.video && !video.ended) flushProgress();
                });
            }
            const pending = takePendingSeek(assetId);
            if (pending !== null) {
                seekWhenReady(video, pending);
                return;
            }
            api(`/assets/${assetId}/metadata/${PROGRESS_KEY}`)
                .then(result => cleanProgress(result?.value))
                .catch(() => null)
                .then(progress => {
                    if (!prefs.resume || watch.assetId !== assetId || !progress || progress.done) return;
                    if (progress.t < 5 || progress.t > progress.d - 10) return;
                    // Not if the viewer already moved on its own.
                    if (video.currentTime > 3) return;
                    seekWhenReady(video, progress.t);
                    showHud(`Continuando de ${formatMarkTime(progress.t)}`);
                });
        }

        document.addEventListener('visibilitychange', () => {
            if (document.visibilityState === 'hidden') flushProgress({ keepalive: true });
        });
        window.addEventListener('pagehide', () => flushProgress({ keepalive: true }));

        // The bar along the bottom of a thumbnail, YouTube style.
        function paintProgress(container, progress) {
            let bar = container.querySelector(':scope > .iv-progress');
            const share = progressShare(progress);
            if (!share) {
                bar?.remove();
                return;
            }
            if (!bar) {
                bar = document.createElement('span');
                bar.className = 'iv-progress';
                bar.append(document.createElement('span'));
                container.append(bar);
            }
            bar.firstElementChild.style.width = `${Math.max(4, share * 100)}%`;
            bar.title = progress.done ? 'Assistido' : `Parou em ${formatMarkTime(progress.t)}`;
        }

        // ---------------------------------------------------------------------
        //  Top bar: only Back, "More" and the sidebar toggle stay visible. "More"
        //  opens a grouped menu of our own, built on each open from Immich's
        //  hidden top-bar buttons and its native menu items. Every entry clicks
        //  the original, so Immich's handlers, confirmations and state stay in
        //  charge. Entries are grouped by icon, which does not change with the
        //  interface language.
        // ---------------------------------------------------------------------
        const MENU_GROUPS = [
            { id: 'album', label: 'Álbum', icon: 'M6,19L9,15.14L11.14,17.72L14.14,13.86L18,19H6M6,4H11V12L8.5,10.5L6,12M18,2H6A2,2 0 0,0 4,4V20A2,2 0 0,0 6,22H18A2,2 0 0,0 20,20V4A2,2 0 0,0 18,2Z' },
            { id: 'organize', label: 'Organizar', icon: 'M20,18H4V8H20M20,6H12L10,4H4C2.89,4 2,4.89 2,6V18A2,2 0 0,0 4,20H20A2,2 0 0,0 22,18V8C22,6.89 21.1,6 20,6Z' },
            { id: 'view', label: 'Ver', icon: 'M12,9A3,3 0 0,0 9,12A3,3 0 0,0 12,15A3,3 0 0,0 15,12A3,3 0 0,0 12,9M12,17A5,5 0 0,1 7,12A5,5 0 0,1 12,7A5,5 0 0,1 17,12A5,5 0 0,1 12,17M12,4.5C7,4.5 2.73,7.61 1,12C2.73,16.39 7,19.5 12,19.5C17,19.5 21.27,16.39 23,12C21.27,7.61 17,4.5 12,4.5Z' },
            { id: 'video', label: 'Vídeo', icon: 'M15,8V16H5V8H15M16,6H4A1,1 0 0,0 3,7V17A1,1 0 0,0 4,18H16A1,1 0 0,0 17,17V13.5L21,17.5V6.5L17,10.5V7A1,1 0 0,0 16,6Z' },
            { id: 'tasks', label: 'Tarefas', icon: 'M12,15.5A3.5,3.5 0 0,1 8.5,12A3.5,3.5 0 0,1 12,8.5A3.5,3.5 0 0,1 15.5,12A3.5,3.5 0 0,1 12,15.5M19.43,12.97C19.47,12.65 19.5,12.33 19.5,12C19.5,11.67 19.47,11.34 19.43,11L21.54,9.37C21.73,9.22 21.78,8.95 21.66,8.73L19.66,5.27C19.54,5.05 19.27,4.96 19.05,5.05L16.56,6.05C16.04,5.66 15.5,5.32 14.87,5.07L14.5,2.42C14.46,2.18 14.25,2 14,2H10C9.75,2 9.54,2.18 9.5,2.42L9.13,5.07C8.5,5.32 7.96,5.66 7.44,6.05L4.95,5.05C4.73,4.96 4.46,5.05 4.34,5.27L2.34,8.73C2.21,8.95 2.27,9.22 2.46,9.37L4.57,11C4.53,11.34 4.5,11.67 4.5,12C4.5,12.33 4.53,12.65 4.57,12.97L2.46,14.63C2.27,14.78 2.21,15.05 2.34,15.27L4.34,18.73C4.46,18.95 4.73,19.03 4.95,18.95L7.44,17.94C7.96,18.34 8.5,18.68 9.13,18.93L9.5,21.58C9.54,21.82 9.75,22 10,22H14C14.25,22 14.46,21.82 14.5,21.58L14.87,18.93C15.5,18.67 16.04,18.34 16.56,17.94L19.05,18.95C19.27,19.03 19.54,18.95 19.66,18.73L21.66,15.27C21.78,15.05 21.73,14.78 21.54,14.63L19.43,12.97Z' },
            { id: 'more', label: 'Mais', icon: 'M16,12A2,2 0 0,1 18,10A2,2 0 0,1 20,12A2,2 0 0,1 18,14A2,2 0 0,1 16,12M10,12A2,2 0 0,1 12,10A2,2 0 0,1 14,12A2,2 0 0,1 12,14A2,2 0 0,1 10,12M4,12A2,2 0 0,1 6,10A2,2 0 0,1 8,12A2,2 0 0,1 6,14A2,2 0 0,1 4,12Z' },
        ];

        // Icon path prefixes (Material Design Icons, as Immich renders them).
        // Listed order is display order inside each group.
        const MENU_ICONS = [
            ['primary', 'M11,9H13V7H11M12,20'],         // info
            ['primary', 'M12.1,18.55'],                 // favorite
            ['primary', 'M12,21.35'],                   // unfavorite
            ['primary', 'M18 16.08'],                   // share
            ['primary', 'M5,20H19V18H5M19,9H15V3H9'],   // download
            ['primary', 'M1,10V12A9,9'],                // cast
            ['album', 'M19,13H13V19H11V13H5V11H11'],    // add to album
            ['album', 'M13 19C13 19.7'],                // remove from album
            ['album', 'M19,19H5V5H19M19,3H5'],          // set album cover
            ['organize', 'M9,14V8H5L12,1'],             // upload and create stack
            ['organize', 'M20 21H4V10H6V19'],           // archive
            ['organize', 'M20,21H4V10H6V19'],           // archive (alternate path)
            ['organize', 'M12,17C10.89,17'],            // move to locked folder
            ['organize', 'M12,2A10,10 0 0,0 2,12A10,10 0 0,0 12,22A10,10 0 0,0 22,12A10,10 0 0,0 12,2M7.07'], // profile picture
            ['view', 'M2,3H10A2,2 0 0,1 12,1'],         // slideshow
            ['view', 'M15.5,2C18,2'],                   // view in timeline
            ['view', 'M19,3H14V5H19V18'],               // view similar
            ['video', 'M15,8V16H5V8H15M16,6H4'],        // play original / transcoded
            ['tasks', 'M13 3C16.88 3'],                 // refresh faces
            ['tasks', 'M6 12.45V9.64'],                 // refresh metadata
            ['tasks', 'M14.68 13.25'],                  // refresh thumbnails
            ['tasks', 'M18 14.5C19.1 14.5'],            // refresh encoded videos
            ['danger', 'M6,19A2,2 0 0,0 8,21H16'],      // delete
        ];
        const CHEVRON = 'M15.41,16.58L10.83,12L15.41,7.41L14,6L8,12L14,18L15.41,16.58Z';

        let actionMenu = null;

        function syncNavbar() {
            const actions = document.querySelector(NAV_ACTIONS);
            if (!actions) {
                closeActionMenu();
                return;
            }

            if (!actions.querySelector(':scope > .iv-nav-sidebar')) {
                const button = document.createElement('button');
                button.type = 'button';
                button.className = 'iv-nav-sidebar';
                button.innerHTML = icon(ICONS.sidebar);
                button.addEventListener('click', () => toggleSidebar());
                actions.append(button);
            }
            const sidebarButton = actions.querySelector(':scope > .iv-nav-sidebar');
            const sidebarLabel = state.sidebarOpen ? 'Ocultar itens do álbum (B)' : 'Mostrar itens do álbum (B)';
            if (sidebarButton.title !== sidebarLabel) {
                sidebarButton.title = sidebarLabel;
                sidebarButton.setAttribute('aria-label', sidebarLabel);
            }

            // Shared links have no "More" menu; keep their buttons visible there.
            actions.classList.toggle('iv-nav-collapsed', Boolean(moreButton()));
        }

        function moreButton() {
            return document.querySelector(`${NAV_ACTIONS} > div button[aria-haspopup]`);
        }

        function classifyEntry(path, fallback) {
            const index = MENU_ICONS.findIndex(([, prefix]) => path.startsWith(prefix));
            return index === -1 ? { group: fallback, rank: MENU_ICONS.length } : { group: MENU_ICONS[index][0], rank: index };
        }

        function collectMenuEntries(more) {
            const entries = [];
            const seen = new Set();
            const add = (source, label, fallback) => {
                label = (label || '').trim();
                if (!label || seen.has(label)) return;
                seen.add(label);
                const path = source.querySelector('svg path')?.getAttribute('d') ?? '';
                entries.push({ source, label, svg: source.querySelector('svg'), ...classifyEntry(path, fallback) });
            };

            for (const button of document.querySelectorAll(`${NAV_ACTIONS} > button:not(.iv-nav-sidebar)`)) {
                add(button, button.getAttribute('aria-label') || button.title, 'primary');
            }
            // Immich puts owner-only jobs after a divider in its own menu.
            let fallback = 'more';
            for (const node of document.getElementById(more.getAttribute('aria-controls'))?.children ?? []) {
                if (node.tagName === 'HR') fallback = 'tasks';
                else if (node.matches('li[role="menuitem"]')) add(node, node.textContent, fallback);
            }
            return entries.sort((a, b) => a.rank - b.rank);
        }

        function menuEntry(entry) {
            const item = document.createElement('button');
            item.type = 'button';
            item.className = `iv-menu-entry${entry.group === 'danger' ? ' is-danger' : ''}`;
            item.setAttribute('role', 'menuitem');
            const svg = entry.svg?.cloneNode(true);
            if (svg) {
                svg.setAttribute('width', '18');
                svg.setAttribute('height', '18');
                item.append(svg);
            }
            const label = document.createElement('span');
            label.textContent = entry.label;
            item.append(label);
            item.addEventListener('click', () => {
                closeActionMenu();
                setTimeout(() => entry.source.click());
            });
            return item;
        }

        function openActionMenu(more) {
            closeActionMenu();
            const entries = collectMenuEntries(more);
            actionMenu = document.createElement('div');
            actionMenu.className = 'iv-menu';
            actionMenu.setAttribute('role', 'menu');

            const section = group => entries.filter(entry => entry.group === group).map(menuEntry);
            const blocks = [];
            const primary = section('primary');
            if (primary.length) blocks.push(primary);

            const groups = [];
            for (const group of MENU_GROUPS) {
                const items = section(group.id);
                if (!items.length) continue;
                const wrapper = document.createElement('div');
                wrapper.className = 'iv-menu-group';
                wrapper.innerHTML = `
                    <button type="button" class="iv-menu-entry" role="menuitem" aria-haspopup="menu" aria-expanded="false">
                        ${icon(CHEVRON, 18)}${icon(group.icon, 18)}<span>${group.label}</span>
                    </button>
                    <div class="iv-submenu" role="menu" aria-label="${group.label}"></div>
                `;
                wrapper.querySelector('.iv-submenu').append(...items);
                const trigger = wrapper.firstElementChild;
                trigger.addEventListener('click', () => toggleSubmenu(wrapper, true, true));
                // A short grace period on leave lets the pointer cross diagonally
                // into the submenu without it closing on the way.
                let closeTimer = 0;
                wrapper.addEventListener('pointerenter', () => {
                    clearTimeout(closeTimer);
                    toggleSubmenu(wrapper, true);
                });
                wrapper.addEventListener('pointerleave', () => {
                    closeTimer = setTimeout(() => toggleSubmenu(wrapper, false), 200);
                });
                groups.push(wrapper);
            }
            if (groups.length) blocks.push(groups);

            const danger = section('danger');
            if (danger.length) blocks.push(danger);

            blocks.forEach((block, index) => {
                if (index) actionMenu.append(Object.assign(document.createElement('hr'), { className: 'iv-menu-divider' }));
                actionMenu.append(...block);
            });

            actionMenu.addEventListener('pointerdown', event => event.stopPropagation());
            document.body.append(actionMenu);
            const anchor = more.getBoundingClientRect();
            actionMenu.style.top = `${anchor.bottom + 6}px`;
            actionMenu.style.right = `${Math.max(8, document.documentElement.clientWidth - anchor.right)}px`;
            more.setAttribute('aria-expanded', 'true');
            actionMenu.querySelector('.iv-menu-entry')?.focus();
        }

        function toggleSubmenu(wrapper, open, focus = false) {
            for (const other of actionMenu?.querySelectorAll('.iv-menu-group.is-open') ?? []) {
                if (other !== wrapper) other.classList.remove('is-open');
            }
            wrapper.classList.toggle('is-open', open);
            wrapper.firstElementChild.setAttribute('aria-expanded', String(open));
            if (open && focus) wrapper.querySelector('.iv-submenu .iv-menu-entry')?.focus();
        }

        function closeActionMenu() {
            if (!actionMenu) return;
            actionMenu.remove();
            actionMenu = null;
            moreButton()?.setAttribute('aria-expanded', 'false');
        }

        function handleActionMenuKey(event) {
            const active = document.activeElement;
            const scope = active?.closest('.iv-submenu') ?? actionMenu;
            const items = [...scope.querySelectorAll(':scope > .iv-menu-entry, :scope > .iv-menu-group > .iv-menu-entry')];
            const index = items.indexOf(active);
            const group = active?.closest('.iv-menu-group');
            if (event.key === 'Escape') {
                if (scope !== actionMenu) {
                    toggleSubmenu(group, false);
                    group.firstElementChild.focus();
                } else {
                    closeActionMenu();
                    moreButton()?.focus();
                }
            } else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
                const step = event.key === 'ArrowDown' ? 1 : -1;
                items[(index + step + items.length) % items.length]?.focus();
            } else if (event.key === 'ArrowLeft' && group && scope === actionMenu) {
                toggleSubmenu(group, true, true);
            } else if (event.key === 'ArrowRight' && scope !== actionMenu) {
                toggleSubmenu(group, false);
                group.firstElementChild.focus();
            } else if (event.key === 'Enter' || event.key === ' ') {
                active?.click();
            } else if (event.key !== 'Tab') {
                return;
            }
            if (event.key !== 'Tab') consume(event);
        }

        // Immich's own menu never opens: its trigger opens ours instead, while its
        // items stay in the DOM for our entries to click.
        window.addEventListener('click', event => {
            const more = moreButton();
            if (more && more.contains(event.target)) {
                consume(event);
                if (actionMenu) closeActionMenu();
                else openActionMenu(more);
            }
        }, true);

        document.addEventListener('pointerdown', event => {
            if (actionMenu && !actionMenu.contains(event.target) && !moreButton()?.contains(event.target)) closeActionMenu();
        });
        window.addEventListener('resize', closeActionMenu);

        function isTyping(target) {
            return target instanceof Element
                && (target.isContentEditable || Boolean(target.closest('input, textarea, select, [contenteditable="true"]')));
        }

        function seekBy(video, seconds) {
            const end = Number.isFinite(video.duration) ? video.duration : Infinity;
            video.currentTime = Math.min(end, Math.max(0, video.currentTime + seconds));
        }


        // Runs in the window capture phase, ahead of Immich's shortcut action, so
        // ArrowLeft/ArrowRight seek instead of switching to the previous/next asset.
        // Shift+Arrow is left alone: Immich already maps it to a 0.4 s nudge.
        window.addEventListener('keydown', event => {
            if (actionMenu) {
                handleActionMenuKey(event);
                return;
            }
            if (event.ctrlKey || event.metaKey || event.altKey || isTyping(event.target)) return;
            const video = activeVideo();
            if (!video) {
                const inAlbumViewer = document.documentElement.classList.contains('iv-album-viewer');
                if (event.key === 'b' && inAlbumViewer) {
                    consume(event);
                    toggleSidebar();
                } else if ((event.key === 'ArrowLeft' || event.key === 'ArrowRight') && !event.shiftKey && inAlbumViewer) {
                    consume(event);
                    stepAsset(event.key === 'ArrowRight' ? 'next' : 'previous');
                } else if (event.key === 'Escape' && cards?.pickingCover && !document.querySelector(VIEWER)) {
                    consume(event);
                    pickCover(cards, false);
                } else if (event.key === 'Escape' && cards?.selected.size && !document.querySelector(VIEWER)) {
                    consume(event);
                    clearSelection(cards);
                }
                return;
            }

            const key = event.key;
            let handled = true;
            if (key === 'ArrowLeft' && !event.shiftKey) {
                seekBy(video, -SEEK_SHORT);
                showHud(`« ${SEEK_SHORT}s`);
            } else if (key === 'ArrowRight' && !event.shiftKey) {
                seekBy(video, SEEK_SHORT);
                showHud(`${SEEK_SHORT}s »`);
            } else if (key === 'j' || key === 'J') {
                seekBy(video, -SEEK_LONG);
                showHud(`« ${SEEK_LONG}s`);
            } else if (key === 'l' || key === 'L') {
                seekBy(video, SEEK_LONG);
                showHud(`${SEEK_LONG}s »`);
            } else if (key === 'k' || key === 'K') {
                if (video.paused) video.play(); else video.pause();
            } else if ((key === 'ArrowUp' || key === 'ArrowDown') && event.shiftKey) {
                setBoost(state.boost + (key === 'ArrowUp' ? BOOST_STEP : -BOOST_STEP));
            } else if (key === 'ArrowUp' || key === 'ArrowDown') {
                video.muted = false;
                video.volume = Math.min(1, Math.max(0, video.volume + (key === 'ArrowUp' ? 0.05 : -0.05)));
                showHud(`Volume ${Math.round(video.volume * 100)}%`);
            } else if (key === 'M' && event.shiftKey) {
                addMark();
            } else if (key === '[' || key === ']') {
                jumpMark(key === ']' ? 1 : -1);
            } else if (key === 'm' || key === 'M') {
                video.muted = !video.muted;
                showHud(video.muted ? 'Mudo' : `Volume ${Math.round(video.volume * 100)}%`);
            } else if (key === '<') {
                setRate(state.rate - RATE_STEP);
            } else if (key === '>') {
                setRate(state.rate + RATE_STEP);
            } else if ((key === ',' || key === '.') && video.paused) {
                seekBy(video, key === ',' ? -FRAME : FRAME);
            } else if (/^[0-9]$/.test(key) && Number.isFinite(video.duration)) {
                video.currentTime = video.duration * Number(key) / 10;
                showHud(`${Number(key) * 10}%`);
            } else if (key === 'Home') {
                video.currentTime = 0;
            } else if (key === 'End' && Number.isFinite(video.duration)) {
                video.currentTime = video.duration;
            } else if (key === 'b' && document.documentElement.classList.contains('iv-album-viewer')) {
                toggleSidebar();
            } else {
                handled = false;
            }
            if (handled) consume(event);
        }, true);

        function consume(event) {
            event.preventDefault();
            event.stopImmediatePropagation();
        }

        // ---------------------------------------------------------------------
        //  Album sidebar
        // ---------------------------------------------------------------------
        let sidebar = null;

        async function api(path, { method = 'GET', body, keepalive = false } = {}) {
            const response = await fetch(`/api${path}`, {
                method,
                credentials: 'same-origin',
                keepalive,
                headers: body ? { Accept: 'application/json', 'Content-Type': 'application/json' } : { Accept: 'application/json' },
                body: body ? JSON.stringify(body) : undefined,
            });
            if (!response.ok) throw new Error(`${path}: HTTP ${response.status}`);
            return response.status === 204 ? null : response.json();
        }

        // The album's items through the metadata search, as the card view
        // reads them, so the sidebar can group and sort by the same fields.
        async function loadAlbum(albumId) {
            const album = await api(`/albums/${albumId}`);
            const items = [];
            let cursor = null;
            do {
                const result = await api('/search/metadata', {
                    method: 'POST',
                    body: {
                        filter: { albumIds: { any: [albumId] } },
                        orderBy: { field: 'localDateTime', direction: 'desc' },
                        size: 1000,
                        withExif: true,
                        withStacked: true,
                        ...(cursor ? { cursor } : {}),
                    },
                });
                items.push(...result.assets.items.map(cardItem));
                cursor = result.assets.nextCursor ?? null;
            } while (cursor);
            return { id: albumId, name: album.albumName || 'Álbum', items };
        }

        // The album page's grouping and sort (shared with its card view), and
        // the items in that order: the sidebar shows it and autoplay follows it.
        function albumOrder() {
            const defaults = CARD_ORDER_DEFAULTS.album;
            let group = getSetting(cardOrderKey('album', 'Group'), defaults.group);
            let sort = getSetting(cardOrderKey('album', 'Sort'), defaults.sort);
            if (!CARD_GROUPS[group]) group = defaults.group;
            if (!CARD_SORTS[sort]) sort = defaults.sort;
            return { group, sort };
        }

        function orderedAlbumItems(items, { group, sort }) {
            const groupOrder = groupComparator(group, sort);
            const sorter = SORTERS[sort];
            return [...items].sort((a, b) => groupOrder(a, b) || sorter(a, b));
        }

        function albumData(albumId) {
            if (!state.albums.has(albumId)) {
                const pending = loadAlbum(albumId).catch(error => {
                    state.albums.delete(albumId);
                    throw error;
                });
                state.albums.set(albumId, pending);
            }
            return state.albums.get(albumId);
        }

        // Timeline buckets carry milliseconds; older payloads used "H:MM:SS.mmm".
        function formatDuration(value) {
            let total;
            if (typeof value === 'number') {
                total = Math.round(value / 1000);
            } else {
                const match = /^(\d+):(\d+):(\d+)/.exec(value || '');
                if (!match) return '';
                total = Number(match[1]) * 3600 + Number(match[2]) * 60 + Number(match[3]);
            }
            const hours = Math.floor(total / 3600);
            const minutes = Math.floor(total / 60) % 60;
            const seconds = total % 60;
            const tail = `${String(seconds).padStart(2, '0')}`;
            return hours ? `${hours}:${String(minutes).padStart(2, '0')}:${tail}` : `${minutes}:${tail}`;
        }

        function formatDate(value, options) {
            if (!value) return '';
            const date = new Date(value);
            return Number.isNaN(date.getTime()) ? '' : date.toLocaleString(undefined, options);
        }

        function buildSidebar() {
            sidebar = document.createElement('aside');
            sidebar.id = 'iv-sidebar';
            sidebar.setAttribute('aria-label', 'Itens do álbum');
            sidebar.innerHTML = `
                <div class="iv-sidebar-head">
                    <div class="iv-sidebar-row">
                        <div style="min-width: 0">
                            <div class="iv-sidebar-title"></div>
                            <div class="iv-sidebar-sub"></div>
                        </div>
                        <div style="display: flex">
                            <button type="button" class="iv-icon-button" data-action="reload" title="Recarregar" aria-label="Recarregar">↻</button>
                            <button type="button" class="iv-icon-button" data-action="close" title="Fechar (B)" aria-label="Fechar">×</button>
                        </div>
                    </div>
                    <div class="iv-filters" role="group" aria-label="Filtro">
                        <button type="button" data-filter="all">Tudo</button>
                        <button type="button" data-filter="video">Vídeos</button>
                        <button type="button" data-filter="image">Fotos</button>
                    </div>
                    <div class="iv-sidebar-order">
                        <button type="button" class="iv-chip" data-pick="view" aria-haspopup="menu" title="Visualização"><span class="iv-chip-icon"></span>${icon(ICONS.chevronDown)}</button>
                        <button type="button" class="iv-chip" data-pick="group" aria-haspopup="menu" title="Agrupar">${icon(ICONS.groupBy)}<span class="iv-chip-value"></span>${icon(ICONS.chevronDown)}</button>
                        <button type="button" class="iv-chip" data-pick="sort" aria-haspopup="menu" title="Ordenar">${icon(ICONS.sortBy)}<span class="iv-chip-value"></span>${icon(ICONS.chevronDown)}</button>
                    </div>
                </div>
                <div class="iv-grid"></div>
            `;
            sidebar.addEventListener('click', event => {
                const action = event.target.closest('[data-action]')?.dataset.action;
                if (action === 'close') toggleSidebar(false);
                if (action === 'reload') {
                    const albumId = state.renderedAlbum;
                    state.albums.delete(albumId);
                    state.renderedAlbum = null;
                    syncSidebar();
                }
                const pick = event.target.closest('[data-pick]');
                if (pick) pickAlbumOrder(pick);
                const filter = event.target.closest('[data-filter]')?.dataset.filter;
                if (filter) {
                    state.filter = filter;
                    setSetting('sidebarFilter', filter);
                    applyFilter();
                }
            });
            // Immich closes the viewer on Escape and navigates on arrows; the
            // sidebar must not leak those while it has focus.
            sidebar.addEventListener('keydown', event => event.stopPropagation());

            document.body.append(sidebar);
        }

        // Changing the order here changes the album page's too, so both stay
        // one order.
        function pickAlbumOrder(chip) {
            if (popup?.anchor === chip) {
                closePopup();
                return;
            }
            const rerender = () => {
                const albumId = state.renderedAlbum;
                state.renderedAlbum = null;
                if (albumId) syncSidebar();
            };
            if (chip.dataset.pick === 'view') {
                const current = viewType('album');
                openPopup(chip, Object.entries(viewTypes('album')).map(([value, type]) => ({
                    label: type.label,
                    icon: type.icon,
                    checked: value === current,
                    onClick: () => {
                        setViewType('album', value);
                        rerender();
                    },
                })));
                return;
            }
            const part = chip.dataset.pick === 'group' ? 'Group' : 'Sort';
            const options = part === 'Group' ? CARD_GROUPS : CARD_SORTS;
            const current = albumOrder()[chip.dataset.pick];
            openPopup(chip, Object.entries(options).map(([value, label]) => ({
                label,
                checked: value === current,
                onClick: () => {
                    setSetting(cardOrderKey('album', part), value);
                    if (cards?.type === 'album') {
                        state[part === 'Group' ? 'cardGroup' : 'cardSort'] = value;
                        syncCardsBar(cards);
                        reloadCards(cards);
                    }
                    rerender();
                },
            })));
        }

        function toggleSidebar(open = !state.sidebarOpen) {
            state.sidebarOpen = open;
            setSetting('sidebarOpen', open);
            syncSidebar();
            syncNavbar();
        }

        function applyFilter() {
            for (const button of sidebar.querySelectorAll('[data-filter]')) {
                button.classList.toggle('is-active', button.dataset.filter === state.filter);
            }
            const shown = new Map();
            for (const item of sidebar.querySelectorAll('.iv-item')) {
                const type = item.dataset.video === 'true' ? 'video' : 'image';
                item.hidden = state.filter !== 'all' && state.filter !== type;
                if (!item.hidden) shown.set(item.dataset.group, (shown.get(item.dataset.group) ?? 0) + 1);
            }
            for (const heading of sidebar.querySelectorAll('.iv-grid-group')) {
                const count = shown.get(heading.dataset.group) ?? 0;
                heading.hidden = !count;
                heading.querySelector('small').textContent = String(count);
            }
        }

        // Scrolled into view only when it changes, so browsing the list is
        // not pulled back on every sync.
        let markedAsset = null;

        function markCurrent(assetId, { scroll = assetId !== markedAsset } = {}) {
            markedAsset = assetId;
            let current = null;
            for (const item of sidebar.querySelectorAll('.iv-item')) {
                const isCurrent = item.dataset.id === assetId;
                item.classList.toggle('is-current', isCurrent);
                if (isCurrent) current = item;
            }
            if (scroll) current?.scrollIntoView({ block: 'center' });
        }

        async function renderAlbum(albumId, assetId) {
            state.renderedAlbum = albumId;
            const grid = sidebar.querySelector('.iv-grid');
            sidebar.querySelector('.iv-sidebar-title').textContent = 'Carregando…';
            sidebar.querySelector('.iv-sidebar-sub').textContent = '';
            grid.innerHTML = '<div class="iv-status">Carregando itens do álbum…</div>';

            let album;
            try {
                album = await albumData(albumId);
            } catch (error) {
                if (state.renderedAlbum !== albumId) return;
                sidebar.querySelector('.iv-sidebar-title').textContent = 'Álbum';
                grid.innerHTML = '<div class="iv-status">Não foi possível carregar o álbum.</div>';
                console.warn('[immich-player] album load failed', error);
                return;
            }
            if (state.renderedAlbum !== albumId) return;

            const videos = album.items.filter(item => item.isVideo).length;
            sidebar.querySelector('.iv-sidebar-title').textContent = album.name;
            sidebar.querySelector('.iv-sidebar-title').title = album.name;
            sidebar.querySelector('.iv-sidebar-sub').textContent =
                `${album.items.length} itens · ${videos} vídeos · ${album.items.length - videos} fotos`;

            const order = albumOrder();
            const type = CARD_VIEW_TYPES[viewType('album')];
            const list = viewType('album') === 'cards';
            sidebar.classList.toggle('is-list', list);
            const viewChip = sidebar.querySelector('[data-pick="view"]');
            viewChip.querySelector('.iv-chip-icon').innerHTML = icon(type.icon);
            viewChip.title = `Visualização: ${type.label}`;
            sidebar.querySelector('[data-pick="group"] .iv-chip-value').textContent = CARD_GROUPS[order.group];
            sidebar.querySelector('[data-pick="sort"] .iv-chip-value').textContent = CARD_SORTS[order.sort];
            const fragment = document.createDocumentFragment();
            let lastGroup = null;
            for (const item of orderedAlbumItems(album.items, order)) {
                const [groupKey, groupLabel] = groupOf(item, order.group);
                if (order.group !== 'none' && groupKey !== lastGroup) {
                    const heading = document.createElement('h3');
                    heading.className = 'iv-grid-group';
                    heading.dataset.group = groupKey;
                    heading.append(groupLabel.charAt(0).toUpperCase() + groupLabel.slice(1), document.createElement('small'));
                    fragment.append(heading);
                    lastGroup = groupKey;
                }
                const link = document.createElement('a');
                link.dataset.group = groupKey;
                link.className = 'iv-item';
                link.href = `/albums/${albumId}/photos/${item.id}`;
                link.dataset.id = item.id;
                link.dataset.video = String(item.isVideo);
                link.dataset.sveltekitNoscroll = '';
                link.title = [displayTitle(item), formatDate(item.takenAt, { dateStyle: 'medium', timeZone: 'UTC' })].filter(Boolean).join(' · ');
                const image = document.createElement('img');
                image.loading = 'lazy';
                image.decoding = 'async';
                image.alt = '';
                image.src = `/api/assets/${item.id}/thumbnail?size=thumbnail`;
                let badge = null;
                if (item.isVideo) {
                    badge = document.createElement('span');
                    badge.className = 'iv-item-badge';
                    badge.textContent = formatDuration(item.duration) || '▶';
                }
                if (item.isVideo) {
                    assetInfo(item.id).then(info => paintProgress(link.querySelector('.iv-item-thumb') ?? link, info.progress));
                }
                if (list) {
                    const thumb = document.createElement('span');
                    thumb.className = 'iv-item-thumb';
                    thumb.append(image);
                    if (badge) thumb.append(badge);
                    const text = document.createElement('span');
                    text.className = 'iv-item-text';
                    const title = document.createElement('span');
                    title.className = 'iv-item-title';
                    title.textContent = displayTitle(item);
                    const meta = document.createElement('span');
                    meta.className = 'iv-item-meta';
                    meta.textContent = [formatDate(item.takenAt, { dateStyle: 'medium', timeZone: 'UTC' }), relativeDate(item.takenAt)].filter(Boolean).join(' • ');
                    text.append(title, meta);
                    if (item.place) {
                        const place = document.createElement('span');
                        place.className = 'iv-item-meta';
                        place.textContent = item.place;
                        text.append(place);
                    }
                    link.append(thumb, text);
                } else {
                    link.append(image);
                    if (badge) link.append(badge);
                }
                fragment.append(link);
            }
            grid.replaceChildren(fragment);
            if (!album.items.length) grid.innerHTML = '<div class="iv-status">Álbum vazio.</div>';
            applyFilter();
            markCurrent(ALBUM_ASSET_RE.exec(location.pathname)?.[2] ?? assetId, { scroll: true });
        }

        function syncSidebar() {
            if (!document.body) return;
            if (!sidebar) buildSidebar();

            const match = ALBUM_ASSET_RE.exec(location.pathname);
            const inViewer = Boolean(match && document.querySelector(VIEWER));
            const root = document.documentElement;
            root.classList.toggle('iv-album-viewer', inViewer);
            root.classList.toggle('iv-sidebar-open', inViewer && state.sidebarOpen);
            if (!inViewer || !state.sidebarOpen) return;

            const [, albumId, assetId] = match;
            // The album's view type also picks the sidebar's: a YouTube-style
            // list beside the cards, thumbnails beside either grid.
            const list = viewType('album') === 'cards';
            if (state.renderedAlbum !== albumId || sidebar.classList.contains('is-list') !== list) renderAlbum(albumId, assetId);
            else markCurrent(assetId);
        }

        // ---------------------------------------------------------------------
        //  Card view: a YouTube-style grid with title, date and duration under
        //  each thumbnail. Immich lays its grid out in JS with fixed row
        //  heights, so captions cannot be added to it; the card view covers it
        //  with its own list, read through the metadata search, which carries
        //  file names, descriptions and sizes. Immich's grid stays mounted
        //  underneath, so opening an asset and stepping through it still work.
        // ---------------------------------------------------------------------
        let cards = null;

        const CARD_GROUPS = { month: 'Mês', day: 'Dia', year: 'Ano', type: 'Tipo', place: 'Local', none: 'Nenhum' };
        const CARD_SORTS = {
            'date-desc': 'Mais recentes',
            'date-asc': 'Mais antigos',
            'name-asc': 'Nome (A–Z)',
            'name-desc': 'Nome (Z–A)',
            'size-desc': 'Maiores',
            'duration-desc': 'Mais longos',
        };
        // Orders the server applies itself; the rest are sorted here, which
        // needs the whole list first.
        const SERVER_SORTS = {
            'date-desc': ['localDateTime', 'desc'],
            'date-asc': ['localDateTime', 'asc'],
            'size-desc': ['fileSizeInBytes', 'desc'],
        };
        const DATE_GROUPS = ['month', 'day', 'year'];
        // Albums open by type, then name; the timeline by month, newest first.
        const CARD_ORDER_DEFAULTS = {
            album: { group: 'type', sort: 'name-asc' },
            home: { group: 'month', sort: 'date-desc' },
            favorites: { group: 'month', sort: 'date-desc' },
        };
        const cardOrderKey = (type, part) => `cards${part}${TYPE_SUFFIX[type]}`;
        const CARD_PAGE = 500;
        const CARD_CHUNK = 60;
        const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });

        function cardContext() {
            const album = ALBUM_PAGE_RE.exec(location.pathname);
            if (album) return { view: 'album', key: `album:${album[1]}`, albumId: album[1], assetId: album[2] ?? null };
            const home = HOME_PAGE_RE.exec(location.pathname);
            if (home) return { view: 'home', key: 'home', albumId: null, assetId: home[1] ?? null, hrefBase: '/photos/' };
            const favorites = FAVORITES_PAGE_RE.exec(location.pathname);
            if (favorites) return { view: 'favorites', key: 'favorites', albumId: null, assetId: favorites[1] ?? null, hrefBase: '/favorites/photos/' };
            return null;
        }

        function syncCards() {
            const context = cardContext();
            syncCardsToggle(context);
            const main = document.getElementById('asset-grid')?.closest('main');
            const enabled = Boolean(context && main && state.cardViews[context.view]);
            document.documentElement.classList.toggle('iv-cards-on', enabled);
            document.documentElement.classList.toggle('iv-cards-album', enabled && context.view === 'album');
            syncNativeBar(context && main && !enabled && context.view !== 'album' ? main : null);
            if (!enabled) {
                closeCards();
                return;
            }
            if (cards?.key !== context.key || cards.root.parentElement !== main) {
                closeCards();
                cards = openCards(context, main);
            }
            syncCardsActions(cards);
            if (context.assetId) {
                cards.lastAsset = context.assetId;
            } else if (cards.lastAsset) {
                // Back from the viewer: bring the last asset seen into view,
                // with the progress just made.
                const card = cards.root.querySelector(`.iv-card[data-id="${cards.lastAsset}"]`);
                card?.scrollIntoView({ block: 'nearest' });
                const thumb = card?.querySelector('.iv-card-thumb');
                if (thumb && assetInfos.has(cards.lastAsset)) assetInfo(cards.lastAsset).then(info => paintProgress(thumb, info.progress));
                cards.lastAsset = null;
            }
        }

        // With Immich's own grid chosen, its view chip stays reachable: in
        // the page's header row when there is one, else in a bar of its own
        // above the grid.
        function syncNativeBar(main) {
            let chip = document.querySelector('.iv-native-chip');
            const header = main?.querySelector('#user-page-header')?.parentElement;
            const host = main && (header ?? main);
            document.documentElement.classList.toggle('iv-native-bar-on', Boolean(main && !header));
            if (!host) {
                chip?.closest('.iv-native-bar')?.remove();
                chip?.remove();
                return;
            }
            if (!chip) {
                chip = document.createElement('button');
                chip.type = 'button';
                chip.className = 'iv-chip iv-native-chip';
                chip.setAttribute('aria-haspopup', 'menu');
                const type = CARD_VIEW_TYPES.immich;
                chip.title = `Visualização: ${type.label}`;
                chip.innerHTML = `${icon(type.icon)}<span class="iv-chip-value">${type.short}</span>${icon(ICONS.chevronDown)}`;
                chip.addEventListener('click', () => {
                    if (popup?.anchor === chip) {
                        closePopup();
                        return;
                    }
                    const view = cardContext()?.view;
                    if (!view) return;
                    openPopup(chip, Object.entries(viewTypes(view)).map(([value, option]) => ({
                        label: option.label,
                        icon: option.icon,
                        checked: value === viewType(view),
                        onClick: () => setViewType(view, value),
                    })));
                });
            }
            if (header) {
                chip.closest('.iv-native-bar')?.remove();
                if (chip.parentElement !== header) header.append(chip);
                return;
            }
            let bar = main.querySelector(':scope > .iv-native-bar');
            if (!bar) {
                bar = document.createElement('div');
                bar.className = 'iv-native-bar';
                main.append(bar);
            }
            if (chip.parentElement !== bar) bar.append(chip);
        }

        function syncCardsToggle(context) {
            const host = context && context.view !== 'album' && document.querySelector('#dashboard-navbar section.justify-end');
            let button = document.querySelector('.iv-cards-toggle');
            if (!host) {
                button?.remove();
                return;
            }
            if (!button) {
                button = document.createElement('button');
                button.type = 'button';
                button.className = 'iv-cards-toggle';
                button.innerHTML = icon(ICONS.cards);
                button.addEventListener('click', () => {
                    const view = cardContext()?.view;
                    if (!view) return;
                    state.cardViews[view] = !state.cardViews[view];
                    setSetting(`cards${TYPE_SUFFIX[view]}`, state.cardViews[view]);
                    syncCards();
                });
            }
            if (button.parentElement !== host) host.prepend(button);
            const on = state.cardViews[context.view];
            const label = on
                ? 'Voltar à grade do Immich'
                : state.cardLayouts[context.view] === 'grid' ? 'Mostrar grade com agrupamento e ordem' : 'Mostrar título, data e duração';
            button.classList.toggle('is-active', on);
            button.setAttribute('aria-pressed', String(on));
            button.title = label;
            button.setAttribute('aria-label', label);
        }

        function closeCards() {
            if (!cards) return;
            cards.generation++;
            closePopup();
            cards.root.remove();
            cards = null;
        }

        function openCards(context, main) {
            const defaults = CARD_ORDER_DEFAULTS[context.view];
            state.cardGroup = getSetting(cardOrderKey(context.view, 'Group'), defaults.group);
            state.cardSort = getSetting(cardOrderKey(context.view, 'Sort'), defaults.sort);
            if (!CARD_GROUPS[state.cardGroup]) state.cardGroup = defaults.group;
            if (!CARD_SORTS[state.cardSort]) state.cardSort = defaults.sort;
            const root = document.createElement('section');
            root.id = 'iv-cards';
            root.setAttribute('aria-label', 'Itens');
            root.innerHTML = `
                <div class="iv-cards-scroll">
                    ${context.albumId ? `<button type="button" class="iv-cards-back" data-action="back" title="Voltar" aria-label="Voltar">${icon(ICONS.back)}</button>` : ''}
                    <header class="iv-cards-head" hidden>
                        <img class="iv-cards-cover" alt="" hidden>
                        <div class="iv-cards-head-text">
                            <h1></h1>
                            <p class="iv-cards-sub"></p>
                            <p class="iv-cards-desc"></p>
                        </div>
                    </header>
                    <div class="iv-cards-sentinel"></div>
                    <div class="iv-cards-bar">
                        ${context.albumId ? `<button type="button" class="iv-cards-back" data-action="back" title="Voltar" aria-label="Voltar" tabindex="-1">${icon(ICONS.back)}</button>` : ''}
                        <div class="iv-cards-filters">
                            <button type="button" class="iv-chip" data-pick="view" aria-haspopup="menu" title="Visualização">${icon(ICONS.cards)}<span class="iv-chip-value">Cards</span>${icon(ICONS.chevronDown)}</button>
                            <button type="button" class="iv-chip" data-pick="group" aria-haspopup="menu">${icon(ICONS.groupBy)}<span class="iv-chip-label">Agrupar</span><span class="iv-chip-value"></span>${icon(ICONS.chevronDown)}</button>
                            <button type="button" class="iv-chip" data-pick="sort" aria-haspopup="menu">${icon(ICONS.sortBy)}<span class="iv-chip-label">Ordenar</span><span class="iv-chip-value"></span>${icon(ICONS.chevronDown)}</button>
                            <button type="button" class="iv-action is-icon" data-action="search" title="Buscar no álbum" aria-label="Buscar no álbum">${icon(ICONS.search)}</button>
                            <span class="iv-cards-count"></span>
                            <label class="iv-searchbox">${icon(ICONS.search)}<input type="search" placeholder="Buscar por título, data ou local" aria-label="Buscar"><button type="button" class="iv-icon-button" data-action="search-close" title="Fechar busca" aria-label="Fechar busca">${icon(ICONS.close, 18)}</button></label>
                        </div>
                        <div class="iv-select-bar">
                            <button type="button" class="iv-action is-icon" data-select="clear" title="Limpar seleção (Esc)" aria-label="Limpar seleção">${icon(ICONS.close)}</button>
                            <span class="iv-select-count"></span>
                            <button type="button" class="iv-action" data-select="all">${icon(ICONS.check)}<span class="iv-action-label">Selecionar tudo</span></button>
                            <span class="iv-select-actions">
                                <button type="button" class="iv-action is-icon" data-select="favorite"></button>
                                <button type="button" class="iv-action is-icon" data-select="album" title="Adicionar a um álbum" aria-label="Adicionar a um álbum">${icon(ICONS.albumAdd)}</button>
                                ${context.albumId ? `<button type="button" class="iv-action is-icon" data-select="remove" title="Remover deste álbum" aria-label="Remover deste álbum">${icon(ICONS.albumRemove)}</button>` : ''}
                                ${context.albumId ? `<button type="button" class="iv-action is-icon" data-select="cover" title="Definir como capa do álbum" aria-label="Definir como capa do álbum">${icon(ICONS.cover)}</button>` : ''}
                                <button type="button" class="iv-action is-icon" data-select="download" title="Baixar" aria-label="Baixar">${icon(ICONS.download)}</button>
                                <button type="button" class="iv-action is-icon" data-select="archive" title="Arquivar" aria-label="Arquivar">${icon(ICONS.archive)}</button>
                                <button type="button" class="iv-action is-icon is-danger" data-select="trash" title="Mover para a lixeira" aria-label="Mover para a lixeira">${icon(ICONS.trash)}</button>
                            </span>
                        </div>
                        <div class="iv-cover-bar">
                            ${icon(ICONS.cover)}<span>Clique na foto ou vídeo que vai ser a capa</span>
                            <button type="button" class="iv-action" data-cover="cancel">Cancelar</button>
                        </div>
                        <div class="iv-cards-actions">
                            <button type="button" class="iv-action is-primary" data-action="editing-done" hidden title="Sair da edição de títulos">${icon(ICONS.check)}<span class="iv-action-label">Concluir</span></button>
                            <button type="button" class="iv-action is-primary" data-action="slideshow" hidden>${icon(ICONS.play)}<span class="iv-action-label">Apresentação</span></button>
                            <button type="button" class="iv-action is-icon" data-action="share" hidden></button>
                            <button type="button" class="iv-action is-icon" data-action="more" aria-haspopup="menu" aria-label="Mais opções" title="Mais opções">${icon(ICONS.dots)}</button>
                        </div>
                    </div>
                    <div class="iv-cards-body"></div>
                    <div class="iv-status">Carregando…</div>
                </div>
            `;
            const scroller = root.querySelector('.iv-cards-scroll');
            const view = {
                key: context.key,
                albumId: context.albumId,
                root,
                scroller,
                body: root.querySelector('.iv-cards-body'),
                status: root.querySelector('.iv-status'),
                hrefBase: context.albumId ? `/albums/${context.albumId}/photos/` : context.hrefBase,
                generation: 0,
                items: [],
                byId: new Map(),
                rendered: 0,
                cursor: null,
                complete: false,
                streaming: false,
                loading: false,
                group: null,
                groupTotals: new Map(),
                editing: false,
                lastAsset: null,
                selected: new Set(),
                anchor: null,
                pickingCover: false,
                query: '',
                allItems: null,
                searchTimer: 0,
                isAlbum: Boolean(context.albumId),
                type: context.view,
            };
            scroller.addEventListener('scroll', () => renderMoreCards(view), { passive: true });
            root.querySelector('.iv-cards-bar').addEventListener('click', event => {
                if (event.target.closest('[data-cover="cancel"]')) {
                    pickCover(view, false);
                    return;
                }
                const select = event.target.closest('[data-select]');
                if (select) {
                    selectionAction(view, select);
                    return;
                }
                const control = event.target.closest('[data-pick], [data-action]');
                if (control) barAction(view, control);
            });
            bindSelection(view);
            const searchInput = root.querySelector('.iv-searchbox input');
            searchInput.addEventListener('input', () => {
                clearTimeout(view.searchTimer);
                view.searchTimer = setTimeout(() => {
                    const query = normalize(searchInput.value.trim());
                    if (query === view.query) return;
                    view.query = query;
                    reloadCards(view);
                }, 250);
            });
            searchInput.addEventListener('keydown', event => {
                event.stopPropagation();
                if (event.key === 'Escape') closeCardSearch(view);
            });
            syncCardsBar(view);
            root.querySelector('.iv-cards-scroll > .iv-cards-back')?.addEventListener('click', goBack);
            if (context.albumId) {
                const cover = root.querySelector('.iv-cards-cover');
                cover.title = 'Trocar a capa';
                cover.addEventListener('click', () => pickCover(view, true));
            }
            // The bar is pinned once the line just above it leaves the top,
            // plus the scroller's top padding, which the bar sticks into.
            const bar = root.querySelector('.iv-cards-bar');
            const sentinel = root.querySelector('.iv-cards-sentinel');
            scroller.addEventListener('scroll', () => {
                const stuck = sentinel.getBoundingClientRect().bottom <=
                    scroller.getBoundingClientRect().top - parseFloat(getComputedStyle(scroller).paddingTop) + 1;
                if (stuck === bar.classList.contains('is-stuck')) return;
                bar.classList.toggle('is-stuck', stuck);
                bar.querySelector('.iv-cards-back')?.setAttribute('tabindex', stuck ? '0' : '-1');
            }, { passive: true });
            view.status.addEventListener('click', event => {
                if (event.target.closest('button')) renderMoreCards(view);
            });
            bindTitleEditing(view);
            main.append(root);
            startCards(view);
            return view;
        }

        async function startCards(view) {
            if (view.albumId) {
                try {
                    renderCardsHead(view, await api(`/albums/${view.albumId}`));
                } catch (error) {
                    console.warn('[immich-player] album load failed', error);
                }
            }
            reloadCards(view);
        }

        function renderCardsHead(view, album) {
            const head = view.root.querySelector('.iv-cards-head');
            const range = [album.startDate, album.endDate]
                .map(value => formatDate(value, { dateStyle: 'medium', timeZone: 'UTC' }))
                .filter(Boolean);
            head.querySelector('h1').textContent = album.albumName || 'Álbum';
            const cover = head.querySelector('.iv-cards-cover');
            if (album.albumThumbnailAssetId) {
                cover.src = `/api/assets/${album.albumThumbnailAssetId}/thumbnail?size=preview`;
                cover.hidden = false;
            }
            head.querySelector('.iv-cards-sub').textContent =
                [[...new Set(range)].join(' – '), `${album.assetCount} itens`].filter(Boolean).join(' · ');
            head.querySelector('.iv-cards-desc').textContent = album.description || '';
            head.hidden = false;
        }

        // Date and size orders come from the server page by page, as the list
        // scrolls, when the groups follow that order (or there are none).
        // Any other order or grouping needs every item before the first card.
        function reloadCards(view) {
            view.generation++;
            view.items = [];
            view.byId.clear();
            view.rendered = 0;
            view.cursor = null;
            view.complete = false;
            view.loading = false;
            view.group = null;
            view.groupTotals = new Map();
            const sort = state.cardSort;
            view.streaming = !view.query && Boolean(SERVER_SORTS[sort]) &&
                (state.cardGroup === 'none' || (DATE_GROUPS.includes(state.cardGroup) && sort.startsWith('date')));
            view.body.replaceChildren();
            view.root.querySelector('.iv-cards-count').textContent = '';
            view.status.hidden = false;
            view.status.textContent = 'Carregando…';
            if (view.streaming) renderMoreCards(view);
            else loadAllCards(view);
        }

        async function fetchCardPage(view) {
            const [field, direction] = SERVER_SORTS[state.cardSort] ?? SERVER_SORTS['date-desc'];
            const result = await api('/search/metadata', {
                method: 'POST',
                body: {
                    filter: view.albumId
                        ? { albumIds: { any: [view.albumId] } }
                        : view.type === 'favorites' ? { isFavorite: { eq: true } } : { visibility: { eq: 'timeline' } },
                    orderBy: { field, direction },
                    size: CARD_PAGE,
                    withExif: true,
                    withStacked: true,
                    ...(view.cursor ? { cursor: view.cursor } : {}),
                },
            });
            view.cursor = result.assets.nextCursor ?? null;
            view.complete = !view.cursor;
            const items = result.assets.items.map(cardItem);
            for (const item of items) view.byId.set(item.id, item);
            return items;
        }

        function cardItem(asset) {
            const exif = asset.exifInfo ?? {};
            return {
                id: asset.id,
                isVideo: asset.type === 'VIDEO',
                duration: asset.duration ?? null,
                // The local wall-clock time, labelled as UTC.
                takenAt: asset.localDateTime ?? asset.fileCreatedAt ?? '',
                fileName: asset.originalFileName ?? '',
                text: exif.description?.trim() ?? '',
                place: [exif.city, exif.country].filter(Boolean).join(', '),
                size: exif.fileSizeInByte ?? 0,
                isFavorite: Boolean(asset.isFavorite),
                thumbhash: asset.thumbhash ?? null,
                // Very wide or tall pictures are capped so a row stays usable.
                ratio: Math.min(3, Math.max(0.5, asset.width / asset.height || 16 / 9)),
            };
        }

        async function loadAllCards(view) {
            const generation = view.generation;
            try {
                // A search, or a new order, reuses the list already read.
                if (view.allItems) {
                    view.items = [...view.allItems];
                    for (const item of view.items) view.byId.set(item.id, item);
                    view.complete = true;
                }
                while (!view.complete) {
                    view.items.push(...await fetchCardPage(view));
                    if (generation !== view.generation) return;
                    view.status.textContent = `Carregando… ${view.items.length.toLocaleString()} itens`;
                }
                view.allItems ??= [...view.items];
                if (view.query) view.items = view.items.filter(item => cardMatches(item, view.query));
            } catch (error) {
                if (generation !== view.generation) return;
                view.status.innerHTML = 'Não foi possível carregar os itens.<br><button type="button">Tentar de novo</button>';
                view.status.onclick = () => reloadCards(view);
                console.warn('[immich-player] card view failed', error);
                return;
            }
            const groupOrder = groupComparator(state.cardGroup, state.cardSort);
            const sorter = SORTERS[state.cardSort];
            view.items.sort((a, b) => groupOrder(a, b) || sorter(a, b));
            // The whole list is here, so each group's header shows its total
            // rather than the cards drawn so far.
            for (const item of view.items) {
                const key = groupOf(item, state.cardGroup)[0];
                view.groupTotals.set(key, (view.groupTotals.get(key) ?? 0) + 1);
            }
            renderMoreCards(view);
        }

        // Renders the next cards while the end of the list is within reach,
        // fetching the next page first when streaming.
        async function renderMoreCards(view) {
            const { scroller } = view;
            const generation = view.generation;
            while (!view.loading && generation === view.generation
                && scroller.scrollTop + scroller.clientHeight > scroller.scrollHeight - 1500) {
                if (view.rendered < view.items.length) {
                    renderCardChunk(view);
                    continue;
                }
                if (!view.streaming || view.complete) break;
                view.loading = true;
                try {
                    const items = await fetchCardPage(view);
                    if (generation !== view.generation) return;
                    view.items.push(...items);
                } catch (error) {
                    if (generation !== view.generation) return;
                    view.status.innerHTML = 'Não foi possível carregar mais itens.<br><button type="button">Tentar de novo</button>';
                    view.status.onclick = null;
                    console.warn('[immich-player] card page failed', error);
                    return;
                } finally {
                    if (generation === view.generation) view.loading = false;
                }
            }
            if (generation !== view.generation) return;
            const done = view.complete && view.rendered >= view.items.length;
            view.status.hidden = done && view.items.length > 0;
            if (done && !view.items.length) view.status.textContent = 'Nenhum item.';
            else if (!done) view.status.textContent = 'Carregando…';
            view.root.querySelector('.iv-cards-count').textContent =
                view.complete ? `${view.items.length.toLocaleString()} itens` : '';
        }

        function renderCardChunk(view) {
            const end = Math.min(view.items.length, view.rendered + CARD_CHUNK);
            for (; view.rendered < end; view.rendered++) {
                const item = view.items[view.rendered];
                const [key, label] = groupOf(item, state.cardGroup);
                if (!view.group || view.group.key !== key) view.group = cardGroup(view, key, label);
                view.group.grid.append(card(view, item));
                view.group.count++;
                if (view.group.counter) {
                    const count = view.groupTotals.get(key) ?? view.group.count;
                    view.group.counter.textContent = `${count} ${count === 1 ? 'item' : 'itens'}`;
                }
            }
        }

        function cardGroup(view, key, label) {
            const section = document.createElement('section');
            section.className = 'iv-cards-month';
            section.dataset.group = key;
            const grid = document.createElement('div');
            grid.className = 'iv-cards-grid';
            let counter = null;
            if (state.cardGroup !== 'none') {
                const title = document.createElement('h2');
                counter = document.createElement('small');
                title.append(label.charAt(0).toUpperCase() + label.slice(1), counter);
                section.append(title);
            }
            section.append(grid);
            view.body.append(section);
            return { key, grid, counter, count: 0 };
        }

        function groupOf(item, group) {
            const date = item.takenAt;
            switch (group) {
                case 'month': return [date.slice(0, 7), formatDate(date, { month: 'long', year: 'numeric', timeZone: 'UTC' }) || 'Sem data'];
                case 'day': return [date.slice(0, 10), formatDate(date, { dateStyle: 'full', timeZone: 'UTC' }) || 'Sem data'];
                case 'year': return [date.slice(0, 4), date.slice(0, 4) || 'Sem data'];
                case 'type': return item.isVideo ? ['video', 'Vídeos'] : ['photo', 'Fotos'];
                case 'place': return [item.place, item.place || 'Sem local'];
                default: return ['', ''];
            }
        }

        const compareText = (a, b) => (a < b ? -1 : a > b ? 1 : 0);

        // Date groups follow the date direction (newest first unless the
        // order is oldest first); videos come before photos; places in
        // alphabetical order, the ones without a place last.
        function groupComparator(group, sort) {
            if (DATE_GROUPS.includes(group)) {
                const sign = sort === 'date-asc' ? 1 : -1;
                return (a, b) => sign * compareText(groupOf(a, group)[0], groupOf(b, group)[0]);
            }
            if (group === 'type') return (a, b) => Number(b.isVideo) - Number(a.isVideo);
            if (group === 'place') return (a, b) => Number(!a.place) - Number(!b.place) || collator.compare(a.place, b.place);
            return () => 0;
        }

        const SORTERS = {
            'date-desc': (a, b) => compareText(b.takenAt, a.takenAt),
            'date-asc': (a, b) => compareText(a.takenAt, b.takenAt),
            'name-asc': (a, b) => collator.compare(displayTitle(a), displayTitle(b)),
            'name-desc': (a, b) => collator.compare(displayTitle(b), displayTitle(a)),
            'size-desc': (a, b) => b.size - a.size,
            'duration-desc': (a, b) => durationMs(b.duration) - durationMs(a.duration) || compareText(b.takenAt, a.takenAt),
        };

        // Search results carry milliseconds; older payloads "H:MM:SS.mmm".
        function durationMs(value) {
            if (typeof value === 'number') return value;
            const match = /^(\d+):(\d+):(\d+(?:\.\d+)?)/.exec(value || '');
            return match ? ((Number(match[1]) * 60 + Number(match[2])) * 60 + Number(match[3])) * 1000 : 0;
        }

        function cardMatches(item, query) {
            const date = formatDate(item.takenAt, { dateStyle: 'long', timeZone: 'UTC' });
            return normalize(`${displayTitle(item)} ${item.fileName} ${item.place} ${date}`).includes(query);
        }

        function closeCardSearch(view) {
            const input = view.root.querySelector('.iv-searchbox input');
            input.value = '';
            view.root.querySelector('.iv-cards-bar').classList.remove('is-searching');
            if (!view.query) return;
            view.query = '';
            reloadCards(view);
        }

        const withoutExtension = name => name.replace(/\.[^.]+$/, '');
        const displayTitle = item => item.text || withoutExtension(item.fileName) || (item.isVideo ? 'Vídeo' : 'Foto');

        function card(view, item) {
            const link = document.createElement('a');
            link.className = 'iv-card';
            link.href = view.hrefBase + item.id;
            link.draggable = false;
            link.dataset.id = item.id;
            link.dataset.sveltekitNoscroll = '';
            link.style.setProperty('--r', String(item.ratio));

            link.classList.toggle('is-selected', view.selected.has(item.id));
            const thumb = document.createElement('div');
            thumb.className = 'iv-card-thumb';
            thumb.innerHTML = `
                <button type="button" class="iv-card-check" title="Selecionar" aria-label="Selecionar">${icon(ICONS.check, 16)}</button>
                <button type="button" class="iv-card-more" title="Mais opções" aria-label="Mais opções" aria-haspopup="menu">${icon(ICONS.dots, 20)}</button>
            `;
            const image = document.createElement('img');
            image.loading = 'lazy';
            image.decoding = 'async';
            image.alt = '';
            image.draggable = false;
            // Same URL Immich's grid uses, so the browser cache is shared.
            image.src = `/api/assets/${item.id}/thumbnail?size=thumbnail${item.thumbhash ? `&c=${encodeURIComponent(item.thumbhash)}` : ''}`;
            thumb.append(image);
            if (item.isVideo) {
                const badge = document.createElement('span');
                badge.className = 'iv-item-badge';
                badge.innerHTML = icon(ICONS.play);
                badge.append(formatDuration(item.duration));
                thumb.append(badge);
                previewOnHover(link, thumb, item.id);
            }
            if (item.isVideo) {
                assetInfo(item.id).then(({ marks: list, progress }) => {
                    paintProgress(thumb, progress);
                    const count = list.length;
                    if (!count) return;
                    const badge = document.createElement('span');
                    badge.className = 'iv-card-marks';
                    badge.title = `${count} ${count === 1 ? 'marcação' : 'marcações'}`;
                    badge.innerHTML = icon(ICONS.bookmarks);
                    badge.append(String(count));
                    thumb.append(badge);
                });
            }
            if (item.isFavorite) {
                const favorite = document.createElement('span');
                favorite.className = 'iv-card-fav';
                favorite.title = 'Favorito';
                favorite.innerHTML = icon(ICONS.heart);
                thumb.append(favorite);
            }

            const title = document.createElement('div');
            title.className = 'iv-card-title';
            showTitle(link, title, item);
            setTitleEditable(view, title);
            const meta = document.createElement('div');
            meta.className = 'iv-card-meta';
            for (const text of [formatDate(item.takenAt, { dateStyle: 'medium', timeZone: 'UTC' }), relativeDate(item.takenAt)]) {
                if (!text) continue;
                const part = document.createElement('span');
                part.textContent = text;
                meta.append(part);
            }
            meta.title = formatDate(item.takenAt, { dateStyle: 'full', timeStyle: 'short', timeZone: 'UTC' });
            link.append(thumb, title, meta);
            if (item.place) {
                const place = document.createElement('div');
                place.className = 'iv-card-place';
                place.textContent = item.place;
                link.append(place);
            }
            return link;
        }

        function showTitle(link, title, item) {
            title.classList.toggle('is-file', !item.text && Boolean(item.fileName));
            title.textContent = displayTitle(item);
            link.title = item.text || item.fileName || title.textContent;
        }

        // ---------------------------------------------------------------------
        //  Action bar. Its menus are our own popups; the album's actions are
        //  Immich's top-bar buttons and "Album options" items, hidden in the
        //  card view and clicked through, so Immich's own dialogs and
        //  confirmations still run. They are told apart by icon, which does
        //  not change with the interface language.
        // ---------------------------------------------------------------------
        // Cards and grid are layouts of our view, so the grouping, order and
        // actions stay; "immich" turns our view off for Immich's own grid.
        const CARD_VIEW_TYPES = {
            cards: { label: 'Cards com título', short: 'Cards', icon: ICONS.cards },
            grid: { label: 'Grade', short: 'Grade', icon: ICONS.gridSmall },
            immich: { label: 'Grade do Immich', short: 'Immich', icon: ICONS.grid },
        };

        // Immich's own grid is offered only on the timeline, where it is the
        // default.
        function viewTypes(type) {
            return Object.fromEntries(Object.entries(CARD_VIEW_TYPES).filter(([value]) => type !== 'album' || value !== 'immich'));
        }

        function viewType(type) {
            return state.cardViews[type] ? state.cardLayouts[type] : 'immich';
        }

        function setViewType(type, value) {
            const suffix = TYPE_SUFFIX[type];
            state.cardViews[type] = value !== 'immich';
            setSetting(`cards${suffix}`, state.cardViews[type]);
            if (value !== 'immich') {
                state.cardLayouts[type] = value;
                setSetting(`cardsLayout${suffix}`, value);
            }
            if (cards) syncCardsBar(cards);
            syncCards();
        }
        const ALBUM_ACTIONS = {
            add: { prefix: 'M13 19C13 19.7' },
            share: { prefix: 'M18 16.08' },
            map: { prefix: 'M20.5,3L20.34' },
            slideshow: { prefix: 'M2,3H10A2,2 0 0,1 12,1' },
            download: { prefix: 'M5,20H19V18H5M19,9H15V3H9' },
        };
        const DELETE_ICON = 'M9,3V4H4V6H5V19';
        const COVER_PICK_ICON = 'M19,19H5V5H19M19,3H5';
        const NARROW = window.matchMedia('(max-width: 640px)');

        // Immich's album buttons by role, plus any we do not know, and the
        // items of its "Album options" menu.
        function albumControls() {
            const host = document.querySelector('#control-bar nav > .ms-auto');
            const known = {};
            const others = [];
            let options = null;
            for (const button of host?.querySelectorAll('button') ?? []) {
                if (button.closest('[role="menu"], .iv-cards-toggle')) continue;
                if (button.matches('[aria-haspopup]')) {
                    options = button;
                    continue;
                }
                const path = button.querySelector('svg path')?.getAttribute('d') ?? '';
                const role = Object.keys(ALBUM_ACTIONS).find(key => path.startsWith(ALBUM_ACTIONS[key].prefix));
                if (role) known[role] = button;
                else others.push(button);
            }
            const items = options
                ? [...document.getElementById(options.getAttribute('aria-controls'))?.querySelectorAll('[role="menuitem"]') ?? []]
                : [];
            return { known, others, items };
        }

        // Immich's own Back, hidden with its bar, decides where to go.
        function goBack() {
            const back = document.querySelector('#control-bar nav > :not(.ms-auto) button');
            if (back) back.click();
            else history.back();
        }

        function syncCardsActions(view) {
            const { known } = view.isAlbum ? albumControls() : { known: {} };
            const bar = view.root.querySelector('.iv-cards-bar');
            for (const role of ['slideshow', 'share']) {
                const action = bar.querySelector(`[data-action="${role}"]`);
                const source = known[role];
                const hidden = !source || view.editing;
                if (action.hidden !== hidden) action.hidden = hidden;
                // Immich's own icon, so the button matches the one it stands for.
                if (role === 'share' && source && !action.firstElementChild) {
                    action.append(source.querySelector('svg')?.cloneNode(true) ?? '');
                }
                const label = source?.getAttribute('aria-label') || source?.title || '';
                if (label && action.title !== label) {
                    action.title = label;
                    action.setAttribute('aria-label', label);
                    const text = action.querySelector('.iv-action-label');
                    if (text) text.textContent = label;
                }
            }
            bar.querySelector('[data-action="editing-done"]').hidden = !view.editing;
        }

        function syncCardsBar(view) {
            const bar = view.root.querySelector('.iv-cards-bar');
            const layout = state.cardLayouts[view.type];
            const type = CARD_VIEW_TYPES[layout];
            view.root.classList.toggle('is-grid', layout === 'grid');
            const chip = bar.querySelector('[data-pick="view"]');
            chip.querySelector('svg').outerHTML = icon(type.icon);
            chip.querySelector('.iv-chip-value').textContent = type.short;
            chip.title = `Visualização: ${type.label}`;
            bar.querySelector('[data-pick="group"] .iv-chip-value').textContent = CARD_GROUPS[state.cardGroup];
            bar.querySelector('[data-pick="sort"] .iv-chip-value').textContent = CARD_SORTS[state.cardSort];
        }

        function setEditing(view, on) {
            view.editing = on;
            view.root.classList.toggle('is-editing', on);
            for (const title of view.root.querySelectorAll('.iv-card-title')) setTitleEditable(view, title);
            syncCardsActions(view);
        }

        const sourceEntry = (source, label) => ({
            label: (label || source.getAttribute('aria-label') || source.title || source.textContent).trim(),
            svg: source.querySelector('svg'),
            danger: (source.querySelector('svg path')?.getAttribute('d') ?? '').startsWith(DELETE_ICON),
            onClick: () => source.click(),
        });

        function barAction(view, control) {
            if (popup?.anchor === control) {
                closePopup();
                return;
            }
            const choose = (options, current, apply) => Object.entries(options).map(([value, option]) => ({
                label: option.label ?? option,
                icon: option.icon,
                checked: value === current,
                onClick: () => apply(value),
            }));
            switch (control.dataset.pick ?? control.dataset.action) {
                case 'view':
                    openPopup(control, choose(viewTypes(view.type), viewType(view.type), value => {
                        setViewType(view.type, value);
                        // The sidebar follows the album's layout.
                        if (view.type === 'album') state.renderedAlbum = null;
                    }));
                    break;
                case 'group':
                    openPopup(control, choose(CARD_GROUPS, state.cardGroup, value => {
                        state.cardGroup = value;
                        setSetting(cardOrderKey(view.type, 'Group'), value);
                        syncCardsBar(view);
                        reloadCards(view);
                    }));
                    break;
                case 'sort':
                    openPopup(control, choose(CARD_SORTS, state.cardSort, value => {
                        state.cardSort = value;
                        setSetting(cardOrderKey(view.type, 'Sort'), value);
                        syncCardsBar(view);
                        reloadCards(view);
                    }));
                    break;
                case 'back':
                    goBack();
                    break;
                case 'editing-done':
                    setEditing(view, false);
                    break;
                case 'slideshow':
                case 'share':
                    albumControls().known[control.dataset.action]?.click();
                    break;
                case 'more':
                    openPopup(control, moreEntries(view), { align: 'end' });
                    break;
                case 'search':
                    view.root.querySelector('.iv-cards-bar').classList.add('is-searching');
                    view.root.querySelector('.iv-searchbox input').focus();
                    break;
                case 'search-close':
                    closeCardSearch(view);
                    break;
            }
        }

        // Adding, downloading and editing first, then Immich's album options;
        // deleting last, on its own.
        function moreEntries(view) {
            const entries = [];
            const danger = [];
            const { known, others, items } = view.isAlbum ? albumControls() : { known: {}, others: [], items: [] };
            // On a phone the bar has no room for them, so they lead the menu.
            const roles = NARROW.matches && !view.editing ? ['slideshow', 'share', 'add', 'download', 'map'] : ['add', 'download', 'map'];
            for (const role of roles) {
                if (known[role]) entries.push(sourceEntry(known[role]));
            }
            if (view.albumId) {
                const pinned = prefs.pinnedAlbums.includes(view.albumId);
                entries.push({
                    label: pinned ? 'Desafixar da barra lateral' : 'Fixar na barra lateral',
                    icon: ICONS.sidebar,
                    onClick: () => togglePinned(view.albumId),
                });
            }
            entries.push({
                label: view.editing ? 'Parar de editar títulos' : 'Editar títulos',
                icon: ICONS.pencil,
                onClick: () => setEditing(view, !view.editing),
            });
            // Immich's own cover picker selects in its grid, which sits hidden
            // under the cards; ours picks from the cards.
            const rest = [...others, ...items].map(source => {
                const entry = sourceEntry(source);
                const path = source.querySelector('svg path')?.getAttribute('d') ?? '';
                return path.startsWith(COVER_PICK_ICON) ? { ...entry, onClick: () => pickCover(view, true) } : entry;
            });
            if (rest.length) entries.push('-');
            for (const entry of rest) (entry.danger ? danger : entries).push(entry);
            if (danger.length) entries.push('-', ...danger);
            return entries;
        }

        // ---------------------------------------------------------------------
        //  Popup menus (action bar).
        // ---------------------------------------------------------------------
        let popup = null;

        const normalize = text => text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

        function openPopup(anchor, entries, { align = 'start', search = false } = {}) {
            closePopup();
            popup = document.createElement('div');
            popup.className = 'iv-menu iv-popup';
            popup.setAttribute('role', 'menu');
            popup.anchor = anchor;
            if (search) {
                const input = document.createElement('input');
                input.className = 'iv-menu-search';
                input.type = 'search';
                input.placeholder = 'Buscar…';
                input.addEventListener('input', () => {
                    const query = normalize(input.value.trim());
                    for (const item of popup.querySelectorAll('.iv-menu-entry')) {
                        item.hidden = Boolean(query) && !normalize(item.textContent).includes(query);
                    }
                });
                input.addEventListener('keydown', event => {
                    if (event.key === 'Enter') {
                        event.preventDefault();
                        popup.querySelector('.iv-menu-entry:not([hidden])')?.click();
                    }
                    // Typing must not reach Immich's shortcuts; arrows and
                    // Escape still work the menu.
                    if (!['ArrowDown', 'ArrowUp', 'Escape'].includes(event.key)) event.stopPropagation();
                });
                popup.append(input);
            }
            for (const entry of entries) {
                if (entry === '-') {
                    if (popup.lastElementChild && popup.lastElementChild.tagName !== 'HR') {
                        popup.append(Object.assign(document.createElement('hr'), { className: 'iv-menu-divider' }));
                    }
                    continue;
                }
                const item = document.createElement('button');
                item.type = 'button';
                item.className = `iv-menu-entry${entry.danger ? ' is-danger' : ''}`;
                const checkable = typeof entry.checked === 'boolean';
                item.setAttribute('role', checkable ? 'menuitemradio' : 'menuitem');
                if (checkable) item.setAttribute('aria-checked', String(entry.checked));
                const svg = entry.svg?.cloneNode(true) ?? (entry.icon ? document.createRange().createContextualFragment(icon(entry.icon, 18)).firstElementChild : null);
                if (svg) {
                    svg.setAttribute('width', '18');
                    svg.setAttribute('height', '18');
                    item.append(svg);
                }
                const label = document.createElement('span');
                label.textContent = entry.label;
                item.append(label);
                if (checkable) {
                    const check = document.createRange().createContextualFragment(icon(ICONS.check, 18)).firstElementChild;
                    check.classList.add('iv-menu-check');
                    item.append(check);
                }
                item.addEventListener('click', () => {
                    closePopup();
                    // After the popup is gone, so a dialog opened by Immich
                    // gets the focus.
                    setTimeout(entry.onClick);
                });
                popup.append(item);
            }
            if (popup.lastElementChild?.tagName === 'HR') popup.lastElementChild.remove();
            popup.addEventListener('keydown', event => {
                const items = [...popup.querySelectorAll('.iv-menu-entry:not([hidden])')];
                const index = items.indexOf(document.activeElement);
                if (event.key === 'Escape') {
                    closePopup();
                    anchor.focus();
                } else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
                    items[(index + (event.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length]?.focus();
                } else {
                    return;
                }
                event.preventDefault();
                event.stopPropagation();
            });
            document.body.append(popup);

            const rect = anchor.getBoundingClientRect();
            const width = popup.offsetWidth;
            const height = popup.offsetHeight;
            const viewport = document.documentElement;
            const left = align === 'end' ? rect.right - width : rect.left;
            popup.style.left = `${Math.max(8, Math.min(left, viewport.clientWidth - width - 8))}px`;
            const below = rect.bottom + 6;
            popup.style.top = `${below + height > viewport.clientHeight - 8 ? Math.max(8, rect.top - height - 6) : below}px`;
            anchor.setAttribute('aria-expanded', 'true');
            (popup.querySelector('.iv-menu-search') ?? popup.querySelector('[aria-checked="true"]') ?? popup.querySelector('.iv-menu-entry'))?.focus();
        }

        function closePopup() {
            if (!popup) return;
            popup.anchor.setAttribute('aria-expanded', 'false');
            popup.remove();
            popup = null;
        }

        document.addEventListener('pointerdown', event => {
            if (popup && !popup.contains(event.target) && !popup.anchor.contains(event.target)) closePopup();
        });
        window.addEventListener('resize', () => closePopup());

        // ---------------------------------------------------------------------
        //  Immich's sidebar: pinned albums under "Álbuns", a "Marcações" entry,
        //  the system pages folded into "Sistema" and a compact storage meter.
        //  Immich's own items are hidden and copied, never moved, so Svelte
        //  keeps hold of the originals. A copy of the whole sidebar is kept so
        //  an album page, which has none, can show it too.
        // ---------------------------------------------------------------------
        const SYSTEM_PAGES = ['/utilities', '/archive', '/folders', '/trash'];
        const NAV_KEY = 'immich-player:nav';
        const NAV_LOGO_KEY = 'immich-player:nav-logo';
        const ALBUM_PATH_RE = /^\/albums\/([0-9a-f-]{36})/;
        const navAlbumsBusy = new WeakSet();
        let navSnapshotAt = 0;
        let systemOpen = Boolean(getSetting('navSystemOpen', false));
        let navCollapsed = Boolean(getSetting('navCollapsed', false));

        function toggleButton() {
            const button = document.createElement('button');
            button.type = 'button';
            button.className = 'iv-nav-toggle';
            button.innerHTML = icon(ICONS.menu);
            button.addEventListener('click', () => {
                navCollapsed = !navCollapsed;
                setSetting('navCollapsed', navCollapsed);
                syncNavToggle();
            });
            return button;
        }

        // A button left of the logo folds the sidebar into a rail of icons,
        // on the pages that have one and in the album's copy.
        function syncNavToggle() {
            document.documentElement.classList.toggle('iv-nav-collapsed', navCollapsed);
            const logo = document.querySelector('#dashboard-navbar a:has(img)');
            if (logo && !logo.parentElement.querySelector(':scope > .iv-nav-toggle')) logo.before(toggleButton());
            const albumLogo = document.querySelector('#iv-nav .iv-nav-logo');
            if (albumLogo && !albumLogo.querySelector('.iv-nav-toggle')) albumLogo.prepend(toggleButton());
            const label = navCollapsed ? 'Expandir a barra lateral' : 'Recolher a barra lateral';
            for (const button of document.querySelectorAll('.iv-nav-toggle')) {
                if (button.title === label) continue;
                button.title = label;
                button.setAttribute('aria-label', label);
                button.setAttribute('aria-expanded', String(!navCollapsed));
            }
        }

        const navContainer = () => document.querySelector('#sidebar > div.flex');
        const navItem = (container, href) => [...container.children].find(child => child.querySelector(`:scope > div > a[href="${href}"]`));
        // The look of a top-level link that is not the current page.
        const idleLinkClass = container => [...container.querySelectorAll(':scope > div > div > a[href]:not([aria-current])')]
            .find(link => !link.closest('.iv-nav-system, .iv-nav-marks'))?.className ?? '';

        function syncNavExtras() {
            const container = navContainer();
            if (!container) return;
            syncNavMarks(container);
            syncNavSystem(container);
            syncNavAlbums(container);
            syncStorage(container);
            // Only a settled sidebar is worth keeping: one still loading has
            // no albums and no storage meter yet.
            const settled = container.querySelector('.iv-nav-albums a') && container.querySelector('[aria-valuenow]');
            if (settled && Date.now() - navSnapshotAt > 3000) snapshotNav(container);
        }

        // An item of ours shaped like Immich's: a copy of one of its items,
        // with another link, icon and label.
        function navCopy(container, source, { href, label, path }) {
            const copy = source.cloneNode(true);
            const link = copy.querySelector('a');
            link.className = idleLinkClass(container) || link.className;
            link.removeAttribute('aria-current');
            if (href) link.href = href;
            else link.removeAttribute('href');
            if (path) {
                const svg = link.querySelector('svg');
                if (svg) svg.innerHTML = `<path fill="currentColor" d="${path}"/>`;
            }
            const text = link.querySelector('span.truncate') ?? link.querySelector('span');
            if (text && label) text.textContent = label;
            copy.querySelector(':scope > div > button')?.remove();
            return copy;
        }

        function syncNavMarks(container) {
            let item = container.querySelector(':scope > .iv-nav-marks');
            const albums = navItem(container, '/albums');
            if (!item) {
                const source = navItem(container, '/favorites') ?? albums;
                if (!source) return;
                item = navCopy(container, source, { href: `/photos${MARKS_HASH}`, label: 'Marcações', path: ICONS.bookmarks });
                item.classList.add('iv-nav-marks');
            }
            if (albums && item.previousElementSibling !== albums) albums.after(item);
            item.querySelector('a').classList.toggle('iv-nav-current', location.hash === MARKS_HASH);
        }

        function syncNavSystem(container) {
            const items = SYSTEM_PAGES.map(href => navItem(container, href)).filter(Boolean);
            if (!items.length) return;
            for (const item of items) item.classList.add('iv-nav-hidden');
            const inside = SYSTEM_PAGES.some(href => location.pathname.startsWith(href));
            const key = [location.pathname, systemOpen, ...items.map(item => item.querySelector('a').className)].join('|');
            let group = container.querySelector(':scope > .iv-nav-system');
            if (group?.dataset.key === key && group.nextElementSibling === items[0]) return;
            group?.remove();
            group = document.createElement('div');
            group.className = 'iv-nav-system';
            group.dataset.key = key;
            group.classList.toggle('is-open', systemOpen || inside);
            const head = navCopy(container, items[0], { label: 'Sistema', path: ICONS.folderCog });
            head.classList.remove('iv-nav-hidden');
            head.classList.add('iv-nav-system-head');
            const link = head.querySelector('a');
            link.setAttribute('role', 'button');
            link.tabIndex = 0;
            link.setAttribute('aria-expanded', String(group.classList.contains('is-open')));
            link.insertAdjacentHTML('beforeend', icon(ICONS.chevronDown, 18).replace('<svg', '<svg class="iv-nav-chevron"'));
            group.append(head);
            for (const item of items) {
                const copy = item.cloneNode(true);
                copy.classList.remove('iv-nav-hidden');
                copy.classList.add('iv-nav-sub');
                group.append(copy);
            }
            items[0].before(group);
        }

        function toggleSystem(group) {
            systemOpen = !group.classList.contains('is-open');
            setSetting('navSystemOpen', systemOpen);
            group.classList.toggle('is-open', systemOpen);
            group.querySelector('.iv-nav-system-head a')?.setAttribute('aria-expanded', String(systemOpen));
        }

        document.addEventListener('click', event => {
            const head = event.target.closest?.('.iv-nav-system-head');
            if (!head) return;
            event.preventDefault();
            toggleSystem(head.parentElement);
        });
        document.addEventListener('keydown', event => {
            const head = event.target.closest?.('.iv-nav-system-head');
            if (!head || (event.key !== 'Enter' && event.key !== ' ')) return;
            event.preventDefault();
            toggleSystem(head.parentElement);
        });

        // Pinned first, in their order, then the most recently changed.
        // In Immich's sidebar or in the album page's copy of it.
        async function syncNavAlbums(container) {
            const sub = container && navItem(container, '/albums')?.children[1];
            const native = sub?.querySelector(':scope > span:not(.iv-nav-albums)');
            const template = native?.querySelector('a');
            if (!template || navAlbumsBusy.has(container)) return;
            const current = ALBUM_PATH_RE.exec(location.pathname)?.[1] ?? '';
            navAlbumsBusy.add(container);
            let albums;
            try {
                albums = await albumIndex();
            } catch {
                return;
            } finally {
                navAlbumsBusy.delete(container);
            }
            const pinned = prefs.pinnedAlbums.map(id => albums.get(id)).filter(Boolean);
            const recent = [...albums.values()]
                .filter(album => !prefs.pinnedAlbums.includes(album.id))
                .sort((a, b) => compareText(b.updatedAt ?? '', a.updatedAt ?? ''));
            const shown = [...pinned, ...recent].slice(0, NAV_ALBUM_MAX);
            const key = [current, ...shown.map(album => `${album.id}:${album.albumName}:${album.albumThumbnailAssetId}:${prefs.pinnedAlbums.includes(album.id)}`)].join('|');
            let ours = sub.querySelector(':scope > .iv-nav-albums');
            if (ours?.dataset.key === key && native.classList.contains('iv-nav-hidden')) return;
            ours?.remove();
            ours = native.cloneNode(false);
            ours.classList.remove('iv-nav-hidden');
            ours.classList.add('iv-nav-albums');
            ours.dataset.key = key;
            for (const album of shown) {
                const link = template.cloneNode(true);
                link.href = `/albums/${album.id}`;
                link.title = album.albumName;
                const cover = link.querySelector('[style]');
                if (cover) cover.style.backgroundImage = album.albumThumbnailAssetId ? `url("/api/assets/${album.albumThumbnailAssetId}/thumbnail")` : '';
                const label = [...link.querySelectorAll('div')].pop();
                if (label) label.textContent = album.albumName || 'Sem nome';
                link.classList.toggle('iv-nav-current', album.id === current);
                link.classList.toggle('is-pinned', prefs.pinnedAlbums.includes(album.id));
                ours.append(link);
            }
            native.classList.add('iv-nav-hidden');
            sub.append(ours);
        }

        function syncStorage(container) {
            const meter = container.querySelector('[aria-valuetext][aria-valuenow]');
            const card = meter?.closest('[title]');
            if (!card) return;
            card.classList.add('iv-storage');
            const [used, total] = (meter.getAttribute('aria-valuetext') ?? '').match(/[\d.,]+\s*[A-Za-z]+/g) ?? [];
            let label = card.querySelector('.iv-storage-label');
            if (!label) {
                label = document.createElement('div');
                label.className = 'iv-storage-label';
                label.innerHTML = '<span><b></b> de <span></span></span><span></span>';
                meter.after(label);
            }
            const text = [used ?? '', total ?? '', `${Math.round(Number(meter.getAttribute('aria-valuenow')) * 100)}%`];
            if (label.dataset.text === text.join('|')) return;
            label.dataset.text = text.join('|');
            label.querySelector('b').textContent = text[0];
            label.querySelector('span > span').textContent = text[1];
            label.lastElementChild.textContent = text[2];
        }

        function snapshotNav(container) {
            navSnapshotAt = Date.now();
            const active = container.querySelector(':scope > div > div > a[aria-current]')?.className ?? '';
            // The logo is kept on its own, so a sidebar read on a page that
            // shows none (a narrow window) does not lose it.
            const logo = document.querySelector('#dashboard-navbar a:has(img)')?.outerHTML;
            try {
                if (logo && localStorage.getItem(NAV_LOGO_KEY) !== logo) localStorage.setItem(NAV_LOGO_KEY, logo);
            } catch {}
            const snapshot = JSON.stringify({ html: container.innerHTML, className: container.className, idle: idleLinkClass(container), active });
            try {
                if (localStorage.getItem(NAV_KEY) !== snapshot) localStorage.setItem(NAV_KEY, snapshot);
            } catch {}
        }

        // On an album page, which has no sidebar, the saved copy stands in
        // for it, with "Álbuns" as the current page.
        function syncAlbumNav() {
            const root = document.documentElement;
            const show = prefs.albumNav && root.classList.contains('iv-cards-album') && !document.querySelector(VIEWER);
            let nav = document.getElementById('iv-nav');
            if (!show) {
                root.classList.remove('iv-album-nav');
                nav?.remove();
                return;
            }
            const current = ALBUM_PATH_RE.exec(location.pathname)?.[1] ?? '';
            if (nav?.dataset.album === current) {
                syncNavAlbums(nav.querySelector(':scope > div:not(.iv-nav-logo)'));
                return;
            }
            let saved = null;
            try {
                saved = JSON.parse(localStorage.getItem(NAV_KEY) || 'null');
            } catch {}
            if (!saved?.html) {
                root.classList.remove('iv-album-nav');
                return;
            }
            nav ??= document.createElement('nav');
            nav.id = 'iv-nav';
            nav.className = 'bg-light immich-scrollbar';
            nav.setAttribute('aria-label', 'Primário');
            nav.dataset.album = current;
            let logo = '';
            try {
                logo = localStorage.getItem(NAV_LOGO_KEY) ?? '';
            } catch {}
            // Never seen yet: Immich's icon and name, linking home.
            logo ||= `<a href="/photos" class="iv-nav-logo-fallback"><img src="/favicon.ico" alt="" width="28" height="28"><span>immich</span></a>`;
            nav.innerHTML = `<div class="iv-nav-logo">${logo}</div><div class="${saved.className}">${saved.html}</div>`;
            for (const link of nav.querySelectorAll(':scope > div:not(.iv-nav-logo) > div > div > a[href]')) {
                if (link.closest('.iv-nav-system, .iv-nav-marks')) continue;
                link.removeAttribute('aria-current');
                link.className = link.getAttribute('href') === '/albums' ? saved.active || saved.idle : saved.idle || link.className;
            }
            for (const link of nav.querySelectorAll('.iv-nav-albums a')) {
                link.classList.toggle('iv-nav-current', link.getAttribute('href') === `/albums/${current}`);
            }
            nav.querySelector('.iv-nav-marks a')?.classList.remove('iv-nav-current');
            nav.querySelectorAll('[data-focus-trap], :scope > div:not(.iv-nav-logo) > div > div > button').forEach(node => node.remove());
            if (!nav.isConnected) document.body.append(nav);
            root.classList.add('iv-album-nav');
            syncNavAlbums(nav.querySelector(':scope > div:not(.iv-nav-logo)'));
        }

        // ---------------------------------------------------------------------
        //  Albums page bar. Immich's filter tabs, search field, sort, grouping
        //  and view buttons become chips like the album's own bar, and a
        //  search icon swaps the chips for the field. Immich's controls stay
        //  on the page out of sight and are clicked through, so its own state
        //  and saved choices keep working. Its dropdowns are read by opening
        //  and closing them, which renders their options in place.
        // ---------------------------------------------------------------------
        function albumsControls() {
            const header = document.getElementById('user-page-header');
            const controls = location.pathname === '/albums' ? header?.parentElement?.nextElementSibling : null;
            if (!controls) return null;
            const buttons = [...controls.querySelectorAll(':scope > button')];
            const [expand, collapse] = controls.querySelectorAll(':scope > span button');
            const [sort, group] = controls.querySelectorAll(':scope > div.relative > button');
            return {
                header,
                controls,
                filters: [...controls.querySelectorAll('fieldset label')],
                search: controls.querySelector('input[type="text"]'),
                create: buttons[0] ?? null,
                view: buttons.length > 1 ? buttons[buttons.length - 1] : null,
                sort,
                group,
                expand,
                collapse,
            };
        }

        const nextFrame = () => new Promise(resolve => requestAnimationFrame(() => resolve()));

        async function readDropdown(button) {
            button.click();
            await nextFrame();
            const options = [...(button.nextElementSibling?.querySelectorAll('button') ?? [])].map(option => ({
                label: option.querySelector('p')?.textContent.trim() ?? option.textContent.trim(),
                checked: Boolean(option.querySelector('div svg')),
            }));
            button.click();
            return options;
        }

        async function chooseDropdown(button, label) {
            button.click();
            await nextFrame();
            const option = [...(button.nextElementSibling?.querySelectorAll('button') ?? [])]
                .find(item => (item.querySelector('p')?.textContent.trim() ?? item.textContent.trim()) === label);
            if (option) option.click();
            else button.click();
        }

        const albumsAsCovers = () => Boolean(document.querySelector('main [data-testid="album-card"]'));

        function syncAlbumsBar() {
            const parts = albumsControls();
            let bar = document.querySelector('.iv-albums-bar');
            document.documentElement.classList.toggle('iv-albums-page', Boolean(parts));
            document.documentElement.classList.toggle('iv-sharing-page', location.pathname === '/sharing');
            if (!parts) {
                if (location.pathname !== '/albums') bar?.remove();
                return;
            }
            parts.controls.classList.add('iv-out-of-sight');
            if (!bar || bar.previousElementSibling !== parts.controls) {
                bar?.remove();
                bar = buildAlbumsBar();
                parts.controls.after(bar);
            }
            const filter = parts.filters.find(label => document.getElementById(label.htmlFor)?.checked);
            const values = {
                filter: filter?.textContent.trim() ?? '',
                group: parts.group?.textContent.trim() ?? '',
                sort: parts.sort?.textContent.trim() ?? '',
                view: albumsAsCovers() ? `Capas ${COVER_SIZES[prefs.albumCovers].toLowerCase()}` : 'Lista',
            };
            for (const [key, value] of Object.entries(values)) {
                const chip = bar.querySelector(`[data-ab="${key}"]`);
                chip.hidden = !value;
                const text = chip.querySelector('.iv-chip-value');
                if (text.textContent !== value) text.textContent = value;
            }
            bar.querySelector('[data-ab="view"] svg').outerHTML = icon(albumsAsCovers() ? ICONS.gridSmall : ICONS.cards);
            bar.querySelector('[data-ab="create"]').hidden = !parts.create;
            const label = bar.querySelector('[data-ab="create"] .iv-action-label');
            const createText = parts.create?.textContent.trim() ?? '';
            if (createText && label.textContent !== createText) label.textContent = createText;
        }

        function buildAlbumsBar() {
            const bar = document.createElement('div');
            bar.className = 'iv-albums-bar';
            bar.innerHTML = `
                <div class="iv-ab-chips">
                    <button type="button" class="iv-chip" data-ab="filter" aria-haspopup="menu" title="Mostrar">${icon(ICONS.filter)}<span class="iv-chip-value"></span>${icon(ICONS.chevronDown)}</button>
                    <button type="button" class="iv-chip" data-ab="group" aria-haspopup="menu" title="Agrupar">${icon(ICONS.groupBy)}<span class="iv-chip-value"></span>${icon(ICONS.chevronDown)}</button>
                    <button type="button" class="iv-chip" data-ab="sort" aria-haspopup="menu" title="Ordenar">${icon(ICONS.sortBy)}<span class="iv-chip-value"></span>${icon(ICONS.chevronDown)}</button>
                    <button type="button" class="iv-chip" data-ab="view" aria-haspopup="menu" title="Visualização">${icon(ICONS.gridSmall)}<span class="iv-chip-value"></span>${icon(ICONS.chevronDown)}</button>
                </div>
                <button type="button" class="iv-action is-icon" data-ab="search" title="Pesquisar álbuns" aria-label="Pesquisar álbuns">${icon(ICONS.search)}</button>
                <label class="iv-searchbox">${icon(ICONS.search)}<input type="search" placeholder="Pesquisar álbuns" aria-label="Pesquisar álbuns"><button type="button" class="iv-icon-button" data-ab="search-close" title="Fechar pesquisa" aria-label="Fechar pesquisa">${icon(ICONS.close, 18)}</button></label>
                <button type="button" class="iv-action is-primary" data-ab="create">${icon(ICONS.plus)}<span class="iv-action-label"></span></button>
            `;
            const input = bar.querySelector('.iv-searchbox input');
            const closeSearch = () => {
                input.value = '';
                forwardSearch('');
                bar.classList.remove('is-searching');
            };
            bar.addEventListener('click', event => {
                const control = event.target.closest('[data-ab]');
                if (!control) return;
                if (control.dataset.ab === 'search') {
                    bar.classList.add('is-searching');
                    input.focus();
                } else if (control.dataset.ab === 'search-close') {
                    event.preventDefault();
                    closeSearch();
                } else {
                    albumsBarAction(control);
                }
            });
            input.addEventListener('input', () => forwardSearch(input.value));
            input.addEventListener('keydown', event => {
                event.stopPropagation();
                if (event.key === 'Escape') closeSearch();
            });
            return bar;
        }

        // Immich's field filters as it is typed in; it listens to "input".
        function forwardSearch(text) {
            const search = albumsControls()?.search;
            if (!search) return;
            search.value = text;
            search.dispatchEvent(new Event('input', { bubbles: true }));
        }

        async function albumsBarAction(control) {
            if (popup?.anchor === control) {
                closePopup();
                return;
            }
            const parts = albumsControls();
            if (!parts) return;
            const done = () => setTimeout(syncAlbumsBar, 50);
            switch (control.dataset.ab) {
                case 'filter':
                    openPopup(control, parts.filters.map(label => ({
                        label: label.textContent.trim(),
                        checked: Boolean(document.getElementById(label.htmlFor)?.checked),
                        onClick: () => {
                            label.click();
                            done();
                        },
                    })));
                    break;
                case 'group':
                case 'sort': {
                    const button = parts[control.dataset.ab];
                    if (!button) return;
                    const options = await readDropdown(button);
                    const entries = options.map(option => ({
                        label: control.dataset.ab === 'sort' && option.checked ? `${option.label} (inverter)` : option.label,
                        checked: option.checked,
                        onClick: async () => {
                            await chooseDropdown(button, option.label);
                            done();
                        },
                    }));
                    if (control.dataset.ab === 'group' && parts.expand && parts.collapse) {
                        entries.push('-',
                            { label: 'Expandir todos os grupos', icon: ICONS.chevronDown, onClick: () => parts.expand.click() },
                            { label: 'Recolher todos os grupos', icon: ICONS.chevronDown, onClick: () => parts.collapse.click() });
                    }
                    openPopup(control, entries);
                    break;
                }
                case 'view': {
                    const covers = albumsAsCovers();
                    const pick = value => {
                        if ((value === 'list') === covers) parts.view?.click();
                        if (value !== 'list') setPref('albumCovers', value);
                        done();
                    };
                    openPopup(control, [
                        ...Object.entries(COVER_SIZES).map(([size, label]) => ({
                            label: `Capas ${label.toLowerCase()}`,
                            icon: ICONS.gridSmall,
                            checked: covers && prefs.albumCovers === size,
                            onClick: () => pick(size),
                        })),
                        { label: 'Lista', icon: ICONS.cards, checked: !covers, onClick: () => pick('list') },
                    ]);
                    break;
                }
                case 'create':
                    parts.create?.click();
                    break;
            }
        }

        // ---------------------------------------------------------------------
        //  Settings dialog, opened from Immich's account menu, and a first-run
        //  welcome that walks through what the script adds. Both use the
        //  script's own colours, which follow Immich's light or dark theme.
        // ---------------------------------------------------------------------
        function setPref(key, value) {
            prefs[key] = value;
            setSetting(key, value);
            syncPrefs();
        }

        function syncPrefs() {
            const root = document.documentElement;
            for (const size of Object.keys(COVER_SIZES)) root.classList.toggle(`iv-covers-${size}`, prefs.albumCovers === size);
            syncNavAlbums(navContainer());
            syncAlbumNav();
        }

        function syncAccountMenu() {
            const panel = document.getElementById('account-info-panel');
            const source = panel?.querySelector('a[href="/user-settings"]');
            if (!source || panel.querySelector('.iv-settings-entry')) return;
            const entry = source.cloneNode(true);
            entry.classList.add('iv-settings-entry');
            entry.removeAttribute('href');
            entry.setAttribute('role', 'button');
            entry.tabIndex = 0;
            entry.querySelector('svg path')?.setAttribute('d', ICONS.tune);
            // The label is the link's last text; the icon stays.
            const walker = document.createTreeWalker(entry, NodeFilter.SHOW_TEXT);
            let label = null;
            while (walker.nextNode()) if (walker.currentNode.textContent.trim()) label = walker.currentNode;
            if (label) label.textContent = 'Configurações do script';
            const open = event => {
                event.preventDefault();
                // Immich closes the panel on Escape.
                document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
                openSettings();
            };
            entry.addEventListener('click', open);
            entry.addEventListener('keydown', event => {
                if (event.key === 'Enter' || event.key === ' ') open(event);
            });
            const last = [...source.parentElement.querySelectorAll(':scope > a')].pop() ?? source;
            last.after(entry);
        }

        const SETTINGS_TABS = [
            { id: 'player', label: 'Player', icon: ICONS.play },
            { id: 'albums', label: 'Álbuns', icon: ICONS.cards },
            { id: 'sidebar', label: 'Barra lateral', icon: ICONS.sidebar },
            { id: 'about', label: 'Sobre', icon: ICONS.info },
        ];
        let settingsDialog = null;

        function openSettings(tab = 'player') {
            closeSettings();
            const backdrop = document.createElement('div');
            backdrop.className = 'iv-modal-backdrop';
            backdrop.innerHTML = `
                <div class="iv-modal" role="dialog" aria-modal="true" aria-label="Configurações do script">
                    <header class="iv-modal-head">
                        <h2>Configurações do script</h2>
                        <button type="button" class="iv-icon-button" data-action="close" title="Fechar (Esc)" aria-label="Fechar">${icon(ICONS.close)}</button>
                    </header>
                    <nav class="iv-modal-nav" aria-label="Seções">
                        ${SETTINGS_TABS.map(item => `<button type="button" class="iv-modal-tab" data-tab="${item.id}">${icon(item.icon, 20)}<span>${item.label}</span></button>`).join('')}
                    </nav>
                    <div class="iv-modal-body"></div>
                </div>
            `;
            settingsDialog = { backdrop, tab };
            backdrop.addEventListener('click', event => {
                if (event.target === backdrop || event.target.closest('[data-action="close"]')) {
                    closeSettings();
                    return;
                }
                const tabButton = event.target.closest('[data-tab]');
                if (tabButton) showSettingsTab(tabButton.dataset.tab);
            });
            backdrop.addEventListener('keydown', event => event.stopPropagation());
            document.body.append(backdrop);
            showSettingsTab(tab);
            backdrop.querySelector(`[data-tab="${tab}"]`).focus();
        }

        function closeSettings() {
            settingsDialog?.backdrop.remove();
            settingsDialog = null;
        }

        // Escape closes the dialog wherever the focus went, after any of its
        // menus.
        document.addEventListener('keydown', event => {
            if (event.key !== 'Escape' || !settingsDialog || popup) return;
            event.stopPropagation();
            closeSettings();
        }, true);

        function settingRow(label, hint, control) {
            const row = document.createElement('label');
            row.className = 'iv-set-row';
            const text = document.createElement('span');
            text.className = 'iv-set-text';
            text.innerHTML = '<span class="iv-set-label"></span><span class="iv-set-hint"></span>';
            text.firstElementChild.textContent = label;
            text.lastElementChild.textContent = hint;
            row.append(text, control);
            return row;
        }

        function toggleControl(key) {
            const input = document.createElement('input');
            input.type = 'checkbox';
            input.className = 'iv-toggle';
            input.checked = prefs[key];
            input.addEventListener('change', () => setPref(key, input.checked));
            return input;
        }

        function selectControl(options, value, onChange) {
            const select = document.createElement('select');
            select.className = 'iv-select';
            for (const [key, label] of Object.entries(options)) select.add(new Option(label, key, false, key === value));
            select.addEventListener('change', () => onChange(select.value));
            return select;
        }

        function settingsCard(title, rows) {
            const card = document.createElement('section');
            card.className = 'iv-set-card';
            if (title) {
                const heading = document.createElement('h3');
                heading.textContent = title;
                card.append(heading);
            }
            card.append(...rows);
            return card;
        }

        function showSettingsTab(tab) {
            if (!settingsDialog) return;
            settingsDialog.tab = tab;
            const { backdrop } = settingsDialog;
            for (const button of backdrop.querySelectorAll('[data-tab]')) {
                button.classList.toggle('is-active', button.dataset.tab === tab);
            }
            const body = backdrop.querySelector('.iv-modal-body');
            body.replaceChildren();
            if (tab === 'player') {
                let original = true;
                try {
                    original = localStorage.getItem(ORIGINAL_PREF) !== 'false';
                } catch {}
                const quality = document.createElement('input');
                quality.type = 'checkbox';
                quality.className = 'iv-toggle';
                quality.checked = original;
                quality.addEventListener('change', () => {
                    try {
                        localStorage.setItem(ORIGINAL_PREF, String(quality.checked));
                    } catch {}
                    showToast('Vale a partir do próximo carregamento da página');
                });
                body.append(
                    settingsCard('Reprodução', [
                        settingRow('Qualidade original', 'Toca o arquivo original; se o navegador não conseguir, cai para o convertido.', quality),
                        settingRow('Continuar de onde parei', 'Vídeos de 1 minuto ou mais voltam ao ponto em que você parou, em qualquer aparelho.', toggleControl('resume')),
                    ]),
                    settingsCard('Barra do player', [
                        settingRow('Prévia ao passar o mouse', 'Mostra o quadro do vídeo sobre a barra de progresso.', toggleControl('seekPreview')),
                        settingRow('Gestos de toque', 'Dois toques nas laterais pulam 10 s; arrastar na vertical muda brilho e volume.', toggleControl('touchGestures')),
                    ]),
                );
            } else if (tab === 'albums') {
                body.append(settingsCard('Página de álbuns', [
                    settingRow('Tamanho das capas', 'Capas maiores deixam menos colunas.', selectControl(COVER_SIZES, prefs.albumCovers, value => setPref('albumCovers', value))),
                ]), settingsCard('Dentro do álbum', [
                    settingRow('Visualização', 'Cards com título ou grade só de miniaturas.', selectControl({ cards: 'Cards com título', grid: 'Grade' }, state.cardLayouts.album, value => setViewType('album', value))),
                ]));
            } else if (tab === 'sidebar') {
                body.append(settingsCard('Barra lateral do Immich', [
                    settingRow('Mostrar dentro do álbum', 'Mantém a barra lateral aberta também na página de um álbum (telas largas).', toggleControl('albumNav')),
                ]), pinnedAlbumsCard());
            } else {
                const about = document.createElement('div');
                about.className = 'iv-set-about';
                about.innerHTML = `<p><b>Player estilo YouTube, cards e barra lateral para o Immich</b></p><p class="iv-set-hint"></p>`;
                about.querySelector('.iv-set-hint').textContent = `Versão ${typeof GM_info === 'object' ? GM_info.script?.version ?? '' : ''}`.trim();
                const again = document.createElement('button');
                again.type = 'button';
                again.className = 'iv-text-button';
                again.textContent = 'Ver as boas-vindas de novo';
                again.addEventListener('click', () => {
                    closeSettings();
                    showWelcome({ force: true });
                });
                body.append(settingsCard('', [about, again]));
            }
        }

        // Pinned albums lead the "Albums" list in Immich's sidebar, in this
        // order; recent ones fill the rest, up to NAV_ALBUM_MAX.
        function pinnedAlbumsCard() {
            const list = document.createElement('ol');
            list.className = 'iv-pin-list';
            const add = document.createElement('button');
            add.type = 'button';
            add.className = 'iv-text-button';
            add.innerHTML = `${icon(ICONS.albumAdd, 18)}<span>Fixar um álbum</span>`;
            const draw = async () => {
                const albums = await albumIndex().catch(() => new Map());
                list.replaceChildren(...prefs.pinnedAlbums.map((id, index) => {
                    const album = albums.get(id);
                    const row = document.createElement('li');
                    row.className = 'iv-pin-row';
                    row.innerHTML = `
                        <span class="iv-pin-cover"></span>
                        <span class="iv-pin-name"></span>
                        <button type="button" class="iv-icon-button" data-move="-1" title="Subir" aria-label="Subir"${index ? '' : ' disabled'}>${icon(ICONS.chevronDown, 18).replace('<svg', '<svg style="transform: rotate(180deg)"')}</button>
                        <button type="button" class="iv-icon-button" data-move="1" title="Descer" aria-label="Descer"${index < prefs.pinnedAlbums.length - 1 ? '' : ' disabled'}>${icon(ICONS.chevronDown, 18)}</button>
                        <button type="button" class="iv-icon-button" data-unpin title="Desafixar" aria-label="Desafixar">${icon(ICONS.close, 18)}</button>
                    `;
                    row.dataset.id = id;
                    row.querySelector('.iv-pin-name').textContent = album?.albumName ?? 'Álbum indisponível';
                    if (album?.albumThumbnailAssetId) row.querySelector('.iv-pin-cover').style.backgroundImage = `url(/api/assets/${album.albumThumbnailAssetId}/thumbnail)`;
                    return row;
                }));
                if (!prefs.pinnedAlbums.length) {
                    const empty = document.createElement('li');
                    empty.className = 'iv-set-hint';
                    empty.textContent = 'Nenhum fixado: a barra mostra os álbuns mais recentes.';
                    list.append(empty);
                }
                add.disabled = prefs.pinnedAlbums.length >= NAV_ALBUM_MAX;
            };
            list.addEventListener('click', event => {
                const row = event.target.closest('.iv-pin-row');
                if (!row) return;
                const ids = [...prefs.pinnedAlbums];
                const index = ids.indexOf(row.dataset.id);
                const move = event.target.closest('[data-move]');
                if (move) {
                    const to = index + Number(move.dataset.move);
                    [ids[index], ids[to]] = [ids[to], ids[index]];
                } else if (event.target.closest('[data-unpin]')) {
                    ids.splice(index, 1);
                } else {
                    return;
                }
                setPref('pinnedAlbums', ids);
                draw();
            });
            add.addEventListener('click', async () => {
                const albums = [...(await albumIndex()).values()]
                    .filter(album => !prefs.pinnedAlbums.includes(album.id))
                    .sort((a, b) => collator.compare(a.albumName, b.albumName));
                openPopup(add, albums.map(album => ({
                    label: album.albumName || 'Sem nome',
                    onClick: () => {
                        setPref('pinnedAlbums', [...prefs.pinnedAlbums, album.id].slice(0, NAV_ALBUM_MAX));
                        draw();
                    },
                })), { search: true });
            });
            draw();
            const card = settingsCard(`Álbuns fixados (até ${NAV_ALBUM_MAX})`, [list, add]);
            return card;
        }

        function togglePinned(albumId) {
            const pinned = prefs.pinnedAlbums.includes(albumId);
            if (!pinned && prefs.pinnedAlbums.length >= NAV_ALBUM_MAX) {
                showToast(`Já há ${NAV_ALBUM_MAX} álbuns fixados`);
                return;
            }
            setPref('pinnedAlbums', pinned ? prefs.pinnedAlbums.filter(id => id !== albumId) : [...prefs.pinnedAlbums, albumId]);
            showToast(pinned ? 'Álbum desafixado da barra lateral' : 'Álbum fixado na barra lateral');
        }

        // Every album the user can open, by id; read again at most once a
        // minute.
        let albumIndexAt = 0;

        function albumIndex() {
            if (!albumList || Date.now() - albumIndexAt > 60000) {
                albumIndexAt = Date.now();
                albumList = api('/albums');
                albumList.catch(() => { albumList = null; });
            }
            return albumList.then(albums => new Map(albums.map(album => [album.id, album])));
        }

        const WELCOME_STEPS = [
            {
                title: 'Bem-vindo',
                text: 'Este script deixa o Immich com cara de YouTube: um player completo, álbuns em cards ou grade e uma barra lateral para navegar sem sair do vídeo.',
                art: `<div class="iv-wl-hero">${icon(ICONS.play, 56)}<div class="iv-wl-chips"><span>Player</span><span>Marcações</span><span>Continuar assistindo</span><span>Cards e grade</span><span>Seleção</span><span>Barra lateral</span></div></div>`,
            },
            {
                title: 'Um player de verdade',
                text: 'Velocidade de 0,25x a 5x, amplificador de áudio, J/K/L e setas para pular, prévia do quadro ao passar o mouse na barra e, no celular, dois toques nas laterais para pular 10 s.',
                art: `<div class="iv-wl-player"><div class="iv-wl-screen"></div><div class="iv-wl-thumb"></div><div class="iv-wl-track"><i></i></div><div class="iv-wl-bar">${[ICONS.loop, ICONS.previous, ICONS.play, ICONS.next].map(path => icon(path, 18)).join('')}<span class="iv-wl-gap"></span>${[ICONS.bookmarks, ICONS.speed, ICONS.pip].map(path => icon(path, 18)).join('')}</div></div>`,
            },
            {
                title: 'Marcações e progresso',
                text: 'Marque momentos ou trechos (Shift+M), cole uma lista de tempos de uma vez e encontre tudo na página de marcações. Vídeos longos lembram onde você parou, no celular e no computador.',
                art: `<div class="iv-wl-marks">${['0:42 Abertura', '3:15 – 4:02 Melhor parte', '12:30 Final'].map(text => `<span>${icon(ICONS.bookmarks, 14)}${text}</span>`).join('')}</div>`,
            },
            {
                title: 'Álbuns do seu jeito',
                text: 'Cards com título, data e duração ou uma grade compacta, agrupados e ordenados como quiser. O ⋮ de cada item renomeia, favorita, define a capa ou apaga; o círculo no canto seleciona vários.',
                art: `<div class="iv-wl-grid">${'<span><i></i></span>'.repeat(6)}</div>`,
            },
            {
                title: 'Tudo ajustável',
                text: 'As opções ficam no menu da sua conta, em "Configurações do script": qualidade, gestos, tamanho das capas, barra lateral dentro do álbum e os álbuns fixados.',
                art: `<div class="iv-wl-menu"><span>${icon(ICONS.cog, 18)}Configurações da conta</span><span class="is-ours">${icon(ICONS.tune, 18)}Configurações do script</span></div>`,
            },
        ];

        let welcomeShown = Boolean(getSetting('onboarded', false));

        function showWelcome({ force = false } = {}) {
            if ((welcomeShown && !force) || !document.body) return;
            if (!force && !document.querySelector('#dashboard-navbar, #iv-cards')) return;
            welcomeShown = true;
            setSetting('onboarded', true);
            let step = 0;
            const backdrop = document.createElement('div');
            backdrop.className = 'iv-modal-backdrop';
            backdrop.innerHTML = `
                <div class="iv-modal iv-welcome" role="dialog" aria-modal="true" aria-label="Boas-vindas">
                    <div class="iv-wl-art"></div>
                    <div class="iv-wl-content">
                        <div class="iv-wl-counter"></div>
                        <h2 class="iv-wl-title"></h2>
                        <p class="iv-wl-text"></p>
                    </div>
                    <div class="iv-wl-foot">
                        <div class="iv-wl-dots">${WELCOME_STEPS.map(() => '<i></i>').join('')}</div>
                        <button type="button" class="iv-text-button" data-step="skip">Pular</button>
                        <button type="button" class="iv-text-button" data-step="back">Voltar</button>
                        <button type="button" class="iv-text-button is-primary" data-step="next"></button>
                    </div>
                </div>
            `;
            const close = () => backdrop.remove();
            const draw = () => {
                const current = WELCOME_STEPS[step];
                const art = backdrop.querySelector('.iv-wl-art');
                art.innerHTML = `<div class="iv-wl-enter">${current.art}</div>`;
                backdrop.querySelector('.iv-wl-counter').textContent = `${step + 1} de ${WELCOME_STEPS.length}`;
                backdrop.querySelector('.iv-wl-title').textContent = current.title;
                backdrop.querySelector('.iv-wl-text').textContent = current.text;
                backdrop.querySelectorAll('.iv-wl-dots i').forEach((dot, index) => dot.classList.toggle('is-on', index === step));
                backdrop.querySelector('[data-step="back"]').hidden = step === 0;
                backdrop.querySelector('[data-step="skip"]').hidden = step === WELCOME_STEPS.length - 1;
                backdrop.querySelector('[data-step="next"]').textContent = step === WELCOME_STEPS.length - 1 ? 'Começar' : 'Próximo';
            };
            backdrop.addEventListener('click', event => {
                const action = event.target.closest('[data-step]')?.dataset.step;
                if (action === 'skip') close();
                if (action === 'back') step = Math.max(0, step - 1);
                if (action === 'next') {
                    if (step === WELCOME_STEPS.length - 1) close();
                    else step++;
                }
                if (action === 'back' || action === 'next') draw();
            });
            backdrop.addEventListener('keydown', event => {
                event.stopPropagation();
                if (event.key === 'Escape') close();
                if (event.key === 'ArrowRight') backdrop.querySelector('[data-step="next"]').click();
                if (event.key === 'ArrowLeft' && step) backdrop.querySelector('[data-step="back"]').click();
            });
            document.body.append(backdrop);
            draw();
            backdrop.querySelector('[data-step="next"]').focus();
        }

        // ---------------------------------------------------------------------
        //  Marks page: every mark on the server in one searchable list, opened
        //  from the top bar. The server cannot search metadata, so the page
        //  reads the list of videos, then each one's data (shared with the
        //  cards). The last result is kept locally, so the page opens at once
        //  and refreshes behind. A mark opens its video at that time.
        // ---------------------------------------------------------------------
        const MARKS_INDEX_KEY = 'immich-player:marks-index';
        let marksPage = null;

        function readMarksIndex() {
            try {
                const saved = JSON.parse(localStorage.getItem(MARKS_INDEX_KEY) || '[]');
                return Array.isArray(saved) ? saved : [];
            } catch {
                return [];
            }
        }

        function closeMarksPage() {
            if (!marksPage) return;
            clearTimeout(marksPage.drawTimer);
            marksPage.generation++;
            marksPage.root.remove();
            marksPage = null;
        }

        // The page lives at "#marcacoes" over the current page's content, so
        // the browser's back button closes it.
        const MARKS_HASH = '#marcacoes';
        const MARK_KINDS = { all: 'Todas', moment: 'Momentos', range: 'Trechos' };

        function syncMarksPage() {
            const main = location.hash === MARKS_HASH && document.querySelector('#dashboard-navbar') ? document.querySelector('main') : null;
            if (!main) {
                closeMarksPage();
                return;
            }
            if (marksPage?.root.parentElement === main) return;
            closeMarksPage();
            openMarksPage(main);
        }

        function leaveMarksPage() {
            if (location.hash === MARKS_HASH) history.back();
            else closeMarksPage();
        }

        function openMarksPage(main) {
            const root = document.createElement('section');
            root.id = 'iv-marks-page';
            root.setAttribute('aria-label', 'Marcações');
            root.innerHTML = `
                <header class="iv-mp-head">
                    <div class="iv-mp-title-block">
                        <h1>Marcações</h1>
                        <span class="iv-mp-sub"></span>
                    </div>
                    <div class="iv-mp-tools">
                        <div class="iv-mp-kinds" role="group" aria-label="Tipo">
                            ${Object.entries(MARK_KINDS).map(([kind, label]) => `<button type="button" data-kind="${kind}">${label}</button>`).join('')}
                        </div>
                        <label class="iv-mp-searchbox">${icon(ICONS.search, 20)}<input type="search" placeholder="Buscar por marcação ou vídeo" aria-label="Buscar marcações"></label>
                    </div>
                </header>
                <div class="iv-mp-scroll">
                    <div class="iv-mp-status"></div>
                    <div class="iv-mp-list"></div>
                </div>
            `;
            const page = {
                root,
                list: root.querySelector('.iv-mp-list'),
                status: root.querySelector('.iv-mp-status'),
                search: root.querySelector('.iv-mp-searchbox input'),
                kind: 'all',
                videos: readMarksIndex(),
                generation: 0,
                drawTimer: 0,
            };
            marksPage = page;
            root.addEventListener('click', event => {
                const kind = event.target.closest('[data-kind]')?.dataset.kind;
                if (kind) {
                    page.kind = kind;
                    drawMarksPage(page);
                    return;
                }
                const mark = event.target.closest('.iv-mp-mark');
                const video = event.target.closest('.iv-mp-video');
                if (!mark && !video) return;
                event.preventDefault();
                const id = (mark ?? video).dataset.id;
                if (mark) sessionStorage.setItem(SEEK_KEY, JSON.stringify({ id, t: Number(mark.dataset.t) }));
                navigateTo(`/photos/${id}`);
            });
            root.addEventListener('keydown', event => {
                if (event.key !== 'Escape') return;
                event.stopPropagation();
                if (page.search.value) {
                    page.search.value = '';
                    drawMarksPage(page);
                } else {
                    leaveMarksPage();
                }
            });
            page.search.addEventListener('keydown', event => {
                if (event.key !== 'Escape') event.stopPropagation();
            });
            page.search.addEventListener('input', () => drawMarksPage(page));
            main.append(root);
            page.search.focus({ preventScroll: true });
            drawMarksPage(page);
            scanMarks(page);
        }

        async function scanMarks(page) {
            const generation = ++page.generation;
            const videos = [];
            try {
                let cursor = null;
                do {
                    const result = await api('/search/metadata', {
                        method: 'POST',
                        body: {
                            filter: { type: { eq: 'VIDEO' } },
                            orderBy: { field: 'localDateTime', direction: 'desc' },
                            size: 1000,
                            withExif: true,
                            ...(cursor ? { cursor } : {}),
                        },
                    });
                    videos.push(...result.assets.items.map(cardItem));
                    cursor = result.assets.nextCursor ?? null;
                    if (generation !== page.generation) return;
                    page.status.textContent = `Lendo vídeos… ${videos.length}`;
                } while (cursor);
            } catch (error) {
                if (generation === page.generation) page.status.textContent = 'Não foi possível ler os vídeos.';
                console.warn('[immich-player] marks scan failed', error);
                return;
            }
            const found = [];
            let read = 0;
            await Promise.all(videos.map(item => assetInfo(item.id).then(info => {
                read++;
                if (info.marks.length) {
                    found.push({
                        id: item.id,
                        title: displayTitle(item),
                        takenAt: item.takenAt,
                        duration: item.duration,
                        marks: info.marks,
                    });
                }
                if (generation !== page.generation) return;
                page.status.textContent = `Lendo marcações… ${read} de ${videos.length} vídeos`;
                // Redrawn in batches while the reads come in.
                page.drawTimer ||= setTimeout(() => {
                    page.drawTimer = 0;
                    if (generation !== page.generation) return;
                    page.videos = sortByDate(found);
                    drawMarksPage(page);
                }, 400);
            })));
            if (generation !== page.generation) return;
            clearTimeout(page.drawTimer);
            page.drawTimer = 0;
            page.videos = sortByDate(found);
            try {
                localStorage.setItem(MARKS_INDEX_KEY, JSON.stringify(page.videos));
            } catch {}
            page.status.textContent = '';
            drawMarksPage(page);
        }

        const sortByDate = videos => [...videos].sort((a, b) => compareText(b.takenAt, a.takenAt));

        // A search matching the video's title shows all its marks; otherwise
        // only the marks whose name matches. The kind narrows to moments or
        // intervals.
        function drawMarksPage(page) {
            const query = normalize(page.search.value.trim());
            for (const button of page.root.querySelectorAll('[data-kind]')) {
                button.classList.toggle('is-active', button.dataset.kind === page.kind);
            }
            const fragment = document.createDocumentFragment();
            let shown = 0;
            let total = 0;
            for (const video of page.videos) {
                total += video.marks.length;
                const titleHit = !query || normalize(video.title).includes(query);
                const marksShown = video.marks
                    .map((mark, index) => ({ mark, index }))
                    .filter(({ mark }) => page.kind === 'all' || (page.kind === 'range') === Boolean(mark.end))
                    .filter(({ mark, index }) => titleHit || normalize(markLabel(mark, index)).includes(query));
                if (!marksShown.length) continue;
                shown += marksShown.length;
                fragment.append(marksRow(video, marksShown));
            }
            page.list.replaceChildren(fragment);
            if (!shown) {
                const empty = document.createElement('div');
                empty.className = 'iv-mp-empty';
                empty.innerHTML = `${icon(ICONS.bookmarks, 40)}<p></p>`;
                empty.querySelector('p').textContent = query || page.kind !== 'all'
                    ? 'Nada encontrado.'
                    : page.status.textContent ? 'Procurando marcações…' : 'Nenhuma marcação ainda. No player, Shift+M marca o momento atual.';
                page.list.append(empty);
            }
            page.root.querySelector('.iv-mp-sub').textContent = total
                ? `${plural(page.videos.length, 'vídeo', 'vídeos')} • ${plural(total, 'marcação', 'marcações')}`
                : '';
        }

        function marksRow(video, marksShown) {
            const row = document.createElement('article');
            row.className = 'iv-mp-row';
            const head = document.createElement('a');
            head.className = 'iv-mp-video iv-mp-cover';
            head.href = `/photos/${video.id}`;
            head.dataset.id = video.id;
            const image = document.createElement('img');
            image.loading = 'lazy';
            image.alt = '';
            image.src = `/api/assets/${video.id}/thumbnail?size=preview`;
            head.append(image);
            const duration = formatDuration(video.duration);
            if (duration) {
                const badge = document.createElement('span');
                badge.className = 'iv-item-badge';
                badge.textContent = duration;
                head.append(badge);
            }
            const body = document.createElement('div');
            body.className = 'iv-mp-body';
            const title = document.createElement('a');
            title.className = 'iv-mp-video iv-mp-title';
            title.href = head.href;
            title.dataset.id = video.id;
            title.textContent = video.title;
            const meta = document.createElement('div');
            meta.className = 'iv-mp-meta';
            meta.textContent = [formatDate(video.takenAt, { dateStyle: 'medium', timeZone: 'UTC' }), plural(video.marks.length, 'marcação', 'marcações')].filter(Boolean).join(' • ');
            const list = document.createElement('div');
            list.className = 'iv-mp-marks';
            for (const { mark, index } of marksShown) {
                const item = document.createElement('button');
                item.type = 'button';
                item.className = 'iv-mp-mark';
                item.dataset.id = video.id;
                item.dataset.t = String(mark.t);
                item.title = `Abrir em ${formatMarkTime(mark.t)}`;
                const time = document.createElement('span');
                time.className = 'iv-mp-time';
                time.textContent = markSpan(mark);
                const label = document.createElement('span');
                label.className = 'iv-mp-label';
                label.textContent = markLabel(mark, index);
                item.append(time, label);
                list.append(item);
            }
            body.append(title, meta, list);
            row.append(head, body);
            return row;
        }

        // ---------------------------------------------------------------------
        //  Selection and single-item actions. A card's check, or Ctrl/Cmd+
        //  click, selects it; while anything is selected a click toggles and
        //  Shift+click takes the whole range from the last one. The "⋮" on a
        //  card acts on that item alone. Both run the same actions through
        //  the API; whatever leaves the view is taken out of it.
        // ---------------------------------------------------------------------
        function bindSelection(view) {
            view.body.addEventListener('click', event => {
                const link = event.target.closest('.iv-card');
                if (!link || event.target.closest('.iv-card-title[contenteditable]')) return;
                if (view.pickingCover) {
                    event.preventDefault();
                    event.stopPropagation();
                    const item = view.byId.get(link.dataset.id);
                    pickCover(view, false);
                    if (item) setAlbumCover(view, item);
                    return;
                }
                const more = event.target.closest('.iv-card-more');
                const check = event.target.closest('.iv-card-check');
                if (!more && !check && !view.selected.size && !event.metaKey && !event.ctrlKey) return;
                // Ahead of SvelteKit's link handling, which skips a prevented click.
                event.preventDefault();
                event.stopPropagation();
                if (more) openCardMenu(view, link, more);
                else toggleSelected(view, link.dataset.id, event.shiftKey);
            }, true);
        }

        function pickCover(view, on) {
            view.pickingCover = on;
            if (on) clearSelection(view);
            view.root.classList.toggle('is-picking-cover', on);
        }

        function toggleSelected(view, id, range = false) {
            const ids = view.items.map(item => item.id);
            const from = ids.indexOf(view.anchor);
            const to = ids.indexOf(id);
            if (range && from >= 0 && to >= 0) {
                for (const each of ids.slice(Math.min(from, to), Math.max(from, to) + 1)) view.selected.add(each);
            } else if (view.selected.has(id)) {
                view.selected.delete(id);
            } else {
                view.selected.add(id);
            }
            view.anchor = id;
            syncSelection(view);
        }

        function clearSelection(view) {
            view.selected.clear();
            view.anchor = null;
            syncSelection(view);
        }

        function syncSelection(view) {
            const count = view.selected.size;
            view.root.classList.toggle('is-selecting', count > 0);
            for (const link of view.root.querySelectorAll('.iv-card')) {
                link.classList.toggle('is-selected', view.selected.has(link.dataset.id));
            }
            view.root.querySelector('.iv-select-count').textContent = `${count} ${count === 1 ? 'selecionado' : 'selecionados'}`;
            const cover = view.root.querySelector('[data-select="cover"]');
            if (cover) cover.hidden = count !== 1;
            const favorite = view.root.querySelector('[data-select="favorite"]');
            const unfavorite = count > 0 && [...view.selected].every(id => view.byId.get(id)?.isFavorite);
            const label = unfavorite ? 'Remover dos favoritos' : 'Favoritar';
            favorite.innerHTML = icon(unfavorite ? ICONS.heart : ICONS.heartOutline);
            favorite.title = label;
            favorite.setAttribute('aria-label', label);
        }

        function selectionAction(view, control) {
            const ids = [...view.selected];
            switch (control.dataset.select) {
                case 'clear':
                    clearSelection(view);
                    break;
                case 'all':
                    for (const item of view.items) view.selected.add(item.id);
                    syncSelection(view);
                    break;
                case 'album':
                    pickAlbum(view, ids, control);
                    break;
                case 'cover': {
                    const item = view.byId.get(ids[0]);
                    clearSelection(view);
                    if (item) setAlbumCover(view, item);
                    break;
                }
                default:
                    runAction(view, control.dataset.select, ids);
            }
        }

        function openCardMenu(view, link, anchor) {
            if (popup?.anchor === anchor) {
                closePopup();
                return;
            }
            const item = view.byId.get(link.dataset.id);
            if (!item) return;
            const ids = [item.id];
            openPopup(anchor, [
                { label: 'Renomear', icon: ICONS.pencil, onClick: () => renameCard(view, link, item) },
                {
                    label: item.isFavorite ? 'Remover dos favoritos' : 'Favoritar',
                    icon: item.isFavorite ? ICONS.heart : ICONS.heartOutline,
                    onClick: () => runAction(view, 'favorite', ids),
                },
                { label: 'Selecionar', icon: ICONS.check, onClick: () => toggleSelected(view, item.id) },
                { label: 'Adicionar a um álbum…', icon: ICONS.albumAdd, onClick: () => pickAlbum(view, ids, anchor) },
                { label: 'Baixar', icon: ICONS.download, onClick: () => runAction(view, 'download', ids) },
                ...(view.albumId ? [{ label: 'Definir como capa do álbum', icon: ICONS.cover, onClick: () => setAlbumCover(view, item) }] : []),
                '-',
                ...(view.albumId ? [{ label: 'Remover deste álbum', icon: ICONS.albumRemove, onClick: () => runAction(view, 'remove', ids) }] : []),
                { label: 'Arquivar', icon: ICONS.archive, onClick: () => runAction(view, 'archive', ids) },
                { label: 'Mover para a lixeira', icon: ICONS.trash, danger: true, onClick: () => runAction(view, 'trash', ids) },
            ], { align: 'end' });
        }

        // In the cards the title is edited in place; the grid has no titles
        // on screen, so it asks.
        function renameCard(view, link, item) {
            const title = link.querySelector('.iv-card-title');
            if (!title) return;
            if (state.cardLayouts[view.type] === 'grid') {
                const typed = prompt('Título', displayTitle(item));
                if (typed === null) return;
                title.dataset.before = title.textContent;
                title.textContent = typed;
                saveTitle(view, title);
                return;
            }
            title.setAttribute('contenteditable', 'plaintext-only');
            title.focus();
            getSelection()?.selectAllChildren(title);
        }

        const plural = (count, one, many) => `${count} ${count === 1 ? one : many}`;

        async function runAction(view, action, ids) {
            const items = ids.map(id => view.byId.get(id)).filter(Boolean);
            if (!items.length) return;
            const what = plural(items.length, 'item', 'itens');
            try {
                switch (action) {
                    case 'favorite': {
                        const on = !items.every(item => item.isFavorite);
                        await api('/assets', { method: 'PUT', body: { ids, isFavorite: on } });
                        for (const item of items) {
                            item.isFavorite = on;
                            paintFavorite(view, item);
                        }
                        if (!on && view.type === 'favorites') dropCards(view, ids);
                        showToast(on ? 'Adicionado aos favoritos' : 'Removido dos favoritos');
                        break;
                    }
                    case 'download':
                        await downloadAssets(items);
                        break;
                    case 'remove':
                        if (!confirm(`Remover ${what} deste álbum? Eles continuam na sua biblioteca.`)) return;
                        await api(`/albums/${view.albumId}/assets`, { method: 'DELETE', body: { ids } });
                        dropCards(view, ids);
                        showToast(`${what} removido${items.length === 1 ? '' : 's'} do álbum`);
                        break;
                    case 'archive':
                        await api('/assets', { method: 'PUT', body: { ids, visibility: 'archive' } });
                        // Archived items leave the timeline; an album keeps them.
                        if (!view.isAlbum) dropCards(view, ids);
                        showToast(`${what} arquivado${items.length === 1 ? '' : 's'}`);
                        break;
                    case 'trash':
                        if (!confirm(`Mover ${what} para a lixeira?`)) return;
                        await api('/assets', { method: 'DELETE', body: { ids } });
                        dropCards(view, ids);
                        showToast(`${what} na lixeira`);
                        break;
                }
                clearSelection(view);
            } catch (error) {
                showToast('Não foi possível concluir a ação');
                console.warn('[immich-player] action failed', action, error);
            }
        }

        async function setAlbumCover(view, item) {
            try {
                await api(`/albums/${view.albumId}`, { method: 'PATCH', body: { albumThumbnailAssetId: item.id } });
                const cover = view.root.querySelector('.iv-cards-cover');
                cover.src = `/api/assets/${item.id}/thumbnail?size=preview`;
                cover.hidden = false;
                albumList = null;
                showToast('Capa do álbum atualizada');
            } catch (error) {
                showToast('Não foi possível trocar a capa');
                console.warn('[immich-player] album cover failed', error);
            }
        }

        let albumList = null;

        async function pickAlbum(view, ids, anchor) {
            try {
                albumList ??= api('/albums');
                const albums = (await albumList)
                    .filter(album => album.id !== view.albumId)
                    .sort((a, b) => compareText(b.updatedAt ?? '', a.updatedAt ?? ''));
                openPopup(anchor, albums.map(album => ({
                    label: album.albumName || 'Sem nome',
                    onClick: () => addToAlbum(view, album, ids),
                })), { align: 'end', search: true });
            } catch (error) {
                albumList = null;
                showToast('Não foi possível ler os álbuns');
                console.warn('[immich-player] albums failed', error);
            }
        }

        async function addToAlbum(view, album, ids) {
            try {
                const results = await api(`/albums/${album.id}/assets`, { method: 'PUT', body: { ids } });
                const added = Array.isArray(results) ? results.filter(result => result.success).length : ids.length;
                state.albums.delete(album.id);
                albumList = null;
                showToast(added
                    ? `${plural(added, 'item adicionado', 'itens adicionados')} a “${album.albumName}”`
                    : `Já estava${ids.length === 1 ? '' : 'm'} em “${album.albumName}”`);
                clearSelection(view);
            } catch (error) {
                showToast('Não foi possível adicionar ao álbum');
                console.warn('[immich-player] add to album failed', error);
            }
        }

        function saveFile(href, name) {
            const link = document.createElement('a');
            link.href = href;
            link.download = name;
            link.hidden = true;
            document.body.append(link);
            link.click();
            link.remove();
        }

        // One item downloads its original; several come as one zip.
        async function downloadAssets(items) {
            if (items.length === 1) {
                saveFile(`/api/assets/${items[0].id}/original`, items[0].fileName || '');
                return;
            }
            showToast(`Preparando ${plural(items.length, 'item', 'itens')}…`);
            const response = await fetch('/api/download/archive', {
                method: 'POST',
                credentials: 'same-origin',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ assetIds: items.map(item => item.id) }),
            });
            if (!response.ok) throw new Error(`download: HTTP ${response.status}`);
            const url = URL.createObjectURL(await response.blob());
            saveFile(url, 'immich.zip');
            setTimeout(() => URL.revokeObjectURL(url), 60000);
        }

        function paintFavorite(view, item) {
            const thumb = view.root.querySelector(`.iv-card[data-id="${item.id}"] .iv-card-thumb`);
            if (!thumb) return;
            let favorite = thumb.querySelector('.iv-card-fav');
            if (!item.isFavorite) {
                favorite?.remove();
                return;
            }
            if (favorite) return;
            favorite = document.createElement('span');
            favorite.className = 'iv-card-fav';
            favorite.title = 'Favorito';
            favorite.innerHTML = icon(ICONS.heart);
            thumb.append(favorite);
        }

        // Takes items out of the view, keeping its groups' counts right.
        function dropCards(view, ids) {
            const gone = new Set(ids);
            for (const item of view.items) {
                if (!gone.has(item.id)) continue;
                const key = groupOf(item, state.cardGroup)[0];
                if (view.groupTotals.has(key)) view.groupTotals.set(key, view.groupTotals.get(key) - 1);
            }
            const before = view.items.length;
            view.items = view.items.filter(item => !gone.has(item.id));
            if (view.allItems) view.allItems = view.allItems.filter(item => !gone.has(item.id));
            view.rendered = Math.max(0, view.rendered - (before - view.items.length));
            for (const id of ids) {
                view.root.querySelector(`.iv-card[data-id="${id}"]`)?.remove();
                view.byId.delete(id);
                view.selected.delete(id);
            }
            for (const section of view.body.querySelectorAll('.iv-cards-month')) {
                const shown = section.querySelectorAll('.iv-card').length;
                const total = view.groupTotals.get(section.dataset.group) ?? shown;
                if (!shown && !total) {
                    if (view.group?.grid.parentElement === section) view.group = null;
                    section.remove();
                    continue;
                }
                const counter = section.querySelector('h2 small');
                if (counter) counter.textContent = plural(total, 'item', 'itens');
            }
            if (view.complete) view.root.querySelector('.iv-cards-count').textContent = plural(view.items.length, 'item', 'itens');
            if (view.albumId) state.albums.delete(view.albumId);
            syncSelection(view);
        }

        let toastTimer = 0;

        // A short notice at the bottom of the page, outside the player.
        function showToast(text) {
            let toast = document.querySelector('.iv-toast');
            if (!toast) {
                toast = document.createElement('div');
                toast.className = 'iv-toast';
                toast.setAttribute('role', 'status');
                document.body.append(toast);
            }
            toast.textContent = text;
            toast.classList.add('is-visible');
            clearTimeout(toastTimer);
            toastTimer = setTimeout(() => toast.classList.remove('is-visible'), 2600);
        }

        // ---------------------------------------------------------------------
        //  Title editing, right on the card. Immich's API cannot change a
        //  file's name, so the title is saved as the asset's description,
        //  which is also what Immich's details panel shows. Clearing it
        //  brings the file name back.
        // ---------------------------------------------------------------------
        function setTitleEditable(view, title) {
            if (view.editing) title.setAttribute('contenteditable', 'plaintext-only');
            else title.removeAttribute('contenteditable');
            title.spellcheck = false;
        }

        function bindTitleEditing(view) {
            const { scroller } = view;
            const editable = target => target.closest?.('.iv-card-title[contenteditable]') ?? null;
            // Clicking a title edits it instead of opening the asset.
            scroller.addEventListener('click', event => {
                if (editable(event.target)) event.preventDefault();
            });
            scroller.addEventListener('focusin', event => {
                const title = editable(event.target);
                if (title) title.dataset.before = title.textContent;
            });
            scroller.addEventListener('keydown', event => {
                const title = editable(event.target);
                if (!title) return;
                // Immich's shortcuts must not see what is typed here.
                event.stopPropagation();
                if (event.key === 'Enter') {
                    event.preventDefault();
                    title.blur();
                } else if (event.key === 'Escape') {
                    event.preventDefault();
                    title.textContent = title.dataset.before ?? title.textContent;
                    title.blur();
                } else if (event.key === 'Tab') {
                    // Tab walks from title to title.
                    event.preventDefault();
                    const titles = [...view.root.querySelectorAll('.iv-card-title')];
                    titles[titles.indexOf(title) + (event.shiftKey ? -1 : 1)]?.focus();
                }
            }, true);
            scroller.addEventListener('focusout', event => {
                const title = editable(event.target);
                if (!title) return;
                saveTitle(view, title);
                // A title opened from the card's menu closes again.
                setTitleEditable(view, title);
            });
        }

        async function saveTitle(view, title) {
            const link = title.closest('.iv-card');
            const item = view.byId.get(link.dataset.id);
            const typed = title.textContent.replace(/\s+/g, ' ').trim();
            if (!item || typed === title.dataset.before) {
                if (item) showTitle(link, title, item);
                return;
            }
            // Typing the file name back is the same as clearing the title.
            const description = typed === withoutExtension(item.fileName) ? '' : typed;
            if (description === item.text) {
                showTitle(link, title, item);
                return;
            }
            title.classList.add('is-saving');
            title.classList.remove('is-error');
            try {
                await api(`/assets/${item.id}`, { method: 'PUT', body: { description } });
                item.text = description;
                showTitle(link, title, item);
            } catch (error) {
                showTitle(link, title, item);
                title.classList.add('is-error');
                link.title = 'Não foi possível salvar o título';
                console.warn('[immich-player] title save failed', item.id, error);
            } finally {
                title.classList.remove('is-saving');
            }
        }

        // Like YouTube, a video starts playing muted in its card after the
        // pointer rests on it for a moment.
        function previewOnHover(link, thumb, assetId) {
            let timer = 0;
            link.addEventListener('mouseenter', () => {
                timer = setTimeout(() => {
                    const video = document.createElement('video');
                    video.muted = true;
                    video.loop = true;
                    video.playsInline = true;
                    video.autoplay = true;
                    video.src = `/api/assets/${assetId}/video/playback`;
                    thumb.append(video);
                }, 500);
            });
            link.addEventListener('mouseleave', () => {
                clearTimeout(timer);
                thumb.querySelector('video')?.remove();
            });
        }

        const RELATIVE_UNITS = [['year', 31536000], ['month', 2592000], ['week', 604800], ['day', 86400], ['hour', 3600], ['minute', 60]];
        const relativeFormat = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' });

        // "há 3 meses", as YouTube dates its videos.
        function relativeDate(value) {
            const time = new Date(value).getTime();
            if (!value || Number.isNaN(time)) return '';
            const seconds = (time - Date.now()) / 1000;
            const [unit, size] = RELATIVE_UNITS.find(([, size]) => Math.abs(seconds) >= size) ?? ['minute', 60];
            return relativeFormat.format(Math.round(seconds / size), unit);
        }

        // ---------------------------------------------------------------------
        //  Lifecycle: Immich is a SvelteKit SPA, so watch both the DOM and the URL.
        // ---------------------------------------------------------------------
        let lastPath = '';
        let scheduled = false;

        function refresh() {
            scheduled = false;
            const controller = activePlayer();
            if (controller) {
                enhancePlayer(controller);
                syncPlayerControls();
            }
            syncMarks();
            syncWatch();
            syncNavbar();
            syncMarksPage();
            syncAccountMenu();
            syncNavExtras();
            syncAlbumNav();
            syncNavToggle();
            syncAlbumsBar();
            showWelcome();
            syncCards();
            const path = location.pathname;
            const viewerOpen = Boolean(document.querySelector(VIEWER));
            const sidebarStale = document.documentElement.classList.contains('iv-album-viewer') !== (viewerOpen && ALBUM_ASSET_RE.test(path));
            if (path !== lastPath || sidebarStale) {
                lastPath = path;
                syncSidebar();
            }
        }

        function scheduleRefresh() {
            if (scheduled) return;
            scheduled = true;
            requestAnimationFrame(refresh);
        }

        for (const method of ['pushState', 'replaceState']) {
            const original = history[method];
            history[method] = function() {
                const result = original.apply(this, arguments);
                scheduleRefresh();
                return result;
            };
        }
        window.addEventListener('popstate', scheduleRefresh);
        window.addEventListener('hashchange', scheduleRefresh);

        function start() {
            syncPrefs();
            new MutationObserver(scheduleRefresh).observe(document.body, { childList: true, subtree: true });
            scheduleRefresh();
        }

        if (document.body) start();
        else document.addEventListener('DOMContentLoaded', start, { once: true });
    }
})();
