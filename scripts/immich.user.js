// ==UserScript==
// @name         Immich — YouTube-Style Player, Cards & Album Sidebar
// @namespace    immich-player
// @version      2.2.0
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
            groupBy: 'M3,4H21V8H3V4M3,10H21V14H3V10M3,16H21V20H3V16Z',
            sortBy: 'M18,21L14,17H17V7H14L18,3L22,7H19V17H22M2,19V17H12V19M2,13V11H9V13M2,7V5H6V7H2Z',
            pencil: 'M20.71,7.04C21.1,6.65 21.1,6 20.71,5.63L18.37,3.29C18,2.9 17.35,2.9 16.96,3.29L15.12,5.12L18.87,8.87M3,17.25V21H6.75L17.81,9.93L14.06,6.18L3,17.25Z',
            cards: 'M20,20H4A2,2 0 0,1 2,18V6A2,2 0 0,1 4,4H20A2,2 0 0,1 22,6V18A2,2 0 0,1 20,20M4,6V18H20V6H4M6,9H18V11H6V9M6,13H16V15H6V13Z',
        };

        // An icon is a 24px path, or { d, viewBox, transform } for one drawn
        // on another grid.
        function icon(path, size = 24, label = '') {
            const { d, viewBox = '0 0 24 24', transform = '' } = typeof path === 'object' ? path : { d: path };
            const text = label ? `<text x="12" y="21.5" fill="currentColor" font-size="10" font-weight="700" text-anchor="middle" font-family="system-ui, sans-serif">${label}</text>` : '';
            return `<svg width="${size}" height="${size}" viewBox="${viewBox}" aria-hidden="true"><path fill="currentColor" d="${d}"${transform ? ` transform="${transform}"` : ''}/>${text}</svg>`;
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
            // Card view per page type: on by default in albums, off on the
            // main timeline.
            cardViews: {
                album: Boolean(getSetting('cardsAlbum', true)),
                home: Boolean(getSetting('cardsHome', false)),
            },
            // Group and order of the open card view, read per page type
            // when it opens (see CARD_ORDER_DEFAULTS).
            cardGroup: 'month',
            cardSort: 'date-desc',
            albums: new Map(),
            renderedAlbum: null,
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

        // An original the browser cannot decode (some HEVC/ProRes files) falls
        // back to the transcoded stream instead of showing an error.
        document.addEventListener('error', event => {
            const video = event.target;
            if (!(video instanceof HTMLVideoElement) || !video.closest(VIEWER)) return;
            const src = video.getAttribute('src') || '';
            if (!src.includes('/original')) return;
            const time = video.currentTime;
            video.setAttribute('src', src.replace(/\/original(\?|$)/, '/video/playback$1').replace(/([?&])size=original&?/, '$1'));
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
            html:not(.dark) #iv-sidebar,
            html:not(.dark) #iv-cards,
            html:not(.dark) .iv-cards-toggle {
                --iv-bg: #ffffff;
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
            html.iv-cards-on main:has(> #iv-cards) > :not(#iv-cards) {
                visibility: hidden !important;
            }
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
            const previous = controlButton('iv-previous', 'Anterior', ICONS.previous, () => assetNavButton('previous')?.click());
            const next = controlButton('iv-next', 'Próximo', ICONS.next, () => assetNavButton('next')?.click());
            const loop = controlButton('iv-loop', 'Repetir', ICONS.loop, toggleLoop);
            loop.insertAdjacentHTML('beforeend', '<span class="iv-badge is-on">ON</span>');
            const autoplay = controlButton('iv-autoplay', 'Autoplay', '', toggleAutoplay);
            autoplay.innerHTML = `<span class="iv-autoplay-track"><span class="iv-autoplay-thumb">${icon(ICONS.pause, 10).replace('<svg', '<svg class="iv-autoplay-off"')}${icon(ICONS.play, 10).replace('<svg', '<svg class="iv-autoplay-on"')}</span></span>`;
            const pip = controlButton('iv-pip', 'Picture-in-picture', ICONS.pip, togglePictureInPicture);
            pip.hidden = !document.pictureInPictureEnabled;
            // Placement comes from the CSS order rules, so these only need to sit
            // next to static nodes, away from Svelte's block anchors.
            timeDisplay.after(loop, previous, next, autoplay, ...buildMarkControls(controller), boost, speed, pip);
            // media-chrome hides the controls 2s after the last input, paused
            // or not; on a touch screen a tap is the only input, so they
            // flashed. Keep them while paused, and longer after a tap.
            if (video && matchMedia('(pointer: coarse)').matches) {
                const syncAutohide = () => controller.setAttribute('autohide', video.paused ? '-1' : '4');
                video.addEventListener('play', syncAutohide);
                video.addEventListener('pause', syncAutohide);
                syncAutohide();
            }
            renderMarks();
            syncDials();
            syncPlayerControls();
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

        function syncPlayerControls() {
            for (const direction of ['previous', 'next']) {
                const button = document.querySelector(`${PLAYER} .iv-${direction}`);
                if (button) button.disabled = !assetNavButton(direction);
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
            if (state.autoplay) playNextVideo();
        }, true);

        // Inside an album the next *video* is known from the album listing, in
        // the album page's order, so photos in between are skipped. Elsewhere,
        // fall back to the next asset.
        async function playNextVideo() {
            const match = ALBUM_ASSET_RE.exec(location.pathname);
            if (match) {
                const [, albumId, assetId] = match;
                try {
                    const album = await albumData(albumId);
                    const items = orderedAlbumItems(album.items, albumOrder());
                    const index = items.findIndex(item => item.id === assetId);
                    const next = items.slice(index + 1).find(item => item.isVideo);
                    if (!next) {
                        showHud('Fim dos vídeos do álbum');
                        return;
                    }
                    showHud('Próximo vídeo');
                    navigateTo(`/albums/${albumId}/photos/${next.id}`);
                    return;
                } catch (error) {
                    console.warn('[immich-player] autoplay could not read the album', error);
                }
            }
            assetNavButton('next')?.click();
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
        const markCounts = new Map();
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
                markCounts.set(assetId, Promise.resolve(list.length));
                renderMarks();
            });
        }

        async function saveMarks() {
            const { assetId, list } = marks;
            if (!assetId) return;
            markCounts.set(assetId, Promise.resolve(list.length));
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
            video?.addEventListener('timeupdate', () => markCurrent(root));

            marksControls.push({ root, ticks, range });
            return [add, root];
        }

        function placeTicks(range, ticks) {
            ticks.style.left = `${range.offsetLeft + 8}px`;
            ticks.style.width = `${Math.max(0, range.offsetWidth - 16)}px`;
            ticks.style.top = `${range.offsetTop + 8}px`;
        }

        function markCurrent(root) {
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
                markCurrent(root);

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
        const markQueue = [];
        let markRequests = 0;

        function markCount(assetId) {
            if (!markCounts.has(assetId)) {
                markCounts.set(assetId, new Promise(resolve => {
                    markQueue.push({ assetId, resolve });
                    pumpMarkCounts();
                }));
            }
            return markCounts.get(assetId);
        }

        function pumpMarkCounts() {
            while (markRequests < 4 && markQueue.length) {
                const { assetId, resolve } = markQueue.shift();
                markRequests++;
                fetchMarks(assetId).then(list => resolve(list.length)).finally(() => {
                    markRequests--;
                    pumpMarkCounts();
                });
            }
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
                if (event.key === 'b' && document.documentElement.classList.contains('iv-album-viewer')) {
                    consume(event);
                    toggleSidebar();
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

        async function api(path, { method = 'GET', body } = {}) {
            const response = await fetch(`/api${path}`, {
                method,
                credentials: 'same-origin',
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
                const current = state.cardViews.album ? 'cards' : 'grid';
                openPopup(chip, Object.entries(CARD_VIEW_TYPES).map(([value, type]) => ({
                    label: type.label,
                    icon: type.icon,
                    checked: value === current,
                    onClick: () => {
                        state.cardViews.album = value === 'cards';
                        setSetting('cardsAlbum', state.cardViews.album);
                        syncCards();
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

        function markCurrent(assetId) {
            let current = null;
            for (const item of sidebar.querySelectorAll('.iv-item')) {
                const isCurrent = item.dataset.id === assetId;
                item.classList.toggle('is-current', isCurrent);
                if (isCurrent) current = item;
            }
            current?.scrollIntoView({ block: 'nearest' });
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
            const list = Boolean(state.cardViews.album);
            sidebar.classList.toggle('is-list', list);
            const viewType = CARD_VIEW_TYPES[list ? 'cards' : 'grid'];
            const viewChip = sidebar.querySelector('[data-pick="view"]');
            viewChip.querySelector('.iv-chip-icon').innerHTML = icon(viewType.icon);
            viewChip.title = `Visualização: ${viewType.label}`;
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
            markCurrent(assetId);
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
            // list beside the card view, thumbnails beside Immich's grid.
            const list = Boolean(state.cardViews.album);
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
        };
        const cardOrderKey = (type, part) => `cards${part}${type === 'album' ? 'Album' : 'Home'}`;
        const CARD_PAGE = 500;
        const CARD_CHUNK = 60;
        const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });

        function cardContext() {
            const album = ALBUM_PAGE_RE.exec(location.pathname);
            if (album) return { view: 'album', key: `album:${album[1]}`, albumId: album[1], assetId: album[2] ?? null };
            const home = HOME_PAGE_RE.exec(location.pathname);
            if (home) return { view: 'home', key: 'home', albumId: null, assetId: home[1] ?? null };
            return null;
        }

        function syncCards() {
            const context = cardContext();
            syncCardsToggle(context);
            const main = document.getElementById('asset-grid')?.closest('main');
            const enabled = Boolean(context && main && state.cardViews[context.view]);
            document.documentElement.classList.toggle('iv-cards-on', enabled);
            document.documentElement.classList.toggle('iv-cards-album', enabled && context.view === 'album');
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
                // Back from the viewer: bring the last asset seen into view.
                cards.root.querySelector(`.iv-card[data-id="${cards.lastAsset}"]`)?.scrollIntoView({ block: 'nearest' });
                cards.lastAsset = null;
            }
        }

        function syncCardsToggle(context) {
            const host = context && document.querySelector(context.view === 'album'
                ? '#control-bar nav > .ms-auto'
                : '#dashboard-navbar section.justify-end');
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
                    setSetting(view === 'album' ? 'cardsAlbum' : 'cardsHome', state.cardViews[view]);
                    syncCards();
                });
            }
            if (button.parentElement !== host) host.prepend(button);
            const on = state.cardViews[context.view];
            const label = on ? 'Voltar à grade do Immich' : 'Mostrar título, data e duração';
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
                            <span class="iv-cards-count"></span>
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
                hrefBase: context.albumId ? `/albums/${context.albumId}/photos/` : '/photos/',
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
                isAlbum: Boolean(context.albumId),
                type: context.view,
            };
            scroller.addEventListener('scroll', () => renderMoreCards(view), { passive: true });
            root.querySelector('.iv-cards-bar').addEventListener('click', event => {
                const control = event.target.closest('[data-pick], [data-action]');
                if (control) barAction(view, control);
            });
            syncCardsBar(view);
            root.querySelector('.iv-cards-scroll > .iv-cards-back')?.addEventListener('click', goBack);
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
            view.streaming = Boolean(SERVER_SORTS[sort]) &&
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
                    filter: view.albumId ? { albumIds: { any: [view.albumId] } } : { visibility: { eq: 'timeline' } },
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
                while (!view.complete) {
                    view.items.push(...await fetchCardPage(view));
                    if (generation !== view.generation) return;
                    view.status.textContent = `Carregando… ${view.items.length.toLocaleString()} itens`;
                }
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

            const thumb = document.createElement('div');
            thumb.className = 'iv-card-thumb';
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
                markCount(item.id).then(count => {
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
        const CARD_VIEW_TYPES = {
            cards: { label: 'Cards com título', short: 'Cards', icon: ICONS.cards },
            grid: { label: 'Grade do Immich', short: 'Grade', icon: ICONS.grid },
        };
        const ALBUM_ACTIONS = {
            add: { prefix: 'M13 19C13 19.7' },
            share: { prefix: 'M18 16.08' },
            map: { prefix: 'M20.5,3L20.34' },
            slideshow: { prefix: 'M2,3H10A2,2 0 0,1 12,1' },
            download: { prefix: 'M5,20H19V18H5M19,9H15V3H9' },
        };
        const DELETE_ICON = 'M9,3V4H4V6H5V19';
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
                    openPopup(control, choose(CARD_VIEW_TYPES, 'cards', value => {
                        if (value !== 'grid') return;
                        const type = cardContext()?.view;
                        state.cardViews[type] = false;
                        setSetting(type === 'album' ? 'cardsAlbum' : 'cardsHome', false);
                        syncCards();
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
            entries.push({
                label: view.editing ? 'Parar de editar títulos' : 'Editar títulos',
                icon: ICONS.pencil,
                onClick: () => setEditing(view, !view.editing),
            });
            const rest = [...others, ...items].map(source => sourceEntry(source));
            if (rest.length) entries.push('-');
            for (const entry of rest) (entry.danger ? danger : entries).push(entry);
            if (danger.length) entries.push('-', ...danger);
            return entries;
        }

        // ---------------------------------------------------------------------
        //  Popup menus (action bar).
        // ---------------------------------------------------------------------
        let popup = null;

        function openPopup(anchor, entries, { align = 'start' } = {}) {
            closePopup();
            popup = document.createElement('div');
            popup.className = 'iv-menu iv-popup';
            popup.setAttribute('role', 'menu');
            popup.anchor = anchor;
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
                const items = [...popup.querySelectorAll('.iv-menu-entry')];
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
            (popup.querySelector('[aria-checked="true"]') ?? popup.querySelector('.iv-menu-entry'))?.focus();
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
            const editable = target => (view.editing ? target.closest?.('.iv-card-title') : null);
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
                if (title) saveTitle(view, title);
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
            syncNavbar();
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

        function start() {
            new MutationObserver(scheduleRefresh).observe(document.body, { childList: true, subtree: true });
            scheduleRefresh();
        }

        if (document.body) start();
        else document.addEventListener('DOMContentLoaded', start, { once: true });
    }
})();
