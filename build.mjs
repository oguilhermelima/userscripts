#!/usr/bin/env node
// =============================================================================
//  build.mjs — build the common and social userscripts into dist/.
//
//  Sources live in scripts/. The build produces one installable file per
//  userscript files and this README.
//
//  Usage: node build.mjs
// =============================================================================
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const scriptsDir = path.join(__dirname, "scripts");
const distDir = path.join(__dirname, "dist");

const GH = {
  user: "oguilhermelima",
  repo: "userscripts",
  branch: "main",
};
const RAW = `https://raw.githubusercontent.com/${GH.user}/${GH.repo}/${GH.branch}/dist`;
const HEADER_RE = /\/\/ ==UserScript==[\s\S]*?\/\/ ==\/UserScript==/;

function parse(source) {
  const match = source.match(HEADER_RE);
  if (!match) throw new Error("missing ==UserScript== block");
  const header = match[0];
  const body = source.slice(match.index + header.length).replace(/^\s*\n/, "");
  const meta = {};
  for (const line of header.split("\n")) {
    const item = line.match(/^\/\/\s*@(\S+)(?:\s+(.*?))?\s*$/);
    if (!item) continue;
    (meta[item[1]] ||= []).push(item[2] ?? "");
  }
  return { header, body, meta };
}

const first = (meta, key, fallback = "") => meta[key]?.[0] ?? fallback;

function hostsFrom(meta) {
  const hosts = new Set();
  for (const pattern of meta.match || []) {
    const match = pattern.match(/^(?:\*|https?):\/\/([^/]+)(?:\/|$)/);
    if (!match) continue;
    hosts.add(match[1].replace(/^\*\./, ""));
  }
  return [...hosts];
}

function withUpdate(header, fileName) {
  const url = `${RAW}/${fileName}`;
  const lines = header.split("\n").filter(line => !/@(updateURL|downloadURL)\b/.test(line));
  const output = [];
  for (const line of lines) {
    output.push(line);
    if (/^\/\/\s*@version\b/.test(line)) {
      output.push(`// @updateURL    ${url}`);
      output.push(`// @downloadURL  ${url}`);
    }
  }
  return output.join("\n");
}

const standaloneFiles = fs.readdirSync(scriptsDir)
  .filter(file => file.endsWith(".user.js"))
  .sort();
const entries = standaloneFiles.map(file => ({
  name: file.replace(/\.user\.js$/, ""),
  src: fs.readFileSync(path.join(scriptsDir, file), "utf8"),
}));

fs.mkdirSync(distDir, { recursive: true });
const parsed = [];
for (const entry of entries) {
  const item = parse(entry.src);
  parsed.push({ ...entry, ...item });
  const fileName = `${entry.name}.user.js`;
  fs.writeFileSync(path.join(distDir, fileName), `${withUpdate(item.header, fileName)}\n${item.body}`);
}

