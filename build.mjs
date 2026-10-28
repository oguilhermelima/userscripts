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
  youtube: "YouTube Enhancer: full-screen theater with chat and up-next sidebars, black-bar crop, loop, audio boost and speed in the player, a live-now section for your subscriptions, plus opt-in quality, filters and Shorts settings.",
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
const LABELS = { youtube: "YouTube", twitter: "X" };
const label = id => LABELS[id] || id.charAt(0).toUpperCase() + id.slice(1);
const installBadge = card =>
  `[![Install ${label(card.id)}](https://img.shields.io/badge/Install-${encodeURIComponent(label(card.id))}-2ea44f?style=for-the-badge)](${RAW}/${card.id}.user.js)`;
const rows = cards.map(card => {
  const description = card.desc.replace(/[\r\n]+/g, " ").replace(/\|/g, "\\|");
  return `| ${installBadge(card)} | ${card.site} | ${description} |`;
}).join("\n");
const readme = `# Userscripts

Browser userscripts that add features to popular sites and clean up their interface.
Install a userscript manager once, then click **Install** on any script below.

## Install in 3 steps

**1. Install a userscript manager** for your browser:

| Browser | Manager |
|---|---|
| Chrome, Edge, Brave, Opera | [Tampermonkey](https://www.tampermonkey.net/) or [Violentmonkey](https://violentmonkey.github.io/) |
| Firefox (desktop and Android) | [Violentmonkey](https://addons.mozilla.org/firefox/addon/violentmonkey/) or [Tampermonkey](https://addons.mozilla.org/firefox/addon/tampermonkey/) |
| Safari (macOS and iOS) | [Userscripts](https://apps.apple.com/app/userscripts/id1463298887) |

**2. Chrome-based browsers only:** open \`chrome://extensions\`, open the manager's **Details** and turn on **Allow User Scripts**. Without it, scripts install but never run.

**3. Click Install** on a script below. The manager opens a confirmation page; confirm, then reload the site.

Scripts update on their own: every file carries its update URL, and the manager checks it periodically.

## Scripts

| Install | Site | What it does |
|---|---|---|
${rows}

<details>
<summary><strong>Using the Immich script with your own server</strong></summary>

Immich is self-hosted, so the script only matches the public demo out of the box. Add your server once as a user match; it is kept across updates.

- **Tampermonkey:** open the script, then **Settings → Includes/Excludes → User matches**, and add your address, for example \`https://photos.example.com/*\`.
- **Violentmonkey:** open the script, then **Settings → @match rules**, add the same address and keep **Keep original** checked.
- **Userscripts (Safari):** edit the script and add a line \`// @match https://photos.example.com/*\` next to the existing one. If an update replaces the file, add it again.

The script checks that the page really is Immich before doing anything, so a broad rule does not affect other sites.

</details>

<details>
<summary><strong>Troubleshooting</strong></summary>

- **Nothing changes on the site:** make sure the manager is enabled for that site and, on Chrome, that **Allow User Scripts** is on. Then reload the page.
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
