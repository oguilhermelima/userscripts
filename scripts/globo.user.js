// ==UserScript==
// @name         Globo — Dark Mode, Ad-Free
// @namespace    globo-clean
// @version      1.9.3
// @author       oguilhermelima
// @description  Removes advertising slots and applies a dark theme on Globo, g1, ge and gshow.
// @match        https://globo.com/*
// @match        https://www.globo.com/*
// @match        https://ge.globo.com/*
// @match        https://g1.globo.com/*
// @match        https://gshow.globo.com/*
// @run-at       document-start
// @noframes
// ==/UserScript==

(function () {
    'use strict';

    const css = `
        :root {
            color-scheme: dark !important;
            color: #e8e8e8 !important;
            background: #151515 !important;
            --glb-fd-item-bg: #151515;
            --glb-fd-item-background: #151515;
        }
        nova-barra-globocom {
            --color-background-barraglobo: #151515 !important;
            --color-gray-130: #e8e8e8 !important;
            --color-g1: #ff5549 !important;
            --color-ge: #20d982 !important;
            --color-cartola: #ff8a00 !important;
        }
        html, body, #app, #content, main, .feed-root, .bstn-fd, .bstn-hls { background-color: #151515 !important; color: #e8e8e8 !important; }
        body, body * { border-color: transparent !important; scrollbar-color: #555 #202020; }
        body { color: #e8e8e8 !important; }
        /* G1 and GE use white card surfaces inside otherwise dark pages. */
        .feed-post, .feed-post-body, .feed-post-body-title, .feed-post-metadata,
        .bstn-item-shape, .bstn-relatedtext, .bstn-hl-wrapper, .bstn-hl,
        .bstn-related, .bstn-relateditems, article, .bstn-relateditem,
        .glb-apc-bar-central, .glbbarrawidget, .cookie-banner-lgpd-visible,
        #cookie-banner-lgpd, .cxm-drawer__box,
        .post-multicontent__link--content, .post-multicontent__link--title,
        .header-section, .header-grid, .menu-container, .menu-root,
        .video-grid, [class*="video-grid"], .card-programacao,
        .regua-de-cotacao-section, .push-web-notification,
        .glb-share-bar_button, amp-social-share, .newsletter-g1__container {
            background-color: #151515 !important;
            border-color: transparent !important;
            box-shadow: none !important;
        }
        body.bs-home .feed-post-body-title,
        .post-multicontent__link--title,
        .bstn-hl.no-photo .bstn-hl-title,
        .bstn-hl.no-photo .bstn-hl-summary,
        body.multicontent .content-text,
        body.multicontent .content-text p,
        body.multicontent .content-text__container {
            color: #e8e8e8 !important;
        }
        .feed-post-header-chapeu,
        .glbbarrawidget :is(a, button, span, p, strong, small) {
            color: #e8e8e8 !important;
        }
        .content-text hr, .content-text h2, .content-text h3,
        .feed-post, .bstn-hl, .bstn-hl-relateditem,
        .bstn-hl-relateds, .post-multicontent {
            border-color: #303030 !important;
        }
        .main-menu__menu button, .main-menu__menu button *,
        .auxiliary-menu :is(a, button), .auxiliary-menu :is(a, button) *,
        .menu-container :is(a, button, span, p),
        #cookie-banner-lgpd :is(p, span, div) { color: #e8e8e8 !important; }
        #cookie-banner-lgpd a { color: #559bff !important; }
        .regua-de-cotacao-section__carousel__item-value { color: #e8e8e8 !important; }
        .highlight, .highlighted {
            color: inherit !important;
            background: transparent !important;
            box-shadow: none !important;
        }
        #next-article, #next-article .next-article__wrapper,
        #next-article .next-article__wrapper-header,
        #next-article .next-article__text__container {
            background-color: #151515 !important;
            color: #e8e8e8 !important;
            border-color: transparent !important;
            box-shadow: none !important;
        }
        #next-article .next-article__wrapper-header-title { color: #a8a8a8 !important; }
        #next-article .next-article__wrapper-header-button-close { background: transparent !important; }
        body.multicontent .content-text a, #next-article a { color: #559bff !important; }
        body.multicontent .content-text .highlight.highlighted {
            color: #e8e8e8 !important;
            background: transparent !important;
        }
        .bstn-hl-mainitem { background: transparent !important; }
        .bstn-hl-relateds, .bstn-hl-relateditem { background: transparent !important; }
        .bstn-hl.no-photo .bstn-hl-title, .bstn-hl.no-photo .bstn-hl-summary {
            color: #e8e8e8 !important;
            background: transparent !important;
        }
        input, textarea, select, button { color-scheme: dark; }
        /* Hide Globo's ad wrappers, including empty slots that leave a large blank rectangle. */
        .publicidade, [class~="publicidade"], .tag-manager-publicidade-container,
        .regua-de-cotacao-section__ad-card, .banner-ad-skeleton-box,
        [id^="banner_slb_"], glb-ad, [data-position^="banner_slb_"],
        .row:has(> .publicidade), .row:has(.publicidade-banner_slb_topo),
        [data-ad], [data-ad-unit], [data-testid*="advert" i],
        [id^="ad-"], [id^="ads-"], [id*="advert" i],
        [class^="ad-"], [class*=" ad-"], [class*="advert" i],
        iframe[src*="doubleclick"], iframe[src*="googlesyndication"] { display: none !important; }
        /* Keep GE's masthead in the requested green against the dark theme. */
        .globo-clean-ge header, .globo-clean-ge .header-principal,
        .globo-clean-ge .header-navegacao, .globo-clean-ge .header-navegacao-container,
        .globo-clean-ge [class*="header-principal"], .globo-clean-ge [class*="header-navegacao"] {
            background-color: #05883a !important;
            color: #f1f5f2 !important;
        }
        .globo-clean-ge [class*="eventCard"] {
            background-color: #151515 !important;
            border-color: transparent !important;
            box-shadow: none !important;
        }
        .globo-clean-ge [class*="eventCard"] :not(svg):not(svg *) {
            color: #e8e8e8 !important;
        }
        /* Keep the GE hero's text directly over the image, without label blocks. */
        .globo-clean-ge .bstn-hl-title,
        .globo-clean-ge .wrapper-poster-title,
        .globo-clean-ge .wrapper-poster-title :is(h1, h2, h3, a, span),
        .globo-clean-ge .bstn-hl-title::before,
        .globo-clean-ge .bstn-hl-title::after,
        .globo-clean-ge .wrapper-poster-title::before,
        .globo-clean-ge .wrapper-poster-title::after {
            background-color: transparent !important;
            box-shadow: none !important;
        }
        /* Normalize site text on dark surfaces, then restore legible brand accents below. */
        body:not(.multicontent) :not(.clappr-player):not(.clappr-player *),
        body.multicontent :not(.clappr-player):not(.clappr-player *) {
            color: #e8e8e8 !important;
        }
        body:not(.multicontent) .feed-post-link.gui-color-primary,
        body:not(.multicontent) .feed-post-link.gui-color-primary *,
        body:not(.multicontent) .glb-apc-bar-central_button-label,
        body:not(.multicontent) .multi_signatures,
        body:not(.multicontent) .mais-lidas__card-title {
            color: #ff5549 !important;
        }
        body:not(.multicontent) .bstn-hl-link.bstn-related,
        body:not(.multicontent) .bstn-hl-link.bstn-related::before,
        body:not(.multicontent) .bstn-hl-link.bstn-related::after,
        body.multicontent .bstn-hl-link.bstn-related,
        body.multicontent .bstn-hl-link.bstn-related::before,
        body.multicontent .bstn-hl-link.bstn-related::after {
            background: transparent !important;
            box-shadow: none !important;
        }
        html.globo-clean-ge .feed-post-link.gui-color-primary,
        html.globo-clean-ge .feed-post-link.gui-color-primary * {
            color: #20d982 !important;
        }
        body:has(.header-g1) .header-principal,
        body:has(.header-g1) .header-navegacao,
        body.multicontent .header-principal,
        body.multicontent .header-navegacao {
            background-color: #c4170c !important;
        }
        body.multicontent .mc-bottom {
            background-color: #151515 !important;
            border-color: transparent !important;
            box-shadow: none !important;
        }
        body.multicontent .entities__list-itemLink {
            background-color: #242424 !important;
            border-color: transparent !important;
            box-shadow: none !important;
        }
        body .bstn-fd-item-cover {
            background-color: #202020 !important;
        }
        .menu-container :is(.menu-btn-back, .menu-submenu-title) {
            background-color: #151515 !important;
            border-color: transparent !important;
        }
        html.globo-clean-ge .post-bastian-products.post-tabela-classificacao,
        html.globo-clean-ge .post-tabela-classificacao :not(svg):not(svg *),
        html.globo-clean-ge card-meu-time-v2,
        html.globo-clean-ge card-meu-time-v2 :not(svg):not(svg *),
        html.globo-clean-ge [class*="ge-mosaic-wrapper__card-meu-time-v2"],
        html.globo-clean-ge [class*="ge-mosaic-wrapper__card-meu-time-v2"] :not(svg):not(svg *),
        html.globo-clean-ge [class*="ge-tabs-wrapper__card-meu-time-v2"],
        html.globo-clean-ge [class*="ge-tabs-wrapper__card-meu-time-v2"] :not(svg):not(svg *) {
            background-color: #151515 !important;
            color: #e8e8e8 !important;
            border-color: transparent !important;
            box-shadow: none !important;
        }
        body.multicontent .live-indicator {
            background-color: #c4170c !important;
        }
        body.multicontent .clappr-player .codex-button--main-floating,
        body.multicontent .clappr-player .codex-button--main-floating * {
            color: #fff !important;
        }
        regua-de-jogos .reguaJogos__wrapper > div > div:first-child {
            background-image: none !important;
        }
        regua-de-jogos .reguaJogos__wrapper > div > div:last-child {
            background-image: none !important;
        }
        body.multicontent .content-text a:not(.clappr-player *),
        body.multicontent #next-article a {
            color: #559bff !important;
        }
        body.multicontent .multi_signatures { color: #ff5549 !important; }
        /* Replace pale loading placeholders and the white favorite-team prompt. */
        .glb-skeleton-box {
            background-color: #202020 !important;
            background-image: none !important;
            box-shadow: none !important;
        }
        html.globo-clean-ge .ct-escolha-time {
            background-color: #202020 !important;
            border-color: transparent !important;
            box-shadow: none !important;
            color: #e8e8e8 !important;
        }
        html.globo-clean-ge .ct-escolha-time :not(svg):not(svg *),
        html.globo-clean-ge .ct-escolha-time .time-btn:not(.btn-sim) {
            background-color: transparent !important;
            border-color: transparent !important;
            color: #e8e8e8 !important;
            box-shadow: none !important;
        }
        html.globo-clean-ge .ct-escolha-time .time-btn:not(.btn-sim) {
            background-color: #303030 !important;
        }
        /* The exact brand green is retained; white text meets contrast on it. */
        html.globo-clean-ge body:not(.clappr-player) :is(
            header, .header-principal, .header-navegacao,
            .header-navegacao-container, .gui-color-primary-bg, .footer
        ),
        html.globo-clean-ge body:not(.clappr-player) :is(
            header, .header-principal, .header-navegacao,
            .header-navegacao-container, .gui-color-primary-bg, .footer
        ) :not(svg):not(svg *) {
            color: #fff !important;
        }
        html.globo-clean-ge .gui-color-primary-bg,
        html.globo-clean-ge .footer.theme-bg-color-primary {
            background-color: #05883a !important;
        }
        html.globo-clean-ge body:not(.clappr-player) .bsnt-trending-video-flag {
            background-color: #b00000 !important;
            color: #fff !important;
        }
        /* Preserve Globo.com's editorial color coding on dark backgrounds. */
        html.globo-clean-globo body.pages .header-title.homeui-tc-jornalismo { color: #ff5549 !important; }
        html.globo-clean-globo body.pages .header-title.homeui-tc-esporte { color: #20d982 !important; }
        html.globo-clean-globo body.pages .header-title.homeui-tc-entretenimento,
        html.globo-clean-globo body.pages .header-title.homeui-tc-cartola { color: #ff8a00 !important; }
        html.globo-clean-globo body.pages .header-title.homeui-tc-globoplay { color: #ff4d75 !important; }
        html.globo-clean-globo body.pages .header-title.homeui-tc-oglobo { color: #6797ff !important; }
        html.globo-clean-globo body.pages .header-title.homeui-tc-valor { color: #24d6d6 !important; }
        html.globo-clean-globo body.pages .header-title.homeui-tc-receitas { color: #df62d0 !important; }
        html.globo-clean-globo body.pages .header-title.homeui-tc-quem { color: #ff4d9d !important; }
        html.globo-clean-globo body.pages .header-title.homeui-tc-globopop2 { color: #fff !important; }
        html.globo-clean-globo body.pages .theme-jornalismo:not(.post-main) .post__title,
        html.globo-clean-globo body.pages .economy-widget__title--text { color: #ff5549 !important; }
        html.globo-clean-globo body.pages .theme-esportes .post__title,
        html.globo-clean-globo body.pages .theme-esporte .title-headline--text span,
        html.globo-clean-globo body.pages .championship-schedule__title,
        html.globo-clean-globo body.pages .championship-schedule__footer-cta--text { color: #20d982 !important; }
        html.globo-clean-globo body.pages .theme-entretenimento .post__title,
        html.globo-clean-globo body.pages .theme-entretenimento .title-headline--text span,
        html.globo-clean-globo body.pages .horoscope__title--text,
        html.globo-clean-globo body.pages .horoscope__complete-cta--text { color: #ff8a00 !important; }
        html.globo-clean-globo body.pages .theme-jornalismo .title-headline--text span,
        html.globo-clean-globo body.pages .widget-economia .economy-widget__title--text { color: #ff5549 !important; }
        html.globo-clean-globo body.pages .franja-container.bem-estar .franja-headline--text span,
        html.globo-clean-globo body.pages .franja-container.bem-estar .post__title { color: #24d6d6 !important; }
        html.globo-clean-globo body.pages .franja-container.brand .franja-headline--text span,
        html.globo-clean-globo body.pages .franja-container.brand .post__title,
        html.globo-clean-globo body.pages .logo__text { color: #579bff !important; }
        html.globo-clean-globo body.pages .franja-container.cultura .franja-headline--text span,
        html.globo-clean-globo body.pages .franja-container.cultura .post__title { color: #ff5549 !important; }
        html.globo-clean-globo body.pages .currency-pctchng.down { color: #ff5549 !important; }
        html.globo-clean-globo body.pages .currency-pctchng.up { color: #20d982 !important; }
        html.globo-clean-globo body.pages .header-wrapper-programacao,
        html.globo-clean-globo body.pages .footer_links {
            background-color: #151515 !important;
            border-color: transparent !important;
            box-shadow: none !important;
        }
        html.globo-clean-globo body.pages .button-programacao,
        html.globo-clean-globo body.pages .button.offer-know-more,
        html.globo-clean-globo body.pages .economy-widget__currencies-content--currency-value {
            background-color: #303030 !important;
            border-color: transparent !important;
            box-shadow: none !important;
            color: #e8e8e8 !important;
        }
        html.globo-clean-globo body.pages .header-wrapper-programacao__title,
        html.globo-clean-globo body.pages .card-programacao__category,
        html.globo-clean-globo body.pages .card-programacao__time { color: #35baff !important; }
        html.globo-clean-globo body.pages .card-programacao__category {
            background-color: #242424 !important;
            border-color: transparent !important;
        }
        html.globo-clean-globo body.pages .wrapper.theme-jornalismo.has-image-highlight .post__link,
        html.globo-clean-globo body.pages .column-container-jornalismo .more-container {
            background-color: #8a1710 !important;
        }
        html.globo-clean-globo body.pages .wrapper.theme-esporte.has-image-highlight .post__link,
        html.globo-clean-globo body.pages .column-container-esporte .more-container {
            background-color: #056533 !important;
        }
        html.globo-clean-globo body.pages .wrapper.theme-entretenimento.has-image-highlight .post__link,
        html.globo-clean-globo body.pages .column-container-entretenimento .more-container {
            background-color: #a34800 !important;
        }
        html.globo-clean-globo body.pages .wrapper.theme-jornalismo.has-image-highlight .post__title,
        html.globo-clean-globo body.pages .wrapper.theme-esporte.has-image-highlight .post__title,
        html.globo-clean-globo body.pages .wrapper.theme-entretenimento.has-image-highlight .post__title,
        html.globo-clean-globo body.pages .column-container-jornalismo .more-container__link,
        html.globo-clean-globo body.pages .column-container-esporte .more-container__link,
        html.globo-clean-globo body.pages .column-container-entretenimento .more-container__link {
            color: #fff !important;
        }
        html.globo-clean-globo body.pages .card-programacao__label { background-color: #b00024 !important; }
        html.globo-clean-globo body.pages .destaque-trilho-headline--desktop-button {
            background-color: #454b5c !important;
            color: #fff !important;
        }
        html.globo-clean-globo .post__mark.is-live .post__mark--wrapper {
            background-color: #b00024 !important;
            color: #fff !important;
        }
        html.globo-clean-globo .post__mark.is-live .post__mark--title {
            color: #fff !important;
        }
        /* Gshow dark surfaces, with its orange masthead and editorial highlights intact. */
        html.globo-clean-gshow body,
        html.globo-clean-gshow #glb-main-home,
        html.globo-clean-gshow .glb-grid {
            background-color: #151515 !important;
            color: #e8e8e8 !important;
        }
        html.globo-clean-gshow .glbbarrawidget {
            background-color: #151515 !important;
            color: #e8e8e8 !important;
        }
        html.globo-clean-gshow .cxm-header {
            background-color: #c94b00 !important;
            color: #fff !important;
        }
        html.globo-clean-gshow .cxm-header :not(svg):not(svg *),
        html.globo-clean-gshow .cxm-header button {
            color: #fff !important;
        }
        html.globo-clean-gshow .cxm-header button {
            background-color: transparent !important;
            border-color: transparent !important;
            box-shadow: none !important;
        }
        html.globo-clean-gshow .cxm-menu-navigation__rounder,
        html.globo-clean-gshow .cxm-menu-navigation__panel,
        html.globo-clean-gshow .cxm-menu-navigation__list {
            background-color: #151515 !important;
            border-color: transparent !important;
            box-shadow: none !important;
        }
        html.globo-clean-gshow .cxm-menu-navigation__item-name,
        html.globo-clean-gshow .cxm-menu-navigation__item-btn {
            color: #e8e8e8 !important;
        }
        html.globo-clean-gshow .cxm-menu-navigation__separator {
            border-color: #303030 !important;
        }
        html.globo-clean-gshow .destaque__container {
            background-color: transparent !important;
            box-shadow: none !important;
        }
        html.globo-clean-gshow .highlight-line {
            color: #fff !important;
            box-shadow: none !important;
        }
        html.globo-clean-gshow .pirulito__container,
        html.globo-clean-gshow .pirulito__wrapper--center {
            color: #e8e8e8 !important;
        }
        /* G1 sidebar links use the newsroom red; feed separators stay subtle. */
        body:has(.header-g1) .post-agrupador-materia a.gui-color-primary,
        body:has(.header-g1) .post-agrupador-materia a.gui-color-primary *,
        body:has(.header-g1) .post-bastian-products.post-mais-lidas a,
        body:has(.header-g1) .post-bastian-products.post-mais-lidas a * {
            color: #ff5549 !important;
        }
        body:has(.header-g1) .feed-post.bstn-item-shape.type-materia::after {
            background-color: #303030 !important;
            border-color: #303030 !important;
        }
    `;

    function styleGloboBar() {
        const shadow = document.querySelector('nova-barra-globocom')?.shadowRoot;
        if (!shadow || shadow.getElementById('globo-clean-bar-style')) return;
        const barStyle = document.createElement('style');
        barStyle.id = 'globo-clean-bar-style';
        barStyle.textContent = `
            a[href="https://www.globo.com/"] { color: #579bff !important; --link-logo-hover-border-color: #579bff !important; }
            a[href="https://g1.globo.com/"], a[href*="g1.globo.com/jogos"] { color: #ff5549 !important; --link-logo-hover-border-color: #ff5549 !important; }
            a[href="https://ge.globo.com/"] { color: #20d982 !important; --link-logo-hover-border-color: #20d982 !important; }
            a[href^="https://gshow.globo.com/"] { color: #ff8a00 !important; --link-logo-hover-border-color: #ff8a00 !important; }
            a[href^="https://globoplay.globo.com/"] { color: #ff4d75 !important; --link-logo-hover-border-color: #ff4d75 !important; }
            a[href^="https://cartola.globo.com/"] { color: #ff8a00 !important; --link-logo-hover-border-color: #ff8a00 !important; }
            a[href*="globopop"] { color: #fff !important; --link-logo-hover-border-color: #fff !important; }
            a[href^="https://oglobo.globo.com/"] { color: #6797ff !important; --link-logo-hover-border-color: #6797ff !important; }
            a[href^="https://receitas.globo.com/"] { color: #df62d0 !important; --link-logo-hover-border-color: #df62d0 !important; }
            a[href^="https://redeglobo.globo.com/"] { color: #35baff !important; --link-logo-hover-border-color: #35baff !important; }
            a[href^="https://valor.globo.com/"] { color: #24d6d6 !important; --link-logo-hover-border-color: #24d6d6 !important; }
            a.link-logo:focus-visible { outline: 2px solid #fff; outline-offset: -3px; }
        `;
        shadow.append(barStyle);
    }

    function installStyle() {
        if (document.getElementById('globo-clean-style')) return;
        if (location.hostname === 'ge.globo.com') document.documentElement.classList.add('globo-clean-ge');
        if (location.hostname === 'globo.com' || location.hostname === 'www.globo.com') {
            document.documentElement.classList.add('globo-clean-globo');
        }
        if (location.hostname === 'gshow.globo.com') document.documentElement.classList.add('globo-clean-gshow');
        const style = document.createElement('style');
        style.id = 'globo-clean-style';
        style.textContent = css;
        (document.head || document.documentElement)?.append(style);
        styleGloboBar();
        new MutationObserver(styleGloboBar).observe(document.documentElement, { childList: true, subtree: true });
    }

    if (document.documentElement) installStyle();
    else new MutationObserver((_, observer) => {
        if (!document.documentElement) return;
        observer.disconnect();
        installStyle();
    }).observe(document, { childList: true });
})();
