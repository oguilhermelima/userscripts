// ==UserScript==
// @name         Twitch — Top Nav, Live Tab & Clips/VOD Playlist
// @namespace    twitch-channel-rework
// @version      2.0.0
// @updateURL    https://raw.githubusercontent.com/oguilhermelima/userscripts/main/dist/twitch.user.js
// @downloadURL  https://raw.githubusercontent.com/oguilhermelima/userscripts/main/dist/twitch.user.js
// @author       oguilhermelima
// @description  Moves Twitch's top bar into the sidebar and adds a channel tab bar plus a YouTube-style Clips and VOD player with filters, sorting and full clip history.
// @match        https://www.twitch.tv/*
// @run-at       document-start
// @grant        GM_addStyle
// @grant        unsafeWindow
// @noframes
// ==/UserScript==
//
// NOTA SOBRE A API
// ----------------
// Os dados vêm da GraphQL pública da Twitch (gql.twitch.tv/gql, Client-Id web). Ela devolve por
// clipe muito mais do que o DOM da página mostra — inclusive `videoQualities.sourceURL`, os MP4
// diretos, que é o que permite tocar num <video> nativo em vez do embed.
//
// Duas restrições descobertas na marra, e como o script lida com elas:
//
//   1. `first` é limitado a 100 e `after:` (paginação) cai em IntegrityCheckFailed. O header
//      Client-Integrity exigido só é válido se vier do desafio Kasada que a PRÓPRIA página
//      resolve — pedir um em /integrity por fora devolve um token que o servidor rejeita. Por
//      isso o script embrulha o fetch em document-start só pra LER os headers das requisições
//      que a Twitch já faz sozinha, e reusa. Sem integrity o pool cai pra 100 por período
//      (ALL_TIME/LAST_MONTH/LAST_WEEK/LAST_DAY), que ainda dá uma lista utilizável.
//
//   2. `sort` só aceita VIEWS_DESC de verdade (CREATED_AT_DESC devolve server error). Ordenar
//      por data/duração/título é client-side — o que casa com o modelo aqui, que é carregar o
//      catálogo inteiro pra memória e filtrar localmente.
//
// O embrulho do fetch usa exportFunction quando existe: no Firefox, atribuir direto em
// unsafeWindow.fetch vira expando invisível pro Xray e a página continua chamando o original.

