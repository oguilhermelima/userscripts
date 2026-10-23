// ==UserScript==
// @name         YouTube — Cinema Player, Sidebars & Advanced Settings
// @namespace    youtube-cinema
// @version      1.0.1
// @author       oguilhermelima
// @description  Full-screen theater by default with an auto-hiding masthead, live chat and up-next as switchable sidebars, black-bar crop, loop, audio boost, speed and quality controls in the player bar, and advanced settings for playback quality, video filters, info cards and Shorts.
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
        hideCards: Boolean(getSetting('hideCards', true)),
        filtersOn: Boolean(getSetting('filtersOn', true)),
        filterBrightness: Number(getSetting('filterBrightness', 100)),
        filterContrast: Number(getSetting('filterContrast', 100)),
        filterSaturation: Number(getSetting('filterSaturation', 100)),
        qualityAuto: Boolean(getSetting('qualityAuto', true)),
        qualityVideos: String(getSetting('qualityVideos', 'hd1440')),
        qualityPlaylists: String(getSetting('qualityPlaylists', 'hd1080')),
        qualityFsDifferent: Boolean(getSetting('qualityFsDifferent', true)),
        qualityFsVideos: String(getSetting('qualityFsVideos', 'hd1440')),
        qualityFsPlaylists: String(getSetting('qualityFsPlaylists', 'hd1440')),
        qualityFsRestore: Boolean(getSetting('qualityFsRestore', false)),
        shortsChannel: Boolean(getSetting('shortsChannel', false)),
        shortsHome: Boolean(getSetting('shortsHome', true)),
        shortsSearch: Boolean(getSetting('shortsSearch', false)),
        shortsSidebar: Boolean(getSetting('shortsSidebar', true)),
        shortsWatch: Boolean(getSetting('shortsWatch', true)),
        shortsSubs: Boolean(getSetting('shortsSubs', true)),
        cropBars: Boolean(getSetting('cropBars', true)),
        sideWidth: Number(getSetting('sideWidth', 0)) || 0,
        rate: Number(getSetting('rate', 1)) || 1,
        // Audio boost works like a switch at a chosen level; the options
        // live in the player settings menu.
        boostLevel: Number(getSetting('boostLevel', 2)) || 2,
        autoBoost: Boolean(getSetting('autoBoost', false)),
        boostOn: Boolean(getSetting('autoBoost', false)),
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
            border-left: 1px solid var(--yt-spec-10-percent-layer, rgba(255, 255, 255, 0.1));
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
        root.style.setProperty('--ytc-masthead-h', active ? '0px' : `${height}px`);
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

    function syncLayout() {
        const flexy = watchFlexy();
        const theater = Boolean(flexy?.hasAttribute('theater'));
        const chat = hasChat();
        const root = document.documentElement;
        root.classList.toggle('ytc-chat-hidden', theater && chat && !state.chatVisible);
        root.classList.toggle('ytc-related-sidebar', theater && relatedShown());
        root.style.setProperty('--ytc-chat-size', `${state.sideWidth}px`);
        root.style.setProperty('--ytc-related-w', `${state.sideWidth || RELATED_WIDTH}px`);

        // The up-next sidebar sits left of YouTube's pinned chat.
        const chatContainer = flexy?.querySelector('#chat-container');
        const chatWidth = theater && chat && state.chatVisible && chatContainer
            ? Math.round(chatContainer.querySelector('ytd-live-chat-frame')?.getBoundingClientRect().width ?? 0)
            : 0;
        root.style.setProperty('--ytc-chat-w', `${chatWidth}px`);
        // Only a chat actually on screen is resized and given room: a
        // collapsed chat replay has no width and must not reserve any.
        root.classList.toggle('ytc-chat-sized', theater && state.sideWidth > 0 && chatWidth > 0);
        syncMasthead(flexy);
        // The pinned sidebar takes the page's own background, light or dark.
        const pageBg = getComputedStyle(document.querySelector('ytd-app') ?? document.body).backgroundColor;
        if (pageBg && pageBg !== 'rgba(0, 0, 0, 0)') root.style.setProperty('--ytc-page-bg', pageBg);

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
        root.style.setProperty('--ytc-top-w', visibleButtons ? `${visibleButtons * 44 + 16}px` : '0px');
        // Line our buttons up with YouTube's info button when it is there.
        const info = document.querySelector('#movie_player .ytp-cards-button');
        const host = player();
        const infoBox = info?.getBoundingClientRect();
        if (host && infoBox?.height) {
            const pill = host.querySelector(':scope > .ytc-top-controls');
            const top = infoBox.top - host.getBoundingClientRect().top + infoBox.height / 2 - (pill?.offsetHeight ?? 48) / 2;
            root.style.setProperty('--ytc-top-y', `${Math.round(top)}px`);
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
        video.style.setProperty('--ytc-crop-k', k.toFixed(4));
        video.style.setProperty('--ytc-crop-x', `${tx.toFixed(1)}px`);
        video.style.setProperty('--ytc-crop-y', `${ty.toFixed(1)}px`);
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
        const ref = player()?.querySelector('.ytp-mute-button svg');
        const want = ref ? inkSize(ref) : 0;
        if (!svg || !want) return;
        // absolute, from the glyph's own geometry: calling it again never compounds
        const box = svg.getBBox(), vb = svg.viewBox.baseVal;
        const perUnit = want / Math.max(box.width, box.height);
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
        // The menu sized itself to its items when it opened.
        const panel = list.closest('.ytp-panel');
        if (changed && menu.offsetParent && panel) {
            const height = `${list.scrollHeight}px`;
            menu.style.height = height;
            panel.style.height = height;
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
        root.style.setProperty('--ytc-f-brightness', String(state.filterBrightness / 100));
        root.style.setProperty('--ytc-f-contrast', String(state.filterContrast / 100));
        root.style.setProperty('--ytc-f-saturation', String(state.filterSaturation / 100));
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
        titles.append(title, make('div', 'ytc-modal-subtitle', 'YouTube Cinema · salvas automaticamente'));
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
    }

    // YouTube is a single-page app with a very busy DOM: react to its own
    // navigation events, and poll lightly for the player and chat, which
    // mount asynchronously after them.
    // Page classes go first, so shorts never flash on in-app navigation.
    document.addEventListener('yt-navigate-finish', syncGlobal);
    syncGlobal();
    for (const type of ['yt-navigate-finish', 'yt-page-data-updated', 'fullscreenchange']) {
        document.addEventListener(type, () => requestAnimationFrame(refresh));
    }
    setInterval(refresh, 1000);
    // The player resizes its video on window resize; follow it at once.
    window.addEventListener('resize', () => requestAnimationFrame(cropBlackBars));

})();