const descriptions = {
  immich: "YouTube-style player with speed, audio boost and video marks, a card view with titles, grouping and sorting, and an album sidebar.",
  instagram: "Native video controls, unified mosaic feed, responsive grids, lightbox viewer, and saved-post tools for Instagram.",
  reddit: "Custom Reddit control panel with layout controls, ad cleanup, video autoplay, and sorting tabs.",
  twitch: "Moves Twitch's top bar into the sidebar and adds a channel tab bar plus a YouTube-style Clips and VOD player with filters, sorting and full clip history.",
  twitter: "X/Twitter control panel for a wider layout, decluttered sidebars, live preferences, and sensitive-content handling.",
  youtube: "YouTube Enhancer: full-screen theater with chat and up-next sidebars, black-bar crop, loop, audio boost and speed in the player, a live-now section for your subscriptions, a docked playlist sidebar with an advanced mode (search, sort and filters that set the playback order), plus opt-in quality, filters and Shorts settings.",
};
const SITE_NAMES = {
  immich: "Immich (self-hosted)",
  instagram: "instagram.com",
  reddit: "reddit.com",
  twitch: "twitch.tv",
  twitter: "x.com · twitter.com",
  youtube: "youtube.com",
};
const cards = parsed.map(item => ({
  id: item.name,
  title: first(item.meta, "name") || item.name,
  version: first(item.meta, "version"),
  site: SITE_NAMES[item.name] || hostsFrom(item.meta).join(" · "),
  desc: descriptions[item.name] || first(item.meta, "description") || "",
}));
// Each site's real logo (Simple Icons) and brand colour, for the cards
// and their install buttons.
const BRANDS = {
  immich: { icon: "immich", color: "4250AF" },
  instagram: { icon: "instagram", color: "E4405F" },
  reddit: { icon: "reddit", color: "FF4500" },
  twitch: { icon: "twitch", color: "9146FF" },
  // Black on GitHub's dark theme would vanish: white there.
  twitter: { icon: "x/000000/ffffff", color: "000000", logo: "x" },
  youtube: { icon: "youtube", color: "FF0000" },
};
const LABELS = { youtube: "YouTube", twitter: "X" };
const label = id => LABELS[id] || id.charAt(0).toUpperCase() + id.slice(1);
const brand = id => BRANDS[id] || { icon: "", color: "2ea44f" };
const siteIcon = (id, size) =>
  `<img src="https://cdn.simpleicons.org/${brand(id).icon}" width="${size}" height="${size}" alt="${label(id)}">`;
const badge = (text, color, logo, style = "for-the-badge") =>
  `https://img.shields.io/badge/${encodeURIComponent(text).replace(/-/g, "--")}-${color}?style=${style}${logo ? `&logo=${logo}&logoColor=white` : ""}`;
const VM_ICON = "https://raw.githubusercontent.com/violentmonkey/violentmonkey/master/src/resources/icon.svg";
const VM = {
  chrome: "https://chromewebstore.google.com/detail/violentmonkey/jinjaccalgkegednnccohejagnlnfdag",
  edge: "https://microsoftedge.microsoft.com/addons/detail/violentmonkey/eeagobfjdenkkddmbclomhiblgggliao",
  firefox: "https://addons.mozilla.org/firefox/addon/violentmonkey/",
};
const TM = {
  chrome: "https://chromewebstore.google.com/detail/tampermonkey/dhdgffkkebhmkfjojejmpbldmpobfkfo",
  firefox: "https://addons.mozilla.org/firefox/addon/tampermonkey/",
  safari: "https://apps.apple.com/app/tampermonkey/id6738342400",
};
const browserIcon = (slug, name) =>
  `<img src="https://cdn.simpleicons.org/${slug}" width="20" height="20" alt="">&nbsp; ${name}`;
const EDGE_ICON = "https://upload.wikimedia.org/wikipedia/commons/9/98/Microsoft_Edge_logo_%282019%29.svg";
const vmButton = (url, browser) =>
  `<a href="${url}"><img src="${badge(`Violentmonkey for ${browser}`, "2B2B2B")}" alt="Violentmonkey for ${browser}"></a>`;

const scriptCards = cards.map(card => {
  const { color, icon, logo = icon } = brand(card.id);
  const install = `<a href="${RAW}/${card.id}.user.js"><img src="${badge(`Install ${label(card.id)}`, color, logo)}" alt="Install ${card.title}"></a>`;
  const version = `<img src="${badge(`v${card.version}`, "555", "", "flat-square")}" alt="v${card.version}">`;
  return `<tr>
<td align="center" width="96">${siteIcon(card.id, 48)}</td>
<td>

### ${card.title} ${version}

<sub>${card.site}</sub>

${card.desc}

${install}

</td>
</tr>`;
}).join("\n");
const siteRow = cards.map(card => `<a href="#scripts">${siteIcon(card.id, 36)}</a>`).join("&nbsp;&nbsp;&nbsp;&nbsp;");

