// ==UserScript==
// @name         YouTube Enhancer
// @namespace    youtube-cinema
// @version      1.3.0
// @author       oguilhermelima
// @description  Full-screen theater by default with an auto-hiding masthead, live chat and up-next as switchable sidebars, black-bar crop, loop, audio boost, speed and quality controls in the player bar, a live-now section with a TV mode, a "Live now" filter on channel live tabs, an advanced playlist mode (search, sort, filters by watched and by who added, followed in playback), and advanced settings for playback quality, video filters, info cards and Shorts.
// @match        https://www.youtube.com/*
// @grant        GM_addStyle
// @grant        GM_getValue
// @grant        GM_setValue
// @run-at       document-start
// @noframes
// ==/UserScript==

(function() {
    'use strict';

    // Theater mode is YouTube's own: ytd-watch-flexy[theater] puts the player
    // in #full-bleed-container, capped near 100vh - 169px. This script makes
    // theater the default and stretches that container to the full viewport
    // below the masthead. In a live, YouTube pins the chat to the right
    // (ytd-watch-flexy[fixed-panels]) and reserves its width with
    // #panels-full-bleed-container; hiding the chat hides both. The up-next
    // list (#secondary) normally sits in the columns below the player; with
    // the sidebar on it is pinned to the right of the player instead.
    const FLEXY = 'ytd-watch-flexy[theater]:not([fullscreen])';
    const RELATED_WIDTH = 420;
    // Sidebar widths offered in the player settings; "Normal" leaves the
    // chat at YouTube's own width.
    const SIDE_WIDTHS = [
        { label: 'Normal', width: 0 },
        { label: 'Média', width: 360 },
        { label: 'Estreita', width: 300 },
    ];

    const BOOST_ICON = { viewBox: '4.77 4.77 26.46 26.46', transform: 'matrix(0,-1.6,1.6,0,-14.800104,37.2)' };

    const ICONS = {
        // Sidebar toggles: an outline while closed, filled while open.
        chat: 'M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm0 14H6l-2 2V4h16v12z',
        chatOpen: 'M20 2H4c-1.1 0-1.99.9-1.99 2L2 22l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zM6 9h12v2H6V9zm8 5H6v-2h8v2zm4-6H6V6h12v2z',
        previous: 'M6,18V6H8V18H6M9.5,12L18,6V18L9.5,12Z',
        next: 'M16,18H18V6H16M6,18L14.5,12L6,6V18Z',
        loop: 'M17,17H7V14L3,18L7,22V19H19V13H17M7,7H17V10L21,6L17,2V5H5V11H7V7Z',
        speed: 'M12,16A3,3 0 0,1 9,13C9,11.88 9.61,10.9 10.5,10.39L20.21,4.77L14.68,14.35C14.18,15.33 13.17,16 12,16M12,3C13.81,3 15.5,3.5 16.97,4.32L14.87,5.53C14,5.19 13,5 12,5A8,8 0 0,0 4,13C4,15.21 4.89,17.21 6.34,18.65H6.35C6.74,19.04 6.74,19.67 6.35,20.06C5.96,20.45 5.32,20.45 4.93,20.07V20.07C3.12,18.26 2,15.76 2,13A10,10 0 0,1 12,3M22,13C22,15.76 20.88,18.26 19.07,20.07V20.07C18.68,20.45 18.05,20.45 17.66,20.06C17.27,19.67 17.27,19.04 17.66,18.65V18.65C19.11,17.2 20,15.21 20,13C20,12 19.81,11 19.46,10.1L20.67,8C21.5,9.5 22,11.18 22,13Z',
        // Speaker with a bolt and sound waves, drawn on a 36px grid and
        // rotated; the viewBox is cropped to its 26x18 glyph so it fills the
        // 24px box edge to edge, as tall as the neighbouring icons.
        boost: 'm 13,21 h 4 l -6,-3 v 2 H 7 l 6,3 z M 8.0617044,16.561704 8.9050563,17.405056 C 9.7006719,16.609441 10.790665,16.124116 12,16.124116 c 1.209335,0 2.299328,0.493281 3.094944,1.28094 l 0.843352,-0.843352 C 14.927864,15.551273 13.535538,14.930693 12,14.930693 c -1.535537,0 -2.9278644,0.62058 -3.9382956,1.631011 z M 12,24.875884 c -1.209335,0 -2.2993281,-0.493282 -3.0949437,-1.280941 L 8.0617044,24.438295 C 9.0721356,25.448727 10.464463,26.069307 12,26.069307 c 1.535538,0 2.927864,-0.62058 3.938296,-1.631012 L 15.094944,23.594943 C 14.299328,24.382602 13.209335,24.875884 12,24.875884 Z m 0,-11.451211 c 1.86174,0 3.5564,0.755834 4.781647,1.981082 L 17.625,14.562403 C 16.184936,13.122339 14.195898,12.23125 12,12.23125 c -2.1958981,0 -4.1849363,0.891089 -5.625,2.331153 l 0.8433525,0.843352 C 8.4436,14.180507 10.13826,13.424673 12,13.424673 Z m 0,15.344207 c 2.195898,0 4.184936,-0.891089 5.625,-2.331153 L 16.781647,25.594375 C 15.5564,26.819622 13.86174,27.575457 12,27.575457 c -1.86174,0 -3.5564,-0.755835 -4.7816475,-1.981082 L 6.375,26.437727 C 7.8150637,27.877791 9.8041019,28.76888 12,28.76888 Z',
        quality: 'M8 13C6.14 13 4.59 14.28 4.14 16H2V18H4.14C4.59 19.72 6.14 21 8 21S11.41 19.72 11.86 18H22V16H11.86C11.41 14.28 9.86 13 8 13M8 19C6.9 19 6 18.1 6 17C6 15.9 6.9 15 8 15S10 15.9 10 17C10 18.1 9.1 19 8 19M19.86 6C19.41 4.28 17.86 3 16 3S12.59 4.28 12.14 6H2V8H12.14C12.59 9.72 14.14 11 16 11S19.41 9.72 19.86 8H22V6H19.86M16 9C14.9 9 14 8.1 14 7C14 5.9 14.9 5 16 5S18 5.9 18 7C18 8.1 17.1 9 16 9Z',
        cinema: 'M18,4L20,8H17L15,4H13L15,8H12L10,4H8L10,8H7L5,4H4A2,2 0 0,0 2,6V18A2,2 0 0,0 4,20H20A2,2 0 0,0 22,18V4H18Z',
        crop: 'M7,17V1H5V5H1V7H5V17A2,2 0 0,0 7,19H17V23H19V19H23V17M17,15H19V7C19,5.89 18.1,5 17,5H9V7H17V15Z',
        width: 'M9,11H15V8L19,12L15,16V13H9V16L5,12L9,8V11M2,20V4H4V20H2M20,20V4H22V20H20Z',
        related: 'M5,4H19A2,2 0 0,1 21,6V18A2,2 0 0,1 19,20H5A2,2 0 0,1 3,18V6A2,2 0 0,1 5,4M5,6V18H13V6H5M15,6V18H19V6H15Z',
        relatedOpen: 'M5,4H19A2,2 0 0,1 21,6V18A2,2 0 0,1 19,20H5A2,2 0 0,1 3,18V6A2,2 0 0,1 5,4M5,6V18H13V6H5Z',
    };

    function getSetting(key, fallback) {
        try {
            return GM_getValue(key, fallback);
        } catch {
            return fallback;
        }
    }

    function setSetting(key, value) {
        try {
            GM_setValue(key, value);
        } catch {}
    }

    // Custom properties are rewritten from the 1s refresh; writing one even
    // with the same value makes the browser restyle the whole page, so only
    // a change is written.
    function setVar(element, name, value) {
        if (element.style.getPropertyValue(name) !== value) element.style.setProperty(name, value);
    }

    function icon(path, { viewBox = '0 0 24 24', transform = '' } = {}) {
        const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        svg.setAttribute('viewBox', viewBox);
        svg.setAttribute('width', '24');
        svg.setAttribute('height', '24');
        svg.setAttribute('aria-hidden', 'true');
        const shape = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        shape.setAttribute('fill', 'currentColor');
        shape.setAttribute('d', path);
        if (transform) shape.setAttribute('transform', transform);
        svg.append(shape);
        return svg;
    }


    const state = {
        chatVisible: Boolean(getSetting('chatVisible', true)),
        relatedSidebar: Boolean(getSetting('relatedSidebar', false)),
        autoChat: Boolean(getSetting('autoChat', true)),
        // Global settings (menu under the avatar).
        autoTheater: Boolean(getSetting('autoTheater', true)),
        hideCards: Boolean(getSetting('hideCards', false)),
        filtersOn: Boolean(getSetting('filtersOn', false)),
        filterBrightness: Number(getSetting('filterBrightness', 100)),
        filterContrast: Number(getSetting('filterContrast', 100)),
        filterSaturation: Number(getSetting('filterSaturation', 100)),
        qualityAuto: Boolean(getSetting('qualityAuto', false)),
        qualityVideos: String(getSetting('qualityVideos', 'hd1440')),
        qualityPlaylists: String(getSetting('qualityPlaylists', 'hd1080')),
        qualityFsDifferent: Boolean(getSetting('qualityFsDifferent', false)),
        qualityFsVideos: String(getSetting('qualityFsVideos', 'hd1440')),
        qualityFsPlaylists: String(getSetting('qualityFsPlaylists', 'hd1440')),
        qualityFsRestore: Boolean(getSetting('qualityFsRestore', false)),
        shortsChannel: Boolean(getSetting('shortsChannel', false)),
        shortsHome: Boolean(getSetting('shortsHome', true)),
        shortsSearch: Boolean(getSetting('shortsSearch', false)),
        shortsSidebar: Boolean(getSetting('shortsSidebar', true)),
        shortsWatch: Boolean(getSetting('shortsWatch', true)),
        shortsSubs: Boolean(getSetting('shortsSubs', true)),
        liveSection: Boolean(getSetting('liveSection', true)),
        liveTv: Boolean(getSetting('liveTv', true)),
        tvChat: Boolean(getSetting('tvChat', true)),
        tvGroups: getSetting('tvGroups', {}) || {},
        liveNowFilter: Boolean(getSetting('liveNowFilter', true)),
        cropBars: Boolean(getSetting('cropBars', true)),
        sideWidth: Number(getSetting('sideWidth', 0)) || 0,
        // Docked sidebar with a playlist: which of the two views is shown.
        sideView: getSetting('sideView', 'playlist') === 'related' ? 'related' : 'playlist',
        rate: Number(getSetting('rate', 1)) || 1,
        // Audio boost works like a switch at a chosen level; the options
        // live in the player settings menu.
        boostLevel: Number(getSetting('boostLevel', 2)) || 2,
        autoBoost: Boolean(getSetting('autoBoost', false)),
        // Left as last switched, across reloads.
        boostOn: Boolean(getSetting('boostOn', getSetting('autoBoost', false))),
        defaultVolumeOn: Boolean(getSetting('defaultVolumeOn', false)),
        defaultVolume: Number(getSetting('defaultVolume', 50)),
        wheelVolume: Boolean(getSetting('wheelVolume', false)),
        wheelRightOnly: Boolean(getSetting('wheelRightOnly', false)),
        wheelStep: Number(getSetting('wheelStep', 5)) || 5,
        // Loop lasts for the tab, not across visits: a remembered loop would
        // silently stop every playlist.
        loop: false,
    };

    // ---------------------------------------------------------------------
    //  Theater as the default: YouTube reads the "wide" cookie when it
    //  renders a watch page, which covers the next full load. For the
    //  current one, and for each in-app navigation, YouTube's theater button
    //  is
    //  pressed until theater is on once for that video; turning it off
    //  afterwards sticks until the next video. A press before the player
    //  is ready is ignored, hence the bounded retries.
    // ---------------------------------------------------------------------
    if (state.autoTheater) document.cookie = 'wide=1; domain=.youtube.com; path=/; max-age=31536000; SameSite=Lax';
    const theater = { videoId: '', done: false, attempts: 0, pressedAt: 0 };
    // An accepted press shows up in well under 100 ms; an ignored one never
    // does (seen while the player is still settling), so retrying is safe.
    const THEATER_RETRY_MS = 1500;

    // The moment theater turns on for the current video, stop pressing: a
    // second press while YouTube is still applying the first would undo it.
    new MutationObserver(records => {
        for (const record of records) {
            if (record.target.getAttribute('video-id') === theater.videoId && record.target.hasAttribute('theater')) theater.done = true;
        }
    }).observe(document, { attributes: true, subtree: true, attributeFilter: ['theater'] });

    function enforceTheater() {
        if (!state.autoTheater) return;
        const flexy = watchFlexy();
        const videoId = flexy?.getAttribute('video-id');
        if (!videoId) return;
        if (videoId !== theater.videoId) Object.assign(theater, { videoId, done: false, attempts: 0, pressedAt: 0 });
        if (theater.done) return;
        if (flexy.hasAttribute('theater')) {
            theater.done = true;
            return;
        }
        if (theater.attempts >= 8 || Date.now() - theater.pressedAt < THEATER_RETRY_MS || flexy.hasAttribute('fullscreen')) return;
        const button = document.querySelector('#movie_player .ytp-size-button');
        if (!button) return;
        theater.attempts++;
        theater.pressedAt = Date.now();
        button.click();
    }

    // ---------------------------------------------------------------------
    //  Styles
    // ---------------------------------------------------------------------
    GM_addStyle(`
        :root {
            --ytc-related-w: ${RELATED_WIDTH}px;
            --ytc-chat-w: 0px;
            --ytc-masthead-h: 56px;
            --ytc-page-bg: #0f0f0f;
        }

        /* Masthead auto-hide on watch pages: it slides away and the page
           moves up into its space; it comes back while the pointer is at
           the top edge or on it, or while it holds focus (search). */
        html.ytc-masthead-autohide #masthead-container {
            transform: translateY(-100%);
            transition: transform 0.2s ease;
        }
        html.ytc-masthead-autohide.ytc-masthead-reveal #masthead-container,
        html.ytc-masthead-autohide #masthead-container:focus-within {
            transform: none;
        }
        html.ytc-masthead-autohide ytd-page-manager {
            margin-top: 0 !important;
        }
        /* Over the video (theater) YouTube draws it see-through; slid in
           over the player and the sidebar it needs its own background. */
        html.ytc-masthead-autohide #masthead-container,
        html.ytc-masthead-autohide ytd-masthead {
            background: var(--ytc-c-bg) !important;
        }
        html.ytc-masthead-autohide ytd-masthead #background {
            opacity: 1 !important;
        }
        html.ytc-masthead-autohide ytd-watch-flexy[fixed-panels] #chat {
            top: 0 !important;
            height: 100vh !important;
            max-height: none !important;
        }

        /* Player fills the viewport below the masthead. */
        ${FLEXY} #full-bleed-container {
            height: calc(100vh - var(--ytc-masthead-h)) !important;
            max-height: none !important;
            min-height: 0 !important;
        }

        /* Chat hidden: drop the pinned chat and its reserved column. */
        html.ytc-chat-hidden ${FLEXY} #chat-container,
        html.ytc-chat-hidden ${FLEXY} #panels-full-bleed-container {
            display: none !important;
        }
        /* YouTube's "squeezeback" layout pads the columns by the chat width. */
        html.ytc-chat-hidden ${FLEXY} #columns {
            padding-right: 0 !important;
        }

        /* Up-next sidebar: pinned beside the player (and beside the chat
           when it is shown); the player and the columns below make room. */
        html.ytc-related-sidebar ${FLEXY} #full-bleed-container {
            padding-right: var(--ytc-related-w) !important;
            box-sizing: border-box !important;
        }
        html.ytc-related-sidebar ${FLEXY} #columns {
            max-width: none !important;
            margin-right: 0 !important;
            padding-right: calc(var(--ytc-related-w) + var(--ytc-chat-w)) !important;
            box-sizing: border-box !important;
        }
        html.ytc-related-sidebar ${FLEXY} #secondary {
            position: fixed !important;
            top: var(--ytc-masthead-h) !important;
            right: var(--ytc-chat-w) !important;
            bottom: 0 !important;
            z-index: 1000;
            width: var(--ytc-related-w) !important;
            min-width: 0 !important;
            max-width: none !important;
            margin: 0 !important;
            padding: 12px 12px 0 !important;
            overflow-y: auto;
            overscroll-behavior: contain;
            box-sizing: border-box !important;
            background: var(--ytc-page-bg);
            border-left: 1px solid var(--ytc-c-line, rgba(255, 255, 255, 0.1));
        }
        html.ytc-related-sidebar ${FLEXY} #secondary-inner {
            width: 100% !important;
            padding: 0 !important;
        }
        html.ytc-related-sidebar ${FLEXY} #secondary #chat-container {
            display: none !important;
        }
        /* YouTube sizes these thumbnails inline for a wider column; in the
           sidebar that squeezes the titles. */
        html.ytc-related-sidebar ${FLEXY} #secondary .ytLockupViewModelContentImage {
            width: 45% !important;
        }

        /* Narrower chat, chosen in the player settings: the frame and the
           column YouTube reserves for it beside the player shrink together. */
        html.ytc-chat-sized ${FLEXY} ytd-live-chat-frame#chat,
        html.ytc-chat-sized ${FLEXY} #panels-full-bleed-container {
            width: var(--ytc-chat-size) !important;
            min-width: 0 !important;
            max-width: none !important;
            flex: none !important;
        }

        /* YouTube pads the columns below the player by its own chat width;
           with a narrower chat that left a gap beside it. */
        html.ytc-chat-sized:not(.ytc-chat-hidden):not(.ytc-related-sidebar) ${FLEXY} #columns {
            padding-right: var(--ytc-chat-size) !important;
        }

        /* A playlist panel almost as tall as the player instead of YouTube's
           460px, leaving a strip of the list below it in view: scrolling
           over that strip scrolls the sidebar, not the playlist. */
        ${FLEXY} ytd-playlist-panel-renderer#playlist:not([collapsed]) {
            height: calc(100vh - var(--ytc-masthead-h) - 120px) !important;
            max-height: calc(100vh - var(--ytc-masthead-h) - 120px) !important;
        }

        /* Colour tokens for our panels. YouTube now themes through its
           --yt-sys-color-baseline--* variables (light and dark); the older
           --yt-spec-* ones and the dark values are only fallbacks. */
        html {
            --ytc-c-text: var(--yt-sys-color-baseline--text-primary, var(--yt-spec-text-primary, #f1f1f1));
            --ytc-c-text2: var(--yt-sys-color-baseline--text-secondary, var(--yt-spec-text-secondary, #aaa));
            --ytc-c-bg: var(--yt-sys-color-baseline--base-background, var(--yt-spec-base-background, #0f0f0f));
            --ytc-c-raised: var(--yt-sys-color-baseline--raised-background, var(--yt-spec-raised-background, #212121));
            --ytc-c-menu: var(--yt-sys-color-baseline--menu-background, var(--yt-spec-menu-background, #282828));
            --ytc-c-field: var(--yt-sys-color-baseline--additive-background, var(--yt-spec-badge-chip-background, rgba(255, 255, 255, 0.1)));
            --ytc-c-hover: var(--yt-sys-color-baseline--mono-tonal-hover, var(--yt-spec-10-percent-layer, rgba(255, 255, 255, 0.2)));
            --ytc-c-line: var(--yt-sys-color-baseline--outline, var(--yt-spec-10-percent-layer, rgba(255, 255, 255, 0.2)));
            --ytc-c-accent: var(--yt-sys-color-baseline--call-to-action, var(--yt-spec-call-to-action, #3ea6ff));
        }

        /* Advanced playlist: our list replaces YouTube's items in the
           panel, with search, sort and filters stuck to the top of its own
           scroller. Colours come from YouTube's theme variables, so the
           light and dark themes both follow; the fallbacks are the dark
           ones. */
        .ytc-pl-toggle {
            display: inline-flex;
            align-items: center;
            gap: 6px;
            flex: none;
            height: 32px;
            margin: 4px 0 4px auto;
            padding: 0 12px 0 10px;
            border: 0;
            border-radius: 16px;
            background: var(--ytc-c-field);
            color: var(--ytc-c-text);
            font: 500 13px/1 Roboto, Arial, sans-serif;
            cursor: pointer;
            transition: background-color 0.15s, color 0.15s;
        }
        .ytc-pl-toggle svg { width: 18px; height: 18px; }
        .ytc-pl-toggle:hover { background: var(--ytc-c-hover); }
        .ytc-pl-toggle.is-on { background: var(--ytc-c-text); color: var(--ytc-c-bg); }
        ytd-playlist-panel-renderer.ytc-pl-on #items { display: none !important; }
        .ytc-pl {
            --ytc-pl-bg: var(--ytc-c-raised);
            /* The panel is a fixed-height column: the list takes what the
               header leaves and scrolls inside it. */
            flex: 1 1 auto;
            min-height: 0;
            overflow-y: auto;
            overscroll-behavior: contain;
            font-family: Roboto, Arial, sans-serif;
            color: var(--ytc-c-text);
            scrollbar-width: thin;
        }
        .ytc-pl :focus-visible { outline: 2px solid var(--ytc-c-accent); outline-offset: 1px; }
        .ytc-pl-bar {
            position: sticky;
            top: 0;
            z-index: 2;
            display: flex;
            flex-direction: column;
            gap: 8px;
            padding: 10px 12px 8px;
            background: var(--ytc-pl-bg);
            border-bottom: 1px solid var(--ytc-c-line);
        }
        .ytc-pl-line { display: flex; align-items: center; gap: 8px; }
        /* Search: a field with its magnifier inside, like YouTube's own. */
        .ytc-pl-searchbox { position: relative; flex: 1; min-width: 0; display: flex; }
        .ytc-pl-searchbox > svg,
        .ytc-pl-sortbox > svg {
            position: absolute;
            top: 50%;
            width: 18px;
            height: 18px;
            transform: translateY(-50%);
            color: var(--ytc-c-text2);
            pointer-events: none;
        }
        .ytc-pl-searchbox > svg { left: 11px; }
        .ytc-pl-search,
        .ytc-pl-sort {
            box-sizing: border-box;
            width: 100%;
            height: 36px;
            border: 1px solid transparent;
            border-radius: 18px;
            background: var(--ytc-c-field);
            color: inherit;
            font: 400 14px Roboto, Arial, sans-serif;
            transition: border-color 0.15s, background-color 0.15s;
        }
        .ytc-pl-search { padding: 0 12px 0 38px; }
        .ytc-pl-search::placeholder { color: var(--ytc-c-text2); }
        .ytc-pl-search:focus { outline: none; border-color: var(--ytc-c-accent); background: transparent; }
        .ytc-pl-search::-webkit-search-cancel-button { cursor: pointer; }
        /* Sort: still the native select (keyboard and screen readers
           work as usual), drawn as a pill with an icon and a chevron. */
        .ytc-pl-sortbox { position: relative; flex: 1; min-width: 0; display: flex; }
        .ytc-pl-sortbox > svg:first-child { left: 11px; }
        .ytc-pl-sortbox > svg:last-child { right: 8px; width: 20px; height: 20px; }
        .ytc-pl-sort {
            height: 32px;
            border-radius: 16px;
            padding: 0 30px 0 36px;
            font-size: 13px;
            font-weight: 500;
            cursor: pointer;
            appearance: none;
            -webkit-appearance: none;
        }
        .ytc-pl-sort:hover,
        .ytc-pl-chip:hover { background: var(--ytc-c-hover); }
        .ytc-pl-sort:focus-visible { outline: none; border-color: var(--ytc-c-accent); }
        .ytc-pl-sort option { background: var(--ytc-c-menu); color: var(--ytc-c-text); }
        .ytc-pl-chip {
            display: inline-flex;
            align-items: center;
            flex: none;
            gap: 6px;
            height: 32px;
            padding: 0 12px;
            border: 0;
            border-radius: 16px;
            background: var(--ytc-c-field);
            color: inherit;
            font: 500 13px/1 Roboto, Arial, sans-serif;
            white-space: nowrap;
            cursor: pointer;
            transition: background-color 0.15s, color 0.15s;
        }
        .ytc-pl-chip svg { width: 18px; height: 18px; flex: none; }
        .ytc-pl-chip.ytc-pl-seen { padding-left: 10px; }
        .ytc-pl-chip.is-on,
        .ytc-pl-chip.is-on:hover { background: var(--ytc-c-text); color: var(--ytc-c-bg); }
        /* Contributors: a row of faces that scrolls sideways when long. */
        .ytc-pl-people {
            gap: 6px;
            margin: 0 -12px;
            padding: 0 12px;
            overflow-x: auto;
            scrollbar-width: none;
        }
        .ytc-pl-people[hidden] { display: none; }
        .ytc-pl-people::-webkit-scrollbar { display: none; }
        .ytc-pl-people .ytc-pl-chip { height: 28px; font-size: 12px; }
        .ytc-pl-chip img { width: 22px; height: 22px; border-radius: 50%; }
        .ytc-pl-chip.is-avatar { gap: 5px; padding: 0 10px 0 3px; font-variant-numeric: tabular-nums; }
        .ytc-pl-status {
            display: flex;
            align-items: center;
            gap: 4px;
            min-height: 18px;
            font-size: 12px;
            line-height: 18px;
            color: var(--ytc-c-text2);
        }
        .ytc-pl-status button {
            display: inline-flex;
            align-items: center;
            gap: 3px;
            margin-left: auto;
            padding: 0 6px;
            height: 22px;
            border: 0;
            border-radius: 11px;
            background: none;
            color: inherit;
            font: inherit;
            cursor: pointer;
        }
        .ytc-pl-status button svg { width: 14px; height: 14px; }
        .ytc-pl-status button:hover { background: var(--ytc-c-hover); color: var(--ytc-c-text); }
        .ytc-pl-items { padding: 4px 0 12px; }
        /* Rows off screen skip layout and paint: a list can hold thousands. */
        .ytc-pl-row {
            content-visibility: auto;
            contain-intrinsic-size: auto 75px;
            display: flex;
            align-items: center;
            gap: 8px;
            margin: 0 8px;
            padding: 6px 8px 6px 0;
            border-radius: 10px;
            color: inherit;
            text-decoration: none;
            cursor: pointer;
        }
        .ytc-pl-row:hover { background: var(--ytc-c-field); }
        .ytc-pl-row.is-current { background: var(--ytc-c-hover); }
        .ytc-pl-row.is-unplayable { opacity: 0.5; }
        .ytc-pl-index {
            display: grid;
            place-items: center;
            width: 28px;
            flex: none;
            font-size: 12px;
            color: var(--ytc-c-text2);
            font-variant-numeric: tabular-nums;
        }
        .ytc-pl-row.is-current .ytc-pl-index { color: var(--ytc-c-text); font-weight: 700; }
        .ytc-pl-thumb {
            position: relative;
            width: 112px;
            height: 63px;
            flex: none;
            overflow: hidden;
            border-radius: 8px;
            background: var(--ytc-c-hover);
        }
        .ytc-pl-thumb img { display: block; width: 100%; height: 100%; object-fit: cover; }
        .ytc-pl-time {
            position: absolute;
            right: 4px;
            bottom: 4px;
            padding: 1px 4px;
            border-radius: 4px;
            background: rgba(0, 0, 0, 0.8);
            color: #fff;
            font-size: 11px;
            font-weight: 500;
            line-height: 14px;
        }
        .ytc-pl-progress { position: absolute; left: 0; right: 0; bottom: 0; height: 3px; background: rgba(255, 255, 255, 0.4); }
        .ytc-pl-progress > i { display: block; height: 100%; background: #f00; }
        .ytc-pl-text { flex: 1; min-width: 0; }
        .ytc-pl-title {
            display: -webkit-box;
            overflow: hidden;
            -webkit-line-clamp: 2;
            -webkit-box-orient: vertical;
            font-size: 14px;
            font-weight: 500;
            line-height: 20px;
        }
        .ytc-pl-meta {
            display: flex;
            align-items: center;
            gap: 4px;
            margin-top: 2px;
            overflow: hidden;
            font-size: 12px;
            line-height: 18px;
            color: var(--ytc-c-text2);
            white-space: nowrap;
        }
        .ytc-pl-meta span { overflow: hidden; text-overflow: ellipsis; }
        .ytc-pl-meta img { width: 16px; height: 16px; flex: none; border-radius: 50%; }
        .ytc-pl-empty { padding: 32px 16px; font-size: 13px; color: var(--ytc-c-text2); text-align: center; }

        /* Docked sidebar with a playlist: one view at a time, the playlist
           or the up-next list, picked from a switch pinned to the top. The
           sidebar is then a flat column flush with the right edge, from the
           masthead to the bottom of the screen, not a card inside it. */
        .ytc-side-switch { display: none; }
        html.ytc-side-tabs ${FLEXY} #secondary {
            padding: 0 !important;
        }
        html.ytc-side-tabs ${FLEXY} #secondary > .ytc-side-switch {
            position: sticky;
            top: 0;
            z-index: 3;
            display: flex;
            gap: 4px;
            flex: none;
            margin: 0;
            padding: 8px 12px;
            background: var(--ytc-page-bg, var(--ytc-c-bg));
            border-bottom: 1px solid var(--ytc-c-line);
            font-family: Roboto, Arial, sans-serif;
        }
        .ytc-side-switch button {
            display: inline-flex;
            align-items: center;
            justify-content: center;
            flex: 1;
            gap: 8px;
            min-width: 0;
            height: 36px;
            padding: 0 12px;
            border: 0;
            border-radius: 18px;
            background: transparent;
            color: var(--ytc-c-text2);
            font: 500 14px/1 Roboto, Arial, sans-serif;
            cursor: pointer;
            transition: background-color 0.15s, color 0.15s;
        }
        .ytc-side-switch button svg { width: 20px; height: 20px; flex: none; }
        .ytc-side-switch button:hover { background: var(--ytc-c-field); color: var(--ytc-c-text); }
        .ytc-side-switch button[aria-selected="true"] {
            background: var(--ytc-c-hover);
            color: var(--ytc-c-text);
        }
        .ytc-side-switch button:focus-visible { outline: 2px solid var(--ytc-c-accent); outline-offset: -2px; }
        .ytc-side-count {
            padding: 2px 7px;
            border-radius: 9px;
            background: var(--ytc-c-hover);
            font-size: 11px;
            font-weight: 500;
            line-height: 14px;
            font-variant-numeric: tabular-nums;
            white-space: nowrap;
        }
        .ytc-side-count:empty { display: none; }

        /* Up-next view: the list scrolls under the switch as before. */
        html.ytc-side-related ${FLEXY} #secondary #secondary-inner {
            padding: 12px 12px 0 !important;
            box-sizing: border-box !important;
        }
        html.ytc-side-related ${FLEXY} #secondary ytd-playlist-panel-renderer#playlist {
            display: none !important;
        }

        /* Playlist view: the sidebar stops scrolling and the panel fills
           it; only its list (YouTube's or ours) scrolls. */
        html.ytc-side-playlist ${FLEXY} #secondary {
            display: flex !important;
            flex-direction: column;
            overflow: hidden !important;
        }
        html.ytc-side-playlist ${FLEXY} #secondary #secondary-inner {
            display: flex !important;
            flex-direction: column;
            flex: 1 1 auto;
            min-height: 0;
        }
        html.ytc-side-playlist ${FLEXY} #secondary #related,
        html.ytc-side-playlist ${FLEXY} #secondary #donation-shelf {
            display: none !important;
        }
        html.ytc-side-playlist ${FLEXY} #secondary ytd-playlist-panel-renderer#playlist {
            flex: 1 1 auto;
            height: auto !important;
            min-height: 0 !important;
            max-height: none !important;
            margin: 0 !important;
        }
        html.ytc-side-tabs ${FLEXY} #secondary ytd-playlist-panel-renderer#playlist > #container {
            height: 100%;
            max-height: none;
            border: 0 !important;
            border-radius: 0 !important;
            background: var(--ytc-page-bg, var(--ytc-c-bg));
        }
        html.ytc-side-tabs ${FLEXY} #secondary ytd-playlist-panel-renderer#playlist .ytc-pl {
            --ytc-pl-bg: var(--ytc-page-bg, var(--ytc-c-bg));
        }
        /* Header: the title, owner and position on a quiet background,
           divided from the list; the close button would only collapse a
           panel the switch already hides. */
        html.ytc-side-tabs ${FLEXY} #secondary ytd-playlist-panel-renderer#playlist .header {
            padding: 14px 12px 6px 16px !important;
            background: transparent !important;
            border-bottom: 1px solid var(--ytc-c-line);
        }
        html.ytc-side-tabs ${FLEXY} #secondary ytd-playlist-panel-renderer#playlist #trailing-button {
            display: none !important;
        }
        /* The panel no longer collapses, so its header is no button. The
           menu is lifted beside the title; the row of actions below it
           folds away when nothing else is left in it (a mix). */
        html.ytc-side-tabs ${FLEXY} #secondary ytd-playlist-panel-renderer#playlist .header {
            position: relative;
            cursor: default !important;
        }
        html.ytc-side-tabs ${FLEXY} #secondary ytd-playlist-panel-renderer#playlist #header-top-row {
            display: flex !important;
            align-items: flex-start;
            gap: 4px;
        }
        html.ytc-side-tabs ${FLEXY} #secondary ytd-playlist-panel-renderer#playlist #header-description {
            flex: 1 1 auto;
            min-width: 0;
            padding-right: 36px;
        }
        html.ytc-side-tabs ${FLEXY} #secondary ytd-playlist-panel-renderer#playlist #playlist-actions,
        html.ytc-side-tabs ${FLEXY} #secondary ytd-playlist-panel-renderer#playlist #end-actions {
            position: static !important;
        }
        html.ytc-side-tabs ${FLEXY} #secondary ytd-playlist-panel-renderer#playlist #end-actions #overflow-menu {
            position: absolute;
            top: 10px;
            right: 6px;
        }
        html.ytc-side-tabs ${FLEXY} #secondary ytd-playlist-panel-renderer#playlist #playlist-actions:not(:has(.ytc-pl-toggle)):not(:has(#start-actions button)) {
            height: 0 !important;
            min-height: 0 !important;
            margin: 0 !important;
            padding: 0 !important;
        }
        html.ytc-side-tabs ${FLEXY} #secondary ytd-playlist-panel-renderer#playlist #header-description h3 {
            margin-bottom: 4px;
        }
        html.ytc-side-tabs ${FLEXY} #secondary ytd-playlist-panel-renderer#playlist #header-description h3 yt-attributed-string,
        html.ytc-side-tabs ${FLEXY} #secondary ytd-playlist-panel-renderer#playlist #header-description h3 a {
            font-size: 18px !important;
            font-weight: 700 !important;
            line-height: 26px !important;
        }
        html.ytc-side-tabs ${FLEXY} #secondary ytd-playlist-panel-renderer#playlist #publisher-container {
            display: flex;
            align-items: center;
            gap: 6px;
            min-width: 0;
            color: var(--ytc-c-text2);
        }
        html.ytc-side-tabs ${FLEXY} #secondary ytd-playlist-panel-renderer#playlist .publisher {
            min-width: 0;
        }
        /* The position ("12 / 305") is on the switch, in both views. */
        html.ytc-side-tabs ${FLEXY} #secondary ytd-playlist-panel-renderer#playlist .index-message-wrapper {
            display: none !important;
        }
        html.ytc-side-tabs ${FLEXY} #secondary ytd-playlist-panel-renderer#playlist #playlist-actions {
            align-items: center;
            margin-top: 6px;
        }
        /* YouTube's own items, when the advanced list is off: rounded rows
           with room around them, the current one lit, the menu shown on
           hover only. */
        html.ytc-side-tabs ${FLEXY} #secondary ytd-playlist-panel-renderer#playlist #items {
            flex: 1 1 auto;
            min-height: 0;
            max-height: none !important;
            overflow-y: auto !important;
            overscroll-behavior: contain;
            padding: 4px 0 12px !important;
            scrollbar-width: thin;
        }
        html.ytc-side-tabs ${FLEXY} #secondary ytd-playlist-panel-video-renderer {
            margin: 0 8px;
            padding: 6px 0 6px 0 !important;
            border-radius: 10px;
            background: transparent !important;
        }
        html.ytc-side-tabs ${FLEXY} #secondary ytd-playlist-panel-video-renderer:hover {
            background: var(--ytc-c-field) !important;
        }
        html.ytc-side-tabs ${FLEXY} #secondary ytd-playlist-panel-video-renderer[selected] {
            background: var(--ytc-c-hover) !important;
        }
        html.ytc-side-tabs ${FLEXY} #secondary ytd-playlist-panel-video-renderer #container {
            align-items: center;
        }
        html.ytc-side-tabs ${FLEXY} #secondary ytd-playlist-panel-video-renderer #index-container {
            width: 28px;
            align-self: center;
            justify-content: center;
        }
        html.ytc-side-tabs ${FLEXY} #secondary ytd-playlist-panel-video-renderer #thumbnail-container,
        html.ytc-side-tabs ${FLEXY} #secondary ytd-playlist-panel-video-renderer ytd-thumbnail {
            width: 112px !important;
            height: 63px !important;
            flex: none;
        }
        html.ytc-side-tabs ${FLEXY} #secondary ytd-playlist-panel-video-renderer ytd-thumbnail a#thumbnail {
            border-radius: 8px;
        }
        html.ytc-side-tabs ${FLEXY} #secondary ytd-playlist-panel-video-renderer #video-title {
            font-size: 14px !important;
            line-height: 20px !important;
            font-weight: 500 !important;
        }
        html.ytc-side-tabs ${FLEXY} #secondary ytd-playlist-panel-video-renderer #byline {
            font-size: 12px !important;
            color: var(--ytc-c-text2) !important;
        }
        html.ytc-side-tabs ${FLEXY} #secondary ytd-playlist-panel-video-renderer #menu {
            opacity: 0;
            transition: opacity 0.15s;
        }
        html.ytc-side-tabs ${FLEXY} #secondary ytd-playlist-panel-video-renderer:is(:hover, :focus-within) #menu,
        html.ytc-side-tabs ${FLEXY} #secondary ytd-playlist-panel-video-renderer #menu:has([aria-expanded="true"]) {
            opacity: 1;
        }

        /* Playlist previous/next of our own replace YouTube's, which only
           show up once the playlist data has loaded. */
        #movie_player.ytc-playlist .ytp-prev-button,
        #movie_player.ytc-playlist .ytp-next-button { display: none !important; }
        /* Our round control-bar buttons (previous, next, loop, audio boost).
           Same box as YouTube's: 48x40, the icon 24px. */
        .ytc-bar-circle {
            display: inline-flex !important;
            align-items: center;
            justify-content: center;
            width: 48px !important;
            height: 40px !important;
            padding: 0 !important;
            box-sizing: content-box !important;
            vertical-align: top;
            fill: #fff;
            color: #fff;
        }
        .ytc-bar-circle svg { width: 24px !important; height: 24px !important; flex: none; }
        /* On is an "ON" badge over the same glyph (like the speed and
           quality badges), never a colour change. */
        .ytc-bar-circle { position: relative; overflow: visible !important; }
        /* A real span, not ::after: YouTube already styles .ytp-button::after. */
        .ytc-on-badge { display: none; }
        .ytc-bar-circle.is-active > .ytc-on-badge {
            display: block;
            position: absolute;
            top: 3px;
            right: 1px;
            padding: 2px 3px;
            border-radius: 2px;
            background: #b3001f;
            color: #fff;
            font: 700 9px/1 Roboto, Arial, sans-serif;
            letter-spacing: 0.02em;
            pointer-events: none;
        }
        #movie_player:not(.ytc-playlist) .ytc-playlist-button { display: none !important; }
        /* The current player ("delhi") draws its controls as frosted pills;
           ours become circles like its play button, built from the same
           variables YouTube uses. */
        .ytp-delhi-modern .ytc-bar-circle {
            width: var(--yt-delhi-pill-height, 48px) !important;
            height: var(--yt-delhi-pill-height, 48px) !important;
            margin-top: var(--yt-delhi-pill-top-height, 12px);
            border-radius: 50%;
            background: var(--yt-sys-color-baseline--overlay-background-medium-light, rgba(0, 0, 0, 0.3)) !important;
            backdrop-filter: var(--yt-frosted-glass-backdrop-filter-override, blur(16px));
        }
        .ytp-delhi-modern .ytc-loop,
        .ytp-delhi-modern .ytc-prev { margin-right: 8px; }
        .ytp-delhi-modern .ytc-next { margin-left: 8px; }
        .ytp-delhi-modern .ytc-boost { margin-left: 8px; }

        /* Speed sits in YouTube's right-hand pill: an icon like its
           neighbours, and the value in a badge like the HD one when it is
           not 1x. */
        .ytc-speed {
            position: relative;
            display: inline-flex !important;
            align-items: center;
            justify-content: center;
            width: 48px !important;
            height: 40px !important;
            fill: #fff;
        }
        .ytc-speed svg { width: 24px; height: 24px; flex: none; }
        .ytc-speed-badge,
        .ytc-quality-badge {
            position: absolute;
            top: 4px;
            right: 4px;
            padding: 1px 3px;
            border-radius: 2px;
            background: #b3001f; /* a deeper red than the gear's badge was */
            color: #fff;
            font: 500 9px/1.1 Roboto, Arial, sans-serif;
            pointer-events: none;
        }
        .ytc-speed-badge:empty,
        .ytc-quality-badge:empty { display: none; }
        /* The quality button shows the resolution, so the gear drops its
           HD badge. */
        #movie_player .ytp-settings-button.ytp-hd-quality-badge::after { display: none !important; }

        /* Bold and clear of the icon's lines, like YouTube's HD badge. */
        .ytc-quality-badge {
            top: 3px;
            right: 1px;
            padding: 2px 3px;
            font-weight: 700;
            font-size: 9px;
            line-height: 1;
            letter-spacing: 0.02em;
        }

        /* Audio options panel, in the settings menu's place. */
        .ytc-dial.ytc-cinema-panel { width: 360px; padding: 8px 0; overflow-y: auto; overscroll-behavior: contain; }
        .ytc-panel-section {
            padding: 12px 16px 4px;
            color: #aaa;
            font: 500 12px/1 Roboto, Arial, sans-serif;
            letter-spacing: 0.02em;
            text-transform: uppercase;
        }
        .ytc-panel-section:not(:first-of-type) { margin-top: 4px; border-top: 1px solid rgba(255, 255, 255, 0.1); }
        .ytc-panel-back {
            display: flex;
            align-items: center;
            gap: 6px;
            width: 100%;
            padding: 6px 12px 10px;
            border: 0;
            border-bottom: 1px solid rgba(255, 255, 255, 0.15);
            margin-bottom: 4px;
            background: none;
            color: #fff;
            font: 500 14px/1 Roboto, Arial, sans-serif;
            cursor: pointer;
            fill: #fff;
        }
        .ytc-panel-back svg { width: 24px; height: 24px; }
        .ytc-option {
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 12px;
            min-height: 40px;
            padding: 4px 16px;
            box-sizing: border-box;
            color: #eee;
            font: 13px/1.3 Roboto, Arial, sans-serif;
            cursor: pointer;
        }
        .ytc-option.ytc-stacked { flex-direction: column; align-items: stretch; gap: 8px; padding: 8px 16px; }
        .ytc-option.ytc-sub { padding-left: 32px; }
        .ytc-option.is-disabled { opacity: 0.4; pointer-events: none; }
        .ytc-switch {
            appearance: none;
            position: relative;
            flex: none;
            width: 36px;
            height: 14px;
            margin: 0;
            border-radius: 7px;
            background: rgba(255, 255, 255, 0.3);
            cursor: pointer;
        }
        .ytc-switch::after {
            content: '';
            position: absolute;
            top: -3px;
            left: 0;
            width: 20px;
            height: 20px;
            border-radius: 50%;
            background: #bdbdbd;
            transition: left 0.1s ease;
        }
        .ytc-switch:checked { background: rgba(255, 255, 255, 0.6); }
        .ytc-switch:checked::after { left: 16px; background: #fff; }
        .ytc-choices { display: flex; gap: 6px; }
        .ytc-stacked .ytc-choices > button { flex: 1; }
        .ytc-choices > button {
            min-width: 36px;
            height: 28px;
            padding: 0 8px;
            border: 0;
            border-radius: 8px;
            background: rgba(255, 255, 255, 0.1);
            color: #fff;
            font: 500 12px/1 Roboto, Arial, sans-serif;
            cursor: pointer;
        }
        .ytc-choices > button:hover { background: rgba(255, 255, 255, 0.2); }
        .ytc-choices > button.is-active { background: #fff; color: #0f0f0f; }
        .ytc-volume-box { display: flex; align-items: center; gap: 10px; width: 100%; }
        .ytc-volume-range { flex: 1; accent-color: #f00; }
        .ytc-volume-range:disabled { opacity: 0.4; }
        .ytc-volume-value { min-width: 24px; text-align: right; font-variant-numeric: tabular-nums; }

        /* Panel of our own in the player, where the settings menu opens. */
        .ytc-dial {
            position: absolute;
            z-index: 1000; /* above ad cards and overlays */
            display: none;
            width: 260px;
            padding: 14px;
            border-radius: 12px;
            background: rgba(28, 28, 28, 0.9);
            backdrop-filter: blur(16px);
            color: #eee;
            font: 13px/1.3 Roboto, Arial, sans-serif;
            box-sizing: border-box;
        }
        .ytc-dial.is-open { display: block; }
        /* While a bar button opens one of its submenus, the main menu stays
           invisible and nothing animates, so the submenu shows up directly. */
        #movie_player.ytc-jumping .ytp-settings-menu { visibility: hidden !important; }
        /* A submenu opened from its bar button has no main menu to go back
           to: no back arrow, and the header does nothing. */
        #movie_player.ytc-direct .ytp-settings-menu .ytp-panel-back-button-container { display: none !important; }
        #movie_player.ytc-direct .ytp-settings-menu .ytp-panel-header { pointer-events: none; }
        #movie_player.ytc-direct .ytp-settings-menu .ytp-panel-title { padding-left: 16px !important; }
        #movie_player.ytc-jumping .ytp-settings-menu,
        #movie_player.ytc-jumping .ytp-settings-menu * { transition: none !important; animation: none !important; }

        /* Speed, captions and quality open from their bar buttons instead;
           their settings menu entries go. */
        #movie_player .ytp-settings-menu .ytc-moved { display: none !important; }

        .ytc-quality {
            position: relative;
            display: inline-flex !important;
            align-items: center;
            justify-content: center;
            width: 48px !important;
            height: 40px !important;
            fill: #fff;
        }
        .ytc-quality svg { width: 24px; height: 24px; flex: none; }

        /* Black-bar crop: the video keeps YouTube's box and is zoomed and
           shifted inside it so the picture, without baked-in bars, fits the
           player. Values come from cropBlackBars(). */
        #movie_player video.ytc-cropped {
            transform-origin: 0 0;
            transform: translate(var(--ytc-crop-x, 0px), var(--ytc-crop-y, 0px)) scale(var(--ytc-crop-k, 1));
        }

        /* Sidebar toggles, top-right corner of the player. They follow the
           player's own controls: hidden while it auto-hides them. */
        .ytc-top-controls {
            position: absolute;
            top: var(--ytc-top-y, 12px);
            right: 12px;
            z-index: 60;
            display: flex;
            align-items: center;
            height: var(--yt-delhi-pill-height, 48px);
            padding: 0 4px;
            border-radius: 28px;
            background: var(--yt-sys-color-baseline--overlay-background-medium-light, rgba(0, 0, 0, 0.3));
            backdrop-filter: var(--yt-frosted-glass-backdrop-filter-override, blur(16px));
            /* A hairline keeps the pill visible over black frames. */
            box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.1);
            transition: opacity 0.1s cubic-bezier(0.4, 0, 1, 1);
        }
        #movie_player.ytp-autohide .ytc-top-controls { opacity: 0; pointer-events: none; }
        /* No pill without buttons (outside theater both are hidden). */
        .ytc-top-controls:not(:has(> .ytc-button:not([hidden]))) { display: none; }
        /* YouTube's own top-right overlay (info button, cards teaser) moves
           left to make room, but only while our buttons show: when the
           controls auto-hide, a teaser keeps its usual place at the edge. */
        #movie_player .ytp-overlay-top-right { transition: margin-right 0.1s ease; }
        #movie_player:not(.ytp-autohide) .ytp-overlay-top-right { margin-right: var(--ytc-top-w, 0px); }
        /* Buttons sit in one frosted pill, like the player's own groups. */
        .ytc-button {
            display: grid;
            place-items: center;
            width: 40px;
            height: 40px;
            margin: 0 2px;
            padding: 0;
            border: 0;
            border-radius: 50%;
            background: transparent;
            color: #fff;
            cursor: pointer;
            transition: background-color 0.15s ease;
        }
        .ytc-button:hover { background: rgba(255, 255, 255, 0.12); }
        .ytc-button:focus-visible { outline: 2px solid rgba(255, 255, 255, 0.7); outline-offset: -2px; }
        .ytc-button svg { width: 24px; height: 24px; }
        .ytc-button .ytc-icon-on,
        .ytc-button.is-active .ytc-icon-off { display: none; }
        .ytc-button.is-active .ytc-icon-on { display: block; }
        .ytc-button[hidden] { display: none; }

        .ytc-hud {
            position: absolute;
            top: 50%;
            left: 50%;
            z-index: 70;
            padding: 10px 18px;
            border-radius: 999px;
            background: rgba(0, 0, 0, 0.65);
            color: #fff;
            font: 500 16px/1.2 Roboto, sans-serif;
            pointer-events: none;
            opacity: 0;
            transform: translate(-50%, -50%);
            transition: opacity 0.2s ease;
        }
        .ytc-hud.is-visible { opacity: 1; }
    `);

    // Shorts, wherever they show up as feed items or shelves. Each "hide
    // shorts" option scopes these to one kind of page (an html class set
    // from the URL); the left menu entry and the channel tab are apart.
    const SHORTS_ITEMS = [
        'ytd-rich-section-renderer:has(ytm-shorts-lockup-view-model, ytd-rich-shelf-renderer[is-shorts])',
        'ytd-rich-shelf-renderer[is-shorts]',
        'ytd-reel-shelf-renderer',
        'grid-shelf-view-model:has(ytm-shorts-lockup-view-model)',
        'ytd-rich-item-renderer:has(ytm-shorts-lockup-view-model, a[href^="/shorts/"])',
        'ytd-video-renderer:has(a[href^="/shorts/"])',
        'ytd-grid-video-renderer:has(a[href^="/shorts/"])',
        'yt-lockup-view-model:has(a[href^="/shorts/"])',
        'ytm-shorts-lockup-view-model-v2',
        'ytm-shorts-lockup-view-model',
    ];
    const SHORTS_PAGES = { shortsHome: 'home', shortsSearch: 'search', shortsChannel: 'channel', shortsWatch: 'watch', shortsSubs: 'subs' };
    const scopedShorts = Object.values(SHORTS_PAGES)
        .flatMap(page => SHORTS_ITEMS.map(item => `html.ytc-ns-${page}.ytc-page-${page} ${item}`))
        .join(',\n');

    GM_addStyle(`
        ${scopedShorts},
        html.ytc-ns-sidebar ytd-guide-entry-renderer:has(a[title="Shorts"]),
        html.ytc-ns-sidebar ytd-mini-guide-entry-renderer[aria-label="Shorts"],
        html.ytc-ns-channel yt-tab-shape[tab-title="Shorts"] {
            display: none !important;
        }

        /* Info cards and the creator's end-screen elements. */
        html.ytc-hide-cards #movie_player .ytp-ce-element,
        html.ytc-hide-cards #movie_player .ytp-cards-teaser,
        html.ytc-hide-cards #movie_player .ytp-cards-button,
        html.ytc-hide-cards #movie_player .iv-branding {
            display: none !important;
        }

        html.ytc-filters #movie_player video {
            filter: brightness(var(--ytc-f-brightness, 1)) contrast(var(--ytc-f-contrast, 1)) saturate(var(--ytc-f-saturation, 1));
        }

        /* Entry in the avatar / topbar menu, shaped like its links. */
        .ytc-menu-entry {
            display: flex;
            align-items: center;
            gap: 16px;
            min-height: 40px;
            padding: 0 36px 0 16px;
            color: #0f0f0f;
            font: 400 14px/20px Roboto, Arial, sans-serif;
            cursor: pointer;
            fill: currentColor;
        }
        .ytc-menu-entry:hover { background: rgba(0, 0, 0, 0.05); }
        html[dark] .ytc-menu-entry { color: #f1f1f1; }
        html[dark] .ytc-menu-entry:hover { background: rgba(255, 255, 255, 0.1); }
        .ytc-menu-entry svg { width: 24px; height: 24px; flex: none; }

        /* Advanced settings dialog, in YouTube's own colours (light or
           dark): a side nav of topics and a pane of grouped cards. */
        .ytc-modal-backdrop {
            position: fixed;
            inset: 0;
            z-index: 9999;
            display: grid;
            place-items: center;
            padding: 16px;
            background: rgba(0, 0, 0, 0.6);
            animation: ytc-fade 0.15s ease;
        }
        @keyframes ytc-fade { from { opacity: 0; } }
        /* YouTube marks its dark theme with html[dark]; light otherwise. */
        .ytc-modal {
            --ytc-m-bg: #fff;
            --ytc-m-card: #f2f2f2;
            --ytc-m-line: rgba(0, 0, 0, 0.1);
            --ytc-m-text: #0f0f0f;
            --ytc-m-muted: #606060;
            --ytc-m-accent: #ff0033; /* YouTube red */
            display: grid;
            grid-template-columns: 200px 1fr;
            grid-template-rows: auto 1fr;
            width: min(760px, 100%);
            height: min(600px, calc(100vh - 32px));
            overflow: hidden;
            border-radius: 16px;
            background: var(--ytc-m-bg);
            color: var(--ytc-m-text);
            font: 400 14px/20px Roboto, Arial, sans-serif;
            box-shadow: 0 24px 64px rgba(0, 0, 0, 0.5);
        }
        html[dark] .ytc-modal {
            --ytc-m-bg: #212121;
            --ytc-m-card: rgba(255, 255, 255, 0.06);
            --ytc-m-line: rgba(255, 255, 255, 0.1);
            --ytc-m-text: #f1f1f1;
            --ytc-m-muted: #aaa;
            --ytc-m-accent: #ff0033;
        }
        .ytc-modal-head {
            grid-column: 1 / -1;
            display: flex;
            align-items: center;
            gap: 12px;
            padding: 16px 16px 16px 24px;
            border-bottom: 1px solid var(--ytc-m-line);
        }
        .ytc-modal-head svg { width: 24px; height: 24px; fill: currentColor; flex: none; }
        .ytc-modal-titles { flex: 1; min-width: 0; }
        .ytc-modal-title { font-size: 18px; font-weight: 500; line-height: 24px; }
        .ytc-modal-subtitle { color: var(--ytc-m-muted); font-size: 12px; line-height: 16px; }
        .ytc-modal-close {
            display: grid;
            place-items: center;
            width: 40px;
            height: 40px;
            border: 0;
            border-radius: 50%;
            background: none;
            color: inherit;
            cursor: pointer;
        }
        .ytc-modal-close:hover { background: var(--ytc-m-line); }
        .ytc-modal-nav {
            display: flex;
            flex-direction: column;
            gap: 2px;
            padding: 12px;
            border-right: 1px solid var(--ytc-m-line);
            overflow-y: auto;
        }
        .ytc-modal-tab {
            display: flex;
            align-items: center;
            gap: 12px;
            height: 40px;
            padding: 0 12px;
            border: 0;
            border-radius: 10px;
            background: none;
            color: inherit;
            font: 500 14px/1 Roboto, Arial, sans-serif;
            text-align: left;
            cursor: pointer;
            fill: currentColor;
        }
        .ytc-modal-tab svg { width: 20px; height: 20px; flex: none; }
        .ytc-modal-tab:hover { background: var(--ytc-m-line); }
        .ytc-modal-tab[aria-selected="true"] { background: var(--ytc-m-card); }
        .ytc-modal-body { overflow-y: auto; padding: 20px 24px 24px; overscroll-behavior: contain; }
        .ytc-modal-pane[hidden] { display: none; }
        .ytc-modal-pane h2 { margin: 0; font-size: 20px; font-weight: 500; line-height: 28px; }
        .ytc-modal-pane > p { margin: 2px 0 16px; color: var(--ytc-m-muted); }
        .ytc-group + .ytc-group { margin-top: 20px; }
        .ytc-group-title {
            margin: 0 0 8px 4px;
            color: var(--ytc-m-muted);
            font-size: 12px;
            font-weight: 500;
            letter-spacing: 0.04em;
            text-transform: uppercase;
        }
        .ytc-card { overflow: hidden; border-radius: 12px; background: var(--ytc-m-card); }
        .ytc-row {
            display: flex;
            align-items: center;
            gap: 16px;
            min-height: 52px;
            padding: 8px 16px;
            box-sizing: border-box;
        }
        .ytc-row + .ytc-row { border-top: 1px solid var(--ytc-m-line); }
        .ytc-row.is-child { padding-left: 36px; }
        .ytc-row.is-disabled > * { opacity: 0.4; }
        label.ytc-row { cursor: pointer; }
        .ytc-row-text { flex: 1; min-width: 0; }
        .ytc-row-hint { color: var(--ytc-m-muted); font-size: 12px; line-height: 16px; }
        .ytc-row select {
            min-width: 128px;
            height: 32px;
            padding: 0 10px;
            border: 1px solid var(--ytc-m-line);
            border-radius: 8px;
            background: var(--ytc-m-bg);
            color: inherit;
            font: inherit;
            cursor: pointer;
        }
        .ytc-row select option { background: var(--ytc-m-bg); color: var(--ytc-m-text); }
        .ytc-row input[type="range"] { flex: 1.4; accent-color: var(--ytc-m-accent); }
        .ytc-row output { min-width: 44px; color: var(--ytc-m-muted); text-align: right; font-variant-numeric: tabular-nums; }
        /* Switch, like YouTube's own toggles. */
        .ytc-toggle {
            appearance: none;
            position: relative;
            flex: none;
            width: 36px;
            height: 20px;
            margin: 0;
            border-radius: 10px;
            background: var(--ytc-m-line);
            box-shadow: inset 0 0 0 1px var(--ytc-m-line);
            cursor: pointer;
            transition: background-color 0.15s ease;
        }
        .ytc-toggle::after {
            content: '';
            position: absolute;
            top: 2px;
            left: 2px;
            width: 16px;
            height: 16px;
            border-radius: 50%;
            background: var(--ytc-m-muted);
            transition: transform 0.15s ease, background-color 0.15s ease;
        }
        .ytc-toggle:checked { background: var(--ytc-m-accent); box-shadow: none; }
        .ytc-toggle:checked::after { background: #fff; transform: translateX(16px); }
        .ytc-toggle:focus-visible, .ytc-modal-tab:focus-visible, .ytc-modal-close:focus-visible { outline: 2px solid var(--ytc-m-accent); outline-offset: 2px; }
        .ytc-text-button {
            margin-left: auto;
            padding: 0 14px;
            height: 32px;
            border: 0;
            border-radius: 16px;
            background: var(--ytc-m-line);
            color: inherit;
            font: 500 13px/1 Roboto, Arial, sans-serif;
            cursor: pointer;
        }
        .ytc-text-button:hover { filter: brightness(1.2); }
        @media (max-width: 600px) {
            .ytc-modal { grid-template-columns: 1fr; grid-template-rows: auto auto 1fr; }
            .ytc-modal-nav { flex-direction: row; border-right: 0; border-bottom: 1px solid var(--ytc-m-line); overflow-x: auto; }
            .ytc-modal-tab { flex: none; }
            .ytc-modal-body { padding: 16px; }
        }
        /* First-run walkthrough, in the settings dialog's colours: a drawing
           of the real control on top, the text below, dots and buttons. */
        .ytc-modal.ytc-onboard {
            display: flex;
            flex-direction: column;
            width: min(480px, 100%);
            height: auto;
        }
        .ytc-ob-art {
            position: relative;
            display: grid;
            place-items: center;
            height: 220px;
            overflow: hidden;
            background:
                radial-gradient(120% 90% at 50% 0%, rgba(255, 0, 51, 0.22), transparent 60%),
                linear-gradient(180deg, #1a1a1a, #0f0f0f);
            color: #f1f1f1;
        }
        .ytc-ob-art svg { fill: currentColor; }
        .ytc-ob-enter { animation: ytc-ob-in 0.28s cubic-bezier(0.2, 0, 0, 1); }
        @keyframes ytc-ob-in { from { opacity: 0; transform: translateY(8px) scale(0.98); } }
        .ytc-ob-content { padding: 20px 24px 0; }
        .ytc-ob-counter { color: var(--ytc-m-accent); font-size: 12px; font-weight: 500; letter-spacing: 0.04em; text-transform: uppercase; }
        .ytc-ob-title { margin-top: 2px; font-size: 20px; font-weight: 500; line-height: 28px; }
        .ytc-ob-text { margin: 6px 0 0; color: var(--ytc-m-muted); line-height: 20px; min-height: 60px; }
        .ytc-ob-foot { display: flex; align-items: center; gap: 8px; padding: 20px 24px 24px; }
        .ytc-ob-dots { display: flex; gap: 6px; margin-right: auto; }
        .ytc-ob-dots i { width: 6px; height: 6px; border-radius: 3px; background: var(--ytc-m-line); transition: width 0.2s ease, background-color 0.2s ease; }
        .ytc-ob-dots i.is-on { width: 18px; background: var(--ytc-m-accent); }
        .ytc-ob-foot .ytc-text-button { margin-left: 0; height: 36px; padding: 0 16px; border-radius: 18px; font-size: 14px; }
        .ytc-text-button.ytc-primary { background: var(--ytc-m-text); color: var(--ytc-m-bg); }

        /* Step drawings. */
        .ytc-ob-hero { display: grid; justify-items: center; gap: 18px; }
        .ytc-ob-logo { display: flex; align-items: center; gap: 6px; font: 700 26px/1 Roboto, Arial, sans-serif; letter-spacing: -0.5px; }
        .ytc-ob-logo svg { width: 48px; height: 48px; color: #ff0033; }
        .ytc-ob-chips { display: flex; flex-wrap: wrap; justify-content: center; gap: 6px; max-width: 360px; }
        .ytc-ob-chip { padding: 4px 10px; border-radius: 999px; background: rgba(255, 255, 255, 0.1); font-size: 12px; line-height: 16px; }
        .ytc-ob-player { position: relative; width: 400px; height: 170px; border-radius: 12px; overflow: hidden; background: #000; box-shadow: 0 12px 32px rgba(0, 0, 0, 0.5); }
        .ytc-ob-screen { position: absolute; inset: 0; background: linear-gradient(135deg, #2b2b2b, #111 60%); }
        .ytc-ob-progress { position: absolute; left: 12px; right: 12px; bottom: 44px; height: 3px; border-radius: 2px; background: rgba(255, 255, 255, 0.25); }
        .ytc-ob-progress i { display: block; width: 34%; height: 100%; border-radius: 2px; background: #ff0033; }
        .ytc-ob-bar { position: absolute; left: 0; right: 0; bottom: 0; display: flex; align-items: center; gap: 10px; height: 40px; padding: 0 12px; background: linear-gradient(transparent, rgba(0, 0, 0, 0.7)); }
        .ytc-ob-bar svg { width: 20px; height: 20px; flex: none; }
        .ytc-ob-bar svg.is-dim { opacity: 0.55; }
        .ytc-ob-time { font-size: 11px; opacity: 0.55; }
        .ytc-ob-gap { flex: 1; }
        .ytc-ob-ours { display: flex; gap: 10px; padding: 4px 8px; border-radius: 10px; box-shadow: 0 0 0 2px #ff0033, 0 0 18px rgba(255, 0, 51, 0.45); }
        .ytc-ob-stage { display: grid; place-items: center; }
        .ytc-ob-menu { width: 260px; padding: 8px 0; border-radius: 12px; font-size: 13px; box-shadow: 0 12px 32px rgba(0, 0, 0, 0.5); }
        .ytc-ob-menu.is-player { background: rgba(28, 28, 28, 0.92); }
        .ytc-ob-menu.is-account { background: #282828; }
        .ytc-ob-row { display: flex; align-items: center; gap: 12px; height: 36px; margin: 0 6px; padding: 0 10px; border-radius: 8px; opacity: 0.5; }
        .ytc-ob-row svg { width: 20px; height: 20px; flex: none; }
        .ytc-ob-row > span:not(.ytc-ob-value) { flex: 1; }
        .ytc-ob-value { opacity: 0.7; }
        .ytc-ob-row.is-ours { opacity: 1; background: rgba(255, 0, 51, 0.16); box-shadow: inset 0 0 0 1.5px #ff0033; }
        .ytc-ob-who { display: flex; align-items: center; gap: 12px; padding: 4px 16px 10px; margin-bottom: 4px; border-bottom: 1px solid rgba(255, 255, 255, 0.1); font-weight: 500; }
        .ytc-ob-avatar { width: 32px; height: 32px; border-radius: 50%; background: linear-gradient(135deg, #3ea6ff, #a970ff); }
        .ytc-ob-form { display: grid; gap: 8px; width: 340px; }
        .ytc-ob-field { display: flex; align-items: center; justify-content: space-between; gap: 12px; min-height: 44px; padding: 0 14px; border-radius: 10px; background: rgba(255, 255, 255, 0.08); font-size: 13px; cursor: pointer; }
        .ytc-ob-field select { height: 30px; padding: 0 8px; border: 1px solid rgba(255, 255, 255, 0.15); border-radius: 8px; background: #212121; color: #f1f1f1; font: inherit; }
        .ytc-ob-field select:disabled { opacity: 0.4; }
        .ytc-ob-art .ytc-toggle { background: rgba(255, 255, 255, 0.15); }
        .ytc-ob-art .ytc-toggle:checked { background: #ff0033; }
        /* "Ao vivo" section in the guide, drawn like YouTube's own sections. */
        .ytc-live-section {
            padding: 12px;
            border-bottom: 1px solid var(--yt-spec-10-percent-layer, rgba(255, 255, 255, 0.2));
        }
        .ytc-live-title {
            padding: 6px 12px 4px;
            font: 500 16px/22px Roboto, Arial, sans-serif;
            color: var(--yt-spec-text-primary, #f1f1f1);
        }
        .ytc-live-entry {
            display: flex;
            align-items: center;
            height: 40px;
            padding: 0 12px;
            border-radius: 10px;
            color: var(--yt-spec-text-primary, #f1f1f1);
            text-decoration: none;
        }
        .ytc-live-entry:hover { background: var(--yt-spec-10-percent-layer, rgba(255, 255, 255, 0.1)); }
        .ytc-live-more {
            width: 100%;
            border: 0;
            background: none;
            cursor: pointer;
            text-align: left;
        }
        .ytc-live-skeleton span {
            height: 12px;
            border-radius: 6px;
            background: var(--yt-spec-10-percent-layer, rgba(255, 255, 255, 0.1));
            animation: ytc-pulse 1.2s ease-in-out infinite alternate;
        }
        .ytc-live-skeleton span:first-child { width: 24px; height: 24px; flex: none; margin-right: 24px; border-radius: 50%; }
        .ytc-live-skeleton span:last-child { width: 60%; }
        .ytc-live-skeleton:hover { background: none; }
        @keyframes ytc-pulse { from { opacity: 0.45; } to { opacity: 1; } }
        .ytc-live-chevron {
            width: 24px;
            height: 24px;
            flex: none;
            margin-right: 24px;
        }
        .ytc-live-avatar {
            width: 24px;
            height: 24px;
            flex: none;
            margin-right: 24px;
            border-radius: 50%;
            background: var(--yt-spec-10-percent-layer, rgba(255, 255, 255, 0.1));
        }
        .ytc-live-name {
            flex: 1;
            min-width: 0;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
            font: 400 14px/20px Roboto, Arial, sans-serif;
        }
        .ytc-live-stream { height: 48px; }
        .ytc-live-stream .ytc-live-avatar { width: 32px; height: 32px; margin-right: 16px; }
        .ytc-live-text { display: flex; flex-direction: column; flex: 1; min-width: 0; }
        .ytc-live-top { display: flex; align-items: center; gap: 8px; }
        .ytc-live-stream .ytc-live-name { font-weight: 500; }
        .ytc-live-viewers {
            display: flex;
            align-items: center;
            gap: 5px;
            flex: none;
            font: 400 12px/16px Roboto, Arial, sans-serif;
        }
        .ytc-live-viewers::before {
            content: '';
            width: 8px;
            height: 8px;
            border-radius: 50%;
            background: var(--yt-spec-static-brand-red, #f03);
        }
        .ytc-live-stream-title {
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
            font: 400 12px/16px Roboto, Arial, sans-serif;
            color: var(--yt-spec-text-secondary, #aaa);
        }
        .ytc-live-explore-hidden { display: none !important; }

        /* Live hub, on YouTube's live page. */
        .ytc-hub {
            /* Same edges as the page's own content below it. */
            margin: 8px 24px 40px;
            color: var(--yt-spec-text-primary, #f1f1f1);
            font-family: Roboto, Arial, sans-serif;
        }
        .ytc-hub-head { display: flex; align-items: center; gap: 12px; margin-bottom: 16px; }
        .ytc-hub-title { margin: 0; font: 700 20px/28px Roboto, Arial, sans-serif; }
        .ytc-hub-count {
            padding: 0 8px;
            border-radius: 999px;
            background: var(--yt-spec-badge-chip-background, rgba(255, 255, 255, 0.1));
            font-size: 12px;
            line-height: 20px;
        }
        .ytc-hub-count:empty { display: none; }
        .ytc-hub-tv {
            display: inline-flex;
            align-items: center;
            gap: 8px;
            height: 36px;
            margin-left: auto;
            padding: 0 16px 0 12px;
            border-radius: 18px;
            background: var(--yt-spec-static-brand-red, #f03);
            color: #fff;
            font: 500 14px/36px Roboto, Arial, sans-serif;
            text-decoration: none;
        }
        .ytc-hub-tv:hover { filter: brightness(1.1); }
        .ytc-hub-tv svg { width: 20px; height: 20px; }
        .ytc-hub-cards {
            display: grid;
            grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
            gap: 24px 16px;
        }
        .ytc-hub-card { display: flex; flex-direction: column; gap: 12px; color: inherit; text-decoration: none; }
        .ytc-hub-thumb {
            position: relative;
            aspect-ratio: 16 / 9;
            overflow: hidden;
            border-radius: 12px;
            background: var(--yt-spec-10-percent-layer, rgba(255, 255, 255, 0.1));
        }
        .ytc-hub-thumb img { width: 100%; height: 100%; object-fit: cover; display: block; transition: transform 0.2s ease; }
        .ytc-hub-card:hover .ytc-hub-thumb img { transform: scale(1.03); }
        .ytc-hub-pill {
            position: absolute;
            right: 8px;
            bottom: 8px;
            padding: 1px 6px;
            border-radius: 4px;
            background: var(--yt-spec-static-brand-red, #f03);
            color: #fff;
            font: 700 12px/18px Roboto, Arial, sans-serif;
        }
        .ytc-hub-meta { display: flex; gap: 12px; }
        .ytc-hub-avatar {
            width: 36px;
            height: 36px;
            flex: none;
            border-radius: 50%;
            background: var(--yt-spec-10-percent-layer, rgba(255, 255, 255, 0.1));
        }
        .ytc-hub-text { display: flex; flex-direction: column; min-width: 0; }
        .ytc-hub-video {
            display: -webkit-box;
            margin-bottom: 4px;
            overflow: hidden;
            -webkit-box-orient: vertical;
            -webkit-line-clamp: 2;
            font: 500 16px/22px Roboto, Arial, sans-serif;
        }
        .ytc-hub-channel { font: 400 14px/20px Roboto, Arial, sans-serif; color: var(--yt-spec-text-secondary, #aaa); }
        .ytc-hub-skeleton { aspect-ratio: 16 / 9; border-radius: 12px; background: var(--yt-spec-10-percent-layer, rgba(255, 255, 255, 0.1)); animation: ytc-pulse 1.2s ease-in-out infinite alternate; }
        .ytc-hub-empty { margin: 0; color: var(--yt-spec-text-secondary, #aaa); font-size: 14px; }
        .ytc-hub-more {
            grid-column: 1 / -1;
            justify-self: center;
            height: 36px;
            padding: 0 16px;
            border: 1px solid var(--yt-spec-10-percent-layer, rgba(255, 255, 255, 0.2));
            border-radius: 18px;
            background: none;
            color: inherit;
            font: 500 14px Roboto, Arial, sans-serif;
            cursor: pointer;
        }
        ytd-guide-renderer #sections { display: flex; flex-direction: column; }
        ytd-guide-renderer #sections > * { order: 3; }
        ytd-guide-renderer #sections > .ytc-guide-home { order: 0; }
        ytd-guide-renderer #sections > .ytc-live-section { order: 1; }
        ytd-guide-renderer #sections > .ytc-guide-subs { order: 2; }
        .ytc-live-badge {
            width: 20px;
            height: 20px;
            flex: none;
            margin-left: 8px;
            color: var(--yt-spec-static-brand-red, #f03);
        }
        .ytc-live-tv {
            width: 100%;
            border: 0;
            background: none;
            cursor: pointer;
            text-align: left;
            font-weight: 500;
        }
        .ytc-live-tv .ytc-live-chevron { color: var(--yt-spec-static-brand-red, #f03); }

        /* "Transmitindo agora" on a channel's live tab: only what is on air.
           The grid lists upcoming streams first, then live ones, then past
           ones; the continuation keeps loading until past ones show up. */
        html.ytc-live-only ytd-browse:not([hidden]) ytd-rich-grid-renderer #contents > ytd-rich-item-renderer:not(:has(.ytBadgeShapeThumbnailLive, ytd-thumbnail-overlay-time-status-renderer[overlay-style="LIVE"])) {
            display: none !important;
        }
        html.ytc-live-only.ytc-live-settled ytd-browse:not([hidden]) ytd-rich-grid-renderer #contents > ytd-continuation-item-renderer {
            display: none !important;
        }
        .ytc-live-chip .ytChipShapeText { display: flex; align-items: center; gap: 6px; }
        .ytc-live-chip .ytChipShapeText::before {
            content: '';
            width: 8px;
            height: 8px;
            border-radius: 50%;
            background: var(--yt-spec-static-brand-red, #f03);
        }
        .ytc-live-empty {
            padding: 48px 0;
            text-align: center;
            font: 400 16px/22px Roboto, Arial, sans-serif;
            color: var(--yt-spec-text-secondary, #aaa);
        }

        /* TV mode: one live at a time, full screen. The channel list is a
           docked sidebar on the left and the live chat one on the right,
           so neither covers the picture. */
        html.ytc-tv-open { overflow: hidden !important; }
        html.ytc-tv-page ytd-app { display: none !important; }
        html.ytc-tv-page, html.ytc-tv-page body { background: #000 !important; }
        .ytc-tv {
            --tv-red: #ff0033;
            --tv-guide-w: 0px;
            --tv-chat-w: 0px;
            --tv-panel: #0f0f0f;
            --tv-raised: rgba(255, 255, 255, 0.08);
            --tv-line: rgba(255, 255, 255, 0.1);
            --tv-muted: rgba(255, 255, 255, 0.62);
            --tv-ease: cubic-bezier(0.2, 0.8, 0.2, 1);
            position: fixed;
            inset: 0;
            z-index: 10000;
            overflow: hidden;
            background: #000;
            color: #fff;
            font-family: "YouTube Sans", Roboto, Arial, sans-serif;
            outline: none;
            animation: ytc-tv-in 0.35s var(--tv-ease);
        }
        @keyframes ytc-tv-in { from { opacity: 0; transform: scale(1.02); } }
        .ytc-tv.is-guide { --tv-guide-w: 360px; }
        .ytc-tv.is-chat { --tv-chat-w: 360px; }
        .ytc-tv button { font-family: inherit; }
        .ytc-tv button:focus-visible { outline: none; background-color: rgba(255, 255, 255, 0.16); }
        .ytc-tv kbd {
            min-width: 18px;
            padding: 1px 6px;
            border-radius: 6px;
            background: rgba(255, 255, 255, 0.12);
            box-shadow: inset 0 -1px 0 rgba(255, 255, 255, 0.12);
            font: 500 11px/18px Roboto, Arial, sans-serif;
            color: #fff;
            text-align: center;
        }

        .ytc-tv-stage {
            position: absolute;
            top: 0;
            bottom: 0;
            left: var(--tv-guide-w);
            right: var(--tv-chat-w);
            transition: left 0.3s var(--tv-ease), right 0.3s var(--tv-ease);
        }
        .ytc-tv-frame { width: 100%; height: 100%; border: 0; background: #000; }
        /* Fades in while the channel loads, so a zap reads as a cut. */
        .ytc-tv-veil {
            position: absolute;
            inset: 0;
            display: grid;
            place-items: center;
            background: radial-gradient(circle at center, #1a1a1f 0%, #000 70%);
            opacity: 0;
            pointer-events: none;
            transition: opacity 0.25s ease;
        }
        .ytc-tv.is-tuning .ytc-tv-veil { opacity: 1; }
        .ytc-tv-veil img {
            width: 96px;
            height: 96px;
            border-radius: 50%;
            box-shadow: 0 0 0 3px var(--tv-red), 0 0 48px rgba(255, 0, 51, 0.45);
            animation: ytc-tv-pulse 1.4s ease-in-out infinite;
        }
        @keyframes ytc-tv-pulse { 50% { box-shadow: 0 0 0 3px var(--tv-red), 0 0 80px rgba(255, 0, 51, 0.7); } }

        /* Labelled pill buttons. */
        .ytc-tv-button {
            display: inline-flex;
            align-items: center;
            justify-content: center;
            gap: 8px;
            height: 40px;
            padding: 0 16px 0 12px;
            border: 0;
            border-radius: 999px;
            background: var(--tv-raised);
            color: #fff;
            font-size: 14px;
            font-weight: 500;
            white-space: nowrap;
            cursor: pointer;
            transition: background 0.15s ease;
        }
        .ytc-tv-button:hover { background: rgba(255, 255, 255, 0.16); }
        .ytc-tv-button svg { width: 22px; height: 22px; flex: none; }
        .ytc-tv-button.is-on { background: #f1f1f1; color: #0f0f0f; }
        .ytc-tv-icon-button { width: 40px; padding: 0; }

        /* Channel sidebar, drawn like YouTube's up-next / playlist panel. */
        .ytc-tv-guide {
            position: absolute;
            top: 0;
            bottom: 0;
            left: 0;
            display: flex;
            flex-direction: column;
            width: 360px;
            background: var(--tv-panel);
            border-right: 1px solid var(--tv-line);
            font-family: Roboto, Arial, sans-serif;
            transform: translateX(-100%);
            visibility: hidden;
            transition: transform 0.3s var(--tv-ease), visibility 0s 0.3s;
        }
        .ytc-tv.is-guide .ytc-tv-guide { transform: none; visibility: visible; transition: transform 0.3s var(--tv-ease); }
        .ytc-tv-top {
            display: flex;
            align-items: center;
            gap: 12px;
            height: 56px;
            flex: none;
            padding: 0 16px 0 12px;
        }
        .ytc-tv-top .ytc-tv-icon-button { background: none; }
        .ytc-tv-top .ytc-tv-icon-button:hover { background: rgba(255, 255, 255, 0.1); }
        .ytc-tv-yt {
            display: flex;
            align-items: center;
            gap: 4px;
            color: #fff;
            text-decoration: none;
            font: 700 20px/1 "YouTube Sans", Roboto, Arial, sans-serif;
            letter-spacing: -0.05em;
        }
        .ytc-tv-yt svg { width: 29px; height: 20px; }
        .ytc-tv-head {
            display: flex;
            align-items: center;
            gap: 8px;
            flex: none;
            margin: 0 12px 8px;
            padding: 8px 6px 8px 14px;
            border-radius: 12px;
            background: #212121;
        }
        .ytc-tv-head .ytc-tv-icon-button { background: none; }
        .ytc-tv-head .ytc-tv-icon-button:hover { background: rgba(255, 255, 255, 0.1); }
        .ytc-tv-head .ytc-tv-icon-button.is-on { background: none; color: #fff; }
        .ytc-tv-titles { flex: 1; min-width: 0; }
        .ytc-tv-brand { font-size: 18px; font-weight: 700; line-height: 26px; }
        .ytc-tv-count { font-size: 12px; line-height: 18px; color: var(--tv-muted); }
        .ytc-tv-list {
            flex: 1;
            min-height: 0;
            overflow-y: auto;
            padding: 0 12px 8px 4px;
            scrollbar-width: thin;
            scrollbar-color: rgba(255, 255, 255, 0.2) transparent;
        }
        .ytc-tv-row {
            display: flex;
            align-items: flex-start;
            gap: 8px;
            width: 100%;
            padding: 4px 8px 4px 0;
            border: 0;
            border-radius: 8px;
            background: none;
            color: inherit;
            text-align: left;
            cursor: pointer;
        }
        .ytc-tv-row + .ytc-tv-row { margin-top: 4px; }
        .ytc-tv-row:hover { background: rgba(255, 255, 255, 0.06); }
        .ytc-tv-row.is-current { background: rgba(255, 255, 255, 0.1); }
        /* Where the arrow keys are, while the list is open: a lighter
           fill, like hover, not a ring. */
        .ytc-tv-row.is-cursor,
        .ytc-tv-group.is-cursor { background: rgba(255, 255, 255, 0.16); }
        /* The index column of a playlist: a number, a play mark for the
           one on screen. */
        .ytc-tv-number {
            display: grid;
            place-items: center;
            width: 24px;
            height: 68px;
            flex: none;
            font-size: 12px;
            color: var(--tv-muted);
            font-variant-numeric: tabular-nums;
        }
        .ytc-tv-number svg { display: none; width: 14px; height: 14px; color: #fff; }
        .ytc-tv-row.is-current .ytc-tv-index { display: none; }
        .ytc-tv-row.is-current .ytc-tv-number svg { display: block; }
        .ytc-tv-thumb {
            position: relative;
            width: 120px;
            height: 68px;
            flex: none;
            overflow: hidden;
            border-radius: 8px;
            background: var(--tv-raised);
        }
        .ytc-tv-thumb img { width: 100%; height: 100%; object-fit: cover; display: block; }
        .ytc-tv-pill {
            display: inline-flex;
            align-items: center;
            padding: 1px 5px;
            border-radius: 4px;
            background: var(--tv-red);
            font-size: 10px;
            font-weight: 700;
            letter-spacing: 0.04em;
            line-height: 14px;
        }
        .ytc-tv-thumb .ytc-tv-pill { position: absolute; right: 4px; bottom: 4px; }
        .ytc-tv-playing {
            position: absolute;
            inset: 0;
            display: none;
            place-items: center;
            background: rgba(0, 0, 0, 0.5);
        }
        .ytc-tv-row.is-current .ytc-tv-playing { display: grid; }
        .ytc-tv-eq { display: flex; align-items: flex-end; gap: 3px; height: 16px; }
        .ytc-tv-eq i {
            width: 4px;
            border-radius: 2px;
            background: #fff;
            animation: ytc-tv-eq 0.9s ease-in-out infinite alternate;
        }
        .ytc-tv-eq i:nth-child(2) { animation-delay: -0.3s; }
        .ytc-tv-eq i:nth-child(3) { animation-delay: -0.6s; }
        @keyframes ytc-tv-eq { from { height: 4px; } to { height: 16px; } }
        .ytc-tv-text { display: flex; flex-direction: column; flex: 1; min-width: 0; }
        .ytc-tv-title {
            display: -webkit-box;
            overflow: hidden;
            -webkit-box-orient: vertical;
            -webkit-line-clamp: 3;
            font-size: 14px;
            font-weight: 500;
            line-height: 20px;
        }
        .ytc-tv-channel,
        .ytc-tv-meta {
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
            font-size: 12px;
            line-height: 18px;
            color: var(--tv-muted);
        }
        .ytc-tv-channel { margin-top: 2px; }
        .ytc-tv-divider { height: 1px; margin: 12px 0 12px 24px; background: var(--tv-line); }
        .ytc-tv-heading { padding: 0 8px 4px 32px; font-size: 16px; font-weight: 700; line-height: 22px; }
        .ytc-tv-group {
            display: flex;
            align-items: center;
            gap: 8px;
            width: 100%;
            height: 40px;
            margin: 2px 0;
            padding: 0 8px 0 26px;
            border: 0;
            border-radius: 8px;
            background: none;
            color: inherit;
            font-size: 14px;
            font-weight: 500;
            text-align: left;
            cursor: pointer;
        }
        .ytc-tv-group:hover { background: rgba(255, 255, 255, 0.06); }
        .ytc-tv-group svg { width: 20px; height: 20px; flex: none; color: var(--tv-muted); transition: transform 0.2s var(--tv-ease); }
        .ytc-tv-group.is-open svg { transform: rotate(90deg); }
        .ytc-tv-group-name { flex: 1; }
        .ytc-tv-group-count {
            min-width: 22px;
            padding: 0 6px;
            border-radius: 999px;
            background: var(--tv-raised);
            font-size: 12px;
            line-height: 20px;
            color: var(--tv-muted);
            text-align: center;
        }
        .ytc-tv-none { padding: 32px 16px; text-align: center; color: var(--tv-muted); font-size: 14px; }
        .ytc-tv-foot { flex: none; padding: 8px 12px; border-top: 1px solid var(--tv-line); }
        .ytc-tv-exit {
            justify-content: flex-start;
            width: 100%;
            padding: 0 8px;
            background: none;
            color: var(--tv-muted);
        }
        .ytc-tv-exit:hover { background: none; color: #fff; }
        .ytc-tv-exit kbd { margin-left: auto; }

        /* With the list closed: one button to bring it back. */
        .ytc-tv-opener {
            position: absolute;
            top: 8px;
            left: 12px;
            display: flex;
            align-items: center;
            gap: 12px;
            padding: 4px 16px 4px 4px;
            border-radius: 999px;
            background: rgba(15, 15, 15, 0.8);
            -webkit-backdrop-filter: blur(16px);
            backdrop-filter: blur(16px);
            box-shadow: 0 8px 24px rgba(0, 0, 0, 0.4);
            opacity: 0;
            pointer-events: none;
            transform: translateY(-8px);
            transition: opacity 0.25s ease, transform 0.3s var(--tv-ease);
        }
        .ytc-tv-opener .ytc-tv-icon-button { background: none; }
        .ytc-tv-opener .ytc-tv-icon-button:hover { background: rgba(255, 255, 255, 0.1); }
        .ytc-tv.is-ui:not(.is-guide) .ytc-tv-opener { opacity: 1; pointer-events: auto; transform: none; }

        /* Now-playing banner on each zap, while the list is closed. */
        .ytc-tv-banner {
            position: absolute;
            left: calc((100% - var(--tv-chat-w)) / 2);
            bottom: 88px;
            display: flex;
            align-items: center;
            gap: 16px;
            width: max-content;
            max-width: min(720px, calc(100% - var(--tv-chat-w) - 48px));
            padding: 14px 22px 14px 14px;
            border: 1px solid var(--tv-line);
            border-radius: 20px;
            background: rgba(15, 15, 15, 0.82);
            -webkit-backdrop-filter: blur(24px);
            backdrop-filter: blur(24px);
            box-shadow: 0 24px 64px rgba(0, 0, 0, 0.5);
            opacity: 0;
            pointer-events: none;
            transform: translate(-50%, 16px);
            transition: opacity 0.25s ease, transform 0.3s var(--tv-ease);
        }
        .ytc-tv.is-banner:not(.is-guide) .ytc-tv-banner { opacity: 1; transform: translate(-50%, 0); }
        .ytc-tv-banner-number {
            font-size: 40px;
            font-weight: 300;
            line-height: 1;
            font-variant-numeric: tabular-nums;
            color: var(--tv-muted);
        }
        .ytc-tv-banner > img { width: 52px; height: 52px; flex: none; border-radius: 50%; background: var(--tv-raised); }
        .ytc-tv-banner-channel { display: flex; align-items: center; gap: 8px; font-size: 18px; font-weight: 700; }
        .ytc-tv-banner .ytc-tv-title { font-size: 14px; line-height: 19px; -webkit-line-clamp: 1; }
        .ytc-tv-banner .ytc-tv-meta kbd { margin: 0 2px; }

        /* Live chat, docked to the right. */
        .ytc-tv-chat {
            position: absolute;
            top: 0;
            right: 0;
            bottom: 0;
            display: flex;
            flex-direction: column;
            width: 360px;
            background: var(--tv-panel);
            border-left: 1px solid var(--tv-line);
            transform: translateX(100%);
            visibility: hidden;
            transition: transform 0.3s var(--tv-ease), visibility 0s 0.3s;
        }
        .ytc-tv.is-chat .ytc-tv-chat { transform: none; visibility: visible; transition: transform 0.3s var(--tv-ease); }
        .ytc-tv-chat iframe { flex: 1; width: 100%; border: 0; background: var(--tv-panel); }
    `);

    // ---------------------------------------------------------------------
    //  Page helpers
    // ---------------------------------------------------------------------
    function watchFlexy() {
        return document.querySelector('ytd-watch-flexy:not([hidden])');
    }

    function player() {
        return document.querySelector('#movie_player');
    }

    // A chat on screen (a live, or a replay opened by hand). A replay left
    // collapsed has a frame too, but nothing our toggle could show.
    function hasChat() {
        return Boolean(watchFlexy()?.hasAttribute('live-chat-present-and-expanded'));
    }

    function currentVideoId() {
        return watchFlexy()?.getAttribute('video-id') ?? '';
    }

    let hudTimer = 0;
    function showHud(text) {
        const host = player();
        if (!host) return;
        let hud = host.querySelector('.ytc-hud');
        if (!hud) {
            hud = document.createElement('div');
            hud.className = 'ytc-hud';
            host.append(hud);
        }
        hud.textContent = text;
        hud.classList.add('is-visible');
        clearTimeout(hudTimer);
        hudTimer = setTimeout(() => hud.classList.remove('is-visible'), 700);
    }

    // ---------------------------------------------------------------------
    //  Sidebars
    // ---------------------------------------------------------------------
    function toggleButton(className, path, pathOn, onClick) {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = `ytc-button ${className}`;
        const off = icon(path);
        const on = icon(pathOn);
        off.classList.add('ytc-icon-off');
        on.classList.add('ytc-icon-on');
        button.append(off, on);
        // The player toggles playback on clicks that reach it.
        for (const type of ['mousedown', 'pointerdown', 'pointerup', 'dblclick']) {
            button.addEventListener(type, event => event.stopPropagation());
        }
        button.addEventListener('click', event => {
            event.stopPropagation();
            onClick();
        });
        return button;
    }

    // The chat and the up-next sidebar take turns: opening one closes the
    // other, so they never squeeze the player together. The chat closes the
    // sidebar only for the video it belongs to; the sidebar preference
    // itself is kept for the videos without chat.
    let relatedOffFor = '';

    function relatedShown() {
        return state.relatedSidebar && relatedOffFor !== currentVideoId();
    }

    function toggleChat() {
        state.chatVisible = !state.chatVisible;
        setSetting('chatVisible', state.chatVisible);
        if (state.chatVisible) relatedOffFor = currentVideoId();
        syncLayout();
        showHud(state.chatVisible ? 'Chat visível' : 'Chat oculto');
    }

    function toggleRelated() {
        state.relatedSidebar = !relatedShown();
        setSetting('relatedSidebar', state.relatedSidebar);
        relatedOffFor = '';
        if (state.relatedSidebar && hasChat() && state.chatVisible) {
            state.chatVisible = false;
            setSetting('chatVisible', false);
        }
        syncLayout();
        showHud(state.relatedSidebar ? 'Próximos vídeos ao lado' : 'Próximos vídeos abaixo');
    }

    // Each video with a chat starts with it open and the sidebar closed
    // (unless turned off in the settings menu); without that, a chat and a
    // sidebar both left on give way to the sidebar.
    let chatCheckedFor = '';

    function placeChat() {
        const videoId = currentVideoId();
        if (!videoId || chatCheckedFor === videoId || !hasChat()) return;
        chatCheckedFor = videoId;
        if (state.autoChat) {
            state.chatVisible = true;
            relatedOffFor = videoId;
        } else if (state.chatVisible && state.relatedSidebar) {
            state.chatVisible = false;
        }
    }

    function setLabel(button, active, onLabel, offLabel) {
        if (!button || button.getAttribute('aria-pressed') === String(active)) return;
        button.classList.toggle('is-active', active);
        button.setAttribute('aria-pressed', String(active));
        const label = active ? onLabel : offLabel;
        button.title = label;
        button.setAttribute('aria-label', label);
    }

    let lastLayout = '';

    // ---------------------------------------------------------------------
    //  Masthead auto-hide while a video is open in theater mode. The space reserved for it
    //  (--ytc-masthead-h) drops to zero, so the player and sidebars start
    //  at the very top.
    // ---------------------------------------------------------------------
    const REVEAL_EDGE = 8;
    let revealed = false;
    let hideTimer = 0;

    function syncMasthead(flexy) {
        const root = document.documentElement;
        // Only the theater mode takes over the screen; the normal layout
        // keeps YouTube's masthead.
        const active = Boolean(flexy) && location.pathname === '/watch'
            && flexy.hasAttribute('theater') && !flexy.hasAttribute('fullscreen');
        root.classList.toggle('ytc-masthead-autohide', active);
        const masthead = document.querySelector('#masthead-container');
        const height = Math.round(masthead?.getBoundingClientRect().height ?? 0) || 56;
        setVar(root, '--ytc-masthead-h', active ? '0px' : `${height}px`);
    }

    function setRevealed(value) {
        clearTimeout(hideTimer);
        hideTimer = 0;
        if (revealed === value) return;
        revealed = value;
        document.documentElement.classList.toggle('ytc-masthead-reveal', value);
    }

    document.addEventListener('mousemove', event => {
        if (!document.documentElement.classList.contains('ytc-masthead-autohide')) return;
        const masthead = document.querySelector('#masthead-container');
        const bottom = masthead?.getBoundingClientRect().height || 56;
        if (event.clientY <= REVEAL_EDGE || (revealed && event.clientY <= bottom)) {
            setRevealed(true);
        } else if (revealed && !hideTimer) {
            // A little grace so a quick dip below the bar does not close it,
            // and an open search suggestion list is not cut off mid-click.
            hideTimer = setTimeout(() => {
                hideTimer = 0;
                if (!document.querySelector('#masthead-container:focus-within')) setRevealed(false);
            }, 400);
        }
    }, { passive: true });
    document.addEventListener('mouseleave', () => setRevealed(false));

    // ---------------------------------------------------------------------
    //  Docked sidebar with a playlist: the playlist panel and the up-next
    //  list share the column one at a time, switched from a strip pinned
    //  to its top (the choice is kept). Without a playlist the up-next
    //  list is shown alone, with no switch.
    // ---------------------------------------------------------------------
    const SIDE_VIEWS = [
        { id: 'playlist', label: 'Playlist', icon: 'M3 10h11v2H3zm0-4h11v2H3zm0 8h7v2H3zm13-1v8l6-4z' },
        { id: 'related', label: 'Próximos', icon: 'M4 6H2v14c0 1.1.9 2 2 2h14v-2H4V6zm16-4H8c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm-8 12.5v-9l6 4.5-6 4.5z' },
    ];

    function setSideView(view) {
        if (state.sideView === view) return;
        state.sideView = view;
        setSetting('sideView', view);
        syncLayout();
        // A hidden scroller forgets its position: bring the playing video
        // back into view.
        if (view === 'playlist') requestAnimationFrame(scrollPlaylistCurrent);
    }

    // Returns whether the playing video's row was there to scroll to.
    function scrollPlaylistCurrent() {
        const panel = document.querySelector('ytd-watch-flexy ytd-playlist-panel-renderer#playlist');
        const id = currentVideoId();
        const row = panel?.classList.contains('ytc-pl-on')
            ? panel.querySelector('.ytc-pl-row.is-current')
            : panel?.querySelector('#items > ytd-playlist-panel-video-renderer[selected]');
        const link = row?.matches('a') ? row : row?.querySelector('a#wc-endpoint');
        if (!row || !id || new URL(link?.href ?? location.href, location.origin).searchParams.get('v') !== id) return false;
        scrollPlRow(row);
        return true;
    }

    // Each new video starts at the top of the list. YouTube scrolls its
    // own selected item into view a moment later, so it is done again
    // after that.
    let sideScrolledFor = '';
    function scrollPlaylistOnVideo() {
        const id = currentVideoId();
        if (!id || sideScrolledFor === id || !scrollPlaylistCurrent()) return;
        sideScrolledFor = id;
        setTimeout(scrollPlaylistCurrent, 800);
    }

    function syncSideView(docked) {
        const root = document.documentElement;
        const secondary = document.querySelector('ytd-watch-flexy #secondary');
        const panel = secondary?.querySelector('ytd-playlist-panel-renderer#playlist');
        const tabbed = Boolean(docked && playlistParams() && panel && !panel.hidden
            && panel.querySelector('ytd-playlist-panel-video-renderer'));
        const wasPlaylist = root.classList.contains('ytc-side-playlist');
        root.classList.toggle('ytc-side-tabs', tabbed);
        root.classList.toggle('ytc-side-playlist', tabbed && state.sideView === 'playlist');
        root.classList.toggle('ytc-side-related', tabbed && state.sideView === 'related');
        if (!tabbed) return;
        if (panel.hasAttribute('collapsed')) panel.collapsed = false;
        // The panel just took the column (a playlist opened, the sidebar
        // was docked): its list gets a height only now.
        if (!wasPlaylist && state.sideView === 'playlist') requestAnimationFrame(scrollPlaylistCurrent);
        if (state.sideView === 'playlist') scrollPlaylistOnVideo();
        let strip = secondary.querySelector(':scope > .ytc-side-switch');
        if (!strip) {
            strip = document.createElement('div');
            strip.className = 'ytc-side-switch';
            strip.setAttribute('role', 'tablist');
            strip.setAttribute('aria-label', 'Barra lateral');
            for (const view of SIDE_VIEWS) {
                const tab = document.createElement('button');
                tab.type = 'button';
                tab.dataset.view = view.id;
                tab.setAttribute('role', 'tab');
                const label = document.createElement('span');
                label.textContent = view.label;
                tab.append(icon(view.icon), label);
                if (view.id === 'playlist') {
                    const count = document.createElement('span');
                    count.className = 'ytc-side-count';
                    tab.append(count);
                }
                tab.addEventListener('click', () => setSideView(view.id));
                strip.append(tab);
            }
            // Arrow keys move between the two tabs, as in any tab strip.
            strip.addEventListener('keydown', event => {
                if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
                event.preventDefault();
                event.stopPropagation();
                const next = state.sideView === 'playlist' ? 'related' : 'playlist';
                setSideView(next);
                strip.querySelector(`[data-view="${next}"]`)?.focus();
            });
            secondary.prepend(strip);
        }
        for (const tab of strip.children) {
            const selected = tab.dataset.view === state.sideView;
            if (tab.getAttribute('aria-selected') !== String(selected)) {
                tab.setAttribute('aria-selected', String(selected));
                tab.tabIndex = selected ? 0 : -1;
            }
        }
        // "12 / 305", from the panel's own header. A mix has no end (YouTube
        // writes its total as "NaN") and gets no count.
        const match = /(\d+)\s*\/\s*(\d+)/.exec(panel.querySelector('.index-message')?.textContent ?? '');
        const position = match && !playlistParams()?.list.startsWith('RD') ? `${match[1]} / ${match[2]}` : '';
        const count = strip.querySelector('.ytc-side-count');
        if (count && count.textContent !== position) count.textContent = position;
    }

    function syncLayout() {
        const flexy = watchFlexy();
        const theater = Boolean(flexy?.hasAttribute('theater'));
        const chat = hasChat();
        const root = document.documentElement;
        root.classList.toggle('ytc-chat-hidden', theater && chat && !state.chatVisible);
        root.classList.toggle('ytc-related-sidebar', theater && relatedShown());
        syncSideView(theater && relatedShown());
        setVar(root, '--ytc-chat-size', `${state.sideWidth}px`);
        setVar(root, '--ytc-related-w', `${state.sideWidth || RELATED_WIDTH}px`);

        // The up-next sidebar sits left of YouTube's pinned chat.
        const chatContainer = flexy?.querySelector('#chat-container');
        const chatWidth = theater && chat && state.chatVisible && chatContainer
            ? Math.round(chatContainer.querySelector('ytd-live-chat-frame')?.getBoundingClientRect().width ?? 0)
            : 0;
        setVar(root, '--ytc-chat-w', `${chatWidth}px`);
        // Only a chat actually on screen is resized and given room: a
        // collapsed chat replay has no width and must not reserve any.
        root.classList.toggle('ytc-chat-sized', theater && state.sideWidth > 0 && chatWidth > 0);
        syncMasthead(flexy);
        // The pinned sidebar takes the page's own background, light or dark.
        const pageBg = getComputedStyle(document.querySelector('ytd-app') ?? document.body).backgroundColor;
        if (pageBg && pageBg !== 'rgba(0, 0, 0, 0)') setVar(root, '--ytc-page-bg', pageBg);

        const chatButton = document.querySelector('#movie_player .ytc-chat');
        if (chatButton) {
            chatButton.hidden = !chat || !theater;
            setLabel(chatButton, state.chatVisible, 'Ocultar chat', 'Mostrar chat');
        }
        const relatedButton = document.querySelector('#movie_player .ytc-related');
        if (relatedButton) {
            relatedButton.hidden = !theater;
            setLabel(relatedButton, relatedShown(), 'Próximos vídeos: ao lado', 'Próximos vídeos: abaixo');
        }
        const visibleButtons = document.querySelectorAll('#movie_player .ytc-top-controls > .ytc-button:not([hidden])').length;
        // Each button is 44px with its margins, plus the pill's padding and
        // a gap before YouTube's own overlay.
        setVar(root, '--ytc-top-w', visibleButtons ? `${visibleButtons * 44 + 16}px` : '0px');
        // Line our buttons up with YouTube's info button when it is there.
        const info = document.querySelector('#movie_player .ytp-cards-button');
        const host = player();
        const infoBox = info?.getBoundingClientRect();
        if (host && infoBox?.height) {
            const pill = host.querySelector(':scope > .ytc-top-controls');
            const top = infoBox.top - host.getBoundingClientRect().top + infoBox.height / 2 - (pill?.offsetHeight ?? 48) / 2;
            setVar(root, '--ytc-top-y', `${Math.round(top)}px`);
        }

        // The player sizes its video from its container only on resize.
        const layout = [theater, chat, state.chatVisible, relatedShown(), state.sideWidth, chatWidth].join();
        if (layout !== lastLayout) {
            lastLayout = layout;
            requestAnimationFrame(() => window.dispatchEvent(new Event('resize')));
        }
    }

    // ---------------------------------------------------------------------
    //  Player controls
    // ---------------------------------------------------------------------
    function enhancePlayer() {
        const host = player();
        if (!host || host.querySelector(':scope > .ytc-top-controls')) return;
        const controls = document.createElement('div');
        controls.className = 'ytc-top-controls';
        controls.append(
            toggleButton('ytc-related', ICONS.related, ICONS.relatedOpen, toggleRelated),
            toggleButton('ytc-chat', ICONS.chat, ICONS.chatOpen, toggleChat),
        );
        host.append(controls);
    }

    // ---------------------------------------------------------------------
    //  Playlist previous/next. YouTube shows its own only once the playlist
    //  data arrives, seconds after the page. Ours exist as soon as the URL
    //  carries a list and use the player API once it knows the playlist
    //  (respects shuffle and loop), else the playlist panel. A click before
    //  either is ready waits for them instead of being lost. The URL's
    //  "index" is no route: without a video id YouTube plays an unrelated
    //  item.
    // ---------------------------------------------------------------------
    const PLAYLIST_WAIT_MS = 15000;
    let pendingStep = null;

    function playlistParams() {
        const list = location.pathname === '/watch' ? new URL(location.href).searchParams.get('list') : null;
        return list ? { list } : null;
    }

    // Returns false while neither the player API nor the panel knows the
    // playlist yet.
    function tryStepPlaylist(step) {
        const ours = plNeighbour(step);
        if (ours !== undefined) {
            if (ours) plWatch(ours);
            return true;
        }
        const host = player();
        try {
            if (host?.getPlaylist?.()?.length) {
                if (step > 0) host.nextVideo();
                else host.previousVideo();
                return true;
            }
        } catch {}
        const items = [...document.querySelectorAll('ytd-playlist-panel-renderer#playlist #items ytd-playlist-panel-video-renderer')];
        const current = items.findIndex(item => item.hasAttribute('selected'));
        if (current === -1) return false;
        items[current + step]?.querySelector('a#wc-endpoint')?.click();
        return true;
    }

    function stepPlaylist(step) {
        const video = player()?.querySelector('video');
        // Like YouTube: "previous" a few seconds in restarts the video.
        if (step < 0 && video && video.currentTime > 3) {
            video.currentTime = 0;
            return;
        }
        if (tryStepPlaylist(step)) return;
        pendingStep = { step, until: Date.now() + PLAYLIST_WAIT_MS, href: location.href };
        showHud('Carregando playlist…');
    }

    function flushPendingStep() {
        if (!pendingStep) return;
        if (Date.now() > pendingStep.until || location.href !== pendingStep.href) {
            pendingStep = null;
            return;
        }
        if (tryStepPlaylist(pendingStep.step)) pendingStep = null;
    }

    function playlistButton(className, path, label, step) {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = `ytp-button ytc-bar-circle ytc-playlist-button ${className}`;
        button.title = label;
        button.setAttribute('aria-label', label);
        button.append(icon(path));
        button.addEventListener('click', event => {
            event.stopPropagation();
            stepPlaylist(step);
        });
        return button;
    }

    function syncPlaylistButtons() {
        const host = player();
        const play = host?.querySelector('.ytp-left-controls .ytp-play-button');
        if (!play) return;
        if (!host.querySelector('.ytc-prev')) {
            // Previous, play, next, like a media remote.
            play.before(playlistButton('ytc-prev', ICONS.previous, 'Anterior (Shift+P)', -1));
            play.after(playlistButton('ytc-next', ICONS.next, 'Próximo (Shift+N)', 1));
        }
        // Wear YouTube's own icons once its (hidden) buttons have them.
        copyIcon(host.querySelector('.ytp-prev-button'), host.querySelector('.ytc-prev'));
        copyIcon(host.querySelector('.ytp-next-button'), host.querySelector('.ytc-next'));
        host.classList.toggle('ytc-playlist', Boolean(playlistParams()));
    }

    function copyIcon(source, target) {
        const icon = source?.querySelector('svg');
        if (!icon || !target) return;
        const signature = [...icon.querySelectorAll('path')].map(path => path.getAttribute('d')).join('|');
        const current = target.querySelector(':scope > svg');
        if (current?.dataset.signature === signature) return;
        const copy = icon.cloneNode(true);
        copy.dataset.signature = signature;
        if (current) current.replaceWith(copy);
        else target.append(copy);
    }

    // ---------------------------------------------------------------------
    //  Black-bar crop. Some videos carry letterbox or pillarbox bars inside
    //  the picture. A few downscaled frames are read through a canvas (the
    //  player feeds the element through Media Source, so the canvas stays
    //  readable) and each edge keeps the thinnest bar seen so far: bars
    //  only ever shrink, so a dark scene cannot make the crop eat into the
    //  picture for long. The video is then zoomed so the picture, without
    //  bars, fits the player edge to edge in one direction.
    // ---------------------------------------------------------------------
    const CROP_SAMPLE_W = 160;
    const CROP_DARK_LUMA = 28;
    const CROP_MIN_BAR = 0.015;
    const crop = { key: '', bars: null, sampledAt: 0, canvas: null };

    function sampleBars(video) {
        if (!video.videoWidth || !video.videoHeight) return null;
        const width = CROP_SAMPLE_W;
        const height = Math.max(2, Math.round(width * video.videoHeight / video.videoWidth));
        crop.canvas ??= document.createElement('canvas');
        crop.canvas.width = width;
        crop.canvas.height = height;
        const context = crop.canvas.getContext('2d', { willReadFrequently: true });
        let pixels;
        try {
            context.drawImage(video, 0, 0, width, height);
            pixels = context.getImageData(0, 0, width, height).data;
        } catch {
            return null;
        }
        const lit = (x, y) => {
            const i = (y * width + x) * 4;
            return 0.2126 * pixels[i] + 0.7152 * pixels[i + 1] + 0.0722 * pixels[i + 2] > CROP_DARK_LUMA;
        };
        // A line counts as bar when at most 2% of its pixels are lit.
        const rowDark = y => { let count = 0; for (let x = 0; x < width; x++) count += lit(x, y); return count <= width * 0.02; };
        const colDark = x => { let count = 0; for (let y = 0; y < height; y++) count += lit(x, y); return count <= height * 0.02; };
        let top = 0;
        while (top < height && rowDark(top)) top++;
        if (top === height) return null; // a black frame says nothing
        let bottom = 0;
        while (bottom < height && rowDark(height - 1 - bottom)) bottom++;
        let left = 0;
        while (left < width && colDark(left)) left++;
        let right = 0;
        while (right < width && colDark(width - 1 - right)) right++;
        const edge = value => (value >= CROP_MIN_BAR ? value : 0);
        return { top: edge(top / height), bottom: edge(bottom / height), left: edge(left / width), right: edge(right / width) };
    }

    function cropBlackBars() {
        const host = player();
        const video = host?.querySelector('video.html5-main-video');
        if (!video) return;
        const active = state.cropBars && location.pathname === '/watch' && !host.classList.contains('ad-showing');
        const key = `${video.currentSrc}|${video.videoWidth}x${video.videoHeight}`;
        if (key !== crop.key) Object.assign(crop, { key, bars: null, sampledAt: 0 });

        if (active && !video.paused && video.readyState >= 2 && Date.now() - crop.sampledAt > 1000) {
            crop.sampledAt = Date.now();
            const bars = sampleBars(video);
            if (bars) {
                crop.bars = crop.bars
                    ? Object.fromEntries(Object.keys(bars).map(side => [side, Math.min(bars[side], crop.bars[side])]))
                    : bars;
            }
        }

        const bars = crop.bars;
        const box = { x: parseFloat(video.style.left) || 0, y: parseFloat(video.style.top) || 0, w: parseFloat(video.style.width) || 0, h: parseFloat(video.style.height) || 0 };
        if (!active || !bars || !box.w || !box.h || !(bars.top || bars.bottom || bars.left || bars.right)) {
            video.classList.remove('ytc-cropped');
            return;
        }
        const width = host.clientWidth;
        const height = host.clientHeight;
        const content = {
            x: bars.left * box.w,
            y: bars.top * box.h,
            w: box.w * (1 - bars.left - bars.right),
            h: box.h * (1 - bars.top - bars.bottom),
        };
        const k = Math.min(width / content.w, height / content.h);
        const tx = (width - content.w * k) / 2 - box.x - content.x * k;
        const ty = (height - content.h * k) / 2 - box.y - content.y * k;
        setVar(video, '--ytc-crop-k', k.toFixed(4));
        setVar(video, '--ytc-crop-x', `${tx.toFixed(1)}px`);
        setVar(video, '--ytc-crop-y', `${ty.toFixed(1)}px`);
        video.classList.add('ytc-cropped');
    }

    // ---------------------------------------------------------------------
    //  Loop, speed and audio boost in the control bar, in place of the
    //  ones Enhancer for YouTube adds.
    // ---------------------------------------------------------------------
    const RATE_MIN = 0.25;
    const RATE_MAX = 5;
    const RATE_STEP = 0.25;
    const BOOST_LEVELS = [1.5, 2, 2.5, 3, 4];
    const WHEEL_STEPS = [1, 2, 5, 10];
    // YouTube's own API only takes these; anything else goes to the element.
    const NATIVE_RATES = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2];

    const clamp = (value, min, max) => Math.min(max, Math.max(min, Math.round(value * 100) / 100));
    const formatRate = value => `${Number(value.toFixed(2))}x`;

    function mainVideo() {
        return player()?.querySelector('video.html5-main-video') ?? null;
    }

    function isAd() {
        return Boolean(player()?.classList.contains('ad-showing'));
    }

    // Our own writes to playbackRate, so the ratechange they cause is not
    // taken for a choice made elsewhere.
    let rateWrite = 0;

    function applyRate() {
        const video = mainVideo();
        if (!video || isAd() || video.playbackRate === state.rate) return;
        // Keep YouTube's own idea of the speed in step when it can hold it,
        // so it does not put its stored rate back on the next video.
        const host = player();
        if (NATIVE_RATES.includes(state.rate)) {
            try {
                host.setPlaybackRate(state.rate);
            } catch {}
        }
        rateWrite = Date.now();
        video.playbackRate = state.rate;
    }

    function setRate(rate, hud = true) {
        state.rate = clamp(rate, RATE_MIN, RATE_MAX);
        setSetting('rate', state.rate);
        applyRate();
        syncBarControls();
        if (hud) showHud(`Velocidade ${formatRate(state.rate)}`);
    }

    // Audio boost: the element's volume tops out at 100%, so louder needs a
    // Web Audio gain stage. createMediaElementSource reroutes the element
    // through the context for good, and a suspended context plays silence,
    // so the graph is built only once the context runs (after a user
    // gesture) and only when a boost is wanted. YouTube keeps one video
    // element across videos, so one graph serves the whole visit.
    let audioContext = null;
    const audioGains = new WeakMap();

    function applyBoost() {
        const video = mainVideo();
        if (!video) return;
        const gain = audioGains.get(video);
        if (gain) {
            gain.gain.value = boostGain();
            return;
        }
        if (boostGain() === 1 || audioContext?.state !== 'running') return;
        try {
            const source = audioContext.createMediaElementSource(video);
            const node = audioContext.createGain();
            node.gain.value = boostGain();
            source.connect(node).connect(audioContext.destination);
            audioGains.set(video, node);
        } catch (error) {
            console.warn('[youtube-cinema] audio boost unavailable', error);
        }
    }

    function boostGain() {
        return state.boostOn ? state.boostLevel : 1;
    }

    function unlockAudio() {
        if (boostGain() === 1) return;
        try {
            audioContext ??= new AudioContext();
        } catch {
            return;
        }
        if (audioContext.state === 'running') applyBoost();
        else audioContext.resume().then(applyBoost).catch(() => {});
    }

    for (const type of ['pointerdown', 'keydown']) {
        window.addEventListener(type, unlockAudio, true);
    }

    const formatBoost = level => `${Math.round(level * 100)}%`;

    function setBoostOn(on) {
        state.boostOn = on;
        setSetting('boostOn', on);
        unlockAudio();
        applyBoost();
        syncBarControls();
        showHud(on ? `Amplificador: ${formatBoost(state.boostLevel)}` : 'Amplificador: desligado');
    }

    function toggleLoop() {
        state.loop = !state.loop;
        syncBarControls();
        showHud(state.loop ? 'Repetir: ligado' : 'Repetir: desligado');
    }

    // The player toggles playback on clicks that reach it, and seeks or
    // changes volume on keys.
    function shield(element) {
        for (const type of ['click', 'mousedown', 'pointerdown', 'pointerup', 'dblclick', 'keydown', 'wheel']) {
            element.addEventListener(type, event => event.stopPropagation());
        }
    }

    function closeDials() {
        for (const popover of document.querySelectorAll('#movie_player > .ytc-dial.is-open')) popover.classList.remove('is-open');
    }

    document.addEventListener('pointerdown', event => {
        if (event.target instanceof Element && event.target.closest('.ytc-dial, .ytc-menu-player, .ytc-menu-audio')) return;
        closeDials();
    }, true);

    function barButton(className, label, onClick) {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = `ytp-button ${className}`;
        button.title = label;
        button.setAttribute('aria-label', label);
        shield(button);
        button.addEventListener('click', () => onClick(button));
        return button;
    }

    // Wheel over the speed button nudges it.
    function wheelRate(button) {
        button.addEventListener('wheel', event => {
            event.preventDefault();
            setRate(state.rate + (event.deltaY < 0 ? RATE_STEP : -RATE_STEP));
        }, { passive: false });
    }

    // Loop and boost come from other icon sets and drew ~20% smaller than
    // YouTube's glyphs, by an amount that changes with the player layout. So
    // size each svg until its ink is as big as the volume icon's ink.
    function inkSize(svg) {
        let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
        for (const shape of svg.querySelectorAll('path')) {
            const r = shape.getBoundingClientRect();
            if (!r.width) continue;
            x0 = Math.min(x0, r.left); y0 = Math.min(y0, r.top);
            x1 = Math.max(x1, r.right); y1 = Math.max(y1, r.bottom);
        }
        return x1 > x0 ? Math.max(x1 - x0, y1 - y0) : 0;
    }
    function fitBarIcon(button) {
        const svg = button?.querySelector('svg');
        // The gear is the reference: its ink never changes. The mute icon's
        // does (fewer waves at low volume), which shrank ours with it.
        const host = player();
        const ref = ['.ytp-settings-button svg', '.ytp-fullscreen-button svg', '.ytp-mute-button svg']
            .map(selector => host?.querySelector(selector))
            .find(svg => svg && inkSize(svg));
        const want = ref ? inkSize(ref) : 0;
        if (!svg || !want) return;
        // absolute, from the glyph's own geometry: calling it again never compounds
        // By area, not by the longer side: the wide, short boost glyph
        // (26x18) fitted by its width came out a third shorter than the
        // square gear beside it.
        const box = svg.getBBox(), vb = svg.viewBox.baseVal;
        const perUnit = want / Math.sqrt(box.width * box.height);
        if (!Number.isFinite(perUnit) || !vb?.width) return;
        const w = `${(vb.width * perUnit).toFixed(1)}px`, h = `${(vb.height * perUnit).toFixed(1)}px`;
        if (svg.style.width === w && svg.style.height === h) return;
        svg.style.setProperty('width', w, 'important');
        svg.style.setProperty('height', h, 'important');
    }

    function onBadge() {
        const badge = document.createElement('span');
        badge.className = 'ytc-on-badge';
        badge.textContent = 'ON';
        return badge;
    }

    function syncBarControls() {
        const host = player();
        const left = host?.querySelector('.ytp-left-controls');
        const rightGroup = host?.querySelector('.ytp-right-controls-left') ?? host?.querySelector('.ytp-right-controls');
        if (!left || !rightGroup) return;
        let loop = left.querySelector('.ytc-loop');
        if (!loop) {
            loop = barButton('ytc-bar-circle ytc-loop', 'Repetir (r)', toggleLoop);
            loop.append(icon(ICONS.loop), onBadge());
            left.prepend(loop);
        }
        const volume = left.querySelector('.ytp-volume-area');
        let boost = left.querySelector('.ytc-boost');
        if (!boost && volume) {
            boost = barButton('ytc-bar-circle ytc-boost', 'Amplificador', () => setBoostOn(!state.boostOn));
            boost.append(icon(ICONS.boost, BOOST_ICON), onBadge());
            volume.after(boost);
        }
        let speed = rightGroup.querySelector('.ytc-speed');
        if (!speed) {
            speed = barButton('ytc-speed', 'Velocidade', () => openNativeSubmenu('speed'));
            const badge = document.createElement('span');
            badge.className = 'ytc-speed-badge';
            // The speedometer glyph runs small in its 24px grid; a tighter
            // viewBox brings it to its neighbours' 22x18.
            speed.append(icon(ICONS.speed, { viewBox: '1 1 22 22' }), badge);
            wheelRate(speed);
            rightGroup.prepend(speed);
        }
        // Quality gets a button of its own beside captions.
        const captions = rightGroup.querySelector('.ytp-subtitles-button');
        if (captions && !rightGroup.querySelector('.ytc-quality')) {
            const quality = barButton('ytc-quality', 'Qualidade', () => openNativeSubmenu('quality'));
            const badge = document.createElement('span');
            badge.className = 'ytc-quality-badge';
            quality.append(icon(ICONS.quality), badge);
            captions.after(quality);
        }

        // An ad on loop would never end.
        const video = mainVideo();
        const loopWanted = state.loop && !isAd();
        if (video && video.loop !== loopWanted) video.loop = loopWanted;
        loop.classList.toggle('is-active', state.loop);
        loop.setAttribute('aria-pressed', String(state.loop));
        boost?.classList.toggle('is-active', state.boostOn);
        boost?.setAttribute('aria-pressed', String(state.boostOn));
        if (boost) boost.title = `Amplificador ${state.boostOn ? 'ligado' : 'desligado'}: ${formatBoost(state.boostLevel)} (Shift+↑ / Shift+↓)`;
        // Like YouTube's HD badge: the value shows only when it is not 1x.
        speed.querySelector('.ytc-speed-badge').textContent = state.rate === 1 ? '' : Number(state.rate.toFixed(2)).toString();
        speed.classList.toggle('is-active', state.rate !== 1);
        speed.title = `Velocidade: ${formatRate(state.rate)} (< / >)`;
        const quality = rightGroup.querySelector('.ytc-quality');
        if (quality) {
            let label = '';
            try {
                label = host.getPlaybackQualityLabel?.() ?? '';
            } catch {}
            quality.title = label ? `Qualidade: ${label}` : 'Qualidade';
            // "1080p60 HD" -> "1080", "2160p" -> "4K".
            const height = Number(/^(\d+)p/.exec(label)?.[1] ?? 0);
            quality.querySelector('.ytc-quality-badge').textContent = height >= 4320 ? '8K' : height >= 2160 ? '4K' : height ? String(height) : '';
        }
        fitBarIcon(loop);
        fitBarIcon(boost);

    }

    // The video element outlives each video: put speed, loop and boost back
    // whenever it loads one, and take a speed changed elsewhere (YouTube's
    // own menu or shortcuts) as the new choice.
    // While a new video loads, YouTube puts back the speed it remembers;
    // that is not a choice.
    let loadStartedAt = 0;
    document.addEventListener('loadstart', event => {
        if (event.target === mainVideo()) loadStartedAt = Date.now();
    }, true);
    let audioDefaultsFor = '';

    function applyAudioDefaults() {
        const host = player();
        const videoId = watchFlexy()?.getAttribute('video-id') ?? '';
        if (!host || isAd() || !videoId || videoId === audioDefaultsFor) return;
        audioDefaultsFor = videoId;
        if (state.autoBoost) state.boostOn = true;
        if (state.defaultVolumeOn) {
            try {
                host.setVolume(state.defaultVolume);
            } catch {}
        }
    }

    document.addEventListener('loadedmetadata', event => {
        if (event.target !== mainVideo()) return;
        applyAudioDefaults();
        applyRate();
        event.target.loop = state.loop && !isAd();
        applyBoost();
    }, true);
    document.addEventListener('playing', event => {
        if (event.target === mainVideo()) applyRate();
    }, true);
    document.addEventListener('ratechange', event => {
        const video = event.target;
        if (video !== mainVideo() || isAd() || video.readyState === 0) return;
        if (Date.now() - rateWrite < 500 || Date.now() - loadStartedAt < 3000 || video.playbackRate === state.rate) {
            applyRate();
            return;
        }
        state.rate = clamp(video.playbackRate, RATE_MIN, RATE_MAX);
        setSetting('rate', state.rate);
        syncBarControls();
    }, true);

    // Shortcuts. "<" and ">" are YouTube's own speed keys, which stop at 2x;
    // ours go to 5x. Shift+arrows turn the audio boost on and off (plain
    // arrows stay YouTube's volume), and "r" toggles loop.
    window.addEventListener('keydown', event => {
        if (location.pathname !== '/watch' || event.ctrlKey || event.metaKey || event.altKey) return;
        const target = event.target;
        if (target instanceof Element && target.closest('input, textarea, select, [contenteditable=""], [contenteditable="true"]')) return;
        let handled = true;
        if (event.key === '>') setRate(state.rate + RATE_STEP);
        else if (event.key === '<') setRate(state.rate - RATE_STEP);
        else if (event.shiftKey && event.key === 'ArrowUp') setBoostOn(true);
        else if (event.shiftKey && event.key === 'ArrowDown') setBoostOn(false);
        else if (!event.shiftKey && (event.key === 'r' || event.key === 'R')) toggleLoop();
        // In an advanced playlist's own order, YouTube's next/previous keys
        // follow it.
        else if (event.shiftKey && (event.key === 'N' || event.key === 'P') && plNeighbour(1) !== undefined) stepPlaylist(event.key === 'N' ? 1 : -1);
        else handled = false;
        if (!handled) return;
        event.preventDefault();
        event.stopImmediatePropagation();
    }, true);

    // ---------------------------------------------------------------------
    //  Player settings menu: our options sit at the top of its main panel,
    //  built like YouTube's own items. The menu builds itself on first open
    //  and sizes to its items on each open, so the first time ours arrive
    //  in an open menu, it is resized here.
    // ---------------------------------------------------------------------
    function settingsItem(className, path, label, content, onActivate) {
        const item = document.createElement('div');
        item.className = `ytp-menuitem ${className}`;
        item.tabIndex = 0;
        const iconBox = document.createElement('div');
        iconBox.className = 'ytp-menuitem-icon';
        iconBox.append(icon(path));
        const labelBox = document.createElement('div');
        labelBox.className = 'ytp-menuitem-label';
        labelBox.textContent = label;
        const contentBox = document.createElement('div');
        contentBox.className = 'ytp-menuitem-content';
        contentBox.append(content);
        item.append(iconBox, labelBox, contentBox);
        const activate = event => {
            event.preventDefault();
            event.stopPropagation();
            onActivate();
            syncSettingsMenu();
        };
        item.addEventListener('click', activate);
        item.addEventListener('keydown', event => {
            if (event.key === 'Enter' || event.key === ' ') activate(event);
        });
        return item;
    }

    // YouTube's own entries that now open from their bar buttons, by label.
    const MOVED_ITEMS = {
        speed: /velocidade|speed/i,
        captions: /legenda|subtitle|caption/i,
        quality: /qualidade|quality/i,
    };

    // The main panel is the one whose items open submenus.
    function mainSettingsList() {
        const menu = player()?.querySelector('.ytp-settings-menu');
        return [...(menu?.querySelectorAll('.ytp-panel-menu') ?? [])]
            .find(panelMenu => panelMenu.querySelector(':scope > .ytp-menuitem[aria-haspopup="true"]')) ?? null;
    }

    function nativeItem(list, name) {
        return [...list.children].find(item => item.classList.contains('ytp-menuitem')
            && !item.matches('[class*="ytc-menu-"]')
            && MOVED_ITEMS[name].test(item.querySelector('.ytp-menuitem-label')?.textContent ?? '')) ?? null;
    }

    function syncSettingsMenu() {
        const menu = player()?.querySelector('.ytp-settings-menu');
        const list = mainSettingsList();
        if (!menu || !list) return;
        let changed = false;
        for (const name of Object.keys(MOVED_ITEMS)) {
            const item = nativeItem(list, name);
            if (item && !item.classList.contains('ytc-moved')) {
                item.classList.add('ytc-moved');
                changed = true;
            }
        }
        if (!list.querySelector(':scope > .ytc-menu-player')) {
            const playerItem = settingsItem('ytc-menu-player', ICONS.cinema, 'Player', document.createTextNode(''), () => openCinemaPanel('player'));
            const audioItem = settingsItem('ytc-menu-audio', ICONS.boost, 'Áudio', document.createTextNode(''), () => openCinemaPanel('audio'));
            audioItem.querySelector('.ytp-menuitem-icon').replaceChildren(icon(ICONS.boost, BOOST_ICON));
            for (const item of [playerItem, audioItem]) {
                item.setAttribute('role', 'menuitem');
                item.setAttribute('aria-haspopup', 'true');
            }
            list.prepend(playerItem, audioItem);
            changed = true;
        }
        // The menu sized itself to its items when it opened, with speed,
        // captions and quality still in and ours not yet. Closed and opened
        // again out of sight, it sizes itself as on every later open.
        const host = player();
        const button = host?.querySelector('.ytp-settings-button');
        if (changed && menu.offsetParent && button && !host.classList.contains('ytc-jumping')) {
            host.classList.add('ytc-jumping');
            button.click();
            button.click();
            requestAnimationFrame(() => requestAnimationFrame(() => host.classList.remove('ytc-jumping')));
        }
    }

    // Opens YouTube's settings menu straight on one of its submenus, or
    // closes it when it is already open (the bar button acts as a toggle).
    function openNativeSubmenu(name) {
        const host = player();
        const menu = host?.querySelector('.ytp-settings-menu');
        const button = host?.querySelector('.ytp-settings-button');
        if (!host || !button) return;
        closeDials();
        if (menu?.offsetParent) {
            button.click();
            return;
        }
        host.classList.add('ytc-jumping');
        // Shown again once the submenu stands (its header exists), with
        // transitions back on a frame later so nothing slides into place.
        const reveal = () => requestAnimationFrame(() => requestAnimationFrame(() => host.classList.remove('ytc-jumping')));
        button.click();
        // After the click: the gear's own click handler clears it.
        host.classList.add('ytc-direct');
        let tries = 0;
        const step = () => {
            const list = mainSettingsList();
            const item = list && nativeItem(list, name);
            if (item) {
                item.click();
                const settle = (count = 0) => {
                    if (host.querySelector('.ytp-settings-menu .ytp-panel-header') || count > 10) reveal();
                    else requestAnimationFrame(() => settle(count + 1));
                };
                settle();
                return;
            }
            if (++tries < 20) requestAnimationFrame(step);
            else reveal();
        };
        requestAnimationFrame(step);
    }

    // Turning captions on from their button also opens the language list.
    document.addEventListener('click', event => {
        const button = event.target instanceof Element ? event.target.closest('#movie_player .ytp-subtitles-button') : null;
        if (!button) return;
        setTimeout(() => {
            if (button.getAttribute('aria-pressed') === 'true') openNativeSubmenu('captions');
        }, 150);
    }, true);

    // Our options open in a panel of our own where the settings menu was,
    // like a YouTube submenu (with a way back to it), grouped by topic.
    function openCinemaPanel(name) {
        const host = player();
        const menu = host?.querySelector('.ytp-settings-menu');
        if (!host || !menu) return;
        const hostBox = host.getBoundingClientRect();
        const menuBox = menu.getBoundingClientRect();
        host.querySelector('.ytp-settings-button')?.click(); // closes YouTube's menu
        const panel = cinemaPanel(name);
        closeDials();
        panel.classList.add('is-open');
        const bottom = Math.round(hostBox.bottom - menuBox.bottom);
        panel.style.left = '';
        panel.style.right = `${Math.round(hostBox.right - menuBox.right)}px`;
        panel.style.bottom = `${bottom}px`;
        panel.style.maxHeight = `${Math.round(hostBox.height - bottom - 12)}px`;
        syncCinemaPanel();
    }

    function optionRow(label, control, className = '') {
        // A label only around a switch: around buttons, a click on the text
        // would press the first one.
        const row = document.createElement(control instanceof HTMLInputElement ? 'label' : 'div');
        row.className = `ytc-option ${className}`;
        const text = document.createElement('span');
        text.className = 'ytc-option-label';
        text.textContent = label;
        row.append(text, control);
        return row;
    }

    function switchInput(key, onChange) {
        const input = document.createElement('input');
        input.type = 'checkbox';
        input.className = 'ytc-switch';
        input.dataset.key = key;
        input.addEventListener('change', () => {
            state[key] = input.checked;
            setSetting(key, input.checked);
            onChange?.();
            syncCinemaPanel();
        });
        return input;
    }

    function choiceGroup(key, values, format, onChange) {
        const group = document.createElement('div');
        group.className = 'ytc-choices';
        group.dataset.key = key;
        for (const value of values) {
            const button = document.createElement('button');
            button.type = 'button';
            button.dataset.value = String(value);
            button.textContent = format(value);
            button.addEventListener('click', event => {
                event.preventDefault();
                state[key] = value;
                setSetting(key, value);
                onChange?.();
                syncCinemaPanel();
            });
            group.append(button);
        }
        return group;
    }

    function sectionTitle(text) {
        const title = document.createElement('div');
        title.className = 'ytc-panel-section';
        title.textContent = text;
        return title;
    }

    const PANELS = {
        player: {
            title: 'Player',
            rows: () => [
                sectionTitle('Imagem'),
                optionRow('Cortar faixas pretas', switchInput('cropBars', () => {
                    cropBlackBars();
                    syncLayout();
                })),
                sectionTitle('Layout'),
                optionRow('Abrir chat automaticamente', switchInput('autoChat')),
                optionRow('Largura das laterais', choiceGroup('sideWidth', SIDE_WIDTHS.map(option => option.width),
                    width => SIDE_WIDTHS.find(option => option.width === width).label, syncLayout), 'ytc-stacked'),
            ],
        },
        audio: {
            title: 'Áudio',
            rows: () => {
                const volume = document.createElement('input');
                volume.type = 'range';
                volume.min = '0';
                volume.max = '100';
                volume.step = '1';
                volume.className = 'ytc-volume-range';
                volume.setAttribute('aria-label', 'Volume padrão');
                const volumeValue = document.createElement('span');
                volumeValue.className = 'ytc-volume-value';
                volume.addEventListener('input', () => {
                    state.defaultVolume = Number(volume.value);
                    setSetting('defaultVolume', state.defaultVolume);
                    volumeValue.textContent = volume.value;
                });
                const volumeBox = document.createElement('span');
                volumeBox.className = 'ytc-volume-box';
                volumeBox.append(volume, volumeValue);
                const volumeRow = document.createElement('div');
                volumeRow.className = 'ytc-option ytc-sub';
                volumeRow.append(volumeBox);
                return [
                    sectionTitle('Amplificador'),
                    optionRow('Nível', choiceGroup('boostLevel', BOOST_LEVELS, formatBoost, () => {
                        applyBoost();
                        syncBarControls();
                    }), 'ytc-stacked'),
                    optionRow('Amplificar automaticamente', switchInput('autoBoost')),
                    sectionTitle('Volume'),
                    optionRow('Volume padrão', switchInput('defaultVolumeOn')),
                    volumeRow,
                    optionRow('Volume na roda do mouse sobre o player', switchInput('wheelVolume')),
                    optionRow('Só com o botão direito pressionado', switchInput('wheelRightOnly'), 'ytc-sub ytc-wheel-sub'),
                    optionRow('Variação por giro', choiceGroup('wheelStep', WHEEL_STEPS, String), 'ytc-sub ytc-wheel-sub'),
                ];
            },
        },
    };

    function cinemaPanel(name) {
        const host = player();
        let panel = host.querySelector(`:scope > .ytc-cinema-panel[data-panel="${name}"]`);
        if (panel) return panel;
        const spec = PANELS[name];
        panel = document.createElement('div');
        panel.className = 'ytc-dial ytc-cinema-panel';
        panel.dataset.panel = name;
        const back = document.createElement('button');
        back.type = 'button';
        back.className = 'ytc-panel-back';
        back.append(icon('M15.41,16.58L10.83,12L15.41,7.41L14,6L8,12L14,18L15.41,16.58Z'), document.createTextNode(spec.title));
        back.addEventListener('click', () => {
            closeDials();
            host.querySelector('.ytp-settings-button')?.click();
        });
        panel.append(back, ...spec.rows());
        shield(panel);
        host.append(panel);
        return panel;
    }

    function syncCinemaPanel() {
        for (const panel of player()?.querySelectorAll(':scope > .ytc-cinema-panel') ?? []) {
            for (const input of panel.querySelectorAll('.ytc-switch')) input.checked = Boolean(state[input.dataset.key]);
            for (const group of panel.querySelectorAll('.ytc-choices')) {
                for (const button of group.children) button.classList.toggle('is-active', Number(button.dataset.value) === state[group.dataset.key]);
            }
            const range = panel.querySelector('.ytc-volume-range');
            if (range) {
                if (document.activeElement !== range) range.value = String(state.defaultVolume);
                panel.querySelector('.ytc-volume-value').textContent = String(state.defaultVolume);
                range.disabled = !state.defaultVolumeOn;
            }
            for (const row of panel.querySelectorAll('.ytc-wheel-sub')) row.classList.toggle('is-disabled', !state.wheelVolume);
        }
    }

    // Volume on the mouse wheel over the player, optionally only while the
    // right button is held (then the context menu that would follow is
    // swallowed). Popups keep their own scrolling.
    let rightHeld = false;
    let wheelUsedWhileHeld = false;
    document.addEventListener('pointerdown', event => {
        if (event.button === 2) {
            rightHeld = true;
            wheelUsedWhileHeld = false;
        }
    }, true);
    document.addEventListener('pointerup', event => {
        if (event.button === 2) rightHeld = false;
    }, true);
    document.addEventListener('contextmenu', event => {
        if (!wheelUsedWhileHeld) return;
        wheelUsedWhileHeld = false;
        event.preventDefault();
        event.stopImmediatePropagation();
    }, true);
    document.addEventListener('wheel', event => {
        if (!state.wheelVolume || (state.wheelRightOnly && !rightHeld)) return;
        const host = player();
        const target = event.target;
        if (!host || !(target instanceof Element) || !host.contains(target)) return;
        if (target.closest('.ytp-popup, .ytc-dial, .ytc-speed')) return;
        event.preventDefault();
        if (rightHeld) wheelUsedWhileHeld = true;
        try {
            const volume = Math.min(100, Math.max(0, host.getVolume() + (event.deltaY < 0 ? state.wheelStep : -state.wheelStep)));
            if (host.isMuted() && volume > 0) host.unMute();
            host.setVolume(volume);
            showHud(`Volume ${Math.round(volume)}%`);
        } catch {}
    }, { capture: true, passive: false });

    document.addEventListener('click', event => {
        if (event.target instanceof Element && event.target.closest('#movie_player .ytp-settings-button')) {
            // Opened from the gear itself: back to YouTube's own menu.
            player()?.classList.remove('ytc-direct');
            requestAnimationFrame(syncSettingsMenu);
        }
    }, true);

    // Docked, the playlist panel cannot be collapsed: a click on its
    // header (outside its buttons and links) stops here.
    document.addEventListener('click', event => {
        if (!document.documentElement.classList.contains('ytc-side-tabs') || !(event.target instanceof Element)) return;
        const header = event.target.closest('#secondary ytd-playlist-panel-renderer#playlist .header');
        if (!header || event.target.closest('a, button, yt-icon-button, ytd-menu-renderer, tp-yt-paper-item, .ytc-pl-toggle')) return;
        event.stopPropagation();
        event.preventDefault();
    }, true);

    // ---------------------------------------------------------------------
    //  Playlist panel open on every video: YouTube sometimes brings it in
    //  collapsed. Done once per video, so collapsing it by hand sticks.
    // ---------------------------------------------------------------------
    let expandedFor = '';

    function expandPlaylist() {
        const videoId = watchFlexy()?.getAttribute('video-id') ?? '';
        if (!videoId || expandedFor === videoId) return;
        const panel = document.querySelector('ytd-watch-flexy ytd-playlist-panel-renderer#playlist');
        if (!panel?.querySelector('ytd-playlist-panel-video-renderer')) return;
        if (panel.hasAttribute('collapsed')) panel.collapsed = false;
        expandedFor = videoId;
    }

    // ---------------------------------------------------------------------
    //  Advanced playlist, switched on per playlist from its panel header.
    //  The panel only knows title, channel and length, so the whole list
    //  is read from its /playlist page (100 a page, then the browse API's
    //  continuations) for date, views, progress and, in a shared playlist,
    //  who added each video. Our list then stands in for YouTube's items,
    //  and its order and filters are the playback order too: right before
    //  a video ends it is paused and our next one opened, ahead of
    //  YouTube's own advance; an advance that slips through (a background
    //  tab, YouTube's own keys) is redirected.
    // ---------------------------------------------------------------------
    const PL_ICON = 'M19,9H2V11H19V9M19,5H2V7H19V5M2,15H15V13H2V15M17,13V19L22,16L17,13Z';
    const PL_ICONS = {
        search: 'M15.5 14h-.79l-.28-.27A6.47 6.47 0 0 0 16 9.5 6.5 6.5 0 1 0 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z',
        sort: 'M3 18h6v-2H3v2zM3 6v2h18V6H3zm0 7h12v-2H3v2z',
        chevron: 'M7 10l5 5 5-5z',
        unseen: 'M12 7c2.76 0 5 2.24 5 5 0 .65-.13 1.26-.36 1.83l2.92 2.92c1.51-1.26 2.7-2.89 3.43-4.75-1.73-4.39-6-7.5-11-7.5-1.4 0-2.74.25-3.98.7l2.16 2.16C10.74 7.13 11.35 7 12 7zM2 4.27l2.28 2.28.46.46A11.8 11.8 0 0 0 1 12c1.73 4.39 6 7.5 11 7.5 1.55 0 3.03-.3 4.38-.84l.42.42L19.73 22 21 20.73 3.27 3 2 4.27zM7.53 9.8l1.55 1.55c-.05.21-.08.43-.08.65 0 1.66 1.34 3 3 3 .22 0 .44-.03.65-.08l1.55 1.55c-.67.33-1.41.53-2.2.53-2.76 0-5-2.24-5-5 0-.79.2-1.53.53-2.2zm4.31-.78l3.15 3.15.02-.16c0-1.66-1.34-3-3-3l-.17.01z',
        reload: 'M17.65 6.35A7.96 7.96 0 0 0 12 4c-4.42 0-7.99 3.58-7.99 8s3.57 8 7.99 8c3.73 0 6.84-2.55 7.73-6h-2.08A5.99 5.99 0 0 1 12 18c-3.31 0-6-2.69-6-6s2.69-6 6-6c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35z',
    };
    const PL_SORTS = [
        { id: 'original', label: 'Ordem da playlist' },
        { id: 'newest', label: 'Mais recentes' },
        { id: 'oldest', label: 'Mais antigos' },
        { id: 'shortest', label: 'Mais curtos' },
        { id: 'longest', label: 'Mais longos' },
        { id: 'views', label: 'Mais vistos' },
        { id: 'channel', label: 'Canal (A–Z)' },
    ];
    const PL_MAX_PAGES = 100;
    // Watched this far (YouTube's red bar), a video counts as seen.
    const PL_SEEN_PERCENT = 90;
    // How close to the end a video hands over to our next one.
    const PL_HANDOVER_S = 0.4;
    // Relative dates ("há 2 anos") in seconds, Portuguese and English.
    const PL_AGE_UNITS = [
        [/^(seg|sec)/, 1],
        [/^min/, 60],
        [/^(hora|hour)/, 3600],
        [/^(dia|day)/, 86400],
        [/^(semana|week)/, 604800],
        [/^(m[eê]s|meses|month)/, 2629800],
        [/^(ano|year)/, 31557600],
    ];

    const plStore = getSetting('playlistAdvanced', {}) || {};
    const plCache = new Map();
    const plRows = new WeakMap();
    const pl = { list: '', query: '', signature: '', view: [], lastVideo: '', lastItem: null, ownNav: '', scrolledTo: '' };

    function savePlPrefs(list, prefs) {
        if (prefs) plStore[list] = prefs;
        else delete plStore[list];
        setSetting('playlistAdvanced', plStore);
    }

    const plNormalize = text => String(text ?? '').normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
    const plAvatarKey = url => String(url ?? '').replace(/=s\d+.*$/, '');

    function plAge(text) {
        const match = /(\d+)\s*([a-zà-ú]+)/i.exec(text ?? '');
        const unit = match && PL_AGE_UNITS.find(([pattern]) => pattern.test(match[2].toLowerCase()));
        return unit ? Number(match[1]) * unit[1] : null;
    }

    // "546 mil", "1,2 mi", "1.2M views", "987 visualizações".
    function plCount(text) {
        const match = /([\d.,]+)\s*(bi|mil|mi|k|m|b)?\b/i.exec(text ?? '');
        if (!match) return null;
        const scale = { k: 1e3, mil: 1e3, m: 1e6, mi: 1e6, b: 1e9, bi: 1e9 }[(match[2] ?? '').toLowerCase()] ?? 1;
        const number = Number(scale > 1 ? match[1].replace(',', '.') : match[1].replace(/[.,]/g, ''));
        return Number.isFinite(number) ? number * scale : null;
    }

    function plLength(text) {
        const parts = String(text ?? '').split(':').map(Number);
        if (parts.length < 2 || parts.some(part => !Number.isFinite(part))) return null;
        return parts.reduce((total, part) => total * 60 + part, 0);
    }

    // The metadata after the channel: views and a relative date, in either
    // order, either missing (an upcoming premiere has no views).
    function plEntry(item, parts) {
        const ageText = parts.find(part => plAge(part) !== null) ?? '';
        const viewsText = parts.find(part => part !== ageText && plCount(part) !== null) ?? '';
        return {
            ...item,
            ageText,
            age: plAge(ageText),
            viewsText,
            views: plCount(viewsText),
            search: plNormalize(`${item.title} ${item.channel}`),
        };
    }

    function plVideo(video, position) {
        const overlays = video.thumbnailOverlays ?? [];
        const resume = overlays.find(overlay => overlay.thumbnailOverlayResumePlaybackRenderer)?.thumbnailOverlayResumePlaybackRenderer;
        const avatar = overlays.find(overlay => overlay.thumbnailOverlayAvatarStackViewModel)?.thumbnailOverlayAvatarStackViewModel
            ?.avatarStack?.avatarStackViewModel?.avatars?.[0]?.avatarViewModel?.image?.sources?.[0]?.url ?? '';
        const number = Number(ytText(video.index));
        const parts = (video.videoInfo?.runs ?? []).map(run => run.text.trim()).filter(text => text && text !== '•');
        return plEntry({
            videoId: video.videoId,
            index: number > 0 ? number - 1 : position,
            title: ytText(video.title),
            channel: ytText(video.shortBylineText),
            seconds: Number(video.lengthSeconds) || null,
            length: ytText(video.lengthText),
            watched: Number(resume?.percentDurationWatched) || 0,
            avatar,
            by: plAvatarKey(avatar),
            playable: video.isPlayable !== false,
        }, parts);
    }

    // The newer card format, which some playlists (YouTube's own) use.
    function plLockup(lockup, position) {
        if (!lockup.contentId || (lockup.contentType && lockup.contentType !== 'LOCKUP_CONTENT_TYPE_VIDEO')) return null;
        const meta = lockup.metadata?.lockupMetadataViewModel;
        const rows = meta?.metadata?.contentMetadataViewModel?.metadataRows ?? [];
        const parts = rows.flatMap(row => (row.metadataParts ?? []).map(part => ytText(part.text).trim()).filter(Boolean));
        const badge = findNode(lockup.contentImage, 'thumbnailBadgeViewModel')?.text;
        const length = typeof badge === 'string' ? badge : ytText(badge);
        const progress = findNode(lockup.contentImage, 'thumbnailOverlayProgressBarViewModel');
        return plEntry({
            videoId: lockup.contentId,
            index: position,
            title: ytText(meta?.title),
            channel: parts[0] ?? '',
            seconds: plLength(length),
            length,
            watched: Number(progress?.startPercent) || 0,
            avatar: '',
            by: '',
            playable: true,
        }, parts.slice(1));
    }

    // Adds the videos under a node to the list and returns the token of
    // the next page, if any: the first one, the list's own; the page's
    // sections carry another that answers nothing.
    function plCollect(node, items, depth = 0) {
        if (!node || typeof node !== 'object' || depth > 40) return null;
        if (node.playlistVideoRenderer) {
            if (node.playlistVideoRenderer.videoId) items.push(plVideo(node.playlistVideoRenderer, items.length));
            return null;
        }
        if (node.lockupViewModel) {
            const item = plLockup(node.lockupViewModel, items.length);
            if (item) items.push(item);
            return null;
        }
        if (node.continuationItemRenderer) return findNode(node.continuationItemRenderer, 'continuationCommand')?.token ?? null;
        let token = null;
        for (const value of Object.values(node)) {
            const found = plCollect(value, items, depth + 1);
            token ??= found;
        }
        return token;
    }

    // The JSON object right after a marker in a page's source.
    function jsonAfter(text, marker) {
        const from = text.indexOf(marker);
        if (from < 0) return null;
        const start = from + marker.length;
        let depth = 0;
        let quoted = false;
        let escaped = false;
        for (let i = start; i < text.length; i++) {
            const char = text[i];
            if (quoted) {
                if (escaped) escaped = false;
                else if (char === '\\') escaped = true;
                else if (char === '"') quoted = false;
            } else if (char === '"') quoted = true;
            else if (char === '{') depth++;
            else if (char === '}' && --depth === 0) {
                try {
                    return JSON.parse(text.slice(start, i + 1));
                } catch {
                    return null;
                }
            }
        }
        return null;
    }

    // Signed in, the browse API answers as the account (progress bars,
    // private playlists) only with the hash YouTube's own requests carry.
    async function plAuthHeaders() {
        const sid = /(?:^|;\s*)(?:SAPISID|__Secure-3PAPISID)=([^;]+)/.exec(document.cookie)?.[1];
        if (!sid || !crypto.subtle) return {};
        const time = Math.floor(Date.now() / 1000);
        const digest = await crypto.subtle.digest('SHA-1', new TextEncoder().encode(`${time} ${sid} ${location.origin}`));
        const hash = [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('');
        return { authorization: `SAPISIDHASH ${time}_${hash}`, 'x-origin': location.origin, 'x-goog-authuser': '0' };
    }

    // A list read before comes back from storage at once, kept a few
    // days for the last few playlists; a few minutes old, it is read again
    // behind the scenes and swapped in once whole.
    const PL_CACHE_LISTS = 5;
    const PL_CACHE_KEEP_MS = 3 * 86400000;
    const PL_CACHE_FRESH_MS = 10 * 60000;

    function storedPlaylist(list) {
        const saved = (getSetting('playlistCache', {}) || {})[list];
        if (!saved?.items || Date.now() - saved.at > PL_CACHE_KEEP_MS) return null;
        const items = saved.items.map(item => ({ ...item, search: plNormalize(`${item.title} ${item.channel}`) }));
        return { items, total: saved.total, owner: saved.owner, loading: false, refreshing: false, error: '', version: 0, at: saved.at };
    }

    function storePlaylist(list, entry) {
        const { [list]: _, ...others } = getSetting('playlistCache', {}) || {};
        const saved = { at: Date.now(), total: entry.total, owner: entry.owner, items: entry.items.map(({ search, ...item }) => item) };
        const kept = Object.entries(others).sort((a, b) => b[1].at - a[1].at).slice(0, PL_CACHE_LISTS - 1);
        setSetting('playlistCache', Object.fromEntries([[list, saved], ...kept]));
    }

    function openPlaylist(list) {
        const stored = storedPlaylist(list);
        if (!stored) {
            loadPlaylist(list);
            return;
        }
        plCache.set(list, stored);
        if (Date.now() - stored.at > PL_CACHE_FRESH_MS) loadPlaylist(list, stored);
    }

    // Reads the whole list. Into a new entry it fills in page by page; into
    // one already on screen (a stored copy) it swaps in only when complete,
    // and a failure leaves that copy as it was.
    async function loadPlaylist(list, shown = null) {
        const entry = shown ?? { items: [], total: 0, owner: '', loading: true, refreshing: false, error: '', version: 0 };
        if (!shown) plCache.set(list, entry);
        const items = shown ? [] : entry.items;
        const alive = () => plCache.get(list) === entry;
        const changed = () => {
            entry.version++;
            if (alive() && pl.list === list) syncPlaylistAdvanced();
        };
        if (shown) {
            entry.refreshing = true;
            changed();
        }
        try {
            const response = await fetch(`/playlist?list=${encodeURIComponent(list)}`, { credentials: 'include' });
            const html = await response.text();
            const data = parseInitialData(html);
            if (!data) throw new Error('playlist page');
            const header = JSON.stringify(data.header ?? {});
            const total = plCount(/"(\d[\d.,]*) (?:vídeos?|videos?)"/.exec(header)?.[1]) ?? 0;
            const owner = /"(?:por|by) ([^"]+?)(?: (?:e|and) \d+ [^"]*)?"/.exec(header)?.[1] ?? '';
            if (!shown) Object.assign(entry, { total, owner });
            let token = plCollect(data.contents, items);
            const context = jsonAfter(html, '"INNERTUBE_CONTEXT":');
            const key = /"INNERTUBE_API_KEY":"([^"]+)"/.exec(html)?.[1];
            if (!shown) changed();
            for (let page = 0; token && context && page < PL_MAX_PAGES && alive(); page++) {
                const next = await fetch(`/youtubei/v1/browse?prettyPrint=false${key ? `&key=${key}` : ''}`, {
                    method: 'POST',
                    credentials: 'include',
                    headers: { 'content-type': 'application/json', ...(await plAuthHeaders()) },
                    body: JSON.stringify({ context, continuation: token }),
                });
                if (!next.ok) throw new Error(`browse ${next.status}`);
                token = plCollect((await next.json()).onResponseReceivedActions, items);
                if (!shown) changed();
            }
            if (token) throw new Error('unfinished');
            if (!alive()) return;
            if (shown) Object.assign(entry, { items, total, owner });
            storePlaylist(list, entry);
        } catch {
            if (!shown) entry.error = 'Não deu para carregar a playlist inteira.';
        }
        entry.loading = false;
        entry.refreshing = false;
        changed();
    }

    function plCurrentIn(entry) {
        const params = new URL(location.href).searchParams;
        const id = params.get('v');
        const index = Number(params.get('index')) - 1;
        return entry.items.find(item => item.videoId === id && item.index === index) ?? entry.items.find(item => item.videoId === id) ?? null;
    }

    const plCustom = prefs => Boolean(prefs && (prefs.sort !== 'original' || prefs.hideWatched || prefs.by || pl.query));

    const PL_COMPARE = {
        newest: (a, b) => (a.age ?? Infinity) - (b.age ?? Infinity),
        oldest: (a, b) => (b.age ?? -Infinity) - (a.age ?? -Infinity),
        shortest: (a, b) => (a.seconds ?? Infinity) - (b.seconds ?? Infinity),
        longest: (a, b) => (b.seconds ?? -Infinity) - (a.seconds ?? -Infinity),
        views: (a, b) => (b.views ?? -1) - (a.views ?? -1),
        channel: (a, b) => a.channel.localeCompare(b.channel, 'pt', { sensitivity: 'base' }),
    };

    // The list as shown, which is the playback order too. The video on
    // screen always stays in it, so "next" has a place to start from.
    function plOrder(entry, prefs, keep) {
        const query = plNormalize(pl.query.trim());
        const items = entry.items.filter(item => item === keep || (
            (!prefs.hideWatched || item.watched < PL_SEEN_PERCENT)
            && (!prefs.by || item.by === prefs.by)
            && (!query || item.search.includes(query))
        ));
        const compare = PL_COMPARE[prefs.sort];
        // Ties (dates come as "há 2 anos") keep the playlist's order, read
        // backwards for "newest": what was added later is likely newer.
        const tie = prefs.sort === 'newest' ? (a, b) => b.index - a.index : (a, b) => a.index - b.index;
        if (compare) items.sort((a, b) => compare(a, b) || tie(a, b));
        return items;
    }

    function plContext() {
        const list = playlistParams()?.list;
        const prefs = list && plStore[list];
        const entry = prefs && plCache.get(list);
        if (!entry) return null;
        const current = plCurrentIn(entry);
        return { list, prefs, entry, current, custom: plCustom(prefs) };
    }

    // The neighbour of the video on screen in our order: an item, null
    // past either end, or undefined when our order is not in charge.
    function plNeighbour(step) {
        const context = plContext();
        if (!context?.custom || !context.current) return undefined;
        const order = plOrder(context.entry, context.prefs, context.current);
        const at = order.indexOf(context.current);
        return order[at + step] ?? null;
    }

    function plWatch(item, list = pl.list) {
        pl.ownNav = item.videoId;
        const url = `/watch?v=${item.videoId}&list=${encodeURIComponent(list)}&index=${item.index + 1}`;
        // YouTube's own (hidden) item when it has one, else its router.
        const anchors = [...document.querySelectorAll('ytd-playlist-panel-renderer#playlist #items a#wc-endpoint')]
            .filter(anchor => new URL(anchor.href, location.origin).searchParams.get('v') === item.videoId);
        const anchor = anchors.find(link => new URL(link.href, location.origin).searchParams.get('index') === String(item.index + 1)) ?? anchors[0];
        if (anchor) anchor.click();
        else {
            document.querySelector('ytd-app')?.dispatchEvent(new CustomEvent('yt-navigate', {
                bubbles: true,
                composed: true,
                detail: {
                    endpoint: {
                        commandMetadata: { webCommandMetadata: { url, webPageType: 'WEB_PAGE_TYPE_WATCH', rootVe: 3832 } },
                        watchEndpoint: { videoId: item.videoId, playlistId: list, index: item.index },
                    },
                },
            }));
        }
        setTimeout(() => {
            if (pl.ownNav === item.videoId && new URL(location.href).searchParams.get('v') !== item.videoId) location.assign(url);
        }, 4000);
    }

    function onPlaylistTime(event) {
        const video = event.target;
        if (state.loop || video.paused || !video.duration || video.duration - video.currentTime > PL_HANDOVER_S) return;
        if (player()?.classList.contains('ad-showing')) return;
        const context = plContext();
        if (!context?.custom || !context.current) return;
        context.current.watched = 100;
        const next = plNeighbour(1);
        // YouTube is going there anyway.
        if (next && next.index === context.current.index + 1) return;
        video.pause();
        if (next) plWatch(next, context.list);
    }

    // YouTube moved one step ahead in its own order while ours is in
    // charge: go where ours says instead.
    function redirectPlaylistAdvance(context) {
        const id = context.current?.videoId ?? '';
        if (id === pl.lastVideo) return;
        const previous = pl.lastItem;
        pl.lastVideo = id;
        pl.lastItem = context.current;
        if (pl.ownNav === id) {
            pl.ownNav = '';
            return;
        }
        if (!context.custom || !previous || !context.current || context.current.index !== previous.index + 1) return;
        const order = plOrder(context.entry, context.prefs, previous);
        const at = order.indexOf(previous);
        const next = at < 0 ? null : order[at + 1];
        if (next && next !== context.current) plWatch(next, context.list);
    }

    function plMake(tag, className, text) {
        const element = document.createElement(tag);
        if (className) element.className = className;
        if (text) element.textContent = text;
        return element;
    }

    function plRow(item, list) {
        const row = plMake('a', 'ytc-pl-row');
        row.href = `/watch?v=${item.videoId}&list=${encodeURIComponent(list)}&index=${item.index + 1}`;
        row.dataset.index = String(item.index);
        row.classList.toggle('is-unplayable', !item.playable);
        row.addEventListener('click', event => {
            if (event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey) return;
            event.preventDefault();
            plWatch(item, list);
        });
        const thumb = plMake('div', 'ytc-pl-thumb');
        if (item.playable) {
            const image = plMake('img');
            image.loading = 'lazy';
            image.alt = '';
            image.src = `https://i.ytimg.com/vi/${item.videoId}/mqdefault.jpg`;
            thumb.append(image);
        }
        if (item.length) thumb.append(plMake('span', 'ytc-pl-time', item.length));
        if (item.watched > 0) {
            const bar = plMake('div', 'ytc-pl-progress');
            const fill = plMake('i');
            fill.style.width = `${Math.min(100, item.watched)}%`;
            bar.append(fill);
            thumb.append(bar);
        }
        const text = plMake('div', 'ytc-pl-text');
        const title = plMake('div', 'ytc-pl-title', item.title);
        title.title = item.title;
        const meta = plMake('div', 'ytc-pl-meta');
        if (item.avatar) {
            const avatar = plMake('img');
            avatar.src = item.avatar;
            avatar.alt = '';
            avatar.title = 'Adicionado por esta pessoa';
            meta.append(avatar);
        }
        meta.append(plMake('span', '', [item.channel, item.viewsText, item.ageText].filter(Boolean).join(' • ')));
        text.append(title, meta);
        row.append(plMake('div', 'ytc-pl-index', String(item.index + 1)), thumb, text);
        return row;
    }

    // Who added how many, in a shared playlist (more than one face).
    function plContributors(entry) {
        const people = new Map();
        for (const item of entry.items) {
            if (!item.by) continue;
            const person = people.get(item.by) ?? { by: item.by, avatar: item.avatar, count: 0 };
            person.count++;
            people.set(item.by, person);
        }
        return people.size > 1 ? [...people.values()].sort((a, b) => b.count - a.count) : [];
    }

    function buildPlBar(root, list) {
        const bar = plMake('div', 'ytc-pl-bar');
        const search = plMake('input', 'ytc-pl-search');
        search.type = 'search';
        search.placeholder = 'Buscar na playlist';
        search.setAttribute('aria-label', 'Buscar na playlist');
        search.value = pl.query;
        search.addEventListener('input', () => {
            pl.query = search.value;
            syncPlaylistAdvanced();
        });
        // YouTube's shortcuts stay out of the box.
        search.addEventListener('keydown', event => event.stopPropagation());
        const sort = plMake('select', 'ytc-pl-sort');
        sort.title = 'Ordenar';
        sort.setAttribute('aria-label', 'Ordenar');
        for (const option of PL_SORTS) sort.append(new Option(option.label, option.id));
        sort.addEventListener('change', () => {
            savePlPrefs(list, { ...plStore[list], sort: sort.value });
            syncPlaylistAdvanced();
        });
        const seen = plMake('button', 'ytc-pl-chip ytc-pl-seen');
        seen.type = 'button';
        seen.title = `Esconder os vídeos já vistos (${PL_SEEN_PERCENT}% ou mais)`;
        seen.append(icon(PL_ICONS.unseen), plMake('span', '', 'Ocultar vistos'));
        seen.addEventListener('click', () => {
            savePlPrefs(list, { ...plStore[list], hideWatched: !plStore[list]?.hideWatched });
            syncPlaylistAdvanced();
        });
        const people = plMake('div', 'ytc-pl-line ytc-pl-people');
        const status = plMake('div', 'ytc-pl-status');
        // The icons are decoration over the real controls: the field and
        // the select keep their own focus and keyboard handling.
        const searchBox = plMake('label', 'ytc-pl-searchbox');
        searchBox.append(icon(PL_ICONS.search), search);
        const sortBox = plMake('label', 'ytc-pl-sortbox');
        sortBox.append(icon(PL_ICONS.sort), sort, icon(PL_ICONS.chevron));
        const searchLine = plMake('div', 'ytc-pl-line');
        searchLine.append(searchBox);
        const sortLine = plMake('div', 'ytc-pl-line');
        sortLine.append(sortBox, seen);
        bar.append(searchLine, sortLine, people, status);
        root.append(bar, plMake('div', 'ytc-pl-items'));
    }

    function syncPlBar(root, list, entry, prefs, shown) {
        const sort = root.querySelector('.ytc-pl-sort');
        if (sort.value !== prefs.sort) sort.value = prefs.sort;
        const seen = root.querySelector('.ytc-pl-seen');
        seen.classList.toggle('is-on', Boolean(prefs.hideWatched));
        seen.setAttribute('aria-pressed', String(Boolean(prefs.hideWatched)));
        const people = root.querySelector('.ytc-pl-people');
        const contributors = plContributors(entry);
        people.hidden = !contributors.length;
        people.replaceChildren();
        if (contributors.length) {
            const all = plMake('button', `ytc-pl-chip${prefs.by ? '' : ' is-on'}`, 'Todos');
            all.type = 'button';
            all.setAttribute('aria-pressed', String(!prefs.by));
            all.addEventListener('click', () => {
                savePlPrefs(list, { ...plStore[list], by: '' });
                syncPlaylistAdvanced();
            });
            people.append(all);
            contributors.forEach((person, rank) => {
                const chip = plMake('button', `ytc-pl-chip is-avatar${prefs.by === person.by ? ' is-on' : ''}`);
                chip.type = 'button';
                chip.setAttribute('aria-pressed', String(prefs.by === person.by));
                // The header names only the owner, who added the most.
                chip.title = rank === 0 && entry.owner ? `Adicionados por ${entry.owner}` : 'Adicionados por esta pessoa';
                const face = plMake('img');
                face.src = person.avatar;
                face.alt = '';
                chip.append(face, document.createTextNode(String(person.count)));
                chip.addEventListener('click', () => {
                    savePlPrefs(list, { ...plStore[list], by: prefs.by === person.by ? '' : person.by });
                    syncPlaylistAdvanced();
                });
                people.append(chip);
            });
        }
        const status = root.querySelector('.ytc-pl-status');
        const total = Math.max(entry.total, entry.items.length);
        const parts = [shown === entry.items.length ? `${entry.items.length} vídeos` : `Mostrando ${shown} de ${entry.items.length}`];
        if (entry.loading) parts.push(`carregando ${entry.items.length} de ${total || '…'}`);
        if (entry.refreshing) parts.push('atualizando…');
        if (entry.error) parts.push(entry.error);
        status.replaceChildren(plMake('span', '', parts.join(' · ')));
        if (!entry.loading && !entry.refreshing) {
            const reload = plMake('button');
            reload.type = 'button';
            reload.title = 'Ler a playlist de novo';
            reload.append(icon(PL_ICONS.reload), plMake('span', '', 'Recarregar'));
            reload.addEventListener('click', () => loadPlaylist(list));
            status.append(reload);
        }
    }

    function syncPlToggle(panel, list, on) {
        let toggle = panel.querySelector('.ytc-pl-toggle');
        if (!toggle) {
            const host = panel.querySelector('#playlist-actions') ?? panel.querySelector('.header, #header-contents');
            if (!host) return;
            toggle = plMake('button', 'ytc-pl-toggle');
            toggle.type = 'button';
            toggle.append(icon(PL_ICON), plMake('span', '', 'Avançado'));
            toggle.addEventListener('click', event => {
                event.stopPropagation();
                const current = playlistParams()?.list;
                if (!current) return;
                savePlPrefs(current, plStore[current] ? null : { sort: 'original', hideWatched: false, by: '' });
                pl.signature = '';
                syncPlaylistAdvanced();
            });
            host.append(toggle);
        }
        toggle.classList.toggle('is-on', on);
        toggle.title = on ? 'Voltar à lista do YouTube' : 'Busca, ordem e filtros nesta playlist';
    }

    function syncPlaylistAdvanced() {
        const list = playlistParams()?.list ?? '';
        const panel = document.querySelector('ytd-watch-flexy ytd-playlist-panel-renderer#playlist');
        // Mixes never end, so they have no whole list to read.
        const usable = Boolean(list && panel && !list.startsWith('RD'));
        const prefs = usable ? plStore[list] : null;
        if (list !== pl.list) {
            pl.list = list;
            pl.query = '';
            pl.signature = '';
            pl.lastVideo = '';
            pl.lastItem = null;
        }
        if (usable) syncPlToggle(panel, list, Boolean(prefs));
        panel?.classList.toggle('ytc-pl-on', Boolean(prefs));
        let root = panel?.querySelector('.ytc-pl');
        if (!prefs) {
            root?.remove();
            return;
        }
        if (!plCache.has(list)) openPlaylist(list);
        const entry = plCache.get(list);
        const items = panel.querySelector('#items');
        if (!root && items) {
            root = plMake('div', 'ytc-pl');
            buildPlBar(root, list);
            items.before(root);
            pl.signature = '';
        }
        if (!root) return;
        const context = plContext();
        if (context) redirectPlaylistAdvance(context);
        const current = context?.current ?? null;
        const video = player()?.querySelector('video');
        if (video && !video.ytcPlaylistHook) {
            video.ytcPlaylistHook = true;
            video.addEventListener('timeupdate', onPlaylistTime);
        }
        const signature = [list, entry.version, prefs.sort, prefs.hideWatched, prefs.by, pl.query, current?.index].join('|');
        if (signature === pl.signature) return;
        pl.signature = signature;
        const order = plOrder(entry, prefs, current);
        syncPlBar(root, list, entry, prefs, order.length);
        const box = root.querySelector('.ytc-pl-items');
        // Rows are built once per item and only reordered after that, so a
        // long playlist costs little on every new video or filter.
        box.replaceChildren(...order.map(item => {
            let row = plRows.get(item);
            if (!row) {
                row = plRow(item, list);
                plRows.set(item, row);
            }
            return row;
        }));
        if (!order.length && !entry.loading) box.append(plMake('div', 'ytc-pl-empty', 'Nenhum vídeo com esses filtros.'));
        for (const lit of box.querySelectorAll('.ytc-pl-row.is-current')) lit.classList.remove('is-current');
        const row = current && box.querySelector(`.ytc-pl-row[data-index="${current.index}"]`);
        row?.classList.add('is-current');
        if (row && pl.scrolledTo !== `${list}:${current.index}`) {
            pl.scrolledTo = `${list}:${current.index}`;
            scrollPlRow(row);
        }
    }

    // Brings a row to the top of the panel's own scroller (below the
    // advanced toolbar stuck there), leaving the page where it is; near
    // the end of the list the scroller stops short of it.
    function scrollPlRow(row) {
        let scroller = row.parentElement;
        while (scroller && scroller !== document.body && !/(auto|scroll)/.test(getComputedStyle(scroller).overflowY)) scroller = scroller.parentElement;
        if (!scroller || scroller === document.body) return;
        const bar = scroller.querySelector('.ytc-pl-bar');
        const covered = bar && getComputedStyle(bar).position === 'sticky' ? bar.offsetHeight : 0;
        const offset = row.getBoundingClientRect().top - scroller.getBoundingClientRect().top;
        scroller.scrollTop += offset - covered - 4;
    }

    // ---------------------------------------------------------------------
    //  Global settings: page classes for "hide shorts", info cards, video
    //  filters and playback quality, edited in a dialog opened from the
    //  avatar (or, signed out, the topbar) menu.
    // ---------------------------------------------------------------------
    function pageKind() {
        const path = location.pathname;
        if (path === '/') return 'home';
        if (path === '/results') return 'search';
        if (path === '/watch') return 'watch';
        if (path.startsWith('/feed/subscriptions')) return 'subs';
        if (/^\/(@|channel\/|c\/|user\/)/.test(path)) return 'channel';
        return 'other';
    }

    function syncGlobal() {
        const root = document.documentElement;
        if (!root) return;
        const kind = pageKind();
        for (const page of ['home', 'search', 'watch', 'subs', 'channel']) root.classList.toggle(`ytc-page-${page}`, kind === page);
        for (const [key, page] of Object.entries(SHORTS_PAGES)) root.classList.toggle(`ytc-ns-${page}`, state[key]);
        root.classList.toggle('ytc-ns-sidebar', state.shortsSidebar);
        root.classList.toggle('ytc-hide-cards', state.hideCards);
        const filtered = state.filtersOn && [state.filterBrightness, state.filterContrast, state.filterSaturation].some(value => value !== 100);
        root.classList.toggle('ytc-filters', filtered);
        setVar(root, '--ytc-f-brightness', String(state.filterBrightness / 100));
        setVar(root, '--ytc-f-contrast', String(state.filterContrast / 100));
        setVar(root, '--ytc-f-saturation', String(state.filterSaturation / 100));
    }

    // Playback quality, YouTube's names from best to worst.
    const QUALITIES = [
        ['highres', '4320p (8K)'],
        ['hd2160', '2160p (4K)'],
        ['hd1440', '1440p HD'],
        ['hd1080', '1080p HD'],
        ['hd720', '720p HD'],
        ['large', '480p'],
        ['medium', '360p'],
        ['small', '240p'],
        ['tiny', '144p'],
    ];
    const QUALITY_ORDER = QUALITIES.map(([id]) => id);
    // YouTube settles its own pick shortly after a video loads, so ours is
    // re-asserted for a few seconds before it counts as done.
    const QUALITY_HOLD_MS = 8000;
    let qualityFor = '';
    let qualityUntil = 0;
    let qualityBeforeFullscreen = '';

    function wantedQuality() {
        const playlist = new URL(location.href).searchParams.has('list');
        if (document.fullscreenElement && state.qualityFsDifferent) {
            return playlist ? state.qualityFsPlaylists : state.qualityFsVideos;
        }
        return playlist ? state.qualityPlaylists : state.qualityVideos;
    }

    // The wanted quality, or the best one below it the video offers.
    function setQuality(target) {
        const host = player();
        let levels = [];
        try {
            levels = host?.getAvailableQualityLevels?.() ?? [];
        } catch {}
        if (!levels.length || isAd()) return false;
        const pick = QUALITY_ORDER.slice(Math.max(0, QUALITY_ORDER.indexOf(target))).find(level => levels.includes(level));
        if (!pick) return false;
        try {
            if (host.getPlaybackQuality() !== pick) host.setPlaybackQualityRange(pick, pick);
        } catch {
            return false;
        }
        return true;
    }

    function syncQuality() {
        const videoId = currentVideoId();
        if (!state.qualityAuto || !videoId) return;
        if (qualityFor === videoId && Date.now() > qualityUntil) return;
        if (!setQuality(wantedQuality())) return;
        if (qualityFor !== videoId) {
            qualityFor = videoId;
            qualityUntil = Date.now() + QUALITY_HOLD_MS;
        }
    }

    document.addEventListener('fullscreenchange', () => {
        if (!state.qualityAuto || !state.qualityFsDifferent || location.pathname !== '/watch') return;
        if (document.fullscreenElement) {
            try {
                qualityBeforeFullscreen = player()?.getPlaybackQuality() ?? '';
            } catch {}
            setQuality(wantedQuality());
        } else if (state.qualityFsRestore && qualityBeforeFullscreen) {
            setQuality(qualityBeforeFullscreen);
        }
    });

    // Advanced settings dialog: one pane per topic, options grouped in
    // cards; a row that depends on another is greyed out while it is off.
    // ---------------------------------------------------------------------
    //  "Ao vivo" in the guide: subscribed channels streaming right now, in a
    //  section above Inscrições. The guide itself does not say who is live,
    //  but the subscriptions feed lists live streams first, so it is fetched
    //  in the background (with the user's own session) every few minutes
    //  while the tab is visible. The last result is kept, so the section is
    //  there on the next page load before the first fetch returns.
    // ---------------------------------------------------------------------
    // ytInitialData from a YouTube page's HTML.
    // Pages set it as "var ytInitialData = "; the chat page as
    // 'window["ytInitialData"] = '. Other markers read another object the
    // same way, such as the watch page's ytInitialPlayerResponse.
    function parseInitialData(html, markers = ['var ytInitialData = ', 'window["ytInitialData"] = ']) {
        const marker = markers.find(text => html.includes(text));
        if (!marker) return null;
        const from = html.indexOf(marker) + marker.length;
        // Most close the script right after it; the watch page's player
        // response goes on with "var meta = " in the same script.
        for (const close of [';</script>', ';var meta = ']) {
            const end = html.indexOf(close, from);
            if (end < 0) continue;
            try {
                return JSON.parse(html.slice(from, end));
            } catch {}
        }
        return null;
    }

    const ytText = value => value?.simpleText ?? value?.runs?.map(run => run.text).join('') ?? value?.content ?? '';

    function parseLiveStreams(html) {
        const data = parseInitialData(html);
        return data ? collectLives(data) : null;
    }

    // The streams live right now under a node of that data, every one of
    // them, so a channel running two lives lists both. Covers both card
    // formats, videoRenderer and the newer lockupViewModel.
    function collectLives(data) {
        const text = ytText;
        const lives = [];
        const seen = new Set();
        const add = live => {
            if (!live.videoId || !live.channel || seen.has(live.videoId)) return;
            seen.add(live.videoId);
            lives.push(live);
        };
        const walk = (node, depth) => {
            if (!node || typeof node !== 'object' || depth > 40) return;
            if (Array.isArray(node)) {
                for (const item of node) walk(item, depth + 1);
                return;
            }
            const video = node.videoRenderer || node.gridVideoRenderer;
            if (video) {
                const live = video.badges?.some(badge => badge.metadataBadgeRenderer?.style === 'BADGE_STYLE_TYPE_LIVE_NOW') ||
                    video.thumbnailOverlays?.some(overlay => overlay.thumbnailOverlayTimeStatusRenderer?.style === 'LIVE');
                if (live) {
                    const owner = (video.ownerText || video.shortBylineText || video.longBylineText)?.runs?.[0];
                    const thumbs = video.channelThumbnailSupportedRenderers?.channelThumbnailWithLinkRenderer?.thumbnail?.thumbnails || video.channelThumbnail?.thumbnails;
                    add({
                        videoId: video.videoId,
                        title: text(video.title),
                        channel: owner?.text || '',
                        channelUrl: owner?.navigationEndpoint?.browseEndpoint?.canonicalBaseUrl || owner?.navigationEndpoint?.commandMetadata?.webCommandMetadata?.url || '',
                        avatar: thumbs?.[0]?.url || '',
                        viewers: text(video.viewCountText || video.shortViewCountText),
                    });
                }
                return;
            }
            const lockup = node.lockupViewModel;
            if (lockup) {
                const badges = lockup.contentImage?.thumbnailViewModel?.overlays?.flatMap(overlay =>
                    overlay.thumbnailOverlayBadgeViewModel?.thumbnailBadges || overlay.thumbnailBottomOverlayViewModel?.badges || []) || [];
                const live = badges.some(badge => badge.thumbnailBadgeViewModel?.badgeStyle === 'THUMBNAIL_OVERLAY_BADGE_STYLE_LIVE');
                if (live) {
                    const meta = lockup.metadata?.lockupMetadataViewModel;
                    const avatar = meta?.image?.decoratedAvatarViewModel;
                    const rows = meta?.metadata?.contentMetadataViewModel?.metadataRows || [];
                    add({
                        videoId: lockup.contentId,
                        title: text(meta?.title),
                        channelUrl: avatar?.rendererContext?.commandContext?.onTap?.innertubeCommand?.browseEndpoint?.canonicalBaseUrl || '',
                        // sem link de canal (ex.: aba do próprio canal) a 1ª linha é "x assistindo", não o nome
                        channel: avatar ? text(rows[0]?.metadataParts?.[0]?.text) : '',
                        avatar: avatar?.avatar?.avatarViewModel?.image?.sources?.[0]?.url || '',
                        viewers: avatar ? text(rows[1]?.metadataParts?.[0]?.text) : text(rows[0]?.metadataParts?.[0]?.text),
                    });
                }
                return;
            }
            for (const key in node) walk(node[key], depth + 1);
        };
        walk(data, 0);
        return lives;
    }

    // YouTube's live page in its own shelves: "Ao vivo agora" and one per
    // topic ("Ao vivo agora: Esportes"...). Shelves with nothing on air
    // (recent and upcoming streams) drop out.
    function parseLiveShelves(html) {
        const data = parseInitialData(html);
        if (!data) return null;
        const shelves = [];
        const walk = (node, depth) => {
            if (!node || typeof node !== 'object' || depth > 40) return;
            if (Array.isArray(node)) {
                for (const item of node) walk(item, depth + 1);
                return;
            }
            const shelf = node.richShelfRenderer || node.shelfRenderer;
            if (shelf) {
                const lives = collectLives(shelf);
                if (lives.length) shelves.push({ title: ytText(shelf.title), lives });
                return;
            }
            for (const key in node) walk(node[key], depth + 1);
        };
        walk(data, 0);
        return shelves;
    }

    const LIVE_REFRESH_MS = 3 * 60 * 1000;
    const LIVE_CACHE_MS = 15 * 60 * 1000;
    const LIVE_ICON = 'M4.93,4.93C3.12,6.74 2,9.24 2,12C2,14.76 3.12,17.26 4.93,19.07L6.34,17.66C4.89,16.22 4,14.22 4,12C4,9.79 4.89,7.78 6.34,6.34L4.93,4.93M19.07,4.93L17.66,6.34C19.11,7.78 20,9.79 20,12C20,14.22 19.11,16.22 17.66,17.66L19.07,19.07C20.88,17.26 22,14.76 22,12C22,9.24 20.88,6.74 19.07,4.93M7.76,7.76C6.67,8.85 6,10.35 6,12C6,13.65 6.67,15.15 7.76,16.24L9.17,14.83C8.45,14.11 8,13.11 8,12C8,10.89 8.45,9.89 9.17,9.17L7.76,7.76M16.24,7.76L14.83,9.17C15.55,9.89 16,10.89 16,12C16,13.11 15.55,14.11 14.83,14.83L16.24,16.24C17.33,15.15 18,13.65 18,12C18,10.35 17.33,8.85 16.24,7.76M12,10A2,2 0 0,0 10,12A2,2 0 0,0 12,14A2,2 0 0,0 14,12A2,2 0 0,0 12,10Z';
    // A live's own picture, refreshed by YouTube while it runs; the plain
    // one when there is none.
    const liveThumb = videoId => `https://i.ytimg.com/vi/${encodeURIComponent(videoId)}/mqdefault_live.jpg`;
    const liveThumbFallback = videoId => `https://i.ytimg.com/vi/${encodeURIComponent(videoId)}/mqdefault.jpg`;
    // YouTube's own live page, Explorar > Ao vivo in the guide.
    const LIVE_EXPLORE_URL = '/channel/UC4R8DWoMoI7CAwX8_LjQHig';
    // Like Inscrições, only the first few show until "Mostrar mais".
    const LIVE_VISIBLE = 7;
    // Until the first answer (or a recent cached one) the section holds its
    // place with placeholder rows, so it does not pop in under the guide.
    // An empty answer is cached too: no placeholder on every page then.
    // Channels in alphabetical order, ignoring case and accents; a
    // channel's own lives by title.
    const byChannel = (a, b) => a.channel.localeCompare(b.channel, 'pt-BR', { sensitivity: 'base' }) ||
        (a.title ?? '').localeCompare(b.title ?? '', 'pt-BR', { sensitivity: 'base' });
    const liveGuide = { list: [], loaded: false, fetchedAt: 0, loading: false, section: null, renderedKey: '', expanded: false, onAir: [], onAirKey: '', guidePending: false, asked: [] };
    // The guide is drawn seconds after the page; the channels it last
    // marked live are kept so the first refresh already reads them.
    liveGuide.onAir = getSetting('liveOnAir', []);
    liveGuide.onAirKey = liveGuide.onAir.map(channel => channel.url).join(',');
    {
        const cached = getSetting('liveCache', null);
        if (cached && Date.now() - cached.at < LIVE_CACHE_MS && Array.isArray(cached.list)) {
            liveGuide.list = cached.list.sort(byChannel);
            liveGuide.loaded = true;
        }
    }

    async function fetchLiveStreams() {
        if (liveGuide.loading || document.hidden) return;
        liveGuide.loading = true;
        liveGuide.fetchedAt = Date.now();
        try {
            // The channels the feed did not cover last time are read from
            // their /live address meanwhile, not after it.
            const [lives, found] = await Promise.all([
                fetch('/feed/subscriptions', { credentials: 'include' })
                    .then(async response => (response.ok ? parseLiveStreams(await response.text()) : null)),
                guideLives(liveGuide.list.filter(live => !live.fromGuide)),
            ]);
            if (lives) {
                const asked = liveGuide.asked;
                liveGuide.list = withGuideLives(lives, found).sort(byChannel);
                // One the feed was thought to cover and now leaves out.
                if (liveGuide.onAir.some(channel => !coveredBy(liveGuide.list, channel) && !asked.includes(channel.url))) liveGuide.guidePending = true;
                setSetting('liveCache', { at: Date.now(), list: liveGuide.list });
            }
        } catch {} finally {
            liveGuide.loading = false;
            liveGuide.loaded = true;
        }
        syncTv();
        // The guide marked a channel live while this ran, too late for it.
        if (liveGuide.guidePending) fetchGuideLives();
    }

    // The subscriptions page lists uploads by date, so a stream on air for
    // hours can sit past its first page. The guide still marks its channel
    // live (the red icon in Inscrições, line-end-style="badge"); such a
    // channel's stream is read from its /live address.
    function guideLiveChannels(section) {
        return [...section.querySelectorAll('ytd-guide-entry-renderer[line-end-style="badge"] a#endpoint')]
            .map(link => ({ url: link.getAttribute('href') ?? '', name: link.title, avatar: link.querySelector('img')?.src ?? '' }))
            .filter(channel => /^\/(@|channel\/)/.test(channel.url));
    }

    const findNode = (node, key, depth = 0) => {
        if (!node || typeof node !== 'object' || depth > 40) return null;
        if (node[key]) return node[key];
        for (const value of Object.values(node)) {
            const found = findNode(value, key, depth + 1);
            if (found) return found;
        }
        return null;
    };

    async function liveOnChannel(channel) {
        try {
            const response = await fetch(`${channel.url}/live`, { credentials: 'include' });
            if (!response.ok) return null;
            const html = await response.text();
            const details = parseInitialData(html, ['var ytInitialPlayerResponse = '])?.videoDetails;
            if (!details?.isLive) return null;
            const data = parseInitialData(html);
            const views = findNode(data, 'videoViewCountRenderer');
            // The guide's picture can still be unloaded; the page's owner
            // row has one too.
            const owner = findNode(data, 'videoOwnerRenderer')?.thumbnail?.thumbnails;
            return {
                videoId: details.videoId,
                title: details.title ?? '',
                channel: details.author || channel.name,
                channelUrl: channel.url,
                avatar: owner?.[0]?.url || channel.avatar,
                fromGuide: true,
                viewers: ytText(views?.viewCount),
            };
        } catch {
            return null;
        }
    }

    const coveredBy = (lives, channel) => lives.some(live => live.channelUrl === channel.url || live.channel === channel.name);

    // The streams of the channels marked live that these lives leave out.
    async function guideLives(lives) {
        const missing = liveGuide.onAir.filter(channel => !coveredBy(lives, channel)).slice(0, 8);
        liveGuide.asked = missing.map(channel => channel.url);
        return (await Promise.all(missing.map(liveOnChannel))).filter(Boolean);
    }

    function withGuideLives(lives, found) {
        const extra = found.filter(live => !coveredBy(lives, { url: live.channelUrl, name: live.channel }) && !lives.some(other => other.videoId === live.videoId));
        return extra.length ? [...lives, ...extra] : lives;
    }

    // A channel newly marked live in the guide, between two refreshes.
    async function fetchGuideLives() {
        liveGuide.guidePending = liveGuide.loading;
        if (liveGuide.loading || document.hidden) return;
        liveGuide.loading = true;
        try {
            const list = withGuideLives(liveGuide.list, await guideLives(liveGuide.list));
            if (list !== liveGuide.list) {
                liveGuide.list = list.sort(byChannel);
                setSetting('liveCache', { at: Date.now(), list: liveGuide.list });
            }
        } catch {} finally {
            liveGuide.loading = false;
        }
        syncTv();
    }

    // The subscriptions section is the one headed by a link to the channel
    // list; failing that, the one with several channel entries.
    function subscriptionsSection() {
        const sections = document.querySelectorAll('ytd-guide-renderer #sections > ytd-guide-section-renderer');
        for (const section of sections) {
            if (section.querySelector('a[href="/feed/channels"]')) return section;
        }
        for (const section of sections) {
            if (section.querySelectorAll('ytd-guide-entry-renderer a[href^="/@"]').length >= 2) return section;
        }
        return null;
    }

    // Each live as Twitch lists them: the channel's picture, its name with
    // the audience beside it, and what is on air underneath.
    function liveEntry(live) {
        const entry = document.createElement('a');
        entry.className = 'ytc-live-entry ytc-live-stream';
        entry.href = `/watch?v=${encodeURIComponent(live.videoId)}`;
        entry.title = [live.channel, live.title, live.viewers].filter(Boolean).join('\n');
        const avatar = document.createElement('img');
        avatar.className = 'ytc-live-avatar';
        avatar.alt = '';
        avatar.loading = 'lazy';
        avatar.addEventListener('error', () => avatar.removeAttribute('src'), { once: true });
        if (live.avatar) avatar.src = live.avatar;
        const text = document.createElement('span');
        text.className = 'ytc-live-text';
        const top = document.createElement('span');
        top.className = 'ytc-live-top';
        const name = document.createElement('span');
        name.className = 'ytc-live-name';
        name.textContent = live.channel;
        top.append(name);
        // "138 mil assistindo" -> "138 mil": the number and its unit.
        const count = live.viewers?.match(/^[\d.,]+(\s?(mil|mi|bi|[KMB]))?/i)?.[0];
        if (count) {
            const viewers = document.createElement('span');
            viewers.className = 'ytc-live-viewers';
            viewers.textContent = count;
            top.append(viewers);
        }
        const title = document.createElement('span');
        title.className = 'ytc-live-stream-title';
        title.textContent = live.title;
        text.append(top, title);
        entry.append(avatar, text);
        return entry;
    }

    // YouTube orders the guide's sections differently from page to page
    // (Inscrições sometimes under Você and Explorar). They are kept as
    // Início, Ao vivo, Inscrições, then the rest, by flex order on the
    // sections' container rather than by moving YouTube's own nodes.
    function orderGuideSections() {
        const subs = subscriptionsSection();
        subs?.classList.add('ytc-guide-subs');
        const home = document.querySelector('ytd-guide-renderer #sections > ytd-guide-section-renderer a[href="/"]')?.closest('ytd-guide-section-renderer');
        home?.classList.add('ytc-guide-home');
    }

    function syncLiveSection() {
        orderGuideSections();
        const subs = state.liveSection ? subscriptionsSection() : null;
        // While the section is up it carries the link to YouTube's live
        // page, so Explorar's own "Ao vivo" entry steps aside.
        const shown = section => {
            const explore = document.querySelector(`ytd-guide-section-renderer a[href="${LIVE_EXPLORE_URL}"]`)?.closest('ytd-guide-entry-renderer');
            explore?.classList.toggle('ytc-live-explore-hidden', section);
        };
        if (!subs) {
            liveGuide.section?.remove();
            shown(false);
            return;
        }
        const onAir = guideLiveChannels(subs);
        const onAirKey = onAir.map(channel => channel.url).join(',');
        if (onAirKey !== liveGuide.onAirKey) {
            liveGuide.onAir = onAir;
            liveGuide.onAirKey = onAirKey;
            setSetting('liveOnAir', onAir);
            if (liveGuide.loaded) fetchGuideLives();
        }
        if (Date.now() - liveGuide.fetchedAt > LIVE_REFRESH_MS) fetchLiveStreams();
        if (liveGuide.loaded && !liveGuide.list.length) {
            liveGuide.section?.remove();
            shown(false);
            return;
        }
        shown(true);
        let section = liveGuide.section;
        if (!section) {
            section = liveGuide.section = document.createElement('div');
            section.className = 'ytc-live-section';
            const title = document.createElement('div');
            title.className = 'ytc-live-title';
            title.textContent = 'Ao vivo';
            section.append(title, document.createElement('div'));
        }
        if (section.nextElementSibling !== subs) subs.before(section);
        const key = liveGuide.loaded ? `${state.liveTv}:${liveGuide.list.map(live => live.videoId).join(',')}` : 'loading';
        if (key === liveGuide.renderedKey) return;
        liveGuide.renderedKey = key;
        if (liveGuide.loaded) renderLiveEntries();
        else liveGuide.section.lastElementChild.replaceChildren(...Array.from({ length: 3 }, () => {
            const row = document.createElement('div');
            row.className = 'ytc-live-entry ytc-live-skeleton';
            row.append(document.createElement('span'), document.createElement('span'));
            return row;
        }));
    }

    function renderLiveEntries() {
        const list = liveGuide.list;
        const shown = liveGuide.expanded ? list : list.slice(0, LIVE_VISIBLE);
        const entries = shown.map(liveEntry);
        if (state.liveTv) {
            const tv = document.createElement('a');
            tv.href = TV_PATH;
            tv.className = 'ytc-live-entry ytc-live-tv';
            const tvIcon = icon(TV_ICON);
            tvIcon.classList.add('ytc-live-chevron');
            const label = document.createElement('span');
            label.className = 'ytc-live-name';
            label.textContent = 'Modo TV';
            tv.append(tvIcon, label);
            entries.unshift(tv);
        }
        if (list.length > LIVE_VISIBLE) {
            const more = document.createElement('button');
            more.type = 'button';
            more.className = 'ytc-live-entry ytc-live-more';
            const chevron = icon(liveGuide.expanded ? 'M7.41,15.41L12,10.83L16.59,15.41L18,14L12,8L6,14L7.41,15.41Z' : 'M7.41,8.58L12,13.17L16.59,8.58L18,10L12,16L6,10L7.41,8.58Z');
            chevron.classList.add('ytc-live-chevron');
            const label = document.createElement('span');
            label.className = 'ytc-live-name';
            label.textContent = liveGuide.expanded ? 'Mostrar menos' : `Mostrar mais (${list.length - LIVE_VISIBLE})`;
            more.append(chevron, label);
            more.addEventListener('click', () => {
                liveGuide.expanded = !liveGuide.expanded;
                renderLiveEntries();
            });
            entries.push(more);
        }
        const explore = document.createElement('a');
        explore.className = 'ytc-live-entry';
        explore.href = LIVE_EXPLORE_URL;
        const compass = icon('M14.19,14.19L6,18L9.81,9.81L18,6M12,2A10,10 0 0,0 2,12A10,10 0 0,0 12,22A10,10 0 0,0 22,12A10,10 0 0,0 12,2M12,10.9A1.1,1.1 0 0,0 10.9,12A1.1,1.1 0 0,0 12,13.1A1.1,1.1 0 0,0 13.1,12A1.1,1.1 0 0,0 12,10.9Z');
        compass.classList.add('ytc-live-chevron');
        const label = document.createElement('span');
        label.className = 'ytc-live-name';
        label.textContent = 'Explorar mais lives';
        explore.append(compass, label);
        entries.push(explore);
        liveGuide.section.lastElementChild.replaceChildren(...entries);
    }

    // ---------------------------------------------------------------------
    //  "Transmitindo agora" on a channel's live tab (/@x/streams). YouTube
    //  sorts that tab upcoming first, so what is on air sits below every
    //  scheduled stream. A chip of our own, on by default on each visit,
    //  hides everything that is not live; the grid keeps loading pages
    //  until the first past stream (a duration badge) shows up, and stops
    //  there.
    // ---------------------------------------------------------------------
    const channelLive = { path: '', on: false };

    // ---------------------------------------------------------------------
    //  Live hub: YouTube's live page (Explorar > Ao vivo) opens with the
    //  subscribed channels live now, as cards above its own shelves, and
    //  the way into TV mode.
    // ---------------------------------------------------------------------
    const LIVE_HUB_SHOWN = 8;
    const liveHub = { root: null, renderedKey: '', expanded: false };

    function syncLiveHub() {
        const grid = location.pathname.startsWith(LIVE_EXPLORE_URL)
            ? document.querySelector('ytd-browse:not([hidden]) ytd-two-column-browse-results-renderer > #primary > ytd-rich-grid-renderer')
            : null;
        if (!grid) {
            liveHub.root?.remove();
            return;
        }
        if (Date.now() - liveGuide.fetchedAt > LIVE_REFRESH_MS) fetchLiveStreams();
        if (!liveHub.root) {
            const root = liveHub.root = document.createElement('section');
            root.className = 'ytc-hub';
            const head = document.createElement('div');
            head.className = 'ytc-hub-head';
            const title = document.createElement('h2');
            title.className = 'ytc-hub-title';
            title.textContent = 'Seus canais ao vivo';
            const count = document.createElement('span');
            count.className = 'ytc-hub-count';
            const tvLink = document.createElement('a');
            tvLink.className = 'ytc-hub-tv';
            tvLink.href = TV_PATH;
            tvLink.append(icon(TV_ICON), Object.assign(document.createElement('span'), { textContent: 'Assistir no Modo TV' }));
            head.append(title, count, tvLink);
            const cards = document.createElement('div');
            cards.className = 'ytc-hub-cards';
            root.append(head, cards);
        }
        if (liveHub.root.nextElementSibling !== grid) grid.before(liveHub.root);
        const list = liveGuide.list;
        const key = liveGuide.loaded ? `${liveHub.expanded}:${list.map(live => `${live.videoId}:${live.viewers ?? ''}`).join(',')}` : 'loading';
        if (key === liveHub.renderedKey) return;
        liveHub.renderedKey = key;
        const [, count] = liveHub.root.firstElementChild.children;
        count.textContent = liveGuide.loaded && list.length ? String(list.length) : '';
        const cards = liveHub.root.lastElementChild;
        if (!liveGuide.loaded) {
            cards.replaceChildren(...Array.from({ length: 4 }, () => Object.assign(document.createElement('div'), { className: 'ytc-hub-card ytc-hub-skeleton' })));
            return;
        }
        if (!list.length) {
            cards.replaceChildren(Object.assign(document.createElement('p'), { className: 'ytc-hub-empty', textContent: 'Ninguém que você segue está ao vivo agora. As lives do YouTube estão logo abaixo.' }));
            return;
        }
        const shown = liveHub.expanded ? list : list.slice(0, LIVE_HUB_SHOWN);
        const children = shown.map(live => {
            const card = document.createElement('a');
            card.className = 'ytc-hub-card';
            card.href = `/watch?v=${encodeURIComponent(live.videoId)}`;
            const thumb = document.createElement('span');
            thumb.className = 'ytc-hub-thumb';
            const picture = document.createElement('img');
            picture.alt = '';
            picture.loading = 'lazy';
            picture.addEventListener('error', () => {
                if (picture.src !== liveThumbFallback(live.videoId)) picture.src = liveThumbFallback(live.videoId);
            }, { once: true });
            picture.src = liveThumb(live.videoId);
            const pill = document.createElement('span');
            pill.className = 'ytc-hub-pill';
            pill.textContent = 'AO VIVO';
            thumb.append(picture, pill);
            const meta = document.createElement('span');
            meta.className = 'ytc-hub-meta';
            const avatar = document.createElement('img');
            avatar.className = 'ytc-hub-avatar';
            avatar.alt = '';
            avatar.addEventListener('error', () => avatar.removeAttribute('src'), { once: true });
            if (live.avatar) avatar.src = live.avatar;
            const text = document.createElement('span');
            text.className = 'ytc-hub-text';
            text.append(
                Object.assign(document.createElement('span'), { className: 'ytc-hub-video', textContent: live.title || live.channel }),
                Object.assign(document.createElement('span'), { className: 'ytc-hub-channel', textContent: live.channel }),
            );
            if (live.viewers) text.append(Object.assign(document.createElement('span'), { className: 'ytc-hub-channel', textContent: live.viewers }));
            meta.append(avatar, text);
            card.append(thumb, meta);
            return card;
        });
        if (list.length > LIVE_HUB_SHOWN) {
            const more = document.createElement('button');
            more.type = 'button';
            more.className = 'ytc-hub-more';
            more.textContent = liveHub.expanded ? 'Mostrar menos' : `Mostrar todos (${list.length})`;
            more.addEventListener('click', () => {
                liveHub.expanded = !liveHub.expanded;
                syncLiveHub();
            });
            children.push(more);
        }
        cards.replaceChildren(...children);
    }

    function syncLiveFilter() {
        const root = document.documentElement;
        const streams = pageKind() === 'channel' && /\/streams\/?$/.test(location.pathname);
        if (!streams) {
            channelLive.path = '';
            root?.classList.remove('ytc-live-only', 'ytc-live-settled');
            document.querySelector('.ytc-live-empty')?.remove();
            return;
        }
        if (channelLive.path !== location.pathname) {
            channelLive.path = location.pathname;
            channelLive.on = state.liveNowFilter;
        }
        root.classList.toggle('ytc-live-only', channelLive.on);
        const grid = document.querySelector('ytd-browse:not([hidden]) ytd-rich-grid-renderer');
        const bar = grid?.querySelector('#header chip-bar-view-model .ytChipBarViewModelChipBarScrollContainer');
        if (!bar) return;
        let chip = bar.querySelector('.ytc-live-chip');
        if (!chip) {
            chip = document.createElement('div');
            chip.className = 'ytChipBarViewModelChipWrapper ytc-live-chip';
            chip.setAttribute('role', 'presentation');
            const button = document.createElement('button');
            button.type = 'button';
            button.className = 'ytChipShapeButtonReset';
            button.setAttribute('role', 'tab');
            const shape = document.createElement('div');
            const text = document.createElement('div');
            text.className = 'ytChipShapeText';
            text.textContent = 'Transmitindo agora';
            shape.append(text);
            button.append(shape);
            chip.append(button);
            button.addEventListener('click', () => {
                channelLive.on = !channelLive.on;
                syncLiveFilter();
            });
            bar.prepend(chip);
        }
        chip.firstElementChild.setAttribute('aria-selected', String(channelLive.on));
        chip.firstElementChild.firstElementChild.className = `ytChipShapeChip ${channelLive.on ? 'ytChipShapeActive' : 'ytChipShapeInactive'} ytChipShapeOnlyTextPadding`;

        const items = grid.querySelectorAll('#contents > ytd-rich-item-renderer');
        const isLive = item => item.querySelector('.ytBadgeShapeThumbnailLive, ytd-thumbnail-overlay-time-status-renderer[overlay-style="LIVE"]');
        const past = Array.from(items).some(item => !isLive(item) &&
            Array.from(item.querySelectorAll('badge-shape, ytd-thumbnail-overlay-time-status-renderer')).some(badge => /^\d+(:\d\d)+$/.test(badge.textContent.trim())));
        const settled = past || !grid.querySelector('#contents > ytd-continuation-item-renderer');
        root.classList.toggle('ytc-live-settled', settled);
        const empty = channelLive.on && settled && !Array.from(items).some(isLive);
        let message = grid.querySelector('.ytc-live-empty');
        if (empty && !message) {
            message = document.createElement('div');
            message.className = 'ytc-live-empty';
            message.textContent = 'Nenhuma transmissão ao vivo agora.';
            grid.querySelector('#header')?.append(message);
        } else if (!empty) message?.remove();
    }

    // ---------------------------------------------------------------------
    //  TV mode: the subscribed channels live now, one at a time, full
    //  screen, on a page of its own (/feed/ytc-tv: a path YouTube serves
    //  as an empty page, whose app is hidden while ours takes over; so it
    //  has its own address, back button and tab, and nothing of the page
    //  it was opened from keeps running underneath). Laid out like a TV guide: the channel list docks on the
    //  left, the picture in the middle, the live chat on the right.
    //  With the list open the arrows move through it and Enter watches the
    //  chosen channel; with it closed the arrows zap straight away, with a
    //  now-playing banner. The chat shows every message, not only the top
    //  ones, and the player is kept at the live edge.
    //  YouTube refuses its own /embed player inside youtube.com (error
    //  152), so the stage frames a real watch page instead, styled down to
    //  its player, and zaps with the player's loadVideoById: no reload
    //  between channels. The frame is same-origin, so its keys and pointer
    //  moves reach us too. The chat is YouTube's /live_chat page.
    // ---------------------------------------------------------------------
    const TV_ICON = 'M8.16,3L6.75,4.41L9.34,7H4C2.89,7 2,7.89 2,9V19C2,20.11 2.89,21 4,21H20C21.11,21 22,20.11 22,19V9C22,7.89 21.11,7 20,7H14.66L17.25,4.41L15.84,3L12,6.84L8.16,3M4,9H17V19H4V9M19.5,9A1,1 0 0,1 20.5,10A1,1 0 0,1 19.5,11A1,1 0 0,1 18.5,10A1,1 0 0,1 19.5,9M19.5,12A1,1 0 0,1 20.5,13A1,1 0 0,1 19.5,14A1,1 0 0,1 18.5,13A1,1 0 0,1 19.5,12Z';
    const TV_PATH = '/feed/ytc-tv';
    const TV_TITLE = 'Modo TV - YouTube';
    const TV_MENU_ICON = 'M3,6H21V8H3V6M3,11H21V13H3V11M3,16H21V18H3V16Z';
    const TV_EXIT_ICON = 'M10.09,15.59L11.5,17L16.5,12L11.5,7L10.09,8.41L12.67,11H3V13H12.67L10.09,15.59M19,3H5C3.89,3 3,3.9 3,5V9H5V5H19V19H5V15H3V19A2,2 0 0,0 5,21H19A2,2 0 0,0 21,19V5C21,3.9 20.1,3 19,3Z';
    const TV_UI_MS = 3500;
    const TV_BANNER_MS = 4000;
    // Zapping through several channels loads only the one it stops on.
    const TV_TUNE_MS = 400;
    const TV_FRAME_CSS = `
        html, body { overflow: hidden !important; background: #000 !important; }
        #masthead-container, tp-yt-app-drawer, ytd-mini-guide-renderer { display: none !important; }
        /* The page around the player stacks above a fixed player (its
           ancestors form stacking contexts), so all of it is made
           invisible instead: hidden inherits, and the player opts back in
           (a plain rule; a selector matching every element but the
           player's made each of the page's DOM changes costly). */
        body { visibility: hidden !important; }
        #movie_player {
            visibility: visible !important;
            position: fixed !important;
            inset: 0 !important;
            width: 100vw !important;
            height: 100vh !important;
            z-index: 2147483647 !important;
            background: #000 !important;
        }
    `;
    const TV_EMPTY = { root: null, frame: null, chat: null, list: null, count: null, banner: null, veil: null, chatToggle: null, videoId: '', chatFor: '', livePending: false, cursor: 0, nav: [], renderedKey: '', digits: '' };
    const tv = { ...TV_EMPTY, timers: {} };

    function tvElement(tag, className, text) {
        const element = document.createElement(tag);
        if (className) element.className = className;
        if (text) element.textContent = text;
        return element;
    }

    function tvImage(className, src, fallback) {
        const image = tvElement('img', className);
        image.alt = '';
        image.loading = 'lazy';
        // A missing picture falls back once, then leaves the empty circle or
        // frame rather than a broken-image icon.
        image.addEventListener('error', () => {
            if (fallback && image.src !== fallback) image.src = fallback;
            else image.removeAttribute('src');
        });
        if (src) image.src = src;
        return image;
    }

    function tvButton(className, label, path, run) {
        const button = tvElement('button', `ytc-tv-button ${className}`);
        button.type = 'button';
        if (path) button.append(icon(path));
        if (label) button.append(tvElement('span', '', label));
        button.addEventListener('click', run);
        return button;
    }

    const tvPill = () => tvElement('span', 'ytc-tv-pill', 'AO VIVO');
    // Under the subscriptions, YouTube's own live page (Explorar > Ao
    // vivo) by its topic shelves: Esportes first and open, the others
    // collapsed (each remembers being opened or closed), the general "Ao
    // vivo agora" shelf last as "Em alta". A live shows once: under the
    // subscriptions if it is there, else under its first topic.
    const exploreLives = { shelves: [], fetchedAt: 0, loading: false };
    const TV_SPORTS = /esporte|sport/i;

    async function fetchExploreLives() {
        if (exploreLives.loading || document.hidden) return;
        exploreLives.loading = true;
        exploreLives.fetchedAt = Date.now();
        try {
            const response = await fetch(LIVE_EXPLORE_URL, { credentials: 'include' });
            const shelves = response.ok ? parseLiveShelves(await response.text()) : null;
            if (shelves) exploreLives.shelves = shelves;
        } catch {} finally {
            exploreLives.loading = false;
        }
        syncTv();
    }

    function tvLives() {
        const own = liveGuide.list;
        const seen = new Set(own.map(live => live.videoId));
        const topics = exploreLives.shelves.map(shelf => {
            const topic = shelf.title.includes(':') ? shelf.title.slice(shelf.title.indexOf(':') + 1).trim() : '';
            return { name: topic || 'Em alta', general: !topic, lives: shelf.lives };
        });
        const ordered = [
            ...topics.filter(group => !group.general && TV_SPORTS.test(group.name)),
            ...topics.filter(group => !group.general && !TV_SPORTS.test(group.name)),
            ...topics.filter(group => group.general),
        ];
        const groups = [];
        for (const group of ordered) {
            const lives = group.lives.filter(live => !seen.has(live.videoId));
            lives.forEach(live => seen.add(live.videoId));
            const existing = groups.find(other => other.name === group.name);
            if (existing) existing.lives.push(...lives);
            else if (lives.length) groups.push({ name: group.name, lives });
        }
        return { own, groups, all: [...own, ...groups.flatMap(group => group.lives)] };
    }

    const tvGroupOpen = name => state.tvGroups[name] ?? TV_SPORTS.test(name);

    function toggleTvGroup(name) {
        state.tvGroups = { ...state.tvGroups, [name]: !tvGroupOpen(name) };
        setSetting('tvGroups', state.tvGroups);
        tv.renderedKey = '';
        syncTv();
    }

    const tvIndex = () => tvLives().all.findIndex(live => live.videoId === tv.videoId);
    const tvGuideOpen = () => tv.root.classList.contains('is-guide');

    function tvLater(name, ms, run) {
        clearTimeout(tv.timers[name]);
        tv.timers[name] = setTimeout(run, ms);
    }

    // The page opens (or closes) TV mode by its address, from the refresh.
    function syncTvPage() {
        const onPage = location.pathname === TV_PATH;
        document.documentElement.classList.toggle('ytc-tv-page', onPage);
        if (onPage && !tv.root && document.body) openTv();
        else if (!onPage && tv.root) closeTv();
        if (onPage && document.title !== TV_TITLE) document.title = TV_TITLE;
    }

    // Back where it came from on YouTube, or the home page.
    function exitTv() {
        let fromYouTube = false;
        try {
            fromYouTube = new URL(document.referrer).origin === location.origin;
        } catch {}
        if (fromYouTube && history.length > 1) history.back();
        else location.assign('/');
    }

    function youTubeLogo() {
        const link = tvElement('a', 'ytc-tv-yt');
        link.href = '/';
        link.title = 'Início do YouTube';
        const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        svg.setAttribute('viewBox', '0 0 28 20');
        svg.setAttribute('aria-hidden', 'true');
        const frame = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
        for (const [name, value] of [['width', '28'], ['height', '20'], ['rx', '5'], ['fill', '#ff0033']]) frame.setAttribute(name, value);
        const play = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        play.setAttribute('d', 'M11 5.5v9l7.5-4.5z');
        play.setAttribute('fill', '#fff');
        svg.append(frame, play);
        link.append(svg, tvElement('span', '', 'YouTube'));
        return link;
    }

    function openTv() {
        if (tv.root) return;
        const root = tv.root = tvElement('div', 'ytc-tv is-guide');
        root.tabIndex = -1;
        root.setAttribute('role', 'dialog');
        root.setAttribute('aria-label', 'Modo TV');
        root.classList.toggle('is-chat', state.tvChat);

        const stage = tvElement('div', 'ytc-tv-stage');
        const frame = tv.frame = tvElement('iframe', 'ytc-tv-frame');
        frame.allow = 'autoplay; encrypted-media; picture-in-picture; fullscreen';
        frame.addEventListener('load', () => {
            try {
                const inner = frame.contentDocument;
                const style = inner.createElement('style');
                style.textContent = TV_FRAME_CSS;
                inner.documentElement.append(style);
                frame.contentWindow.addEventListener('keydown', onTvKey, true);
                frame.contentWindow.addEventListener('mousemove', showTvUi);
                // Media events do not bubble; captured, "playing" catches
                // the stream starting after an ad and every resume after a
                // pause, each of which lands back on the live edge.
                inner.addEventListener('playing', keepTvLive, true);
                inner.addEventListener('pause', () => { tv.livePending = true; }, true);
                // The player sizes its video on resize.
                frame.contentWindow.dispatchEvent(new Event('resize'));
            } catch {}
        });
        tv.veil = tvElement('div', 'ytc-tv-veil');
        stage.append(frame, tv.veil);

        // Channel sidebar: title, the list, then what to do.
        const guide = tvElement('aside', 'ytc-tv-guide');
        guide.setAttribute('aria-label', 'Canais ao vivo');
        // Headed like YouTube's playlist panel: title, a line under it,
        // and the panel's own buttons on the right.
        // On top, like YouTube's masthead: the menu button and the logo.
        const top = tvElement('div', 'ytc-tv-top');
        const hide = tvButton('ytc-tv-icon-button', '', TV_MENU_ICON, toggleTvGuide);
        hide.title = 'Esconder lista (G)';
        hide.setAttribute('aria-label', 'Esconder lista de canais');
        top.append(hide, youTubeLogo());
        const head = tvElement('div', 'ytc-tv-head');
        const titles = tvElement('div', 'ytc-tv-titles');
        tv.count = tvElement('div', 'ytc-tv-count');
        titles.append(tvElement('div', 'ytc-tv-brand', 'Ao vivo agora'), tv.count);
        tv.chatToggle = tvButton('ytc-tv-icon-button', '', '', toggleTvChat);
        tv.chatToggle.title = 'Chat (C)';
        tv.chatToggle.setAttribute('aria-label', 'Chat ao vivo');
        head.append(titles, tv.chatToggle);
        tv.list = tvElement('div', 'ytc-tv-list');
        tv.list.setAttribute('role', 'listbox');
        const foot = tvElement('div', 'ytc-tv-foot');
        const exit = tvButton('ytc-tv-exit', 'Sair do Modo TV', TV_EXIT_ICON, exitTv);
        exit.append(tvElement('kbd', '', 'Esc'));
        foot.append(exit);
        guide.append(top, head, tv.list, foot);

        // With the list closed, the way back to it.
        // Like YouTube's masthead: the menu button and the logo.
        const opener = tvElement('div', 'ytc-tv-opener');
        const show = tvButton('ytc-tv-icon-button', '', TV_MENU_ICON, toggleTvGuide);
        show.title = 'Mostrar lista (G)';
        show.setAttribute('aria-label', 'Mostrar lista de canais');
        opener.append(show, youTubeLogo());
        opener.addEventListener('mouseenter', () => clearTimeout(tv.timers.ui));

        tv.banner = tvElement('div', 'ytc-tv-banner');
        const chat = tvElement('div', 'ytc-tv-chat');
        tv.chat = tvElement('iframe');
        tv.chat.title = 'Chat ao vivo';
        chat.append(tv.chat);

        root.append(stage, guide, chat, opener, tv.banner);
        root.addEventListener('mousemove', showTvUi);
        document.documentElement.classList.add('ytc-tv-open');
        document.body.append(root);
        window.addEventListener('keydown', onTvKey, true);
        root.focus();
        // Each fetch redraws the list when it lands; one skipped (tab hidden,
        // one already running) must not call back, or it loops.
        if (Date.now() - liveGuide.fetchedAt > LIVE_REFRESH_MS) fetchLiveStreams();
        if (Date.now() - exploreLives.fetchedAt > LIVE_REFRESH_MS) fetchExploreLives();
        // Start on the live being watched, if it is one of them.
        const watching = new URL(location.href).searchParams.get('v');
        const start = Math.max(0, tvLives().all.findIndex(live => live.videoId === watching));
        syncTv();
        syncTvChatToggle();
        if (tvLives().all.length) tuneTv(start, 0);
    }

    function closeTv() {
        if (!tv.root) return;
        if (document.fullscreenElement === tv.root) document.exitFullscreen().catch(() => {});
        for (const timer of Object.values(tv.timers)) clearTimeout(timer);
        window.removeEventListener('keydown', onTvKey, true);
        tv.root.remove();
        Object.assign(tv, TV_EMPTY, { timers: {} });
        document.documentElement.classList.remove('ytc-tv-open');
    }

    // The list follows the live list as it refreshes, keeping the channel
    // on screen even if its stream has just ended.
    function syncTv() {
        if (!tv.root) return;
        silenceFramedChat();
        if (Date.now() - exploreLives.fetchedAt > LIVE_REFRESH_MS) fetchExploreLives();
        const { own, groups } = tvLives();
        const key = [...own, ...groups.flatMap(group => group.lives)].map(live => `${live.videoId}:${live.viewers ?? ''}`).join(',') +
            groups.map(group => `|${group.name}:${tvGroupOpen(group.name)}`).join('');
        if (key === tv.renderedKey) return;
        tv.renderedKey = key;
        tv.count.textContent = `Modo TV · ${own.length} de quem você segue`;
        // Everything the arrow keys stop on, in screen order: rows and the
        // group headers.
        tv.nav = [];
        let number = 0;
        const row = live => {
            const index = number++;
            const button = tvElement('button', 'ytc-tv-row');
            button.type = 'button';
            button.setAttribute('role', 'option');
            const thumb = tvElement('span', 'ytc-tv-thumb');
            const playing = tvElement('span', 'ytc-tv-playing');
            const eq = tvElement('span', 'ytc-tv-eq');
            eq.append(tvElement('i'), tvElement('i'), tvElement('i'));
            playing.append(eq);
            thumb.append(tvImage('', liveThumb(live.videoId), liveThumbFallback(live.videoId)), tvPill(), playing);
            // Like a video in the up-next list: title first, then channel
            // and audience.
            const text = tvElement('span', 'ytc-tv-text');
            text.append(tvElement('span', 'ytc-tv-title', live.title || live.channel), tvElement('span', 'ytc-tv-channel', live.channel));
            if (live.viewers) text.append(tvElement('span', 'ytc-tv-meta', live.viewers));
            const mark = tvElement('span', 'ytc-tv-number');
            mark.append(tvElement('span', 'ytc-tv-index', String(index + 1)), icon('M8,5.14V19.14L19,12.14L8,5.14Z'));
            button.append(mark, thumb, text);
            button.addEventListener('click', () => tuneTv(index, 0));
            tv.nav.push({ element: button, videoId: live.videoId, index });
            return button;
        };
        const children = own.length
            ? own.map(row)
            : [tvElement('div', 'ytc-tv-none', liveGuide.loaded ? 'Ninguém que você segue está ao vivo agora.' : 'Procurando canais ao vivo…')];
        if (groups.length) {
            children.push(tvElement('div', 'ytc-tv-divider'), tvElement('div', 'ytc-tv-heading', 'Outras lives'));
            for (const group of groups) {
                const open = tvGroupOpen(group.name);
                const header = tvElement('button', `ytc-tv-group${open ? ' is-open' : ''}`);
                header.type = 'button';
                header.setAttribute('aria-expanded', String(open));
                header.append(icon('M8.59,16.58L13.17,12L8.59,7.41L10,6L16,12L10,18L8.59,16.58Z'), tvElement('span', 'ytc-tv-group-name', group.name), tvElement('span', 'ytc-tv-group-count', String(group.lives.length)));
                header.addEventListener('click', () => toggleTvGroup(group.name));
                tv.nav.push({ element: header, group: group.name });
                children.push(header);
                if (open) children.push(...group.lives.map(row));
                else number += group.lives.length;
            }
        }
        tv.list.replaceChildren(...children);
        const cursor = tv.nav.findIndex(entry => entry.videoId === tv.videoId);
        if (cursor >= 0 && !tv.nav[tv.cursor]?.group) tv.cursor = cursor;
        tv.cursor = Math.min(tv.cursor, Math.max(0, tv.nav.length - 1));
        markTvRows();
    }

    function markTvRows() {
        tv.nav.forEach((entry, index) => {
            const current = Boolean(entry.videoId) && entry.videoId === tv.videoId;
            entry.element.classList.toggle('is-current', current);
            if (entry.videoId) entry.element.setAttribute('aria-selected', String(current));
            entry.element.classList.toggle('is-cursor', index === tv.cursor && tvGuideOpen());
        });
        tv.nav[tv.cursor]?.element.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }

    function moveTvCursor(step) {
        const count = tv.nav.length;
        if (!count) return;
        tv.cursor = (tv.cursor + step + count) % count;
        markTvRows();
    }

    // Enter on the list: a row is watched, a group header opens or closes.
    function pickTvCursor() {
        const entry = tv.nav[tv.cursor];
        if (entry?.group) toggleTvGroup(entry.group);
        else if (entry) tuneTv(entry.index, 0);
    }

    function tuneTv(index, delay = TV_TUNE_MS) {
        const list = tvLives().all;
        if (!tv.root || !list.length) return;
        const position = (index + list.length) % list.length;
        const live = list[position];
        const cursor = tv.nav.findIndex(entry => entry.videoId === live.videoId);
        if (cursor >= 0) tv.cursor = cursor;
        if (live.videoId === tv.videoId && tv.frame.src) {
            markTvRows();
            return;
        }
        tv.videoId = live.videoId;
        tv.livePending = true;
        markTvRows();
        showTvBanner(live, position);
        tv.veil.replaceChildren(tvImage('', live.avatar));
        tv.root.classList.add('is-tuning');
        tvLater('tune', delay, () => {
            if (!tv.frame) return;
            let framed = null;
            try {
                framed = tv.frame.contentDocument?.getElementById('movie_player');
            } catch {}
            if (typeof framed?.loadVideoById === 'function') framed.loadVideoById(live.videoId);
            else tv.frame.src = `/watch?v=${encodeURIComponent(live.videoId)}`;
            if (state.tvChat) loadTvChat();
            waitTvPicture(live.videoId);
        });
    }

    // The veil lifts once the new channel's video is actually playing.
    function waitTvPicture(videoId, tries = 0) {
        if (!tv.root || tv.videoId !== videoId) return;
        let ready = false;
        try {
            const framed = tv.frame.contentDocument?.getElementById('movie_player');
            const video = framed?.querySelector('video');
            ready = framed?.getVideoData?.().video_id === videoId && video?.readyState >= 3 && !video.paused;
        } catch {}
        if (ready) keepTvLive();
        if (ready || tries > 60) tv.root.classList.remove('is-tuning');
        else tvLater('picture', 150, () => waitTvPicture(videoId, tries + 1));
    }

    // A live opens a little behind its edge (often where it was last left);
    // TV mode always shows what is on air now.
    // The framed watch page loads its own live chat, hidden behind the
    // player: a second chat streaming for nothing next to ours. Its frame
    // is emptied (YouTube sets it again on each video, hence the check
    // from the 1s refresh).
    function silenceFramedChat() {
        try {
            const chat = tv.frame?.contentDocument?.querySelector('ytd-live-chat-frame iframe');
            if (chat && chat.getAttribute('src') !== 'about:blank') chat.src = 'about:blank';
        } catch {}
    }

    // Once per channel and once per resume: the seek itself fires
    // "playing" again, and the edge check flickers while buffering, so an
    // unguarded call would keep seeking.
    function keepTvLive() {
        if (!tv.livePending) return;
        try {
            const framed = tv.frame?.contentDocument?.getElementById('movie_player');
            if (!framed || framed.classList.contains('ad-showing')) return;
            tv.livePending = false;
            if (framed.getVideoData?.().isLive && framed.isAtLiveHead?.() === false) framed.seekToLiveHead?.();
        } catch {}
    }

    function showTvBanner(live, position) {
        const text = tvElement('div', 'ytc-tv-text');
        const channel = tvElement('div', 'ytc-tv-banner-channel');
        channel.append(tvElement('span', '', live.channel), tvPill());
        const hint = tvElement('div', 'ytc-tv-meta');
        if (live.viewers) hint.append(`${live.viewers} · `);
        hint.append(tvElement('kbd', '', 'G'), 'lista de canais');
        text.append(channel, tvElement('div', 'ytc-tv-title', live.title), hint);
        tv.banner.replaceChildren(tvElement('span', 'ytc-tv-banner-number', String(position + 1)), tvImage('', live.avatar), text);
        tv.root.classList.add('is-banner');
        tvLater('banner', TV_BANNER_MS, () => tv.root?.classList.remove('is-banner'));
    }

    function showTvUi() {
        if (!tv.root) return;
        tv.root.classList.add('is-ui');
        tvLater('ui', TV_UI_MS, () => tv.root?.classList.remove('is-ui'));
    }

    // The chat opens on "Principais mensagens", and switching it to "Chat
    // ao vivo" in its menu leaves it empty for a long while (YouTube's own
    // behaviour). Instead the chat page is read first and the frame opened
    // straight on the "Chat ao vivo" continuation from that menu, which
    // comes up already filled. Without one, the plain chat.
    async function loadTvChat() {
        const videoId = tv.videoId;
        if (!videoId || tv.chatFor === videoId) return;
        tv.chatFor = videoId;
        let src = `/live_chat?v=${encodeURIComponent(videoId)}&dark_theme=1`;
        try {
            const data = parseInitialData(await (await fetch(`/live_chat?v=${encodeURIComponent(videoId)}`, { credentials: 'include' })).text());
            let items = null;
            const walk = (node, depth) => {
                if (items || !node || typeof node !== 'object' || depth > 40) return;
                if (node.sortFilterSubMenuRenderer) items = node.sortFilterSubMenuRenderer.subMenuItems;
                else for (const key in node) walk(node[key], depth + 1);
            };
            walk(data, 0);
            const continuation = items?.[1]?.continuation?.reloadContinuationData?.continuation;
            if (continuation) src = `/live_chat?continuation=${encodeURIComponent(continuation)}&dark_theme=1`;
        } catch {}
        if (tv.chat && tv.chatFor === videoId) tv.chat.src = src;
    }

    // Same pair as the chat toggle in the player bar: outline while hidden,
    // filled while shown.
    function syncTvChatToggle() {
        const button = tv.chatToggle;
        button.classList.toggle('is-on', state.tvChat);
        button.setAttribute('aria-pressed', String(state.tvChat));
        button.querySelector('svg')?.remove();
        button.prepend(icon(state.tvChat ? ICONS.chatOpen : ICONS.chat));
    }

    function toggleTvChat() {
        state.tvChat = !state.tvChat;
        setSetting('tvChat', state.tvChat);
        tv.root.classList.toggle('is-chat', state.tvChat);
        syncTvChatToggle();
        if (state.tvChat) loadTvChat();
    }

    function toggleTvGuide() {
        const open = !tvGuideOpen();
        tv.root.classList.toggle('is-guide', open);
        if (open) tv.cursor = Math.max(0, tv.nav.findIndex(entry => entry.videoId === tv.videoId));
        markTvRows();
        showTvUi();
    }

    function toggleTvFullscreen() {
        if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
        else tv.root.requestFullscreen().catch(() => {});
    }

    // With the list open the arrows browse it and Enter watches; closed,
    // the arrows zap. Numbers, C, F and Esc work either way.
    function onTvKey(event) {
        if (!tv.root || event.ctrlKey || event.metaKey || event.altKey) return;
        const target = event.composedPath()[0];
        if (target instanceof Element && target.closest('input, textarea, [contenteditable=""], [contenteditable="true"]')) return;
        const key = event.key.length === 1 ? event.key.toLowerCase() : event.key;
        const open = tvGuideOpen();
        let handled = true;
        if (key === 'ArrowDown' || key === 'PageDown') open ? moveTvCursor(1) : tuneTv(tvIndex() + 1);
        else if (key === 'ArrowUp' || key === 'PageUp') open ? moveTvCursor(-1) : tuneTv(Math.max(0, tvIndex()) - 1);
        else if (key === 'Enter') open ? pickTvCursor() : toggleTvGuide();
        else if (key === 'ArrowLeft' && open) toggleTvGuide();
        else if (key === 'ArrowRight' && !open) toggleTvGuide();
        else if (key === 'g') toggleTvGuide();
        else if (key === 'Escape') exitTv();
        else if (key === 'f') toggleTvFullscreen();
        else if (key === 'c') toggleTvChat();
        else if (/^[0-9]$/.test(key)) {
            // Two digits typed in quick succession make one channel number.
            tv.digits = (tv.digits + key).slice(-2);
            tvLater('digits', 1000, () => { tv.digits = ''; });
            const number = Number(tv.digits);
            if (number >= 1 && number <= tvLives().all.length) tuneTv(number - 1);
        } else handled = false;
        if (handled) {
            event.preventDefault();
            event.stopImmediatePropagation();
        }
    }

    let settingsTab = 'player';
    const SETTINGS_ICON = 'M3,17V19H9V17H3M3,5V7H13V5H3M13,21V19H21V17H13V15H11V21H13M7,9V11H3V13H7V15H9V9H7M21,13V11H11V13H21M15,9H17V7H21V5H17V3H15V9Z';

    function openGlobalSettings() {
        document.querySelector('.ytc-modal-backdrop')?.remove();
        const make = (tag, className, text) => {
            const element = document.createElement(tag);
            if (className) element.className = className;
            if (text) element.textContent = text;
            return element;
        };

        const backdrop = make('div', 'ytc-modal-backdrop');
        const dialog = make('div', 'ytc-modal');
        dialog.setAttribute('role', 'dialog');
        dialog.setAttribute('aria-modal', 'true');
        dialog.setAttribute('aria-labelledby', 'ytc-modal-title');
        backdrop.append(dialog);

        const head = make('div', 'ytc-modal-head');
        const titles = make('div', 'ytc-modal-titles');
        const title = make('div', 'ytc-modal-title', 'Configurações avançadas');
        title.id = 'ytc-modal-title';
        titles.append(title, make('div', 'ytc-modal-subtitle', 'YouTube Enhancer · salvas automaticamente'));
        const close = make('button', 'ytc-modal-close');
        close.type = 'button';
        close.setAttribute('aria-label', 'Fechar');
        close.append(icon('M19,6.41L17.59,5L12,10.59L6.41,5L5,6.41L10.59,12L5,17.59L6.41,19L12,13.41L17.59,19L19,17.59L13.41,12L19,6.41Z'));
        head.append(icon(SETTINGS_ICON), titles, close);
        const nav = make('div', 'ytc-modal-nav');
        nav.setAttribute('role', 'tablist');
        nav.setAttribute('aria-orientation', 'vertical');
        const body = make('div', 'ytc-modal-body');
        dialog.append(head, nav, body);

        const dependents = [];
        const refreshDependents = () => {
            for (const { row, keys } of dependents) {
                const enabled = keys.every(key => state[key]);
                row.classList.toggle('is-disabled', !enabled);
                for (const input of row.querySelectorAll('input, select, button')) input.disabled = !enabled;
            }
        };
        const changed = (key, value) => {
            state[key] = value;
            setSetting(key, value);
            if (key.startsWith('quality')) qualityFor = '';
            syncGlobal();
            syncQuality();
            refreshDependents();
        };

        const tabs = [];
        const pane = (id, label, path, description) => {
            const tab = make('button', 'ytc-modal-tab');
            tab.type = 'button';
            tab.setAttribute('role', 'tab');
            tab.append(icon(path), make('span', '', label));
            const section = make('section', 'ytc-modal-pane');
            section.setAttribute('role', 'tabpanel');
            section.append(make('h2', '', label), make('p', '', description));
            tab.addEventListener('click', () => select(id));
            nav.append(tab);
            body.append(section);
            tabs.push({ id, tab, section });
            return section;
        };
        const select = id => {
            settingsTab = id;
            for (const entry of tabs) {
                const active = entry.id === id;
                entry.tab.setAttribute('aria-selected', String(active));
                entry.tab.tabIndex = active ? 0 : -1;
                entry.section.hidden = !active;
            }
            body.scrollTop = 0;
        };
        const group = (parent, heading) => {
            const wrapper = make('div', 'ytc-group');
            if (heading) wrapper.append(make('div', 'ytc-group-title', heading));
            const card = make('div', 'ytc-card');
            wrapper.append(card);
            parent.append(wrapper);
            return card;
        };
        const row = (card, tag, label, hint, needs, child) => {
            const element = make(tag, `ytc-row${child ? ' is-child' : ''}`);
            const text = make('span', 'ytc-row-text');
            text.append(make('div', '', label));
            if (hint) text.append(make('div', 'ytc-row-hint', hint));
            element.append(text);
            card.append(element);
            if (needs?.length) dependents.push({ row: element, keys: needs });
            return element;
        };
        const toggle = (card, key, label, { hint = '', needs = [], child = false } = {}) => {
            const element = row(card, 'label', label, hint, needs, child);
            const input = make('input', 'ytc-toggle');
            input.type = 'checkbox';
            input.setAttribute('role', 'switch');
            input.checked = state[key];
            input.addEventListener('change', () => changed(key, input.checked));
            element.append(input);
        };
        const choose = (card, key, label, options, { hint = '', needs = [], child = false } = {}) => {
            const element = row(card, 'label', label, hint, needs, child);
            const field = make('select');
            for (const [value, name] of options) {
                const option = make('option', '', name);
                option.value = value;
                field.append(option);
            }
            field.value = state[key];
            field.addEventListener('change', () => changed(key, field.value));
            element.append(field);
        };
        const slider = (card, key, label, { needs = [], child = false } = {}) => {
            const element = row(card, 'label', label, '', needs, child);
            const range = make('input');
            range.type = 'range';
            range.min = '0';
            range.max = '200';
            range.step = '5';
            range.value = String(state[key]);
            const output = make('output', '', `${state[key]}%`);
            range.addEventListener('input', () => {
                output.textContent = `${range.value}%`;
                changed(key, Number(range.value));
            });
            element.append(range, output);
            return { range, output };
        };

        // Player
        const playerPane = pane('player', 'Player', 'M10,16.5V7.5L16,12M20,4.4C19.4,4.2 15.7,4 12,4C8.3,4 4.6,4.19 4,4.38C2.44,4.9 2,8.4 2,12C2,15.59 2.44,19.1 4,19.61C4.6,19.81 8.3,20 12,20C15.7,20 19.4,19.81 20,19.61C21.56,19.1 22,15.59 22,12C22,8.4 21.56,4.91 20,4.4Z', 'Como cada vídeo abre e aparece.');
        const opening = group(playerPane, 'Ao abrir um vídeo');
        toggle(opening, 'autoTheater', 'Modo teatro automático', { hint: 'O player ocupa a tela, com as laterais ao lado.' });
        toggle(opening, 'hideCards', 'Ocultar cards e tela final', { hint: 'Cards de informação e elementos do criador no fim do vídeo.' });
        const filters = group(playerPane, 'Filtros de vídeo');
        toggle(filters, 'filtersOn', 'Aplicar filtros automaticamente');
        const sliders = [
            ['filterBrightness', 'Brilho'],
            ['filterContrast', 'Contraste'],
            ['filterSaturation', 'Saturação'],
        ].map(([key, label]) => [key, slider(filters, key, label, { needs: ['filtersOn'], child: true })]);
        const resetRow = row(filters, 'div', 'Valores originais', '', ['filtersOn'], true);
        const reset = make('button', 'ytc-text-button', 'Redefinir');
        reset.type = 'button';
        reset.addEventListener('click', () => {
            for (const [key, { range, output }] of sliders) {
                range.value = '100';
                output.textContent = '100%';
                changed(key, 100);
            }
        });
        resetRow.append(reset);

        // Quality
        const qualityPane = pane('quality', 'Qualidade', ICONS.quality, 'A resolução escolhida ao abrir um vídeo; sem ela, fica a melhor abaixo.');
        const auto = group(qualityPane, 'Padrão');
        toggle(auto, 'qualityAuto', 'Selecionar automaticamente');
        choose(auto, 'qualityVideos', 'Vídeos', QUALITIES, { needs: ['qualityAuto'], child: true });
        choose(auto, 'qualityPlaylists', 'Playlists', QUALITIES, { needs: ['qualityAuto'], child: true });
        const full = group(qualityPane, 'Tela cheia');
        toggle(full, 'qualityFsDifferent', 'Usar outra qualidade em tela cheia', { needs: ['qualityAuto'] });
        choose(full, 'qualityFsVideos', 'Vídeos', QUALITIES, { needs: ['qualityAuto', 'qualityFsDifferent'], child: true });
        choose(full, 'qualityFsPlaylists', 'Playlists', QUALITIES, { needs: ['qualityAuto', 'qualityFsDifferent'], child: true });
        toggle(full, 'qualityFsRestore', 'Voltar à anterior ao sair', { hint: 'Desligado, a qualidade da tela cheia continua.', needs: ['qualityAuto', 'qualityFsDifferent'], child: true });

        // Shorts
        const shortsPane = pane('shorts', 'Shorts', 'M10,14.65V9.35L15,12L10,14.65M17.77,10.32L16.57,9.82L17.77,9.18C19.27,8.38 19.83,6.5 19.03,5C18.23,3.5 16.35,2.94 14.85,3.74L6.23,8.32C5.07,8.94 4.38,10.18 4.46,11.5C4.54,12.81 5.38,13.95 6.6,14.42L7.8,14.92L6.6,15.56C5.1,16.36 4.54,18.24 5.34,19.74C6.14,21.24 8.02,21.8 9.52,21L18.14,16.42C19.3,15.8 20,14.56 19.91,13.24C19.83,11.93 19,10.79 17.77,10.32Z', 'Onde os Shorts somem do YouTube.');
        const where = group(shortsPane, 'Ocultar em');
        toggle(where, 'shortsHome', 'Feed inicial');
        toggle(where, 'shortsSubs', 'Feed de inscrições');
        toggle(where, 'shortsSearch', 'Resultados de busca');
        toggle(where, 'shortsWatch', 'Páginas de vídeo', { hint: 'Na lista de próximos vídeos.' });
        toggle(where, 'shortsChannel', 'Páginas de canal', { hint: 'Prateleiras e a aba Shorts.' });
        toggle(where, 'shortsSidebar', 'Menu lateral', { hint: 'O atalho Shorts no menu da esquerda.' });

        // Sidebar
        const livePane = pane('live', 'Ao vivo', LIVE_ICON, 'A seção no menu da esquerda, o Modo TV e a aba Ao vivo dos canais.');
        const subsGroup = group(livePane, 'Menu lateral');
        toggle(subsGroup, 'liveSection', 'Seção Ao vivo', { hint: 'Canais inscritos transmitindo agora, em ordem alfabética, acima de Inscrições.' });
        toggle(subsGroup, 'liveTv', 'Modo TV', { hint: 'No topo da seção: os canais ao vivo em tela cheia, trocados pelas setas.', needs: ['liveSection'], child: true });
        const channelGroup = group(livePane, 'Páginas de canal');
        toggle(channelGroup, 'liveNowFilter', 'Abrir em Transmitindo agora', { hint: 'Na aba Ao vivo, só o que está no ar; o filtro desliga ali mesmo.' });

        select(tabs.some(entry => entry.id === settingsTab) ? settingsTab : 'player');
        refreshDependents();

        // Arrow keys move between tabs, like a tab list.
        nav.addEventListener('keydown', event => {
            if (!['ArrowDown', 'ArrowUp', 'ArrowLeft', 'ArrowRight'].includes(event.key)) return;
            event.preventDefault();
            const index = tabs.findIndex(entry => entry.id === settingsTab);
            const next = tabs[(index + (event.key === 'ArrowDown' || event.key === 'ArrowRight' ? 1 : tabs.length - 1)) % tabs.length];
            select(next.id);
            next.tab.focus();
        });
        const dismiss = () => {
            backdrop.remove();
            document.removeEventListener('keydown', onKey, true);
        };
        const onKey = event => {
            if (event.key !== 'Escape') return;
            event.stopImmediatePropagation();
            dismiss();
        };
        document.addEventListener('keydown', onKey, true);
        close.addEventListener('click', dismiss);
        backdrop.addEventListener('mousedown', event => {
            if (event.target === backdrop) dismiss();
        });
        // Keys typed in the dialog are not player shortcuts.
        dialog.addEventListener('keydown', event => event.stopPropagation());
        document.body.append(backdrop);
        tabs.find(entry => entry.id === settingsTab)?.tab.focus();
    }

    // ---------------------------------------------------------------------
    //  First run: a short walkthrough of where everything lives, each step
    //  with a small drawing of the real control highlighted. The last step
    //  sets the default quality on the spot, since it starts off. Shown once.
    // ---------------------------------------------------------------------
    let onboardingShown = Boolean(getSetting('onboarded', false));
    function showOnboarding() {
        if (onboardingShown || window.top !== window || !document.body || !document.querySelector('ytd-app')) return;
        onboardingShown = true;
        setSetting('onboarded', true);
        const make = (tag, className, text) => {
            const element = document.createElement(tag);
            if (className) element.className = className;
            if (text) element.textContent = text;
            return element;
        };
        const glyph = (path, options, className = '') => {
            const svg = icon(path, options);
            if (className) svg.classList.add(className);
            return svg;
        };
        const LOGO = 'M10,15L15.19,12L10,9V15M21.56,7.17C21.69,7.64 21.78,8.27 21.84,9.07C21.91,9.87 21.94,10.56 21.94,11.16L22,12C22,14.19 21.84,15.8 21.56,16.83C21.31,17.73 20.73,18.31 19.83,18.56C19.36,18.69 18.5,18.78 17.18,18.84C15.88,18.91 14.69,18.94 13.59,18.94L12,19C7.81,19 5.2,18.84 4.17,18.56C3.27,18.31 2.69,17.73 2.44,16.83C2.31,16.36 2.22,15.73 2.16,14.93C2.09,14.13 2.06,13.44 2.06,12.84L2,12C2,9.81 2.16,8.2 2.44,7.17C2.69,6.27 3.27,5.69 4.17,5.44C4.64,5.31 5.5,5.22 6.82,5.16C8.12,5.09 9.31,5.06 10.41,5.06L12,5C16.19,5 18.8,5.16 19.83,5.44C20.73,5.69 21.31,6.27 21.56,7.17Z';
        const PLAY = 'M8,5.14V19.14L19,12.14L8,5.14Z';
        const VOLUME = 'M14,3.23V5.29C16.89,6.15 19,8.83 19,12C19,15.17 16.89,17.84 14,18.7V20.77C18,19.86 21,16.28 21,12C21,7.72 18,4.14 14,3.23M16.5,12C16.5,10.23 15.5,8.71 14,7.97V16C15.5,15.29 16.5,13.76 16.5,12M3,9V15H7L12,20V4L7,9H3Z';
        const FULLSCREEN = 'M5,5H10V7H7V10H5V5M14,5H19V10H17V7H14V5M17,14H19V19H14V17H17V14M10,17V19H5V14H7V17H10Z';
        const CHEVRON = 'M8.59,16.58L13.17,12L8.59,7.41L10,6L16,12L10,18L8.59,16.58Z';

        // Drawings, one per step.
        const art = {
            welcome() {
                const box = make('div', 'ytc-ob-hero');
                const logo = make('div', 'ytc-ob-logo');
                logo.append(glyph(LOGO), make('span', '', 'Enhancer'));
                const chips = make('div', 'ytc-ob-chips');
                for (const label of ['Modo teatro', 'Loop', 'Amplificador', 'Velocidade', 'Ao vivo', 'Sem Shorts']) chips.append(make('span', 'ytc-ob-chip', label));
                box.append(logo, chips);
                return box;
            },
            bar() {
                const box = make('div', 'ytc-ob-player');
                const progress = make('div', 'ytc-ob-progress');
                progress.append(make('i'));
                const bar = make('div', 'ytc-ob-bar');
                bar.append(glyph(PLAY, undefined, 'is-dim'), glyph(VOLUME, undefined, 'is-dim'), make('span', 'ytc-ob-time', '4:12 / 12:30'), make('span', 'ytc-ob-gap'));
                const ours = make('span', 'ytc-ob-ours');
                ours.append(glyph(ICONS.loop), glyph(ICONS.boost, BOOST_ICON), glyph(ICONS.speed), glyph(ICONS.chat), glyph(ICONS.related));
                bar.append(ours, glyph(SETTINGS_ICON, undefined, 'is-dim'), glyph(FULLSCREEN, undefined, 'is-dim'));
                box.append(make('div', 'ytc-ob-screen'), progress, bar);
                return box;
            },
            gear() {
                const box = make('div', 'ytc-ob-stage');
                const menu = make('div', 'ytc-ob-menu is-player');
                for (const [path, label, value, ours] of [
                    [ICONS.cinema, 'Player', '', true],
                    [ICONS.boost, 'Áudio', '', true],
                    [ICONS.speed, 'Velocidade', 'Normal', false],
                    [ICONS.quality, 'Qualidade', 'Auto 1080p', false],
                ]) {
                    const row = make('div', `ytc-ob-row${ours ? ' is-ours' : ''}`);
                    row.append(path === ICONS.boost ? glyph(path, BOOST_ICON) : glyph(path), make('span', '', label), make('span', 'ytc-ob-value', value), glyph(CHEVRON));
                    menu.append(row);
                }
                box.append(menu);
                return box;
            },
            account() {
                const box = make('div', 'ytc-ob-stage');
                const menu = make('div', 'ytc-ob-menu is-account');
                const who = make('div', 'ytc-ob-who');
                who.append(make('span', 'ytc-ob-avatar'), make('span', '', 'Seu canal'));
                menu.append(who);
                for (const [path, label, ours] of [
                    ['M12,15.5A3.5,3.5 0 0,1 8.5,12A3.5,3.5 0 0,1 12,8.5A3.5,3.5 0 0,1 15.5,12A3.5,3.5 0 0,1 12,15.5M19.43,12.97C19.47,12.65 19.5,12.33 19.5,12C19.5,11.67 19.47,11.34 19.43,11L21.54,9.37C21.73,9.22 21.78,8.95 21.66,8.73L19.66,5.27C19.54,5.05 19.27,4.96 19.05,5.05L16.56,6.05C16.04,5.66 15.5,5.32 14.87,5.07L14.5,2.42C14.46,2.18 14.25,2 14,2H10C9.75,2 9.54,2.18 9.5,2.42L9.13,5.07C8.5,5.32 7.96,5.66 7.44,6.05L4.95,5.05C4.73,4.96 4.46,5.05 4.34,5.27L2.34,8.73C2.21,8.95 2.27,9.22 2.46,9.37L4.57,11C4.53,11.34 4.5,11.67 4.5,12C4.5,12.33 4.53,12.65 4.57,12.97L2.46,14.63C2.27,14.78 2.21,15.05 2.34,15.27L4.34,18.73C4.46,18.95 4.73,19.03 4.95,18.95L7.44,17.94C7.96,18.34 8.5,18.68 9.13,18.93L9.5,21.58C9.54,21.82 9.75,22 10,22H14C14.25,22 14.46,21.82 14.5,21.58L14.87,18.93C15.5,18.67 16.04,18.34 16.56,17.94L19.05,18.95C19.27,19.03 19.54,18.95 19.66,18.73L21.66,15.27C21.78,15.05 21.73,14.78 21.54,14.63L19.43,12.97Z', 'Configurações', false],
                    [SETTINGS_ICON, 'Configurações avançadas', true],
                ]) {
                    const row = make('div', `ytc-ob-row${ours ? ' is-ours' : ''}`);
                    row.append(glyph(path), make('span', '', label));
                    menu.append(row);
                }
                box.append(menu);
                return box;
            },
            playlist() {
                const box = make('div', 'ytc-ob-stage');
                const menu = make('div', 'ytc-ob-menu is-player');
                for (const [path, label, value] of [
                    [SIDE_VIEWS[0].icon, 'Playlist', '12 / 305'],
                    [SIDE_VIEWS[1].icon, 'Próximos', ''],
                    [PL_ICON, 'Avançado', 'Busca, ordem, filtros'],
                ]) {
                    const row = make('div', 'ytc-ob-row is-ours');
                    row.append(glyph(path), make('span', '', label), make('span', 'ytc-ob-value', value));
                    menu.append(row);
                }
                box.append(menu);
                return box;
            },
            quality() {
                const box = make('div', 'ytc-ob-form');
                const field = (label, key) => {
                    const row = make('label', 'ytc-ob-field');
                    const select = make('select');
                    for (const [value, name] of QUALITIES) {
                        const option = make('option', '', name);
                        option.value = value;
                        select.append(option);
                    }
                    select.value = state[key];
                    select.disabled = !state.qualityAuto;
                    select.addEventListener('change', () => {
                        state[key] = select.value;
                        setSetting(key, select.value);
                        qualityFor = '';
                    });
                    row.append(make('span', '', label), select);
                    return row;
                };
                const toggleRow = make('label', 'ytc-ob-field is-switch');
                const input = make('input', 'ytc-toggle');
                input.type = 'checkbox';
                input.setAttribute('role', 'switch');
                input.checked = state.qualityAuto;
                toggleRow.append(make('span', '', 'Escolher a qualidade automaticamente'), input);
                const videos = field('Vídeos', 'qualityVideos');
                const playlists = field('Playlists', 'qualityPlaylists');
                input.addEventListener('change', () => {
                    state.qualityAuto = input.checked;
                    setSetting('qualityAuto', input.checked);
                    qualityFor = '';
                    for (const select of box.querySelectorAll('select')) select.disabled = !input.checked;
                    syncQuality();
                });
                box.append(toggleRow, videos, playlists);
                return box;
            },
        };
        const steps = [
            { art: 'welcome', title: 'Bem-vindo ao YouTube Enhancer', text: 'Modo teatro com chat e próximos vídeos nas laterais, controles extras no player e ajustes que o YouTube não tem. Em cinco passos, onde fica cada coisa.' },
            { art: 'bar', title: 'Na barra do player', text: 'Loop, amplificador de áudio, velocidade (role a roda do mouse sobre ela) e os botões do chat e dos próximos vídeos ficam junto dos controles do YouTube.' },
            { art: 'gear', title: 'Na engrenagem do player', text: 'Player e Áudio abrem as opções do player: largura das laterais, cortar faixas pretas, volume padrão e o nível do amplificador.' },
            { art: 'account', title: 'No menu da sua foto', text: 'Configurações avançadas reúne o resto: qualidade, filtros de vídeo, cards, onde esconder Shorts e a seção Ao vivo do menu lateral.' },
            { art: 'playlist', title: 'Nas playlists', text: 'Com os próximos vídeos ao lado, o topo da lateral alterna entre a playlist e os próximos. Avançado, no cabeçalho da playlist, lê a lista inteira com busca, ordem e filtros, e toca na ordem escolhida.' },
            { art: 'quality', title: 'Qualidade padrão', text: 'Vem desligada: o YouTube escolhe sozinho. Ligue para abrir todo vídeo na qualidade que você quer — dá pra mudar depois em Configurações avançadas.' },
        ];

        const backdrop = make('div', 'ytc-modal-backdrop');
        const card = make('div', 'ytc-modal ytc-onboard');
        card.setAttribute('role', 'dialog');
        card.setAttribute('aria-modal', 'true');
        card.setAttribute('aria-labelledby', 'ytc-ob-title');
        const stage = make('div', 'ytc-ob-art');
        const content = make('div', 'ytc-ob-content');
        const counter = make('div', 'ytc-ob-counter');
        const title = make('div', 'ytc-ob-title');
        title.id = 'ytc-ob-title';
        const text = make('p', 'ytc-ob-text');
        content.append(counter, title, text);
        const foot = make('div', 'ytc-ob-foot');
        const dots = make('div', 'ytc-ob-dots');
        for (let i = 0; i < steps.length; i++) dots.append(make('i'));
        const back = make('button', 'ytc-text-button', 'Voltar');
        const next = make('button', 'ytc-text-button ytc-primary');
        for (const button of [back, next]) button.type = 'button';
        foot.append(dots, back, next);
        card.append(stage, content, foot);
        backdrop.append(card);

        let index = 0;
        const show = step => {
            index = Math.max(0, Math.min(steps.length - 1, step));
            const spec = steps[index];
            const drawing = art[spec.art]();
            drawing.classList.add('ytc-ob-enter');
            stage.replaceChildren(drawing);
            counter.textContent = `${index + 1} de ${steps.length}`;
            title.textContent = spec.title;
            text.textContent = spec.text;
            [...dots.children].forEach((dot, i) => dot.classList.toggle('is-on', i === index));
            back.textContent = index === 0 ? 'Pular' : 'Voltar';
            next.textContent = index === steps.length - 1 ? 'Concluir' : index === 0 ? 'Começar' : 'Próximo';
            next.focus();
        };
        const dismiss = () => {
            backdrop.remove();
            document.removeEventListener('keydown', onKey, true);
        };
        const onKey = event => {
            if (event.key === 'Escape') dismiss();
            else if (event.key === 'ArrowRight' && index < steps.length - 1) show(index + 1);
            else if (event.key === 'ArrowLeft') show(index - 1);
            else return;
            event.stopImmediatePropagation();
            event.preventDefault();
        };
        back.addEventListener('click', () => (index === 0 ? dismiss() : show(index - 1)));
        next.addEventListener('click', () => (index === steps.length - 1 ? dismiss() : show(index + 1)));
        document.addEventListener('keydown', onKey, true);
        backdrop.addEventListener('mousedown', event => {
            if (event.target === backdrop) dismiss();
        });
        card.addEventListener('keydown', event => event.stopPropagation());
        document.body.append(backdrop);
        show(0);
    }

    // The entry sits right after YouTube's own "Settings" link (/account) in
    // the account (or signed-out) menu's main page.
    function syncMenuEntry() {
        const menu = document.querySelector('ytd-popup-container ytd-multi-page-menu-renderer');
        if (!menu || !menu.querySelector('ytd-toggle-theme-compact-link-renderer')) return;
        if (menu.querySelector('.ytc-menu-entry')) return;
        const settingsLink = [...menu.querySelectorAll('ytd-compact-link-renderer')]
            .find(link => link.querySelector('a[href$="/account"]'));
        const items = menu.querySelector('yt-multi-page-menu-section-renderer #items');
        if (!settingsLink && !items) return;
        const entry = document.createElement('div');
        entry.className = 'ytc-menu-entry';
        entry.setAttribute('role', 'menuitem');
        entry.tabIndex = 0;
        const label = document.createElement('span');
        label.textContent = 'Configurações avançadas';
        entry.append(icon(SETTINGS_ICON), label);
        const activate = () => {
            menu.closest('tp-yt-iron-dropdown')?.close?.();
            openGlobalSettings();
        };
        entry.addEventListener('click', activate);
        entry.addEventListener('keydown', event => {
            if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                activate();
            }
        });
        if (settingsLink) settingsLink.after(entry);
        else items.prepend(entry);
    }

    // The menu renders a moment after its button is pressed.
    document.addEventListener('click', event => {
        if (!(event.target instanceof Element) || !event.target.closest('#avatar-btn, ytd-topbar-menu-button-renderer')) return;
        let tries = 0;
        const timer = setInterval(() => {
            syncMenuEntry();
            if (++tries >= 20) clearInterval(timer);
        }, 100);
    }, true);

    function refresh() {
        enforceTheater();
        enhancePlayer();
        syncSettingsMenu();
        expandPlaylist();
        syncPlaylistAdvanced();
        placeChat();
        syncPlaylistButtons();
        syncBarControls();
        syncGlobal();
        syncQuality();
        // A speed changed elsewhere has been taken as the choice by now
        // (ratechange), so a mismatch here is YouTube's reset on load.
        applyRate();
        flushPendingStep();
        syncLayout();
        cropBlackBars();
        syncLiveSection();
        syncLiveFilter();
        syncLiveHub();
        syncTvPage();
        syncTv();
        showOnboarding();
    }

    // YouTube is a single-page app with a very busy DOM: react to its own
    // navigation events, and poll lightly for the player and chat, which
    // mount asynchronously after them.
    // Page classes go first, so shorts never flash on in-app navigation.
    document.addEventListener('yt-navigate-finish', () => {
        syncGlobal();
        syncLiveFilter();
    });
    // TV mode's page hides YouTube's app from the first paint.
    if (location.pathname === TV_PATH) document.documentElement?.classList.add('ytc-tv-page');
    document.addEventListener('DOMContentLoaded', syncTvPage);
    syncGlobal();
    for (const type of ['yt-navigate-finish', 'yt-page-data-updated', 'fullscreenchange']) {
        document.addEventListener(type, () => requestAnimationFrame(refresh));
    }
    setInterval(refresh, 1000);
    // The player resizes its video on window resize; follow it at once.
    window.addEventListener('resize', () => requestAnimationFrame(cropBlackBars));

})();
