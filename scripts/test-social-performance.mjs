import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const read = (name) => fs.readFileSync(path.join(root, "scripts", name), "utf8");
const section = (source, start, end) => {
    const from = source.indexOf(start);
    assert.notEqual(from, -1, `seção ausente: ${start}`);
    const to = end ? source.indexOf(end, from + start.length) : source.length;
    assert.notEqual(to, -1, `fim de seção ausente: ${end}`);
    return source.slice(from, to);
};

const twitter = read("twitter.user.js");
const instagram = read("instagram.user.js");
const reddit = read("reddit.user.js");

// Cenário Twitter: o player nativo é a única autoridade sobre play/pause.
assert.doesNotMatch(twitter, /key:\s*["']autoplay["']/);
assert.doesNotMatch(twitter, /new\s+IntersectionObserver/);
assert.doesNotMatch(twitter, /HTMLMediaElement\.prototype\.pause/);
assert.doesNotMatch(twitter, /\.pause\s*=\s*function/);
assert.doesNotMatch(twitter, /addEventListener\(["']pause["']/);
const twitterMedia = section(twitter, "const scheduleMedia", "// Re-apply");
assert.match(twitterMedia, /applyBlurMedia\(\)/);
assert.doesNotMatch(twitterMedia, /observeVideos|autoplay/);

// Cenário Instagram: o primeiro paint não pode pagar o parse completo do JSON
// server-rendered, e cards novos entram numa inserção em lote sem reflow por item.
assert.match(instagram, /content-visibility:auto/);
assert.match(instagram, /document\.createDocumentFragment\(\)/);
const instagramCreateFeed = section(instagram, "function createFeed", "function mountOwnFeed");
assert.match(instagramCreateFeed, /scheduleInlineJSON/);
assert.match(instagramCreateFeed, /resetFeedItems\(\)/);
assert.match(instagramCreateFeed, /apiFeedUsed\s*=\s*surface === "home" \? 0 : apiFeedCodes\.length/);
assert.match(instagramCreateFeed, /if \(surface === "home"\) onApiFeed\(\)/);
const instagramMount = section(instagram, "function mountOwnFeed", "function pauseNativeVideos");
assert.match(instagramMount, /queueSyncFeed\(\)/);
assert.match(instagramMount, /observeOptions\.attributes\s*=\s*true/);
assert.match(instagramMount, /\["src", "srcset", "poster", "href"\]/);
assert.doesNotMatch(instagramMount, /\bingestInlineJSON\(\)/);
const instagramDomReady = section(instagram, "window.addEventListener(\"DOMContentLoaded\"", "window.addEventListener(\"load\"");
assert.doesNotMatch(instagramDomReady, /\bingestInlineJSON\(\)/);

// Instagram: late metadata updates the rendered card, and its fixed caption
// band also shows the publication date without losing the complete caption.
assert.match(instagram, /publishedAt:\s*normalizePublishTime\(m\.taken_at_timestamp\s*\?\?\s*m\.taken_at\)/);
assert.match(instagram, /class:\s*["']igf-pubtime["']/);
const instagramPublishTime = section(instagram, "const PUBLISH_DATE_FORMAT", "function smallestVideo");
assert.match(instagramPublishTime, /hour:\s*["']2-digit["']/);
assert.match(instagramPublishTime, /minute:\s*["']2-digit["']/);
const instagramPublishStyle = section(instagram, ".igf-pubtime{", ".igf-copyuser{");
assert.match(instagramPublishStyle, /font-size:\s*14px/);
assert.match(instagram, /cardsByCode/);
const instagramCardMeta = section(instagram, "function updateCardMeta", "function waitForNewPosts");
assert.match(instagramCardMeta, /setCaption\(card, p\.caption\)/);
assert.match(instagramCardMeta, /setPublishDate\(card, p\.publishedAt\)/);

// Instagram: relative time stays in the card header; hover retains the exact timestamp.
const instagramRelativeTime = section(instagram, "function formatRelativePublishTime", "function smallestVideo");
assert.match(instagramRelativeTime, /RelativeTimeFormat/);
const instagramPublishUpdater = section(instagram, "function updatePublishDate", "function setPublishDate");
assert.match(instagramPublishUpdater, /formatPublishTime/);
assert.match(instagramPublishUpdater, /title/);
const instagramPublishMarkup = section(instagram, "function buildCard(p)", "function bindFeedEvents");
assert.match(instagramPublishMarkup, /igf-pubtime/);
assert.match(instagramPublishMarkup, /igf-identity/);
assert.match(instagramPublishMarkup, /igf-avatar/);
assert.match(instagramPublishMarkup, /igf-profilemeta/);
const instagramPublishHeaderStyle = section(instagram, ".igf-pubtime{", ".igf-copyuser{");
assert.match(instagramPublishHeaderStyle, /font-weight:\s*(400|500)/);
const instagramFollowStyle = section(instagram, ".igf-follow{", ".igf-follow:focus-visible");
assert.match(instagramFollowStyle, /display:\s*inline-flex/);
assert.match(instagramFollowStyle, /background:\s*transparent/);
assert.match(instagramFollowStyle, /border:\s*0/);
assert.doesNotMatch(instagramFollowStyle, /border-radius:\s*999px/);
const instagramIdentityStyle = section(instagram, ".igf-identity{", ".igf-userline{");
assert.match(instagramIdentityStyle, /align-items:\s*center/);

// Instagram: keep media URLs separate from post permalinks, including the active carousel slide.
assert.match(instagram, /originalImageUrl/);
assert.match(instagram, /downloadVideoUrl/);
const instagramCarousel = section(instagram, "function buildCarousel", "\/\* <img> da mídia");
assert.match(instagramCarousel, /dataset\.mediaUrl/);
assert.match(instagramCarousel, /buildMediaTools\(\)/);
const instagramMediaActions = section(instagram, "function mediaActionUrl", "function nativeModalTrigger");
assert.match(instagramMediaActions, /originalImageUrl/);
assert.match(instagramMediaActions, /downloadVideoUrl/);
assert.match(instagramMediaActions, /function downloadMedia/);

// Instagram: the media opens the modal, the ↗ link opens the post in another tab,
// and modal failures never change the current page URL.
const instagramModalTrigger = section(instagram, "function nativeModalTrigger", "function clickModalTrigger");
assert.doesNotMatch(instagramModalTrigger, /a\[role="link"/);
const instagramModalWait = section(instagram, "function openViaNative", "function nativeArticle");
assert.doesNotMatch(instagramModalWait, /go\(cleanPostUrl\(p\)\)/);
assert.match(instagram, /target:\s*["']_blank["']/);
assert.doesNotMatch(instagram, /data-act:\s*["']open["']/);

// Instagram: incremental loading keeps skeleton feedback and offers a useful retry state.
const instagramLoaderStyle = section(instagram, ".igf-loader{", "@keyframes igf-rot");
assert.match(instagramLoaderStyle, /igf-retry/);
assert.doesNotMatch(instagramLoaderStyle, /igf-done\{\s*display:\s*none/);
const instagramLoadMore = section(instagram, "async function loadMore", "\/\/ gatilho redundante por SCROLL");
assert.match(instagramLoadMore, /mountSkeleton\(3/);
assert.match(instagramLoadMore, /setLoaderState\(/);
assert.doesNotMatch(instagramLoadMore, /Não foi possível carregar mais publicações/);
assert.match(instagramLoadMore, /Aguardando novas publicações/);
assert.match(instagram, /["']data-act["']:\s*["']retry["']/);

// Instagram: successful follow actions confirm the result to the user.
const instagramFollow = section(instagram, "async function followUser", "\/\* === VÍDEO NOS CARDS");
assert.match(instagramFollow, /toast\(next\s*\?/);
assert.match(instagram, /igf-follow-pop/);

// Instagram: keep follow controls available for followed users and expose unfollow on hover.
const instagramApiPost = section(instagram, "function igApiPost", "const selectedPks");
assert.match(instagramApiPost, /data\.status\s*===\s*["']ok["']/);
const instagramFollowRender = section(instagram, "function renderFollowButton", "async function followUser");
assert.match(instagramFollowRender, /Deixar de seguir/);
assert.match(instagramFollowRender, /aria-pressed/);
assert.doesNotMatch(instagramFollowRender, /if \(!p\.follow\).*remove/);
assert.match(instagram, /if \(p\.author && surface !== "profile"\)/);
assert.match(instagram, /\.igf-follow\.on:hover/);

// Instagram: media shortcuts are compact at the media's upper-left; actionbar share copies,
// while the post permalink is last and stays neutral after visiting.
const instagramMediaToolsStyle = section(instagram, ".igf-media-tools{", ".igf-media-tool.igf-busy");
assert.match(instagramMediaToolsStyle, /top:\s*8px;\s*left:\s*8px/);
assert.match(instagramMediaToolsStyle, /width:\s*26px;\s*height:\s*26px/);
const instagramCardMarkup = section(instagram, "function buildCard(p)", "function bindFeedEvents");
assert.match(instagramCardMarkup, /ICO\.share/);
assert.ok(instagramCardMarkup.indexOf("ICO.save") < instagramCardMarkup.indexOf("ICO.open"));
assert.match(instagram, /\.igf-openpost:visited\{[^}]*color:\s*inherit/);

// Instagram: standalone post pages widen their content and scope the custom grid to More posts.
const instagramPostRoute = section(instagram, "function targetSurface()", "const itemsIn");
assert.match(instagramPostRoute, /if \(isPostRoute\(\)\) \{/);
const instagramRecommendations = section(instagram, "function postRecommendationTiles", "function gridContainer");
assert.match(instagramRecommendations, /More posts|Mais publica/);
assert.match(instagramRecommendations, /POST_GRID_SEL/);
assert.doesNotMatch(instagramRecommendations, /if \(!main \|\| !tiles\.length\) return \[\]/);
const instagramPostGrid = section(instagram, "function gridContainer()", "\/\* botão de COPIAR o username");
assert.match(instagramPostGrid, /surface === "post"/);
const instagramPostTargets = section(instagram, "function postDetailBranches()", "function gridContainer");
assert.match(instagramPostTargets, /classList\.add\("igm-postitem"\)/);
assert.match(instagramPostTargets, /classList\.add\("igm-postmedia"\)/);
assert.match(instagramPostTargets, /classList\.add\("igm-postmediabox"\)/);
assert.match(instagramPostTargets, /\.igf-src, \.igf-feed/);
const instagramPostLayout = section(instagram, "function applyGrid()", "\/\* SKELETON");
assert.match(instagramPostLayout, /if \(!grid[\s\S]*applyPostDetailLayout\(\)/);
assert.match(instagram, /igm-postpage|surface === "post"/);
assert.match(instagram, /\.igm-postdetail\{/);
assert.match(instagram, /\.igm-postitem\{[^}]*max-height:calc\(100dvh - 64px\)/);
assert.doesNotMatch(instagram, /\.igm-postitem\{[^}]*height:calc/);
assert.match(instagram, /\.igm-postmediabox\{/);
assert.match(instagram, /\.igm-postmedia\{[^}]*max-height:calc\(100dvh - 96px\)/);
const instagramPostDetailStyle = section(instagram, ".igm-postdetail{", ".igm-postdetail.igm-gridnav");
assert.match(instagramPostDetailStyle, /width:min\(1440px/);
assert.doesNotMatch(instagramPostDetailStyle, /display:flex|height:calc/);
assert.match(instagramPostDetailStyle, /overflow:hidden/);
assert.doesNotMatch(instagramPostDetailStyle, /overflow-y:\s*auto/);
assert.doesNotMatch(instagramPostDetailStyle, /var\(--igm-maxw\)/);
assert.match(instagram, /html\.igf-dark\s*\{[^}]*--ig-background:\s*0,\s*0,\s*0/);
assert.match(instagram, /html\.igf-dark body\s*\{\s*background-color:#000 !important/);
assert.match(instagram, /--ig-primary-background:\s*0,\s*0,\s*0 !important/);
assert.match(instagram, /html\.igf-dark \[id\^="mount_0"\]/);
assert.match(instagram, /html\.igf-dark main\s*\{\s*background-color:#000 !important/);
const instagramRouteTransition = section(instagram, "function onNav()", "for (const m of");
assert.match(instagramRouteTransition, /routeSettling\s*=\s*true/);
assert.match(instagramRouteTransition, /routeSettling\s*=\s*false/);
const instagramSurfaceDetection = section(instagram, "function targetSurface()", "const GRID_SEL");
assert.match(instagramSurfaceDetection, /if \(routeSettling && feedEl && feedEl\.isConnected\) return mountedSurface/);
assert.match(instagramSurfaceDetection, /isPostModal\(\)/);
const instagramRouteWork = section(instagram, "function routeWork()", "let routeQ = null");
assert.match(instagramRouteWork, /if \(routeSettling\) return/);
const instagramMasonrySync = section(instagram, "function syncMasonry()", "function unmasonry");
assert.match(instagramMasonrySync, /if \(routeSettling\) return/);
const instagramFeedReset = section(instagram, "function resetFeedItems()", "function teardownOwnFeed");
assert.match(instagramFeedReset, /posts\.clear\(\)/);
assert.match(instagramFeedReset, /order\.length\s*=\s*0/);
assert.match(instagramFeedReset, /rendered\.clear\(\)/);

// Instagram: username hover restores a profile preview with fetched profile details.
const instagramProfileData = section(instagram, "async function resolveUser", "// clica o botão nativo do post");
assert.match(instagramProfileData, /biography/);
assert.match(instagramProfileData, /edge_followed_by/);
assert.match(instagramProfileData, /edge_follow/);
const instagramProfilePopover = section(instagram, "function bindProfilePopover", "/* HANDLERS DELEGADOS do feed");
assert.match(instagramProfilePopover, /pointerover/);
assert.match(instagramProfilePopover, /pointerout/);
assert.match(instagram, /setAttribute\("aria-expanded"/);
assert.match(instagramProfilePopover, /showProfilePopover/);
const instagramProfileCard = section(instagram, "function buildCard(p)", "function bindProfilePopover");
assert.match(instagramProfileCard, /aria-haspopup.*dialog/);
assert.match(instagramProfileCard, /data-author/);
assert.match(instagram, /\.igf-profile-popover\{/);

// Cenário Reddit: CSS/classes críticas ficam disponíveis cedo, mas o pipeline
// que varre shadow roots e posts só roda fora do caminho crítico do paint.
assert.match(reddit, /requestIdleCallback/);
const redditBoot = section(reddit, "function boot()", "if (document.readyState");
assert.match(redditBoot, /scheduleIdleBoot/);
assert.doesNotMatch(redditBoot, /applySettings\(\)/);

// Cenário Reddit: a galeria própria dá feedback por imagem, antecipa somente o
// vizinho da navegação e o lightbox reaproveita uma imagem com zoom em ciclos.
const redditGallery = section(reddit, "function buildGallery", "function tokWheel");
assert.match(redditGallery, /rx-tok-gslide/);
assert.match(redditGallery, /loading:\s*["']eager["']/);
assert.match(redditGallery, /addEventListener\(["']load["']/);
const redditLightbox = section(reddit, "function openLightbox", "function buildGallery");
assert.match(redditLightbox, /rx-lb-loading/);
assert.match(redditLightbox, /new Image\(\)/);
assert.match(redditLightbox, /ZOOMS\s*=\s*\[1,\s*2,\s*3\]/);
assert.match(redditLightbox, /classList\.toggle\(["']rx-lb-zoomed["']/);

// Cenário Instagram: o primeiro trabalho visual entra no próximo frame, sem
// esperar o agendamento ocioso que deixava a interface nativa visível por segundos.
const instagramInitial = section(instagram, "let initialWorkTask", "// bootstrap");
assert.match(instagramInitial, /requestAnimationFrame/);
assert.doesNotMatch(instagramInitial, /requestIdleCallback/);
assert.match(instagramInitial, /routeWork\(\)/);

// Instagram: when the feed has only one article, home must not wait for a
// second post before starting the own feed.
const instagramFeedDiscovery = section(instagram, "function feedArticleList", "function feedColumnSplit");
assert.match(instagramFeedDiscovery, /isHome\(\)\s*\?\s*1\s*:\s*2/);
const instagramColumnSplit = section(instagram, "function feedColumnSplit", "function leftNavWidthBox");
assert.match(instagramColumnSplit, /for \(let n = list\.parentElement;/);

// Instagram: paint must not depend on a fullscreen gate that can hide both the
// native fallback and the own feed while the DOM is unstable.
assert.doesNotMatch(instagram, /igf-paint-pending|function armPaintGate/);

console.log("Social performance scenarios passed.");