(function () {
    "use strict";

    // ===================================================================== //
    //  Constantes                                                           //
    // ===================================================================== //
    const CLIENT_ID = "kimne78kx3ncx6brgo4mv6wki5h1ko";
    const GQL_URL = "https://gql.twitch.tv/gql";
    const ACCENT = "#a970ff";
    const PAGE_SIZE = 100;          // teto da API
    const MAX_PAGES = 40;           // 4000 clipes — trava de segurança pra canais gigantes
    const CACHE_TTL_MS = 6 * 60 * 60 * 1000;
    const CACHE_PREFIX = "tvx:v1:";

    const W = (typeof unsafeWindow !== "undefined") ? unsafeWindow : window;
    const HTML = document.documentElement;
    HTML.dataset.tvxShell = "1"; // já no document-start: a topbar nunca chega a aparecer

    // Primeiro segmento da URL que NÃO é um canal.
    const RESERVED = new Set([
        "directory", "videos", "video", "settings", "subscriptions", "wallet", "drops",
        "friends", "inventory", "downloads", "u", "moderator", "popout", "search",
        "following", "store", "prime", "turbo", "jobs", "p", "team", "communities",
        "collections", "payments", "broadcast", "dashboard", "creatorcamp", "bits",
        "products", "legal", "privacy", "login", "signup", "activate", "gift",
    ]);
    const NATIVE_TABS = ["home", "about", "clips", "videos", "schedule", "chat"];

    // ===================================================================== //
    //  Helpers                                                              //
    // ===================================================================== //
    const addStyle = (css) => {
        if (typeof GM_addStyle === "function") return GM_addStyle(css);
        const s = document.createElement("style");
        s.textContent = css;
        (document.head || document.documentElement).appendChild(s);
    };
    const el = (tag, props = {}, ...kids) => {
        const n = document.createElement(tag);
        for (const [k, v] of Object.entries(props)) {
            if (v == null) continue;
            if (k === "class") n.className = v;
            else if (k === "html") n.innerHTML = v;
            else if (k === "style" && typeof v === "object") Object.assign(n.style, v);
            else if (k.startsWith("on") && typeof v === "function") n.addEventListener(k.slice(2).toLowerCase(), v);
            else if (k === "data") for (const [dk, dv] of Object.entries(v)) n.dataset[dk] = dv;
            else n.setAttribute(k, v);
        }
        for (const kid of kids.flat()) if (kid != null && kid !== false) n.append(kid.nodeType ? kid : document.createTextNode(String(kid)));
        return n;
    };
    const debounce = (fn, ms) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

    const nfCompact = new Intl.NumberFormat("pt-BR", { notation: "compact", maximumFractionDigits: 1 });
    const nfFull = new Intl.NumberFormat("pt-BR");
    const dtShort = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });
    const dtLong = new Intl.DateTimeFormat("pt-BR", { dateStyle: "long", timeStyle: "short" });
    const rtf = new Intl.RelativeTimeFormat("pt-BR", { numeric: "auto" });

    const fmtViews = (n) => nfCompact.format(n || 0);
    const fmtDur = (s) => {
        s = Math.max(0, Math.round(s || 0));
        const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), ss = s % 60;
        return h ? `${h}:${String(m).padStart(2, "0")}:${String(ss).padStart(2, "0")}`
                 : `${m}:${String(ss).padStart(2, "0")}`;
    };
    function formatTwitchTimestamp(totalSeconds) {
        const s = Math.max(0, Math.floor(totalSeconds || 0));
        const h = Math.floor(s / 3600);
        const m = Math.floor((s % 3600) / 60);
        const sec = s % 60;
        if (h > 0) return `${h}h${String(m).padStart(2, "0")}m${String(sec).padStart(2, "0")}s`;
        if (m > 0) return `${m}m${String(sec).padStart(2, "0")}s`;
        return `${sec}s`;
    }
    function parseTwitchTimestamp(t) {
        if (!t) return 0;
        t = String(t).trim();
        if (/^\d+$/.test(t)) return parseInt(t, 10);
        let total = 0;
        const h = t.match(/(\d+)\s*h/i);
        const m = t.match(/(\d+)\s*m/i);
        const s = t.match(/(\d+)\s*s/i);
        if (h) total += parseInt(h[1], 10) * 3600;
        if (m) total += parseInt(m[1], 10) * 60;
        if (s) total += parseInt(s[1], 10);
        return total;
    }
    let vodSeekTimer = null;
    function enforceNativeVodSeek(targetSec) {
        if (!targetSec || targetSec <= 0) return;
        if (vodSeekTimer) clearInterval(vodSeekTimer);

        let tries = 0;
        let confirmed = 0;
        const maxTries = 40; // 40 * 200ms = 8s

        vodSeekTimer = setInterval(() => {
            tries++;
            const video = document.querySelector(".video-player video, .persistent-player video, [data-a-target='video-player'] video, video");
            if (video && video.readyState >= 1 && video.duration && !isNaN(video.duration)) {
                const diff = Math.abs(video.currentTime - targetSec);
                if (diff > 2) {
                    try {
                        video.currentTime = targetSec;
                        confirmed = 0;
                    } catch {}
                } else {
                    confirmed++;
                    // Must confirm position for at least 3 checks (600ms) to ensure Twitch's resume logic didn't override it
                    if (confirmed >= 3 || tries >= 25) {
                        clearInterval(vodSeekTimer);
                        vodSeekTimer = null;
                    }
                }
            }
            if (tries >= maxTries) {
                clearInterval(vodSeekTimer);
                vodSeekTimer = null;
            }
        }, 200);
    }
    const UNITS = [["year", 31536000], ["month", 2592000], ["week", 604800], ["day", 86400], ["hour", 3600], ["minute", 60]];
    const ago = (iso) => {
        const diff = (Date.now() - new Date(iso).getTime()) / 1000;
        for (const [unit, secs] of UNITS) if (diff >= secs) return rtf.format(-Math.floor(diff / secs), unit);
        return rtf.format(-Math.floor(diff), "second");
    };
    // data LOCAL, não UTC: os <input type=date> e o parse em matches() são locais, e toISOString
    // jogaria o dia pra trás dependendo do fuso
    const ymd = (iso) => {
        const d = new Date(iso);
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    };
    const boxArt = (url, w, h) => (url || "").replace("{width}", w).replace("{height}", h);
    const norm = (s) => (s || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");

    // localStorage com TTL e tolerante a quota estourada.
    const store = {
        get(key, { ignoreTTL = false } = {}) {
            try {
                const raw = localStorage.getItem(CACHE_PREFIX + key);
                if (!raw) return null;
                const obj = JSON.parse(raw);
                if (!obj || (!ignoreTTL && obj.t && Date.now() - obj.t > CACHE_TTL_MS)) return null;
                return obj;
            } catch { return null; }
        },
        set(key, value) {
            try { localStorage.setItem(CACHE_PREFIX + key, JSON.stringify({ t: Date.now(), ...value })); }
            catch { store.prune(); try { localStorage.setItem(CACHE_PREFIX + key, JSON.stringify({ t: Date.now(), ...value })); } catch { /* desiste: fica só em memória */ } }
        },
        prune() {
            try {
                const keys = Object.keys(localStorage).filter((k) => k.startsWith(CACHE_PREFIX) && k !== CACHE_PREFIX + "prefs");
                for (const k of keys) localStorage.removeItem(k);
            } catch { /* nada a fazer */ }
        },
    };
    // prefs não expiram — o TTL é pro cache de listas, não pra configuração.
    const prefs = Object.assign(
        { loop: false, autoplay: true, quality: "1080", speed: 1, volume: 1, muted: false, sidebarOpen: true, favorites: [], navTab: "followed" },
        (store.get("prefs", { ignoreTTL: true }) || {}).v || {},
    );
    const savePrefs = debounce(() => store.set("prefs", { v: prefs }), 400);

    // ===================================================================== //
    //  Captura dos headers de integridade                                   //
    // ===================================================================== //
    // A Twitch resolve o desafio Kasada e manda Client-Integrity nas requisições dela. Só lemos.
    const captured = Object.create(null);
    const WANTED = ["client-integrity", "x-device-id", "device-id", "client-session-id", "client-version", "authorization", "client-id"];
    let integrityResolve;
    const integrityReady = new Promise((r) => { integrityResolve = r; });

    function takeHeader(k, v) {
        if (!v) return;
        const lk = String(k).toLowerCase();
        if (!WANTED.includes(lk)) return;
        captured[lk] = String(v);
        if (lk === "client-integrity") integrityResolve(true);
    }

    function sniffHeaders(input, init) {
        const url = typeof input === "string" ? input : (input && input.url) || "";
        if (!url || url.indexOf("gql.twitch.tv") < 0) return;
        let h = (init && init.headers) || (input && typeof input !== "string" && input.headers);
        if (!h) return;
        // Headers (DOM, atravessa o Xray), plain object, ou array de pares — cobre os três.
        try { if (typeof h.forEach === "function") { h.forEach((v, k) => takeHeader(k, v)); return; } } catch { /* segue */ }
        try { if (Array.isArray(h)) { for (const [k, v] of h) takeHeader(k, v); return; } } catch { /* segue */ }
        try { for (const k in h) takeHeader(k, h[k]); } catch { /* sem sorte, plano B assume */ }
    }

    (function hookFetch() {
        try {
            const orig = W.fetch;
            if (typeof orig !== "function") return;
            const wrapper = function (input, init) {
                try { sniffHeaders(input, init); } catch { /* nunca atrapalhar a página */ }
                return orig.apply(this, arguments);
            };
            if (typeof exportFunction === "function") exportFunction(wrapper, W, { defineAs: "fetch" });
            else W.fetch = wrapper;
        } catch { /* sem captura: cai no plano B por período */ }
    })();

    // ===================================================================== //
    //  Cliente GraphQL                                                      //
    // ===================================================================== //
    const HEADER_CASE = {
        "client-integrity": "Client-Integrity",
        "x-device-id": "X-Device-Id",
        "device-id": "Device-Id",
        "client-session-id": "Client-Session-Id",
        "client-version": "Client-Version",
        "authorization": "Authorization",
    };

    async function gql(query, { withIntegrity = false } = {}) {
        const headers = { "Client-Id": captured["client-id"] || CLIENT_ID, "Content-Type": "application/json" };
        if (withIntegrity) {
            for (const k of Object.keys(HEADER_CASE)) if (captured[k]) headers[HEADER_CASE[k]] = captured[k];
        }
        // credentials omit é obrigatório: a gql responde Access-Control-Allow-Origin: * e o
        // browser recusaria a resposta se a requisição levasse credenciais.
        const res = await fetch(GQL_URL, {
            method: "POST", headers, credentials: "omit", body: JSON.stringify({ query }),
        });
        if (!res.ok) throw new Error(`gql http ${res.status}`);
        const json = await res.json();
        if (json.errors && json.errors.length) {
            const err = new Error(json.errors[0].message);
            err.code = json.errors[0].extensions && json.errors[0].extensions.code;
            err.partial = json.data;
            throw err;
        }
        return json.data;
    }

    const CLIP_FIELDS = `
        id slug title viewCount createdAt durationSeconds language isFeatured thumbnailURL
        curator { id login displayName }
        game { id name boxArtURL }
        video { id }
        videoOffsetSeconds
        videoQualities { quality frameRate sourceURL }`;

    const VIDEO_FIELDS = `
        id title createdAt lengthSeconds viewCount previewThumbnailURL broadcastType status
        game { id name boxArtURL }`;

    const q = (s) => JSON.stringify(String(s)).slice(1, -1); // escapa pra dentro da query literal

    async function fetchChannel(login) {
        const d = await gql(`query { user(login: "${q(login)}") {
            id login displayName description primaryColorHex
            profileImageURL(width: 150) bannerImageURL
            roles { isPartner isAffiliate }
            followers { totalCount }
            stream { id title viewersCount createdAt type game { name boxArtURL } }
            lastBroadcast { startedAt title game { name } }
            videos(first: 1, type: ARCHIVE, sort: TIME) { edges { node { id } } }
        } }`);
        return d && d.user;
    }

    async function fetchClipPage(login, { period = "ALL_TIME", after = null, startAt = null, endAt = null } = {}) {
        const args = [`first: ${PAGE_SIZE}`];
        if (after) args.push(`after: "${q(after)}"`);
        const range = startAt ? `, startAt: "${startAt}", endAt: "${endAt}"` : "";
        args.push(`criteria: { period: ${period}, sort: VIEWS_DESC${range} }`);
        const d = await gql(
            `query { user(login: "${q(login)}") { clips(${args.join(", ")}) {
                edges { cursor node { ${CLIP_FIELDS} } }
                pageInfo { hasNextPage }
            } } }`,
            { withIntegrity: !!after },
        );
        const conn = d && d.user && d.user.clips;
        if (!conn) return { items: [], cursor: null, hasNext: false };
        const edges = conn.edges || [];
        return {
            items: edges.map((e) => e.node).filter(Boolean).map(normalizeClip),
            // só a última edge carrega cursor; o valor é btoa(offset), mas não vale reconstruir na mão
            cursor: edges.length ? edges[edges.length - 1].cursor : null,
            hasNext: !!(conn.pageInfo && conn.pageInfo.hasNextPage),
        };
    }

    async function fetchVideoPage(login, { type = "ARCHIVE", after = null } = {}) {
        const args = [`first: ${PAGE_SIZE}`, `type: ${type}`, "sort: TIME"];
        if (after) args.push(`after: "${q(after)}"`);
        const d = await gql(
            `query { user(login: "${q(login)}") { videos(${args.join(", ")}) {
                edges { cursor node { ${VIDEO_FIELDS} } }
                pageInfo { hasNextPage }
            } } }`,
            { withIntegrity: !!after },
        );
        const conn = d && d.user && d.user.videos;
        if (!conn) return { items: [], cursor: null, hasNext: false };
        const edges = conn.edges || [];
        return {
            items: edges.map((e) => e.node).filter(Boolean).map(normalizeVideo),
            cursor: edges.length ? edges[edges.length - 1].cursor : null,
            hasNext: !!(conn.pageInfo && conn.pageInfo.hasNextPage),
        };
    }

    const vodOwners = new Map();   // videoId -> login do canal dono

    async function fetchVideoOwner(id) {
        const d = await gql(`query { video(id: "${q(id)}") { id owner { login } } }`);
        const login = d && d.video && d.video.owner && d.video.owner.login;
        if (login) vodOwners.set(String(id), login);
        return login || null;
    }

    const vodAvailableCache = new Map();
    async function isVodAvailable(vodId) {
        if (!vodId) return false;
        const idStr = String(vodId);
        if (vodAvailableCache.has(idStr)) return vodAvailableCache.get(idStr);
        const videoPool = (state.pools && state.pools.videos) || (state.pool && state.pool.kind === "videos" ? state.pool : null);
        if (videoPool && videoPool.items.some((v) => String(v.id) === idStr)) {
            vodAvailableCache.set(idStr, true);
            return true;
        }
        try {
            const d = await gql(`query { video(id: "${q(idStr)}") { id status } }`);
            const ok = !!(d && d.video && d.video.id);
            vodAvailableCache.set(idStr, ok);
            return ok;
        } catch {
            vodAvailableCache.set(idStr, false);
            return false;
        }
    }

    async function fetchSingleClip(slug) {
        try {
            const d = await gql(`query { clip(slug: "${q(slug)}") { ${CLIP_FIELDS} } }`);
            return d && d.clip ? normalizeClip(d.clip) : null;
        } catch { return null; }
    }

    const tokenCache = new Map();
    async function fetchPlaybackToken(slug) {
        if (tokenCache.has(slug)) return tokenCache.get(slug);
        const d = await gql(`query { clip(slug: "${q(slug)}") {
            playbackAccessToken(params: { platform: "web", playerBackend: "mediaplayer", playerType: "site" }) { signature value }
        } }`);
        const t = d && d.clip && d.clip.playbackAccessToken;
        if (t) tokenCache.set(slug, t);
        return t;
    }

    // Os MP4 exigem assinatura (sem ela: 401). Com ela aceitam Range, então o seek funciona.
    function signedURL(sourceURL, token) {
        if (!sourceURL || !token) return null;
        return `${sourceURL}?sig=${encodeURIComponent(token.signature)}&token=${encodeURIComponent(token.value)}`;
    }

    function normalizeClip(n) {
        return {
            kind: "clip",
            id: n.id, slug: n.slug, title: n.title || "(sem título)",
            views: n.viewCount || 0,
            createdAt: n.createdAt, ts: new Date(n.createdAt).getTime(),
            duration: n.durationSeconds || 0,
            language: (n.language || "").toUpperCase(),
            featured: !!n.isFeatured,
            thumb: n.thumbnailURL || "",
            curator: n.curator ? (n.curator.displayName || n.curator.login) : "—",
            curatorLogin: n.curator ? n.curator.login : "",
            game: n.game ? n.game.name : "",
            gameArt: n.game ? n.game.boxArtURL : "",
            vodId: n.video ? n.video.id : null,
            vodOffset: n.videoOffsetSeconds || 0,
            qualities: (n.videoQualities || []).map((v) => ({ quality: v.quality, fps: v.frameRate, url: v.sourceURL })),
        };
    }

    function normalizeVideo(n) {
        return {
            kind: "video",
            id: n.id, slug: n.id, title: n.title || "(sem título)",
            views: n.viewCount || 0,
            createdAt: n.createdAt, ts: new Date(n.createdAt).getTime(),
            duration: n.lengthSeconds || 0,
            language: "",
            featured: n.broadcastType === "HIGHLIGHT",
            thumb: boxArt(n.previewThumbnailURL || "", 480, 272),
            curator: n.broadcastType === "ARCHIVE" ? "Transmissão" : (n.broadcastType === "HIGHLIGHT" ? "Destaque" : "Upload"),
            curatorLogin: "",
            game: n.game ? n.game.name : "",
            gameArt: n.game ? n.game.boxArtURL : "",
            vodId: n.id, vodOffset: 0,
            broadcastType: n.broadcastType || "ARCHIVE",
            qualities: [],
        };
    }

    // ===================================================================== //
    //  Pools (clips / vods) com carregamento progressivo                    //
    // ===================================================================== //
    function makePool(kind, login) {
        return {
            kind, login,
            items: [], seen: new Set(),
            loading: false, done: false, partial: false, error: null,
            listeners: new Set(),
            emit() { for (const fn of this.listeners) try { fn(this); } catch { /* um listener ruim não derruba os outros */ } },
            add(list) {
                let added = 0;
                for (const it of list) {
                    if (this.seen.has(it.id)) continue;
                    this.seen.add(it.id); this.items.push(it); added++;
                }
                return added;
            },
        };
    }

    const pools = new Map();
    const poolKey = (kind, login) => `${kind}:${login.toLowerCase()}`;

    function getPool(kind, login) {
        const key = poolKey(kind, login);
        if (!pools.has(key)) pools.set(key, makePool(kind, login));
        return pools.get(key);
    }

    // Cache em disco guarda os campos compactados — o pool inteiro em JSON cru estoura a quota
    // de localStorage rápido em canais grandes.
    const packClip = (c) => [c.id, c.slug, c.title, c.views, c.createdAt, c.duration, c.language,
        c.featured ? 1 : 0, c.thumb, c.curator, c.curatorLogin, c.game, c.gameArt, c.vodId, c.vodOffset,
        c.qualities.map((v) => `${v.quality}|${v.fps}|${v.url}`)];
    const unpackClip = (a) => ({
        kind: "clip", id: a[0], slug: a[1], title: a[2], views: a[3], createdAt: a[4],
        ts: new Date(a[4]).getTime(), duration: a[5], language: a[6], featured: !!a[7], thumb: a[8],
        curator: a[9], curatorLogin: a[10], game: a[11], gameArt: a[12], vodId: a[13], vodOffset: a[14],
        qualities: (a[15] || []).map((s) => { const p = s.split("|"); return { quality: p[0], fps: +p[1], url: p.slice(2).join("|") }; }),
    });
    const packVideo = (v) => [v.id, v.title, v.views, v.createdAt, v.duration, v.thumb, v.game, v.gameArt, v.broadcastType];
    const unpackVideo = (a) => ({
        kind: "video", id: a[0], slug: a[0], title: a[1], views: a[2], createdAt: a[3],
        ts: new Date(a[3]).getTime(), duration: a[4], language: "", thumb: a[5], game: a[6], gameArt: a[7],
        broadcastType: a[8], featured: a[8] === "HIGHLIGHT",
        curator: a[8] === "ARCHIVE" ? "Transmissão" : (a[8] === "HIGHLIGHT" ? "Destaque" : "Upload"),
        curatorLogin: "", vodId: a[0], vodOffset: 0, qualities: [],
    });

    function loadFromCache(pool) {
        const c = store.get(`${pool.kind}:${pool.login.toLowerCase()}`);
        if (!c || !c.a) return false;
        const unpack = pool.kind === "clips" ? unpackClip : unpackVideo;
        try { pool.add(c.a.map(unpack)); } catch { return false; }
        pool.done = !!c.done;
        pool.partial = !!c.partial;
        return pool.items.length > 0;
    }

    const saveToCache = debounce((pool) => {
        const pack = pool.kind === "clips" ? packClip : packVideo;
        // teto pra não travar o navegador serializando 4000 itens a cada update
        store.set(`${pool.kind}:${pool.login.toLowerCase()}`, {
            a: pool.items.slice(0, 8000).map(pack), done: pool.done, partial: pool.partial,
        });
    }, 1500);

    // Paginar (after:) exige o Client-Integrity da página e para em ~1000 clipes. Mas a busca
    // aceita startAt/endAt sem credencial nenhuma: dividimos o histórico em janelas de tempo
    // e, sempre que uma janela volta cheia (hasNextPage), partimos ela ao meio. Cada janela
    // que volta incompleta já é TODOS os clipes daquele intervalo. Mais recentes primeiro, e
    // sem teto: a lista agrega enquanto carrega, e ordem/filtros valem sobre o que já chegou.
    const CLIPS_EPOCH = Date.parse("2016-05-01T00:00:00Z"); // clipes não existem antes disso
    const CLIP_LANES = 4;      // janelas em paralelo

    // Rolar a lista em "mais vistos"/"mais recentes" pede só o próximo trecho; buscar texto,
    // filtrar ou ordenar de outro jeito precisa do catálogo inteiro pra ser honesto.
    function clipsWanted(pool) {
        if (state.pool !== pool || !state.filters) return false; // saiu da aba: pausa
        const f = state.filters, d = defaultFilters();
        const lazySort = f.sort === "views-desc" || f.sort === "date-desc";
        const plain = !f.text && !f.from && !f.to && !f.featuredOnly
            && ["minViews", "maxViews", "minDur", "maxDur"].every((k) => f[k] === d[k])
            && !f.curators.size && !f.games.size && !f.langs.size;
        if (!lazySort || !plain) return true;
        return filtered.length - rendered < 80; // perto do fim do que já está na tela
    }

    async function loadClips(pool) {
        if (pool.loading || pool.done) return;
        pool.loading = true; pool.fetching = true; pool.error = null; pool.partial = false; pool.emit();
        try {
            // o topo geral chega primeiro: a lista já é útil enquanto o resto carrega
            pool.add((await fetchClipPage(pool.login, { period: "ALL_TIME" })).items); pool.emit();

            // Link com clipe: começa pelas semanas em volta dele, não pelo presente
            const now = Date.now() + 60000;
            const stack = [[CLIPS_EPOCH, now]];
            const slug = new URLSearchParams(location.search).get("clip") || (state.route && state.route.clipSlug);
            const focus = slug ? await fetchSingleClip(slug).catch(() => null) : null;
            const at = focus && Date.parse(focus.createdAt);
            if (at > CLIPS_EPOCH && at < now) {
                pool.add([focus]);
                const a = Math.max(CLIPS_EPOCH, at - 14 * 86400000), b = Math.min(now, at + 14 * 86400000);
                stack.length = 0;
                if (a > CLIPS_EPOCH) stack.push([CLIPS_EPOCH, a]);
                if (b < now) stack.push([b, now]);
                stack.push([a, b]); // topo da pilha: vem primeiro
            }
            const iso = (t) => new Date(t).toISOString().replace(/\.\d+Z$/, "Z");
            while (stack.length) {
                // sob demanda: só busca mais quando a lista precisa (fim do scroll, busca, filtro)
                if (!clipsWanted(pool)) {
                    pool.fetching = false; pool.emit();
                    while (!clipsWanted(pool)) await sleep(400);
                }
                pool.fetching = true;
                const batch = stack.splice(-CLIP_LANES).reverse();
                const pages = await Promise.all(batch.map(([a, b]) =>
                    fetchClipPage(pool.login, { startAt: iso(a), endAt: iso(b) }).catch(() => null)));
                pages.forEach((page, i) => {
                    if (!page) return;
                    pool.add(page.items);
                    const [a, b] = batch[i];
                    // janela cheia e ainda divisível: as duas metades, a mais recente no topo da pilha
                    if (page.hasNext) {
                        if (b - a > 120000) { const m = Math.floor((a + b) / 2); stack.push([a, m], [m, b]); }
                        // >100 clipes em 2 minutos: fica o topo deles
                    }
                });
                pool.emit(); saveToCache(pool);
            }
            pool.done = true;
        } catch (e) {
            pool.error = e.message || String(e);
        } finally {
            pool.loading = false; pool.fetching = false; pool.emit(); saveToCache(pool);
        }
    }

    async function loadVideos(pool) {
        if (pool.loading || pool.done) return;
        pool.loading = true; pool.error = null; pool.emit();
        try {
            const gotIntegrity = await Promise.race([integrityReady, sleep(2000).then(() => false)]);
            for (const type of ["ARCHIVE", "HIGHLIGHT", "UPLOAD"]) {
                let cursor = null, pages = 0;
                do {
                    let page;
                    try { page = await fetchVideoPage(pool.login, { type, after: cursor }); }
                    catch (e) { if (e.code === "IntegrityCheckFailed") { pool.partial = true; break; } throw e; }
                    const added = pool.add(page.items);
                    pages++; cursor = page.hasNext && gotIntegrity ? page.cursor : null;
                    if (page.hasNext && !gotIntegrity) pool.partial = true;
                    pool.emit();
                    if (!added) break;
                } while (cursor && pages < MAX_PAGES);
            }
            pool.done = true;
        } catch (e) {
            pool.error = e.message || String(e);
        } finally {
            pool.loading = false; pool.emit(); saveToCache(pool);
        }
    }

    function ensurePool(kind, login) {
        const pool = getPool(kind, login);
        if (!pool.items.length && !pool.loading && !pool.done) {
            const cached = loadFromCache(pool);
            if (cached) {
                // já tem o que mostrar; revalida em segundo plano sem bloquear a UI
                pool.done = false;
                setTimeout(() => (kind === "clips" ? loadClips : loadVideos)(pool), 300);
            } else {
                (kind === "clips" ? loadClips : loadVideos)(pool);
            }
        }
        return pool;
    }

    // ===================================================================== //
    //  CSS                                                                  //
    // ===================================================================== //
    const ICON = {
        vod: "M4 4h16a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2zm0 2v12h16V6H4zm6 2.5 6 3.5-6 3.5v-7z",
        live: "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18Zm0 5a4 4 0 1 1 0 8 4 4 0 0 1 0-8Z",
        search: "M11 4a7 7 0 1 0 4.2 12.6l3.6 3.6 1.4-1.4-3.6-3.6A7 7 0 0 0 11 4Zm0 2a5 5 0 1 1 0 10 5 5 0 0 1 0-10Z",
        searchNav: "M10.5 2a8.5 8.5 0 1 0 5.2 15.2l4.6 4.6 1.4-1.4-4.6-4.6A8.5 8.5 0 0 0 10.5 2Zm0 2a6.5 6.5 0 1 1 0 13 6.5 6.5 0 0 1 0-13Z",
        close: "M18.3 5.7 12 12l6.3 6.3-1.4 1.4L10.6 13.4 4.3 19.7 2.9 18.3 9.2 12 2.9 5.7l1.4-1.4L10.6 10.6l6.3-6.3 1.4 1.4Z",
        down: "m12 15.6-5.2-5.2L8.2 9l3.8 3.8L15.8 9l1.4 1.4-5.2 5.2Z",
        dl: "M12 3a1 1 0 0 1 1 1v8.59l2.3-2.3a1 1 0 0 1 1.4 1.42l-4 4a1 1 0 0 1-1.4 0l-4-4a1 1 0 0 1 1.4-1.42l2.3 2.3V4a1 1 0 0 1 1-1zm-7 15a1 1 0 0 1 1-1h12a1 1 0 1 1 0 2H6a1 1 0 0 1-1-1z",
        ext: "M6 4h14v14h-2V7.5L5.5 20 4 18.5 16.5 6H6V4Z",
        link: "M3.9 12c0-1.71 1.39-3.1 3.1-3.1h4V7H7c-2.76 0-5 2.24-5 5s2.24 5 5 5h4v-1.9H7c-1.71 0-3.1-1.39-3.1-3.1zM8 13h8v-2H8v2zm9-6h-4v1.9h4c1.71 0 3.1 1.39 3.1 3.1s-1.39 3.1-3.1 3.1h-4V17h4c2.76 0 5-2.24 5-5s-2.24-5-5-5z",
        share: "M18 16.08c-.76 0-1.44.3-1.96.77L8.91 12.7c.05-.23.09-.46.09-.7s-.04-.47-.09-.7l7.05-4.11c.54.5 1.25.81 2.04.81 1.66 0 3-1.34 3-3s-1.34-3-3-3-3 1.34-3 3c0 .24.04.47.09.7L8.04 9.81C7.5 9.31 6.79 9 6 9c-1.66 0-3 1.34-3 3s1.34 3 3 3c.79 0 1.5-.31 2.04-.81l7.12 4.16c-.05.21-.08.43-.08.65 0 1.61 1.31 2.92 2.92 2.92 1.61 0 2.92-1.31 2.92-2.92s-1.31-2.92-2.92-2.92z",
        filter: "M3 5h18v2l-7 7v6l-4 2v-8L3 7V5Z",
        chat: "M4 3h16a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1h-6l-5 4v-4H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1Zm2 4v2h12V7H6Zm0 4v2h8v-2H6Z",
        day: "M7 2v2h10V2h2v2h2a1 1 0 0 1 1 1v15a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1h2V2h2Zm13 7H4v11h16V9Z",
        list: "M3 4h18v16H3V4Zm2 2v12h9V6H5Zm11 0v12h3V6h-3Z",
        star: "M12 2.5l2.9 6.2 6.6.9-4.8 4.6 1.2 6.6L12 17.6 6.1 20.8l1.2-6.6L2.5 9.6l6.6-.9L12 2.5Z",
        filter: "M3 5h18v2l-7 7v5l-4 2v-7L3 7V5Z",
        gear: "M19.14 12.94c.04-.31.06-.62.06-.94s-.02-.63-.06-.94l2.03-1.58a.5.5 0 0 0 .12-.64l-1.92-3.32a.5.5 0 0 0-.6-.22l-2.39.96a7 7 0 0 0-1.63-.94l-.36-2.54A.5.5 0 0 0 13.9 2h-3.84a.5.5 0 0 0-.49.42l-.36 2.54c-.59.24-1.13.56-1.63.94l-2.39-.96a.5.5 0 0 0-.6.22L2.67 8.48a.5.5 0 0 0 .12.64l2.03 1.58c-.04.31-.07.63-.07.94s.03.63.07.94l-2.03 1.58a.5.5 0 0 0-.12.64l1.92 3.32c.13.22.39.3.6.22l2.39-.96c.5.38 1.04.7 1.63.94l.36 2.54c.05.24.25.42.49.42h3.84c.24 0 .45-.18.49-.42l.36-2.54c.59-.24 1.13-.56 1.63-.94l2.39.96c.22.08.47 0 .6-.22l1.92-3.32a.5.5 0 0 0-.12-.64l-2.03-1.58ZM12 15.6a3.6 3.6 0 1 1 0-7.2 3.6 3.6 0 0 1 0 7.2Z",
        heart: "M12 21.35 10.55 20.03C5.4 15.36 2 12.27 2 8.5 2 5.41 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.08C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.41 22 8.5c0 3.77-3.4 6.86-8.55 11.54L12 21.35Zm0-2.7c4.76-4.31 8-7.24 8-10.15C20 6.5 18.5 5 16.5 5c-1.54 0-3.04 1-3.57 2.36h-1.86C10.54 6 9.04 5 7.5 5 5.5 5 4 6.5 4 8.5c0 2.91 3.24 5.84 8 10.15Z",
        browse: "M3 3h8v8H3V3Zm2 2v4h4V5H5Zm8-2h8v8h-8V3Zm2 2v4h4V5h-4ZM3 13h8v8H3v-8Zm2 2v4h4v-4H5Zm8-2h8v8h-8v-8Zm2 2v4h4v-4h-4Z",
        starOutline: "M12 15.39 8.24 17.66l.99-4.28-3.32-2.88 4.38-.37L12 6.09l1.71 4.04 4.38.37-3.32 2.88.99 4.28M22 9.24l-7.19-.62L12 2 9.19 8.62 2 9.24l5.45 4.73L5.82 21 12 17.27 18.18 21l-1.64-7.03L22 9.24Z",
        collapseRight: "M4 11h11.2l-4.6-4.6L12 5l7 7-7 7-1.4-1.4 4.6-4.6H4v-2Zm16-6h2v14h-2V5Z",
        prev: "M6 6a1 1 0 0 1 2 0v4.35l8.5-5.31A1 1 0 0 1 18 5.9v12.2a1 1 0 0 1-1.5.86L8 13.65V18a1 1 0 1 1-2 0V6z",
        next: "M18 6a1 1 0 0 0-2 0v4.35L7.5 5.04A1 1 0 0 0 6 5.9v12.2a1 1 0 0 0 1.5.86L16 13.65V18a1 1 0 0 0 2 0V6z",
        play: "M8 5.14v13.72a1 1 0 0 0 1.5.86l11-6.86a1 1 0 0 0 0-1.72l-11-6.86a1 1 0 0 0-1.5.86z",
        pause: "M7 5a1 1 0 0 0-1 1v12a1 1 0 0 0 1 1h2a1 1 0 0 0 1-1V6a1 1 0 0 0-1-1H7zm8 0a1 1 0 0 0-1 1v12a1 1 0 0 0 1 1h2a1 1 0 0 0 1-1V6a1 1 0 0 0-1-1h-2z",
        loop: "M7 7h10v3l4-4-4-4v3H5v6h2V7zm10 10H7v-3l-4 4 4 4v-3h12v-6h-2v4z",
        volumeHigh: "M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z",
        volumeMed: "M18.5 12c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM5 9v6h4l5 5V4L9 9H5z",
        volumeMute: "M16.5 12c0-1.77-1.02-3.29-2.5-4.03v2.21l2.45 2.45c.03-.2.05-.41.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51C20.63 14.91 21 13.5 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3L3 4.27l4.73 4.73H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06c1.38-.31 2.63-.95 3.69-1.81L19.73 21 21 19.73l-9-9L4.27 3zM12 4L9.91 6.09 12 8.18V4z",
        fullscreen: "M7 14H5v5h5v-2H7v-3Zm-2-4h2V7h3V5H5v5Zm12 7h-3v2h5v-5h-2v3ZM14 5v2h3v3h2V5h-5Z",
        fullscreenExit: "M5 16h3v3h2v-5H5v2Zm3-8H5v2h5V5H8v3Zm6 11h2v-3h3v-2h-5v5Zm2-11V5h-2v5h5V8h-3Z",
    };
    const svg = (d, size = 18) =>
        `<svg viewBox="0 0 24 24" width="${size}" height="${size}" aria-hidden="true"><path fill="currentColor" d="${d}"/></svg>`;

    addStyle(`
        :root {
            --tvx-accent: ${ACCENT}; --tvx-navh: 50px;
            --tvx-top: 5rem;    /* altura da nav global da Twitch */
            --tvx-left: 0px;    /* largura da sidebar de canais */
            --tvx-right: 0px;   /* largura da coluna do chat, se visível */
            --tvx-avail: 100vh; /* altura útil do scroller (abaixo da nav global) */
            --tvx-chatw: 0px;   /* = --tvx-right, mas só conta na aba Live */
            --tvx-sidew: 340px; /* largura da lista de clipes/vídeos */
            --tvx-listw: 0px;   /* = --tvx-sidew quando a lista está aberta */
        }

        /* ---------- tema global, um degrau mais escuro ----------
           A Twitch pinta a interface inteira a partir de custom properties. Sobrescrevê-las
           alcança todo o site de uma vez (cards, modais, inputs, sidebars) sem caçar seletor
           por seletor — e sem quebrar quando eles trocam as classes com hash. */
        html.tw-root--theme-dark, :root {
            --color-background-body: #08080a;
            --color-background-base: #0f0f12;
            --color-background-alt: #17171b;
            --color-background-alt-2: #17171b;
            --color-background-float: #1c1c21;
            --color-background-input: #121215;
            --color-background-input-focus: #121215;
            --color-background-social-column: #0f0f12;
            --color-background-modal: #121215;
            --color-background-top-nav: #08080a;
            --color-background-chat: #0a0a0c;
            --color-background-chat-alt: #101014;
            --color-background-chat-header: #0a0a0c;
        }

        /* ---------- propaganda na barra superior ----------
           Primeira linha de defesa, aplicada já no document-start. Não basta sozinha: o botão de
           Bits vive num wrapper que também carrega o pontinho de "novidade" (ficava um ponto
           solto na barra), e o "Try 1-Month Ad-Free" não tem data-a-target nenhum — só rótulo.
           Quem resolve os dois é hideTopNavAds(), que sobe até o bloco inteiro e casa por texto. */
        [data-a-target="prime-offers-icon"],
        [data-a-target="top-nav-get-bits-button"] { display: none !important; }

        /* ---------- sem topbar: tudo na coluna da esquerda ----------
           A barra superior continua no DOM (é do React, e os balões de notificação/menu se
           ancoram nos botões dela) — só some da tela: a nav vira altura 0 e cada controle dela é
           fixado num ponto da sidebar. syncShell mede onde (--tvx-shellw = largura atual da
           sidebar; os ícones da conta ganham coordenadas da linha da lista que os representa). */
        /* até a casca montar (boot rápido), topbar e sidebar ficam invisíveis: sem o "pulo" */
        html[data-tvx-shell="1"]:not([data-tvx-ready]) :is(.top-nav, .side-nav, #tvx-nav, #tvx-wordmark, #tvx-footer) { opacity: 0 !important; }
        html[data-tvx-shell="1"] .top-nav,
        html[data-tvx-shell="1"] .top-nav__menu {
            height: 0 !important; min-height: 0 !important; overflow: visible !important;
            border: 0 !important; box-shadow: none !important; background: transparent !important;
        }
        /* logo: o nosso wordmark substitui o nativo (que segue no DOM e recebe o clique) */
        html[data-tvx-shell="1"] .top-nav [data-a-target="home-link"] { position: fixed !important; left: -9999px !important; }
        #tvx-wordmark {
            position: fixed; top: 0; left: 0; z-index: 1001; display: flex; align-items: center;
            width: calc(var(--tvx-shellw, 240px) - 48px); height: var(--tvx-navh); padding: 0 20px; box-sizing: border-box;
            border: 0; background: none; cursor: pointer; color: #fff;
        }
        #tvx-wordmark svg { display: block; transition: opacity .15s ease; }
        #tvx-wordmark .tvx-wm { height: 24px; width: auto; }
        #tvx-wordmark .tvx-glitch { display: none; width: 26px; height: 28px; fill: #fff; }
        #tvx-wordmark:hover svg { opacity: .8; }
        html[data-tvx-shell="1"][data-tvx-collapsed="1"] #tvx-wordmark { width: var(--tvx-shellw); padding: 0; justify-content: center; }
        html[data-tvx-shell="1"][data-tvx-collapsed="1"] #tvx-wordmark .tvx-wm { display: none; }
        html[data-tvx-shell="1"][data-tvx-collapsed="1"] #tvx-wordmark .tvx-glitch { display: block; }
        /* recolher/expandir: na linha do logo, alinhado com a barra do canal; recolhida, logo abaixo dele */
        html[data-tvx-shell="1"] .side-nav [data-a-target="side-nav-arrow"] {
            position: fixed !important; z-index: 1002; margin: 0 !important;
            top: calc((var(--tvx-navh) - 30px) / 2) !important; left: calc(var(--tvx-shellw) - 42px) !important;
        }
        html[data-tvx-shell="1"][data-tvx-collapsed="1"] .side-nav [data-a-target="side-nav-arrow"] {
            top: calc(var(--tvx-navh) + 6px) !important; left: calc((var(--tvx-shellw) - 30px) / 2) !important;
        }
        html[data-tvx-theatre="1"] #tvx-wordmark, html.tw-root--theatre #tvx-wordmark { display: none; }

        /* busca: some da tela até o item "Buscar" abrir o modal; aberto, é a busca nativa no centro */
        html[data-tvx-shell="1"] .top-nav__search-container {
            position: fixed !important; left: 50% !important; top: -400px !important; visibility: hidden;
            width: min(640px, calc(100vw - 48px)) !important; max-width: none !important; margin: 0 !important;
            transform: translateX(-50%); z-index: 2001;
        }
        html[data-tvx-shell="1"][data-tvx-search="1"] .top-nav__search-container { top: 18vh !important; visibility: visible; }
        html[data-tvx-shell="1"] .top-nav__search-container .search-box,
        html[data-tvx-shell="1"] .top-nav__search-container [data-a-target="nav-search-box"] { width: 100% !important; max-width: none !important; }
        html[data-tvx-search="1"] .top-nav__search-container input {
            height: 52px !important; font-size: 16px !important; padding-left: 18px !important;
            border: 0 !important; box-shadow: none !important; outline: none !important; border-radius: 14px !important;
            background: #1f1f23 !important;
        }
        /* sem a moldura branca/roxa da Twitch: campo, lupa e sugestões viram cartões arredondados */
        html[data-tvx-search="1"] .top-nav__search-container :is(input, button, [class*="InputWrapper"], [class*="Combo"]) {
            box-shadow: none !important; outline: none !important;
        }
        html[data-tvx-search="1"] .top-nav__search-container input:focus { box-shadow: 0 0 0 2px rgba(169,112,255,.55) !important; }
        html[data-tvx-search="1"] .top-nav__search-container :is([data-a-target="nav-search-button"], button[aria-label="Botão de busca"], button[aria-label="Search Button"]) {
            border-radius: 14px !important; height: 52px !important; width: 52px !important; margin-left: 8px !important; background: #1f1f23 !important;
        }
        /* a bandeja de sugestões tem max-width 400px fixo: ocupa a largura do modal */
        html[data-tvx-search="1"] .top-nav__search-container .search-tray { max-width: none !important; width: 100% !important; }
        html[data-tvx-search="1"] .top-nav__search-container .search-tray :is([role="row"], [role="gridcell"], [role="row"] a, .search-item) { width: 100% !important; max-width: none !important; }
        html[data-tvx-search="1"] .top-nav__search-container .search-tray :is(.search-item, a) { border-radius: 10px !important; }
        html[data-tvx-search="1"] .top-nav__search-container .search-tray :is(strong, p, span) { font-size: 15px !important; line-height: 1.35 !important; }
        html[data-tvx-search="1"] .top-nav__search-container .search-tray .search-item { min-height: 48px; }
        html[data-tvx-search="1"] .top-nav__search-container > *,
        html[data-tvx-search="1"] .top-nav__search-container > * > * { border-radius: 18px !important; }
        html[data-tvx-search="1"] .top-nav__search-container [role="dialog"],
        html[data-tvx-search="1"] .top-nav__search-container [class*="Balloon"] > div {
            border: 0 !important; border-radius: 14px !important; margin-top: 8px !important; overflow: hidden;
            box-shadow: 0 18px 50px rgba(0,0,0,.55) !important; background: #18181b !important;
        }
        #tvx-search-backdrop {
            position: fixed; inset: 0; z-index: 998; display: none; /* abaixo da topbar (z 1000), onde mora o campo */
            background: rgba(0,0,0,.6); backdrop-filter: blur(2px); animation: tvx-fade .15s ease;
        }
        html[data-tvx-search="1"] #tvx-search-backdrop { display: block; }
        @keyframes tvx-fade { from { opacity: 0; } }

        /* ícones da conta (notificações, sussurros…) viram linhas da lista. O bloco nativo fica
           fixado em cima da linha (é ele que ancora o balão), mas transparente ao mouse: o clique
           cai na linha, que repassa pro botão. Os balões dentro dele seguem clicáveis. */
        html[data-tvx-shell="1"] [data-tvx-navitem][data-tvx-navitem] { /* dobrado: vence as regras do rodapé */
            position: fixed !important; z-index: 1001; margin: 0 !important; pointer-events: none; flex: none !important;
            left: var(--tvx-x, -9999px) !important; top: var(--tvx-y, 0px) !important;
            width: var(--tvx-w, 0px) !important; height: 40px !important;
        }
        html[data-tvx-shell="1"] [data-tvx-navitem] * { pointer-events: none !important; }
        html[data-tvx-shell="1"] [data-tvx-navitem] *:has([data-tvx-navctl]) {
            display: block !important; width: 100% !important; height: 100% !important; margin: 0 !important; padding: 0 !important;
        }
        html[data-tvx-shell="1"] [data-tvx-navctl] {
            display: block !important; width: 100% !important; height: 100% !important; margin: 0 !important;
            opacity: 0 !important; pointer-events: auto !important; cursor: pointer !important;
        }
        html[data-tvx-shell="1"] :is([data-tvx-pop], [data-tvx-pop] *) { pointer-events: auto !important; }
        html[data-tvx-shell="1"][data-tvx-collapsed="1"] .tvx-navslot { padding: 0; justify-content: center; gap: 0; }
        html[data-tvx-shell="1"][data-tvx-collapsed="1"] .tvx-navslot span { display: none; }
        .side-nav--collapsed #tvx-navlinks { display: flex !important; padding: 6px 4px !important; }
        .side-nav--collapsed #tvx-navlinks .tvx-navlink { justify-content: center; padding: 0 !important; font-size: 0 !important; gap: 0; }
        /* o balão nativo abre ao lado da sidebar, não por cima dela */
        html[data-tvx-shell="1"] [data-tvx-navitem] :is([class*="Balloon"], [role="dialog"]) {
            top: 0 !important; bottom: auto !important; left: calc(100% + 8px) !important; right: auto !important;
        }
        /* a linha é nossa (ícone + rótulo, igual aos links acima); o botão nativo fica invisível
           por cima dela só pra receber o clique e ancorar o balão */
        .tvx-navslot { position: relative; height: 40px; display: flex; align-items: center; gap: 12px;
            padding: 0 12px; border-radius: 8px; box-sizing: border-box; transition: all .14s ease;
            color: #dedee3; font: 600 15px/1.3 Inter, Roobert, "Helvetica Neue", system-ui, sans-serif; }
        .tvx-navslot.tvx-hover { background: rgba(255,255,255,.07); color: var(--tvx-accent); }
        .tvx-navslot-ico { flex: none; width: 20px; height: 20px; fill: currentColor; }
        .tvx-navslot-ico * { fill: currentColor; }

        /* rodapé da sidebar: avatar + nome (o menu da conta é o nativo, fixado aqui) */
        #tvx-footer {
            position: fixed; left: 0; bottom: 0; z-index: 999; display: flex; align-items: center;
            width: var(--tvx-shellw, 240px); height: 60px; padding: 0 52px 0 8px; box-sizing: border-box;
            background: var(--color-background-base); border-top: 1px solid rgba(255,255,255,.08);
            pointer-events: none;
        }
        /* logado: avatar + nome são um botão só, que abre o menu nativo da conta */
        #tvx-userbtn {
            display: none; align-items: center; gap: 10px; min-width: 0; max-width: 100%; height: 44px;
            padding: 0 10px 0 6px; border: 0; border-radius: 10px; background: transparent; cursor: pointer;
            font: 600 14px/1.2 Inter, Roobert, "Helvetica Neue", system-ui, sans-serif; color: #efeff1;
            pointer-events: auto; transition: background .14s ease;
        }
        #tvx-userbtn:hover { background: rgba(255,255,255,.07); }
        #tvx-userbtn .tvx-userav { flex: none; width: 32px; height: 32px; border-radius: 50%; overflow: hidden; display: flex; }
        #tvx-userbtn .tvx-userav > * { width: 100% !important; height: 100% !important; margin: 0 !important; }
        #tvx-userbtn .tvx-userav img { object-fit: cover; }
        #tvx-userbtn > span:not(.tvx-userav) { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        html[data-tvx-named="1"] #tvx-userbtn { display: flex; }
        /* o toggle nativo segue lá (ancora o menu), invisível e fora do caminho do mouse */
        html[data-tvx-shell="1"][data-tvx-named="1"] [data-tvx-accountbar] { pointer-events: none; }
        html[data-tvx-shell="1"][data-tvx-named="1"] [data-tvx-accountbar] * { pointer-events: auto; }
        html[data-tvx-shell="1"][data-tvx-named="1"] [data-tvx-accountbar] [data-a-target="user-menu-toggle"] { opacity: 0 !important; pointer-events: none !important; }
        html[data-tvx-shell="1"][data-tvx-named="1"] [data-tvx-accountbar] :has(> [data-a-target="user-menu-toggle"]) { pointer-events: none !important; }
        html[data-tvx-shell="1"][data-tvx-collapsed="1"] #tvx-footer { padding: 0; justify-content: center; }
        html[data-tvx-shell="1"][data-tvx-collapsed="1"] #tvx-userbtn { padding: 0 6px; }
        html[data-tvx-shell="1"][data-tvx-collapsed="1"] #tvx-userbtn > span:not(.tvx-userav) { display: none; }
        html[data-tvx-shell="1"] [data-tvx-accountbar] {
            position: fixed !important; left: 0 !important; right: auto !important; top: auto !important; bottom: 0 !important; z-index: 1001;
            width: var(--tvx-shellw, 240px) !important; height: 60px !important; box-sizing: border-box; overflow: visible;
            justify-content: flex-start !important;
            display: flex !important; align-items: center; gap: 6px; padding: 0 8px;
        }
        html[data-tvx-shell="1"] [data-tvx-accountbar] > * { flex: 0 1 auto !important; width: auto !important; min-width: 0; }
        /* os blocos que sobraram vazios no rodapé não ocupam espaço — menos os que viraram linha
           da lista (o de notificações é filho direto da barra; os outros moram mais fundo) */
        html[data-tvx-shell="1"] [data-tvx-accountbar] > :not(:has([data-a-target="dropdown-up"])):not([data-tvx-navitem], [data-tvx-footmore]) {
            flex: 0 0 0 !important; width: 0 !important; min-width: 0 !important; margin: 0 !important; padding: 0 !important;
        }
        html[data-tvx-shell="1"] [data-tvx-accountbar] :has(> [data-a-target="dropdown-up"]) { margin: 0 !important; padding: 0 !important; }
        html[data-tvx-shell="1"] [data-tvx-footmore] {
            position: fixed !important; z-index: 1002; margin: 0 !important;
            bottom: 10px !important; top: auto !important; left: calc(var(--tvx-shellw) - 50px) !important; width: 40px !important; height: 40px !important;
        }
        html[data-tvx-shell="1"] [data-tvx-footmore] *:has(button), html[data-tvx-shell="1"] [data-tvx-footmore] button {
            width: 100% !important; height: 100% !important; display: flex !important; align-items: center !important; justify-content: center !important;
        }
        html[data-tvx-shell="1"] [data-tvx-pop] {
            position: fixed !important; inset: auto !important; transform: none !important; margin: 0 !important;
            left: calc(var(--tvx-shellw) + 8px) !important; top: var(--tvx-pop-y) !important; z-index: 3100 !important;
        }
        html[data-tvx-shell="1"][data-tvx-collapsed="1"] [data-tvx-footmore],
        html[data-tvx-theatre="1"] [data-tvx-footmore], html.tw-root--theatre [data-tvx-footmore] { display: none !important; }
        html[data-tvx-shell="1"][data-tvx-named="1"] [data-tvx-accountbar] { justify-content: flex-start; }
        html[data-tvx-shell="1"][data-tvx-collapsed="1"] [data-tvx-accountbar] { padding: 0; justify-content: center; }
        /* o avatar abre a fila (o nome do rodapé fica logo depois dele); recolhida, só ele */
        html[data-tvx-shell="1"] [data-tvx-accountbar] :has(> [data-a-target="dropdown-up"]) { display: flex !important; align-items: center; gap: 6px; }
        html[data-tvx-shell="1"] [data-tvx-accountbar] [data-a-target="dropdown-up"] { order: -1; }
        html[data-tvx-shell="1"] [data-tvx-accountbar] :is([data-a-target="dropdown-up"], [data-a-target="dropdown-up"] > *, [data-a-target="dropdown-up"] > * > *) { margin: 0 !important; padding: 0 !important; }
        html[data-tvx-shell="1"] [data-tvx-accountbar] [data-a-target="user-card"] { display: flex !important; gap: 6px; min-width: 0; }
        html[data-tvx-shell="1"] [data-tvx-accountbar] [data-a-target="user-card"] > * { margin: 0 !important; padding: 0 !important; }
        html[data-tvx-shell="1"] [data-tvx-accountbar] :is([data-a-target="login-button"], [data-a-target="signup-button"]) { padding: 0 10px !important; min-width: 0 !important; }
        html[data-tvx-shell="1"][data-tvx-collapsed="1"] [data-tvx-accountbar] [data-a-target="user-card"] { display: none !important; }
        /* deslogado não cabe Entrar + Cadastrar: o cadastro segue no menu da conta e no banner */
        html[data-tvx-shell="1"] [data-tvx-accountbar] [data-a-target="user-card"] > :has([data-a-target="signup-button"]) { display: none !important; }
        /* os balões da conta abrem pra cima, dentro da tela */
        html[data-tvx-shell="1"] [data-tvx-accountbar] [role="dialog"],
        html[data-tvx-shell="1"] [data-tvx-accountbar] [class*="Balloon"] {
            top: auto !important; bottom: calc(100% + 8px) !important;
        }
        html[data-tvx-theatre="1"] :is(#tvx-footer, [data-tvx-accountbar]),
        html.tw-root--theatre :is(#tvx-footer, [data-tvx-accountbar]) { display: none !important; }
        /* a sidebar começa no topo da tela e reserva o logo em cima e o rodapé embaixo */
        html[data-tvx-shell="1"] .side-nav {
            padding-top: var(--tvx-navh) !important; padding-bottom: 60px !important; box-sizing: border-box !important;
            background: var(--color-background-base) !important;
        }
        html[data-tvx-shell="1"][data-tvx-collapsed="1"] .side-nav { padding-top: calc(var(--tvx-navh) + 42px) !important; }
        /* "Abrir stories" vira a linha "Stories" da lista: o original some desde o primeiro quadro */
        html[data-tvx-shell="1"] .side-nav:not(.side-nav--collapsed) :is([class*="stories" i], [data-a-target*="stories" i]) { display: none !important; }
        /* "Mostrar mais/menos": a lista já vem inteira (expandSideNavSections) e rola sozinha */
        [data-a-target="side-nav-show-more-button"], [data-a-target="side-nav-show-less-button"],
        .side-nav-show-more-toggle__button { display: none !important; }

        /* ---------- sidebar esquerda: cabe na tela, cada seção rola sozinha ----------
           A sidebar inteira rolava numa barra só, e cada seção terminava num "Mostrar mais".
           Aqui ela vira uma coluna flex que ocupa exatamente a altura disponível, sem barra
           própria; cada seção divide o espaço e rola por dentro, com o cabeçalho grudado. */
        /* A altura de cada seção é MEDIDA e aplicada por tabifySideNav(), não por flex:
           numa sidebar logada existem itens entre as seções ("For You", "Open stories"), então
           .side-nav-section nem sempre é filha direta daqui — e aí "flex: 1 1 0" não valia nada
           e a lista crescia até o fim da página. */
        html[data-tvx-nav="1"] .side-nav:not(.side-nav--collapsed) .side-nav__scrollable_content { overflow: hidden !important; }
        /* com abas, o cabeçalho de cada seção vira redundante — o rótulo já é a aba */
        html[data-tvx-nav="1"] .side-nav:not(.side-nav--collapsed) .side-nav-section > *:first-child:not(:last-child) { display: none !important; }
        #tvx-favs .tvx-navsec-head { display: none; }
        #tvx-favs .tvx-navsec-head-antigo { display: none; }
        .side-nav--collapsed #tvx-favs { display: none !important; }

        /* Open stories na sidebar: ajuste de margens e z-index para não sobrepor dropdown */
        .side-nav:not(.side-nav--collapsed) [style*="margin-top: 0.7rem"],
        .side-nav:not(.side-nav--collapsed) [style*="margin-top:0.7rem"],
        .side-nav:not(.side-nav--collapsed) [style*="margin-top: 1rem"],
        .side-nav:not(.side-nav--collapsed) [class*="stories" i],
        .side-nav:not(.side-nav--collapsed) [data-a-target*="stories" i] {
            margin-top: 1rem !important;
            margin-bottom: 1rem !important;
            position: relative;
            z-index: 1 !important;
        }

        /* .side-nav__title: transformado no container do dropdown */
        .side-nav__title {
            position: relative !important;
            z-index: 50 !important;
            display: flex !important;
            flex-direction: column !important;
            width: 100% !important;
            padding: 0 !important;
            margin: 0 !important;
            box-sizing: border-box !important;
        }
        .side-nav__title:has([aria-expanded="true"]) {
            z-index: 1000 !important;
        }
        .side-nav--collapsed .side-nav__title { display: none !important; }
        .side-nav__title:has(#tvx-navtabs-wrap) { padding: 0 !important; margin: 0 !important; min-height: 0 !important; }

        /* dropdown de navegação da sidebar */
        #tvx-navtabs-wrap {
            position: relative !important;
            z-index: 50 !important;
            display: flex; flex-direction: column;
            width: 100%; box-sizing: border-box;
            padding: 8px 0 !important; margin: 0 0 6px !important;
            border-bottom: 1px solid rgba(255,255,255,.08);
            background: transparent;
            font-family: Inter, Roobert, "Helvetica Neue", system-ui, sans-serif;
        }
        #tvx-navtabs-wrap:has([aria-expanded="true"]) {
            z-index: 1000 !important;
        }
        .side-nav--collapsed #tvx-navtabs-wrap { display: none !important; }

        .tvx-navdropdown-btn {
            display: flex !important; align-items: center !important; justify-content: space-between !important; width: 100% !important;
            border: 0 !important; outline: none !important; background: transparent !important; color: #efeff1 !important;
            font-size: 15px !important; font-weight: 700 !important; line-height: 1.3 !important;
            padding: 6px 8px !important; border-radius: 6px !important; cursor: pointer !important;
            box-sizing: border-box !important; font-family: inherit !important;
            transition: background .15s ease, color .15s ease !important;
        }
        .tvx-navdropdown-btn:hover { background: rgba(255,255,255,.06) !important; color: #fff !important; }
        .tvx-navdropdown-label {
            font-weight: 700 !important; font-size: 15px !important; overflow: hidden !important; text-overflow: ellipsis !important; white-space: nowrap !important; flex: 1 1 auto !important; text-align: left !important;
        }
        .tvx-navdropdown-chevron {
            flex: 0 0 auto !important; margin-left: auto !important; transition: transform .2s ease !important; display: inline-flex !important; align-items: center !important; justify-content: center !important; color: #adadb8 !important;
        }
        .tvx-navdropdown-btn:hover .tvx-navdropdown-chevron { color: #efeff1 !important; }
        .tvx-navdropdown-btn { padding-right: 44px !important; }
        .tvx-navdropdown-btn .tvx-navdropdown-chevron { position: absolute; right: 8px; }
        .tvx-navsearch-btn {
            position: absolute; top: 10px; right: 38px; width: 28px; height: 28px; border: 0; border-radius: 8px; cursor: pointer;
            display: flex; align-items: center; justify-content: center; background: transparent; color: #adadb8;
        }
        .tvx-navsearch-btn:hover, #tvx-navtabs-wrap[data-search="1"] .tvx-navsearch-btn { background: rgba(255,255,255,.08); color: #efeff1; }
        .tvx-navsearch-row { display: none; padding: 6px 4px 0; }
        #tvx-navtabs-wrap[data-search="1"] .tvx-navsearch-row { display: block; }
        .tvx-navsearch-in {
            width: 100%; height: 34px; box-sizing: border-box; padding: 0 12px; border: 0; border-radius: 10px; outline: none;
            background: #1f1f23; color: #fff; font-family: inherit; font-size: 13.5px;
        }
        .tvx-navsearch-in:focus { box-shadow: 0 0 0 2px rgba(169,112,255,.55); }

        /* canais da lista: mais respiro, foto maior, contador menor */
        .side-nav:not(.side-nav--collapsed) .side-nav-card__link { padding-top: 7px !important; padding-bottom: 7px !important; }
        .side-nav:not(.side-nav--collapsed) .side-nav-card__avatar,
        .side-nav:not(.side-nav--collapsed) .side-nav-card__avatar :is(.tw-avatar, img) {
            width: 36px !important; height: 36px !important; flex: 0 0 36px !important;
        }
        .side-nav:not(.side-nav--collapsed) .side-nav-card__avatar { margin-right: 2px; }
        .side-nav-card__live-status :is(span, p) { font-size: 12px !important; }
        .side-nav-card__live-status .tw-channel-status-indicator { width: 7px !important; height: 7px !important; }
        #tvx-avatar-preview {
            position: fixed; z-index: 4000; width: 240px; border-radius: 16px; overflow: hidden; pointer-events: none;
            background: #1f1f23; box-shadow: 0 16px 48px rgba(0,0,0,.6), inset 0 0 0 1px rgba(255,255,255,.08);
            opacity: 0; transform: scale(.96); transform-origin: left center; transition: opacity .12s ease, transform .12s ease;
            font-family: Inter, Roobert, "Helvetica Neue", system-ui, sans-serif;
        }
        #tvx-avatar-preview[data-on="1"] { opacity: 1; transform: none; }
        #tvx-avatar-preview > img { width: 100%; aspect-ratio: 1; object-fit: cover; display: block; background: #18181b; }
        .tvx-ap-txt { padding: 12px 14px 14px; display: flex; flex-direction: column; gap: 4px; }
        .tvx-ap-txt b { font-size: 15px; font-weight: 700; color: #fff; }
        .tvx-ap-txt p { margin: 0; font-size: 13px; line-height: 1.4; color: #dedee3; display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden; }
        .tvx-ap-txt p:empty, .tvx-ap-txt small:empty { display: none; }
        .tvx-ap-txt small { font-size: 12px; color: #9a9aa6; }
        /* o balão de título nativo fica escondido enquanto o cartão está aberto */
        html[data-tvx-avatar-prev="1"] :is(.ReactModal__Content:has([class*="channel-tooltip"]), [class*="channel-tooltip"]) { visibility: hidden !important; }
        .tvx-navdropdown-btn[aria-expanded="true"] .tvx-navdropdown-chevron {
            transform: rotate(180deg) !important;
        }

        .tvx-navdropdown-menu {
            position: absolute; top: calc(100% + 2px); left: 8px; right: 8px; z-index: 2000 !important;
            background: #18181b; border: 1px solid rgba(255,255,255,.14); border-radius: 8px;
            box-shadow: 0 6px 20px rgba(0,0,0,.6); padding: 4px;
            display: flex; flex-direction: column; gap: 2px;
            box-sizing: border-box; max-height: 320px; overflow-y: auto;
        }
        .tvx-navdropdown-menu[hidden] { display: none !important; }
        .tvx-navdropdown-menu::-webkit-scrollbar { width: 4px; }
        .tvx-navdropdown-menu::-webkit-scrollbar-thumb { background: rgba(255,255,255,.2); border-radius: 4px; }

        .tvx-navdropdown-item {
            display: flex; align-items: center; justify-content: space-between; width: 100%;
            border: 0; outline: none; background: transparent; color: #efeff1;
            font-size: 14px; font-weight: 500; line-height: 1.3;
            padding: 7px 10px; border-radius: 6px; cursor: pointer;
            box-sizing: border-box; font-family: inherit; text-align: left;
            transition: background .12s ease, color .12s ease;
        }
        .tvx-navdropdown-item:hover { background: rgba(255,255,255,.08); color: #fff; }
        .tvx-navdropdown-item[aria-selected="true"] {
            color: #a970ff; font-weight: 700; background: rgba(169,112,255,.12);
        }
        .tvx-navdropdown-item-label {
            overflow: hidden; text-overflow: ellipsis; white-space: nowrap; flex: 1 1 auto;
        }
        .tvx-navdropdown-check {
            flex: 0 0 auto; margin-left: 8px; color: #a970ff; display: none; align-items: center; justify-content: center;
        }
        .tvx-navdropdown-item[aria-selected="true"] .tvx-navdropdown-check {
            display: inline-flex;
        }
        .tvx-favvazio { margin: 0; padding: 14px 12px; font-size: 12px; line-height: 1.5; color: #adadb8; }
        .tvx-favvazio b { color: var(--tvx-accent); }

        /* atalhos de navegação, agora na sidebar */
        #tvx-navlinks .tvx-navlink svg { flex: none; }
        #tvx-navlinks { display: flex; flex-direction: column; gap: 2px; padding: 8px 8px;
            border-bottom: 1px solid rgba(255,255,255,.08); margin-bottom: 2px;
            font-family: Inter, Roobert, "Helvetica Neue", system-ui, sans-serif; }
        #tvx-navlinks .tvx-navlink { display: flex; align-items: center; gap: 12px; width: 100%; height: 40px; box-sizing: border-box; text-align: left;
            appearance: none; border: 0; background: transparent; cursor: pointer;
            padding: 0 12px; border-radius: 8px; text-decoration: none; transition: all .14s ease;
            /* !important porque a Twitch tem regra de fonte mais forte pros links da sidebar */
            color: #dedee3; font-family: inherit; font-weight: 600 !important;
            font-size: 15px !important; line-height: 1.3 !important; }
        #tvx-navlinks .tvx-navlink:hover { background: rgba(255,255,255,.07); color: var(--tvx-accent); }
        html[data-tvx-nav="1"] .side-nav-section > *:first-child {
            position: sticky; top: 0; z-index: 2; background: var(--color-background-body);
        }
        html[data-tvx-nav="1"] .side-nav-section ::-webkit-scrollbar { width: 5px; }
        html[data-tvx-nav="1"] .side-nav-section ::-webkit-scrollbar-thumb { background: rgba(255,255,255,.18); border-radius: 5px; }

        /* ---------- seção de favoritos (nossa) ---------- */
        #tvx-favs { flex: 1 1 0; min-height: 0; display: flex; flex-direction: column;
            font-family: Inter, Roobert, "Helvetica Neue", system-ui, sans-serif; }
        #tvx-favs .tvx-navsec-head { display: none; }
        #tvx-favs .tvx-navsec-head-antigo {
            position: sticky; top: 0; z-index: 2; background: var(--color-background-body);
            /* contador colado no rótulo, não na borda: à direita fica a seta de recolher da
               sidebar, e os dois se sobrepunham */
            display: flex; align-items: center; gap: 6px;
            padding: 10px 44px 6px 10px; font: 600 13px/1 inherit; color: #efeff1;
        }
        #tvx-favs .tvx-navsec-head em { font-style: normal; font-size: 11px; color: #adadb8; }
        #tvx-favs .tvx-navsec-list { flex: 1 1 auto; min-height: 0; overflow-y: auto; }
        #tvx-favs .tvx-navsec-list::-webkit-scrollbar { width: 5px; }
        #tvx-favs .tvx-navsec-list::-webkit-scrollbar-thumb { background: rgba(255,255,255,.18); border-radius: 5px; }
        .tvx-fav { display: flex; align-items: center; gap: 10px; padding: 8px 10px; border-radius: 6px; text-decoration: none; color: #efeff1; transition: background .12s ease; }
        .tvx-fav:hover { background: rgba(255,255,255,.06); }
        .tvx-fav img { width: 36px; height: 36px; border-radius: 50%; flex: 0 0 auto; background: #26262c; }
        .tvx-fav .tvx-fav-txt { min-width: 0; flex: 1 1 auto; display: flex; flex-direction: column; }
        .tvx-fav .tvx-fav-txt b { font: 600 13px/1.3 inherit; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .tvx-fav .tvx-fav-txt small { font-size: 12px; color: #adadb8; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .tvx-fav .tvx-fav-live { flex: 0 0 auto; display: inline-flex; align-items: center; gap: 5px; font-size: 12px; line-height: 1; color: #efeff1; }
        .tvx-fav .tvx-fav-live i { width: 7px; height: 7px; border-radius: 50%; background: #eb0400; }
        .tvx-fav[data-offline="1"] { opacity: .6; }
        .tvx-fav[data-offline="1"] .tvx-fav-live { color: #adadb8; }
        .tvx-fav[data-offline="1"] .tvx-fav-live i { background: #53535f; }
        .side-nav--collapsed #tvx-favs { display: none !important; }

        /* ---------- barra de navegação do canal ---------- */
        /* left/right saem de syncLayoutVars(): tudo que criamos vive ENTRE as sidebars da
           Twitch, que continuam nativas e funcionando (colapsar, expandir, rolar).
           Todos os nossos z-index ficam ABAIXO de 1000, que é o da .top-nav da Twitch. */
        #tvx-nav {
            position: fixed; left: var(--tvx-left); top: var(--tvx-top); z-index: 850;
            right: calc(var(--tvx-listw) + var(--tvx-chatw));
            height: var(--tvx-navh); box-sizing: border-box;
            display: none; align-items: stretch; justify-content: space-between; gap: 14px; padding: 0 16px 0 12px;
            background: #0e0e10; border-bottom: 1px solid rgba(255,255,255,.10);
            font-family: Inter, Roobert, "Helvetica Neue", system-ui, sans-serif; color: #efeff1;
        }
        html[data-tvx-page="channel"] #tvx-nav { display: flex; }
        #tvx-tabs { display: flex; align-items: stretch; gap: 24px; flex: 1 1 auto; overflow-x: auto; scrollbar-width: none; }
        #tvx-tabs::-webkit-scrollbar { display: none; }
        /* estilo das abas da própria Twitch: texto + sublinhado, sem pílula */
        .tvx-tab {
            appearance: none; border: 0; background: transparent; color: #efeff1; cursor: pointer;
            font-family: inherit; font-size: 15px; font-weight: 700; line-height: 1; padding: 2px 0 0; margin: 0; border-radius: 0;
            white-space: nowrap; display: inline-flex; align-items: center; gap: 7px;
            position: relative; border-bottom: 2px solid transparent;
        }
        .tvx-tab:hover { color: #c9a8ff; background: transparent; }
        .tvx-tab[aria-selected="true"] { color: #c9a8ff; background: transparent; border-bottom-color: #c9a8ff; }
        .tvx-tab[data-tab="live"] .tvx-dot { width: 8px; height: 8px; border-radius: 50%; background: #eb0400; box-shadow: 0 0 0 0 rgba(235,4,0,.6); animation: tvx-pulse 2s infinite; }
        .tvx-tab[data-tab="live"][data-offline="1"] .tvx-dot { background: #53535f; animation: none; box-shadow: none; }
        @keyframes tvx-pulse { 70% { box-shadow: 0 0 0 7px rgba(235,4,0,0); } 100% { box-shadow: 0 0 0 0 rgba(235,4,0,0); } }
        #tvx-nav .tvx-navright { display: flex; align-items: center; gap: 8px; flex: 0 0 auto; }
        /* cabeçalho do chat na mesma altura e no mesmo traço da barra do canal */
        html[data-tvx-page="channel"] .stream-chat-header {
            height: var(--tvx-navh) !important; min-height: var(--tvx-navh) !important; box-sizing: border-box !important;
            padding: 0 10px !important; border-bottom: 1px solid rgba(255,255,255,.10) !important;
        }
        .tvx-chip {
            display: inline-flex; align-items: center; gap: 6px; padding: 5px 10px; border-radius: 999px;
            background: rgba(255,255,255,.08); color: #dedee3; font: 600 12px/1 inherit; white-space: nowrap;
        }
        .tvx-iconbtn { cursor: pointer; border: 0; padding: 6px; border-radius: 8px; line-height: 0; }
        /* botões de texto da barra do canal, no formato dos botões secundários da Twitch */
        .tvx-navbtn {
            display: inline-flex; align-items: center; gap: 6px; height: 32px; padding: 0 12px;
            border: 0; border-radius: 8px; cursor: pointer; white-space: nowrap;
            background: rgba(255,255,255,.08); color: #efeff1; font-family: inherit; font-size: 13px; font-weight: 600; line-height: 1;
            transition: background-color .15s ease, color .15s ease;
        }
        .tvx-navbtn:hover { background: rgba(255,255,255,.15); }
        .tvx-navbtn svg { flex: none; }
        .tvx-favbtn[aria-pressed="true"] { background: rgba(169,112,255,.18); color: #e0ccff; }
        .tvx-favbtn.tvx-inchannel {
            height: 32px; padding: 0 16px 0 12px; margin: 0 0 0 10px; border-radius: 9999px; align-self: center;
            background: #2f2f35; font: 600 14px/1 Inter, "Noto Sans Arabic", Roobert, "Helvetica Neue", system-ui, sans-serif;
        }
        .tvx-favbtn.tvx-inchannel:hover { background: #3c3c44; }
        .tvx-favbtn.tvx-inchannel svg { width: 20px; height: 20px; }
        .tvx-favbtn.tvx-inchannel[aria-pressed="true"] { background: rgba(169,112,255,.22); color: #e0ccff; }
        .tvx-favbtn[aria-pressed="true"] svg { color: var(--tvx-accent); }
        /* chat aberto: o botão senta no cabeçalho da coluna, onde fica o recolher nativo */
        .tvx-chatbtn.tvx-inheader {
            position: fixed; z-index: 3002; top: calc(var(--tvx-top) + (var(--tvx-navh) - 32px) / 2); left: calc(100% - var(--tvx-right) + 10px);
            width: 32px; height: 32px; padding: 0; justify-content: center; background: transparent; color: #efeff1;
        }
        .tvx-chatbtn.tvx-inheader:hover { background: rgba(255,255,255,.12); }
        html[data-tvx-page="channel"][data-tvx-tab="live"][data-tvx-chat="1"] [data-a-target="right-column__toggle-collapse-btn"] { visibility: hidden !important; }
        .tvx-iconbtn:hover { background: rgba(255,255,255,.16); }
        .tvx-iconbtn[aria-pressed="true"] { background: rgba(169,112,255,.18); color: #d6bcff; }

        /* ---------- reposicionamento do que a Twitch já renderiza ---------- */
        html[data-tvx-page="channel"] .channel-root__info { min-height: 0 !important; margin-top: var(--tvx-navh) !important; }
        html[data-tvx-page="channel"] .channel-root { background-color: #0e0e10 !important; }
        html[data-tvx-page="channel"] .channel-root__info .tw-tabs,
        html[data-tvx-page="channel"] .tw-tabs:has(a[data-a-target^="channel-home-tab-"]) { display: none !important; }
        html[data-tvx-page="channel"] .channel-root__right-column { margin-top: 0 !important; }

        /* Fora da aba Live o player sai da tela */
        html[data-tvx-page="channel"]:not([data-tvx-tab="live"]) .channel-root__player,
        html[data-tvx-page="channel"]:not([data-tvx-tab="live"]) .persistent-player {
            position: fixed !important; left: -20000px !important; top: 0 !important;
            width: 640px !important; height: 360px !important; z-index: -1 !important;
            pointer-events: none !important;
        }

        /* ---------- desabilita clique APENAS no nome do streamer na barra de informações ---------- */
        .channel-info-content h1 a,
        .channel-info-content a:has(h1),
        .channel-info-content a[data-a-target="user-channel-link"]:has(h1),
        .channel-root__info h1 a,
        .channel-root__info a:has(h1),
        .channel-root__info a[data-a-target="user-channel-link"]:has(h1),
        .home__lower-content h1 a,
        .home__lower-content a:has(h1),
        .home__lower-content a[data-a-target="user-channel-link"]:has(h1) {
            pointer-events: none !important;
            cursor: default !important;
            text-decoration: none !important;
        }
        .channel-info-content a[data-a-target="stream-game-link"],
        .channel-info-content a[href*="/directory/category/"],
        .channel-info-content a.tw-tag,
        .channel-root__info a[data-a-target="stream-game-link"],
        .channel-root__info a[href*="/directory/category/"],
        .channel-root__info a.tw-tag {
            pointer-events: auto !important;
            cursor: pointer !important;
        }

        /* Na aba Live o player enche a área útil (modo normal) */
        html[data-tvx-page="channel"][data-tvx-tab="live"]:not([data-tvx-theatre="1"]):not(.tw-root--theatre) .persistent-player {
            position: absolute !important; top: var(--tvx-navh) !important; left: 0 !important;
            width: calc(100% - var(--tvx-chatw)) !important;
            height: var(--tvx-player-h) !important;
            max-height: calc(var(--tvx-avail) - var(--tvx-navh)) !important;
            z-index: 2 !important;
            pointer-events: auto !important;
        }
        html[data-tvx-page="channel"][data-tvx-tab="live"]:not([data-tvx-theatre="1"]):not(.tw-root--theatre) .channel-root__player {
            position: absolute !important; top: var(--tvx-navh) !important; left: 0 !important;
            width: calc(100% - var(--tvx-chatw)) !important;
            height: var(--tvx-player-h) !important;
            max-height: calc(var(--tvx-avail) - var(--tvx-navh)) !important;
            z-index: 0 !important;
            pointer-events: none !important;
        }
        html[data-tvx-page="channel"] .channel-root__player-background {
            pointer-events: none !important;
        }
        html[data-tvx-page="channel"][data-tvx-tab="live"]:not([data-tvx-theatre="1"]):not(.tw-root--theatre) .channel-root__info {
            margin-top: calc(var(--tvx-player-h) + var(--tvx-navh)) !important;
        }
        html[data-tvx-page="channel"][data-tvx-tab="live"] .channel-root__right-column {
            position: fixed !important;
            top: var(--tvx-top) !important;
            right: 0 !important; left: auto !important; bottom: 0 !important;
            height: auto !important; transform: none !important; z-index: 860 !important;
        }
        html[data-tvx-page="channel"][data-tvx-tab="live"][data-tvx-chat="0"] .channel-root__right-column {
            width: 0 !important; overflow: hidden !important;
        }
        html[data-tvx-page="channel"][data-tvx-tab="live"] .channel-root__info {
            padding-right: var(--tvx-infopad) !important; box-sizing: border-box !important;
        }
        html[data-tvx-page="channel"] [data-a-target="home-live-overlay"],
        html[data-tvx-page="channel"] .home-live-overlay { display: none !important; }

        /* ---------- modo teatro na live corrigido ---------- */
        html[data-tvx-theatre="1"] #tvx-nav,
        html.tw-root--theatre #tvx-nav { display: none !important; }
        .persistent-player.persistent-player--theatre,
        .persistent-player[data-a-player-state="theatre"],
        html[data-tvx-theatre="1"] .persistent-player,
        html.tw-root--theatre .persistent-player {
            position: fixed !important;
            top: 0 !important;
            left: 0 !important;
            width: calc(100% - var(--tvx-chatw)) !important;
            height: 100vh !important;
            max-height: 100vh !important;
            z-index: 3000 !important;
            pointer-events: auto !important;
            transform: none !important;
        }
        .channel-root__right-column.right-column--theatre,
        .right-column--theatre,
        html[data-tvx-page="channel"][data-tvx-theatre="1"] .channel-root__right-column,
        html[data-tvx-page="channel"].tw-root--theatre .channel-root__right-column {
            top: 0 !important;
            height: 100vh !important;
            z-index: 3000 !important;
        }
        .channel-root__info,
        html[data-tvx-page="channel"][data-tvx-theatre="1"] .channel-root__info,
        html[data-tvx-page="channel"].tw-root--theatre .channel-root__info,
        html[data-tvx-theatre="1"] .channel-root__info,
        html.tw-root--theatre .channel-root__info {
            position: relative !important;
            margin-top: calc(100vh + 20px) !important;
            display: block !important;
            z-index: 10 !important;
            background: #0e0e10 !important;
            box-sizing: border-box !important;
            clear: both !important;
        }
        html[data-tvx-theatre="1"] [data-a-target="root-scroller"],
        html.tw-root--theatre [data-a-target="root-scroller"] {
            overflow-y: auto !important;
        }

        html[data-tvx-tab="clips"] [data-a-target="root-scroller"],
        html[data-tvx-tab="videos"] [data-a-target="root-scroller"] { overflow: hidden !important; }

        /* ---------- teatro (player + playlist) ---------- */
        #tvx-panel {
            position: fixed; left: var(--tvx-left); right: var(--tvx-listw); bottom: 0;
            top: calc(var(--tvx-top) + var(--tvx-navh));
            z-index: 800; display: none; background: #0b0b0e; color: #efeff1;
            font-family: Inter, Roobert, "Helvetica Neue", system-ui, sans-serif;
        }
        html[data-tvx-tab="clips"] #tvx-panel, html[data-tvx-tab="videos"] #tvx-panel { display: block; }

        .tvx-stage { display: flex; flex-direction: column; min-width: 0; height: 100%; }
        .tvx-screen {
            flex: 1 1 auto; min-height: 0; background: #000; position: relative;
            display: flex; flex-direction: column; align-items: stretch; justify-content: center;
            overflow: hidden;
        }
        .tvx-screen iframe { flex: 1 1 auto; width: 100%; height: 100%; border: 0; min-height: 0; }
        .tvx-empty { color: #adadb8; font-size: 14px; text-align: center; padding: 24px; }
        .tvx-spinner { width: 34px; height: 34px; border: 3px solid rgba(255,255,255,.18); border-top-color: var(--tvx-accent); border-radius: 50%; animation: tvx-spin .8s linear infinite; margin: 0 auto 12px; }
        @keyframes tvx-spin { to { transform: rotate(360deg); } }

        /* ---------- player customizado de clipes e vods ---------- */
        .tvx-video-host {
            position: absolute; inset: 0; display: flex; align-items: center; justify-content: center;
            background: #000; overflow: hidden; cursor: pointer;
        }
        .tvx-video-host video {
            width: 100%; height: 100%; object-fit: contain; background: #000; outline: none; pointer-events: none;
        }

        .tvx-plc-flash {
            position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%);
            width: 64px; height: 64px; border-radius: 50%; border: 0;
            background: rgba(0, 0, 0, 0.68); backdrop-filter: blur(8px);
            color: #fff; display: flex; align-items: center; justify-content: center;
            cursor: pointer; z-index: 8; transition: opacity .2s ease, transform .2s ease, background .2s ease;
            opacity: 0; pointer-events: none; box-shadow: 0 4px 20px rgba(0,0,0,0.5);
        }
        .tvx-pl.is-playing .tvx-plc-flash,
        .tvx-screen.is-playing .tvx-plc-flash,
        .tvx-screen:not([data-paused="1"]) .tvx-plc-flash {
            opacity: 0 !important;
            pointer-events: none !important;
        }
        .tvx-pl:not(.is-playing) .tvx-plc-flash,
        .tvx-screen:not(.is-playing) .tvx-plc-flash,
        .tvx-screen[data-paused="1"] .tvx-plc-flash {
            opacity: 1 !important;
            pointer-events: auto !important;
        }
        .tvx-plc-flash:hover {
            transform: translate(-50%, -50%) scale(1.08);
            background: rgba(169, 112, 255, 0.45);
        }

        .tvx-plc-bottom {
            position: absolute; left: 0; right: 0; bottom: 0; z-index: 10;
            background: linear-gradient(to top, rgba(0,0,0,.75) 0%, rgba(0,0,0,.35) 55%, transparent 100%);
            padding: 40px 14px 12px; display: flex; flex-direction: column; gap: 8px;
            transition: opacity .25s ease;
        }
        .tvx-screen[data-idle="1"]:not([data-paused="1"]):not([data-menu="1"]) .tvx-plc-bottom { opacity: 0; pointer-events: none; }
        .tvx-screen[data-idle="1"]:not([data-paused="1"]):not([data-menu="1"]) { cursor: none; }

        /* barra de progresso: fina, engrossa no hover */
        .tvx-plc-prog {
            position: relative; width: 100%; height: 18px; display: flex; align-items: center; margin: 0 2px;
            cursor: pointer; user-select: none; touch-action: none;
        }
        .tvx-plc-track {
            position: absolute; left: 0; right: 0; height: 3px; border-radius: 3px;
            background: rgba(255,255,255,.25); transition: height .12s ease;
        }
        .tvx-plc-prog:hover .tvx-plc-track, .tvx-plc-prog.is-dragging .tvx-plc-track { height: 5px; }
        .tvx-plc-buf { position: absolute; left: 0; top: 0; bottom: 0; width: 0%; border-radius: inherit; background: rgba(255,255,255,.4); pointer-events: none; }
        .tvx-plc-fill { position: absolute; left: 0; top: 0; bottom: 0; width: 0%; border-radius: inherit; background: var(--tvx-accent); pointer-events: none; }
        .tvx-plc-knob {
            position: absolute; left: 0%; top: 50%; transform: translate(-50%, -50%) scale(0);
            width: 13px; height: 13px; border-radius: 50%; background: var(--tvx-accent);
            pointer-events: none; transition: transform .12s ease;
        }
        .tvx-plc-prog:hover .tvx-plc-knob, .tvx-plc-prog.is-dragging .tvx-plc-knob { transform: translate(-50%, -50%) scale(1); }
        .tvx-plc-tooltip {
            position: absolute; bottom: 22px; transform: translateX(-50%);
            background: rgba(28,28,28,.9); color: #fff; font-size: 12px; font-weight: 600;
            padding: 4px 8px; border-radius: 6px; pointer-events: none; display: none; white-space: nowrap;
            font-variant-numeric: tabular-nums;
        }

        /* controles: grupos em pílulas translúcidas (o "vidro fosco" do player do YouTube) */
        .tvx-plc-row { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
        .tvx-plc-left, .tvx-plc-right { display: flex; align-items: center; gap: 8px; flex-wrap: nowrap; min-width: 0; }
        .tvx-plc-pill {
            display: flex; align-items: center; height: 44px; padding: 0 2px; border-radius: 22px;
            background: rgba(0,0,0,.35); backdrop-filter: blur(16px);
            box-shadow: inset 0 0 0 1px rgba(255,255,255,.10);
        }
        .tvx-plc-round { width: 44px; padding: 0; justify-content: center; }
        .tvx-plc-btn {
            position: relative; appearance: none; border: 0; background: transparent; color: #fff;
            cursor: pointer; width: 40px; height: 40px; padding: 0; border-radius: 50%;
            display: inline-flex; align-items: center; justify-content: center; line-height: 0;
            transition: background .15s ease, opacity .15s ease;
        }
        .tvx-plc-btn:hover { background: rgba(255,255,255,.14); }
        .tvx-plc-btn:disabled { opacity: .35; cursor: default; background: transparent; }
        .tvx-plc-play { width: 44px; height: 44px; }
        /* ligado = selo "ON" sobre o mesmo ícone, nunca troca de cor */
        .tvx-on { display: none; }
        .tvx-plc-btn[aria-pressed="true"] > .tvx-on {
            display: block; position: absolute; top: 4px; right: 2px; padding: 2px 3px; border-radius: 3px;
            background: var(--tvx-accent); color: #16121f; font: 800 8px/1 Inter, system-ui, sans-serif; letter-spacing: .02em;
        }
        .tvx-plc-time {
            font-size: 13px; font-weight: 600; color: #fff; padding: 0 14px 0 4px;
            white-space: nowrap; user-select: none; font-variant-numeric: tabular-nums;
        }

        .tvx-plc-vol-wrap { display: inline-flex; align-items: center; }
        .tvx-plc-vol-slider {
            appearance: none; width: 0; opacity: 0; height: 3px; border-radius: 3px;
            background: rgba(255,255,255,.35); outline: none; cursor: pointer; margin: 0;
            transition: width .2s ease, opacity .2s ease, margin .2s ease;
        }
        .tvx-plc-vol-wrap:hover .tvx-plc-vol-slider, .tvx-plc-vol-slider:focus { width: 64px; opacity: 1; margin: 0 8px 0 2px; }
        .tvx-plc-vol-slider::-webkit-slider-thumb { appearance: none; width: 12px; height: 12px; border-radius: 50%; background: #fff; cursor: pointer; }

        /* interruptor do autoplay */
        .tvx-autosw { width: 52px; border-radius: 20px; }
        .tvx-sw { position: relative; width: 34px; height: 14px; border-radius: 7px; background: rgba(255,255,255,.3); transition: background .2s ease; }
        .tvx-sw i {
            position: absolute; top: 50%; left: 0; width: 20px; height: 20px; border-radius: 50%; transform: translate(-3px, -50%);
            background: #bdbdc4; color: #2a2a2e; display: flex; align-items: center; justify-content: center;
            transition: transform .2s ease, background .2s ease; box-shadow: 0 1px 3px rgba(0,0,0,.4);
        }
        .tvx-autosw[aria-pressed="true"] .tvx-sw { background: rgba(169,112,255,.55); }
        .tvx-autosw[aria-pressed="true"] .tvx-sw i { transform: translate(17px, -50%); background: #fff; color: #16121f; }
        .tvx-autosw .tvx-sw i svg { opacity: 0; transition: opacity .2s ease; }
        .tvx-autosw[aria-pressed="true"] .tvx-sw i svg { opacity: 1; }

        /* engrenagem com selo da qualidade, e o painel que ela abre */
        .tvx-gear-badge:empty { display: none; }
        .tvx-gear-badge {
            position: absolute; top: 4px; right: 0; padding: 2px 3px; border-radius: 3px;
            background: var(--tvx-accent); color: #16121f; font: 800 8px/1 Inter, system-ui, sans-serif;
        }
        .tvx-gear svg { transition: transform .3s ease; }
        .tvx-gear[aria-expanded="true"] svg { transform: rotate(45deg); }
        .tvx-dial {
            position: absolute; right: 14px; bottom: 90px; width: 272px; z-index: 12;
            padding: 8px; border-radius: 14px; background: rgba(28,28,28,.92); backdrop-filter: blur(16px);
            box-shadow: 0 12px 40px rgba(0,0,0,.5), inset 0 0 0 1px rgba(255,255,255,.08);
            display: flex; flex-direction: column; gap: 4px; color: #eee;
        }
        .tvx-dial[hidden] { display: none; }
        .tvx-dial-sec { padding: 8px; }
        .tvx-dial-sec + .tvx-dial-sec { border-top: 1px solid rgba(255,255,255,.08); }
        .tvx-dial-h { font-size: 11px; font-weight: 700; letter-spacing: .06em; text-transform: uppercase; color: #9a9aa6; margin-bottom: 8px; }
        .tvx-dial-opts { display: flex; flex-direction: column; gap: 2px; }
        .tvx-dial-opt {
            display: flex; align-items: center; gap: 6px; height: 34px; padding: 0 10px; border: 0; border-radius: 8px;
            background: transparent; color: #efeff1; font-family: inherit; font-size: 13.5px; font-weight: 600; cursor: pointer; text-align: left;
        }
        .tvx-dial-opt small { font-size: 10px; color: #9a9aa6; font-weight: 700; }
        .tvx-dial-opt:hover { background: rgba(255,255,255,.08); }
        .tvx-dial-opt[aria-pressed="true"] { background: rgba(169,112,255,.2); color: #e0ccff; }
        .tvx-dial-opt[aria-pressed="true"]::after { content: "✓"; margin-left: auto; color: var(--tvx-accent); }
        .tvx-dial-speeds { display: flex; flex-wrap: wrap; gap: 6px; }
        .tvx-dial-chip {
            height: 30px; padding: 0 11px; border: 0; border-radius: 999px; cursor: pointer;
            background: rgba(255,255,255,.08); color: #dedee3; font-family: inherit; font-size: 12.5px; font-weight: 600;
        }
        .tvx-dial-chip:hover { background: rgba(255,255,255,.14); }
        .tvx-dial-chip[aria-pressed="true"] { background: #efeff1; color: #0e0e10; }

        /* Barra de rodapé do VOD */
        .tvx-vod-bar {
            flex: 0 0 60px; display: flex; align-items: center; justify-content: space-between;
            padding: 0 14px; background: #0e0e12; border-top: 1px solid rgba(255,255,255,.08);
            font-size: 13px; color: #efeff1; z-index: 10;
        }

        .tvx-under { flex: 0 0 auto; max-height: 42%; overflow-y: auto; padding: 14px 20px 20px; border-top: 1px solid rgba(255,255,255,.08); }
        .tvx-under-header { display: flex; align-items: flex-start; justify-content: space-between; gap: 14px; margin-bottom: 10px; }
        .tvx-under-header h1 { font-size: 19px; line-height: 1.3; margin: 0; font-weight: 700; color: #fff; flex: 1 1 auto; word-break: break-word; }
        .tvx-under-actions { display: flex; align-items: center; gap: 8px; flex: 0 0 auto; }
        .tvx-share-btn {
            flex: 0 0 auto; display: inline-flex; align-items: center; gap: 6px; padding: 6px 12px;
            border-radius: 8px; border: 1px solid rgba(255,255,255,.14); background: rgba(255,255,255,.06);
            color: #efeff1; font: 600 13px/1 inherit; cursor: pointer; transition: all .15s ease;
        }
        .tvx-share-btn:hover { background: rgba(255,255,255,.14); border-color: rgba(169,112,255,.5); color: #fff; }
        .tvx-vod-btn { text-decoration: none; }
        .tvx-vod-btn:hover { background: rgba(255,255,255,.14); border-color: rgba(169,112,255,.5); color: #fff; }
        .tvx-facts { display: flex; flex-wrap: wrap; gap: 6px; }
        .tvx-fact { display: inline-flex; align-items: center; gap: 6px; padding: 5px 10px; border-radius: 999px; background: rgba(255,255,255,.07); font-size: 12px; color: #dedee3; }
        .tvx-fact b { font-weight: 700; color: #fff; }
        .tvx-fact img { width: 16px; height: 22px; border-radius: 3px; object-fit: cover; }
        .tvx-btn {
            appearance: none; border: 1px solid rgba(255,255,255,.14); background: rgba(255,255,255,.06);
            color: #efeff1; border-radius: 9px; padding: 7px 12px; font: 600 13px/1 inherit; cursor: pointer;
            display: inline-flex; align-items: center; gap: 7px; text-decoration: none; white-space: nowrap;
        }
        .tvx-btn:hover { background: rgba(255,255,255,.12); border-color: rgba(169,112,255,.5); }
        .tvx-btn[aria-pressed="true"] { background: var(--tvx-accent); border-color: var(--tvx-accent); color: #16121f; }
        .tvx-btn:disabled { opacity: .45; cursor: default; }
        .tvx-sel {
            appearance: none; border: 1px solid rgba(255,255,255,.14); background: rgba(255,255,255,.06);
            color: #efeff1; border-radius: 9px; padding: 7px 26px 7px 10px; font: 600 13px/1 inherit; cursor: pointer;
            background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'%3E%3Cpath fill='%23dedee3' d='m12 15.6-5.2-5.2L8.2 9l3.8 3.8L15.8 9l1.4 1.4Z'/%3E%3C/svg%3E");
            background-repeat: no-repeat; background-position: right 4px center; background-size: 18px;
        }
        .tvx-sel option { background: #18181b; color: #efeff1; }

        /* ---------- sidebar ---------- */
        .tvx-side {
            position: fixed; top: var(--tvx-top); right: 0; bottom: 0; width: var(--tvx-sidew);
            z-index: 870; display: flex; flex-direction: column; min-height: 0;
            border-left: 1px solid rgba(255,255,255,.08); background: #0e0e10; overflow: hidden;
        }
        #tvx-panel[data-side="0"] .tvx-side { display: none; }
        .tvx-side-head { flex: 0 0 auto; border-bottom: 1px solid rgba(255,255,255,.08); }
        /* cabeçalho na altura da barra do canal, como o do chat */
        .tvx-side-title {
            display: flex; align-items: center; gap: 8px; height: var(--tvx-navh); padding: 0 12px 0 8px;
            box-sizing: border-box; border-bottom: 1px solid rgba(255,255,255,.10);
        }
        .tvx-side-title b { font-size: 15px; font-weight: 700; color: #fff; }
        .tvx-side-badge {
            font-size: 12px; font-weight: 600; color: #adadb8;
            background: rgba(255,255,255,.08); padding: 3px 9px; border-radius: 999px;
            margin-left: auto;
        }
        .tvx-sideclose { flex: 0 0 auto; border: 0; background: transparent; color: #efeff1; cursor: pointer; padding: 6px; border-radius: 8px; line-height: 0; }
        .tvx-sideclose:hover { background: rgba(255,255,255,.1); }
        .tvx-side-tools { padding: 12px; display: flex; flex-direction: column; gap: 10px; }
        .tvx-toolbar { display: flex; flex-direction: column; gap: 10px; }
        .tvx-toolrow { display: flex; gap: 8px; }
        .tvx-toolrow .tvx-sel { flex: 1 1 auto; min-width: 0; height: 36px; border-radius: 10px; }
        .tvx-fbtn {
            flex: none; display: inline-flex; align-items: center; gap: 6px; height: 36px; padding: 0 12px;
            border: 0; border-radius: 10px; background: rgba(255,255,255,.08); color: #efeff1; cursor: pointer;
            font-family: inherit; font-size: 13px; font-weight: 600; transition: background .15s ease;
        }
        .tvx-fbtn:hover { background: rgba(255,255,255,.14); }
        .tvx-fbtn[aria-expanded="true"] { background: rgba(169,112,255,.22); color: #e0ccff; }
        .tvx-fbtn .tvx-badge { font-size: 11px; padding: 1px 7px; border-radius: 999px; background: var(--tvx-accent); color: #16121f; font-weight: 800; }
        .tvx-chipsbar { position: relative; }
        .tvx-chips { display: flex; gap: 6px; overflow-x: auto; scrollbar-width: none; scroll-behavior: smooth; }
        .tvx-chiparrow {
            position: absolute; top: 0; z-index: 1; width: 32px; height: 32px; border: 0; border-radius: 10px; cursor: pointer;
            display: flex; align-items: center; justify-content: center; color: #efeff1; background: #2a2a2f;
            box-shadow: 0 0 12px 8px #0e0e10;
        }
        .tvx-chiparrow:hover { background: #3a3a40; }
        .tvx-chiparrow[hidden] { display: none; }
        .tvx-chiparrow-l { left: 0; }
        .tvx-chiparrow-r { right: 0; }
        .tvx-chips::-webkit-scrollbar { display: none; }
        .tvx-chipbtn {
            flex: none; height: 32px; padding: 0 12px; border: 0; border-radius: 10px; cursor: pointer;
            background: rgba(255,255,255,.08); color: #dedee3; font-family: inherit; font-size: 12.5px; font-weight: 600;
            transition: background .15s ease, color .15s ease;
        }
        .tvx-chipbtn:hover { background: rgba(255,255,255,.14); color: #fff; }
        .tvx-chipbtn[aria-pressed="true"] { background: #efeff1; color: #0e0e10; }
        .tvx-progress { height: 3px; border-radius: 3px; background: rgba(255,255,255,.1); overflow: hidden; margin-top: 8px; }
        .tvx-progress i { display: block; height: 100%; width: 30%; background: var(--tvx-accent); animation: tvx-slide 1.2s ease-in-out infinite; }
        @keyframes tvx-slide { 0% { margin-left: -30%; } 100% { margin-left: 100%; } }

        .tvx-partial-card {
            margin-top: 8px; padding: 8px 10px; border-radius: 8px;
            background: rgba(169, 112, 255, 0.08); border: 1px solid rgba(169, 112, 255, 0.25);
            color: #dedee3; font-size: 11.5px; line-height: 1.4;
        }

        .tvx-search { position: relative; }
        .tvx-search input {
            width: 100%; box-sizing: border-box; height: 40px; padding: 0 36px 0 38px; border-radius: 10px;
            border: 0; background: #1f1f23; color: #fff;
            font-family: inherit; font-size: 14px; outline: none; transition: box-shadow .15s ease;
        }
        .tvx-search input:focus { box-shadow: 0 0 0 2px rgba(169,112,255,.55); }
        .tvx-search .tvx-si { position: absolute; left: 12px; top: 12px; color: #adadb8; pointer-events: none; }
        .tvx-search .tvx-sx { position: absolute; right: 8px; top: 8px; border: 0; background: transparent; color: #adadb8; cursor: pointer; padding: 4px; border-radius: 6px; }
        .tvx-search .tvx-sx:hover { background: rgba(255,255,255,.1); color: #fff; }

        .tvx-filters {
            flex: 0 0 auto; max-height: 48vh; overflow-y: auto; background: #131316;
            border-bottom: 1px solid rgba(255,255,255,.08);
            scrollbar-width: thin; scrollbar-color: rgba(255,255,255,.18) transparent;
        }
        .tvx-filters::-webkit-scrollbar { width: 5px; }
        .tvx-filters::-webkit-scrollbar-thumb { background: rgba(255,255,255,.18); border-radius: 3px; }
        .tvx-filters::-webkit-scrollbar-thumb:hover { background: rgba(255,255,255,.32); }

        /* gaveta de filtros: seções com respiro, títulos claros e campos maiores */
        .tvx-filters { padding: 6px 0; }
        .tvx-fgroup { margin: 0 10px; border-radius: 12px; }
        .tvx-fgroup + .tvx-fgroup { margin-top: 4px; }
        .tvx-fgroup[open] { background: rgba(255,255,255,.035); }
        .tvx-fgroup > summary {
            list-style: none; cursor: pointer; padding: 12px 12px; border-radius: 12px;
            font-family: inherit; font-size: 14px; font-weight: 600; color: #dedee3;
            display: flex; align-items: center; gap: 8px;
            transition: background .15s ease, color .15s ease; user-select: none;
        }
        .tvx-fgroup > summary::-webkit-details-marker { display: none; }
        .tvx-fgroup > summary::after {
            content: ""; display: inline-block; width: 6px; height: 6px;
            border-right: 2px solid #8a8a95; border-bottom: 2px solid #8a8a95;
            transform: rotate(45deg) translate(-2px, -2px); transition: transform .2s ease;
            margin-left: auto;
        }
        .tvx-fgroup[open] > summary::after { transform: rotate(-135deg) translate(-2px, -2px); }
        .tvx-fgroup > summary:hover { background: rgba(255,255,255,.05); color: #fff; }
        .tvx-fgroup[open] > summary { color: #fff; }
        .tvx-fgroup > summary .tvx-badge { font-size: 11px; padding: 2px 7px; border-radius: 999px; background: var(--tvx-accent); color: #16121f; font-weight: 800; }
        .tvx-fbody { padding: 2px 12px 14px; display: flex; flex-direction: column; gap: 12px; }
        .tvx-row { display: flex; align-items: center; flex-wrap: wrap; gap: 8px; width: 100%; }
        .tvx-row label { font-size: 12px; color: #adadb8; min-width: 28px; }
        .tvx-in {
            flex: 1 1 auto; min-width: 0; box-sizing: border-box; height: 36px; padding: 0 10px; border-radius: 10px;
            border: 0; background: #1f1f23; color: #fff; font-family: inherit; font-size: 13px; outline: none;
        }
        .tvx-in:focus { box-shadow: 0 0 0 2px rgba(169,112,255,.55); }
        .tvx-in::-webkit-calendar-picker-indicator { filter: invert(.75); cursor: pointer; }

        .tvx-presets-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 6px; width: 100%; }
        .tvx-presets-grid .tvx-pill { text-align: center; padding: 6px 2px; white-space: nowrap; font-size: 11.5px; }
        .tvx-pill-full { width: 100%; text-align: center; margin-top: 2px; }

        .tvx-pill {
            border: 0; background: rgba(255,255,255,.08); color: #dedee3; height: 32px;
            border-radius: 999px; padding: 0 14px; font-family: inherit; font-size: 12.5px; font-weight: 600; cursor: pointer;
            transition: background .15s ease, color .15s ease;
        }
        .tvx-pill:hover { background: rgba(255,255,255,.14); color: #fff; }
        .tvx-pill[aria-pressed="true"] { background: #efeff1; color: #0e0e10; }

        /* campos com rótulo em cima, lado a lado */
        .tvx-date-row { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; width: 100%; }
        .tvx-date-field { min-width: 0; display: flex; flex-direction: column; gap: 6px; }
        .tvx-date-field label, .tvx-dual-label { font-size: 11px; font-weight: 700; letter-spacing: .05em; text-transform: uppercase; color: #8a8a95; }
        .tvx-date-field .tvx-in { width: 100%; padding: 0 8px; font-size: 12.5px; }

        .tvx-dual-row { display: flex; flex-direction: column; gap: 6px; width: 100%; }
        .tvx-dual-inputs { display: flex; align-items: center; gap: 6px; width: 100%; }
        .tvx-dual-inputs .tvx-in { flex: 1 1 0; min-width: 0; }

        .tvx-facet {
            max-height: 220px; overflow-y: auto; display: flex; flex-direction: column; gap: 1px;
            scrollbar-width: thin; scrollbar-color: rgba(255,255,255,.18) transparent;
        }
        .tvx-facet::-webkit-scrollbar { width: 5px; }
        .tvx-facet::-webkit-scrollbar-thumb { background: rgba(255,255,255,.18); border-radius: 3px; }
        .tvx-facet::-webkit-scrollbar-thumb:hover { background: rgba(255,255,255,.32); }
        .tvx-facet-wrap { display: flex; flex-direction: column; gap: 8px; }
        .tvx-facet-q { flex: none; height: 34px; }
        .tvx-fitem { display: flex; align-items: center; gap: 10px; padding: 7px 8px; border-radius: 8px; cursor: pointer; font-size: 13px; color: #dedee3; }
        .tvx-fitem:hover { background: rgba(255,255,255,.06); color: #fff; }
        .tvx-fitem input { accent-color: var(--tvx-accent); margin: 0; }
        .tvx-fitem span { flex: 1 1 auto; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .tvx-fitem em { font-style: normal; font-size: 11px; color: #8a8a95; font-weight: 600; }

        .tvx-list { flex: 1 1 auto; overflow-y: auto; padding: 8px; scrollbar-width: thin; scrollbar-color: rgba(255,255,255,.18) transparent; }
        .tvx-item { display: grid; grid-template-columns: 140px minmax(0,1fr); gap: 12px; padding: 8px; border-radius: 12px; cursor: pointer; transition: background .12s ease; }
        .tvx-item:hover { background: rgba(255,255,255,.07); }
        .tvx-item[aria-current="true"] { background: rgba(169,112,255,.16); }
        .tvx-thumb { position: relative; aspect-ratio: 16/9; border-radius: 8px; overflow: hidden; background: #18181b; }
        .tvx-thumb img { width: 100%; height: 100%; object-fit: cover; display: block; }
        .tvx-thumb b { position: absolute; right: 4px; bottom: 4px; background: rgba(0,0,0,.8); border-radius: 4px; padding: 1px 5px; font: 700 11px/1.5 inherit; }
        .tvx-thumb .tvx-star { position: absolute; left: 4px; top: 4px; background: var(--tvx-accent); color: #16121f; border-radius: 4px; padding: 1px 5px; font: 800 10px/1.6 inherit; }
        .tvx-itxt { min-width: 0; display: flex; flex-direction: column; gap: 3px; }
        .tvx-itxt strong { font-family: inherit; font-size: 13.5px; font-weight: 700; line-height: 1.35; color: #efeff1; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
        .tvx-itxt small { font-size: 12px; color: #9a9aa6; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .tvx-sentinel { height: 1px; }
        .tvx-note { padding: 14px; color: #adadb8; font-size: 13px; line-height: 1.5; }
        .tvx-note b { color: #efeff1; }

        @media (max-width: 1100px) {
            #tvx-panel { grid-template-columns: minmax(0,1fr) 340px; }
        }
        @media (max-width: 860px) {
            #tvx-panel { grid-template-columns: minmax(0,1fr); grid-template-rows: 55% 45%; }
            .tvx-side { border-left: 0; border-top: 1px solid rgba(255,255,255,.08); }
        }
    `);

    // ===================================================================== //
    //  Estado                                                               //
    // ===================================================================== //
    const state = {
        route: null,        // { login, tab, clipSlug }
        channel: null,      // dados do canal via GQL
        tab: null,          // aba ativa (inclui "live", que não existe na Twitch)
        current: null,      // item tocando
        filters: null,
        pool: null,
    };

    function defaultFilters() {
        return {
            text: "", from: "", to: "", preset: "",
            minViews: "", maxViews: "", minDur: "", maxDur: "",
            curators: new Set(), games: new Set(), langs: new Set(), types: new Set(),
            featuredOnly: false, vod: "",
            sort: "views-desc",
        };
    }

    function parseRoute() {
        const parts = location.pathname.split("/").filter(Boolean);
        if (!parts.length) return null;
        const head = parts[0].toLowerCase();
        // A página de VOD reaproveita os MESMOS containers da página de canal
        // (.channel-root, .persistent-player, .channel-root__right-column), então todo o layout
        // vale lá sem mudança — e é lá que a Twitch monta o replay do chat daquela transmissão.
        // Tratamos como a aba Live do canal dono do vídeo.
        if (head === "videos" && /^\d+$/.test(parts[1] || "")) {
            return { videoId: parts[1], login: vodOwners.get(parts[1]) || "", tab: "live" };
        }
        if (RESERVED.has(head)) return null;
        const login = parts[0];
        if (parts[1] === "clip" && parts[2]) return { login, tab: "clips", clipSlug: parts[2] };
        const sub = (parts[1] || "").toLowerCase();
        if (!sub) return { login, tab: "home" };
        if (NATIVE_TABS.includes(sub)) return { login, tab: sub };
        return null; // squad, popout de chat, etc — deixa a Twitch em paz
    }

    // ===================================================================== //
    //  Barra de navegação                                                   //
    // ===================================================================== //
    let nav, tabsWrap, chatBtn, listBtn, favBtn;

    function buildNav() {
        if (nav) return nav;
        tabsWrap = el("div", { id: "tvx-tabs" });

        // Chat: pílula "Chat" na barra enquanto fechado; aberto, vira o botão de recolher no
        // cabeçalho da coluna do chat, no lugar do nativo (syncLayoutVars troca o visual).
        chatBtn = el("button", { class: "tvx-navbtn tvx-chatbtn", type: "button" });
        chatBtn.addEventListener("click", toggleChat);

        // mesmo tratamento do chat: um ícone na barra, sem botão de texto no player
        listBtn = el("button", { class: "tvx-navbtn tvx-listbtn", type: "button" });
        listBtn.addEventListener("click", () => setSidebarOpen(!prefs.sidebarOpen));

        favBtn = el("button", { class: "tvx-navbtn tvx-favbtn", type: "button" });
        favBtn.addEventListener("click", () => toggleFav(state.route && state.route.login));

        nav = el("nav", { id: "tvx-nav" }, tabsWrap,
            el("div", { class: "tvx-navright" }, favBtn, listBtn, chatBtn));
        document.body.appendChild(nav);
        return nav;
    }

    const TAB_LABELS = { live: "Live", about: "Sobre", clips: "Clipes", videos: "Vídeos", schedule: "Agenda", chat: "Chat" };

    function renderTabs() {
        if (!tabsWrap) return;
        tabsWrap.textContent = "";
        for (const key of ["live", "about", "clips", "videos", "schedule", "chat"]) {
            const isLive = key === "live";
            const btn = el("button", {
                class: "tvx-tab", type: "button", role: "tab", "data-tab": key,
                "aria-selected": String(state.tab === key),
            });
            if (isLive) {
                const online = !!(state.channel && state.channel.stream);
                btn.dataset.offline = online ? "0" : "1";
                btn.append(el("i", { class: "tvx-dot" }), TAB_LABELS.live);
                btn.title = online ? "Transmitindo agora" : "Offline — mostra a última transmissão / vitrine";
            } else {
                btn.append(TAB_LABELS[key]);
            }
            btn.addEventListener("click", () => goTab(key));
            tabsWrap.appendChild(btn);
        }
    }

    function renderFavButton() {
        if (!favBtn) return;
        const login = state.route && state.route.login;
        const on = isFav(login);
        favBtn.style.display = login ? "" : "none";
        favBtn.setAttribute("aria-pressed", String(on));
        const sig = on ? "on" : "off";
        if (favBtn.dataset.sig !== sig) {
            favBtn.dataset.sig = sig;
            favBtn.innerHTML = svg(on ? ICON.star : ICON.starOutline, 16) + `<span>${on ? "Favorito" : "Favoritar"}</span>`;
        }
        favBtn.title = on ? "Remover dos favoritos" : "Adicionar aos favoritos da sidebar";
        // mora no cabeçalho do canal, logo depois do bloco do "Seguir" (que o React re-renderiza:
        // por isso conferimos a posição a cada tick)
        const follow = document.querySelector('[data-target="channel-header-right"] :is([data-a-target="follow-button"], [data-a-target="unfollow-button"])');
        const row = follow && follow.closest('[data-target="channel-header-right"]');
        let block = follow;
        while (block && block.parentElement !== row) block = block.parentElement;
        if (block && favBtn.previousElementSibling !== block) block.after(favBtn);
        favBtn.classList.toggle("tvx-inchannel", !!block);
    }

    function renderIdent() {}

    // "Live" e "Início" apontam pra MESMA rota nativa (a raiz do canal) e se distinguem só pelo
    // nosso estado. Isso não é capricho: fora da raiz a Twitch monta um carrossel de preview
    // (aquele card "LIVE NOW … Watch now with N viewers" com botão Mute) no lugar do player de
    // verdade, e não renderiza a coluna do chat. Player real + chat só existem em /<canal>.
    // Por isso o conteúdo do Sobre é montado por nós, via GQL, e não pela rota /about.
    // Não há aba "Início" separada: a raiz do canal JÁ traz, abaixo do player, o conteúdo nativo
    // (bio, painéis, links, agenda). Uma aba só evita duas que mostram exatamente a mesma coisa.
    const NATIVE_OF = { live: "home", about: "about", clips: "clips", videos: "videos", schedule: "schedule", chat: "chat" };

    // Navegar entre abas nativas = atualizar URL sem reload + clicar na âncora nativa se existir
    function goTab(tab) {
        const login = state.route && state.route.login;
        if (!login) return;

        const targetUrl = tab === "live"
            ? `https://www.twitch.tv/${login}`
            : `https://www.twitch.tv/${login}/${tab}`;

        try {
            if (location.href !== targetUrl) {
                history.pushState(null, "", targetUrl);
                lastHref = location.href;
            }
        } catch { /* erro em pushState não impede transição */ }

        setTab(tab);

        const native = NATIVE_OF[tab] || tab;
        const target = native.charAt(0).toUpperCase() + native.slice(1);
        const anchor = document.querySelector(`a[data-a-target="channel-home-tab-${target}"]`)
            || document.querySelector(`a[tabname="${native}"]`);
        if (anchor) {
            try { anchor.click(); } catch {}
        }
    }

    function setTab(tab) {
        state.tab = tab;
        HTML.dataset.tvxTab = tab;
        if (tabsWrap) for (const b of tabsWrap.children) b.setAttribute("aria-selected", String(b.dataset.tab === tab));
        if (tab === "clips" || tab === "videos") openPanel(tab);
        applyLivePlayback();
        reorderLiveSections();
        syncLayoutVars();
    }

    // Mede o espaço que a Twitch já ocupa (nav do topo, sidebar de canais, coluna do chat) e
    // publica em variáveis CSS.
    function syncLayoutVars() {
        const isTheatre = HTML.classList.contains("tw-root--theatre") ||
            !!document.querySelector(".theatre-mode, .persistent-player--theatre") ||
            !!document.querySelector('[data-a-target="player-theatre-mode-button"][aria-label*="Exit"], [data-a-target="player-theatre-mode-button"][aria-label*="Sair"]');
        HTML.dataset.tvxTheatre = isTheatre ? "1" : "0";

        const topNav = document.querySelector('[data-a-target="top-nav-container"], .top-nav');
        // bottom (não height): com a página rolada a nav sobe, e aí o offset certo é 0
        const top = topNav ? Math.max(0, Math.round(topNav.getBoundingClientRect().bottom)) : 0;

        const side = document.querySelector('.side-nav, [data-test-selector="side-nav"]');
        const left = side ? Math.round(side.getBoundingClientRect().width) : 0;

        // altura útil = o scroller, não 100vh: a nav global não é o único cromo acima dele
        const scroller = document.querySelector('[data-a-target="root-scroller"]');
        const avail = scroller ? Math.round(scroller.clientHeight) : Math.round(window.innerHeight - top);

        // O estado do chat vem da CLASSE, não da geometria. Medir a largura visível criava um
        // laço: fechado ela é 0, então o conteúdo ocupava a tela toda, e ao abrir o chat não
        // sobrava espaço — ele ia parar fora da viewport e a largura visível continuava 0.
        // Era exatamente isso que impedia o chat de abrir em canal offline.
        const chat = document.querySelector(".channel-root__right-column");
        const rc = document.querySelector(".right-column");
        const chatOpen = !!chat && !!rc && !/right-column--collapsed/.test(String(rc.className));
        HTML.dataset.tvxChat = chatOpen ? "1" : "0";
        const rightW = chatOpen ? Math.round(chat.getBoundingClientRect().width) || 340 : 0;

        // largura reservada pela lista de clipes/vídeos (nossa sidebar, quando aberta)
        const listOpen = (state.tab === "clips" || state.tab === "videos") && prefs.sidebarOpen;

        const playerW = Math.max(0, window.innerWidth - left - rightW);
        const playerH = Math.min(Math.round(playerW * 9 / 16), Math.max(200, avail - top - 54));

        HTML.style.setProperty("--tvx-top", `${top}px`);
        HTML.style.setProperty("--tvx-left", `${left}px`);
        HTML.style.setProperty("--tvx-right", `${rightW}px`);
        HTML.style.setProperty("--tvx-avail", `${avail}px`);
        HTML.style.setProperty("--tvx-player-h", `${playerH}px`);
        HTML.style.setProperty("--tvx-chatw", `${state.tab === "live" ? rightW : 0}px`);

        // Quanto o CONTEÚDO invade a faixa do chat — medido nele, não no wrapper. O wrapper vai
        // até a borda da viewport em todo estado, então medi-lo dizia sempre "invade a largura
        // inteira do chat"; só que em algumas páginas (a de VOD) a própria Twitch já encolhe o
        // conteúdo interno pela largura do chat, e o nosso recuo por cima reservava a faixa duas
        // vezes. Zeramos antes de medir pra ler a posição natural, não a nossa própria saída.
        const inner = document.querySelector(".channel-info-content") || document.querySelector(".channel-root__info");
        let infoPad = 0;
        if (chatOpen && inner && state.tab === "live") {
            HTML.style.setProperty("--tvx-infopad", "0px");
            infoPad = Math.max(0, Math.round(inner.getBoundingClientRect().right - (window.innerWidth - rightW)));
        }
        HTML.style.setProperty("--tvx-infopad", `${infoPad}px`);
        HTML.style.setProperty("--tvx-listw", listOpen ? "var(--tvx-sidew)" : "0px");

        if (listBtn) {
            // aberta, o botão de recolher mora no cabeçalho da lista (como o do chat)
            listBtn.style.display = (state.tab === "clips" || state.tab === "videos") && !prefs.sidebarOpen ? "" : "none";
            const word = state.tab === "videos" ? "Vídeos" : "Clipes";
            if (listBtn.dataset.word !== word) { listBtn.dataset.word = word; listBtn.innerHTML = svg(ICON.list, 16) + `<span>${word}</span>`; }
            listBtn.title = "Mostrar a lista";
        }
        if (chatBtn) {
            const open = rightW > 0;
            chatBtn.style.display = state.tab === "live" ? "" : "none";
            chatBtn.setAttribute("aria-pressed", String(open));
            const inHeader = open && state.tab === "live";
            chatBtn.classList.toggle("tvx-inheader", inHeader);
            // dentro da #tvx-nav (z 850) ele ficaria atrás da coluna do chat: no cabeçalho, mora no body
            const home = inHeader ? document.body : nav && nav.querySelector(".tvx-navright");
            if (home && chatBtn.parentNode !== home) home.appendChild(chatBtn);
            const sig = open ? "open" : "closed";
            if (chatBtn.dataset.sig !== sig) {
                chatBtn.dataset.sig = sig;
                chatBtn.innerHTML = open ? svg(ICON.collapseRight, 20) : svg(ICON.chat, 16) + "<span>Chat</span>";
            }
            const label = open ? "Recolher chat" : "Mostrar chat";
            chatBtn.title = label;
            chatBtn.setAttribute("aria-label", label);
        }
    }

    // As sidebars da Twitch animam por 500ms. Remedir em dois timeouts fixos fazia a nossa barra
    // pular no fim da animação em vez de acompanhá-la; aqui remedimos a cada frame enquanto a
    // transição estiver rodando, então tudo desliza junto.
    let syncRaf = 0, syncUntil = 0;
    function pumpSync() {
        syncLayoutVars();
        if (performance.now() < syncUntil) syncRaf = requestAnimationFrame(pumpSync);
        else syncRaf = 0;
    }
    function syncFor(ms) {
        syncUntil = Math.max(syncUntil, performance.now() + ms);
        if (!syncRaf) syncRaf = requestAnimationFrame(pumpSync);
    }

    // Só na aba Live: nas outras, a única coluna à direita é a lista de clipes/vídeos. Não
    // reimplementamos abrir/fechar — delegamos no botão da própria Twitch, que dispara a
    // animação e mantém o estado dela consistente. Vale igual com o canal offline: a coluna de
    // chat existe na raiz do canal independentemente de ter transmissão no ar.
    function toggleChat() {
        const t = document.querySelector('[data-a-target="right-column__toggle-collapse-btn"]');
        if (t) t.click();
        syncFor(900);
    }

    // ---- ordem fixa das seções da aba Live --------------------------------
    // A Twitch monta o miolo da home em ordens diferentes conforme o canal esteja ao vivo ou
    // offline. Fixamos: player (já é o primeiro, fora daqui) → Sobre → transmissões recentes →
    // categorias recentes. A classificação é pelos LINKS de cada seção, não pelo título: título
    // é traduzido e as classes são hashes que mudam a cada build da Twitch.
    function sectionRank(sec) {
        const hrefs = [...sec.querySelectorAll("a[href]")].map((a) => a.getAttribute("href") || "");
        // Ordem dos testes importa: cada card de transmissão TAMBÉM leva um link de categoria
        // (a boxart do jogo). Perguntar por categoria antes classificaria transmissões como
        // categorias — foi exatamente o que aconteceu na primeira tentativa.
        if (hrefs.some((h) => /\/videos\/\d/.test(h))) return 2;                          // transmissões
        if (hrefs.some((h) => /[?&]category=|\/directory\/category\//.test(h))) return 3;  // categorias
        return 1;                                                                          // sobre / painéis
    }

    function reorderLiveSections() {
        if (state.tab !== "live") return;
        const lower = document.querySelector(".home__lower-content");
        if (!lower) return;
        const cont = lower.querySelector(".tw-transition") || lower.firstElementChild;
        if (!cont || !cont.children.length) return;

        const stamp = `${cont.children.length}`;
        if (cont.dataset.tvxOrder === stamp) return;   // idempotente: o tick chama toda hora
        cont.dataset.tvxOrder = stamp;
        cont.style.display = "flex";
        cont.style.flexDirection = "column";
        for (const sec of cont.children) {
            // o resize-detector da Twitch não é seção; deixa por último e sem interferir
            const isDetector = /resize-detector/.test(String(sec.className));
            sec.style.order = String(isDetector ? 9 : sectionRank(sec));
        }
    }

    // ---- favoritos na sidebar esquerda ------------------------------------
    // Lista própria, no topo da sidebar da Twitch, com o mesmo desenho das seções nativas.
    // Guardamos só os logins; o resto (avatar, se está ao vivo, jogo) vem da GQL e é atualizado
    // junto com o resto do estado.
    const favSet = () => new Set(prefs.favorites || []);
    let favData = [];        // dados vindos da API, na ordem salva
    let favsEl = null, favListEl = null, favCountEl = null;

    function isFav(login) { return favSet().has((login || "").toLowerCase()); }

    function toggleFav(login) {
        if (!login) return;
        const l = login.toLowerCase();
        const set = favSet();
        if (set.has(l)) set.delete(l); else set.add(l);
        prefs.favorites = [...set];
        savePrefs();
        renderFavButton();
        favData = favData.filter((f) => set.has(f.login.toLowerCase()));
        renderFavs();
        refreshFavs();
    }

    async function refreshFavs() {
        const logins = prefs.favorites || [];
        if (!logins.length) { favData = []; renderFavs(); return; }
        try {
            const list = logins.map((l) => `"${q(l)}"`).join(",");
            const d = await gql(`query { users(logins: [${list}]) {
                id login displayName profileImageURL(width: 50)
                stream { id viewersCount game { displayName } }
                broadcastSettings { title }
            } }`);
            const byLogin = new Map((d.users || []).filter(Boolean).map((u) => [u.login.toLowerCase(), u]));
            // preserva a ordem em que você favoritou, não a que a API devolveu
            favData = logins.map((l) => byLogin.get(l.toLowerCase())).filter(Boolean);
            renderFavs();
        } catch { /* rede ruim: mantém o que já estava na tela */ }
    }

    function mountFavs() {
        const host = document.querySelector(".side-nav__scrollable_content");
        if (!host) return;
        if (document.querySelector(".side-nav--collapsed")) {
            if (favsEl) favsEl.style.setProperty("display", "none", "important");
            return;
        }
        HTML.dataset.tvxNav = "1";
        if (!favsEl) {
            favCountEl = el("em", {});
            favListEl = el("div", { class: "tvx-navsec-list" });
            favsEl = el("div", { id: "tvx-favs" },
                el("div", { class: "tvx-navsec-head" }, el("span", {}, "Favoritos"), favCountEl), favListEl);
        }
        // Irmã das seções nativas, e SÓ quando elas existem. Antes disso caíamos no container,
        // e durante o carregamento a lista de favoritos aparecia acima de Following/Browse/Mais
        // — fora de lugar e sem as abas, que dependem das seções pra existir.
        const nativa = document.querySelector(".side-nav-section");
        if (!nativa || !nativa.parentElement) { if (favsEl.parentNode) favsEl.remove(); return; }
        const alvo = nativa.parentElement;
        // Basta estar no container, ANTES da primeira seção nativa. Exigir que fosse o primeiro
        // filho fazia isto brigar com a faixa de abas, que se insere antes dela: cada um
        // reposicionava o outro a cada ciclo, e mover um nó zera a rolagem dos descendentes —
        // era esse cabo de guerra que jogava a faixa de abas de volta pro começo.
        if (favsEl.parentNode !== alvo) {
            alvo.insertBefore(favsEl, nativa);
            renderFavs();
        }
    }

    function renderFavs() {
        if (!favsEl || !favListEl) return;
        const n = (prefs.favorites || []).length;
        favCountEl.textContent = n ? String(n) : "";
        favListEl.textContent = "";
        if (!n) {
            favListEl.append(el("p", { class: "tvx-favvazio" },
                "Nenhum canal favoritado ainda. Abra um canal e use a ", el("b", {}, "\u2605"),
                " na barra dele."));
        }
        for (const u of favData) {
            const live = !!u.stream;
            favListEl.append(el("a", {
                class: "tvx-fav", href: `/${u.login}`, "data-offline": live ? "0" : "1",
                title: live ? (u.broadcastSettings && u.broadcastSettings.title) || "" : "Offline",
            },
                el("img", { src: u.profileImageURL || "", alt: "", loading: "lazy" }),
                el("div", { class: "tvx-fav-txt" },
                    el("b", {}, u.displayName || u.login),
                    el("small", {}, live ? ((u.stream.game && u.stream.game.displayName) || "") : "Offline")),
                el("span", { class: "tvx-fav-live" }, el("i", {}),
                    live ? nfCompact.format(u.stream.viewersCount) : ""),
            ));
        }
    }

    // A sidebar deixa de empilhar as seções e passa a alterná-las por abas: só uma aparece por
    // vez, ocupando a altura inteira. Some o problema de repartir espaço entre quatro listas.
    //
    // A parte que não é óbvia: a seção fica CINCO níveis abaixo do .side-nav__scrollable_content,
    // e todos os wrappers no meio têm height:auto. Uma coluna flex no container não alcança
    // netos, e "height:100%" no meio da cadeia resolve contra um ancestral de altura automática
    // — não restringe nada. Por isso propagamos a altura nível a nível até o pai das seções.
    // A sidebar deixa de empilhar as seções e passa a alterná-las por dropdown: só uma aparece por
    // vez, ocupando a altura inteira. Some o problema de repartir espaço entre quatro listas.
    let navTabsWrapEl = null, navDropdownTriggerEl = null, navDropdownMenuEl = null, isNavDropdownOpen = false, navPanels = [];

    const CHEVRON_DOWN_SVG = '<svg viewBox="0 0 20 20" width="18" height="18" fill="currentColor" aria-hidden="true"><path fill-rule="evenodd" clip-rule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z"/></svg>';
    const CHECK_SVG = '<svg viewBox="0 0 20 20" width="16" height="16" fill="currentColor" aria-hidden="true"><path fill-rule="evenodd" clip-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"/></svg>';

    function setNavDropdownOpen(open) {
        isNavDropdownOpen = !!open;
        if (!navDropdownTriggerEl || !navDropdownMenuEl) return;
        navDropdownTriggerEl.setAttribute("aria-expanded", String(isNavDropdownOpen));
        if (navTabsWrapEl) {
            navTabsWrapEl.style.setProperty("z-index", isNavDropdownOpen ? "1000" : "50", "important");
            if (navTabsWrapEl.parentElement) {
                navTabsWrapEl.parentElement.style.setProperty("z-index", isNavDropdownOpen ? "1000" : "50", "important");
            }
        }
        if (isNavDropdownOpen) {
            navDropdownMenuEl.removeAttribute("hidden");
        } else {
            navDropdownMenuEl.setAttribute("hidden", "");
        }
    }

    // Fechar dropdown ao clicar fora ou pressionar Escape
    document.addEventListener("click", (e) => {
        if (!isNavDropdownOpen || !navTabsWrapEl) return;
        if (!navTabsWrapEl.contains(e.target)) {
            setNavDropdownOpen(false);
        }
    });
    document.addEventListener("keydown", (e) => {
        if (!isNavDropdownOpen) return;
        if (e.key === "Escape" || e.key === "Esc") {
            setNavDropdownOpen(false);
            if (navDropdownTriggerEl) navDropdownTriggerEl.focus();
        }
    });

    // Rótulo curto: o cabeçalho da seção carrega junto o texto do botão de ordenar ("Sort"), e
    // as palavras genéricas ("Canais"/"Channels") e o nome do streamer se repetem em todas as
    // abas sem distinguir nada. Tirando isso, sobra o que de fato identifica cada uma.
    const GENERICO = /^(canais|channels|canales|kan[aä]le|cha[iî]nes|sort|ordenar|classificar)$/i;

    // A lista é o filho que CONTÉM os cards. Usar lastElementChild funcionava na sidebar
    // anônima (2 filhos: cabeçalho + lista), mas na logada existe um terceiro — o bloco do
    // "Show More" — e era nele que a rolagem ia parar, deixando a lista crescer sem limite.
    function listaDaSecao(sec) {
        return [...sec.children].find((c) => c.querySelector(".side-nav-card"))
            || sec.querySelector(".tw-transition-group")
            || sec.lastElementChild;
    }

    function sectionLabel(sec) {
        let txt = "";
        const head = sec.firstElementChild;
        if (head) {
            const limpo = head.cloneNode(true);
            limpo.querySelectorAll("button, svg, [role='button']").forEach((n) => n.remove());
            txt = limpo.textContent || "";
        }
        txt = (txt || sec.getAttribute("aria-label") || "").replace(/\s+/g, " ").trim();

        const nome = ((state.channel && state.channel.displayName) || "").toLowerCase();
        const palavras = txt.split(" ").filter((w) => w && !GENERICO.test(w) && w.toLowerCase() !== nome);
        let curto = palavras.join(" ") || txt || "Seção";
        if (curto) curto = curto.charAt(0).toUpperCase() + curto.slice(1);
        return { curto: curto.length > 22 ? `${curto.slice(0, 21)}…` : curto, completo: txt || curto };
    }

    // Rede de segurança: quando não conseguimos montar as abas, temos que DESFAZER o que já
    // tínhamos escondido e os estilos de layout aplicados. Sem isso, uma passagem que sai cedo
    // ou o colapso da sidebar deixava propriedades inline que quebravam a sidebar nativa.
    function cleanupSidebarState() {
        delete HTML.dataset.tvxNav;
        if (isNavDropdownOpen) setNavDropdownOpen(false);

        // Remove nós injetados da árvore React para evitar colisão na reconciliação nativa
        if (navTabsWrapEl && navTabsWrapEl.parentNode) {
            navTabsWrapEl.remove();
        }
        if (favsEl && favsEl.parentNode) {
            favsEl.remove();
        }

        const host = document.querySelector(".side-nav__scrollable_content");
        if (host) {
            host.style.removeProperty("overflow");
            host.style.removeProperty("display");
            host.style.removeProperty("flex-direction");
            for (const c of host.children) {
                c.style.removeProperty("flex");
                c.style.removeProperty("min-height");
                c.style.removeProperty("overflow");
                c.style.removeProperty("height");
            }
        }

        // Limpa todo e qualquer estilo inline que aplicamos em wrappers, seções e filhos da sidebar
        for (const el of document.querySelectorAll(".side-nav, .side-nav *, .side-bar-contents, .side-bar-contents *")) {
            el.style.removeProperty("min-height");
            el.style.removeProperty("overflow");
            el.style.removeProperty("overflow-y");
            el.style.removeProperty("flex");
            el.style.removeProperty("height");
            el.style.removeProperty("display");
            el.style.removeProperty("flex-direction");
            el.style.removeProperty("z-index");
        }

        // Garante que títulos nativos não fiquem com display: none inline
        for (const h of document.querySelectorAll(".side-nav h1, .side-nav h2, .side-nav h3, .side-nav h4, .side-nav__title")) {
            h.style.removeProperty("display");
        }
    }

    function getActiveNavTabIndex() {
        if (!navPanels.length) return 0;
        const val = prefs.navTab;
        if (val === "followed" || !val || val === 0) {
            const idx = navPanels.findIndex((p) => /follow|seguid/i.test(p.curto) || /follow|seguid/i.test(p.completo));
            if (idx !== -1) return idx;
            const withCards = navPanels.findIndex((p) => p.el !== favsEl);
            return withCards !== -1 ? withCards : 0;
        }
        if (typeof val === "string") {
            const low = val.toLowerCase();
            const idx = navPanels.findIndex((p) => p.curto.toLowerCase() === low || p.completo.toLowerCase() === low);
            if (idx !== -1) return idx;
        } else if (typeof val === "number") {
            if (val >= 0 && val < navPanels.length) return val;
        }
        const withCards = navPanels.findIndex((p) => p.el !== favsEl);
        return withCards !== -1 ? withCards : 0;
    }

    let sideNavObserver = null;
    function observeSideNav() {
        const side = document.querySelector(".side-nav");
        if (!side) return;
        if (sideNavObserver && sideNavObserver._target === side) return;
        if (sideNavObserver) sideNavObserver.disconnect();
        sideNavObserver = new MutationObserver((mutations) => {
            for (const m of mutations) {
                if (m.type === "attributes" && m.attributeName === "class") {
                    const isCollapsed = side.classList.contains("side-nav--collapsed");
                    if (isCollapsed) {
                        cleanupSidebarState();
                    } else {
                        tabifySideNav();
                    }
                    syncFor(600);
                    break;
                }
            }
        });
        sideNavObserver._target = side;
        sideNavObserver.observe(side, { attributes: true, attributeFilter: ["class"] });
    }

    function tabifySideNav() {
        if (document.querySelector(".side-nav--collapsed")) {
            cleanupSidebarState();
            return;
        }
        HTML.dataset.tvxNav = "1";
        const host = document.querySelector(".side-nav__scrollable_content");
        const secs = [...document.querySelectorAll(".side-nav-section")];
        if (!host || !secs.length || host.clientHeight < 200) { cleanupSidebarState(); return; }

        const parent = secs[0].parentElement;
        if (!parent || !host.contains(parent)) { cleanupSidebarState(); return; }

        const set = (e, k, v) => e.style.setProperty(k, v, "important");
        set(host, "overflow", "hidden");
        // O container também hospeda os links de navegação. Com "height:100%" na cadeia inteira,
        // o ramo das seções passava a medir a altura CHEIA e era empurrado pra baixo dos links,
        // saindo do recorte — a sidebar ficava só com os links. O ramo que contém as seções
        // estica pelo flex (descontando o que vem antes); daí pra baixo, aí sim, height:100%.
        set(host, "display", "flex");
        set(host, "flex-direction", "column");
        for (const c of host.children) {
            if (c !== parent && !c.contains(parent)) set(c, "flex", "0 0 auto");
        }
        for (let e = parent; e && e !== host; e = e.parentElement) {
            set(e, "min-height", "0"); set(e, "overflow", "hidden");
            if (e.parentElement === host) set(e, "flex", "1 1 auto");
            else set(e, "height", "100%");
        }
        set(parent, "display", "flex");
        set(parent, "flex-direction", "column");

        // sempre presente, mesmo vazia: sem a aba, não havia como descobrir o recurso
        const temFavs = !!(favsEl && favsEl.parentNode === parent);
        navPanels = [
            ...(temFavs ? [{ el: favsEl, curto: "Favoritos", completo: "Favoritos" }] : []),
            ...secs.map((s) => Object.assign({ el: s }, sectionLabel(s))),
        ];
        navPanels.forEach((p) => {
            if (p.curto) p.curto = p.curto.charAt(0).toUpperCase() + p.curto.slice(1);
        });

        if (!navTabsWrapEl) {
            navDropdownTriggerEl = el("button", {
                class: "tvx-navdropdown-btn", type: "button",
                "aria-haspopup": "listbox", "aria-expanded": "false",
            }, el("span", { class: "tvx-navdropdown-label" }, "Seguidos"), el("span", { class: "tvx-navdropdown-chevron", html: CHEVRON_DOWN_SVG }));

            navDropdownMenuEl = el("div", {
                class: "tvx-navdropdown-menu", role: "listbox", hidden: "",
            });

            navDropdownTriggerEl.addEventListener("click", (e) => {
                e.stopPropagation();
                setNavDropdownOpen(!isNavDropdownOpen);
            });

            // busca dentro da lista ativa (seguidos, favoritos…), ao lado da setinha
            const searchIn = el("input", { class: "tvx-navsearch-in", type: "search", placeholder: "Buscar canal…" });
            const searchBtn = el("button", { class: "tvx-navsearch-btn", type: "button", title: "Buscar na lista", html: svg(ICON.search, 16) });
            const closeSearch = () => { searchIn.value = ""; navTabsWrapEl.dataset.search = "0"; applySideSearch(); };
            searchBtn.addEventListener("click", (e) => {
                e.stopPropagation();
                if (navTabsWrapEl.dataset.search === "1") { closeSearch(); return; }
                navTabsWrapEl.dataset.search = "1";
                searchIn.focus();
            });
            searchIn.addEventListener("input", applySideSearch);
            searchIn.addEventListener("keydown", (e) => { if (e.key === "Escape") { e.stopPropagation(); closeSearch(); } });
            navSearchInEl = searchIn;
            navTabsWrapEl = el("div", { id: "tvx-navtabs-wrap" }, navDropdownTriggerEl, searchBtn,
                el("div", { class: "tvx-navsearch-row" }, searchIn), navDropdownMenuEl);
        }
        // Transforma o container nativo .side-nav__title no nosso dropdown, ou insere antes da primeira seção
        const titleContainer = host.querySelector(".side-nav__title") || parent.querySelector(".side-nav__title");
        if (titleContainer) {
            for (const h of titleContainer.querySelectorAll("h1, h2, h3, h4")) {
                h.style.setProperty("display", "none", "important");
            }
            if (navTabsWrapEl.parentNode !== titleContainer) {
                titleContainer.appendChild(navTabsWrapEl);
            }
        } else {
            const ancora = temFavs ? favsEl : secs[0];
            if (navTabsWrapEl.nextElementSibling !== ancora || navTabsWrapEl.parentNode !== parent) {
                parent.insertBefore(navTabsWrapEl, ancora);
            }
        }
        const sig = navPanels.map((p) => p.curto).join("|");
        if (navDropdownMenuEl.dataset.sig !== sig) {
            navDropdownMenuEl.dataset.sig = sig;
            navDropdownMenuEl.textContent = "";
            const activeIdx = getActiveNavTabIndex();
            navPanels.forEach((p, i) => {
                const item = el("button", {
                    class: "tvx-navdropdown-item", type: "button", role: "option",
                    "aria-selected": String(i === activeIdx), title: p.completo,
                }, el("span", { class: "tvx-navdropdown-item-label" }, p.curto), el("span", { class: "tvx-navdropdown-check", html: CHECK_SVG }));

                item.addEventListener("click", (e) => {
                    e.stopPropagation();
                    prefs.navTab = p.curto;
                    savePrefs();
                    applyNavTab();
                    setNavDropdownOpen(false);
                });
                navDropdownMenuEl.append(item);
            });
        }

        // "For You" e afins ficam no tamanho natural, acima das abas
        for (const child of parent.children) {
            if (child === navTabsWrapEl) { set(child, "flex", "0 0 auto"); continue; }
            if (!navPanels.some((p) => p.el === child)) {
                set(child, "flex", "0 0 auto");
                const isStories = child.querySelector('[class*="stories" i], [data-a-target*="stories" i]')
                    || child.matches('[class*="stories" i], [data-a-target*="stories" i]')
                    || /stories/i.test(child.textContent || "")
                    || (child.style.marginTop && child.style.marginTop.includes("0.7rem"));
                if (isStories) {
                    // sai do topo da lista e vira a linha "Stories" (que clica neste, escondido)
                    set(child, "display", "none");
                    storiesEl = child;
                }
            }
        }
        // Só entramos em modo abas depois de confirmar que a faixa REALMENTE renderizou.
        // Enquanto ela não estiver na tela, esconder painéis deixaria a sidebar vazia — pior
        // do que manter o empilhamento nativo por mais um ciclo.
        if (navTabsWrapEl.getBoundingClientRect().width < 8) { cleanupSidebarState(); return; }
        applyNavTab();
        if (navSearchInEl && navSearchInEl.value) applySideSearch();
    }

    let navSearchInEl = null, storiesEl = null, storiesRowEl = null;

    function syncStoriesRow() {
        if (!navLinksEl) return;
        const live = !!(storiesEl && storiesEl.isConnected);
        let seen = false;
        try {
            if (live) localStorage.setItem("tvx-has-stories", "1");
            seen = localStorage.getItem("tvx-has-stories") === "1" && !!shellUserName();
        } catch { /* sem storage */ }
        if (!live && !seen) { if (storiesRowEl) storiesRowEl.remove(); return; }
        if (!storiesRowEl) {
            storiesRowEl = el("button", { class: "tvx-navlink tvx-storiesrow", type: "button",
                html: '<svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12 2a10 10 0 1 0 10 10A10 10 0 0 0 12 2Zm0 2a8 8 0 1 1-8 8 8 8 0 0 1 8-8Zm-1.5 4.5v7l5.5-3.5Z"/></svg>' }, "Stories");
            storiesRowEl.addEventListener("click", () => {
                const target = storiesEl && (storiesEl.querySelector("button, a, [role='button']") || storiesEl);
                if (target) target.click();
            });
        }
        if (storiesRowEl.parentNode !== navLinksEl || storiesRowEl.nextSibling) navLinksEl.appendChild(storiesRowEl);
    }
    // esconde os canais da lista que não batem com a busca; roda também a cada tick, porque a
    // Twitch re-renderiza a lista (e as linhas novas chegam visíveis)
    // Passar o mouse na foto de um canal da sidebar abre um cartão só, ao lado da sidebar: a
    // foto grande + nome, título da live, categoria e espectadores. O balão de título da
    // Twitch some enquanto ele está aberto (o título vem dele: o card não traz no DOM).
    let avatarPreviewEl = null, previewTimer = 0;
    document.addEventListener("mouseover", (e) => {
        // a linha inteira abre o cartão, não só a foto
        const card = e.target && e.target.closest && e.target.closest(".side-nav .side-nav-card, .side-nav .tvx-fav");
        const img = card && card.querySelector(".side-nav-card__avatar img, .tvx-fav > img");
        if (!img || (avatarPreviewEl && avatarPreviewEl.dataset.on === "1" && avatarPreviewEl.__card === card)) return;
        if (!avatarPreviewEl) {
            avatarPreviewEl = el("div", { id: "tvx-avatar-preview" },
                el("img", { alt: "" }),
                el("div", { class: "tvx-ap-txt" }, el("b"), el("p"), el("small")));
            document.body.appendChild(avatarPreviewEl);
        }
        const [pic, txt] = avatarPreviewEl.children;
        const [nameEl, titleEl, metaEl] = txt.children;
        pic.src = (img.currentSrc || img.src).replace(/-\d+x\d+(\.\w+)(\?.*)?$/, "-300x300$1");
        const q = (sel) => (card && card.querySelector(sel)?.textContent || "").trim();
        nameEl.textContent = q('[data-a-target="side-nav-title"], .tvx-fav-txt b');
        const game = q(".side-nav-card__metadata, .tvx-fav-txt small");
        const viewers = q('[data-a-target="side-nav-live-status"] span, .tvx-fav-live');
        metaEl.textContent = [game, viewers && !/offline/i.test(viewers) ? `${viewers} espectadores` : ""].filter(Boolean).join(" · ");
        titleEl.textContent = card && card.classList.contains("tvx-fav") ? (card.getAttribute("title") || "") : "";
        // o título da Twitch chega num balão próprio, um instante depois do hover
        clearInterval(previewTimer);
        let tries = 0;
        previewTimer = setInterval(() => {
            const tip = document.querySelector('[class*="channel-tooltip"]');
            const t = tip && tip.textContent.trim();
            if (t && t !== titleEl.textContent) titleEl.textContent = t;
            if (++tries > 20) clearInterval(previewTimer);
        }, 60);
        const r = img.getBoundingClientRect();
        avatarPreviewEl.style.left = `${Math.round(Math.max(r.right, parseFloat(getComputedStyle(HTML).getPropertyValue("--tvx-shellw")) || 240) + 12)}px`;
        avatarPreviewEl.style.top = `${Math.round(Math.min(Math.max(8, r.top + r.height / 2 - 120), innerHeight - 300))}px`;
        avatarPreviewEl.dataset.on = "1";
        avatarPreviewEl.__card = card;
        HTML.dataset.tvxAvatarPrev = "1";
        card.addEventListener("mouseleave", () => {
            if (avatarPreviewEl.__card !== card) return;
            avatarPreviewEl.dataset.on = "0"; avatarPreviewEl.__card = null; HTML.dataset.tvxAvatarPrev = "0"; clearInterval(previewTimer);
        }, { once: true });
    }, true);

    function applySideSearch() {
        const term = (navSearchInEl && navSearchInEl.value || "").trim().toLowerCase();
        for (const card of document.querySelectorAll(".side-nav-section .side-nav-card, #tvx-favs .tvx-fav")) {
            const row = card.classList.contains("tvx-fav") ? card : card.parentElement;
            const name = (card.querySelector('[data-a-target="side-nav-title"], .tvx-fav-txt b')?.textContent || "").toLowerCase();
            const game = (card.querySelector(".side-nav-card__metadata, .tvx-fav-txt small")?.textContent || "").toLowerCase();
            const hide = !!term && !name.includes(term) && !game.includes(term);
            if (hide) row.style.setProperty("display", "none", "important");
            else if (row.style.display === "none") row.style.removeProperty("display");
        }
    }

    function applyNavTab() {
        if (!navPanels.length) return;
        const set = (e, k, v) => e.style.setProperty(k, v, "important");
        const i = getActiveNavTabIndex();
        navPanels.forEach((p, idx) => {
            const on = idx === i;
            set(p.el, "display", on ? "flex" : "none");
            if (!on) return;
            set(p.el, "flex", "1 1 auto");
            set(p.el, "min-height", "0");
            set(p.el, "flex-direction", "column");
            const list = p.el === favsEl ? favListEl : listaDaSecao(p.el);
            if (list && list !== p.el.firstElementChild) {
                set(list, "flex", "1 1 auto"); set(list, "min-height", "0"); set(list, "overflow-y", "auto");
            }
        });

        const activePanel = navPanels[i];
        if (navDropdownTriggerEl && activePanel) {
            const lbl = navDropdownTriggerEl.querySelector(".tvx-navdropdown-label");
            if (lbl) lbl.textContent = activePanel.curto;
        }
        if (navDropdownMenuEl) {
            const items = navDropdownMenuEl.querySelectorAll(".tvx-navdropdown-item");
            items.forEach((item, idx) => {
                item.setAttribute("aria-selected", String(idx === i));
            });
        }

        // Se o painel ativo não renderizou (altura ~0), devolvemos o empilhamento nativo: uma
        // sidebar empilhada é pior que abas, mas infinitamente melhor que uma sidebar vazia.
        const ativo = navPanels[i] && navPanels[i].el;
        if (ativo && document.contains(ativo)) {
            requestAnimationFrame(() => {
                if (navPanels[i] && navPanels[i].el === ativo && ativo.getBoundingClientRect().height < 8) {
                    cleanupSidebarState();
                }
            });
        }
    }

    // "Mostrar mais" some: cada seção passa a rolar por dentro. Clicamos algumas vezes antes de
    // esconder pra lista não ficar presa nos ~10 primeiros que a Twitch renderiza de saída.
    const showMoreClicks = new WeakMap();
    function expandSideNavSections() {
        for (const sec of document.querySelectorAll(".side-nav-section")) {
            // Ao expandir, o próprio botão vira "Mostrar menos" — casar só com "mais" deixava
            // esse rótulo pendurado no fim da lista pra sempre.
            const btn = [...sec.querySelectorAll('button, a, [role="button"]')]
                .find((b) => /^\s*(mostrar (mais|menos)|show (more|less)|ver mais)\s*$/i.test(b.textContent || ""));
            if (!btn) continue;
            const maisPraCarregar = /mais|more/i.test(btn.textContent || "");
            const n = showMoreClicks.get(sec) || 0;
            if (maisPraCarregar && n < 5) { showMoreClicks.set(sec, n + 1); btn.click(); }
            else btn.style.setProperty("display", "none", "important");
        }
    }

    // ---- Navegar/Seguindo na sidebar --------------------------------------
    // A barra superior fica só com busca e conta; os atalhos de navegação descem
    // pra sidebar. Os controles de recolher/expandir da sidebar permanecem nativos da Twitch.
    //
    // Não movemos os nós originais: são do React, que os remonta e desfaz qualquer transplante.
    // Escondemos os originais e criamos cópias que delegam neles (assim rótulo e destino seguem
    // vindo da Twitch, já traduzidos).
    // Marcadores de que um nó carrega conteúdo real da sidebar: nunca escondemos nada que
    // contenha um destes.
    const SIDENAV_CONTEUDO = ".side-bar-contents, .side-nav-section, #side-nav, .side-nav__scrollable_content";
    const ocultadosPorNos = new Set();

    // Conserto: se algo que escondemos passou a carregar conteúdo (a Twitch preenche o ramo
    // DEPOIS de montar a casca), devolvemos à vida. Sem isso, um acerto de timing infeliz no
    // carregamento deixava a sidebar permanentemente vazia.
    function repararOcultacoes() {
        for (const e of [...ocultadosPorNos]) {
            if (!e.isConnected) { ocultadosPorNos.delete(e); continue; }
            if (e.querySelector(SIDENAV_CONTEUDO)) {
                e.style.removeProperty("display");
                ocultadosPorNos.delete(e);
            }
        }
    }

    let navLinksEl = null;

    function relocateNavControls() {
        repararOcultacoes();
        document.querySelectorAll(".tvx-collapse").forEach((b) => b.remove());

        const topnav = document.querySelector('.top-nav, [data-a-target="top-nav-container"]');
        const side = document.querySelector(".side-nav");
        if (!topnav || !side) return;

        // Seguindo/Navegar descem pra sidebar, e o "⋮" vira um item "Mais" ali junto
        const origem = ["following-link", "browse-link"]
            .map((t) => topnav.querySelector(`[data-a-target="${t}"]`)).filter(Boolean);
        const maisBtn = topnav.querySelector('[data-a-target="ellipsis-button"]');
        if (!origem.length && !maisBtn) return;
        for (const a of origem) {
            let w = a;
            for (let i = 0; i < 3; i++) {
                const p = w.parentElement;
                if (!p || p === topnav || p.querySelectorAll("button, a").length > 1) break;
                w = p;
            }
            if (w.querySelector(SIDENAV_CONTEUDO)) w = a;
            w.style.setProperty("display", "none", "important");
            ocultadosPorNos.add(w);
        }

        if (!navLinksEl) navLinksEl = el("div", { id: "tvx-navlinks" });
        const sig = `${origem.map((a) => a.textContent.trim()).join("|")}|${maisBtn ? "+mais" : ""}`;
        if (navLinksEl.dataset.sig !== sig) {
            navLinksEl.dataset.sig = sig;
            for (const n of [...navLinksEl.children]) if (!n.classList.contains("tvx-navslot")) n.remove();
            const busca = el("button", { class: "tvx-navlink", type: "button", html: svg(ICON.searchNav, 20) }, "Buscar");
            busca.addEventListener("click", () => setSearchOpen(true));
            navLinksEl.prepend(busca);
            for (const a of origem) {
                const followed = a.getAttribute("data-a-target") === "following-link";
                navLinksEl.append(el("a", {
                    class: "tvx-navlink", href: a.getAttribute("href") || "/",
                    html: svg(followed ? ICON.heart : ICON.browse, 20),
                }, a.textContent.trim()));
            }
            // o "⋮" e os ícones da conta são linhas fixadas por syncShell, sempre depois destes
            for (const n of navLinksEl.querySelectorAll(".tvx-navslot")) navLinksEl.appendChild(n);
        }
        const host = document.querySelector(".side-nav__scrollable_content");
        if (host && navLinksEl.parentNode !== host) host.insertBefore(navLinksEl, host.firstChild);

        // O título "For You" vira ruído: a navegação agora é a nossa. Escondemos só cabeçalhos
        // SOLTOS — os que estão dentro de uma seção viraram rótulo de aba e já não aparecem.
        if (host && !document.querySelector(".side-nav--collapsed")) {
            for (const h of host.querySelectorAll("h1, h2, h3, h4")) {
                if (!h.closest(".side-nav-section")) h.style.setProperty("display", "none", "important");
            }
        }
    }

    // ---- sem topbar: marca, busca e conta na sidebar --------------------------
    // Nada é movido no DOM (o React remontaria); só marcamos com data-* os blocos que o CSS
    // fixa na sidebar. data-* e não classe: o React reescreve className a cada render.
    const WORDMARK = "m 0,0 -13.646,13.645 -25.35,0 0,17.55 -21.451,0 0,-79.94 21.451,0 0,40.947 17.545,0 0,-40.947 21.451,0 L 0,0 Z m -68.241,13.645 -33.146,0 L -115.036,0 l 0,-35.094 13.649,-13.651 33.146,0 0,21.445 -25.35,0 0,19.502 25.35,0 0,21.443 z m -54.594,0 -17.545,0 0,17.55 -21.451,0 0,-66.289 13.649,-13.651 25.347,0 0,21.445 -17.545,0 0,19.502 17.545,0 0,21.443 z m -46.795,17.55 -21.445,0 0,-9.752 21.445,0 0,9.752 z m 0,-17.55 -21.445,0 0,-62.389 21.445,0 0,62.389 z m -29.244,0 -21.447,0 0,-40.945 -7.797,0 0,40.945 -21.448,0 0,-40.945 -7.796,0 0,40.945 -21.451,0 0,-62.39 66.293,0 13.646,13.651 0,48.739 z m -87.738,0 -17.546,0 0,17.55 -21.447,0 0,-66.289 13.648,-13.651 25.345,0 0,21.445 -17.546,0 0,19.502 17.546,0 0,21.443 z M 7.793,3.9 l 0,-58.491 -29.244,-19.499 -19.496,0 0,9.752 -13.648,-9.752 -17.545,0 0,9.752 -9.746,-9.752 -31.197,0 -9.752,9.752 -1.952,-9.752 -27.292,0 -11.161,9.752 -0.625,-9.752 -30.935,0 -1.094,9.752 -8.374,-9.752 -47.25,0 -9.75,3.9 0,-3.9 -25.344,0 -29.247,17.552 -17.546,17.539 0,77.991 37.047,0 17.545,-17.549 79.939,0 0,17.549 66.29,0 0,-17.549 17.548,0 0,-9.746 9.752,9.746 19.493,0 17.55,17.549 37.044,0 0,-17.549 21.448,0 L 7.793,3.9 Z";
    let wordmarkEl = null, footerEl = null, searchBackdropEl = null;
    const navSlots = new Map(); // botão nativo da conta → linha "vaga" na nossa lista
    // Os botões da conta (notificações, threads, gritos) só nascem 2-3s depois do resto. As
    // linhas da última visita ficam guardadas e aparecem já no primeiro quadro; quando o botão
    // real chega, ele assume a linha de mesmo rótulo — nada pula.
    const SLOT_CACHE_KEY = "tvx-navslots-v1";
    const cachedSlots = new Map(); // rótulo → linha ainda sem botão
    let cachedSlotsShown = false, liveSlotsSince = 0;

    // rótulo da linha: o aria-label da Twitch, com o nome que a interface em pt-BR usa
    function slotLabel(raw) {
        const t = raw.charAt(0).toUpperCase() + raw.slice(1);
        return /^threads?$/i.test(t) ? "Sussurros" : t;
    }

    function showCachedSlots() {
        if (cachedSlotsShown || !navLinksEl || !shellUserName()) return;
        cachedSlotsShown = true;
        let list = [];
        try { list = JSON.parse(localStorage.getItem(SLOT_CACHE_KEY) || "[]"); } catch { /* sem cache */ }
        for (const item of list) {
            const label = slotLabel(item.label || ""), icon = item.icon;
            if (!label || cachedSlots.has(label)) continue;
            const slot = el("div", { class: "tvx-navslot", html: icon || "" }, el("span", {}, label));
            cachedSlots.set(label, slot);
            navLinksEl.appendChild(slot);
        }
    }

    function saveSlotCache() {
        const list = [...navSlots.values()].filter((sl) => sl.isConnected)
            .sort((a, b) => (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1))
            .map((sl) => ({ label: sl.dataset.label, icon: sl.querySelector("svg")?.outerHTML || "" }));
        const json = JSON.stringify(list);
        try { if (localStorage.getItem(SLOT_CACHE_KEY) !== json) localStorage.setItem(SLOT_CACHE_KEY, json); } catch { /* cheio/bloqueado */ }
    }

    function setSearchOpen(open) {
        if (open === (HTML.dataset.tvxSearch === "1")) return;
        HTML.dataset.tvxSearch = open ? "1" : "0";
        if (open) setTimeout(() => document.querySelector('.top-nav__search-container input')?.focus(), 30);
        else document.activeElement?.blur?.();
    }

    function shellUserName() {
        try {
            const user = JSON.parse(W.localStorage.getItem("twilight-user") || "null");
            if (user && (user.displayName || user.login)) return user.displayName || user.login;
        } catch { /* segue pro cookie */ }
        const m = document.cookie.match(/(?:^|;\s*)(?:name|login)=([^;]+)/);
        return m ? decodeURIComponent(m[1]) : "";
    }

    function syncShell() {
        const topnav = document.querySelector('.top-nav, [data-a-target="top-nav-container"]');
        const side = document.querySelector(".side-nav");
        if (!topnav || !side || !document.body) return;
        HTML.dataset.tvxShell = "1";
        HTML.dataset.tvxCollapsed = side.classList.contains("side-nav--collapsed") ? "1" : "0";
        HTML.style.setProperty("--tvx-shellw", `${Math.round(side.getBoundingClientRect().width) || 240}px`);

        // logo: wordmark clássico, leva pra home pelo link nativo (navegação sem recarregar)
        if (!wordmarkEl) {
            wordmarkEl = el("button", { id: "tvx-wordmark", type: "button", "aria-label": "Twitch — página inicial",
                html: `<svg class="tvx-wm" viewBox="0 0 454.93 150.78" aria-hidden="true"><path fill="currentColor" fill-rule="evenodd" transform="matrix(1.3333333,0,0,-1.3333333,-180.53426,805.80838) translate(468.8057,565.3643)" d="${WORDMARK}"/></svg>` });
            wordmarkEl.addEventListener("click", () => document.querySelector('[data-a-target="home-link"]')?.click());
        }
        if (!wordmarkEl.isConnected) document.body.appendChild(wordmarkEl);
        if (!wordmarkEl.querySelector(".tvx-glitch")) {
            const glitch = document.querySelector('[data-a-target="home-link"] svg');
            if (glitch) {
                const g = glitch.cloneNode(true);
                g.setAttribute("class", "tvx-glitch");
                g.removeAttribute("width"); g.removeAttribute("height");
                wordmarkEl.appendChild(g);
            }
        }

        // busca em modal: fundo nosso, campo nativo (sugestões e Enter seguem sendo da Twitch)
        if (!searchBackdropEl) {
            searchBackdropEl = el("div", { id: "tvx-search-backdrop" });
            searchBackdropEl.addEventListener("mousedown", () => setSearchOpen(false));
            document.addEventListener("keydown", (e) => {
                if (e.key === "Escape" && HTML.dataset.tvxSearch === "1") { e.stopPropagation(); setSearchOpen(false); }
            }, true);
        }
        if (!searchBackdropEl.isConnected) document.body.appendChild(searchBackdropEl);

        // rodapé: avatar nativo + nome da conta (da sessão que a própria Twitch guarda)
        if (!footerEl) {
            const btn = el("button", { id: "tvx-userbtn", type: "button" }, el("span", { class: "tvx-userav" }), el("span"));
            btn.addEventListener("click", (e) => {
                e.stopPropagation();
                document.querySelector('[data-tvx-accountbar] [data-a-target="user-menu-toggle"]')?.click();
            });
            footerEl = el("div", { id: "tvx-footer" }, btn);
        }
        if (!footerEl.isConnected) document.body.appendChild(footerEl);
        const name = shellUserName();
        const nameEl = footerEl.querySelector("#tvx-userbtn > span:last-child");
        if (nameEl.textContent !== name) nameEl.textContent = name;
        HTML.dataset.tvxNamed = name ? "1" : "0";
        // cópia do avatar nativo: o original muda de lugar ao abrir o menu, a cópia não
        const nativeAv = document.querySelector('[data-a-target="user-menu-toggle"] :is(img, figure, svg)');
        const avKey = nativeAv ? (nativeAv.getAttribute("src") || nativeAv.tagName) : "";
        const avEl = footerEl.querySelector(".tvx-userav");
        if (nativeAv && avEl.dataset.key !== avKey) {
            avEl.dataset.key = avKey;
            avEl.replaceChildren(nativeAv.cloneNode(true));
        }

        showCachedSlots();
        const menu = topnav.querySelector(".top-nav__menu") || topnav.firstElementChild;
        const account = menu && menu.lastElementChild;
        if (!account) return;
        if (!account.hasAttribute("data-tvx-accountbar")) account.setAttribute("data-tvx-accountbar", "");


        // ícones da conta → linhas da lista (Seguindo/Navegar/Mais/…)
        const skip = new Set(["user-menu-toggle", "login-button", "signup-button"]);
        // fixed só ancora na tela se nenhum ancestral tiver transform/filter (a Twitch anima alguns)
        const unpin = (e) => {
            for (let a = e.parentElement; a && a !== document.body; a = a.parentElement) {
                if (a.dataset.tvxUnpinned) break;
                a.dataset.tvxUnpinned = "1";
                for (const k of ["transform", "filter", "contain", "will-change", "backdrop-filter"]) a.style.setProperty(k, k === "will-change" ? "auto" : "none", "important");
            }
        };
        // o "⋮" mora no rodapé, à direita do usuário
        const ellipsis = topnav.querySelector('[data-a-target="ellipsis-button"]');
        if (ellipsis) {
            let wrap = ellipsis;
            for (let i = 0; i < 4; i++) {
                const p = wrap.parentElement;
                if (!p || p === menu || p.querySelectorAll("button, a").length > 1) break;
                wrap = p;
            }
            if (!wrap.hasAttribute("data-tvx-footmore")) {
                wrap.setAttribute("data-tvx-footmore", "");
                wrap.addEventListener("click", () => pinSidebarPopoverSoon(0, true));
            }
            unpin(wrap);
        }
        const toggle = account.querySelector('[data-a-target="user-menu-toggle"]');
        const controls = [...account.querySelectorAll("button[aria-label], a[aria-label]")].filter((c) =>
            !skip.has(c.getAttribute("data-a-target") || "") && !c.dataset.tvxAd &&
            !(toggle && (c.contains(toggle) || toggle.contains(c) || c.closest('[data-a-target="dropdown-up"]'))) &&
            !c.closest('[style*="display: none"]') && (navSlots.has(c) || c.getClientRects().length > 0));
        for (const [ctl, slot] of navSlots) {
            if (!ctl.isConnected || !controls.includes(ctl)) { slot.remove(); navSlots.delete(ctl); }
        }
        for (const ctl of controls) {
            let wrap = ctl;
            for (let i = 0; i < 4; i++) {
                const p = wrap.parentElement;
                if (!p || p === account || p === menu || p.querySelectorAll("button, a").length > 1) break;
                wrap = p;
            }
            if (!wrap.hasAttribute("data-tvx-navitem")) wrap.setAttribute("data-tvx-navitem", "");
            unpin(wrap);
            let slot = navSlots.get(ctl);
            const label = ctl.dataset.tvxLabel || (ctl.getAttribute("aria-label") || "").replace(/^(abrir|open|fechar|close)\s+/i, "").replace(/\s*\(.*\)$/, "").trim();
            ctl.dataset.tvxLabel = label;
            if (!label) continue;
            if (!slot) {
                const cap = slotLabel(label);
                slot = cachedSlots.get(cap);
                if (slot) { cachedSlots.delete(cap); slot.dataset.label = ""; }
                else slot = el("div", { class: "tvx-navslot" });
                navSlots.set(ctl, slot);
            }
            slot.__wrap = wrap;
            const text = slotLabel(label);
            if (slot.dataset.label !== text) {
                slot.dataset.label = text;
                slot.textContent = "";
                const icon = ctl.querySelector("svg");
                const ico = icon ? icon.cloneNode(true) : document.createElementNS("http://www.w3.org/2000/svg", "svg");
                ico.setAttribute("class", "tvx-navslot-ico");
                ico.removeAttribute("width"); ico.removeAttribute("height");
                slot.append(ico, el("span", {}, text));
            }
            if (!ctl.hasAttribute("data-tvx-navctl")) {
                // o botão nativo fica por cima da linha inteira, invisível: o clique é o real
                // (abrir, fechar, "clique fora" — tudo como a Twitch espera). A linha só desenha.
                ctl.setAttribute("data-tvx-navctl", "");
                ctl.addEventListener("mouseenter", () => navSlots.get(ctl)?.classList.add("tvx-hover"));
                ctl.addEventListener("mouseleave", () => navSlots.get(ctl)?.classList.remove("tvx-hover"));
                ctl.addEventListener("click", () => {
                    const sl = navSlots.get(ctl);
                    if (sl) pinSidebarPopoverSoon(sl.getBoundingClientRect().top, false, null, sl.__wrap);
                });
            }
            if (navLinksEl && slot.parentNode !== navLinksEl) navLinksEl.appendChild(slot);
            const r = slot.getBoundingClientRect();
            wrap.style.setProperty("--tvx-x", `${Math.round(r.left)}px`);
            wrap.style.setProperty("--tvx-y", `${Math.round(r.top)}px`);
            wrap.style.setProperty("--tvx-w", `${Math.round(r.width)}px`);
        }
        syncStoriesRow();
        if (navSlots.size) {
            if (!liveSlotsSince) liveSlotsSince = Date.now();
            saveSlotCache();
            if (cachedSlots.size && Date.now() - liveSlotsSince > 6000) {
                for (const sl of cachedSlots.values()) sl.remove();
                cachedSlots.clear();
            }
        }
    }
    // Os balões dos itens da sidebar (notificações, sussurros, "⋮") abrem por baixo do botão,
    // cobrindo a lista. Não sabemos onde a Twitch os renderiza (dentro do botão ou num portal),
    // então achamos pelo que está na tela: o maior bloco sobre a sidebar logo abaixo do item
    // clicado que não seja a própria sidebar. Ele ganha data-tvx-pop e o CSS o fixa à direita
    // da sidebar — com !important, então o posicionador da Twitch não o devolve.
    function pinSidebarPopover(anchorTop, fromFoot, wrap) {
        const limitW = innerWidth * 0.7;
        const pin = (box) => {
            const h = box.getBoundingClientRect().height;
            const top = fromFoot ? innerHeight - h - 10 : Math.max(8, Math.min(anchorTop, innerHeight - h - 8));
            box.setAttribute("data-tvx-pop", "");
            box.style.setProperty("--tvx-pop-y", `${Math.round(top)}px`);
            return box;
        };
        // balão dentro do próprio item: o maior descendente que não contém o botão
        if (wrap) {
            const ctl = wrap.querySelector("[data-tvx-navctl]");
            const boxes = [...wrap.querySelectorAll("*")].filter((e) => {
                if (ctl && (e === ctl || e.contains(ctl) || ctl.contains(e))) return false;
                const r = e.getBoundingClientRect();
                return r.width > 150 && r.height > 60;
            });
            const outer = boxes.find((e) => !boxes.some((o) => o !== e && o.contains(e)));
            if (outer) return pin(outer);
        }
        const probeY = fromFoot ? innerHeight - 90 : Math.min(innerHeight - 20, anchorTop + 70);
        const side = document.querySelector(".side-nav");
        const ours = (e) => !!e.closest(".side-nav, #tvx-footer, #tvx-wordmark, #tvx-navlinks, [data-tvx-pop]") ||
            e.matches("[data-tvx-accountbar], [data-tvx-navitem], [data-tvx-footmore]") ||
            !!e.querySelector("[data-tvx-navctl], [data-a-target='user-menu-toggle']") ||
            (side && (e.contains(side) || e.contains(navLinksEl)));
        for (const x of [20, 120, 220]) {
            for (const hit of document.elementsFromPoint(x, probeY)) {
                if (hit === document.documentElement || hit === document.body || ours(hit)) continue;
                const r0 = hit.getBoundingClientRect();
                if (r0.width < 200 || r0.width > limitW || r0.height < 100) continue;
                let box = hit;
                for (let p = box.parentElement; p && p !== document.body; p = p.parentElement) {
                    if (ours(p)) break;
                    const r = p.getBoundingClientRect();
                    if (r.width > limitW || r.height < box.getBoundingClientRect().height - 2) break;
                    box = p;
                }
                return pin(box);
            }
        }
        return null;
    }
    // o balão demora alguns quadros pra montar: tenta por ~1s depois do clique
    function pinSidebarPopoverSoon(anchorTop, fromFoot, onPin, wrap) {
        const t0 = performance.now();
        const tick = () => {
            const box = pinSidebarPopover(anchorTop, fromFoot, wrap);
            if (box) { if (onPin) onPin(box); return; }
            if (performance.now() - t0 > 1200) return;
            requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
    }

    // ---- propaganda da barra superior -------------------------------------
    // Casamos por data-a-target E por rótulo, porque parte dos itens promocionais não tem
    // atributo nenhum ("Try 1-Month Ad-Free" é só um <button> com texto). E escondemos o BLOCO,
    // não o botão: o de Bits divide o wrapper com o pontinho de "novidade", que sobrava sozinho.
    const AD_TARGETS = new Set(["prime-offers-icon", "top-nav-get-bits-button"]);
    const AD_TEXT = /(ad[-\s]?free|sem an[úu]ncios|1-month|turbo|prime|bits)/i;
    const KEEP_TARGETS = new Set([
        "home-link", "browse-link", "nav-search-box", "tray-search-input", "user-menu-toggle",
        "top-nav-avatar", "whisper-box-button", "threads-box-closed", "ellipsis-button",
        "login-button", "signup-button",
    ]);

    function hideTopNavAds() {
        const nav = document.querySelector('.top-nav, [data-a-target="top-nav-container"]');
        if (!nav) return;
        for (const ctl of nav.querySelectorAll("button, a")) {
            if (ctl.dataset.tvxAd) continue;
            const target = ctl.getAttribute("data-a-target") || "";
            if (KEEP_TARGETS.has(target)) continue;
            const label = `${ctl.getAttribute("aria-label") || ""} ${ctl.textContent || ""}`;
            const href = ctl.getAttribute("href") || "";
            if (!(AD_TARGETS.has(target) || AD_TEXT.test(label) || /\/(turbo|prime|bits|subs)\b/.test(href))) continue;

            ctl.dataset.tvxAd = "1";
            // Sobe até o maior ancestral que ainda contém SÓ este controle. Nada de classe com
            // hash: elas mudam a cada build da Twitch.
            let wrap = ctl;
            for (let i = 0; i < 5; i++) {
                const p = wrap.parentElement;
                if (!p || p === nav || p.querySelectorAll("button, a").length > 1) break;
                wrap = p;
            }
            wrap.style.setProperty("display", "none", "important");
        }
    }

    // ---- player da live: só toca na aba Live -----------------------------
    // Fora dela o player continua montado (trocar de aba não reconecta a stream), mas pausado e
    // mutado — assistir a um clipe com a live berrando por baixo é o bug óbvio de deixá-lo vivo.
    let liveMuteBackup = null, livePausedByUs = false;

    // Plural de propósito: a página do canal chega a montar dois players (o do carrossel da
    // home e o persistente). Pausar só o primeiro deixaria o outro tocando por baixo.
    function liveVideos() {
        const sel = '.persistent-player video, .channel-root__player video, [data-a-target="video-player"] video';
        // nosso <video> de clipe vive dentro do #tvx-panel — fora, por garantia
        return [...document.querySelectorAll(sel)].filter((v) => !panel || !panel.contains(v));
    }

    function applyLivePlayback() {
        const live = state.tab === "live";
        for (const v of liveVideos()) {
            try {
                if (live) {
                    if (livePausedByUs) {
                        if (liveMuteBackup !== null) v.muted = liveMuteBackup;
                        if (v.paused) v.play().catch(() => {});
                        livePausedByUs = false;
                        liveMuteBackup = null;
                    }
                } else {
                    if (liveMuteBackup === null) liveMuteBackup = v.muted;
                    v.muted = true;
                    if (!v.paused) {
                        v.pause();
                        livePausedByUs = true;
                    }
                }
            } catch { /* elemento do React: nunca deixar um player quebrar a navegação */ }
        }

        // nosso player de clipe/VOD também para ao sair da aba dele
        if (videoEl && state.tab !== "clips" && state.tab !== "videos") {
            try { if (!videoEl.paused) videoEl.pause(); } catch {}
        }
    }

    // ===================================================================== //
    //  Painel: player                                                       //
    // ===================================================================== //
    let panel, screenEl, underEl, videoEl, listEl, filtersEl, headEl, sentinel, searchInput;
    let listObserver = null, rendered = 0, filtered = [];
    let isDraggingScrubber = false, screenIdleTimer = null;
    const retried = new Set();

    function resetScreenIdle(video) {
        if (!screenEl) return;
        screenEl.dataset.idle = "0";
        if (screenIdleTimer) clearTimeout(screenIdleTimer);
        if (video && !video.paused) {
            screenIdleTimer = setTimeout(() => {
                if (video && !video.paused && !isDraggingScrubber) {
                    screenEl.dataset.idle = "1";
                }
            }, 2500);
        }
    }

    function toggleFullscreen() {
        if (document.fullscreenElement || document.webkitFullscreenElement) {
            if (document.exitFullscreen) document.exitFullscreen().catch(() => {});
            else if (document.webkitExitFullscreen) document.webkitExitFullscreen();
        } else {
            const target = screenEl || videoEl;
            if (target) {
                if (target.requestFullscreen) target.requestFullscreen().catch(() => {});
                else if (target.webkitRequestFullscreen) target.webkitRequestFullscreen();
            }
        }
    }

    function buildPanel() {
        if (panel) return panel;
        screenEl = el("div", { class: "tvx-screen" });
        underEl = el("div", { class: "tvx-under" });
        headEl = el("div", { class: "tvx-side-head" });
        filtersEl = el("div", { class: "tvx-filters" });
        listEl = el("div", { class: "tvx-list" });
        sentinel = el("div", { class: "tvx-sentinel" });

        panel = el("div", { id: "tvx-panel", "data-side": prefs.sidebarOpen ? "1" : "0" },
            el("div", { class: "tvx-stage" }, screenEl, underEl),
            el("aside", { class: "tvx-side" }, headEl, filtersEl, listEl),
        );
        document.body.appendChild(panel);

        listObserver = new IntersectionObserver((entries) => {
            if (entries.some((e) => e.isIntersecting)) renderMore();
        }, { root: listEl, rootMargin: "300px" });
        listObserver.observe(sentinel);

        document.addEventListener("keydown", onKeydown, true);

        screenEl.addEventListener("mousemove", () => resetScreenIdle(videoEl));
        screenEl.addEventListener("pointerdown", () => resetScreenIdle(videoEl));
        screenEl.addEventListener("mouseleave", () => {
            if (videoEl && !videoEl.paused && !isDraggingScrubber) {
                screenEl.dataset.idle = "1";
            }
        });

        document.addEventListener("fullscreenchange", () => {
            const isFs = !!(document.fullscreenElement || document.webkitFullscreenElement);
            for (const btn of document.querySelectorAll('.tvx-plc-btn[data-action="fullscreen"]')) {
                btn.innerHTML = svg(isFs ? ICON.fullscreenExit : ICON.fullscreen, 18);
                btn.title = isFs ? "Sair da tela cheia (F)" : "Tela cheia (F)";
            }
        });

        return panel;
    }

    function setSidebarOpen(open) {
        prefs.sidebarOpen = open; savePrefs();
        if (panel) panel.dataset.side = open ? "1" : "0";
        syncLayoutVars();
    }

    function openPanel(kind) {
        buildPanel();
        const login = state.route && state.route.login;
        if (!login) return;
        const poolKind = kind === "videos" ? "videos" : "clips";
        const pool = ensurePool(poolKind, login);
        if (state.pool !== pool) {
            if (state.pool) state.pool.listeners.delete(onPoolUpdate);
            state.pool = pool;
            state.filters = defaultFilters();
            state.current = null;
            pool.listeners.add(onPoolUpdate);
            buildHead();
            renderFilters();
            applyAndRender(true);
            renderScreen();
        }
        const params = new URLSearchParams(location.search);
        const clipOrId = params.get("clip") || params.get("id") || (state.route && state.route.clipSlug);
        if (poolKind === "clips" && clipOrId && !pool.items.some((i) => i.slug === clipOrId || String(i.id) === String(clipOrId))) {
            fetchSingleClip(clipOrId).then((clip) => {
                if (clip && (state.pool && state.pool.kind === "clips")) {
                    pool.add([clip]);
                    applyAndRender(false);
                    play(clip, { updateUrl: true });
                }
            });
        }
        onPoolUpdate(pool);
    }

    const onPoolUpdate = debounce((pool) => {
        if (pool !== state.pool) return;
        updateHead();
        renderFilters();
        applyAndRender(false);
        // primeira carga: já engata o primeiro item (ou o clipe/vídeo da URL / índice)
        if (!state.current && filtered.length) {
            const params = new URLSearchParams(location.search);
            const clipOrId = params.get("clip") || params.get("id") || (state.route && state.route.clipSlug);
            const indexStr = params.get("index");
            let wanted = null;

            if (clipOrId) {
                wanted = filtered.find((i) => i.slug === clipOrId || String(i.id) === String(clipOrId))
                    || pool.items.find((i) => i.slug === clipOrId || String(i.id) === String(clipOrId));
                if (!wanted && pool.kind === "clips") {
                    fetchSingleClip(clipOrId).then((clip) => {
                        if (clip && (state.pool && state.pool.kind === "clips")) {
                            pool.add([clip]);
                            applyAndRender(false);
                            play(clip, { updateUrl: true });
                        } else if (!state.current && filtered.length) {
                            play(filtered[0], { updateUrl: true });
                        }
                    });
                    return;
                }
            }
            if (!wanted && indexStr != null && indexStr !== "") {
                const rawIdx = parseInt(indexStr, 10);
                if (!isNaN(rawIdx)) {
                    const idx = (rawIdx >= 1 && rawIdx <= filtered.length) ? rawIdx - 1 : (rawIdx >= 0 && rawIdx < filtered.length ? rawIdx : 0);
                    wanted = filtered[idx];
                }
            }
            play(wanted || filtered[0], { updateUrl: true });
        }
    }, 120);

    async function play(item, { updateUrl = true } = {}) {
        if (!item) return;
        state.current = item;
        markCurrent();
        renderUnder();
        await renderScreen();
        prefetchNextToken();

        if (updateUrl) {
            try {
                const url = new URL(location.href);
                if (item.kind === "clip") {
                    url.searchParams.set("clip", item.slug);
                    url.searchParams.delete("id");
                } else {
                    url.searchParams.set("id", item.id);
                    url.searchParams.delete("clip");
                }
                url.searchParams.delete("index"); // o id/slug já identifica o item; posição muda com filtro
                history.replaceState(history.state, "", url.toString());
                lastHref = location.href;
            } catch { /* erro em URL não impede playback */ }
        }
    }

    function nextItem(delta = 1) {
        if (!state.current) return filtered[0] || null;
        const i = filtered.findIndex((x) => x.id === state.current.id);
        if (i < 0) return filtered[0] || null;
        return filtered[i + delta] || null;
    }

    function prefetchNextToken() {
        const n = nextItem(1);
        if (n && n.kind === "clip") fetchPlaybackToken(n.slug).catch(() => { /* prefetch é best-effort */ });
    }

    function pickQuality(item) {
        if (!item.qualities.length) return null;
        const want = String(prefs.quality);
        return item.qualities.find((v) => v.quality === want)
            || item.qualities.slice().sort((a, b) => (+b.quality) - (+a.quality))[0];
    }

    // Interruptor de autoplay no formato do YouTube: trilho + bolinha com um "play" dentro
    function autoplaySwitch() {
        const b = el("button", {
            class: "tvx-plc-btn tvx-autosw", type: "button", "aria-pressed": String(prefs.autoplay),
            title: "Autoplay: tocar o próximo ao terminar",
        }, el("span", { class: "tvx-sw" }, el("i", { html: svg(ICON.play, 10) })));
        b.addEventListener("click", () => {
            prefs.autoplay = !prefs.autoplay; savePrefs();
            b.setAttribute("aria-pressed", String(prefs.autoplay));
        });
        return b;
    }
    const plcPill = (...kids) => el("div", { class: "tvx-plc-pill" }, ...kids);

    async function renderScreen() {
        const item = state.current;
        screenEl.textContent = "";
        videoEl = null;
        if (screenIdleTimer) clearTimeout(screenIdleTimer);

        if (!item) {
            screenEl.append(el("div", { class: "tvx-empty" }, state.pool && state.pool.loading ? "Carregando…" : "Nada aqui com esses filtros."));
            return;
        }

        if (item.kind === "video") {
            const tOffset = item.initialTime || item.vodOffset;
            const timeParam = tOffset ? `&time=${formatTwitchTimestamp(tOffset)}` : "";
            const iframe = el("iframe", {
                src: `https://player.twitch.tv/?video=${encodeURIComponent(item.id)}&parent=${location.hostname}&autoplay=true&muted=${prefs.muted}${timeParam}`,
                allowfullscreen: "true", allow: "autoplay; fullscreen; picture-in-picture",
            });

            const prevBtn = el("button", { class: "tvx-plc-btn", type: "button", title: "Anterior (P)", html: svg(ICON.prev, 20) });
            prevBtn.disabled = !nextItem(-1);
            prevBtn.addEventListener("click", () => play(nextItem(-1)));

            const nextBtn = el("button", { class: "tvx-plc-btn", type: "button", title: "Próximo (N)", html: svg(ICON.next, 20) });
            nextBtn.disabled = !nextItem(1);
            nextBtn.addEventListener("click", () => play(nextItem(1)));

            const autoBtn = autoplaySwitch();

            const fsBtn = el("button", { class: "tvx-plc-btn", type: "button", "data-action": "fullscreen", title: "Tela cheia (F)", html: svg(ICON.fullscreen, 20) });
            fsBtn.addEventListener("click", () => {
                if (document.fullscreenElement || document.webkitFullscreenElement) {
                    if (document.exitFullscreen) document.exitFullscreen().catch(() => {});
                    else if (document.webkitExitFullscreen) document.webkitExitFullscreen();
                } else {
                    if (iframe.requestFullscreen) iframe.requestFullscreen().catch(() => {});
                    else if (iframe.webkitRequestFullscreen) iframe.webkitRequestFullscreen();
                    else if (screenEl.requestFullscreen) screenEl.requestFullscreen().catch(() => {});
                }
            });

            const vodBar = el("div", { class: "tvx-vod-bar" },
                el("div", { class: "tvx-plc-left" }, plcPill(prevBtn, nextBtn)),
                el("div", { class: "tvx-plc-right" }, plcPill(autoBtn, fsBtn))
            );

            screenEl.append(iframe, vodBar);
            return;
        }

        const spin = el("div", { class: "tvx-empty" }, el("div", { class: "tvx-spinner" }), "Preparando o clipe…");
        screenEl.append(spin);

        let src = null, err = null;
        try {
            const quality = pickQuality(item);
            const token = await fetchPlaybackToken(item.slug);
            src = signedURL(quality && quality.url, token);
        } catch (e) { err = e.message || String(e); }

        if (state.current !== item) return; // usuário trocou de clipe enquanto buscávamos
        screenEl.textContent = "";
        if (!src) {
            screenEl.append(el("div", { class: "tvx-empty" },
                el("div", {}, "Não consegui montar o MP4 deste clipe."),
                err ? el("div", { style: { marginTop: "6px", opacity: ".7", fontSize: "12px" } }, err) : null,
                el("div", { style: { marginTop: "12px" } },
                    el("a", { class: "tvx-btn", href: `https://www.twitch.tv/${state.route.login}/clip/${item.slug}`, target: "_blank", rel: "noopener" },
                        "Abrir na Twitch")),
            ));
            return;
        }

        const video = el("video", { autoplay: "", playsinline: "", preload: "auto", src });
        videoEl = video;
        video.volume = prefs.volume;
        video.muted = prefs.muted;
        video.playbackRate = prefs.speed;
        video.loop = !!prefs.loop;

        // Video Host
        const host = el("div", { class: "tvx-video-host" }, video);

        // Central Flash / Big Play Button
        const flashIcon = el("span", { class: "tvx-plc-flash-icon", html: svg(ICON.play, 32) });
        const flashBtn = el("button", { class: "tvx-plc-flash", type: "button", "aria-label": "Play / Pause" }, flashIcon);
        flashBtn.addEventListener("click", (e) => {
            e.stopPropagation();
            if (video.paused) video.play().catch(() => {}); else video.pause();
        });

        let clickTimer = null;
        host.addEventListener("click", (e) => {
            if (e.target.closest(".tvx-plc-bottom, .tvx-plc-flash")) return;
            if (clickTimer) {
                clearTimeout(clickTimer);
                clickTimer = null;
                toggleFullscreen();
            } else {
                clickTimer = setTimeout(() => {
                    clickTimer = null;
                    if (video.paused) video.play().catch(() => {}); else video.pause();
                }, 220);
            }
        });

        // Scrubber / Progress Bar
        const track = el("div", { class: "tvx-plc-track" });
        const bufFill = el("div", { class: "tvx-plc-buf" });
        const progFill = el("div", { class: "tvx-plc-fill" });
        const knob = el("div", { class: "tvx-plc-knob" });
        const tooltip = el("div", { class: "tvx-plc-tooltip" });
        track.append(bufFill, progFill);
        const prog = el("div", { class: "tvx-plc-prog" }, track, knob, tooltip);

        function getProgPercent(e) {
            const rect = prog.getBoundingClientRect();
            const clientX = e.clientX ?? (e.touches && e.touches[0] ? e.touches[0].clientX : 0);
            const x = Math.max(0, Math.min(clientX - rect.left, rect.width));
            return rect.width ? (x / rect.width) : 0;
        }

        function setProgUI(pct) {
            const p = Math.max(0, Math.min(1, pct)) * 100;
            progFill.style.width = `${p}%`;
            knob.style.left = `${p}%`;
        }

        prog.addEventListener("pointerdown", (e) => {
            if (e.button !== 0) return;
            isDraggingScrubber = true;
            prog.classList.add("is-dragging");
            try { prog.setPointerCapture(e.pointerId); } catch {}
            const pct = getProgPercent(e);
            setProgUI(pct);
            if (video.duration) video.currentTime = pct * video.duration;
            e.preventDefault();
            e.stopPropagation();
        });

        prog.addEventListener("pointermove", (e) => {
            const pct = getProgPercent(e);
            if (video.duration) {
                tooltip.textContent = fmtDur(pct * video.duration);
                const rect = prog.getBoundingClientRect();
                const clientX = Math.max(0, Math.min(e.clientX - rect.left, rect.width));
                tooltip.style.left = `${clientX}px`;
                tooltip.style.display = "block";
            }
            if (isDraggingScrubber) {
                setProgUI(pct);
                if (video.duration) video.currentTime = pct * video.duration;
            }
        });

        prog.addEventListener("pointerup", (e) => {
            if (isDraggingScrubber) {
                isDraggingScrubber = false;
                prog.classList.remove("is-dragging");
                try { prog.releasePointerCapture(e.pointerId); } catch {}
                const pct = getProgPercent(e);
                if (video.duration) video.currentTime = pct * video.duration;
                resetScreenIdle(video);
            }
        });

        prog.addEventListener("pointercancel", (e) => {
            isDraggingScrubber = false;
            prog.classList.remove("is-dragging");
            try { prog.releasePointerCapture(e.pointerId); } catch {}
        });

        prog.addEventListener("pointerleave", () => {
            tooltip.style.display = "none";
        });

        // Left Controls: Play/Pause (22px) | Anterior (20px) | Próximo (20px) | Volume + Slider (20px) | Tempo | Badge
        const playBtn = el("button", { class: "tvx-plc-btn tvx-plc-play", type: "button", title: "Play/Pause (Space/K)", html: svg(ICON.play, 24) });
        playBtn.addEventListener("click", () => {
            if (video.paused) video.play().catch(() => {}); else video.pause();
        });

        const prevBtn = el("button", { class: "tvx-plc-btn", type: "button", title: "Anterior (P)", html: svg(ICON.prev, 20) });
        prevBtn.disabled = !nextItem(-1);
        prevBtn.addEventListener("click", () => play(nextItem(-1)));

        const nextBtn = el("button", { class: "tvx-plc-btn", type: "button", title: "Próximo (N)", html: svg(ICON.next, 20) });
        nextBtn.disabled = !nextItem(1);
        nextBtn.addEventListener("click", () => play(nextItem(1)));

        const volBtn = el("button", { class: "tvx-plc-btn", type: "button", title: "Mudo (M)", html: svg(ICON.volumeHigh, 20) });
        const volSlider = el("input", {
            class: "tvx-plc-vol-slider", type: "range", min: "0", max: "1", step: "0.02",
            value: String(prefs.muted ? 0 : prefs.volume), title: "Volume",
        });
        const volWrap = el("div", { class: "tvx-plc-vol-wrap" }, volBtn, volSlider);

        function updateVolUI() {
            const isM = video.muted || video.volume === 0;
            const v = video.volume;
            if (isM) {
                volBtn.innerHTML = svg(ICON.volumeMute, 20);
                volSlider.value = "0";
                volBtn.title = "Desmutar (M)";
            } else if (v < 0.5) {
                volBtn.innerHTML = svg(ICON.volumeMed, 20);
                volSlider.value = String(v);
                volBtn.title = "Mutar (M)";
            } else {
                volBtn.innerHTML = svg(ICON.volumeHigh, 20);
                volSlider.value = String(v);
                volBtn.title = "Mutar (M)";
            }
        }

        volBtn.addEventListener("click", () => {
            if (video.muted || video.volume === 0) {
                video.muted = false;
                if (video.volume === 0) video.volume = 0.5;
            } else {
                video.muted = true;
            }
            prefs.volume = video.volume;
            prefs.muted = video.muted;
            savePrefs();
            updateVolUI();
        });

        volSlider.addEventListener("input", () => {
            const val = parseFloat(volSlider.value);
            video.volume = val;
            video.muted = val === 0;
            prefs.volume = val;
            prefs.muted = video.muted;
            savePrefs();
            updateVolUI();
        });

        const timeEl = el("span", { class: "tvx-plc-time" }, "0:00 / 0:00");

        // grupos em pílulas translúcidas, como o player do YouTube
        const leftGroup = el("div", { class: "tvx-plc-left" },
            el("div", { class: "tvx-plc-pill tvx-plc-round" }, playBtn),
            plcPill(prevBtn, nextBtn),
            plcPill(volWrap, timeEl),
        );

        // Right Controls: Qualidade | Velocidade | Loop (20px) | Autoplay (toggle) | Download (20px) | Fullscreen (20px)
        const rightGroup = el("div", { class: "tvx-plc-right" });

        // Qualidade e velocidade num painel só, aberto pela engrenagem (que mostra a qualidade)
        const dial = el("div", { class: "tvx-dial", hidden: "" });
        const gearBadge = el("span", { class: "tvx-gear-badge" });
        const gearBtn = el("button", { class: "tvx-plc-btn tvx-gear", type: "button", title: "Configurações", html: svg(ICON.gear, 22) }, gearBadge);
        const setDial = (open) => {
            dial.hidden = !open;
            gearBtn.setAttribute("aria-expanded", String(open));
            screenEl.dataset.menu = open ? "1" : "0";
        };
        gearBtn.addEventListener("click", (e) => { e.stopPropagation(); setDial(dial.hidden); });
        screenEl.addEventListener("mousedown", (e) => {
            if (!dial.hidden && !dial.contains(e.target) && !gearBtn.contains(e.target)) setDial(false);
        });
        const changeQuality = (q) => {
            prefs.quality = q; savePrefs();
            const t = video.currentTime, wasPaused = video.paused;
            renderScreen().then(() => {
                if (videoEl) { videoEl.currentTime = t; if (!wasPaused) videoEl.play().catch(() => {}); }
            });
        };
        const current = (pickQuality(item) || {}).quality;
        if (current) gearBadge.textContent = +current >= 1080 ? "HD" : `${current}p`;
        if (item.qualities && item.qualities.length) {
            const list = el("div", { class: "tvx-dial-opts" });
            for (const v of item.qualities.slice().sort((a, b) => (+b.quality) - (+a.quality))) {
                const o = el("button", { class: "tvx-dial-opt", type: "button", "aria-pressed": String(v.quality === current) },
                    `${v.quality}p`, v.fps && Math.round(v.fps) > 30 ? el("small", {}, `${Math.round(v.fps)}`) : null);
                o.addEventListener("click", () => { setDial(false); if (v.quality !== current) changeQuality(v.quality); });
                list.append(o);
            }
            dial.append(el("div", { class: "tvx-dial-sec" }, el("div", { class: "tvx-dial-h" }, "Qualidade"), list));
        }
        const speeds = el("div", { class: "tvx-dial-speeds" });
        for (const r of [0.25, 0.5, 0.75, 1, 1.25, 1.5, 2]) {
            const o = el("button", { class: "tvx-dial-chip", type: "button", "aria-pressed": String(r === prefs.speed) }, r === 1 ? "Normal" : `${r}×`);
            o.addEventListener("click", () => {
                prefs.speed = r; savePrefs();
                if (videoEl) videoEl.playbackRate = r;
                for (const x of speeds.children) x.setAttribute("aria-pressed", String(x === o));
            });
            speeds.append(o);
        }
        dial.append(el("div", { class: "tvx-dial-sec" }, el("div", { class: "tvx-dial-h" }, "Velocidade"), speeds));

        const loopBtn = el("button", {
            class: "tvx-plc-btn", type: "button", "data-action": "loop",
            "aria-pressed": String(prefs.loop),
            title: prefs.loop ? "Desativar repetição (Shift+L ou R)" : "Repetir (Shift+L ou R)",
            html: svg(ICON.loop, 22) + '<span class="tvx-on">ON</span>',
        });
        loopBtn.addEventListener("click", () => {
            prefs.loop = !prefs.loop; savePrefs();
            if (video) video.loop = !!prefs.loop;
            loopBtn.setAttribute("aria-pressed", String(prefs.loop));
            loopBtn.title = prefs.loop ? "Desativar repetição (Shift+L ou R)" : "Repetir (Shift+L ou R)";
        });
        rightGroup.append(loopBtn);

        rightGroup.append(autoplaySwitch());

        if (item.qualities && item.qualities.length) {
            const dl = el("button", { class: "tvx-plc-btn", type: "button", title: "Baixar clipe", html: svg(ICON.dl, 22) });
            dl.addEventListener("click", async (e) => {
                e.preventDefault();
                const token = await fetchPlaybackToken(item.slug).catch(() => null);
                const chosen = pickQuality(item);
                const url = signedURL(chosen && chosen.url, token);
                if (url) {
                    const a = document.createElement("a");
                    a.href = url;
                    a.download = `${item.slug}.mp4`;
                    a.target = "_blank";
                    a.rel = "noopener";
                    document.body.appendChild(a);
                    a.click();
                    a.remove();
                }
            });
            rightGroup.append(dl);
        }

        const fsBtn = el("button", { class: "tvx-plc-btn", type: "button", "data-action": "fullscreen", title: "Tela cheia (F)", html: svg(ICON.fullscreen, 22) });
        fsBtn.addEventListener("click", toggleFullscreen);
        rightGroup.append(gearBtn, fsBtn);

        const controlsRow = el("div", { class: "tvx-plc-row" }, leftGroup, el("div", { class: "tvx-plc-right" }, plcPill(...rightGroup.childNodes)));
        const bottomBar = el("div", { class: "tvx-plc-bottom" }, prog, controlsRow, dial);

        screenEl.append(host, flashBtn, bottomBar);

        // Video Event Listeners
        video.addEventListener("play", () => {
            screenEl.dataset.paused = "0";
            screenEl.classList.add("is-playing");
            flashIcon.innerHTML = svg(ICON.play, 32);
            playBtn.innerHTML = svg(ICON.pause, 22);
            resetScreenIdle(video);
        });

        video.addEventListener("pause", () => {
            screenEl.dataset.paused = "1";
            screenEl.classList.remove("is-playing");
            flashIcon.innerHTML = svg(ICON.play, 32);
            playBtn.innerHTML = svg(ICON.play, 22);
            resetScreenIdle(video);
        });

        video.addEventListener("timeupdate", () => {
            if (!isDraggingScrubber && video.duration) {
                setProgUI(video.currentTime / video.duration);
            }
            timeEl.textContent = `${fmtDur(video.currentTime)} / ${fmtDur(video.duration || 0)}`;
            if (video.buffered && video.buffered.length && video.duration) {
                try {
                    const end = video.buffered.end(video.buffered.length - 1);
                    bufFill.style.width = `${Math.min(1, end / video.duration) * 100}%`;
                } catch {}
            }
        });

        video.addEventListener("loadedmetadata", () => {
            timeEl.textContent = `${fmtDur(video.currentTime)} / ${fmtDur(video.duration || 0)}`;
        });

        video.addEventListener("volumechange", () => {
            prefs.volume = video.volume;
            prefs.muted = video.muted;
            savePrefs();
            updateVolUI();
        });

        video.addEventListener("ended", () => {
            if (prefs.loop) return;
            if (!prefs.autoplay) return;
            const n = nextItem(1);
            if (n) play(n);
        });

        video.addEventListener("error", () => {
            if (retried.has(item.id)) return;
            retried.add(item.id);
            tokenCache.delete(item.slug);
            renderScreen();
        });

        screenEl.dataset.paused = video.paused ? "1" : "0";
        if (video.paused) screenEl.classList.remove("is-playing"); else screenEl.classList.add("is-playing");
        screenEl.dataset.idle = "0";
        updateVolUI();
        resetScreenIdle(video);
    }

    function renderPlayerBar() {}

    function renderUnder() {
        const item = state.current;
        underEl.textContent = "";
        if (!item) return;
        const login = state.route.login;
        const clipURL = `https://www.twitch.tv/${login}/clip/${item.slug}`;
        const itemUrl = item.kind === "clip" ? clipURL : `https://www.twitch.tv/videos/${item.id}`;

        const titleEl = el("h1", { title: item.title }, item.title);
        const actions = el("div", { class: "tvx-under-actions" });

        if (item.kind === "clip" && item.vodId) {
            const vodUrl = `https://www.twitch.tv/videos/${item.vodId}?t=${formatTwitchTimestamp(item.vodOffset)}`;
            const vodBtn = el("a", {
                class: "tvx-share-btn tvx-vod-btn",
                href: vodUrl,
                title: `Assistir à transmissão completa a partir de ${fmtDur(item.vodOffset)}`,
                style: { display: "none" },
                html: `${svg(ICON.vod, 18)}<span>Ir para a stream (${fmtDur(item.vodOffset)})</span>`,
            });
            vodBtn.addEventListener("click", (e) => {
                try {
                    sessionStorage.setItem("tvx:vod_target", JSON.stringify({
                        vodId: String(item.vodId),
                        offset: item.vodOffset,
                        time: Date.now(),
                    }));
                } catch {}
                if (!e.ctrlKey && !e.metaKey && !e.shiftKey && e.button === 0) {
                    enforceNativeVodSeek(item.vodOffset);
                }
            });
            actions.append(vodBtn);

            isVodAvailable(item.vodId).then((ok) => {
                if (ok && state.current === item) {
                    vodBtn.style.display = "inline-flex";
                }
            });
        }

        const shareBtn = el("button", {
            class: "tvx-share-btn",
            type: "button",
            title: "Copiar link",
            html: `${svg(ICON.share || ICON.link, 18)}<span>Compartilhar</span>`,
        });
        shareBtn.addEventListener("click", async () => {
            try {
                await navigator.clipboard.writeText(itemUrl);
                const s = shareBtn.querySelector("span");
                if (s) s.textContent = "Copiado!";
                shareBtn.style.borderColor = "var(--tvx-accent)";
                shareBtn.style.color = "var(--tvx-accent)";
            } catch {
                const s = shareBtn.querySelector("span");
                if (s) s.textContent = "Erro ao copiar";
            }
            setTimeout(() => {
                const s = shareBtn.querySelector("span");
                if (s) s.textContent = "Compartilhar";
                shareBtn.style.borderColor = "";
                shareBtn.style.color = "";
            }, 1600);
        });
        actions.append(shareBtn);

        const header = el("div", { class: "tvx-under-header" }, titleEl, actions);
        underEl.append(header);

        const facts = el("div", { class: "tvx-facts" },
            el("span", { class: "tvx-fact" }, el("b", {}, nfFull.format(item.views)), "views"),
            el("span", { class: "tvx-fact", title: dtLong.format(new Date(item.createdAt)) }, ago(item.createdAt)),
            el("span", { class: "tvx-fact" }, fmtDur(item.duration)),
            item.game ? el("span", { class: "tvx-fact" },
                item.gameArt ? el("img", { src: boxArt(item.gameArt, 40, 54), alt: "" }) : null, item.game) : null,
            item.kind === "clip" && item.curator !== "—"
                ? el("span", { class: "tvx-fact" }, "clipado por ", el("b", {}, item.curator)) : null,
            item.kind === "video" ? el("span", { class: "tvx-fact" }, item.curator) : null,
            item.language ? el("span", { class: "tvx-fact" }, item.language) : null,
            item.featured ? el("span", { class: "tvx-fact" }, "★ destaque") : null,
        );
        underEl.append(facts);
    }

    function onKeydown(e) {
        if (state.tab !== "clips" && state.tab !== "videos") return;
        const t = e.target;
        if (t && (t.tagName === "INPUT" || t.tagName === "SELECT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
        const v = videoEl;
        const jump = (d) => { if (v && v.duration) { v.currentTime = Math.max(0, Math.min(v.duration, v.currentTime + d)); e.preventDefault(); } };
        switch (e.key.toLowerCase()) {
            case " ": case "k": if (v) { v.paused ? v.play().catch(() => {}) : v.pause(); e.preventDefault(); } break;
            case "arrowright": jump(5); break;
            case "arrowleft": jump(-5); break;
            case "l":
                if (e.shiftKey) {
                    prefs.loop = !prefs.loop;
                    savePrefs();
                    if (v) v.loop = !!prefs.loop;
                    const lb = document.querySelector('.tvx-plc-btn[data-action="loop"]');
                    if (lb) {
                        lb.setAttribute("aria-pressed", String(prefs.loop));
                        lb.title = prefs.loop ? "Desativar repetição (Shift+L ou R)" : "Repetir (Shift+L ou R)";
                    }
                    e.preventDefault();
                } else {
                    jump(10);
                }
                break;
            case "j": jump(-10); break;
            case "r": {
                prefs.loop = !prefs.loop;
                savePrefs();
                if (v) v.loop = !!prefs.loop;
                const lb = document.querySelector('.tvx-plc-btn[data-action="loop"]');
                if (lb) {
                    lb.setAttribute("aria-pressed", String(prefs.loop));
                    lb.title = prefs.loop ? "Desativar repetição (Shift+L ou R)" : "Repetir (Shift+L ou R)";
                }
                e.preventDefault();
                break;
            }
            case "n": { const n = nextItem(1); if (n) { play(n); e.preventDefault(); } break; }
            case "p": { const n = nextItem(-1); if (n) { play(n); e.preventDefault(); } break; }
            case "m":
                if (v) {
                    v.muted = !v.muted;
                    prefs.muted = v.muted;
                    savePrefs();
                    e.preventDefault();
                }
                break;
            case "f": toggleFullscreen(); e.preventDefault(); break;
            case "arrowup":
                if (v) {
                    v.muted = false;
                    v.volume = Math.min(1, Math.round((v.volume + 0.05) * 100) / 100);
                    prefs.volume = v.volume;
                    prefs.muted = false;
                    savePrefs();
                    e.preventDefault();
                }
                break;
            case "arrowdown":
                if (v) {
                    v.volume = Math.max(0, Math.round((v.volume - 0.05) * 100) / 100);
                    if (v.volume === 0) v.muted = true;
                    prefs.volume = v.volume;
                    prefs.muted = v.muted;
                    savePrefs();
                    e.preventDefault();
                }
                break;
            case "/": if (searchInput) { searchInput.focus(); searchInput.select(); e.preventDefault(); } break;
            default:
                if (v && e.key >= "0" && e.key <= "9" && v.duration) {
                    v.currentTime = (parseInt(e.key, 10) / 10) * v.duration; e.preventDefault();
                }
        }
    }

    // ===================================================================== //
    //  Painel: filtros                                                      //
    // ===================================================================== //
    const PRESETS = [
        { key: "", label: "Tudo", days: 0 },
        { key: "24h", label: "24 h", days: 1 },
        { key: "7d", label: "7 dias", days: 7 },
        { key: "30d", label: "30 dias", days: 30 },
        { key: "90d", label: "90 dias", days: 90 },
        { key: "365d", label: "1 ano", days: 365 },
    ];
    const SORTS = [
        ["views-desc", "Mais vistos"], ["views-asc", "Menos vistos"],
        ["date-desc", "Mais recentes"], ["date-asc", "Mais antigos"],
        ["dur-desc", "Mais longos"], ["dur-asc", "Mais curtos"],
        ["title-asc", "Título (A–Z)"],
    ];

    // Aplica todos os critérios menos um — é assim que as contagens das facetas ficam úteis
    // (mostrar "0" no que você acabou de marcar seria inútil).
    function matches(item, f, skip) {
        if (skip !== "text" && f.text) {
            const n = norm(f.text);
            const hay = `${norm(item.title)} ${norm(item.curator)} ${norm(item.game)}`;
            if (!n.split(/\s+/).filter(Boolean).every((w) => hay.includes(w))) return false;
        }
        if (skip !== "date") {
            if (f.from && item.ts < new Date(`${f.from}T00:00:00`).getTime()) return false;
            if (f.to && item.ts > new Date(`${f.to}T23:59:59`).getTime()) return false;
        }
        if (skip !== "views") {
            if (f.minViews !== "" && item.views < +f.minViews) return false;
            if (f.maxViews !== "" && item.views > +f.maxViews) return false;
        }
        if (skip !== "dur") {
            if (f.minDur !== "" && item.duration < +f.minDur) return false;
            if (f.maxDur !== "" && item.duration > +f.maxDur) return false;
        }
        if (skip !== "curator" && f.curators.size && !f.curators.has(item.curator)) return false;
        if (skip !== "game" && f.games.size && !f.games.has(item.game || "—")) return false;
        if (skip !== "lang" && f.langs.size && !f.langs.has(item.language || "—")) return false;
        // VOD: a faceta usa o rótulo legível (Transmissão/Destaque/Upload), que é o mesmo campo
        // exibido no card — chavear pelo enum cru mostraria "ARCHIVE" na interface.
        if (skip !== "type" && f.types.size && !f.types.has(item.curator)) return false;
        if (skip !== "featured" && f.featuredOnly && !item.featured) return false;
        if (skip !== "vod" && f.vod && String(item.vodId || "") !== f.vod) return false;
        return true;
    }

    function facetCounts(items, f, facet, keyOf) {
        const map = new Map();
        for (const it of items) {
            if (!matches(it, f, facet)) continue;
            const k = keyOf(it);
            map.set(k, (map.get(k) || 0) + 1);
        }
        return [...map.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
    }

    const SORTERS = {
        "views-desc": (a, b) => b.views - a.views || b.ts - a.ts,
        "views-asc": (a, b) => a.views - b.views || b.ts - a.ts,
        "date-desc": (a, b) => b.ts - a.ts,
        "date-asc": (a, b) => a.ts - b.ts,
        "dur-desc": (a, b) => b.duration - a.duration,
        "dur-asc": (a, b) => a.duration - b.duration,
        "title-asc": (a, b) => a.title.localeCompare(b.title, "pt-BR"),
    };

    function applyAndRender(resetScroll) {
        const pool = state.pool, f = state.filters;
        if (!pool || !f) return;
        filtered = pool.items.filter((it) => matches(it, f, null)).sort(SORTERS[f.sort] || SORTERS["views-desc"]);
        // chegou lote novo no meio do scroll: redesenha a mesma quantidade, senão a lista
        // encolhe e o scroll volta pro começo
        const keep = resetScroll ? 0 : rendered;
        const top = listEl.scrollTop;
        rendered = 0;
        listEl.textContent = "";
        listEl.append(sentinel);
        renderMore(Math.max(40, keep));
        listEl.scrollTop = resetScroll ? 0 : top;
        updateHead();
        renderPlayerBar();
    }

    function renderMore(count = 40) {
        if (!filtered.length) {
            if (!rendered && !listEl.querySelector(".tvx-note")) {
                listEl.insertBefore(el("div", { class: "tvx-note" },
                    state.pool && state.pool.loading ? "Carregando…" : "Nenhum item bate com os filtros."), sentinel);
            }
            return;
        }
        const stop = Math.min(filtered.length, rendered + count);
        const frag = document.createDocumentFragment();
        for (; rendered < stop; rendered++) frag.append(itemRow(filtered[rendered]));
        listEl.insertBefore(frag, sentinel);
    }

    function itemRow(item) {
        const row = el("div", {
            class: "tvx-item", "data-id": item.id, title: item.title,
            "aria-current": String(!!(state.current && state.current.id === item.id)),
        },
            el("div", { class: "tvx-thumb" },
                el("img", { src: item.thumb || "", alt: "", loading: "lazy" }),
                el("b", {}, fmtDur(item.duration)),
                item.featured ? el("span", { class: "tvx-star" }, "★") : null,
            ),
            el("div", { class: "tvx-itxt" },
                el("strong", {}, item.title),
                el("small", { title: dtLong.format(new Date(item.createdAt)) },
                    `${fmtViews(item.views)} views · ${ago(item.createdAt)}`),
                el("small", {}, item.kind === "clip" ? `por ${item.curator}` : item.curator),
                item.game ? el("small", {}, item.game) : null,
            ),
        );
        row.addEventListener("click", () => play(item));
        return row;
    }

    function markCurrent() {
        for (const row of listEl.querySelectorAll(".tvx-item")) {
            const on = !!(state.current && row.dataset.id === state.current.id);
            row.setAttribute("aria-current", String(on));
            if (on) row.scrollIntoView({ block: "nearest" });
        }
    }

    // O cabeçalho é montado UMA vez por pool. Reconstruí-lo a cada tecla tirava o foco do campo
    // de busca no meio da digitação — updateHead() só mexe nos números e nos avisos.
    let countEl, statusEl, toolbarEl;
    let filtersOpen = false; // o painel "Filtros" (o resto além de ordem e período)
    let chipsScroll = 0;

    function buildHead() {
        const pool = state.pool, f = state.filters;
        if (!pool || !headEl) return;
        headEl.textContent = "";

        countEl = el("span", { class: "tvx-side-badge" });
        // mesmo botão (e mesmo lugar) que o de recolher o chat
        const closeSide = el("button", {
            class: "tvx-sideclose", type: "button", title: "Esconder a lista",
            "aria-label": "Esconder a lista", html: svg(ICON.collapseRight, 20),
        });
        closeSide.addEventListener("click", () => setSidebarOpen(false));
        headEl.append(el("div", { class: "tvx-side-title" },
            closeSide, el("b", {}, pool.kind === "clips" ? "Clipes" : "Vídeos"), countEl));

        searchInput = el("input", { type: "search", placeholder: "Buscar título, autor, categoria…  (/)", value: f.text });
        searchInput.addEventListener("input", debounce(() => {
            state.filters.text = searchInput.value; applyAndRender(true); renderFilters();
        }, 220));
        const clear = el("button", { class: "tvx-sx", type: "button", html: svg(ICON.close, 14), title: "Limpar busca e filtros" });
        clear.addEventListener("click", () => {
            state.filters = defaultFilters();
            searchInput.value = "";
            applyAndRender(true); renderFilters();
        });
        toolbarEl = el("div", { class: "tvx-toolbar" });
        statusEl = el("div", {});
        headEl.append(el("div", { class: "tvx-side-tools" },
            el("div", { class: "tvx-search" }, el("span", { class: "tvx-si", html: svg(ICON.search, 16) }), searchInput, clear),
            toolbarEl, statusEl));
        updateHead();
    }

    function updateHead() {
        const pool = state.pool;
        if (!pool || !countEl || !statusEl) return;
        countEl.hidden = true;
        statusEl.textContent = "";
        // clipes carregam sob demanda: "loading" dura a sessão toda; a barra é só da busca em curso
        if (pool.kind === "clips" ? pool.fetching : pool.loading) statusEl.append(el("div", { class: "tvx-progress" }, el("i", {})));
        else if (pool.partial && pool.kind !== "clips") {
            statusEl.append(el("div", { class: "tvx-partial-card" },
                pool.kind === "clips" ? "" : "Lista parcial — a Twitch exige uma credencial de integridade pra paginar. Recarregue a página com esta aba aberta pro script capturá-la e puxar o resto."));
        }
        if (pool.error) statusEl.append(el("div", { class: "tvx-partial-card", style: { borderColor: "rgba(235,4,0,0.4)", background: "rgba(235,4,0,0.1)" } }, `Erro: ${pool.error}`));
    }

    function group(title, count, open, ...body) {
        const d = el("details", { class: "tvx-fgroup" });
        if (open) d.setAttribute("open", "");
        d.append(el("summary", {}, el("span", {}, title), count ? el("span", { class: "tvx-badge" }, String(count)) : null));
        d.append(el("div", { class: "tvx-fbody" }, ...body));
        return d;
    }

    const facetQueries = {}; // busca de cada faceta: sobrevive ao redesenho da gaveta

    function facetList(items, f, facet, keyOf, selection) {
        const box = el("div", { class: "tvx-facet" });
        // marcados sempre no topo; o resto segue por contagem
        const counts = facetCounts(items, f, facet, keyOf)
            .sort((a, b) => (selection.has(b[0]) - selection.has(a[0])));
        const q = el("input", { class: "tvx-in tvx-facet-q", type: "search", placeholder: "Buscar…", value: facetQueries[facet] || "" });
        const draw = () => {
            const term = (facetQueries[facet] || "").trim().toLowerCase();
            box.textContent = "";
            const shown = term ? counts.filter(([key]) => selection.has(key) || String(key || "").toLowerCase().includes(term)) : counts;
            if (!shown.length) box.append(el("div", { class: "tvx-note", style: { padding: "4px 0", fontSize: "12px" } }, "Nada encontrado."));
            for (const [key, n] of shown.slice(0, 400)) box.append(facetItem(key, n));
        };
        q.addEventListener("input", () => { facetQueries[facet] = q.value; draw(); });
        const facetItem = (key, n) => {
            const cb = el("input", { type: "checkbox" });
            cb.checked = selection.has(key);
            cb.addEventListener("change", () => {
                if (cb.checked) selection.add(key); else selection.delete(key);
                applyAndRender(true); renderFilters();
            });
            return el("label", { class: "tvx-fitem" }, cb, el("span", { title: key }, key || "—"), el("em", {}, nfCompact.format(n)));
        };
        draw();
        return el("div", { class: "tvx-facet-wrap" }, counts.length > 8 ? q : null, box);
    }

    function renderFilters() {
        const pool = state.pool, f = state.filters;
        if (!pool || !f || !filtersEl) return;
        const openState = {};
        for (const d of filtersEl.querySelectorAll("details")) openState[d.dataset.k] = d.open;
        filtersEl.textContent = "";

        // ---- barra fixa: ordem + botão "Filtros" + períodos
        const sortSel = el("select", { class: "tvx-sel" });
        for (const [v, label] of SORTS) sortSel.append(el("option", { value: v, selected: v === f.sort ? "" : null }, label));
        sortSel.addEventListener("change", () => { f.sort = sortSel.value; applyAndRender(true); });
        const active = (f.featuredOnly ? 1 : 0) + (!f.preset && (f.from || f.to) ? 1 : 0) + (f.preset === "current-day" ? 1 : 0)
            + ["minViews", "maxViews", "minDur", "maxDur"].filter((k) => f[k] !== "").length
            + f.curators.size + f.games.size + f.langs.size + f.types.size;
        const fbtn = el("button", { class: "tvx-fbtn", type: "button", "aria-expanded": String(filtersOpen), html: svg(ICON.filter, 16) },
            "Filtros", active ? el("span", { class: "tvx-badge" }, String(active)) : null);
        fbtn.addEventListener("click", () => { filtersOpen = !filtersOpen; renderFilters(); });
        const chips = el("div", { class: "tvx-chips" });
        for (const p of PRESETS) {
            const b = el("button", { class: "tvx-chipbtn", type: "button", "aria-pressed": String(f.preset === p.key && !(p.key === "" && (f.from || f.to))) }, p.label);
            b.addEventListener("click", () => {
                f.preset = p.key;
                if (!p.days) { f.from = ""; f.to = ""; }
                else { f.from = ymd(new Date(Date.now() - p.days * 86400000).toISOString()); f.to = ""; }
                applyAndRender(true); renderFilters();
            });
            chips.append(b);
        }
        // períodos rolam na horizontal; as setas só aparecem quando há o que rolar naquele lado
        const arrow = (dir) => {
            const a = el("button", { class: `tvx-chiparrow tvx-chiparrow-${dir < 0 ? "l" : "r"}`, type: "button", "aria-label": dir < 0 ? "Anteriores" : "Próximos",
                html: `<svg width="16" height="16" viewBox="0 0 24 24"><path fill="currentColor" d="${dir < 0 ? "M15.4 7.4 14 6l-6 6 6 6 1.4-1.4L10.8 12z" : "M8.6 16.6 10 18l6-6-6-6-1.4 1.4 4.6 4.6z"}"/></svg>` });
            a.addEventListener("click", () => chips.scrollBy({ left: dir * 140, behavior: "smooth" }));
            return a;
        };
        const left = arrow(-1), right = arrow(1);
        const syncArrows = () => {
            left.hidden = chips.scrollLeft <= 2;
            right.hidden = chips.scrollLeft + chips.clientWidth >= chips.scrollWidth - 2;
        };
        // a gaveta é redesenhada a cada lote que chega: a posição da rolagem sobrevive
        chips.addEventListener("scroll", () => { chipsScroll = chips.scrollLeft; syncArrows(); }, { passive: true });
        requestAnimationFrame(() => { chips.style.scrollBehavior = "auto"; chips.scrollLeft = chipsScroll; chips.style.scrollBehavior = ""; syncArrows(); });
        if (toolbarEl) toolbarEl.replaceChildren(el("div", { class: "tvx-toolrow" }, sortSel, fbtn), el("div", { class: "tvx-chipsbar" }, left, chips, right));
        filtersEl.hidden = !filtersOpen;

        // ---- gaveta: destaque e dia
        const feat = pool.kind === "clips" ? el("button", { class: "tvx-pill", type: "button", "aria-pressed": String(f.featuredOnly) }, "★ Só destaques") : null;
        if (feat) feat.addEventListener("click", () => { f.featuredOnly = !f.featuredOnly; applyAndRender(true); renderFilters(); });

        const from = el("input", { class: "tvx-in", type: "date", value: f.from });
        const to = el("input", { class: "tvx-in", type: "date", value: f.to });
        const onDate = () => { f.from = from.value; f.to = to.value; f.preset = ""; applyAndRender(true); renderFilters(); };
        from.addEventListener("change", onDate); to.addEventListener("change", onDate);
        let curDayBtn = null;
        if (state.current && state.current.createdAt) {
            const curDay = ymd(state.current.createdAt);
            const isCurDayOn = f.from === curDay && f.to === curDay;
            curDayBtn = el("button", {
                class: "tvx-pill", type: "button", "aria-pressed": String(isCurDayOn),
                title: `Só os itens de ${dtShort.format(new Date(state.current.createdAt))}`,
            }, pool.kind === "clips" ? "Clipes deste dia" : "Vídeos deste dia");
            curDayBtn.addEventListener("click", () => {
                if (isCurDayOn) { f.from = ""; f.to = ""; f.preset = ""; }
                else { f.from = curDay; f.to = curDay; f.preset = "current-day"; }
                applyAndRender(true); renderFilters();
            });
        }
        const dateRow = el("div", { class: "tvx-date-row" },
            el("div", { class: "tvx-date-field" }, el("label", {}, "De"), from),
            el("div", { class: "tvx-date-field" }, el("label", {}, "Até"), to),
        );
        const dateCount = (f.from ? 1 : 0) + (f.to ? 1 : 0);
        const g1 = group("Datas", dateCount, openState.date !== false,
            (feat || curDayBtn) ? el("div", { class: "tvx-row" }, feat, curDayBtn) : null, dateRow);
        g1.dataset.k = "date";
        filtersEl.append(g1);

        // ---- views / duração
        const mkNum = (val, ph, onChange) => {
            const i = el("input", { class: "tvx-in", type: "number", min: "0", placeholder: ph, value: val });
            i.addEventListener("change", () => { onChange(i.value); applyAndRender(true); });
            return i;
        };
        const numCount = ["minViews", "maxViews", "minDur", "maxDur"].filter((k) => f[k] !== "").length;
        const g2 = group("Views e duração", numCount, numCount > 0 || openState.num,
            el("div", { class: "tvx-dual-row" },
                el("div", { class: "tvx-dual-label" }, "Views"),
                el("div", { class: "tvx-dual-inputs" },
                    mkNum(f.minViews, "Mín", (v) => (f.minViews = v)),
                    mkNum(f.maxViews, "Máx", (v) => (f.maxViews = v))
                )
            ),
            el("div", { class: "tvx-dual-row" },
                el("div", { class: "tvx-dual-label" }, "Duração (s)"),
                el("div", { class: "tvx-dual-inputs" },
                    mkNum(f.minDur, "Mín", (v) => (f.minDur = v)),
                    mkNum(f.maxDur, "Máx", (v) => (f.maxDur = v))
                )
            )
        );
        g2.dataset.k = "num";
        filtersEl.append(g2);

        // ---- facetas
        if (pool.kind === "clips") {
            const g3 = group("Quem clipou", f.curators.size, f.curators.size > 0 || openState.curator,
                facetList(pool.items, f, "curator", (i) => i.curator, f.curators));
            g3.dataset.k = "curator";
            filtersEl.append(g3);
        } else {
            const g3 = group("Tipo", f.types.size, f.types.size > 0 || openState.type,
                facetList(pool.items, f, "type", (i) => i.curator, f.types));
            g3.dataset.k = "type";
            filtersEl.append(g3);
        }

        const g4 = group("Categoria", f.games.size, f.games.size > 0 || openState.game,
            facetList(pool.items, f, "game", (i) => i.game || "—", f.games));
        g4.dataset.k = "game";
        filtersEl.append(g4);

        if (pool.kind === "clips") {
            const g5 = group("Idioma", f.langs.size, f.langs.size > 0 || openState.lang,
                facetList(pool.items, f, "lang", (i) => i.language || "—", f.langs));
            g5.dataset.k = "lang";
            filtersEl.append(g5);
        }
    }

    // ===================================================================== //
    //  Roteamento e boot                                                    //
    // ===================================================================== //
    let lastHref = "";

    // Canal offline na aba Live: em vez da vitrine (que traz um chat vazio, porque a sala ao
    // vivo não tem histórico), abrimos a última transmissão. A página de VOD dá as duas coisas
    // que faltavam de graça: o vídeo da última live e o REPLAY do chat daquela transmissão,
    // ambos nativos. Só acontece a partir da raiz do canal, então não há como entrar em laço.
    function maybeOpenLastBroadcast() {
        const c = state.channel, r = state.route;
        if (!c || !r || r.videoId || c.stream) return;
        if (state.tab !== "live") return;
        if (location.pathname.split("/").filter(Boolean).length !== 1) return;
        const vod = c.videos && c.videos.edges && c.videos.edges[0] && c.videos.edges[0].node;
        if (!vod) return;
        vodOwners.set(String(vod.id), r.login);
        location.assign(`https://www.twitch.tv/videos/${vod.id}`);
    }

    async function onRoute() {
        setSearchOpen(false); // buscou e navegou: o modal fecha
        const route = parseRoute();
        const prev = state.route;
        state.route = route;

        if (!route) {
            // Sair do canal não pode deixar nada tocando por baixo: nem o player da Twitch nem
            // o nosso de clipes. Antes disso, state.tab ficava com o valor antigo e o guarda do
            // tick ("só em página de canal") impedia qualquer pausa.
            state.tab = null;
            applyLivePlayback();
            delete HTML.dataset.tvxPage;
            delete HTML.dataset.tvxTab;
            if (panel) panel.dataset.side = prefs.sidebarOpen ? "1" : "0";
            return;
        }

        HTML.dataset.tvxPage = "channel";
        buildNav();
        syncLayoutVars();

        if (route.videoId) {
            const params = new URLSearchParams(location.search);
            const tParam = params.get("t") || params.get("time");
            let target = parseTwitchTimestamp(tParam);
            try {
                const raw = sessionStorage.getItem("tvx:vod_target");
                if (raw) {
                    const stored = JSON.parse(raw);
                    if (stored && String(stored.vodId) === String(route.videoId) && (Date.now() - (stored.time || 0) < 300000)) {
                        target = stored.offset || target;
                    }
                    sessionStorage.removeItem("tvx:vod_target");
                }
            } catch {}
            if (target > 0) {
                enforceNativeVodSeek(target);
            }
        }

        // Numa página de VOD a URL não diz de quem é o canal; descobrimos e reprocessamos.
        if (route.videoId && !route.login) {
            fetchVideoOwner(route.videoId).then((login) => { if (login) onRoute(); }).catch(() => {});
            return;
        }

        const changedChannel = !prev || (prev.login || "").toLowerCase() !== route.login.toLowerCase();
        if (changedChannel) {
            state.channel = null;
            state.pool = null;
            state.current = null;
            renderIdent();
            fetchChannel(route.login).then((c) => {
                if (!state.route || (state.route.login || "").toLowerCase() !== route.login.toLowerCase()) return;
                state.channel = c;
                renderIdent();
                renderTabs();
                reorderLiveSections();
                maybeOpenLastBroadcast();
            }).catch(() => { /* sem dados do canal a nav ainda funciona */ });
        }

        renderTabs();
        renderFavButton();

        setTab(route.tab === "home" ? "live" : route.tab);

        if (state.pool && state.pool.items.length && !state.current) {
            const params = new URLSearchParams(location.search);
            const clipOrId = params.get("clip") || params.get("id") || route.clipSlug;
            const indexStr = params.get("index");
            let hit = null;
            if (clipOrId) {
                hit = state.pool.items.find((i) => i.slug === clipOrId || String(i.id) === String(clipOrId));
            }
            if (!hit && indexStr != null && indexStr !== "") {
                const rawIdx = parseInt(indexStr, 10);
                if (!isNaN(rawIdx)) {
                    const idx = (rawIdx >= 1 && rawIdx <= filtered.length) ? rawIdx - 1 : (rawIdx >= 0 && rawIdx < filtered.length ? rawIdx : 0);
                    hit = filtered[idx] || state.pool.items[idx];
                }
            }
            if (hit) play(hit, { updateUrl: true });
        }
    }

    // A topbar e a sidebar chegam aos poucos; o tick de 1s deixava ver cada passo da mudança.
    // Até a casca estar completa, rodamos os passos a cada 40ms e só então mostramos as duas.
    function bootShell() {
        const t0 = performance.now();
        const step = () => {
            hideTopNavAds();
            relocateNavControls();
            syncShell();
            tabifySideNav();
            syncLayoutVars(); // a barra do canal se posiciona pela largura da sidebar
            const done = document.querySelector("[data-tvx-accountbar]") && document.querySelector("#tvx-navlinks")?.isConnected
                && (document.querySelector("#tvx-navtabs-wrap")?.isConnected || document.querySelector(".side-nav--collapsed"))
                && parseFloat(HTML.style.getPropertyValue("--tvx-left")) > 0;
            if (done || performance.now() - t0 > 6000) {
                requestAnimationFrame(() => { syncShell(); syncLayoutVars(); HTML.dataset.tvxReady = "1"; });
                return;
            }
            setTimeout(step, 40);
        };
        step();
    }

    function boot() {
        if (!document.body) { setTimeout(boot, 20); return; }
        bootShell();
        lastHref = location.href;
        hideTopNavAds();
        relocateNavControls();
        syncShell();
        mountFavs();
        refreshFavs();
        observeSideNav();
        tabifySideNav();
        onRoute();

        // Bloqueia APENAS o clique no nome do streamer na barra de informações
        function blockStreamerProfileClick(e) {
            if (HTML.dataset.tvxPage !== "channel") return;
            if (!e.target || typeof e.target.closest !== "function") return;
            // NUNCA bloqueia categorias, tags ou painéis
            if (e.target.closest('[data-a-target="stream-game-link"], a[href*="/directory/category/"], a.tw-tag, .channel-panels-container, [data-a-target="panel-description"]')) {
                return;
            }
            const info = e.target.closest(".channel-root__info, .channel-info-content, .home__lower-content");
            if (!info) return;
            // Bloqueia APENAS se o elemento clicado for estritamente o h1 / nome do streamer
            const streamerHeader = e.target.closest("h1, a:has(h1)");
            if (streamerHeader && info.contains(streamerHeader)) {
                e.preventDefault();
                e.stopPropagation();
                e.stopImmediatePropagation();
            }
        }
        document.addEventListener("click", blockStreamerProfileClick, true);
        document.addEventListener("mousedown", blockStreamerProfileClick, true);
        document.addEventListener("pointerdown", blockStreamerProfileClick, true);

        document.addEventListener("click", (e) => {
            const btn = e.target && e.target.closest && e.target.closest('.collapse-toggle, [data-a-target="side-nav-arrow"], [data-a-target="side-nav-collapse-toggle"], [data-a-target="side-nav-expand-toggle"]');
            if (btn) {
                syncFor(900);
                requestAnimationFrame(() => {
                    syncShell();
                    if (document.querySelector(".side-nav--collapsed")) cleanupSidebarState();
                    else tabifySideNav();
                });
            }
        }, true);

        // A Twitch é SPA: pushState não dispara evento. Polling é o que funciona igual em
        // Violentmonkey/Tampermonkey, Firefox e Chrome, sem patchar objeto da página.
        setInterval(() => {
            if (location.href === lastHref) return;
            lastHref = location.href;
            onRoute();
        }, 400);
        window.addEventListener("popstate", onRoute);
        window.addEventListener("resize", () => { syncFor(250); tabifySideNav(); });

        // As sidebars da Twitch avisam quando começam a animar — é o gancho pra acompanhar
        // frame a frame em vez de corrigir só no fim.
        document.addEventListener("transitionstart", (e) => {
            const t = e.target;
            if (!t || t.nodeType !== 1 || typeof t.closest !== "function") return;
            if (t.closest(".side-nav, .channel-root__right-column, .right-column")) syncFor(900);
        }, true);

        // A altura da nav global muda sozinha (modo teatro, banner de anúncio). Um tick de 1s
        // custa nada; um MutationObserver na subtree do body pagaria o preço do chat inteiro.
        setInterval(() => {
            hideTopNavAds();   // a barra superior existe em toda página, não só nas de canal
            renderFavButton(); // o cabeçalho do canal re-renderiza e leva o botão junto
            relocateNavControls();
            syncShell();
            observeSideNav();
            mountFavs();       // idem: a sidebar é global, não só das páginas de canal
            expandSideNavSections();
            tabifySideNav();
            applyLivePlayback();   // roda fora do guarda: sair do canal tem que pausar
            if (HTML.dataset.tvxPage !== "channel") return;
            syncLayoutVars();
            applyLivePlayback();   // autocorretivo: se o React religar o player, mutamos de novo
            reorderLiveSections();  // idem: o React remonta as seções ao trocar de estado
        }, 1000);

        // Atualiza contador de espectadores e quem dos favoritos entrou/saiu do ar.
        setInterval(() => {
            refreshFavs();
            if (!state.route) return;
            fetchChannel(state.route.login).then((c) => {
                if (!state.route || !c || c.login.toLowerCase() !== state.route.login.toLowerCase()) return;
                state.channel = c; renderIdent(); renderTabs(); renderFavButton();
            }).catch(() => {});
        }, 90000);
    }

    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot, { once: true });
    else boot();
})();
