// ==UserScript==
// @name         Crunchyroll — Hide Scrollbars
// @namespace    http://tampermonkey.net
// @version      2.0
// @updateURL    https://raw.githubusercontent.com/oguilhermelima/userscripts/main/dist/crunchyroll.user.js
// @downloadURL  https://raw.githubusercontent.com/oguilhermelima/userscripts/main/dist/crunchyroll.user.js
// @author       oguilhermelima
// @description  Persistently hides scrollbars across all Crunchyroll routes.
// @match        https://www.crunchyroll.com/*
// @match        https://crunchyroll.com/*
// @grant        GM_addStyle
// @run-at       document-body
// @noframes
// ==/UserScript==
(function() {
    'use strict';

    // CSS limpo aplicando diretamente no escopo global renderizado
    const css = `
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
    `;

    // GM_addStyle contorna as restrições de CSP impostas em SPAs modernas
    GM_addStyle(css);
})();
