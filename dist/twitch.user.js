// ==UserScript==
// @name         Twitch — Top Nav, Live Tab & Clips/VOD Playlist
// @namespace    twitch-channel-rework
// @version      1.5.7
// @updateURL    https://raw.githubusercontent.com/oguilhermelima/userscripts/main/dist/twitch.user.js
// @downloadURL  https://raw.githubusercontent.com/oguilhermelima/userscripts/main/dist/twitch.user.js
// @author       oguilhermelima
// @description  Streamer top navigation plus a YouTube-style Clips and VOD theater with filtering, sorting, and native playback controls.
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
    const INTEGRITY_WAIT_MS = 9000; // quanto esperar a página nos dar o header antes do plano B
    const CACHE_TTL_MS = 6 * 60 * 60 * 1000;
    const CACHE_PREFIX = "tvx:v1:";

    const W = (typeof unsafeWindow !== "undefined") ? unsafeWindow : window;
    const HTML = document.documentElement;

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

    async function fetchClipPage(login, { period = "ALL_TIME", after = null } = {}) {
        const args = [`first: ${PAGE_SIZE}`];
        if (after) args.push(`after: "${q(after)}"`);
        args.push(`criteria: { period: ${period}, sort: VIEWS_DESC }`);
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
            a: pool.items.slice(0, 2500).map(pack), done: pool.done, partial: pool.partial,
        });
    }, 1500);

    async function loadClips(pool) {
        if (pool.loading || pool.done) return;
        pool.loading = true; pool.error = null; pool.emit();
        try {
            const first = await fetchClipPage(pool.login, { period: "ALL_TIME" });
            pool.add(first.items); pool.emit();

            if (!first.hasNext) { pool.done = true; pool.loading = false; pool.emit(); saveToCache(pool); return; }

            // Paginar exige o Client-Integrity da própria página. Esperamos um pouco por ele.
            const gotIntegrity = await Promise.race([integrityReady, sleep(INTEGRITY_WAIT_MS).then(() => false)]);

            if (gotIntegrity) {
                let cursor = first.cursor, pages = 1;
                while (cursor && pages < MAX_PAGES) {
                    let page;
                    try { page = await fetchClipPage(pool.login, { period: "ALL_TIME", after: cursor }); }
                    catch (e) { if (e.code === "IntegrityCheckFailed") { pool.partial = true; break; } throw e; }
                    const added = pool.add(page.items);
                    pages++; cursor = page.hasNext ? page.cursor : null;
                    pool.emit(); saveToCache(pool);
                    if (!added) break; // API repetindo página: para em vez de girar em falso
                }
                if (cursor) pool.partial = true;
            } else {
                // Plano B: sem integrity só dá 100 por período, mas os baldes se sobrepõem pouco.
                pool.partial = true;
                for (const period of ["LAST_MONTH", "LAST_WEEK", "LAST_DAY"]) {
                    try { pool.add((await fetchClipPage(pool.login, { period })).items); pool.emit(); }
                    catch { /* um período falhar não invalida os outros */ }
                }
            }
            pool.done = true;
        } catch (e) {
            pool.error = e.message || String(e);
        } finally {
            pool.loading = false; pool.emit(); saveToCache(pool);
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
        live: "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18Zm0 5a4 4 0 1 1 0 8 4 4 0 0 1 0-8Z",
        search: "M11 4a7 7 0 1 0 4.2 12.6l3.6 3.6 1.4-1.4-3.6-3.6A7 7 0 0 0 11 4Zm0 2a5 5 0 1 1 0 10 5 5 0 0 1 0-10Z",
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
            --tvx-accent: ${ACCENT}; --tvx-navh: 54px;
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

        /* dropdown de navegação da sidebar */
        #tvx-navtabs-wrap {
            position: relative !important;
            z-index: 50 !important;
            display: flex; flex-direction: column;
            width: 100%; box-sizing: border-box;
            padding: 0 !important; margin-top: 0;
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
        #tvx-navlinks { display: flex; flex-direction: column; gap: 4px; padding: 8px 8px;
            border-bottom: 1px solid rgba(255,255,255,.08); margin-bottom: 2px;
            font-family: Inter, Roobert, "Helvetica Neue", system-ui, sans-serif; }
        #tvx-navlinks .tvx-navlink { display: block; width: 100%; box-sizing: border-box; text-align: left;
            appearance: none; border: 0; background: transparent; cursor: pointer;
            padding: 9px 12px; border-radius: 8px; text-decoration: none; transition: all .14s ease;
            /* !important porque a Twitch tem regra de fonte mais forte pros links da sidebar */
            color: #dedee3; font-family: inherit; font-weight: 600 !important;
            font-size: 15px !important; line-height: 1.3 !important; }
        #tvx-navlinks .tvx-navlink:hover { background: rgba(255,255,255,.07); color: var(--tvx-accent); }
        .side-nav--collapsed #tvx-navlinks { display: none !important; }
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
        .tvx-fav { display: flex; align-items: center; gap: 10px; padding: 6px 10px; border-radius: 6px; text-decoration: none; color: #efeff1; transition: background .12s ease; }
        .tvx-fav:hover { background: rgba(255,255,255,.06); }
        .tvx-fav img { width: 28px; height: 28px; border-radius: 50%; flex: 0 0 auto; background: #26262c; }
        .tvx-fav .tvx-fav-txt { min-width: 0; flex: 1 1 auto; display: flex; flex-direction: column; }
        .tvx-fav .tvx-fav-txt b { font: 600 13px/1.3 inherit; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .tvx-fav .tvx-fav-txt small { font-size: 12px; color: #adadb8; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .tvx-fav .tvx-fav-live { flex: 0 0 auto; display: inline-flex; align-items: center; gap: 5px; font: 400 12px/1 inherit; color: #efeff1; }
        .tvx-fav .tvx-fav-live i { width: 8px; height: 8px; border-radius: 50%; background: #eb0400; }
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
            display: none; align-items: center; justify-content: space-between; gap: 14px; padding: 0 16px;
            background: #0e0e10; border-bottom: 1px solid rgba(255,255,255,.10);
            font-family: Inter, Roobert, "Helvetica Neue", system-ui, sans-serif; color: #efeff1;
        }
        html[data-tvx-page="channel"] #tvx-nav { display: flex; }
        #tvx-tabs { display: flex; align-items: center; gap: 2px; flex: 1 1 auto; overflow-x: auto; scrollbar-width: none; }
        #tvx-tabs::-webkit-scrollbar { display: none; }
        /* estilo das abas da própria Twitch: texto + sublinhado, sem pílula */
        .tvx-tab {
            appearance: none; border: 0; background: transparent; color: #efeff1; cursor: pointer;
            font: 600 15px/1 inherit; padding: 8px 2px; margin: 0 12px; border-radius: 0;
            white-space: nowrap; display: inline-flex; align-items: center; gap: 7px;
            position: relative; border-bottom: 2px solid transparent;
        }
        .tvx-tab:hover { color: var(--tvx-accent); background: transparent; }
        .tvx-tab[aria-selected="true"] { color: var(--tvx-accent); background: transparent; border-bottom-color: var(--tvx-accent); }
        .tvx-tab[data-tab="live"] .tvx-dot { width: 8px; height: 8px; border-radius: 50%; background: #eb0400; box-shadow: 0 0 0 0 rgba(235,4,0,.6); animation: tvx-pulse 2s infinite; }
        .tvx-tab[data-tab="live"][data-offline="1"] .tvx-dot { background: #53535f; animation: none; box-shadow: none; }
        @keyframes tvx-pulse { 70% { box-shadow: 0 0 0 7px rgba(235,4,0,0); } 100% { box-shadow: 0 0 0 0 rgba(235,4,0,0); } }
        #tvx-nav .tvx-navright { display: flex; align-items: center; gap: 8px; flex: 0 0 auto; }
        .tvx-chip {
            display: inline-flex; align-items: center; gap: 6px; padding: 5px 10px; border-radius: 999px;
            background: rgba(255,255,255,.08); color: #dedee3; font: 600 12px/1 inherit; white-space: nowrap;
        }
        .tvx-iconbtn { cursor: pointer; border: 0; padding: 6px; border-radius: 8px; line-height: 0; }
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
        html.tw-root--theatre #tvx-nav {
            position: fixed !important;
            top: 0 !important;
            left: 0 !important;
            right: 0 !important;
            height: var(--tvx-navh, 38px) !important;
            z-index: 3001 !important;
            display: flex !important;
        }
        .persistent-player.persistent-player--theatre,
        .persistent-player[data-a-player-state="theatre"],
        html[data-tvx-theatre="1"] .persistent-player,
        html.tw-root--theatre .persistent-player {
            position: fixed !important;
            top: var(--tvx-navh, 38px) !important;
            left: 0 !important;
            width: calc(100% - var(--tvx-chatw)) !important;
            height: calc(100vh - var(--tvx-navh, 38px)) !important;
            max-height: calc(100vh - var(--tvx-navh, 38px)) !important;
            z-index: 3000 !important;
            pointer-events: auto !important;
            transform: none !important;
        }
        .channel-root__right-column.right-column--theatre,
        .right-column--theatre,
        html[data-tvx-page="channel"][data-tvx-theatre="1"] .channel-root__right-column,
        html[data-tvx-page="channel"].tw-root--theatre .channel-root__right-column {
            top: var(--tvx-navh, 38px) !important;
            height: calc(100vh - var(--tvx-navh, 38px)) !important;
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
            background: linear-gradient(to top, rgba(0,0,0,0.92) 0%, rgba(0,0,0,0.6) 65%, transparent 100%);
            padding: 24px 16px 10px; display: flex; flex-direction: column; gap: 6px;
            transition: opacity .25s ease, transform .25s ease;
        }
        .tvx-screen[data-idle="1"]:not([data-paused="1"]) .tvx-plc-bottom {
            opacity: 0; pointer-events: none; transform: translateY(8px);
        }
        .tvx-screen[data-idle="1"]:not([data-paused="1"]) {
            cursor: none;
        }

        /* Scrubber / Barra de progresso */
        .tvx-plc-prog {
            position: relative; width: 100%; height: 16px; display: flex; align-items: center;
            cursor: pointer; user-select: none; touch-action: none;
        }
        .tvx-plc-track {
            position: absolute; left: 0; right: 0; height: 4px; border-radius: 2px;
            background: rgba(255, 255, 255, 0.22); transition: height .15s ease;
        }
        .tvx-plc-prog:hover .tvx-plc-track,
        .tvx-plc-prog.is-dragging .tvx-plc-track {
            height: 6px;
        }
        .tvx-plc-buf {
            position: absolute; left: 0; top: 0; bottom: 0; width: 0%; border-radius: inherit;
            background: rgba(255, 255, 255, 0.35); pointer-events: none;
        }
        .tvx-plc-fill {
            position: absolute; left: 0; top: 0; bottom: 0; width: 0%; border-radius: inherit;
            background: var(--tvx-accent); pointer-events: none;
        }
        .tvx-plc-knob {
            position: absolute; left: 0%; top: 50%; transform: translate(-50%, -50%);
            width: 12px; height: 12px; border-radius: 50%; background: #fff;
            box-shadow: 0 0 4px rgba(0,0,0,0.5); pointer-events: none;
            transition: transform .15s ease, opacity .15s ease; opacity: 0;
        }
        .tvx-plc-prog:hover .tvx-plc-knob,
        .tvx-plc-prog.is-dragging .tvx-plc-knob {
            opacity: 1; transform: translate(-50%, -50%) scale(1.2);
        }
        .tvx-plc-tooltip {
            position: absolute; bottom: 20px; transform: translateX(-50%);
            background: rgba(0,0,0,0.85); color: #fff; font-size: 11px; font-weight: 600;
            padding: 2px 6px; border-radius: 4px; pointer-events: none; display: none;
            white-space: nowrap;
        }

        /* Linha de controles */
        .tvx-plc-row {
            display: flex; align-items: center; justify-content: space-between; gap: 8px;
        }
        .tvx-plc-left, .tvx-plc-right {
            display: flex; align-items: center; gap: 6px; flex-wrap: nowrap;
        }
        .tvx-plc-btn {
            appearance: none; border: 0; background: transparent; color: #dedee3;
            cursor: pointer; padding: 6px; border-radius: 6px; display: inline-flex;
            align-items: center; justify-content: center; line-height: 0;
            transition: color .15s ease, background .15s ease;
        }
        .tvx-plc-btn:hover {
            color: #fff; background: rgba(255,255,255,0.12);
        }
        .tvx-plc-btn[aria-pressed="true"] {
            color: var(--tvx-accent); background: rgba(169,112,255,0.2);
        }
        .tvx-plc-btn:disabled {
            opacity: 0.35; cursor: default;
        }
        .tvx-plc-time {
            font-size: 12.5px; font-weight: 600; color: #dedee3; margin: 0 4px;
            white-space: nowrap; user-select: none;
        }

        /* Volume Slider */
        .tvx-plc-vol-wrap {
            display: inline-flex; align-items: center; gap: 2px; position: relative;
        }
        .tvx-plc-vol-slider {
            appearance: none; width: 0; opacity: 0; height: 4px; border-radius: 2px;
            background: rgba(255,255,255,0.3); outline: none; cursor: pointer;
            transition: width .2s ease, opacity .2s ease, margin .2s ease; margin: 0;
        }
        .tvx-plc-vol-wrap:hover .tvx-plc-vol-slider,
        .tvx-plc-vol-slider:focus {
            width: 58px; opacity: 1; margin: 0 4px;
        }
        .tvx-plc-vol-slider::-webkit-slider-thumb {
            appearance: none; width: 10px; height: 10px; border-radius: 50%;
            background: #fff; cursor: pointer;
        }

        /* Autoplay toggle */
        .tvx-plc-auto { display: inline-flex; align-items: center; }
        .tvx-plc-auto-pill {
            display: inline-flex; align-items: center; gap: 6px; padding: 4px 10px;
            border-radius: 999px; background: rgba(255,255,255,.08); font-size: 12px; font-weight: 600;
            color: #adadb8; transition: background .2s ease, color .2s ease;
        }
        .tvx-plc-auto[aria-pressed="true"] .tvx-plc-auto-pill {
            background: rgba(169,112,255,.24); color: #d6bcff;
        }
        .tvx-plc-auto-dot {
            width: 7px; height: 7px; border-radius: 50%; background: #6c6c75;
            transition: background .2s ease;
        }
        .tvx-plc-auto[aria-pressed="true"] .tvx-plc-auto-dot {
            background: var(--tvx-accent);
        }

        .tvx-badge-idx {
            font-weight: 700; font-size: 12px; padding: 4px 9px; border-radius: 999px;
            background: rgba(255,255,255,.08); color: #dedee3; white-space: nowrap;
        }

        /* Selects inside player */
        .tvx-plc-sel {
            height: 28px; padding: 0 22px 0 8px; font-size: 12px; border-radius: 6px;
            background-color: rgba(255,255,255,0.08); border: 1px solid rgba(255,255,255,0.14);
            color: #dedee3;
        }
        .tvx-plc-sel:hover {
            background-color: rgba(255,255,255,0.14); color: #fff;
        }

        /* Barra de rodapé do VOD */
        .tvx-vod-bar {
            flex: 0 0 44px; display: flex; align-items: center; justify-content: space-between;
            padding: 0 16px; background: #0e0e12; border-top: 1px solid rgba(255,255,255,.08);
            font-size: 13px; color: #efeff1; z-index: 10;
        }

        .tvx-under { flex: 0 0 auto; max-height: 42%; overflow-y: auto; padding: 14px 20px 20px; border-top: 1px solid rgba(255,255,255,.08); }
        .tvx-under-header { display: flex; align-items: flex-start; justify-content: space-between; gap: 14px; margin-bottom: 10px; }
        .tvx-under-header h1 { font-size: 19px; line-height: 1.3; margin: 0; font-weight: 700; color: #fff; flex: 1 1 auto; word-break: break-word; }
        .tvx-share-btn {
            flex: 0 0 auto; display: inline-flex; align-items: center; gap: 6px; padding: 6px 12px;
            border-radius: 8px; border: 1px solid rgba(255,255,255,.14); background: rgba(255,255,255,.06);
            color: #efeff1; font: 600 13px/1 inherit; cursor: pointer; transition: all .15s ease;
        }
        .tvx-share-btn:hover { background: rgba(255,255,255,.14); border-color: rgba(169,112,255,.5); color: #fff; }
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
        .tvx-side-head { flex: 0 0 auto; padding: 12px 14px 10px; border-bottom: 1px solid rgba(255,255,255,.08); }
        .tvx-side-title { display: flex; align-items: center; gap: 8px; margin-bottom: 10px; }
        .tvx-side-title b { font-size: 15px; font-weight: 700; color: #fff; }
        .tvx-side-badge {
            font-size: 11px; font-weight: 600; color: #adadb8;
            background: rgba(255,255,255,.08); padding: 2px 8px; border-radius: 999px;
            margin-left: auto;
        }
        .tvx-sideclose { flex: 0 0 auto; border: 0; background: transparent; color: #adadb8; cursor: pointer; padding: 5px; border-radius: 8px; line-height: 0; }
        .tvx-sideclose:hover { background: rgba(255,255,255,.1); color: #fff; }
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
            width: 100%; box-sizing: border-box; height: 36px; padding: 0 32px 0 34px; border-radius: 8px;
            border: 1px solid rgba(255,255,255,.14); background: rgba(255,255,255,.06); color: #fff;
            font: 13.5px/1 inherit; outline: none; transition: border-color .15s ease, background .15s ease;
        }
        .tvx-search input:focus { border-color: var(--tvx-accent); background: rgba(255,255,255,.09); }
        .tvx-search .tvx-si { position: absolute; left: 10px; top: 10px; color: #adadb8; pointer-events: none; }
        .tvx-search .tvx-sx { position: absolute; right: 6px; top: 6px; border: 0; background: transparent; color: #adadb8; cursor: pointer; padding: 4px; border-radius: 6px; }
        .tvx-search .tvx-sx:hover { background: rgba(255,255,255,.1); color: #fff; }

        .tvx-filters {
            flex: 0 0 auto; max-height: 48vh; overflow-y: auto;
            border-bottom: 1px solid rgba(255,255,255,.08);
            scrollbar-width: thin; scrollbar-color: rgba(255,255,255,.18) transparent;
        }
        .tvx-filters::-webkit-scrollbar { width: 5px; }
        .tvx-filters::-webkit-scrollbar-thumb { background: rgba(255,255,255,.18); border-radius: 3px; }
        .tvx-filters::-webkit-scrollbar-thumb:hover { background: rgba(255,255,255,.32); }

        .tvx-fgroup { border-bottom: 1px solid rgba(255,255,255,.06); }
        .tvx-fgroup > summary {
            list-style: none; cursor: pointer; padding: 10px 14px;
            font: 600 13px/1.2 inherit; color: #dedee3;
            display: flex; align-items: center; gap: 8px;
            transition: background .15s ease, color .15s ease; user-select: none;
        }
        .tvx-fgroup > summary::-webkit-details-marker { display: none; }
        .tvx-fgroup > summary::after {
            content: ""; display: inline-block; width: 6px; height: 6px;
            border-right: 2px solid #8a8a95; border-bottom: 2px solid #8a8a95;
            transform: rotate(-45deg); transition: transform .2s ease;
            margin-left: auto;
        }
        .tvx-fgroup[open] > summary::after { transform: rotate(45deg); }
        .tvx-fgroup > summary:hover { background: rgba(255,255,255,.04); color: #fff; }
        .tvx-fgroup[open] > summary { color: #fff; }
        .tvx-fgroup > summary .tvx-badge { font-size: 11px; padding: 2px 7px; border-radius: 999px; background: var(--tvx-accent); color: #16121f; font-weight: 800; }
        .tvx-fbody { padding: 6px 14px 12px; display: flex; flex-direction: column; gap: 8px; }
        .tvx-row { display: flex; align-items: center; gap: 8px; width: 100%; }
        .tvx-row label { font-size: 12px; color: #adadb8; min-width: 28px; }
        .tvx-in {
            flex: 1 1 auto; min-width: 0; box-sizing: border-box; height: 32px; padding: 0 9px; border-radius: 8px;
            border: 1px solid rgba(255,255,255,.14); background: rgba(255,255,255,.06); color: #fff; font: 13px/1 inherit; outline: none;
        }
        .tvx-in:focus { border-color: var(--tvx-accent); }
        .tvx-in::-webkit-calendar-picker-indicator { filter: invert(.75); cursor: pointer; }

        .tvx-presets-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 6px; width: 100%; }
        .tvx-presets-grid .tvx-pill { text-align: center; padding: 6px 2px; white-space: nowrap; font-size: 11.5px; }
        .tvx-pill-full { width: 100%; text-align: center; margin-top: 2px; }

        .tvx-pill {
            border: 1px solid rgba(255,255,255,.14); background: rgba(255,255,255,.05); color: #dedee3;
            border-radius: 8px; padding: 6px 11px; font: 600 12px/1 inherit; cursor: pointer;
            transition: all .15s ease;
        }
        .tvx-pill:hover { background: rgba(255,255,255,.11); color: #fff; }
        .tvx-pill[aria-pressed="true"] { background: var(--tvx-accent); border-color: var(--tvx-accent); color: #16121f; font-weight: 700; }

        .tvx-date-row { display: flex; align-items: center; gap: 8px; width: 100%; }
        .tvx-date-field { flex: 1 1 0; min-width: 0; display: flex; align-items: center; gap: 6px; }
        .tvx-date-field label { font-size: 12px; color: #adadb8; flex: 0 0 auto; }
        .tvx-date-field .tvx-in { flex: 1 1 0; min-width: 0; width: 100%; padding: 0 6px; font-size: 12px; }

        .tvx-dual-row { display: flex; flex-direction: column; gap: 4px; width: 100%; }
        .tvx-dual-label { font-size: 12px; font-weight: 600; color: #adadb8; }
        .tvx-dual-inputs { display: flex; align-items: center; gap: 6px; width: 100%; }
        .tvx-dual-inputs .tvx-in { flex: 1 1 0; min-width: 0; }

        .tvx-facet {
            max-height: 180px; overflow-y: auto; display: flex; flex-direction: column; gap: 1px;
            scrollbar-width: thin; scrollbar-color: rgba(255,255,255,.18) transparent;
        }
        .tvx-facet::-webkit-scrollbar { width: 5px; }
        .tvx-facet::-webkit-scrollbar-thumb { background: rgba(255,255,255,.18); border-radius: 3px; }
        .tvx-facet::-webkit-scrollbar-thumb:hover { background: rgba(255,255,255,.32); }
        .tvx-fitem { display: flex; align-items: center; gap: 8px; padding: 5px 6px; border-radius: 6px; cursor: pointer; font-size: 13px; color: #dedee3; }
        .tvx-fitem:hover { background: rgba(255,255,255,.06); color: #fff; }
        .tvx-fitem input { accent-color: var(--tvx-accent); margin: 0; }
        .tvx-fitem span { flex: 1 1 auto; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .tvx-fitem em { font-style: normal; font-size: 11px; color: #8a8a95; font-weight: 600; }

        .tvx-list { flex: 1 1 auto; overflow-y: auto; padding: 6px; }
        .tvx-item { display: grid; grid-template-columns: 148px minmax(0,1fr); gap: 10px; padding: 6px; border-radius: 10px; cursor: pointer; }
        .tvx-item:hover { background: rgba(255,255,255,.07); }
        .tvx-item[aria-current="true"] { background: rgba(169,112,255,.16); box-shadow: inset 2px 0 0 var(--tvx-accent); }
        .tvx-thumb { position: relative; aspect-ratio: 16/9; border-radius: 7px; overflow: hidden; background: #18181b; }
        .tvx-thumb img { width: 100%; height: 100%; object-fit: cover; display: block; }
        .tvx-thumb b { position: absolute; right: 4px; bottom: 4px; background: rgba(0,0,0,.8); border-radius: 4px; padding: 1px 5px; font: 700 11px/1.5 inherit; }
        .tvx-thumb .tvx-star { position: absolute; left: 4px; top: 4px; background: var(--tvx-accent); color: #16121f; border-radius: 4px; padding: 1px 5px; font: 800 10px/1.6 inherit; }
        .tvx-itxt { min-width: 0; display: flex; flex-direction: column; gap: 3px; }
        .tvx-itxt strong { font: 600 13px/1.35 inherit; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
        .tvx-itxt small { font-size: 11.5px; color: #adadb8; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
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

        // só ícone: o rótulo vira title/aria-label, que é onde ele é útil sem ocupar a barra
        chatBtn = el("button", { class: "tvx-chip tvx-iconbtn tvx-chatbtn", type: "button", html: svg(ICON.chat, 16) });
        chatBtn.addEventListener("click", toggleChat);

        // mesmo tratamento do chat: um ícone na barra, sem botão de texto no player
        listBtn = el("button", { class: "tvx-chip tvx-iconbtn tvx-listbtn", type: "button", html: svg(ICON.list, 16) });
        listBtn.addEventListener("click", () => setSidebarOpen(!prefs.sidebarOpen));

        favBtn = el("button", { class: "tvx-chip tvx-iconbtn tvx-favbtn", type: "button", html: svg(ICON.star, 16) });
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
        const l = on ? "Remover dos favoritos" : "Adicionar aos favoritos";
        favBtn.title = l;
        favBtn.setAttribute("aria-label", l);
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
            listBtn.style.display = (state.tab === "clips" || state.tab === "videos") ? "" : "none";
            listBtn.setAttribute("aria-pressed", String(!!prefs.sidebarOpen));
            const l = prefs.sidebarOpen ? "Esconder a lista" : "Mostrar a lista";
            listBtn.title = l;
            listBtn.setAttribute("aria-label", l);
        }
        if (chatBtn) {
            const open = rightW > 0;
            chatBtn.style.display = state.tab === "live" ? "" : "none";
            chatBtn.setAttribute("aria-pressed", String(open));
            const label = open ? "Ocultar chat" : "Mostrar chat";
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

            navTabsWrapEl = el("div", { id: "tvx-navtabs-wrap" }, navDropdownTriggerEl, navDropdownMenuEl);
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
                    set(child, "margin-top", "1rem");
                    set(child, "margin-bottom", "1rem");
                    set(child, "position", "relative");
                    set(child, "z-index", "1");
                }
            }
        }
        // Só entramos em modo abas depois de confirmar que a faixa REALMENTE renderizou.
        // Enquanto ela não estiver na tela, esconder painéis deixaria a sidebar vazia — pior
        // do que manter o empilhamento nativo por mais um ciclo.
        if (navTabsWrapEl.getBoundingClientRect().width < 8) { cleanupSidebarState(); return; }
        applyNavTab();
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
            const btn = [...sec.querySelectorAll("button")]
                .find((b) => /mostrar (mais|menos)|show (more|less)|ver mais/i.test(b.textContent || ""));
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
        for (const a of [...origem, ...(maisBtn ? [maisBtn] : [])]) {
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
            navLinksEl.textContent = "";
            for (const a of origem) {
                navLinksEl.append(el("a", {
                    class: "tvx-navlink", href: a.getAttribute("href") || "/",
                }, a.textContent.trim()));
            }
            // O "⋮" da barra superior é um menu, não um link: nossa entrada delega o clique
            // nele, então o balão continua sendo o da Twitch, com o conteúdo dela.
            if (maisBtn) {
                const mais = el("button", { class: "tvx-navlink", type: "button" }, "Mais");
                mais.addEventListener("click", () => {
                    const b = topnav.querySelector('[data-a-target="ellipsis-button"]');
                    if (b) b.click();
                });
                navLinksEl.append(mais);
            }
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
                const idx = filtered.findIndex((x) => x.id === item.id);
                const indexParam = idx >= 0 ? idx + 1 : 1;
                if (item.kind === "clip") {
                    url.searchParams.set("clip", item.slug);
                    url.searchParams.delete("id");
                } else {
                    url.searchParams.set("id", item.id);
                    url.searchParams.delete("clip");
                }
                url.searchParams.set("index", String(indexParam));
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
            const iframe = el("iframe", {
                src: `https://player.twitch.tv/?video=${encodeURIComponent(item.id)}&parent=${location.hostname}&autoplay=true&muted=${prefs.muted}`,
                allowfullscreen: "true", allow: "autoplay; fullscreen; picture-in-picture",
            });

            const prevBtn = el("button", { class: "tvx-plc-btn", type: "button", title: "Anterior (P)", html: svg(ICON.prev, 20) });
            prevBtn.disabled = !nextItem(-1);
            prevBtn.addEventListener("click", () => play(nextItem(-1)));

            const nextBtn = el("button", { class: "tvx-plc-btn", type: "button", title: "Próximo (N)", html: svg(ICON.next, 20) });
            nextBtn.disabled = !nextItem(1);
            nextBtn.addEventListener("click", () => play(nextItem(1)));

            const idx = filtered.findIndex((x) => x.id === item.id);
            const idxText = idx >= 0 ? `#${idx + 1} de ${filtered.length}` : `#1 de ${filtered.length || 1}`;
            const badge = el("span", { class: "tvx-badge-idx" }, idxText);

            const autoBtn = el("button", {
                class: "tvx-plc-btn tvx-plc-auto", type: "button",
                "aria-pressed": String(prefs.autoplay),
                title: "Autoplay pro próximo item",
            }, el("span", { class: "tvx-plc-auto-pill" },
                el("i", { class: "tvx-plc-auto-dot" }),
                el("span", {}, "Autoplay")
            ));
            autoBtn.addEventListener("click", () => {
                prefs.autoplay = !prefs.autoplay; savePrefs();
                autoBtn.setAttribute("aria-pressed", String(prefs.autoplay));
            });

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
                el("div", { class: "tvx-plc-left" }, prevBtn, nextBtn, badge),
                el("div", { class: "tvx-plc-right" }, autoBtn, fsBtn)
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
        const playBtn = el("button", { class: "tvx-plc-btn", type: "button", title: "Play/Pause (Space/K)", html: svg(ICON.play, 22) });
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

        const idx = filtered.findIndex((x) => x.id === item.id);
        const idxText = idx >= 0 ? `#${idx + 1} de ${filtered.length}` : `#1 de ${filtered.length || 1}`;
        const badge = el("span", { class: "tvx-badge-idx" }, idxText);

        const leftGroup = el("div", { class: "tvx-plc-left" },
            playBtn, prevBtn, nextBtn, volWrap, timeEl, badge
        );

        // Right Controls: Qualidade | Velocidade | Loop (20px) | Autoplay (toggle) | Download (20px) | Fullscreen (20px)
        const rightGroup = el("div", { class: "tvx-plc-right" });

        if (item.qualities && item.qualities.length) {
            const qs = el("select", { class: "tvx-sel tvx-plc-sel", title: "Qualidade" });
            for (const v of item.qualities.slice().sort((a, b) => (+b.quality) - (+a.quality))) {
                qs.append(el("option", { value: v.quality, selected: v.quality === String(prefs.quality) ? "" : null },
                    `${v.quality}p${v.fps ? ` ${Math.round(v.fps)}fps` : ""}`));
            }
            qs.value = (pickQuality(item) || {}).quality || qs.value;
            qs.addEventListener("change", () => {
                prefs.quality = qs.value; savePrefs();
                const t = video.currentTime;
                const wasPaused = video.paused;
                renderScreen().then(() => {
                    if (videoEl) {
                        videoEl.currentTime = t;
                        if (!wasPaused) videoEl.play().catch(() => {});
                    }
                });
            });
            rightGroup.append(qs);
        }

        const sp = el("select", { class: "tvx-sel tvx-plc-sel", title: "Velocidade" });
        for (const r of [0.25, 0.5, 0.75, 1, 1.25, 1.5, 2]) {
            sp.append(el("option", { value: String(r), selected: r === prefs.speed ? "" : null }, `${r}×`));
        }
        sp.addEventListener("change", () => {
            prefs.speed = parseFloat(sp.value); savePrefs();
            if (videoEl) videoEl.playbackRate = prefs.speed;
        });
        rightGroup.append(sp);

        const loopBtn = el("button", {
            class: "tvx-plc-btn", type: "button", "data-action": "loop",
            "aria-pressed": String(prefs.loop),
            title: prefs.loop ? "Desativar repetição (Shift+L ou R)" : "Repetir (Shift+L ou R)",
            html: svg(ICON.loop, 20),
        });
        loopBtn.addEventListener("click", () => {
            prefs.loop = !prefs.loop; savePrefs();
            if (video) video.loop = !!prefs.loop;
            loopBtn.setAttribute("aria-pressed", String(prefs.loop));
            loopBtn.title = prefs.loop ? "Desativar repetição (Shift+L ou R)" : "Repetir (Shift+L ou R)";
        });
        rightGroup.append(loopBtn);

        const autoBtn = el("button", {
            class: "tvx-plc-btn tvx-plc-auto", type: "button",
            "aria-pressed": String(prefs.autoplay),
            title: "Autoplay pro próximo clipe",
        }, el("span", { class: "tvx-plc-auto-pill" },
            el("i", { class: "tvx-plc-auto-dot" }),
            el("span", {}, "Autoplay")
        ));
        autoBtn.addEventListener("click", () => {
            prefs.autoplay = !prefs.autoplay; savePrefs();
            autoBtn.setAttribute("aria-pressed", String(prefs.autoplay));
        });
        rightGroup.append(autoBtn);

        if (item.qualities && item.qualities.length) {
            const dl = el("button", { class: "tvx-plc-btn", type: "button", title: "Baixar clipe", html: svg(ICON.dl, 20) });
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

        const fsBtn = el("button", { class: "tvx-plc-btn", type: "button", "data-action": "fullscreen", title: "Tela cheia (F)", html: svg(ICON.fullscreen, 20) });
        fsBtn.addEventListener("click", toggleFullscreen);
        rightGroup.append(fsBtn);

        const controlsRow = el("div", { class: "tvx-plc-row" }, leftGroup, rightGroup);
        const bottomBar = el("div", { class: "tvx-plc-bottom" }, prog, controlsRow);

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

        const header = el("div", { class: "tvx-under-header" }, titleEl, shareBtn);
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
        rendered = 0;
        listEl.textContent = "";
        listEl.append(sentinel);
        if (resetScroll) listEl.scrollTop = 0;
        renderMore();
        updateHead();
        renderPlayerBar();
    }

    function renderMore() {
        if (!filtered.length) {
            if (!rendered && !listEl.querySelector(".tvx-note")) {
                listEl.insertBefore(el("div", { class: "tvx-note" },
                    state.pool && state.pool.loading ? "Carregando…" : "Nenhum item bate com os filtros."), sentinel);
            }
            return;
        }
        const stop = Math.min(filtered.length, rendered + 40);
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
                    `${fmtViews(item.views)} views · ${dtShort.format(new Date(item.createdAt))} · ${ago(item.createdAt)}`),
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
    let countEl, statusEl;

    function buildHead() {
        const pool = state.pool, f = state.filters;
        if (!pool || !headEl) return;
        headEl.textContent = "";

        countEl = el("span", { class: "tvx-side-badge" });
        const closeSide = el("button", {
            class: "tvx-sideclose", type: "button", title: "Fechar a lista",
            "aria-label": "Fechar a lista", html: svg(ICON.close, 14),
        });
        closeSide.addEventListener("click", () => setSidebarOpen(false));
        headEl.append(el("div", { class: "tvx-side-title" },
            el("b", {}, pool.kind === "clips" ? "Clipes" : "Vídeos"), countEl, closeSide));

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
        headEl.append(el("div", { class: "tvx-search" },
            el("span", { class: "tvx-si", html: svg(ICON.search, 16) }), searchInput, clear));

        statusEl = el("div", {});
        headEl.append(statusEl);
        updateHead();
    }

    function updateHead() {
        const pool = state.pool;
        if (!pool || !countEl || !statusEl) return;
        countEl.textContent = `${nfFull.format(filtered.length)} de ${nfFull.format(pool.items.length)}`;
        statusEl.textContent = "";
        if (pool.loading) statusEl.append(el("div", { class: "tvx-progress" }, el("i", {})));
        else if (pool.partial) {
            statusEl.append(el("div", { class: "tvx-partial-card" },
                "Lista parcial — a Twitch exige uma credencial de integridade pra paginar. Recarregue a página com esta aba aberta pro script capturá-la e puxar o resto."));
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

    function facetList(items, f, facet, keyOf, selection) {
        const box = el("div", { class: "tvx-facet" });
        const counts = facetCounts(items, f, facet, keyOf);
        if (!counts.length) box.append(el("div", { class: "tvx-note", style: { padding: "4px 0", fontSize: "12px" } }, "—"));
        for (const [key, n] of counts.slice(0, 400)) {
            const cb = el("input", { type: "checkbox" });
            cb.checked = selection.has(key);
            cb.addEventListener("change", () => {
                if (cb.checked) selection.add(key); else selection.delete(key);
                applyAndRender(true); renderFilters();
            });
            const lab = el("label", { class: "tvx-fitem" }, cb, el("span", { title: key }, key || "—"), el("em", {}, nfCompact.format(n)));
            box.append(lab);
        }
        return box;
    }

    function renderFilters() {
        const pool = state.pool, f = state.filters;
        if (!pool || !f || !filtersEl) return;
        const openState = {};
        for (const d of filtersEl.querySelectorAll("details")) openState[d.dataset.k] = d.open;
        filtersEl.textContent = "";

        // ---- ordenação + destaque
        const sortSel = el("select", { class: "tvx-sel", style: { width: "100%" } });
        for (const [v, label] of SORTS) sortSel.append(el("option", { value: v, selected: v === f.sort ? "" : null }, label));
        sortSel.addEventListener("change", () => { f.sort = sortSel.value; applyAndRender(true); });
        const feat = el("button", { class: "tvx-pill", type: "button", "aria-pressed": String(f.featuredOnly), style: { width: "100%", textAlign: "center" } }, "★ Só destaques");
        feat.addEventListener("click", () => { f.featuredOnly = !f.featuredOnly; applyAndRender(true); renderFilters(); });
        const g0 = group("Ordenar", 0, true, el("div", { class: "tvx-row" }, sortSel), el("div", { class: "tvx-row" }, feat));
        g0.dataset.k = "sort";
        filtersEl.append(g0);

        // ---- datas
        const from = el("input", { class: "tvx-in", type: "date", value: f.from });
        const to = el("input", { class: "tvx-in", type: "date", value: f.to });
        const onDate = () => { f.from = from.value; f.to = to.value; f.preset = ""; applyAndRender(true); renderFilters(); };
        from.addEventListener("change", onDate); to.addEventListener("change", onDate);
        const presetsGrid = el("div", { class: "tvx-presets-grid" });
        for (const p of PRESETS) {
            const b = el("button", { class: "tvx-pill", type: "button", "aria-pressed": String(f.preset === p.key) }, p.label);
            b.addEventListener("click", () => {
                f.preset = p.key;
                if (!p.days) { f.from = ""; f.to = ""; }
                else { f.from = ymd(new Date(Date.now() - p.days * 86400000).toISOString()); f.to = ""; }
                applyAndRender(true); renderFilters();
            });
            presetsGrid.append(b);
        }
        let curDayBtn = null;
        if (state.current && state.current.createdAt) {
            const curDay = ymd(state.current.createdAt);
            const isCurDayOn = f.from === curDay && f.to === curDay;
            curDayBtn = el("button", {
                class: "tvx-pill tvx-pill-full",
                type: "button",
                "aria-pressed": String(isCurDayOn),
                title: `Filtrar pelos clipes de ${dtShort.format(new Date(state.current.createdAt))}`,
            }, "📅 Clipes deste dia");
            curDayBtn.addEventListener("click", () => {
                if (isCurDayOn) {
                    f.from = ""; f.to = ""; f.preset = "";
                } else {
                    f.from = curDay; f.to = curDay; f.preset = "current-day";
                }
                applyAndRender(true); renderFilters();
            });
        }
        const dateRow = el("div", { class: "tvx-date-row" },
            el("div", { class: "tvx-date-field" }, el("label", {}, "De"), from),
            el("div", { class: "tvx-date-field" }, el("label", {}, "Até"), to),
        );
        const dateCount = (f.from ? 1 : 0) + (f.to ? 1 : 0);
        // aberto por padrão: é o filtro mais usado, e escondê-lo custava um clique toda vez
        const g1 = group("Período", dateCount, openState.date !== false, presetsGrid, curDayBtn, dateRow);
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
                el("div", { class: "tvx-dual-label" }, "Duração (segundos)"),
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

    function boot() {
        if (!document.body) { setTimeout(boot, 20); return; }
        lastHref = location.href;
        hideTopNavAds();
        relocateNavControls();
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
            relocateNavControls();
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
