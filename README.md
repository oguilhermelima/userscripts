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

### Self-hosted sites (Immich)

Immich runs on your own server, so the **immich** script only matches the public demo out of the box. Add your server once as a user match; it is kept across script updates:

- **Tampermonkey:** open the script, go to **Settings → Includes/Excludes → User matches**, and add your address, for example `https://photos.example.com/*`.
- **Violentmonkey:** open the script, go to **Settings → @match rules**, and add the same address (with **Keep original** checked).

The script checks that the page really is Immich before doing anything, so a broader rule will not affect other sites.

### Available scripts

| Script | Description | Install |
|---|---|---|
| **immich** | YouTube-style video player for self-hosted Immich: original quality, speed and audio boost, seek keys, reorganised bars and an album sidebar. | [Install](https://raw.githubusercontent.com/oguilhermelima/userscripts/main/dist/immich.user.js) |
| **instagram** | Native video controls, unified mosaic feed, responsive grids, lightbox viewer, and saved-post tools for Instagram. | [Install](https://raw.githubusercontent.com/oguilhermelima/userscripts/main/dist/instagram.user.js) |
| **reddit** | Custom Reddit control panel with layout controls, ad cleanup, video autoplay, and sorting tabs. | [Install](https://raw.githubusercontent.com/oguilhermelima/userscripts/main/dist/reddit.user.js) |
| **twitch** | Moves Twitch's top bar into the sidebar and adds a channel tab bar plus a YouTube-style Clips and VOD player with filters, sorting and full clip history. | [Install](https://raw.githubusercontent.com/oguilhermelima/userscripts/main/dist/twitch.user.js) |
| **twitter** | X/Twitter control panel for a wider layout, decluttered sidebars, live preferences, and sensitive-content handling. | [Install](https://raw.githubusercontent.com/oguilhermelima/userscripts/main/dist/twitter.user.js) |
| **youtube** | YouTube Enhancer: full-screen theater with chat and up-next sidebars, black-bar crop, loop, audio boost and speed in the player, a live-now section for your subscriptions, plus op… | [Install](https://raw.githubusercontent.com/oguilhermelima/userscripts/main/dist/youtube.user.js) |

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
