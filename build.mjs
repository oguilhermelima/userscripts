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
  crunchyroll: "Persistently hides scrollbars across all Crunchyroll routes.",
  instagram: "Native video controls, unified mosaic feed, responsive grids, lightbox viewer, and saved-post tools for Instagram.",
  reddit: "Custom Reddit control panel with layout controls, ad cleanup, video autoplay, and sorting tabs.",
  twitch: "Streamer top navigation plus a YouTube-style Clips and VOD theater with filtering, sorting, and native playback controls.",
  twitter: "X/Twitter control panel for a wider layout, decluttered sidebars, live preferences, and sensitive-content handling.",
};
const cards = parsed.map(item => ({
  id: item.name,
  title: first(item.meta, "name") || item.name,
  desc: descriptions[item.name] || first(item.meta, "description") || "",
}));
const truncate = (value, max) => {
  const text = String(value || "");
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
};
const rows = cards.map(card => {
  const description = truncate(card.desc || card.title, 180)
    .replace(/[\r\n]+/g, " ")
    .replace(/\|/g, "\\|");
  return `| **${card.id}** | ${description} | [Install](${RAW}/${card.id}.user.js) |`;
}).join("\n");
const readme = `# Common Userscripts

A collection of browser userscripts for common websites and social networks, maintained by oguilhermelima.

## Install

Install a userscript manager first, then choose the scripts you need:

- [Violentmonkey](https://violentmonkey.github.io/)
- [Tampermonkey](https://www.tampermonkey.net/)

### Enable full script access

For all userscript features to work, allow the userscript manager to run scripts on the target sites:

1. Open your browser's extensions page (chrome://extensions on Chrome/Chromium; about:addons on Firefox).
2. Open the details for **Tampermonkey** or **Violentmonkey**.
3. On Chrome/Chromium, enable **Allow User Scripts**.
4. Allow the manager to access the sites you want to customize, then install one of the scripts above.

If **Allow User Scripts** is not available, update the browser and userscript manager first.

### Available scripts

| Script | Description | Install |
|---|---|---|
${rows}

## Repository layout

- \`scripts/*.user.js\` contains standalone userscript sources.
- \`scripts/test-social-performance.mjs\` contains social performance scenarios.
- \`dist/\` contains generated installable files.

## Development

Edit the sources, then run:

\`\`\`bash
node build.mjs
node scripts/test-social-performance.mjs
\`\`\`

The build regenerates every individual file and this README. Do not edit generated files in \`dist/\` directly. Every installable file includes its GitHub auto-update URL.
`;
fs.writeFileSync(path.join(__dirname, "README.md"), readme);

console.log("\nOK — generated dist:");
for (const item of parsed) console.log(`  ${item.name}.user.js`);
