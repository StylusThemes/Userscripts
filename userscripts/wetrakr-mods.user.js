// ==UserScript==
// @name          WeTrakr - Mods
// @version       1.11.0
// @description   Modifications and enhancements for WeTrakr
// @author        Journey Over
// @license       MIT
// @match         *://wetrakr.com/*
// @require       https://cdn.jsdelivr.net/gh/StylusThemes/Userscripts@9e8f1b9bdc1acac2e76f3e8d2348f76817ec5bf4/libs/utils/utils.min.js
// @require       https://cdn.jsdelivr.net/gh/StylusThemes/Userscripts@644b86d55bf5816a4fa2a165bdb011ef7c22dfe1/libs/metadata/anilist/anilist.min.js
// @require       https://cdn.jsdelivr.net/gh/StylusThemes/Userscripts@644b86d55bf5816a4fa2a165bdb011ef7c22dfe1/libs/metadata/armhaglund/armhaglund.min.js
// @grant         GM_addStyle
// @grant         GM_xmlhttpRequest
// @grant         GM_getValue
// @grant         GM_setValue
// @grant         GM_registerMenuCommand
// @icon          https://www.google.com/s2/favicons?sz=64&domain=wetrakr.com
// @homepageURL   https://github.com/StylusThemes/Userscripts
// @downloadURL   https://github.com/StylusThemes/Userscripts/raw/main/userscripts/wetrakr-mods.user.js
// @updateURL     https://github.com/StylusThemes/Userscripts/raw/main/userscripts/wetrakr-mods.user.js
// ==/UserScript==

