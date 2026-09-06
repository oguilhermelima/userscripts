// ==UserScript==
// @name         Reddit — Control Panel, Ad-Free
// @namespace    reddit-tweaks
// @version      2.76.0
// @updateURL    https://raw.githubusercontent.com/oguilhermelima/userscripts/main/dist/reddit.user.js
// @downloadURL  https://raw.githubusercontent.com/oguilhermelima/userscripts/main/dist/reddit.user.js
// @author       oguilhermelima
// @description  Custom Reddit control panel with layout controls, ad cleanup, video autoplay, sorting tabs, and a RedGIFs player.
// @match        https://www.reddit.com/*
// @match        https://sh.reddit.com/*
// @require      https://cdn.jsdelivr.net/npm/hls.js@1/dist/hls.min.js
// @run-at       document-start
// @grant        GM_xmlhttpRequest
// @grant        GM.xmlHttpRequest
// @connect      api.redgifs.com
// @connect      media.redgifs.com
// @connect      redgifs.com
// ==/UserScript==
(function () {
    "use strict";

    /* ==================================================================== *
     * ÍNDICE — ordem das seções (busque o texto do banner pra pular pra ela):
     *   Helpers · Settings model · CSS · Layout · Sidebar "Você" · Sort tabs ·
     *   Topbar (view) · Topbar antiga · Autoplay · Menus lazy (ads) ·
     *   Save/Hide na barra · Listings multiselect (+ toast/stripTrackers/copyText) ·
     *   Micro dock · Feed (filtro/unblur/matureBypass/noTranslate) ·
     *   TikTok overlay (tok*) · RedGifs inline (rg*) · Galeria inline ·
     *   Navbar inferior (mobile) · Barra de logo + sheets · Busca full-screen ·
     *   Apply pipeline (runFeaturePipeline/applySettings/refreshWork) ·
     *   Control panel (FAB) · Default landing · Bootstrap.
     *
     * GUARDS — 3 convenções de "bail barato"; TODA função no refresh usa uma (o observer é
     * childList+subtree, então QUALQUER mutação re-dispara o refresh — e escrita também é mutação):
     *   • flag de módulo      (postBarApplied, filterApplied, *Built)  — "já fiz isto alguma vez?"
     *   • cache de último valor(rxCw/rxFs, rxLastThemeSig, lastTopbarPath) — "mudou desde a última vez?"
     *   • assinatura por nó    (data-rxBar / data-rxPruned / data-rxMature) — "este nó já foi tratado p/ esta config?"
     * Ao escrever no refresh, guarde com "mudou?" (ex.: if (t.textContent!==nt) t.textContent=nt) p/ não re-disparar.
     * ==================================================================== */

    /* ------------------------------------------------------------------ *
     * Helpers
     * ------------------------------------------------------------------ */
    function addStyle(css) {
        const s = document.createElement("style");
        s.textContent = css;
        (document.head || document.documentElement).appendChild(s);
        return s;
    }

    function debounce(fn, ms) {
        let t;
        return function (...a) {
            clearTimeout(t);
            t = setTimeout(() => fn.apply(this, a), ms);
        };
    }

    // Tiny DOM builder. props: className/html/style/on<Event>/attr. kids: nodes or strings.
    function el(tag, props, ...kids) {
        const n = document.createElement(tag);
        if (props)
            for (const k in props) {
                const v = props[k];
                if (v == null) continue;
                if (k === "className") n.className = v;
                else if (k === "html") n.innerHTML = v;
                else if (k === "style" && typeof v === "object") Object.assign(n.style, v);
                else if (k.startsWith("on") && typeof v === "function") n.addEventListener(k.slice(2).toLowerCase(), v);
                else n.setAttribute(k, v);
            }
        for (const c of kids) {
            if (c == null) continue;
            n.append(c.nodeType ? c : document.createTextNode(c));
        }
        return n;
    }

    // Build an <svg> node from a path string (avoids innerHTML namespace issues).
    function icon(path, vb) {
        vb = vb || 24;
        const t = document.createElement("template");
        t.innerHTML = `<svg viewBox="0 0 ${vb} ${vb}" fill="currentColor" width="20" height="20" aria-hidden="true"><path d="${path}"/></svg>`;
        return t.content.firstElementChild;
    }

    // Exact class list Reddit puts on its native sidebar nav links — reused so the
    // "Você" shortcuts come out visually identical to the Communities/Resources rows.
    const NAV_A_CLS =
        "flex justify-between relative px-md gap-[0.5rem] text-secondary hover:text-secondary-hover " +
        "active:bg-interactive-pressed hover:bg-neutral-background-hover hover:no-underline cursor-pointer " +
        "py-2xs -outline-offset-1 s:rounded-2 bg-transparent no-underline";

    const PATH = {
        saved: "M17 3H7a2 2 0 0 0-2 2v16l7-3 7 3V5a2 2 0 0 0-2-2z",
        upvoted: "M12 4l8 9h-5v7H9v-7H4z",
        history: "M13 3a9 9 0 1 0 8.95 10h-2.02A7 7 0 1 1 13 5.07V11l5.25 3.15.75-1.23-4.5-2.67V3z",
        posts: "M4 5h16v2H4zm0 6h16v2H4zm0 6h11v2H4z",
        comments: "M20 2H4a2 2 0 0 0-2 2v16l4-4h14a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2z",
        gear: "M19.14 12.94a7.49 7.49 0 0 0 0-1.88l2.03-1.58a.5.5 0 0 0 .12-.64l-1.92-3.32a.5.5 0 0 0-.61-.22l-2.39.96a7.3 7.3 0 0 0-1.62-.94l-.36-2.54a.5.5 0 0 0-.5-.42h-3.84a.5.5 0 0 0-.5.42l-.36 2.54c-.59.24-1.13.56-1.62.94l-2.39-.96a.5.5 0 0 0-.61.22L2.27 8.84a.5.5 0 0 0 .12.64l2.03 1.58a7.49 7.49 0 0 0 0 1.88l-2.03 1.58a.5.5 0 0 0-.12.64l1.92 3.32c.14.24.42.32.61.22l2.39-.96c.49.38 1.03.7 1.62.94l.36 2.54c.04.24.25.42.5.42h3.84c.25 0 .46-.18.5-.42l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.19.1.47.02.61-.22l1.92-3.32a.5.5 0 0 0-.12-.64l-2.03-1.58zM12 15.5A3.5 3.5 0 1 1 12 8.5a3.5 3.5 0 0 1 0 7z",
        // ícones das abas de ordenação
        best: "M12 2.5l2.7 5.9 6.4.6-4.8 4.3 1.4 6.3L12 16.9 6.3 19.6l1.4-6.3L2.9 9l6.4-.6z",
        hot: "M12 23a7 7 0 0 0 5-11.9c-.2 1-.9 2-1.8 2.4.4-1.5 0-3.3-1.2-4.7-.9-1.2-2.2-2-3-3.3-.4 1.8-1.5 3-2.7 4.2C7 11 6.2 12.8 6.2 15A7 7 0 0 0 12 23z",
        new: "M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z",
        top: "M12 4l-7 7h4v9h6v-9h4z",
        rising: "M16 6l2.29 2.29-4.88 4.88-4-4L2 16.59 3.41 18l6-6 4 4 6.3-6.29L22 12V6z",
        // ações do post (barra) — paths nativos do Reddit, viewBox 0 0 20 20
        postSave: "M13.6 3.8c.882 0 1.6.718 1.6 1.6v11.166l-5.201-2.911L4.8 16.566V5.4a1.6 1.6 0 011.6-1.6h7.2zm0-1.8H6.4A3.4 3.4 0 003 5.4v12.24c0 .682.56 1.172 1.172 1.172.19 0 .385-.047.57-.151L10 15.717l5.259 2.944a1.167 1.167 0 001.742-1.021V5.4A3.4 3.4 0 0013.6 2z",
        postHide: "M3.497 3.503a.9.9 0 10-1.273 1.273l.909.909A10.141 10.141 0 00.92 8.472a3.225 3.225 0 000 3.058A10.296 10.296 0 0010 16.973a10.13 10.13 0 003.709-.712l1.457 1.457a.897.897 0 001.274 0 .9.9 0 000-1.273L3.497 3.503zM10 15.172a8.497 8.497 0 01-7.495-4.494 1.448 1.448 0 010-1.354 8.436 8.436 0 011.9-2.365l2.069 2.068c-.062.271-.105.55-.105.84a3.77 3.77 0 003.767 3.767c.29 0 .569-.043.84-.106l1.31 1.31a8.284 8.284 0 01-2.284.335L10 15.172zm.476-7.237L8.874 6.333a3.722 3.722 0 011.26-.233 3.77 3.77 0 013.767 3.767c0 .444-.091.864-.233 1.26l-1.603-1.603a1.963 1.963 0 00-1.59-1.589zm8.605 3.595a10.297 10.297 0 01-2.22 2.792L15.59 13.05a8.512 8.512 0 001.905-2.372 1.448 1.448 0 000-1.354A8.496 8.496 0 007.69 5.15L6.282 3.742A10.249 10.249 0 0110 3.028c3.8 0 7.28 2.087 9.08 5.444a3.225 3.225 0 010 3.058z",
        postSaveFill: "M14.8 2H5.2A1.2 1.2 0 004 3.2v15.55l6-3.35 6 3.35V3.2A1.2 1.2 0 0014.8 2z",
        check: "M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z",
        // modo story: tela retrato (outline) com play no meio
        story: "M17 3H7c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h10c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 16H7V5h10v14zM10 8.5v7l5-3.5z",
        // ícones da navbar mobile (viewBox 24)
        home: "M12 3 4 9.5V20h5v-6h6v6h5V9.5z",
        popular: "M12 23a7 7 0 0 0 5-11.9c-.2 1-.9 2-1.8 2.4.4-1.5 0-3.3-1.2-4.7-.9-1.2-2.2-2-3-3.3-.4 1.8-1.5 3-2.7 4.2C7 11 6.2 12.8 6.2 15A7 7 0 0 0 12 23z", // mesma chama que PATH.hot
        search: "M15.5 14h-.79l-.28-.27a6.5 6.5 0 1 0-.7.7l.27.28v.79l5 4.99L20.49 19zm-6 0A4.5 4.5 0 1 1 14 9.5 4.5 4.5 0 0 1 9.5 14z",
        create: "M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6z",
        inbox: "M12 22a2 2 0 0 0 2-2h-4a2 2 0 0 0 2 2zm6-6v-5a6 6 0 0 0-5-5.91V4a1 1 0 0 0-2 0v1.09A6 6 0 0 0 6 11v5l-2 2v1h16v-1z",
        profile: "M12 12a5 5 0 1 0-5-5 5 5 0 0 0 5 5zm0 2c-3.33 0-10 1.67-10 5v3h20v-3c0-3.33-6.67-5-10-5z",
        menu: "M3 6h18v2H3zm0 5h18v2H3zm0 5h18v2H3z",
        toTop: "M5 4h14v2H5zm7 3-6 6h4v7h4v-7h4z",
        back: "M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20z",
        shield: "M12 1 3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4zm0 10.99h7c-.53 4.12-3.28 7.79-7 8.94V12H5V6.3l7-3.11v8.8z",
        envelope: "M20 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 4-8 5-8-5V6l8 5 8-5v2z",
        logout: "M17 7l-1.41 1.41L18.17 11H8v2h10.17l-2.58 2.58L17 17l5-5zM4 5h8V3H4c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h8v-2H4z",
        trophy: "M19 5h-2V3H7v2H5c-1.1 0-2 .9-2 2v1c0 2.55 1.92 4.63 4.39 4.94A5.01 5.01 0 0 0 11 18.9V21H7v2h10v-2h-4v-2.1a5.01 5.01 0 0 0 3.61-2.96C19.08 12.63 21 10.55 21 8V7c0-1.1-.9-2-2-2zM5 8V7h2v3.82A3.01 3.01 0 0 1 5 8zm14 0a3.01 3.01 0 0 1-2 2.82V7h2v1z",
        draft: "M14 2H6c-1.1 0-2 .9-2 2v16c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V8l-6-6zm2 16H8v-2h8v2zm0-4H8v-2h8v2zm-3-5V3.5L18.5 9H13z",
        theme: "M12 3a9 9 0 1 0 9 9 9 9 0 0 0-9-9zm0 16V5a7 7 0 0 1 0 14z",
        // voto (viewBox 20) — setas preenchidas do Reddit
        voteUp: "M10 19a3.966 3.966 0 01-3.96-3.962V10.98H2.838a1.731 1.731 0 01-1.605-1.073 1.734 1.734 0 01.377-1.895L9.364.254a.925.925 0 011.272 0l7.754 7.759c.498.499.646 1.242.376 1.894-.27.652-.9 1.073-1.605 1.073h-3.202v4.058A3.965 3.965 0 019.999 19H10z",
        voteDown: "M10 1a3.966 3.966 0 013.96 3.962V9.02h3.202c.706 0 1.335.42 1.605 1.073.27.652.122 1.396-.377 1.895l-7.754 7.759a.925.925 0 01-1.272 0l-7.754-7.76a1.734 1.734 0 01-.376-1.894c.27-.652.9-1.073 1.605-1.073h3.202V4.962A3.965 3.965 0 0110 1z",
        // controles próprios de vídeo (viewBox 24)
        playFill: "M8 5v14l11-7z",
        share: "M18 16.08c-.76 0-1.44.3-1.96.77L8.91 12.7c.05-.23.09-.46.09-.7s-.04-.47-.09-.7l7.05-4.11c.54.5 1.25.81 2.04.81 1.66 0 3-1.34 3-3s-1.34-3-3-3-3 1.34-3 3c0 .24.04.47.09.7L8.04 9.81C7.5 9.31 6.79 9 6 9c-1.66 0-3 1.34-3 3s1.34 3 3 3c.79 0 1.5-.31 2.04-.81l7.12 4.16c-.05.21-.08.43-.08.65 0 1.61 1.31 2.92 2.92 2.92s2.92-1.31 2.92-2.92-1.31-2.92-2.92-2.92z",
        quality: "M3 17v2h6v-2H3zM3 5v2h10V5H3zm10 16v-2h8v-2h-8v-2h-2v6h2zM7 9v2H3v2h4v2h2V9H7zm14 4v-2H11v2h10zm-6-4h2V7h4V5h-4V3h-2v6z",
        expand: "M7 14H5v5h5v-2H7v-3zm-2-4h2V7h3V5H5v5zm12 7h-3v2h5v-5h-2v3zM14 5v2h3v3h2V5h-5z",
        copy: "M3.9 12c0-1.71 1.39-3.1 3.1-3.1h4V7H7c-2.76 0-5 2.24-5 5s2.24 5 5 5h4v-1.9H7c-1.71 0-3.1-1.39-3.1-3.1zM8 13h8v-2H8v2zm9-6h-4v1.9h4c1.71 0 3.1 1.39 3.1 3.1s-1.39 3.1-3.1 3.1h-4V17h4c2.76 0 5-2.24 5-5s-2.24-5-5-5z",
        external: "M19 19H5V5h7V3H5c-1.11 0-2 .9-2 2v14c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2v-7h-2v7zM14 3v2h3.59l-9.83 9.83 1.41 1.41L19 6.41V10h2V3h-7z",
        close: "M11.273 10l5.363-5.363a.9.9 0 10-1.273-1.273L10 8.727 4.637 3.364a.9.9 0 10-1.273 1.273L8.727 10l-5.363 5.363a.9.9 0 101.274 1.273L10 11.273l5.363 5.363a.897.897 0 001.274 0 .9.9 0 000-1.273L11.275 10h-.002z",
        volumeOn: "M3 9v6h4l5 5V4L7 9H3zm13.5 3A4.5 4.5 0 0 0 14 7.97v8.05a4.5 4.5 0 0 0 2.5-4.02zM14 3.23v2.06a7.001 7.001 0 0 1 0 13.42v2.06a9 9 0 0 0 0-17.54z",
        volumeOff: "M16.5 12A4.5 4.5 0 0 0 14 7.97v2.18l2.45 2.45c.03-.2.05-.4.05-.6zM19 12c0 .94-.2 1.82-.54 2.64l1.51 1.51A8.99 8.99 0 0 0 21 12a9 9 0 0 0-7-8.77v2.06A7 7 0 0 1 19 12zM4.27 3 3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06a8.99 8.99 0 0 0 3.69-1.81L19.73 21 21 19.73 4.27 3zM12 4 9.91 6.09 12 8.18z",
    };

    // Wordmark "reddit" oficial (viewBox 0 0 514 149) — embutido pra a barra de logo do mobile não
    // depender do header nativo. Usa --shreddit-color-wordmark (laranja) que existe global.
    const REDDIT_WORDMARK = ["m71.62,45.92l-12.01,28.56c-1.51-.76-5.11-1.61-8.51-1.61s-6.81.85-10.12,2.46c-6.53,3.31-11.35,9.93-11.35,19.48v52.3H-.26V45.35h29.04v14.28h.57c6.81-9.08,17.21-15.79,30.74-15.79,4.92,0,9.65.95,11.54,2.08Z", "m65.84,96.52c0-29.41,20.15-52.68,50.32-52.68,27.33,0,46.91,19.96,46.91,48.05,0,4.92-.47,9.55-1.51,14h-68.48c3.12,10.69,12.39,19.01,26.29,19.01,7.66,0,18.54-2.74,24.4-7.28l9.27,22.32c-8.61,5.86-21.75,8.7-33.29,8.7-32.25,0-53.91-20.81-53.91-52.11Zm26.67-9.36h43.03c0-13.05-8.89-19.96-19.77-19.96-12.3,0-20.62,7.94-23.27,19.96Z", "m419.53-.37c10.03,0,18.25,8.23,18.25,18.25s-8.23,18.25-18.25,18.25-18.25-8.23-18.25-18.25S409.51-.37,419.53-.37Zm14.94,147.49h-29.89V45.35h29.89v101.77Z", "m246,1.47l-.09,53.53h-.57c-8.23-7.85-17.12-11.07-28.75-11.07-28.66,0-47.67,23.08-47.67,52.3s17.78,52.4,46.72,52.4c12.11,0,23.55-4.16,30.93-13.62h.85v12.11h28.47V1.47h-29.89Zm1.42,121.39h-.99l-6.67-6.93c-4.34,4.33-10.28,6.93-17.22,6.93-14.64,0-24.88-11.58-24.88-26.6s10.24-26.6,24.88-26.6,24.88,11.58,24.88,26.6v26.6Z", "m360.15,1.47l-.09,53.53h-.57c-8.23-7.85-17.12-11.07-28.75-11.07-28.66,0-47.67,23.08-47.67,52.3s17.78,52.4,46.72,52.4c12.11,0,23.55-4.16,30.93-13.62h.85v12.11h28.47V1.47h-29.89Zm1.28,121.39h-.99l-6.67-6.93c-4.34,4.33-10.28,6.93-17.22,6.93-14.64,0-24.88-11.58-24.88-26.6s10.24-26.6,24.88-26.6,24.88,11.58,24.88,26.6v26.6Z", "m492.44,45.35h21.85v25.44h-21.85v76.33h-29.89v-76.33h-21.75v-25.44h21.75v-27.66h29.89v27.66Z"];
    function wordmarkSvg() {
        const t = document.createElement("template");
        t.innerHTML = '<svg viewBox="0 0 514 149" height="20" fill="currentColor" aria-hidden="true" style="color:var(--shreddit-color-wordmark,#ff4500)">' + REDDIT_WORDMARK.map((d) => '<path d="' + d + '"></path>').join("") + "</svg>";
        return t.content.firstElementChild;
    }

    /* ------------------------------------------------------------------ *
     * Settings model (source of truth)
     * ------------------------------------------------------------------ */
    // Ordem dos grupos = ordem no painel. Hints explicam o IMPACTO de ligar (curtos, viram <small>).
    const GROUPS = [
        {
            title: "You section",
            items: [
                { key: "userShortcuts", label: "Show You section", hint: "Adds Saved / Upvoted / History / Posts / Comments to the left sidebar. Off = stock sidebar.", def: true },
                { key: "userSecOpen", label: "Start expanded", hint: "Whether that section starts open — it stays collapsible by clicking the header.", def: true, dep: "userShortcuts" },
            ],
        },
        {
            title: "Default landing",
            items: [
                { key: "defaultFeed", label: "Default feed", hint: "Which feed opens at reddit.com root.", type: "select", def: "home", options: [
                    { value: "home", label: "Home" },
                    { value: "popular", label: "Popular" },
                    { value: "all", label: "All" },
                ] },
                { key: "defaultSort", label: "Default sort", hint: "Forces a sort on the landing feed. Default = let Reddit decide.", type: "select", def: "", options: [
                    { value: "", label: "Default" },
                    { value: "best", label: "Best" },
                    { value: "hot", label: "Hot" },
                    { value: "new", label: "New" },
                    { value: "top", label: "Top" },
                    { value: "rising", label: "Rising" },
                ] },
            ],
        },
        {
            title: "Layout",
            items: [
                { key: "wide", label: "Wide layout", hint: "Removes the 1120px cap so the content column fills the screen.", def: true },
                { key: "width", label: "Content width", hint: "Width when Wide is on — lower = narrower column.", type: "slider", min: 70, max: 100, def: 92, unit: "%", dep: "wide" },
                { key: "fontSize", label: "Font size", hint: "Scales the whole site proportionally (text + spacing), like a zoom. 100% = browser default.", type: "slider", min: 80, max: 140, def: 100, unit: "%", step: 5 },
                { key: "hideLeftSidebar", label: "Hide left sidebar", hint: "Hides the whole left nav (communities/feeds) for more reading space.", def: false, hide: true },
                { key: "hideRightSidebar", label: "Hide right sidebar", hint: "Hides the right rail (about box, widgets, recommendations).", def: false, hide: true },
                { key: "fixedRightSidebar", label: "Pin right sidebar", hint: "Pins the right rail to the screen's right edge (fixed, with a left border) — like the left sidebar — instead of floating next to the content. Content fills the rest.", def: true, hide: true },
                { key: "oldTopbar", label: "Classic topbar", hint: "Strips Ask AI / chat / Create from the header for a cleaner top bar.", def: true, hide: true },
                { key: "sortTabs", label: "Sort tabs", hint: "Turns the sort dropdown into Best/Hot/New/Top/Rising tabs.", def: true },
            ],
        },
        {
            title: "Theme",
            items: [
                { key: "blackTheme", label: "Black theme", hint: "Old-Reddit-style near-black dark theme: swaps the default teal-tinted dark surfaces for neutral near-black ones. Only applies in dark mode — auto-disabled when Reddit is in the light theme.", def: true },
            ],
        },
        {
            title: "Navigation",
            items: [{ key: "scrollTop", label: "Scroll to top button", hint: "Adds a back-to-top button to the dock once you scroll down.", def: true }],
        },
        {
            title: "Sidebar sections",
            items: [
                { key: "hideGames", label: "Games on Reddit", hint: "Hides the Games block in the left sidebar.", def: true, hide: true },
                { key: "hideCustomFeeds", label: "Custom Feeds", hint: "Hides the Custom Feeds block.", def: true, hide: true },
                { key: "hideRecent", label: "Recent", hint: "Hides the Recent (recently visited) block.", def: true, hide: true },
                { key: "hideCommunities", label: "Communities", hint: "Hides your subscribed communities list.", def: true, hide: true },
                { key: "hideResources", label: "Resources", hint: "Hides the Resources block (About, Help, Blog…).", def: true, hide: true },
                { key: "hideSidebarFooter", label: "Footer (policies, ©)", hint: "Hides the policy links and the Reddit, Inc. © line.", def: true, hide: true },
                { key: "hideModeration", label: "Moderation", hint: "Hides the MODERATION block (Mod Queue / Mod Mail / r/Mod / moderated communities) in the left sidebar.", def: true, hide: true },
            ],
        },
        {
            title: "Feed",
            items: [
                { key: "hideRecommended", label: "Hide recommendations", hint: "Removes 'suggested' / 'because you visited' posts injected in the feed. Keeps posts from communities you follow.", def: false, hide: true },
                { key: "recSkipAllPop", label: "Except on All/Popular", hint: "Leaves recommendations alone on r/all and r/popular — there everything is a recommendation, so hiding would empty the page.", def: false, dep: "hideRecommended" },
                { key: "filterEnabled", label: "Filter feed", hint: "Hides posts that match your blocklist below.", def: false },
                { key: "filterList", label: "Blocklist", hint: "One per line: r/subreddit (whole community) or a word to match in the title (case-insensitive).", type: "textarea", def: "", dep: "filterEnabled", placeholder: "r/cats\nspoiler\nsome phrase" },
            ],
        },
        {
            title: "Post actions",
            items: [
                { key: "postBarActions", label: "Save/Hide buttons", hint: "Adds Save & Hide to the action bar and pulls the ⋯ menu into it (drops the duplicates from the menu).", def: true },
                { key: "hideAward", label: "Hide award button", hint: "Removes the Give Award button from every post.", def: true },
                { key: "moveShareLast", label: "Share last", hint: "Moves the Share button to the end of the action bar.", def: true },
                { key: "directShare", label: "Direct share", hint: "Clicking Share copies the link instantly instead of opening the dropdown.", def: true },
                { key: "shareNoTrackers", label: "Remove tracking from link", hint: "Removes ?utm…/share-id params from links you copy.", def: true },
            ],
        },
        {
            title: "Media",
            items: [
                { key: "autoplay", label: "Autoplay videos", hint: "Plays/pauses videos (muted) as they scroll in/out of view. Experimental.", def: true },
                { key: "redgifsPlayer", label: "Custom RedGifs player", hint: "Replaces every RedGifs embed on the site with our own player (real video, our controls, progress bar) — same as the TikTok feed.", def: true },
                { key: "redgifsHd", label: "RedGifs HD", hint: "Loads RedGifs in HD (custom player + story feed). Off = SD — lighter / faster on slow connections (default). There's also an HD/SD button on the player itself. Applies to the next ones that load.", def: false },
                { key: "galleryPlayer", label: "Custom gallery nav", hint: "On gallery posts in the feed, swaps Reddit's carousel for ours: a bottom ‹ 2/5 › bar + one-image-per-gesture scroll. Always on inside the TikTok feed.", def: true },
                { key: "imageViewer", label: "Custom image viewer", hint: "Clicking a single image opens it in our own full-screen viewer (max size, open-raw button) instead of Reddit's media page.", def: true },
                { key: "maxQuality", label: "Always max video quality", hint: "Locks Reddit videos to the highest resolution (no adaptive downscaling). Uses more data on slow connections. Off = Auto/adaptive; the quality button still lets you pick.", def: true },
                { key: "nsfwUnblur", label: "Unblur NSFW / spoilers", hint: "Removes the blur on flagged media. Reload the page to blur it again.", def: true, hide: true },
            ],
        },
        {
            title: "Ads & popups",
            items: [
                { key: "hideAds", label: "Hide ads", hint: "Hides promoted posts in the feed and the sidebar ad.", def: true, hide: true },
                { key: "hideAdvertise", label: 'Hide "Advertise" / Reddit Pro', hint: "Hides Advertise / Reddit Pro links in the top bar, sidebar and user menu.", def: true, hide: true },
                { key: "hidePremium", label: "Hide Premium upsell", hint: "Hides Reddit Premium upsell links.", def: true, hide: true },
                { key: "killPopups", label: "Kill login/app popups", hint: "Removes the login wall, 'open in app' and age-gate overlays, and unlocks scrolling when one shows up.", def: true, hide: true },
                { key: "matureBypass", label: "Mature content bypass", hint: "Reveals NSFW/mature posts gated behind the 'open in app' / 18+ prompt by removing the blocking overlay (the post content stays). Pairs well with Unblur.", def: true },
                { key: "noTranslate", label: "Remove auto-translation", hint: "Reddit auto-translates posts when a 'tl=' is in the URL (e.g. from Google). This strips it and reloads to show the original language.", def: true },
            ],
        },
        {
            title: "Mobile",
            items: [
                { key: "mobileBareTop", label: "Minimal top bar", hint: "On phones: unpins the top bar (it scrolls away) and strips it down to just the Reddit logo — no hamburger, search or action icons.", def: true, hide: true },
                { key: "mobileNavbar", label: "Bottom navbar", hint: "On phones: adds a bottom navigation bar.", def: true },
                { key: "navItemsCfg", label: "Navbar items", hint: "Toggle which icons show, and use ↑↓ to reorder them.", type: "navlist", dep: "mobileNavbar" },
            ],
        },
    ];

    // Defaults + ordem inicial dos itens da navbar (configurados pelo widget navlist, não por itens soltos).
    const NAV_DEFAULTS = { navHome: true, navPopular: false, navSearch: true, navStory: true, navCreate: false, navInbox: false, navNotifications: false, navSaved: true, navProfile: true, navMenu: false, navTop: false };
    const NAV_ORDER_DEFAULT = ["navHome", "navSearch", "navStory", "navSaved", "navProfile", "navPopular", "navInbox", "navNotifications", "navCreate", "navMenu", "navTop"];

    // Links injected into the left sidebar (relative to /user/<username>).
    const USER_LINKS = [
        { label: "Saved", path: "/saved/", icon: PATH.saved },
        { label: "Upvoted", path: "/upvoted/", icon: PATH.upvoted },
        { label: "History", path: "/", icon: PATH.history },
        { label: "Posts", path: "/submitted/", icon: PATH.posts },
        { label: "Comments", path: "/comments/", icon: PATH.comments },
    ];

    const ITEMS = GROUPS.flatMap((g) => g.items);
    const HIDE_KEYS = ITEMS.filter((i) => i.hide).map((i) => i.key);
    const DEFAULTS = Object.fromEntries(ITEMS.map((i) => [i.key, i.def]));
    // userSecOpen / defaultFeed / defaultSort entram em DEFAULTS pelos itens de GROUPS acima.
    Object.assign(DEFAULTS, NAV_DEFAULTS); // itens da navbar (configurados pelo widget navlist)
    DEFAULTS.navOrder = NAV_ORDER_DEFAULT.slice();

    const LS_KEY = "rx-panel-settings-v1";
    const settings = { ...DEFAULTS };
    try {
        Object.assign(settings, JSON.parse(localStorage.getItem(LS_KEY) || "{}"));
    } catch (e) {}

    applyNoTranslate(); // cedo (document-start): tira o ?tl= antes do conteúdo traduzido carregar

    function save() {
        try {
            localStorage.setItem(LS_KEY, JSON.stringify(settings));
        } catch (e) {}
    }

    /* ------------------------------------------------------------------ *
     * CSS — feature hides gated on html.rx-<key>, plus injected UI styling
     * ------------------------------------------------------------------ */
    addStyle(`
        /* ===== Anúncios ===== */
        html.rx-hideAds article:has(shreddit-ad-post),
        html.rx-hideAds article:has([promoted-post-type]),
        html.rx-hideAds article:has([is-promoted]),
        html.rx-hideAds shreddit-ad-post,
        html.rx-hideAds shreddit-sidebar-ad,
        html.rx-hideAds shreddit-dynamic-ad-link { display: none !important; }

        html.rx-hideAdvertise advertise-button,
        html.rx-hideAdvertise #advertise-button,
        html.rx-hideAdvertise faceplate-tracker[noun="advertise"],
        html.rx-hideAdvertise faceplate-tracker:has(a[href*="ads.reddit.com"]),
        html.rx-hideAdvertise faceplate-tracker:has(a[href*="/reddit-pro"]),
        html.rx-hideAdvertise li:has(> a[href*="ads.reddit.com"]),
        html.rx-hideAdvertise li:has(> a[href*="/reddit-pro"]) { display: none !important; }

        html.rx-hidePremium a[href*="referrerId=ad_overflow"],
        html.rx-hidePremium faceplate-tracker:has(a[href*="/premium"]),
        html.rx-hidePremium li:has(> a[href*="/premium"]) { display: none !important; }

        /* ===== Pop-ups: login wall / "open in app" / age-gate (seletores de userscripts shreddit) ===== */
        html.rx-killPopups xpromo-nsfw-blocking-modal-desktop,
        html.rx-killPopups xpromo-nsfw-bypassable-modal-desktop,
        html.rx-killPopups .configured-xpromo-modal,
        html.rx-killPopups shreddit-async-loader[bundlename*="nsfw_blocking_modal"],
        html.rx-killPopups #nsfw-qr-dialog,
        html.rx-killPopups #blocking-modal-contents:has(.text-category-nsfw),
        html.rx-killPopups faceplate-modal:has(> div.text-category-nsfw),
        html.rx-killPopups div[style*="position: fixed"][style*="inset: 0px"][style*="backdrop-filter: blur(4px)"] { display: none !important; }
        /* o lock é inline no <body> (overflow:hidden;pointer-events:none) — !important vence inline */
        html.rx-killPopups body { overflow: auto !important; pointer-events: auto !important; }

        /* ===== NSFW / spoiler unblur (light DOM; shreddit-blurred-container vai por JS — applyUnblur) ===== */
        html.rx-nsfwUnblur .thumbnail-blur,
        html.rx-nsfwUnblur span.inner.blurred,
        html.rx-nsfwUnblur .blurred,
        html.rx-nsfwUnblur img[style*="blur("],
        html.rx-nsfwUnblur [style*="filter: blur"] { filter: none !important; -webkit-filter: none !important; }
        html.rx-nsfwUnblur .bg-scrim { display: none !important; }

        /* ===== Recomendações no feed ===== Post recomendado = shreddit-post[recommendation-source]
           (ex.: "Because you've shown interest in this community"); o assinado não tem o atributo.
           Escondemos o <article> que o envolve + blocos standalone de related-community.
           OBS: em r/all e r/popular ~tudo tem recommendation-source (é tudo recomendação). */
        html.rx-hideRecommended:not(.rx-rec-skip) article:has(> shreddit-post[recommendation-source]:not([recommendation-source=""])),
        html.rx-hideRecommended:not(.rx-rec-skip) faceplate-partial[src*="related-community-recommendations"],
        html.rx-hideRecommended:not(.rx-rec-skip) shreddit-recommendation-feed,
        html.rx-hideRecommended:not(.rx-rec-skip) community-recommendation-feed { display: none !important; }

        /* posts escondidos pelo filtro de palavra/subreddit (applyFilter) */
        article.rx-filtered { display: none !important; }

        /* ===== TikTok/story overlay ===== abre por um botão na micro dock (.rx-story). ===== */

        .rx-tok { position: fixed; inset: 0; z-index: 2147483647; background: #000; touch-action: none; }
        .rx-tok-track {
            height: 100%; width: 100%; overflow: hidden; overscroll-behavior: contain;
            scroll-behavior: smooth; -webkit-overflow-scrolling: touch; /* scroll dirigido por JS: 1 item por gesto */
        }
        .rx-tok-slide {
            height: 100%; width: 100%; box-sizing: border-box; /* mídia ocupa 100%; rail/legenda flutuam por cima */
            position: relative; display: flex; align-items: center; justify-content: center; overflow: hidden;
        }
        /* width/height 100% (não só max-) → mídia pequena CRESCE pra preencher, mantendo aspecto */
        .rx-tok-media { width: 100%; height: 100%; object-fit: contain; display: block; }
        iframe.rx-tok-media { max-width: 1000px; border: 0; background: #000; }
        iframe.rx-tok-yt { width: 100%; max-width: 1200px; height: auto; aspect-ratio: 16 / 9; max-height: 100%; } /* youtube: caixa 16:9 limpa */
        /* controles de vídeo próprios (substituem o overlay nativo do player) */
        .rx-tok-vlayer { position: absolute; inset: 0; z-index: 2; display: flex; align-items: center; justify-content: center; cursor: pointer; }
        .rx-tok-vflash { width: 76px; height: 76px; border-radius: 50%; background: rgba(0, 0, 0, .45); color: #fff; display: flex; align-items: center; justify-content: center; opacity: 0; transition: opacity .2s ease; pointer-events: none; }
        .rx-tok-slide.rx-paused .rx-tok-vflash { opacity: 1; }
        .rx-tok-slide.rx-tok-loading .rx-tok-vflash { display: none; } /* carregando redgifs → some o ▶, mostra spinner */
        .rx-tok-slide.rx-tok-loading::after { content: ""; position: absolute; inset: 0; margin: auto; width: 46px; height: 46px; z-index: 4; border: 4px solid rgba(255, 255, 255, .25); border-top-color: #ff4500; border-radius: 50%; animation: rx-tok-spin .8s linear infinite; }
        @keyframes rx-tok-spin { to { transform: rotate(360deg); } }
        /* redgifs falhou (token/blob): some o ▶ e mostra um aviso no lugar do poster morto */
        .rx-tok-slide.rx-tok-rgfail .rx-tok-vflash { display: none; }
        .rx-tok-slide.rx-tok-rgfail::after { content: "RedGifs unavailable"; position: absolute; inset: 0; margin: auto; width: max-content; height: max-content; z-index: 4; color: #d7dadc; font: 600 13px/1 -apple-system, sans-serif; opacity: .7; }
        /* vídeo (não-redgifs) sem fonte reproduzível — ex.: o @require do hls.js caiu e não há mp4 → evita quadro preto mudo */
        .rx-tok-slide.rx-tok-vidfail .rx-tok-vflash { display: none; }
        .rx-tok-slide.rx-tok-vidfail::after { content: "Video unavailable"; position: absolute; inset: 0; margin: auto; width: max-content; height: max-content; z-index: 4; color: #d7dadc; font: 600 13px/1 -apple-system, sans-serif; opacity: .7; }
        .rx-tok-vflash svg { width: 38px; height: 38px; margin-left: 3px; }
        /* barra de progresso: zona de clique alta (fácil no PC) com a barra visível fininha embaixo, que CRESCE no hover */
        .rx-tok-vprog { position: absolute; left: 0; right: 0; bottom: 0; height: 20px; z-index: 3; display: flex; align-items: flex-end; cursor: pointer; }
        .rx-tok-vbar { width: 100%; height: 4px; background: rgba(255, 255, 255, .28); transition: height .1s ease; }
        .rx-tok-vprog:hover .rx-tok-vbar { height: 11px; }
        .rx-tok-vfill { height: 100%; width: 0; background: #ff4500; pointer-events: none; }
        /* galeria: carrossel horizontal estilo Reddit — BOLINHAS no centro embaixo + SETAS nas bordas da imagem */
        .rx-tok-gwrap { position: relative; width: 100%; height: 100%; }
        /* overscroll-behavior-X só (não Y): senão o gesto vertical sobre a galeria não "encadeia" e trava o scroll da página */
        .rx-tok-gallery { display: flex; width: 100%; height: 100%; overflow-x: auto; overflow-y: hidden; overscroll-behavior-x: contain; scroll-snap-type: x mandatory; scroll-behavior: smooth; touch-action: none; scrollbar-width: none; will-change: scroll-position; }
        .rx-tok-gallery::-webkit-scrollbar { display: none; }
        .rx-tok-gslide { position: relative; display: flex; flex: 0 0 100%; align-items: center; justify-content: center; width: 100%; height: 100%; overflow: hidden; scroll-snap-align: center; scroll-snap-stop: always; contain: layout paint; background: #090909; }
        .rx-tok-gslide img { width: 100%; height: 100%; object-fit: contain; opacity: 1; transition: opacity .16s ease; }
        .rx-tok-gslide.rx-tok-img-loading img { opacity: .18; }
        .rx-tok-gslide.rx-tok-img-loading::after { content: ""; position: absolute; width: 34px; height: 34px; border: 3px solid rgba(255,255,255,.22); border-top-color: #ff4500; border-radius: 50%; animation: rx-tok-spin .8s linear infinite; pointer-events: none; }
        .rx-tok-gslide.rx-tok-img-error img { opacity: .12; }
        .rx-tok-gslide.rx-tok-img-error::after { content: "Image unavailable"; position: absolute; color: rgba(255,255,255,.72); font: 600 12px/1 -apple-system, sans-serif; pointer-events: none; }
        /* bolinhas centradas embaixo (pill); galeria grande (>8) vira contador "n/N" na mesma pill */
        .rx-tok-gdots { position: absolute; left: 50%; bottom: 10px; transform: translateX(-50%); z-index: 4; display: flex; align-items: center; gap: 6px; max-width: 80%; padding: 5px 9px; background: rgba(0, 0, 0, .45); border-radius: 999px; backdrop-filter: blur(6px); opacity: .55; transition: opacity .2s ease; }
        .rx-tok-gwrap:hover .rx-tok-gdots { opacity: 1; }
        .rx-tok-gdot { width: 6px; height: 6px; flex: 0 0 auto; border-radius: 50%; background: rgba(255, 255, 255, .45); transition: background .15s ease, transform .15s ease; }
        .rx-tok-gdot.rx-on { background: #fff; transform: scale(1.3); }
        .rx-tok-gcount { color: #fff; font: 600 11px/1 -apple-system, sans-serif; min-width: 30px; text-align: center; opacity: .95; }
        /* setas nas BORDAS da imagem (centro vertical), aparecem no hover — escondidas no touch (usa swipe) */
        .rx-tok-garrow { position: absolute; top: 50%; transform: translateY(-50%); z-index: 4; width: 34px; height: 34px; border: none; cursor: pointer; padding: 0; border-radius: 50%; background: rgba(0, 0, 0, .55); color: #fff; display: flex; align-items: center; justify-content: center; opacity: 0; transition: opacity .15s ease, background .12s ease, transform .12s ease; }
        .rx-tok-gwrap:hover .rx-tok-garrow { opacity: 1; }
        .rx-tok-garrow:hover { background: rgba(0, 0, 0, .8); transform: translateY(-50%) scale(1.08); }
        .rx-tok-garrow.rx-gprev { left: 8px; } .rx-tok-garrow.rx-gnext { right: 8px; }
        .rx-tok-garrow svg { width: 18px; height: 18px; }
        @media (pointer: coarse) { .rx-tok-garrow { display: none; } }
        /* galeria inline (site normal): permite rolar a página na vertical, captura só o horizontal */
        /* z-index acima do <a class="absolute inset-0"> do crosspost (senão o clique navega em vez de abrir o lightbox) */
        .rx-rg-galwrap { position: relative; width: 100%; border-radius: 8px; overflow: hidden; background: #000; z-index: 4; }
        .rx-rg-galwrap .rx-tok-gallery { touch-action: pan-y; }
        /* lightbox PRÓPRIO (maximizar imagem no clique) — imagem ocupa o máximo; controles flutuam por cima */
        .rx-lb { position: fixed; inset: 0; z-index: 2147483647; background: rgba(0, 0, 0, .94); display: flex; align-items: center; justify-content: center; touch-action: none; }
        .rx-lb::after { content: ""; position: absolute; width: 42px; height: 42px; border: 3px solid rgba(255,255,255,.2); border-top-color: #ff4500; border-radius: 50%; opacity: 0; pointer-events: none; }
        .rx-lb.rx-lb-loading::after { opacity: 1; animation: rx-tok-spin .8s linear infinite; }
        .rx-lb.rx-lb-error::after { content: "Image unavailable"; width: auto; height: auto; border: 0; color: rgba(255,255,255,.72); font: 600 13px/1 -apple-system, sans-serif; animation: none; }
        .rx-lb-img { position: relative; z-index: 0; max-width: 100vw; max-height: 100vh; width: 100%; height: 100%; object-fit: contain; user-select: none; opacity: 0; cursor: zoom-in; transform-origin: center center; will-change: transform, opacity; transition: opacity .16s ease, transform .18s ease; }
        .rx-lb.rx-lb-ready .rx-lb-img { opacity: 1; }
        .rx-lb.rx-lb-zoomed .rx-lb-img { cursor: zoom-out; }
        .rx-lb-nav { position: fixed; top: 50%; transform: translateY(-50%); z-index: 2; width: 46px; height: 46px; border: none; cursor: pointer; padding: 0; border-radius: 50%; background: rgba(0, 0, 0, .5); color: #fff; display: flex; align-items: center; justify-content: center; transition: background .12s ease, transform .12s ease; }
        .rx-lb-nav:hover { background: #ff4500; transform: translateY(-50%) scale(1.1); }
        .rx-lb-prev { left: 14px; } .rx-lb-next { right: 14px; }
        .rx-lb-nav svg { width: 26px; height: 26px; }
        /* contador EM CIMA, centralizado */
        .rx-lb-count { position: fixed; top: 14px; left: 50%; transform: translateX(-50%); z-index: 2; color: #fff; font: 600 13px/1 -apple-system, sans-serif; background: rgba(0, 0, 0, .55); padding: 7px 13px; border-radius: 999px; backdrop-filter: blur(6px); }
        /* abrir-direto + fechar JUNTOS no canto superior direito */
        .rx-lb-top { position: fixed; top: 12px; right: 14px; z-index: 2; display: flex; align-items: center; gap: 8px; }
        .rx-lb-btn { width: 42px; height: 42px; border: none; cursor: pointer; padding: 0; border-radius: 50%; background: rgba(0, 0, 0, .5); color: #fff; display: flex; align-items: center; justify-content: center; text-decoration: none; transition: background .12s ease, transform .12s ease; }
        .rx-lb-btn:hover { background: #ff4500; transform: scale(1.08); }
        .rx-lb-btn svg { width: 22px; height: 22px; }
        /* legenda (sub + título): canto superior esquerdo, menor */
        .rx-tok-cap {
            position: absolute; top: 12px; left: 14px; right: auto; bottom: auto; z-index: 5; max-width: min(58%, 460px); padding: 0;
            display: flex; flex-direction: column; align-items: flex-start; text-align: left; gap: 1px; pointer-events: none;
            font: 12px/1.3 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
        }
        .rx-tok-cap a { pointer-events: auto; text-shadow: 0 1px 4px rgba(0, 0, 0, .9); }
        .rx-tok-sub { color: #ff7a3c; font-weight: 700; font-size: 13px; text-decoration: none; }
        .rx-tok-sub:hover { text-decoration: underline; }
        .rx-tok-title { color: #fff; font-size: 12px; font-weight: 500; opacity: .95; text-decoration: none; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
        .rx-tok-title:hover { text-decoration: underline; }
        /* trilho de ações (estilo Instagram, sobre a mídia): chapado, menor e meio transparente; opaco total no hover */
        .rx-tok-rail { position: absolute; right: 6px; bottom: 14px; z-index: 3; display: flex; flex-direction: column; align-items: center; gap: 9px; opacity: .72; transition: opacity .15s ease; }
        .rx-tok-rail:hover { opacity: 1; }
        .rx-tok-act {
            width: 32px; height: 32px; border: none; border-radius: 50%; cursor: pointer; padding: 0;
            background: transparent; color: #fff; display: flex; align-items: center; justify-content: center;
            transition: color .12s ease, transform .12s ease; filter: drop-shadow(0 1px 3px rgba(0, 0, 0, .6));
        }
        .rx-tok-act:hover { color: #ff7a3c; transform: scale(1.12); }
        .rx-tok-act:active { transform: scale(.9); }
        .rx-tok-act.rx-on { color: #ff4500; }
        .rx-tok-act.rx-down.rx-on { color: #7193ff; }
        .rx-tok-act svg { width: 22px; height: 22px; }
        .rx-tok-act.rx-rg-q { font: 800 11px/1 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; letter-spacing: .5px; } /* botão de texto HD/SD do RedGifs */
        .rx-tok-votes { display: flex; flex-direction: column; align-items: center; gap: 1px; }
        .rx-tok-actwrap { display: flex; flex-direction: column; align-items: center; gap: 2px; }
        .rx-tok-cnt, .rx-tok-score { color: #fff; font: 700 11px/1 -apple-system, sans-serif; filter: drop-shadow(0 1px 3px rgba(0, 0, 0, .7)); }
        /* volume: flyout horizontal que abre à esquerda do botão no hover/foco */
        .rx-tok-volwrap, .rx-tok-qwrap { position: relative; display: flex; align-items: center; justify-content: center; }
        .rx-tok-volflyout { position: absolute; right: calc(100% + 4px); top: 50%; transform: translateY(-50%); display: flex; align-items: center; height: 32px; width: 0; padding: 0; overflow: hidden; opacity: 0; background: rgba(0, 0, 0, .65); border-radius: 999px; transition: width .18s ease, padding .18s ease, opacity .18s ease; }
        .rx-tok-volwrap:hover .rx-tok-volflyout, .rx-tok-volwrap:focus-within .rx-tok-volflyout { width: 96px; padding: 0 12px; opacity: 1; }
        .rx-tok-vol { -webkit-appearance: none; appearance: none; width: 84px; height: 5px; margin: 0; border-radius: 3px; background: transparent; cursor: pointer; }
        .rx-tok-vol:focus { outline: none; }
        .rx-tok-vol::-webkit-slider-runnable-track { height: 5px; border-radius: 3px; background: linear-gradient(to right, #ff4500 0%, #ff4500 var(--val, 0%), rgba(255, 255, 255, .3) var(--val, 0%), rgba(255, 255, 255, .3) 100%); }
        .rx-tok-vol::-webkit-slider-thumb { -webkit-appearance: none; margin-top: -4px; width: 13px; height: 13px; border-radius: 50%; background: #fff; box-shadow: 0 2px 4px rgba(0, 0, 0, .3); }
        .rx-tok-vol::-moz-range-track { height: 5px; border-radius: 3px; background: rgba(255, 255, 255, .3); }
        .rx-tok-vol::-moz-range-progress { height: 5px; border-radius: 3px; background: #ff4500; }
        .rx-tok-vol::-moz-range-thumb { width: 13px; height: 13px; border: none; border-radius: 50%; background: #fff; box-shadow: 0 2px 4px rgba(0, 0, 0, .3); }
        /* menu de qualidade: abre à esquerda do botão, CRESCENDO PRA CIMA (o botão fica perto do fim da tela) */
        .rx-tok-qmenu { position: absolute; right: calc(100% + 4px); bottom: -2px; top: auto; transform: none; background: rgba(0, 0, 0, .88); border-radius: 8px; padding: 4px; display: none; flex-direction: column; gap: 2px; min-width: 64px; max-height: 75vh; overflow-y: auto; }
        .rx-tok-qwrap.rx-open .rx-tok-qmenu { display: flex; }
        .rx-tok-qmenu button { all: unset; cursor: pointer; color: #fff; font: 600 12px/1 -apple-system, sans-serif; padding: 6px 10px; border-radius: 5px; text-align: center; white-space: nowrap; }
        .rx-tok-qmenu button:hover { background: rgba(255, 255, 255, .15); }
        .rx-tok-qmenu button.rx-on { color: #ff4500; }
        /* setas de navegação (chapadas), centro-direita; meio transparentes, opacas no hover */
        .rx-tok-nav { position: fixed; right: 12px; top: 50%; transform: translateY(-50%); z-index: 4; display: flex; flex-direction: column; gap: 10px; opacity: .6; transition: opacity .15s ease; }
        .rx-tok-nav:hover { opacity: 1; }
        .rx-tok-navbtn {
            width: 42px; height: 42px; border: none; border-radius: 50%; cursor: pointer; padding: 0;
            background: transparent; color: #fff; display: flex; align-items: center; justify-content: center;
            transition: color .15s ease, transform .12s ease; filter: drop-shadow(0 1px 4px rgba(0, 0, 0, .55));
        }
        .rx-tok-navbtn:hover { color: #ff7a3c; transform: scale(1.12); }
        .rx-tok-navbtn svg { width: 30px; height: 30px; }
        @media (max-width: 768px), (pointer: coarse) { .rx-tok-nav { display: none; } } /* mobile/touch: esconde as setas (usa swipe) */
        .rx-tok-close {
            position: fixed; top: 12px; right: 14px; z-index: 6; width: 44px; height: 44px; border: none; cursor: pointer; padding: 0;
            border-radius: 50%; background: transparent; color: #fff; filter: drop-shadow(0 1px 4px rgba(0, 0, 0, .6));
            display: flex; align-items: center; justify-content: center; transition: color .15s ease, transform .12s ease;
        }
        .rx-tok-close:hover { color: #ff7a3c; transform: scale(1.12); }
        .rx-tok-close svg { width: 26px; height: 26px; }
        .rx-tok-sentinel { height: 1px; width: 100%; }
        .rx-tok-empty { color: #d7dadc; font: 14px -apple-system, sans-serif; text-align: center; margin: auto; padding: 24px; }

        /* ===== Player de RedGifs inline (substitui o iframe em TODO o site) — reaproveita os controles do overlay ===== */
        .rx-rg { position: relative; width: 100%; background: #000; overflow: hidden; border-radius: 8px; }
        .rx-rg-v { width: 100%; height: 100%; object-fit: contain; display: block; background: #000; cursor: pointer; }
        .rx-rg.rx-rg-paused .rx-tok-vflash { opacity: 1; }
        .rx-rg.rx-rg-loading .rx-tok-vflash { display: none; }
        .rx-rg.rx-rg-loading::after { content: ""; position: absolute; inset: 0; margin: auto; width: 40px; height: 40px; z-index: 2; border: 4px solid rgba(255, 255, 255, .25); border-top-color: #ff4500; border-radius: 50%; animation: rx-tok-spin .8s linear infinite; }
        /* mini-rail vertical à direita (flat, igual o overlay) */
        .rx-rg-ctl { position: absolute; right: 8px; bottom: 26px; z-index: 3; display: flex; flex-direction: column; align-items: center; gap: 8px; opacity: .72; transition: opacity .15s ease; }
        .rx-rg:hover .rx-rg-ctl { opacity: 1; }

        /* ===== Layout: largura do conteúdo =====
           O wrapper externo é .subgrid-container (m:w-[1120px], mx-auto) — alargamos pra --rx-cw.
           Mas o grid REAL é o .main-container interno: no card view ele é
           grid-cols-[minmax(0,756px) minmax(0,316px)] + place-content-between. Ao alargar o
           wrapper, a coluna do conteúdo fica travada em 756px e a sobra vira um gap antes do
           right-rail. Trocamos a coluna do conteúdo por 1fr pra ela crescer e ocupar o espaço. */
        html.rx-wide .subgrid-container { width: var(--rx-cw, 92%) !important; max-width: var(--rx-cw, 92%) !important; }
        html.rx-wide .main-container { grid-template-columns: minmax(0, 1fr) minmax(0, 316px) !important; }
        html.rx-wide .main-container:not(:has(#right-sidebar-container)) { grid-template-columns: minmax(0, 1fr) !important; }

        /* ===== Layout: esconder sidebars ===== */
        /* O item da coluna 1 do grid é #left-sidebar-container (flex-left-nav-container,
           position:fixed / z-index:100). #left-sidebar é só o <nav> interno — escondê-lo
           deixava o painel fixo de 272px no lugar e o conteúdo escorregava por baixo (página
           "sumia"). Escondemos o container e zeramos --flex-nav-width: o grid nativo é
           "grid-template-columns: var(--flex-nav-width) 1fr", então a coluna 1 colapsa. */
        html.rx-hideLeftSidebar #left-sidebar-container { display: none !important; }
        html.rx-hideLeftSidebar .grid-container { --flex-nav-width: 0px !important; }
        html.rx-hideRightSidebar #right-sidebar-container { display: none !important; }
        html.rx-hideRightSidebar .main-container { grid-template-columns: minmax(0, 1fr) !important; }

        /* ===== Layout: right sidebar FIXA no canto (como a left) =====
           O right-sidebar-container (316px) hoje é sticky dentro da coluna do grid centrado. Aqui fixamos
           ele na borda direita da viewport com left-border; o conteúdo vira coluna única e o wrapper
           reserva 316px à direita via MARGIN (não padding) pra manter o px-lg nativo simétrico no post.
           SÓ no desktop: no mobile o rail é hidden, então as reservas de 316px espremiam o conteúdo. O
           media query é o INVERSO exato do mobile chrome (max-width:768px OR pointer:coarse) → nunca coexistem. */
        @media (min-width: 769px) and (pointer: fine) {
            html.rx-fixedRightSidebar:not(.rx-hideRightSidebar):not(.rx-nopin) #right-sidebar-container {
                position: fixed !important; right: 0; top: calc(var(--shreddit-header-height, 56px) + 1px); /* +1px: não cobre a borda inferior do header */
                width: 316px; height: calc(100vh - var(--shreddit-header-height, 56px) - 1px); max-height: none !important;
                box-sizing: border-box; z-index: 3; overflow-y: auto; overscroll-behavior: contain; /* z<4 (header): fica abaixo do dropdown de usuário, acima do feed */
                background: var(--color-neutral-background, #0b1416);
                border-left: 1px solid var(--color-neutral-border, rgba(255, 255, 255, .16));
                padding: 0 16px calc(12px + env(safe-area-inset-bottom)) 16px; /* px-md (16px) horizontal simétrico = mesmo respiro da left sidebar (NAV_A_CLS usa px-md); antes era 12px só à esquerda + 0 à direita → conteúdo colava na borda direita */
            }
            /* As regras de RESHAPE do conteúdo (reservar 316px + coluna única) SÓ valem quando há mesmo um
               right-sidebar na página (:has) — senão páginas sem rail (ex.: /notifications) reservavam o
               espaço/encolhiam o conteúdo à toa e ficavam em branco. */
            html.rx-fixedRightSidebar:not(.rx-hideRightSidebar):not(.rx-nopin) .subgrid-container:has(#right-sidebar-container) { width: auto !important; max-width: none !important; margin-left: 0 !important; margin-right: 316px !important; }
            /* post = --rx-cw (slider de largura) do espaço disponível, CENTRALIZADO → tamanho ajustável + padding simétrico */
            html.rx-fixedRightSidebar:not(.rx-hideRightSidebar):not(.rx-nopin) .main-container:has(#right-sidebar-container) { grid-template-columns: minmax(0, 1fr) !important; width: var(--rx-cw, 92%) !important; max-width: var(--rx-cw, 92%) !important; margin-inline: auto !important; }
            /* sem o header acima, o py-md (16px) do topo do conteúdo da sidebar fica grande demais → reduz */
            html.rx-fixedRightSidebar:not(.rx-hideRightSidebar):not(.rx-nopin) #right-sidebar-contents > aside { padding-top: 2px !important; }
        }

        /* ===== Layout: topbar antiga ===== */
        html.rx-oldTopbar faceplate-tracker[noun="chat"],
        html.rx-oldTopbar faceplate-tracker[noun="create_post"] { display: none !important; }

        /* A busca mantém o tamanho e a âncora nativos. Aumentamos somente o header para que
           o controle tenha folga vertical sem deslocar o dropdown. */
        @media (min-width: 769px) and (pointer: fine) {
            html:has(reddit-header-action-items) {
                --shreddit-header-height: 64px !important;
            }
            reddit-header-action-items > header.v2 {
                box-sizing: border-box !important;
                height: 64px !important;
                min-height: 64px !important;
            }
            reddit-header-action-items > header.v2 > nav.h-header-large {
                height: 100% !important;
                min-height: 0 !important;
            }
            main#main-content {
                padding-top: 8px !important;
            }
        }

        /* ===== Esconder seções da sidebar ===== */
        html.rx-hideCustomFeeds faceplate-expandable-section-helper:has(faceplate-tracker[noun="multireddits_menu"]) { display: none !important; }
        /* "Games on Reddit": o tracker noun=games_drawer ENVOLVE a section (≠ outras, onde o helper é o pai) → escondemos o tracker direto. */
        html.rx-hideGames faceplate-tracker[noun="games_drawer"] { display: none !important; }
        html.rx-hideRecent #recent-communities-section { display: none !important; }
        html.rx-hideCommunities faceplate-expandable-section-helper:has(faceplate-tracker[noun="communities_menu"]) { display: none !important; }
        html.rx-hideResources faceplate-expandable-section-helper:has(faceplate-tracker[noun="resources_menu"]) { display: none !important; }
        /* Moderation: a seção é um <details> com noun="moderation_menu" no summary → esconde o details inteiro (header + itens + controller). */
        html.rx-hideModeration details:has(faceplate-tracker[noun="moderation_menu"]),
        html.rx-hideModeration faceplate-expandable-section-helper:has(faceplate-tracker[noun="moderation_menu"]) { display: none !important; }
        /* Rodapé = links de políticas (cauda da seção Resources) + linha "Reddit, Inc. ©".
           NÃO usar "#left-sidebar > nav:has([noun=content_policy_menu])": o <nav aria-label="Primary">
           inteiro contém esse tracker, então o seletor escondia a sidebar toda. */
        html.rx-hideSidebarFooter faceplate-tracker[noun="content_policy_menu"],
        html.rx-hideSidebarFooter faceplate-tracker[noun="privacy_policy_menu"],
        html.rx-hideSidebarFooter faceplate-tracker[noun="user_agreement_menu"],
        html.rx-hideSidebarFooter faceplate-tracker[noun="accessibility_menu"] { display: none !important; }
        html.rx-hideSidebarFooter #left-sidebar nav[aria-label="Primary"] > div:has(> a[href*="redditinc.com"]) { display: none !important; }

        /* ===== Divisores das seções ===== Em vez dos <hr> nativos (que ficam órfãos quando a
           seção é escondida via display:none), escondemos todos e desenhamos o divisor como
           border-top de cada seção. Seção escondida não rende borda → sem órfão. A "Você"
           (clone) também é uma section, então ganha o divisor de cima de graça. */
        #left-sidebar nav[aria-label="Primary"] hr.border-neutral-border-weak { display: none !important; }
        #left-sidebar nav[aria-label="Primary"] faceplate-expandable-section-helper > details {
            border-top: 1px solid var(--color-neutral-border-weak, rgba(255, 255, 255, .1)) !important;
            margin-top: 8px !important;
            padding-top: 8px !important;
        }

        /* ===== Seção "Você" ===== É um CLONE da seção Custom Feeds nativa (chrome 100%
           idêntico: cabeçalho, caret, recolher, espaçamento). Só trocamos rótulo + itens em
           injectUserSection(), então não precisa de CSS próprio. */

        /* ===== Abas de ordenação ===== */
        .rx-sort-tabs {
            display: inline-flex; gap: 8px; align-items: center; flex-wrap: nowrap;
            max-width: 100%; overflow-x: auto; scrollbar-width: none;
        }
        .rx-sort-tabs::-webkit-scrollbar { display: none; }
        .rx-sort-tab {
            display: inline-flex; align-items: center; gap: 5px;
            flex: none; min-height: 42px; box-sizing: border-box;
            padding: 9px 17px; border-radius: 999px;
            font-size: 16px; font-weight: 700; line-height: 1.25;
            color: var(--color-secondary-weak, #818384); text-decoration: none;
        }
        .rx-sort-tab svg { width: 20px; height: 20px; flex: none; }
        .rx-sort-tab:hover { background: var(--color-neutral-background-hover, rgba(127, 127, 127, .12)); text-decoration: none; }
        .rx-sort-tab.rx-active { background: #ff4500; color: #fff; }
        .rx-sorted-hidden { display: none !important; }

        /* ===== Topbar: filtro à esquerda, View à direita (mesma linha, full width) ===== */
        /* O <button> mora no shadow root do dropdown — cor/tamanho são injetados lá (styleViewShadow).
           Aqui só relaxamos o tamanho fixo do HOST (light DOM: nd:h-[32px] nd:w-[54px]). */
        shreddit-sort-dropdown[sort-event="layout-view-change"] {
            max-height: none !important; height: auto !important; width: auto !important; max-width: none !important;
        }
        /* HOME: parent comum (.flex.h-[32px]) de sort+view vira space-between, py maior */
        .rx-topbar-home {
            display: flex !important; align-items: center !important; justify-content: space-between !important;
            width: 100% !important; height: auto !important; padding-block: 8px !important;
        }
        /* PROFILE: o view é movido (JS) pro pai das abas (.mx-2xs.my-md), que vira space-between */
        .rx-topbar-profile {
            display: flex !important; align-items: center !important; justify-content: space-between !important;
            width: 100% !important; gap: 12px;
        }
        .rx-topbar-profile > faceplate-tabgroup { flex: 0 1 auto; min-width: 0; }
        .rx-viewrow-empty { display: none !important; }
        /* tab ativa do profile (Overview/Posts/Saved/...) laranja — sobrepõe bg-secondary-background-selected + !text */
        a[id^="profile-tab-"].tab-selected { background-color: #ff4500 !important; color: #fff !important; }

        /* select do painel (feed/ordenação padrão) */
        .rx-select {
            font: inherit; font-size: 13px; color: var(--color-neutral-content, #d7dadc); cursor: pointer;
            background: var(--color-secondary-background, rgba(255, 255, 255, .06)); border: 1px solid var(--color-neutral-border, rgba(255, 255, 255, .14));
            border-radius: 6px; padding: 3px 6px;
        }
        /* textarea do painel (blocklist do filtro) */
        .rx-textarea {
            width: 100%; box-sizing: border-box; resize: vertical; min-height: 64px;
            font: 12px/1.4 ui-monospace, SFMono-Regular, Menlo, monospace; color: var(--color-neutral-content, #d7dadc);
            background: var(--color-secondary-background, rgba(255, 255, 255, .06)); border: 1px solid var(--color-neutral-border, rgba(255, 255, 255, .14));
            border-radius: 6px; padding: 6px 8px; margin-top: 4px;
        }
        .rx-textarea:focus { outline: none; border-color: #ff6a33; }

        /* toast "Link copiado" */
        .rx-toast {
            position: fixed; left: 50%; bottom: 24px; transform: translateX(-50%) translateY(8px);
            background: var(--color-neutral-background-container, #0b1416); color: var(--color-neutral-content, #d7dadc); border: 1px solid var(--color-neutral-border-weak, rgba(255, 255, 255, .12));
            border-radius: 8px; padding: 8px 14px;
            font: 13px/1.4 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
            box-shadow: 0 8px 30px rgba(0, 0, 0, .5); z-index: 2147483647;
            opacity: 0; pointer-events: none; transition: opacity .2s ease, transform .2s ease;
        }
        .rx-toast-show { opacity: 1; transform: translateX(-50%) translateY(0); }

        /* ===== Micro dock (canto inferior direito) + painel ===== */
        /* Bandeja única ancorada à direita; abriga scroll-to-top, story (modo TikTok), seleção e config.
           Visível (opacity .72) e acende total ao hover. Botões são flat (sem bg próprio). */
        .rx-dock {
            position: fixed; right: 16px; bottom: 16px;
            display: flex; align-items: center; gap: 2px;
            padding: 4px; border-radius: 999px;
            background: var(--color-neutral-background-container, rgba(10, 18, 20, .9)); border: 1px solid var(--color-neutral-border, rgba(255, 255, 255, .14));
            box-shadow: 0 6px 20px rgba(0, 0, 0, .45);
            opacity: .72; z-index: 2147483646; transition: opacity .2s ease;
            /* sem backdrop-filter: blur em elemento fixed re-blura o fundo a cada frame no scroll (jank) */
        }
        .rx-dock:hover, html.rx-selmode .rx-dock { opacity: 1; }
        .rx-dock-btn {
            width: 34px; height: 34px; border-radius: 50%; border: none; flex: none; padding: 0;
            display: flex; align-items: center; justify-content: center;
            background: transparent; color: var(--color-neutral-content, #e8eaed); cursor: pointer;
            transition: background .15s ease, color .15s ease, transform .2s ease;
        }
        .rx-dock-btn:hover { background: #ff4500; color: #fff; }
        .rx-dock-btn.rx-on { background: #ff4500; color: #fff; } /* select mode ativo */
        .rx-dock-btn svg { width: 20px; height: 20px; }
        /* ordem na dock: scroll-to-top | story | seleção | config (config ancorado à direita) */
        .rx-scrolltop { order: 0; display: none; }
        .rx-scrolltop.rx-show { display: flex; }
        .rx-story { order: 1; }
        .rx-lfab-main { order: 2; }
        .rx-fab { order: 3; }
        .rx-fab:hover { transform: rotate(30deg); }

        .rx-panel {
            position: fixed; right: 16px; bottom: 60px;
            width: 372px; max-height: 88vh;
            display: flex; flex-direction: column; overflow: hidden;
            background: var(--color-neutral-background, #0e1a1d); color: var(--color-neutral-content, #e6ebed);
            border: 1px solid var(--color-neutral-border, rgba(255, 255, 255, .14)); border-radius: 18px;
            box-shadow: 0 16px 50px rgba(0, 0, 0, .65);
            font: 13px/1.45 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
            z-index: 2147483647;
        }
        .rx-panel:not([hidden]) { animation: rx-pop .16s cubic-bezier(.2, .7, .3, 1); }
        @keyframes rx-pop { from { opacity: 0; transform: translateY(10px) scale(.97); } to { opacity: 1; transform: none; } }
        .rx-panel[hidden] { display: none; }
        .rx-panel-hd {
            display: flex; align-items: center; gap: 10px; padding: 14px 14px 12px;
            border-bottom: 1px solid var(--color-neutral-border-weak, rgba(255, 255, 255, .1));
        }
        .rx-logo { width: 28px; height: 28px; border-radius: 9px; background: #ff4500; display: flex; align-items: center; justify-content: center; flex: none; }
        .rx-logo svg { width: 17px; height: 17px; color: #fff; }
        .rx-panel-hd b { flex: 1; font-weight: 800; font-size: 16px; color: var(--color-neutral-content-strong, #fff); }
        .rx-x { all: unset; cursor: pointer; color: var(--color-neutral-content-weak, #b8c0c3); width: 28px; height: 28px; display: flex; align-items: center; justify-content: center; font-size: 16px; border-radius: 50%; transition: .15s; }
        .rx-x:hover { color: #fff; background: var(--color-neutral-background-hover, rgba(255, 255, 255, .1)); }

        .rx-psearch { padding: 10px 14px; border-bottom: 1px solid var(--color-neutral-border-weak, rgba(255, 255, 255, .1)); }
        .rx-psearch > div { display: flex; align-items: center; gap: 8px; background: var(--color-neutral-background-container, rgba(255, 255, 255, .05)); border: 1px solid var(--color-neutral-border, rgba(255, 255, 255, .14)); border-radius: 999px; padding: 7px 12px; transition: border-color .15s; }
        .rx-psearch > div:focus-within { border-color: #ff4500; }
        .rx-psearch svg { width: 16px; height: 16px; color: var(--color-neutral-content-weak, #9aa4a8); flex: none; }
        .rx-psearch input { all: unset; flex: 1; color: var(--color-neutral-content, #e6ebed); font: inherit; }
        .rx-psearch input::placeholder { color: var(--color-neutral-content-weak, #9aa4a8); }

        .rx-body { display: flex; min-height: 0; flex: 1; }
        .rx-rail { display: flex; flex-direction: column; gap: 4px; padding: 10px 8px; border-right: 1px solid var(--color-neutral-border-weak, rgba(255, 255, 255, .1)); flex: none; }
        .rx-tab { all: unset; box-sizing: border-box; width: 40px; height: 40px; border-radius: 11px; display: flex; align-items: center; justify-content: center; color: var(--color-neutral-content-weak, #9aa4a8); cursor: pointer; transition: background .15s, color .15s; }
        .rx-tab svg { width: 21px; height: 21px; }
        .rx-tab:hover { background: var(--color-neutral-background-hover, rgba(255, 255, 255, .06)); color: var(--color-neutral-content-strong, #f0f3f4); }
        .rx-tab.active { background: rgba(255, 69, 0, .16); color: #ff6a33; }
        .rx-content { flex: 1; min-width: 0; overflow-y: auto; padding: 4px 0 10px; scrollbar-width: thin; scrollbar-color: rgba(255, 255, 255, .2) transparent; }
        .rx-content::-webkit-scrollbar { width: 8px; }
        .rx-content::-webkit-scrollbar-thumb { background: rgba(255, 255, 255, .18); border-radius: 99px; border: 2px solid var(--color-neutral-background, #0e1a1d); }

        .rx-sec { display: none; }
        .rx-sec-title { padding: 11px 16px 6px; font-size: 11px; font-weight: 700; letter-spacing: .08em; text-transform: uppercase; color: #ff6a33; }
        .rx-content .rx-row { border-radius: 9px; margin: 1px 6px; }
        .rx-empty { display: none; color: var(--color-neutral-content-weak, #9aa4a8); text-align: center; padding: 30px 16px; }

        .rx-foot { display: flex; align-items: center; justify-content: space-between; padding: 10px 16px; border-top: 1px solid var(--color-neutral-border-weak, rgba(255, 255, 255, .1)); }
        .rx-ver { color: var(--color-neutral-content-weak, #6b7679); font-size: 12px; }
        .rx-reset { all: unset; cursor: pointer; font-size: 13px; font-weight: 600; color: var(--color-neutral-content-weak, #b8c0c3); padding: 4px 8px; border-radius: 7px; transition: .15s; }
        .rx-reset:hover { color: #ff4500; background: rgba(255, 69, 0, .12); }
        /* group header — usado pelo sheet de settings do mobile (settingsRows) */
        .rx-group-hd {
            margin-top: 8px; padding: 7px 16px;
            font-size: 11px; font-weight: 700; letter-spacing: .08em; text-transform: uppercase;
            color: #ff6a33; background: var(--color-neutral-background-container, rgba(255, 255, 255, .035));
            border-top: 1px solid var(--color-neutral-border-weak, rgba(255, 255, 255, .08));
        }
        .rx-row { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 9px 16px; cursor: pointer; }
        .rx-row:hover { background: var(--color-neutral-background-hover, rgba(255, 255, 255, .05)); }
        .rx-row.rx-col { flex-direction: column; align-items: stretch; cursor: default; }
        .rx-row[data-dim="1"] { opacity: .38; pointer-events: none; }
        .rx-label { display: flex; flex-direction: column; gap: 2px; min-width: 0; font-size: 13px; font-weight: 500; color: var(--color-neutral-content-strong, #f0f3f4); }
        .rx-label small { color: var(--color-neutral-content-weak, #9aa4a8); font-size: 11px; font-weight: 400; line-height: 1.35; }
        .rx-toprow { display: flex; align-items: center; justify-content: space-between; gap: 10px; }

        .rx-sw { position: relative; width: 34px; height: 20px; flex: none; }
        .rx-sw input { position: absolute; inset: 0; opacity: 0; margin: 0; cursor: pointer; }
        .rx-sw i { position: absolute; inset: 0; border-radius: 999px; background: var(--color-neutral-border-medium, rgba(127, 127, 127, .45)); transition: background .15s ease; pointer-events: none; }
        .rx-sw i::after { content: ""; position: absolute; top: 2px; left: 2px; width: 16px; height: 16px; border-radius: 50%; background: #fff; transition: transform .15s ease; box-shadow: 0 1px 2px rgba(0, 0, 0, .35); }
        .rx-sw input:checked + i { background: #ff4500; }
        .rx-sw input:checked + i::after { transform: translateX(14px); }

        .rx-slider { width: 100%; accent-color: #ff4500; margin: 4px 0 2px; }
        .rx-val { color: #ff6a33; font-weight: 700; }

        /* ===== Widget de itens da navbar (toggle + reordenar) ===== */
        .rx-navlist { display: flex; flex-direction: column; gap: 2px; margin-top: 6px; }
        .rx-navrow { display: flex; align-items: center; gap: 8px; padding: 5px 4px; border-radius: 8px; }
        .rx-navrow:hover { background: var(--color-neutral-background-hover, rgba(255, 255, 255, .05)); }
        .rx-navrow-ic { display: flex; align-items: center; justify-content: center; width: 22px; height: 22px; color: var(--color-neutral-content-weak, #c2c7c9); flex: none; }
        .rx-navrow-ic svg { width: 18px; height: 18px; }
        .rx-navrow-label { flex: 1; min-width: 0; font-size: 13px; color: var(--color-neutral-content, #e6ebed); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .rx-navmove { width: 26px; height: 26px; flex: none; border: 1px solid var(--color-neutral-border, rgba(255, 255, 255, .16)); background: var(--color-secondary-background, rgba(255, 255, 255, .05)); color: var(--color-neutral-content, #d7dadc); border-radius: 6px; cursor: pointer; font-size: 13px; line-height: 1; padding: 0; }
        .rx-navmove:hover:not(:disabled) { background: #ff4500; border-color: #ff4500; color: #fff; }
        .rx-navmove:disabled { opacity: .3; cursor: default; }

        /* ===== Saved / listings: seleção + ações em lote (visão padrão) ===== */
        /* O botão de seleção vive na dock; em select mode as ações viram uma dock central própria. */
        .rx-lfab-actions {
            position: fixed; left: 50%; bottom: 24px; transform: translateX(-50%); z-index: 2147483646;
            display: flex; flex-direction: row; gap: 4px; align-items: center; max-width: calc(100vw - 24px);
            overflow-x: auto; padding: 5px; border-radius: 999px;
            background: var(--color-neutral-background-container, rgba(20, 34, 39, .96));
            border: 1px solid var(--color-neutral-border, rgba(255, 255, 255, .16));
            box-shadow: 0 10px 30px rgba(0, 0, 0, .5);
        }
        .rx-lfab-actions[hidden] { display: none; }
        .rx-lfab-count { flex: none; font: 700 12px/1 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; color: var(--color-neutral-content-weak, #818384); padding: 0 7px; white-space: nowrap; }
        .rx-lfab-act {
            display: inline-flex; align-items: center; gap: 7px; flex: none; cursor: pointer;
            border: none; border-radius: 999px; padding: 10px 13px;
            font: 700 13px/1 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
            color: var(--color-neutral-content, #d7dadc); background: transparent;
        }
        .rx-lfab-act:hover { background: var(--color-neutral-background-container-hover, #1f3138); }
        .rx-lfab-act svg { width: 16px; height: 16px; }

        /* multiselect — overlay clicável por card */
        article.rx-selectable { position: relative; }
        .rx-select-overlay { position: absolute; inset: 0; z-index: 2147483646; cursor: pointer; } /* acima de carrosséis/players */
        .rx-select-overlay .rx-check {
            position: absolute; top: 10px; left: 10px; width: 24px; height: 24px;
            border-radius: 6px; border: 2px solid #fff; background: rgba(0, 0, 0, .55);
            display: flex; align-items: center; justify-content: center; color: transparent;
        }
        .rx-select-overlay .rx-check svg { width: 16px; height: 16px; }
        article.rx-selected .rx-check { background: #ff4500; border-color: #ff4500; color: #fff; }
        html.rx-selmode .rx-dock { display: none !important; }

        @media (max-width: 768px), (pointer: coarse) {
            .rx-sort-tabs { gap: 5px; }
            .rx-sort-tab { min-height: 40px; padding: 8px 14px; font-size: 15px; }
            .rx-sort-tab svg { width: 18px; height: 18px; }
            .rx-lfab-actions { bottom: 62px; }
            .rx-lfab-act { width: 36px; height: 36px; padding: 0; justify-content: center; }
            .rx-lfab-act span { display: none; }
        }

        /* ===== Tema preto (estilo old-Reddit) =====
           Sobrescreve os tokens do dark padrão (que têm tom teal/azulado) por cinza-neutro quase-preto.
           !important num custom property vence as defs normais do Reddit; applyTheme() força theme-dark
           pra o resto da paleta (texto/tone) também ficar dark mesmo se o usuário estiver no light.
           IMPORTANTE: o Reddit REDECLARA os tokens em cada componente .theme-beta/.theme-rpl (header,
           sidebar, wrapper do feed) — uma decl. na própria comp. vence a herança !important do <html>.
           Por isso miramos esses elementos também (mesmo nível da decl. do Reddit → nosso !important ganha). */
        html.rx-blackactive,
        html.rx-blackactive .theme-beta,
        html.rx-blackactive .theme-rpl {
            --color-neutral-background: #000000 !important;
            --color-neutral-background-hover: #161617 !important;
            --color-neutral-background-weak: #000000 !important;
            --color-neutral-background-weak-hover: #161617 !important;
            --color-neutral-background-container: #161617 !important;
            --color-neutral-background-container-hover: #232325 !important;
            --color-neutral-background-container-strong: #232325 !important;
            --color-neutral-background-container-strong-hover: #2d2d30 !important;
            --color-neutral-background-strong: #161617 !important;
            --color-neutral-background-strong-hover: #232325 !important;
            --color-neutral-background-canvas: #232325 !important;
            --color-neutral-background-medium: #0a0a0a !important;
            --color-neutral-background-pinned: #0a0a0a !important;
            --color-neutral-background-selected: #2d2d30 !important;
            --color-neutral-background-highlighted: #161617 !important;
            --color-neutral-background-highlighted-strong: #232325 !important;
            --color-neutral-background-gilded: #1a1712 !important;
            --color-neutral-background-gilded-hover: #26211a !important;
            /* search bar / inputs / botões secundários */
            --color-secondary-background: #161617 !important;
            --color-secondary-background-hover: #232325 !important;
            --color-secondary-background-selected: #2d2d30 !important;
            /* texto: tira o tom azulado → cinza neutro */
            --color-neutral-content: #d7dadc !important;
            --color-neutral-content-strong: #f2f3f5 !important;
            --color-neutral-content-weak: #a8abad !important;
            --color-secondary: #d7dadc !important;
            --color-secondary-weak: #818384 !important;
            --color-secondary-plain-weak: #818384 !important;
            /* bordas neutras */
            --color-neutral-border: rgba(255, 255, 255, .16) !important;
            --color-neutral-border-weak: rgba(255, 255, 255, .09) !important;
        }

        /* ===== Mobile: top bar enxuta =====
           O header nativo no mobile é imprevisível (search vira protagonista, logo some). Em vez de
           tentar podar a estrutura dele, escondemos o header inteiro e injetamos uma barra SÓ com o
           logo (não-fixa, rola junto). injectMobileTop() monta a .rx-mtop. */
        .rx-mtop { display: none; align-items: center; gap: 6px; padding: 10px 12px; background: var(--color-neutral-background, #0b1416); border-bottom: 1px solid var(--color-neutral-border-weak, rgba(255, 255, 255, .12)); box-shadow: 0 2px 12px rgba(0, 0, 0, .35); }
        .rx-mtop-logo { display: inline-flex; align-items: center; text-decoration: none; }
        .rx-mtop-logo svg { height: 21px; width: auto; }
        .rx-mtop-back { display: none; width: 36px; height: 36px; flex: none; border: none; background: transparent; cursor: pointer; border-radius: 50%; color: var(--color-neutral-content, #d7dadc); align-items: center; justify-content: center; }
        .rx-mtop-back svg { width: 24px; height: 24px; }
        .rx-mtop-title { display: none; flex: 1; min-width: 0; font: 600 17px/1.2 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; color: var(--color-neutral-content-strong, #fff); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        /* fora da home: barra FIXA com ← + título da página (logo some, título aparece) */
        .rx-mtop.rx-mtop-fixed { position: fixed; top: 0; left: 0; right: 0; z-index: 2147483600; border-bottom: 1px solid var(--color-neutral-border-weak, rgba(255, 255, 255, .1)); }
        .rx-mtop.rx-mtop-fixed .rx-mtop-back { display: flex; }
        .rx-mtop.rx-mtop-fixed .rx-mtop-title { display: block; }
        .rx-mtop.rx-mtop-fixed .rx-mtop-logo { display: none; }
        @media (max-width: 768px), (pointer: coarse) {
            html.rx-mobileBareTop reddit-header-large,
            html.rx-mobileBareTop reddit-header-small { display: none !important; }
            /* zera o offset que compensava o header fixo (pt no shreddit-app + margin no main) */
            html.rx-mobileBareTop shreddit-app { padding-top: 0 !important; }
            html.rx-mobileBareTop main#main-content { margin-top: 0 !important; }
            html.rx-mobileBareTop .rx-mtop { display: flex; }
            /* com a topbar FIXA (fora da home), o conteúdo precisa de padding pra não ficar atrás dela */
            html.rx-mobileBareTop.rx-mtopfixed shreddit-app { padding-top: 56px !important; }
        }

        /* ===== Defesa contra reset/normalize externo =====
           Alguma folha (outro userscript/extensão) aplica margin-bottom 1rem GLOBALMENTE em
           nav/img/input/textarea/video/iframe/section/p/ul/...  Isso empurrava nossos elementos — em
           especial a navbar (nav) ganhava 1rem embaixo e flutuava 16px acima do bottom:0. Zeramos a
           margin nos nossos containers e em qualquer dessas tags dentro deles. */
        .rx-mnav, .rx-mtop, .rx-dock, .rx-panel, .rx-tok, .rx-lb, .rx-search, .rx-sheet, .rx-settings, .rx-rg,
        :is(.rx-mnav, .rx-mtop, .rx-dock, .rx-panel, .rx-tok, .rx-lb, .rx-search, .rx-sheet, .rx-settings, .rx-rg, .rx-rg-galwrap)
          :is(nav, img, input, textarea, select, video, iframe, audio, section, article, aside, p, ul, ol, dl,
              details, figure, form, fieldset, menu, output, progress, pre, blockquote, meter, ruby, area, datalist, optgroup, option) {
            margin: 0 !important;
        }

        /* ===== Mobile: navbar inferior ===== (montada sempre; só aparece no mobile via media query) */
        /* flush no fundo (sem safe-area: o usuário quer colada no 0, não com a faixa da barra de gestos).
           !important em position/bottom = blindagem contra qualquer regra "nav" do Reddit. */
        .rx-mnav {
            position: fixed !important; left: 0 !important; right: 0 !important; bottom: 0 !important;
            margin: 0 !important; /* o reset externo dava margin-bottom:1rem no <nav> → era a "flutuação" */
            z-index: 2147483640; display: none; height: 52px; box-sizing: border-box;
            align-items: center; justify-content: space-around;
            /* mesma cor do fundo do tema (o -container era mais claro/teal que o feed); separação vem do border+shadow */
            background: var(--color-neutral-background, #0b1416);
            border-top: 1px solid var(--color-neutral-border, rgba(255, 255, 255, .16));
            box-shadow: 0 -3px 14px rgba(0, 0, 0, .45);
        }
        .rx-mnav-btn { /* icon-only: ícone centralizado, sem rótulo */
            flex: 1 1 0; min-width: 0; height: 100%; border: none; background: transparent; cursor: pointer;
            display: flex; align-items: center; justify-content: center;
            color: var(--color-neutral-content-weak, #c2c7c9); padding: 0; -webkit-tap-highlight-color: transparent;
            transition: color .12s ease, transform .1s ease;
        }
        .rx-mnav-btn:active { transform: scale(.88); }
        .rx-mnav-btn.rx-active { color: #ff4500; }
        .rx-mnav-btn > svg, .rx-mnav-btn > .rx-mnav-avatar { width: 24px !important; height: 24px !important; flex: none; align-self: center; }
        .rx-mnav-avatar { border-radius: 50%; object-fit: cover; display: block; }
        .rx-mnav-btn.rx-active .rx-mnav-avatar { box-shadow: 0 0 0 2px #ff4500; }
        @media (max-width: 768px), (pointer: coarse) {
            html.rx-mobileNavbar .rx-mnav { display: flex; }
            html.rx-mobileNavbar shreddit-app { padding-bottom: 52px !important; }
            /* sobe a dock e as ações em lote pra não ficarem atrás da navbar */
            html.rx-mobileNavbar .rx-dock { bottom: 62px; }
            html.rx-mobileNavbar .rx-lfab-actions { bottom: 62px; }
            /* config foi pro sheet de usuário; story está na navbar → some os dois da dock no mobile */
            html.rx-mobileNavbar .rx-fab, html.rx-mobileNavbar .rx-story { display: none !important; }
            /* sem botão visível, tira o chrome da dock (senão fica uma pílula vazia). volta quando o
               scroll-to-top aparece (.rx-show) ou existe o botão de seleção (.rx-lfab-main). */
            html.rx-mobileNavbar .rx-dock { background: transparent; border-color: transparent; box-shadow: none; }
            html.rx-mobileNavbar .rx-dock:has(.rx-scrolltop.rx-show), html.rx-mobileNavbar .rx-dock:has(.rx-lfab-main) {
                background: var(--color-neutral-background-container, rgba(10, 18, 20, .9)); border-color: var(--color-neutral-border, rgba(255, 255, 255, .14)); box-shadow: 0 6px 20px rgba(0, 0, 0, .45);
            }
            /* MATA o scroll horizontal: algo do Reddit (ou o grid wide abaixo) estoura a largura, e isso
               deixa o position:fixed da navbar relativo a um ICB mais largo que a tela → ela "flutua" ao rolar. */
            html.rx-mobileNavbar, html.rx-mobileNavbar body { overflow-x: hidden !important; }
            /* coluna única no mobile: o rx-wide forçava a 2ª coluna (316px do right-rail) mesmo escondido,
               estourando a largura em telas estreitas → fonte provável do overflow. */
            html.rx-wide .main-container { grid-template-columns: minmax(0, 1fr) !important; }
        }

        /* ===== Bottom sheets (search / sidebar do mobile) ===== */
        .rx-sheet { position: fixed; inset: 0; z-index: 2147483645; }
        .rx-sheet-backdrop { position: absolute; inset: 0; background: rgba(0, 0, 0, .55); opacity: 0; transition: opacity .22s ease; }
        .rx-sheet-panel {
            position: absolute; left: 0; right: 0; bottom: 0; max-height: 85vh; overflow-y: auto;
            background: var(--color-neutral-background, #0b1416); color: var(--color-neutral-content, #d7dadc);
            border: 1px solid var(--color-neutral-border-weak, rgba(255, 255, 255, .14)); border-bottom: none; /* separa o sheet do resto */
            border-top-left-radius: 16px; border-top-right-radius: 16px;
            padding: 8px 0 calc(14px + env(safe-area-inset-bottom));
            transform: translateY(100%); transition: transform .26s cubic-bezier(.2, .8, .2, 1);
            box-shadow: 0 -8px 30px rgba(0, 0, 0, .5);
        }
        .rx-sheet-open .rx-sheet-backdrop { opacity: 1; }
        .rx-sheet-open .rx-sheet-panel { transform: translateY(0); }
        .rx-sheet-grip { width: 40px; height: 4px; border-radius: 999px; background: rgba(255, 255, 255, .25); margin: 4px auto 12px; flex: none; }
        /* a dock (com o scroll-to-top) fica ABAIXO dos sheets/busca — some enquanto algum está aberto */
        html:has(.rx-sheet) .rx-dock, html:has(.rx-search) .rx-dock, html:has(.rx-settings) .rx-dock { display: none !important; }
        /* sheet de opções do usuário (lista própria — a sidebar nativa é lazy no mobile) */
        .rx-sheet-menu-list { display: flex; flex-direction: column; padding: 0 6px; }
        .rx-sheet-menu-hd { display: flex; align-items: center; gap: 11px; padding: 4px 12px 12px; }
        .rx-sheet-menu-hd img, .rx-sheet-menu-hd svg { width: 38px; height: 38px; border-radius: 50%; flex: none; }
        .rx-sheet-menu-hd b { font-size: 16px; font-weight: 700; color: var(--color-neutral-content-strong, #fff); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .rx-sheet-item { display: flex; align-items: center; gap: 14px; padding: 13px 12px; border-radius: 10px; color: var(--color-neutral-content, #d7dadc); text-decoration: none; font-size: 15px; cursor: pointer; }
        .rx-sheet-item:hover, .rx-sheet-item:active { background: var(--color-neutral-background-hover, rgba(255, 255, 255, .06)); }
        .rx-sheet-item svg { width: 22px; height: 22px; flex: none; color: var(--color-neutral-content-weak, #9aa4a8); }
        .rx-sheet-item.rx-sheet-danger, .rx-sheet-item.rx-sheet-danger svg { color: #ff5b5b; }
        .rx-sheet-sep { height: 1px; background: var(--color-neutral-border-weak, rgba(255, 255, 255, .1)); margin: 6px 12px; }
        /* header de categoria no sheet (Account / Settings) */
        .rx-sheet-sec { padding: 14px 12px 4px; font: 700 11px/1 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; letter-spacing: .08em; text-transform: uppercase; color: #ff6a33; }
        .rx-sheet-menu-list > .rx-sheet-sec:first-of-type { padding-top: 4px; }

        /* ===== Busca full-screen (fica ATRÁS da navbar) com autocomplete ===== */
        .rx-search { position: fixed; inset: 0; z-index: 2147483630; display: flex; flex-direction: column; background: var(--color-neutral-background, #0b1416); padding-bottom: calc(52px + env(safe-area-inset-bottom)); }
        .rx-search-bar { display: flex; align-items: center; gap: 6px; padding: calc(8px + env(safe-area-inset-top)) 10px 8px; border-bottom: 1px solid var(--color-neutral-border-weak, rgba(255, 255, 255, .1)); }
        .rx-search-close { width: 40px; height: 40px; border-radius: 50%; border: none; background: transparent; cursor: pointer; flex: none; color: var(--color-neutral-content, #d7dadc); display: flex; align-items: center; justify-content: center; }
        .rx-search-close svg { width: 24px; height: 24px; }
        /* campo = pílula com lupa; borda neutra, vira laranja só no foco */
        .rx-search-field { flex: 1; min-width: 0; display: flex; align-items: center; gap: 9px; padding: 0 14px; border-radius: 999px; background: var(--color-secondary-background, #1a282d); border: 1px solid var(--color-neutral-border, rgba(255, 255, 255, .15)); transition: border-color .12s ease; }
        .rx-search-field:focus-within { border-color: #ff4500; }
        .rx-search-field > svg { width: 19px; height: 19px; flex: none; color: var(--color-neutral-content-weak, #818384); }
        .rx-search-input { flex: 1; min-width: 0; font-size: 16px; color: var(--color-neutral-content, #e6ebed); background: transparent; border: none; padding: 11px 0; }
        .rx-search-input:focus { outline: none; }
        .rx-search-input::placeholder { color: var(--color-neutral-content-weak, #818384); }
        .rx-search-results { flex: 1; overflow-y: auto; padding: 6px; }
        .rx-search-row { display: flex; align-items: center; gap: 12px; padding: 11px 10px; border-radius: 10px; cursor: pointer; color: var(--color-neutral-content, #d7dadc); }
        .rx-search-row:hover, .rx-search-row:active { background: var(--color-neutral-background-hover, rgba(255, 255, 255, .06)); }
        .rx-search-row > svg { width: 22px; height: 22px; flex: none; color: var(--color-neutral-content-weak, #9aa4a8); }
        .rx-search-ic { width: 28px; height: 28px; border-radius: 50%; object-fit: cover; flex: none; background: #333; }
        .rx-search-rowtext { display: flex; flex-direction: column; min-width: 0; }
        .rx-search-rowtitle { font-size: 15px; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .rx-search-rowsub { font-size: 12px; color: var(--color-neutral-content-weak, #9aa4a8); }

        /* ===== Mod settings em PÁGINA INTEIRA (mobile) — ← + título no topo, corpo rolável ===== */
        .rx-settings { position: fixed; inset: 0; z-index: 2147483645; display: flex; flex-direction: column; background: var(--color-neutral-background, #0b1416); }
        .rx-settings-bar { display: flex; align-items: center; gap: 8px; padding: calc(8px + env(safe-area-inset-top)) 12px 8px; border-bottom: 1px solid var(--color-neutral-border-weak, rgba(255, 255, 255, .12)); }
        .rx-settings-back { width: 40px; height: 40px; border-radius: 50%; border: none; background: transparent; cursor: pointer; flex: none; color: var(--color-neutral-content, #d7dadc); display: flex; align-items: center; justify-content: center; }
        .rx-settings-back svg { width: 24px; height: 24px; }
        .rx-settings-title { flex: 1; min-width: 0; font-weight: 800; font-size: 18px; color: var(--color-neutral-content-strong, #fff); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .rx-settings-body { flex: 1; overflow-y: auto; padding-bottom: calc(16px + env(safe-area-inset-bottom)); }
        .rx-settings-body > .rx-group-hd:first-child { margin-top: 0; border-top: none; }
    `);

    /* ------------------------------------------------------------------ *
     * Layout
     * ------------------------------------------------------------------ */
    let rxCw; // último valor escrito de --rx-cw (evita write redundante no :root a cada refresh)
    let rxFs; // último font-size escrito no <html>
    let rxScrollBtn = null, rxScrollShown = false, rxScrollTick = false; // estado do botão scroll-to-top (na dock)
    function applyWidth() {
        const v = (settings.width || 92) + "%";
        if (rxCw === v) return;
        rxCw = v;
        document.documentElement.style.setProperty("--rx-cw", v);
    }

    // Tamanho da fonte: escala o font-size do <html> → todos os rem do Reddit (texto + espaçamento)
    // escalam junto, tipo um zoom. Nossa UI usa px, então não muda. 100% = padrão do browser.
    function applyFontSize() {
        const v = settings.fontSize || 100;
        if (rxFs === v) return;
        rxFs = v;
        document.documentElement.style.fontSize = v === 100 ? "" : v + "%";
    }

    function applyClasses() {
        const h = document.documentElement;
        if (!h) return;
        HIDE_KEYS.forEach((k) => h.classList.toggle("rx-" + k, !!settings[k]));
        h.classList.toggle("rx-wide", !!settings.wide);
        h.classList.toggle("rx-mobileNavbar", !!settings.mobileNavbar); // CSS do padding/dock; o build é em buildMobileNav
        applyTheme();
        applyWidth();
        applyFontSize();
    }

    // Tema preto: é um MODIFICADOR do dark, não força preto no light. Detecta o tema efetivo do Reddit
    // (theme-light/theme-dark explícito, ou prefers-color-scheme) e só aplica o override (rx-blackactive)
    // quando está no escuro. No tema branco, desabilita sozinho. Roda no boot, em mudança de setting, e
    // via listeners de mudança de tema (toggle nativo/nosso, ou mudança de sistema).
    function isLightTheme() {
        const h = document.documentElement;
        if (h.classList.contains("theme-light")) return true;
        if (h.classList.contains("theme-dark")) return false;
        try { return window.matchMedia && window.matchMedia("(prefers-color-scheme: light)").matches; } catch (e) { return false; }
    }
    function applyTheme() {
        const h = document.documentElement;
        if (!h) return;
        h.classList.toggle("rx-blackactive", !!settings.blackTheme && !isLightTheme());
    }

    // Marca html.rx-profile quando estamos em /user/* — usado pelo applyTopbar pra NÃO rodar o
    // branch HOME por engano enquanto o tabgroup do profile ainda não montou. Toggle é no-op quando
    // já está certo (não gera mutação).
    function applyProfileClass() {
        document.documentElement.classList.toggle("rx-profile", /^\/(user|u)\//.test(location.pathname));
    }

    // Pin right sidebar NÃO deve valer em páginas sem o layout-feed padrão (têm rail mas estrutura
    // diferente, e o reshape deixava a página em branco — ex.: /notifications). Marca rx-nopin nelas
    // e o CSS do fixedRightSidebar usa :not(.rx-nopin).
    const RX_NOPIN = /^\/(notifications|settings|message|messages|chat|submit|premium|coins|avatar|drafts|appeals?|mod\/)/i;
    function applyPinScope() {
        document.documentElement.classList.toggle("rx-nopin", RX_NOPIN.test(location.pathname));
    }

    // recSkipAllPop: em r/all e r/popular ~tudo é recomendação, então (opcional) não escondemos lá.
    // Marca html.rx-rec-skip e o CSS de hideRecommended usa :not(.rx-rec-skip). Toggle barato (no-op se igual).
    function applyRecScope() {
        const skip = !!settings.recSkipAllPop && /^\/r\/(all|popular)\b/i.test(location.pathname);
        document.documentElement.classList.toggle("rx-rec-skip", skip);
    }

    /* ------------------------------------------------------------------ *
     * Sidebar: user shortcuts ("Você")
     * ------------------------------------------------------------------ */
    function getUsername() {
        const tries = [
            () => document.querySelector("after-login-toast-dispatcher[username]")?.getAttribute("username"),
            () => document.querySelector('[multiredditpath^="/user/"]')?.getAttribute("multiredditpath")?.match(/^\/user\/([^/]+)/)?.[1],
            () => document.querySelector('a[href*="/user/"][href*="/m/"]')?.getAttribute("href")?.match(/\/user\/([^/]+)/)?.[1],
            () => document.querySelector('[data-faceplate-tracking-context*="/user/"]')?.getAttribute("data-faceplate-tracking-context")?.match(/\/user\/([^/]+)\//)?.[1],
        ];
        for (const t of tries) {
            try {
                const u = t();
                if (u && u.toLowerCase() !== "me") return u;
            } catch (e) {}
        }
        return null;
    }

    function getSidebarNav() {
        return (
            document.querySelector('reddit-sidebar-nav nav[aria-label="Primary"]') ||
            document.querySelector('#left-sidebar nav[aria-label="Primary"]') ||
            document.querySelector('nav[aria-label="Primary"]')
        );
    }

    // A single shortcut row, structured byte-for-byte like Reddit's native nav links:
    // icon box + label on the left, an empty trailing span, and justify-between so the
    // row fills the column width.
    function nativeLinkRow(href, iconPath, label) {
        const left = el(
            "span",
            { className: "flex items-center gap-xs min-w-0 shrink" },
            el("span", { className: "flex shrink-0 items-center justify-center h-xl w-xl text-20 leading-4" }, icon(iconPath)),
            el(
                "span",
                { className: "flex flex-col justify-center min-w-0 shrink py-[var(--rem6)]" },
                el("span", { className: "text-body-2" }, el("div", { className: "truncate" }, label)),
            ),
        );
        const trailing = el("span", { className: "flex items-center shrink-0" }, el("span", { className: "flex items-center justify-center h-lg" }));
        return el(
            "li",
            { rpl: "", className: "relative list-none mt-0", role: "presentation" },
            el("a", { className: NAV_A_CLS, href, style: { paddingInlineEnd: "16px" } }, left, trailing),
        );
    }

    // Acha uma seção nativa pra servir de molde (Custom Feeds de preferência; cai pra
    // Communities/Resources). Retorna o <faceplate-expandable-section-helper>.
    function nativeSectionTemplate() {
        return document
            .querySelector('faceplate-tracker[noun="multireddits_menu"], faceplate-tracker[noun="communities_menu"], faceplate-tracker[noun="resources_menu"]')
            ?.closest("faceplate-expandable-section-helper");
    }

    // A "Você" é um CLONE de uma seção nativa — herda o chrome inteiro (cabeçalho, caret,
    // animação de recolher, espaçamento). Só trocamos o rótulo e os itens.
    function injectUserSection() {
        const nav = getSidebarNav();
        if (!nav || nav.querySelector(".rx-user-section")) return;
        const user = getUsername();
        if (!user) return;
        const tmpl = nativeSectionTemplate();
        if (!tmpl) return; // seções nativas ainda não montaram — o MutationObserver tenta de novo

        const sec = tmpl.cloneNode(true);
        sec.classList.add("rx-user-section");

        // Tira o que veio junto do clone e não serve, e o tracking herdado.
        sec.querySelectorAll("faceplate-loader, faceplate-partial, script, custom-feed-edit-button, shreddit-async-loader").forEach((n) => n.remove());
        sec.querySelectorAll("[noun]").forEach((n) => n.removeAttribute("noun"));

        // Rótulo do cabeçalho.
        const title = sec.querySelector("summary .tracking-widest");
        if (title) title.textContent = "YOU";

        // Corpo: substitui os itens nativos pelos atalhos do perfil.
        const base = "https://www.reddit.com/user/" + user;
        const items = USER_LINKS.map((l) => nativeLinkRow(base + l.path, l.icon, l.label));
        const body = sec.querySelector("[faceplate-auto-height-animator-content]");
        if (!body) return; // estrutura inesperada — não injeta um clone com conteúdo nativo
        body.replaceChildren(...items);
        body.removeAttribute("id"); // não duplicar #multireddits_section
        sec.querySelector("summary")?.removeAttribute("aria-controls");

        // Sempre recolhível: persiste o estado aberto/fechado.
        const details = sec.querySelector("details");
        if (details) {
            details.open = settings.userSecOpen !== false;
            details.addEventListener("toggle", () => {
                settings.userSecOpen = details.open;
                save();
            });
        }

        const firstSection = nav.querySelector("left-nav-top-section");
        if (firstSection) firstSection.after(sec);
        else nav.prepend(sec);
    }

    function renderUserSection() {
        document.querySelectorAll(".rx-user-section").forEach((n) => n.remove());
        if (settings.userShortcuts) injectUserSection();
    }

    /* ------------------------------------------------------------------ *
     * Abas de ordenação (sort tabs)
     * ------------------------------------------------------------------ */
    const sortOf = (p) => (p.match(/\/(best|hot|new|top|rising)\b/) || [, ""])[1];

    function applySortTabs() {
        if (!settings.sortTabs) {
            if (!document.querySelector(".rx-sort-tabs")) return; // off e nada montado → sai barato
            document.querySelectorAll(".rx-sort-tabs").forEach((n) => n.remove());
            document.querySelectorAll(".rx-sorted-hidden").forEach((n) => n.classList.remove("rx-sorted-hidden"));
            return;
        }
        const dd = document.querySelector('shreddit-sort-dropdown[telemetry-source="sort_switch"]');
        if (!dd || !dd.parentElement) return;

        let bar = dd.parentElement.querySelector(":scope > .rx-sort-tabs");
        if (!bar) {
            const seen = new Set();
            const items = [...dd.querySelectorAll("a[href]")]
                .map((a) => ({ href: a.getAttribute("href"), label: (a.textContent || "").trim() }))
                .filter((o) => o.href && o.label && sortOf(o.href) && !seen.has(o.label) && seen.add(o.label));
            if (!items.length) return;

            bar = el(
                "div",
                { className: "rx-sort-tabs" },
                ...items.map((o) => {
                    const s = sortOf(o.href);
                    return el("a", { className: "rx-sort-tab", "data-sort": s, href: o.href }, PATH[s] ? icon(PATH[s]) : null, el("span", null, o.label));
                }),
            );
            dd.parentElement.insertBefore(bar, dd);
            dd.classList.add("rx-sorted-hidden");
        }

        const cur = sortOf(location.pathname) || "best";
        bar.querySelectorAll(".rx-sort-tab").forEach((t) => t.classList.toggle("rx-active", t.dataset.sort === cur));
    }

    /* ------------------------------------------------------------------ *
     * Topbar: botão de View laranja/maior, na mesma linha das abas, à direita.
     * O <button> mora no shadow root do dropdown → cor/tamanho via styleViewShadow.
     * O painel ativo (.page.active) é shadow (inacessível); o view HOST e o faceplate-tabgroup
     * são light DOM. PROFILE: movemos o host pro container das abas (mesmo slot) e auto-margin
     * empurra à direita. HOME: o view já é irmão das sort-tabs em .flex.items-center.
     * ------------------------------------------------------------------ */
    function styleViewShadow(view) {
        const sr = view.shadowRoot;
        if (!sr || sr.getElementById("rx-view-css")) return;
        const st = document.createElement("style");
        st.id = "rx-view-css";
        st.textContent =
            'faceplate-tracker[source="layout_switch"] > button{padding:7px 10px!important;height:auto!important;max-height:none!important;width:auto!important}' +
            'faceplate-tracker[source="layout_switch"] > button svg{width:20px!important;height:20px!important}';
        sr.appendChild(st);
    }

    let lastTopbarPath = null;
    function applyTopbar() {
        const nl = document.querySelectorAll('shreddit-sort-dropdown[sort-event="layout-view-change"]');
        if (!nl.length) return; // sai antes de alocar array (roda no observer EAGER, toda mutação)
        // Idempotência: página já reformatada nesta rota → pula o resto (styleViewShadow, tabgroup lookup…).
        // Home: a classe basta (não move nada). Profile: só sai se não há view "solta" fora da linha das abas
        // (trocar de aba cria uma nova que PRECISA ser movida). Path muda na nav SPA → invalida e re-reforma.
        if (lastTopbarPath === location.pathname) {
            const phome = document.querySelector(".rx-topbar-home");
            if (phome && phome.isConnected) return;
            const pprof = document.querySelector(".rx-topbar-profile");
            if (pprof && pprof.isConnected) {
                let stray = false;
                nl.forEach((v) => { if (v.parentElement !== pprof) stray = true; });
                if (!stray) return;
            }
        }
        const views = [...nl];
        views.forEach(styleViewShadow); // laranja + maior (shadow root)

        // PROFILE: tabs e view ficam em ramos separados; move o view pro pai das abas
        // (.mx-2xs.my-md, div light full-width) e flexa em space-between → tabs | view.
        const tabgroup = document.querySelector("faceplate-tabgroup#profile-feed-tabgroup");
        if (tabgroup && tabgroup.parentElement) {
            const row = tabgroup.parentElement;
            row.classList.add("rx-topbar-profile");
            const inRow = views.find((v) => v.parentElement === row);
            const stray = views.find((v) => v.parentElement !== row); // o que nasceu no painel
            if (stray) {
                // prefere o recém-nascido (reflete a aba atual); descarta o antigo (troca de aba)
                const oldWrap = stray.closest("div.my-xs"); // linha nativa solta abaixo das abas
                if (oldWrap && oldWrap !== row) oldWrap.classList.add("rx-viewrow-empty");
                if (inRow && inRow !== stray) inRow.remove();
                row.appendChild(stray);
            }
            lastTopbarPath = location.pathname; // reformatado: o guard acima sai cedo até a próxima nav
            return;
        }
        // Em /user/* sem o tabgroup montado ainda: não roda o branch HOME (marcaria container errado).
        // O CSS anti-pulo já esconde o view; quando o tabgroup montar, o move acontece acima.
        if (document.documentElement.classList.contains("rx-profile")) return;

        // HOME: o parent comum de sort + view é .flex.h-[32px] (o view fica num
        // <shreddit-layout-event-setter>, irmão do bloco das sort-tabs). Flexa em space-between.
        const row = views[0].closest("div.flex");
        if (row) { row.classList.add("rx-topbar-home"); lastTopbarPath = location.pathname; }
    }

    /* ------------------------------------------------------------------ *
     * Topbar antiga
     * ------------------------------------------------------------------ */
    // The interactive search lives inside reddit-search-large's shadow root, so
    // document CSS can't touch it — we inject a <style> into the shadow + prune.
    function applyOldTopbar() {
        if (!settings.oldTopbar) return;
        const search = document.querySelector("reddit-search-large");
        if (!search || search.dataset.rxOldbar === "1") return; // já totalmente aplicado → bail (não re-varre o shadow a cada refresh)

        // 1. Native flags off — drops the AI/Ask/snoo treatment where the component honors it (idempotente).
        ["show-ask-button", "show-ask-text", "show-snoo-leading-icon"].forEach((a) => search.removeAttribute(a));
        if (search.getAttribute("ask-button-variant") !== "disabled") search.setAttribute("ask-button-variant", "disabled");

        // 2. Achata a barra + esconde Ask/AI/leadingIcon TUDO via CSS no shadow (persiste em re-render, sem JS por refresh).
        const sr = search.shadowRoot;
        if (sr && !sr.getElementById("rx-old-search")) {
            const st = document.createElement("style");
            st.id = "rx-old-search";
            st.textContent = `
                .reddit-search-bar, .reddit-search-bar::before, .reddit-search-bar::after {
                    background-image: none !important; box-shadow: none !important; outline: none !important;
                    border: 1px solid var(--color-neutral-border-weak, #343536) !important;
                }
                .reddit-search-bar { background: var(--color-secondary-background, #1a282d) !important; }
                a[href*="/answers/"], svg[icon-name="ai"], svg[slot="leadingIcon"] { display: none !important; }
            `;
            sr.appendChild(st);
        }

        // 3. Placeholder antigo no campo interno (2 níveis de shadow). Só marca "done" quando ele já existe
        //    E o style foi injetado — aí para de re-rodar de vez.
        //    O campo é um <textarea part="control">; o <input> só existe no fallback do light DOM. Mirando
        //    só "input", isto nunca achava nada → nunca marcava done → re-varria os dois shadows a cada
        //    refresh, pra sempre.
        const fsi = sr && sr.querySelector("#search-input");
        const inner = fsi && fsi.shadowRoot && fsi.shadowRoot.querySelector("textarea, input");
        if (inner) {
            if (inner.getAttribute("placeholder") !== "Search Reddit") inner.setAttribute("placeholder", "Search Reddit");
            if (sr && sr.getElementById("rx-old-search")) search.dataset.rxOldbar = "1";
        }
    }

    // O dropdown atual vive no shadow root com um ID estável, mas não recebe fundo próprio
    // (os itens têm apenas classes de espaçamento). Estiliza somente o painel identificado,
    // sem mexer em largura, posição ou overflow do wrapper que o Reddit usa como âncora.
    function applySearchDropdown() {
        const search = document.querySelector("reddit-search-large");
        const sr = search && search.shadowRoot;
        if (!sr || sr.getElementById("rx-search-dropdown")) return;
        const st = document.createElement("style");
        st.id = "rx-search-dropdown";
        st.textContent = `
            #search-dropdown-results-container {
                background: var(--color-neutral-background-container, #161617) !important;
                border: 1px solid var(--color-neutral-border, rgba(255, 255, 255, .16)) !important;
                border-radius: 12px !important;
                box-shadow: 0 12px 32px rgba(0, 0, 0, .5) !important;
            }
            #search-dropdown-results-container > ul[role="menu"] {
                background: transparent !important;
            }
        `;
        sr.appendChild(st);
    }

    /* ------------------------------------------------------------------ *
     * Autoplay — drives Reddit's own <shreddit-player> (2 shadow levels deep)
     * ------------------------------------------------------------------ */
    const playerVideo = (p) => p.shadowRoot && p.shadowRoot.querySelector("video");
    const playerUi = (p) => p.shadowRoot && p.shadowRoot.querySelector("shreddit-media-ui");
    const playerPaused = (p) => {
        const ui = playerUi(p);
        return !ui || ui.hasAttribute("paused");
    };
    const isGif = (p) => {
        const ui = playerUi(p);
        return ui && ui.hasAttribute("gif");
    };
    const uiBtn = (p, sel) => {
        const ui = playerUi(p);
        return ui && ui.shadowRoot && ui.shadowRoot.querySelector(sel);
    };

    function rxPlay(p) {
        if (p.dataset.rxUser || isGif(p)) return;
        const v = playerVideo(p);
        if (v) v.muted = true;
        if (!playerPaused(p)) return;
        const btn = uiBtn(p, ".poster-play-button") || uiBtn(p, ".play-pause-button");
        if (btn) btn.click();
    }

    function rxPause(p) {
        if (p.dataset.rxUser || isGif(p) || playerPaused(p)) return;
        const btn = uiBtn(p, ".play-pause-button");
        if (btn) btn.click();
    }

    const playerObserver = new IntersectionObserver(
        (entries) => {
            if (!settings.autoplay) return;
            for (const e of entries) {
                if (e.isIntersecting && e.intersectionRatio >= 0.6) rxPlay(e.target);
                else if (e.intersectionRatio < 0.1) rxPause(e.target);
            }
        },
        { threshold: [0, 0.1, 0.6] },
    );

    function observePlayers() {
        if (!settings.autoplay) return;
        document.querySelectorAll("shreddit-player:not([data-rx-apobs])").forEach((p) => {
            p.dataset.rxApobs = "1";
            // Once the user interacts with a player, stop auto-controlling it.
            p.addEventListener("pointerdown", () => (p.dataset.rxUser = "1"), { once: true });
            playerObserver.observe(p);
        });
    }

    /* ------------------------------------------------------------------ *
     * Anúncios em menus lazy (shadow DOM — fora do alcance do CSS)
     * ------------------------------------------------------------------ */
    function pruneMenus() {
        const pats = [];
        if (settings.hideAdvertise) pats.push("ads.reddit.com", "/reddit-pro");
        if (settings.hidePremium) pats.push("/premium", "ad_overflow");
        if (!pats.length) return;
        const sig = pats.join("|");
        const match = (href) => pats.some((p) => href.includes(p));

        document.querySelectorAll('faceplate-menu, faceplate-tray, faceplate-dropdown-menu, [role="menu"]').forEach((host) => {
            if (host.dataset.rxPruned === sig) return; // já varrido pra essa config
            let sawLinks = false;
            [host, host.shadowRoot].forEach((root) => {
                if (!root || !root.querySelectorAll) return;
                const links = root.querySelectorAll("a[href]");
                if (links.length) sawLinks = true;
                links.forEach((a) => {
                    if (match(a.getAttribute("href") || "")) (a.closest("li") || a).style.display = "none";
                });
            });
            if (sawLinks) host.dataset.rxPruned = sig; // só fixa quando o menu já tinha conteúdo (lazy)
        });
    }

    /* ------------------------------------------------------------------ *
     * Save/Hide na barra de ações do post.
     * A AÇÃO é a nativa: clicamos o item real do menu "..." (no shadow root do
     * <shreddit-post-overflow-menu>), igual o botão antigo. O ESTADO do nosso botão é
     * ESPELHADO do próprio item via MutationObserver (sem chute otimista) — ícone, cor e
     * rótulo (Save↔Unsave). O "..." é movido pra barra e os itens duplicados ficam ocultos.
     * ------------------------------------------------------------------ */
    const SVG_NS = "http://www.w3.org/2000/svg";
    const SAVE_ICON = { off: PATH.postSave, on: PATH.postSaveFill };
    const HIDE_ICON = { off: PATH.postHide, on: PATH.postHide }; // Hide não tem glyph "ativo" distinto: mesmo path nos 2 estados (a troca em syncBtn vira no-op); formato espelha SAVE_ICON

    function overflowItem(overflow, kind) {
        const sr = overflow && overflow.shadowRoot;
        return (sr && sr.querySelector('[id="post-overflow-' + kind + '"], [id="post-overflow-un' + kind + '"]')) || null;
    }

    // Dispara a ação clicando DIRETO no item real (sem abrir o dropdown). Se ainda não
    // renderizou, abre o menu uma vez pra forçar e tenta de novo.
    function triggerAction(overflow, kind) {
        const click = () => {
            const it = overflowItem(overflow, kind);
            if (it) { (it.querySelector('[role="menuitem"]') || it).click(); return true; }
            return false;
        };
        if (click()) return;
        overflow.querySelector('button[aria-label="Open user actions"], button[aria-haspopup="menu"]')?.click();
        let n = 0;
        const iv = setInterval(() => {
            if (click() || ++n > 40) clearInterval(iv);
        }, 75);
    }

    // Espelha o estado do item REAL no botão da barra: ícone, cor e rótulo (Save↔Unsave).
    function syncBtn(btn, overflow, kind, icons) {
        const it = overflowItem(overflow, kind);
        if (!it) return;
        const lblEl = it.querySelector(".text-body-2");
        const raw = ((lblEl ? lblEl.textContent : it.textContent) || "").replace(/\s+/g, " ").trim();
        const base = kind === "save" ? "Save" : "Hide";
        // ativo = o item não mostra mais o rótulo base "Save"/"Hide" (ex.: "Remove from saved")
        const on = it.id.indexOf("un" + kind) >= 0 || (!!raw && raw.toLowerCase() !== base.toLowerCase());
        const label = on ? "Un" + base.toLowerCase() : base; // Unsave/Unhide : Save/Hide — rótulo curto fixo
        const path = btn.querySelector("svg path");
        if (path) path.setAttribute("d", on ? icons.on : icons.off);
        if (on) btn.style.setProperty("color", "#ff4500", "important"); // vence o button-secondary do Reddit
        else btn.style.removeProperty("color");
        const lbl = btn.querySelector(".rx-act-label");
        if (lbl) lbl.textContent = label;
        btn.setAttribute("aria-label", label);
    }

    // Botão da barra: clona o link de comentários da MESMA barra (herda o estilo de pílula e
    // as stylesheets do shadow root), troca ícone/rótulo e dispara a ação nativa.
    function makeActionButton(ref, kind, label, overflow) {
        const icons = kind === "save" ? SAVE_ICON : HIDE_ICON;
        const btn = ref.cloneNode(true);
        btn.classList.add("rx-post-act");
        btn.dataset.rxKind = kind;
        ["href", "data-action-bar-action", "data-post-click-location", "name", "id"].forEach((a) => btn.removeAttribute(a));
        btn.setAttribute("role", "button");
        btn.setAttribute("tabindex", "0");
        btn.setAttribute("aria-label", label);
        const svg = btn.querySelector("svg");
        if (svg) {
            svg.removeAttribute("icon-name");
            svg.replaceChildren();
            const p = document.createElementNS(SVG_NS, "path");
            p.setAttribute("d", icons.off);
            svg.appendChild(p);
        }
        const num = btn.querySelector("faceplate-number");
        if (num && num.parentElement) { num.parentElement.classList.add("rx-act-label"); num.parentElement.textContent = label; }
        const srEl = btn.querySelector("faceplate-screen-reader-content");
        if (srEl) srEl.textContent = label;
        syncBtn(btn, overflow, kind, icons); // estado real, se o menu já montou
        btn.addEventListener("click", (e) => {
            e.preventDefault();
            e.stopPropagation();
            triggerAction(overflow, kind); // o observer abaixo atualiza o visual quando o item muda
        });
        return btn;
    }

    // Observa o menu real e re-espelha o estado nos botões (montagem dos itens + save/unsave).
    function observeOverflow(overflow, bar) {
        if (!overflow.shadowRoot) return;
        const resync = () => {
            const s = bar.querySelector('.rx-post-act[data-rx-kind="save"]');
            const h = bar.querySelector('.rx-post-act[data-rx-kind="hide"]');
            if (s) syncBtn(s, overflow, "save", SAVE_ICON);
            if (h) syncBtn(h, overflow, "hide", HIDE_ICON);
        };
        if (!overflow.__rxObs) {
            overflow.__rxObs = new MutationObserver(resync);
            overflow.__rxObs.observe(overflow.shadowRoot, { childList: true, subtree: true, characterData: true });
        }
        resync();
    }

    // Mostra/esconde os itens Save/Hide do dropdown (continuam clicáveis por código).
    function toggleDropdownDupes(overflow, hidden) {
        const sr = overflow && overflow.shadowRoot;
        if (!sr) return;
        ["save", "hide"].forEach((k) => {
            const li = sr.querySelector('[id="post-overflow-' + k + '"], [id="post-overflow-un' + k + '"]');
            if (li) li.style.display = hidden ? "none" : "";
        });
    }

    // A barra de ações (vote/comentar/Share) vive no SHADOW ROOT do <shreddit-post>; o menu
    // "..." vive no credit-bar (light DOM). Pareamos os dois pelo mesmo <shreddit-post>.
    let postBarApplied = false; // já mexemos em algum post? evita varrer shreddit-post no caso padrão (tudo off)
    function applyPostBarActions() {
        const wantBtns = settings.postBarActions;
        const wantMove = settings.moveShareLast;
        const wantNoAward = settings.hideAward;
        if (!wantBtns && !wantMove && !wantNoAward) {
            if (!postBarApplied) return; // nunca aplicamos nada → nada a limpar (default: zero varredura por refresh)
            document.querySelectorAll("shreddit-post").forEach((post) => {
                const sr = post.shadowRoot;
                if (!sr) return;
                sr.querySelectorAll(".rx-post-act").forEach((n) => n.remove());
                sr.querySelectorAll("award-button[data-rx-hidden]").forEach((n) => { n.style.display = ""; n.removeAttribute("data-rx-hidden"); });
                toggleDropdownDupes(sr.querySelector("shreddit-post-overflow-menu") || post.querySelector("shreddit-post-overflow-menu"), false);
                delete post.dataset.rxBar;
            });
            postBarApplied = false;
            return;
        }
        postBarApplied = true;
        const sig = (wantBtns ? "b" : "") + (wantMove ? "m" : "") + (wantNoAward ? "a" : ""); // muda → reprocessa
        document.querySelectorAll("shreddit-post").forEach((post) => {
            const sr = post.shadowRoot;
            // já processado pra essa config? re-checa os botões (self-heal se a barra re-renderizar)
            if (post.dataset.rxBar === sig && (!wantBtns || (sr && sr.querySelector(".rx-post-act")))) return;
            const bar = sr && sr.querySelector('[data-testid="action-row"]');
            if (!bar) return;
            // icon-only no mobile: o CSS do documento não fura o shadow root, então injetamos um <style>
            // dentro dele escondendo os rótulos (Save/Hide) abaixo de 768px / em touch.
            if (sr && !sr.getElementById("rx-bar-mobile-css")) {
                const st = document.createElement("style");
                st.id = "rx-bar-mobile-css";
                st.textContent = "@media (max-width:768px),(pointer:coarse){.rx-act-label{display:none!important}}";
                sr.appendChild(st);
            }
            const anchor = bar.querySelector(".ms-auto"); // bloco alinhado à direita (mod/promote)
            const overflow = bar.querySelector("shreddit-post-overflow-menu") || post.querySelector("shreddit-post-overflow-menu");

            // Save/Hide na barra + tira os duplicados do dropdown + traz o "..." pra barra
            if (wantBtns && overflow) {
                const ref = bar.querySelector('[data-action-bar-action="comments"]'); // pílula de comentários (é <a> no feed, <button> na página do post)
                if (ref && !bar.querySelector(".rx-post-act")) {
                    bar.insertBefore(makeActionButton(ref, "save", "Save", overflow), anchor);
                    bar.insertBefore(makeActionButton(ref, "hide", "Hide", overflow), anchor);
                }
                toggleDropdownDupes(overflow, true);
                const ofWrap = overflow.closest("shreddit-async-loader") || overflow;
                if (ofWrap.parentElement !== bar || ofWrap.nextElementSibling !== anchor) bar.insertBefore(ofWrap, anchor);
                observeOverflow(overflow, bar); // espelha o estado do menu nos botões
            } else if (!wantBtns) {
                bar.querySelectorAll(".rx-post-act").forEach((n) => n.remove());
                toggleDropdownDupes(overflow, false);
            }

            // Esconder award
            bar.querySelectorAll("award-button").forEach((n) => {
                if (wantNoAward) { n.style.display = "none"; n.setAttribute("data-rx-hidden", "1"); }
                else if (n.hasAttribute("data-rx-hidden")) { n.style.display = ""; n.removeAttribute("data-rx-hidden"); }
            });

            // Share por último — logo antes do "..." (se movido) ou do bloco à direita
            if (wantMove) {
                const share = bar.querySelector('slot[name="share-button"]') || bar.querySelector("shreddit-post-share-button");
                const ofWrap = overflow ? (overflow.closest("shreddit-async-loader") || overflow) : null;
                const target = ofWrap && ofWrap.parentElement === bar ? ofWrap : anchor;
                if (share && share.nextElementSibling !== target) bar.insertBefore(share, target);
            }

            // marca como processado só quando o resultado está completo (botões presentes, se pedidos)
            if (!wantBtns || bar.querySelector(".rx-post-act")) post.dataset.rxBar = sig;
        });
    }

    /* ------------------------------------------------------------------ *
     * Saved / listings: multiselect + ações em lote (na visão padrão do Reddit).
     * FAB de seleção em ícone, à esquerda do botão de config. Em select mode o card inteiro
     * vira clicável (overlay) e as ações vão para uma dock central. Em lote reaproveita
     * triggerAction (clica o item real do menu).
     * ------------------------------------------------------------------ */
    function isListingPage() {
        return /\/(saved|upvoted|submitted|hidden)\b/.test(location.pathname);
    }

    const rxSel = new Set(); // post-ids selecionados (transiente)
    let rxSelectAll = false;  // "select all" fixo: cards carregados depois (scroll) entram sozinhos

    function findPostOverflow(post) {
        const sr = post.shadowRoot;
        return (sr && sr.querySelector("shreddit-post-overflow-menu")) || post.querySelector("shreddit-post-overflow-menu");
    }
    function findPostById(id) {
        return document.querySelector('article[data-post-id="' + id + '"] shreddit-post') || document.querySelector('shreddit-post[id="' + id + '"]');
    }
    // estado atual (saved/hidden) lido pelo item do menu; null se não der pra ler
    function readOnState(overflow, kind) {
        const it = overflowItem(overflow, kind);
        if (!it) return null;
        const base = kind === "save" ? "save" : "hide";
        const raw = ((it.querySelector(".text-body-2") || {}).textContent || "").trim().toLowerCase();
        return it.id.indexOf("un" + base) >= 0 || (!!raw && raw !== base);
    }

    function fabAct(label, iconEl, onClick) {
        return el("button", { className: "rx-lfab-act", type: "button", title: label, "aria-label": label, onClick }, iconEl, el("span", null, label));
    }
    // Todos os posts do feed (qualquer página do scroll infinito). Sem combinator filho-direto:
    // a 2ª+ página entra fora do <shreddit-feed> inicial. Exclui posts da sidebar direita.
    function allPosts() {
        return [...document.querySelectorAll("article[data-post-id]")].filter((a) => !a.closest("#right-sidebar-container, aside"));
    }
    function postPermalink(article) {
        if (!article) return "";
        const sp = article.querySelector("shreddit-post");
        const raw = (sp && sp.getAttribute("permalink")) || article.getAttribute("data-permalink") ||
            article.querySelector('a[href*="/comments/"]')?.getAttribute("href") || "";
        if (!raw) return "";
        try { return stripTrackers(new URL(raw, location.origin).toString()); } catch (e) { return ""; }
    }
    // offsetParent === null cobre o mesmo conjunto que display:none (no próprio post ou num ancestral) mas
    // SEM forçar reflow por item — getComputedStyle dava O(n) flushes num feed com centenas de <article>.
    function visibleArticles() {
        return allPosts().filter((a) => a.offsetParent !== null);
    }
    function allVisibleSelected() {
        if (!rxSel.size) return false; // nada selecionado → curto-circuito (zero reflow)
        let any = false;
        for (const a of allPosts()) {
            if (a.offsetParent === null) continue; // pula post escondido (anúncio/filtrado/recomendado)
            any = true;
            if (!rxSel.has(a.getAttribute("data-post-id"))) return false; // achou visível não-selecionado → para já
        }
        return any;
    }
    function updateFabUI() {
        const count = document.querySelector(".rx-lfab-count");
        if (count) count.textContent = rxSel.size ? rxSel.size + " selected" : "";
        const span = document.querySelector(".rx-selall span:last-child");
        if (span) span.textContent = rxSelectAll || allVisibleSelected() ? "Deselect all" : "Select all";
    }
    // "Select all" é fixo: seleciona os carregados e marca pra auto-selecionar os que vierem no scroll.
    // Clicar de novo (já tudo selecionado) → Deselect all.
    function toggleSelectAll() {
        if (rxSelectAll || allVisibleSelected()) {
            clearSelection();
        } else {
            rxSelectAll = true;
            visibleArticles().forEach((a) => { rxSel.add(a.getAttribute("data-post-id")); a.classList.add("rx-selected"); });
        }
        updateFabUI();
    }
    function bulkSet(kind, desiredOn) {
        [...rxSel].forEach((id) => {
            const post = findPostById(id);
            const ov = post && findPostOverflow(post);
            if (ov && readOnState(ov, kind) !== desiredOn) triggerAction(ov, kind); // alterna pro estado desejado
        });
        clearSelection();
    }
    function copySelectedUrls() {
        const articles = new Map(allPosts().map((a) => [a.getAttribute("data-post-id"), a]));
        const urls = [...rxSel].map((id) => postPermalink(articles.get(id))).filter(Boolean);
        if (!urls.length) { toast("No post URLs available"); return; }
        copyText(urls.join("\n"), () => toast(urls.length === 1 ? "Post URL copied" : urls.length + " post URLs copied"));
    }
    function clearSelection() {
        rxSelectAll = false;
        rxSel.clear();
        document.querySelectorAll("article.rx-selected").forEach((a) => a.classList.remove("rx-selected"));
        updateFabUI();
    }
    function toggleSelect(article) {
        const id = article.getAttribute("data-post-id");
        if (!id) return;
        if (rxSel.has(id)) { rxSel.delete(id); article.classList.remove("rx-selected"); rxSelectAll = false; } // tirar 1 cancela o auto
        else { rxSel.add(id); article.classList.add("rx-selected"); }
        updateFabUI();
    }
    // Em select mode o CARD INTEIRO é clicável: overlay absolute inset-0 por cima de tudo.
    function decorateArticle(article, on) {
        if (on) {
            article.classList.add("rx-selectable");
            if (!article.querySelector(":scope > .rx-select-overlay")) {
                article.appendChild(el(
                    "div",
                    { className: "rx-select-overlay", onClick: (e) => { e.preventDefault(); e.stopPropagation(); toggleSelect(article); } },
                    el("div", { className: "rx-check" }, icon(PATH.check, 24)),
                ));
            }
        } else {
            article.classList.remove("rx-selectable", "rx-selected");
            article.querySelectorAll(":scope > .rx-select-overlay").forEach((n) => n.remove());
        }
    }
    function setSelectMode(on) {
        document.documentElement.classList.toggle("rx-selmode", on);
        allPosts().forEach((a) => decorateArticle(a, on));
        const actions = document.querySelector(".rx-lfab-actions");
        if (actions) actions.hidden = !on;
        const main = document.querySelector(".rx-lfab-main");
        if (main) main.classList.toggle("rx-on", on);
        if (!on) clearSelection();
        updateFabUI();
    }
    function buildListingsFab() {
        if (document.querySelector(".rx-lfab-main")) return;
        const actions = el(
            "div",
            { className: "rx-lfab-actions", hidden: "" },
            el("span", { className: "rx-lfab-count" }),
            (() => { const b = fabAct("Select all", icon(PATH.check, 24), toggleSelectAll); b.classList.add("rx-selall"); return b; })(),
            fabAct("Copy URLs", icon(PATH.copy, 20), copySelectedUrls),
            fabAct("Save", icon(PATH.postSaveFill, 20), () => bulkSet("save", true)),
            fabAct("Unsave", icon(PATH.postSave, 20), () => bulkSet("save", false)),
            fabAct("Hide", icon(PATH.postHide, 20), () => bulkSet("hide", true)),
            fabAct("Cancel", icon(PATH.close, 20), () => setSelectMode(false)),
        );
        const main = el(
            "button",
            { className: "rx-lfab-main rx-dock-btn", type: "button", title: "Select posts", "aria-label": "Select posts", onClick: () => setSelectMode(!document.documentElement.classList.contains("rx-selmode")) },
            icon(PATH.check, 24),
        );
        (document.body || document.documentElement).appendChild(actions); // dock central, independente da dock de navegação
        getDock().appendChild(main); // botão de seleção entra na dock
    }

    function injectSavedTools() {
        if (!isListingPage()) {
            if (!document.querySelector(".rx-lfab-main")) return; // nada montado aqui → sai barato
            document.querySelectorAll(".rx-lfab-main, .rx-lfab-actions, .rx-select-overlay").forEach((n) => n.remove());
            document.documentElement.classList.remove("rx-selmode");
            rxSel.clear();
            return;
        }
        buildListingsFab();
        // scroll infinito: redecora artigos novos; se "select all" fixo, já entram selecionados
        if (document.documentElement.classList.contains("rx-selmode")) {
            let changed = false;
            allPosts().forEach((a) => {
                decorateArticle(a, true);
                if (rxSelectAll) {
                    const id = a.getAttribute("data-post-id");
                    if (id && !rxSel.has(id)) { rxSel.add(id); a.classList.add("rx-selected"); changed = true; }
                }
            });
            if (changed) updateFabUI();
        }
    }

    // Toast curtinho (feedback do "Link copiado").
    let rxToastEl, rxToastTimer;
    function toast(msg) {
        if (!rxToastEl) {
            rxToastEl = el("div", { className: "rx-toast" });
            (document.body || document.documentElement).appendChild(rxToastEl);
        }
        rxToastEl.textContent = msg;
        rxToastEl.classList.add("rx-toast-show");
        clearTimeout(rxToastTimer);
        rxToastTimer = setTimeout(() => rxToastEl.classList.remove("rx-toast-show"), 1600);
    }

    // Remove só os params de tracking de links do Reddit (NÃO a query inteira — senão quebra a assinatura s= de preview.redd.it).
    const RX_TRACK_PARAMS = ["utm_source", "utm_medium", "utm_campaign", "utm_name", "utm_term", "utm_content", "share_id", "$deep_link", "correlation_id", "ref", "ref_source", "ref_campaign", "$3p", "_branch_match_id", "rdt", "chainedPosts"];
    function stripTrackers(text) {
        try {
            const u = new URL(text);
            if (/(^|\.)reddit\.com$/i.test(u.hostname) || /(^|\.)redd\.it$/i.test(u.hostname)) {
                RX_TRACK_PARAMS.forEach((p) => u.searchParams.delete(p));
                return u.toString();
            }
        } catch (e) {}
        return text;
    }

    // Cópia compartilhada (clipboard API + fallback execCommand p/ contexto inseguro), onDone roda no fim
    // (sucesso OU falha). Passa por navigator.clipboard.writeText → ainda pega o patch de stripTrackers acima.
    function copyText(text, onDone) {
        if (navigator.clipboard && navigator.clipboard.writeText) { navigator.clipboard.writeText(text).then(onDone, onDone); return; }
        const t = el("textarea", { style: { position: "fixed", opacity: "0" } });
        t.value = text; document.body.appendChild(t); t.select();
        try { document.execCommand("copy"); } catch (x) {}
        t.remove();
        if (onDone) onDone();
    }
    // Feedback visual num botão de cópia: troca o ícone por ✓ (rx-on) por 1.2s e restaura `restoreIcon`.
    function flashCopied(btn, restoreIcon) {
        btn.replaceChildren(icon(PATH.check, 20)); btn.classList.add("rx-on");
        setTimeout(() => { btn.replaceChildren(icon(restoreIcon, 24)); btn.classList.remove("rx-on"); }, 1200);
    }

    /* ------------------------------------------------------------------ *
     * Micro dock + scroll-to-top
     * ------------------------------------------------------------------ */
    // Bandeja única no canto inferior direito; abriga (por CSS order) scroll-to-top, seleção e config.
    function getDock() {
        let dock = document.querySelector(".rx-dock");
        if (!dock && document.body) {
            dock = el("div", { className: "rx-dock" });
            document.body.appendChild(dock);
        }
        return dock;
    }

    // Cria/remove o botão de voltar ao topo conforme o setting. A visibilidade (scroll) é do listener.
    // Fora do refresh: a dock é child do <body> e o SPA do Reddit não a recria.
    function applyScrollTop() {
        if (!settings.scrollTop) {
            if (rxScrollBtn) { rxScrollBtn.remove(); rxScrollBtn = null; rxScrollShown = false; }
            return;
        }
        if (rxScrollBtn || !document.body) return;
        rxScrollBtn = el(
            "button",
            { className: "rx-scrolltop rx-dock-btn", type: "button", title: "Scroll to top", "aria-label": "Scroll to top", onClick: () => window.scrollTo({ top: 0, behavior: "smooth" }) },
            icon(PATH.top),
        );
        getDock().appendChild(rxScrollBtn);
        rxScrollShown = false;
        updateScrollBtn(); // estado inicial (caso a página já esteja rolada)
    }

    // Toggle barato: só escreve a classe quando o estado muda (sem thrash de classe a cada scroll).
    function updateScrollBtn() {
        rxScrollTick = false;
        if (!rxScrollBtn) return;
        const show = window.scrollY > 400;
        if (show === rxScrollShown) return;
        rxScrollShown = show;
        rxScrollBtn.classList.toggle("rx-show", show);
    }

    /* ------------------------------------------------------------------ *
     * Feed: filtro (palavra/subreddit) + unblur NSFW (shadow). Recomendações são CSS puro.
     * ------------------------------------------------------------------ */
    function hashStr(s) { let h = 0; for (let i = 0; i < s.length; i++) h = (Math.imul(h, 31) + s.charCodeAt(i)) | 0; return h.toString(36); }

    // Esconde posts cujo subreddit (linha "r/...") ou título (palavra) batem na blocklist.
    // Lê atributos do <shreddit-post> (light DOM, sem shadow). Pula nó já decidido pra a lista atual (sig).
    let filterApplied = false;
    function applyFilter() {
        const list = (settings.filterList || "").trim();
        if (!settings.filterEnabled || !list) {
            if (!filterApplied) return; // off e nada aplicado → zero varredura por refresh
            document.querySelectorAll("article.rx-filtered").forEach((a) => a.classList.remove("rx-filtered"));
            document.querySelectorAll("article[data-rx-filt]").forEach((a) => delete a.dataset.rxFilt);
            filterApplied = false;
            return;
        }
        filterApplied = true;
        const sig = hashStr(list);
        const subs = new Set(), words = [];
        list.split("\n").forEach((raw) => {
            const t = raw.trim().toLowerCase();
            if (!t) return;
            if (t.startsWith("r/")) subs.add(t);
            else words.push(t);
        });
        allPosts().forEach((article) => {
            if (article.dataset.rxFilt === sig) return; // já avaliado pra essa lista
            const sp = article.querySelector("shreddit-post") || article;
            const title = (sp.getAttribute("post-title") || article.getAttribute("aria-label") || "").toLowerCase();
            const sub = (sp.getAttribute("subreddit-prefixed-name") || "").toLowerCase();
            const hit = (!!sub && subs.has(sub)) || words.some((w) => title.includes(w));
            article.classList.toggle("rx-filtered", hit);
            article.dataset.rxFilt = sig;
        });
    }
    const reFilter = debounce(() => { save(); applyFilter(); }, 300);

    // Unblur: o <shreddit-blurred-container> blura DENTRO do shadow root (CSS do documento não alcança),
    // então injetamos um <style> lá. Classes light DOM (.blurred etc.) já caem no CSS html.rx-nsfwUnblur.
    function applyUnblur() {
        if (!settings.nsfwUnblur) return; // bail imediato quando off
        document.querySelectorAll("shreddit-blurred-container:not([data-rx-unblur])").forEach((c) => {
            c.dataset.rxUnblur = "1";
            const sr = c.shadowRoot;
            if (sr && !sr.getElementById("rx-unblur-css")) {
                const st = document.createElement("style");
                st.id = "rx-unblur-css";
                st.textContent = "*{filter:none!important;-webkit-filter:none!important}";
                sr.appendChild(st);
            }
        });
    }

    // Mature content bypass: o prompt "open in app / 18+" fica no SHADOW de xpromo-nsfw-blocking-container (CSS não alcança).
    // Removemos só o div.prompt (mantém o conteúdo) + tiramos o modal de tela cheia e destravamos o scroll.
    function applyMatureBypass() {
        if (!settings.matureBypass) return; // bail barato
        // só varre containers AINDA não tratados; marca um só quando achou+removeu o prompt (não antes,
        // senão pularia um prompt que carregou depois). Evita re-entrar no shadow de cada um a cada refresh.
        document.querySelectorAll("xpromo-nsfw-blocking-container:not([data-rx-mature])").forEach((c) => {
            const sr = c.shadowRoot; if (!sr) return;
            const prompts = sr.querySelectorAll("div.prompt");
            if (prompts.length) { prompts.forEach((p) => p.remove()); c.dataset.rxMature = "1"; }
        });
        const modal = document.querySelector("xpromo-nsfw-blocking-modal-desktop, .configured-xpromo-modal, #nsfw-qr-dialog, shreddit-async-loader[bundlename*='nsfw_blocking_modal']");
        if (modal) {
            modal.remove();
            // destrava o scroll só se NÃO houver overlay nosso aberto (rx-tok/rx-lb/sheet travam o body de
            // propósito) e só quando ainda não está "auto" (evita escrita = mutação re-disparando o refresh).
            if (document.body && document.body.style.overflow !== "auto" && !document.querySelector(".rx-tok, .rx-lb, .rx-sheet, .rx-search")) document.body.style.overflow = "auto";
        }
    }
    // Remove a auto-tradução do Reddit: tira o ?tl= da URL (e recarrega) — roda 1x no boot.
    function applyNoTranslate() {
        if (!settings.noTranslate) return;
        try {
            const u = new URL(location.href);
            if (u.searchParams.has("tl")) { u.searchParams.delete("tl"); location.replace(u.toString()); }
        } catch (e) {}
    }

    /* ------------------------------------------------------------------ *
     * TikTok overlay — player full-screen percorrendo a mídia dos posts (lazy + scroll-snap).
     * Botão na micro dock (ensureStoryBtn) chama openTok().
     * ------------------------------------------------------------------ */
    let rxTokOpen = false, rxTokScrollY = 0, rxTokLoading = false, rxTokObs = null, rxTokVidObs = null, rxTokHushTimer = null;
    let rxTokWheelLock = false, rxTokWheelIdle = null, rxTokTouchY = null, rxTokActiveSlide = null, rxTokActiveV = null, rxTokRaf = null, rxTokIdx = -1, rxTokEnded = false;
    let rxTokGalLock = false, rxTokGalIdle = null, rxTokTouchX = null, rxTokTouchT = null; // galeria: 1 imagem por gesto (h) + alvo do toque
    const rxTokSeen = new Set();
    const rxTokHls = []; // instâncias hls.js ativas → destruídas ao fechar
    const rxTokBlobs = []; // objectURLs (blobs do redgifs no overlay) → revogados ao fechar
    const rxRgBlobs = []; // {url,video} dos blobs do player inline — LRU (cap 14) p/ não vazar memória em feeds longos
    let rxTokMuted = (() => { try { return localStorage.getItem("rx-tok-muted") !== "0"; } catch (e) { return true; } })(); // mute GLOBAL (default mudo p/ autoplay; persiste)
    let rxTokVol = (() => { try { const v = parseFloat(localStorage.getItem("rx-tok-vol")); return isFinite(v) ? Math.min(1, Math.max(0, v)) : 1; } catch (e) { return 1; } })(); // volume GLOBAL persistido
    let rxTokAudioCtx = null; // AudioContext compartilhado (normalização de loudness)
    const CHEV_L = "M12.5 2.1a.898.898 0 01.636 1.536L6.773 10l6.363 6.364a.898.898 0 010 1.272.898.898 0 01-1.272 0l-7-7a.898.898 0 010-1.272l7-7A.897.897 0 0112.5 2.1z";
    const CHEV_R = "M7.5 17.9a.898.898 0 01-.636-1.536L13.227 10 6.864 3.636a.898.898 0 010-1.272.898.898 0 011.272 0l7 7a.898.898 0 010 1.272l-7 7a.897.897 0 01-.636.264z";
    const CHEV_U = "M17.9 12.5a.898.898 0 01-1.536.636L10 6.773l-6.364 6.363a.898.898 0 01-1.272-1.272l7-7a.898.898 0 011.272 0l7 7a.897.897 0 01.264.636z";
    const CHEV_D = "M2.1 7.5a.898.898 0 011.536-.636L10 13.227l6.364-6.363a.898.898 0 011.272 1.272l-7 7a.898.898 0 01-1.272 0l-7-7A.897.897 0 012.1 7.5z";

    // maior URL do img (cobre lazy-load das galerias: data-lazy-src/srcset)
    const bestSrc = (img) => { const ss = img.getAttribute("srcset") || img.getAttribute("data-lazy-srcset") || ""; if (ss) { const last = ss.split(",").map((p) => p.trim().split(/\s+/)[0]).filter(Boolean).pop(); if (last) return last; } return img.getAttribute("src") || img.getAttribute("data-lazy-src") || ""; };
    const fmtNum = (n) => (n >= 1e6 ? (n / 1e6).toFixed(1).replace(/\.0$/, "") + "M" : n >= 1e3 ? (n / 1e3).toFixed(1).replace(/\.0$/, "") + "K" : "" + n);
    const rgIdFrom = (s) => { const m = (s || "").match(/redgifs\.com\/(?:ifr|watch|gifs|i)\/([A-Za-z0-9]+)/i); return m ? m[1] : null; };
    const ytIdFrom = (s) => { const m = (s || "").match(/(?:youtu\.be\/|youtube(?:-nocookie)?\.com\/(?:embed\/|shorts\/|live\/|v\/|watch\?(?:[^&]*&)*v=))([\w-]{11})/i); return m ? m[1] : null; };
    // link DIRETO da imagem: decodifica o wrapper reddit.com/media?url=<encoded> → a URL real (preview.redd.it/…)
    const directImg = (u) => { if (!u) return u; const m = u.match(/[?&]url=([^&]+)/); if (m && /reddit\.com\/media/i.test(u)) { try { return decodeURIComponent(m[1]); } catch (e) {} } return u; };
    // imagem ORIGINAL (sem o preview deles): preview.redd.it/…-<id>.jpg?… → i.redd.it/<id>.jpg (último segmento do path, sem query)
    const rawImg = (u) => {
        u = directImg(u);
        try { const url = new URL(u, location.href); if (/(^|\.)preview\.redd\.it$/i.test(url.hostname) && !/external-preview/i.test(url.hostname)) { const last = url.pathname.split("-").pop().replace(/^\//, ""); if (last) return "https://i.redd.it/" + last; } } catch (e) {}
        return u;
    };
    const posterFromArticle = (article) => { const i = article.querySelector("img.preview-img, img[alt^='r/'], zoomable-img img, img"); return i ? bestSrc(i) : ""; };

    // Melhor mídia do post. Ordem: imagem direta > galeria > vídeo do Reddit (HLS + mp4 preview) > embed (redgifs) > preview no card.
    function postMedia(article) {
        const sp = article.querySelector("shreddit-post") || article;
        const href = sp.getAttribute("content-href") || "";
        if (/\.(jpe?g|png|webp|gif)(\?|$)/i.test(href)) return { kind: "img", src: href };
        { const rid = rgIdFrom(href); if (rid) return { kind: "redgifs", id: rid, poster: posterFromArticle(article) }; } // redgifs pelo link do post
        { const yt = ytIdFrom(href); if (yt) return { kind: "youtube", id: yt }; } // youtube pelo link do post
        // galeria: detecta pelo ELEMENTO gallery-carousel (não só post-type) → cobre CROSSPOST (post-type="crosspost")
        if (sp.getAttribute("post-type") === "gallery" || article.querySelector("gallery-carousel")) {
            const srcs = galleryImgSrcs(article.querySelectorAll("gallery-carousel img, li img, figure img, img.media-lightbox-img"));
            if (srcs.length > 1) return { kind: "gallery", srcs };
            if (srcs.length === 1) return { kind: "img", src: srcs[0] };
        }
        // vídeo do Reddit: shreddit-player tem src (HLS m3u8), preview (mp4 que toca no Chrome) e poster
        const player = article.querySelector("shreddit-player, shreddit-player-2");
        if (player) {
            const hls = player.getAttribute("src") || "", mp4 = player.getAttribute("preview") || "";
            if (hls || mp4) return { kind: "video", hls, mp4, poster: player.getAttribute("poster") || "" };
        }
        // embed externo: shreddit-embed[html] contém o <iframe src="…">. Redgifs→vídeo nativo, YouTube→embed limpo, resto→iframe.
        const embed = article.querySelector("shreddit-embed");
        if (embed) {
            const html = embed.getAttribute("html") || "";
            const m = html.match(/src=["']([^"']+)["']/i);
            if (m) {
                const rid = rgIdFrom(m[1]); if (rid) return { kind: "redgifs", id: rid, poster: posterFromArticle(article) };
                const yt = ytIdFrom(m[1]) || ytIdFrom(html); if (yt) return { kind: "youtube", id: yt };
                return { kind: "iframe", src: m[1] };
            }
        }
        // mp4 direto (raro)
        const v = article.querySelector("video[src]");
        if (v && /^https?:.*\.mp4/i.test(v.getAttribute("src") || "")) return { kind: "video", mp4: v.getAttribute("src"), poster: v.getAttribute("poster") || "" };
        // imagem (preview no card) — maior do srcset, evitando bg borrado/thumbnail
        const img = article.querySelector("img.preview-img, .media-lightbox-img img:not(.post-background-image-filter), zoomable-img img, img[alt^='r/']");
        if (img) { const s = bestSrc(img); if (s) return { kind: "img", src: s }; }
        return null;
    }

    // silencia os players do fundo enquanto o overlay está aberto (Reddit lembra "unmute"; e o player inline de redgifs)
    function tokHushBackground() {
        document.querySelectorAll("shreddit-player").forEach((p) => {
            if (p.closest(".rx-tok")) return; // não mexe nos players movidos pro overlay
            const v = p.shadowRoot && p.shadowRoot.querySelector("video");
            if (v) { v.muted = true; try { v.pause(); } catch (e) {} }
        });
        document.querySelectorAll("video.rx-rg-v").forEach((v) => { v.muted = true; }); // player inline de redgifs → sem áudio atrás do overlay
    }

    const tokVideoEl = (mediaEl) => (mediaEl && mediaEl.tagName === "VIDEO" ? mediaEl : null);
    const tokAllVideos = (track) => [...track.querySelectorAll("video.rx-tok-media")];

    // ---- Redgifs nativo (exclusivo do Reddit): pega o mp4 direto da API e toca num <video> nosso (sem iframe). ----
    // A API do redgifs bloqueia CORS de outra origem → usa GM_xmlhttpRequest (precisa do @grant + @connect).
    const GMX = (typeof GM_xmlhttpRequest !== "undefined") ? GM_xmlhttpRequest : (typeof GM !== "undefined" && GM.xmlHttpRequest ? GM.xmlHttpRequest.bind(GM) : null);
    function gmGetJSON(url, headers) {
        return new Promise((resolve, reject) => {
            if (!GMX) { reject(new Error("no GM_xmlhttpRequest")); return; }
            GMX({ method: "GET", url, headers: headers || {}, timeout: 12000,
                onload: (r) => { if (r.status >= 200 && r.status < 300) { try { resolve(JSON.parse(r.responseText)); } catch (e) { reject(e); } } else reject(new Error("HTTP " + r.status)); },
                onerror: () => reject(new Error("neterror")), ontimeout: () => reject(new Error("timeout")) });
        });
    }
    let rxRgToken = null, rxRgTokenAt = 0;
    async function rgToken() {
        if (rxRgToken && (Date.now() - rxRgTokenAt) < 3e6) return rxRgToken; // token temporário (~reuso 50min)
        const j = await gmGetJSON("https://api.redgifs.com/v2/auth/temporary");
        rxRgToken = j && j.token; rxRgTokenAt = Date.now();
        if (!rxRgToken) throw new Error("no token");
        return rxRgToken;
    }
    const rxRgCache = new Map();
    async function rgVideo(id) {
        const key = id.toLowerCase();
        if (rxRgCache.has(key)) return rxRgCache.get(key);
        const tok = await rgToken();
        const j = await gmGetJSON("https://api.redgifs.com/v2/gifs/" + key, { Authorization: "Bearer " + tok });
        const u = j && j.gif && j.gif.urls;
        if (!u || !(u.hd || u.sd)) throw new Error("no urls");
        const out = { hd: u.hd || u.sd, sd: u.sd || u.hd, poster: u.poster || u.thumbnail || "", w: (j.gif && j.gif.width) || 0, h: (j.gif && j.gif.height) || 0 };
        rxRgCache.set(key, out);
        return out;
    }
    // escolhe a URL por qualidade: HD (padrão) ou SD quando "RedGifs HD" está off (mais leve em net lenta).
    // O cache guarda as duas, então o toggle vale pros próximos loads sem refazer a request.
    const rgPickUrl = (r) => (settings.redgifsHd === false ? r.sd : r.hd);
    // baixa o mp4 via GM (forjando Referer redgifs) → fura o hotlink/CORS do media.redgifs.com (o <video> direto dá tela preta)
    function rgBlob(url) {
        return new Promise((resolve, reject) => {
            if (!GMX) { reject(new Error("no GMX")); return; }
            GMX({ method: "GET", url, responseType: "blob", timeout: 30000, headers: { Referer: "https://www.redgifs.com/", Origin: "https://www.redgifs.com" },
                onload: (r) => { if (r.status >= 200 && r.status < 300 && r.response) resolve(r.response); else reject(new Error("HTTP " + r.status)); },
                onerror: () => reject(new Error("neterror")), ontimeout: () => reject(new Error("timeout")) });
        });
    }
    // Poster do redgifs: media.redgifs.com BLOQUEIA o Referer do reddit (403) e <video referrerpolicy> não é honrado p/ o poster
    // → o atributo `poster=…media.redgifs.com…` carrega vazio (quadro preto até o vídeo tocar). Busca via GM (referer redgifs → 200),
    // usa objectURL e revoga quando o vídeo já tem frame próprio (loadeddata). Fire-and-forget: não atrasa o mp4.
    function rgSetPoster(video, posterUrl) {
        if (!posterUrl) return;
        rgBlob(posterUrl).then((b) => {
            if (!video.isConnected) return; // sumiu (falha/eviction) → não cria objectURL à toa
            const u = URL.createObjectURL(b);
            video.poster = u;
            video.addEventListener("loadeddata", () => { try { URL.revokeObjectURL(u); } catch (e) {} }, { once: true });
        }).catch(() => {}); // poster é cosmético → ignora falha
    }
    // carrega o redgifs do slide (lazy, no foco): API → mp4 → blob → objectURL. Mostra spinner; toca se ainda for o slide ativo.
    async function rgLoad(video) {
        if (!video || video.dataset.rgLoaded || !video.dataset.rgid) return;
        video.dataset.rgLoaded = "1";
        const slide = video.closest(".rx-tok-slide");
        if (slide) slide.classList.add("rx-tok-loading");
        try {
            const r = await rgVideo(video.dataset.rgid);
            rgSetPoster(video, r.poster);
            const src = rgPickUrl(r);
            let url = src;
            try { const blob = await rgBlob(src); url = URL.createObjectURL(blob); rxTokBlobs.push(url); video._rxNorm = true; } // blob = mesma origem → pode normalizar
            catch (e) { video.referrerPolicy = "no-referrer"; } // blob falhou → tenta o mp4 direto (no-referrer, sem normalização)
            video.src = url;
            if (slide) slide.classList.remove("rx-tok-loading");
            if (rxTokActiveSlide === slide) { video.muted = rxTokMuted; video.play().catch(() => { video.muted = true; video.play().catch(() => {}); }); }
        } catch (e) {
            if (slide) { slide.classList.remove("rx-tok-loading"); slide.classList.add("rx-tok-rgfail"); }
            video.dataset.rgLoaded = ""; // permite retry no próximo foco
            console.warn("[rx-tok] redgifs falhou:", video.dataset.rgid, e && e.message);
        }
    }

    /* ------------------------------------------------------------------ *
     * Player de RedGifs INLINE — substitui o iframe do redgifs em TODO o site (reaproveita rgVideo/rgBlob).
     * embed-IO: constrói perto da viewport. video-IO: autoplay mudo em vista / pausa fora + carrega o blob lazy.
     * ------------------------------------------------------------------ */
    let rxRgVidIO = null, rxRgEmbedIO = null;
    function rgVidIO() {
        if (rxRgVidIO) return rxRgVidIO;
        rxRgVidIO = new IntersectionObserver((es) => es.forEach((e) => {
            const v = e.target;
            if (e.isIntersecting && e.intersectionRatio >= 0.45) { if (!v.dataset.rgLoaded) rgInlineLoad(v); else { const p = v.play(); if (p && p.catch) p.catch(() => {}); } }
            else { try { v.pause(); } catch (x) {} }
        }), { threshold: [0, 0.45] });
        return rxRgVidIO;
    }
    function rgInlineSolo(video) { document.querySelectorAll("video.rx-rg-v").forEach((o) => { if (o !== video) o.muted = true; }); } // só um com áudio
    async function rgInlineLoad(video) {
        if (!video || video.dataset.rgLoaded || !video.dataset.rgid) return;
        video.dataset.rgLoaded = "1";
        const wrap = video.closest(".rx-rg");
        if (wrap) wrap.classList.add("rx-rg-loading");
        try {
            const r = await rgVideo(video.dataset.rgid);
            rgSetPoster(video, r.poster);
            const src = rgPickUrl(r);
            let url = src;
            try {
                const blob = await rgBlob(src); url = URL.createObjectURL(blob); video._rxNorm = true;
                rxRgBlobs.push({ url, video });
                // LRU: libera blobs antigos (recarregam ao voltar). PULA vídeo ainda em/perto da viewport — senão
                // rolar >14 redgifs e voltar despejaria o clipe que você está assistindo (piscava/recarregava).
                // Re-enfileira o visível e tenta o próximo; o contador `scan` (≤ length) evita loop se TODOS visíveis.
                let scan = rxRgBlobs.length;
                while (rxRgBlobs.length > 14 && scan-- > 0) {
                    const old = rxRgBlobs.shift();
                    const ov = old.video;
                    if (ov && ov !== video) {
                        const r = ov.getBoundingClientRect();
                        if (r.bottom > -200 && r.top < (window.innerHeight || 0) + 200) { rxRgBlobs.push(old); continue; } // visível → mantém
                    }
                    try { URL.revokeObjectURL(old.url); } catch (x) {}
                    if (ov && ov !== video) { try { ov.pause(); } catch (x) {} ov.removeAttribute("src"); ov.load(); ov.dataset.rgLoaded = ""; }
                }
            } catch (e) { video.referrerPolicy = "no-referrer"; } // blob falhou → mp4 direto (no-referrer)
            video.src = url;
            // mantém a ALTURA NATIVA do embed (já é a certa p/ vertical/horizontal); object-fit:contain encaixa o vídeo.
            // NÃO setar aspect-ratio aqui: em vídeo vertical virava largura100%×proporção = bloco gigante (quebrava).
            if (wrap) wrap.classList.remove("rx-rg-loading");
            const rect = video.getBoundingClientRect();
            if (rect.bottom > 0 && rect.top < (window.innerHeight || 0)) { const p = video.play(); if (p && p.catch) p.catch(() => {}); } // ainda em vista → toca
        } catch (e) {
            console.warn("[rx-rg] redgifs inline falhou (restaurando embed):", video.dataset.rgid, e && e.message);
            if (wrap) { const emb = wrap._rxEmbed; if (emb) emb.style.display = ""; wrap.remove(); } // falhou → volta o embed nativo do redgifs
        }
    }
    // mesmos controles/visual do overlay (flat): flash ▶, barra de progresso, volume (mute+flyout), fullscreen
    // Botão HD/SD direto no player do RedGifs (overlay story + inline): alterna o setting redgifsHd e
    // RECARREGA o vídeo atual na nova qualidade (o cache já tem as duas urls, só refaz o blob).
    function rgReload(video) {
        if (!video || !video.dataset.rgid) return;
        video.dataset.rgLoaded = ""; // libera pra recarregar
        try { video.pause(); } catch (e) {}
        video.removeAttribute("src"); video.load();
        if (video.classList.contains("rx-rg-v")) rgInlineLoad(video); else rgLoad(video);
    }
    function rgSyncQ() { document.querySelectorAll(".rx-rg-q").forEach((b) => { b.textContent = settings.redgifsHd === false ? "SD" : "HD"; }); }
    function rgQualityBtn(video) {
        const btn = el("button", { className: "rx-tok-act rx-rg-q", type: "button", title: "Quality (HD/SD)", "aria-label": "Quality" }, settings.redgifsHd === false ? "SD" : "HD");
        btn.addEventListener("click", (e) => {
            e.preventDefault(); e.stopPropagation();
            settings.redgifsHd = settings.redgifsHd === false; // toggle SD↔HD
            save();
            rgSyncQ();      // atualiza todos os botões na tela
            rgReload(video); // recarrega este vídeo já na nova qualidade
        });
        return btn;
    }

    function rgInlineControls(wrap, video) {
        wrap.appendChild(video);
        wrap.appendChild(el("div", { className: "rx-tok-vflash" }, icon(PATH.playFill, 24)));
        video.addEventListener("click", () => { if (video.paused) { const p = video.play(); if (p && p.catch) p.catch(() => {}); } else video.pause(); });
        video.addEventListener("play", () => { wrap.classList.remove("rx-rg-paused"); if (!video.muted) rgInlineSolo(video); });
        video.addEventListener("pause", () => { wrap.classList.add("rx-rg-paused"); });
        // barra de progresso — classes do overlay
        const fill = el("div", { className: "rx-tok-vfill" });
        const bar = el("div", { className: "rx-tok-vbar" }, fill);
        const prog = el("div", { className: "rx-tok-vprog" }, bar);
        prog.addEventListener("click", (e) => { e.stopPropagation(); if (!video.duration) return; const rr = bar.getBoundingClientRect(); video.currentTime = Math.max(0, Math.min(1, (e.clientX - rr.left) / rr.width)) * video.duration; });
        video.addEventListener("timeupdate", () => { if (video.duration) fill.style.width = (video.currentTime / video.duration * 100) + "%"; });
        wrap.appendChild(prog);
        // volume (mute global persistido + flyout horizontal) — classes do overlay
        const mute = el("button", { className: "rx-tok-act rx-tok-mute", type: "button", title: "Mute/unmute", "aria-label": "Mute/unmute" }, icon(video.muted ? PATH.volumeOff : PATH.volumeOn, 24));
        const slider = el("input", { className: "rx-tok-vol", type: "range", min: "0", max: "1", step: "0.01", "aria-label": "Volume" });
        const syncVol = () => { const v = video.muted ? 0 : video.volume; slider.value = v; slider.style.setProperty("--val", v * 100 + "%"); mute.replaceChildren(icon(video.muted ? PATH.volumeOff : PATH.volumeOn, 24)); };
        const persistVol = (val) => { rxTokVol = val; try { localStorage.setItem("rx-tok-vol", String(val)); } catch (x) {} };
        mute.addEventListener("click", (e) => { e.preventDefault(); e.stopPropagation(); tokAudioContext(); video.muted = !video.muted; if (!video.muted) { if (video.volume === 0) { video.volume = rxTokVol || 1; } tokNormalize(video); rgInlineSolo(video); const p = video.play(); if (p && p.catch) p.catch(() => {}); } syncVol(); });
        slider.addEventListener("input", (e) => { e.stopPropagation(); const val = parseFloat(slider.value); video.volume = val; video.muted = val === 0; persistVol(val); if (val > 0) { tokAudioContext(); tokNormalize(video); rgInlineSolo(video); } syncVol(); });
        ["click", "pointerdown", "mousedown"].forEach((ev) => slider.addEventListener(ev, (e) => e.stopPropagation()));
        video.addEventListener("volumechange", syncVol);
        const volwrap = el("div", { className: "rx-tok-volwrap" }, el("div", { className: "rx-tok-volflyout" }, slider), mute);
        // copiar o link direto do RedGifs + abrir numa nova guia (link original)
        const watchUrl = "https://www.redgifs.com/watch/" + video.dataset.rgid;
        const copy = el("button", { className: "rx-tok-act", type: "button", title: "Copiar link do RedGifs", "aria-label": "Copy RedGifs link" }, icon(PATH.copy, 24));
        copy.addEventListener("click", (e) => {
            e.preventDefault(); e.stopPropagation();
            copyText(watchUrl, () => flashCopied(copy, PATH.copy));
        });
        const open = el("a", { className: "rx-tok-act", href: watchUrl, target: "_blank", rel: "noopener", title: "Abrir no RedGifs", "aria-label": "Open on RedGifs" }, icon(PATH.external, 24));
        open.addEventListener("click", (e) => e.stopPropagation());
        const fs = el("button", { className: "rx-tok-act", type: "button", title: "Fullscreen", "aria-label": "Fullscreen" }, icon(PATH.expand, 24));
        fs.addEventListener("click", (e) => { e.preventDefault(); e.stopPropagation(); try { document.fullscreenElement ? document.exitFullscreen() : wrap.requestFullscreen(); } catch (x) {} });
        wrap.appendChild(el("div", { className: "rx-rg-ctl" }, volwrap, rgQualityBtn(video), copy, open, fs));
        setTimeout(syncVol, 200);
    }
    function rgProcessEmbed(embed, tries) {
        if (!embed || embed.dataset.rxRg === "done" || !settings.redgifsPlayer) return;
        const id = rgIdFrom(embed.getAttribute("html") || "");
        if (!id) { embed.dataset.rxRg = "skip"; return; }
        // o iframe do redgifs costuma estar no shadow DOM do shreddit-embed (inacessível) → escondemos o EMBED inteiro
        // e medimos por ele (tem aspect-ratio reservado). Bem mais robusto que caçar o iframe.
        const h = embed.offsetHeight;
        if (!h && (tries || 0) < 8) { setTimeout(() => rgProcessEmbed(embed, (tries || 0) + 1), 300); return; } // sem layout → espera; depois segue com fallback
        embed.dataset.rxRg = "done";
        if (rxRgEmbedIO) rxRgEmbedIO.unobserve(embed);
        const wrap = el("div", { className: "rx-rg" });
        wrap.style.height = (h || 360) + "px"; // placeholder até a API dar o aspecto real
        const video = el("video", { className: "rx-rg-v", loop: "", playsinline: "", preload: "none" });
        video.muted = true; video.volume = rxTokVol; video.dataset.rgid = id;
        rgInlineControls(wrap, video);
        wrap._rxEmbed = embed; // guardado p/ restaurar na falha
        embed.style.display = "none";
        embed.parentNode.insertBefore(wrap, embed);
        rgVidIO().observe(video);
        rgInlineLoad(video); // carrega o blob JÁ (perto da viewport) → sem delay ao chegar; o vídeo-IO só dá play quando visível
    }
    // Enfileira os embeds de redgifs (barato) — a embed-IO constrói o player quando chegam perto da viewport.
    function applyRedgifsInline() {
        if (!settings.redgifsPlayer) return;
        const embeds = document.querySelectorAll("shreddit-embed:not([data-rx-rg])");
        if (!embeds.length) return;
        if (!rxRgEmbedIO) rxRgEmbedIO = new IntersectionObserver((es) => es.forEach((e) => { if (e.isIntersecting) rgProcessEmbed(e.target, 0); }), { rootMargin: "1000px" });
        embeds.forEach((embed) => {
            if (!rgIdFrom(embed.getAttribute("html") || "")) { embed.dataset.rxRg = "skip"; return; }
            embed.dataset.rxRg = "queued";
            rxRgEmbedIO.observe(embed);
        });
    }

    /* ------------------------------------------------------------------ *
     * Galeria INLINE (site inteiro): troca o <gallery-carousel> nativo pela nossa (faixa + barra ‹ 2/5 › + 1-por-gesto).
     * ------------------------------------------------------------------ */
    let rxGalIO = null;
    // Dedup das melhores srcs de imagem de uma galeria: descarta o filtro de fundo, pega a maior versão
    // (bestSrc) e fica só com mídia real do Reddit (ignora os thumbs de 140px). Usado por postMedia e galImgs.
    function galleryImgSrcs(imgs) {
        return [...new Set([...imgs]
            .filter((i) => !i.classList.contains("post-background-image-filter"))
            .map(bestSrc).filter((s) => s && /(redd\.it|redditmedia)/.test(s) && !/(width|height)=140\b/.test(s)))];
    }
    function galImgs(gal) {
        return galleryImgSrcs(gal.querySelectorAll("img"));
    }
    function galProcess(gal, tries) {
        if (!gal || gal.dataset.rxGal === "done" || !settings.galleryPlayer) return;
        const srcs = galImgs(gal);
        if (srcs.length < 2) { if ((tries || 0) < 8) setTimeout(() => galProcess(gal, (tries || 0) + 1), 300); else gal.dataset.rxGal = "skip"; return; } // lazy ainda não montou as imgs
        const h = gal.offsetHeight, w = gal.offsetWidth;
        if (!h || !w) { if ((tries || 0) < 8) setTimeout(() => galProcess(gal, (tries || 0) + 1), 300); return; }
        gal.dataset.rxGal = "done";
        if (rxGalIO) rxGalIO.unobserve(gal);
        const wrap = el("div", { className: "rx-rg-galwrap" });
        wrap.style.height = h + "px";
        const gw = buildGallery(srcs); // clique na imagem → nosso lightbox (openLightbox)
        const strip = gw.querySelector(".rx-tok-gallery");
        // galeria inline não tem o wheel-handler do overlay → liga aqui (1 imagem por gesto; vertical deixa a página rolar)
        strip.addEventListener("wheel", (e) => { if (Math.abs(e.deltaX) <= Math.abs(e.deltaY)) return; e.preventDefault(); tokGalWheel(strip, e.deltaX); }, { passive: false });
        let tx = null;
        strip.addEventListener("touchstart", (e) => { tx = e.touches && e.touches[0] ? e.touches[0].clientX : null; }, { passive: true });
        strip.addEventListener("touchend", (e) => { if (tx == null) return; const c = e.changedTouches && e.changedTouches[0]; const dx = tx - (c ? c.clientX : tx); tx = null; if (Math.abs(dx) > 35) tokGalStep(strip, dx > 0 ? 1 : -1); }, { passive: true });
        wrap.appendChild(gw);
        gal.style.display = "none";
        gal.parentNode.insertBefore(wrap, gal);
    }
    function applyGalleryInline() {
        if (!settings.galleryPlayer) return;
        const gals = document.querySelectorAll("gallery-carousel:not([data-rx-gal])");
        if (!gals.length) return;
        if (!rxGalIO) rxGalIO = new IntersectionObserver((es) => es.forEach((e) => { if (e.isIntersecting) galProcess(e.target, 0); }), { rootMargin: "600px" });
        gals.forEach((g) => { g.dataset.rxGal = "queued"; rxGalIO.observe(g); });
    }
    // Imagem individual (site): clique abre o NOSSO lightbox em vez da página /media do Reddit. Listener delegado (capture).
    function rxImgClick(e) {
        if (!settings.imageViewer || e.button || e.ctrlKey || e.metaKey || e.shiftKey || e.altKey) return; // respeita ctrl/cmd-click (abrir em nova guia)
        const img = e.target.closest && e.target.closest("img.media-lightbox-img");
        if (!img || img.closest("gallery-carousel") || img.closest(".rx-lb, .rx-tok, .rx-rg, .rx-rg-galwrap")) return; // pula galeria e nossos overlays
        const src = bestSrc(img);
        if (!src || !/(redd\.it|redditmedia)/.test(src)) return;
        e.preventDefault(); e.stopPropagation();
        openLightbox([src], 0);
    }

    // Carrega o vídeo do Reddit em qualidade MÁXIMA (sem o overlay nativo do player): hls.js travado no nível mais alto.
    function tokAttachVideo(video, media) {
        video.volume = rxTokVol;
        // master canônico do v.redd.it (HLSPlaylist.m3u8 sem query) → lista TODAS as resoluções; a src do player às vezes é sub-playlist (1 nível só)
        let src = media.hls;
        if (src) { const m = src.match(/(https?:\/\/v\.redd\.it\/[A-Za-z0-9]+)\//i); if (m) src = m[1] + "/HLSPlaylist.m3u8"; }
        // PREFERE hls.js (garante _rxHls + a lista de níveis); HLS nativo só como fallback (Safari sem hls.js → sem menu de qualidade)
        if (src && typeof Hls !== "undefined" && Hls.isSupported()) {
            const h = new Hls({ capLevelToPlayerSize: false, autoStartLoad: true });
            h.loadSource(src);
            h.attachMedia(video);
            h.on(Hls.MANIFEST_PARSED, () => { h.autoLevelCapping = -1; if (settings.maxQuality) h.currentLevel = h.levels.length - 1; if (video === rxTokActiveV) { video.muted = rxTokMuted; video.play().catch(() => { video.muted = true; video.play().catch(() => {}); }); } });
            let triedOrig = false;
            h.on(Hls.ERROR, (_e, d) => {
                if (!d || !d.fatal) return;
                if (!triedOrig && media.hls && src !== media.hls) { triedOrig = true; src = media.hls; try { h.loadSource(media.hls); } catch (x) {} return; } // master falhou → src original
                if (media.mp4 && !video.src) video.src = media.mp4; // último recurso
            });
            video._rxHls = h; // ref p/ o menu de qualidade
            video._rxNorm = true; // MSE (hls.js) não é tainted → pode normalizar via Web Audio
            rxTokHls.push(h);
            return;
        }
        if (media.hls && video.canPlayType("application/vnd.apple.mpegurl")) { video.src = media.hls; return; } // Safari nativo
        if (media.mp4) { video.appendChild(el("source", { src: media.mp4, type: "video/mp4" })); return; }
        // Chegou aqui = sem hls.js usável, sem HLS nativo e sem mp4. Tenta a src do hls mesmo assim (caso raro),
        // mas marca o slide pra não virar quadro preto mudo (ex.: o @require do hls.js falhou no mobile).
        if (media.hls) video.src = media.hls;
        const slide = video.closest(".rx-tok-slide");
        if (slide) { slide.classList.remove("rx-tok-loading"); slide.classList.add("rx-tok-vidfail"); }
        if (typeof Hls === "undefined") console.warn("[rx-tok] hls.js indisponível (@require falhou?) — vídeo do Reddit não reproduzível");
    }

    // sincroniza todos os sliders de volume do rail com o estado global (mute mostra 0)
    function tokSyncVolUI() {
        const v = rxTokMuted ? 0 : rxTokVol;
        document.querySelectorAll(".rx-tok-vol").forEach((s) => { s.value = v; s.style.setProperty("--val", v * 100 + "%"); });
    }
    // Mute GLOBAL. Aplica SÓ no vídeo ativo (os outros ficam pausados+mudos) → nunca dois áudios. Persiste.
    function tokSetMuted(on) {
        rxTokMuted = on;
        try { localStorage.setItem("rx-tok-muted", on ? "1" : "0"); } catch (e) {}
        if (!on) tokAudioContext(); // gesto do usuário → libera o AudioContext (normalização)
        const v = rxTokActiveV;
        if (v) { v.muted = on; v.volume = rxTokVol; if (!on) { const p = v.play(); if (p && p.catch) p.catch(() => {}); } } // o play() dispara o listener que muta os outros
        const track = document.querySelector(".rx-tok-track");
        if (track) track.querySelectorAll("iframe.rx-tok-media").forEach((f) => { try { f.contentWindow.postMessage({ type: "rx-tok-mute", muted: on }, "*"); } catch (x) {} });
        document.querySelectorAll(".rx-tok-mute").forEach((b) => { b.replaceChildren(icon(on ? PATH.volumeOff : PATH.volumeOn, 24)); b.classList.toggle("rx-on", !on); });
        tokSyncVolUI();
    }
    // Volume GLOBAL: aplica em todos os vídeos + persiste. Volume > 0 desmuta.
    function tokSetVolume(val) {
        val = Math.min(1, Math.max(0, val));
        rxTokVol = val;
        try { localStorage.setItem("rx-tok-vol", String(val)); } catch (e) {}
        const track = document.querySelector(".rx-tok-track");
        if (track) tokAllVideos(track).forEach((v) => { v.volume = val; });
        if (val > 0 && rxTokMuted) tokSetMuted(false); // mexer no volume desmuta
        else tokSyncVolUI();
    }
    // botão de mute (rail) — todos refletem/controlam o estado global
    function tokMuteBtn() {
        const b = el("button", { className: "rx-tok-act rx-tok-mute" + (rxTokMuted ? "" : " rx-on"), type: "button", title: "Mute/unmute (global)", "aria-label": "Mute/unmute" }, icon(rxTokMuted ? PATH.volumeOff : PATH.volumeOn, 24));
        b.addEventListener("click", (e) => { e.preventDefault(); e.stopPropagation(); tokSetMuted(!rxTokMuted); });
        return b;
    }
    // volume: botão de mute global + slider horizontal (estado GLOBAL, persistido) que abre no hover
    function tokVolWrap() {
        const btn = tokMuteBtn();
        const slider = el("input", { className: "rx-tok-vol", type: "range", min: "0", max: "1", step: "0.01", "aria-label": "Volume" });
        const v0 = rxTokMuted ? 0 : rxTokVol; slider.value = v0; slider.style.setProperty("--val", v0 * 100 + "%");
        slider.addEventListener("input", (e) => { e.stopPropagation(); tokSetVolume(parseFloat(slider.value)); });
        ["click", "pointerdown", "mousedown"].forEach((ev) => slider.addEventListener(ev, (e) => e.stopPropagation()));
        return el("div", { className: "rx-tok-volwrap" }, el("div", { className: "rx-tok-volflyout" }, slider), btn);
    }
    // AudioContext compartilhado p/ normalização; resume() precisa de gesto do usuário
    function tokAudioContext() {
        if (!rxTokAudioCtx) { try { rxTokAudioCtx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { rxTokAudioCtx = null; } }
        if (rxTokAudioCtx && rxTokAudioCtx.state === "suspended") rxTokAudioCtx.resume().catch(() => {});
        return rxTokAudioCtx;
    }
    // Normalização de loudness: compressor + makeup gain. SÓ em fontes não-tainted (hls.js MSE / blob do redgifs),
    // senão o MediaElementSource zera o áudio. video.volume/muted continuam valendo (ficam antes do source node).
    function tokNormalize(video) {
        if (!video || !video._rxNorm || video._rxNormDone) return;
        const ctx = tokAudioContext(); if (!ctx) return;
        try {
            video._rxNormDone = true;
            const src = ctx.createMediaElementSource(video);
            const comp = ctx.createDynamicsCompressor();
            comp.threshold.value = -24; comp.knee.value = 30; comp.ratio.value = 4; comp.attack.value = 0.003; comp.release.value = 0.25;
            const gain = ctx.createGain(); gain.gain.value = 1.2; // makeup leve → nivela sem distorcer
            src.connect(comp); comp.connect(gain); gain.connect(ctx.destination);
        } catch (e) { video._rxNormDone = false; } // já tinha source / tainted → deixa no output padrão
    }
    // botão de qualidade (vídeo via hls.js): menu com os níveis disponíveis + Auto
    function tokQualityBtn(video) {
        const menu = el("div", { className: "rx-tok-qmenu" });
        const wrap = el("div", { className: "rx-tok-qwrap" }, menu, null);
        const btn = el("button", { className: "rx-tok-act", type: "button", title: "Quality", "aria-label": "Quality" }, icon(PATH.quality, 24));
        wrap.appendChild(btn);
        const build = () => {
            const h = video._rxHls;
            menu.replaceChildren();
            if (!h || !h.levels || !h.levels.length) { menu.appendChild(el("button", { type: "button" }, video.videoHeight ? video.videoHeight + "p" : "—")); return; }
            const cur = h.currentLevel;
            const mk = (label, lvl) => { const b = el("button", { type: "button" }, label); if (lvl === cur) b.classList.add("rx-on"); b.addEventListener("click", (ev) => { ev.stopPropagation(); h.currentLevel = lvl; wrap.classList.remove("rx-open"); }); return b; };
            // dedup por altura (o master do Reddit lista a mesma resolução 2x, codecs diferentes) — fica o de maior bitrate
            const seen = new Set();
            h.levels.map((l, i) => ({ l, i }))
                .sort((a, b) => (b.l.height || 0) - (a.l.height || 0) || (b.l.bitrate || 0) - (a.l.bitrate || 0))
                .forEach(({ l, i }) => { const key = l.height || l.bitrate; if (seen.has(key)) return; seen.add(key); menu.appendChild(mk((l.height ? l.height + "p" : Math.round(l.bitrate / 1000) + "k"), i)); });
            menu.appendChild(mk("Auto", -1));
        };
        btn.addEventListener("click", (e) => { e.preventDefault(); e.stopPropagation(); const open = !wrap.classList.contains("rx-open"); document.querySelectorAll(".rx-tok-qwrap.rx-open").forEach((w) => w.classList.remove("rx-open")); if (open) { build(); wrap.classList.add("rx-open"); } });
        return wrap;
    }
    // share: copia o link LIMPO do post (sem ?query)
    function tokShareBtn(postUrl) {
        const clean = (postUrl || "").split("?")[0].split("#")[0];
        const b = el("button", { className: "rx-tok-act", type: "button", title: "Copiar link", "aria-label": "Copy link" }, icon(PATH.share, 24));
        b.addEventListener("click", (e) => {
            e.preventDefault(); e.stopPropagation();
            copyText(clean, () => flashCopied(b, PATH.share));
        });
        return b;
    }
    // Garante 1 vídeo tocando/desmutado por vez (índice = slide no topo do track). Mata o "2 vídeos juntos tocando".
    function tokFocusActive(track) {
        const h = track.clientHeight; if (!h) return;
        const idx = Math.round(track.scrollTop / h);
        if (idx === rxTokIdx && rxTokActiveSlide) return; // mesmo slide → nada a refazer
        rxTokIdx = idx;
        const slides = track.querySelectorAll(".rx-tok-slide");
        const active = slides[idx] || null;
        let activeV = null;
        tokAllVideos(track).forEach((v) => { if (active && active.contains(v)) activeV = v; else { try { v.pause(); } catch (e) {} v.muted = true; } });
        rxTokActiveSlide = active; rxTokActiveV = activeV;
        if (activeV) {
            activeV.muted = rxTokMuted;
            if (activeV.dataset.rgid && !activeV.dataset.rgLoaded) rgLoad(activeV); // redgifs lazy: carrega o blob e toca quando pronto
            else { const p = activeV.play(); if (p && p.catch) p.catch(() => { activeV.muted = true; activeV.play().catch(() => {}); }); }
        }
        const nextV = slides[idx + 1] && slides[idx + 1].querySelector("video[data-rgid]"); // prefetch do próximo redgifs (scroll suave)
        if (nextV && !nextV.dataset.rgLoaded) rgLoad(nextV);
        // youtube (iframe via jsapi): toca o do slide ativo, pausa os outros (senão fica som tocando ao rolar)
        slides.forEach((s, i) => { const yt = s.querySelector("iframe.rx-tok-yt"); if (yt) { try { yt.contentWindow.postMessage('{"event":"command","func":"' + (i === idx ? "playVideo" : "pauseVideo") + '","args":""}', "*"); } catch (e) {} } });
    }
    // núcleo do scroll 1-por-gesto
    function tokWheelCore(deltaY, deltaX, track) {
        if (Math.abs(deltaX) > Math.abs(deltaY)) return;
        if (Math.abs(deltaY) < 2) return;
        clearTimeout(rxTokWheelIdle);
        rxTokWheelIdle = setTimeout(() => { rxTokWheelLock = false; }, 180);
        if (rxTokWheelLock) return;
        rxTokWheelLock = true;
        tokGo(track, deltaY > 0 ? 1 : -1);
    }
    // camada de controles próprios sobre o vídeo: clique = play/pause + barra de progresso (seek)
    function tokAddVideoControls(slide, mediaEl) {
        const flash = el("div", { className: "rx-tok-vflash" }, icon(PATH.playFill, 24));
        const layer = el("div", { className: "rx-tok-vlayer" }, flash);
        layer.addEventListener("click", (e) => {
            const v = tokVideoEl(mediaEl); if (!v) return; e.stopPropagation();
            if (v.paused) { const p = v.play(); if (p && p.catch) p.catch(() => { v.muted = true; v.play().catch(() => {}); }); }
            else v.pause();
            slide.classList.toggle("rx-paused", v.paused);
        });
        const fill = el("div", { className: "rx-tok-vfill" });
        const bar = el("div", { className: "rx-tok-vbar" }, fill);
        const prog = el("div", { className: "rx-tok-vprog" }, bar); // zona de clique alta; a barra visível fica embaixo
        const seek = (clientX) => { const v = tokVideoEl(mediaEl); if (!v || !v.duration) return; const r = bar.getBoundingClientRect(); v.currentTime = Math.max(0, Math.min(1, (clientX - r.left) / r.width)) * v.duration; };
        prog.addEventListener("click", (e) => { e.stopPropagation(); seek(e.clientX); });
        slide.appendChild(layer); slide.appendChild(prog);
    }

    // scroll 1-por-gesto: qualquer wheel/swipe (qualquer força) avança/volta exatamente 1 item, alinhado.
    function tokGo(track, dir) {
        const h = track.clientHeight; if (!h) return;
        const idx = Math.round(track.scrollTop / h);
        track.scrollTo({ top: Math.max(0, idx + dir) * h, behavior: "smooth" });
    }
    // galeria: 1 imagem por gesto (mesma ideia do vertical) — alinhado por índice
    function tokGalStep(gal, dir) {
        const w = gal.clientWidth; if (!w) return;
        const idx = Math.round(gal.scrollLeft / w);
        gal.scrollTo({ left: Math.max(0, idx + dir) * w, behavior: "smooth" });
    }
    function tokGalWheel(gal, deltaX) {
        if (Math.abs(deltaX) < 2) return;
        clearTimeout(rxTokGalIdle);
        rxTokGalIdle = setTimeout(() => { rxTokGalLock = false; }, 180); // destrava quando a inércia para → 1 por gesto
        if (rxTokGalLock) return;
        rxTokGalLock = true;
        tokGalStep(gal, deltaX > 0 ? 1 : -1);
    }
    // Lightbox PRÓPRIO: imagem ocupa o máximo; contador em cima; abrir-direto+fechar no canto sup. direito; ‹ ›/setas/scroll-h.
    let rxLbKey = null;
    function closeLb() { document.querySelector(".rx-lb")?.remove(); if (rxLbKey) { document.removeEventListener("keydown", rxLbKey, true); rxLbKey = null; } }
    function openLightbox(srcs, start) {
        closeLb();
        let idx = start || 0;
        const multi = srcs.length > 1;
        const img = el("img", { className: "rx-lb-img", alt: "" });
        const count = el("span", { className: "rx-lb-count" });
        const openA = el("a", { className: "rx-lb-btn", target: "_blank", rel: "noopener", title: "Abrir imagem (raw)", "aria-label": "Open raw image" }, icon(PATH.external, 24));
        openA.addEventListener("click", (e) => e.stopPropagation());
        const close = el("button", { className: "rx-lb-btn", type: "button", title: "Close (Esc)", "aria-label": "Close", onClick: closeLb }, icon(PATH.close, 20));
        const lb = el("div", { className: "rx-lb", role: "dialog", "aria-label": "Image viewer" }, img);
        const ZOOMS = [1, 2, 3];
        let zoomIndex = 0, loadToken = 0;
        const applyZoom = () => {
            const zoom = ZOOMS[zoomIndex];
            img.style.transform = zoom === 1 ? "" : `scale(${zoom})`;
            lb.classList.toggle("rx-lb-zoomed", zoom !== 1);
            img.title = zoom === 1 ? "Click to zoom" : `Zoom ${zoom}x (click to change)`;
        };
        img.addEventListener("click", (e) => {
            e.preventDefault(); e.stopPropagation();
            zoomIndex = (zoomIndex + 1) % ZOOMS.length;
            applyZoom();
        });
        const preload = (src) => {
            if (!src) return;
            const next = new Image();
            next.decoding = "async";
            next.src = rawImg(src);
        };
        const show = (i) => {
            idx = (i + srcs.length) % srcs.length;
            const raw = rawImg(srcs[idx]), prev = directImg(srcs[idx]); // i.redd.it original (com fallback pro preview se 404)
            const token = ++loadToken;
            let fallbackUsed = false;
            zoomIndex = 0;
            applyZoom();
            lb.classList.remove("rx-lb-ready", "rx-lb-error");
            lb.classList.add("rx-lb-loading");
            img.onload = () => {
                if (token !== loadToken) return;
                lb.classList.remove("rx-lb-loading", "rx-lb-error");
                lb.classList.add("rx-lb-ready");
            };
            img.onerror = () => {
                if (token !== loadToken) return;
                if (!fallbackUsed && prev && raw !== prev) { fallbackUsed = true; img.src = prev; return; }
                lb.classList.remove("rx-lb-loading", "rx-lb-ready");
                lb.classList.add("rx-lb-error");
            };
            img.src = raw; openA.href = raw;
            count.textContent = (idx + 1) + "/" + srcs.length;
            if (multi) {
                preload(srcs[(idx + 1) % srcs.length]);
                preload(srcs[(idx + srcs.length - 1) % srcs.length]);
            }
        };
        if (multi) {
            lb.appendChild(count); // contador EM CIMA
            lb.appendChild(el("button", { className: "rx-lb-nav rx-lb-prev", type: "button", "aria-label": "Previous", onClick: (e) => { e.stopPropagation(); show(idx - 1); } }, icon(CHEV_L, 20)));
            lb.appendChild(el("button", { className: "rx-lb-nav rx-lb-next", type: "button", "aria-label": "Next", onClick: (e) => { e.stopPropagation(); show(idx + 1); } }, icon(CHEV_R, 20)));
        }
        lb.appendChild(el("div", { className: "rx-lb-top" }, openA, close)); // abrir + fechar juntos no canto
        lb.addEventListener("click", (e) => { if (e.target === lb) closeLb(); }); // fundo fecha; clique na imagem alterna o zoom
        if (multi) { // scroll horizontal (+ vertical) e swipe → navega 1 por gesto
            let lock = false, idle = null, tx = null;
            lb.addEventListener("wheel", (e) => {
                const d = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
                if (Math.abs(d) < 2) return;
                e.preventDefault();
                clearTimeout(idle); idle = setTimeout(() => { lock = false; }, 180);
                if (lock) return; lock = true; show(idx + (d > 0 ? 1 : -1));
            }, { passive: false });
            lb.addEventListener("touchstart", (e) => { tx = e.touches && e.touches[0] ? e.touches[0].clientX : null; }, { passive: true });
            lb.addEventListener("touchend", (e) => { if (tx == null) return; const c = e.changedTouches && e.changedTouches[0]; const dx = tx - (c ? c.clientX : tx); tx = null; if (Math.abs(dx) > 35) show(idx + (dx > 0 ? 1 : -1)); }, { passive: true });
        }
        show(idx);
        (document.body || document.documentElement).appendChild(lb);
        rxLbKey = (e) => {
            if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); closeLb(); }
            else if (multi && e.key === "ArrowRight") { e.preventDefault(); e.stopPropagation(); show(idx + 1); }
            else if (multi && e.key === "ArrowLeft") { e.preventDefault(); e.stopPropagation(); show(idx - 1); }
        };
        document.addEventListener("keydown", rxLbKey, true); // captura → não vaza p/ o tokKey do overlay
    }
    // Componente de galeria (compartilhado overlay + inline): faixa de imagens + barra embaixo ‹ contador › (contador vivo).
    // Clique na imagem → maximiza no NOSSO lightbox.
    function buildGallery(srcs) {
        const n = srcs.length;
        const slides = srcs.map((s, i) => {
            const slide = el("div", { className: "rx-tok-gslide rx-tok-img-loading" });
            // Os dois primeiros são a primeira viewport + o próximo gesto; os demais continuam lazy.
            const im = el("img", { src: s, loading: "eager", decoding: "async", alt: `Image ${i + 1} of ${n}` });
            if (i >= 2) im.loading = "lazy";
            im.style.cursor = "zoom-in";
            im.addEventListener("click", (e) => { e.preventDefault(); e.stopPropagation(); openLightbox(srcs, i); });
            const ready = () => { slide.classList.remove("rx-tok-img-loading", "rx-tok-img-error"); };
            const failed = () => { slide.classList.remove("rx-tok-img-loading"); slide.classList.add("rx-tok-img-error"); };
            im.addEventListener("load", ready);
            im.addEventListener("error", failed);
            // Imagens em cache podem não emitir load depois que o listener foi instalado.
            Promise.resolve().then(() => { if (im.complete && im.naturalWidth) ready(); });
            slide.appendChild(im);
            return slide;
        });
        const strip = el("div", { className: "rx-tok-gallery" }, ...slides);
        // indicador estilo Reddit: bolinhas centradas embaixo; galeria grande (>8) cai pra contador "n/N"
        let cur = 0, setActive, dotbar;
        if (n > 8) {
            const counter = el("span", { className: "rx-tok-gcount" }, "1/" + n);
            dotbar = el("div", { className: "rx-tok-gdots" }, counter);
            setActive = (i) => { if (i === cur) return; cur = i; counter.textContent = (i + 1) + "/" + n; };
        } else {
            const dots = srcs.map(() => el("span", { className: "rx-tok-gdot" }));
            dots[0].classList.add("rx-on");
            dotbar = el("div", { className: "rx-tok-gdots" }, ...dots);
            setActive = (i) => { if (i === cur) return; dots[cur] && dots[cur].classList.remove("rx-on"); cur = i; dots[i] && dots[i].classList.add("rx-on"); };
        }
        const upd = () => { const w = strip.clientWidth; if (w) setActive(Math.max(0, Math.min(n - 1, Math.round(strip.scrollLeft / w)))); };
        strip.addEventListener("scroll", upd, { passive: true });
        // setas nas bordas da imagem
        const garrow = (path, label, dir, cls) => el("button", { className: "rx-tok-garrow " + cls, type: "button", "aria-label": label, onClick: (e) => { e.preventDefault(); e.stopPropagation(); tokGalStep(strip, dir); } }, icon(path, 20));
        return el("div", { className: "rx-tok-gwrap" }, strip,
            garrow(CHEV_L, "Previous image", -1, "rx-gprev"),
            garrow(CHEV_R, "Next image", 1, "rx-gnext"),
            dotbar);
    }
    function tokWheel(e) {
        const track = document.querySelector(".rx-tok-track"); if (!track) return;
        if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) { // gesto horizontal
            const gw = e.target.closest && e.target.closest(".rx-tok-gwrap");
            const gal = gw && gw.querySelector(".rx-tok-gallery");
            if (gal) { e.preventDefault(); tokGalWheel(gal, e.deltaX); } // sobre galeria → 1 imagem por gesto
            return;
        }
        e.preventDefault();
        tokWheelCore(e.deltaY, e.deltaX, track);
    }
    function tokTouchStart(e) { const t = e.touches && e.touches[0]; rxTokTouchY = t ? t.clientY : null; rxTokTouchX = t ? t.clientX : null; rxTokTouchT = e.target; }
    function tokTouchEnd(e) {
        if (rxTokTouchY == null) return;
        const ct = e.changedTouches && e.changedTouches[0]; const sy = rxTokTouchY, sx = rxTokTouchX, tgt = rxTokTouchT;
        rxTokTouchY = null; rxTokTouchX = null; rxTokTouchT = null;
        const track = document.querySelector(".rx-tok-track"); if (!ct || !track) return;
        const dy = sy - ct.clientY, dx = (sx || 0) - ct.clientX;
        if (Math.abs(dx) > Math.abs(dy)) { // swipe horizontal sobre galeria → 1 imagem por gesto
            const gw = tgt && tgt.closest && tgt.closest(".rx-tok-gwrap");
            const gal = gw && gw.querySelector(".rx-tok-gallery");
            if (gal && Math.abs(dx) > 35) tokGalStep(gal, dx > 0 ? 1 : -1);
            return;
        }
        if (Math.abs(dy) > 35) tokGo(track, dy > 0 ? 1 : -1);
    }
    // atualiza barra de progresso + ícone play/pause do slide em foco (1 elemento, barato)
    function tokTick() {
        if (!rxTokOpen) return;
        const v = rxTokActiveV, slide = rxTokActiveSlide;
        if (v && slide) {
            slide.classList.toggle("rx-paused", v.paused);
            const fill = slide.querySelector(".rx-tok-vfill");
            if (fill && v.duration) fill.style.width = (v.currentTime / v.duration * 100) + "%";
        }
        rxTokRaf = requestAnimationFrame(tokTick);
    }

    // estado salvo do post (compact = unpacking-overflow-menu[is-post-saved]; card = item do menu shadow)
    function isSaved(article) {
        const um = article.querySelector("unpacking-overflow-menu");
        if (um) return um.hasAttribute("is-post-saved");
        const sp = article.querySelector("shreddit-post");
        const ov = sp && sp.shadowRoot && sp.shadowRoot.querySelector("shreddit-post-overflow-menu");
        if (ov) { const r = readOnState(ov, "save"); if (r != null) return r; }
        return false;
    }
    // dispara as ações REAIS do Reddit clicando o controle nativo (não simula).
    function voteState(article, dir) {
        const sp = article.querySelector("shreddit-post");
        const b = sp && sp.shadowRoot && sp.shadowRoot.querySelector('button[data-action-bar-action="' + dir + '"]');
        return !!(b && b.getAttribute("aria-pressed") === "true");
    }
    function postVote(article, dir) {
        const sp = article.querySelector("shreddit-post");
        const b = sp && sp.shadowRoot && sp.shadowRoot.querySelector('button[data-action-bar-action="' + dir + '"]');
        if (b) b.click();
    }
    function postMenuClick(article, testid) {
        const um = article.querySelector("unpacking-overflow-menu"); // compact: botões diretos no shadow
        if (um && um.shadowRoot) { const b = um.shadowRoot.querySelector('button[data-testid="' + testid + '"]'); if (b) { b.click(); return true; } }
        const sp = article.querySelector("shreddit-post"); // card: dropdown shreddit-post-overflow-menu
        const ov = (sp && sp.shadowRoot && sp.shadowRoot.querySelector("shreddit-post-overflow-menu")) || article.querySelector("shreddit-post-overflow-menu");
        if (ov) { triggerAction(ov, testid); return true; }
        return false;
    }

    function tokActBtn(kind, label, iconEl, active, fn) {
        const b = el("button", { className: "rx-tok-act" + (active ? " rx-on" : ""), type: "button", title: label, "aria-label": label,
            onClick: (e) => { e.preventDefault(); e.stopPropagation(); fn(); if (kind !== "hide") b.classList.toggle("rx-on"); } }, iconEl);
        return b;
    }
    function tokRail(article, getSlide) {
        const sp = article.querySelector("shreddit-post");
        const permalink = (sp && sp.getAttribute("permalink")) || "";
        const postUrl = permalink ? location.origin + permalink : "#";
        let up, dn;
        up = el("button", { className: "rx-tok-act" + (voteState(article, "upvote") ? " rx-on" : ""), type: "button", title: "Upvote", "aria-label": "Upvote",
            onClick: (e) => { e.preventDefault(); e.stopPropagation(); postVote(article, "upvote"); const was = up.classList.contains("rx-on"); up.classList.remove("rx-on"); dn.classList.remove("rx-on"); if (!was) up.classList.add("rx-on"); } }, icon(PATH.voteUp, 20));
        dn = el("button", { className: "rx-tok-act rx-down" + (voteState(article, "downvote") ? " rx-on" : ""), type: "button", title: "Downvote", "aria-label": "Downvote",
            onClick: (e) => { e.preventDefault(); e.stopPropagation(); postVote(article, "downvote"); const was = dn.classList.contains("rx-on"); up.classList.remove("rx-on"); dn.classList.remove("rx-on"); if (!was) dn.classList.add("rx-on"); } }, icon(PATH.voteDown, 20));
        const votes = el("div", { className: "rx-tok-votes" }, up, el("span", { className: "rx-tok-score" }, fmtNum(+((sp && sp.getAttribute("score")) || 0))), dn);
        const comments = el(
            "div", { className: "rx-tok-actwrap" },
            el("a", { className: "rx-tok-act", href: postUrl, target: "_blank", rel: "noopener", title: "Comments", "aria-label": "Comments" }, icon(PATH.comments, 24)),
            el("span", { className: "rx-tok-cnt" }, fmtNum(+((sp && sp.getAttribute("comment-count")) || 0))),
        );
        const saved = isSaved(article);
        return el(
            "div", { className: "rx-tok-rail" },
            votes,
            comments,
            tokActBtn("save", saved ? "Unsave" : "Save", icon(saved ? PATH.postSaveFill : PATH.postSave, 20), saved, () => postMenuClick(article, "save")),
            tokShareBtn(postUrl),
            tokActBtn("hide", "Hide", icon(PATH.postHide, 20), false, () => { if (postMenuClick(article, "hide")) { const s = getSlide(); if (s) s.remove(); } }),
        );
    }

    function tokSlide(article) {
        const media = postMedia(article);
        if (!media) return null;
        const sp = article.querySelector("shreddit-post") || article;
        const title = sp.getAttribute("post-title") || article.getAttribute("aria-label") || "";
        const sub = sp.getAttribute("subreddit-prefixed-name") || "";
        const permalink = sp.getAttribute("permalink") || "";
        const postUrl = permalink ? location.origin + permalink : "#";
        let mediaEl;
        if (media.kind === "video") {
            // <video> nosso + hls.js no nível máximo → qualidade cheia, SEM o overlay nativo do shreddit-player
            mediaEl = el("video", { className: "rx-tok-media", loop: "", playsinline: "", preload: "metadata", poster: media.poster || "" });
            mediaEl.muted = rxTokMuted;
            tokAttachVideo(mediaEl, media);
        } else if (media.kind === "redgifs") {
            // redgifs nativo (sem iframe): <video> nosso; o mp4 é carregado lazy no foco (rgLoad) → herda controles/mute/nav/single-play
            mediaEl = el("video", { className: "rx-tok-media", loop: "", playsinline: "", preload: "none", poster: media.poster || "" });
            mediaEl.muted = rxTokMuted; mediaEl.volume = rxTokVol;
            mediaEl.dataset.rgid = media.id;
        } else if (media.kind === "youtube") {
            // embed nocookie limpo + autoplay + jsapi (pra pausar quando sair do slide). referrer correto (no-referrer quebrava).
            mediaEl = el("iframe", { className: "rx-tok-media rx-tok-yt", src: "https://www.youtube-nocookie.com/embed/" + media.id + "?autoplay=1&playsinline=1&rel=0&enablejsapi=1", loading: "lazy", allowfullscreen: "", referrerpolicy: "strict-origin-when-cross-origin", allow: "autoplay; fullscreen; encrypted-media; picture-in-picture; clipboard-write" });
        } else if (media.kind === "iframe") {
            mediaEl = el("iframe", { className: "rx-tok-media", src: media.src, loading: "lazy", allowfullscreen: "", referrerpolicy: "strict-origin-when-cross-origin", allow: "autoplay; fullscreen; encrypted-media; clipboard-write" });
        } else if (media.kind === "gallery") {
            mediaEl = buildGallery(media.srcs); // faixa + barra embaixo (‹ 2/5 ›)
        } else {
            mediaEl = el("img", { className: "rx-tok-media", src: media.src, loading: "lazy", alt: "" });
            mediaEl.style.cursor = "zoom-in"; // imagem individual no overlay → maximiza no nosso lightbox
            mediaEl.addEventListener("click", (e) => { e.preventDefault(); e.stopPropagation(); openLightbox([media.src], 0); });
        }
        const cap = el(
            "div", { className: "rx-tok-cap" },
            sub ? el("a", { className: "rx-tok-sub", href: location.origin + "/" + sub + "/", target: "_blank", rel: "noopener" }, sub) : null,
            el("a", { className: "rx-tok-title", href: postUrl, target: "_blank", rel: "noopener" }, title),
        );
        const isVid = media.kind === "video" || media.kind === "redgifs";
        let slide;
        const rail = tokRail(article, () => slide);
        if (isVid) rail.appendChild(tokVolWrap()); // volume horizontal + mute global
        if (media.kind === "video") rail.appendChild(tokQualityBtn(mediaEl)); // qualidade só p/ vídeo do Reddit (níveis HLS)
        else if (media.kind === "redgifs") rail.appendChild(rgQualityBtn(mediaEl)); // HD/SD do RedGifs
        else if (media.kind === "iframe") rail.appendChild(tokMuteBtn());
        slide = el("div", { className: "rx-tok-slide" }, mediaEl, cap, rail);
        if (isVid) tokAddVideoControls(slide, mediaEl); // camada de play/pause + barra de progresso próprias
        slide.dataset.id = article.getAttribute("data-post-id") || "";
        return slide;
    }

    // Anexa slides dos posts ainda não vistos (antes do sentinela). Observa os vídeos p/ autoplay no foco.
    function tokFill(track, sentinel) {
        let added = 0;
        allPosts().forEach((a) => {
            if (a.offsetParent === null) return; // pula post escondido (anúncio/filtrado/recomendado); sem reflow forçado
            const id = a.getAttribute("data-post-id");
            if (!id || rxTokSeen.has(id)) return;
            const s = tokSlide(a);
            if (s) {
                track.insertBefore(s, sentinel);
                rxTokSeen.add(id);
                added++;
                s.querySelectorAll("video.rx-tok-media").forEach((m) => {
                    if (rxTokVidObs) rxTokVidObs.observe(m);
                    // invariante de áudio único: QUALQUER vídeo que comece a tocar pausa+muta todos os outros (mata corridas)
                    m.addEventListener("play", () => { tokNormalize(m); tokAllVideos(track).forEach((o) => { if (o !== m) { try { o.pause(); } catch (e) {} o.muted = true; } }); });
                });
            }
        });
        return added;
    }

    function openTok() {
        if (rxTokOpen) return;
        rxTokOpen = true;
        rxTokScrollY = window.scrollY;
        rxTokSeen.clear();
        rxTokEnded = false;
        const sentinel = el("div", { className: "rx-tok-sentinel" });
        const track = el("div", { className: "rx-tok-track" }, sentinel);
        const nav = el(
            "div", { className: "rx-tok-nav" },
            el("button", { className: "rx-tok-navbtn", type: "button", title: "Previous (↑)", "aria-label": "Previous", onClick: () => tokGo(track, -1) }, icon(CHEV_U, 20)),
            el("button", { className: "rx-tok-navbtn", type: "button", title: "Next (↓)", "aria-label": "Next", onClick: () => tokGo(track, 1) }, icon(CHEV_D, 20)),
        );
        const close = el("button", { className: "rx-tok-close", type: "button", title: "Close (Esc)", "aria-label": "Close", onClick: closeTok }, icon(PATH.close, 20));
        const overlay = el("div", { className: "rx-tok", role: "dialog", "aria-label": "TikTok feed" }, track, nav, close);
        (document.body || document.documentElement).appendChild(overlay); // fecha só no X (sem click-no-fundo)
        rxTokIdx = -1;
        // qualquer mudança de visibilidade → reenforça "1 vídeo tocando/desmutado por vez" pelo índice do slide no topo
        rxTokVidObs = new IntersectionObserver(() => tokFocusActive(track), { root: track, threshold: [0, 0.6] });
        if (!tokFill(track, sentinel)) track.appendChild(el("div", { className: "rx-tok-empty" }, "Sem mídia nos posts carregados. Rola o feed um pouco e abre de novo."));
        overlay.addEventListener("wheel", tokWheel, { passive: false }); // 1 item por gesto (cobre nav/rail tb)
        overlay.addEventListener("touchstart", tokTouchStart, { passive: true });
        overlay.addEventListener("touchend", tokTouchEnd, { passive: true });
        overlay.addEventListener("click", (e) => { if (!e.target.closest(".rx-tok-qwrap")) document.querySelectorAll(".rx-tok-qwrap.rx-open").forEach((w) => w.classList.remove("rx-open")); }, true); // clique fora fecha o menu de qualidade
        document.addEventListener("keydown", tokKey, true);
        tokHushBackground(); // mata o áudio dos players do Reddit no fundo
        rxTokHushTimer = setInterval(tokHushBackground, 700);
        rxTokRaf = requestAnimationFrame(tokTick); // sincroniza barra de progresso + ícone play/pause
        tokFocusActive(track); // foca/dá play no primeiro slide
        rxTokObs = new IntersectionObserver((es) => { if (es.some((e) => e.isIntersecting)) tokLoadMore(track, sentinel); }, { root: track, rootMargin: "800px" });
        rxTokObs.observe(sentinel);
    }

    function closeTok() {
        rxTokHls.forEach((h) => { try { h.destroy(); } catch (e) {} }); // libera os players hls.js
        rxTokHls.length = 0;
        rxTokBlobs.forEach((u) => { try { URL.revokeObjectURL(u); } catch (e) {} }); // libera os blobs do redgifs
        rxTokBlobs.length = 0;
        document.querySelector(".rx-tok")?.remove();
        document.removeEventListener("keydown", tokKey, true);
        if (rxTokObs) { rxTokObs.disconnect(); rxTokObs = null; }
        if (rxTokVidObs) { rxTokVidObs.disconnect(); rxTokVidObs = null; }
        if (rxTokHushTimer) { clearInterval(rxTokHushTimer); rxTokHushTimer = null; }
        if (rxTokRaf) { cancelAnimationFrame(rxTokRaf); rxTokRaf = null; }
        clearTimeout(rxTokWheelIdle); clearTimeout(rxTokGalIdle); rxTokWheelLock = false; rxTokGalLock = false; rxTokTouchY = null; rxTokTouchX = null; rxTokTouchT = null; rxTokActiveV = null; rxTokActiveSlide = null; rxTokIdx = -1; rxTokEnded = false;
        rxTokOpen = false;
        window.scrollTo(0, rxTokScrollY); // o load-more rolou o feed por baixo → volta pra onde estava
    }

    function tokKey(e) {
        if (document.querySelector(".rx-lb")) return; // lightbox aberto por cima → ele cuida das teclas (Esc/setas)
        const track = document.querySelector(".rx-tok-track");
        if (!track) return;
        if (e.key === "Escape") { e.preventDefault(); closeTok(); }
        else if (e.key === "ArrowDown" || e.key === "j") { e.preventDefault(); tokGo(track, 1); }
        else if (e.key === "ArrowUp" || e.key === "k") { e.preventDefault(); tokGo(track, -1); }
    }

    const tokSleep = (ms) => new Promise((r) => setTimeout(r, ms));
    // sentinela perto do fim do track (overlay) → usuário chegou no fim, precisa de mais conteúdo
    function tokSentinelNear(track, sentinel) {
        const tr = track.getBoundingClientRect(), sr = sentinel.getBoundingClientRect();
        return sr.top <= tr.bottom + 1200;
    }
    // Rearma o infinite-scroll nativo do shreddit: ele dispara por IntersectionObserver, que só re-fira se o loader
    // SAIR e VOLTAR ao viewport. Já parado no fundo, um scrollTo(fundo) é no-op → na home nunca paginava. Por isso o sobe-desce.
    async function tokTriggerFeed() {
        const doc = document.documentElement;
        window.scrollTo(0, Math.max(0, doc.scrollHeight - window.innerHeight * 2)); // sobe (loader sai do viewport)
        await tokSleep(150);
        window.scrollTo(0, doc.scrollHeight); // volta ao fundo (loader re-entra → fetch)
        const loader = document.querySelector("faceplate-partial[loading], shreddit-async-loader[bundlename], [slot='load-after']");
        if (loader && loader.scrollIntoView) { try { loader.scrollIntoView({ block: "center" }); } catch (e) {} }
    }
    // Coage o feed real a paginar e anexa os novos slides. Faz POLLING (rede lenta) e só desiste após várias rodadas vazias.
    async function tokLoadMore(track, sentinel) {
        if (rxTokLoading || rxTokEnded) return;
        rxTokLoading = true;
        try {
            let empties = 0;
            while (rxTokOpen && tokSentinelNear(track, sentinel) && empties < 4) {
                const hBefore = document.documentElement.scrollHeight;
                await tokTriggerFeed();
                await tokSleep(650);
                if (tokFill(track, sentinel) > 0) { empties = 0; await tokSleep(120); continue; } // veio post novo → segue
                await tokSleep(650); // dá mais tempo (rede)
                if (tokFill(track, sentinel) > 0 || document.documentElement.scrollHeight > hBefore) { empties = 0; continue; }
                empties++; // rodada vazia (sem post novo nem crescimento da página)
            }
            if (empties >= 4) rxTokEnded = true; // feed realmente acabou
        } finally {
            rxTokLoading = false;
        }
    }

    // Botão do modo story (TikTok) na micro dock (1x).
    function ensureStoryBtn() {
        if (document.querySelector(".rx-story")) return; // já montado → bailout barato
        document.querySelectorAll(".rx-tiktok-btn").forEach((b) => b.remove()); // limpa o antigo da topbar (versões anteriores)
        const btn = el("button", { className: "rx-story rx-dock-btn", type: "button", title: "Story feed (modo TikTok)", "aria-label": "Story feed", onClick: openTok }, icon(PATH.story));
        getDock().appendChild(btn);
    }

    /* ------------------------------------------------------------------ *
     * Navbar inferior (mobile) — customizável por toggles (nav* em settings).
     * Navegação por carga normal (location.href): a navegação SPA do Reddit é
     * frágil de falsificar; um clique de navbar pode pagar um reload. /user/me/
     * redireciona pro perfil logado (sem precisar resolver o username).
     * ------------------------------------------------------------------ */
    const NAV_ITEMS = [
        { key: "navHome", label: "Home", icon: PATH.home, act: () => (location.href = "/"), on: (p) => p === "/" },
        { key: "navPopular", label: "Popular", icon: PATH.popular, act: () => (location.href = "/r/popular/"), on: (p) => /^\/r\/popular\b/.test(p) },
        { key: "navSearch", label: "Search", icon: PATH.search, act: () => openSearchSheet() },
        { key: "navStory", label: "Story", icon: PATH.story, act: () => openTok() },
        { key: "navCreate", label: "Create", icon: PATH.create, act: () => (location.href = "/submit/") },
        { key: "navInbox", label: "Inbox", icon: PATH.envelope, act: () => (location.href = "/message/inbox/"), on: (p) => /^\/message\b/.test(p) },
        { key: "navNotifications", label: "Notifications", icon: PATH.inbox, act: () => (location.href = "/notifications/"), on: (p) => /^\/notifications\b/.test(p) },
        { key: "navSaved", label: "Saved", icon: PATH.saved, act: () => (location.href = "/user/me/saved/"), on: (p) => /\/saved\/?$/.test(p) },
        { key: "navProfile", label: "Profile", icon: PATH.profile, avatar: true, act: () => openUserSheet(), on: (p) => /^\/(user|u)\//.test(p) && !/\/(saved|upvoted|downvoted|hidden)\/?$/.test(p) },
        { key: "navMenu", label: "Menu", icon: PATH.menu, act: () => openUserSheet() },
        { key: "navTop", label: "Top", icon: PATH.toTop, act: () => window.scrollTo({ top: 0, behavior: "smooth" }) },
    ];
    // Ordem da navbar (reordenável no painel). Filtra chaves inválidas e completa as que faltam.
    function getNavOrder() {
        const all = NAV_ITEMS.map((n) => n.key);
        const saved = Array.isArray(settings.navOrder) ? settings.navOrder.filter((k) => all.includes(k)) : [];
        return saved.concat(all.filter((k) => !saved.includes(k)));
    }

    // Avatar logado (no botão da gaveta de usuário). O header fica display:none no mobile, então
    // forçamos loading=eager pra a imagem carregar mesmo assim, e cacheamos a URL quando acharmos
    // (persiste entre rebuilds e se o nó do header sumir).
    let rxAvatarCache = null;
    function getAvatarSrc() {
        const host = document.querySelector("#expand-user-drawer-button");
        const img = host && (host.querySelector("img") || host.querySelector("faceplate-img"));
        if (img) {
            if (img.getAttribute("loading") === "lazy") img.setAttribute("loading", "eager");
            const src = img.currentSrc || img.getAttribute("src") || img.src;
            if (src && /^(https?:|\/|data:)/.test(src)) rxAvatarCache = src;
        }
        return rxAvatarCache;
    }

    function navGlyph(it) {
        if (it.avatar) { const src = getAvatarSrc(); if (src) return el("img", { className: "rx-mnav-avatar", src, alt: "" }); }
        return icon(it.icon);
    }

    function markMobileNavActive(bar) {
        const p = location.pathname;
        bar.querySelectorAll(".rx-mnav-btn").forEach((b) => {
            const it = NAV_ITEMS.find((i) => i.key === b.dataset.rxOn);
            b.classList.toggle("rx-active", !!(it && it.on && it.on(p)));
            // avatar é lazy: troca o ícone placeholder pela foto assim que ela existir
            if (it && it.avatar && !b.querySelector(".rx-mnav-avatar")) {
                const src = getAvatarSrc();
                if (src) b.querySelector("svg")?.replaceWith(el("img", { className: "rx-mnav-avatar", src, alt: "" }));
            }
        });
    }

    function buildMobileNav() {
        let bar = document.querySelector(".rx-mnav");
        if (!settings.mobileNavbar) { if (bar) bar.remove(); return; }
        if (!document.body) return;
        const items = getNavOrder().map((k) => NAV_ITEMS.find((n) => n.key === k)).filter((it) => it && settings[it.key]);
        const sig = items.map((i) => i.key).join(","); // inclui a ordem → reordenar muda a sig e rebuilda
        if (bar && bar.dataset.rxSig === sig) { markMobileNavActive(bar); return; } // mesma config → só atualiza o ativo
        if (bar) bar.remove();
        bar = el("nav", { className: "rx-mnav", "aria-label": "Mobile navigation" });
        bar.dataset.rxSig = sig;
        items.forEach((it) => {
            const btn = el(
                "button",
                {
                    className: "rx-mnav-btn", type: "button", title: it.label, "aria-label": it.label,
                    onClick: (e) => {
                        e.preventDefault();
                        if (it.key !== "navSearch") closeSearch(); // tocar outro item fecha a busca
                        if (it.key !== "navProfile" && it.key !== "navMenu") closeSheet(); // …e o sheet de usuário
                        it.act();
                    },
                },
                navGlyph(it),
            );
            btn.dataset.rxOn = it.key;
            bar.appendChild(btn);
        });
        document.body.appendChild(bar);
        markMobileNavActive(bar);
    }

    /* ------------------------------------------------------------------ *
     * Mobile: barra de logo (substitui o header nativo escondido) + bottom sheets
     * ------------------------------------------------------------------ */
    function injectMobileTop() {
        if (!settings.mobileBareTop) { document.querySelector(".rx-mtop")?.remove(); document.documentElement.classList.remove("rx-mtopfixed"); return; }
        let bar = document.querySelector(".rx-mtop");
        if (!bar) {
            const host = document.querySelector("shreddit-app") || document.body;
            if (!host) return;
            bar = el(
                "div",
                { className: "rx-mtop" },
                el("button", { className: "rx-mtop-back", type: "button", "aria-label": "Back", onClick: () => { if (history.length > 1) history.back(); else (location.href = "/"); } }, icon(PATH.back)),
                el("span", { className: "rx-mtop-title" }),
                el("a", { className: "rx-mtop-logo", href: "/", "aria-label": "Home" }, wordmarkSvg()),
            );
            host.insertBefore(bar, host.firstChild); // primeiro item do conteúdo
        }
        // Home (/) → barra de logo NÃO-fixa (rola junto). Fora da home → barra FIXA: ← + título da página.
        const home = location.pathname === "/";
        bar.classList.toggle("rx-mtop-fixed", !home);
        document.documentElement.classList.toggle("rx-mtopfixed", !home); // CSS dá padding-top no conteúdo p/ não ficar atrás
        // só escreve o título se MUDOU — senão cada refresh reescreveria o textContent, gerando uma
        // mutação que re-dispara o observer → loop de refresh a cada 250ms mesmo ocioso.
        if (!home) { const t = bar.querySelector(".rx-mtop-title"); const nt = getPageTitle(); if (t && t.textContent !== nt) t.textContent = nt; }
    }

    // Título pra topbar fixa: deriva do path (sub/usuário/aba) e cai no document.title pro resto.
    function getPageTitle() {
        const p = location.pathname;
        let m;
        if ((m = p.match(/^\/r\/([^/]+)\/comments\//))) return (document.title || "").split(/\s*:\s*r\//)[0].trim() || "r/" + m[1];
        if ((m = p.match(/^\/r\/([^/]+)/))) return "r/" + m[1];
        if ((m = p.match(/^\/(?:user|u)\/([^/]+)\/(saved|upvoted|downvoted|hidden|submitted|comments)/))) {
            return ({ saved: "Saved", upvoted: "Upvoted", downvoted: "Downvoted", hidden: "Hidden", submitted: "Posts", comments: "Comments" })[m[2]];
        }
        if ((m = p.match(/^\/(?:user|u)\/([^/]+)/))) return "u/" + m[1];
        if (p.startsWith("/search")) return "Search";
        if (p.startsWith("/submit")) return "Create post";
        if (p.startsWith("/message") || p.startsWith("/notifications")) return "Inbox";
        if (p.startsWith("/settings")) return "Settings";
        if (p.startsWith("/mod")) return "Mod";
        return (document.title || "").replace(/\s*[:|–\-]\s*reddit\s*$/i, "").trim() || "Reddit";
    }

    let rxSheetKey = null;
    function closeSheet() {
        const s = document.querySelector(".rx-sheet");
        if (rxSheetKey) { document.removeEventListener("keydown", rxSheetKey, true); rxSheetKey = null; }
        if (!s) return;
        s.classList.remove("rx-sheet-open");
        setTimeout(() => s.remove(), 280); // espera a transição
    }
    function openSheet(content, cls) {
        closeSheet(); // garante 1 sheet por vez (e devolve a sidebar de um sheet anterior)
        const panel = el("div", { className: "rx-sheet-panel" }, el("div", { className: "rx-sheet-grip" }), content);
        const sheet = el("div", { className: "rx-sheet" + (cls ? " " + cls : "") }, el("div", { className: "rx-sheet-backdrop", onClick: closeSheet }), panel);
        document.body.appendChild(sheet);
        requestAnimationFrame(() => sheet.classList.add("rx-sheet-open"));
        rxSheetKey = (e) => { if (e.key === "Escape") { e.preventDefault(); closeSheet(); } };
        document.addEventListener("keydown", rxSheetKey, true);
    }
    // Opções do usuário (lista própria — a sidebar nativa é lazy no mobile). Categorias por { sec }.
    // Home/Popular/All saíram daqui (vivem na navbar). "Settings" = nosso painel; "Mod settings" = /mod do Reddit.
    const USER_SHEET = [
        { sec: "Account" },
        { label: "My profile", icon: PATH.profile, href: "/user/me/" },
        { label: "Saved", icon: PATH.saved, href: "/user/me/saved/" },
        { label: "Upvoted", icon: PATH.upvoted, href: "/user/me/upvoted/" },
        { label: "History", icon: PATH.history, href: "/user/me/" },
        { label: "Posts", icon: PATH.posts, href: "/user/me/submitted/" },
        { label: "Comments", icon: PATH.comments, href: "/user/me/comments/" },
        { label: "Drafts", icon: PATH.draft, href: "/drafts/" },
        { label: "Achievements", icon: PATH.trophy, href: "/achievements/" },
        { label: "Create post", icon: PATH.create, href: "/submit/" },
        { sec: "Settings" },
        { label: "Settings", icon: PATH.gear, href: "/settings/" }, // settings do Reddit mesmo
        { label: "Mod settings", icon: PATH.quality, act: () => openSettingsSheet() }, // "mod" = nosso script → abre o painel (full-page no mobile)
        { label: "Toggle theme", icon: PATH.theme, act: () => { toggleRedditTheme(); closeSheet(); } }, // alterna dark/light do Reddit (sessão)
        { sep: true },
        { label: "Log out", icon: PATH.logout, danger: true, act: () => nativeLogout() }, // clica o logout nativo (URL/CSRF corretos)
    ];
    // Seção de moderação — entra no sheet ANTES de "Settings" só se a conta modera comunidades.
    const MOD_SHEET = [
        { sec: "Moderation" },
        { label: "Mod queue", icon: PATH.shield, href: "/mod/queue/" },
        { label: "Mod feed", icon: PATH.posts, href: "/mod/" },
        { label: "Modmail", icon: PATH.envelope, href: "/mod/mail/" },
    ];
    // É moderador? Checado via API (subreddits que o usuário modera), cacheado em localStorage pra já
    // aparecer no boot seguinte; refresca em background. Evita depender da sidebar nativa (lazy no mobile).
    let rxIsMod = false;
    try { rxIsMod = localStorage.getItem("rx-is-mod") === "1"; } catch (e) {}
    function refreshModStatus() {
        fetch("/subreddits/mine/moderator.json?limit=1", { credentials: "include" })
            .then((r) => (r.ok ? r.json() : null))
            .then((j) => { rxIsMod = !!(j && j.data && j.data.children && j.data.children.length); try { localStorage.setItem("rx-is-mod", rxIsMod ? "1" : "0"); } catch (e) {} })
            .catch(() => {});
    }
    // Alterna o tema do Reddit (light/dark) na sessão. Não persiste (o Reddit reaplica a pref no reload).
    function toggleRedditTheme() {
        const h = document.documentElement;
        const dark = h.classList.contains("theme-dark") || (!h.classList.contains("theme-light") && matchMedia("(prefers-color-scheme: dark)").matches);
        h.classList.toggle("theme-dark", !dark);
        h.classList.toggle("theme-light", dark);
        applyTheme(); // re-avalia o rx-blackactive (no white desliga nosso preto)
    }
    // Logout via o botão nativo (abre a gaveta do usuário e clica em "Log out") — pega URL/CSRF certos.
    function nativeLogout() {
        document.querySelector("#expand-user-drawer-button")?.click(); // abre/carrega a gaveta (lazy)
        let n = 0;
        const iv = setInterval(() => {
            const lo =
                document.querySelector('a[href*="/logout"], [data-testid*="logout"], [noun*="logout"]') ||
                [...document.querySelectorAll('button, a, [role="menuitem"]')].find((e) => /^\s*(log\s?out|sign\s?out|sair)\s*$/i.test(e.textContent || ""));
            if (lo) { lo.click(); clearInterval(iv); }
            if (++n > 30) clearInterval(iv);
        }, 100);
    }
    function openPanel() { const p = document.querySelector(".rx-panel"); if (p) p.hidden = false; }
    // Nosso painel como PÁGINA INTEIRA no mobile (← no topo). Não fecha ao aplicar — só no ← ou Esc.
    let rxSettingsKey = null;
    function closeSettings() {
        document.querySelector(".rx-settings")?.remove();
        if (rxSettingsKey) { document.removeEventListener("keydown", rxSettingsKey, true); rxSettingsKey = null; }
    }
    function openSettingsSheet() {
        closeSheet();    // fecha o sheet de usuário (de onde veio)
        closeSettings(); // se já aberto, recria (ex.: Reset)
        const bar = el(
            "div",
            { className: "rx-settings-bar" },
            el("button", { className: "rx-settings-back", type: "button", "aria-label": "Back", onClick: closeSettings }, icon(PATH.back)),
            el("span", { className: "rx-settings-title" }, "Mod settings"),
            el("button", { className: "rx-reset", type: "button", onClick: () => { Object.assign(settings, DEFAULTS); save(); applySettings(); openSettingsSheet(); } }, "Reset"),
        );
        const ov = el("div", { className: "rx-settings" }, bar, el("div", { className: "rx-settings-body" }, ...settingsRows()));
        document.body.appendChild(ov);
        refreshDimming();
        rxSettingsKey = (e) => { if (e.key === "Escape") { e.preventDefault(); closeSettings(); } };
        document.addEventListener("keydown", rxSettingsKey, true);
    }
    function openUserSheet() {
        const list = el("div", { className: "rx-sheet-menu-list" });
        const src = getAvatarSrc();
        const user = getUsername();
        list.appendChild(el("div", { className: "rx-sheet-menu-hd" }, src ? el("img", { src, alt: "" }) : icon(PATH.profile), el("b", null, user ? "u/" + user : "Account")));
        // injeta a seção Moderation logo antes de "Settings" quando a conta modera comunidades
        const rows = rxIsMod ? USER_SHEET.flatMap((it) => (it.sec === "Settings" ? [...MOD_SHEET, it] : [it])) : USER_SHEET;
        rows.forEach((it) => {
            if (it.sec) { list.appendChild(el("div", { className: "rx-sheet-sec" }, it.sec)); return; }
            if (it.sep) { list.appendChild(el("div", { className: "rx-sheet-sep" })); return; }
            // href → deixa o link navegar, mas fecha o sheet já (senão fica aberto durante a troca de página);
            // act → preventDefault + a própria ação cuida (Mod settings fecha e abre a página de settings).
            const onClick = it.act ? (e) => { e.preventDefault(); it.act(); } : () => closeSheet();
            list.appendChild(el(it.href ? "a" : "div", { className: "rx-sheet-item" + (it.danger ? " rx-sheet-danger" : ""), href: it.href || null, onClick }, icon(it.icon), el("span", null, it.label)));
        });
        openSheet(list, "rx-sheet-menu");
    }

    /* ------------------------------------------------------------------ *
     * Busca em tela cheia (fica atrás da navbar) + autocomplete de subreddits/perfis.
     * Mesma origem (reddit.com) → fetch normal com cookies, sem GM.
     * ------------------------------------------------------------------ */
    let rxSearchKey = null;
    function closeSearch() {
        document.querySelector(".rx-search")?.remove();
        if (rxSearchKey) { document.removeEventListener("keydown", rxSearchKey, true); rxSearchKey = null; }
    }
    function openSearchSheet() {
        const open = document.querySelector(".rx-search");
        if (open) { open.querySelector(".rx-search-input")?.focus(); return; } // re-tap com a busca aberta → foca o input
        const input = el("input", { className: "rx-search-input", type: "search", placeholder: "Search Reddit", enterkeyhint: "search", autocapitalize: "none", autocomplete: "off", spellcheck: "false" });
        const results = el("div", { className: "rx-search-results" });
        const go = (q) => { q = (q || "").trim(); if (q) location.href = "/search/?q=" + encodeURIComponent(q); };
        const bar = el(
            "div",
            { className: "rx-search-bar" },
            el("button", { className: "rx-search-close", type: "button", "aria-label": "Back", onClick: closeSearch }, icon(PATH.back)),
            el("div", { className: "rx-search-field" }, icon(PATH.search), input), // campo = pílula com lupa + input (borda só no foco)
        );
        const ov = el("div", { className: "rx-search" }, bar, results);
        document.body.appendChild(ov);
        const run = debounce(() => searchSuggest(input.value, results), 180);
        input.addEventListener("input", run);
        input.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); go(input.value); } });
        rxSearchKey = (e) => { if (e.key === "Escape") { e.preventDefault(); closeSearch(); } };
        document.addEventListener("keydown", rxSearchKey, true);
        input.focus(); // SÍNCRONO no gesto do tap → iOS abre o teclado (setTimeout quebraria a cadeia do gesto)
        setTimeout(() => input.focus(), 60); // backup
    }
    function searchRow(iconNode, title, sub, onClick) {
        return el("div", { className: "rx-search-row", onClick }, iconNode, el("div", { className: "rx-search-rowtext" }, el("span", { className: "rx-search-rowtitle" }, title), sub ? el("span", { className: "rx-search-rowsub" }, sub) : null));
    }
    async function searchSuggest(q, box) {
        q = (q || "").trim();
        box.dataset.q = q;
        if (!q) { box.replaceChildren(); return; }
        const rows = [searchRow(icon(PATH.search), '"' + q + '"', "Search posts", () => (location.href = "/search/?q=" + encodeURIComponent(q)))];
        try {
            const r = await fetch("/api/subreddit_autocomplete_v2.json?query=" + encodeURIComponent(q) + "&limit=8&include_over_18=true&include_profiles=true&typeahead_active=true", { credentials: "include" });
            const j = await r.json();
            if (box.dataset.q !== q) return; // chegou uma resposta velha → ignora (já digitaram outra coisa)
            ((j && j.data && j.data.children) || []).forEach((c) => {
                const d = c.data || {};
                const name = d.display_name_prefixed || (d.display_name ? "r/" + d.display_name : "");
                if (!name) return;
                const ic = (d.community_icon || d.icon_img || d.profile_img || "").split("?")[0];
                const av = ic ? el("img", { className: "rx-search-ic", src: ic, alt: "" }) : icon(name[0] === "u" ? PATH.profile : PATH.popular);
                rows.push(searchRow(av, name, d.subscribers != null ? fmtNum(d.subscribers) + " members" : null, () => (location.href = "/" + name)));
            });
        } catch (e) {}
        if (box.dataset.q !== q) return;
        box.replaceChildren(...rows);
    }

    /* ------------------------------------------------------------------ *
     * Apply everything
     * ------------------------------------------------------------------ */
    // Tail compartilhado de features, na MESMA ordem, chamado por applySettings (boot/mudança de setting) e
    // por refreshWork (hot path do observer). Extraído pra os dois não divergirem mais (já tinham divergido).
    // Cada função aqui tem bail barato próprio. applyScrollTop NÃO entra (é exclusivo do applySettings — abaixo).
    function runFeaturePipeline() {
        applySortTabs();
        applyTopbar();
        ensureStoryBtn();
        applyOldTopbar();
        applySearchDropdown();
        observePlayers();
        pruneMenus();
        applyPostBarActions();
        injectSavedTools();
        applyFilter();
        applyUnblur();
        applyMatureBypass();
        applyRedgifsInline();
        applyGalleryInline();
        injectMobileTop();
        buildMobileNav();
    }

    function applySettings() {
        applyClasses();
        applyRecScope();
        renderUserSection();
        runFeaturePipeline();
        applyScrollTop(); // só aqui (mudança de setting re-avalia o botão da dock); independente da ordem do tail → roda no fim
    }

    /* ------------------------------------------------------------------ *
     * Control panel (FAB)
     * ------------------------------------------------------------------ */
    function buildRow(item) {
        const type = item.type || "toggle";

        if (type === "navlist") {
            const wrap = el("div", { className: "rx-navlist" });
            const move = (i, dir) => {
                const order = getNavOrder();
                const j = i + dir;
                if (j < 0 || j >= order.length) return;
                const t = order[i]; order[i] = order[j]; order[j] = t;
                settings.navOrder = order;
                save();
                render();
                buildMobileNav();
            };
            const render = () => {
                wrap.replaceChildren();
                const order = getNavOrder();
                order.forEach((key, i) => {
                    const it = NAV_ITEMS.find((n) => n.key === key);
                    if (!it) return;
                    const cb = el("input", { type: "checkbox" });
                    cb.checked = !!settings[key];
                    cb.addEventListener("change", () => { settings[key] = cb.checked; save(); buildMobileNav(); });
                    const up = el("button", { className: "rx-navmove", type: "button", "aria-label": "Move up", title: "Move up", onClick: (e) => { e.stopPropagation(); move(i, -1); } }, "↑"); // stopProp: o render() troca os nós e o clique vazaria pro listener "fora-do-painel" fechando o painel desktop
                    const down = el("button", { className: "rx-navmove", type: "button", "aria-label": "Move down", title: "Move down", onClick: (e) => { e.stopPropagation(); move(i, 1); } }, "↓");
                    if (i === 0) up.disabled = true;
                    if (i === order.length - 1) down.disabled = true;
                    wrap.appendChild(
                        el("div", { className: "rx-navrow" },
                            el("span", { className: "rx-navrow-ic" }, icon(it.icon)),
                            el("span", { className: "rx-navrow-label" }, it.label),
                            up, down,
                            el("label", { className: "rx-sw" }, cb, el("i", null)),
                        ),
                    );
                });
            };
            render();
            return el(
                "div",
                { className: "rx-row rx-col", "data-dep": item.dep || "" },
                el("div", { className: "rx-toprow" }, el("span", { className: "rx-label" }, item.label, item.hint ? el("small", null, item.hint) : null)),
                wrap,
            );
        }

        if (type === "slider") {
            const val = el("b", { className: "rx-val" }, settings[item.key] + (item.unit || ""));
            const input = el("input", {
                className: "rx-slider",
                type: "range",
                min: item.min,
                max: item.max,
                step: item.step || 1,
                value: settings[item.key],
                onInput: (e) => {
                    settings[item.key] = +e.target.value;
                    val.textContent = e.target.value + (item.unit || "");
                    save();
                    applyClasses();
                },
            });
            return el(
                "div",
                { className: "rx-row rx-col", "data-dep": item.dep || "" },
                el("div", { className: "rx-toprow" }, el("span", { className: "rx-label" }, item.label), val),
                input,
            );
        }

        if (type === "select") {
            const sel = el(
                "select",
                {
                    className: "rx-select",
                    onChange: (e) => {
                        settings[item.key] = e.target.value;
                        save();
                    },
                },
                ...item.options.map((o) => {
                    const opt = el("option", { value: o.value }, o.label);
                    if (settings[item.key] === o.value) opt.selected = true;
                    return opt;
                }),
            );
            return el(
                "label",
                { className: "rx-row", "data-dep": item.dep || "" },
                el("span", { className: "rx-label" }, item.label, item.hint ? el("small", null, item.hint) : null),
                sel,
            );
        }

        if (type === "textarea") {
            const ta = el("textarea", {
                className: "rx-textarea",
                rows: item.rows || 4,
                placeholder: item.placeholder || "",
                spellcheck: "false",
                onInput: (e) => {
                    settings[item.key] = e.target.value;
                    reFilter(); // debounce: save + applyFilter
                },
            });
            ta.value = settings[item.key] || "";
            return el(
                "div",
                { className: "rx-row rx-col", "data-dep": item.dep || "" },
                el("div", { className: "rx-toprow" }, el("span", { className: "rx-label" }, item.label, item.hint ? el("small", null, item.hint) : null)),
                ta,
            );
        }

        const input = el("input", {
            type: "checkbox",
            onChange: (e) => {
                settings[item.key] = e.target.checked;
                save();
                applySettings();
                refreshDimming();
            },
        });
        input.checked = !!settings[item.key];
        return el(
            "label",
            { className: "rx-row", "data-dep": item.dep || "" },
            el("span", { className: "rx-label" }, item.label, item.hint ? el("small", null, item.hint) : null),
            el("span", { className: "rx-sw" }, input, el("i", null)),
        );
    }

    function refreshDimming() {
        // global (.rx-row, não só .rx-panel): cobre tanto o painel desktop quanto o sheet de settings do mobile
        document.querySelectorAll(".rx-row[data-dep]").forEach((row) => {
            const dep = row.getAttribute("data-dep");
            row.setAttribute("data-dim", dep && !settings[dep] ? "1" : "0");
        });
    }

    // Grupos + linhas do painel (reaproveitado pelo painel desktop e pelo sheet de settings do mobile).
    function settingsRows() {
        return GROUPS.flatMap((g) => [el("div", { className: "rx-group-hd" }, g.title), ...g.items.map(buildRow)]);
    }

    // Ícones do rail de categorias — ordem = ordem de GROUPS (You, Landing, Layout, Theme, Navigation,
    // Sidebar sections, Feed, Post actions, Media, Ads & popups, Mobile). Cada um é o `d` de um <path> 24x24.
    const CAT_ICONS = [
        "M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z",   // You (pessoa)
        "M12 3l9 8h-3v9h-4v-6H10v6H6v-9H3l9-8z",                                                                          // Default landing (home)
        "M3 5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5zm2 0v14h6V5H5zm8 0v14h6V5h-6z",            // Layout (colunas)
        "M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm0 18V4a8 8 0 0 1 0 16z",                                                // Theme (contraste)
        "M4 4h16v2H4zm8 3l7 7h-4v6h-6v-6H5z",                                                                            // Navigation (topo)
        "M3 4h18v16H3V4zm2 2v12h5V6H5z",                                                                                 // Sidebar sections
        "M3 5h18v2H3V5zm0 6h18v2H3v-2zm0 6h12v2H3v-2z",                                                                  // Feed (lista)
        "M17 3H7a2 2 0 0 0-2 2v16l7-3 7 3V5a2 2 0 0 0-2-2z",                                                             // Post actions (salvar)
        "M8 5v14l11-7z",                                                                                                 // Media (play)
        "M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm0 2c1.85 0 3.55.63 4.9 1.69L5.69 16.9A8 8 0 0 1 12 4zm0 16a7.96 7.96 0 0 1-4.9-1.69L18.31 7.1A8 8 0 0 1 12 20z",   // Ads & popups (bloquear)
        "M7 1.5h10A1.5 1.5 0 0 1 18.5 3v18a1.5 1.5 0 0 1-1.5 1.5H7A1.5 1.5 0 0 1 5.5 21V3A1.5 1.5 0 0 1 7 1.5zM7 4v14h10V4H7zm5 15.5a1 1 0 1 0 0 2 1 1 0 0 0 0-2z",  // Mobile (telefone)
    ];

    function buildPanel() {
        if (!document.body || document.querySelector(".rx-fab")) return;

        const panel = el("div", { className: "rx-panel", hidden: "" });
        const fab = el("button", { className: "rx-fab rx-dock-btn", type: "button", title: "Reddit Tweaks", "aria-label": "Reddit Tweaks", onClick: () => (panel.hidden = !panel.hidden) }, icon(PATH.gear));

        // cabeçalho
        panel.append(el("div", { className: "rx-panel-hd" },
            el("span", { className: "rx-logo" }, icon(PATH.gear)),
            el("b", null, "Reddit Tweaks"),
            el("button", { className: "rx-x", type: "button", title: "Close", "aria-label": "Close", onClick: () => (panel.hidden = true) }, "✕")));

        // busca (filtra todas as categorias)
        const search = el("input", { type: "text", placeholder: "Search setting…", spellcheck: "false",
            onKeydown: (e) => e.stopPropagation(), onKeyup: (e) => e.stopPropagation() });
        panel.append(el("div", { className: "rx-psearch" },
            el("div", null, icon("M15.5 14h-.79l-.28-.27a6.5 6.5 0 1 0-.7.7l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0A4.5 4.5 0 1 1 14 9.5 4.5 4.5 0 0 1 9.5 14z"), search)));

        // corpo: rail de categorias + conteúdo
        const rail = el("div", { className: "rx-rail" });
        const content = el("div", { className: "rx-content" });
        const empty = el("div", { className: "rx-empty" }, "No setting found");
        const sections = [], tabs = [];
        let active = 0;

        GROUPS.forEach((grp, gi) => {
            const sec = el("div", { className: "rx-sec" });
            sec.append(el("div", { className: "rx-sec-title" }, grp.title));
            grp.items.forEach((item) => {
                const row = buildRow(item);
                row.setAttribute("data-label", (item.label || "").toLowerCase());
                sec.append(row);
            });
            content.append(sec);
            sections.push(sec);

            const tab = el("button", { className: "rx-tab", type: "button", title: grp.title, onClick: () => { search.value = ""; showTab(gi); } }, icon(CAT_ICONS[gi] || CAT_ICONS[0]));
            rail.append(tab);
            tabs.push(tab);
        });
        content.append(empty);
        panel.append(el("div", { className: "rx-body" }, rail, content));

        function showTab(i) {
            active = i; empty.style.display = "none";
            sections.forEach((sec, idx) => {
                sec.style.display = idx === i ? "block" : "none";
                sec.querySelectorAll("[data-label]").forEach((r) => (r.style.display = ""));
                const t = sec.querySelector(".rx-sec-title"); if (t) t.style.display = "";
            });
            tabs.forEach((tb, idx) => tb.classList.toggle("active", idx === i));
            content.scrollTop = 0;
        }
        search.addEventListener("input", () => {
            const q = search.value.trim().toLowerCase();
            if (!q) { showTab(active); return; }
            tabs.forEach((tb) => tb.classList.remove("active"));
            let any = false;
            sections.forEach((sec) => {
                let vis = false;
                sec.querySelectorAll("[data-label]").forEach((r) => {
                    const m = r.getAttribute("data-label").indexOf(q) !== -1;
                    r.style.display = m ? "" : "none"; if (m) { vis = true; any = true; }
                });
                sec.style.display = vis ? "block" : "none";
                const t = sec.querySelector(".rx-sec-title"); if (t) t.style.display = vis ? "" : "none";
            });
            empty.style.display = any ? "none" : "block";
        });

        // rodapé
        panel.append(el("div", { className: "rx-foot" },
            el("button", { className: "rx-reset", type: "button", onClick: () => {
                Object.assign(settings, DEFAULTS);
                save();
                applySettings();
                document.querySelector(".rx-panel")?.remove();
                document.querySelector(".rx-fab")?.remove();
                buildPanel();
                document.querySelector(".rx-panel").hidden = false;
            } }, "Reset"),
            el("span", { className: "rx-ver" }, (typeof GM_info !== "undefined" && GM_info.script ? "v" + GM_info.script.version : ""))));

        document.body.append(panel);
        getDock().appendChild(fab);
        showTab(0);
        refreshDimming();

        document.addEventListener("click", (e) => {
            if (!panel.hidden && !panel.contains(e.target) && !fab.contains(e.target)) panel.hidden = true;
        });
    }

    /* ------------------------------------------------------------------ *
     * Feed / ordenação padrão — redireciona a home raiz no document-start.
     * Só age em "/" (carga completa). Navegação SPA (clicar no logo) não recarrega
     * o script, então não redireciona; e o destino nunca é "/", então não há loop.
     * ------------------------------------------------------------------ */
    function applyDefaultLanding() {
        if (location.pathname !== "/") return;
        const feed = settings.defaultFeed || "home";
        const sort = settings.defaultSort || "";
        if (feed === "home" && !sort) return; // nada a fazer
        const feedPath = feed === "popular" ? "/r/popular/" : feed === "all" ? "/r/all/" : "/";
        const target = feedPath + (sort ? sort + "/" : "");
        if (location.pathname + location.search !== target) location.replace(target);
    }

    /* ------------------------------------------------------------------ *
     * Bootstrap
     * ------------------------------------------------------------------ */
    applyDefaultLanding(); // antes de tudo — evita montar a home só pra redirecionar
    applyClasses(); // earliest possible — kills ad/layout flash before paint
    applyProfileClass(); // marca /user/* cedo (guard do branch HOME no applyTopbar)
    applyRecScope(); // marca r/all|popular cedo (gate do hideRecommended)
    applyPinScope(); // marca páginas sem layout-feed (gate do fixedRightSidebar)

    const ric = window.requestIdleCallback ? (cb) => window.requestIdleCallback(cb, { timeout: 500 }) : (cb) => setTimeout(cb, 1);

    function refreshWork() {
        if (document.hidden) return; // aba em background → zero CPU (re-roda no visibilitychange)
        // applyClasses NÃO entra aqui: as classes do <html> persistem (SPA não as reseta);
        // são aplicadas no boot e em cada mudança de setting. Tirar daqui alivia o hot path.
        buildPanel();
        if (settings.userShortcuts && !document.querySelector(".rx-user-section")) injectUserSection();
        else if (!settings.userShortcuts) document.querySelectorAll(".rx-user-section").forEach((n) => n.remove());
        runFeaturePipeline(); // mesmo tail do applySettings (o applyTopbar dele é rede de segurança; o eager no observer é o caminho rápido)
    }
    // debounce (coalesce a rajada de mutações) + requestIdleCallback (roda ocioso, sem travar o render)
    const refresh = debounce(() => ric(refreshWork), 250);

    let bootScheduled = false;
    function scheduleIdleBoot() {
        if (bootScheduled) return;
        bootScheduled = true;
        ric(() => {
            bootScheduled = false;
            applySettings();
            buildPanel();
            refreshModStatus(); // checa status de mod (cacheado) p/ a seção Moderation do sheet
            document.addEventListener("click", rxImgClick, true); // imagem individual → nosso lightbox
        });
    }

    // Caminho EAGER (sem debounce) só pro topbar: barato e idempotente, move o view pra linha das
    // abas no instante em que tabs+view existem (sem esperar os 250ms+ocioso) → mata o "pulo" de 1-2s.
    new MutationObserver(() => {
        applyProfileClass(); // navegação SPA: atualiza o marcador /user/*
        applyRecScope();     // navegação SPA: re-checa r/all|popular
        applyPinScope();     // navegação SPA: re-checa páginas sem layout-feed
        applyTopbar();       // move o view já; resto vai no refresh debounced
        refresh();
    }).observe(document.documentElement, { childList: true, subtree: true });
    document.addEventListener("visibilitychange", () => { if (!document.hidden) refresh(); }); // catch-up ao voltar pra aba

    // Scroll-to-top: 1 listener passivo + rAF. Custo ~zero quando off (rxScrollBtn null → return imediato).
    window.addEventListener("scroll", () => {
        if (!rxScrollBtn || rxScrollTick) return;
        rxScrollTick = true;
        requestAnimationFrame(updateScrollBtn);
    }, { passive: true });

    // Tema preto auto-segue o tema do Reddit: re-avalia em mudança de sistema e em troca da classe
    // theme-light/theme-dark no <html> (toggle nativo do Reddit). applyTheme é idempotente → sem loop.
    try { window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", applyTheme); } catch (e) {}
    // O script liga/desliga ~20 classes rx-* no <html> (applyClasses + rx-wide/rx-profile/rx-nopin/…), e
    // cada uma dispararia este observer. Só interessa a troca de theme-light/theme-dark do Reddit → guarda
    // a assinatura desses dois e sai cedo quando nada mudou (evita matchMedia/trabalho à toa nas nossas escritas).
    const themeSig = () => (document.documentElement.classList.contains("theme-light") ? "L" : "") + (document.documentElement.classList.contains("theme-dark") ? "D" : "");
    let rxLastThemeSig = themeSig();
    new MutationObserver(() => {
        const sig = themeSig();
        if (sig === rxLastThemeSig) return;
        rxLastThemeSig = sig;
        applyTheme();
    }).observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });

    // Re-sweep lazy menus right after the user drawer opens.
    document.addEventListener(
        "click",
        (e) => {
            if (e.target.closest('#expand-user-drawer-button, [aria-haspopup="menu"]')) {
                setTimeout(pruneMenus, 60);
                setTimeout(pruneMenus, 300);
            }
        },
        true,
    );

    // Direct share: clicar no Share copia o link direto, sem abrir o dropdown.
    document.addEventListener(
        "click",
        (e) => {
            if (!settings.directShare) return;
            const share = e.composedPath().find((n) => n.tagName && n.tagName.toLowerCase() === "shreddit-post-share-button");
            if (!share) return;
            const permalink = share.getAttribute("permalink");
            if (!permalink) return;
            e.preventDefault();
            e.stopPropagation();
            // só avisa no SUCESSO: writeText pode REJEITAR async (aba sem foco/permissão); o catch síncrono não pega
            try {
                const p = navigator.clipboard.writeText(location.origin + permalink);
                if (p && p.then) p.then(() => toast("Link copied"), () => {});
                else toast("Link copied");
            } catch (err) {}
        },
        true,
    );

    // Remover trackers: limpa a query de links do Reddit ao copiar (pega o share nativo e o direct).
    try {
        const cb = navigator.clipboard;
        if (cb && cb.writeText && !cb.__rxPatch) {
            const orig = cb.writeText.bind(cb);
            cb.writeText = (t) => orig(settings.shareNoTrackers && typeof t === "string" ? stripTrackers(t) : t);
            cb.__rxPatch = true;
        }
    } catch (e) {}

    function boot() {
        // Classes críticas já foram aplicadas no document-start. O pipeline completo varre posts,
        // shadow roots e menus; deixe o primeiro paint sair antes de executar esse trabalho.
        scheduleIdleBoot();
    }

    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
    else boot();
})();
