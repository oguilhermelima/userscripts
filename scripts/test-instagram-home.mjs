import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const source = fs.readFileSync(new URL("./instagram.user.js", import.meta.url), "utf8");
const start = source.indexOf("    function harvestPost(a) {");
const end = source.indexOf("    // chave de um TILE", start);
assert.ok(start >= 0 && end > start, "home post reader exists");
const readPost = source.slice(start, end);

function scenario(apiRecord, nativeFollowLabel) {
    const posts = new Map(), order = [], liveCodes = new Set();
    const image = { currentSrc: "https://example.com/photo.jpg", src: "https://example.com/photo.jpg", getAttribute: () => "" };
    const box = { querySelector: (selector) => selector === "img" ? image : null, contains: () => false };
    const link = { pathname: "/p/ABC/", getAttribute: () => "/p/ABC/" };
    const article = {
        querySelector: (selector) => selector.startsWith('a[href') ? link : null,
        querySelectorAll: (selector) => selector === "a" ? [{ pathname: "/author/" }]
            : selector === 'button, [role="button"]' && nativeFollowLabel ? [{ textContent: nativeFollowLabel }] : [],
    };
    const context = {
        postKey: () => "/p/ABC", mediaBoxOf: () => box, codeOf: () => "ABC", posts, order, liveCodes,
        igMedia: new Map(apiRecord ? [["ABC", apiRecord]] : []),
        RE_FOLLOW: /^Follow$/, RE_FOLLOW_ANY: /^Following$/,
    };
    const harvest = vm.runInNewContext(readPost + "\nharvestPost", context);
    assert.equal(harvest(article), true);
    assert.equal(order[0], "/p/ABC");
    assert.equal(posts.get("/p/ABC").media, image.src);
    return posts.get("/p/ABC");
}

assert.equal(scenario({ following: true, caption: "Caption" }, "Follow").following, true);
assert.equal(scenario(null, "Follow").following, false);
assert.equal(scenario(null, "Following").following, true);
assert.equal(scenario(null, "").following, undefined);
console.log("Instagram home harvest: 4 scenarios passed.");
