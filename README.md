# Userscripts

Browser userscripts that add features to popular sites and clean up their interface.
Install a userscript manager once, then click **Install** on any script below.

## Install in 3 steps

**1. Install a userscript manager** for your browser:

| Browser | Manager |
|---|---|
| Chrome, Edge, Brave, Opera | [Tampermonkey](https://www.tampermonkey.net/) or [Violentmonkey](https://violentmonkey.github.io/) |
| Firefox (desktop and Android) | [Violentmonkey](https://addons.mozilla.org/firefox/addon/violentmonkey/) or [Tampermonkey](https://addons.mozilla.org/firefox/addon/tampermonkey/) |
| Safari (macOS and iOS) | [Userscripts](https://apps.apple.com/app/userscripts/id1463298887) |

**2. Chrome-based browsers only:** open `chrome://extensions`, open the manager's **Details** and turn on **Allow User Scripts**. Without it, scripts install but never run.

**3. Click Install** on a script below. The manager opens a confirmation page; confirm, then reload the site.

Scripts update on their own: every file carries its update URL, and the manager checks it periodically.

## Scripts

| Install | Site | What it does |
|---|---|---|
| [![Install Immich](https://img.shields.io/badge/Install-Immich-2ea44f?style=for-the-badge)](https://raw.githubusercontent.com/oguilhermelima/userscripts/main/dist/immich.user.js) | Immich (self-hosted) | YouTube-style player with speed, audio boost and video marks, a card view with titles, grouping and sorting, and an album sidebar. |
| [![Install Instagram](https://img.shields.io/badge/Install-Instagram-2ea44f?style=for-the-badge)](https://raw.githubusercontent.com/oguilhermelima/userscripts/main/dist/instagram.user.js) | instagram.com | Native video controls, unified mosaic feed, responsive grids, lightbox viewer, and saved-post tools for Instagram. |
| [![Install Reddit](https://img.shields.io/badge/Install-Reddit-2ea44f?style=for-the-badge)](https://raw.githubusercontent.com/oguilhermelima/userscripts/main/dist/reddit.user.js) | reddit.com | Custom Reddit control panel with layout controls, ad cleanup, video autoplay, and sorting tabs. |
| [![Install Twitch](https://img.shields.io/badge/Install-Twitch-2ea44f?style=for-the-badge)](https://raw.githubusercontent.com/oguilhermelima/userscripts/main/dist/twitch.user.js) | twitch.tv | Moves Twitch's top bar into the sidebar and adds a channel tab bar plus a YouTube-style Clips and VOD player with filters, sorting and full clip history. |
| [![Install X](https://img.shields.io/badge/Install-X-2ea44f?style=for-the-badge)](https://raw.githubusercontent.com/oguilhermelima/userscripts/main/dist/twitter.user.js) | x.com · twitter.com | X/Twitter control panel for a wider layout, decluttered sidebars, live preferences, and sensitive-content handling. |
| [![Install YouTube](https://img.shields.io/badge/Install-YouTube-2ea44f?style=for-the-badge)](https://raw.githubusercontent.com/oguilhermelima/userscripts/main/dist/youtube.user.js) | youtube.com | YouTube Enhancer: full-screen theater with chat and up-next sidebars, black-bar crop, loop, audio boost and speed in the player, a live-now section for your subscriptions, plus opt-in quality, filters and Shorts settings. |

<details>
<summary><strong>Using the Immich script with your own server</strong></summary>

Immich is self-hosted, so the script only matches the public demo out of the box. Add your server once as a user match; it is kept across updates.

- **Tampermonkey:** open the script, then **Settings → Includes/Excludes → User matches**, and add your address, for example `https://photos.example.com/*`.
- **Violentmonkey:** open the script, then **Settings → @match rules**, add the same address and keep **Keep original** checked.
- **Userscripts (Safari):** edit the script and add a line `// @match https://photos.example.com/*` next to the existing one. If an update replaces the file, add it again.

The script checks that the page really is Immich before doing anything, so a broad rule does not affect other sites.

</details>

<details>
<summary><strong>Troubleshooting</strong></summary>

- **Nothing changes on the site:** make sure the manager is enabled for that site and, on Chrome, that **Allow User Scripts** is on. Then reload the page.
- **Install opens the code as plain text:** the manager is not installed or not enabled. Install it, then click Install again.
- **Android:** Chrome for Android has no extensions. Use Firefox with Violentmonkey.

</details>

## Development

Sources live in `scripts/`; `dist/` and this README are generated. Edit a source, then run:

```bash
node build.mjs
node scripts/test-social-performance.mjs
```

Do not edit `dist/` by hand.
