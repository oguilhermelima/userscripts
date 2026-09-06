// ==UserScript==
// @name         X (Twitter) — Control Panel, Wide Layout & Age Bypass
// @namespace    x-declutter-wide
// @version      3.9.0
// @author       oguilhermelima
// @description  X/Twitter control panel for a wider layout, decluttered sidebars, live preferences, and sensitive-content handling.
// @match        https://x.com/*
// @match        https://twitter.com/*
// @run-at       document-start
// @grant        GM_addStyle
// @grant        unsafeWindow
// ==/UserScript==
// NOTE: precisa de unsafeWindow (NÃO @grant none). A CSP do X (script-src 'nonce-...')
// BLOQUEIA injeção inline, então @grant none cai no contexto isolado do gerenciador e os
// hooks (fetch/XHR) patcham globais que NÃO são os da página → no Firefox o script "roda" mas
// não tem efeito. Com unsafeWindow o sandbox enxerga a window real. E NUNCA mutamos objeto da
// página (no Firefox a escrita vira "expando" invisível pro Xray): reescrevemos a STRING da
// resposta e, no fetch, devolvemos um Response NOVO da própria página com o corpo já corrigido.

(function () {
    "use strict";

    if (window.top !== window.self) return;   // ignore embedded iframes (platform.*)

    // ---- tiny helpers ---------------------------------------------------- //
    const addStyle = (css) => {
        if (typeof GM_addStyle === "function") return GM_addStyle(css);
        const s = document.createElement("style");
        s.textContent = css;
        (document.head || document.documentElement).appendChild(s);
    };
    const debounce = (fn, ms) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };
    const el = (tag, props = {}, ...kids) => {
        const n = document.createElement(tag);
        for (const [k, v] of Object.entries(props)) {
            if (v == null) continue;
            if (k === "class") n.className = v;
            else if (k === "html") n.innerHTML = v;
            else if (k === "style" && typeof v === "object") Object.assign(n.style, v);
            else if (k.startsWith("on") && typeof v === "function") n.addEventListener(k.slice(2).toLowerCase(), v);
            else n.setAttribute(k, v);
        }
        for (const kid of kids) if (kid != null) n.append(kid.nodeType ? kid : document.createTextNode(String(kid)));
        return n;
    };

    // Material gear glyph (filled — reads correctly inside X's fill:currentColor svgs).
    const GEAR = '<g><path d="M19.14 12.94c.04-.3.06-.61.06-.94 0-.32-.02-.64-.07-.94l2.03-1.58a.49.49 0 0 0 .12-.61l-1.92-3.32a.488.488 0 0 0-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54a.484.484 0 0 0-.48-.41h-3.84a.484.484 0 0 0-.48.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96a.488.488 0 0 0-.59.22L2.74 8.87a.49.49 0 0 0 .12.61l2.03 1.58c-.05.3-.09.63-.09.94s.02.64.07.94l-2.03 1.58a.49.49 0 0 0-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6z"></path></g>';

    // Ícones do rail de categorias do painel — ordem = ordem de GROUPS (Layout, Mídia, Sidebar esq.,
    // Sidebar dir., Timeline, Compartilhar, Menu "Mais", Conteúdo). Cada um é o `d` de um <path> 24x24.
    const ICONS = [
        "M3 5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5zm2 0v14h6V5H5zm8 0v14h6V5h-6z",   // Layout (colunas)
        "M8 5v14l11-7z",                                                                                          // Mídia (play)
        "M3 4h18v16H3V4zm2 2v12h5V6H5z",                                                                          // Sidebar esquerda
        "M3 4h18v16H3V4zm16 2h-5v12h5V6z",                                                                        // Sidebar direita
        "M3 5h18v2H3V5zm0 6h18v2H3v-2zm0 6h12v2H3v-2z",                                                           // Timeline (lista)
        "M18 16.08c-.76 0-1.44.3-1.96.77L8.91 12.7c.05-.23.09-.46.09-.7s-.04-.47-.09-.7l7.05-4.11c.54.5 1.25.81 2.04.81 1.66 0 3-1.34 3-3s-1.34-3-3-3-3 1.34-3 3c0 .24.04.47.09.7L8.04 9.81C7.5 9.31 6.79 9 6 9c-1.66 0-3 1.34-3 3s1.34 3 3 3c.79 0 1.5-.31 2.04-.81l7.12 4.16c-.05.21-.08.43-.08.66 0 1.61 1.31 2.92 2.92 2.92s2.92-1.31 2.92-2.92-1.31-2.92-2.92-2.92z",  // Compartilhar
        "M12 2l8 3v6c0 5-3.4 9.7-8 11-4.6-1.3-8-6-8-11V5l8-3z",                                                   // Conteúdo (escudo)
    ];

    // ===================================================================== //
    //  Settings model — the single source of truth for the panel + behaviour //
    // ===================================================================== //
    // `hide:true` items map to an html.tw-<key> class that gates a CSS rule below.
    const GROUPS = [
        { title: "Layout", items: [
            { key: "wide",        label: "Largura ampla",            type: "toggle", def: false },
            // px da COLUNA DE LEITURA, não % da tela: 80% quer dizer coisas opostas num 14" e num
            // 32", enquanto "700px de timeline" quer dizer a mesma coisa nos dois. perScreen: o
            // valor é guardado por monitor (settings.screens), então ajustar no notebook não mexe
            // no que ficou bom no monitor grande.
            { key: "centerW",     label: "Coluna central (px)",      type: "slider", min: 500, max: 1800, step: 20, def: 700, dep: "wide", perScreen: true },
            { key: "centerFont",  label: "Ampliar conteúdo central",  type: "toggle", def: false },
            { key: "centerScale", label: "Tamanho central (%)",       type: "slider", min: 100, max: 160, def: 120, dep: "centerFont" },
        ] },
        { title: "Mídia", items: [
            { key: "capMedia",    label: "Limitar altura de mídia",  type: "toggle", def: false, hide: true },
            { key: "mediaHeight", label: "Altura máx. de mídia (vh)", type: "slider", min: 40, max: 95, def: 80, dep: "capMedia" },
            { key: "blurMedia",   label: "Imagem única: centrar + fundo blur", type: "toggle", def: false, hide: true },
        ] },
        { title: "Sidebar esquerda", items: [
            { key: "sidebarMgr",      label: "Itens da sidebar",            type: "sidebar" },
            { key: "leftFont",        label: "Ampliar (esta sidebar)",      type: "toggle", def: false },
            { key: "leftScale",       label: "Tamanho (%)",                 type: "slider", min: 100, max: 160, def: 120, dep: "leftFont" },
        ] },
        { title: "Sidebar direita", items: [
            { key: "hidePremiumRight",  label: "Esconder card Premium",        type: "toggle", def: false, hide: true },
            { key: "hideTrending",      label: "Esconder Assuntos do momento", type: "toggle", def: false, hide: true },
            { key: "hideWhoToFollow",   label: "Esconder Quem seguir",         type: "toggle", def: false, hide: true },
            { key: "hideRightSidebar",  label: "Esconder sidebar inteira",     type: "toggle", def: false, hide: true },
            { key: "rightFont",         label: "Ampliar (esta sidebar)",       type: "toggle", def: false },
            { key: "rightScale",        label: "Tamanho (%)",                  type: "slider", min: 100, max: 160, def: 120, dep: "rightFont" },
        ] },
        { title: "Timeline", items: [
            { key: "homeDefault",     label: "Timeline padrão (home)",       type: "select", def: "foryou",
              options: [{ value: "foryou", label: "Para você" }, { value: "following", label: "Seguindo" }] },
            { key: "hideForYou",      label: 'Esconder aba "Para você"',     type: "toggle", def: false, hide: true },
            { key: "hideViews",       label: "Esconder contador de views",   type: "toggle", def: false, hide: true },
            { key: "hideCounts",      label: "Esconder contadores (resp/RT/like)", type: "toggle", def: false, hide: true },
            { key: "hideGrokActions", label: "Esconder botão Grok nos posts", type: "toggle", def: false, hide: true },
            { key: "hideBookmark",    label: "Esconder botão salvar",        type: "toggle", def: false, hide: true },
            { key: "hideShare",       label: "Esconder botão compartilhar",  type: "toggle", def: false, hide: true },
            { key: "hideParody",      label: "Esconder selo de paródia",     type: "toggle", def: false, hide: true },
            { key: "hideFloaters",    label: "Esconder botões flutuantes (Grok/chat)", type: "toggle", def: false, hide: true },
            { key: "hideDiscover",    label: '"Discover more" (sugeridos)',  type: "toggle", def: false },
        ] },
        { title: "Compartilhar", items: [
            { key: "directShare",     label: "Direct copy",               type: "toggle", def: true },
            { key: "shareNoTrackers", label: "Remove tracking from link",  type: "toggle", def: true },
        ] },
        { title: "Conteúdo", items: [
            { key: "ageBypass", label: "Bypass de idade / sensível", type: "toggle", def: false },
        ] },
    ];
    const ITEMS = GROUPS.flatMap((g) => g.items);
    const HIDE_KEYS = ITEMS.filter((i) => i.hide).map((i) => i.key);
    const DEFAULTS = Object.fromEntries(ITEMS.map((i) => [i.key, i.def]));

    const LS_KEY = "tw-panel-settings-v1";
    let settings = { ...DEFAULTS };
    try { Object.assign(settings, JSON.parse(localStorage.getItem(LS_KEY) || "{}")); } catch (e) {}
    const save = () => { try { localStorage.setItem(LS_KEY, JSON.stringify(settings)); } catch (e) {} };

    // ---- preferências POR MONITOR (hoje só a largura) ---------------------- //
    // A chave é o tamanho da TELA (não o da janela): mover a janela ou redimensioná-la não troca
    // de perfil, mas arrastar pro outro monitor troca. Uma tela ainda sem registro herda o valor
    // corrente — o primeiro ajuste feito nela é que grava o dela.
    const PER_SCREEN = ITEMS.filter((i) => i.perScreen).map((i) => i.key);
    const screenKey = () => ((screen && screen.width) || 0) + "x" + ((screen && screen.height) || 0);
    let curScreen = "";
    function syncScreen() {
        const k = screenKey();
        if (k === curScreen) return false;
        curScreen = k;
        const saved = (settings.screens && settings.screens[k]) || null;
        for (const key of PER_SCREEN) if (saved && typeof saved[key] === "number") settings[key] = saved[key];
        return true;
    }
    function saveScreenPrefs() {
        const box = settings.screens || (settings.screens = {});
        const cur = box[screenKey()] || (box[screenKey()] = {});
        for (const key of PER_SCREEN) cur[key] = settings[key];
        save();
    }
    syncScreen();   // já no document-start: a largura desta tela entra antes do primeiro paint
    let lastPath = location.pathname;   // to detect SPA navigation into the home timeline

    // ===================================================================== //
    //  BYPASS de idade / conteúdo sensível — porta Firefox-safe do            //
    //  "Pure Twitter (X) Age Bypass" (que só roda no Chromium).               //
    //  Por que o original morre no Firefox: ele usa @grant none → a CSP do X  //
    //  (script-src 'nonce-…') BLOQUEIA a injeção na página → cai no contexto   //
    //  isolado → os hooks (fetch/XHR) patcham globais que NÃO são os da página.//
    //  Aqui rodamos no sandbox com unsafeWindow (alcança a window real) e      //
    //  NUNCA mutamos objeto da página (no Firefox isso vira "expando" invisível//
    //  pro Xray): interceptamos fetch + XHR e reescrevemos a STRING da         //
    //  resposta, desembrulhando TweetWithVisibilityResults → Tweet. Opt-in;    //
    //  ligar/desligar pede RELOAD.                                             //
    // ===================================================================== //
    let ageBypassInstalled = false;
    function installAgeBypass() {
        const W = (typeof unsafeWindow !== "undefined") ? unsafeWindow : window;
        // RE-TENTÁVEL: só pula se os patches de protótipo estão MESMO aplicados. No F5, a 1ª tentativa
        // pode perder a corrida pro bundle do X; aí applySettings/refresh re-chamam e isto reaplica o
        // que faltou (cada bloco abaixo se auto-guarda por __twAge/__twAgeX). O patch lê settings.ageBypass ao vivo.
        const okR = !!(W.Response && W.Response.prototype && W.Response.prototype.__twAge);
        const okX = !!(W.XMLHttpRequest && W.XMLHttpRequest.prototype && W.XMLHttpRequest.prototype.__twAgeX);
        if (ageBypassInstalled && okR && okX) return;
        ageBypassInstalled = true;
        const TARGET = "TweetWithVisibilityResults";
        const GQL = "/graphql/";
        // Firefox: pra CRUZAR função/objeto pro realm da página precisamos de exportFunction/cloneInto.
        // (No Chrome eles não existem — página e userscript dividem o realm, então dispensam.)
        const hasExport = (typeof exportFunction === "function");
        const hasClone  = (typeof cloneInto === "function");

        // DIAGNÓSTICO: digite  twAgeStats()  no console do x.com.
        //  • env.respHook/xhrHook:true → os patches de PROTÓTIPO entraram.
        //  • respGql/xhrGql > 0    → estamos VENDO as respostas GraphQL (transporte certo, timing-immune).
        //  • wrappersSeen > 0      → o invólucro de idade CHEGA na resposta → dá pra desembrulhar (deve funcionar).
        //  • respGql/xhrGql > 0 mas wrappersSeen = 0 → conteúdo NÃO vem na resposta (gate no servidor → só VPN).
        const stats = {
            env: { exportFn: hasExport, cloneInto: hasClone, respHook: false, xhrHook: false },  // ambiente / hooks
            respCalls: 0, xhrReads: 0,                            // TOTAL de .text()/.json() e leituras de XHR pelos nossos protótipos
            respGql: 0, xhrGql: 0,                                // respostas GraphQL interceptadas (fetch / XHR)
            rewrites: 0,                                          // respostas efetivamente reescritas (houve unwrap)
            wrappersSeen: 0, unwraps: 0,                          // invólucros vistos / desembrulhados
            ops: [], respSample: [], xhrSample: [],               // operations / amostra de URLs vistas em cada protótipo
        };
        // O LEITOR precisa ser EXPORTADO: senão o console (realm da página) não consegue chamar uma
        // função do sandbox → "Permission denied to access object". Devolve STRING (primitivo atravessa ok).
        const reader = function () { const s = JSON.stringify(stats); console.log("[tw-age]", s); return s; };
        try { W.twAgeStats = hasExport ? exportFunction(reader, W) : reader; } catch (e) {}
        // export realm-aware: no FF, função que cruza pra página vai por exportFunction; no Chrome passthrough.
        const xfn = hasExport ? (f) => exportFunction(f, W) : (f) => f;
        const recOp = (url) => { try { const op = url.split("?")[0].split("/").pop(); if (op && stats.ops.indexOf(op) === -1) stats.ops.push(op); } catch (e) {} };
        const recSample = (arr, url) => { try { const p = String(url || "").split("?")[0].replace(/^https?:\/\/[^/]+/, ""); if (p && arr.length < 10 && arr.indexOf(p) === -1) arr.push(p); } catch (e) {} };

        // reviver do JSON.parse: troca { __typename:"TweetWithVisibilityResults", tweet:{...} }
        // pelo tweet cru — é ESSE invólucro que esconde o post atrás do interstício "Mostrar"→QR.
        const reviver = (key, value) => {
            if (value && typeof value === "object" && value.__typename === TARGET) {
                stats.wrappersSeen++;
                if (value.tweet && typeof value.tweet === "object") {
                    value.tweet.__typename = "Tweet";
                    stats.unwraps++;
                    return value.tweet;
                }
            }
            return value;
        };
        // reescreve uma STRING JSON e devolve STRING (atravessa pra página sem Xray). Sem o marcador,
        // devolve os bytes ORIGINAIS intactos (não re-serializa à toa). Usa o JSON do SANDBOX (não
        // W.JSON): a árvore parseada é limpa, sem Xray, e o stringify produz uma string pura.
        const rewrite = (raw) => {
            if (typeof raw !== "string" || raw.indexOf(TARGET) === -1) return raw;
            try {
                const before = stats.unwraps;
                const obj = JSON.parse(raw, reviver);
                return stats.unwraps > before ? JSON.stringify(obj) : raw;
            } catch (e) { return raw; }
        };
        // ===== PATCH NO PROTÓTIPO (timing-immune) — a sacada que faltava =====
        // O X CAPTURA a referência de window.fetch/XMLHttpRequest ANTES do nosso override entrar (no
        // Firefox o sandbox entra tarde) → sobrescrever os GLOBAIS não pega o GraphQL. MAS toda resposta,
        // venha de qual fetch/instância vier, passa pelo MESMO protótipo. Patchando Response.prototype
        // .text()/.json() e XMLHttpRequest.prototype responseText/response (a camada que o PHR usa no XHR),
        // pegamos a resposta independente de QUEM a criou — imune a timing. Só transformamos a STRING do
        // corpo (zero reconstrução de Response → zero "Permission denied"). Guard por URL: fora de
        // /graphql/, devolve o original intacto (não tocamos em nada que não seja GraphQL).

        // ---------- fetch: Response.prototype.text / .json ----------
        try {
            const Rproto = W.Response && W.Response.prototype;
            if (Rproto && !Rproto.__twAge) {
                const origText = Rproto.text, origJson = Rproto.json;
                const urlOf = (r) => { try { return r.url || ""; } catch (e) { return ""; } };
                // defineAs cruza o Xray corretamente (a página passa a enxergar nosso método no protótipo).
                const defM = (name, fn) => { try { if (hasExport) exportFunction(fn, Rproto, { defineAs: name }); else Object.defineProperty(Rproto, name, { configurable: true, writable: true, value: fn }); } catch (e) {} };
                defM("text", function () {
                    const self = this, url = urlOf(self);
                    stats.respCalls++; recSample(stats.respSample, url);
                    if (!settings.ageBypass || url.indexOf(GQL) === -1) return origText.call(self);
                    stats.respGql++; recOp(url);
                    return new W.Promise(xfn(function (resolve, reject) {
                        origText.call(self).then(xfn(function (text) {
                            try { const out = (text && text.indexOf(TARGET) !== -1) ? rewrite(text) : text; if (out !== text) stats.rewrites++; resolve(out); }
                            catch (e) { resolve(text); }
                        }), xfn(function (e) { reject(e); }));
                    }));
                });
                defM("json", function () {
                    const self = this, url = urlOf(self);
                    stats.respCalls++; recSample(stats.respSample, url);
                    if (!settings.ageBypass || url.indexOf(GQL) === -1) return origJson.call(self);
                    stats.respGql++; recOp(url);
                    return new W.Promise(xfn(function (resolve, reject) {
                        origText.call(self).then(xfn(function (text) {
                            try { const out = (text && text.indexOf(TARGET) !== -1) ? rewrite(text) : text; if (out !== text) stats.rewrites++; resolve(W.JSON.parse(out)); }
                            catch (e) { origJson.call(self).then(xfn(function (o) { resolve(o); }), xfn(function (er) { reject(er); })); }
                        }), xfn(function (e) { reject(e); }));
                    }));
                });
                try { Rproto.__twAge = true; stats.env.respHook = true; } catch (e) {}
            }
        } catch (e) {}

        // ---------- XHR: XMLHttpRequest.prototype responseText / response (getters) ----------
        // Patcha o GETTER no protótipo (não subclassa o construtor — isso o X capturava cedo e furava).
        try {
            const Xproto = W.XMLHttpRequest && W.XMLHttpRequest.prototype;
            if (Xproto && !Xproto.__twAgeX) {
                const dText = Object.getOwnPropertyDescriptor(Xproto, "responseText");
                const dResp = Object.getOwnPropertyDescriptor(Xproto, "response");
                const dURL  = Object.getOwnPropertyDescriptor(Xproto, "responseURL");
                const tgt   = hasExport ? (Xproto.wrappedJSObject || Xproto) : Xproto;   // FF: define no protótipo CRU
                const urlOf = (xhr) => { try { return (dURL && dURL.get.call(xhr)) || ""; } catch (e) { return ""; } };
                // Desembrulha IN-PLACE no objeto JÁ PARSEADO (responseType 'json'). Escreve no
                // wrappedJSObject (waived) pra mutação ser VISÍVEL à página — no FF escrever no objeto
                // Xray-wrapped viraria expando invisível. Só rearranja objetos da própria página.
                const unwrapObj = (root) => {
                    const obj = (root && root.wrappedJSObject) ? root.wrappedJSObject : root;
                    let count = 0;
                    const walk = (node, depth) => {
                        if (!node || typeof node !== "object" || depth > 60) return;
                        let keys; try { keys = Object.keys(node); } catch (e) { return; }
                        for (let i = 0; i < keys.length; i++) {
                            const k = keys[i];
                            let child; try { child = node[k]; } catch (e) { continue; }
                            if (!child || typeof child !== "object") continue;
                            if (child.__typename === TARGET && child.tweet && typeof child.tweet === "object") {
                                stats.wrappersSeen++;
                                try { child.tweet.__typename = "Tweet"; node[k] = child.tweet; count++; walk(child.tweet, depth + 1); continue; } catch (e) {}
                            }
                            walk(child, depth + 1);
                        }
                    };
                    try { walk(obj, 0); } catch (e) {}
                    stats.unwraps += count;
                    return count;
                };
                const make = (native) => function () {
                    const raw = native.get.call(this);   // pode LANÇAR (responseText em XHR 'json') → propaga = nativo
                    if (!settings.ageBypass) return raw;
                    let url = ""; try { url = urlOf(this); } catch (e) { return raw; }
                    if (this.readyState === 4) { stats.xhrReads++; recSample(stats.xhrSample, url); }
                    if (url.indexOf(GQL) === -1) return raw;
                    // STRING (responseType '' ou 'text') → reescreve a string
                    if (typeof raw === "string") {
                        if (!raw || raw.indexOf(TARGET) === -1) return raw;
                        stats.xhrGql++; recOp(url);
                        try { const out = rewrite(raw); if (out !== raw) stats.rewrites++; return out; } catch (e) { return raw; }
                    }
                    // OBJETO (responseType 'json') → desembrulha in-place no objeto da página (1x por XHR)
                    if (raw && typeof raw === "object" && !this.__twUnwrapped) {
                        stats.xhrGql++; recOp(url);
                        try { if (unwrapObj(raw) > 0) stats.rewrites++; } catch (e) {}
                        try { this.__twUnwrapped = true; } catch (e) {}
                    }
                    return raw;
                };
                const defG = (name, native) => { if (!native || !native.get) return; try { Object.defineProperty(tgt, name, { configurable: true, get: xfn(make(native)) }); } catch (e) {} };
                defG("responseText", dText);
                defG("response", dResp);
                try { Xproto.__twAgeX = true; stats.env.xhrHook = true; } catch (e) {}
            }
        } catch (e) {}
    }
    if (settings.ageBypass) installAgeBypass();   // JÁ no document-start (antes do bundle do X pegar os hooks)

    // ===================================================================== //
    //  CSS — every hide is gated on an html.tw-<key> class, so toggling a    //
    //  preference just flips a class (instant, no re-injection). Hashed X    //
    //  class names are never used; only data-testid / href / aria / role.    //
    // ===================================================================== //
    addStyle(`
        /* ---------- decluttering hides (apply at every width) ---------- */
        html.tw-hidePremiumRight [role="complementary"]:has(a[href*="/i/premium_sign_up"]),
        html.tw-hidePremiumRight aside[aria-label="Assine o Premium"] { display: none !important; }
        html.tw-hideTrending [aria-label="Assuntos do Momento"] { display: none !important; }
        /* Who-to-follow: hide the whole card (the bordered/bg wrapper), not just the
           inner <aside> — otherwise an empty card is left behind. */
        html.tw-hideWhoToFollow div:has(> div > aside[aria-label="Quem seguir"]),
        html.tw-hideWhoToFollow aside[aria-label="Quem seguir"] { display: none !important; }
        html.tw-hideRightSidebar [data-testid="sidebarColumn"] { display: none !important; }

        /* ---------- TAMANHO por região: 3 controles de % (central / esquerda / direita) ----------
           "Aumentar a fonte" = só texto (ícones e larguras das colunas ficam intactos). Escala
           PROPORCIONAL via calc(1em * --scale), aplicada só nos nós-FOLHA de texto (span/time/input
           SEM filho elemento):
            • 1em = tamanho herdado do contexto → cada texto cresce na MESMA proporção, mantendo a
              hierarquia (título continua maior que corpo) sem precisar saber o px de cada um;
            • :not(:has(*)) garante 1 nível só → não compõe 1.2×1.2×… em spans aninhados do X;
            • scale ≥ 1 → nunca encolhe. Gated na classe: toggle off = fonte nativa. */
        /* CENTRAL: pega TODO o texto do primaryColumn (header da página, input de busca/compose, tweetText,
           bio, trends, quem-seguir, contadores…) — antes só o tweetText/User-Name pegavam. svg = ícones em
           "em" (a maioria do X é 1.25em → font-size no <svg> escala o ícone junto). line-height relativo p/
           a fonte grande não encavalar em texto multi-linha. Mídia/avatares (img/bg, não em) ficam intactos
           — altura de mídia é o capMedia que controla. */
        html.tw-centerFont [data-testid="primaryColumn"] :is(span, time, input, textarea, [dir]):not(:has(*)) {
            font-size: calc(1em * var(--tw-center-scale, 1)) !important; line-height: 1.3 !important;
        }
        html.tw-centerFont [data-testid="primaryColumn"] svg { font-size: calc(1em * var(--tw-center-scale, 1)) !important; }
        html.tw-leftFont header[role="banner"] :is(span, time):not(:has(*)) {
            font-size: calc(1em * var(--tw-left-scale, 1)) !important;
        }
        html.tw-rightFont [data-testid="sidebarColumn"] :is(span, time, input):not(:has(*)) {
            font-size: calc(1em * var(--tw-right-scale, 1)) !important;
        }

        /* Floating bottom-right buttons (Grok quick-access + chat dock) */
        html.tw-hideFloaters [data-testid="GrokDrawer"],
        html.tw-hideFloaters [data-testid="chat-drawer-root"] { display: none !important; }
        html.tw-home.tw-hideForYou [data-testid="primaryColumn"] [role="tablist"] [role="presentation"]:first-child { display: none !important; }
        html.tw-hideViews [data-testid="primaryColumn"] a[href$="/analytics"] { display: none !important; }
        html.tw-hideGrokActions [data-testid="primaryColumn"] [aria-label="Ações do Grok"] { display: none !important; }
        html.tw-hideBookmark [data-testid="primaryColumn"] [data-testid="bookmark"] { display: none !important; }
        html.tw-hideShare [data-testid="primaryColumn"] button[aria-label="Compartilhar post"] { display: none !important; }
        /* reply / repost / like counts (keep the buttons, drop the numbers) */
        html.tw-hideCounts [data-testid="primaryColumn"] [data-testid="reply"] [data-testid="app-text-transition-container"],
        html.tw-hideCounts [data-testid="primaryColumn"] [data-testid="retweet"] [data-testid="app-text-transition-container"],
        html.tw-hideCounts [data-testid="primaryColumn"] [data-testid="like"] [data-testid="app-text-transition-container"] { display: none !important; }
        /* "Parody account" label under the name */
        html.tw-hideParody [data-testid="primaryColumn"] a[href*="rules-and-policies/authenticity"] { display: none !important; }


        /* ---------- LARGURA (desktop; mobile/tablet ficam nativos) ----------
           O desktop do X é UMA linha flex — o "shell" — com dois itens:
               [ header[role=banner] = placeholder da nav ][ main[role=main] = conteúdo ]
           A nav que você VÊ é position:fixed SEM left: ela se ancora na posição ESTÁTICA do
           header. Ou seja, o header é só um espaço reservado no fluxo — mexer nele move a nav.

           MODELO daqui, três regras:
             1. o SHELL mede laterais + coluna central (px), limitado à janela, e é centrado com
                margin auto → margem esquerda == direita por construção, em qualquer janela e
                qualquer zoom. A medida é a COLUNA DE LEITURA em px, não % da tela: "80%" quer
                dizer coisas opostas num 14" e num 32", "700px de timeline" quer dizer a mesma
                coisa nos dois (e cada monitor guarda o seu valor — ver PER_SCREEN);
             2. as DUAS colunas laterais reservam o mesmo total (--tw-navcol-w == sidebar + gap,
                medidos, não chutados) → a coluna central cai no centro EXATO do shell, com o
                mesmo respiro dos dois lados. A nav é mais estreita que a sidebar, então ela fica
                alinhada à direita da sua coluna (encostada na timeline, como no X nativo) e a
                folga sobra na borda externa;
             3. o main come todo o resto — nenhum cap nativo no meio do caminho.

           Os dois jeitos de errar isso — os dois já aconteceram aqui:
             • alargar só o bloco de dentro do main: ele TRANSBORDA do container que o X
               centraliza, e transbordo só vaza pra um lado (o direito);
             • deixar o header com o flex-grow:1 nativo: ele engole a folga inteira do shell e
               empurra a nav pra dentro da tela, com o conteúdo colado na direita.

           % e não vw (vw conta a barra de rolagem). E nada de "− 290px" de nav chumbado.

           Dois seletores pro shell: data-tw-shell (achado por JS = menor ancestral comum de
           header+main, vale pra qualquer árvore) e o :has() equivalente, que já casa no
           PRIMEIRO paint, antes de o JS achar o nó. */
        @media (min-width: 1280px) {
            html.tw-wide [data-tw-shell],
            html.tw-wide div:has(> header[role="banner"]):has(> main[role="main"]) {
                width: min(100%, calc(var(--tw-lat, 748px) + var(--tw-center-w, 700px))) !important;
                max-width: min(100%, calc(var(--tw-lat, 748px) + var(--tw-center-w, 700px))) !important;
                margin-left: auto !important; margin-right: auto !important;
            }
            /* wrappers ACIMA do shell não podem recapar a largura que acabamos de definir */
            html.tw-wide [data-tw-shellup] { max-width: none !important; }
            /* COLUNA DA NAV: item rígido, com a MESMA reserva da coluna da direita (side + gap).
               Sem isso o flex-grow:1 nativo do header come a folga do shell e empurra a nav pra
               dentro da tela. A nav é alinhada à direita da coluna (justify-content/margin auto —
               o X já faz isso sozinho, aqui é só garantia), então ela encosta na timeline com o
               mesmo respiro que a sidebar direita tem do outro lado; a folga (nav é mais estreita
               que a sidebar) fica na borda externa. data-tw-navcol é o FILHO do shell que contém
               o header — pode ser o próprio header ou um wrapper, se o X mudar a árvore. */
            html.tw-wide [data-tw-navcol],
            html.tw-wide header[role="banner"] {
                box-sizing: border-box !important;
                flex: 0 0 var(--tw-navcol-w, 374px) !important;
                width: var(--tw-navcol-w, 374px) !important; max-width: var(--tw-navcol-w, 374px) !important;
                padding-right: var(--tw-gap, 24px) !important;
                justify-content: flex-end !important;
            }
            html.tw-wide header[role="banner"] > * { margin-left: auto !important; }
            /* header ANINHADO na coluna: quem carrega largura/padding é a coluna, ele só preenche
               (senão o padding entraria duas vezes e a nav sairia do lugar) */
            html.tw-wide [data-tw-navcol] header[role="banner"] {
                width: 100% !important; max-width: none !important; flex: 1 1 auto !important; padding-right: 0 !important;
            }
            /* main: elástico, e sem nenhum cap nativo no meio do caminho (a largura vem do shell) */
            html.tw-wide [data-tw-maincol],
            html.tw-wide main[role="main"] { max-width: none !important; flex: 1 1 auto !important; min-width: 0 !important; }
            html.tw-wide main[role="main"] > div { width: 100% !important; max-width: 100% !important; }
            /* primaryColumn: elástico (min-width:0 = pode encolher em vez de estourar o shell) */
            html.tw-wide [data-testid="primaryColumn"] {
                max-width: none !important; width: auto !important; flex: 1 1 auto !important; min-width: 0 !important;
            }
            /* COLUNA DA DIREITA: fica na largura NATIVA (é ela que serve de medida pra esquerda —
               ver measureSide; forçar um número aqui só estreitaria os cards à toa). Só o gap é
               nosso, e é o mesmo dos dois lados. */
            html.tw-wide [data-testid="sidebarColumn"] { margin-left: var(--tw-gap, 24px) !important; flex-shrink: 0 !important; }
            /* sidebar não cabe no shell (ou foi desligada): a coluna da nav volta ao tamanho da
               nav — manter os 350 ali deixaria uma folga sem par do outro lado */
            html.tw-wide.tw-nosb [data-testid="sidebarColumn"] { display: none !important; }
            html.tw-wide [data-testid="primaryColumn"] div:has(> section) { max-width: none !important; }
            /* PERFIL: a regra acima tira o cap de 600px do container que, no perfil, também embrulha o
               BANNER (capa). Sem cap, o banner 3:1 (padding-bottom:33%) estica até a largura inteira e
               domina a tela. Recapa só a ALTURA do banner: a aspect-box reserva 3:1, mas max-height +
               overflow cortam e o bg (cover) preenche → faixa de altura nativa, header/tweets ainda largos.
               Mesmo padrão do capMedia. Banner = o <a href$="/header_photo"> da capa (só existe no perfil). */
            html.tw-wide [data-testid="primaryColumn"] a[href$="/header_photo"] > div {
                max-height: 200px !important; overflow: hidden !important;
            }

            /* Cap media height: the wide column makes photos/videos taller than the
               viewport, so they're never fully visible and X pauses the video on the
               tiniest scroll. Keeping them within the screen height fixes that. */
            html.tw-capMedia [data-testid="primaryColumn"] [data-testid="tweetPhoto"],
            html.tw-capMedia [data-testid="primaryColumn"] [data-testid="videoPlayer"],
            html.tw-capMedia [data-testid="primaryColumn"] [data-testid="videoComponent"] {
                max-height: var(--tw-media-h, 80vh) !important;
            }
            html.tw-capMedia [data-testid="primaryColumn"] [data-testid="tweetPhoto"] img,
            html.tw-capMedia [data-testid="primaryColumn"] [data-testid="videoPlayer"] video {
                max-height: var(--tw-media-h, 80vh) !important;
                object-fit: contain !important;
            }
            /* A "aspect-box" do X (div com um filho > div[style*=padding-bottom] que RESERVA a altura via
               padding) precisa encolher junto: senão a mídia limitada (max-height) cola no topo e sobra uma
               faixa embaixo (= fundo da página). max-height + overflow:hidden cortam o vão do spacer; o filho
               absolute inset:0 passa a medir a altura limitada. :has([tweetPhoto]) exclui o avatar (que também
               usa padding-bottom, mas não contém tweetPhoto). */
            html.tw-capMedia [data-testid="primaryColumn"] div:has(> div[style*="padding-bottom"]):has([data-testid="tweetPhoto"]) {
                max-height: var(--tw-media-h, 80vh) !important; overflow: hidden !important;
            }

            /* Reddit style: full-width box, blurred backdrop, media contained + centered.
               Both images and videos sit in a tweetPhoto wrapper (.tw-blur-bg). X sizes
               it via an inline max-width div + an aspect "sized box"; expand both to the
               full post width via :has so there's room around the media for the blur. */
            html.tw-blurMedia [data-testid="primaryColumn"] div[style*="max-width:"]:has([data-testid="tweetPhoto"].tw-blur-bg) {
                max-width: 100% !important; width: 100% !important; align-self: stretch !important;
            }
            html.tw-blurMedia [data-testid="primaryColumn"] div:has(> div > [data-testid="tweetPhoto"].tw-blur-bg) {
                width: 100% !important; height: var(--tw-media-h, 80vh) !important; overflow: hidden !important;
            }
            /* mata o spacer (padding-bottom) da aspect-box dentro do container do blur — senão ele reserva a
               altura nativa e a imagem, já em 80vh, fica no topo com faixa embaixo (mesmo bug do capMedia). */
            html.tw-blurMedia [data-testid="primaryColumn"] div:has(> div > [data-testid="tweetPhoto"].tw-blur-bg) > div[style*="padding-bottom"] {
                display: none !important;
            }
            html.tw-blurMedia [data-testid="primaryColumn"] [data-testid="tweetPhoto"].tw-blur-bg {
                position: relative !important; overflow: hidden !important;
                width: 100% !important; max-width: 100% !important;
                height: var(--tw-media-h, 80vh) !important; border-radius: 16px;
            }
            html.tw-blurMedia [data-testid="primaryColumn"] [data-testid="tweetPhoto"].tw-blur-bg::before {
                content: ""; position: absolute; inset: 0; z-index: 0;
                background: var(--tw-img) center / cover no-repeat;
                filter: blur(34px) brightness(.55) saturate(1.25); transform: scale(1.3);
            }
            /* image: the visible picture is a background-image <div> (the <img> is an
               invisible drag/save overlay) — contain it; the transparent letterbox
               around it lets the blur show through. */
            html.tw-blurMedia [data-testid="primaryColumn"] [data-testid="tweetPhoto"].tw-blur-bg:not(.tw-blur-video) > div {
                position: absolute !important; inset: 0 !important; z-index: 1 !important;
                background-size: contain !important; background-position: center !important; background-repeat: no-repeat !important;
            }
            /* video: drop the aspect spacers, make every nested wrapper fill the box, then
               contain the <video> with a transparent bg so the blur shows in the bars. */
            html.tw-blurMedia [data-testid="primaryColumn"] [data-testid="tweetPhoto"].tw-blur-video div[style*="padding-bottom"] { display: none !important; }
            html.tw-blurMedia [data-testid="primaryColumn"] [data-testid="tweetPhoto"].tw-blur-video > div,
            html.tw-blurMedia [data-testid="primaryColumn"] [data-testid="tweetPhoto"].tw-blur-video > div > div,
            html.tw-blurMedia [data-testid="primaryColumn"] [data-testid="tweetPhoto"].tw-blur-video [data-testid="videoPlayer"] > div {
                position: relative !important; width: 100% !important; height: 100% !important; z-index: 1;
            }
            /* No z-index on the <video>: it must stay BELOW the controls overlay (which
               has no z-index, so DOM order keeps it on top) or the play button becomes
               unclickable. The whole subtree already sits above the blur via the
               wrappers' z-index above. */
            html.tw-blurMedia [data-testid="primaryColumn"] [data-testid="tweetPhoto"].tw-blur-video video {
                object-fit: contain !important; background: transparent !important;
            }
        }

        /* ---------- Fullscreen: a mídia ocupa a TELA INTEIRA ----------
           Em tela cheia o CONTAINER do player vai pro top-layer e preenche, mas nossos caps
           (capMedia/blurMedia: max-height 80vh + overflow hidden nas aspect-box) continuam
           valendo no <video> e nos wrappers internos → o vídeo ficava preso pequeno no topo.
           Aqui zeramos QUALQUER cap dentro de um :fullscreen (e no próprio elemento) pra deixar
           o sizing nativo do X assumir. As regras de cap usam :has() (especificidade alta), então
           subimos a NOSSA pro nível de id com :not(#_) — vence todas sem depender de qual toggle
           está ligado. Fora do @media: fullscreen acontece em qualquer largura. */
        :fullscreen:not(#_),
        :fullscreen:not(#_) * {
            max-width: none !important; max-height: none !important; overflow: visible !important;
        }
        /* blur força height fixo (80vh) nos wrappers → em fullscreen deixa preencher */
        :fullscreen:not(#_) [data-testid="tweetPhoto"].tw-blur-bg,
        [data-testid="tweetPhoto"].tw-blur-bg:fullscreen:not(#_),
        :fullscreen:not(#_) [data-testid="tweetPhoto"].tw-blur-bg video {
            height: 100% !important;
        }

        /* ===================== floating settings panel (revamp) ===================== */
        /* FAB: círculo flat no canto inferior direito, semi-visível e acende no hover (azul do X) + gira. */
        #tw-fab {
            position: fixed; right: 16px; bottom: 16px;
            z-index: 2147483646; width: 44px; height: 44px;
            display: flex; align-items: center; justify-content: center;
            background: #16181c; color: #e7e9ea; border: 1px solid #2f3336;
            border-radius: 50%; cursor: pointer; opacity: .72;
            box-shadow: 0 6px 20px rgba(0,0,0,.45);
            transition: opacity .2s, color .15s, background .15s, border-color .15s, transform .25s;
        }
        #tw-fab:hover { opacity: 1; color: #fff; background: #1d9bf0; border-color: #1d9bf0; transform: rotate(40deg); }
        #tw-fab svg { width: 21px; height: 21px; fill: currentColor; }

        #tw-panel {
            position: fixed; right: 16px; bottom: 68px;
            z-index: 2147483647; width: 384px; max-height: 88vh;
            display: none; flex-direction: column; overflow: hidden;
            background: #16181c; color: #e7e9ea; border: 1px solid #2f3336;
            border-radius: 18px; box-shadow: 0 16px 50px rgba(0,0,0,.65);
            font: 14px/1.3 -apple-system, "Segoe UI", system-ui, sans-serif;
            transform-origin: bottom right;
        }
        #tw-panel.open { display: flex; animation: tw-pop .16s cubic-bezier(.2,.7,.3,1); }
        @keyframes tw-pop { from { opacity: 0; transform: translateY(10px) scale(.97); } to { opacity: 1; transform: none; } }

        .tw-head { display: flex; align-items: center; gap: 10px; padding: 14px 14px 12px; border-bottom: 1px solid #23262b; }
        .tw-logo { width: 28px; height: 28px; border-radius: 9px; background: #1d9bf0; display: flex; align-items: center; justify-content: center; flex: none; }
        .tw-logo svg { width: 17px; height: 17px; fill: #fff; }
        .tw-head b { font-size: 16px; font-weight: 800; flex: 1; }
        .tw-x { all: unset; cursor: pointer; color: #71767b; width: 28px; height: 28px; display: flex; align-items: center; justify-content: center; font-size: 16px; border-radius: 50%; transition: .15s; }
        .tw-x:hover { color: #e7e9ea; background: #2f3336; }

        .tw-search { padding: 10px 14px; border-bottom: 1px solid #23262b; }
        .tw-search > div { display: flex; align-items: center; gap: 8px; background: #202327; border: 1px solid #2f3336; border-radius: 999px; padding: 7px 12px; transition: border-color .15s, background .15s; }
        .tw-search > div:focus-within { border-color: #1d9bf0; background: #16181c; }
        .tw-search svg { width: 16px; height: 16px; fill: #71767b; flex: none; }
        .tw-search input { all: unset; flex: 1; color: #e7e9ea; font: inherit; }
        .tw-search input::placeholder { color: #71767b; }

        .tw-body { display: flex; min-height: 0; flex: 1; }
        .tw-rail { display: flex; flex-direction: column; gap: 4px; padding: 10px 8px; border-right: 1px solid #23262b; flex: none; }
        .tw-tab { all: unset; box-sizing: border-box; width: 40px; height: 40px; border-radius: 11px; display: flex; align-items: center; justify-content: center; color: #71767b; cursor: pointer; transition: background .15s, color .15s; }
        .tw-tab svg { width: 21px; height: 21px; fill: currentColor; }
        .tw-tab:hover { background: #1c1f23; color: #e7e9ea; }
        .tw-tab.active { background: rgba(29,155,240,.15); color: #1d9bf0; }
        .tw-content { flex: 1; min-width: 0; overflow-y: auto; padding: 6px 0 12px; scrollbar-width: thin; scrollbar-color: #3e4144 transparent; }
        .tw-content::-webkit-scrollbar { width: 8px; }
        .tw-content::-webkit-scrollbar-thumb { background: #3e4144; border-radius: 99px; border: 2px solid #16181c; }

        .tw-sec { display: none; }
        .tw-sec-title { font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: .05em; color: #71767b; padding: 12px 16px 6px; }

        .tw-row { display: flex; align-items: center; justify-content: space-between; gap: 10px; padding: 8px 12px; cursor: pointer; border-radius: 9px; margin: 1px 6px; transition: background .12s; }
        .tw-row:hover { background: #1c1f23; }
        .tw-rowlbl { flex: 1; color: #e7e9ea; }
        .tw-row select { background: #202327; color: #e7e9ea; border: 1px solid #2f3336; border-radius: 8px; padding: 5px 8px; font: inherit; cursor: pointer; }
        .tw-row.dim, .tw-slider.dim { opacity: .4; pointer-events: none; }

        .tw-sw { position: relative; width: 38px; height: 22px; flex: none; }
        .tw-sw input { position: absolute; inset: 0; opacity: 0; margin: 0; cursor: pointer; }
        .tw-sw i { position: absolute; inset: 0; border-radius: 999px; background: #3e4144; transition: .18s; pointer-events: none; }
        .tw-sw i::after { content: ""; position: absolute; top: 2px; left: 2px; width: 18px; height: 18px; border-radius: 50%; background: #fff; transition: .18s; box-shadow: 0 1px 2px rgba(0,0,0,.4); }
        .tw-sw input:checked + i { background: #1d9bf0; }
        .tw-sw input:checked + i::after { transform: translateX(16px); }

        .tw-slider { display: flex; flex-direction: column; gap: 8px; padding: 10px 12px; margin: 1px 6px; }
        .tw-slider .lab { display: flex; justify-content: space-between; align-items: center; color: #d0d3d6; }
        .tw-slider .lab .val { color: #1d9bf0; font-weight: 700; background: rgba(29,155,240,.12); border-radius: 6px; padding: 1px 8px; font-size: 13px; min-width: 38px; text-align: center; }
        .tw-slider input[type=range] { width: 100%; accent-color: #1d9bf0; cursor: pointer; }

        .tw-empty { display: none; color: #71767b; text-align: center; padding: 32px 16px; font-size: 14px; }

        .tw-foot { display: flex; align-items: center; justify-content: space-between; padding: 10px 16px; border-top: 1px solid #23262b; }
        .tw-ver { color: #5b5f63; font-size: 12px; }
        .tw-reset { all: unset; cursor: pointer; color: #71767b; font-size: 13px; font-weight: 600; padding: 4px 8px; border-radius: 7px; transition: .15s; }
        .tw-reset:hover { color: #f4212e; background: rgba(244,33,46,.1); }
        .tw-reload { all: unset; cursor: pointer; color: #fff; background: #1d9bf0; font-size: 12px; font-weight: 700; padding: 6px 12px; border-radius: 999px; transition: .15s; }
        .tw-reload:hover { background: #1a8cd8; }

        /* ---------- gerenciador da sidebar (widget do painel) ---------- */
        .tw-sbmgr-wrap { padding: 2px 10px 8px; }
        .tw-sbhint { color: #71767b; font-size: 11px; line-height: 1.4; padding: 2px 6px 10px; }
        .tw-sbrow { display: flex; align-items: center; gap: 8px; padding: 6px; border-radius: 9px; }
        .tw-sbrow:hover { background: #1c1f23; }
        .tw-sbic { width: 22px; height: 22px; flex: none; color: #e7e9ea; display: flex; align-items: center; justify-content: center; }
        .tw-sbic svg { width: 20px; height: 20px; fill: currentColor; }
        .tw-sblbl { flex: 1; min-width: 0; color: #e7e9ea; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; font-size: 13px; }
        .tw-sbmove { all: unset; cursor: pointer; width: 22px; height: 22px; flex: none; display: flex; align-items: center; justify-content: center; border-radius: 6px; color: #71767b; border: 1px solid #2f3336; font-size: 12px; }
        .tw-sbmove:hover:not(:disabled) { color: #fff; background: #1d9bf0; border-color: #1d9bf0; }
        .tw-sbmove:disabled { opacity: .3; cursor: default; }
        .tw-sbseg { display: flex; flex: none; border: 1px solid #2f3336; border-radius: 7px; overflow: hidden; }
        .tw-sbopt { all: unset; cursor: pointer; font-size: 11px; padding: 4px 7px; color: #71767b; transition: .12s; }
        .tw-sbopt:hover { color: #e7e9ea; background: #1c1f23; }
        .tw-sbopt.on { background: #1d9bf0; color: #fff; }

        /* ---------- nosso popup "Mais" ---------- */
        .tw-more-pop { position: fixed; z-index: 2147483646; display: none; flex-direction: column; min-width: 230px; max-height: 70vh; overflow-y: auto;
            background: #16181c; color: #e7e9ea; border: 1px solid #2f3336; border-radius: 16px; box-shadow: 0 16px 50px rgba(0,0,0,.65); padding: 6px;
            font: 15px/1.2 -apple-system, "Segoe UI", system-ui, sans-serif; }
        .tw-more-pop.open { display: flex; }
        .tw-more-row { display: flex; align-items: center; gap: 16px; padding: 11px 14px; border-radius: 9px; color: #e7e9ea; text-decoration: none; cursor: pointer; }
        .tw-more-row:hover { background: #1c1f23; }
        .tw-more-ic { width: 24px; height: 24px; flex: none; display: flex; align-items: center; justify-content: center; color: #e7e9ea; }
        .tw-more-ic svg { width: 24px; height: 24px; fill: currentColor; }
        .tw-more-lbl { font-size: 15px; font-weight: 500; }
        .tw-more-empty { color: #71767b; font-size: 13px; padding: 14px; text-align: center; }

        /* toast de feedback (ex.: "Link copiado") */
        #tw-toast {
            position: fixed; left: 50%; bottom: 80px; transform: translateX(-50%) translateY(8px);
            z-index: 2147483647; background: #16181c; color: #e7e9ea; border: 1px solid #2f3336;
            border-radius: 999px; padding: 8px 16px; font: 14px/1 -apple-system, "Segoe UI", system-ui, sans-serif;
            box-shadow: 0 6px 20px rgba(0,0,0,.45); opacity: 0; pointer-events: none;
            transition: opacity .2s, transform .2s;
        }
        #tw-toast.show { opacity: 1; transform: translateX(-50%) translateY(0); }
    `);

    // ===================================================================== //
    //  Apply settings — flip the html classes + run the JS-driven features   //
    // ===================================================================== //
    const isHome = () => location.pathname === "/home" || location.pathname === "/";
    function applySettings() {
        const de = document.documentElement;
        if (settings.ageBypass) installAgeBypass();   // liga ao vivo (idempotente); efeito total só após reload
        de.classList.toggle("tw-home", isHome());     // scopes the "For You" hide to the home timeline
        HIDE_KEYS.forEach((k) => de.classList.toggle("tw-" + k, !!settings[k]));
        de.classList.toggle("tw-wide", !!settings.wide);
        de.classList.toggle("tw-centerFont", !!settings.centerFont);   // 3 regiões, MESMO modelo de % (calc(1em*scale) no texto-folha): central / esquerda / direita
        de.classList.toggle("tw-leftFont", !!settings.leftFont);
        de.classList.toggle("tw-rightFont", !!settings.rightFont);
        de.style.setProperty("--tw-center-scale", String((settings.centerScale || 120) / 100));
        de.style.setProperty("--tw-left-scale", String((settings.leftScale || 120) / 100));
        de.style.setProperty("--tw-right-scale", String((settings.rightScale || 120) / 100));
        de.style.setProperty("--tw-media-h", (settings.mediaHeight || 80) + "vh");
        applyWidth();
        applyBlurMedia();
        hideDiscover(true);   // mudança de setting → re-aplica display em todas as células "discover"
        applySidebar();       // gerenciador da sidebar (esconde/move/injeta itens conforme navConfig)
        // applyHomeTab() NÃO entra aqui: applySettings roda a CADA controle do painel, então forçaria
        // "Seguindo" de volta toda vez que você mexe em qualquer ajuste estando na home. Vai só na nav
        // (scheduleHomeTab) e nos dois controles que realmente importam (homeDefault/hideForYou).
    }

    // ---- LARGURA: shell = laterais + coluna central (px), centrado --------- //
    // SIDE_BASE/GAP: as duas laterais reservam a MESMA largura (side + gap) — é isso que joga a
    // coluna central no centro EXATO do shell. Como a nav (~276) é mais estreita que a sidebar
    // (350), a folga sobra na borda esquerda e a nav encosta na timeline, igual ao X nativo.
    // TIMELINE_HARD: piso da coluna de leitura. É o único critério pra sidebar sair sozinha, e o
    // teste é contra a JANELA (espaço realmente disponível), nunca contra a largura escolhida —
    // numa tela >= 1280 isso praticamente não dispara: quem tira a sidebar é o toggle do painel.
    const SIDE_BASE = 350;
    const GAP = 24;
    const TIMELINE_HARD = 320;
    // O shell é laterais + coluna central, limitado à janela — tudo em px, resolvido pelo CSS
    // (min(100%, calc(--tw-lat + --tw-center-w))), então reage a resize e zoom sem JS. O JS só
    // publica as duas parcelas: --tw-center-w aqui, --tw-lat em applyColumns.
    let centerW = 700;
    function applyWidth() {
        centerW = Math.min(2400, Math.max(320, Number(settings.centerW) || 700));
        document.documentElement.style.setProperty("--tw-center-w", centerW + "px");
        markShell();
        applyColumns();
        widthHint();
    }

    // Uma fonte de verdade pras duas laterais: mesma reserva dos dois lados (side + gap), com a
    // nav alinhada à direita da sua coluna e a sidebar à esquerda da dela → gaps internos iguais
    // e coluna central centrada. Sem sidebar (toggle ou aperto), a coluna da nav volta ao
    // tamanho da nav: manter os 350 ali deixaria uma folga sem par do outro lado.
    let colsKey = "", latW = 748;
    function applyColumns() {
        const de = document.documentElement;
        measureNav();
        measureSide();
        const side = Math.max(navW, sideW);
        const both = (side + GAP) + (sideW + GAP);   // o que as DUAS colunas laterais ocupam juntas
        // a sidebar só sai se a JANELA não comportar o layout (ou se o toggle pedir) — a largura
        // escolhida nunca amputa nada: quando não cabe, a coluna central é que cede
        const roomy = !settings.hideRightSidebar && window.innerWidth >= both + TIMELINE_HARD;
        const lat = roomy ? both : navW;
        const navcol = roomy ? side + GAP : navW;
        const key = navcol + "|" + lat + "|" + roomy;
        if (key === colsKey) return;      // chamado a cada refresh/resize: sem mudança, não suja estilo
        colsKey = key;
        latW = lat;
        de.classList.toggle("tw-nosb", !roomy);
        de.style.setProperty("--tw-navcol-w", navcol + "px");
        de.style.setProperty("--tw-gap", (roomy ? GAP : 0) + "px");
        de.style.setProperty("--tw-lat", lat + "px");
    }

    // Se a janela não comporta a largura pedida, a coluna central encolhe até caber (o CSS faz
    // isso sozinho). O chip do painel mostra "900 → 740" nesse caso, senão o slider pareceria
    // quebrado — "arrasto e não muda nada".
    let widthValEl = null, widthInputEl = null;
    const syncWidthUI = () => { if (widthInputEl) widthInputEl.value = String(settings.centerW); };
    function widthHint() {
        if (!widthValEl) return;
        const eff = Math.max(TIMELINE_HARD, Math.min(centerW, window.innerWidth - latW));
        const capped = eff < centerW - 2;
        widthValEl.textContent = capped ? centerW + " → " + Math.round(eff) : String(centerW);
        widthValEl.title = capped
            ? "Nesta janela cabem " + Math.round(eff) + "px de coluna central; o resto é a nav e a sidebar."
            : "";
    }
    // resize também cobre "arrastei a janela pro outro monitor": syncScreen troca o perfil de
    // largura e o painel é re-sincronizado com o valor daquela tela.
    window.addEventListener("resize", debounce(() => {
        if (syncScreen()) { syncWidthUI(); applyWidth(); return; }
        applyColumns(); widthHint();
    }, 120));

    // Largura REAL da nav → --tw-nav-w. Guarda: só aceita medida plausível de coluna de nav
    // (72–320px). Fora dessa faixa a nav está herdando a largura da coluna que nós mesmos
    // definimos — usar esse número realimentaria o buraco a cada medição.
    let navW = 276;
    function measureNav() {
        const nav = document.querySelector('header[role="banner"] nav[role="navigation"]');
        if (!nav) return;
        const w = Math.round(nav.getBoundingClientRect().width);
        const use = (w >= 72 && w <= 320) ? w : 276;
        if (use === navW) return;
        navW = use;
        document.documentElement.style.setProperty("--tw-nav-w", use + "px");
    }

    // Largura NATIVA da sidebar direita — é ela que define a reserva das duas colunas. Medimos
    // (em vez de chumbar 350) porque a coluna do X carrega padding próprio, e é o total que
    // precisa bater com o outro lado. Nunca escrevemos largura nela, então a medida não se
    // realimenta; escondida (rect 0) ou fora da faixa plausível, fica o último valor bom.
    let sideW = SIDE_BASE;
    function measureSide() {
        const sb = document.querySelector('[data-testid="sidebarColumn"]');
        if (!sb) return;
        const w = Math.round(sb.getBoundingClientRect().width);
        if (w >= 260 && w <= 520) sideW = w;
    }

    // O SHELL = menor ancestral que contém a nav (header[role=banner]) E o <main>: é o nó que
    // define onde a página começa e termina, então é nele que a largura é escrita. Achado por JS
    // (em vez de chutar um seletor) pra sobreviver a mudanças de árvore do X. Marcamos também os
    // ancestrais ACIMA dele (data-tw-shellup): qualquer max-width nativo lá em cima recaparia a
    // nossa largura.
    let shellEl = null;
    function markShell() {
        if (shellEl && shellEl.isConnected) return;
        const main = document.querySelector('main[role="main"]');
        const header = document.querySelector('header[role="banner"]');
        if (!main || !header) return;
        let n = main.parentElement;
        while (n && n !== document.body && !n.contains(header)) n = n.parentElement;
        if (!n || n === document.body || n === document.documentElement) return;   // não achou → o :has() do CSS cobre
        document.querySelectorAll("[data-tw-shell], [data-tw-shellup], [data-tw-navcol], [data-tw-maincol]").forEach((o) => {
            o.removeAttribute("data-tw-shell"); o.removeAttribute("data-tw-shellup");
            o.removeAttribute("data-tw-navcol"); o.removeAttribute("data-tw-maincol");
        });
        shellEl = n;
        shellEl.setAttribute("data-tw-shell", "");
        for (let p = n.parentElement; p && p !== document.documentElement; p = p.parentElement) p.setAttribute("data-tw-shellup", "");
        // as duas COLUNAS do shell são os filhos diretos — é neles que o flex é resolvido, mesmo
        // que o header/main estejam um nível mais fundo (o X já mudou essa árvore antes)
        for (const child of n.children) {
            if (child.contains(header)) child.setAttribute("data-tw-navcol", "");
            else if (child.contains(main)) child.setAttribute("data-tw-maincol", "");
        }
    }

    // Tag standalone PORTRAIT media (main tweet only) so the CSS gives it a blurred
    // backdrop. Both images and videos sit in a [data-testid="tweetPhoto"] wrapper (a
    // video also has a nested videoPlayer) — we process only the tweetPhoto, so a video
    // counts as one item, not two. Not marked until measurable → unrendered is retried.
    let blurRafPending = false;
    function applyBlurMedia(retries) {
        if (!settings.blurMedia) return;
        retries = retries || 0;
        let pending = false; // alguma mídia portrait existe mas ainda não está medível/carregada
        document.querySelectorAll('[data-testid="primaryColumn"] [data-testid="tweetPhoto"]:not([data-tw-blur])').forEach((m) => {
            // Pula mídia de QUOTED tweet (vive num card aninhado com cabeçalho próprio; o CSS de blur é
            // escrito pra estrutura do tweet PRINCIPAL → no quoted ficava torto: mídia no topo + faixa preta).
            // 2 sinais (robusto a variações de DOM — o [role=link][tabindex=0] sozinho não pegava todo layout):
            //  (a) a mídia vem DEPOIS do 2º [data-testid="User-Name"] do article (= cabeçalho do tweet citado);
            //  (b) ancestral [role=link][tabindex=0] (o card clicável do quoted).
            const article = m.closest("article");
            const names = article ? article.querySelectorAll('[data-testid="User-Name"]') : [];
            const inQuote = (names.length >= 2 && (names[1].compareDocumentPosition(m) & Node.DOCUMENT_POSITION_FOLLOWING)) || m.closest('[role="link"][tabindex="0"]');
            if (inQuote) { m.dataset.twBlur = "skip"; return; }
            if (article && article.querySelectorAll('[data-testid="tweetPhoto"]').length > 1) { m.dataset.twBlur = "skip"; return; }  // gallery
            const r = m.getBoundingClientRect();
            if (r.width < 60 || r.height < 60) { pending = true; return; }      // not laid out yet → retry next frame
            if (r.height < r.width * 0.95) { m.dataset.twBlur = "skip"; return; }  // só landscape claro (>~5%) fica nativo; quadrado/quase-quadrado/portrait ganham blur (a margem absorve o subpixel das imagens 1:1)
            // Portrait confirmado (a caixa de aspect do X já reserva o tamanho ANTES da imagem carregar):
            // aplica o LAYOUT do blur JÁ, pra a imagem nascer dentro da caixa-blur (sem o pulo caixa-nativa→
            // caixa-blur). O backdrop (--tw-img) entra quando a url estiver pronta. classList.add é idempotente.
            const video = m.querySelector("video");
            if (video) m.classList.add("tw-blur-video");
            m.classList.add("tw-blur-bg");
            let url;
            if (video) url = video.getAttribute("poster");
            else {
                const bg = m.querySelector('div[style*="background-image"]');
                const mm = bg && bg.style.backgroundImage.match(/url\(["']?(.*?)["']?\)/);
                url = mm && mm[1];
            }
            if (!url) { pending = true; return; }                              // layout já aplicado; falta só o backdrop → re-tenta
            m.style.setProperty("--tw-img", `url("${url}")`);
            m.dataset.twBlur = "1";                                            // completo (layout + backdrop)
        });
        // Mídia portrait existe mas não pronta: o X seta o bg-image por STYLE inline (não dispara o
        // observer de childList), então não dá pra contar com uma mutação pra reprocessar. Re-tenta nos
        // próximos frames (cap ~1.5s) até medir/carregar → blur aplica assim que a imagem pinta, sem o
        // "nativo agora, blur 2s depois". 1 cadeia de rAF por vez (blurRafPending).
        if (pending && retries < 90 && !blurRafPending) {
            blurRafPending = true;
            requestAnimationFrame(() => { blurRafPending = false; applyBlurMedia(retries + 1); });
        }
    }

    // Hide the "Discover more" / "Descubra mais" suggested-posts header cell (status
    // pages). No stable testid, so matched by heading text; tagged once per cell.
    function hideDiscover(full) {
        document.querySelectorAll('[data-testid="primaryColumn"] [data-testid="cellInnerDiv"]:not([data-tw-disc])').forEach((c) => {
            const h = c.querySelector('[role="heading"]');
            const disc = h && /discover more|descubra mais/i.test(h.textContent);
            c.dataset.twDisc = disc ? "hide" : "1";
            if (disc) c.style.display = settings.hideDiscover ? "none" : "";   // aplica já ao marcar
        });
        // re-aplica em TODAS as "hide" só quando o toggle muda (full) — no refresh basta marcar as novas,
        // senão era um querySelectorAll + write por refresh à toa.
        if (full) document.querySelectorAll('[data-testid="primaryColumn"] [data-tw-disc="hide"]').forEach((c) => { c.style.display = settings.hideDiscover ? "none" : ""; });
    }

    // ===================================================================== //
    //  GERENCIADOR DA SIDEBAR — controle completo.                           //
    //  Captura TODOS os itens (nav + menu "Mais") num registro persistente,   //
    //  esconde o "Mais" nativo e renderiza o NOSSO, e deixa cada item em       //
    //  Sidebar / Mais / Oculto + reordenável. (Substitui os hides fixos, o     //
    //  pruneMore e o moveSettings.)                                            //
    //  --- SELETORES do X num lugar só (ajuste aqui se o X mudar o DOM) ---     //
    const NAV_SEL = 'header[role="banner"] nav[role="navigation"]';
    const NAV_ITEM_SEL = 'a[role="link"], a[href]';
    const MORE_NATIVE_SEL = '[data-testid="AppTabBar_More_Menu"], header[role="banner"] nav[role="navigation"] button[aria-label="Mais"], header[role="banner"] nav[role="navigation"] button[aria-label="More"]';
    const TW_MORE_ID = "tw-our-more";
    const MORE_KEY = "_more";
    const DOTS_SVG = '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><g><circle cx="5" cy="12" r="2.2"></circle><circle cx="12" cy="12" r="2.2"></circle><circle cx="19" cy="12" r="2.2"></circle></g></svg>';
    let APPLIED = null;   // snapshot do config aplicado (estável na sessão; só muda em reload)

    // registro + config moram em settings (persistem no localStorage junto)
    const navReg = () => settings.navRegistry || (settings.navRegistry = {});
    const navCfg = () => settings.navConfig || (settings.navConfig = []);
    const navKeyOf = (info) => {
        if (info.href) { try { const p = new URL(info.href, location.origin).pathname.replace(/\/+$/, ""); if (p) return "p:" + p; } catch (e) {} }
        if (info.testid) return "t:" + info.testid;
        return "l:" + (info.label || "").toLowerCase();
    };
    // extrai {key,label,href,testid,icon,el} de um link/menuitem da nav ou do menu
    function readEl(node) {
        const a = (node.closest && node.closest('a,button,[role="link"],[role="menuitem"]')) || node;
        const href = (a.getAttribute && a.getAttribute("href")) || "";
        const testid = (a.getAttribute && a.getAttribute("data-testid")) || "";
        let label = (a.getAttribute && a.getAttribute("aria-label")) || "";
        if (!label && a.querySelectorAll) { const s = [...a.querySelectorAll("span")].find((x) => x.textContent.trim() && !x.querySelector("*")); label = s ? s.textContent.trim() : ""; }
        const svg = a.querySelector && a.querySelector("svg");
        const info = { href, testid, label: (label || "").trim(), icon: svg ? svg.outerHTML : "" };
        info.key = navKeyOf(info); info.el = a;
        return info;
    }
    // varre nav + qualquer menu aberto, mescla no registro e adiciona novos ao config
    function captureSidebar() {
        const reg = navReg(), cfg = navCfg();
        let touched = false;
        const add = (info, place) => {
            if (!info.key || info.key === "l:" || !info.label) return;
            const prev = reg[info.key] || {};
            const icon = info.icon || prev.icon || "";
            if (!prev.label || (!prev.icon && icon)) touched = true;                 // item novo, ou ganhou ícone
            reg[info.key] = { label: info.label || prev.label, href: info.href || prev.href || "", testid: info.testid || prev.testid || "", icon };
            if (!cfg.some((c) => c.key === info.key)) { cfg.push({ key: info.key, place }); if (APPLIED) APPLIED.push({ key: info.key, place }); touched = true; }
        };
        const nav = document.querySelector(NAV_SEL);
        if (nav) for (const a of nav.querySelectorAll(NAV_ITEM_SEL)) {
            if (a.id === TW_MORE_ID || a.closest("[data-tw-inj]")) continue;          // ignora os nossos injetados
            add(readEl(a), "bar");
        }
        // nosso "Mais" entra DEPOIS de já existir algum item de barra (pra cair no fim, não no topo)
        if (!cfg.some((c) => c.key === MORE_KEY) && cfg.some((c) => c.place === "bar")) {
            reg[MORE_KEY] = { label: "Mais", href: "", testid: "", icon: DOTS_SVG }; cfg.push({ key: MORE_KEY, place: "bar" }); if (APPLIED) APPLIED.push({ key: MORE_KEY, place: "bar" }); touched = true;
        }
        for (const m of document.querySelectorAll('[role="menu"] a[href]')) add(readEl(m), "more");
        if (touched) save();
        return touched;
    }

    // acha o elemento nativo (na nav) correspondente a uma key
    function findLive(nav, key) {
        for (const a of nav.querySelectorAll(NAV_ITEM_SEL)) {
            if (a.id === TW_MORE_ID || a.closest("[data-tw-inj]")) continue;
            if (readEl(a).key === key) return a;
        }
        return null;
    }
    // clona um item nativo como template e troca href/label/ícone (herda o estilo exato do X)
    function cloneNav(template, item, key) {
        const node = template.cloneNode(true);
        node.setAttribute("data-tw-inj", key);
        node.removeAttribute("aria-current");
        if (item.href) { try { node.href = new URL(item.href, location.origin).href; } catch (e) { node.setAttribute("href", item.href); } }
        if (item.label) node.setAttribute("aria-label", item.label);
        // troca SÓ o conteúdo do <svg> do template (mantém classe/tamanho/cor do X), não o svg inteiro
        const svg = node.querySelector("svg");
        if (svg && item.icon) { const t = document.createElement("div"); t.innerHTML = item.icon; const src = t.querySelector("svg"); if (src) svg.innerHTML = src.innerHTML; }
        for (const sp of node.querySelectorAll("span")) { if (sp.textContent.trim() && !sp.querySelector("*")) { sp.textContent = item.label; break; } }
        return node;
    }

    // ---- nosso popup "Mais" ---- //
    let ourMore = null, morePop = null, morePopBound = false, sbRender = null, reloadBtn = null;
    function toggleMorePopup() {
        const reg = navReg();
        const items = appliedCfg().filter((c) => c.place === "more").map((c) => ({ key: c.key, item: reg[c.key] })).filter((x) => x.item);
        if (!morePop) { morePop = el("div", { class: "tw-more-pop" }); document.body.append(morePop); }
        morePop.replaceChildren();
        if (!items.length) morePop.append(el("div", { class: "tw-more-empty" }, "Vazio — mova itens pra cá no painel."));
        for (const { key, item } of items) {
            const row = el("a", { class: "tw-more-row", href: item.href || "#" },
                el("span", { class: "tw-more-ic", html: item.icon || DOTS_SVG }),
                el("span", { class: "tw-more-lbl" }, item.label));
            row.addEventListener("click", (e) => {
                morePop.classList.remove("open");
                const nav = document.querySelector(NAV_SEL), live = nav && findLive(nav, key);
                if (live) { e.preventDefault(); live.click(); }          // SPA pelo link nativo (mesmo escondido)
            });
            morePop.append(row);
        }
        const open = !morePop.classList.contains("open");
        morePop.classList.toggle("open", open);
        if (open && ourMore) {
            const r = ourMore.getBoundingClientRect();
            morePop.style.left = (r.right + 10) + "px";
            morePop.style.bottom = Math.max(12, window.innerHeight - r.bottom) + "px";
        }
        if (!morePopBound) {
            morePopBound = true;
            document.addEventListener("click", (e) => { if (morePop && !morePop.contains(e.target) && (!ourMore || !ourMore.contains(e.target))) morePop.classList.remove("open"); });
        }
    }

    // snapshot do config APLICADO — o que está na sidebar AGORA. Estável na sessão; só re-snapshota em
    // reload. Edições no painel mexem em settings.navConfig (persistido p/ o próximo load) SEM reaplicar
    // ao vivo (você aplica clicando em "Recarregar"). Capturas de itens NOVOS entram no snapshot na hora.
    const appliedCfg = () => APPLIED || navCfg();
    const cfgDirty = () => !!APPLIED && JSON.stringify(navCfg()) !== JSON.stringify(APPLIED);
    const updateReloadBtn = () => { if (reloadBtn) reloadBtn.style.display = cfgDirty() ? "" : "none"; };
    // seletor CSS estável de um item NATIVO (testid > href) — base da ordem/visibilidade declarativa
    function navSelFor(item) {
        if (item.testid) return NAV_SEL + ' a[data-testid="' + item.testid + '"]';
        if (item.href) { try { const p = new URL(item.href, location.origin).pathname.replace(/\/+$/, ""); if (p) return NAV_SEL + ' a[href$="' + p + '"]'; } catch (e) {} }
        return null;
    }

    // ---- render: ordem/visibilidade dos NATIVOS via CSS (declarativo → aplica no 1º paint de cada item,
    //      SEM o "pula-pula" do JS reordenando depois que o X hidrata). Nosso "Mais" + itens promovidos
    //      (menu-only) entram por JS. Lê o SNAPSHOT (appliedCfg) → edições não mexem ao vivo. ---- //
    function applySidebar() {
        const nav = document.querySelector(NAV_SEL);
        if (!nav) return;
        captureSidebar();
        if (!APPLIED) APPLIED = JSON.parse(JSON.stringify(navCfg()));   // 1ª aplicação real → fixa o snapshot
        const cfg = APPLIED, reg = navReg();
        const template = nav.querySelector('a[role="link"]') || nav.querySelector("a[href]");
        if (!template) return;
        // só assumimos o "Mais" DEPOIS de capturar itens pra ele (você abre o nativo 1x → captura → o nosso assume)
        const hasMore = cfg.some((c) => c.place === "more" && reg[c.key]);

        nav.querySelectorAll("[data-tw-inj]").forEach((n) => {            // limpa injetados que saíram de "bar"
            const c = cfg.find((x) => x.key === n.getAttribute("data-tw-inj"));
            if (!c || c.place !== "bar") n.remove();
        });

        // `order` só é emitido se você REORDENOU (senão, ordem natural do DOM → zero pula-pula no load, e
        // itens não-gerenciados como "Postar"/troca de conta não saltam pro topo). Itens nossos (Mais +
        // promovidos) entram ANTES do botão "Postar".
        const reordered = !!settings.navReordered;
        const postBtn = nav.querySelector('[data-testid="SideNav_NewTweet_Button"], a[href$="/compose/post"], a[href$="/compose/tweet"]');
        const place = (node) => { if (postBtn && postBtn.parentNode === nav) nav.insertBefore(node, postBtn); else nav.appendChild(node); };
        let css = "", order = 0;
        for (const c of cfg) {
            if (c.key === MORE_KEY) {
                const show = c.place === "bar" && hasMore;
                if (!show) { if (ourMore) ourMore.style.display = "none"; if (c.place === "bar") order++; continue; }
                if (!ourMore || !ourMore.isConnected) {
                    ourMore = cloneNav(template, { label: "Mais", icon: DOTS_SVG, href: "" }, MORE_KEY);
                    ourMore.id = TW_MORE_ID; ourMore.removeAttribute("href"); ourMore.removeAttribute("data-tw-inj");
                    ourMore.addEventListener("click", (e) => { e.preventDefault(); e.stopPropagation(); toggleMorePopup(); });
                    place(ourMore);
                }
                ourMore.style.display = ""; ourMore.style.order = reordered ? String(order) : "";
                order++;
                continue;
            }
            const item = reg[c.key]; if (!item) continue;
            const sel = navSelFor(item);
            if (c.place !== "bar") { if (sel) css += sel + "{display:none !important;}"; continue; }
            if (sel && reordered) css += sel + "{order:" + order + " !important;}";
            const cur = order++;
            if (!sel || !nav.querySelector(sel)) {       // sem elemento nativo → injeta um clone (menu-only promovido)
                let inj = null;
                for (const n of nav.querySelectorAll("[data-tw-inj]")) if (n.getAttribute("data-tw-inj") === c.key) { inj = n; break; }
                if (!inj) { inj = cloneNav(template, item, c.key); place(inj); }
                inj.style.display = ""; inj.style.order = reordered ? String(cur) : "";
            }
        }
        if (hasMore) css += MORE_NATIVE_SEL + "{display:none !important;}";
        let st = document.getElementById("tw-sidebar-css");
        if (!st) { st = el("style", { id: "tw-sidebar-css" }); (document.head || document.documentElement).append(st); }
        if (st.textContent !== css) st.textContent = css;
    }

    // ---- widget do painel (lista reordenável com Sidebar/Mais/Oculto por item) ---- //
    const PLACES = [{ v: "bar", t: "Sidebar" }, { v: "more", t: "Mais" }, { v: "hidden", t: "Oculto" }];
    function buildSidebarWidget() {
        const reg = navReg(), cfg = navCfg();
        const wrap = el("div", { class: "tw-sbmgr" });
        // edições SÓ estagiam (save + marca "dirty"): NÃO reaplicam ao vivo — você aplica em "Recarregar".
        // stopPropagation: o render() troca os nós e o clique vazaria pro listener "fora-do-painel" (fechava).
        const stage = () => { save(); updateReloadBtn(); render(); };
        const mv = (i, d) => { const j = i + d; if (j < 0 || j >= cfg.length) return; const t = cfg[i]; cfg[i] = cfg[j]; cfg[j] = t; settings.navReordered = true; stage(); };
        function render() {
            wrap.replaceChildren();
            cfg.forEach((c, i) => {
                const item = reg[c.key]; if (!item) return;
                const isMore = c.key === MORE_KEY;
                const up = el("button", { class: "tw-sbmove", type: "button", title: "Subir", onclick: (e) => { e.stopPropagation(); mv(i, -1); } }, "↑");
                const dn = el("button", { class: "tw-sbmove", type: "button", title: "Descer", onclick: (e) => { e.stopPropagation(); mv(i, 1); } }, "↓");
                if (i === 0) up.disabled = true;
                if (i === cfg.length - 1) dn.disabled = true;
                const seg = el("div", { class: "tw-sbseg" });
                for (const p of PLACES) {
                    if (isMore && p.v === "more") continue;
                    seg.append(el("button", { class: "tw-sbopt" + (c.place === p.v ? " on" : ""), type: "button",
                        onclick: (e) => { e.stopPropagation(); c.place = p.v; stage(); } }, p.t));
                }
                wrap.append(el("div", { class: "tw-sbrow" },
                    el("span", { class: "tw-sbic", html: item.icon || DOTS_SVG }),
                    el("span", { class: "tw-sblbl" }, item.label + (isMore ? " (nosso menu)" : "")),
                    up, dn, seg));
            });
        }
        render();
        sbRender = render;   // pra re-renderizar quando o painel reabrir (itens capturados depois)
        return el("div", { class: "tw-sbmgr-wrap", "data-label": "itens da sidebar mais ocultar mover esconder" },
            el("div", { class: "tw-sbhint" }, "Reordene com ↑↓ e escolha Sidebar / Mais / Oculto. As mudanças aplicam ao clicar em Recarregar (no rodapé). Abra o “Mais” do X uma vez pra capturar itens que ainda não apareceram."),
            wrap);
    }

    // ---- force the Following timeline when "For You" is hidden ------------ //
    // Switch the home timeline to "Seguindo" when chosen as default (or when the
    // "Para você" tab is hidden, which would otherwise strand you on For You).
    function applyHomeTab() {
        if (!isHome()) return;     // only the home [Para você | Seguindo] tablist
        if (settings.homeDefault !== "following" && !settings.hideForYou) return;
        const tabs = document.querySelectorAll('[data-testid="primaryColumn"] [role="tablist"] [role="tab"]');
        if (tabs.length >= 2 && tabs[0].getAttribute("aria-selected") === "true") tabs[1].click();
    }
    // Apply the default only on entry to home (with retries for the lazy tablist), so a
    // manual tab switch isn't fought on every re-render.
    function scheduleHomeTab() { if (!isHome()) return; applyHomeTab(); setTimeout(applyHomeTab, 250); setTimeout(applyHomeTab, 700); }


    // ===================================================================== //
    //  Share — direct copy + strip trackers                                  //
    // ===================================================================== //
    // X's "Copiar link" appends ?t=<token>&s=<n> (tracking); strip those (+utm) from any
    // x.com/twitter.com URL we copy. Direct copy grabs the post's own permalink (the
    // timestamp link) and copies it on the spot instead of opening the share dropdown.
    const TW_TRACK_PARAMS = ["t", "s", "ref_src", "ref_url", "utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content"];
    function stripTrackers(text) {
        try {
            const u = new URL(text);
            if (/(^|\.)(x|twitter)\.com$/i.test(u.hostname)) {
                TW_TRACK_PARAMS.forEach((p) => u.searchParams.delete(p));
                return u.toString();
            }
        } catch (e) {}
        return text;
    }
    // The post's own permalink = the timestamp link inside the article (drop /photo|video|analytics).
    function tweetUrl(article) {
        const t = article && article.querySelector("time");
        const a = t && t.closest('a[href*="/status/"]');
        const href = a && a.getAttribute("href");
        if (!href || !/\/status\/\d+/.test(href)) return null;
        return location.origin + href.replace(/\/(photo|video|analytics)\/\d+\/?$/, "");
    }

    let twToastEl, twToastTimer;
    function toast(msg) {
        if (!twToastEl) {
            twToastEl = el("div", { id: "tw-toast" });
            (document.body || document.documentElement).appendChild(twToastEl);
        }
        twToastEl.textContent = msg;
        twToastEl.classList.add("show");
        clearTimeout(twToastTimer);
        twToastTimer = setTimeout(() => twToastEl.classList.remove("show"), 1600);
    }

    // ===================================================================== //
    //  The floating control panel                                           //
    // ===================================================================== //
    let panelClickBound = false;
    function buildPanel() {
        if (document.getElementById("tw-fab")) return;

        const fab = el("button", { id: "tw-fab", type: "button", title: "Ajustes do X", html: `<svg viewBox="0 0 24 24" aria-hidden="true">${GEAR}</svg>` });
        const panel = el("div", { id: "tw-panel", role: "dialog", "aria-label": "Ajustes do X" });

        // ---- cabeçalho ----
        const close = el("button", { class: "tw-x", type: "button", title: "Fechar", onclick: () => panel.classList.remove("open") }, "✕");
        panel.append(el("div", { class: "tw-head" },
            el("span", { class: "tw-logo", html: `<svg viewBox="0 0 24 24" aria-hidden="true">${GEAR}</svg>` }),
            el("b", {}, "Ajustes do X"), close));

        // ---- busca (filtra todas as categorias) ----
        const search = el("input", {
            type: "text", placeholder: "Buscar ajuste…", spellcheck: "false",
            onkeydown: (e) => e.stopPropagation(), onkeyup: (e) => e.stopPropagation(),   // não dispara atalhos do X
        });
        panel.append(el("div", { class: "tw-search" },
            el("div", {}, el("span", { html: '<svg viewBox="0 0 24 24"><path d="M15.5 14h-.79l-.28-.27a6.5 6.5 0 1 0-.7.7l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0A4.5 4.5 0 1 1 14 9.5 4.5 4.5 0 0 1 9.5 14z"/></svg>' }), search)));

        // ---- corpo: rail de categorias + conteúdo ----
        const rail = el("div", { class: "tw-rail" });
        const content = el("div", { class: "tw-content" });
        const empty = el("div", { class: "tw-empty" }, "Nenhum ajuste encontrado");
        const sections = [], tabs = [];
        let active = 0;

        const refreshDimming = () => {
            panel.querySelectorAll("[data-dep]").forEach((row) => row.classList.toggle("dim", !settings[row.getAttribute("data-dep")]));
        };

        GROUPS.forEach((grp, gi) => {
            const sec = el("div", { class: "tw-sec" });
            sec.append(el("div", { class: "tw-sec-title" }, grp.title));
            for (const item of grp.items) {
                const lbl = item.label.toLowerCase();
                if (item.type === "slider") {
                    const valEl = el("span", { class: "val" }, String(settings[item.key]));
                    const input = el("input", {
                        type: "range", min: item.min, max: item.max, step: item.step || 1, value: settings[item.key],
                        oninput: (e) => {
                            settings[item.key] = +e.target.value; valEl.textContent = e.target.value;
                            if (item.perScreen) saveScreenPrefs(); else save();
                            applySettings();
                        },
                    });
                    if (item.key === "centerW") { widthValEl = valEl; widthInputEl = input; widthHint(); }   // pode virar "900 → 740"
                    sec.append(el("div", { class: "tw-slider", "data-dep": item.dep, "data-label": lbl },
                        el("div", { class: "lab" }, el("span", {}, item.label), valEl), input));
                } else if (item.type === "select") {
                    const sel = el("select", { onchange: (e) => { settings[item.key] = e.target.value; save(); applySettings(); if (item.key === "homeDefault") applyHomeTab(); } },
                        ...item.options.map((o) => el("option", { value: o.value, ...(settings[item.key] === o.value ? { selected: "" } : {}) }, o.label)));
                    sec.append(el("div", { class: "tw-row", "data-label": lbl }, el("span", { class: "tw-rowlbl" }, item.label), sel));
                } else if (item.type === "sidebar") {
                    sec.append(buildSidebarWidget());
                } else {
                    const input = el("input", {
                        type: "checkbox", ...(settings[item.key] ? { checked: "" } : {}),
                        onchange: (e) => { settings[item.key] = e.target.checked; save(); applySettings(); refreshDimming(); if (item.key === "hideForYou") applyHomeTab(); if (item.key === "ageBypass") toast(e.target.checked ? "Bypass ligado — recarregue p/ efeito total" : "Bypass desligado — recarregue"); },
                    });
                    sec.append(el("label", { class: "tw-row", "data-dep": item.dep, "data-label": lbl },
                        el("span", { class: "tw-rowlbl" }, item.label),
                        el("span", { class: "tw-sw" }, input, el("i", {}))));
                }
            }
            content.append(sec);
            sections.push(sec);

            const tab = el("button", { class: "tw-tab", type: "button", title: grp.title,
                html: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${ICONS[gi] || ICONS[0]}"/></svg>` });
            tab.addEventListener("click", () => { search.value = ""; showTab(gi); });
            rail.append(tab);
            tabs.push(tab);
        });

        content.append(empty);
        panel.append(el("div", { class: "tw-body" }, rail, content));

        function showTab(i) {
            active = i;
            panel.classList.remove("searching");
            empty.style.display = "none";
            sections.forEach((sec, idx) => {
                sec.style.display = idx === i ? "block" : "none";
                sec.querySelectorAll("[data-label]").forEach((r) => (r.style.display = ""));
                const t = sec.querySelector(".tw-sec-title"); if (t) t.style.display = "";
            });
            tabs.forEach((tb, idx) => tb.classList.toggle("active", idx === i));
            content.scrollTop = 0;
        }

        search.addEventListener("input", () => {
            const q = search.value.trim().toLowerCase();
            if (!q) { showTab(active); return; }
            panel.classList.add("searching");
            tabs.forEach((tb) => tb.classList.remove("active"));
            let any = false;
            sections.forEach((sec) => {
                let vis = false;
                sec.querySelectorAll("[data-label]").forEach((r) => {
                    const m = r.getAttribute("data-label").indexOf(q) !== -1;
                    r.style.display = m ? "" : "none";
                    if (m) { vis = true; any = true; }
                });
                sec.style.display = vis ? "block" : "none";
                const t = sec.querySelector(".tw-sec-title"); if (t) t.style.display = vis ? "" : "none";
            });
            empty.style.display = any ? "none" : "block";
        });

        // ---- rodapé ----
        reloadBtn = el("button", { class: "tw-reload", type: "button", style: { display: cfgDirty() ? "" : "none" }, onclick: () => location.reload() }, "↻ Recarregar p/ aplicar");
        panel.append(el("div", { class: "tw-foot" },
            el("button", { class: "tw-reset", type: "button", onclick: () => {
                settings = { ...DEFAULTS }; save(); panel.remove(); fab.remove(); buildPanel(); applySettings();
            } }, "Restaurar padrões"),
            reloadBtn,
            el("span", { class: "tw-ver" }, (typeof GM_info !== "undefined" && GM_info.script ? "v" + GM_info.script.version : ""))));

        fab.addEventListener("click", () => { panel.classList.toggle("open"); refreshDimming(); if (panel.classList.contains("open")) { captureSidebar(); if (sbRender) sbRender(); updateReloadBtn(); } });
        // "clicou fora → fecha" é registrado UMA vez no documento: "Restaurar padrões" reconstrói o
        // painel, e sem esta guarda cada reset deixava mais um listener preso ao painel já removido.
        if (!panelClickBound) {
            panelClickBound = true;
            document.addEventListener("click", (e) => {
                const p = document.getElementById("tw-panel"), f = document.getElementById("tw-fab");
                if (p && !p.contains(e.target) && (!f || (e.target !== f && !f.contains(e.target)))) p.classList.remove("open");
            });
        }

        document.body.append(fab, panel);
        showTab(0);
        refreshDimming();
    }

    // ===================================================================== //
    //  Bootstrap                                                            //
    // ===================================================================== //
    // Blur de mídia num agendador por rAF — NÃO no refresh debounced. O debounce fica faminto enquanto
    // o X muta sem parar (timeline rolando), aplicando o blur só quando você para. Via rAF ele roda
    // durante a atividade → blur na hora. Coalescido (1 rAF por frame).
    let mediaRaf = 0;
    const scheduleMedia = () => {
        // bail no AGENDAMENTO: sem blur, não enfileira rAF nenhum por frame de scroll
        if (mediaRaf || !settings.blurMedia) return;
        mediaRaf = requestAnimationFrame(() => { mediaRaf = 0; applyBlurMedia(); });
    };

    // Re-apply the JS-driven bits after X re-renders the shell, and keep the panel alive (debounced — não-urgente).
    const refresh = debounce(() => {
        if (location.pathname !== lastPath) {                                // só em navegação SPA
            lastPath = location.pathname;
            document.documentElement.classList.toggle("tw-home", isHome());  // tw-home só muda com o path
            scheduleHomeTab();
        }
        if (settings.ageBypass) installAgeBypass();   // re-tenta o patch do bypass (idempotente) até pegar — corrige a corrida do F5
        markShell();                                  // no-op se o shell já está marcado e vivo (só re-acha se o X remontou)
        applyColumns();                               // a nav só existe depois que o shell hidrata (no-op se nada mudou)
        if (!document.getElementById("tw-fab")) buildPanel();
        applySidebar();
        hideDiscover();
    }, 200);

    // UM único observer de documento inteiro pra tudo (em vez de dois → 1 callback por mutação):
    //  • captura SÍNCRONA dos itens do menu "Mais" quando ele abre (some do DOM ao fechar);
    //  • blur de mídia via rAF durante a atividade;
    //  • refresh debounced (painel/home/settings) quando aquieta.
    new MutationObserver((muts) => {
        // captura SÍNCRONA dos itens do menu "Mais" quando ele abre (some do DOM ao fechar)
        for (const mu of muts) for (const n of mu.addedNodes) {
            if (n.nodeType !== 1) continue;
            if ((n.matches && n.matches('[role="menu"]')) || (n.querySelector && n.querySelector('[role="menu"]'))) { captureSidebar(); break; }
        }
        scheduleMedia();
        refresh();
    }).observe(document.documentElement, { childList: true, subtree: true });

    // Direct copy: clicar em "Compartilhar" copia o link do post na hora (sem abrir o dropdown).
    // Capture-phase + stopPropagation → roda antes do handler do X e impede o menu de abrir.
    document.addEventListener("click", (e) => {
        if (!settings.directShare || !e.target.closest) return;
        const btn = e.target.closest('button[aria-label="Compartilhar post"]');
        if (!btn) return;
        const url = tweetUrl(btn.closest("article"));
        if (!url) return;                 // não resolveu o permalink → deixa o X abrir o menu nativo
        e.preventDefault();
        e.stopPropagation();
        // só avisa "copiado" no SUCESSO: writeText pode REJEITAR async (aba sem foco/permissão negada) →
        // o catch síncrono não pega isso; sem o then a gente mentiria "copiado" + unhandled rejection.
        try {
            const p = navigator.clipboard.writeText(url);
            if (p && p.then) p.then(() => toast("Link copiado"), () => {});
            else toast("Link copiado");
        } catch (err) {}
    }, true);

    // Remove tracking: tira os trackers de QUALQUER link x.com copiado (cobre o "Copiar link" nativo).
    try {
        const cb = navigator.clipboard;
        if (cb && cb.writeText && !cb.__twPatch) {
            const orig = cb.writeText.bind(cb);
            cb.writeText = (t) => orig(settings.shareNoTrackers && typeof t === "string" ? stripTrackers(t) : t);
            cb.__twPatch = true;
        }
    } catch (e) {}

    let initialWorkTask = null;
    function scheduleInitialWork() {
        if (initialWorkTask !== null) return;
        const run = () => {
            initialWorkTask = null;
            applySettings();             // DOM-dependent work after the first paint
            buildPanel();
            scheduleHomeTab();           // honor the default timeline on first home load
            applySidebar();              // monta/aplica a sidebar gerenciada
        };
        if (typeof requestIdleCallback === "function") initialWorkTask = requestIdleCallback(run, { timeout: 500 });
        else initialWorkTask = setTimeout(run, 0);
    }
    // Classes can be set as soon as <html> exists, before DOM is ready.
    document.documentElement && applySettings();
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", scheduleInitialWork);
    else scheduleInitialWork();
})();
