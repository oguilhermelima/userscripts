# Common Userscripts

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
| **crunchyroll** | Persistently hides scrollbars across all Crunchyroll routes. | [Install](https://raw.githubusercontent.com/oguilhermelima/userscripts/main/dist/crunchyroll.user.js) |
| **instagram** | Native video controls, unified mosaic feed, responsive grids, lightbox viewer, and saved-post tools for Instagram. | [Install](https://raw.githubusercontent.com/oguilhermelima/userscripts/main/dist/instagram.user.js) |
| **reddit** | Custom Reddit control panel with layout controls, ad cleanup, video autoplay, sorting tabs, and a RedGIFs player. | [Install](https://raw.githubusercontent.com/oguilhermelima/userscripts/main/dist/reddit.user.js) |
| **twitch** | Streamer top navigation plus a YouTube-style Clips and VOD theater with filtering, sorting, and native playback controls. | [Install](https://raw.githubusercontent.com/oguilhermelima/userscripts/main/dist/twitch.user.js) |
| **twitter** | X/Twitter control panel for a wider layout, decluttered sidebars, live preferences, and sensitive-content handling. | [Install](https://raw.githubusercontent.com/oguilhermelima/userscripts/main/dist/twitter.user.js) |

## Repository layout

- `scripts/*.user.js` contains standalone userscript sources.
- `scripts/test-social-performance.mjs` contains social performance scenarios.
- `dist/` contains generated installable files.

## Development

Edit the sources, then run:

```bash
node build.mjs
node scripts/test-social-performance.mjs
```

The build regenerates every individual file and this README. Do not edit generated files in `dist/` directly. Every installable file includes its GitHub auto-update URL.
