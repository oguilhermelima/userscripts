// ==UserScript==
// @name         Crunchyroll — Full-Height Player, Speed & Auto-Skip
// @namespace    http://tampermonkey.net
// @version      4.0.1
// @updateURL    https://raw.githubusercontent.com/oguilhermelima/userscripts/main/dist/crunchyroll.user.js
// @downloadURL  https://raw.githubusercontent.com/oguilhermelima/userscripts/main/dist/crunchyroll.user.js
// @author       oguilhermelima
// @description  Modo full-height no player de vídeo, controles diretos de velocidade e episódios, auto-skip oficial de aberturas e encerramentos sem redirecionamentos, menu de configurações dropdown e visual nativo para Crunchyroll.
// @match        https://www.crunchyroll.com/*
// @match        https://crunchyroll.com/*
// @grant        GM_addStyle
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_registerMenuCommand
// @grant        unsafeWindow
// @run-at       document-start
// @noframes
// ==/UserScript==
(function() {
    'use strict';

    // =========================================================================
    //  Desativação de Telemetrias e Rastreamento Pesado (Liberação de CPU)
    // =========================================================================
    try {
        const uw = (typeof unsafeWindow !== 'undefined') ? unsafeWindow : window;
        const noop = () => {};
        const noopObj = new Proxy({}, { get: () => noop });

        // Neutraliza ETP / cr-eec analytics
        uw.etp = { src: '', config: { analytics: {} } };

        // Neutraliza Segment / analytics.js
        if (!uw.analytics || !Array.isArray(uw.analytics)) {
            uw.analytics = noopObj;
        }

        // Neutraliza OneTrust, Ketch, Braze e semáforos de consentimento
        uw.OptanonWrapper = noop;
        uw.OneTrust = noopObj;
        uw.ketch = noop;
        uw.braze = noopObj;
        uw.semaphore = [];

        if (!uw.__APP_CONFIG__) {
            let internalConfig = undefined;
            Object.defineProperty(uw, '__APP_CONFIG__', {
                configurable: true,
                enumerable: true,
                get() { return internalConfig; },
                set(val) {
                    if (val && typeof val === 'object') {
                        if (val.datadog) {
                            val.datadog.apm = { enabled: false };
                            if (val.datadog.browserRum) {
                                val.datadog.browserRum.trackInteractions = false;
                                val.datadog.browserRum.trackResources = false;
                                val.datadog.browserRum.sessionSampleRate = 0;
                                val.datadog.browserRum.sessionReplaySampleRate = 0;
                            }
                        }
                        if (val.logger) val.logger.enabled = false;
                    }
                    internalConfig = val;
                }
            });
        } else {
            if (uw.__APP_CONFIG__.datadog) {
                uw.__APP_CONFIG__.datadog.apm = { enabled: false };
                if (uw.__APP_CONFIG__.datadog.browserRum) {
                    uw.__APP_CONFIG__.datadog.browserRum.trackInteractions = false;
                    uw.__APP_CONFIG__.datadog.browserRum.trackResources = false;
                    uw.__APP_CONFIG__.datadog.browserRum.sessionSampleRate = 0;
                    uw.__APP_CONFIG__.datadog.browserRum.sessionReplaySampleRate = 0;
                }
            }
            if (uw.__APP_CONFIG__.logger) uw.__APP_CONFIG__.logger.enabled = false;
        }
        uw.datadogRum = {
            init() {},
            addAction() {},
            addError() {},
            trackAction() {},
            startView() {},
        };
    } catch (_) {}

    // =========================================================================
    //  Constantes e Armazenamento Persistente
    // =========================================================================
    const STORAGE_KEYS = {
        FULL_HEIGHT: 'cr_full_height',
        PLAYBACK_RATE: 'cr_playback_rate',
        AUTO_SKIP_INTRO: 'cr_auto_skip_intro',
        AUTO_SKIP_RECAP: 'cr_auto_skip_recap',
        AUTO_SKIP_CREDITS: 'cr_auto_skip_credits',
        AUTO_SKIP_PREVIEW: 'cr_auto_skip_preview',
        CLEAN_GRADIENTS: 'cr_clean_gradients',
        CLOSE_END_BANNER: 'cr_close_end_banner',
        SHORTCUTS_ENABLED: 'cr_shortcuts_enabled',
        PERF_BOOST: 'cr_perf_boost',
        FAST_BACKWARD_BUTTONS: 'cr_fast_backward_buttons',
        FAST_FORWARD_BUTTONS: 'cr_fast_forward_buttons',
    };

    const DEFAULTS = {
        fullHeight: true,
        playbackRate: 1.0,
        autoSkipIntro: true,
        autoSkipRecap: true,
        autoSkipCredits: true,
        autoSkipPreview: false,
        cleanGradients: true,
        closeEndBanner: true,
        shortcutsEnabled: true,
        perfBoost: true,
        fastBackwardButtons: '10,30',
        fastForwardButtons: '10,30',
    };

    function getSetting(key, fallback) {
        try {
            if (typeof GM_getValue === 'function') {
                const val = GM_getValue(key);
                if (val !== undefined && val !== null) return val;
            }
        } catch (_) {}
        try {
            const raw = localStorage.getItem(key);
            if (raw !== null) {
                try { return JSON.parse(raw); } catch (_) { return raw; }
            }
        } catch (_) {}
        return fallback;
    }

    function setSetting(key, value) {
        try {
            if (typeof GM_setValue === 'function') {
                GM_setValue(key, value);
            }
        } catch (_) {}
        try {
            localStorage.setItem(key, JSON.stringify(value));
        } catch (_) {}
    }

    // =========================================================================
    //  Estado da Aplicação
    // =========================================================================
    const state = {
        settings: {
            fullHeight: getSetting(STORAGE_KEYS.FULL_HEIGHT, DEFAULTS.fullHeight),
            playbackRate: Number(getSetting(STORAGE_KEYS.PLAYBACK_RATE, DEFAULTS.playbackRate)) || 1.0,
            autoSkipIntro: getSetting(STORAGE_KEYS.AUTO_SKIP_INTRO, DEFAULTS.autoSkipIntro),
            autoSkipRecap: getSetting(STORAGE_KEYS.AUTO_SKIP_RECAP, DEFAULTS.autoSkipRecap),
            autoSkipCredits: getSetting(STORAGE_KEYS.AUTO_SKIP_CREDITS, DEFAULTS.autoSkipCredits),
            autoSkipPreview: getSetting(STORAGE_KEYS.AUTO_SKIP_PREVIEW, DEFAULTS.autoSkipPreview),
            cleanGradients: getSetting(STORAGE_KEYS.CLEAN_GRADIENTS, DEFAULTS.cleanGradients),
            closeEndBanner: getSetting(STORAGE_KEYS.CLOSE_END_BANNER, DEFAULTS.closeEndBanner),
            shortcutsEnabled: getSetting(STORAGE_KEYS.SHORTCUTS_ENABLED, DEFAULTS.shortcutsEnabled),
            perfBoost: getSetting(STORAGE_KEYS.PERF_BOOST, DEFAULTS.perfBoost),
            fastBackwardButtons: String(getSetting(STORAGE_KEYS.FAST_BACKWARD_BUTTONS, DEFAULTS.fastBackwardButtons)),
            fastForwardButtons: String(getSetting(STORAGE_KEYS.FAST_FORWARD_BUTTONS, DEFAULTS.fastForwardButtons)),
        },
        mediaId: null,
        skipEvents: {
            intro: null,
            recap: null,
            credits: null,
            preview: null,
        },
        skippedEvents: new Set(),
        isSkipping: false,
        activeSkipItem: null,
        videoEl: null,
        leftControlsMounted: false,
        rightControlsMounted: false,
        speedMenuOpen: false,
        settingsDropdownOpen: false,
        toastTimeout: null,
        isApplyingSpeed: false,
    };

    // =========================================================================
    //  Estilos Globais (CSS)
    // =========================================================================
    const STYLES = `
        /* 1. Ocultação Global de Barras de Rolagem */
        html::-webkit-scrollbar,
        body::-webkit-scrollbar,
        #app::-webkit-scrollbar,
        [class*="erc-"]::-webkit-scrollbar {
            display: none !important;
            width: 0 !important;
            height: 0 !important;
        }
        html, body, #app, [class*="erc-"] {
            scrollbar-width: none !important;
            -ms-overflow-style: none !important;
        }

        /* 2. Modo Full-Height Player (100vh) */
        body.cr-full-height-active .video-player-spacer {
            max-height: 100vh !important;
            height: 100vh !important;
            width: 100% !important;
            background: #000 !important;
            transition: max-height 0.3s ease-in-out;
            position: relative !important;
        }

        body.cr-full-height-active .video-player-wrapper,
        body.cr-full-height-active #player-container,
        body.cr-full-height-active [data-testid="player-container"],
        body.cr-full-height-active div[data-testid="vilos-player"],
        body.cr-full-height-active #velocity-player-package {
            max-height: 100vh !important;
            height: 100% !important;
            width: 100% !important;
            background: #000 !important;
        }

        body.cr-full-height-active video,
        body.cr-full-height-active [data-testid="vilos-player"] video,
        body.cr-full-height-active #velocity-player-package video,
        body.cr-full-height-active .video-player video {
            width: 100% !important;
            height: 100% !important;
            max-height: 100vh !important;
            object-fit: contain !important;
            background: #000 !important;
        }

        body.cr-full-height-active [class*="watch-episode"] {
            max-width: 100% !important;
            width: 100% !important;
        }

        /* Recolhimento Suave e Colapso da Linha do Header no Modo Full-Height */
        body.cr-full-height-active [class*="app-layout__header"],
        body.cr-full-height-active header,
        body.cr-full-height-active .erc-large-header,
        body.cr-full-height-active .erc-large-header-shell {
            height: 0 !important;
            min-height: 0 !important;
            max-height: 0 !important;
            flex: 0 0 0 !important;
            padding: 0 !important;
            margin: 0 !important;
            border: 0 !important;
            overflow: visible !important;
        }

        body.cr-full-height-active [class*="app-layout"] {
            grid-template-rows: 0 1fr auto !important;
        }

        body.cr-full-height-active [class*="app-layout__content"] {
            grid-row: 1 / -1 !important;
            padding-top: 0 !important;
            margin-top: 0 !important;
        }

        body.cr-full-height-active .page-wrapper--5HUY2,
        body.cr-full-height-active [class*="page-wrapper"],
        body.cr-full-height-active .erc-watch-episode,
        body.cr-full-height-active .erc-watch-episode-layout {
            padding-top: 0 !important;
            margin-top: 0 !important;
        }

        body.cr-full-height-active header .header-content,
        body.cr-full-height-active [class^="app-layout__header"] .header-content {
            position: fixed !important;
            top: 0 !important;
            left: 0 !important;
            right: 0 !important;
            height: var(--cx-header-height, 3.75rem) !important;
            transform: translateY(-100%) !important;
            transition: transform 0.3s ease-in-out !important;
            z-index: 999999 !important;
        }

        /* Faixa invisível de hover para revelar o header suavemente */
        body.cr-full-height-active header .header-content::after {
            content: '' !important;
            position: absolute !important;
            top: 100% !important;
            left: 0 !important;
            right: 0 !important;
            height: 30px !important;
        }

        body.cr-full-height-active header .header-content:hover,
        body.cr-full-height-active [class^="app-layout__header"] .header-content:hover,
        body.cr-full-height-active.cr-header-revealed header .header-content,
        body.cr-full-height-active.cr-header-revealed [class^="app-layout__header"] .header-content {
            transform: translateY(0) !important;
        }

        body.cr-full-height-active [class*="app-layout__content"],
        body.cr-full-height-active [class*="content-wrapper"],
        body.cr-full-height-active main {
            padding-top: 0 !important;
            margin-top: 0 !important;
        }

        /* Suspensão de Renderização do Conteúdo Fora da Tela em Modo Full-Height */
        body.cr-full-height-active [class*="watch-episode-layout"] > *:not([class*="player"]):not([class*="video"]),
        body.cr-full-height-active .erc-watch-episode-layout > *:not([class*="player"]):not([class*="video"]),
        body.cr-full-height-active .erc-comments,
        body.cr-full-height-active footer {
            content-visibility: auto !important;
            contain-intrinsic-size: 1px 800px !important;
        }

        /* 3. Limpeza de Gradientes e Sombras Escuras */
        html.cr-clean-gradients [class*="top-gradient"],
        html.cr-clean-gradients [class*="bottom-gradient"],
        html.cr-clean-gradients [data-testid*="gradient"],
        html.cr-clean-gradients [class*="kat:bg-gradient"],
        html.cr-clean-gradients [class*="bg-gradient-"],
        html.cr-clean-gradients [class*="vilos-control-bar-background"],
        html.cr-clean-gradients .vilos-control-bar-background {
            background: transparent !important;
            background-image: none !important;
            box-shadow: none !important;
        }

        /* 3.1 Otimizações de Desempenho do Player (Zero-Copy Direct Presentation) */
        #player-container,
        .video-player-wrapper,
        [data-testid="player-container"],
        .bitmovinplayer-container,
        div[data-testid="vilos-player"],
        #velocity-player-package {
            transform: none !important;
            will-change: auto !important;
            contain: none !important;
        }

        video,
        [data-testid="vilos-player"] video,
        #velocity-player-package video,
        .video-player video,
        .bitmovinplayer-container video {
            transform: none !important;
            will-change: auto !important;
        }

        /* Ocultação completa das camadas de autohide quando invisíveis (elimina overhead de composição) */
        [data-testid="bottom-controls-autohide"][data-overlay-visible="false"],
        [data-testid="bottom-controls-autohide"][style*="opacity: 0"],
        [data-testid="top-gradient-background"][class*="opacity-0"],
        [data-testid="ratings-advisories-overlay"][class*="opacity-0"],
        .kat\\:opacity-0 {
            visibility: hidden !important;
            pointer-events: none !important;
        }

        /* Remove filtros pesados e acelera renderização de legendas */
        .bitmovinplayer-container > canvas,
        .bitmovinplayer-container .bmpui-ui-subtitle-overlay {
            contain: strict !important;
            will-change: auto !important;
            transform: none !important;
        }

        html.cr-perf-boost [class*="vilos-control-bar-background"],
        html.cr-perf-boost .vilos-control-bar-background,
        html.cr-perf-boost [class*="top-gradient"],
        html.cr-perf-boost [class*="bottom-gradient"],
        [class*="kat:bg-gradient"],
        [class*="bg-gradient-"],
        [data-testid="bottom-controls-autohide"],
        .timeline-container {
            backdrop-filter: none !important;
            -webkit-backdrop-filter: none !important;
        }

        /* 4. Botão de Configurações na Topbar */
        .cr-header-tile {
            position: relative !important;
            display: inline-flex !important;
            align-items: center !important;
            justify-content: center !important;
            height: 100% !important;
            flex-shrink: 0 !important;
            margin: 0 !important;
        }

        .cr-topbar-settings-btn {
            color: #a0a0a0 !important;
            display: inline-flex !important;
            align-items: center !important;
            justify-content: center !important;
            background: transparent !important;
            border: none !important;
            cursor: pointer !important;
            padding: 0 10px !important;
            height: 100% !important;
            min-width: 40px !important;
            transition: color 0.2s ease, transform 0.15s ease !important;
        }

        .cr-topbar-settings-btn:hover {
            color: #f47521 !important;
        }

        .cr-topbar-settings-btn:active {
            transform: scale(0.92) !important;
        }

        .cr-topbar-settings-svg {
            pointer-events: none !important;
        }

        /* 5. Dropdown de Configurações no Estilo Dropdown de Perfil Crunchyroll */
        .cr-settings-dropdown {
            position: absolute !important;
            top: 100% !important;
            right: 0 !important;
            min-width: 330px !important;
            width: 350px !important;
            background: #141519 !important;
            border: 1px solid #2a2c34 !important;
            border-radius: 8px !important;
            box-shadow: 0 8px 32px rgba(0, 0, 0, 0.85) !important;
            z-index: 1000000 !important;
            font-family: Lato, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif !important;
            color: #ffffff !important;
            display: none;
            flex-direction: column !important;
            overflow: hidden !important;
            animation: crDropdownFade 0.18s cubic-bezier(0.16, 1, 0.3, 1) !important;
            text-align: left !important;
        }

        .cr-settings-dropdown.cr-visible {
            display: flex !important;
        }

        @keyframes crDropdownFade {
            from { opacity: 0; transform: translateY(-6px); }
            to { opacity: 1; transform: translateY(0); }
        }

        .cr-dropdown-header {
            padding: 14px 18px !important;
            border-bottom: 1px solid #23252b !important;
            display: flex !important;
            align-items: center !important;
            justify-content: space-between !important;
            background: #1a1c22 !important;
        }

        .cr-dropdown-header h3 {
            margin: 0 !important;
            font-size: 14px !important;
            font-weight: 700 !important;
            color: #ffffff !important;
            display: flex !important;
            align-items: center !important;
            gap: 8px !important;
        }

        .cr-dropdown-header .cr-badge {
            background: #f47521 !important;
            color: #000000 !important;
            font-size: 10px !important;
            font-weight: 800 !important;
            padding: 2px 6px !important;
            border-radius: 4px !important;
            text-transform: uppercase !important;
        }

        .cr-dropdown-body {
            max-height: calc(100vh - 120px) !important;
            overflow-y: auto !important;
            padding: 8px 0 !important;
        }

        .cr-dropdown-section {
            padding: 8px 16px !important;
            border-bottom: 1px solid #23252b !important;
        }

        .cr-dropdown-section:last-child {
            border-bottom: none !important;
        }

        .cr-dropdown-section-title {
            font-size: 11px !important;
            font-weight: 700 !important;
            color: #f47521 !important;
            text-transform: uppercase !important;
            letter-spacing: 0.6px !important;
            margin-bottom: 8px !important;
        }

        .cr-dropdown-row {
            display: flex !important;
            align-items: center !important;
            justify-content: space-between !important;
            padding: 8px 10px !important;
            border-radius: 6px !important;
            transition: background 0.12s ease !important;
            cursor: pointer !important;
        }

        .cr-dropdown-row:hover {
            background: rgba(255, 255, 255, 0.06) !important;
        }

        .cr-dropdown-label-wrap {
            display: flex !important;
            flex-direction: column !important;
            gap: 2px !important;
            flex: 1 !important;
            padding-right: 12px !important;
        }

        .cr-dropdown-label {
            font-size: 13px !important;
            font-weight: 600 !important;
            color: #ffffff !important;
        }

        .cr-dropdown-hint {
            font-size: 11px !important;
            color: #8c909c !important;
            line-height: 1.3 !important;
        }

        /* Switches Laranja Estilo Crunchyroll */
        .cr-switch {
            position: relative !important;
            display: inline-block !important;
            width: 38px !important;
            height: 20px !important;
            flex-shrink: 0 !important;
        }

        .cr-switch input {
            opacity: 0 !important;
            width: 0 !important;
            height: 0 !important;
        }

        .cr-slider {
            position: absolute !important;
            cursor: pointer !important;
            top: 0 !important;
            left: 0 !important;
            right: 0 !important;
            bottom: 0 !important;
            background-color: #2f323c !important;
            transition: 0.2s ease !important;
            border-radius: 20px !important;
        }

        .cr-slider:before {
            position: absolute !important;
            content: "" !important;
            height: 14px !important;
            width: 14px !important;
            left: 3px !important;
            bottom: 3px !important;
            background-color: #ffffff !important;
            transition: 0.2s ease !important;
            border-radius: 50% !important;
        }

        .cr-switch input:checked + .cr-slider {
            background-color: #f47521 !important;
        }

        .cr-switch input:checked + .cr-slider:before {
            transform: translateX(18px) !important;
        }

        /* Seção de Velocidade no Dropdown */
        .cr-dropdown-speed-presets {
            display: grid !important;
            grid-template-columns: repeat(5, 1fr) !important;
            gap: 6px !important;
            margin: 8px 0 !important;
        }

        .cr-dropdown-preset-btn {
            background: #23252b !important;
            border: 1px solid #32353e !important;
            border-radius: 4px !important;
            color: #e5e7eb !important;
            font-size: 12px !important;
            font-weight: 600 !important;
            padding: 5px 0 !important;
            cursor: pointer !important;
            text-align: center !important;
            transition: all 0.12s ease !important;
        }

        .cr-dropdown-preset-btn:hover {
            background: #32353e !important;
            color: #ffffff !important;
            border-color: #f47521 !important;
        }

        .cr-dropdown-preset-btn.cr-active {
            background: #f47521 !important;
            border-color: #f47521 !important;
            color: #000000 !important;
            font-weight: 700 !important;
        }

        .cr-dropdown-slider-wrap {
            display: flex !important;
            align-items: center !important;
            gap: 8px !important;
            margin-top: 6px !important;
        }

        .cr-dropdown-slider-val {
            font-size: 13px !important;
            font-weight: 700 !important;
            color: #f47521 !important;
            min-width: 48px !important;
        }

        .cr-speed-range {
            width: 100% !important;
            accent-color: #f47521 !important;
            cursor: pointer !important;
            height: 4px !important;
        }

        /* Chips de Intervalos de Pulo no Dropdown */
        .cr-interval-chips-wrap {
            display: flex !important;
            gap: 6px !important;
            margin-top: 6px !important;
            flex-wrap: wrap !important;
        }

        .cr-interval-chip {
            background: #23252b !important;
            border: 1px solid #32353e !important;
            border-radius: 4px !important;
            color: #c2c5cc !important;
            font-size: 12px !important;
            font-weight: 600 !important;
            padding: 4px 10px !important;
            cursor: pointer !important;
            transition: all 0.15s ease !important;
            user-select: none !important;
        }

        .cr-interval-chip:hover {
            border-color: #f47521 !important;
            color: #ffffff !important;
            background: #2c2f38 !important;
        }

        .cr-interval-chip.cr-active {
            background: #f47521 !important;
            border-color: #f47521 !important;
            color: #000000 !important;
            font-weight: 700 !important;
        }

        /* 6. Botões do Player no Padrão Crunchyroll */
        .cr-player-btn {
            width: 44px !important;
            height: 44px !important;
            background: transparent !important;
            border: none !important;
            color: #ffffff !important;
            cursor: pointer !important;
            display: inline-flex !important;
            align-items: center !important;
            justify-content: center !important;
            transition: color 0.15s ease, transform 0.1s ease !important;
            padding: 0 !important;
            line-height: 1 !important;
            user-select: none !important;
            box-sizing: border-box !important;
            flex-shrink: 0 !important;
        }

        .cr-player-btn:hover {
            color: #f47521 !important;
        }

        .cr-player-btn:active {
            transform: scale(0.92) !important;
        }

        .cr-player-btn.cr-active {
            color: #f47521 !important;
        }

        .cr-player-btn svg {
            width: 24px !important;
            height: 24px !important;
            fill: currentColor !important;
            pointer-events: none !important;
        }

        /* 7. Menu de Velocidade no Estilo Nativo Crunchyroll */
        .cr-speed-menu-popover {
            position: absolute !important;
            bottom: 56px !important;
            right: 0 !important;
            width: 260px !important;
            background: #23252b !important;
            border-radius: 8px !important;
            box-shadow: 0 8px 32px rgba(0, 0, 0, 0.85) !important;
            z-index: 999999 !important;
            display: none;
            flex-direction: column !important;
            overflow: hidden !important;
            font-family: Lato, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif !important;
            color: #ffffff !important;
            animation: crDropdownFade 0.15s ease !important;
            user-select: none !important;
        }

        .cr-speed-menu-popover.cr-visible {
            display: flex !important;
        }

        .cr-speed-menu-title {
            padding: 12px 16px 8px !important;
            font-size: 14px !important;
            font-weight: 700 !important;
            color: #ffffff !important;
        }

        .cr-speed-menu-list {
            display: flex !important;
            flex-direction: column !important;
            max-height: 280px !important;
            overflow-y: auto !important;
        }

        .cr-speed-menu-item {
            display: flex !important;
            align-items: center !important;
            justify-content: space-between !important;
            padding: 9px 16px !important;
            font-size: 14px !important;
            color: #ffffff !important;
            cursor: pointer !important;
            transition: background 0.12s ease !important;
        }

        .cr-speed-menu-item:hover {
            background: rgba(255, 255, 255, 0.08) !important;
        }

        .cr-speed-menu-item.cr-selected {
            color: #ffffff !important;
            font-weight: 600 !important;
        }

        .cr-speed-menu-check {
            width: 20px !important;
            height: 20px !important;
            display: flex !important;
            align-items: center !important;
            justify-content: center !important;
        }

        .cr-speed-menu-custom {
            padding: 10px 16px !important;
            border-top: 1px solid rgba(255, 255, 255, 0.1) !important;
            background: rgba(0, 0, 0, 0.2) !important;
            display: flex !important;
            flex-direction: column !important;
            gap: 6px !important;
        }

        .cr-speed-menu-custom-header {
            display: flex !important;
            align-items: center !important;
            justify-content: space-between !important;
            font-size: 12px !important;
            color: #8c909c !important;
        }

        .cr-speed-menu-custom-actions {
            display: flex !important;
            gap: 6px !important;
            margin-top: 4px !important;
        }

        .cr-speed-menu-step-btn {
            flex: 1 !important;
            background: #2f323c !important;
            border: 1px solid #3e424e !important;
            border-radius: 4px !important;
            color: #ffffff !important;
            font-size: 12px !important;
            font-weight: 600 !important;
            padding: 4px 0 !important;
            cursor: pointer !important;
            transition: all 0.12s ease !important;
        }

        .cr-speed-menu-step-btn:hover {
            background: #3e424e !important;
            border-color: #f47521 !important;
        }

        /* 8. Toast OSD (On-Screen Display) */
        .cr-osd-toast {
            position: absolute !important;
            top: 28px !important;
            left: 50% !important;
            transform: translateX(-50%) translateY(-8px) !important;
            background: rgba(20, 21, 25, 0.92) !important;
            border: 1px solid rgba(244, 117, 33, 0.7) !important;
            border-radius: 20px !important;
            padding: 7px 18px !important;
            font-size: 14px !important;
            font-weight: 700 !important;
            color: #ffffff !important;
            box-shadow: 0 4px 20px rgba(0, 0, 0, 0.6) !important;
            backdrop-filter: blur(8px) !important;
            pointer-events: none !important;
            opacity: 0 !important;
            transition: opacity 0.2s ease, transform 0.2s ease !important;
            z-index: 9999999 !important;
            white-space: nowrap !important;
        }

        .cr-osd-toast.cr-show {
            opacity: 1 !important;
            transform: translateX(-50%) translateY(0) !important;
        }

        /* 9. Animação OSD Central de Avanço / Retrocesso */
        .cr-forward-backward-osd {
            position: absolute !important;
            top: 50% !important;
            left: 50% !important;
            transform: translate(-50%, -50%) scale(0.85) !important;
            background: rgba(15, 15, 20, 0.85) !important;
            border: 1px solid rgba(244, 117, 33, 0.6) !important;
            border-radius: 50% !important;
            width: 76px !important;
            height: 76px !important;
            display: flex !important;
            flex-direction: column !important;
            align-items: center !important;
            justify-content: center !important;
            gap: 2px !important;
            color: #ffffff !important;
            font-size: 13px !important;
            font-weight: 800 !important;
            pointer-events: none !important;
            opacity: 0 !important;
            transition: opacity 0.15s ease, transform 0.15s cubic-bezier(0.16, 1, 0.3, 1) !important;
            z-index: 9999999 !important;
            backdrop-filter: blur(6px) !important;
            box-shadow: 0 8px 30px rgba(0, 0, 0, 0.7) !important;
        }

        .cr-forward-backward-osd.cr-show {
            opacity: 1 !important;
            transform: translate(-50%, -50%) scale(1) !important;
        }

        .cr-forward-backward-osd svg {
            width: 24px !important;
            height: 24px !important;
            fill: #f47521 !important;
        }

        /* Compositor Heartbeat para sincronização perfeita de 120Hz no macOS ProMotion */
        @keyframes crCompositorHeartbeat {
            0% { transform: translate3d(0, 0, 0); opacity: 0.01; }
            50% { transform: translate3d(0.05px, 0, 0); opacity: 0.015; }
            100% { transform: translate3d(0, 0, 0); opacity: 0.01; }
        }

        .cr-compositor-heartbeat {
            position: fixed !important;
            top: 0 !important;
            left: 0 !important;
            width: 1px !important;
            height: 1px !important;
            pointer-events: none !important;
            z-index: 999999 !important;
            will-change: transform, opacity !important;
            animation: crCompositorHeartbeat 0.016s linear infinite !important;
            contain: strict !important;
        }

        /* Remoção de Foco / Focus Ring (Anel Azul) na Barra de Progresso / Timeline */
        [data-testid="scrubber"],
        [data-testid="scrubber"] *:focus,
        [data-testid="scrubber"] *:focus-visible,
        [data-testid="timeline-controls-container"],
        [data-testid="timeline-controls-container"] *:focus,
        [data-testid="timeline-controls-container"] *:focus-visible,
        .timeline-container,
        .timeline-container *:focus,
        .timeline-container *:focus-visible,
        [class*="timeline"]:focus,
        [class*="timeline"] *:focus,
        [class*="timeline"]:focus-visible,
        [class*="timeline"] *:focus-visible,
        [class*="scrubber"]:focus,
        [class*="scrubber"] *:focus,
        [class*="scrubber"]:focus-visible,
        [class*="scrubber"] *:focus-visible,
        [role="slider"]:focus,
        [role="slider"]:focus-visible,
        input[type="range"]:focus,
        input[type="range"]:focus-visible {
            outline: none !important;
            outline-color: transparent !important;
            box-shadow: none !important;
        }
    `;

    // Aplica os estilos imediatamente
    if (typeof GM_addStyle === 'function') {
        GM_addStyle(STYLES);
    } else {
        const styleEl = document.createElement('style');
        styleEl.textContent = STYLES;
        (document.head || document.documentElement).appendChild(styleEl);
    }

    // =========================================================================
    //  Auxiliares de Navegação e Detecção
    // =========================================================================
    function isWatchPage() {
        return /\/watch\/[A-Za-z0-9]+/i.test(location.pathname);
    }

    function getMediaId() {
        const match = location.pathname.match(/\/watch\/([A-Za-z0-9]+)/i);
        return match ? match[1] : null;
    }

    function isTypingContext(e) {
        const target = e.target;
        if (!target) return false;

        // Se for slider ou elemento da timeline/scrubber, não é contexto de digitação
        if (
            target.type === 'range' ||
            (typeof target.closest === 'function' &&
                target.closest(
                    '[data-testid="scrubber"], [data-testid="timeline-controls-container"], .timeline-container, [class*="timeline"], [class*="scrubber"], [role="slider"]'
                ))
        ) {
            return false;
        }

        const tag = target.tagName;
        if (tag === 'INPUT') {
            const type = (target.type || '').toLowerCase();
            const nonTypingTypes = ['range', 'checkbox', 'radio', 'button', 'submit', 'reset', 'file', 'image', 'color'];
            if (nonTypingTypes.includes(type)) {
                return false;
            }
            return true;
        }

        return (
            tag === 'TEXTAREA' ||
            tag === 'SELECT' ||
            Boolean(target.isContentEditable) ||
            target.getAttribute('role') === 'textbox' ||
            target.getAttribute('role') === 'searchbox'
        );
    }

    function blurTimelineIfFocused() {
        const active = document.activeElement;
        if (!active || active === document.body || active === document.documentElement) return;
        if (
            active.type === 'range' ||
            active.getAttribute?.('role') === 'slider' ||
            (typeof active.closest === 'function' &&
                active.closest(
                    '[data-testid="scrubber"], [data-testid="timeline-controls-container"], .timeline-container, [class*="timeline"], [class*="scrubber"], [role="slider"]'
                ))
        ) {
            try {
                active.blur();
            } catch (_) {}
        }
    }

    function getPlayerRoot() {
        return (
            document.querySelector('[data-testid="player-controls-root"]') ||
            document.querySelector('#velocity-player-package') ||
            document.querySelector('div[data-testid="vilos-player"]') ||
            document.querySelector('[data-testid="player-container"]') ||
            document.querySelector('#player-container')
        );
    }

    function getPlayerContainer() {
        return (
            document.querySelector('#player-container') ||
            document.querySelector('[data-testid="player-container"]') ||
            document.querySelector('#velocity-player-package') ||
            document.querySelector('div[data-testid="vilos-player"]') ||
            document.body
        );
    }

    // =========================================================================
    //  Notificações OSD (Toast)
    // =========================================================================
    let toastElement = null;

    function ensureToastElement() {
        if (!toastElement || !document.body.contains(toastElement)) {
            toastElement = document.createElement('div');
            toastElement.className = 'cr-osd-toast';
            const container = getPlayerContainer();
            container.appendChild(toastElement);
        }
    }

    function showToast(message) {
        ensureToastElement();
        if (!toastElement) return;

        toastElement.textContent = message;
        toastElement.classList.add('cr-show');

        if (state.toastTimeout) {
            clearTimeout(state.toastTimeout);
        }

        state.toastTimeout = setTimeout(() => {
            if (toastElement) {
                toastElement.classList.remove('cr-show');
            }
        }, 1400);
    }

    // =========================================================================
    //  Animação OSD Central de Avanço e Retrocesso
    // =========================================================================
    let forwardBackwardTimeout = null;
    let forwardBackwardEl = null;

    function ensureForwardBackwardOSD() {
        if (!forwardBackwardEl || !document.body.contains(forwardBackwardEl)) {
            forwardBackwardEl = document.createElement('div');
            forwardBackwardEl.className = 'cr-forward-backward-osd';
            const container = getPlayerContainer();
            container.appendChild(forwardBackwardEl);
        }
    }

    function showForwardBackwardOSD(isBackward, seconds) {
        ensureForwardBackwardOSD();
        if (!forwardBackwardEl) return;

        const sign = isBackward ? '-' : '+';
        const arrow = isBackward
            ? `<svg viewBox="0 0 24 24"><path d="M12 5V1L7 6l5 5V7c3.31 0 6 2.69 6 6s-2.69 6-6 6-6-2.69-6-6H4c0 4.42 3.58 8 8 8s8-3.58 8-8-3.58-8-8-8z"/></svg>`
            : `<svg viewBox="0 0 24 24"><path d="M12 5V1l5 5-5 5V7c-3.31 0-6 2.69-6 6s2.69 6 6 6 6-2.69 6-6h2c0 4.42-3.58 8-8 8s-8-3.58-8-8 3.58-8 8-8z"/></svg>`;

        forwardBackwardEl.innerHTML = `${arrow}<span>${sign}${seconds}s</span>`;
        forwardBackwardEl.classList.remove('cr-show');
        void forwardBackwardEl.offsetWidth;
        forwardBackwardEl.classList.add('cr-show');

        if (forwardBackwardTimeout) clearTimeout(forwardBackwardTimeout);
        forwardBackwardTimeout = setTimeout(() => {
            if (forwardBackwardEl) {
                forwardBackwardEl.classList.remove('cr-show');
            }
        }, 600);
    }

    function forwardBackward(isBackward, seconds) {
        if (!state.videoEl) {
            state.videoEl = document.querySelector('video');
            if (!state.videoEl) return;
        }
        const current = state.videoEl.currentTime || 0;
        const duration = state.videoEl.duration || (current + 100);
        const targetTime = isBackward
            ? Math.max(0, current - seconds)
            : Math.min(duration, current + seconds);

        seekTo(targetTime);
        showForwardBackwardOSD(isBackward, seconds);
    }

    // =========================================================================
    //  Seek Preciso (Compatível com Player Vilos / Timeline Slider)
    // =========================================================================
    function seekTo(targetTime) {
        if (!state.videoEl) {
            state.videoEl = document.querySelector('video');
            if (!state.videoEl) return;
        }
        const slider = document.querySelector('[data-testid="timeline-controls-container"] input[type="range"], input.timeline-slider');
        if (slider) {
            slider.value = targetTime;
            slider.dispatchEvent(new Event('input', { bubbles: true }));
            slider.dispatchEvent(new Event('change', { bubbles: true }));
            slider.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
            slider.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
            blurTimelineIfFocused();
        }
        state.videoEl.currentTime = targetTime;
        blurTimelineIfFocused();
    }

    // =========================================================================
    //  Controle de Velocidade
    // =========================================================================
    function setSpeed(rate, showOSD = true) {
        rate = Math.round(rate * 100) / 100;
        rate = Math.max(0.25, Math.min(4.0, rate));
        state.settings.playbackRate = rate;
        setSetting(STORAGE_KEYS.PLAYBACK_RATE, rate);

        if (state.videoEl) {
            state.isApplyingSpeed = true;
            state.videoEl.playbackRate = rate;
            setTimeout(() => { state.isApplyingSpeed = false; }, 100);
        }

        updateSpeedUI();

        if (showOSD) {
            showToast(`⚡ ${rate.toFixed(2).replace(/\.?0+$/, '')}x`);
        }
    }

    function updateSpeedUI() {
        const rate = state.settings.playbackRate;
        const formatted = `${rate.toFixed(2).replace(/\.?0+$/, '')}x`;

        // 1. Atualiza botão nativo do Crunchyroll
        const nativeSpeedBtn = document.querySelector(
            '[data-testid="playback-speed-button"], button[aria-label*="velocidade" i], button[aria-label*="playback speed" i]'
        );
        if (nativeSpeedBtn && nativeSpeedBtn.textContent !== formatted) {
            nativeSpeedBtn.textContent = formatted;
        }

        // 2. Dropdown de configurações
        const dropdownSlider = document.getElementById('cr-dropdown-speed-range');
        if (dropdownSlider && dropdownSlider.value !== String(rate)) dropdownSlider.value = rate;
        const dropdownVal = document.getElementById('cr-dropdown-speed-val');
        if (dropdownVal && dropdownVal.textContent !== formatted) dropdownVal.textContent = formatted;

        document.querySelectorAll('.cr-dropdown-preset-btn').forEach(btn => {
            const btnSpeed = Number(btn.getAttribute('data-speed'));
            const isActive = Math.abs(btnSpeed - rate) < 0.01;
            btn.classList.toggle('cr-active', isActive);
        });

        // 3. Menu de velocidade no player
        renderSpeedMenuList();
        const customRange = document.getElementById('cr-speed-menu-custom-range');
        if (customRange && customRange.value !== String(rate)) customRange.value = rate;
        const customVal = document.getElementById('cr-speed-menu-custom-val');
        if (customVal && customVal.textContent !== formatted) customVal.textContent = formatted;
    }

    // =========================================================================
    //  Modo Full-Height
    // =========================================================================
    function applyFullHeightState() {
        if (isWatchPage() && state.settings.fullHeight) {
            document.body.classList.add('cr-full-height-active');
        } else {
            document.body.classList.remove('cr-full-height-active');
            document.body.classList.remove('cr-header-revealed');
        }
        updateFullHeightButton();
    }

    function setFullHeight(active) {
        state.settings.fullHeight = active;
        setSetting(STORAGE_KEYS.FULL_HEIGHT, active);
        applyFullHeightState();
        showToast(active ? '⤢ Modo Full-Height Ativado' : '⤡ Modo Normal Ativado');
    }

    function updateFullHeightButton() {
        const btn = document.getElementById('cr-fullheight-btn');
        if (!btn) return;

        if (state.settings.fullHeight) {
            btn.classList.add('cr-active');
            btn.title = 'Sair do Modo Full-Height (T)';
            btn.setAttribute('aria-label', 'Sair do Modo Full-Height');
            btn.innerHTML = `
                <svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor">
                    <path d="M9 9H3V7h4V3h2v6zm6 0V3h2v4h4v2h-6zm0 6h6v2h-4v4h-2v-6zm-6 0v6H7v-4H3v-2h6z"/>
                </svg>
            `;
        } else {
            btn.classList.remove('cr-active');
            btn.title = 'Modo Full-Height (T)';
            btn.setAttribute('aria-label', 'Modo Full-Height');
            btn.innerHTML = `
                <svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor">
                    <path d="M4 4h6v2H6v4H4V4zm16 0v6h-2V6h-4V4h6zm0 16h-6v-2h4v-4h2v6zm-16 0v-6h2v4h4v2H4z"/>
                </svg>
            `;
        }
    }

    // =========================================================================
    //  Limpeza de Gradientes e Banner Final
    // =========================================================================
    function applyCleanGradients(active) {
        state.settings.cleanGradients = active;
        setSetting(STORAGE_KEYS.CLEAN_GRADIENTS, active);
        if (active) {
            document.documentElement.classList.add('cr-clean-gradients');
        } else {
            document.documentElement.classList.remove('cr-clean-gradients');
        }
    }

    function applyPerfBoost(active) {
        state.settings.perfBoost = active;
        setSetting(STORAGE_KEYS.PERF_BOOST, active);
        if (active) {
            document.documentElement.classList.add('cr-perf-boost');
        } else {
            document.documentElement.classList.remove('cr-perf-boost');
        }
    }

    function parseSkipIntervals(str) {
        if (!str || typeof str !== 'string') return [];
        return str
            .split(',')
            .map(s => parseInt(s.trim(), 10))
            .filter(n => !isNaN(n) && n > 0);
    }

    function checkEndBanner() {
        if (!state.settings.closeEndBanner) return;
        const closeBtn = document.querySelector(
            '[class*="erc-end-slate"] button[data-t="close-btn"], [data-testid="end-slate"] button, [data-t="end-slate"] button, button[data-t="close-btn"][class*="end-slate"]'
        );
        if (closeBtn && closeBtn.offsetParent) {
            closeBtn.click();
        }
    }

    // =========================================================================
    //  Navegação de Episódios
    // =========================================================================
    function nextEpisode() {
        const selectors = [
            '[data-testid="next-episode-button"]',
            '[data-testid="next-episode-btn"]',
            '[data-t="next-episode-button"]',
            '[data-t="next-episode-btn"]',
            '[data-testid="player-controls-next-episode"]',
            '[data-testid="next-episode"] button',
            '[data-testid="next-episode"] a',
            '[data-t="next-episode"] button',
            '[data-t="next-episode"] a',
            'button[aria-label*="Next" i]',
            'button[aria-label*="Próximo" i]',
            'a[aria-label*="Next" i]',
            'a[aria-label*="Próximo" i]',
            '[class*="next-episode"] a',
            '[class*="nextEpisode"] a',
            'a[href*="/watch/"][class*="next"]'
        ];
        for (const sel of selectors) {
            const el = document.querySelector(sel);
            if (el && !el.closest('.cr-player-btn') && !el.closest('#cr-bottom-left-controls')) {
                showToast('Próximo episódio ⏭️');
                el.click();
                return;
            }
        }
        showToast('Próximo episódio não encontrado');
    }

    function prevEpisode() {
        const selectors = [
            '[data-testid="previous-episode-button"]',
            '[data-testid="prev-episode-button"]',
            '[data-testid="previous-episode-btn"]',
            '[data-testid="prev-episode-btn"]',
            '[data-t="previous-episode-button"]',
            '[data-t="prev-episode-button"]',
            '[data-t="previous-episode-btn"]',
            '[data-t="prev-episode-btn"]',
            '[data-testid="previous-episode"] button',
            '[data-testid="previous-episode"] a',
            '[data-t="previous-episode"] button',
            '[data-t="previous-episode"] a',
            'button[aria-label*="Previous" i]',
            'button[aria-label*="Anterior" i]',
            'a[aria-label*="Previous" i]',
            'a[aria-label*="Anterior" i]',
            '[class*="previous-episode"] a',
            '[class*="prevEpisode"] a',
            'a[href*="/watch/"][class*="prev"]'
        ];
        for (const sel of selectors) {
            const el = document.querySelector(sel);
            if (el && !el.closest('.cr-player-btn') && !el.closest('#cr-bottom-left-controls')) {
                showToast('Episódio anterior ⏮️');
                el.click();
                return;
            }
        }
        showToast('Episódio anterior não encontrado');
    }

    async function togglePiP() {
        if (!state.videoEl) return;
        try {
            if (document.pictureInPictureElement) {
                await document.exitPictureInPicture();
            } else {
                await state.videoEl.requestPictureInPicture();
            }
        } catch (_) {
            showToast('PiP indisponível');
        }
    }

    // =========================================================================
    //  Sistema de Auto-Skip (Oficial Crunchyroll API & Player Vilos)
    // =========================================================================
    async function loadSkipEvents(mediaId) {
        state.skipEvents = { intro: null, recap: null, credits: null, preview: null };
        state.skippedEvents.clear();
        state.isSkipping = false;
        state.activeSkipItem = null;

        if (!mediaId) return;

        try {
            const url = `https://static.crunchyroll.com/skip-events/production/${mediaId}.json`;
            const res = await fetch(url, { credentials: 'omit' });
            if (!res.ok) return;

            const data = await res.json();
            parseSkipEvents(data);
        } catch (_) {}
    }

    function parseSkipEvents(data) {
        if (!data) return;

        if (Array.isArray(data)) {
            for (const item of data) {
                const type = String(item.type || item.approverId || '').toLowerCase();
                const start = Number(item.start);
                const end = Number(item.end);
                if (!isNaN(start) && !isNaN(end)) {
                    if (type.includes('intro') || type.includes('op')) state.skipEvents.intro = { start, end };
                    else if (type.includes('recap')) state.skipEvents.recap = { start, end };
                    else if (type.includes('credit') || type.includes('outro') || type.includes('ed')) state.skipEvents.credits = { start, end };
                    else if (type.includes('preview')) state.skipEvents.preview = { start, end };
                }
            }
            return;
        }

        for (const [rawKey, val] of Object.entries(data)) {
            if (!val || typeof val !== 'object') continue;
            const key = rawKey.toLowerCase();
            const start = Number(val.start ?? val.startTime ?? val.start_time);
            const end = Number(val.end ?? val.endTime ?? val.end_time);
            if (!isNaN(start) && !isNaN(end)) {
                if (key.includes('intro') || key.includes('op')) state.skipEvents.intro = { start, end };
                else if (key.includes('recap')) state.skipEvents.recap = { start, end };
                else if (key.includes('credit') || key.includes('outro') || key.includes('ed')) state.skipEvents.credits = { start, end };
                else if (key.includes('preview')) state.skipEvents.preview = { start, end };
            }
        }
    }

    function checkSkipEvents(currentTime) {
        if (!state.videoEl) return;
        if (state.isSkipping) return;

        const eventDefinitions = [
            { type: 'recap', label: 'Recapitulação', toast: 'Recapitulação pulada ⏭️', enabled: state.settings.autoSkipRecap, event: state.skipEvents.recap },
            { type: 'intro', label: 'Abertura', toast: 'Abertura pulada ⏭️', enabled: state.settings.autoSkipIntro, event: state.skipEvents.intro },
            { type: 'credits', label: 'Encerramento', toast: 'Encerramento pulado ⏭️', enabled: state.settings.autoSkipCredits, event: state.skipEvents.credits },
            { type: 'preview', label: 'Prévia', toast: 'Prévia pulada ⏭️', enabled: state.settings.autoSkipPreview, event: state.skipEvents.preview },
        ];

        let matched = null;
        for (const def of eventDefinitions) {
            if (!def.event) continue;
            if (currentTime >= def.event.start && currentTime < def.event.end - 0.5) {
                matched = def;
                break;
            }
        }

        if (matched) {
            state.activeSkipItem = matched;
            const eventKey = `${state.mediaId || 'curr'}_${matched.type}`;

            if (matched.enabled) {
                if (!state.skippedEvents.has(eventKey)) {
                    state.isSkipping = true;
                    state.skippedEvents.add(eventKey);
                    setTimeout(() => { state.isSkipping = false; }, 3000);

                    const targetTime = matched.event.end + 0.1;
                    seekTo(targetTime);
                    showToast(matched.toast);
                }
            }
        } else {
            state.activeSkipItem = null;
        }

        // Verifica botões nativos no player
        checkNativeSkipButton();
    }

    function checkNativeSkipButton() {
        if (state.isSkipping) return;
        const player = getPlayerRoot();
        if (!player) return;

        // 1. Verificação por ícones SVG do Crunchyroll
        const iconMappings = [
            { selector: '[data-testid="skip-intro-icon"], [data-testid*="skip-intro"]', type: 'intro', toast: 'Abertura pulada ⏭️', enabled: state.settings.autoSkipIntro },
            { selector: '[data-testid="skip-recap-icon"], [data-testid*="skip-recap"]', type: 'recap', toast: 'Recapitulação pulada ⏭️', enabled: state.settings.autoSkipRecap },
            { selector: '[data-testid="skip-credits-icon"], [data-testid*="skip-credits"]', type: 'credits', toast: 'Encerramento pulado ⏭️', enabled: state.settings.autoSkipCredits },
            { selector: '[data-testid="skip-preview-icon"], [data-testid*="skip-preview"]', type: 'preview', toast: 'Prévia pulada ⏭️', enabled: state.settings.autoSkipPreview },
        ];

        for (const map of iconMappings) {
            if (!map.enabled) continue;
            const icon = player.querySelector(map.selector);
            if (icon) {
                const btn = icon.closest('button');
                if (btn && btn.offsetParent && btn.tagName === 'BUTTON') {
                    const eventKey = `${state.mediaId || 'curr'}_${map.type}`;
                    if (!state.skippedEvents.has(eventKey)) {
                        state.isSkipping = true;
                        state.skippedEvents.add(eventKey);
                        setTimeout(() => { state.isSkipping = false; }, 3000);

                        btn.click();
                        showToast(map.toast);
                        return;
                    }
                }
            }
        }

        // 2. Verificação por atributos e texto em <button>
        const candidates = player.querySelectorAll('button');
        for (const btn of candidates) {
            if (!btn.offsetParent) continue;
            if (btn.tagName !== 'BUTTON') continue;
            if (btn.classList.contains('cr-player-btn') || btn.closest('#cr-bottom-left-controls')) continue;

            const ariaLabel = (btn.getAttribute('aria-label') || '').toLowerCase().trim();
            const text = (btn.textContent || '').toLowerCase().trim();
            const testId = (btn.getAttribute('data-testid') || '').toLowerCase().trim();
            const dataT = (btn.getAttribute('data-t') || '').toLowerCase().trim();

            const fullMeta = `${ariaLabel} ${text} ${testId} ${dataT}`;

            if (/next|prev|próximo|proximo|anterior|content|conteúdo|conteudo|slate|recommendation/i.test(fullMeta)) {
                continue;
            }

            let eventType = null;
            let toastText = null;

            if (
                ariaLabel === 'skip intro' ||
                ariaLabel === 'pular introdução' ||
                ariaLabel === 'pular introducao' ||
                ariaLabel === 'pular abertura' ||
                text === 'skip intro' ||
                text === 'pular introdução' ||
                text === 'pular introducao' ||
                text === 'pular abertura' ||
                testId === 'skip-intro' ||
                testId === 'skip-intro-btn' ||
                testId === 'skip-intro-button' ||
                dataT === 'skip-intro-btn'
            ) {
                eventType = 'intro';
                toastText = 'Abertura pulada ⏭️';
            } else if (
                ariaLabel === 'skip recap' ||
                ariaLabel === 'pular recapitulação' ||
                ariaLabel === 'pular recapitulacao' ||
                ariaLabel === 'pular resumo' ||
                text === 'skip recap' ||
                text === 'pular recapitulação' ||
                text === 'pular recapitulacao' ||
                text === 'pular resumo' ||
                testId === 'skip-recap' ||
                testId === 'skip-recap-btn' ||
                testId === 'skip-recap-button' ||
                dataT === 'skip-recap-btn'
            ) {
                eventType = 'recap';
                toastText = 'Recapitulação pulada ⏭️';
            } else if (
                ariaLabel === 'skip credits' ||
                ariaLabel === 'pular créditos' ||
                ariaLabel === 'pular creditos' ||
                ariaLabel === 'pular encerramento' ||
                text === 'skip credits' ||
                text === 'pular créditos' ||
                text === 'pular creditos' ||
                text === 'pular encerramento' ||
                testId === 'skip-credits' ||
                testId === 'skip-credits-btn' ||
                testId === 'skip-credits-button' ||
                dataT === 'skip-credits-btn'
            ) {
                eventType = 'credits';
                toastText = 'Encerramento pulado ⏭️';
            } else if (
                ariaLabel === 'skip preview' ||
                ariaLabel === 'pular prévia' ||
                ariaLabel === 'pular previa' ||
                text === 'skip preview' ||
                text === 'pular prévia' ||
                text === 'pular previa' ||
                testId === 'skip-preview' ||
                testId === 'skip-preview-btn' ||
                testId === 'skip-preview-button' ||
                dataT === 'skip-preview-btn'
            ) {
                eventType = 'preview';
                toastText = 'Prévia pulada ⏭️';
            }

            if (!eventType) continue;

            let shouldSkip = false;
            if (eventType === 'intro') shouldSkip = state.settings.autoSkipIntro;
            else if (eventType === 'recap') shouldSkip = state.settings.autoSkipRecap;
            else if (eventType === 'credits') shouldSkip = state.settings.autoSkipCredits;
            else if (eventType === 'preview') shouldSkip = state.settings.autoSkipPreview;

            if (shouldSkip) {
                const eventKey = `${state.mediaId || 'curr'}_${eventType}`;
                if (!state.skippedEvents.has(eventKey)) {
                    state.isSkipping = true;
                    state.skippedEvents.add(eventKey);
                    setTimeout(() => { state.isSkipping = false; }, 3000);

                    btn.click();
                    showToast(toastText);
                }
                return;
            }
        }
    }

    function triggerManualSkip() {
        if (state.activeSkipItem && state.videoEl) {
            const eventKey = `${state.mediaId || 'curr'}_${state.activeSkipItem.type}`;
            state.isSkipping = true;
            state.skippedEvents.add(eventKey);
            setTimeout(() => { state.isSkipping = false; }, 3000);

            const targetTime = state.activeSkipItem.event.end + 0.1;
            seekTo(targetTime);
            showToast(state.activeSkipItem.toast);
            return;
        }

        const player = getPlayerRoot();
        if (player) {
            const candidates = player.querySelectorAll('button');
            for (const btn of candidates) {
                if (!btn.offsetParent) continue;
                if (btn.classList.contains('cr-player-btn')) continue;
                const ariaLabel = (btn.getAttribute('aria-label') || '').toLowerCase();
                const text = (btn.textContent || '').toLowerCase();
                const combined = `${ariaLabel} ${text}`;
                if (/next|prev|próximo|proximo|anterior|content|slate|recommendation/i.test(combined)) continue;
                if (/skip intro|pular introdução|pular abertura|skip recap|pular recap|skip credit|pular encerramento/i.test(combined)) {
                    state.isSkipping = true;
                    setTimeout(() => { state.isSkipping = false; }, 3000);
                    btn.click();
                    showToast('Segmento pulado ⏭️');
                    return;
                }
            }
        }

        if (state.videoEl && state.videoEl.currentTime < 300) {
            seekTo(state.videoEl.currentTime + 85);
            showToast('Avançado +85s ⏭️');
        }
    }

    // =========================================================================
    //  Vinculação do Elemento <video> & Estabilizador VSync (ProMotion 120Hz)
    // =========================================================================
    let vSyncPacingActive = false;
    let vSyncFrameId = null;

    function startVSyncStabilizer(video) {
        if (!video || vSyncPacingActive) return;
        if (typeof video.requestVideoFrameCallback !== 'function') return;

        vSyncPacingActive = true;

        function onFrame(now, metadata) {
            if (!vSyncPacingActive || video.paused || video.ended) {
                vSyncPacingActive = false;
                return;
            }

            // Mantém a cadência atrelada ao relógio de apresentação do display
            vSyncFrameId = video.requestVideoFrameCallback(onFrame);
        }

        vSyncFrameId = video.requestVideoFrameCallback(onFrame);
    }

    let heartbeatEl = null;

    function startCompositorHeartbeat() {
        if (!heartbeatEl || !heartbeatEl.isConnected) {
            heartbeatEl = document.getElementById('cr-compositor-heartbeat');
            if (!heartbeatEl) {
                heartbeatEl = document.createElement('div');
                heartbeatEl.id = 'cr-compositor-heartbeat';
                heartbeatEl.className = 'cr-compositor-heartbeat';
                (document.body || document.documentElement).appendChild(heartbeatEl);
            }
        }
        heartbeatEl.style.display = 'block';
    }

    function stopCompositorHeartbeat() {
        if (heartbeatEl) {
            heartbeatEl.style.display = 'none';
        }
    }

    function attachVideo(video) {
        if (state.videoEl === video) return;
        vSyncPacingActive = false;
        state.videoEl = video;

        try {
            video.preload = 'auto';
        } catch (_) {}

        video.playbackRate = state.settings.playbackRate;

        if (!video.paused && !video.ended) {
            startVSyncStabilizer(video);
            startCompositorHeartbeat();
        }

        let lastTimeUpdateCheck = 0;
        video.addEventListener('timeupdate', () => {
            const now = Date.now();
            if (now - lastTimeUpdateCheck > 300) {
                lastTimeUpdateCheck = now;
                checkSkipEvents(video.currentTime);
                checkEndBanner();
            }
        });

        video.addEventListener('ratechange', () => {
            if (state.isApplyingSpeed) return;
            if (Math.abs(video.playbackRate - state.settings.playbackRate) > 0.01) {
                state.isApplyingSpeed = true;
                video.playbackRate = state.settings.playbackRate;
                setTimeout(() => { state.isApplyingSpeed = false; }, 100);
            }
        });

        video.addEventListener('loadedmetadata', () => {
            video.playbackRate = state.settings.playbackRate;
        });

        video.addEventListener('play', () => {
            video.playbackRate = state.settings.playbackRate;
            startVSyncStabilizer(video);
            if (!video.paused && !video.ended) {
                startCompositorHeartbeat();
            }
        });

        video.addEventListener('playing', () => {
            startVSyncStabilizer(video);
            if (!video.paused && !video.ended) {
                startCompositorHeartbeat();
            }
        });

        video.addEventListener('pause', () => {
            vSyncPacingActive = false;
            stopCompositorHeartbeat();
        });

        video.addEventListener('ended', () => {
            vSyncPacingActive = false;
            stopCompositorHeartbeat();
        });
    }

    // =========================================================================
    //  Construção e Injeção de Controles do Player (Padrão Oficial Crunchyroll)
    // =========================================================================
    function createSkipSvg(isBackward, seconds) {
        const path = isBackward
            ? 'M12.5 3a9 9 0 1 0 8.7 6.7l-1.9.5A7 7 0 1 1 12.5 5v3l5-4-5-4v3z'
            : 'M11.5 3a9 9 0 1 1-8.7 6.7l1.9.5A7 7 0 1 0 11.5 5v3l-5-4 5-4v3z';
        const fontSize = seconds >= 100 ? '7' : (seconds >= 10 ? '8' : '8.5');
        return `
            <svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor">
                <path d="${path}"/>
                <text x="12" y="15.5" font-size="${fontSize}" font-weight="bold" text-anchor="middle" fill="currentColor" font-family="sans-serif">${seconds}</text>
            </svg>
        `;
    }

    function mountLeftControls(force = false) {
        if (!isWatchPage()) return;

        const leftStack = document.querySelector(
            '[data-testid="bottom-left-controls-stack"], [data-t="bottom-left-controls-stack"], .bottom-left-controls-stack'
        );
        if (!leftStack) return;

        const existingLeft = document.getElementById('cr-bottom-left-controls');
        if (existingLeft) {
            if (!force && leftStack.contains(existingLeft)) {
                return;
            }
            existingLeft.remove();
        }

        const leftGroup = document.createElement('div');
        leftGroup.id = 'cr-bottom-left-controls';
        leftGroup.style.display = 'inline-flex';
        leftGroup.style.alignItems = 'center';
        leftGroup.style.flexShrink = '0';

        // 1. Episódio Anterior
        const prevBtn = document.createElement('button');
        prevBtn.className = 'cr-player-btn';
        prevBtn.title = 'Episódio Anterior (Shift + P)';
        prevBtn.setAttribute('aria-label', 'Episódio Anterior');
        prevBtn.innerHTML = `
            <svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor">
                <path d="M6 6h2v12H6zm2.5 6 10 6.5V5.5L8.5 12z"/>
            </svg>
        `;
        prevBtn.onclick = (e) => {
            e.stopPropagation();
            prevEpisode();
        };
        leftGroup.appendChild(prevBtn);

        // 2. Botões dinâmicos de retrocesso configurados
        const backwardIntervals = parseSkipIntervals(state.settings.fastBackwardButtons);
        for (const sec of backwardIntervals) {
            const rewBtn = document.createElement('button');
            rewBtn.className = 'cr-player-btn';
            rewBtn.title = `Retroceder ${sec}s`;
            rewBtn.setAttribute('aria-label', `Retroceder ${sec} segundos`);
            rewBtn.innerHTML = createSkipSvg(true, sec);
            rewBtn.onclick = (e) => {
                e.stopPropagation();
                forwardBackward(true, sec);
            };
            leftGroup.appendChild(rewBtn);
        }

        // 3. Botões dinâmicos de avanço configurados
        const forwardIntervals = parseSkipIntervals(state.settings.fastForwardButtons);
        for (const sec of forwardIntervals) {
            const fwdBtn = document.createElement('button');
            fwdBtn.className = 'cr-player-btn';
            fwdBtn.title = `Avançar ${sec}s`;
            fwdBtn.setAttribute('aria-label', `Avançar ${sec} segundos`);
            fwdBtn.innerHTML = createSkipSvg(false, sec);
            fwdBtn.onclick = (e) => {
                e.stopPropagation();
                forwardBackward(false, sec);
            };
            leftGroup.appendChild(fwdBtn);
        }

        // Insere antes do timestamp ou container de volume
        const targetAnchor = leftStack.querySelector(
            '[data-testid="timestamp"], [data-testid="volume-slider-container"], .volume-container'
        ) || leftStack.lastElementChild;

        if (targetAnchor && targetAnchor.parentNode === leftStack) {
            leftStack.insertBefore(leftGroup, targetAnchor);
        } else {
            leftStack.appendChild(leftGroup);
        }

        state.leftControlsMounted = true;
    }

    function mountRightControls() {
        if (!isWatchPage()) return;

        const rightStack = document.querySelector(
            '[data-testid="bottom-right-controls-stack"], [data-t="bottom-right-controls-stack"], .bottom-right-controls-stack'
        );
        if (!rightStack) return;

        // Intercepta botão nativo de velocidade para abrir o menu estilizado
        bindNativeSpeedButton(rightStack);

        const existingRight = document.getElementById('cr-bottom-right-controls');
        if (existingRight && rightStack.contains(existingRight)) {
            return;
        }

        const rightGroup = document.createElement('div');
        rightGroup.id = 'cr-bottom-right-controls';
        rightGroup.style.display = 'inline-flex';
        rightGroup.style.alignItems = 'center';
        rightGroup.style.flexShrink = '0';
        rightGroup.style.position = 'relative';

        // 1. Modo Full-Height
        const fullHeightBtn = document.createElement('button');
        fullHeightBtn.id = 'cr-fullheight-btn';
        fullHeightBtn.className = `cr-player-btn ${state.settings.fullHeight ? 'cr-active' : ''}`;
        fullHeightBtn.title = state.settings.fullHeight ? 'Sair do Modo Full-Height (T)' : 'Modo Full-Height (T)';
        fullHeightBtn.setAttribute('aria-label', 'Modo Full-Height');
        fullHeightBtn.innerHTML = state.settings.fullHeight
            ? `<svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor"><path d="M9 9H3V7h4V3h2v6zm6 0V3h2v4h4v2h-6zm0 6h6v2h-4v4h-2v-6zm-6 0v6H7v-4H3v-2h6z"/></svg>`
            : `<svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor"><path d="M4 4h6v2H6v4H4V4zm16 0v6h-2V6h-4V4h6zm0 16h-6v-2h4v-4h2v6zm-16 0v-6h2v4h4v2H4z"/></svg>`;
        fullHeightBtn.onclick = (e) => {
            e.stopPropagation();
            setFullHeight(!state.settings.fullHeight);
        };

        // 2. Picture-in-Picture
        const pipBtn = document.createElement('button');
        pipBtn.id = 'cr-pip-btn';
        pipBtn.className = 'cr-player-btn';
        pipBtn.title = 'Picture-in-Picture (P)';
        pipBtn.setAttribute('aria-label', 'Picture-in-Picture');
        pipBtn.innerHTML = `
            <svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor">
                <path d="M19 7h-8v6h8V7zm2-4H3c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h18c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 16.01H3V4.99h18v14.02z"/>
            </svg>
        `;
        pipBtn.onclick = (e) => {
            e.stopPropagation();
            togglePiP();
        };

        rightGroup.appendChild(fullHeightBtn);
        rightGroup.appendChild(pipBtn);

        // Insere antes do botão de fullscreen
        const fullscreenBtn = rightStack.querySelector(
            '[data-testid="fullscreen-button"], [data-testid="fullscreen-btn"], [data-t="fullscreen-btn"], button[aria-label*="Fullscreen" i], button[aria-label*="tela cheia" i]'
        );
        const targetAnchor = fullscreenBtn ? (fullscreenBtn.closest('[data-testid="bottom-right-controls-stack"] > *') || fullscreenBtn) : null;

        if (targetAnchor && targetAnchor.parentNode === rightStack) {
            rightStack.insertBefore(rightGroup, targetAnchor);
        } else {
            rightStack.appendChild(rightGroup);
        }

        buildSpeedMenu(rightStack);
        updateSpeedUI();
        state.rightControlsMounted = true;
    }

    function mountControls() {
        if (!isWatchPage()) return;
        mountLeftControls();
        mountRightControls();
    }

    // =========================================================================
    //  Menu de Velocidade no Estilo Nativo Crunchyroll
    // =========================================================================
    let speedMenuEl = null;

    function buildSpeedMenu(anchorParent) {
        if (speedMenuEl && document.body.contains(speedMenuEl)) return;

        speedMenuEl = document.createElement('div');
        speedMenuEl.className = 'cr-speed-menu-popover';

        speedMenuEl.innerHTML = `
            <div class="cr-speed-menu-title">Velocidade de reprodução</div>
            <div class="cr-speed-menu-list" id="cr-speed-menu-list"></div>
            <div class="cr-speed-menu-custom">
                <div class="cr-speed-menu-custom-header">
                    <span>Ajuste fino</span>
                    <span id="cr-speed-menu-custom-val" style="color: #f47521; font-weight: 700;">${state.settings.playbackRate.toFixed(2).replace(/\.?0+$/, '')}x</span>
                </div>
                <input type="range" min="0.25" max="4.0" step="0.05" value="${state.settings.playbackRate}" class="cr-speed-range" id="cr-speed-menu-custom-range">
                <div class="cr-speed-menu-custom-actions">
                    <button class="cr-speed-menu-step-btn" id="cr-speed-sub-btn">-0.1x</button>
                    <button class="cr-speed-menu-step-btn" id="cr-speed-reset-btn">1.0x</button>
                    <button class="cr-speed-menu-step-btn" id="cr-speed-add-btn">+0.1x</button>
                </div>
            </div>
        `;

        // Range slider
        const slider = speedMenuEl.querySelector('#cr-speed-menu-custom-range');
        slider.oninput = (e) => {
            e.stopPropagation();
            setSpeed(Number(slider.value));
        };

        // Actions
        speedMenuEl.querySelector('#cr-speed-sub-btn').onclick = (e) => {
            e.stopPropagation();
            setSpeed(state.settings.playbackRate - 0.1);
        };
        speedMenuEl.querySelector('#cr-speed-reset-btn').onclick = (e) => {
            e.stopPropagation();
            setSpeed(1.0);
        };
        speedMenuEl.querySelector('#cr-speed-add-btn').onclick = (e) => {
            e.stopPropagation();
            setSpeed(state.settings.playbackRate + 0.1);
        };

        anchorParent.appendChild(speedMenuEl);
        renderSpeedMenuList();
    }

    function renderSpeedMenuList() {
        if (!speedMenuEl) return;
        const listContainer = speedMenuEl.querySelector('#cr-speed-menu-list');
        if (!listContainer) return;

        const presets = [0.25, 0.5, 0.75, 1.0, 1.25, 1.5, 1.75, 2.0];
        const currentRate = state.settings.playbackRate;
        const checkmarkSvg = '<svg viewBox="0 0 24 24" width="20" height="20"><circle cx="12" cy="12" r="10" fill="#ffffff"/><path d="M9 12l2 2 4-4" stroke="#000000" stroke-width="2.5" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>';

        const existingItems = listContainer.querySelectorAll('.cr-speed-menu-item');
        if (existingItems.length > 0) {
            existingItems.forEach(item => {
                const rate = Number(item.getAttribute('data-speed'));
                const isSelected = Math.abs(rate - currentRate) < 0.01;
                item.classList.toggle('cr-selected', isSelected);
                item.classList.toggle('cr-active', isSelected);
                const checkEl = item.querySelector('.cr-speed-menu-check');
                if (checkEl) {
                    const hasSvg = checkEl.children.length > 0;
                    if (isSelected && !hasSvg) {
                        checkEl.innerHTML = checkmarkSvg;
                    } else if (!isSelected && hasSvg) {
                        checkEl.innerHTML = '';
                    }
                }
            });
            return;
        }

        listContainer.innerHTML = presets.map(rate => {
            const isSelected = Math.abs(rate - currentRate) < 0.01;
            const label = rate === 1.0 ? 'Normal' : `${rate.toString().replace('.', ',')}x`;
            const checkmark = isSelected ? checkmarkSvg : '';

            return `
                <div class="cr-speed-menu-item ${isSelected ? 'cr-selected cr-active' : ''}" data-speed="${rate}">
                    <span>${label}</span>
                    <div class="cr-speed-menu-check">${checkmark}</div>
                </div>
            `;
        }).join('');

        listContainer.querySelectorAll('.cr-speed-menu-item').forEach(item => {
            item.onclick = (e) => {
                e.stopPropagation();
                const rate = Number(item.getAttribute('data-speed'));
                setSpeed(rate);
                closeSpeedMenu();
            };
        });
    }

    function bindNativeSpeedButton(rightStack) {
        const nativeSpeedBtn = rightStack.querySelector(
            '[data-testid="playback-speed-button"], button[aria-label*="velocidade" i], button[aria-label*="playback speed" i]'
        );
        if (nativeSpeedBtn && !nativeSpeedBtn.dataset.crBound) {
            nativeSpeedBtn.dataset.crBound = 'true';
            nativeSpeedBtn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                toggleSpeedMenu();
            }, true);
        }
    }

    function toggleSpeedMenu() {
        if (!speedMenuEl) return;
        state.speedMenuOpen = !state.speedMenuOpen;
        if (state.speedMenuOpen) {
            updateSpeedUI();
            speedMenuEl.classList.add('cr-visible');
        } else {
            speedMenuEl.classList.remove('cr-visible');
        }
    }

    function closeSpeedMenu() {
        if (speedMenuEl) {
            speedMenuEl.classList.remove('cr-visible');
            state.speedMenuOpen = false;
        }
    }

    // =========================================================================
    //  Injeção do Botão na Topbar e Dropdown de Configurações
    // =========================================================================
    let dropdownContainerEl = null;

    function mountTopbarButton() {
        const existingTile = document.getElementById('cr-header-tile-wrapper');
        if (existingTile && document.body.contains(existingTile)) {
            return;
        }

        const searchTarget = document.querySelector(
            '[data-testid="header-search-btn"], [data-t="header-search-btn"], [class*="search-header-button"], [aria-label*="busca" i], [aria-label*="search" i], [aria-label*="pesquisar" i]'
        );
        const watchlistTarget = document.querySelector(
            '[data-testid="header-watchlist-btn"], [data-t="header-watchlist-btn"], [class*="watchlist-header-button"], [aria-label*="fila" i], [aria-label*="watchlist" i], [aria-label*="lista" i]'
        );

        const refTarget = searchTarget || watchlistTarget;
        const actionItem = refTarget ? refTarget.closest('[class*="action-item"]') : null;
        let anchor = null;
        let container = null;

        if (actionItem && actionItem.parentElement) {
            container = actionItem.parentElement;
            anchor = actionItem;
        } else if (refTarget) {
            anchor = refTarget.closest('.erc-header-tile') || refTarget.parentElement;
            container = anchor ? anchor.parentElement : null;
        } else {
            container = document.querySelector(
                '[class*="header-actions"], [class*="user-actions"], [class*="erc-user-actions"], header [class*="actions"], header nav > div:last-child'
            );
        }

        if (!container) return;

        // Container nativo com classe erc-header-tile
        const tileWrapper = document.createElement('div');
        tileWrapper.id = 'cr-header-tile-wrapper';
        tileWrapper.className = (refTarget && refTarget.className ? refTarget.className : 'erc-header-tile') + ' cr-header-tile';

        const btn = document.createElement('button');
        btn.id = 'cr-topbar-settings-btn';
        btn.className = (refTarget && refTarget.tagName === 'BUTTON' ? refTarget.className : 'header-icon header-icon--is-clickable') + ' cr-topbar-settings-btn';
        btn.type = 'button';
        btn.title = 'Configurações do Script (Shift + O)';
        btn.setAttribute('aria-label', 'Configurações do Script');
        btn.innerHTML = `
            <svg class="cr-topbar-settings-svg" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <circle cx="12" cy="12" r="3"></circle>
                <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path>
            </svg>
        `;

        btn.onclick = (e) => {
            e.preventDefault();
            e.stopPropagation();
            toggleSettingsDropdown();
        };

        tileWrapper.appendChild(btn);

        // Constrói o dropdown dentro do tileWrapper para ancoragem absoluta
        buildSettingsDropdown(tileWrapper);

        if (actionItem && actionItem.parentElement === container) {
            const actionItemWrapper = document.createElement('div');
            actionItemWrapper.id = 'cr-header-action-item';
            actionItemWrapper.className = actionItem.className.replace(/--is-mobile-hidden\S*/g, '').trim();
            actionItemWrapper.appendChild(tileWrapper);
            container.insertBefore(actionItemWrapper, actionItem);
        } else if (anchor && anchor.parentNode === container) {
            container.insertBefore(tileWrapper, anchor);
        } else {
            container.appendChild(tileWrapper);
        }
    }

    function buildSettingsDropdown(parentTile) {
        if (dropdownContainerEl && document.body.contains(dropdownContainerEl)) {
            if (!parentTile.contains(dropdownContainerEl)) {
                parentTile.appendChild(dropdownContainerEl);
            }
            return;
        }

        dropdownContainerEl = document.createElement('div');
        dropdownContainerEl.className = 'cr-settings-dropdown';
        dropdownContainerEl.id = 'cr-settings-dropdown';

        dropdownContainerEl.innerHTML = `
            <div class="cr-dropdown-header">
                <h3>
                    <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor">
                        <path d="M12 15.2a3.2 3.2 0 1 0 0-6.4 3.2 3.2 0 0 0 0 6.4z"/>
                        <path d="M19.97 11.5a1.1 1.1 0 0 0-.17-.4l-1.09-.16a7.2 7.2 0 0 0-.4-1l.69-.87a1.1 1.1 0 0 0-.03-.78l-.75-.72a1.1 1.1 0 0 0-.75-.03l-.87.66a7.2 7.2 0 0 0-1-.4l-.16-1.09A1.1 1.1 0 0 0 15 6h-1a1.1 1.1 0 0 0-.4.17l-.16 1.09a7.2 7.2 0 0 0-1 .4l-.87-.66a1.1 1.1 0 0 0-.78.03l-.72.75a1.1 1.1 0 0 0-.03.78l.66.87a7.2 7.2 0 0 0-.4 1l-1.09.16A1.1 1.1 0 0 0 9 12v1a1.1 1.1 0 0 0 .17.4l1.09.16a7.2 7.2 0 0 0 .4 1l-.66.87a1.1 1.1 0 0 0 .03.78l.72.75a1.1 1.1 0 0 0 .78-.03l.87-.66a7.2 7.2 0 0 0 1 .4l.16 1.09A1.1 1.1 0 0 0 14 19h1a1.1 1.1 0 0 0 .4-.17l.16-1.09a7.2 7.2 0 0 0 1-.4l.87.66a1.1 1.1 0 0 0 .78.03l.75-.72a1.1 1.1 0 0 0 .03-.78l-.69-.87a7.2 7.2 0 0 0 .4-1l1.09-.16A1.1 1.1 0 0 0 20 13v-1a1.1 1.1 0 0 0-.03-.5z"/>
                    </svg>
                    Configurações
                </h3>
                <span class="cr-badge">PRO v4.0</span>
            </div>

            <div class="cr-dropdown-body">
                <!-- Seção 1: Pular Segmentos -->
                <div class="cr-dropdown-section">
                    <div class="cr-dropdown-section-title">Pular Segmentos (Auto-Skip)</div>

                    <div class="cr-dropdown-row" id="cr-row-intro">
                        <div class="cr-dropdown-label-wrap">
                            <span class="cr-dropdown-label">Abertura (Intro)</span>
                            <span class="cr-dropdown-hint">Pula sequências de abertura de anime</span>
                        </div>
                        <label class="cr-switch">
                            <input type="checkbox" id="cr-chk-intro">
                            <span class="cr-slider"></span>
                        </label>
                    </div>

                    <div class="cr-dropdown-row" id="cr-row-recap">
                        <div class="cr-dropdown-label-wrap">
                            <span class="cr-dropdown-label">Recapitulação (Recap)</span>
                            <span class="cr-dropdown-hint">Pula resumos do episódio anterior</span>
                        </div>
                        <label class="cr-switch">
                            <input type="checkbox" id="cr-chk-recap">
                            <span class="cr-slider"></span>
                        </label>
                    </div>

                    <div class="cr-dropdown-row" id="cr-row-credits">
                        <div class="cr-dropdown-label-wrap">
                            <span class="cr-dropdown-label">Encerramento (Créditos)</span>
                            <span class="cr-dropdown-hint">Avança créditos de encerramento</span>
                        </div>
                        <label class="cr-switch">
                            <input type="checkbox" id="cr-chk-credits">
                            <span class="cr-slider"></span>
                        </label>
                    </div>

                    <div class="cr-dropdown-row" id="cr-row-preview">
                        <div class="cr-dropdown-label-wrap">
                            <span class="cr-dropdown-label">Prévia (Preview)</span>
                            <span class="cr-dropdown-hint">Pula prévias do próximo episódio</span>
                        </div>
                        <label class="cr-switch">
                            <input type="checkbox" id="cr-chk-preview">
                            <span class="cr-slider"></span>
                        </label>
                    </div>
                </div>

                <!-- Seção 2: Player & Interface -->
                <div class="cr-dropdown-section">
                    <div class="cr-dropdown-section-title">Player & Interface</div>

                    <div class="cr-dropdown-row" id="cr-row-fullheight">
                        <div class="cr-dropdown-label-wrap">
                            <span class="cr-dropdown-label">Iniciar em Modo Full-Height</span>
                            <span class="cr-dropdown-hint">Player preenche a tela sem cortar proporção</span>
                        </div>
                        <label class="cr-switch">
                            <input type="checkbox" id="cr-chk-fullheight">
                            <span class="cr-slider"></span>
                        </label>
                    </div>

                    <div class="cr-dropdown-row" id="cr-row-perfboost">
                        <div class="cr-dropdown-label-wrap">
                            <span class="cr-dropdown-label">Otimização de Desempenho & VSync (Anti-Lag, sem trackers)</span>
                            <span class="cr-dropdown-hint">Aceleração GPU e redução de lag</span>
                        </div>
                        <label class="cr-switch">
                            <input type="checkbox" id="cr-chk-perfboost">
                            <span class="cr-slider"></span>
                        </label>
                    </div>

                    <div class="cr-dropdown-row" id="cr-row-gradients">
                        <div class="cr-dropdown-label-wrap">
                            <span class="cr-dropdown-label">Limpar Sombras e Gradientes</span>
                            <span class="cr-dropdown-hint">Remove faixas pretas ao mover mouse no vídeo</span>
                        </div>
                        <label class="cr-switch">
                            <input type="checkbox" id="cr-chk-gradients">
                            <span class="cr-slider"></span>
                        </label>
                    </div>

                    <div class="cr-dropdown-row" id="cr-row-endbanner">
                        <div class="cr-dropdown-label-wrap">
                            <span class="cr-dropdown-label">Auto-fechar Banner Final</span>
                            <span class="cr-dropdown-hint">Fecha janela de sugestões sobre os créditos</span>
                        </div>
                        <label class="cr-switch">
                            <input type="checkbox" id="cr-chk-endbanner">
                            <span class="cr-slider"></span>
                        </label>
                    </div>

                    <div class="cr-dropdown-row" id="cr-row-shortcuts">
                        <div class="cr-dropdown-label-wrap">
                            <span class="cr-dropdown-label">Atalhos de Teclado Ativados</span>
                            <span class="cr-dropdown-hint">T (Full-Height), S (Skip), J/L (10s), P (PiP)</span>
                        </div>
                        <label class="cr-switch">
                            <input type="checkbox" id="cr-chk-shortcuts">
                            <span class="cr-slider"></span>
                        </label>
                    </div>
                </div>

                <!-- Seção 3: Intervalos de Pulo no Player -->
                <div class="cr-dropdown-section">
                    <div class="cr-dropdown-section-title">Intervalos de Pulo no Player</div>

                    <div style="margin-bottom: 10px;">
                        <div class="cr-dropdown-label" style="font-size: 12px; color: #a0a0a0; margin-bottom: 4px;">Retroceder no Player</div>
                        <div class="cr-interval-chips-wrap" id="cr-backward-chips">
                            <button type="button" class="cr-interval-chip" data-seconds="5">5s</button>
                            <button type="button" class="cr-interval-chip" data-seconds="10">10s</button>
                            <button type="button" class="cr-interval-chip" data-seconds="30">30s</button>
                        </div>
                    </div>

                    <div>
                        <div class="cr-dropdown-label" style="font-size: 12px; color: #a0a0a0; margin-bottom: 4px;">Avançar no Player</div>
                        <div class="cr-interval-chips-wrap" id="cr-forward-chips">
                            <button type="button" class="cr-interval-chip" data-seconds="5">5s</button>
                            <button type="button" class="cr-interval-chip" data-seconds="10">10s</button>
                            <button type="button" class="cr-interval-chip" data-seconds="30">30s</button>
                            <button type="button" class="cr-interval-chip" data-seconds="85">85s</button>
                        </div>
                    </div>
                </div>

                <!-- Seção 4: Velocidade Padrão -->
                <div class="cr-dropdown-section">
                    <div class="cr-dropdown-section-title">Velocidade de Reprodução Padrão</div>

                    <div class="cr-dropdown-speed-presets">
                        <button class="cr-dropdown-preset-btn" data-speed="0.75">0.75x</button>
                        <button class="cr-dropdown-preset-btn" data-speed="1.0">1.0x</button>
                        <button class="cr-dropdown-preset-btn" data-speed="1.25">1.25x</button>
                        <button class="cr-dropdown-preset-btn" data-speed="1.5">1.5x</button>
                        <button class="cr-dropdown-preset-btn" data-speed="2.0">2.0x</button>
                    </div>

                    <div class="cr-dropdown-slider-wrap">
                        <input type="range" min="0.25" max="4.0" step="0.05" class="cr-speed-range" id="cr-dropdown-speed-range">
                        <span class="cr-dropdown-slider-val" id="cr-dropdown-speed-val">1.0x</span>
                    </div>
                </div>
            </div>
        `;

        // Previne fechamento ao clicar dentro do dropdown
        dropdownContainerEl.onclick = (e) => {
            e.stopPropagation();
        };

        // Bindings de Toggles
        const chkIntro = dropdownContainerEl.querySelector('#cr-chk-intro');
        const chkRecap = dropdownContainerEl.querySelector('#cr-chk-recap');
        const chkCredits = dropdownContainerEl.querySelector('#cr-chk-credits');
        const chkPreview = dropdownContainerEl.querySelector('#cr-chk-preview');
        const chkFullHeight = dropdownContainerEl.querySelector('#cr-chk-fullheight');
        const chkPerfBoost = dropdownContainerEl.querySelector('#cr-chk-perfboost');
        const chkGradients = dropdownContainerEl.querySelector('#cr-chk-gradients');
        const chkEndBanner = dropdownContainerEl.querySelector('#cr-chk-endbanner');
        const chkShortcuts = dropdownContainerEl.querySelector('#cr-chk-shortcuts');
        const speedSlider = dropdownContainerEl.querySelector('#cr-dropdown-speed-range');

        chkIntro.onchange = () => {
            state.settings.autoSkipIntro = chkIntro.checked;
            setSetting(STORAGE_KEYS.AUTO_SKIP_INTRO, chkIntro.checked);
        };
        chkRecap.onchange = () => {
            state.settings.autoSkipRecap = chkRecap.checked;
            setSetting(STORAGE_KEYS.AUTO_SKIP_RECAP, chkRecap.checked);
        };
        chkCredits.onchange = () => {
            state.settings.autoSkipCredits = chkCredits.checked;
            setSetting(STORAGE_KEYS.AUTO_SKIP_CREDITS, chkCredits.checked);
        };
        chkPreview.onchange = () => {
            state.settings.autoSkipPreview = chkPreview.checked;
            setSetting(STORAGE_KEYS.AUTO_SKIP_PREVIEW, chkPreview.checked);
        };
        chkFullHeight.onchange = () => {
            setFullHeight(chkFullHeight.checked);
        };
        if (chkPerfBoost) {
            chkPerfBoost.onchange = () => {
                applyPerfBoost(chkPerfBoost.checked);
            };
        }
        chkGradients.onchange = () => {
            applyCleanGradients(chkGradients.checked);
        };
        chkEndBanner.onchange = () => {
            state.settings.closeEndBanner = chkEndBanner.checked;
            setSetting(STORAGE_KEYS.CLOSE_END_BANNER, chkEndBanner.checked);
        };
        chkShortcuts.onchange = () => {
            state.settings.shortcutsEnabled = chkShortcuts.checked;
            setSetting(STORAGE_KEYS.SHORTCUTS_ENABLED, chkShortcuts.checked);
        };

        function toggleInterval(isBackward, sec) {
            const key = isBackward ? STORAGE_KEYS.FAST_BACKWARD_BUTTONS : STORAGE_KEYS.FAST_FORWARD_BUTTONS;
            const currentStr = isBackward ? state.settings.fastBackwardButtons : state.settings.fastForwardButtons;
            let list = parseSkipIntervals(currentStr);
            if (list.includes(sec)) {
                if (list.length > 1) {
                    list = list.filter(s => s !== sec);
                }
            } else {
                list.push(sec);
            }
            list.sort((a, b) => a - b);
            const newStr = list.join(',');
            if (isBackward) {
                state.settings.fastBackwardButtons = newStr;
            } else {
                state.settings.fastForwardButtons = newStr;
            }
            setSetting(key, newStr);
            mountLeftControls(true);
            syncDropdownInputs();
        }

        dropdownContainerEl.querySelectorAll('#cr-backward-chips .cr-interval-chip').forEach(btn => {
            btn.onclick = (e) => {
                e.stopPropagation();
                const sec = Number(btn.getAttribute('data-seconds'));
                toggleInterval(true, sec);
            };
        });

        dropdownContainerEl.querySelectorAll('#cr-forward-chips .cr-interval-chip').forEach(btn => {
            btn.onclick = (e) => {
                e.stopPropagation();
                const sec = Number(btn.getAttribute('data-seconds'));
                toggleInterval(false, sec);
            };
        });

        speedSlider.oninput = (e) => {
            e.stopPropagation();
            setSpeed(Number(speedSlider.value));
        };

        dropdownContainerEl.querySelectorAll('.cr-dropdown-preset-btn').forEach(btn => {
            btn.onclick = (e) => {
                e.stopPropagation();
                setSpeed(Number(btn.getAttribute('data-speed')));
            };
        });

        parentTile.appendChild(dropdownContainerEl);
        syncDropdownInputs();
    }

    function syncDropdownInputs() {
        if (!dropdownContainerEl) return;
        const s = state.settings;

        const chkIntro = dropdownContainerEl.querySelector('#cr-chk-intro');
        const chkRecap = dropdownContainerEl.querySelector('#cr-chk-recap');
        const chkCredits = dropdownContainerEl.querySelector('#cr-chk-credits');
        const chkPreview = dropdownContainerEl.querySelector('#cr-chk-preview');
        const chkFullHeight = dropdownContainerEl.querySelector('#cr-chk-fullheight');
        const chkPerfBoost = dropdownContainerEl.querySelector('#cr-chk-perfboost');
        const chkGradients = dropdownContainerEl.querySelector('#cr-chk-gradients');
        const chkEndBanner = dropdownContainerEl.querySelector('#cr-chk-endbanner');
        const chkShortcuts = dropdownContainerEl.querySelector('#cr-chk-shortcuts');

        if (chkIntro) chkIntro.checked = s.autoSkipIntro;
        if (chkRecap) chkRecap.checked = s.autoSkipRecap;
        if (chkCredits) chkCredits.checked = s.autoSkipCredits;
        if (chkPreview) chkPreview.checked = s.autoSkipPreview;
        if (chkFullHeight) chkFullHeight.checked = s.fullHeight;
        if (chkPerfBoost) chkPerfBoost.checked = s.perfBoost;
        if (chkGradients) chkGradients.checked = s.cleanGradients;
        if (chkEndBanner) chkEndBanner.checked = s.closeEndBanner;
        if (chkShortcuts) chkShortcuts.checked = s.shortcutsEnabled;

        const backwardList = parseSkipIntervals(s.fastBackwardButtons);
        const forwardList = parseSkipIntervals(s.fastForwardButtons);

        dropdownContainerEl.querySelectorAll('#cr-backward-chips .cr-interval-chip').forEach(chip => {
            const sec = Number(chip.getAttribute('data-seconds'));
            chip.classList.toggle('cr-active', backwardList.includes(sec));
        });

        dropdownContainerEl.querySelectorAll('#cr-forward-chips .cr-interval-chip').forEach(chip => {
            const sec = Number(chip.getAttribute('data-seconds'));
            chip.classList.toggle('cr-active', forwardList.includes(sec));
        });

        const speedSlider = dropdownContainerEl.querySelector('#cr-dropdown-speed-range');
        if (speedSlider) speedSlider.value = s.playbackRate;
        const speedVal = dropdownContainerEl.querySelector('#cr-dropdown-speed-val');
        if (speedVal) speedVal.textContent = `${s.playbackRate.toFixed(2).replace(/\.?0+$/, '')}x`;

        dropdownContainerEl.querySelectorAll('.cr-dropdown-preset-btn').forEach(btn => {
            const btnSpeed = Number(btn.getAttribute('data-speed'));
            if (Math.abs(btnSpeed - s.playbackRate) < 0.01) {
                btn.classList.add('cr-active');
            } else {
                btn.classList.remove('cr-active');
            }
        });
    }

    function toggleSettingsDropdown() {
        if (!dropdownContainerEl) {
            mountTopbarButton();
        }
        if (!dropdownContainerEl) return;

        state.settingsDropdownOpen = !state.settingsDropdownOpen;
        if (state.settingsDropdownOpen) {
            syncDropdownInputs();
            dropdownContainerEl.classList.add('cr-visible');
        } else {
            dropdownContainerEl.classList.remove('cr-visible');
        }
    }

    function closeSettingsDropdown() {
        if (dropdownContainerEl) {
            dropdownContainerEl.classList.remove('cr-visible');
            state.settingsDropdownOpen = false;
        }
    }

    // =========================================================================
    //  Atalhos de Teclado
    // =========================================================================
    function handleKeydown(e) {
        blurTimelineIfFocused();
        // Fechar dropdowns com ESC
        if (e.key === 'Escape') {
            if (state.settingsDropdownOpen) {
                closeSettingsDropdown();
                return;
            }
            if (state.speedMenuOpen) {
                closeSpeedMenu();
                return;
            }
        }

        if (isTypingContext(e)) return;

        // Shift + O: Configurações
        if (e.shiftKey && (e.key === 'O' || e.key === 'o')) {
            e.preventDefault();
            toggleSettingsDropdown();
            return;
        }

        if (!state.settings.shortcutsEnabled) return;
        if (!isWatchPage()) return;

        // Shift + N: Próximo Episódio
        if (e.shiftKey && (e.key === 'N' || e.key === 'n')) {
            e.preventDefault();
            nextEpisode();
            return;
        }

        // Shift + P: Episódio Anterior
        if (e.shiftKey && (e.key === 'P' || e.key === 'p')) {
            e.preventDefault();
            prevEpisode();
            return;
        }

        // T / t: Alternar Full-Height
        if (!e.ctrlKey && !e.metaKey && !e.altKey && !e.shiftKey && (e.key === 't' || e.key === 'T')) {
            e.preventDefault();
            setFullHeight(!state.settings.fullHeight);
            return;
        }

        // S / s: Pular Segmento
        if (!e.ctrlKey && !e.metaKey && !e.altKey && !e.shiftKey && (e.key === 's' || e.key === 'S')) {
            e.preventDefault();
            triggerManualSkip();
            return;
        }

        // P / p: Picture-in-Picture
        if (!e.ctrlKey && !e.metaKey && !e.altKey && !e.shiftKey && (e.key === 'p' || e.key === 'P')) {
            e.preventDefault();
            togglePiP();
            return;
        }

        // J / j: Retroceder 10s
        if (!e.ctrlKey && !e.metaKey && !e.altKey && !e.shiftKey && (e.key === 'j' || e.key === 'J')) {
            e.preventDefault();
            forwardBackward(true, 10);
            return;
        }

        // L / l: Avançar 10s
        if (!e.ctrlKey && !e.metaKey && !e.altKey && !e.shiftKey && (e.key === 'l' || e.key === 'L')) {
            e.preventDefault();
            forwardBackward(false, 10);
            return;
        }

        // Shift + Seta Esquerda: Retroceder 30s
        if (e.shiftKey && e.key === 'ArrowLeft') {
            e.preventDefault();
            forwardBackward(true, 30);
            return;
        }

        // Shift + Seta Direita: Avançar 30s
        if (e.shiftKey && e.key === 'ArrowRight') {
            e.preventDefault();
            forwardBackward(false, 30);
            return;
        }

        // Z / z: Resetar Velocidade para 1.0x
        if (!e.ctrlKey && !e.metaKey && !e.altKey && !e.shiftKey && (e.key === 'z' || e.key === 'Z')) {
            e.preventDefault();
            setSpeed(1.0);
            return;
        }

        // ] ou C ou Shift + > : Aumentar Velocidade (+0.1x)
        if (
            e.key === ']' ||
            (!e.shiftKey && (e.key === 'c' || e.key === 'C')) ||
            (e.shiftKey && (e.key === '>' || e.key === '.'))
        ) {
            e.preventDefault();
            setSpeed(state.settings.playbackRate + 0.1);
            return;
        }

        // [ ou X ou Shift + < : Diminuir Velocidade (-0.1x)
        if (
            e.key === '[' ||
            (!e.shiftKey && (e.key === 'x' || e.key === 'X')) ||
            (e.shiftKey && (e.key === '<' || e.key === ','))
        ) {
            e.preventDefault();
            setSpeed(state.settings.playbackRate - 0.1);
            return;
        }
    }

    // =========================================================================
    //  Controle de Mouse (Hover do Topo para Revelar Header em Full-Height)
    // =========================================================================
    let mouseMovePending = false;
    let lastMouseMoveTime = 0;
    let cachedHeaderEl = null;
    let lastClientY = 0;
    let lastMouseTarget = null;

    function handleMouseMove(e) {
        if (!state.settings.fullHeight || !isWatchPage()) return;

        const isRevealed = document.body.classList.contains('cr-header-revealed');
        // Atalho rápido: se o header já está recolhido e o mouse está longe do topo, ignora
        if (!isRevealed && e.clientY > 35) return;

        lastClientY = e.clientY;
        lastMouseTarget = e.target;

        if (mouseMovePending) return;

        const now = performance.now();
        const elapsed = now - lastMouseMoveTime;
        const throttleInterval = 100; // ms

        if (elapsed < throttleInterval) {
            mouseMovePending = true;
            setTimeout(() => {
                mouseMovePending = false;
                requestAnimationFrame(updateHeaderRevealState);
            }, throttleInterval - elapsed);
            return;
        }

        mouseMovePending = true;
        requestAnimationFrame(updateHeaderRevealState);
    }

    function updateHeaderRevealState() {
        mouseMovePending = false;
        lastMouseMoveTime = performance.now();

        if (!state.settings.fullHeight || !isWatchPage()) return;

        const isRevealed = document.body.classList.contains('cr-header-revealed');

        if (lastClientY <= 35) {
            if (!isRevealed) {
                document.body.classList.add('cr-header-revealed');
            }
        } else if (lastClientY > 80) {
            if (isRevealed) {
                if (!cachedHeaderEl || !cachedHeaderEl.isConnected) {
                    cachedHeaderEl = document.querySelector('header .header-content, [class^="app-layout__header"] .header-content');
                }
                if (!cachedHeaderEl || !(lastMouseTarget instanceof Node) || !cachedHeaderEl.contains(lastMouseTarget)) {
                    document.body.classList.remove('cr-header-revealed');
                }
            }
        }
    }

    // =========================================================================
    //  Ciclo de Vida SPA e Escaneamento do DOM
    // =========================================================================
    let isScanning = false;
    let rescanTimer = null;

    function debouncedRescanDOM() {
        if (rescanTimer) clearTimeout(rescanTimer);
        rescanTimer = setTimeout(() => {
            rescanTimer = null;
            if (isScanning) return;
            isScanning = true;
            try {
                rescanDOM();
            } finally {
                isScanning = false;
            }
        }, 150);
    }

    function rescanDOM() {
        mountTopbarButton();

        if (!isWatchPage()) {
            document.body.classList.remove('cr-full-height-active');
            return;
        }

        applyFullHeightState();

        const video = document.querySelector('video');
        if (video) {
            attachVideo(video);
        }

        mountControls();

        if (state.videoEl) {
            checkSkipEvents(state.videoEl.currentTime);
        }
    }

    let lastUrl = location.href;
    function onUrlChange() {
        const currentUrl = location.href;
        if (currentUrl === lastUrl) return;
        lastUrl = currentUrl;

        stopCompositorHeartbeat();

        const newMediaId = getMediaId();
        if (newMediaId !== state.mediaId) {
            state.mediaId = newMediaId;
            loadSkipEvents(newMediaId);
        }

        cachedHeaderEl = null;
        applyFullHeightState();
        state.leftControlsMounted = false;
        state.rightControlsMounted = false;
        debouncedRescanDOM();
    }

    // Interceptação de pushState / replaceState para SPA
    const originalPushState = history.pushState;
    history.pushState = function(...args) {
        originalPushState.apply(this, args);
        onUrlChange();
    };

    const originalReplaceState = history.replaceState;
    history.replaceState = function(...args) {
        originalReplaceState.apply(this, args);
        onUrlChange();
    };

    // =========================================================================
    //  Inicialização
    // =========================================================================
    function boot() {
        if (state.settings.cleanGradients) {
            document.documentElement.classList.add('cr-clean-gradients');
        }
        if (state.settings.perfBoost) {
            document.documentElement.classList.add('cr-perf-boost');
        }

        state.mediaId = getMediaId();
        if (state.mediaId) {
            loadSkipEvents(state.mediaId);
        }

        applyFullHeightState();
        rescanDOM();

        // Listeners Globais
        window.addEventListener('popstate', onUrlChange);
        window.addEventListener('keydown', handleKeydown, true);
        window.addEventListener('mousemove', handleMouseMove, { passive: true });
        document.addEventListener('mouseleave', () => {
            document.body.classList.remove('cr-header-revealed');
        });

        const handleTimelineBlur = (e) => {
            const target = e.target;
            if (
                target &&
                (target.type === 'range' ||
                    target.getAttribute?.('role') === 'slider' ||
                    (typeof target.closest === 'function' &&
                        target.closest(
                            '[data-testid="scrubber"], [data-testid="timeline-controls-container"], .timeline-container, [class*="timeline"], [class*="scrubber"], [role="slider"]'
                        )))
            ) {
                setTimeout(() => {
                    blurTimelineIfFocused();
                }, 0);
            }
        };
        window.addEventListener('pointerup', handleTimelineBlur, true);
        window.addEventListener('mouseup', handleTimelineBlur, true);
        window.addEventListener('click', handleTimelineBlur, true);

        // Fechar dropdowns ao clicar fora
        document.addEventListener('click', (e) => {
            if (state.settingsDropdownOpen) {
                const tile = document.getElementById('cr-header-tile-wrapper');
                if (!tile || !tile.contains(e.target)) {
                    closeSettingsDropdown();
                }
            }
            if (state.speedMenuOpen) {
                if (speedMenuEl && !speedMenuEl.contains(e.target)) {
                    const speedBtn = document.querySelector('[data-testid="playback-speed-button"]');
                    if (!speedBtn || !speedBtn.contains(e.target)) {
                        closeSpeedMenu();
                    }
                }
            }
        });

        // Observador de mutações resiliente e de baixo impacto (ignora legendas e player)
        const observer = new MutationObserver((mutations) => {
            if (state.leftControlsMounted && state.rightControlsMounted && state.videoEl && state.videoEl.isConnected) {
                if (!document.getElementById('cr-bottom-left-controls') || !document.getElementById('cr-bottom-right-controls')) {
                    debouncedRescanDOM();
                }
                return;
            }

            let shouldScan = false;
            for (let i = 0; i < mutations.length; i++) {
                const target = mutations[i].target;
                const el = target && target.nodeType === 1 ? target : (target ? target.parentElement : null);
                if (!el) continue;

                // Ignora mutações dos próprios elementos do userscript
                if (el.closest && el.closest(
                    '#cr-header-tile-wrapper, #cr-header-action-item, #cr-settings-dropdown, #cr-bottom-left-controls, #cr-bottom-right-controls, .cr-speed-menu-popover, #cr-osd-toast'
                )) {
                    continue;
                }

                // Ignora mutações internas do container do player (legendas, ul, canvas, buffers de vídeo)
                if (el.closest && el.closest('#player-container, .bitmovinplayer-container, [class*="video-player"], ul, canvas')) {
                    continue;
                }

                shouldScan = true;
                break;
            }
            if (shouldScan) {
                debouncedRescanDOM();
            }
        });

        observer.observe(document.documentElement, {
            childList: true,
            subtree: true,
        });

        // Polling leve para contingência de renderização tardia
        setInterval(() => {
            if (location.href !== lastUrl) {
                onUrlChange();
            } else {
                if (!document.getElementById('cr-header-tile-wrapper')) {
                    mountTopbarButton();
                }
                if (isWatchPage() && (!state.videoEl || !state.leftControlsMounted || !state.rightControlsMounted)) {
                    debouncedRescanDOM();
                }
            }
        }, 1000);

        // Registro no menu do userscript manager
        if (typeof GM_registerMenuCommand === 'function') {
            GM_registerMenuCommand('⚙️ Configurações do Player', toggleSettingsDropdown);
            GM_registerMenuCommand('⤢ Alternar Modo Full-Height', () => setFullHeight(!state.settings.fullHeight));
            GM_registerMenuCommand('⚡ Resetar Velocidade (1.0x)', () => setSpeed(1.0));
        }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', boot);
    } else {
        boot();
    }
})();
