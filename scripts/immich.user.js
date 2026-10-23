// ==UserScript==
// @name         Immich — YouTube-Style Player & Album Sidebar
// @namespace    immich-player
// @version      2.0.0
// @author       oguilhermelima
// @description  YouTube-style video player for Immich: original quality with automatic fallback, 0.25x–5x speed, audio boost, arrow keys that seek instead of switching assets, J/K/L shortcuts, reorganised bars, picture-in-picture and a collapsible album sidebar. Add your own server as a user @match in your userscript manager.
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

    function knownOrigins() {
        try {
            const list = GM_getValue(KNOWN_ORIGINS_KEY, []);
            return Array.isArray(list) ? list : [];
        } catch {
            return [];
        }
    }

    if (location.hostname === 'demo.immich.app' || knownOrigins().includes(location.origin)) {
        immichPlayer();
        return;
    }
    fetch('/api/server/ping', { credentials: 'same-origin' })
        .then(response => (response.ok ? response.json() : null))
        .then(body => {
            if (body?.res !== 'pong') return;
            try {
                GM_setValue(KNOWN_ORIGINS_KEY, [...knownOrigins(), location.origin]);
            } catch {}
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
        const ORIGINAL_PREF = 'always-load-original-video';

        const RATE_MIN = 0.25;
        const RATE_MAX = 5;
        const RATE_STEP = 0.25;
        const RATE_PRESETS = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2, 2.5, 3, 4, 5];
        const BOOST_MAX = 2;
        const BOOST_STEP = 0.1;
        const BOOST_PRESETS = [1, 1.25, 1.5, 2];
        const SEEK_SHORT = 5;
        const SEEK_LONG = 10;
        const FRAME = 1 / 30;
        const SIDEBAR_WIDTH = 420;

        const ICONS = {
            previous: 'M6,18V6H8V18H6M9.5,12L18,6V18L9.5,12Z',
            next: 'M16,18H18V6H16M6,18L14.5,12L6,6V18Z',
            rewind: 'M12.5,3C17.15,3 21.08,6.03 22.47,10.22L20.1,11C19.05,7.81 16.04,5.5 12.5,5.5C10.54,5.5 8.77,6.22 7.38,7.38L10,10H3V3L5.6,5.6C7.45,4 9.85,3 12.5,3Z',
            forward: 'M11.5,3C14.15,3 16.55,4 18.4,5.6L21,3V10H14L16.62,7.38C15.23,6.22 13.46,5.5 11.5,5.5C7.96,5.5 4.95,7.81 3.9,11L1.53,10.22C2.92,6.03 6.85,3 11.5,3Z',
            loop: 'M17,17H7V14L3,18L7,22V19H19V13H17M7,7H17V10L21,6L17,2V5H5V11H7V7Z',
            boost: 'M3,9H7L12,4V20L7,15H3V9M14,11H17V8H19V11H22V13H19V16H17V13H14V11Z',
            pip: 'M19,11H11V17H19V11M23,19V5C23,3.88 22.1,3 21,3H3A2,2 0 0,0 1,5V19A2,2 0 0,0 3,21H21A2,2 0 0,0 23,19M21,19H3V4.97H21V19Z',
            sidebar: 'M3,4H21A1,1 0 0,1 22,5V19A1,1 0 0,1 21,20H3A1,1 0 0,1 2,19V5A1,1 0 0,1 3,4M4,6V18H14V6H4M16,6V18H20V6H16Z',
        };

        function icon(path, size = 24, label = '') {
            const text = label ? `<text x="12" y="21.5" fill="currentColor" font-size="10" font-weight="700" text-anchor="middle" font-family="system-ui, sans-serif">${label}</text>` : '';
            return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="${path}"/>${text}</svg>`;
        }

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

        const state = {
            rate: clampRate(Number(getSetting('rate', 1)) || 1),
            boost: clampBoost(Number(getSetting('boost', 1)) || 1),
            // Immich loops videos by default. Loop and autoplay exclude each
            // other: a looping video never ends, so autoplay would never fire.
            loop: Boolean(getSetting('loop', true)),
            autoplay: Boolean(getSetting('autoplay', false)) && !getSetting('loop', true),
            sidebarOpen: Boolean(getSetting('sidebarOpen', true)),
            filter: getSetting('sidebarFilter', 'all'),
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
        GM_addStyle(`
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
            html:not(.dark) #iv-sidebar {
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

            /* Bottom bar. Left: loop, play, previous, next, volume, time.
               Right: autoplay, -5s, +5s, boost, speed, picture-in-picture,
               fullscreen.
               media-control-bar is a flex host and slotted children are its
               flex items, so order applies. */
            ${PLAYER} media-control-bar > .iv-loop { order: 1; }
            ${PLAYER} media-control-bar > media-play-button { order: 2; }
            ${PLAYER} media-control-bar > .iv-previous { order: 3; }
            ${PLAYER} media-control-bar > .iv-next { order: 4; }
            ${PLAYER} media-control-bar > .volume-wrapper { order: 5; }
            ${PLAYER} media-control-bar > media-time-display { order: 6; }
            ${PLAYER} media-control-bar > .grow { order: 7; }
            ${PLAYER} media-control-bar > .iv-autoplay { order: 8; }
            ${PLAYER} media-control-bar > .iv-rewind { order: 9; }
            ${PLAYER} media-control-bar > .iv-forward { order: 10; }
            ${PLAYER} media-control-bar > .iv-dial-boost { order: 11; }
            ${PLAYER} media-control-bar > .iv-dial-rate { order: 12; }
            ${PLAYER} media-control-bar > .iv-pip { order: 13; }
            ${PLAYER} media-control-bar > media-fullscreen-button { order: 14; }
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
            .iv-control:hover:not(:disabled) { background: rgba(255, 255, 255, 0.15); }
            .iv-control:disabled { opacity: 0.35; cursor: default; }
            .iv-control.is-active { color: var(--iv-accent); }

            /* Autoplay switch, YouTube style: a track with a play-icon thumb. */
            .iv-autoplay { width: 52px; }
            .iv-autoplay-track {
                position: relative;
                width: 36px;
                height: 14px;
                border-radius: 999px;
                background: rgba(255, 255, 255, 0.3);
                transition: background 0.15s ease;
            }
            .iv-autoplay-thumb {
                position: absolute;
                top: 50%;
                left: 0;
                display: grid;
                place-items: center;
                width: 20px;
                height: 20px;
                border-radius: 999px;
                background: #d4d4d8;
                color: #18181b;
                transform: translateY(-50%);
                transition: left 0.15s ease, background 0.15s ease;
            }
            .iv-autoplay-thumb svg { width: 12px; height: 12px; }
            .iv-autoplay.is-active .iv-autoplay-track { background: color-mix(in srgb, var(--iv-accent) 55%, transparent); }
            .iv-autoplay.is-active .iv-autoplay-thumb { left: 16px; background: #fff; }
            .iv-control svg { width: 22px; height: 22px; }

            .iv-dial {
                position: relative;
                display: flex;
                align-items: center;
                flex-shrink: 0;
            }
            .iv-dial-button {
                display: flex;
                align-items: center;
                justify-content: center;
                gap: 4px;
                min-width: 40px;
                height: 40px;
                padding: 0 10px;
                border: 0;
                border-radius: 999px;
                background: transparent;
                color: #fff;
                font: 600 14px/1 system-ui, sans-serif;
                cursor: pointer;
            }
            .iv-dial-button span { font-size: 12px; }
            .iv-dial-button.is-active { color: var(--iv-accent); }
            .iv-dial-button:hover,
            .iv-dial.is-open .iv-dial-button {
                background: rgba(255, 255, 255, 0.15);
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
                /* 4:3 cells: the items clip their overflow, which drops their
                   automatic minimum size, so auto rows would collapse. */
                grid-auto-rows: calc((var(--iv-sidebar-w) - 1px - 24px - 8px) / 2 * 3 / 4);
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
            .iv-item {
                position: relative;
                display: block;
                overflow: hidden;
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
            syncDials();
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
        // presets. Speed and audio boost share it.
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
                button: value => formatRate(value),
            },
            boost: {
                label: 'Amplificar áudio',
                hint: 'Shift + ↑ / ↓',
                min: 1,
                max: BOOST_MAX,
                presets: BOOST_PRESETS,
                format: formatBoost,
                value: () => state.boost,
                set: value => setBoost(value, { hud: false }),
                button: value => `${icon(ICONS.boost, 22)}${value > 1 ? `<span>${formatBoost(value)}</span>` : ''}`,
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
                button.classList.toggle('is-active', root.dataset.dial === 'boost' && value > 1);
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
            const boost = buildDial('boost');
            const previous = controlButton('iv-previous', 'Anterior', ICONS.previous, () => assetNavButton('previous')?.click());
            const next = controlButton('iv-next', 'Próximo', ICONS.next, () => assetNavButton('next')?.click());
            const rewind = controlButton('iv-rewind', `Voltar ${SEEK_SHORT}s (←)`, ICONS.rewind, () => seekActive(-SEEK_SHORT), String(SEEK_SHORT));
            const forward = controlButton('iv-forward', `Avançar ${SEEK_SHORT}s (→)`, ICONS.forward, () => seekActive(SEEK_SHORT), String(SEEK_SHORT));
            const loop = controlButton('iv-loop', 'Repetir', ICONS.loop, toggleLoop);
            const autoplay = controlButton('iv-autoplay', 'Autoplay', '', toggleAutoplay);
            autoplay.innerHTML = `<span class="iv-autoplay-track"><span class="iv-autoplay-thumb">${icon('M8,5.14V19.14L19,12.14L8,5.14Z', 12)}</span></span>`;
            const pip = controlButton('iv-pip', 'Picture-in-picture', ICONS.pip, togglePictureInPicture);
            pip.hidden = !document.pictureInPictureEnabled;
            // Placement comes from the CSS order rules, so these only need to sit
            // next to static nodes, away from Svelte's block anchors.
            timeDisplay.after(loop, previous, next, autoplay, rewind, forward, boost, speed, pip);
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

        // Inside an album the next *video* is known from the album listing, so
        // photos in between are skipped. Elsewhere, fall back to the next asset.
        async function playNextVideo() {
            const match = ALBUM_ASSET_RE.exec(location.pathname);
            if (match) {
                const [, albumId, assetId] = match;
                try {
                    const album = await albumData(albumId);
                    const index = album.items.findIndex(item => item.id === assetId);
                    const next = album.items.slice(index + 1).find(item => item.isVideo);
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

        function seekActive(seconds) {
            const video = activeVideo();
            if (!video) return;
            seekBy(video, seconds);
            showHud(seconds < 0 ? `« ${-seconds}s` : `${seconds}s »`);
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

        async function api(path) {
            const response = await fetch(`/api${path}`, {
                credentials: 'same-origin',
                headers: { Accept: 'application/json' },
            });
            if (!response.ok) throw new Error(`${path}: HTTP ${response.status}`);
            return response.json();
        }

        // Albums no longer embed their assets; the album page itself reads them
        // through the timeline buckets, whose payload is columnar.
        async function loadAlbum(albumId) {
            const album = await api(`/albums/${albumId}`);
            const order = album.order === 'asc' ? 'asc' : 'desc';
            const query = `albumId=${albumId}&order=${order}`;
            const buckets = await api(`/timeline/buckets?${query}`);
            const columns = await Promise.all(buckets.map(bucket =>
                api(`/timeline/bucket?${query}&timeBucket=${encodeURIComponent(bucket.timeBucket)}`)));
            const items = [];
            for (const column of columns) {
                for (let index = 0; index < column.id.length; index++) {
                    items.push({
                        id: column.id[index],
                        isVideo: !column.isImage[index],
                        duration: column.duration?.[index] ?? null,
                        takenAt: column.fileCreatedAt?.[index] ?? null,
                    });
                }
            }
            return { id: albumId, name: album.albumName || 'Álbum', items };
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

        function formatDate(value) {
            if (!value) return '';
            const date = new Date(value);
            return Number.isNaN(date.getTime()) ? '' : date.toLocaleString();
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
            for (const item of sidebar.querySelectorAll('.iv-item')) {
                const type = item.dataset.video === 'true' ? 'video' : 'image';
                item.hidden = state.filter !== 'all' && state.filter !== type;
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

            const fragment = document.createDocumentFragment();
            for (const item of album.items) {
                const link = document.createElement('a');
                link.className = 'iv-item';
                link.href = `/albums/${albumId}/photos/${item.id}`;
                link.dataset.id = item.id;
                link.dataset.video = String(item.isVideo);
                link.dataset.sveltekitNoscroll = '';
                link.title = formatDate(item.takenAt);
                const image = document.createElement('img');
                image.loading = 'lazy';
                image.decoding = 'async';
                image.alt = '';
                image.src = `/api/assets/${item.id}/thumbnail?size=thumbnail`;
                link.append(image);
                if (item.isVideo) {
                    const badge = document.createElement('span');
                    badge.className = 'iv-item-badge';
                    badge.textContent = formatDuration(item.duration) || '▶';
                    link.append(badge);
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
            if (state.renderedAlbum !== albumId) renderAlbum(albumId, assetId);
            else markCurrent(assetId);
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
            syncNavbar();
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