(function() {
  'use strict';

  const logger = Logger('WeTrakr - Mods', { debug: false });
  const anilist = new AniList();
  const armhaglund = new ArmHaglund();

  // ==========================================
  // CSS Styles
  // ==========================================
  GM_addStyle(`
    /* ========================================================================== */
    /* Global                                                                     */
    /* ========================================================================== */

    /* ===== Square Everything ===== */
    * { border-radius: 0 !important; }

    /* ===== Progress Ring ===== */
    /* Hide the circular progress ring on the avatar because it clashes with the square theme */
    svg.ring { display: none !important; }

    /* ===== Actor Credit Bar ===== */
    .media-item__sort-badge { background: #6B3041 !important; }

    /* ========================================================================== */
    /* Detail Pages                                                               */
    /* ========================================================================== */

    /* ===== Shared ===== */
    /* Hide "share" button */
    .title-share { display: none !important; }
    /* Keep previous and next pager links limited to their visible content  */
    .detail-pager--simple .detail-pager__simple-side { width: fit-content !important; flex: 0 0 auto !important; justify-self: auto !important; }
    .detail-pager--simple .detail-pager__simple-side--prev { justify-self: end !important; }
    .detail-pager--simple .detail-pager__simple-side--next { justify-self: start !important; }
    /* Reduce the gap below the pager */
    .detail-title-pager { margin-bottom: 20px !important; }
    /* Hide the "still ongoing" hint and its remove-all-watched toggle shown for ongoing shows */
    .watching-details--all-watched { display: none !important; }
    /* Director + Creator */
    .detail-grid__info .detail-overview-block .detail-directed-by { margin-bottom: 20px !important; }
    .detail-grid__info .detail-overview-block .we-text-body.detail-directed-by { font-weight: 700; }
    .detail-grid__info .detail-overview-block .we-text-body.detail-directed-by a.we-link-body { font-weight: 400; text-decoration: none; }
    .detail-grid__info .detail-overview-block .we-text-body.detail-directed-by a.we-link-body:hover { color: #8283ff; }
    .detail-grid__info .detail-overview-block .we-text-body.detail-directed-by a.we-link-body:first-of-type { margin-left: 4px; }
    /* Remove backgrounds on info items */
    .detail-grid--person [class="detail-status-line"] .detail-status-badge, [class="detail-grid"] .detail-status-line.detail-meta-line .detail-status-badge, .detail-status-line.detail-meta-row .detail-status-badge { background: none !important; padding: 0px !important; }
    .detail-grid--person [class="detail-status-line"] .detail-status-badge + .detail-status-badge::before, [class="detail-grid"] .detail-status-line.detail-meta-line .detail-status-badge + .detail-status-badge::before, .detail-status-line.detail-meta-row .detail-status-badge + .detail-status-badge::before { content: "∙"; margin: 0 10px 0 4px; font-weight: bold; }
    /* Add background on tag buttons */
    .detail-status-badge--genre { text-decoration: none !important; background: #ffffff30 !important; padding: 3px 10px !important; margin: 0 6px 0px 0 !important; }
    /* Spacing for ratings element */
    .detail-info-stats { margin-top: 15px; height: 40px; }
    /* 'See more' link [Actor / Show] */
    .overview-toggle .see-toggle { display: block; margin: 12px 0 0px 0; }
    .overview-toggle .see-toggle::first-letter { text-transform: uppercase; }
    .overview-toggle .see-toggle::after { content: "➜"; }

    /* ===== Title Stack: Actor ===== */
    /* Remove margin on the department badge (e.g., "Acting") next to name */
    .detail-grid--person .person-badge-department { margin-left: 0px !important; }
    /* Hide 'rate now' button */
    .detail-grid--person .detail-info-stats { display: none; }

    /* ===== Title Stack: Movies + Shows ===== */
    [class="detail-grid"] .title-stack { display: flex; flex-direction: column; }
    /* Airing badge clone: first, own line, above h1 */
    [class="detail-grid"] .title-stack .detail-status-badge.rs-clone { order: 0; width: fit-content; margin-bottom: 8px; }
    /* Title: second */
    [class="detail-grid"] .title-stack .we-heading-1 { order: 1; display: unset !important; font-size: 26px; }
    /* Date, seasons, episodes, and runtime line: third */
    [class="detail-grid"] .title-stack .detail-status-line.detail-meta-line { order: 2; margin-bottom: var(--space-2); }
    /* Genre line with hidden airing badge: fourth, below meta line */
    [class="detail-grid"] .title-stack .detail-status-line:not(.detail-meta-line) { order: 3; }

    /* ===== Dub Information ===== */
    .detail-meta-box .rs-dub-info { display: flex; flex-direction: row; align-items: baseline; justify-content: space-between; gap: var(--space-3); padding: var(--space-4) var(--space-4); }
    .detail-meta-box .rs-dub-info .detail-meta-box__label { display: flex; align-items: center; gap: var(--space-2); flex-shrink: 0; font-size: var(--font-size-0); font-weight: 600; color: #fff; letter-spacing: 0.04em; line-height: 1.4; margin: 0; }
    .detail-meta-box .rs-dub-info .detail-meta-box__value { font-size: var(--font-size-0); font-weight: 400; color: #96a4af; line-height: 1.4; text-align: right; margin: 0; min-width: 0; overflow-wrap: anywhere; word-break: break-word; }

    /* ========================================================================== */
    /* Reviews                                                                    */
    /* ========================================================================== */

    /* ===== Review Controls ===== */
    /* Change the "Add New" text color to match "Top" */
    .reviews-section__add-btn { color: #96a4af !important; }

    /* ===== Review Card ===== */
    /* Give every review a visible containing shape so the author, text, pills, and Reply action clearly belong to one card */
    we-review-card { display: block !important; background: rgba(255, 255, 255, 0.03) !important; border: 1px solid #2d2d48 !important; margin-bottom: 16px !important; padding: 16px !important; transition: border-color 0.15s !important; }
    .review-card:not(.review-card--reply) { background: unset !important; }
    /* Tighten the gap between the profile picture and rating and slightly reduce the rating font size */
    .review-card__rating { margin-top: 0 !important; font-size: 13px !important; }
    /* Slightly reduce the font size of the author name, date, and handle */
    .review-card__author-name, .review-card__date, .review-card__handle { font-size: 13px !important; }
    /* Match the reaction and reply pill text color to the other pills */
    .review-card__reaction-pill, .review-card__view-replies { color: #96a4af !important; }

    /* ===== Review Text ===== */
    /* Slightly darken the text instead of using pure white */
    .review-card__text { color: #cacdd1 !important; }
    /* Make long reviews scrollable instead of clamping them. Short reviews are unaffected since they never exceed the cap */
    .review-card__text--clamp, .review-card__text--highlight { display: block !important; -webkit-line-clamp: unset !important; max-height: 360px !important; overflow-y: auto !important; scrollbar-width: thin; scrollbar-color: #333348 transparent; padding-right: 6px; }
    .review-card__text--clamp::-webkit-scrollbar, .review-card__text--highlight::-webkit-scrollbar { width: 6px; }
    .review-card__text--clamp::-webkit-scrollbar-track, .review-card__text--highlight::-webkit-scrollbar-track { background: transparent; }
    .review-card__text--clamp::-webkit-scrollbar-thumb, .review-card__text--highlight::-webkit-scrollbar-thumb { background: #333348; }
    /* Hide the site's "Read More" button now that long reviews scroll instead */
    .review-card__readmore { display: none !important; }
    /* Keep spoiler and non-spoiler review text at the same size */
    .review-card__text, .review-card__text we-spoiler-text { font-size: 14px !important; }

    /* ========================================================================== */
    /* Media Items                                                                */
    /* ========================================================================== */

    /* ===== Hover Border ===== */
    /* Remove the default hover border overlays */
    .media-item__border-overlay, .episode-item__border-overlay { display: none !important; }

    /* ===== Upcoming Section ===== */
    /* Hide upcoming items without a progress bar, such as already-watched episodes */
    #upcoming we-item-poster:not(:has(.media-item__progress)) { display: none !important; }

    /* ===== Release / Watched Date ===== */
    /* Keep the eye icon, date, and time on one line to prevent wrapping and misalignment on narrow cards */
    .entity-release-date .wd-full { flex-wrap: unset !important; }

    /* ===== Empty Cards ===== */
    /* Hide empty placeholder cards */
    [class="we-empty-card"] { display: none; }
    /* Restore the tracking layout to prevent a large gap between the tabs and Watching */
    [class="tracking-layout"] { display: unset !important; }

    /* ========================================================================== */
    /* Navigation + Menus                                                         */
    /* ========================================================================== */

    /* ===== Profile Menu Overflow ===== */
    /* Allow profile menu content to overflow horizontally when needed */
    .profile-menu .profile-menu-content { overflow-x: unset !important; }

    /* ===== Profile Header Toggle ===== */
    /* Hide the profile header toggle */
    .profile-menu .profile-header-toggle { display: none !important; }

    /* ========================================================================== */
    /* Settings Modal                                                             */
    /* ========================================================================== */

    /* ===== Modal Overlay ===== */
    .rs-settings-overlay { position: fixed; inset: 0; z-index: 10000; display: flex; align-items: center; justify-content: center; background: rgba(0, 0, 0, 0.6); font-family: 'Proxima Nova', 'Open Sans', Arial, sans-serif; animation: rs-overlay-in 0.2s ease-out; }
    @keyframes rs-overlay-in { from { opacity: 0; } }

    /* ===== Modal Panel ===== */
    .rs-settings-modal { width: 480px; max-width: 90vw; max-height: 85vh; display: flex; flex-direction: column; overflow: hidden; background: #1e1e2e; color: #e0e0e0; border: 1px solid #2d2d48; box-shadow: 0 24px 64px rgba(0, 0, 0, 0.5), 0 0 0 1px rgba(73, 55, 233, 0.08); animation: rs-modal-in 0.25s ease-out; }
    .rs-settings-modal::before { content: ""; display: block; height: 2px; flex-shrink: 0; background: #4937e9; }
    @keyframes rs-modal-in { from { opacity: 0; transform: translateY(10px); } }

    /* ===== Modal Header ===== */
    .rs-settings-header { display: flex; justify-content: space-between; align-items: center; padding: 18px 22px; border-bottom: 1px solid #2d2d48; background: linear-gradient(180deg, rgba(73, 55, 233, 0.08) 0%, transparent 100%); }
    .rs-settings-header h2 { margin: 0; font-size: 16px; font-weight: 700; letter-spacing: 0.3px; }
    .rs-settings-close { width: 28px; height: 28px; display: flex; align-items: center; justify-content: center; background: none; border: 1px solid transparent; color: #666680; font-size: 20px; line-height: 1; cursor: pointer; transition: color 0.15s, border-color 0.15s, background 0.15s; }
    .rs-settings-close:hover { color: #e0e0e0; border-color: #2d2d48; background: rgba(255, 255, 255, 0.03); }

    /* ===== Modal Body ===== */
    .rs-settings-body { padding: 20px 22px; overflow-y: auto; scrollbar-width: thin; scrollbar-color: #333348 transparent; }
    .rs-settings-body::-webkit-scrollbar { width: 6px; }
    .rs-settings-body::-webkit-scrollbar-track { background: transparent; }
    .rs-settings-body::-webkit-scrollbar-thumb { background: #333348; }
    .rs-settings-body h3 { margin: 0 0 10px; padding-bottom: 8px; font-size: 11px; font-weight: 700; letter-spacing: 1px; text-transform: uppercase; color: #4937e9; border-bottom: 1px solid #2d2d48; }
    .rs-settings-body h3:not(:first-child) { margin-top: 22px; }

    /* ===== Settings Rows ===== */
    .rs-settings-row { display: flex; justify-content: space-between; align-items: center; gap: 16px; padding: 10px 12px; background: rgba(255, 255, 255, 0.015); border: 1px solid #2d2d48; transition: border-color 0.15s; }
    .rs-settings-row:hover { border-color: #3d3d58; }
    .rs-settings-row + .rs-settings-row { margin-top: 6px; }
    .rs-settings-row strong { display: block; font-size: 13px; font-weight: 600; color: #e8e8f0; }
    .rs-settings-row small { display: block; margin-top: 2px; color: #8888a8; font-size: 11.5px; }

    /* ===== Toggle Switch ===== */
    .rs-settings-toggle { width: 40px; height: 22px; flex-shrink: 0; appearance: none; position: relative; background: #333348; cursor: pointer; transition: background 0.2s; }
    .rs-settings-toggle::before { content: ""; position: absolute; top: 3px; left: 3px; width: 16px; height: 16px; background: #666680; transition: transform 0.2s, background 0.2s; }
    .rs-settings-toggle:checked { background: #4937e9; }
    .rs-settings-toggle:checked::before { transform: translateX(18px); background: #fff; }

    /* ===== Select Menu ===== */
    .rs-settings-row select { flex-shrink: 0; padding: 7px 28px 7px 10px; background: #262640; color: #e0e0e0; border: 1px solid #2d2d48; font-size: 12.5px; outline: none; cursor: pointer; transition: border-color 0.15s; appearance: none; background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12'%3E%3Cpath d='M3 4.5L6 7.5L9 4.5' stroke='%238888a8' fill='none' stroke-width='1.5'/%3E%3C/svg%3E"); background-repeat: no-repeat; background-position: right 8px center; }
    .rs-settings-row select:focus { border-color: #4937e9; }

    /* ===== Colour Grid ===== */
    .rs-color-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
    .rs-color-card { display: flex; flex-direction: column; background: rgba(255, 255, 255, 0.015); border: 1px solid #2d2d48; cursor: pointer; transition: border-color 0.15s; overflow: hidden; }
    .rs-color-card:hover { border-color: #3d3d58; }
    .rs-color-swatch { width: 100%; height: 32px; padding: 0; border: none; display: block; cursor: pointer; background: none; }
    .rs-color-swatch::-webkit-color-swatch-wrapper { padding: 0; }
    .rs-color-swatch::-webkit-color-swatch { border: none; }
    .rs-color-swatch::-moz-color-swatch { border: none; }
    .rs-color-card-info { padding: 8px 10px; }
    .rs-color-card-info strong { display: block; font-size: 12.5px; font-weight: 600; color: #e8e8f0; line-height: 1.3; }
    .rs-color-card-info small { display: block; margin-top: 1px; font-size: 10.5px; color: #8888a8; line-height: 1.3; }

    /* ===== Modal Footer ===== */
    .rs-settings-footer { display: flex; justify-content: space-between; align-items: center; padding: 14px 22px; border-top: 1px solid #2d2d48; background: rgba(0, 0, 0, 0.15); }
    .rs-settings-footer-group { display: flex; gap: 8px; }

    /* ===== Footer Buttons ===== */
    .rs-settings-btn { padding: 8px 18px; border: none; font-size: 13px; font-weight: 600; cursor: pointer; transition: background 0.15s, color 0.15s, border-color 0.15s; }
    .rs-settings-btn--ghost { background: transparent; color: #8888a8; border: 1px solid #2d2d48; }
    .rs-settings-btn--ghost:hover { background: rgba(255, 255, 255, 0.03); color: #e0e0e0; border-color: #3d3d58; }
    .rs-settings-btn--primary { background: #4937e9; color: #fff; }
    .rs-settings-btn--primary:hover { background: #5a4bf1; }
  `);

  // ==========================================
  // Configuration & Constants
  // ==========================================
  const CONFIG_KEY = 'wetrakr-mods-config';
  const CACHE_KEY = 'wetrakr-mods-cache';
  const CACHE_DURATION = 24 * 60 * 60 * 1000;

  const DUB_LANGUAGES = [
    { name: 'English', value: 'ENGLISH' },
    { name: 'German', value: 'GERMAN' },
    { name: 'Italian', value: 'ITALIAN' },
    { name: 'Spanish', value: 'SPANISH' },
    { name: 'French', value: 'FRENCH' },
    { name: 'Korean', value: 'KOREAN' },
    { name: 'Portuguese', value: 'PORTUGUESE' },
    { name: 'Hebrew', value: 'HEBREW' },
    { name: 'Hungarian', value: 'HUNGARIAN' },
    { name: 'Chinese', value: 'CHINESE' },
    { name: 'Arabic', value: 'ARABIC' },
    { name: 'Filipino', value: 'FILIPINO' },
    { name: 'Catalan', value: 'CATALAN' },
    { name: 'Polish', value: 'POLISH' },
    { name: 'Norwegian', value: 'NORWEGIAN' }
  ];

  const ACTION_COLORS = [
    { key: 'watched', label: 'Watched', hint: 'Mark as watched / Unmark all', default: '#2E6B48' },
    { key: 'waiting', label: 'Waiting', hint: 'Waiting for new episodes', default: '#7D5B2C' },
    { key: 'planning', label: 'Planning', hint: 'Mark as planning', default: '#366B7D' },
    { key: 'favorite', label: 'Favourite', hint: 'Mark as favorite', default: '#895e77' },
    { key: 'addToList', label: 'Add to list', hint: 'Item is in a list', default: '#3B6FB5', extra: 'color: #e9ecf2 !important;' }
  ];
  // Selector lists per colour; backgrounds go through --wt-* variables so live updates never rebuild this CSS.
  const ACTION_COLOR_RULES = {
    watched: '.media-item__action-btn--active[aria-label="Mark as watched"]:not(#tm-date-override), .media-item__action-btn--active[aria-label="Unmark all episodes"]:not(#tm-date-override), .episode-item__action-btn--active[aria-label="Mark as watched"]:not(#tm-date-override)',
    waiting: '.media-item__action-btn--active[aria-label="Waiting for new episodes"]:not(#tm-date-override)',
    planning: '.media-item__action-btn--active[aria-label="Mark as planning"]:not(#tm-date-override)',
    favorite: '.media-item__action-btn--active[aria-label="Mark as favorite"]:not(#tm-date-override)',
    addToList: '.media-item__action-btn[aria-label="Add to list"]:has(.action-btn__count):not(#tm-date-override), .episode-item__action-btn[aria-label="Add to list"]:has(.action-btn__count):not(#tm-date-override)'
  };
  const DEFAULT_ACTION_COLORS = Object.fromEntries(ACTION_COLORS.map(({ key, default: value }) => [key, value]));

  const DEFAULT_CONFIG = { dubInfo: true, dubLanguage: 'ENGLISH' };

  const ModuleConfig = {
    get() {
      const stored = GM_getValue(CONFIG_KEY, {});
      return {
        dubInfo: stored.dubInfo ?? DEFAULT_CONFIG.dubInfo,
        dubLanguage: stored.dubLanguage ?? DEFAULT_CONFIG.dubLanguage,
        actionColors: { ...DEFAULT_ACTION_COLORS, ...(stored.actionColors || {}) }
      };
    },
    set(newConfig) {
      GM_setValue(CONFIG_KEY, newConfig);
    }
  };

  function applyActionColors(config = ModuleConfig.get()) {
    let styleElement = document.getElementById('wetrakr-action-colors');
    if (!styleElement) {
      styleElement = document.createElement('style');
      styleElement.id = 'wetrakr-action-colors';
      document.head.appendChild(styleElement);
      styleElement.textContent = ACTION_COLORS.map(({ key, default: value, extra }) =>
        `${ACTION_COLOR_RULES[key]} { background-color: var(--wt-${key}, ${value}) !important;${extra ? ` ${extra}` : ''} }`
      ).join('\n');
    }

    const colors = config.actionColors;
    for (const { key } of ACTION_COLORS) {
      document.documentElement.style.setProperty(`--wt-${key}`, colors[key]);
    }
  }

  // ==========================================
  // WeTrakr Page Identity
  // ==========================================
  // A cached record represents a WeTrakr title page. The identity is derived
  // solely from the WeTrakr URL, never from external IDs or the title text,
  // so it stays stable regardless of which external IDs happen to be present.
  function getWeTrakrIdentity() {
    const match = location.pathname.match(/^\/(shows|movies)\/(\d+)/);
    if (!match) return null;

    const [, section, id] = match;
    const type = section === 'shows' ? 'show' : 'movie';

    return {
      id: Number(id),
      type,
      key: `${type}:${id}`
    };
  }

  // ==========================================
  // Cache Manager
  // ==========================================
  // Cache shape:
  // {
  //   version: 1,
  //   titles: {
  //     "show:1529301": {
  //       title: "Chainsmoker Cat",
  //       ids: { imdb: "tt39551330", tmdb: 312949, anilist: 207141 },
  //       anilistResolution: { source: "imdb", checkedAt: 1787973058345 },
  //       dubs: { english: { available: true, checkedAt: 1787973058550 } }
  //     }
  //   }
  // }
  function createEmptyCache() {
    return {
      version: 1,
      titles: {}
    };
  }

  function createEmptyTitleRecord() {
    return {
      title: null,
      ids: { imdb: null, tmdb: null, anilist: null },
      dubs: {}
    };
  }

  function isDubEntryValid(entry) {
    return !!entry &&
      typeof entry.available === 'boolean' &&
      typeof entry.checkedAt === 'number' &&
      (Date.now() - entry.checkedAt) < CACHE_DURATION;
  }

  function isAnilistResolutionValid(resolution) {
    return !!resolution &&
      (resolution.source === 'imdb' || resolution.source === 'tmdb') &&
      typeof resolution.checkedAt === 'number' &&
      (Date.now() - resolution.checkedAt) < CACHE_DURATION;
  }

  const ModuleCache = {
    _read() {
      const stored = GM_getValue(CACHE_KEY);
      if (!stored || typeof stored !== 'object' || typeof stored.titles !== 'object' || stored.titles === null) {
        return createEmptyCache();
      }
      return stored;
    },

    _write(cache) {
      GM_setValue(CACHE_KEY, cache);
    },

    // Returns a shallow copy of the full title record, or undefined if none exists.
    getTitle(titleKey) {
      const cache = this._read();
      const record = cache.titles[titleKey];
      return record ? { ...record, ids: { ...record.ids }, dubs: { ...record.dubs } } : undefined;
    },

    // Merges freshly read page metadata (title + external IDs) into the cached record.
    // A direct AniList ID from the page always wins; if it differs from what's cached,
    // the resolution info and all dub results are cleared since they belonged to the
    // previous AniList ID. Absence of a direct AniList ID on the page does NOT erase a
    // previously resolved AniList mapping.
    updateMetadata(titleKey, title, pageIds) {
      const cache = this._read();
      const existing = cache.titles[titleKey];
      const record = existing
        ? { ...existing, ids: { ...existing.ids }, dubs: { ...existing.dubs } }
        : createEmptyTitleRecord();

      let changed = !existing;

      if (title && record.title !== title) {
        record.title = title;
        changed = true;
      }

      if (record.ids.imdb !== pageIds.imdb) {
        record.ids.imdb = pageIds.imdb;
        changed = true;
      }

      if (record.ids.tmdb !== pageIds.tmdb) {
        record.ids.tmdb = pageIds.tmdb;
        changed = true;
      }

      if (pageIds.anilist !== null && record.ids.anilist !== pageIds.anilist) {
        record.ids.anilist = pageIds.anilist;
        record.dubs = {};
        delete record.anilistResolution;
        changed = true;
      }

      if (changed) {
        cache.titles[titleKey] = record;
        this._write(cache);
      }

      return record;
    },

    // Returns: positive integer (valid mapping), null (valid negative mapping),
    // or undefined (missing / expired -- resolution required).
    getResolvedAnilistId(titleKey) {
      const cache = this._read();
      const record = cache.titles[titleKey];
      if (!record) return undefined;

      // A direct AniList ID from WeTrakr (no resolution metadata) never expires.
      if (typeof record.ids.anilist === 'number' && !record.anilistResolution) {
        return record.ids.anilist;
      }

      if (!isAnilistResolutionValid(record.anilistResolution)) return undefined;

      if (record.ids.anilist === null || typeof record.ids.anilist === 'number') {
        return record.ids.anilist;
      }

      return undefined;
    },

    // Stores the outcome of an ArmHaglund resolution (positive integer or null for a
    // valid negative result). Clears cached dub results only when the AniList ID
    // genuinely changed, preserving them when it stayed the same.
    setResolvedAnilistId(titleKey, anilistId, source) {
      const cache = this._read();
      const record = cache.titles[titleKey];
      if (!record) return;

      const previousAnilist = record.ids.anilist;
      record.ids.anilist = anilistId;
      record.anilistResolution = { source, checkedAt: Date.now() };

      if (previousAnilist !== anilistId) {
        record.dubs = {};
      }

      this._write(cache);
    },

    // Returns true/false for a valid cached result, or undefined if missing/malformed/expired.
    getDub(titleKey, language) {
      const cache = this._read();
      const record = cache.titles[titleKey];
      const entry = record?.dubs?.[language.toLowerCase()];
      return isDubEntryValid(entry) ? entry.available : undefined;
    },

    // Only commits the result if the record's currently resolved AniList ID still
    // matches the one the query was made against, avoiding a race with a mapping change.
    setDub(titleKey, anilistId, language, available) {
      if (typeof available !== 'boolean') return;

      const cache = this._read();
      const record = cache.titles[titleKey];
      if (!record || record.ids.anilist !== anilistId) return;

      if (!record.dubs) record.dubs = {};
      record.dubs[language.toLowerCase()] = { available, checkedAt: Date.now() };
      this._write(cache);
    },

    clearExpired() {
      const cache = this._read();
      let changed = false;

      for (const [key, record] of Object.entries(cache.titles)) {
        if (!record || typeof record !== 'object') {
          delete cache.titles[key];
          changed = true;
          continue;
        }

        if (record.dubs && typeof record.dubs === 'object') {
          for (const [language, entry] of Object.entries(record.dubs)) {
            if (!isDubEntryValid(entry)) {
              delete record.dubs[language];
              changed = true;
            }
          }
        } else {
          record.dubs = {};
        }

        // An expired resolution isn't usable for lookups, but the previous AniList ID
        // is intentionally left in place so a refresh can detect if it changes.
        if (record.anilistResolution && !isAnilistResolutionValid(record.anilistResolution) &&
          typeof record.anilistResolution.checkedAt !== 'number') {
          delete record.anilistResolution;
          changed = true;
        }

        const hasIds = !!(record.ids?.imdb || record.ids?.tmdb || typeof record.ids?.anilist === 'number');
        const hasNegativeAnilist = record.ids?.anilist === null && !!record.anilistResolution;
        const hasDubs = record.dubs && Object.keys(record.dubs).length > 0;
        const hasTitle = !!record.title;

        if (!hasIds && !hasNegativeAnilist && !hasDubs && !hasTitle) {
          delete cache.titles[key];
          changed = true;
        }
      }

      if (changed) this._write(cache);
    },

    clearAll() {
      this._write(createEmptyCache());
    }
  };

  // ==========================================
  // Time Formatting Utils
  // ==========================================
  const TimeUtilities = {
    to12Hour(hours, minutes) {
      const period = hours >= 12 ? 'PM' : 'AM';
      const hour12 = hours % 12 || 12;
      return `${hour12}:${String(minutes).padStart(2, '0')} ${period}`;
    },
    convertNode(node) {
      const original = node.textContent;
      const newText = original
        .replace(/(\d{2}\/\d{2}\/\d{4}) \| (\d{2}):(\d{2})(?!\s*[AP]M)/gi, (_, date, hour, minute) => `${date} | ${this.to12Hour(+hour, +minute)}`)
        .replace(/· (\d{2}):(\d{2})(?!\s*[AP]M)/gi, (_, hour, minute) => `· ${this.to12Hour(+hour, +minute)}`)
        .replace(/(\d{1,2})\.(\d{2})\s?(AM|PM)/gi, '$1:$2 $3');

      if (newText !== original) {
        node.textContent = newText;
        return true;
      }
      return false;
    },
  };

  // ==========================================
  // DOM Modification Modules
  // ==========================================
  const DOMModifiers = {
    getVisibleTitleStack() {
      return [...document.querySelectorAll('.title-stack')].find(element => element.offsetParent !== null);
    },

    moveStatusBadge() {
      const titleStack = this.getVisibleTitleStack();
      const h1 = titleStack?.querySelector('.we-heading-1');
      const statusLine = titleStack?.querySelector('.detail-status-line:not(.detail-meta-line)');
      const statusBadge = statusLine?.querySelector(
        '.detail-status-badge--airing:not(.rs-hidden-original):not(.rs-clone), ' +
        '.detail-status-badge--status:not(.rs-hidden-original):not(.rs-clone)'
      );

      if (!titleStack || !h1 || !statusBadge || titleStack.querySelector('.rs-clone')) return;

      statusBadge.classList.add('rs-hidden-original');
      statusBadge.style.display = 'none';

      const clone = statusBadge.cloneNode(true);
      clone.classList.remove('rs-hidden-original');
      clone.classList.add('rs-clone');
      clone.style.display = '';

      titleStack.prepend(clone);
    },

    updateTimestamps() {
      const elements = document.querySelectorAll('.entity-release-date, .detail-status-badge--airing, .media-item__progress-bar-text--episode');
      if (!elements.length) return;

      let converted = 0;
      for (const element of elements) {
        for (const child of element.childNodes) {
          if (child.nodeType === Node.TEXT_NODE && TimeUtilities.convertNode(child)) {
            converted++;
          }
        }
      }
      if (converted) logger.debug(`Converted ${converted} timestamps`);
    },

    expandReviews() {
      const buttons = document.querySelectorAll('.review-card__readmore[aria-expanded="false"]');
      if (!buttons.length) return;
      for (const button of buttons) button.click();
      logger.debug(`Expanded ${buttons.length} review cards`);
    }
  };

  // ==========================================
  // Dub Information Processing
  // ==========================================
  const DubService = {
    hasStarted: false,
    generation: 0,

    isCurrent(generation, route) {
      return generation === this.generation && route === location.pathname;
    },

    getPageTitle() {
      return document.querySelector('.title-stack .we-heading-1 .we-link-none')?.textContent?.trim() || null;
    },

    getExternalIds() {
      const ids = { anilist: null, imdb: null, tmdb: null };
      for (const link of document.querySelectorAll('.detail-tags a.detail-tag')) {
        const href = link.getAttribute('href') || '';

        const anilistMatch = href.match(/anilist\.co\/anime\/(\d+)/);
        if (anilistMatch) ids.anilist = Number(anilistMatch[1]);

        const imdbMatch = href.match(/imdb\.com\/title\/(tt\d+)/);
        if (imdbMatch) ids.imdb = imdbMatch[1];

        const tmdbMatch = href.match(/themoviedb\.org\/(?:movie|tv)\/(\d+)/);
        if (tmdbMatch) ids.tmdb = Number(tmdbMatch[1]);
      }
      return ids;
    },

    async queryAnilistDub(anilistId, language) {
      const query = `
        query($id: Int!, $type: MediaType, $page: Int = 1, $language: StaffLanguage){
          Media(id: $id, type: $type){
            characters(page: $page, sort: [ROLE], role: MAIN){
              edges {
                node{id}
                voiceActors(language: $language){language}
              }
            }
          }
        }
      `;
      const response = await anilist.query(query, {
        id: parseInt(anilistId),
        type: 'ANIME',
        language
      });
      return response.data.Media.characters.edges;
    },

    displayDubInfo(hasDub, language) {
      if (!hasDub) return;
      const metaBox = document.querySelector('.detail-meta-box--desktop');
      if (!metaBox || metaBox.querySelector('.rs-dub-info')) return;

      const languageName = DUB_LANGUAGES.find(lang => lang.value === language)?.name || 'Dub';
      const row = document.createElement('div');
      row.className = 'detail-meta-box__row rs-dub-info';
      row.innerHTML = `<dt class="detail-meta-box__label">Dub</dt><dd class="detail-meta-box__value">${languageName} Dub Exists</dd>`;
      metaBox.appendChild(row);
    },

    async apply(configOverride) {
      // Runs once per page; reset() re-enables it on SPA navigation
      if (this.hasStarted || !document.querySelector('.detail-meta-box--desktop')) return;

      const config = configOverride || ModuleConfig.get();
      if (!config.dubInfo) return;

      const identity = getWeTrakrIdentity();
      if (!identity) return;

      const pageIds = this.getExternalIds();
      // External ID links can sometimes render after the metadata box. Don't lock in a
      // premature "no ID" result; retry on the next DOM update instead.
      if (!pageIds.anilist && !pageIds.imdb && !pageIds.tmdb) return;

      ModuleCache.updateMetadata(identity.key, this.getPageTitle(), pageIds);

      this.hasStarted = true;
      const generation = this.generation;
      const route = location.pathname;

      let anilistId = ModuleCache.getResolvedAnilistId(identity.key);

      if (anilistId === undefined) {
        const record = ModuleCache.getTitle(identity.key);
        const source = record?.ids?.tmdb ? 'tmdb' : (record?.ids?.imdb ? 'imdb' : null);

        if (!source) {
          anilistId = null;
        } else {
          try {
            const lookupValue = source === 'tmdb' ? record.ids.tmdb : record.ids.imdb;
            const data = await armhaglund.fetchIds(source === 'tmdb' ? 'themoviedb' : 'imdb', lookupValue);
            if (!this.isCurrent(generation, route)) return;

            const resolvedId = data?.anilist ? Number(data.anilist) : null;
            ModuleCache.setResolvedAnilistId(identity.key, resolvedId, source);
            anilistId = resolvedId;
          } catch (error) {
            if (!this.isCurrent(generation, route)) return;
            logger.error(`Failed to resolve AniList ID: ${error.message}`);
            this.hasStarted = false;
            return;
          }
        }
      }

      if (!this.isCurrent(generation, route)) return;

      if (!anilistId) {
        logger.warn('No AniList ID available for dub info');
        return;
      }

      const { dubLanguage: language } = config;
      const cachedDub = ModuleCache.getDub(identity.key, language);

      if (cachedDub !== undefined) {
        this.displayDubInfo(cachedDub, language);
        return;
      }

      try {
        const edges = await this.queryAnilistDub(anilistId, language);
        if (!this.isCurrent(generation, route)) return;
        const hasDub = edges.some(edge => edge.voiceActors?.length > 0);
        ModuleCache.setDub(identity.key, anilistId, language, hasDub);
        if (!this.isCurrent(generation, route)) return;
        this.displayDubInfo(hasDub, language);
      } catch (error) {
        if (!this.isCurrent(generation, route)) return;
        // A failed lookup is transient; don't cache it as "no dub" and allow a
        // later retry once the DOM or route changes again.
        logger.error(`Failed to fetch dub info for ${anilistId}: ${error.message}`);
        this.hasStarted = false;
      }
    },

    reset() {
      this.hasStarted = false;
      this.generation++;
      for (const element of document.querySelectorAll('.rs-dub-info')) {
        element.remove();
      }
    }
  };

  // ==========================================
  // Settings UI
  // ==========================================
  const SettingsUI = {
    modal: null,
    isOpen: false,

    close() {
      this.modal?.remove();
      this.modal = null;
      this.isOpen = false;
    },

    // Live preview helpers; none of these touch persistent storage.
    applyColorPreview(config) {
      applyActionColors(config);
    },

    applyDubPreview(config) {
      // Always invalidate any in-flight lookup and clear stale rows.
      DubService.reset();

      if (config.dubInfo) {
        DubService.apply(config);
      }
    },

    open() {
      if (this.modal) return;
      this.isOpen = true;
      const saved = ModuleConfig.get();
      const draft = { ...saved, actionColors: { ...saved.actionColors } };

      const overlay = document.createElement('div');
      overlay.className = 'rs-settings-overlay';
      overlay.innerHTML = `
        <div class="rs-settings-modal" role="dialog" aria-modal="true" aria-label="WeTrakr Mods Settings">
          <div class="rs-settings-header">
            <h2>WeTrakr Mods Settings</h2>
            <button type="button" class="rs-settings-close" aria-label="Close">&times;</button>
          </div>
          <div class="rs-settings-body">
            <h3>Dubbing</h3>
            <label class="rs-settings-row">
              <span>
                <strong>Dub Information</strong>
                <small>Show dub availability for anime shows</small>
              </span>
              <input type="checkbox" class="rs-settings-toggle" id="rs-setting-dub-info" ${draft.dubInfo ? 'checked' : ''}>
            </label>
            <label class="rs-settings-row">
              <span>
                <strong>Preferred Dub Language</strong>
                <small>Language to check for</small>
              </span>
              <select id="rs-setting-dub-language">
                ${DUB_LANGUAGES.map(lang => `<option value="${lang.value}" ${draft.dubLanguage === lang.value ? 'selected' : ''}>${lang.name}</option>`).join('')}
              </select>
            </label>
            <h3>Action Button Colours</h3>
            <div class="rs-color-grid">
              ${ACTION_COLORS.map(color => `
              <label class="rs-color-card">
                <input type="color" class="rs-color-swatch" id="rs-color-${color.key}" value="${draft.actionColors[color.key]}">
                <div class="rs-color-card-info">
                  <strong>${color.label}</strong>
                  <small>${color.hint}</small>
                </div>
              </label>`).join('')}
            </div>
          </div>
          <div class="rs-settings-footer">
            <div class="rs-settings-footer-group">
              <button type="button" class="rs-settings-btn rs-settings-btn--ghost" id="rs-clear-cache">Clear Cache</button>
              <button type="button" class="rs-settings-btn rs-settings-btn--ghost" id="rs-reset">Restore Defaults</button>
            </div>
            <button type="button" class="rs-settings-btn rs-settings-btn--primary" id="rs-save">Save &amp; Close</button>
          </div>
        </div>
      `;

      document.body.appendChild(overlay);
      this.modal = overlay;

      // Closing without saving reverts the preview back to the saved config.
      const cancel = () => {
        this.applyColorPreview(saved);
        this.applyDubPreview(saved);
        this.close();
      };

      overlay.querySelector('.rs-settings-close').addEventListener('click', cancel);
      overlay.addEventListener('click', (event) => {
        if (event.target === overlay) cancel();
      });

      overlay.querySelector('#rs-clear-cache').addEventListener('click', (event) => {
        ModuleCache.clearAll();
        event.target.textContent = 'Cleared!';
        setTimeout(() => { event.target.textContent = 'Clear Cache'; }, 1500);
      });

      // Edits update the draft and preview live, but are not committed until Save & Close.
      overlay.querySelector('#rs-setting-dub-info').addEventListener('change', (event) => {
        draft.dubInfo = event.target.checked;
        this.applyDubPreview(draft);
      });

      overlay.querySelector('#rs-setting-dub-language').addEventListener('change', (event) => {
        draft.dubLanguage = event.target.value;
        this.applyDubPreview(draft);
      });

      for (const { key } of ACTION_COLORS) {
        overlay.querySelector('#rs-color-' + key).addEventListener('input', (event) => {
          draft.actionColors[key] = event.target.value;
          this.applyColorPreview(draft);
        });
      }

      overlay.querySelector('#rs-reset').addEventListener('click', (event) => {
        Object.assign(draft, { ...DEFAULT_CONFIG, actionColors: { ...DEFAULT_ACTION_COLORS } });
        overlay.querySelector('#rs-setting-dub-info').checked = draft.dubInfo;
        overlay.querySelector('#rs-setting-dub-language').value = draft.dubLanguage;
        for (const { key } of ACTION_COLORS) {
          overlay.querySelector('#rs-color-' + key).value = draft.actionColors[key];
        }
        this.applyColorPreview(draft);
        this.applyDubPreview(draft);
        event.target.textContent = 'Restored!';
        setTimeout(() => { event.target.textContent = 'Restore Defaults'; }, 1500);
      });

      overlay.querySelector('#rs-save').addEventListener('click', () => {
        ModuleConfig.set(draft);
        this.close();
      });
    }
  };

  // ==========================================
  // Core Execution (event-driven)
  // ==========================================
  let lastPath = location.pathname;
  let framePending = false;

  function handleRouteChange() {
    if (location.pathname === lastPath) return false;
    lastPath = location.pathname;
    DubService.reset();
    logger.debug(`SPA navigation detected: ${lastPath}`);
    return true;
  }

  function runMods() {
    handleRouteChange();

    DOMModifiers.moveStatusBadge();
    DOMModifiers.updateTimestamps();
    DOMModifiers.expandReviews();
    // While the settings modal is open, dub changes are driven by the live
    // preview; skip this so saved config doesn't clobber the preview.
    if (!SettingsUI.isOpen) DubService.apply();
  }

  function scheduleRun() {
    if (framePending) return;
    framePending = true;
    requestAnimationFrame(() => {
      framePending = false;
      runMods();
    });
  }

  const observer = new MutationObserver(() => {
    scheduleRun();
  });

  function hookHistoryMethod(methodName) {
    const original = history[methodName];
    history[methodName] = function(...callArguments) {
      const result = original.apply(this, callArguments);
      scheduleRun();
      return result;
    };
  }

  function init() {
    GM_registerMenuCommand('WeTrakr Mods Settings', () => SettingsUI.open());
    ModuleCache.clearExpired();
    applyActionColors();

    observer.observe(document.body, {
      childList: true,
      subtree: true,
      characterData: true,
      attributes: true,
      attributeFilter: ['class']
    });

    hookHistoryMethod('pushState');
    hookHistoryMethod('replaceState');
    window.addEventListener('popstate', scheduleRun);

    runMods();
  }

  init();
})();
