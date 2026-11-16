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
const instagramMount = section(instagram, "function mountOwnFeed", "function pauseNativeVideos");
assert.match(instagramMount, /queueSyncFeed\(\)/);
assert.doesNotMatch(instagramMount, /\bingestInlineJSON\(\)/);
const instagramDomReady = section(instagram, "window.addEventListener(\"DOMContentLoaded\"", "window.addEventListener(\"load\"");
assert.doesNotMatch(instagramDomReady, /\bingestInlineJSON\(\)/);

// Instagram: late metadata updates the rendered card, and its fixed caption
// band also shows the publication date without losing the complete caption.
assert.match(instagram, /publishedAt:\s*normalizePublishTime\(m\.taken_at_timestamp\s*\?\?\s*m\.taken_at\)/);
assert.match(instagram, /class:\s*["']igf-capdate["']/);
const instagramPublishTime = section(instagram, "function formatPublishTime", "function smallestVideo");
assert.match(instagramPublishTime, /hour:\s*["']2-digit["']/);
assert.match(instagramPublishTime, /minute:\s*["']2-digit["']/);
const instagramPublishStyle = section(instagram, ".igf-capdate{", ".igf-capmore");
assert.match(instagramPublishStyle, /font-size:\s*12px/);
assert.match(instagram, /cardsByCode/);
const instagramCardMeta = section(instagram, "function updateCardMeta", "function waitForNewPosts");
assert.match(instagramCardMeta, /setCaption\(card, p\.caption\)/);
assert.match(instagramCardMeta, /setPublishDate\(card, p\.publishedAt\)/);

// Instagram: treat a follow as successful only when the API confirms it, and
// show a follow action when the API omits the current relationship state.
const instagramApiPost = section(instagram, "function igApiPost", "const selectedPks");
assert.match(instagramApiPost, /data\.status\s*===\s*["']ok["']/);
assert.match(instagram, /follow:\s*r\.following\s*!==\s*true/);

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
