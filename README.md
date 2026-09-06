# Common Userscripts

A collection of browser userscripts for common websites and social networks.

## Install

Install a userscript manager first, then choose either the complete pack or individual scripts:

- [Violentmonkey](https://violentmonkey.github.io/)
- [Tampermonkey](https://www.tampermonkey.net/)

### All scripts

Install the **[all-in-one pack](https://raw.githubusercontent.com/oguilhermelima/userscripts/main/dist/pack.user.js)** to run every common and social script from one userscript entry. Each site runs in its own isolated module.

### Individual scripts

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
- `dist/` contains generated installable files and the all-in-one pack.

## Development

Edit the sources, then run:

```bash
node build.mjs
node scripts/test-social-performance.mjs
```

The build regenerates every individual file, the all-in-one pack, and this README. Do not edit generated files in `dist/` directly. Every installable file includes its GitHub auto-update URL.
