// ==UserScript==
// @name         Instagram — Native Video Controls & Mosaic Feed
// @namespace    instagram-native-player
// @version      3.23.0
// @description  Camada aditiva sobre a interface do Instagram. (1) Player de vídeo integrado (feed, reels, explore, stories): progresso scrubável, play/pause, mudo+volume, velocidade, PiP, fullscreen e atalhos — SEMPRE ligado. (2) Feed da home em MASONRY com DOM próprio (OPCIONAL, off por padrão): lê os posts da lista nativa (harvest) e renderiza cards nossos em multicolunas estáveis (altura reservada por aspect-ratio), stories alinhadas, right rail escondida e nav esquerdo fixo. v3.0: TODAS as funcionalidades (menos o player) viram FLAGS num painel de ajustes flutuante (mesmo modelo do reddit/twitter: FAB de engrenagem no canto inferior-direito → painel com toggles/sliders agrupados). v3.1+: polish visual do mosaico — paleta própria (PRETO premium no escuro com texto mais legível; claro no light, detectado por luminância do fundo), cards com hover (eleva + zoom da mídia), tray de stories emoldurada, skeleton neutro. Colunas (Auto/2/3/4), densidade, sombra/legenda/contadores são FLAGS no painel. Galeria navega por scroll horizontal do mouse/trackpad. Em STORIES o player vira só a barra de progresso (scrub) — o post original fica intacto (nada de subir o reply). v3.5: o MESMO mosaico (proporção real) também no /explore/ e nos perfis (/usuario/) — tiles só-mídia, reels com preview no hover, clique abre em modal; flags Grid no Explore / Grid no perfil / Grid nos salvos (off por padrão; EXPLORE e SALVOS usam o MESMO card da home (header + barra de ação like/comentar/compartilhar/salvar + legenda), clicar abre modal; perfil segue como tile só-mídia. Salvos: o "salvar" vira REMOVER, + MULTISSELEÇÃO no header pra remover/mover vários pra coleção de uma vez. Ações do grid via API (like/save). v3.6: largura/colunas/densidade viram ajustes de CONTEÚDO que valem pra home, explore E perfil (a coluna toda do perfil acompanha a largura); thumbnails dos tiles usam a versão pequena da API (carregam bem mais rápido). v3.12: o mosaico vira GRADE UNIFORME — todos os itens com a MESMA altura (mídia em 4:5, faixas de altura fixa), em CSS Grid. O motor de masonry em JS (posicionamento absoluto, medição por card, congelamento de coluna, re-empacotamento a cada imagem que carregava) foi REMOVIDO: o layout não tem mais custo proporcional ao tamanho da sessão. Carregamento reescrito junto: content-visibility pula layout/paint/decode do que está fora da tela, srcset+sizes baixam a variante do tamanho da coluna em vez da imagem cheia, render em lote por DocumentFragment, e o carregar-mais ficou menos agressivo (3 páginas por disparo, lookahead de ~2 telas). v3.13: proporção 4:6 (mais vertical) e o MESMO card completo — header com avatar/nome, barra de ação (curtir, comentar, repostar, copiar link, salvar) e legenda — em TODAS as superfícies; o perfil deixou de ser tile só-mídia. Legenda maior e mais legível: UMA linha, com "mais" no fim dela que abre a descrição INTEIRA por cima da mídia (sem mudar a altura do card, então a grade não se mexe); na home ela agora vem também da API quando o <h1> do post não renderiza. v3.14: hover-to-play reescrito — debounce na entrada (atravessar a grade não dispara nada), o vídeo SOBREVIVE ao fim do hover (volta instantâneo, sem re-download) sob um LRU curto, só aparece quando tem frame (fim do piscar preto) e o hover vale o card inteiro; clicar em comentar SEMPRE abre a overlay (espera o post renderizar em vez de desistir e redirecionar); e o skeleton de carregamento saiu do overlay em tela cheia para dentro da própria grade. v3.15: @menções e #hashtags da legenda viram links (cor de link do IG); COMPORTAMENTO ÚNICO em todas as páginas — clicar no item abre a modal, seja foto, vídeo ou galeria, na home, no explore, no perfil e nos salvos (o clique no vídeo não muta mais); e o player ganhou botão de SOM fixo no canto (34px, sempre visível, em vez do mute escondido na fileira do hover) com a barra de progresso nas cores do Instagram no lugar do azul. v3.16: SEGUIR, CURTIR e SALVAR passam a ir pela API (o pk do autor sai do post, da API ou do perfil) em vez de depender do botão nativo dentro do <article> virtualizado — na home o seguir não fazia nada e o curtir chegava a NAVEGAR pro post; agora há fallback no botão nativo e aviso quando nada funciona, nunca silêncio. Header do perfil ocupa a largura toda do conteúdo (era um bloco estreito com um vazio ao lado) e ganhou botão de COPIAR o @ ao lado do nome. v3.17: o alargamento do header de perfil da v3.16 foi REVERTIDO (mexer em flex/min-width dos filhos colapsava o texto para uma letra por linha) — ele volta a crescer só por zoom, e o botão de copiar o @ continua. TRÁFEGO: cada foto era baixada DUAS vezes — o <img> nativo off-screen pedia uma variante do srcset e o nosso card pedia outra; agora copiamos srcset+sizes do nativo (mesma escolha = cache hit) e o avatar deixou de cair na própria mídia do post quando o alt não é reconhecível. Medido em bancada: 24 requisições de imagem para 12 posts caíram para 12. Vídeo da lista nativa é pausado no evento `play` (não mais até 1s depois, já bufferizando), a janela off-screen caiu de 150vh para 90vh, o carregar-mais puxa 2 páginas por disparo em vez de 3, e o scroll só sincroniza a lista nativa quando algum vídeo visível depende dela. v3.18 (SALVOS): a barra de seleção GRUDA no topo enquanto está ligada (numa limpeza longa não é mais preciso voltar ao topo pra clicar em Remover), ganhou botão 'Todos', barra de PROGRESSO com contador durante a remoção em lote e um 'Parar' pra abortar no meio. O item removido dos salvos NÃO some mais da página: escurece e ganha o selo 'removido', saindo de vez só no próximo carregamento — assim a grade não reflui embaixo do cursor e não se perde a posição no meio da limpeza; o que falhar fica marcado em vermelho. v3.20: proporção passa a 9:16 (a mais alta que o IG produz, de reels/stories) — um reel cabe inteiro, sem corte. Conteúdo mais LARGO que a caixa não é ampliado pra preencher: entra inteiro (contain) com o fundo preenchido por uma cópia borrada da própria mídia, em vez de mostrar só uma faixa ampliada do meio. E o conteúdo ganhou respiro lateral em qualquer largura de janela (antes, com a janela estreita, os cards encostavam no nav de um lado e na borda do outro). O teto de altura por viewport da v3.19 foi revertido. Prefs em localStorage.
// @author       oguilhermelima
// @match        https://www.instagram.com/*
// @run-at       document-start
// @grant        GM_addStyle
// @grant        unsafeWindow
// ==/UserScript==