const readme = `<div align="center">

<img src="${VM_ICON}" width="88" alt="">

# Userscripts

**Better YouTube, Twitch, Reddit, X, Instagram and Immich, one click away.**

Theater layouts, smarter sidebars, player controls and less clutter,
installed in your browser with a userscript manager.

${siteRow}

<br>

<a href="#install"><img src="${badge("Get started", "2ea44f")}" alt="Get started"></a> <a href="#scripts"><img src="${badge(`${cards.length} scripts`, "555")}" alt="${cards.length} scripts"></a> <img src="${badge("Auto-updates", "1f6feb")}" alt="Auto-updates">

</div>

---

## Install

<table>
<tr>
<td align="center" width="64"><b>1</b></td>
<td>

**Get Violentmonkey**, the recommended userscript manager: free, open source and light.

| Browser | Recommended | Also works |
|---|---|---|
| ${browserIcon("googlechrome", "Chrome")} · ${browserIcon("brave", "Brave")} · ${browserIcon("opera", "Opera")} | ${vmButton(VM.chrome, "Chrome")} | [Tampermonkey](${TM.chrome}) |
| <img src="${EDGE_ICON}" width="20" height="20" alt="">&nbsp; Edge | ${vmButton(VM.edge, "Edge")} | [Tampermonkey](https://microsoftedge.microsoft.com/addons/detail/tampermonkey/iikmkjmpaadaobahmlepeloendndfphd) |
| ${browserIcon("firefoxbrowser", "Firefox")} <sub>desktop and Android</sub> | ${vmButton(VM.firefox, "Firefox")} | [Tampermonkey](${TM.firefox}) |
| ${browserIcon("safari", "Safari")} <sub>macOS and iOS</sub> | Violentmonkey is not available | [Userscripts](https://apps.apple.com/app/userscripts/id1463298887) · [Tampermonkey](${TM.safari}) |

</td>
</tr>
<tr>
<td align="center"><b>2</b></td>
<td>

**Chrome, Edge, Brave and Opera only:** open \`chrome://extensions\`, open Violentmonkey's **Details** and turn on **Allow User Scripts**. Without it, scripts install but never run.

</td>
</tr>
<tr>
<td align="center"><b>3</b></td>
<td>

**Click Install** on any script below. Violentmonkey opens a confirmation page: confirm, then reload the site.

</td>
</tr>
</table>

> [!TIP]
> Scripts update on their own. Every file carries its update URL and Violentmonkey checks it periodically; to update now, open its dashboard and press **Check for updates**.

## Scripts

<table>
${scriptCards}
</table>

## Help

<details>
<summary><strong>Using the Immich script with your own server</strong></summary>

Immich is self-hosted, so the script only matches the public demo out of the box. Add your server once as a user match; it is kept across updates.

- **Violentmonkey:** open the script, then **Settings → @match rules**, add your address, for example \`https://photos.example.com/*\`, and keep **Keep original** checked.
- **Tampermonkey:** open the script, then **Settings → Includes/Excludes → User matches**, and add the same address.
- **Userscripts (Safari):** edit the script and add a line \`// @match https://photos.example.com/*\` next to the existing one. If an update replaces the file, add it again.

The script checks that the page really is Immich before doing anything, so a broad rule does not affect other sites.

</details>

<details>
<summary><strong>Troubleshooting</strong></summary>

- **Nothing changes on the site:** make sure Violentmonkey is enabled for that site and, on Chrome-based browsers, that **Allow User Scripts** is on. Then reload the page.
- **Install opens the code as plain text:** the manager is not installed or not enabled. Install it, then click Install again.
- **Android:** Chrome for Android has no extensions. Use Firefox with Violentmonkey.

</details>

## Development

Sources live in \`scripts/\`; \`dist/\` and this README are generated. Edit a source, then run:

\`\`\`bash
node build.mjs
node scripts/test-social-performance.mjs
\`\`\`

Do not edit \`dist/\` by hand.
`;
fs.writeFileSync(path.join(__dirname, "README.md"), readme);

console.log("\nOK — generated dist:");
for (const item of parsed) console.log(`  ${item.name}.user.js`);
