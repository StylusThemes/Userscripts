// ==UserScript==
// @name          WeTrakr - Mods
// @version       1.13.0
// @description   Modifications and enhancements for WeTrakr
// @author        Journey Over
// @license       MIT
// @match         *://wetrakr.com/*
// @require       https://cdn.jsdelivr.net/gh/StylusThemes/Userscripts@9e8f1b9bdc1acac2e76f3e8d2348f76817ec5bf4/libs/utils/utils.min.js
// @require       https://cdn.jsdelivr.net/gh/StylusThemes/Userscripts@644b86d55bf5816a4fa2a165bdb011ef7c22dfe1/libs/metadata/anilist/anilist.min.js
// @require       https://cdn.jsdelivr.net/gh/StylusThemes/Userscripts@e1613fcefb81ed7b05afe90edc479e06088039f2/libs/metadata/animeapi/animeapi.min.js
// @require       https://cdn.jsdelivr.net/gh/StylusThemes/Userscripts@da634c26053b0dedb96eacc0870081e48abba069/libs/metadata/wikidata/wikidata.min.js
// @require       https://cdn.jsdelivr.net/gh/StylusThemes/Userscripts@eae99ac26ef29201a290d86013a5976fa95333d6/libs/metadata/maldubs/maldubs.min.js
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

  // ============================================================================
  // Script metadata + shared constants
  // ============================================================================

  const SCRIPT = Object.freeze({
    name: 'WeTrakr - Mods',
    version: '1.14.0'
  });

  const CONFIG_KEY = 'wetrakr-mods-config';
  const FAILURE_COOLDOWN = 60 * 1000;
  const WETRAKR_PATH_PATTERN = /^\/(shows|movies)\/(\d+)/;

  const SELECTORS = Object.freeze({
    metaBox: '.detail-meta-box--desktop',
    titleStack: '.title-stack',
    externalLinks: '.detail-tags a.detail-tag',
    timestampTargets: '.entity-release-date, .detail-status-badge--airing, .media-item__progress-bar-text--episode',
    collapsedReviews: '.review-card__readmore[aria-expanded="false"]'
  });

  const REQUEST_TTL = Object.freeze({
    anilistDub: 30 * 60 * 1000,
    malDub: 30 * 60 * 1000,
    mappingPositive: 24 * 60 * 60 * 1000,
    mappingNegative: 30 * 60 * 1000
  });

  const SERVICE_MIN_INTERVAL = Object.freeze({
    anilist: 2000,
    animeapi: 750,
    wikidata: 1000,
    maldubs: 1000
  });

  const DUB_LANGUAGES = Object.freeze([
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
  ]);

  const ACTION_COLORS = Object.freeze([
    {
      key: 'watched',
      label: 'Watched',
      hint: 'Mark as watched / Unmark all',
      default: '#2E6B48',
      selector: '.media-item__action-btn--active[aria-label="Mark as watched"]:not(#tm-date-override), .media-item__action-btn--active[aria-label="Unmark all episodes"]:not(#tm-date-override), .episode-item__action-btn--active[aria-label="Mark as watched"]:not(#tm-date-override)'
    },
    {
      key: 'waiting',
      label: 'Waiting',
      hint: 'Waiting for new episodes',
      default: '#7D5B2C',
      selector: '.media-item__action-btn--active[aria-label="Waiting for new episodes"]:not(#tm-date-override)'
    },
    {
      key: 'planning',
      label: 'Planning',
      hint: 'Mark as planning',
      default: '#366B7D',
      selector: '.media-item__action-btn--active[aria-label="Mark as planning"]:not(#tm-date-override)'
    },
    {
      key: 'favorite',
      label: 'Favourite',
      hint: 'Mark as favorite',
      default: '#895e77',
      selector: '.media-item__action-btn--active[aria-label="Mark as favorite"]:not(#tm-date-override)'
    },
    {
      key: 'addToList',
      label: 'Add to list',
      hint: 'Item is in a list',
      default: '#3B6FB5',
      extra: 'color: #e9ecf2 !important;',
      selector: '.media-item__action-btn[aria-label="Add to list"]:has(.action-btn__count):not(#tm-date-override), .episode-item__action-btn[aria-label="Add to list"]:has(.action-btn__count):not(#tm-date-override)'
    }
  ]);

  const DEFAULT_ACTION_COLORS = Object.freeze(
    Object.fromEntries(ACTION_COLORS.map(({ key, default: value }) => [key, value]))
  );

  const DEFAULT_CONFIG = Object.freeze({
    dubInfo: true,
    dubLanguage: 'ENGLISH',
    debugLogging: false
  });

  const SETTINGS_FIELDS = Object.freeze([
    { key: 'dubInfo', type: 'toggle', label: 'Dub Information', hint: 'Show dub availability for anime shows', preview: 'dub' },
    { key: 'dubLanguage', type: 'select', label: 'Preferred Dub Language', hint: 'Language to check for', options: DUB_LANGUAGES, preview: 'dub' },
    { key: 'debugLogging', type: 'toggle', label: 'Debug Logging', hint: 'Show detailed diagnostic logs in the browser console', preview: 'logging' },
    ...ACTION_COLORS.map(({ key, label, hint }) => ({ key: `actionColors.${key}`, type: 'color', label, hint, preview: 'color' }))
  ]);

  // ============================================================================
  // Logging + providers
  // ============================================================================

  const loggerOptions = { debug: false };
  const logger = Logger(SCRIPT.name, loggerOptions);
  logger.info = logger;

  const Providers = Object.freeze({
    anilist: new AniList(),
    animeapi: new AnimeAPI(),
    wikidata: new Wikidata(),
    maldubs: new MalDubs()
  });

  function setDebugLogging(enabled, announce = false) {
    const next = Boolean(enabled);
    const previous = loggerOptions.debug;

    loggerOptions.debug = next;
    logger.debugEnabled = next;

    if (announce && previous !== next) {
      logger.info(`Debug logging ${next ? 'enabled' : 'disabled'}`);
    }
  }

  function errorMessage(error) {
    return error?.message || String(error);
  }

  // ============================================================================
  // Static styles
  // ============================================================================

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

  // ============================================================================
  // Configuration + action colours
  // ============================================================================

  function cloneConfig(config) {
    return {
      dubInfo: Boolean(config.dubInfo),
      dubLanguage: config.dubLanguage,
      debugLogging: Boolean(config.debugLogging),
      actionColors: { ...config.actionColors }
    };
  }

  const ConfigStore = {
    defaults() {
      return {
        ...DEFAULT_CONFIG,
        actionColors: { ...DEFAULT_ACTION_COLORS }
      };
    },

    normalize(config = {}) {
      const validLanguage = DUB_LANGUAGES.some(language => language.value === config.dubLanguage);
      const colors = config.actionColors && typeof config.actionColors === 'object' ? config.actionColors : {};

      return {
        dubInfo: config.dubInfo ?? DEFAULT_CONFIG.dubInfo,
        dubLanguage: validLanguage ? config.dubLanguage : DEFAULT_CONFIG.dubLanguage,
        debugLogging: config.debugLogging ?? DEFAULT_CONFIG.debugLogging,
        actionColors: { ...DEFAULT_ACTION_COLORS, ...colors }
      };
    },

    load() {
      return this.normalize(GM_getValue(CONFIG_KEY, {}));
    },

    save(config) {
      const normalized = this.normalize(config);
      GM_setValue(CONFIG_KEY, normalized);
      return normalized;
    }
  };

  const ActionColorTheme = {
    styleId: 'wetrakr-action-colors',

    ensureStyleSheet() {
      if (document.getElementById(this.styleId)) return;

      const style = document.createElement('style');
      style.id = this.styleId;
      style.textContent = ACTION_COLORS.map(({ key, default: value, extra, selector }) =>
        `${selector} { background-color: var(--wt-${key}, ${value}) !important;${extra ? ` ${extra}` : ''} }`
      ).join('\n');

      document.head.appendChild(style);
    },

    apply(config) {
      this.ensureStyleSheet();
      for (const { key } of ACTION_COLORS) {
        document.documentElement.style.setProperty(`--wt-${key}`, config.actionColors[key]);
      }
    }
  };

  function getFieldValue(draft, key) {
    return key.split('.').reduce((value, part) => value?.[part], draft);
  }

  function setFieldValue(draft, key, value) {
    const parts = key.split('.');
    const leaf = parts.pop();
    const parent = parts.reduce((object, part) => object[part], draft);
    parent[leaf] = value;
  }

  // ============================================================================
  // Page context
  // ============================================================================

  const PageContext = {
    identity() {
      const match = location.pathname.match(WETRAKR_PATH_PATTERN);
      if (!match) return null;

      const [, section, id] = match;
      const type = section === 'shows' ? 'show' : 'movie';

      return {
        id: Number(id),
        type,
        key: `${type}:${id}`
      };
    },

    externalIds() {
      const ids = {
        anilist: null,
        imdb: null,
        tmdb: null,
        tvdb: null,
        tvdbType: null,
        wikidata: null,
        mal: null
      };

      for (const link of document.querySelectorAll(SELECTORS.externalLinks)) {
        const href = link.getAttribute('href') || '';

        const anilistMatch = href.match(/anilist\.co\/anime\/(\d+)/i);
        if (anilistMatch) ids.anilist = Number(anilistMatch[1]);

        const imdbMatch = href.match(/imdb\.com\/title\/(tt\d+)/i);
        if (imdbMatch) ids.imdb = imdbMatch[1];

        const tmdbMatch = href.match(/themoviedb\.org\/(?:movie|tv)\/(\d+)/i);
        if (tmdbMatch) ids.tmdb = Number(tmdbMatch[1]);

        const tvdbMatch = href.match(/thetvdb\.com\/(?:dereferrer\/)?(series|movie)\/(\d+)/i);
        if (tvdbMatch) {
          ids.tvdbType = tvdbMatch[1].toLowerCase();
          ids.tvdb = Number(tvdbMatch[2]);
        }

        const wikidataMatch = href.match(/wikidata\.org\/wiki\/(Q\d+)/i);
        if (wikidataMatch) ids.wikidata = wikidataMatch[1].toUpperCase();

        const malMatch = href.match(/myanimelist\.net\/anime\/(\d+)/i);
        if (malMatch) ids.mal = Number(malMatch[1]);
      }

      return ids;
    },

    hasExternalIds(ids) {
      return Boolean(ids.anilist || ids.mal || ids.imdb || ids.tmdb || ids.tvdb || ids.wikidata);
    },

    compactExternalIds(ids) {
      return Object.fromEntries(Object.entries(ids).filter(([, value]) => value !== null));
    },

    dubBaseKey(identity, language) {
      return `${identity.key}|${language}`;
    },

    dubSignature(identity, ids, language) {
      return [
        identity.key,
        language,
        ids.anilist,
        ids.mal,
        ids.imdb,
        ids.tmdb,
        ids.tvdb,
        ids.tvdbType,
        ids.wikidata
      ].join('|');
    }
  };

  // ============================================================================
  // Request scheduling + cache
  // ============================================================================

  function sleep(milliseconds) {
    return new Promise(resolve => setTimeout(resolve, milliseconds));
  }

  function createRateLimiter(minInterval) {
    let queue = Promise.resolve();
    let nextAllowedAt = 0;

    return async function run(task) {
      const request = queue.then(async () => {
        const delay = Math.max(0, nextAllowedAt - Date.now());
        if (delay) await sleep(delay);

        nextAllowedAt = Date.now() + minInterval;
        return task();
      });

      queue = request.catch(() => {});
      return request;
    };
  }

  const ServiceLimiters = Object.fromEntries(
    Object.entries(SERVICE_MIN_INTERVAL).map(([service, interval]) => [service, createRateLimiter(interval)])
  );

  const RequestManager = {
    entries: new Map(),
    generation: 0,

    entryFor(key) {
      if (!this.entries.has(key)) {
        this.entries.set(key, {
          value: undefined,
          expiresAt: 0,
          retryAt: 0,
          pending: null
        });
      }
      return this.entries.get(key);
    },

    async request({ key, service, ttl, fetcher }) {
      const entry = this.entryFor(key);
      const now = Date.now();

      if (entry.expiresAt > now) {
        logger.debug(`Cache hit: ${key}`, { service, expiresInMs: entry.expiresAt - now });
        return entry.value;
      }

      if (entry.pending) {
        logger.debug(`Reusing in-flight request: ${key}`, { service });
        return entry.pending;
      }

      if (entry.retryAt > now) {
        const error = new Error(`Request cooldown active until ${new Date(entry.retryAt).toISOString()}`);
        error.code = 'REQUEST_COOLDOWN';
        error.retryAt = entry.retryAt;
        throw error;
      }

      const limiter = ServiceLimiters[service];
      if (!limiter) throw new Error(`Unknown request service: ${service}`);

      const generation = this.generation;
      const startedAt = performance.now();
      logger.debug(`Provider request: ${key}`, { service });

      entry.pending = limiter(fetcher)
        .then(value => {
          entry.retryAt = 0;

          let cacheTtlMs = 0;
          if (generation === this.generation) {
            cacheTtlMs = typeof ttl === 'function' ? ttl(value) : ttl;
            if (Number.isFinite(cacheTtlMs) && cacheTtlMs > 0) {
              entry.value = value;
              entry.expiresAt = Date.now() + cacheTtlMs;
            }
          }

          logger.debug(`Provider response: ${key}`, {
            service,
            elapsedMs: Math.round(performance.now() - startedAt),
            cacheTtlMs
          });
          return value;
        })
        .catch(error => {
          if (generation === this.generation) {
            entry.retryAt = Date.now() + FAILURE_COOLDOWN;
          }
          throw error;
        })
        .finally(() => {
          entry.pending = null;
        });

      return entry.pending;
    },

    clear() {
      const count = this.entries.size;
      this.generation++;
      this.entries.clear();
      logger.info(`Request cache cleared (${count} entr${count === 1 ? 'y' : 'ies'})`);
    }
  };

  // ============================================================================
  // DOM features
  // ============================================================================

  const TimeFormatter = {
    to12Hour(hours, minutes) {
      const period = hours >= 12 ? 'PM' : 'AM';
      const hour = hours % 12 || 12;
      return `${hour}:${String(minutes).padStart(2, '0')} ${period}`;
    },

    convertNode(node) {
      const original = node.textContent;
      const converted = original
        .replace(/(\d{2}\/\d{2}\/\d{4}) \| (\d{2}):(\d{2})(?!\s*[AP]M)/gi,
          (_, date, hour, minute) => `${date} | ${this.to12Hour(+hour, +minute)}`)
        .replace(/· (\d{2}):(\d{2})(?!\s*[AP]M)/gi,
          (_, hour, minute) => `· ${this.to12Hour(+hour, +minute)}`)
        .replace(/(\d{1,2})\.(\d{2})\s?(AM|PM)/gi, '$1:$2 $3');

      if (converted === original) return false;
      node.textContent = converted;
      return true;
    }
  };

  const StatusBadgeFeature = {
    reset() {
      for (const clone of document.querySelectorAll('.rs-clone')) clone.remove();
      for (const original of document.querySelectorAll('.rs-hidden-original')) {
        original.classList.remove('rs-hidden-original');
        original.style.removeProperty('display');
      }
    },

    apply() {
      const titleStack = [...document.querySelectorAll(SELECTORS.titleStack)]
        .find(element => element.offsetParent !== null);

      const heading = titleStack?.querySelector('.we-heading-1');
      const statusLine = titleStack?.querySelector('.detail-status-line:not(.detail-meta-line)');
      const statusBadge = statusLine?.querySelector(
        '.detail-status-badge--airing:not(.rs-hidden-original):not(.rs-clone), ' +
        '.detail-status-badge--status:not(.rs-hidden-original):not(.rs-clone)'
      );

      if (!titleStack || !heading || !statusBadge || titleStack.querySelector('.rs-clone')) return;

      statusBadge.classList.add('rs-hidden-original');
      statusBadge.style.display = 'none';

      const clone = statusBadge.cloneNode(true);
      clone.classList.remove('rs-hidden-original');
      clone.classList.add('rs-clone');
      clone.style.display = '';
      titleStack.prepend(clone);
    }
  };

  const TimestampFeature = {
    apply() {
      let converted = 0;

      for (const element of document.querySelectorAll(SELECTORS.timestampTargets)) {
        for (const child of element.childNodes) {
          if (child.nodeType === Node.TEXT_NODE && TimeFormatter.convertNode(child)) converted++;
        }
      }

      if (converted) logger.debug(`Converted ${converted} timestamp${converted === 1 ? '' : 's'}`);
    }
  };

  const ReviewFeature = {
    apply() {
      const buttons = document.querySelectorAll(SELECTORS.collapsedReviews);
      if (!buttons.length) return;

      for (const button of buttons) button.click();
      logger.debug(`Expanded ${buttons.length} review card${buttons.length === 1 ? '' : 's'}`);
    }
  };

  // ============================================================================
  // Dub UI
  // ============================================================================

  const DubView = {
    row() {
      return document.querySelector(SELECTORS.metaBox)?.querySelector('.rs-dub-info') || null;
    },

    clear() {
      this.row()?.remove();
    },

    render(label) {
      const metaBox = document.querySelector(SELECTORS.metaBox);
      if (!metaBox) return;

      if (!label) {
        this.clear();
        return;
      }

      let row = metaBox.querySelector('.rs-dub-info');
      if (!row) {
        row = document.createElement('div');
        row.className = 'detail-meta-box__row rs-dub-info';

        const term = document.createElement('dt');
        term.className = 'detail-meta-box__label';
        term.textContent = 'Dub';

        const value = document.createElement('dd');
        value.className = 'detail-meta-box__value';

        row.append(term, value);
        metaBox.appendChild(row);
      }

      row.querySelector('.detail-meta-box__value').textContent = label;
    }
  };

  // ============================================================================
  // Dub provider adapters
  // ============================================================================

  const DubProviders = {
    languageName(language) {
      return DUB_LANGUAGES.find(item => item.value === language)?.name || 'Dub';
    },

    mappingTtl(mapping) {
      return mapping?.anilist || mapping?.mal ?
        REQUEST_TTL.mappingPositive :
        REQUEST_TTL.mappingNegative;
    },

    normalizeAnimeApi(data) {
      return {
        anilist: data?.anilist ? Number(data.anilist) : null,
        mal: data?.myanimelist ? Number(data.myanimelist) : null
      };
    },

    normalizeWikidataLinks(data) {
      const anilistUrl = data?.links?.AniList?.value || '';
      const malUrl = data?.links?.MyAnimeList?.value || '';
      const anilistMatch = anilistUrl.match(/anilist\.co\/anime\/(\d+)/i);
      const malMatch = malUrl.match(/myanimelist\.net\/anime\/(\d+)/i);

      return {
        anilist: anilistMatch ? Number(anilistMatch[1]) : null,
        mal: malMatch ? Number(malMatch[1]) : null
      };
    },

    queryWikidataItem(wikidataId) {
      if (!/^Q\d+$/.test(wikidataId)) {
        return Promise.reject(new Error(`Invalid Wikidata ID: ${wikidataId}`));
      }

      const query = `
        SELECT ?AniList ?MyAnimeList WHERE {
          VALUES ?item { wd:${wikidataId} }
          OPTIONAL { ?item wdt:P8729 ?AniList. }
          OPTIONAL { ?item wdt:P4086 ?MyAnimeList. }
        }
        LIMIT 1
      `;

      return new Promise((resolve, reject) => {
        GM_xmlhttpRequest({
          method: 'GET',
          url: `https://query.wikidata.org/sparql?query=${encodeURIComponent(query)}`,
          headers: { Accept: 'application/sparql-results+json' },
          timeout: 15e3,
          onload: response => {
            if (response.status !== 200) {
              reject(new Error(`Wikidata request failed with status ${response.status}`));
              return;
            }

            try {
              const binding = JSON.parse(response.responseText)?.results?.bindings?.[0] || {};
              resolve({
                anilist: binding.AniList?.value ? Number(binding.AniList.value) : null,
                mal: binding.MyAnimeList?.value ? Number(binding.MyAnimeList.value) : null
              });
            } catch {
              reject(new Error('Failed to parse Wikidata response'));
            }
          },
          onerror: () => reject(new Error('An error occurs while processing the Wikidata request')),
          ontimeout: () => reject(new Error('Wikidata request times out'))
        });
      });
    },

    async queryAnilistDub(anilistId, language) {
      const query = `
        query($id: Int!, $type: MediaType, $page: Int = 1, $language: StaffLanguage) {
          Media(id: $id, type: $type) {
            characters(page: $page, sort: [ROLE], role: MAIN) {
              edges {
                node { id }
                voiceActors(language: $language) { language }
              }
            }
          }
        }
      `;

      const response = await Providers.anilist.query(query, {
        id: Number(anilistId),
        type: 'ANIME',
        language
      });

      const edges = response?.data?.Media?.characters?.edges;
      if (!Array.isArray(edges)) throw new Error('Unexpected AniList response structure');

      const hasDub = edges.some(edge => edge.voiceActors?.length > 0);
      logger.debug('AniList dub result', {
        anilistId,
        language,
        mainCharacters: edges.length,
        hasDub
      });
      return hasDub;
    },

    async fetchLabel(source, language) {
      if (source.type === 'mal') {
        const status = await RequestManager.request({
          key: `mal-dubs:${source.id}`,
          service: 'maldubs',
          ttl: REQUEST_TTL.malDub,
          fetcher: () => Providers.maldubs.getStatus(source.id)
        });

        logger.debug('MAL-Dubs result', { malId: source.id, status });
        if (!status) return null;
        return status === 'incomplete' ? 'English Dub Incomplete' : 'English Dub Exists';
      }

      const hasDub = await RequestManager.request({
        key: `anilist:${source.id}:${language}`,
        service: 'anilist',
        ttl: REQUEST_TTL.anilistDub,
        fetcher: () => this.queryAnilistDub(source.id, language)
      });

      return hasDub ? `${this.languageName(language)} Dub Exists` : null;
    }
  };

  // ============================================================================
  // ID mapping + dub source resolution
  // ============================================================================

  const DubSourceResolver = {
    hasMapping(mapping) {
      return Boolean(mapping?.anilist || mapping?.mal);
    },

    directSource(pageIds, language) {
      if (pageIds.anilist) {
        return { type: 'anilist', id: pageIds.anilist, via: 'WeTrakr/AniList' };
      }

      if (language === 'ENGLISH' && pageIds.mal) {
        return { type: 'mal', id: pageIds.mal, via: 'WeTrakr/MyAnimeList' };
      }

      return null;
    },

    sourceFromMapping(mapping, language) {
      if (mapping?.anilist) {
        return { type: 'anilist', id: mapping.anilist, via: mapping.via };
      }

      if (language === 'ENGLISH' && mapping?.mal) {
        return { type: 'mal', id: mapping.mal, via: mapping.via };
      }

      return null;
    },

    animeApiCandidates(identity, pageIds) {
      const candidates = [];

      if (pageIds.tmdb) {
        candidates.push({
          source: 'themoviedb',
          id: `${identity.type === 'show' ? 'tv' : 'movie'}/${pageIds.tmdb}`,
          label: 'TMDB'
        });
      }

      if (pageIds.imdb) {
        candidates.push({ source: 'imdb', id: pageIds.imdb, label: 'IMDb' });
      }

      if (identity.type === 'show' && pageIds.tvdb) {
        candidates.push({ source: 'thetvdb', id: pageIds.tvdb, label: 'TheTVDB' });
      }

      if (pageIds.mal) {
        candidates.push({ source: 'myanimelist', id: pageIds.mal, label: 'MyAnimeList' });
      }

      return candidates;
    },

    async viaAnimeApi(identity, pageIds) {
      let lastError = null;

      for (const candidate of this.animeApiCandidates(identity, pageIds)) {
        try {
          const mapping = await RequestManager.request({
            key: `animeapi:${candidate.source}:${candidate.id}`,
            service: 'animeapi',
            ttl: result => DubProviders.mappingTtl(result),
            fetcher: async () => DubProviders.normalizeAnimeApi(
              await Providers.animeapi.fetch(candidate.source, candidate.id)
            )
          });

          if (this.hasMapping(mapping)) {
            const result = { ...mapping, via: `AnimeAPI/${candidate.label}` };
            logger.debug('Anime IDs mapped', { via: result.via, mapping });
            return result;
          }
        } catch (error) {
          lastError = error;
          logger.debug('AnimeAPI mapping candidate failed', {
            via: candidate.label,
            lookup: candidate.id,
            error: errorMessage(error)
          });
        }
      }

      return lastError ? { error: lastError } : null;
    },

    wikidataExternalCandidates(identity, pageIds) {
      const itemType = identity.type === 'show' ? 'tv' : 'movie';
      const candidates = [];

      if (pageIds.imdb) {
        candidates.push({ id: pageIds.imdb, source: 'IMDb', itemType, label: 'IMDb' });
      }

      if (pageIds.tmdb) {
        candidates.push({
          id: String(pageIds.tmdb),
          source: identity.type === 'show' ? 'TMDb_tv' : 'TMDb_movie',
          itemType,
          label: 'TMDB'
        });
      }

      if (pageIds.tvdb) {
        candidates.push({
          id: String(pageIds.tvdb),
          source: identity.type === 'show' ? 'TVDb_tv' : 'TVDb_movie',
          itemType,
          label: 'TheTVDB'
        });
      }

      return candidates;
    },

    async viaWikidata(identity, pageIds) {
      let lastError = null;

      if (pageIds.wikidata) {
        try {
          const mapping = await RequestManager.request({
            key: `wikidata:item:${pageIds.wikidata}`,
            service: 'wikidata',
            ttl: result => DubProviders.mappingTtl(result),
            fetcher: () => DubProviders.queryWikidataItem(pageIds.wikidata)
          });

          if (this.hasMapping(mapping)) {
            const result = { ...mapping, via: `Wikidata/${pageIds.wikidata}` };
            logger.debug('Anime IDs mapped', { via: result.via, mapping });
            return result;
          }
        } catch (error) {
          lastError = error;
          logger.debug('Wikidata QID mapping failed', {
            wikidata: pageIds.wikidata,
            error: errorMessage(error)
          });
        }
      }

      for (const candidate of this.wikidataExternalCandidates(identity, pageIds)) {
        try {
          const mapping = await RequestManager.request({
            key: `wikidata:${candidate.source}:${candidate.id}:${candidate.itemType}`,
            service: 'wikidata',
            ttl: result => DubProviders.mappingTtl(result),
            fetcher: async () => DubProviders.normalizeWikidataLinks(
              await Providers.wikidata.links(candidate.id, candidate.source, candidate.itemType)
            )
          });

          if (this.hasMapping(mapping)) {
            const result = { ...mapping, via: `Wikidata/${candidate.label}` };
            logger.debug('Anime IDs mapped', { via: result.via, mapping });
            return result;
          }
        } catch (error) {
          lastError = error;
          logger.debug('Wikidata mapping candidate failed', {
            via: candidate.label,
            lookup: candidate.id,
            error: errorMessage(error)
          });
        }
      }

      return lastError ? { error: lastError } : null;
    },

    async resolve(identity, pageIds, language, isCurrent) {
      const direct = this.directSource(pageIds, language);
      if (direct) return direct;

      const animeApiMapping = await this.viaAnimeApi(identity, pageIds);
      if (!isCurrent()) return null;

      const animeApiSource = this.sourceFromMapping(animeApiMapping, language);
      if (animeApiSource) return animeApiSource;

      const wikidataMapping = await this.viaWikidata(identity, pageIds);
      if (!isCurrent()) return null;

      const wikidataSource = this.sourceFromMapping(wikidataMapping, language);
      if (wikidataSource) return wikidataSource;

      const mappingError = wikidataMapping?.error || animeApiMapping?.error;
      if (mappingError) throw mappingError;

      return null;
    }
  };

  // ============================================================================
  // Dub orchestration
  // ============================================================================

  const DubService = {
    generation: 0,
    activeAttempt: null,
    settledBaseKey: null,
    unresolvedSignature: null,
    failure: null,

    reset() {
      this.generation++;
      this.activeAttempt = null;
      this.settledBaseKey = null;
      this.unresolvedSignature = null;
      this.failure = null;
      DubView.clear();
    },

    canStart(baseKey, signature) {
      if (this.settledBaseKey === baseKey) return false;
      if (this.activeAttempt?.signature === signature) return false;
      if (this.unresolvedSignature === signature) return false;

      if (this.failure?.signature === signature && Date.now() < this.failure.retryAt) {
        return false;
      }

      return true;
    },

    isCurrent(attempt) {
      return attempt.generation === this.generation && this.activeAttempt === attempt;
    },

    async apply(config) {
      if (!document.querySelector(SELECTORS.metaBox)) return;

      if (!config.dubInfo) {
        DubView.clear();
        return;
      }

      const identity = PageContext.identity();
      if (!identity) return;

      const pageIds = PageContext.externalIds();
      if (!PageContext.hasExternalIds(pageIds)) return;

      const language = config.dubLanguage;
      const baseKey = PageContext.dubBaseKey(identity, language);
      const signature = PageContext.dubSignature(identity, pageIds, language);
      if (!this.canStart(baseKey, signature)) return;

      const attempt = {
        generation: this.generation,
        baseKey,
        signature
      };
      this.activeAttempt = attempt;
      this.failure = null;

      logger.info(`Checking ${DubProviders.languageName(language)} dub availability`, {
        identity,
        externalIds: PageContext.compactExternalIds(pageIds)
      });

      try {
        const source = await DubSourceResolver.resolve(
          identity,
          pageIds,
          language,
          () => this.isCurrent(attempt)
        );

        if (!this.isCurrent(attempt)) return;

        if (!source) {
          DubView.clear();
          this.unresolvedSignature = signature;
          logger.info('Dub lookup skipped: no usable AniList/MyAnimeList mapping', {
            identity,
            externalIds: PageContext.compactExternalIds(pageIds)
          });
          return;
        }

        logger.debug('Dub source resolved', {
          via: source.via,
          type: source.type,
          id: source.id
        });

        const label = await DubProviders.fetchLabel(source, language);
        if (!this.isCurrent(attempt)) return;

        DubView.render(label);
        this.settledBaseKey = baseKey;
        this.unresolvedSignature = null;

        logger.info(label || `No ${DubProviders.languageName(language)} dub found`, {
          source: source.via,
          id: source.id
        });
      } catch (error) {
        if (!this.isCurrent(attempt)) return;

        const retryAt = error?.retryAt || (Date.now() + FAILURE_COOLDOWN);
        this.failure = { signature, retryAt };

        if (error?.code === 'REQUEST_COOLDOWN') {
          logger.debug('Dub lookup waiting for provider cooldown', {
            retryAt: new Date(retryAt).toISOString()
          });
          return;
        }

        logger.error(`Dub lookup failed: ${errorMessage(error)}`, {
          identity,
          externalIds: PageContext.compactExternalIds(pageIds)
        });
      } finally {
        if (this.activeAttempt === attempt) this.activeAttempt = null;
      }
    }
  };

  // ============================================================================
  // Settings UI
  // ============================================================================

  const SettingsUI = {
    modal: null,
    isOpen: false,

    fieldId(field) {
      return `rs-field-${field.key.replace('.', '-')}`;
    },

    renderField(field, draft) {
      const value = getFieldValue(draft, field.key);
      const id = this.fieldId(field);

      if (field.type === 'toggle') {
        return `
          <label class="rs-settings-row">
            <span>
              <strong>${field.label}</strong>
              <small>${field.hint}</small>
            </span>
            <input type="checkbox" class="rs-settings-toggle" id="${id}" ${value ? 'checked' : ''}>
          </label>`;
      }

      if (field.type === 'select') {
        return `
          <label class="rs-settings-row">
            <span>
              <strong>${field.label}</strong>
              <small>${field.hint}</small>
            </span>
            <select id="${id}">
              ${field.options.map(option =>
                `<option value="${option.value}" ${value === option.value ? 'selected' : ''}>${option.name}</option>`
              ).join('')}
            </select>
          </label>`;
      }

      return `
        <label class="rs-color-card">
          <input type="color" class="rs-color-swatch" id="${id}" value="${value}">
          <div class="rs-color-card-info">
            <strong>${field.label}</strong>
            <small>${field.hint}</small>
          </div>
        </label>`;
    },

    applyPreview(field, draft) {
      if (field.preview === 'color') {
        ActionColorTheme.apply(draft);
        return;
      }

      if (field.preview === 'logging') {
        setDebugLogging(draft.debugLogging, true);
        return;
      }

      DubService.reset();
      if (draft.dubInfo) DubService.apply(draft);
    },

    bindFields(overlay, draft) {
      for (const field of SETTINGS_FIELDS) {
        const input = overlay.querySelector(`#${this.fieldId(field)}`);
        const eventName = field.type === 'color' ? 'input' : 'change';

        input.addEventListener(eventName, event => {
          const value = field.type === 'toggle' ? event.target.checked : event.target.value;
          setFieldValue(draft, field.key, value);
          this.applyPreview(field, draft);
        });
      }
    },

    syncFields(overlay, draft) {
      for (const field of SETTINGS_FIELDS) {
        const input = overlay.querySelector(`#${this.fieldId(field)}`);
        const value = getFieldValue(draft, field.key);
        if (field.type === 'toggle') input.checked = value;
        else input.value = value;
      }
    },

    flashButton(button, temporaryText, normalText) {
      button.textContent = temporaryText;
      setTimeout(() => {
        if (button.isConnected) button.textContent = normalText;
      }, 1500);
    },

    close() {
      this.modal?.remove();
      this.modal = null;
      this.isOpen = false;
    },

    open() {
      if (this.modal) return;

      this.isOpen = true;
      const saved = cloneConfig(App.config);
      const draft = cloneConfig(saved);

      const groups = {
        dub: SETTINGS_FIELDS.filter(field => field.preview === 'dub'),
        logging: SETTINGS_FIELDS.filter(field => field.preview === 'logging'),
        color: SETTINGS_FIELDS.filter(field => field.preview === 'color')
      };

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
            ${groups.dub.map(field => this.renderField(field, draft)).join('')}
            <h3>Logging</h3>
            ${groups.logging.map(field => this.renderField(field, draft)).join('')}
            <h3>Action Button Colours</h3>
            <div class="rs-color-grid">
              ${groups.color.map(field => this.renderField(field, draft)).join('')}
            </div>
          </div>
          <div class="rs-settings-footer">
            <div class="rs-settings-footer-group">
              <button type="button" class="rs-settings-btn rs-settings-btn--ghost" id="rs-clear-cache">Clear Request Cache</button>
              <button type="button" class="rs-settings-btn rs-settings-btn--ghost" id="rs-reset">Restore Defaults</button>
            </div>
            <button type="button" class="rs-settings-btn rs-settings-btn--primary" id="rs-save">Save &amp; Close</button>
          </div>
        </div>
      `;

      document.body.appendChild(overlay);
      this.modal = overlay;
      this.bindFields(overlay, draft);

      const cancel = () => {
        ActionColorTheme.apply(saved);
        setDebugLogging(saved.debugLogging, true);
        DubService.reset();
        this.close();
        App.schedule();
      };

      overlay.querySelector('.rs-settings-close').addEventListener('click', cancel);
      overlay.addEventListener('click', event => {
        if (event.target === overlay) cancel();
      });

      overlay.querySelector('#rs-clear-cache').addEventListener('click', event => {
        RequestManager.clear();
        DubService.reset();
        if (draft.dubInfo) DubService.apply(draft);
        this.flashButton(event.currentTarget, 'Cleared!', 'Clear Request Cache');
      });

      overlay.querySelector('#rs-reset').addEventListener('click', event => {
        Object.assign(draft, ConfigStore.defaults());
        draft.actionColors = { ...DEFAULT_ACTION_COLORS };
        this.syncFields(overlay, draft);
        ActionColorTheme.apply(draft);
        setDebugLogging(draft.debugLogging, true);
        DubService.reset();
        if (draft.dubInfo) DubService.apply(draft);
        logger.info('Settings restored to defaults');
        this.flashButton(event.currentTarget, 'Restored!', 'Restore Defaults');
      });

      overlay.querySelector('#rs-save').addEventListener('click', () => {
        App.config = ConfigStore.save(draft);
        ActionColorTheme.apply(App.config);
        setDebugLogging(App.config.debugLogging, true);
        DubService.reset();

        logger.info('Settings saved', {
          dubInfo: App.config.dubInfo,
          dubLanguage: App.config.dubLanguage,
          debugLogging: App.config.debugLogging
        });

        this.close();
        App.schedule();
      });
    }
  };

  // ============================================================================
  // App lifecycle + SPA integration
  // ============================================================================

  const App = {
    config: null,
    lastPath: location.pathname,
    framePending: false,
    observer: null,

    handleRouteChange() {
      if (location.pathname === this.lastPath) return;

      const previousPath = this.lastPath;
      this.lastPath = location.pathname;
      StatusBadgeFeature.reset();
      DubService.reset();

      logger.info('SPA navigation detected', {
        from: previousPath,
        to: this.lastPath
      });
    },

    run() {
      this.handleRouteChange();
      StatusBadgeFeature.apply();
      TimestampFeature.apply();
      ReviewFeature.apply();

      if (!SettingsUI.isOpen) {
        DubService.apply(this.config);
      }
    },

    schedule() {
      if (this.framePending) return;
      this.framePending = true;

      requestAnimationFrame(() => {
        this.framePending = false;
        this.run();
      });
    },

    hookHistoryMethod(methodName) {
      const original = history[methodName];
      history[methodName] = function(...arguments_) {
        const result = original.apply(this, arguments_);
        App.schedule();
        return result;
      };
    },

    startObserver() {
      this.observer = new MutationObserver(() => this.schedule());
      this.observer.observe(document.body, {
        childList: true,
        subtree: true,
        characterData: true,
        attributes: true,
        attributeFilter: ['class']
      });
    },

    start() {
      this.config = ConfigStore.load();
      setDebugLogging(this.config.debugLogging);
      ActionColorTheme.apply(this.config);

      GM_registerMenuCommand('WeTrakr Mods Settings', () => SettingsUI.open());

      this.startObserver();
      this.hookHistoryMethod('pushState');
      this.hookHistoryMethod('replaceState');
      window.addEventListener('popstate', () => this.schedule());

      logger.info('WeTrakr Mods started', {
        version: SCRIPT.version,
        path: location.pathname,
        debugLogging: this.config.debugLogging
      });

      this.run();
    }
  };

  App.start();
})();