(function () {
    "use strict";

    if (window.top !== window.self) return;   // ignora iframes embutidos

    /* ==================================================================== *
     * FILOSOFIA — só ADICIONO, nunca escondo/movo elemento do Instagram.
     *   • Trilha fina sempre visível no rodapé do vídeo = "player integrado".
     *   • Fileira de botões só no hover, num gradiente curto.
     *   • pointer-events:none no container; auto só nos widgets → todo o
     *     resto da overlay do IG (like/coment/legenda/áudio/tap-pra-pausar)
     *     continua clicável e visível. Diferente do script de referência,
     *     que faz opacity:0 + reposiciona os botões nativos.
     *
     * GUARDS (perf) — observer DEBOUNCED + WeakSet por nó + poda por
     *   isConnected; sem polling permanente. AbortController por vídeo limpa
     *   todos os listeners de uma vez no destroy.
     * ==================================================================== */

    /* ------------------------------------------------------------------ *
     * Config / defaults (persistidos em localStorage)
     * ------------------------------------------------------------------ */
    const PREFS_KEY = "igvc:prefs";
    const SPEEDS = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2, 2.5, 3, 4];
    const SEEK = 5;            // segundos por seek (J/L/setas)
    const VOL_STEP = 0.05;     // passo de volume (setas ↑/↓)
    const HIDE_DELAY = 1600;   // ms até esconder a fileira após o cursor parar
    const MIN_SIZE = 80;       // px — ignora vídeos minúsculos/sem layout

    // Painel de ajustes — MESMO modelo do reddit/twitter: GROUPS (source of truth) → FAB + painel
    // flutuante de toggles/sliders. Cada item vira uma flag em `prefs`. O PLAYER de vídeo não é flag
    // (sempre ligado); volume/speed seguem como estado vivo do player (ajustados pelos controles, fora
    // do painel). `dep` esmaece o item quando a flag-pai está off; `hint` vira a linha de descrição.
    const GROUPS = [
        { title: "Feed (home)", items: [
            { key: "masonry",   label: "Feed em mosaico",        hint: "Troca o feed da home por cards em multicolunas (masonry). Off = feed nativo do IG.", def: false },
            { key: "hideRail",  label: "Esconder coluna direita", hint: "Remove a barra lateral direita (perfil/sugestões/rodapé) no feed em mosaico.", def: true, dep: "masonry" },
            { key: "pinNav",    label: "Fixar menu lateral",      hint: "Trava a largura do menu esquerdo (sem expandir no hover).", def: true, dep: "masonry" },
            { key: "showCaption", label: "Mostrar legenda",       hint: "Exibe a legenda (até 2 linhas) abaixo de cada card. (só home)", def: true, dep: "masonry" },
            { key: "showCounts",  label: "Mostrar contadores",    hint: "Exibe curtidas/comentários/reposts na barra de ações. (só home)", def: true, dep: "masonry" },
        ] },
        { title: "Grid (Explore / Perfil / Salvos)", items: [
            { key: "gridExplore", label: "Grid no Explore", hint: "Troca a grade quadrada do /explore/ por um mosaico em proporção REAL (tiles só-mídia, clicar abre em modal).", def: false },
            { key: "gridProfile", label: "Grid no perfil",  hint: "Mesmo mosaico na grade de posts dos perfis (/usuario/). Off = grade quadrada nativa.", def: false },
            { key: "gridSaved",   label: "Grid nos salvos", hint: "Mosaico na página de Salvos (/usuario/saved/), com barra de ação em cada tile pra REMOVER dos salvos direto. Também liga junto com 'Grid no perfil'.", def: false },
        ] },
        { title: "Mosaico — largura · colunas · densidade", items: [   // valem p/ TODAS as superfícies (home + explore + perfil)
            { key: "feedWidth", label: "Largura do conteúdo",     hint: "Largura máxima do bloco de conteúdo — vale pra home, explore E perfil.", type: "slider", min: 960, max: 1840, def: 1320, unit: "px", step: 20 },
            { key: "cols",      label: "Colunas",                 hint: "Nº de colunas do mosaico (Auto se adapta à largura). 3 é o recomendado; 4 carrega muito mais mídia por tela e pode causar lentidão.", type: "select", def: "auto",
              options: [{ value: "auto", label: "Auto" }, { value: "2", label: "2" }, { value: "3", label: "3 (Recomendado)" }, { value: "4", label: "4 (pode travar)" }] },
            { key: "density",   label: "Densidade",               hint: "Compacto = colunas mais estreitas, menos respiro, mais itens na tela.", type: "select", def: "comfortable",
              options: [{ value: "comfortable", label: "Confortável" }, { value: "compact", label: "Compacto" }] },
            { key: "cardShadow",  label: "Sombra nos cards",      hint: "Eleva os cards/tiles com sombra (resting + realce no hover). Off = só borda.", def: true },
        ] },
        { title: "Vídeo", items: [
            { key: "autoUnmute", label: "Auto-desmutar vídeos", hint: "Tira o mudo dos vídeos novos automaticamente (o player respeita seu mute manual).", def: false },
            { key: "stories",    label: "Player nos stories",   hint: "Mostra a barra do player (no hover) também em /stories/.", def: true },
            { key: "keyboard",   label: "Atalhos de teclado",   hint: "Espaço/K play, J/L e setas seek, M mudo, F tela cheia, ,/. frame, [ ] velocidade…", def: true },
        ] },
        { title: "Interface", items: [
            { key: "hideMessages", label: "Esconder dock de mensagens", hint: "Remove o balão flutuante de Mensagens no canto inferior.", def: false },
            { key: "backToTop",    label: "Botão voltar ao topo",       hint: "Mostra um botão pra rolar ao topo quando você desce a página.", def: false },
        ] },
    ];
    const ITEMS = GROUPS.flatMap((g) => g.items);
    const DEFAULTS = Object.assign(
        { volume: 0.6, speed: 1 },   // estado vivo do player (não exposto no painel)
        Object.fromEntries(ITEMS.map((i) => [i.key, i.def])),
    );

    let prefs = loadPrefs();
    function loadPrefs() {
        try { return Object.assign({}, DEFAULTS, JSON.parse(localStorage.getItem(PREFS_KEY) || "{}")); }
        catch { return Object.assign({}, DEFAULTS); }
    }
    function savePrefs() {
        try { localStorage.setItem(PREFS_KEY, JSON.stringify(prefs)); } catch { /* quota/priv */ }
    }
    const savePrefsSoon = debounce(savePrefs, 400);

    /* ------------------------------------------------------------------ *
     * Helpers
     * ------------------------------------------------------------------ */
    function addStyle(css) {
        if (typeof GM_addStyle === "function") return GM_addStyle(css);
        const s = document.createElement("style");
        s.textContent = css;
        (document.head || document.documentElement).appendChild(s);
        return s;
    }
    function debounce(fn, ms) {
        let t;
        return function (...a) { clearTimeout(t); t = setTimeout(() => fn.apply(this, a), ms); };
    }
    const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
    const isHover = (n) => { try { return n.matches(":hover"); } catch { return false; } };

    // Builder de DOM mínimo. props: class/html/style(obj)/on<Event>/attr.
    function el(tag, props, ...kids) {
        const n = document.createElement(tag);
        if (props) for (const [k, v] of Object.entries(props)) {
            if (v == null) continue;
            if (k === "class") n.className = v;
            else if (k === "html") n.innerHTML = v;
            else if (k === "style" && typeof v === "object") Object.assign(n.style, v);
            else if (k.startsWith("on") && typeof v === "function") n.addEventListener(k.slice(2).toLowerCase(), v);
            else n.setAttribute(k, v);
        }
        for (const kid of kids) if (kid != null) n.append(kid.nodeType ? kid : document.createTextNode(String(kid)));
        return n;
    }

    /* ================================================================== *
     * Captura de mídia da API do IG (fetch + XHR + JSON inline).
     *   Os <video> do feed são blob:/MSE — NÃO dá pra reusar de forma
     *   confiável (o IG vira a MediaSource ao virtualizar → preto). Mas a
     *   API entrega as URLs .mp4 REAIS em `video_versions[]`. Eu capturo-as
     *   por `code` (shortcode) e toco MEU PRÓPRIO <video src=mp4> → robusto,
     *   recriável a cada hover, sem emprestar nada do IG.
     * ================================================================== */
    const igMedia = new Map();              // code -> { isVideo, videoUrl, imageUrl, w, h, author, avatar, caption, likes, comments, pk }
    let igAppId = "936619743392459";        // X-IG-App-ID do web (default; atualizado pelo interceptor) — p/ o unsave direto
    function fmtCountNum(n) {
        if (n == null || n === "" || isNaN(n)) return "";
        n = +n;
        if (n >= 1e6) return (n / 1e6).toFixed(n % 1e6 ? 1 : 0).replace(/\.0$/, "") + "M";
        if (n >= 1e3) return (n / 1e3).toFixed(n % 1e3 ? 1 : 0).replace(/\.0$/, "") + "K";
        return String(n);
    }
    function smallestVideo(vs) {            // menor resolução disponível = preview leve (menos travamento)
        let best = null;
        for (const v of vs) if (v && v.url && (!best || (v.width || 0) < (best.width || 1e9))) best = v;
        return best ? best.url : "";
    }
    function pickImage(cand) {              // candidato ~médio (nem o maior, nem o menor)
        if (!cand || !cand.length) return "";
        const s = cand.slice().sort((a, b) => (b.width || 0) - (a.width || 0));
        return (s[Math.min(1, s.length - 1)] || s[0]).url || "";
    }
    function pickThumb(cand) {              // THUMBNAIL leve p/ os tiles do grid: o MENOR candidato ainda nítido (≥360px) → carrega rápido
        if (!cand || !cand.length) return "";
        const s = cand.slice().sort((a, b) => (a.width || 0) - (b.width || 0));   // asc
        return (s.find((c) => (c.width || 0) >= 360) || s[s.length - 1]).url || "";
    }
    function ingestNode(m) {                // normaliza UM item de mídia da API → igMedia[code]
        if (!m || typeof m !== "object" || !m.code) return;
        const hasV = !!(m.video_versions && m.video_versions.length);
        let imageUrl = pickImage(m.image_versions2 && m.image_versions2.candidates);
        let thumbUrl = pickThumb(m.image_versions2 && m.image_versions2.candidates);
        let w = m.original_width || 0, h = m.original_height || 0;
        let isVideo = hasV, videoUrl = hasV ? smallestVideo(m.video_versions) : "";
        let carousel = null;
        if (m.carousel_media && m.carousel_media.length) {     // carrossel: guardo TODOS os slides p/ navegar (setas)
            carousel = m.carousel_media.map((c) => {
                const cv = !!(c.video_versions && c.video_versions.length);
                return {
                    isVideo: cv, videoUrl: cv ? smallestVideo(c.video_versions) : "",
                    imageUrl: pickImage(c.image_versions2 && c.image_versions2.candidates),
                    thumbUrl: pickThumb(c.image_versions2 && c.image_versions2.candidates),
                    w: c.original_width || 0, h: c.original_height || 0,
                };
            });
            const f = m.carousel_media[0];                     // capa = 1º slide (o card não auto-toca; quem toca é o slide)
            if (!imageUrl) imageUrl = pickImage(f.image_versions2 && f.image_versions2.candidates);
            if (!thumbUrl) thumbUrl = pickThumb(f.image_versions2 && f.image_versions2.candidates);
            if (!w && f.original_width) { w = f.original_width; h = f.original_height; }
            isVideo = false; videoUrl = "";
        }
        if (!imageUrl && !videoUrl) return;
        const prev = igMedia.get(m.code) || {};
        igMedia.set(m.code, {
            isVideo: isVideo || prev.isVideo, videoUrl: videoUrl || prev.videoUrl || "", imageUrl: imageUrl || prev.imageUrl || "",
            thumbUrl: thumbUrl || prev.thumbUrl || "",
            pk: (m.pk || (m.id && String(m.id).split("_")[0])) || prev.pk || "",   // media pk → unsave/like/save via API
            authorPk: (m.user && m.user.pk) || prev.authorPk || "",                // user pk → follow via API
            following: (m.user && m.user.friendship_status) ? !!m.user.friendship_status.following : prev.following,   // já segue? (se a API trouxer)
            carousel: carousel || prev.carousel || null,
            w: w || prev.w || 0, h: h || prev.h || 0,
            author: (m.user && m.user.username) || prev.author || "",
            avatar: (m.user && m.user.profile_pic_url) || prev.avatar || "",
            caption: (m.caption && (m.caption.text || (typeof m.caption === "string" ? m.caption : ""))) || prev.caption || "",
            likes: fmtCountNum(m.like_count) || prev.likes || "",
            comments: fmtCountNum(m.comment_count) || prev.comments || "",
        });
    }
    const igCollections = new Map();        // collection_id -> collection_name (capturadas do tráfego do IG)
    function walkForMedia(node, depth) {    // varre o JSON inteiro atrás de itens de mídia (schema aninhado/variável)
        if (!node || typeof node !== "object" || depth > 12) return;
        if (Array.isArray(node)) { for (const x of node) walkForMedia(x, depth + 1); return; }
        if (node.code && (node.video_versions || node.image_versions2 || node.carousel_media)) ingestNode(node);
        if (node.collection_id && node.collection_name) igCollections.set(String(node.collection_id), String(node.collection_name));   // coleções de salvos
        for (const k in node) { const v = node[k]; if (v && typeof v === "object") walkForMedia(v, depth + 1); }
    }
    function ingestText(text) {
        if (!text || text.length < 40 || (text.indexOf("video_versions") < 0 && text.indexOf("image_versions2") < 0 && text.indexOf("collection_id") < 0)) return;
        let j; try { j = JSON.parse(text); } catch (_) { return; }
        try { walkForMedia(j, 0); } catch (_) { /**/ }
        try { queueMetaUpdate(); } catch (_) { /**/ }   // igMedia atualizou → preenche header/legenda dos cards já renderizados
    }
    // PERF: respostas interceptadas chegam no MEIO do scroll (paginação) — o 2º JSON.parse (centenas de KB)
    // + walk recursivo na main thread viravam spike de jank empilhado no parse do próprio IG. igMedia só é
    // consultado no hover/build do card → algumas centenas de ms de atraso são de graça.
    const ingestSoon = (text) => {
        if (typeof requestIdleCallback === "function") requestIdleCallback(() => ingestText(text), { timeout: 500 });   // timeout menor → metadados (autor/legenda) chegam mais cedo
        else setTimeout(() => ingestText(text), 120);
    };
    // intercepta fetch + XHR no contexto da PÁGINA p/ ler as respostas da API (graphql/feed)
    function installInterceptors() {
        const W = (typeof unsafeWindow !== "undefined") ? unsafeWindow : window;
        const wanted = (u) => /graphql|\/api\/v1\/|\/api\/graphql|feed\/timeline/i.test(u || "");
        try {
            const of = W.fetch;
            if (typeof of === "function" && !of.__igPatched) {
                W.fetch = function (...a) {
                    try {   // captura o X-IG-App-ID das chamadas do IG → usado no unsave direto da página de salvos
                        const h = a[1] && a[1].headers;
                        if (h) { const g = h.get ? (k) => h.get(k) : (k) => h[k] || h[String(k).toLowerCase()]; const id = g("x-ig-app-id") || g("X-IG-App-ID"); if (id) igAppId = id; }
                    } catch (_) { /**/ }
                    const pr = of.apply(this, a);
                    try {
                        pr.then((res) => {
                            try { if (res && wanted(res.url)) res.clone().text().then(ingestSoon).catch(() => {}); } catch (_) { /**/ }
                        }).catch(() => {});
                    } catch (_) { /**/ }
                    return pr;
                };
                W.fetch.__igPatched = true;
            }
        } catch (_) { /**/ }
        try {
            const XHR = W.XMLHttpRequest;
            if (XHR && XHR.prototype && !XHR.prototype.__igPatched) {
                const oOpen = XHR.prototype.open, oSend = XHR.prototype.send;
                XHR.prototype.open = function (m, u) { this.__igUrl = u; return oOpen.apply(this, arguments); };
                XHR.prototype.send = function () {
                    try { this.addEventListener("load", () => { try { if (wanted(this.__igUrl) && (!this.responseType || this.responseType === "text")) ingestSoon(this.responseText); } catch (_) { /**/ } }); } catch (_) { /**/ }
                    return oSend.apply(this, arguments);
                };
                XHR.prototype.__igPatched = true;
            }
        } catch (_) { /**/ }
    }
    function ingestInlineJSON() {           // posts iniciais vêm server-rendered no HTML (não via fetch)
        try { for (const s of document.querySelectorAll('script[type="application/json"]')) ingestText(s.textContent || ""); } catch (_) { /**/ }
    }
    installInterceptors();                  // JÁ no document-start (antes do bundle do IG pegar o fetch)
    const codeOf = (key) => { const m = (key || "").match(/\/(?:p|reel)\/([^/?#]+)/); return m ? m[1] : ""; };
    function fmt(s) {
        if (!isFinite(s) || s < 0) s = 0;
        s = Math.floor(s);
        const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), ss = s % 60;
        const p = (n) => String(n).padStart(2, "0");
        return h ? `${h}:${p(m)}:${p(ss)}` : `${m}:${p(ss)}`;
    }
    const speedLabel = (r) => r + "×";
    const isStory = () => location.pathname.startsWith("/stories/");
    function isEditable(node) {
        const a = node || document.activeElement;
        return !!(a && (a.isContentEditable || /^(input|textarea|select)$/i.test(a.tagName) ||
            a.getAttribute && a.getAttribute("role") === "textbox" ||
            (a.closest && a.closest('input,textarea,select,[contenteditable=""],[contenteditable="true"],[role="textbox"]'))));
    }

    /* ------------------------------------------------------------------ *
     * Ícones (Material, fill:currentColor)
     * ------------------------------------------------------------------ */
    const svg = (p) => `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${p}"/></svg>`;
    const ICONS = {
        play: svg("M8 5v14l11-7z"),
        pause: svg("M6 19h4V5H6v14zm8-14v14h4V5h-4z"),
        volHigh: svg("M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z"),
        volLow: svg("M18.5 12c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM5 9v6h4l5 5V4L9 9H5z"),
        volMute: svg("M16.5 12c0-1.77-1.02-3.29-2.5-4.03v2.21l2.45 2.45c.03-.2.05-.41.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51C20.63 14.91 21 13.5 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3 3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06c1.38-.31 2.63-.95 3.69-1.81L19.73 21 21 19.73 4.27 3zM12 4 9.91 6.09 12 8.18V4z"),
        pip: svg("M19 7h-8v6h8V7zm2-4H3c-1.1 0-2 .9-2 2v14c0 1.11.9 2 2 2h18c1.1 0 2-.89 2-2V5c0-1.1-.9-2-2-2zm0 16.01H3V4.98h18v14.03z"),
        fs: svg("M7 14H5v5h5v-2H7v-3zm-2-4h2V7h3V5H5v5zm12 7h-3v2h5v-5h-2v3zM14 5v2h3v3h2V5h-5z"),
        fsExit: svg("M5 16h3v3h2v-5H5v2zm3-8H5v2h5V5H8v3zm6 11h2v-3h3v-2h-5v5zm2-11V5h-2v5h5V8h-3z"),
        gear: svg("M19.14 12.94c.04-.3.06-.61.06-.94 0-.32-.02-.64-.07-.94l2.03-1.58a.49.49 0 0 0 .12-.61l-1.92-3.32a.488.488 0 0 0-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54a.484.484 0 0 0-.48-.41h-3.84a.484.484 0 0 0-.48.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96a.488.488 0 0 0-.59.22L2.74 8.87a.49.49 0 0 0 .12.61l2.03 1.58c-.05.3-.09.63-.09.94s.02.64.07.94l-2.03 1.58a.49.49 0 0 0-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6z"),
    };

    /* ------------------------------------------------------------------ *
     * CSS
     * ------------------------------------------------------------------ */
    addStyle(`
.igvc-host{ position:relative; isolation:isolate; --igvc-bar-h:44px; }

/* IG nativo (modo padrão/feed): escondo o controle de volume do IG — temos o nosso —
   e subo o botão de "marcados" pra não ficar atrás da barra. Em stories esses
   elementos vivem no header (fora do host), então a regra é naturalmente só do feed. */
.igvc-host div[role="slider"][aria-label*="olume" i],
.igvc-host [role="slider"]:has(svg[aria-label*="Audio" i]),
.igvc-host button[aria-label*="Toggle audio" i]{ display:none !important; }
.igvc-host div:has(> button svg[aria-label*="Tag" i]),
.igvc-host div:has(> button svg[aria-label*="marca" i]){
  bottom:calc(var(--igvc-bar-h,44px) + 8px) !important; top:auto !important;
}
/* a barra cobre o vídeo inteiro (pointer-events:none) só pra poder ancorar o botão de SOM no topo;
   trilha e fileira seguem coladas no rodapé. Em story a barra continua sendo só a trilha. */
.igvc-bar:not(.igvc-story){ top:0; }
.igvc-bar{
  position:absolute; left:0; right:0; bottom:0; z-index:2147483647;
  pointer-events:none; color:#fff;
  font:500 12px/1.4 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;
  -webkit-font-smoothing:antialiased;
  user-select:none; -webkit-user-select:none;
}
/* gradiente só no hover, atrás da fileira */
.igvc-bar::before{
  content:""; position:absolute; left:0; right:0; bottom:0; height:68px;
  background:linear-gradient(to top, rgba(0,0,0,.55), rgba(0,0,0,0));
  opacity:0; transition:opacity .2s ease; pointer-events:none;
}
.igvc-bar.igvc-show::before{ opacity:1; }

/* BOTÃO DE SOM — o mute/desmute mais usado do player, então ele fica SEMPRE à mostra no canto
   (não escondido na fileira que só aparece no hover) e num alvo grande de 34px. */
.igvc-sound{
  position:absolute; top:10px; right:10px; z-index:4; pointer-events:auto;
  width:34px; height:34px; padding:0; border:0; border-radius:50%; cursor:pointer;
  display:flex; align-items:center; justify-content:center;
  background:rgba(0,0,0,.55); color:#fff; opacity:.88;
  transition:opacity .15s ease, background .15s ease, transform .12s ease;
}
.igvc-sound:hover{ opacity:1; background:rgba(0,0,0,.78); transform:scale(1.06); }
.igvc-sound svg{ width:18px; height:18px; fill:currentColor; display:block; }
/* mudo = estado "chamando atenção" (é o clique que o usuário mais quer dar) */
.igvc-sound.igvc-muted{ background:rgba(0,0,0,.68); }
.igvc-host.igvc-fs .igvc-sound{ width:42px; height:42px; top:16px; right:16px; }
.igvc-host.igvc-fs .igvc-sound svg{ width:22px; height:22px; }

/* trilha de progresso — sempre visível, fininha; engorda no hover */
.igvc-track{
  position:absolute; left:0; right:0; bottom:0; height:3px; z-index:2;   /* ACIMA da row: senão a fileira (irmã posterior) tapa a trilha no hover e o seek não pega */
  pointer-events:auto; cursor:pointer; touch-action:none;
  background:rgba(255,255,255,.22); transition:height .12s ease;
}
.igvc-bar.igvc-show .igvc-track{ height:9px; }
.igvc-buffered{ position:absolute; left:0; top:0; bottom:0; width:0; background:rgba(255,255,255,.32); }
/* progresso nas cores do INSTAGRAM (era o azul de sistema). O gradiente é pintado no tamanho da
   TRILHA e recortado pela largura da fill (background-attachment não serve aqui) → as cores ficam
   ancoradas na barra em vez de esticarem/andarem conforme o vídeo avança. */
.igvc-track{ --igvc-grad:linear-gradient(90deg,#feda75 0%,#fa7e1e 25%,#d62976 55%,#962fbf 78%,#4f5bd5 100%); }
.igvc-fill{ position:absolute; left:0; top:0; bottom:0; width:0; overflow:hidden; }
.igvc-fill::before{ content:""; position:absolute; left:0; top:0; bottom:0; width:420px; background:var(--igvc-grad); }
/* com container queries o gradiente casa exatamente a largura da trilha (o 420px acima é o fallback) */
@supports (width: 100cqw){
  .igvc-track{ container-type:inline-size; }
  .igvc-fill::before{ width:100cqw; }
}
.igvc-thumb{
  position:absolute; top:50%; left:0; width:12px; height:12px; margin-left:-6px;
  border-radius:50%; background:#fff; box-shadow:0 0 0 2px #d62976, 0 1px 4px rgba(0,0,0,.5); pointer-events:none;
  transform:translateY(-50%) scale(0); transition:transform .12s ease;
}
.igvc-bar.igvc-show .igvc-thumb{ transform:translateY(-50%) scale(1); }

/* fileira de botões — escondida até hover. pointer-events:none no container,
   auto só nos widgets, pra clique fora dos botões cair na overlay do IG. */
.igvc-row{
  position:absolute; left:0; right:0; bottom:0; z-index:1;   /* abaixo da trilha (a trilha precisa pegar o clique de seek na faixa de baixo) */
  display:flex; align-items:center; gap:4px; padding:6px 8px 11px;
  pointer-events:none; opacity:0; transform:translateY(6px);
  transition:opacity .18s ease, transform .18s ease;
}
/* com o player visível, a faixa inferior INTEIRA captura o clique (largura toda) —
   aí a guarda anti-nav da barra engole, e miss-click "pro lado" não navega pro post. */
.igvc-bar.igvc-show .igvc-row{ opacity:1; transform:none; pointer-events:auto; }
.igvc-row .igvc-spacer{ flex:1 1 auto; }
.igvc-btn{
  pointer-events:auto; display:inline-flex; align-items:center; justify-content:center;
  flex:0 0 auto; width:30px; height:30px; padding:0; border:0; border-radius:8px;
  background:transparent; color:#fff; cursor:pointer; opacity:.92;
  transition:background .15s ease, opacity .15s ease;
}
.igvc-btn:hover{ background:rgba(255,255,255,.18); opacity:1; }
.igvc-btn svg{ width:20px; height:20px; fill:currentColor; display:block; }
.igvc-time{
  pointer-events:none; font-variant-numeric:tabular-nums; opacity:.96;
  padding:0 4px; white-space:nowrap; text-shadow:0 1px 2px rgba(0,0,0,.5);
}
.igvc-speed{ width:auto; min-width:36px; padding:0 6px; font-weight:700; font-size:12px; }

/* volume: slider some até hover do grupo */
.igvc-vol{ display:flex; align-items:center; pointer-events:auto; }
.igvc-vol .igvc-range{ width:0; opacity:0; transition:width .18s ease, opacity .18s ease; }
.igvc-vol.igvc-vol-open .igvc-range, .igvc-vol:focus-within .igvc-range{ width:70px; opacity:1; }
input.igvc-range{
  -webkit-appearance:none; appearance:none; pointer-events:auto;
  height:4px; border-radius:2px; background:rgba(255,255,255,.4); margin:0 4px; cursor:pointer;
  touch-action:none; -webkit-user-drag:none;
}
input.igvc-range::-webkit-slider-thumb{ -webkit-appearance:none; width:12px; height:12px; border-radius:50%; background:#fff; cursor:pointer; }
input.igvc-range::-moz-range-thumb{ width:12px; height:12px; border:0; border-radius:50%; background:#fff; cursor:pointer; }

/* popover de velocidade (config saiu pro painel flutuante) */
.igvc-pop{
  position:absolute; bottom:46px; min-width:84px; padding:6px;
  background:rgba(18,18,18,.97); border:1px solid rgba(255,255,255,.12);
  border-radius:10px; box-shadow:0 8px 24px rgba(0,0,0,.45);
  display:none; flex-direction:column; gap:2px; pointer-events:auto;
}
.igvc-pop.igvc-open{ display:flex; }
.igvc-pop-speed{ right:84px; min-width:84px; }
.igvc-pop button{ background:transparent; border:0; color:#fff; text-align:left; padding:6px 10px; border-radius:6px; cursor:pointer; font:inherit; white-space:nowrap; }
.igvc-pop button:hover{ background:rgba(255,255,255,.12); }
.igvc-pop button.igvc-on{ color:#0095f6; font-weight:700; }

/* stories: do nosso player fica SÓ a barra de progresso (scrub) — o post original (reply, like,
   tudo) permanece INTACTO. Sem gradiente e sem a fileira de botões (não montados em story). */
.igvc-bar.igvc-story::before{ display:none; }

/* fullscreen no host: centraliza o vídeo, barra um tico maior */
.igvc-host:fullscreen, .igvc-host.igvc-fs{ width:100vw; height:100vh; background:#000; display:flex; align-items:center; justify-content:center; }
.igvc-host:fullscreen video, .igvc-host.igvc-fs video{ max-width:100vw; max-height:100vh; width:auto; height:auto; margin:auto; }
.igvc-host.igvc-fs .igvc-btn svg{ width:24px; height:24px; }
.igvc-host.igvc-fs .igvc-track{ height:5px; }
.igvc-host.igvc-fs .igvc-time{ font-size:13px; }
`);

    /* ------------------------------------------------------------------ *
     * CSS — feed da home em MOSAICO (multicolunas estilo dashboard)
     *   • só ADITIVO: alargo os wrappers de largura do route do feed e troco
     *     a coluna única por CSS `columns`. Cards = os próprios <article>.
     *   • tema-aware: cores via as vars do IG (--ig-elevated-background etc),
     *     com fallback dark, então respeita claro/escuro.
     * ------------------------------------------------------------------ */
    addStyle(`
/* largura: solto os caps de 470/630px do route do feed (NÃO toco no <main>, que é shell) */
.igm-wide{ max-width:none !important; width:100% !important; --x-width:100% !important; --x-maxWidth:100% !important; }

/* right rail (perfil/sugestões/footer) — irmão da coluna do feed na "row" */
.igm-norail{ display:none !important; }

/* vars tunáveis: nav (offset) e largura máx do bloco de conteúdo (≤3 colunas, preenchem) */
:root{ --igm-navw:72px; --igm-maxw:1320px; }

/* nav esquerdo fixo: pino a largura (= --igm-navw) e mato a transition (sem hover-expand) */
.igm-navpin{ width:var(--igm-navw) !important; min-width:var(--igm-navw) !important; max-width:var(--igm-navw) !important; flex:0 0 var(--igm-navw) !important; transition:none !important; }

/* a coluna do feed começa em x=0 (nav é overlay fixo, não ocupa fluxo) → desloco o
   conteúdo pela largura do nav. */
.igm-col{ box-sizing:border-box !important; padding-left:var(--igm-navw) !important; }

/* wrapper comum que contém stories E cards: capo aqui (max-width + margin auto) → o
   bloco inteiro (stories + grid) centra no espaço útil e fica alinhado por construção. */
.igm-content{ max-width:var(--igm-maxw) !important; width:100% !important; margin-left:auto !important; margin-right:auto !important; box-sizing:border-box !important; --x-width:100% !important; --x-maxWidth:100% !important; }
/* coluna do grid (explore/profile) que nasce SOB o nav fixo: maxw + padding do nav → conteúdo maxw centrado em (viewport − nav), igual à home */
.igm-gridnav{ max-width:calc(var(--igm-maxw) + var(--igm-navw)) !important; padding-left:var(--igm-navw) !important; }
/* perfil: o header (avatar/bio/stats) mantém a centragem nativa do IG, mas MAIOR (zoom) e com respiro no
   topo (o IG cola no topo). As abas (posts/reels/tagged) centralizadas. */
/* HEADER DO PERFIL — ocupa mais espaço via zoom (amplia o bloco inteiro sem tocar na estrutura).
   NÃO mexer em flex/min-width/max-width dos filhos: a v3.16 fez isso e quebrou feio — o min-width:0
   caiu num wrapper errado e o texto passou a quebrar UMA LETRA POR LINHA, com o avatar solto no meio.
   O layout interno do header é do IG; aqui só escalamos e damos respiro. */
.igm-gridcol header { zoom:1.28; padding-top:26px !important; }
/* botão de COPIAR o @ do perfil, ao lado do username */
.igp-copy{ margin-left:8px; vertical-align:middle; flex:0 0 auto;
  display:inline-flex; align-items:center; justify-content:center;
  width:26px; height:26px; padding:0; border:0; border-radius:8px; cursor:pointer;
  background:transparent; color:var(--ig-secondary-text, #a8a8a8); opacity:.85;
  transition:background .15s ease, color .15s ease; }
.igp-copy:hover{ background:rgba(255,255,255,.1); color:var(--ig-primary-text, #f5f5f5); opacity:1; }
.igp-copy svg{ width:17px; height:17px; display:block; }
.igp-copy.igf-copied{ color:#0095f6; }
.igm-gridcol [role="tablist"] { justify-content:center !important; }
/* explore/search: a barra de busca e o bloco de resultados acompanham a largura do conteúdo (best-effort) */
.igm-gridcol [role="search"], .igm-gridcol form[role="search"],
.igm-gridcol div:has(> input[aria-label*="esquis" i]), .igm-gridcol div:has(> input[aria-label*="earch" i]),
.igm-gridcol input[aria-label*="esquis" i], .igm-gridcol input[aria-label*="earch" i] { max-width:none !important; width:100% !important; }

/* garante a tray de stories preenchendo o bloco e alinhada à esquerda (não centrada/estreita) */
.igm-stories{ width:100% !important; max-width:none !important; margin-left:0 !important; margin-right:0 !important; }

/* === FEED PRÓPRIO (DOM NOSSO) ============================================ *
 * A lista nativa do IG fica VIVA mas fora de vista (.igf-src): continua sendo o
 * "fornecedor" de dados (harvest) e mantém o IG carregando ao rolar. Eu renderizo
 * CARDS meus (.igf-card) num container meu (.igf-feed).
 *
 * v3.12 — GRADE UNIFORME (era masonry em JS). Todo card tem a MESMA altura, dada
 * por CSS: mídia em aspect-ratio fixo + faixas de altura fixa (head/ações/legenda).
 * Consequências: zero medição de altura em JS, zero posicionamento absoluto, zero
 * re-layout quando uma imagem carrega — o layout é do compositor, não nosso. Como a
 * altura é conhecida ANTES de qualquer conteúdo chegar, "content-visibility:auto" +
 * "contain-intrinsic-size" fazem o browser PULAR layout/paint/decode dos cards fora
 * da tela sem nenhum pulo de scroll (o placeholder tem o tamanho exato do real). */
/* janela do fornecedor: cada post renderizado AQUI faz o IG baixar a mídia dele. 150vh mantinha ~3
   posts vivos por vez; 90vh corta esse consumo sem prejudicar o harvest (que lê atributo, não pixel). */
.igf-src{ position:fixed !important; top:0 !important; left:0 !important; width:480px !important; height:90vh !important; overflow-y:auto !important; opacity:0 !important; pointer-events:none !important; z-index:-1 !important; }
.igf-feed{ display:grid; grid-template-columns:repeat(var(--igf-ncols,3), minmax(0,1fr)); gap:var(--igf-gap,24px);
  width:100%; padding:8px 0 80px; box-sizing:border-box;
  --igf-ar:9/16;       /* proporção da mídia — a mais alta do IG (reels); igual pra todo item */
  /* faixas de altura FIXA: card = mídia + head + ações + legenda + respiro do rodapé.
     A legenda é UMA linha exata (line-height em px, caixa = padding-top + 1×linha, SEM padding-bottom:
     o overflow clipa na padding-box, então qualquer padding embaixo deixaria a 2ª linha espiando).
     O respiro do rodapé é do CARD, não da legenda. Mexer aqui = mexer em cardHeightFor(). */
  --igf-headh:48px; --igf-acth:40px; --igf-caph:25px; --igf-padb:9px;   /* legenda = 6 + 1×19 */
  --igf-pad:clamp(14px, 2vw, 30px);   /* respiro lateral do conteúdo (some quando a janela é larga) */
  --igf-cardh:520px;   /* altura estimada p/ contain-intrinsic-size (recalculada no layout) */
}
/* RESPIRO LATERAL — enquanto a janela é maior que o cap (--igm-maxw) sobra margem naturalmente, mas
   assim que ela encolhe o conteúdo passava a ENCOSTAR nas bordas (colado no nav de um lado e na borda
   do outro). O padding é do container e cresce com a janela, então vale em qualquer largura.
   As stories usam a MESMA medida pra ficarem alinhadas com a primeira coluna de cards. */
.igf-feed{ padding-left:var(--igf-pad); padding-right:var(--igf-pad); }
.igm-stories{ margin-left:var(--igf-pad) !important; margin-right:var(--igf-pad) !important; }
/* content-visibility: o card fora da viewport não entra em layout/paint (nem decodifica a imagem).
   contain-intrinsic-size dá a altura exata do que foi pulado → a barra de rolagem não pula. */
.igf-card{ position:relative; min-width:0; box-sizing:border-box; border-radius:14px; overflow:hidden; padding-bottom:var(--igf-padb);
  background:rgb(var(--ig-elevated-background, 32, 32, 32)); border:1px solid rgba(255,255,255,.08);
  content-visibility:auto; contain-intrinsic-size:auto var(--igf-cardh); }
.igf-head{ display:flex; align-items:center; gap:8px; padding:0 11px; height:var(--igf-headh); box-sizing:border-box; }
.igf-who{ display:flex; align-items:center; gap:8px; min-width:0; text-decoration:none; }
.igf-head img{ width:30px; height:30px; border-radius:50%; object-fit:cover; flex:0 0 auto; background:#222; }
.igf-head b{ font-size:13px; font-weight:600; color:var(--ig-primary-text, #f5f5f5); overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.igf-follow{ margin-left:auto; flex:0 0 auto; background:none; border:0; cursor:pointer; padding:6px 10px; border-radius:8px;
  color:#4a9eff; font-size:13px; font-weight:700; }
.igf-follow:hover{ background:rgba(255,255,255,.07); }
.igf-follow.on{ color:var(--ig-secondary-text, #aaa); font-weight:600; }
/* aspect-ratio FIXO (não a proporção real do post) = a fonte da uniformidade. "contain" isola o
   layout da mídia do resto: a imagem chegando não invalida o layout do feed inteiro. */
.igf-media{ display:block; position:relative; width:100%; aspect-ratio:var(--igf-ar);
  background:#0b0b0b; overflow:hidden; contain:layout paint; }
/* fade curto ao carregar: a caixa já está no tamanho final, então isto é só o pixel entrando —
   sem ele o card salta do fundo chapado pra imagem. ".on" é posto no load (ou já no cache). */
.igf-media img{ width:100%; height:100%; object-fit:cover; display:block; opacity:0; transition:opacity .16s linear; }
.igf-media img.on{ opacity:1; }
/* CONTEÚDO HORIZONTAL: numa caixa 9:16 o "cover" teria que ampliar absurdamente uma foto deitada —
   sobrava uma faixa do meio, sem contexto. Com .igf-fit ela ENTRA INTEIRA (contain), centralizada, e o
   espaço que sobra fica preenchido por uma cópia borrada da própria imagem, em vez de barra preta. */
.igf-media.igf-fit img, .igf-media.igf-fit video{ object-fit:contain !important; z-index:1; position:relative; }
.igf-media.igf-fit .igf-blur{ position:absolute; inset:0; z-index:0; background-size:cover; background-position:center;
  filter:blur(26px) saturate(1.25) brightness(.65); transform:scale(1.15); pointer-events:none; }
/* no hover a mídia dá um zoom leve; em conteúdo "contain" isso cortaria a imagem — aqui não amplia */
.igf-card:hover .igf-media.igf-fit img{ transform:none; }
/* vídeo: cover como a imagem — na grade uniforme, "contain" deixaria letterbox de tamanho variável.
   Entra TRANSPARENTE e só aparece com o 1º frame (.on, posto no loadeddata) → some o piscar preto. */
.igf-video video{ position:absolute !important; inset:0 !important; width:100% !important; height:100% !important; object-fit:cover !important;
  background:transparent; opacity:0; transition:opacity .2s ease; }
.igf-video.on video{ opacity:1; }
/* ▶ some enquanto TOCA; volta por cima do frame parado quando o hover sai (igf-paused) */
.igf-video.on:not(.igf-paused) .igf-play{ display:none; }
.igf-video.igf-paused .igf-play svg{ opacity:.75; }
.igf-play{ position:absolute; inset:0; display:flex; align-items:center; justify-content:center; pointer-events:none; }
.igf-play svg{ width:46px; height:46px; opacity:.92; filter:drop-shadow(0 1px 5px rgba(0,0,0,.55)); }
/* LEGENDA — o wrap tem a altura FIXA (é ele que mantém a uniformidade, mesmo sem legenda);
   a legenda mora COLADA no rodapé dele e, ao expandir, cresce PRA CIMA por cima da mídia.
   Assim "ver a descrição inteira" não muda a altura do card — a grade não se mexe. */
.igf-capwrap{ position:relative; height:var(--igf-caph); }
.igf-cap{ position:absolute; left:0; right:0; bottom:0; max-height:var(--igf-caph); overflow:hidden;
  padding:6px 12px 0; box-sizing:border-box; font-size:14px; line-height:19px; color:var(--ig-primary-text, #f5f5f5); }
.igf-cap b{ font-weight:600; }
/* @menções e #hashtags: cor de link do IG, clicáveis (não abrem/fecham o "mais") */
.igf-tag{ color:rgb(var(--ig-link, 0, 149, 246)); text-decoration:none; }
.igf-tag:hover{ text-decoration:underline; }
/* [data-capmore] = medido e TEM mais texto do que cabe (medição no 1º hover do card).
   O "mais" fica no FIM DA LINHA, com um degradê à esquerda pra emendar no texto cortado. */
.igf-card[data-capmore] .igf-cap{ cursor:pointer; }
.igf-card[data-capmore] .igf-capmore{ display:block; }
.igf-capmore{ display:none; position:absolute; right:0; bottom:0; z-index:3; border:0; cursor:pointer;
  padding:6px 12px 0 34px; font:600 13px/19px inherit; color:var(--ig-primary-text, #f5f5f5);
  background:linear-gradient(90deg, rgba(0,0,0,0), var(--igf-card-bg, #111) 34%); }
.igf-capmore:hover{ text-decoration:underline; }
/* aberta: rola dentro do próprio card, com fundo sólido pra não misturar com a mídia atrás */
.igf-card.igf-capopen .igf-cap{ max-height:calc(var(--igf-cardh) * .72); overflow-y:auto; overscroll-behavior:contain;
  z-index:2; padding-bottom:26px; background:var(--igf-card-bg, #111);
  border-top:1px solid var(--igf-line, rgba(255,255,255,.1)); box-shadow:0 -10px 24px rgba(0,0,0,.5); }
.igf-card.igf-capopen .igf-capmore{ background:var(--igf-card-bg, #111); padding-left:12px; border-radius:8px 0 0 0; }
/* barra de ações única abaixo da mídia (like/comment/repost/share … save) */
.igf-actions{ display:flex; align-items:center; gap:2px; padding:0 7px; height:var(--igf-acth); box-sizing:border-box; }
.igf-act{ display:inline-flex; align-items:center; gap:5px; background:none; border:0; cursor:pointer; padding:6px 7px; border-radius:8px;
  color:var(--ig-primary-text, #f5f5f5); font-size:13px; font-weight:600; line-height:1; }
.igf-act:hover{ background:rgba(255,255,255,.08); }
.igf-act svg{ width:22px; height:22px; display:block; }
.igf-act.igf-like.on svg{ fill:#ff3040; stroke:#ff3040; }
.igf-act.igf-save.on svg{ fill:currentColor; }
.igf-act-sp{ flex:1 1 auto; }
.igf-video{ cursor:pointer; }
/* loader: UM spinner no FIM do feed, SEMPRE visível (sem toggle = sem bug de "some, tem que scrollar").
   Some só quando o feed se esgota (.igf-done). É também a sentinela que dispara o carregar-mais. */
.igf-loader{ display:flex; align-items:center; justify-content:center; gap:10px; padding:34px 26px 60px; min-height:40px;
  color:var(--ig-secondary-text, #aaa); font-size:13px; }
.igf-loader.igf-done{ display:none; }
.igf-spin{ width:26px; height:26px; border:3px solid rgba(255,255,255,.18); border-top-color:#fff; border-radius:50%; animation:igf-rot .8s linear infinite; }
@keyframes igf-rot{ to{ transform:rotate(360deg); } }
/* skeleton de CARREGAMENTO: cards fantasmas DENTRO do próprio grid, no lugar exato onde os posts
   vão entrar (nada de overlay por cima da página). Altura = a do card real, pela mesma conta do
   contain-intrinsic-size → o conteúdo real substitui sem salto. Some no 1º card (ou no timeout).
   NÃO é o "carregando mais" do fim do feed (esse é o .igf-loader). */
.igf-skel{ height:calc(var(--igf-cardh) + var(--igf-padb) + 2px);
  background:linear-gradient(100deg, rgba(255,255,255,.04) 30%, rgba(255,255,255,.10) 50%, rgba(255,255,255,.04) 70%);
  background-size:200% 100%; animation:igf-shim 1.2s linear infinite; }
@keyframes igf-shim{ to{ background-position:-200% 0; } }
/* share virou COPIAR link: feedback de copiado (check azul) */
.igf-act.igf-copied svg{ stroke:#0095f6; }

/* ===== carrossel/galeria: setas + dots + contador (slide em cover; larga demais entra em contain) ===== */
.igf-carousel{ position:relative; display:block; }
.igf-cstage{ position:absolute; inset:0; }
.igf-cstage img, .igf-cstage video{ width:100% !important; height:100% !important; object-fit:cover; display:block; }
.igf-cnav{ position:absolute; top:50%; transform:translateY(-50%); z-index:3; width:30px; height:30px; padding:0;
  display:flex; align-items:center; justify-content:center; border:0; border-radius:50%;
  background:rgba(0,0,0,.45); color:#fff; cursor:pointer; opacity:0; transition:opacity .15s ease; }
.igf-carousel:hover .igf-cnav{ opacity:.95; }
.igf-cnav:hover{ background:rgba(0,0,0,.7); }
.igf-cnav:disabled, .igf-cnav[hidden]{ display:none; }
.igf-cnav svg{ width:22px; height:22px; display:block; }
.igf-cprev{ left:8px; }
.igf-cnext{ right:8px; }
.igf-cdots{ position:absolute; left:0; right:0; bottom:8px; z-index:3; display:flex; gap:4px; justify-content:center; pointer-events:none; }
.igf-cdot{ width:6px; height:6px; border-radius:50%; background:rgba(255,255,255,.5); transition:background .15s ease; }
.igf-cdot.on{ background:#fff; }
.igf-ccount{ position:absolute; top:8px; right:8px; z-index:3; pointer-events:none;
  background:rgba(0,0,0,.55); color:#fff; font-size:11px; font-weight:600; padding:2px 8px; border-radius:10px; }
`);

    /* ------------------------------------------------------------------ *
     * CSS — v3.2 POLISH do mosaico: paleta própria (preto premium no escuro,
     *   claro no light), micro-interações, densidade, estados. O tema real do
     *   IG é detectado por LUMINÂNCIA do fundo em JS → html.igf-dark.
     *   Bloco POSTERIOR ao CSS base → sobrepõe por ordem de origem.
     * ------------------------------------------------------------------ */
    addStyle(`
/* paleta — escuro: card quase-preto (AMOLED) separado do fundo por hairline+sombra; texto bem claro */
html.igf-dark{
  --igf-card-bg:#0e0e10;
  --igf-line: rgba(255,255,255,.10);
  --igf-line-hov: rgba(255,255,255,.26);
  --igf-hover-bg: rgba(255,255,255,.08);
  --igf-text:#f4f4f5;
  --igf-text-2:#b9b9c0;
  --igf-shadow: 0 1px 2px rgba(0,0,0,.55);
  --igf-shadow-hov: 0 18px 44px rgba(0,0,0,.64);
}
/* claro */
html:not(.igf-dark){
  --igf-card-bg:#ffffff;
  --igf-line: rgba(0,0,0,.12);
  --igf-line-hov: rgba(0,0,0,.26);
  --igf-hover-bg: rgba(0,0,0,.05);
  --igf-text:#0b0b0d;
  --igf-text-2:#5b5b62;
  --igf-shadow: 0 1px 2px rgba(0,0,0,.08);
  --igf-shadow-hov: 0 16px 36px rgba(0,0,0,.18);
}
/* card: bg + borda da paleta + transições; sombra (resting + hover) só com a flag igf-shadow */
.igf-card{ background:var(--igf-card-bg) !important; border-color:var(--igf-line) !important;
  transition:transform .2s cubic-bezier(.2,.7,.3,1), box-shadow .2s ease, border-color .2s ease; }
.igf-feed.igf-shadow .igf-card{ box-shadow:var(--igf-shadow); }
.igf-feed.igf-shadow .igf-card:hover{ transform:translateY(-4px); box-shadow:var(--igf-shadow-hov); border-color:var(--igf-line-hov) !important; }
.igf-feed:not(.igf-shadow) .igf-card:hover{ border-color:var(--igf-line-hov) !important; }
/* texto legível (sobrepõe o cinza nativo do IG) */
.igf-head b{ color:var(--igf-text) !important; }
.igf-act{ color:var(--igf-text) !important; }
/* legenda no texto PRIMÁRIO (era o cinza secundário — ficava apagada demais pra ler no mosaico) */
.igf-cap{ color:var(--igf-text) !important; }
.igf-cap b{ color:var(--igf-text) !important; }
.igf-capmore{ color:var(--igf-text) !important; background:linear-gradient(90deg, rgba(0,0,0,0), var(--igf-card-bg) 34%) !important; }
.igf-card.igf-capopen .igf-cap{ background:var(--igf-card-bg) !important; border-top-color:var(--igf-line) !important; }
.igf-card.igf-capopen .igf-capmore{ background:var(--igf-card-bg) !important; }
/* zoom leve da mídia no hover (a .igf-media tem overflow:hidden → clipa o zoom) */
.igf-media > img, .igf-cstage img{ transition:transform .35s cubic-bezier(.2,.7,.3,1); }
.igf-card:hover .igf-media > img, .igf-card:hover .igf-cstage img{ transform:scale(1.045); }
/* hovers neutros */
.igf-act:hover, .igf-follow:hover{ background:var(--igf-hover-bg) !important; }

/* flags do painel: sombra / legenda / contadores */
.igf-feed.igf-nocap .igf-capwrap{ display:none; }
.igf-feed.igf-nocounts .igf-act > span{ display:none; }

/* densidade COMPACTA (GAP cai via JS; aqui as faixas + fontes). As alturas são VARS: mudar aqui
   exige mudar os mesmos números em cardHeightFor() no JS (a dica do content-visibility). */
.igf-feed.igf-dense{ --igf-headh:42px; --igf-acth:34px; --igf-caph:22px; --igf-padb:7px; }   /* legenda = 5 + 1×17 */
.igf-feed.igf-dense .igf-head{ padding:0 9px; }
.igf-feed.igf-dense .igf-head img{ width:26px; height:26px; }
.igf-feed.igf-dense .igf-actions{ padding:0 5px; }
.igf-feed.igf-dense .igf-act{ padding:5px 6px; font-size:12px; }
.igf-feed.igf-dense .igf-act svg{ width:20px; height:20px; }
.igf-feed.igf-dense .igf-cap{ padding:5px 10px 0; font-size:13px; line-height:17px; }
.igf-feed.igf-dense .igf-capmore{ font-size:12px; line-height:17px; padding:5px 10px 0 30px; }
.igf-feed.igf-dense .igf-card{ border-radius:12px; }
/* legenda off → a faixa some de vez (o JS zera --igf-caph no cálculo da altura) */
.igf-feed.igf-nocap{ --igf-caph:0px; }

/* skeleton: shimmer NEUTRO (visível em claro e escuro) */
.igf-skel{ background:linear-gradient(100deg, rgba(128,128,128,.10) 30%, rgba(128,128,128,.22) 50%, rgba(128,128,128,.10) 70%); background-size:200% 100%; }

/* stories: emoldura a tray como um card (alinha com a grade do mosaico) */
.igm-stories{ background:var(--igf-card-bg); border:1px solid var(--igf-line); border-radius:14px; padding:12px 14px !important; margin-bottom:10px !important; box-sizing:border-box; }

.igf-act.igf-busy{ opacity:.45; pointer-events:none; }   /* removendo dos salvos… */
/* clique registrado, esperando o IG renderizar o post pra abrir a overlay (some sozinho ao abrir) */
.igf-card.igf-opening{ cursor:progress; }
.igf-card.igf-opening .igf-media::after{ content:""; position:absolute; inset:0; z-index:4; background:rgba(0,0,0,.35); }

/* ===== SALVOS: toolbar de multisseleção + overlay/checkbox nos tiles ===== */
.igf-savedbar{ display:flex; align-items:center; gap:10px; padding:4px 2px 12px; }
/* LIGADA (seleção ou lote rodando) a barra GRUDA no topo: numa limpeza longa você rola metros de
   grade, e ter que voltar ao topo pra clicar em "Remover" era o pior da experiência. */
.igf-savedbar.on{ position:sticky; top:0; z-index:60; margin-bottom:12px;
  padding:10px 14px; border-radius:12px;
  background:var(--igf-card-bg, #111); border:1px solid var(--igf-line, rgba(255,255,255,.1));
  box-shadow:0 10px 26px rgba(0,0,0,.5); backdrop-filter:saturate(1.2) blur(6px); }
.igf-sb-sp{ flex:1 1 auto; }
.igf-sb-count{ font-size:13px; color:var(--igf-text-2); }
/* progresso do lote: só existe enquanto remove, e mostra QUANTO falta (era um laço mudo) */
.igf-sb-prog{ display:none; flex:2 1 220px; height:6px; border-radius:999px; overflow:hidden;
  background:rgba(128,128,128,.28); }
.igf-savedbar.busy .igf-sb-prog{ display:block; }
.igf-sb-progfill{ height:100%; width:0; border-radius:999px; transition:width .18s ease;
  background:linear-gradient(90deg,#feda75,#fa7e1e,#d62976,#962fbf,#4f5bd5); }
.igf-sb-btn{ all:unset; cursor:pointer; padding:8px 15px; border-radius:9px; font:700 13px/1 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif; color:#fff; background:#0095f6; }
.igf-sb-btn:hover{ filter:brightness(1.08); }
.igf-sb-ghost{ background:transparent; color:var(--igf-text); border:1px solid var(--igf-line); }
.igf-sb-danger{ background:#ed4956; }
.igf-sb-btn[disabled]{ opacity:.45; pointer-events:none; }
/* visibilidade por modo: normal = só "Selecionar"; seleção = count + Todos/Cancelar/Mover/Remover;
   lote rodando = só o progresso e "Parar" (nada de clicar em Remover duas vezes no meio) */
.igf-savedbar .igf-sb-ghost, .igf-savedbar .igf-sb-danger, .igf-savedbar .igf-sb-count{ display:none; }
.igf-savedbar.on .igf-sb-sel{ display:none; }
.igf-savedbar.on .igf-sb-ghost, .igf-savedbar.on .igf-sb-danger{ display:inline-block; }
.igf-savedbar.on .igf-sb-count{ display:inline; }
.igf-savedbar .igf-sb-stop{ display:none; }
.igf-savedbar.busy .igf-sb-stop{ display:inline-block; }
.igf-savedbar.busy .igf-sb-sel, .igf-savedbar.busy .igf-sb-all,
.igf-savedbar.busy .igf-sb-cancel, .igf-savedbar.busy .igf-sb-coll, .igf-savedbar.busy .igf-sb-danger{ display:none; }
/* REMOVIDO dos salvos: o card FICA no lugar (a grade não reflui no meio da limpeza), só apaga e
   ganha o selo. Some de vez só no próximo carregamento da página. */
.igf-card.igf-gone{ opacity:.32; filter:grayscale(.7); transition:opacity .25s ease, filter .25s ease; }
.igf-card.igf-gone:hover{ opacity:.5; }
.igf-card.igf-gone::before{ content:"removido"; position:absolute; z-index:7; top:10px; left:10px;
  padding:3px 10px; border-radius:999px; pointer-events:none;
  background:rgba(0,0,0,.78); color:#fff; font:700 11px/1.7 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif; }
.igf-card.igf-gone .igf-selovl{ display:none !important; }   /* não dá pra re-selecionar o que já saiu */
/* falhou ao remover (API recusou): fica marcado em vermelho pra você ver o que sobrou */
.igf-card.igf-failed{ outline:2px solid #ed4956; outline-offset:-2px; }
.igf-card.igf-failed::before{ content:"falhou"; position:absolute; z-index:7; top:10px; left:10px;
  padding:3px 10px; border-radius:999px; pointer-events:none;
  background:#ed4956; color:#fff; font:700 11px/1.7 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif; }
/* overlay de seleção: cobre o tile só no modo seleção (captura o clique → marca/desmarca) */
.igf-selovl{ display:none; position:absolute; inset:0; z-index:6; cursor:pointer; transition:background .12s ease; }
.igf-feed.igf-selecting .igf-card-saved .igf-selovl{ display:block; }
.igf-feed.igf-selecting .igf-card-saved .igf-actions{ display:none; }   /* no modo seleção esconde a barra de ação */
.igf-card.igf-sel .igf-selovl{ background:rgba(0,149,246,.22); }
.igf-card.igf-sel{ outline:3px solid #0095f6; outline-offset:-3px; }
.igf-selcb{ position:absolute; top:10px; left:10px; width:24px; height:24px; border-radius:50%; border:2px solid #fff; background:rgba(0,0,0,.4); box-shadow:0 1px 5px rgba(0,0,0,.55); box-sizing:border-box; }
.igf-card.igf-sel .igf-selcb{ background:#0095f6; }
.igf-card.igf-sel .igf-selcb::after{ content:""; position:absolute; left:8px; top:4px; width:6px; height:11px; border:solid #fff; border-width:0 2.5px 2.5px 0; transform:rotate(45deg); }
/* menu de coleções + toast */
.igf-collmenu{ position:fixed; z-index:2147483647; min-width:220px; max-height:60vh; overflow-y:auto; padding:6px; background:#1c1c1e; border:1px solid #363638; border-radius:12px; box-shadow:0 12px 34px rgba(0,0,0,.6); }
.igf-cm-head{ font-size:11px; font-weight:700; text-transform:uppercase; letter-spacing:.04em; color:#8e8e93; padding:6px 10px 4px; }
.igf-cm-item{ all:unset; cursor:pointer; display:block; width:100%; box-sizing:border-box; padding:9px 11px; border-radius:8px; color:#f5f5f5; font:600 13px/1.2 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif; }
.igf-cm-item:hover{ background:#2c2c2e; }
.igf-cm-new{ color:#0095f6; }
.igf-toast{ position:fixed; left:50%; bottom:80px; transform:translateX(-50%) translateY(8px); z-index:2147483647; background:#1c1c1e; color:#f5f5f5; border:1px solid #363638; border-radius:999px; padding:9px 18px; font:13px -apple-system,sans-serif; box-shadow:0 6px 22px rgba(0,0,0,.5); opacity:0; pointer-events:none; transition:opacity .2s, transform .2s; }
.igf-toast.show{ opacity:1; transform:translateX(-50%) translateY(0); }
`);

    /* ------------------------------------------------------------------ *
     * CSS — painel de ajustes flutuante (mesmo modelo do reddit/twitter,
     *   prefixo igs-, accent azul do IG). FAB de engrenagem no canto.
     * ------------------------------------------------------------------ */
    addStyle(`
#igs-fab{ position:fixed; right:18px; bottom:18px; z-index:2147483646; width:44px; height:44px;
  display:flex; align-items:center; justify-content:center; background:#1c1c1e; color:#f5f5f5;
  border:1px solid #363638; border-radius:50%; cursor:pointer; opacity:.72;
  box-shadow:0 6px 20px rgba(0,0,0,.45);
  transition:opacity .2s, color .15s, background .15s, border-color .15s, transform .2s; }
#igs-fab:hover{ opacity:1; color:#fff; background:#0095f6; border-color:#0095f6; transform:rotate(30deg); }
#igs-fab svg{ width:21px; height:21px; fill:currentColor; display:block; }
/* esconder o dock de mensagens */
html.igf-no-msg .igf-msgdock{ display:none !important; }
/* botão voltar-ao-topo: acima do FAB, aparece só ligado + rolado */
#igs-totop{ position:fixed; right:18px; bottom:72px; z-index:2147483646; width:42px; height:42px;
  display:none; align-items:center; justify-content:center; background:#1c1c1e; color:#f5f5f5;
  border:1px solid #363638; border-radius:50%; cursor:pointer; opacity:.72; box-shadow:0 6px 20px rgba(0,0,0,.45);
  transition:opacity .2s, color .15s, background .15s, border-color .15s, transform .2s; }
#igs-totop:hover{ opacity:1; color:#fff; background:#0095f6; border-color:#0095f6; transform:translateY(-2px); }
#igs-totop svg{ width:20px; height:20px; fill:currentColor; display:block; }
html.igf-totop-on.igf-scrolled #igs-totop{ display:flex; }
#igs-panel{ position:fixed; right:18px; bottom:70px; z-index:2147483647; width:384px; max-height:88vh;
  display:none; flex-direction:column; overflow:hidden;
  background:#1c1c1e; color:#f5f5f5; border:1px solid #363638; border-radius:18px; box-shadow:0 16px 50px rgba(0,0,0,.65);
  font:14px/1.3 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif; transform-origin:bottom right; }
#igs-panel.open{ display:flex; animation:igs-pop .16s cubic-bezier(.2,.7,.3,1); }
@keyframes igs-pop{ from{ opacity:0; transform:translateY(10px) scale(.97); } to{ opacity:1; transform:none; } }
.igs-head{ display:flex; align-items:center; gap:10px; padding:14px 14px 12px; border-bottom:1px solid #2a2a2d; }
.igs-logo{ width:28px; height:28px; border-radius:9px; background:#0095f6; display:flex; align-items:center; justify-content:center; flex:none; }
.igs-logo svg{ width:17px; height:17px; fill:#fff; }
.igs-head b{ font-size:16px; font-weight:800; flex:1; }
.igs-x{ all:unset; cursor:pointer; color:#9a9a9d; width:28px; height:28px; display:flex; align-items:center; justify-content:center; font-size:16px; border-radius:50%; transition:.15s; }
.igs-x:hover{ color:#f5f5f5; background:#2c2c2e; }
.igs-search{ padding:10px 14px; border-bottom:1px solid #2a2a2d; }
.igs-search > div{ display:flex; align-items:center; gap:8px; background:#000; border:1px solid #363638; border-radius:999px; padding:7px 12px; transition:border-color .15s; }
.igs-search > div:focus-within{ border-color:#0095f6; }
.igs-search svg{ width:16px; height:16px; fill:#8e8e93; flex:none; }
.igs-search input{ all:unset; flex:1; color:#f5f5f5; font:inherit; }
.igs-search input::placeholder{ color:#8e8e93; }
.igs-body{ display:flex; min-height:0; flex:1; }
.igs-rail{ display:flex; flex-direction:column; gap:4px; padding:10px 8px; border-right:1px solid #2a2a2d; flex:none; }
.igs-tab{ all:unset; box-sizing:border-box; width:40px; height:40px; border-radius:11px; display:flex; align-items:center; justify-content:center; color:#8e8e93; cursor:pointer; transition:background .15s,color .15s; }
.igs-tab svg{ width:21px; height:21px; fill:currentColor; }
.igs-tab:hover{ background:#242426; color:#f5f5f5; }
.igs-tab.active{ background:rgba(0,149,246,.15); color:#0095f6; }
.igs-content{ flex:1; min-width:0; overflow-y:auto; padding:6px 0 12px; scrollbar-width:thin; scrollbar-color:#48484a transparent; }
.igs-content::-webkit-scrollbar{ width:8px; }
.igs-content::-webkit-scrollbar-thumb{ background:#48484a; border-radius:99px; border:2px solid #1c1c1e; }
.igs-sec{ display:none; }
.igs-sec-title{ font-size:12px; font-weight:700; text-transform:uppercase; letter-spacing:.05em; color:#8e8e93; padding:12px 16px 6px; }
.igs-row{ display:flex; align-items:center; justify-content:space-between; gap:12px; padding:8px 12px; cursor:pointer; border-radius:9px; margin:1px 6px; transition:background .12s; }
.igs-row:hover{ background:#242426; }
.igs-rowlbl{ flex:1; display:flex; flex-direction:column; gap:2px; min-width:0; }
.igs-hint{ color:#8e8e93; font-size:11px; line-height:1.3; font-weight:400; }
.igs-row select{ background:#000; color:#f5f5f5; border:1px solid #363638; border-radius:8px; padding:5px 8px; font:inherit; cursor:pointer; flex:0 0 auto; }
.igs-row.dim, .igs-slider.dim{ opacity:.4; pointer-events:none; }
.igs-sw{ position:relative; width:38px; height:22px; flex:none; }
.igs-sw input{ position:absolute; inset:0; opacity:0; margin:0; cursor:pointer; }
.igs-sw i{ position:absolute; inset:0; border-radius:999px; background:#48484a; transition:.18s; pointer-events:none; }
.igs-sw i::after{ content:""; position:absolute; top:2px; left:2px; width:18px; height:18px; border-radius:50%; background:#fff; transition:.18s; box-shadow:0 1px 2px rgba(0,0,0,.4); }
.igs-sw input:checked + i{ background:#0095f6; }
.igs-sw input:checked + i::after{ transform:translateX(16px); }
.igs-slider{ display:flex; flex-direction:column; gap:8px; padding:10px 12px; margin:1px 6px; }
.igs-lab{ display:flex; justify-content:space-between; align-items:center; color:#dcdcdd; }
.igs-lab .val{ color:#0095f6; font-weight:700; background:rgba(0,149,246,.12); border-radius:6px; padding:1px 8px; font-size:13px; min-width:38px; text-align:center; }
.igs-slider input[type=range]{ width:100%; accent-color:#0095f6; cursor:pointer; }
.igs-empty{ display:none; color:#8e8e93; text-align:center; padding:32px 16px; }
.igs-foot{ display:flex; align-items:center; justify-content:space-between; padding:10px 16px; border-top:1px solid #2a2a2d; }
.igs-ver{ color:#6b6b70; font-size:12px; }
.igs-reset{ all:unset; cursor:pointer; color:#8e8e93; font-size:13px; font-weight:600; padding:4px 8px; border-radius:7px; transition:.15s; }
.igs-reset:hover{ color:#ff3040; background:rgba(255,48,64,.1); }
`);

    /* ------------------------------------------------------------------ *
     * Acha o "wrapper" do vídeo — o box que contém o <video> e a overlay
     * de tap do IG (div[data-instancekey]) como irmãos. Fallback: sobe até
     * o primeiro ancestral que enquadra o vídeo, senão o pai direto.
     * ------------------------------------------------------------------ */
    function findWrapper(video) {
        let node = video.parentElement;
        for (let d = 0; d < 15 && node; d++) {
            if (node.querySelector(":scope > div[data-instancekey]")) return node;
            node = node.parentElement;
        }
        // fallback heurístico: ancestral cuja largura ~= a do vídeo (o frame visual)
        const vw = video.getBoundingClientRect().width;
        node = video.parentElement;
        let best = video.parentElement;
        for (let d = 0; d < 6 && node; d++) {
            const w = node.getBoundingClientRect().width;
            if (vw && Math.abs(w - vw) <= 2) best = node;
            node = node.parentElement;
        }
        return best || video.parentElement;
    }

    /* ------------------------------------------------------------------ *
     * Controller por vídeo
     * ------------------------------------------------------------------ */
    const bound = new WeakSet();              // <video> já tratados
    const controllers = new WeakMap();        // <video> -> controller
    const live = new Set();                   // <video>s vivos (pra poda/teclado)

    function attach(video) {
        if (bound.has(video)) return;
        if (video.closest && video.closest(".igf-src")) return;   // vídeo da lista nativa off-screen → só anexa quando eu mover pro card
        const host = findWrapper(video);
        if (!host) return;

        const story = isStory();
        if (story && !prefs.stories) { bound.add(video); return; }  // marca e ignora

        bound.add(video);
        live.add(video);

        const ac = new AbortController();
        const sig = ac.signal;
        const on = (t, ev, fn, opts) => t.addEventListener(ev, fn, Object.assign({ signal: sig }, opts));

        if (getComputedStyle(host).position === "static") host.style.position = "relative";
        host.classList.add("igvc-host");

        /* ---- DOM ---- */
        const buffered = el("div", { class: "igvc-buffered" });
        const fill = el("div", { class: "igvc-fill" });
        const thumb = el("div", { class: "igvc-thumb" });
        const track = el("div", { class: "igvc-track", title: "" }, buffered, fill, thumb);

        const playBtn = el("button", { class: "igvc-btn", "aria-label": "Play/Pause", html: ICONS.play });
        const time = el("span", { class: "igvc-time" }, "0:00");

        const speedBtn = el("button", { class: "igvc-btn igvc-speed", "aria-label": "Velocidade" }, speedLabel(prefs.speed));
        const speedPop = el("div", { class: "igvc-pop igvc-pop-speed" });

        // botão de som SEMPRE visível no canto (o mute/desmute não fica mais só na fileira do hover)
        const soundBtn = el("button", { class: "igvc-sound", type: "button", "aria-label": "Ativar/desativar som", html: ICONS.volHigh });
        const muteBtn = el("button", { class: "igvc-btn", "aria-label": "Mudo", html: ICONS.volHigh });
        const range = el("input", { class: "igvc-range", type: "range", min: "0", max: "1", step: "0.01", value: String(prefs.volume), "aria-label": "Volume" });
        const volGroup = el("div", { class: "igvc-vol" }, muteBtn, range);

        const pipBtn = el("button", { class: "igvc-btn", "aria-label": "Picture-in-Picture", html: ICONS.pip });
        const fsBtn = el("button", { class: "igvc-btn", "aria-label": "Tela cheia", html: ICONS.fs });
        // (config/ajustes saíram do player → painel flutuante único, ver buildPanel)

        const row = el("div", { class: "igvc-row" },
            playBtn, time, el("span", { class: "igvc-spacer" }),
            speedBtn, volGroup, pipBtn, fsBtn, speedPop);

        // story: SÓ a barra de progresso (track). feed/reels: track + fileira + botão de som. (el ignora kid null)
        const bar = el("div", { class: "igvc-bar" + (story ? " igvc-story" : "") }, track, story ? null : row, story ? null : soundBtn);

        // Onde montar a barra:
        //  • feed: dentro do host (acompanha o vídeo).
        //  • stories: no "card" da story (ancestral que contém o <textarea> de reply),
        //    como ÚLTIMO filho — DEPOIS do rodapé. Senão o rodapé (irmão posterior do
        //    container do vídeo) pinta por cima da barra e os cliques não passam.
        let storyBox = null;
        function findStoryParts() {
            // storyBox: a caixa TRANSFORMADA da story (o containing-block dos absolutos). Monto a barra
            // aqui como ÚLTIMO filho → ela pinta ACIMA de toda a overlay do IG (reply, tap-zones), então
            // os cliques de SEEK passam. O POST ORIGINAL fica INTACTO (não toco no reply/like/footer).
            // Fallback: ancestral com <textarea> (card), senão o host.
            let n = host.parentElement, box = null, card = null;
            for (let i = 0; i < 16 && n; i++) {
                const tf = getComputedStyle(n).transform;
                if (!box && tf && tf !== "none") box = n;   // tf vazio em alguns engines = sem transform
                if (!card && n.querySelector("textarea")) card = n;
                n = n.parentElement;
            }
            storyBox = box || card || host;
            return !!(box || card);
        }
        if (story) findStoryParts();
        (storyBox || host).appendChild(bar);

        // Defesa anti-navegação: no feed o vídeo vem embrulhado num <a href="/reels/...">
        // e a barra fica DENTRO do anchor. Clicar num controle dispararia a navegação
        // (ação default do <a>) + o onClick delegado do React. Engulo na borda da barra:
        // os handlers dos widgets rodam no target (antes), aqui no bubble mato default +
        // propagação. mousedown/pointerdown só param a propagação (sem preventDefault),
        // senão o arraste do slider de volume quebraria.
        on(bar, "click", (e) => { e.preventDefault(); e.stopPropagation(); });
        on(bar, "mousedown", (e) => e.stopPropagation());
        // anchors são "draggable" por padrão e o player vive DENTRO do <a href="/reels/...">:
        // arrastar qualquer controle (ex.: o slider de volume) faz o browser arrastar o
        // LINK, com a imagem do post como ghost ("puxa a imagem de trás"). O dragstart
        // dispara no <a> (ancestral), não no controle — então marco o press na barra e
        // cancelo o dragstart no document (capture) enquanto durar.
        let pressing = false;
        on(bar, "pointerdown", (e) => { pressing = true; e.stopPropagation(); });
        on(document, "pointerup", () => { pressing = false; });
        on(document, "pointercancel", () => { pressing = false; });
        on(document, "dragstart", (e) => { if (pressing) e.preventDefault(); }, { capture: true });

        const controller = { video, host, bar, destroy };
        controllers.set(video, controller);

        // stories: se o card/rodapé ainda não montou, tenta de novo e RELOCA a barra
        // do host pro card (+ religa o hover no card).
        if (story && storyBox === host) {   // não achou a caixa/reply ainda → tenta de novo e move
            const relocate = () => {
                if (storyBox !== host) return;
                if (findStoryParts() && storyBox !== host) {
                    storyBox.appendChild(bar);
                    on(storyBox, "mouseenter", () => setShown(true));
                    on(storyBox, "mouseleave", hide);
                }
            };
            const lt = [setTimeout(relocate, 300), setTimeout(relocate, 900), setTimeout(relocate, 1800)];
            sig.addEventListener("abort", () => lt.forEach(clearTimeout));
        }

        /* ---- estado de áudio: aplica prefs e sobrevive aos resets do IG ---- */
        function applyAV() {
            try { video.volume = prefs.volume; } catch { /**/ }
            try { video.playbackRate = prefs.speed; } catch { /**/ }
            if (prefs.autoUnmute && video._igvcMuteIntent == null) { try { video.muted = false; } catch { /**/ } }
        }
        applyAV();
        const t1 = setTimeout(applyAV, 140);
        const t2 = setTimeout(() => { applyAV(); video._igvcSettled = true; }, 600);
        sig.addEventListener("abort", () => { clearTimeout(t1); clearTimeout(t2); });

        /* ---- progresso / tempo ---- */
        let dragging = false;
        function renderTime() {
            if (dragging) return;
            const d = video.duration;
            if (!isFinite(d) || d <= 0) { fill.style.width = "0%"; thumb.style.left = "0%"; if (time.textContent) time.textContent = ""; return; }
            const pc = clamp(video.currentTime / d, 0, 1) * 100;
            fill.style.width = pc + "%";
            thumb.style.left = pc + "%";
            const tt = fmt(video.currentTime) + " / " + fmt(d);   // guard "mudou?" (mesmo padrão do setVolIcon): timeupdate é ~4Hz, o texto só muda 1×/s
            if (time.textContent !== tt) time.textContent = tt;
        }
        function renderBuffered() {
            try {
                const b = video.buffered, d = video.duration;
                if (b && b.length && isFinite(d) && d > 0) buffered.style.width = clamp(b.end(b.length - 1) / d, 0, 1) * 100 + "%";
            } catch { /**/ }
        }
        let dragRect = null;   // rect do track cacheado no pointerdown (não muda no meio do drag) — getBoundingClientRect por pointermove forçava layout (os writes de fill/thumb sujam o layout entre moves)
        const fracAt = (clientX) => { const r = dragRect || track.getBoundingClientRect(); return r.width ? clamp((clientX - r.left) / r.width, 0, 1) : 0; };
        function seekTo(f) {
            const d = video.duration;
            if (isFinite(d) && d > 0) video.currentTime = f * d;
            fill.style.width = f * 100 + "%"; thumb.style.left = f * 100 + "%";
        }
        on(track, "pointerdown", (e) => { e.preventDefault(); dragging = true; dragRect = track.getBoundingClientRect(); try { track.setPointerCapture(e.pointerId); } catch { /**/ } seekTo(fracAt(e.clientX)); });
        on(track, "pointermove", (e) => { if (dragging) seekTo(fracAt(e.clientX)); });
        on(track, "pointerup", () => { dragging = false; dragRect = null; });
        on(track, "pointercancel", () => { dragging = false; dragRect = null; });
        on(track, "wheel", (e) => { e.preventDefault(); const d = video.duration; if (isFinite(d)) video.currentTime = clamp(video.currentTime + (e.deltaY < 0 ? 2 : -2), 0, d); }, { passive: false });

        on(video, "timeupdate", renderTime);
        on(video, "durationchange", renderTime);
        on(video, "progress", renderBuffered);
        on(video, "loadedmetadata", () => { renderTime(); renderBuffered(); });

        /* ---- play / pause ---- */
        function setPlayIcon() { playBtn.innerHTML = video.paused ? ICONS.play : ICONS.pause; }
        on(playBtn, "click", () => { if (video.paused) video.play().catch(() => { }); else video.pause(); });
        on(video, "play", setPlayIcon);
        on(video, "pause", setPlayIcon);
        setPlayIcon();

        /* ---- mudo / volume ---- */
        let volDragging = false, lastVolIcon = "";
        function setVolIcon() {
            // guard "mudou?": só reescreve o SVG quando o estado do ícone muda (IG
            // dispara volumechange em rajada; reescrever idêntico = flicker).
            const want = (video.muted || video.volume === 0) ? "mute" : (video.volume < 0.5 ? "low" : "high");
            if (want !== lastVolIcon) {
                const svg = want === "mute" ? ICONS.volMute : want === "low" ? ICONS.volLow : ICONS.volHigh;
                muteBtn.innerHTML = svg;
                soundBtn.innerHTML = svg;
                soundBtn.classList.toggle("igvc-muted", want === "mute");
                soundBtn.title = want === "mute" ? "Ativar som" : "Silenciar";
                lastVolIcon = want;
            }
            const rv = String(video.muted ? 0 : video.volume);
            if (range.value !== rv && !volDragging && document.activeElement !== range) range.value = rv;
        }
        function toggleMute() {
            const m = !(video.muted || video.volume === 0);
            video.muted = m; video._igvcMuteIntent = m;
            if (!m && video.volume === 0) { video.volume = prefs.volume || 0.5; }
            // desmutou com o vídeo parado (ex.: card pausado) → toca junto: desmutar sem som é confuso
            if (!m && video.paused) { try { const pr = video.play(); if (pr && pr.catch) pr.catch(() => { /**/ }); } catch (_) { /**/ } }
            setVolIcon();
        }
        on(muteBtn, "click", toggleMute);
        on(soundBtn, "click", (e) => { e.preventDefault(); e.stopPropagation(); toggleMute(); });
        on(range, "input", () => {
            const v = parseFloat(range.value);
            video.volume = v; video.muted = v === 0; video._igvcMuteIntent = v === 0;
            prefs.volume = v; savePrefsSoon(); setVolIcon();
        });
        // mantém o slider aberto enquanto arrasta — senão ele colapsa no meio do
        // gesto e o arraste "cai" na imagem do post atrás (drag nativo da <img>).
        on(volGroup, "mouseenter", () => volGroup.classList.add("igvc-vol-open"));
        on(volGroup, "mouseleave", () => { if (!volDragging) volGroup.classList.remove("igvc-vol-open"); });
        on(range, "pointerdown", () => { volDragging = true; volGroup.classList.add("igvc-vol-open"); });
        on(document, "pointerup", () => { if (volDragging) { volDragging = false; if (!isHover(volGroup)) volGroup.classList.remove("igvc-vol-open"); } });
        on(video, "volumechange", () => {
            setVolIcon();
            if (video._igvcSettled && !video.muted && video.volume > 0) { prefs.volume = video.volume; savePrefsSoon(); }
        });
        setVolIcon();

        /* ---- velocidade ---- */
        function setSpeed(r) {
            video.playbackRate = r; prefs.speed = r; savePrefsSoon();
            speedBtn.textContent = speedLabel(r);
            for (const b of speedPop.children) b.classList.toggle("igvc-on", parseFloat(b.dataset.r) === r);
        }
        for (const r of SPEEDS) {
            const b = el("button", { "data-r": String(r) }, speedLabel(r));
            b.addEventListener("click", () => { setSpeed(r); closePops(); });
            speedPop.appendChild(b);
        }
        on(speedBtn, "click", () => { const open = speedPop.classList.contains("igvc-open"); closePops(); if (!open) speedPop.classList.add("igvc-open"); });
        on(video, "ratechange", () => { speedBtn.textContent = speedLabel(video.playbackRate); });

        /* ---- PiP ---- */
        on(pipBtn, "click", async () => {
            try {
                if (document.pictureInPictureElement) await document.exitPictureInPicture();
                else if (video.requestPictureInPicture) await video.requestPictureInPicture();
            } catch { /**/ }
        });

        /* ---- fullscreen (no host, pra barra continuar visível) ---- */
        on(fsBtn, "click", () => { toggleFullscreen(host, video); });
        on(document, "fullscreenchange", () => {
            const fs = document.fullscreenElement === host;
            host.classList.toggle("igvc-fs", fs);
            fsBtn.innerHTML = fs ? ICONS.fsExit : ICONS.fs;
        });

        /* ---- popovers (só velocidade; ajustes ficam no painel flutuante) ---- */
        function closePops() { speedPop.classList.remove("igvc-open"); }
        on(document, "click", (e) => { if (!bar.contains(e.target)) closePops(); }, { capture: true });

        /* ---- show/hide da fileira (hover) ---- */
        let hideTimer = 0;
        function popsOpen() { return speedPop.classList.contains("igvc-open"); }
        function setShown(on) {
            bar.classList.toggle("igvc-show", on);   // reveal na BARRA (no feed engorda a trilha + mostra a fileira)
        }
        function hide() { clearTimeout(hideTimer); if (!popsOpen()) setShown(false); }
        function show() {
            setShown(true);
            clearTimeout(hideTimer);
            hideTimer = setTimeout(() => { if (!isHover(bar) && !popsOpen()) setShown(false); }, HIDE_DELAY);
        }
        if (story) {
            // hover na caixa inteira da story (vídeo + reply + barra): mover entre eles não
            // "sai" da caixa → sem flicker, e a barra (filha da caixa) fica no hover.
            const tgt = storyBox || host;
            on(tgt, "mouseenter", () => setShown(true));
            on(tgt, "mouseleave", hide);
        } else {
            // feed: capture phase porque o IG engole pointer events na overlay (bubble).
            on(host, "mousemove", show, { capture: true });
            on(host, "mouseleave", hide);
        }

        renderTime(); renderBuffered();

        function destroy() {
            ac.abort();
            bar.remove();
            host.classList.remove("igvc-host", "igvc-show", "igvc-fs");
            live.delete(video);
            controllers.delete(video);
            bound.delete(video);
        }
    }

    /* ------------------------------------------------------------------ *
     * Fullscreen util (host com fallbacks de vendor)
     * ------------------------------------------------------------------ */
    function toggleFullscreen(host, video) {
        try {
            if (document.fullscreenElement) { (document.exitFullscreen || document.webkitExitFullscreen)?.call(document); return; }
            const req = host.requestFullscreen || host.webkitRequestFullscreen;
            if (req) req.call(host);
            else if (video.webkitEnterFullscreen) video.webkitEnterFullscreen();   // iOS
        } catch { /**/ }
    }

    /* ------------------------------------------------------------------ *
     * Teclado — age no vídeo mais centralizado e visível
     * ------------------------------------------------------------------ */
    function activeVideo() {
        let best = null, bestD = Infinity;
        const cy = innerHeight / 2;
        for (const v of document.querySelectorAll("video")) {
            const r = v.getBoundingClientRect();
            if (r.width < MIN_SIZE || r.height < MIN_SIZE) continue;
            if (r.bottom < 0 || r.top > innerHeight) continue;
            const d = Math.abs((r.top + r.bottom) / 2 - cy);
            if (d < bestD) { bestD = d; best = v; }
        }
        return best;
    }

    const rightHold = { timer: 0, temp: false, video: null };
    // teclas que a gente trata — qualquer outra sai ANTES do activeVideo() (que varre todos os <video> + rects por keydown)
    const IGV_KEYS = new Set([" ", "k", "K", "j", "J", "l", "L", "ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown",
        "m", "M", "f", "F", "p", "P", ",", ".", "[", "<", "]", ">", "Home", "End", "0", "1", "2", "3", "4", "5", "6", "7", "8", "9"]);
    document.addEventListener("keydown", (e) => {
        if (!prefs.keyboard) return;
        if (e.ctrlKey || e.metaKey || e.altKey) return;
        if (!IGV_KEYS.has(e.key)) return;
        if (isEditable(e.target)) return;
        const v = activeVideo();
        if (!v) return;
        const d = v.duration;
        const stop = () => { e.preventDefault(); e.stopPropagation(); };

        switch (e.key) {
            case " ": case "k": case "K":
                stop(); if (v.paused) v.play().catch(() => { }); else v.pause(); break;
            case "j": case "J":
                stop(); if (isFinite(d)) v.currentTime = clamp(v.currentTime - SEEK, 0, d); break;
            case "l": case "L":
                stop(); if (isFinite(d)) v.currentTime = clamp(v.currentTime + SEEK, 0, d); break;
            case "ArrowLeft":
                stop(); if (isFinite(d)) v.currentTime = clamp(v.currentTime - SEEK, 0, d); break;
            case "ArrowRight":
                stop();
                if (e.repeat) break;
                rightHold.video = v;
                rightHold.timer = setTimeout(() => { rightHold.temp = true; v._igvcPrevRate = v.playbackRate; v.playbackRate = 2; }, 220);
                break;
            case "ArrowUp":
                stop(); v.muted = false; v.volume = clamp(v.volume + VOL_STEP, 0, 1); v._igvcMuteIntent = false; break;
            case "ArrowDown":
                stop(); v.volume = clamp(v.volume - VOL_STEP, 0, 1); break;
            case "m": case "M":
                stop(); v.muted = !v.muted; v._igvcMuteIntent = v.muted; break;
            case "f": case "F":
                stop(); { const c = controllers.get(v); toggleFullscreen(c ? c.host : v.parentElement, v); } break;
            case "p": case "P":
                stop(); (async () => { try { if (document.pictureInPictureElement) await document.exitPictureInPicture(); else await v.requestPictureInPicture(); } catch { /**/ } })(); break;
            case ",":
                stop(); v.pause(); v.currentTime = clamp(v.currentTime - 1 / 30, 0, d || 1e9); break;
            case ".":
                stop(); v.pause(); v.currentTime = clamp(v.currentTime + 1 / 30, 0, d || 1e9); break;
            case "[": case "<":
                stop(); { let i = SPEEDS.indexOf(v.playbackRate); if (i < 0) i = SPEEDS.indexOf(1); v.playbackRate = SPEEDS[clamp(i - 1, 0, SPEEDS.length - 1)]; prefs.speed = v.playbackRate; savePrefsSoon(); } break;
            case "]": case ">":
                stop(); { let i = SPEEDS.indexOf(v.playbackRate); if (i < 0) i = SPEEDS.indexOf(1); v.playbackRate = SPEEDS[clamp(i + 1, 0, SPEEDS.length - 1)]; prefs.speed = v.playbackRate; savePrefsSoon(); } break;
            case "Home": stop(); v.currentTime = 0; break;
            case "End": stop(); if (isFinite(d)) v.currentTime = d; break;
            default:
                if (e.key >= "0" && e.key <= "9") { stop(); if (isFinite(d)) v.currentTime = d * (parseInt(e.key, 10) / 10); }
        }
    }, true);

    document.addEventListener("keyup", (e) => {
        if (e.key !== "ArrowRight") return;
        clearTimeout(rightHold.timer);
        const v = rightHold.video;
        if (rightHold.temp && v) { v.playbackRate = v._igvcPrevRate || prefs.speed; rightHold.temp = false; }
        else if (v) { const d = v.duration; if (isFinite(d)) v.currentTime = clamp(v.currentTime + SEEK, 0, d); }  // tap = +5s
        rightHold.video = null;
    }, true);

    /* ------------------------------------------------------------------ *
     * Feed em MOSAICO (home) — dashboard de cards em multicolunas.
     *   • Coluna única de <article> → CSS columns no tamanho NATIVO do card
     *     (não toco na largura interna do post: matar o calc(min(470px…))
     *     colapsa a mídia → cards viravam só barra+legenda).
     *   • Alargo a coluna do feed (caps 470/630) e ESCONDO a right rail
     *     (perfil/sugestões/footer) — o irmão da coluna do feed na "row".
     *   • Nav esquerdo fixo (pin 72px + sem transition) p/ não expandir no hover.
     *   • Re-asserto a cada scan (classList idempotente) p/ aguentar re-render
     *     do React. Escopo do feed: só a home; nav-pin segue a pref (global).
     * ------------------------------------------------------------------ */
    const isHome = () => location.pathname === "/" || location.pathname === "";
    // um post/reel ABERTO (rota /p/CODE/, /reel/CODE/ ou /reels/CODE/ — com código, não a aba /reels/)
    const isPostRoute = () => /^\/(p|reel|reels)\/[^/]+/.test(location.pathname);
    // o feed deve seguir VIVO? home sempre; OU um post aberto em MODAL por cima do feed (a rota virou /p/CODE/,
    // mas a modal do IG é overlay → nosso feed + a lista nativa seguem montados atrás). Sem isto, abrir a modal
    // virava "não-home" → unmasonry() destruía o feed (igSrc=null) e o clique seguinte caía no go() = redirect.
    const feedShouldLive = () => isHome() || (isPostRoute() && !!(feedEl && feedEl.isConnected));

    // ===== SUPERFÍCIES: home (feed de <article>) · explore/profile (grade de tiles <a>) =====
    // O mesmo motor de masonry/loadMore serve as 3; só muda o "que é um item" e "como buildar o card".
    const RESERVED = new Set(["", "explore", "reels", "reel", "p", "stories", "direct", "accounts", "about",
        "legal", "settings", "your_activity", "directory", "challenge", "lite", "web", "api", "graphql", "emails", "session", "qr", "oauth"]);
    const isExplore = () => /^\/explore(\/|$)/.test(location.pathname);
    const isSaved = () => {   // /usuario/saved/... (qualquer sub-rota: all-posts, coleções)
        const segs = location.pathname.split("/").filter(Boolean);
        return segs.length >= 2 && !RESERVED.has(segs[0]) && segs[1] === "saved";
    };
    const isProfile = () => {
        const segs = location.pathname.split("/").filter(Boolean);
        if (!segs.length || RESERVED.has(segs[0])) return false;
        if (segs.length === 1) return true;                                   // /usuario/  (aba Posts)
        return segs.length === 2 && ["reels", "tagged"].includes(segs[1]);    // /usuario/reels|tagged (saved é superfície própria)
    };
    let surface = "home";          // 'home' | 'explore' | 'profile' | 'saved' — qual harvester/builder usar
    let mountedSurface = null;     // o que está montado agora (pra trocar = teardown + remount)
    // qual superfície DEVE estar montada agora (considerando os toggles + post aberto em modal por cima)
    function targetSurface() {
        if (isHome() && prefs.masonry) return "home";
        if (isExplore() && prefs.gridExplore) return "explore";
        if (isSaved() && (prefs.gridSaved || prefs.gridProfile)) return "saved";   // salvos: flag própria OU junto do perfil
        if (isProfile() && prefs.gridProfile) return "profile";
        if (/\/(p|reel)\/[^/]+/.test(location.pathname) && feedEl && feedEl.isConnected) return mountedSurface;   // modal por cima → mantém
        return null;
    }
    const GRID_SEL = 'a[role="link"][href*="/p/"], a[role="link"][href*="/reel/"]';   // tile do explore/profile
    const itemsIn = (root) => root.querySelectorAll(surface === "home" ? "article" : GRID_SEL);
    const harvestOne = (node) => surface === "home" ? harvestPost(node) : harvestTile(node);
    const keyOf = (node) => surface === "home" ? postKey(node) : tileKey(node);

    function feedArticleList() {
        // The home can start from one article; other surfaces still require two siblings.
        const arts = document.querySelectorAll("main article");
        const minArticles = isHome() ? 1 : 2;
        if (arts.length < minArticles) return null;
        const p = arts[0].parentElement;
        let n = 0;
        for (const a of arts) if (a.parentElement === p) n++;
        return n >= minArticles ? p : null;
    }

    // coluna do feed + a(s) rail(s) irmã(s). A coluna = filho direto da "row" de
    // 2 colunas. Ancoro no cap inline de 630px (constante de layout do IG); a
    // stories-tray mora DENTRO do cap630, então nunca é confundida com rail.
    // Fallback (se o 630 sumir): o split de 2 colunas mais EXTERNO antes do <main>.
    function feedColumnSplit(list) {
        let col = null;
        for (let n = list.parentElement; n && n.tagName !== "MAIN" && n !== document.body; n = n.parentElement) {
            if (/max-width\s*:\s*630px/.test(n.getAttribute("style") || "")) { col = n; break; }
        }
        if (!col) {
            for (let c = list.parentElement; c && c.parentElement; c = c.parentElement) {
                const row = c.parentElement;
                if (row.tagName === "MAIN" || row === document.body) break;
                const kids = [...row.children].filter((k) => k.nodeType === 1);
                if (kids.length >= 2 && kids.some((k) => k !== c && !k.contains(list))) col = c; // mantém o mais externo
            }
        }
        if (!col || !col.parentElement) return null;
        const rails = [...col.parentElement.children].filter((k) => k.nodeType === 1 && k !== col && !k.contains(list));
        return { col, rails };
    }

    // caixa de largura do nav esquerdo: ancestral (com width px + transition) dos
    // links de nav (explore/reels). É o que o IG anima no hover. Uso a.pathname
    // (não o href cru) p/ casar tanto href relativo quanto absoluto.
    function leftNavWidthBox() {
        let a = null;
        for (const x of document.querySelectorAll('a[href*="explore"], a[href*="reels"]')) {
            const p = x.pathname || "";
            if (p === "/explore/" || p === "/explore" || p === "/reels/" || p === "/reels") { a = x; break; }
        }
        if (!a) return null;
        let n = a.parentElement, best = null;
        for (let d = 0; d < 16 && n && n.tagName !== "MAIN" && n !== document.body; d++, n = n.parentElement) {
            const st = n.getAttribute("style") || "";
            if (/width\s*:\s*\d+px/i.test(st)) { best = n; if (/transition/i.test(st)) return n; }
        }
        return best;
    }

    /* ============================================================================ *
     * FEED PRÓPRIO — em vez de reposicionar os <article> do IG (que ele virtualiza e
     * RECRIA no scroll = briga perdida), eu LEIO os dados de cada post (harvest) e
     * renderizo CARDS MEUS (.igf-card) num container MEU (.igf-feed). A lista nativa fica
     * viva off-screen (.igf-src) só pra abastecer dados e manter o IG carregando ao rolar.
     *
     * v3.12 — GRADE UNIFORME. Todo item tem a mesma altura, então o layout é CSS Grid puro:
     * o JS não mede, não posiciona e não re-empacota nada. Cada card é append-only e imutável
     * em geometria desde o nascimento — o que a mídia carregando faz é só trocar pixel dentro
     * de uma caixa que já tinha o tamanho final. É isso que remove os travamentos: não existe
     * mais trabalho de layout proporcional ao número de posts da sessão.
     * ============================================================================ */
    const MAXCOLS = 3, MINCOLW = 280;   // auto: até 3 colunas; itens menores vêm da página estreita (--igm-maxw)
    // páginas por disparo do carregar-mais. Cada rodada = 1 página da API do IG + o download da mídia
    // daquela página. Era 10 (travava a aba por segundos), virou 3 e agora 2: com o gatilho de scroll
    // re-disparando antes de faltar item, prefetchar mais que isso só antecipa tráfego que talvez
    // nunca seja visto — o usuário pode parar de rolar a qualquer momento.
    const LOADMORE_ROUNDS = 2, GROWTH_MAX_MS = 1600;
    let GAP = 24;   // gap entre cards — vira 14 no modo compacto (applySettings)
    // proporção ÚNICA da mídia: 9:16, a MAIS ALTA que o IG produz (reels/stories) → um reel aparece
    // inteiro, sem corte, e todo item continua com a MESMA altura. Conteúdo mais largo que isso não é
    // ampliado pra preencher: ganha .igf-fit e entra inteiro na caixa (ver mediaFit).
    // Espelha --igf-ar no CSS; mudar aqui exige mudar lá.
    const AR_W = 9, AR_H = 16;
    const PLAY_SVG = '<svg viewBox="0 0 24 24" fill="#fff"><path d="M8 5v14l11-7z"/></svg>';
    // ícones da barra de ações (outline, herdam currentColor)
    const ICO = {
        like: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.6l-1-1a5.5 5.5 0 0 0-7.8 7.8l1 1 7.8 7.8 7.8-7.8 1-1a5.5 5.5 0 0 0 0-7.8z"/></svg>',
        comment: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 11.5a8.4 8.4 0 0 1-9 8.4 9 9 0 0 1-3.8-.8L3 20.5l1.4-4.1A8.4 8.4 0 0 1 3.5 11.5a8.5 8.5 0 0 1 17 0z"/></svg>',
        repost: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 1l4 4-4 4"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><path d="M7 23l-4-4 4-4"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/></svg>',
        share: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 2 11 13"/><path d="M22 2 15 22l-4-9-9-4 20-7z"/></svg>',
        save: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/></svg>',
        open: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 3h6v6"/><path d="M10 14 21 3"/><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/></svg>',
        link: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.5 1.5"/><path d="M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.5-1.5"/></svg>',
        check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>',
        chevL: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M15.41 7.41 14 6l-6 6 6 6 1.41-1.41L10.83 12z"/></svg>',
        chevR: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M10 6 8.59 7.41 13.17 12l-4.58 4.59L10 18l6-6z"/></svg>',
    };
    const SPIN_HTML = '<div class="igf-spin"></div><span>Carregando mais…</span>';
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    const posts = new Map();        // key -> dados do post (dedup por permalink)
    const order = [];               // keys na ordem de harvest
    const rendered = new Set();     // keys já renderizados
    let renderedUpTo = 0;           // ponteiro em `order` até onde já renderizei (append-only → não re-varre)
    const carouselWait = new Map(); // key -> 1ª vez vista como galeria (espera os slides da API p/ ter ‹ ›)
    let feedEl = null, igSrc = null, srcMO = null, srcMOTarget = null, resizeBound = false, layoutQ = false;
    let feedNcols = 0, feedColw = 0;
    let loaderEl = null, loaderIO = null, loading = false, nativePauseTimer = null, nativePlayBound = false, feedExhausted = false, nativeHideTimer = null;
    const raf = (typeof requestAnimationFrame !== "undefined") ? requestAnimationFrame : (cb) => setTimeout(cb, 16);
    let inlineJSONTask = null;
    function scheduleInlineJSON() {
        if (inlineJSONTask !== null) return;
        const run = () => {
            inlineJSONTask = null;
            if (feedEl && feedEl.isConnected) ingestInlineJSON();
        };
        if (typeof requestIdleCallback === "function") inlineJSONTask = requestIdleCallback(run, { timeout: 1200 });
        else inlineJSONTask = setTimeout(run, 0);
    }
    function cancelInlineJSON() {
        if (inlineJSONTask === null) return;
        if (typeof cancelIdleCallback === "function") cancelIdleCallback(inlineJSONTask);
        else clearTimeout(inlineJSONTask);
        inlineJSONTask = null;
    }

    function postKey(a) {
        const link = a.querySelector('a[href*="/p/"], a[href*="/reel/"]');
        if (!link) return null;
        const m = (link.pathname || link.getAttribute("href") || "").match(/\/(?:p|reel)\/[^/?#]+/);
        if (!m) return null;
        if (a.dataset.igfKey !== m[0]) a.dataset.igfKey = m[0];   // hint p/ nativeArticle (lá é VERIFICADO — React pode reciclar o nó com outro post)
        return m[0];
    }
    // lê um post de um <article> do IG. true se um NOVO post entrou.
    function harvestPost(a) {
        const key = postKey(a);
        if (!key || posts.has(key)) return false;
        const box = a.querySelector('[style*="470px"]');
        if (!box) return false;
        const video = box.querySelector("video");
        // o carrier de 470px só contém a MÍDIA (o avatar fica no header, fora dele) → 1ª img = a mídia/poster
        const mainImg = box.querySelector("img");
        // `currentSrc` (a variante que o browser REALMENTE baixou) antes do atributo `src` — com
        // srcset os dois costumam ser variantes diferentes, e pedir a errada duplica o download.
        const media = (video && video.getAttribute("poster")) || (mainImg && (mainImg.currentSrc || mainImg.src)) || "";
        // srcset + sizes COPIADOS DO NATIVO (não um `sizes` nosso): mesma entrada, mesma regra de
        // escolha, mesma URL → o nosso <img> reaproveita o download do IG em vez de fazer o segundo.
        // É o que garante o cache-hit quando o harvest pega o post antes de o currentSrc resolver.
        const srcset = (mainImg && mainImg.getAttribute("srcset")) || "";
        const sizes = (mainImg && mainImg.getAttribute("sizes")) || "";
        if (!media && !video) return false;             // post de imagem sem img ainda → tenta depois (vídeo sem poster vira placeholder)
        // (v3.12) a proporção do post não é mais lida no harvest — a grade é uniforme (4:6 pra todos)
        const prof = [...a.querySelectorAll("a")].map((l) => l.pathname || "").find((p) => /^\/[^/]+\/$/.test(p) && !/^\/(explore|reels|p|reel)\//.test(p));
        const author = prof ? prof.replace(/\//g, "") : "";
        // avatar: o fallback "primeira <img> do artigo" pegava a PRÓPRIA MÍDIA do post quando o alt não
        // era reconhecível — o card então baixava a foto de novo, em tamanho de post, só pra exibir
        // 30×30 no header. Qualquer candidato dentro do carrier de mídia está descartado.
        let avatar = a.querySelector('img[alt*="profile" i]');
        if (!avatar) for (const im of a.querySelectorAll("img")) { if (!box.contains(im)) { avatar = im; break; } }
        const capEl = a.querySelector("h1");
        const link = a.querySelector('a[href*="/p/"], a[href*="/reel/"]');
        // contadores (na área de ações, DEPOIS da mídia, em ordem: like, comment, repost)
        const nums = [];
        let afterMedia = false;
        for (const e of a.querySelectorAll("span, a, div")) {
            if (e === box || box.contains(e)) { afterMedia = true; continue; }
            if (!afterMedia || e.children.length) continue;
            const t = (e.textContent || "").trim();
            if (/^\d[\d.,]*\s?[KMmilB]*$/.test(t) && t.length < 10 && !nums.includes(t)) { nums.push(t); if (nums.length >= 3) break; }
        }
        // follow: existe um botão "Follow"/"Seguir" no post? (= ainda não sigo)
        let canFollow = false;
        for (const b of a.querySelectorAll('button, [role="button"]')) {
            if (/^(follow|seguir)$/i.test((b.textContent || "").trim())) { canFollow = true; break; }
        }
        // LEGENDA: o <h1> do post nem sempre existe no momento do harvest (o IG renderiza a legenda tarde,
        // e no <article> virtualizado às vezes nem chega) — daí a descrição sumir na home. Caio na API
        // (igMedia, alimentada por feed/timeline), e se ela ainda não respondeu o updateCardsMeta completa
        // depois. Limite alto: o texto inteiro é o que o "mais" expande; só as 2 primeiras linhas ficam à mostra.
        const code = codeOf(key);
        const capText = (capEl && (capEl.textContent || "").trim()) || (igMedia.get(code) || {}).caption || "";
        posts.set(key, {
            key, code, href: (link.pathname || link.getAttribute("href") || ""), author,
            avatar: avatar ? avatar.src : "", media, srcset, sizes, isVideo: !!video,
            caption: capText.slice(0, 1500),
            likes: nums[0] || "", comments: nums[1] || "", reposts: nums[2] || "", follow: canFollow,
        });
        order.push(key);
        return true;
    }
    // chave de um TILE (o próprio <a> é o item; href tem /p/CODE ou /{user}/p/CODE)
    function tileKey(a) {
        const href = a.getAttribute("href") || a.href || "";
        const m = href.match(/\/(?:p|reel)\/[^/?#]+/);
        if (!m) return null;
        if (a.dataset.igfKey !== m[0]) a.dataset.igfKey = m[0];
        return m[0];
    }
    // lê um TILE (explore/profile) → post só-mídia. Proporção REAL: API (igMedia w/h) → senão naturalW/H
    // do thumbnail (o IG serve a imagem em aspecto real e só CORTA por CSS p/ quadrado) → senão 1:1.
    function harvestTile(a) {
        const key = tileKey(a);
        if (!key || posts.has(key)) return false;
        const code = codeOf(key);
        const rec = igMedia.get(code) || {};
        // CARD COMPLETO (explore/salvos): renderiza JÁ com a mídia; autor/avatar/legenda são PREENCHIDOS depois,
        // quando o igMedia ingere a resposta da API (updateCardsMeta) — em vez de esperar (o 1º lote saía sem header).
        const img = a.querySelector("img");
        const vid = a.querySelector("video");   // tiles de REEL no explore são <video> (sem <img>) → pego o poster
        // PRIORIDADE = thumbUrl da API (pequena, proporção real, disponível assim que o JSON é lido — NÃO espera
        // o <img> da grade nativa off-screen carregar, que é o gargalo). Fallbacks: img/poster nativo, imagem cheia.
        const media = rec.thumbUrl || (img && img.getAttribute("src")) || (vid && (vid.getAttribute("poster") || vid.poster)) || rec.imageUrl || "";
        if (!media) return false;                             // sem poster/thumb ainda → NÃO commita (re-tenta quando renderizar) → nunca tela preta
        const isVideo = !!rec.isVideo || !!vid || !!a.querySelector('svg[aria-label="Reel" i], svg[aria-label="Clip" i], svg[aria-label*="eel" i], svg[aria-label*="lip" i]');
        const iconCarousel = !!a.querySelector('svg[aria-label*="arousel" i]');   // ícone de galeria no tile
        const hasSlides = !!(rec.carousel && rec.carousel.length > 1);
        // GALERIA: se o tile É galeria mas a API ainda não trouxe os slides, ESPERA até ~1.5s (a navegação ‹ ›
        // precisa deles). Sem isto, harvestava cedo demais e a galeria virava capa única (sem setas).
        if (iconCarousel && !hasSlides) {
            const t0 = carouselWait.get(key);
            if (!t0) { carouselWait.set(key, Date.now()); return false; }
            if (Date.now() - t0 < 1500) return false;         // ainda esperando os slides
        }
        // (v3.12) a proporção do post NÃO é mais lida: a grade é uniforme, a caixa da mídia já nasce
        // com a altura final. Um leitor a menos por tile no caminho crítico do harvest.
        posts.set(key, {
            key, code, href: (a.getAttribute("href") || a.href || ""), media, isVideo, tile: true,
            // dados p/ o CARD COMPLETO (explore/perfil/salvos): vêm da API (igMedia), não do DOM do tile
            author: rec.author || "", avatar: rec.avatar || "", caption: rec.caption || "", likes: rec.likes || "", comments: rec.comments || "", reposts: "",
            authorPk: rec.authorPk || "", following: rec.following, follow: rec.following !== true,   // mostra "Seguir" a menos que JÁ siga
        });
        order.push(key);
        return true;
    }
    const go = (href) => { if (href) location.href = href; };
    // URL canônica e LIMPA do post (sem ?igsh=/utm de tracking) — montada do code, não da href com query
    function cleanPostUrl(p) {
        const code = p.code || codeOf(p.key);
        const kind = /\/reel\//.test(p.href) ? "reel" : "p";
        return code ? (location.origin + "/" + kind + "/" + code + "/") : (location.origin + (p.href || "/"));
    }
    function fallbackCopy(text, done) {   // sem navigator.clipboard (http/permita) → execCommand
        try {
            const ta = el("textarea", { style: { position: "fixed", top: "-1000px", opacity: "0" } });
            ta.value = text; (document.body || document.documentElement).appendChild(ta); ta.focus(); ta.select();
            document.execCommand("copy"); ta.remove(); if (done) done();
        } catch (_) { /**/ }
    }
    function copyLink(p, btn) {            // share = COPIAR o link limpo pro clipboard (+ feedback de check)
        const url = cleanPostUrl(p);
        const done = () => {
            btn.classList.add("igf-copied"); btn.innerHTML = ICO.check; btn.title = "Link copiado";
            setTimeout(() => { btn.classList.remove("igf-copied"); btn.innerHTML = ICO.link; btn.title = "Copiar link"; }, 1500);
        };
        try {
            if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(url).then(done).catch(() => fallbackCopy(url, done));
            else fallbackCopy(url, done);
        } catch (_) { fallbackCopy(url, done); }
    }
    // ABRIR A MODAL (overlay sobre o feed), não navegar. O <a> de permalink (`/p/CODE/`) só NAVEGA →
    // página do post ("outra página"). A modal in-feed é aberta por `openPostModalForId` (bundle), que
    // dispara no onClick do BOTÃO DE COMENTÁRIO nativo (PolarisCommentButton → no desktop dá
    // preventDefault + abre a modal, SEM navegar). Então o alvo certo é esse botão — não o link.
    function nativeModalTrigger(art) {
        if (!art) return null;
        // ícone de comentário (locale varia: Comment / Comentar / Comentário) → seu botão clicável (role=button)
        const svg = art.querySelector('svg[aria-label="Comment" i], svg[aria-label="Comentar" i], svg[aria-label="Comentário" i], svg[aria-label*="omment" i], svg[aria-label*="oment" i]');
        const btn = svg && svg.closest('[role="button"], button, a');
        if (btn) return btn;
        // FALLBACKS (o aria-label muda com locale/experimento e era aí que a modal falhava e virava
        // redirect): 1) botão cujo próprio aria-label fala de comentário; 2) o link do permalink com
        // role=link, que o roteador do IG intercepta e abre como overlay.
        const byLabel = art.querySelector('[role="button"][aria-label*="oment" i], button[aria-label*="oment" i]');
        if (byLabel) return byLabel;
        return art.querySelector('a[role="link"][href*="/p/"], a[role="link"][href*="/reel/"]');
    }
    function clickModalTrigger(key) {
        const btn = nativeModalTrigger(nativeArticle(key));
        if (btn) { btn.click(); return true; }   // React processa o clique sintético → openPostModalForId → overlay
        return false;
    }
    // clico o botão de comentário NATIVO → overlay (com o campo de comentário já em foco). A lista nativa
    // fica off-screen e o IG VIRTUALIZA, então o artigo pode não estar no DOM: quem resolve isso é o
    // openViaNative, que espera o nó aparecer em vez de desistir cedo.
    function openPost(p, card) {
        if (!igSrc || !igSrc.isConnected) applyFeed();   // igSrc sumiu/ficou stale (modal re-renderizou o feed) → re-aponta antes de tentar
        openViaNative(p, card, () => clickModalTrigger(p.key));
    }
    // tile (explore/profile): o item nativo É um <a>; clicá-lo abre o post em MODAL (o IG intercepta o
    // onClick e faz history.push sem sair da página). Off-screen (.igf-src) → o .click() programático passa.
    function nativeTile(key) {
        if (igSrc) { for (const a of igSrc.querySelectorAll(GRID_SEL)) if (tileKey(a) === key) return a; }
        // o React pode ter re-renderizado a grade FORA do igSrc que conhecíamos (troca de aba do perfil,
        // volta de modal): procura no documento inteiro antes de desistir e cair no redirect.
        for (const a of document.querySelectorAll("main " + GRID_SEL)) if (tileKey(a) === key) return a;
        return null;
    }
    function openItem(p, card) { return p.tile ? openTile(p, card) : openPost(p, card); }   // dispatch home↔grid
    function openTile(p, card) {
        if (!igSrc || !igSrc.isConnected) applyGrid();
        openViaNative(p, card, () => { const a = nativeTile(p.key); if (!a) return false; a.click(); return true; });
    }

    /* ABRIR EM OVERLAY — sempre que possível, NUNCA redirecionar.
     * O gatilho tem que ser o nó NATIVO do post (é o React do IG que abre o lightbox), mas a lista
     * nativa vive off-screen e virtualizada: o artigo/tile do post clicado pode não estar no DOM.
     * Antes: tentativa a cada ~100ms e desistência em <1s → caía no redirect com frequência.
     * Agora: EVENT-DRIVEN — um MutationObserver no igSrc clica no instante em que o nó aparece,
     * enquanto um nudge periódico varre a janela virtualizada em torno da posição estimada. O
     * redirect virou último recurso de verdade (só se nada renderizar em OPEN_MAX_MS). */
    const OPEN_MAX_MS = 4000;
    let openWait = null;
    function cancelOpenWait() {
        if (!openWait) return;
        try { openWait.obs.disconnect(); } catch (_) { /**/ }
        clearTimeout(openWait.timer); clearInterval(openWait.nudge);
        if (openWait.card) openWait.card.classList.remove("igf-opening");
        openWait = null;
    }
    // fração 0..1 de onde o post está na lista: posição visual do card (precisa) ou o índice em `order`
    function seekFraction(p, card) {
        if (card && card.isConnected) {
            const top = (window.scrollY || 0) + card.getBoundingClientRect().top;
            const docMax = Math.max(1, document.documentElement.scrollHeight - (window.innerHeight || 800));
            return Math.min(1, Math.max(0, top / docMax));
        }
        const n = order.length || 1, idx = Math.max(0, order.indexOf(p.key));
        return n > 1 ? idx / (n - 1) : 0;
    }
    function openViaNative(p, card, tryOpen) {
        cancelOpenWait();
        // vai abrir a overlay por cima → o vídeo do card não pode continuar tocando atrás dela
        if (hoverCard) { const h = hoverCard; hoverCard = null; suspendVideo(h); }
        clearTimeout(hoverT); hoverNext = null;
        if (tryOpen()) return;                                   // o nó já estava lá → overlay na hora
        const src = igSrc;
        if (!src) { go(cleanPostUrl(p)); return; }
        if (card) card.classList.add("igf-opening");              // feedback: o clique foi registrado
        const frac = seekFraction(p, card);
        const seek = (bias) => {
            if (loading) return;                                  // o loadMore controla o scrollTop; não brigo
            const max = Math.max(0, src.scrollHeight - src.clientHeight);
            src.scrollTop = Math.max(0, Math.min(max, frac * max + bias * src.clientHeight * 0.5 - src.clientHeight / 2));
        };
        const check = () => { if (igSrc !== src) { cancelOpenWait(); return true; } if (!tryOpen()) return false; cancelOpenWait(); return true; };
        seek(0);
        const obs = new MutationObserver(check);
        try { obs.observe(src, { childList: true, subtree: true }); } catch (_) { /**/ }
        let n = 0;
        const nudge = setInterval(() => { if (check()) return; n++; seek((n % 5) - 2); }, 200);   // varre ±1 tela em torno do palpite
        const timer = setTimeout(() => { const pend = openWait; cancelOpenWait(); if (pend && !tryOpen()) go(cleanPostUrl(p)); }, OPEN_MAX_MS);
        openWait = { obs, timer, nudge, card };
        check();
    }
    // acha o <article> nativo (vivo no igSrc) pelo permalink — p/ like/follow real e mover o vídeo.
    // FAST-PATH pelo data-igf-key estampado no postKey (chamado por frame de scroll via syncSrcScroll):
    // o loop antigo fazia querySelector por artigo, por chamada. O hint é re-verificado (postKey re-estampa
    // se o React reciclou o nó); mismatch → cai no loop completo.
    function nativeArticle(key) {
        if (!igSrc || !key) return null;
        const hint = igSrc.querySelector('article[data-igf-key="' + key + '"]');
        if (hint && postKey(hint) === key) return hint;
        for (const a of igSrc.querySelectorAll("article")) if (postKey(a) === key) return a;
        return null;
    }
    /* CURTIR / SALVAR — um caminho só para todas as superfícies (v3.16), pelo mesmo motivo do SEGUIR.
     * Na home dependiam do botão nativo dentro do <article> virtualizado: curtir NAVEGAVA pro post
     * quando não achava (`go(p.href)`) e salvar desistia calado. Agora vai pela API (pk da mídia),
     * com o clique no nativo como plano B e aviso quando nada funciona. */
    function nativeActionBtn(key, labels) {
        const art = nativeArticle(key);
        if (!art) return null;
        const svg = art.querySelector(labels.map((l) => 'svg[aria-label="' + l + '" i]').join(", "));
        return svg && svg.closest('[role="button"], button, a, div');
    }
    async function toggleAction(p, btn, kind) {
        if (btn.dataset.busy) return;
        btn.dataset.busy = "1";
        const on = !btn.classList.contains("on");
        btn.classList.toggle("on", on);                       // otimista: o feedback é instantâneo
        try {
            const pk = pkOf(p);
            const path = kind === "like"
                ? "/api/v1/web/likes/" + pk + (on ? "/like/" : "/unlike/")
                : "/api/v1/web/save/" + pk + (on ? "/save/" : "/unsave/");
            if (pk && await igApiPost(path, "")) return;
            const nb = nativeActionBtn(p.key, kind === "like"
                ? ["Like", "Curtir", "Unlike", "Descurtir"]
                : ["Save", "Salvar", "Remove", "Remover"]);
            if (nb) { nb.click(); return; }                    // plano B: o botão nativo do post
            btn.classList.toggle("on", !on);                   // não deu → desfaz e avisa (nunca em silêncio)
            toast(pk ? "O Instagram recusou a ação" : "A API ainda não trouxe este post");
        } finally { delete btn.dataset.busy; }
    }
    const likeItem = (p, card, btn) => toggleAction(p, btn, "like");
    function saveItem(p, card, btn) {
        if (surface === "saved") { unsaveTile(p, card, btn); return; }   // salvos: o "salvar" É des-salvar (+ some o card)
        return toggleAction(p, btn, "save");
    }
    /* SEGUIR — um caminho só para todas as superfícies (v3.16).
     * Antes eram dois, e os dois falhavam:
     *   • home: clicava o botão NATIVO dentro do <article>, que quase sempre está virtualizado — 8
     *     tentativas em ~900ms e desistia EM SILÊNCIO (clicava e não acontecia nada).
     *   • grid: precisava do pk do autor vindo da API; sem ele, abria o POST em vez de seguir.
     * Agora: resolve o pk (do post, do igMedia ou do perfil via API), segue pela API — o mesmo
     * caminho de like/salvar, que é confiável —, cai no botão nativo se a API recusar, e se nada
     * der certo AVISA em vez de ficar quieto. */
    const userPkCache = new Map();   // username -> { pk, following }
    async function resolveUser(username) {
        if (!username) return null;
        if (userPkCache.has(username)) return userPkCache.get(username);
        try {
            const r = await fetch("/api/v1/users/web_profile_info/?username=" + encodeURIComponent(username),
                { credentials: "include", headers: { "X-IG-App-ID": igAppId, "X-Requested-With": "XMLHttpRequest" } });
            if (!r.ok) return null;
            const j = await r.json();
            const u = j && j.data && j.data.user;
            if (!u || !u.id) return null;
            const rec = { pk: String(u.id), following: !!u.followed_by_viewer };
            userPkCache.set(username, rec);
            return rec;
        } catch (_) { return null; }
    }
    // clica o botão nativo do post (último recurso quando a API recusa). null se não achar.
    function nativeFollowBtn(key) {
        const art = nativeArticle(key);
        if (!art) return null;
        for (const b of art.querySelectorAll('button, [role="button"]')) {
            if (/^(follow|seguir|following|seguindo)$/i.test((b.textContent || "").trim())) return b;
        }
        return null;
    }
    // o mesmo autor aparece em vários cards — todos acompanham o novo estado
    function syncFollowButtons(author, following) {
        if (!feedEl || !author) return;
        for (const card of feedEl.children) {
            const p = posts.get(card.dataset && card.dataset.key || "");
            if (!p || p.author !== author) continue;
            p.following = following;
            const b = card.querySelector(".igf-follow");
            if (b) { b.classList.toggle("on", following); b.textContent = following ? "Seguindo" : "Seguir"; }
        }
    }
    async function followUser(p, btn) {
        if (btn.dataset.busy) return;
        btn.dataset.busy = "1"; btn.classList.add("igf-busy");
        try {
            let pk = p.authorPk || (igMedia.get(p.code || codeOf(p.key)) || {}).authorPk || "";
            if (!pk && p.author) { const u = await resolveUser(p.author); if (u) { pk = u.pk; p.authorPk = pk; } }
            const wasFollowing = btn.classList.contains("on");
            const next = !wasFollowing;
            if (pk) {
                btn.classList.toggle("on", next); btn.textContent = next ? "Seguindo" : "Seguir";   // otimista
                if (await igApiPost("/api/v1/friendships/" + (next ? "create" : "destroy") + "/" + pk + "/", "")) {
                    if (p.author) userPkCache.set(p.author, { pk, following: next });
                    syncFollowButtons(p.author, next);
                    return;
                }
                btn.classList.toggle("on", wasFollowing); btn.textContent = wasFollowing ? "Seguindo" : "Seguir";   // desfaz
            }
            const nb = nativeFollowBtn(p.key);                 // API indisponível/recusada → tenta o nativo
            if (nb) { nb.click(); syncFollowButtons(p.author, next); return; }
            toast(pk ? "O Instagram recusou a ação" : "Não consegui identificar o perfil");
        } finally { delete btn.dataset.busy; btn.classList.remove("igf-busy"); }
    }

    /* === HOVER-TO-PLAY (v3.14, reescrito) ====================================================
     * O modelo antigo criava o <video> ao entrar e o DESTRUÍA ao sair — voltar num card já visto
     * recarregava tudo do zero, e atravessar a grade disparava uma cascata de create/destroy.
     * Agora:
     *   • DEBOUNCE de entrada (HOVER_IN): passar por cima não dispara nada; só parar sobre o card.
     *   • O NOSSO <video> (URL .mp4 da API) SOBREVIVE ao fim do hover, apenas pausado — voltar é
     *     instantâneo, sem rede. Um LRU curto (KEEP_ALIVE) segura os últimos; o resto volta ao poster.
     *   • O <video> NATIVO emprestado (fallback quando a API não deu URL) continua sendo devolvido
     *     na saída: o IG mata a MediaSource ao virtualizar o artigo e ele viraria tela preta.
     *   • O vídeo só APARECE quando tem frame (loadeddata) → fade por cima do poster, nunca um
     *     retângulo preto no meio do card.
     *   • Todo play() revalida se o card ainda é o do cursor — nada de tocar o card errado depois
     *     de uma promessa lenta resolver.
     *   • A lista nativa off-screen só é sincronizada quando o card em hover PRECISA dela (sem URL
     *     na API); com URL, o hover não provoca nenhum churn no React do IG. */
    const HOVER_IN = 110;      // ms sobre o card antes de começar a tocar
    const KEEP_ALIVE = 5;      // quantos <video> NOSSOS ficam vivos (pausados) fora do hover
    let videoIO = null, pickQ = false, hoverCard = null, hoverT = 0, hoverNext = null;
    const visVids = new Set();      // cards de vídeo VISÍVEIS
    const liveCards = [];           // LRU (mais recente no fim) dos cards com <video> nosso vivo
    const videoState = new Map();   // code -> currentTime: retoma de onde parou quando o vídeo é recriado
    let feedSoundOn = false;        // intenção GLOBAL de som no feed: o 1º unmute (gesto) liga; novos vídeos já entram com som
    const apiVideoUrl = (card) => (igMedia.get(card.dataset.code || "") || {}).videoUrl || "";
    // algum card de vídeo VISÍVEL depende do <video> nativo? (= a API não deu URL pra ele).
    // É o único caso que ainda justifica manter a lista nativa alinhada ao scroll.
    function needsNativeVideo() {
        for (const card of visVids) if (card.isConnected && !apiVideoUrl(card)) return true;
        return false;
    }
    function ensureVideoIO() {
        if (videoIO || typeof IntersectionObserver === "undefined") return;
        videoIO = new IntersectionObserver((ents) => {
            for (const e of ents) {
                if (e.isIntersecting) { visVids.add(e.target); continue; }
                visVids.delete(e.target);
                if (hoverCard === e.target) hoverCard = null;
                if (hoverNext === e.target) { clearTimeout(hoverT); hoverNext = null; }
                releaseVideo(e.target);   // saiu da tela → devolve de vez (não segura memória fora de vista)
            }
        }, { threshold: 0 });
    }
    // garante o invariante "só o card sob o cursor está TOCANDO" (o scroll pode ter movido a grade
    // sob o mouse). Percorre só os vivos (≤ KEEP_ALIVE), não todos os cards visíveis.
    function pickVideos() {
        if (hoverCard && !hoverCard.isConnected) hoverCard = null;
        for (const card of liveCards.slice()) {
            if (card === hoverCard) continue;
            const v = card.querySelector(".igf-video video");
            if (v && !v.paused) suspendVideo(card);
        }
        if (hoverCard) activateVideo(hoverCard);
    }
    function queuePick() { if (pickQ) return; pickQ = true; raf(() => { pickQ = false; pickVideos(); }); }
    function onCardEnter(card) {
        if (hoverCard === card || hoverNext === card) return;
        clearTimeout(hoverT);
        hoverNext = card;
        hoverT = setTimeout(() => { hoverNext = null; beginHover(card); }, HOVER_IN);
    }
    function onCardLeave(card) {
        if (hoverNext === card) { clearTimeout(hoverT); hoverNext = null; }
        if (hoverCard === card) { hoverCard = null; suspendVideo(card); }
    }
    function beginHover(card) {
        if (!card.isConnected) return;
        if (hoverCard && hoverCard !== card) suspendVideo(hoverCard);
        hoverCard = card;
        if (apiVideoUrl(card)) { activateVideo(card); return; }
        // sem URL na API → depende do <video> NATIVO, que pode estar virtualizado. Puxo a lista
        // off-screen pra posição do card e re-tento por ~1s: antes, se o nativo não estivesse lá no
        // exato instante do hover, o card simplesmente não tocava até o próximo scroll.
        syncSrcScroll();
        let tries = 0;
        const tryLater = () => {
            if (hoverCard !== card || !card.isConnected) return;
            activateVideo(card);
            if (!card.querySelector(".igf-video video") && ++tries < 6) setTimeout(tryLater, 160);
        };
        tryLater();
    }
    function activateVideo(card) {
        const media = card.querySelector(".igf-video");
        if (!media) return;
        const v = media.querySelector("video") || createVideo(card, media);
        if (!v) return;
        media.classList.remove("igf-paused");
        if (!v.paused) { if (v.dataset.igOwn) trackLive(card); return; }   // já tocando (o pick roda a cada scroll) → nada a fazer
        try {
            v.loop = true; v.playsInline = true;
            const pr = v.play && v.play();
            if (pr && pr.catch) pr.catch(() => {
                if (hoverCard !== card) return;            // já saiu → o pause é que interrompeu; nada a fazer
                // som sem gesto do usuário é bloqueado pela política de autoplay → cai pra mudo (mas TOCA)
                try { v.muted = true; const p2 = v.play(); if (p2 && p2.catch) p2.catch(() => { /**/ }); } catch (_) { /**/ }
            });
        } catch (_) { /**/ }
    }
    function createVideo(card, media) {
        let v;
        const url = apiVideoUrl(card);
        if (url) {
            // CAMINHO BOM: MEU <video> com a URL .mp4 REAL da API → confiável, recriável, sem preto
            v = el("video", { src: url, preload: "auto", playsinline: "", "webkit-playsinline": "" });
            v.loop = true; v.playsInline = true; v.dataset.igOwn = "1";
            v.muted = !feedSoundOn;                          // preserva a intenção de som (não re-muta a cada hover)
            try { v.volume = prefs.volume; } catch (_) { /**/ }
            const savedT = videoState.get(card.dataset.code || "");   // retoma de onde parou
            if (savedT) v.addEventListener("loadedmetadata", () => { try { if (savedT < (v.duration || 1e9)) v.currentTime = savedT; } catch (_) { /**/ } }, { once: true });
            v.addEventListener("volumechange", () => { feedSoundOn = !v.muted && v.volume > 0; });   // (des)mutou → intenção global segue
            v.addEventListener("error", () => releaseVideo(card), { once: true });   // URL expirada → volta o poster (sem tela preta)
            trackLive(card);
        } else {
            // FALLBACK: empresta o <video> nativo (some/fica preto ao virtualizar → devolvido na saída)
            const art = nativeArticle(card.dataset.key);
            v = art && art.querySelector("video");
            if (!v) return null;                             // sem URL e sem nativo → fica o poster
            v.muted = true;
        }
        // .on = "tem imagem": só entra quando há 1º frame → o fade cobre o poster sem piscar preto.
        // No mesmo gancho decido se o vídeo é largo demais pra caixa (então entra inteiro, sem zoom).
        const reveal = () => {
            if (!v.isConnected) return;
            media.classList.add("on");
            // o backdrop borrado sai do POSTER (o <video> não serve de background-image) — sem isso o
            // vídeo deitado entrava em contain sobre o fundo chapado, com barras pretas em vez do borrão
            const poster = media.querySelector("img");
            mediaFit(media, v.videoWidth, v.videoHeight, (poster && (poster.currentSrc || poster.src)) || "");
        };
        if (v.readyState >= 2) reveal(); else v.addEventListener("loadeddata", reveal, { once: true });
        if (!media.querySelector("[data-instancekey]")) media.appendChild(el("div", { "data-instancekey": "igf" }));   // âncora p/ o player mirar a MÍDIA
        media.appendChild(v);
        try { attach(v); } catch (_) { /**/ }   // barra de player (uma vez por vídeo, não por hover)
        return v;
    }
    // fim do hover: PAUSA. O nosso vídeo fica no card (frame parado + ▶ por cima) pro próximo hover
    // ser instantâneo; o nativo emprestado é devolvido na hora.
    function suspendVideo(card) {
        const media = card && card.querySelector(".igf-video");
        const v = media && media.querySelector("video");
        if (!v) return;
        try { v.pause(); } catch (_) { /**/ }
        saveVideoTime(card, v);
        if (!v.dataset.igOwn) { releaseVideo(card); return; }
        media.classList.add("igf-paused");
    }
    function saveVideoTime(card, v) {
        const code = card.dataset.code;
        if (code && v.dataset.igOwn) { const t = v.currentTime; if (isFinite(t) && t > 0) videoState.set(code, t); }
    }
    // LRU dos vídeos vivos: segura os últimos KEEP_ALIVE e devolve o mais antigo ao poster.
    function trackLive(card) {
        const i = liveCards.indexOf(card);
        if (i >= 0) liveCards.splice(i, 1);
        liveCards.push(card);
        while (liveCards.length > KEEP_ALIVE) {
            const old = liveCards.shift();
            if (old !== hoverCard) releaseVideo(old);
            else liveCards.push(old);   // o do cursor nunca é despejado
        }
    }
    // devolve de vez: pausa, destrói a barra do player, REMOVE o <video> e volta o poster.
    function releaseVideo(card) {
        const i = liveCards.indexOf(card);
        if (i >= 0) liveCards.splice(i, 1);
        const media = card && card.querySelector(".igf-video");
        const v = media && media.querySelector("video");
        if (!v) return;
        try { v.pause(); } catch (_) { /**/ }
        saveVideoTime(card, v);
        const ctrl = controllers.get(v);
        if (ctrl && ctrl.destroy) { try { ctrl.destroy(); } catch (_) { /**/ } }   // remove a barra + listeners
        try { v.remove(); } catch (_) { /**/ }
        const dummy = media.querySelector('[data-instancekey="igf"]'); if (dummy) dummy.remove();
        media.classList.remove("on", "igf-paused");                                // poster + badge de play reaparecem
    }
    function observeVideoCard(card) {
        if (card.dataset.vio || !card.querySelector(".igf-video")) return;
        ensureVideoIO();
        if (videoIO) { videoIO.observe(card); card.dataset.vio = "1"; }
    }

    // mantém a lista nativa (off-screen) ALINHADA ao card de vídeo MAIS CENTRAL da tua viewport
    // → o <video> nativo dos cards que você está VENDO fica vivo (não virtualizado) e pronto p/ tocar.
    // (Antes alinhava por ratio global: o nativo do card visível caía fora da janela → não tocava,
    //  enquanto um card menos visível, cujo nativo por acaso estava vivo, é que tocava.)
    let syncQ = false;
    function centeredVideoCard() {              // card de vídeo mais perto do centro da tela (âncora p/ o nativo)
        if (!visVids.size) return null;
        const vh = window.innerHeight || 800; let best = null, bestD = Infinity;
        for (const card of visVids) {
            if (!card.isConnected) continue;
            const r = card.getBoundingClientRect();
            if (Math.min(r.bottom, vh) - Math.max(r.top, 0) < 60) continue;   // praticamente fora da tela
            const d = Math.abs((r.top + r.bottom) / 2 - vh / 2);
            if (d < bestD) { bestD = d; best = card; }
        }
        return best;
    }
    function syncSrcScroll(retry) {
        if (syncQ) return; syncQ = true;
        raf(() => {
            syncQ = false;
            if (!igSrc || loading) return;
            const anchor = (hoverCard && hoverCard.isConnected) ? hoverCard : centeredVideoCard();   // hover manda; senão o card central
            const art = anchor && nativeArticle(anchor.dataset.key);
            if (art) {
                // centraliza o ARTIGO nativo dentro do igSrc → natives da região visível ficam vivos.
                // DEAD-BAND: o nativo só precisa estar PERTO do centro, não pixel-perfeito — o nudge de
                // scrollTop a cada frame re-disparava a virtualização do React, que disparava o srcMO,
                // que re-harvestava… um loop de churn alimentado pelo próprio scroll.
                const sr = igSrc.getBoundingClientRect(), ar = art.getBoundingClientRect();
                const delta = (ar.top - sr.top) - (igSrc.clientHeight / 2 - ar.height / 2);
                if (Math.abs(delta) > (igSrc.clientHeight || 480) / 3) igSrc.scrollTop += delta;
                queuePick();                                   // nativo certo agora existe → toca o card central
            } else {
                // âncora ainda não renderizada (virtualizada) → aproxima por ratio e afina 1x quando renderizar
                const docMax = (document.documentElement.scrollHeight - (window.innerHeight || 800)) || 1;
                const r = Math.min(1, Math.max(0, (window.scrollY || 0) / docMax));
                const srcMax = igSrc.scrollHeight - igSrc.clientHeight;
                if (srcMax > 0 && Math.abs(igSrc.scrollTop - r * srcMax) > (igSrc.clientHeight || 480) / 3) igSrc.scrollTop = r * srcMax;   // mesmo dead-band
                if (!retry) raf(() => syncSrcScroll(true));
            }
        });
    }

    // galeria/carrossel: navega os slides com SETAS (+ dots + contador). A caixa é a mesma do card e não
    // muda de slide pra slide → trocar de slide não mexe em NADA do layout; quem se ajusta é a mídia
    // (mediaFit por slide). Slide de vídeo mostra a capa + ▶ (abre a modal).
    function buildCarousel(p, card, slides) {
        const wrap = el("a", { class: "igf-media igf-carousel", href: cleanPostUrl(p) });
        wrap.addEventListener("click", (e) => {               // clicar o slide → modal (ctrl/cmd/meio = nova aba)
            if (e.metaKey || e.ctrlKey || e.shiftKey || e.button === 1) return;
            e.preventDefault(); openItem(p, card);            // home → modal in-feed; tile → clica o <a> nativo
        });
        let idx = 0;
        const stage = el("div", { class: "igf-cstage" });
        const prev = el("button", { class: "igf-cnav igf-cprev", type: "button", "aria-label": "Anterior", html: ICO.chevL });
        const next = el("button", { class: "igf-cnav igf-cnext", type: "button", "aria-label": "Próximo", html: ICO.chevR });
        const dots = el("div", { class: "igf-cdots" });
        for (let i = 0; i < slides.length; i++) dots.appendChild(el("span", { class: "igf-cdot" }));
        const counter = el("div", { class: "igf-ccount" });
        function render() {
            const s = slides[idx] || {};
            stage.textContent = "";
            const url = s.thumbUrl || s.imageUrl || p.media || "";
            const si = el("img", { src: url, loading: "lazy", decoding: "async", alt: "" });
            // CADA slide decide o próprio enquadramento. Antes o carrossel montava o <img> por fora do
            // mediaImg() e nunca chamava o mediaFit → galeria com foto deitada ficava SEMPRE em cover,
            // cortada nas laterais. `si` não está no DOM ainda, então o alvo do fit é o `wrap`.
            const fit = () => {
                if (stage.firstChild !== si) return;               // slide já trocou → esta proporção é de outro
                si.classList.add("on");                            // mesmo fade-in dos demais (o CSS parte de opacity:0)
                mediaFit(wrap, s.w || si.naturalWidth, s.h || si.naturalHeight, si.currentSrc || url);
            };
            stage.appendChild(si);
            // a API já traz original_width/height do slide → enquadra ANTES de a imagem baixar (sem pulo)
            if (s.w && s.h) mediaFit(wrap, s.w, s.h, url);
            if (si.complete && si.naturalWidth) fit();             // do cache: `complete` no mesmo tick, sem evento `load`
            else si.addEventListener("load", fit, { once: true });
            if (s.isVideo) stage.appendChild(el("div", { class: "igf-play", html: PLAY_SVG }));   // capa de vídeo: ▶ (abre na modal)
            for (let i = 0; i < dots.children.length; i++) dots.children[i].classList.toggle("on", i === idx);
            counter.textContent = (idx + 1) + "/" + slides.length;
            prev.hidden = idx === 0;
            next.hidden = idx === slides.length - 1;
        }
        const step = (d) => { const ni = clamp(idx + d, 0, slides.length - 1); if (ni === idx) return; idx = ni; render(); };
        const nav = (d, e) => { e.preventDefault(); e.stopPropagation(); step(d); };
        prev.addEventListener("click", (e) => nav(-1, e));
        next.addEventListener("click", (e) => nav(1, e));
        // SCROLL HORIZONTAL do mouse/trackpad (ou shift+roda) navega os slides — 1 por gesto (lock + acúmulo).
        let wheelAcc = 0, wheelLock = false;
        wrap.addEventListener("wheel", (e) => {
            const dx = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : (e.shiftKey ? e.deltaY : 0);
            if (!dx) return;                                 // gesto vertical puro → deixa a página rolar
            e.preventDefault(); e.stopPropagation();
            if (wheelLock) return;
            wheelAcc += dx;
            if (Math.abs(wheelAcc) >= 40) {                  // limiar → 1 passo (trackpad manda muitos deltas pequenos)
                step(wheelAcc > 0 ? 1 : -1);
                wheelAcc = 0; wheelLock = true;
                setTimeout(() => { wheelLock = false; }, 240);
            }
        }, { passive: false });
        wrap.append(stage, prev, next, counter, dots);
        render();
        return wrap;
    }
    /* <img> da mídia de um card — ponto ÚNICO de política de carregamento.
     * v3.17, TRÁFEGO: pedimos EXATAMENTE a mesma variante que o <img> nativo pede — mesma URL, mesmo
     * srcset, mesmo `sizes`. Parece contraintuitivo (um `sizes` da nossa coluna baixaria menos bytes),
     * mas a lista nativa segue viva off-screen e o IG baixa a mídia dela de qualquer jeito: escolher
     * outra variante fazia o browser baixar a MESMA foto DUAS vezes, uma pro IG e outra pra nós.
     * Com a escolha idêntica, o nosso pedido sai do cache — metade das requisições de imagem.
     *   • `loading=lazy` + `decoding=async` → nada bloqueia o frame.
     *   • fade-in curto ao carregar: sem ele o card pisca do fundo chapado pra imagem. */
    /* Mídia mais LARGA que a caixa (9:16) não é ampliada pra preencher: entra inteira (contain) e o
     * fundo vira uma cópia borrada dela mesma. Aplico assim que souber a proporção — pela API, se ela
     * já trouxe w/h, senão no load da imagem/vídeo. `natW/natH` é o tamanho real do arquivo. */
    const FIT_LIMIT = AR_W / AR_H;   // acima desta razão (largura/altura) o conteúdo é "largo demais" pra caixa
    function mediaFit(media, natW, natH, url) {
        if (!media || !natW || !natH) return;
        media.classList.toggle("igf-fit", natW / natH > FIT_LIMIT * 1.02);
        if (!media.classList.contains("igf-fit") || !url) return;
        let bg = media.querySelector(".igf-blur");
        if (!bg) { bg = el("div", { class: "igf-blur" }); media.insertBefore(bg, media.firstChild); }
        // O backdrop é uma cópia DA MÍDIA ATUAL, e no carrossel a mídia atual troca a cada slide: se eu
        // só criasse o .igf-blur na primeira vez, o slide 5 apareceria sobre o borrão do slide 1.
        const want = 'url("' + String(url).replace(/["\\]/g, "\\$&") + '")';
        if (bg.style.backgroundImage !== want) bg.style.backgroundImage = want;
    }
    function mediaImg(p, media) {
        // ORDEM IMPORTA: `src` dispara o download na hora em que é setado. Setando-o antes do srcset,
        // o browser pedia a URL do src E DEPOIS a variante do srcset — dois downloads por post, o
        // oposto do que queremos. loading/sizes/srcset primeiro, src por último.
        const img = el("img", Object.assign(
            { loading: "lazy", decoding: "async", alt: "" },
            p.sizes ? { sizes: p.sizes } : null,
            p.srcset ? { srcset: p.srcset } : null,
            { src: p.media }));
        const rec = igMedia.get(p.code || codeOf(p.key)) || {};
        const ready = () => {
            img.classList.add("on");
            // proporção: a da API quando existe (chega antes), senão a natural do arquivo
            const w = rec.w || img.naturalWidth, h = rec.h || img.naturalHeight;
            // `media` vem por PARÂMETRO, não de img.parentElement: quando a foto já está no cache o
            // Chrome marca `complete` no mesmo tick do `src`, e aí este ready() roda ANTES de o <img>
            // ser inserido no card — parentElement era null e a mídia larga ficava em cover (cortada).
            // Como o card copia srcset/sizes do <img> nativo justamente pra cair no cache, esse era o
            // caminho COMUM, não o raro: a maioria das fotos nunca chegava a ganhar o .igf-fit.
            mediaFit(media || img.parentElement, w, h, img.currentSrc || img.src);
        };
        if (img.complete && img.naturalWidth) ready();                    // veio do cache → sem fade
        else img.addEventListener("load", ready, { once: true });
        return img;
    }
    const pkOf = (p) => (igMedia.get(p.code || codeOf(p.key)) || {}).pk;
    // unsave DIRETO via API do IG → Promise<bool> (ok). Sem modal.
    function unsaveApi(pk) {
        const csrf = (document.cookie.match(/csrftoken=([^;]+)/) || [])[1] || "";
        return fetch("/api/v1/web/save/" + pk + "/unsave/", {
            method: "POST", credentials: "include", body: "",
            headers: { "X-CSRFToken": csrf, "X-IG-App-ID": igAppId, "X-Requested-With": "XMLHttpRequest", "Content-Type": "application/x-www-form-urlencoded" },
        }).then((r) => r.ok).catch(() => false);
    }
    /* Um item removido dos salvos NÃO sai da tela: ele só escurece e ganha o selo "removido".
     * Tirar o card do lugar reflui tudo o que está abaixo, e no meio de uma limpeza em lote é fácil
     * perder a posição — some um item, a grade anda, e você não sabe mais onde parou. O card só
     * desaparece de verdade no próximo carregamento da página. */
    function markUnsaved(card) {
        if (!card) return;
        card.classList.add("igf-gone");
        card.classList.remove("igf-sel");
        const p = card.dataset && card.dataset.key;
        if (p) savedSelected.delete(p);
        const sv = card.querySelector(".igf-save");
        if (sv) { sv.classList.remove("on", "igf-busy"); sv.title = "Removido dos salvos"; }
    }
    // REMOVER DOS SALVOS (1 tile) — direto via API; fallback: a "dança do modal".
    function unsaveTile(p, card, btn) {
        const pk = pkOf(p);
        if (!pk) { unsaveViaModal(p, card, btn); return; }   // sem pk (API não veio) → fallback modal
        btn.classList.add("igf-busy");
        unsaveApi(pk).then((ok) => { if (ok) markUnsaved(card); else { btn.classList.remove("igf-busy"); unsaveViaModal(p, card, btn); } });
    }
    // ===== MULTISSELEÇÃO nos salvos: toolbar "Selecionar" → marca tiles → "Remover dos salvos" em lote =====
    let savedSelectMode = false, savedToolbar = null, savedToolbarSync = null;
    const savedSelected = new Map();   // key -> card
    function setSelectMode(on) {
        savedSelectMode = !!on;
        if (!savedSelectMode) { for (const c of savedSelected.values()) c.classList.remove("igf-sel"); savedSelected.clear(); closeCollectionMenu(); }
        if (feedEl) feedEl.classList.toggle("igf-selecting", savedSelectMode);
        if (savedToolbarSync) savedToolbarSync();
    }
    function toggleSelect(p, card) {
        if (savedSelected.has(p.key)) { savedSelected.delete(p.key); card.classList.remove("igf-sel"); }
        else { savedSelected.set(p.key, card); card.classList.add("igf-sel"); }
        if (savedToolbarSync) savedToolbarSync();
    }
    /* Remoção em LOTE com progresso. Antes era um laço mudo: você clicava em "Remover" com 30 itens
     * marcados e a página ficava minutos sem dizer nada, enquanto os cards sumiam um a um. Agora a
     * barra mostra quantos já foram, dá pra PARAR no meio, e cada item vai escurecendo em vez de
     * sumir. Segue serial de propósito — disparar 30 requisições juntas é pedir rate-limit. */
    let savedBusy = false, batchStop = false;
    async function removeSelected() {
        if (savedBusy) return;
        const entries = [...savedSelected.entries()];
        if (!entries.length) return;
        savedBusy = true; batchStop = false;
        if (savedToolbarSync) savedToolbarSync(0, entries.length);
        let done = 0, fail = 0;
        for (const [key, card] of entries) {
            if (batchStop) break;
            const p = posts.get(key);
            const pk = p && pkOf(p);
            let ok = false;
            if (pk) { try { ok = await unsaveApi(pk); } catch (_) { ok = false; } }
            if (ok) markUnsaved(card); else { fail++; if (card) card.classList.add("igf-failed"); }
            done++;
            if (savedToolbarSync) savedToolbarSync(done, entries.length);
        }
        savedBusy = false;
        const parou = batchStop && done < entries.length;
        toast(parou ? ("Parado: " + done + " de " + entries.length + " processados")
            : fail ? (done - fail + " removidos · " + fail + " falharam")
                : (done + (done > 1 ? " removidos dos salvos" : " removido dos salvos")));
        setSelectMode(false);
    }
    function buildSavedToolbar() {
        const bar = el("div", { class: "igf-savedbar" });
        const count = el("span", { class: "igf-sb-count" });
        const fill = el("div", { class: "igf-sb-progfill" });
        const prog = el("div", { class: "igf-sb-prog" }, fill);
        const sel = el("button", { class: "igf-sb-btn igf-sb-sel", type: "button" }, "Selecionar");
        const all = el("button", { class: "igf-sb-btn igf-sb-ghost igf-sb-all", type: "button" }, "Todos");
        const cancel = el("button", { class: "igf-sb-btn igf-sb-ghost igf-sb-cancel", type: "button" }, "Cancelar");
        const coll = el("button", { class: "igf-sb-btn igf-sb-ghost igf-sb-coll", type: "button" }, "Mover p/ coleção ▾");
        const remove = el("button", { class: "igf-sb-btn igf-sb-danger", type: "button" }, "Remover dos salvos");
        const stop = el("button", { class: "igf-sb-btn igf-sb-ghost igf-sb-stop", type: "button" }, "Parar");
        sel.addEventListener("click", () => setSelectMode(true));
        cancel.addEventListener("click", () => setSelectMode(false));
        stop.addEventListener("click", () => { batchStop = true; stop.setAttribute("disabled", ""); });
        all.addEventListener("click", () => selectAllVisible());
        coll.addEventListener("click", (e) => { e.stopPropagation(); openCollectionMenu(coll); });
        remove.addEventListener("click", () => removeSelected());
        bar.append(count, el("span", { class: "igf-sb-sp" }), prog, sel, all, cancel, coll, remove, stop);
        // (done,total) só vêm durante o lote; sem eles é o estado normal de seleção
        savedToolbarSync = (done, total) => {
            bar.classList.toggle("on", savedSelectMode || savedBusy);
            bar.classList.toggle("busy", savedBusy);
            if (savedBusy) {
                const t = total || 1;
                fill.style.width = Math.round((done / t) * 100) + "%";
                count.textContent = "Removendo " + done + " de " + t + "…";
                if (!batchStop) stop.removeAttribute("disabled");
                return;
            }
            fill.style.width = "0%";
            const n = savedSelected.size;
            count.textContent = n ? (n + " selecionado" + (n > 1 ? "s" : "")) : "Clique nos itens pra selecionar";
            for (const b of [remove, coll]) { if (n) b.removeAttribute("disabled"); else b.setAttribute("disabled", ""); }
        };
        savedToolbarSync();
        return bar;
    }
    // "Todos": marca tudo que está montado e ainda não foi removido (o que não veio ainda não conta)
    function selectAllVisible() {
        if (!feedEl) return;
        for (const card of feedEl.children) {
            if (!card.classList || !card.classList.contains("igf-card")) continue;
            if (card.classList.contains("igf-gone") || card.classList.contains("igf-skel")) continue;
            const key = card.dataset.key;
            if (key && !savedSelected.has(key)) { savedSelected.set(key, card); card.classList.add("igf-sel"); }
        }
        if (savedToolbarSync) savedToolbarSync();
    }
    // ===== MOVER PARA COLEÇÃO (best-effort: endpoints privados do IG, não verificáveis no snapshot) =====
    function igApiPost(path, body) {
        const csrf = (document.cookie.match(/csrftoken=([^;]+)/) || [])[1] || "";
        return fetch(path, { method: "POST", credentials: "include", body,
            headers: { "X-CSRFToken": csrf, "X-IG-App-ID": igAppId, "X-Requested-With": "XMLHttpRequest", "Content-Type": "application/x-www-form-urlencoded" },
        }).then((r) => r.ok).catch(() => false);
    }
    const selectedPks = () => [...savedSelected.keys()].map((key) => { const p = posts.get(key); return p ? pkOf(p) : null; }).filter(Boolean);
    async function moveSelectedToCollection(collectionId, newName) {
        const pks = selectedPks();
        if (!pks.length) { toast("Sem ids de mídia (a API ainda não trouxe)"); return; }
        const ids = encodeURIComponent(JSON.stringify(pks));
        const ok = newName
            ? await igApiPost("/api/v1/collections/create/", "name=" + encodeURIComponent(newName) + "&added_collection_media_ids=" + ids)
            : await igApiPost("/api/v1/collections/" + collectionId + "/edit/", "added_collection_media_ids=" + ids);
        toast(ok ? ("Movido p/ " + (newName || igCollections.get(collectionId) || "coleção")) : "Falhou ao mover (endpoint mudou?)");
        setSelectMode(false);
    }
    let igCollMenu = null;
    function closeCollectionMenu() { if (igCollMenu) { igCollMenu.remove(); igCollMenu = null; document.removeEventListener("click", collMenuCloser, true); } }
    function collMenuCloser(e) { if (igCollMenu && !igCollMenu.contains(e.target)) closeCollectionMenu(); }
    function openCollectionMenu(anchor) {
        closeCollectionMenu();
        const menu = el("div", { class: "igf-collmenu" });
        if (igCollections.size) {
            menu.appendChild(el("div", { class: "igf-cm-head" }, "Adicionar à coleção"));
            for (const [id, name] of igCollections) {
                const b = el("button", { class: "igf-cm-item", type: "button" }, name);
                b.addEventListener("click", () => { closeCollectionMenu(); moveSelectedToCollection(id, null); });
                menu.appendChild(b);
            }
        }
        const nb = el("button", { class: "igf-cm-item igf-cm-new", type: "button" }, "+ Nova coleção");
        nb.addEventListener("click", () => { closeCollectionMenu(); const name = prompt("Nome da nova coleção:"); if (name && name.trim()) moveSelectedToCollection(null, name.trim()); });
        menu.appendChild(nb);
        const r = anchor.getBoundingClientRect();
        menu.style.top = (r.bottom + 6) + "px"; menu.style.right = Math.max(8, (window.innerWidth - r.right)) + "px";
        (document.body || document.documentElement).appendChild(menu);
        igCollMenu = menu;
        setTimeout(() => document.addEventListener("click", collMenuCloser, true), 0);
    }
    let igToastEl = null, igToastT = 0;
    function toast(msg) {
        if (!igToastEl) { igToastEl = el("div", { class: "igf-toast" }); (document.body || document.documentElement).appendChild(igToastEl); }
        igToastEl.textContent = msg; igToastEl.classList.add("show");
        clearTimeout(igToastT); igToastT = setTimeout(() => igToastEl.classList.remove("show"), 2400);
    }
    // FALLBACK (sem pk / API falhou): abre a modal, clica o salvar (preenchido = des-salva), fecha e some o card.
    function unsaveViaModal(p, card, btn) {
        const a = nativeTile(p.key);
        if (!a) { openTile(p, card); return; }
        btn.classList.add("igf-busy");
        a.click();                                            // abre a modal
        let tries = 0;
        const iv = setInterval(() => {
            tries++;
            const dlg = document.querySelector('[role="dialog"]');
            const svg = dlg && dlg.querySelector('svg[aria-label="Remove" i], svg[aria-label="Remover" i], svg[aria-label="Save" i], svg[aria-label="Salvar" i]');
            const sb = svg && svg.closest('[role="button"], button, div[role="button"]');
            if (sb) {
                clearInterval(iv);
                sb.click();                                   // des-salva
                // fecha a modal (botão X, senão Escape) e remove o card
                setTimeout(() => {
                    const x = dlg.querySelector('svg[aria-label="Close" i], svg[aria-label="Fechar" i]');
                    const xb = x && x.closest('[role="button"], button');
                    if (xb) xb.click(); else document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
                    markUnsaved(card);   // mesma regra do caminho por API: escurece, não some
                }, 140);
            } else if (tries > 30) { clearInterval(iv); btn.classList.remove("igf-busy"); }
        }, 110);
    }
    // UM card pra TODAS as superfícies (home, explore, perfil, salvos): header + mídia + barra de ações
    // + legenda. O perfil também usa este — era tile só-mídia até a v3.13.
    function buildCard(p) {
        const code = p.code || codeOf(p.key);
        const card = el("div", { class: "igf-card" + (surface === "saved" ? " igf-card-saved" : ""), "data-key": p.key, "data-code": code });
        const profHref = p.author ? "/" + p.author + "/" : p.href;
        const head = el("div", { class: "igf-head" });
        const who = el("a", { class: "igf-who", href: profHref });   // nome/avatar → PERFIL
        if (p.avatar) who.appendChild(el("img", { src: p.avatar, loading: "lazy", alt: "" }));
        who.appendChild(el("b", {}, p.author || ""));
        head.appendChild(who);
        // "Seguir" não aparece no PERFIL: lá todo card é do mesmo autor, então o botão viraria ruído
        // repetido em cada item (e o header do próprio perfil já tem o dele).
        if (p.follow && surface !== "profile") {              // só quando ainda não sigo — home + explore + salvos
            const fb = el("button", { class: "igf-follow" }, "Seguir");
            if (p.following) { fb.classList.add("on"); fb.textContent = "Seguindo"; }   // estado real, quando a API já disse
            fb.addEventListener("click", (e) => { e.preventDefault(); e.stopPropagation(); followUser(p, fb); });
            head.appendChild(fb);
        }
        card.appendChild(head);
        const slides = (igMedia.get(code) || {}).carousel;    // carrossel? (todos os slides vieram da API)
        const isCarousel = !!(slides && slides.length > 1);
        let media;
        if (isCarousel) {
            media = buildCarousel(p, card, slides);            // galeria: setas + dots + contador (cada slide se enquadra sozinho)
        } else {
            // mídia: imagem = link pro post; vídeo = autoplay/pause (hover) + click liga/desliga som
            media = p.isVideo ? el("div", { class: "igf-media igf-video" }) : el("a", { class: "igf-media", href: cleanPostUrl(p) });
            if (!p.isVideo) media.addEventListener("click", (e) => {   // clique na IMAGEM → modal do IG (post + comentários), sem sair da página
                if (e.metaKey || e.ctrlKey || e.shiftKey || e.button === 1) return;   // ctrl/cmd/meio = deixa abrir em nova aba
                e.preventDefault(); openItem(p, card);
            });
            if (p.media) media.appendChild(mediaImg(p, media));   // altura já é a final (aspect-ratio fixo no CSS) — o load não mexe em layout
            if (p.isVideo) {
                media.appendChild(el("div", { class: "igf-play", html: PLAY_SVG }));
                // hover no CARD INTEIRO (não só na mídia): passar o mouse pela barra de ações ou pela
                // legenda não interrompe mais o vídeo — era um corte constante ao mirar um botão.
                card.addEventListener("mouseenter", () => onCardEnter(card));
                card.addEventListener("mouseleave", () => onCardLeave(card));
                media.addEventListener("click", (e) => {
                    if (e.target.closest && e.target.closest(".igvc-bar")) return;   // clique no player (seek/mudo/etc) → ignora
                    // MESMO comportamento em toda superfície: clique no item = abre em MODAL. (O som
                    // saiu daqui pro botão dedicado do player — antes, na home, clicar no vídeo mutava.)
                    e.preventDefault(); openItem(p, card);
                });
            }
        }
        card.appendChild(media);
        // barra de ações única abaixo da mídia
        const actions = el("div", { class: "igf-actions" });
        const act = (icon, count, onClick, cls) => {
            const b = el("button", { class: "igf-act" + (cls ? " " + cls : "") });
            b.innerHTML = icon;
            if (count) b.appendChild(el("span", {}, count));
            b.addEventListener("click", onClick);
            return b;
        };
        actions.appendChild(act(ICO.like, p.likes, (e) => likeItem(p, card, e.currentTarget), "igf-like"));
        actions.appendChild(act(ICO.comment, p.comments, () => openItem(p, card)));   // → modal (comentários)
        actions.appendChild(act(ICO.repost, p.reposts, () => openItem(p, card)));
        const sh = act(ICO.link, "", (e) => copyLink(p, e.currentTarget), "igf-share"); sh.title = "Copiar link";
        actions.appendChild(sh);                              // share → COPIAR link limpo (sem tracking)
        actions.appendChild(el("div", { class: "igf-act-sp" }));
        const sv = act(ICO.save, "", (e) => saveItem(p, card, e.currentTarget), "igf-save");
        sv.title = surface === "saved" ? "Remover dos salvos" : "Salvar";
        if (surface === "saved") sv.classList.add("on");      // já está salvo → bookmark preenchido (clicar des-salva + some o card)
        actions.appendChild(sv);
        card.appendChild(actions);
        if (surface === "saved") {                            // overlay de multisseleção (cobre o card no modo seleção)
            const ovl = el("div", { class: "igf-selovl" }, el("div", { class: "igf-selcb" }));
            ovl.addEventListener("click", (e) => { e.preventDefault(); e.stopPropagation(); toggleSelect(p, card); });
            card.appendChild(ovl);
        }
        card.appendChild(buildCaption(p, card));
        return card;
    }
    /* LEGENDA — sempre presente (vazia inclusive): a faixa tem altura fixa e é ela que garante que um card
     * sem legenda meça exatamente o mesmo que um com legenda (o texto pode chegar depois, via API).
     * Mostra 2 linhas; se sobrar texto, "mais" ABRE a legenda inteira POR CIMA da mídia (o card não muda
     * de altura → a grade fica parada). "Tem mais texto?" é medido no 1º hover do card: aí ele está
     * visível (com content-visibility, card fora da tela não tem layout pra medir) e é 1 leitura só. */
    /* @menções e #hashtags viram LINKS de verdade (cor de link do IG). O clique navega normalmente
     * (perfil / página da tag) e NÃO propaga — senão abriria/fecharia o collapse da legenda junto.
     * O texto é montado por nós, nunca por innerHTML: legenda é conteúdo de terceiro. */
    const CAP_TOKEN = /([@#][\p{L}\p{N}._]+)/gu;
    function renderCaption(cap, text) {
        cap.textContent = "";
        if (!text) return;
        for (const part of text.split(CAP_TOKEN)) {
            if (!part) continue;
            const c = part[0], body = part.slice(1);
            if ((c === "@" || c === "#") && body) {
                const href = c === "@" ? "/" + body.replace(/\.+$/, "") + "/" : "/explore/tags/" + body.toLowerCase() + "/";
                const a = el("a", { class: "igf-tag", href }, part);
                a.addEventListener("click", (e) => e.stopPropagation());   // não alterna o "mais"
                cap.appendChild(a);
            } else cap.appendChild(document.createTextNode(part));
        }
    }
    function buildCaption(p, card) {
        const wrap = el("div", { class: "igf-capwrap" });
        const cap = el("div", { class: "igf-cap" });
        renderCaption(cap, p.caption || "");
        const more = el("button", { class: "igf-capmore", type: "button" }, "mais");
        const toggle = () => {
            if (!card.dataset.capmore) return;
            const open = card.classList.toggle("igf-capopen");
            more.textContent = open ? "menos" : "mais";
            if (!open) cap.scrollTop = 0;
        };
        cap.addEventListener("click", toggle);
        more.addEventListener("click", (e) => { e.preventDefault(); e.stopPropagation(); toggle(); });
        card.addEventListener("mouseenter", () => measureCaption(card));
        wrap.append(cap, more);
        return wrap;
    }
    // 1 medição por card (cacheada). Re-medida quando a legenda chega depois: updateCardsMeta limpa o flag.
    function measureCaption(card) {
        if (card.dataset.capMeasured) return;
        const cap = card.querySelector(".igf-cap");
        if (!cap || !cap.textContent) return;                 // sem texto ainda → mede quando chegar
        card.dataset.capMeasured = "1";
        if (cap.scrollHeight > cap.clientHeight + 1) card.dataset.capmore = "1";
        else delete card.dataset.capmore;
    }

    /* ---- LAYOUT (v3.12): grade uniforme, custo O(1) ------------------------------
     * O masonry anterior (posicionamento absoluto por card, altura medida por card,
     * congelamento de coluna, re-empacotamento a cada imagem carregada) foi removido:
     * com todos os itens na MESMA altura o layout é inteiramente do CSS Grid. Aqui só
     * calculamos quantas colunas cabem e escrevemos as custom properties no
     * container. Nenhum card é lido nem escrito — nada de reflow forçado, nada que
     * cresça com o tamanho da sessão. Isso mata de uma vez os re-layouts O(N) que
     * rodavam por frame de scroll e por load de mídia. */
    function feedMetrics() {
        const cw = feedEl.clientWidth || Math.round(feedEl.getBoundingClientRect().width);
        if (cw < 120) return null;
        const minw = prefs.density === "compact" ? 230 : MINCOLW;   // compacto: colunas mais estreitas → cabe mais
        let ncols = Math.max(1, Math.floor((cw + GAP) / (minw + GAP)));
        if (prefs.cols && prefs.cols !== "auto") {                  // nº de colunas FORÇADO (header), com piso de ~180px/coluna
            const fit = Math.max(1, Math.floor((cw + GAP) / (180 + GAP)));
            ncols = Math.max(1, Math.min(+prefs.cols, fit));
        } else if (ncols > MAXCOLS) ncols = MAXCOLS;
        return { ncols, colw: Math.max(1, Math.floor((cw - (ncols - 1) * GAP) / ncols)) };
    }
    // Dica de tamanho para o contain-intrinsic-size: é o CONTEÚDO do card (mídia + faixas), NÃO a caixa —
    // o padding do rodapé e as bordas o browser soma por cima. Contar esses 11px aqui inflaria todo card
    // fora da tela e o scroll pularia ao entrar/sair. Precisa ESPELHAR as vars --igf-* do CSS.
    function cardHeightFor(colw) {
        const dense = prefs.density === "compact";
        const bands = (dense ? 42 : 48)                                // header
            + (dense ? 34 : 40)                                        // barra de ações
            + (prefs.showCaption ? (dense ? 22 : 25) : 0);             // legenda (1 linha; o "mais" expande)
        return Math.round((colw - 2) * (AR_H / AR_W) + bands);      // colw - bordas laterais = largura da mídia
    }
    function layoutFeed() {
        if (!feedEl || !feedEl.isConnected) return;
        const m = feedMetrics();
        if (!m) return;
        const { ncols, colw } = m;
        if (ncols === feedNcols && colw === feedColw) return;           // nada mudou → nem escreve
        feedNcols = ncols; feedColw = colw;
        feedEl.style.setProperty("--igf-ncols", String(ncols));
        feedEl.style.setProperty("--igf-gap", GAP + "px");
        feedEl.style.setProperty("--igf-cardh", cardHeightFor(colw) + "px");
    }
    function queueLayout() { if (layoutQ) return; layoutQ = true; raf(() => { layoutQ = false; layoutFeed(); }); }
    // prefs mudaram (colunas/densidade/legenda) → força o recálculo (o guard "nada mudou" usaria valores velhos)
    function relayoutFeed() { feedNcols = 0; feedColw = 0; queueLayout(); }

    // coalesce as rajadas de mutação do IG (durante o load ele muta MUITO) num harvest por frame → 1º paint mais leve
    let syncFeedQ = false;
    function queueSyncFeed() { if (syncFeedQ) return; syncFeedQ = true; raf(() => { syncFeedQ = false; syncOwnFeed(); }); }
    // harvest da lista do IG → renderiza os cards novos (append-only, sem re-layout)
    let lastHarvestSig = "";
    function syncOwnFeed() {
        if (!feedEl || !igSrc) return;
        // BAILOUT: assinatura da janela montada (contagem + 1º/último permalink). O srcMO + o scan
        // disparam isto a cada churn do React — que o NOSSO scroll-sync induz — e sem mudança real
        // o harvest+layout completos rodavam por frame de scroll (O(N) cards, crescendo com a sessão).
        const arts = itemsIn(igSrc);
        const n = arts.length;
        const sig = n ? (n + "|" + (keyOf(arts[0]) || "") + "|" + (keyOf(arts[n - 1]) || "")) : "0";
        // bailout só quando JÁ TEM cards: se o feed está VAZIO (React removeu/recriou, ou 1º paint), nunca
        // baila → re-tenta o harvest todo scan até aparecer algo (evita ficar travado em "só o spinner").
        if (rendered.size > 0 && sig === lastHarvestSig && rendered.size === order.length) { if (!loading) queuePick(); return; }
        lastHarvestSig = sig;
        for (const a of arts) harvestOne(a);
        // append dos INÉDITOS a partir de um ÍNDICE (era um varrer `order` inteiro por sync, O(N) com N
        // crescendo a sessão toda) e num DocumentFragment (uma inserção só = um layout, não N).
        if (renderedUpTo < order.length) {
            const frag = document.createDocumentFragment();
            const fresh = [];
            for (; renderedUpTo < order.length; renderedUpTo++) {
                const key = order[renderedUpTo];
                if (rendered.has(key)) continue;
                const card = buildCard(posts.get(key));
                frag.appendChild(card);
                rendered.add(key);
                fresh.push(card);
            }
            if (fresh.length) {
                feedEl.appendChild(frag);
                for (const card of fresh) {
                    observeVideoCard(card);                                  // vídeo → rastreia visibilidade (toca no hover)
                    // grid: falta tudo (header/legenda). home: só entra na fila se a legenda não veio do <article>.
                    const needsMeta = metaSurface() || !card.querySelector(".igf-cap").textContent;
                    if (needsMeta && !card.dataset.metaDone) metaPending.add(card);
                }
            }
        }
        if (rendered.size) {
            unmountSkeleton();
            if (nativeHideTimer) { clearTimeout(nativeHideTimer); nativeHideTimer = null; }
            if (igSrc) igSrc.classList.add("igf-src");
        }   // 1º card real → tira o skeleton + esconde a grade nativa (grid: só agora, pra não dar tela preta)
        else if (surface !== "home" && igSrc) igSrc.classList.remove("igf-src");           // GRID vazio → mostra a grade NATIVA (nunca deixa só o spinner numa tela vazia)
        updateCardsMeta();      // preenche autor/avatar/legenda dos cards que renderizaram antes do igMedia
        layoutFeed();
        if (!loading) queuePick();
    }
    // PREENCHE o header (autor/avatar/seguir) + legenda dos cards de GRID que renderizaram antes da API trazer os
    // metadados (igMedia). Roda quando o igMedia ingere uma resposta + a cada syncOwnFeed.
    // Só percorre os cards PENDENTES (Set) — antes varria todos os filhos do feed a cada chamada.
    let metaUpdQ = false;
    const metaPending = new Set();
    // TODA superfície tem card pendente de metadados. No grid (explore/perfil/salvos) vem tudo da API
    // (autor, avatar, legenda). Na HOME o header sai do <article>, mas a LEGENDA não: o IG renderiza o
    // <h1> tarde (às vezes nunca, no post virtualizado), e era por isso que a descrição não aparecia —
    // então na home eu completo a legenda pelo igMedia (a resposta de feed/timeline traz caption).
    const metaSurface = () => surface === "explore" || surface === "saved" || surface === "profile";
    function queueMetaUpdate() { if (metaUpdQ) return; metaUpdQ = true; raf(() => { metaUpdQ = false; updateCardsMeta(); }); }
    // legenda nova num card já montado: escreve na faixa (altura fixa → zero re-layout) e re-agenda a
    // medição do "mais" (o card pode ter sido medido quando ainda estava sem texto).
    function setCaption(card, text) {
        const cap = card.querySelector(".igf-cap");
        if (!cap || !text || cap.textContent) return;
        renderCaption(cap, text);
        delete card.dataset.capMeasured;
        if (card.matches(":hover")) measureCaption(card);      // já está sob o cursor → mede agora
    }
    function updateCardsMeta() {
        if (!feedEl || !metaPending.size) return;
        const home = surface === "home";
        for (const card of metaPending) {
            if (!card.isConnected) { metaPending.delete(card); continue; }
            const rec = igMedia.get(card.dataset.code);
            if (!rec) continue;                                 // a API ainda não trouxe este post
            const p = posts.get(card.dataset.key); if (!p) { metaPending.delete(card); continue; }
            if (home) {
                // home: o <article> já deu header/contadores — daqui só aproveito a LEGENDA. Se a API
                // respondeu e o post não tem legenda, sai do pendente (senão o Set nunca esvazia).
                if (rec.caption) { p.caption = rec.caption; setCaption(card, rec.caption); }
                card.dataset.metaDone = "1";
                metaPending.delete(card);
                continue;
            }
            if (!rec.author && !rec.caption) continue;
            if (rec.author) p.author = rec.author;
            if (rec.avatar) p.avatar = rec.avatar;
            if (rec.caption) p.caption = rec.caption;
            if (rec.authorPk) p.authorPk = rec.authorPk;
            const who = card.querySelector(".igf-who");
            if (who && p.author) {
                who.setAttribute("href", "/" + p.author + "/");
                if (p.avatar && !who.querySelector("img")) who.insertBefore(el("img", { src: p.avatar, loading: "lazy", alt: "" }), who.firstChild);
                const b = who.querySelector("b"); if (b && b.textContent !== p.author) b.textContent = p.author;
            }
            if (rec.following === true) { const fb = card.querySelector(".igf-follow"); if (fb) fb.remove(); }   // já sigo → tira o "Seguir"
            setCaption(card, p.caption);
            card.dataset.metaDone = "1";
            metaPending.delete(card);
        }
    }
    // espera CHEGAR POST NOVO → resolve ASSIM QUE chega, ou após maxMs (rede lenta / fim).
    // CRÍTICO: mede crescimento por `order.length` (nossa lista append-only/dedupada), NÃO pelo nº de <article>
    // renderizados — o IG VIRTUALIZA a lista off-screen (renderiza embaixo, REMOVE em cima), então a contagem
    // de <article> fica ~constante mesmo carregando páginas → o detector antigo só batia no timeout (10s+).
    // `order` só cresce quando um permalink INÉDITO aparece → imune à virtualização.
    function waitForNewPosts(beforeOrder, maxMs) {
        return new Promise((resolve) => {
            const src = igSrc;
            if (!src) return resolve(false);
            let done = false;
            const finish = (grew) => { if (done) return; done = true; try { obs.disconnect(); } catch (_) { /**/ } clearInterval(iv); clearTimeout(to); resolve(grew); };
            const check = () => {
                if (igSrc !== src) return finish(false);          // trocou de superfície no meio → para
                for (const a of itemsIn(src)) harvestOne(a);      // harvest baila barato em key já vista
                if (order.length > beforeOrder) finish(true);
            };
            const obs = new MutationObserver(check);
            try { obs.observe(src, { childList: true, subtree: true }); } catch (_) { /**/ }
            const iv = setInterval(check, 100);
            const to = setTimeout(() => finish(false), maxMs);
            check();
        });
    }
    // puxa VÁRIAS páginas de uma vez: rola a lista nativa off-screen p/ re-disparar o loader do IG, espera os
    // posts CHEGAREM (event-driven, por order.length), renderiza, repete — até LOADMORE_ROUNDS páginas por chamada.
    // BUMP: scrollTop=max parado NÃO re-dispara o IntersectionObserver do loader do IG (precisa SAIR e VOLTAR).
    // OBS: a paginação do IG é por CURSOR (sequencial) → não dá pra buscar páginas em paralelo; o ganho é não
    // esperar sleep fixo + pré-carregar um buffer grande à frente (rootMargin) por rodada de scroll.
    async function loadMore() {
        if (loading || !igSrc || feedExhausted) return;
        loading = true;
        const src = igSrc, surf = surface;   // captura: navegar/trocar de superfície no meio (teardown) zera igSrc → abortar
        const rounds = surf === "home" ? LOADMORE_ROUNDS : 2;   // grid: tiles em massa pesam ainda mais
        let empties = 0;
        for (let i = 0; i < rounds && empties < 2; i++) {
            if (igSrc !== src || surface !== surf) break;   // desmontou/trocou → para (evita scroll em nó morto)
            const before = order.length;
            src.scrollTop = Math.max(0, src.scrollHeight - src.clientHeight * 2);   // SOBE (loader sai da viewport)
            await sleep(50);
            if (igSrc !== src) break;
            src.scrollTop = src.scrollHeight;                                       // DESCE até o fim (loader re-entra → IG busca)
            const grew = await waitForNewPosts(before, GROWTH_MAX_MS);              // resolve no 1º post inédito (early-out)
            if (igSrc !== src) break;
            syncOwnFeed();                                                          // renderiza os novos cards JÁ
            empties = grew ? 0 : empties + 1;
        }
        if (igSrc !== src) return;          // outra superfície assumiu → não mexo no loading/layout dela
        loading = false; layoutFeed();
        // PERFIL é FINITO (um perfil tem N posts) → 2 rodadas vazias = acabou: ESCONDE o spinner (senão gira pra
        // sempre num perfil de 6 posts). Home E explore NÃO: são ~infinitos (recomendações) → 2 vazias = só
        // rede/timing (falso-positivo), mantém o spinner.
        if ((surf === "profile" || surf === "saved") && empties >= 2) { feedExhausted = true; if (loaderEl) loaderEl.classList.add("igf-done"); }
    }
    // gatilho redundante por SCROLL: não depende do IntersectionObserver re-disparar (era o que sumia o
    // loading e exigia "sobe e desce"). Toda rolagem, se o spinner está perto do fim da tela → puxa mais.
    function maybeLoadMore() {
        if (loading || !loaderEl) return;
        const r = loaderEl.getBoundingClientRect();
        if (r.top < (window.innerHeight || 800) + (surface === "home" ? 1800 : 1200)) loadMore();   // mesmo lookahead do IO
    }
    // classes do feed dirigidas pelas flags: sombra / densidade / legenda / contadores
    function applyFeedClasses() {
        if (!feedEl) return;
        feedEl.classList.toggle("igf-shadow", !!prefs.cardShadow);
        feedEl.classList.toggle("igf-dense", prefs.density === "compact");
        feedEl.classList.toggle("igf-nocap", !prefs.showCaption);
        feedEl.classList.toggle("igf-nocounts", !prefs.showCounts);
    }
    // tema REAL do IG (independe do OS): luminância do fundo (--ig-background, fallback bg do body).
    function isDarkTheme() {
        try {
            const v = getComputedStyle(document.documentElement).getPropertyValue("--ig-background").trim();
            let rgb = null;
            if (v) { const m = v.split(",").map((s) => parseFloat(s)); if (m.length >= 3 && m.every((x) => !isNaN(x))) rgb = m; }
            if (!rgb) { const bg = getComputedStyle(document.body || document.documentElement).backgroundColor; const m = bg && bg.match(/[\d.]+/g); if (m && m.length >= 3) rgb = m.map(Number); }
            if (!rgb) return true;
            return (0.299 * rgb[0] + 0.587 * rgb[1] + 0.114 * rgb[2]) < 128;
        } catch { return true; }
    }
    let lastDark = null;
    function applyTheme() {   // toggla html.igf-dark (guard "mudou?" → não reescreve a cada scan)
        const dark = isDarkTheme();
        if (dark === lastDark) return;
        lastDark = dark;
        document.documentElement.classList.toggle("igf-dark", dark);
    }
    function mountOwnFeed(list, cwrap) {
        // Never hide an ancestor of the own feed: a bad column match must leave the native fallback visible.
        if (!list || !cwrap || list === cwrap || cwrap === document.body || cwrap === document.documentElement || !cwrap.contains(list)) return;
        let src = list;                              // igSrc = branch dos cards (filho do cwrap que contém a lista)
        while (src.parentElement && src.parentElement !== cwrap) src = src.parentElement;
        if (src === document.body || src === document.documentElement || !cwrap.contains(src)) return;
        igSrc = src;
        const firstMount = !feedEl || !feedEl.isConnected;
        // home: esconde a nativa JÁ (harvest confiável, o skeleton cobre). GRID (explore/profile): só esconde
        // DEPOIS que renderizar o 1º card (em syncOwnFeed) → se o harvest falhar, a grade NATIVA continua à
        // mostra em vez de tela preta.
        if (surface === "home") {
            igSrc.classList.add("igf-src");
            // O skeleton cobre a janela imediatamente, mas uma falha de harvest não pode deixar a
            // home preta para sempre. Se nenhum card entrou, devolve a lista nativa como fallback;
            // quando os dados chegarem, syncOwnFeed esconde-a novamente no mesmo frame.
            if (firstMount) {
                if (nativeHideTimer) clearTimeout(nativeHideTimer);
                nativeHideTimer = setTimeout(() => {
                    nativeHideTimer = null;
                    if (feedEl && !rendered.size && igSrc) { igSrc.classList.remove("igf-src"); unmountSkeleton(); }
                }, 2500);
            }
        }
        if (firstMount) {
            feedEl = el("div", { class: "igf-feed" });
            applyFeedClasses();                      // sombra/densidade/legenda/contadores desde o 1º paint
            cwrap.appendChild(feedEl);               // meu feed depois das stories
            if (surface === "saved") { savedToolbar = buildSavedToolbar(); cwrap.insertBefore(savedToolbar, feedEl); }   // toolbar de multisseleção ACIMA do mosaico
            loaderEl = el("div", { class: "igf-loader" + (feedExhausted ? " igf-done" : "") }); loaderEl.innerHTML = SPIN_HTML;
            cwrap.appendChild(loaderEl);             // spinner no fim (escondido se o grid já esgotou) — feedback + sentinela do carregar-mais
            rendered.clear(); renderedUpTo = 0; metaPending.clear(); feedNcols = 0; feedColw = 0;   // feed novo (React pode ter removido) → re-renderiza tudo
            scheduleInlineJSON();                    // parse server-rendered fora do caminho crítico do primeiro paint
            // F5: o igMedia (autor/legenda) pode chegar DEPOIS que a página assentou (sem mais mutações p/ re-disparar).
            // Poll por alguns segundos preenchendo o header/legenda dos cards conforme a API chega.
            [600, 1500, 3000, 5000, 8000].forEach((t) => setTimeout(() => { if (feedEl) updateCardsMeta(); }, t));
            layoutFeed();                            // colunas + altura do card ANTES do skeleton (ele usa --igf-cardh)
            mountSkeleton();                         // cards fantasmas no lugar dos posts enquanto o 1º lote não chega
            if (typeof IntersectionObserver !== "undefined") {
                if (loaderIO) loaderIO.disconnect();
                // lookahead: era 4500px na home — com content-visibility os cards fora da tela custam quase nada,
                // mas CARREGAR mais páginas continua caro (o IG re-renderiza a lista nativa). ~2 telas basta.
                loaderIO = new IntersectionObserver((ents) => { if (ents.some((e) => e.isIntersecting)) loadMore(); }, { rootMargin: surface === "home" ? "1800px" : "1200px" });
                loaderIO.observe(loaderEl);          // perto do fim (ou feed curto no início) → puxa páginas
            }
        } else if (feedEl.parentElement !== cwrap) {
            // o React re-renderizou o cwrap (grade nova) e ÓRFÃO o nosso feed → MOVE p/ o cwrap atual (mantém os
            // cards, sem recriar). Sem isto, o feed velho ficava num lugar e a grade nova aparecia visível ao lado.
            cwrap.appendChild(feedEl);
            if (loaderEl) cwrap.appendChild(loaderEl);
        }
        if (typeof MutationObserver !== "undefined" && srcMOTarget !== igSrc) {   // re-aponta o observer quando a grade muda (React re-render)
            if (!srcMO) srcMO = new MutationObserver(queueSyncFeed); else srcMO.disconnect();
            srcMO.observe(igSrc, { childList: true, subtree: true });
            srcMOTarget = igSrc;
        }
        if (!resizeBound && typeof window.addEventListener === "function") {
            resizeBound = true;
            window.addEventListener("resize", queueLayout, { passive: true });
            // 1 rAF coalescido p/ o trio (antes o maybeLoadMore lia rect do loader em TODO evento cru de scroll)
            let scrollQ = false, lastSrcSync = 0;
            window.addEventListener("scroll", () => {
                if (scrollQ) return; scrollQ = true;
                raf(() => {
                    scrollQ = false;
                    // syncSrcScroll rola a lista nativa pra acompanhar o que você vê — e cada post que o
                    // React renderiza lá faz o IG BAIXAR a mídia dele. Depois que as ações (curtir/salvar/
                    // seguir) passaram a ir pela API, o único motivo de precisar do <article> nativo é o
                    // vídeo SEM URL na API. Então só sincronizo quando isso é verdade — na maior parte da
                    // sessão o scroll deixou de provocar tráfego. (E segue com throttle de 180ms.)
                    if (surface === "home" && needsNativeVideo()) {
                        const t = performance.now ? performance.now() : +new Date();
                        if (t - lastSrcSync > 180) { lastSrcSync = t; syncSrcScroll(); }
                    }
                    queuePick(); maybeLoadMore();
                });
            }, { passive: true });
        }
        // O IG autoplaya os vídeos da lista off-screen: decode invisível (lag) e, pior, DOWNLOAD de
        // vídeo que ninguém vai ver. O polling de 1s deixava cada um bufferizar até um segundo —
        // agora pauso no próprio evento `play` (capture), antes de começar a baixar. O intervalo
        // fica só como rede de segurança, e bem mais espaçado.
        if (!nativePlayBound) {
            nativePlayBound = true;
            document.addEventListener("play", (e) => {
                const v = e.target;
                if (v && v.tagName === "VIDEO" && v.closest && v.closest(".igf-src")) {
                    v.muted = true;
                    try { v.pause(); } catch (_) { /**/ }
                }
            }, true);
        }
        if (!nativePauseTimer && typeof setInterval === "function") nativePauseTimer = setInterval(pauseNativeVideos, 3000);
        queueSyncFeed();                              // primeiro lote entra no próximo frame, após o skeleton pintar
    }
    function pauseNativeVideos() {
        if (!igSrc || document.hidden) return;   // aba em segundo plano → nem varre (o browser já pausou tudo)
        // só PAUSA + muta (seguro). NÃO sobrescrevo .play() — o explore do IG depende do playback dos previews
        // pra a lógica da própria grade; matar o play travava o render (grade some → só o spinner).
        for (const v of igSrc.querySelectorAll("video")) { v.muted = true; if (!v.paused) { try { v.pause(); } catch (_) { /**/ } } }
    }
    function teardownOwnFeed() {
        cancelInlineJSON();
        if (srcMO) { srcMO.disconnect(); srcMO = null; } srcMOTarget = null;
        if (loaderIO) { loaderIO.disconnect(); loaderIO = null; }
        if (videoIO) { videoIO.disconnect(); videoIO = null; }
        if (nativePauseTimer) { clearInterval(nativePauseTimer); nativePauseTimer = null; }
        visVids.clear(); hoverCard = null; videoState.clear(); feedSoundOn = false;
        if (igSrc) { igSrc.classList.remove("igf-src"); igSrc = null; }
        if (feedEl) { feedEl.remove(); feedEl = null; }
        if (loaderEl) { loaderEl.remove(); loaderEl = null; }
        if (nativeHideTimer) { clearTimeout(nativeHideTimer); nativeHideTimer = null; }
        if (savedToolbar) { savedToolbar.remove(); savedToolbar = null; savedToolbarSync = null; }
        savedSelectMode = false; savedSelected.clear(); batchStop = true; savedBusy = false;   // sair da página aborta o lote
        posts.clear(); order.length = 0; rendered.clear(); renderedUpTo = 0; metaPending.clear(); carouselWait.clear(); lastHarvestSig = "";
        feedNcols = 0; feedColw = 0; loading = false; feedExhausted = false;
    }

    // wrapper comum que contém stories + cards = o filho do col que contém a lista
    function contentWrapper(col, list) {
        let w = list;
        while (w.parentElement && w.parentElement !== col) w = w.parentElement;
        return w;
    }
    // a tray de stories (atributo semântico estável do IG)
    function storiesTray(col) {
        return col.querySelector('[data-pagelet="story_tray"]') || col.querySelector('[aria-label*="Stories" i]');
    }

    let chromeApplied = false;   // alguma classe .igm-* viva no DOM → o unmasonry tem o que limpar
    function applyNavPin() {
        if (!prefs.masonry || !prefs.pinNav) {   // flag off → garante que nenhum nav fica pinado
            for (const e of document.querySelectorAll(".igm-navpin")) e.classList.remove("igm-navpin");
            return;
        }
        if (document.querySelector(".igm-navpin")) return;
        const box = leftNavWidthBox();
        if (box) { box.classList.add("igm-navpin"); chromeApplied = true; }
    }
    function applyFeed() {
        const list = feedArticleList();
        if (!list) return;
        const split = feedColumnSplit(list);
        if (!split) return;   // sem a estrutura conhecida → não monto o feed próprio (evita bagunça)
        // scaffolding: da lista até o col tudo full-width (.igm-wide, tira o cap de 630), MENOS o
        // wrapper-comum (.igm-content, capado) → stories + meu feed centram juntos = alinhados.
        const cwrap = contentWrapper(split.col, list);
        chromeApplied = true;
        for (let n = list.parentElement, i = 0; n && n.tagName !== "MAIN" && i < 16; n = n.parentElement, i++) {
            n.classList.add(n === cwrap ? "igm-content" : "igm-wide");
            if (n === split.col) break;
        }
        // offset só se o feed começa SOB o nav (overlay); senão dobraria o respiro
        const navBox = document.querySelector(".igm-navpin") || leftNavWidthBox();
        const navW = navBox ? (navBox.getBoundingClientRect().width || 72) : 0;
        const colLeft = split.col.getBoundingClientRect().left;
        split.col.classList.toggle("igm-col", navW > 0 && colLeft < navW - 4);
        const tray = storiesTray(split.col);
        if (tray) tray.classList.add("igm-stories");
        for (const r of split.rails) r.classList.toggle("igm-norail", !!prefs.hideRail);   // flag: esconder coluna direita
        mountOwnFeed(list, cwrap);   // esconde a lista nativa + renderiza MEU feed em masonry
    }
    // ===== EXPLORE / PROFILE: grade de tiles → mosaico próprio =====
    // a "grade" = ancestral mais baixo que abraça a maioria dos tiles (eles vêm agrupados em linhas).
    function gridContainer() {
        let tiles = [...document.querySelectorAll("main " + GRID_SEL)].filter((a) => a.querySelector("img, svg, video"));
        // PREFERE a grade NOVA/visível: quando o React re-renderiza, a grade antiga continua no DOM já
        // ESCONDIDA (.igf-src) → ignoro-a pra não confundir a detecção (era a causa do "grade nativa + nosso
        // mosaico aparecerem juntos"). Se TODOS estão escondidos (steady state) → uso todos (re-assert).
        const fresh = tiles.filter((a) => !a.closest(".igf-src"));
        if (fresh.length >= 4) tiles = fresh;
        if (tiles.length < 4) return null;
        // sobe até o ancestral que contém TODOS os tiles (a GRADE inteira). Threshold de 80% deixava 1 tile de
        // fora (ex.: perfil de 6 posts) → ele ficava VISÍVEL (grid nativo aparecendo). Guarda o de maior contagem
        // como fallback (caso algum tile esteja numa seção separada).
        let best = null, bestN = 0;
        for (let n = tiles[0].parentElement, d = 0; d < 16 && n && n.tagName !== "MAIN"; d++, n = n.parentElement) {
            const c = tiles.reduce((s, t) => s + (n.contains(t) ? 1 : 0), 0);
            if (c > bestN) { bestN = c; best = n; }
            if (c === tiles.length) return n;   // contém TODOS → é a grade
        }
        return bestN >= Math.max(4, Math.floor(tiles.length * 0.8)) ? best : null;
    }
    /* botão de COPIAR o username, colado no nome do perfil. Acha o nó FOLHA cujo texto é exatamente
     * o usuário da URL (o IG muda a tag conforme o layout/experimento, então não dá pra fixar h1/h2).
     * Idempotente: o React re-renderiza o header o tempo todo e isto roda a cada scan. */
    const ICO_COPY = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h10"/></svg>';
    function profileUser() {
        const segs = location.pathname.split("/").filter(Boolean);
        return segs.length && !RESERVED.has(segs[0]) ? segs[0] : "";
    }
    function enhanceProfileHeader() {
        const user = profileUser();
        if (!user) return;
        const header = document.querySelector("main header");
        if (!header || header.querySelector(".igp-copy")) return;
        let nameEl = null;
        for (const n of header.querySelectorAll("h1, h2, span, a, div")) {
            if (!n.children.length && (n.textContent || "").trim() === user) { nameEl = n; break; }
        }
        if (!nameEl || !nameEl.parentElement) return;
        const btn = el("button", { class: "igp-copy", type: "button", title: "Copiar @" + user, html: ICO_COPY });
        btn.addEventListener("click", (e) => {
            e.preventDefault(); e.stopPropagation();
            const done = () => {
                btn.innerHTML = ICO.check; btn.classList.add("igf-copied");
                setTimeout(() => { btn.innerHTML = ICO_COPY; btn.classList.remove("igf-copied"); }, 1400);
                toast("@" + user + " copiado");
            };
            try {
                if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(user).then(done).catch(() => fallbackCopy(user, done));
                else fallbackCopy(user, done);
            } catch (_) { fallbackCopy(user, done); }
        });
        // colocar o botão NA MESMA LINHA do nome: sobe até a caixa flex-row que abriga o username (a
        // mesma do "···") e insere logo depois do bloco do nome. Só INSERE — mover nó do React é pedir
        // erro de reconciliação; se não achar a caixa, cai no irmão imediato.
        let box = nameEl.parentElement, hop = 0, child = nameEl;
        while (box && hop < 3) {
            const st = getComputedStyle(box);
            if (st.display.indexOf("flex") >= 0 && (st.flexDirection || "row").indexOf("row") === 0) break;
            child = box; box = box.parentElement; hop++;
        }
        if (box && hop < 3) child.insertAdjacentElement("afterend", btn);
        else nameEl.insertAdjacentElement("afterend", btn);
    }
    function applyGrid() {
        const grid = gridContainer();
        if (!grid || !grid.parentElement) return;   // grade ainda não montou (ou estrutura desconhecida)
        const cwrap = grid.parentElement;
        // COLUNA = ancestral mais alto logo abaixo do <main> → engloba o HEADER do perfil + o grid.
        let col = grid;
        while (col.parentElement && col.parentElement.tagName !== "MAIN" && col.parentElement !== document.body) col = col.parentElement;
        chromeApplied = true;
        // offset do nav: medir pelo <main> (estável) — col.left mudaria DEPOIS da centragem, quebrando o teste.
        const main = col.closest("main") || document.querySelector("main");
        const navBox = leftNavWidthBox();
        const navW = navBox ? (navBox.getBoundingClientRect().width || 72) : 0;
        const underNav = navW > 0 && main && main.getBoundingClientRect().left < navW - 4;
        for (let n = grid; n && n !== col; n = n.parentElement) n.classList.add("igm-wide");   // tira os caps internos do IG
        // a COLUNA inteira (header + grid) ganha a MESMA largura/centragem do feed da home (--igm-maxw)
        col.classList.add("igm-content", "igm-gridcol");
        if (underNav) col.classList.add("igm-gridnav");   // main nasce sob o nav fixo → desloca p/ centrar em (viewport − nav), igual home
        mountOwnFeed(grid, cwrap);   // grid vira .igf-src (off-screen, vivo) + renderiza nosso mosaico
    }
    /* SKELETON de carregamento — DENTRO da página (v3.14). Era um overlay `position:fixed` cobrindo
     * a tela inteira desde o document-start; agora são cards fantasmas no PRÓPRIO grid, no lugar
     * onde os posts vão entrar. Ficam sob o header e ao lado do nav, e como a grade é uniforme eles
     * têm exatamente a altura do card real → o conteúdo entra sem nenhum salto. */
    const SKEL_N = 9;
    let skelTimer = null;
    function mountSkeleton() {
        if (!feedEl || rendered.size || feedEl.querySelector(".igf-skel")) return;
        const frag = document.createDocumentFragment();
        for (let i = 0; i < SKEL_N; i++) frag.appendChild(el("div", { class: "igf-card igf-skel" }));
        feedEl.appendChild(frag);
        if (skelTimer) clearTimeout(skelTimer);
        skelTimer = setTimeout(unmountSkeleton, 12000);   // segurança: nunca fica girando pra sempre
    }
    function unmountSkeleton() {
        if (skelTimer) { clearTimeout(skelTimer); skelTimer = null; }
        if (!feedEl) return;
        for (const s of feedEl.querySelectorAll(".igf-skel")) s.remove();
    }
    function syncMasonry() {
        applyTheme();    // mantém html.igf-dark em dia com o tema atual do IG (claro/escuro)
        const surf = targetSurface();
        if (surf !== mountedSurface) { unmasonry(); lastHarvestSig = ""; mountedSurface = surf; }   // trocou de superfície → limpa tudo (sig inclusive)
        applyNavPin();   // gating próprio (masonry && pinNav) — só home
        if (isProfile() || isSaved()) enhanceProfileHeader();   // copiar @ vale mesmo com o grid do perfil off
        if (surf === "home") { surface = "home"; applyFeed(); }
        else if (surf === "explore" || surf === "profile" || surf === "saved") { surface = surf; applyGrid(); }
        else unmasonry();
    }
    function unmasonry() {
        unmountSkeleton();
        // sem nada aplicado, não há o que limpar — sem este flag os 5 querySelectorAll full-doc rodavam
        // a CADA burst de mutação em reels/stories (as superfícies mais churnentas do IG), sempre vazios
        if (!chromeApplied) return;
        chromeApplied = false;
        teardownOwnFeed();   // tira o off-screen da lista nativa + remove meu feed
        for (const e of document.querySelectorAll(".igm-wide")) e.classList.remove("igm-wide");
        for (const e of document.querySelectorAll(".igm-content")) e.classList.remove("igm-content");
        for (const e of document.querySelectorAll(".igm-gridnav")) e.classList.remove("igm-gridnav");
        for (const e of document.querySelectorAll(".igm-gridcol")) e.classList.remove("igm-gridcol");
        for (const e of document.querySelectorAll(".igm-col")) e.classList.remove("igm-col");
        for (const e of document.querySelectorAll(".igm-stories")) e.classList.remove("igm-stories");
        for (const e of document.querySelectorAll(".igm-norail")) e.classList.remove("igm-norail");
    }

    /* ------------------------------------------------------------------ *
     * Scan + observação (debounced) + SPA. Sem polling permanente.
     * ------------------------------------------------------------------ */
    let retryPending = false;
    const retryCount = new WeakMap();   // tentativas de attach por <video> sem layout (cap anti-polling)
    function scheduleRetry() {
        if (retryPending) return;
        retryPending = true;
        setTimeout(() => { retryPending = false; scan(); }, 400);   // vídeo sem layout ainda
    }

    function scan() {
        // poda mortos / reconstrói barras que o React removeu
        for (const v of [...live]) {
            const c = controllers.get(v);
            if (!v.isConnected) { c && c.destroy(); continue; }
            if (c && c.bar && !c.bar.isConnected) { c.destroy(); }   // será re-attachado abaixo
        }
        // Monta/oculta o fornecedor nativo antes de medir vídeos. No primeiro scan isso evita
        // construir controles para dezenas de vídeos que serão imediatamente movidos para fora
        // da tela pelo .igf-src; também deixa o skeleton ser o primeiro conteúdo pintado.
        syncMasonry();
        for (const v of document.querySelectorAll("video")) {
            if (bound.has(v)) continue;
            const r = v.getBoundingClientRect();
            if (r.width < MIN_SIZE || r.height < MIN_SIZE) {
                // CAP por vídeo: preload 0x0 PERSISTENTE (comum em reels/stories) re-agendava o scan
                // a cada 400ms p/ sempre — vira polling permanente. Se ele ganhar tamanho depois,
                // a própria mutação do React dispara o scanSoon e o attach acontece por evento.
                const n = (retryCount.get(v) || 0) + 1; retryCount.set(v, n);
                if (n <= 5) scheduleRetry();
                continue;
            }
            attach(v);
        }
        schedulePanel();  // FAB do painel sobrevive aos re-renders do IG (SPA), fora do primeiro paint
        if (prefs.hideMessages) tagMessagesDock();   // re-marca o dock de mensagens (React re-renderiza)
    }
    const scanSoon = debounce(scan, 180);

    const mo = new MutationObserver(scanSoon);
    mo.observe(document.documentElement, { childList: true, subtree: true });

    // SPA: patch no history + popstate → re-scan (IG troca de tela sem reload)
    function onNav() { scanSoon(); setTimeout(scan, 450); }
    for (const m of ["pushState", "replaceState"]) {
        const orig = history[m];
        history[m] = function () { const r = orig.apply(this, arguments); onNav(); return r; };
    }
    window.addEventListener("popstate", onNav);

    /* ------------------------------------------------------------------ *
     * Painel de ajustes flutuante (FAB + painel) — mesmo modelo do
     *   reddit/twitter. Fonte de verdade: GROUPS. Cada controle muta `prefs`,
     *   salva e re-aplica. As flags do feed re-aplicam via applySettings; as
     *   do vídeo (autoUnmute/stories/keyboard) são lidas ao vivo pelo player.
     * ------------------------------------------------------------------ */
    // Reaplica o que é dirigido por CSS var / classes / re-montagem do feed (toggles de vídeo são lidos ao vivo).
    function applySettings() {
        const de = document.documentElement;
        de.classList.toggle("igf-no-msg", !!prefs.hideMessages);   // esconde o dock de mensagens
        de.classList.toggle("igf-totop-on", !!prefs.backToTop);    // habilita o botão voltar-ao-topo
        de.style.setProperty("--igm-maxw", (prefs.feedWidth || 1320) + "px");
        GAP = prefs.density === "compact" ? 14 : 24;   // densidade → gap entre cards (layout em JS)
        if (prefs.hideMessages) tagMessagesDock();     // marca o dock p/ o CSS escondê-lo
        syncMasonry();          // monta/atualiza o feed (mountOwnFeed aplica as classes no 1º paint)
        applyFeedClasses();     // garante sombra/densidade/legenda/contadores com o feed já montado
        relayoutFeed();         // densidade/legenda mudam as faixas → recalcula colunas + a dica de altura
    }
    // marca o DOCK DE MENSAGENS (balão flutuante) p/ o CSS escondê-lo. Acha por link /direct/ ou ícone/texto
    // perto do rodapé-direito e sobe até o ancestral FIXO (o container do dock).
    function tagMessagesDock() {
        if (document.querySelector(".igf-msgdock")) return;   // já marcado (ainda vivo)
        const vw = window.innerWidth || 1200, vh = window.innerHeight || 800;
        const nearDock = (r) => r.width && r.bottom > vh - 280 && r.right > vw - 760;
        let hit = null;
        for (const a of document.querySelectorAll('a[href*="/direct/"], svg[aria-label*="essage" i], svg[aria-label*="ensage" i], svg[aria-label*="essenger" i]')) {
            if (nearDock(a.getBoundingClientRect())) { hit = a; break; }
        }
        if (!hit) for (const e of document.querySelectorAll('div[role="button"]')) {   // fallback: texto "Messages"/"Mensagens"
            const t = (e.textContent || "").trim();
            if ((t === "Messages" || t === "Mensagens") && nearDock(e.getBoundingClientRect())) { hit = e; break; }
        }
        if (!hit) return;
        for (let n = hit, i = 0; n && n !== document.body && i < 9; n = n.parentElement, i++) {
            if (getComputedStyle(n).position === "fixed") { n.classList.add("igf-msgdock"); return; }
        }
    }
    let totopBound = false;
    function bindBackToTop() {   // 1 listener global → liga a classe .igf-scrolled qdo desce a página (CSS mostra o botão)
        if (totopBound) return; totopBound = true;
        let cur = false;
        window.addEventListener("scroll", () => {
            const s = (window.scrollY || window.pageYOffset || 0) > 500;
            if (s !== cur) { cur = s; document.documentElement.classList.toggle("igf-scrolled", s); }
        }, { passive: true });
    }
    const TOTOP_SVG = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 4l-8 8h5v8h6v-8h5z"/></svg>';
    // Ícones do rail de categorias — ordem = ordem de GROUPS (Feed, Grid, Mosaico, Vídeo, Interface).
    const PANEL_ICONS = [
        "M12 3l9 8h-3v9h-4v-6H10v6H6v-9H3l9-8z",                                                              // Feed (home)
        "M3 3h8v8H3V3zm10 0h8v8h-8V3zM3 13h8v8H3v-8zm10 0h8v8h-8v-8z",                                         // Grid
        "M3 5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5zm2 0v14h6V5H5zm8 0v14h6V5h-6z",  // Mosaico (colunas)
        "M8 5v14l11-7z",                                                                                       // Vídeo (play)
        "M3 17h6v-2H3v2zm0-5h10v-2H3v2zm0-7v2h14V5H3zm18 12v-2h-6v2h6zm0-5v-2H11v2h10zm-6-7v2h6V5h-6z",         // Interface (tune)
    ];
    function buildPanel() {
        if (document.getElementById("igs-fab")) return;
        const fab = el("button", { id: "igs-fab", type: "button", title: "Ajustes do Instagram", html: ICONS.gear });
        const toTop = el("button", { id: "igs-totop", type: "button", title: "Voltar ao topo", html: TOTOP_SVG });
        toTop.addEventListener("click", () => window.scrollTo({ top: 0, behavior: "smooth" }));
        const panel = el("div", { id: "igs-panel", role: "dialog", "aria-label": "Ajustes do Instagram" });

        // cabeçalho
        const close = el("button", { class: "igs-x", type: "button", title: "Fechar", onClick: () => panel.classList.remove("open") }, "✕");
        panel.append(el("div", { class: "igs-head" },
            el("span", { class: "igs-logo", html: ICONS.gear }),
            el("b", {}, "Instagram"), close));

        // busca (filtra todas as categorias)
        const search = el("input", {
            type: "text", placeholder: "Buscar ajuste…", spellcheck: "false",
            onKeydown: (e) => e.stopPropagation(), onKeyup: (e) => e.stopPropagation(),
        });
        panel.append(el("div", { class: "igs-search" },
            el("div", {}, el("span", { html: '<svg viewBox="0 0 24 24"><path d="M15.5 14h-.79l-.28-.27a6.5 6.5 0 1 0-.7.7l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0A4.5 4.5 0 1 1 14 9.5 4.5 4.5 0 0 1 9.5 14z"/></svg>' }), search)));

        const rail = el("div", { class: "igs-rail" });
        const content = el("div", { class: "igs-content" });
        const empty = el("div", { class: "igs-empty" }, "Nenhum ajuste encontrado");
        const sections = [], tabs = [];
        let active = 0;

        const refreshDimming = () => {
            panel.querySelectorAll("[data-dep]").forEach((r) => r.classList.toggle("dim", !prefs[r.getAttribute("data-dep")]));
        };

        GROUPS.forEach((grp, gi) => {
            const sec = el("div", { class: "igs-sec" });
            sec.append(el("div", { class: "igs-sec-title" }, grp.title));
            for (const item of grp.items) {
                const lbl = item.label.toLowerCase();
                if (item.type === "slider") {
                    const valEl = el("span", { class: "val" }, prefs[item.key] + (item.unit || ""));
                    const input = el("input", {
                        type: "range", min: String(item.min), max: String(item.max), step: String(item.step || 1), value: String(prefs[item.key]),
                        onInput: (e) => { prefs[item.key] = +e.target.value; valEl.textContent = e.target.value + (item.unit || ""); savePrefs(); applySettings(); refreshDimming(); },
                    });
                    sec.append(el("div", { class: "igs-slider", "data-dep": item.dep, "data-label": lbl },
                        el("div", { class: "igs-lab" }, el("span", {}, item.label), valEl), input,
                        item.hint ? el("small", { class: "igs-hint" }, item.hint) : null));
                } else if (item.type === "select") {
                    const sel = el("select", { onChange: (e) => { prefs[item.key] = e.target.value; savePrefs(); applySettings(); refreshDimming(); } },
                        ...item.options.map((o) => el("option", Object.assign({ value: o.value }, String(prefs[item.key]) === o.value ? { selected: "" } : {}), o.label)));
                    sec.append(el("div", { class: "igs-row", "data-label": lbl },
                        el("span", { class: "igs-rowlbl" }, el("span", {}, item.label), item.hint ? el("small", { class: "igs-hint" }, item.hint) : null), sel));
                } else {
                    const input = el("input", Object.assign({
                        type: "checkbox",
                        onChange: (e) => { prefs[item.key] = e.target.checked; savePrefs(); applySettings(); refreshDimming(); },
                    }, prefs[item.key] ? { checked: "" } : {}));
                    sec.append(el("label", { class: "igs-row", "data-dep": item.dep, "data-label": lbl },
                        el("span", { class: "igs-rowlbl" },
                            el("span", {}, item.label),
                            item.hint ? el("small", { class: "igs-hint" }, item.hint) : null),
                        el("span", { class: "igs-sw" }, input, el("i", {}))));
                }
            }
            content.append(sec);
            sections.push(sec);

            const tab = el("button", { class: "igs-tab", type: "button", title: grp.title,
                html: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${PANEL_ICONS[gi] || PANEL_ICONS[0]}"/></svg>` });
            tab.addEventListener("click", () => { search.value = ""; showTab(gi); });
            rail.append(tab); tabs.push(tab);
        });

        content.append(empty);
        panel.append(el("div", { class: "igs-body" }, rail, content));

        function showTab(i) {
            active = i; panel.classList.remove("searching"); empty.style.display = "none";
            sections.forEach((sec, idx) => {
                sec.style.display = idx === i ? "block" : "none";
                sec.querySelectorAll("[data-label]").forEach((r) => (r.style.display = ""));
                const t = sec.querySelector(".igs-sec-title"); if (t) t.style.display = "";
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
                const t = sec.querySelector(".igs-sec-title"); if (t) t.style.display = vis ? "" : "none";
            });
            empty.style.display = any ? "none" : "block";
        });

        panel.append(el("div", { class: "igs-foot" },
            el("button", { class: "igs-reset", type: "button", onClick: () => {
                prefs = Object.assign({}, DEFAULTS); savePrefs(); panel.remove(); fab.remove(); toTop.remove(); buildPanel(); applySettings();
            } }, "Restaurar padrões"),
            el("span", { class: "igs-ver" }, (typeof GM_info !== "undefined" && GM_info.script ? "v" + GM_info.script.version : ""))));

        fab.addEventListener("click", () => { panel.classList.toggle("open"); refreshDimming(); });
        document.addEventListener("click", (e) => { if (!panel.contains(e.target) && e.target !== fab && !fab.contains(e.target)) panel.classList.remove("open"); });
        (document.body || document.documentElement).append(fab, panel, toTop);
        bindBackToTop();
        showTab(0);
        refreshDimming();
    }
    function ensurePanel() { if (!document.getElementById("igs-fab") && document.body) buildPanel(); }
    let panelTask = null;
    function schedulePanel() {
        if (panelTask !== null || document.getElementById("igs-fab") || !document.body) return;
        const run = () => { panelTask = null; ensurePanel(); };
        if (typeof requestIdleCallback === "function") panelTask = requestIdleCallback(run, { timeout: 1000 });
        else panelTask = setTimeout(run, 0);
    }
    let initialWorkTask = null;
    function scheduleInitialWork() {
        if (initialWorkTask !== null) return;
        const run = () => {
            initialWorkTask = null;
            scan();
        };
        // O mosaico e o skeleton precisam nascer antes da primeira oportunidade de paint do IG.
        // Trabalho secundário (painel, JSON inline) continua nos agendadores próprios.
        if (typeof requestAnimationFrame === "function") initialWorkTask = requestAnimationFrame(run);
        else initialWorkTask = setTimeout(run, 0);
    }

    // bootstrap
    document.documentElement.style.setProperty("--igm-maxw", (prefs.feedWidth || 1320) + "px");   // largura do feed desde o 1º paint
    GAP = prefs.density === "compact" ? 14 : 24;   // densidade salva válida no 1º layout (sem esperar interação)
    document.documentElement.classList.toggle("igf-no-msg", !!prefs.hideMessages);   // flags de interface desde o 1º paint
    document.documentElement.classList.toggle("igf-totop-on", !!prefs.backToTop);
    applyTheme();   // html.igf-dark já no 1º paint (paleta correta dos cards)
    scheduleInitialWork();
    window.addEventListener("DOMContentLoaded", scheduleInitialWork);
    window.addEventListener("load", () => { scheduleInitialWork(); setTimeout(scan, 1200); });
})();
