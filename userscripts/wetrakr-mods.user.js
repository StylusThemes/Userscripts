// ==UserScript==
// @name          WeTrakr - Mods
// @version       2.2.0
// @description   Modifications and enhancements for WeTrakr
// @author        Journey Over
// @license       MIT
// @match         *://wetrakr.com/*
// @noframes
// @require       https://cdn.jsdelivr.net/gh/StylusThemes/Userscripts@9e8f1b9bdc1acac2e76f3e8d2348f76817ec5bf4/libs/utils/utils.min.js
// @require       https://cdn.jsdelivr.net/gh/StylusThemes/Userscripts@c35138874699baa81ebca91b8b428e04f71d2160/libs/metadata/animeapi/animeapi.min.js
// @require       https://cdn.jsdelivr.net/gh/StylusThemes/Userscripts@f8b54eac2bf27233c791f9eef6e3ee12810d6227/libs/metadata/mydublist/mydublist.min.js
// @grant         GM_addStyle
// @grant         GM_xmlhttpRequest
// @grant         GM_getValue
// @grant         GM_setValue
// @grant         GM_addValueChangeListener
// @grant         GM_registerMenuCommand
// @icon          https://www.google.com/s2/favicons?sz=64&domain=wetrakr.com
// @homepageURL   https://github.com/StylusThemes/Userscripts
// @downloadURL   https://github.com/StylusThemes/Userscripts/raw/main/userscripts/wetrakr-mods.user.js
// @updateURL     https://github.com/StylusThemes/Userscripts/raw/main/userscripts/wetrakr-mods.user.js
// ==/UserScript==

(function() {
  'use strict';

  // ============================================================================
  // Constants
  // ============================================================================

  const SCRIPT = Object.freeze({
    name: globalThis.GM_info?.script?.name ?? 'WeTrakr - Mods',
    version: globalThis.GM_info?.script?.version ?? '0.0.0'
  });

  const CONFIG_KEY = 'wetrakr-mods-config';
  const FAILURE_COOLDOWN = 60 * 1000;
  const DUB_CACHE_LIMIT = 100;
  const WETRAKR_PATH_PATTERN = /^\/(shows|movies)\/(\d+)/;
  const TRACKING_PATH_PATTERN = /^\/(shows|movies)\/.+\/tracking\/?$/;

  const SELECTORS = Object.freeze({
    metaBox: '.detail-meta-box--desktop',
    titleStack: '.title-stack',
    trackingTitle: '.detail-grid--min .title-stack .we-heading-1 span.we-link-none',
    externalLinks: '.detail-tags a.detail-tag',
    timestampTargets: '.entity-release-date, .detail-status-badge--airing, .media-item__progress-bar-text--episode',
    reviewReadmore: '.comment-card__readmore',
    reviewText: '.comment-card__text',
    overviewBlocks: '.overview-toggle.clickable',
    overviewToggles: '.overview-toggle .see-toggle',
    episodeToggles: '.episode-item__overview .item-more'
  });

  // Elements the script itself creates or manages. Mutations that only touch these never need a new pass
  const OWN_NODE_SELECTOR = '.rs-settings-overlay, .rs-clone, .rs-dub-info, .rs-tracking-title-link';
  const OWN_STYLE_ID = 'rs-profile-menu-visibility';

  const DUB_LANGUAGES = MyDubList.LANGUAGES;
  const DUB_CONFIDENCE_LEVELS = MyDubList.CONFIDENCES;

  const PROFILE_MENU_LINK_PREFIX = '.profile-menu .profile-menu-content a.profile-button-menu';

  const profileLink = (key, label, path) => ({
    key: `profileMenu${key}`,
    selector: `${PROFILE_MENU_LINK_PREFIX}[href="${path}"]`,
    label,
    hint: `Show the ${label} button in the profile menu`,
    defaultVisible: true
  });

  const PROFILE_MENU_OPTIONS = Object.freeze([
    {
      key: 'profileMenuHeaderToggle',
      selector: '.profile-menu .profile-header-toggle',
      label: 'Header Toggle',
      hint: 'Show the button that collapses the profile header above the menu',
      defaultVisible: false
    },
    profileLink('Overview', 'Overview', '/profile'),
    profileLink('NextToWatch', 'Next to Watch', '/profile/nexttowatch'),
    profileLink('Tracking', 'Tracking', '/profile/tracking'),
    profileLink('Progress', 'Progress', '/profile/progress'),
    profileLink('History', 'Watch History', '/profile/history'),
    profileLink('Social', 'Social', '/profile/social'),
    profileLink('Lists', 'Lists', '/profile/lists'),
    profileLink('Library', 'Library', '/profile/library'),
    profileLink('MyStuff', 'My Stuff', '/profile/mystuff'),
    profileLink('Activity', 'Activity', '/profile/activity'),
    profileLink('Stats', 'Stats', '/profile/stats'),
    profileLink('Settings', 'Settings', '/profile/settings')
  ]);

  const DEFAULT_CONFIG = Object.freeze({
    dubInfo: true,
    dubLanguage: 'ENGLISH',
    dubConfidence: 'normal',
    debugLogging: false,
    ...Object.fromEntries(PROFILE_MENU_OPTIONS.map(option => [option.key, option.defaultVisible]))
  });

  const SETTINGS_FIELDS = Object.freeze([
    { key: 'dubInfo', type: 'toggle', label: 'Dub Information', hint: 'Show dub availability for anime titles' },
    { key: 'dubLanguage', type: 'select', label: 'Preferred Dub Language', hint: 'Language to check for', options: DUB_LANGUAGES },
    { key: 'dubConfidence', type: 'select', label: 'Dub Confidence', hint: 'Minimum verification confidence', options: DUB_CONFIDENCE_LEVELS },
    ...PROFILE_MENU_OPTIONS.map(option => ({
      key: option.key,
      type: 'toggle',
      label: option.label,
      hint: option.hint,
      preview: 'profile'
    })),
    { key: 'debugLogging', type: 'toggle', label: 'Debug Logging', hint: 'Show detailed diagnostic logs in the browser console', preview: 'logging' }
  ]);

  const FIELDS_BY_KEY = new Map(SETTINGS_FIELDS.map(field => [field.key, field]));

  // ============================================================================
  // Helpers
  // ============================================================================

  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => root.querySelectorAll(selector);
  const plural = (count, one = '', many = 's') => (count === 1 ? one : many);
  const errorMessage = error => error?.message || String(error);

  const HTML_ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', '\'': '&#39;' };
  const escapeHtml = value => String(value).replace(/[&<>"']/g, char => HTML_ESCAPES[char]);

  // ============================================================================
  // Logging
  // ============================================================================

  const loggerOptions = { debug: false };
  const logger = Logger(SCRIPT.name, loggerOptions);

  const Providers = Object.freeze({
    animeapi: new AnimeAPI(),
    mydublist: new MyDubList()
  });

  function setDebugLogging(enabled, announce = false) {
    const next = Boolean(enabled);
    const previous = loggerOptions.debug;

    loggerOptions.debug = next;
    logger.debugEnabled = next;

    if (announce && previous !== next) {
      logger(`Debug logging ${next ? 'enabled' : 'disabled'}`);
    }
  }

  // ============================================================================
  // Styles
  // ============================================================================

  // Site tweaks, injected immediately
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

    /* ===== Chips + Filter Badges ===== */
    /* Darken active filter chips and badges */
    .active-chip, .filter-badge { background: #2a2f39 !important; }

    /* ========================================================================== */
    /* Detail Pages                                                               */
    /* ========================================================================== */

    /* ===== Shared ===== */
    /* Hide "share" button */
    .title-share { display: none !important; }
    /* Reduce the gap below the pager */
    .detail-title-pager { margin-bottom: 20px !important; }
    /* Hide the "still ongoing" hint and its remove-all-watched toggle shown for ongoing shows */
    .watching-details--all-watched { display: none !important; }
    /* Hide fully-watched progress bar (100% fill) since it adds no information */
    .watching-progress:has(.watching-progress__fill[style*="100%"]) { display: none !important; }
    /* Hide trailer section when no trailer is available */
    .trailer-section:has(.trailer--placeholder) { display: none !important; }
    /* Director + Creator */
    .detail-grid__info .detail-overview-block .detail-directed-by { margin-bottom: 20px !important; }
    .detail-grid__info .detail-overview-block .we-text-body.detail-directed-by { font-weight: 700; }
    .detail-grid__info .detail-overview-block .we-text-body.detail-directed-by a.we-link-body { font-weight: 400; text-decoration: none; }
    .detail-grid__info .detail-overview-block .we-text-body.detail-directed-by a.we-link-body:hover { color: #8283ff; }
    .detail-grid__info .detail-overview-block .we-text-body.detail-directed-by a.we-link-body:first-of-type { margin-left: 4px; }
    /* Remove backgrounds on info items */
    .detail-grid--person [class="detail-status-line"] .detail-status-badge, [class="detail-grid"] .detail-status-line.detail-meta-line .detail-status-badge, .detail-status-line.detail-meta-row .detail-status-badge, .detail-grid--min .detail-status-line.detail-meta-line .detail-status-badge { background: none !important; padding: 0px !important; }
    .detail-grid--person [class="detail-status-line"] .detail-status-badge + .detail-status-badge::before, [class="detail-grid"] .detail-status-line.detail-meta-line .detail-status-badge + .detail-status-badge::before, .detail-status-line.detail-meta-row .detail-status-badge + .detail-status-badge::before, .detail-grid--min .detail-status-line.detail-meta-line .detail-status-badge + .detail-status-badge::before { content: "∙"; margin: 0 10px 0 4px; font-weight: bold; }
    /* Add background on tag buttons */
    .detail-status-badge--genre { text-decoration: none !important; background: #ffffff30 !important; padding: 3px 10px !important; margin: 0 6px 0px 0 !important; }
    /* Spacing for ratings element */
    .detail-info-stats { margin-top: 15px; height: 40px; }
    /* 'See more' link [Actor / Show] */
    .overview-toggle .see-toggle { display: block; margin: 12px 0 0px 0; }
    .overview-toggle .see-toggle::first-letter { text-transform: uppercase; }
    .overview-toggle .see-toggle::after { content: "➜"; }
    /* Remove the double gap on the sidebar when there is hidden sidebar items */
    .head-actions__projected:not(:has(> :not(.is-layout-hidden))) { display: none !important; }

    /* ===== Title Stack: Actor ===== */
    /* Remove margin on the department badge (e.g., "Acting") next to name */
    .detail-grid--person .person-badge-department { margin-left: 0px !important; }
    /* Hide 'rate now' button */
    .detail-grid--person .detail-info-stats { display: none; }

    /* ===== Status Badge ===== */
    /* Hide the original badge once its clone takes the slot above the title */
    .rs-hidden-original { display: none !important; }

    /* ===== Title Stack: Movies + Shows + Tracking ===== */
    [class="detail-grid"] .title-stack, .detail-grid--min .title-stack { display: flex; flex-direction: column; }
    /* Airing badge clone: first, own line, above h1 */
    [class="detail-grid"] .title-stack .detail-status-badge.rs-clone, .detail-grid--min .title-stack .detail-status-badge.rs-clone { order: 0; width: fit-content; margin-bottom: 8px; }
    /* Title: second */
    [class="detail-grid"] .title-stack .we-heading-1, .detail-grid--min .title-stack .we-heading-1 { order: 1; display: unset !important; font-size: 26px; }
    /* Date, seasons, episodes, and runtime line: third */
    [class="detail-grid"] .title-stack .detail-status-line.detail-meta-line, .detail-grid--min .title-stack .detail-status-line.detail-meta-line { order: 2; margin-bottom: var(--space-2); }
    /* Genre line with hidden airing badge: fourth, below meta line */
    [class="detail-grid"] .title-stack .detail-status-line:not(.detail-meta-line), .detail-grid--min .title-stack .detail-status-line:not(.detail-meta-line) { order: 3; }
    /* Tracking title links back to the detail page */
    .rs-tracking-title-link { text-decoration: none !important; color: inherit !important; cursor: pointer; }
    .rs-tracking-title-link:hover { color: var(--bs-link-hover-color-rgb) !important; text-decoration: underline !important; }

    /* ===== Dub Information ===== */
    .detail-meta-box .rs-dub-info { display: flex; flex-direction: row; align-items: baseline; justify-content: space-between; gap: var(--space-3); padding: var(--space-4) var(--space-4); }
    .detail-meta-box .rs-dub-info .detail-meta-box__label { display: flex; align-items: center; gap: var(--space-2); flex-shrink: 0; font-size: var(--font-size-0); font-weight: 600; color: #fff; letter-spacing: 0.04em; line-height: 1.4; margin: 0; }
    .detail-meta-box .rs-dub-info .detail-meta-box__value { font-size: var(--font-size-0); font-weight: 400; color: #96a4af; line-height: 1.4; text-align: right; margin: 0; min-width: 0; overflow-wrap: anywhere; word-break: break-word; }

    /* ========================================================================== */
    /* Reviews                                                                    */
    /* ========================================================================== */

    /* ===== Review Controls ===== */
    /* Change the "Add New" text color to match "Top" */
    .comments-section__add-btn { color: #96a4af !important; }

    /* ===== Review Card ===== */
    /* Give every review a visible containing shape so the author, text, pills, and Reply action clearly belong to one card */
    we-comment-card { display: block !important; background: rgba(255, 255, 255, 0.03) !important; border: 1px solid #2d2d48 !important; padding: 16px !important; transition: border-color 0.15s !important; }
    /* The card inside the host keeps the site's own box off so the host supplies the shape and the padding once */
    .comment-card:not(.comment-card--reply) { background: unset !important; padding: 0 !important; }
    /* Tighten the gap between the profile picture and rating and slightly reduce the rating font size */
    .comment-card__rating { margin-top: 0 !important; font-size: 13px !important; }
    /* Slightly reduce the font size of the author name, date, and handle */
    .comment-card__author-name, .comment-card__date, .comment-card__handle { font-size: 13px !important; }
    /* Match the reaction and reply pill text color to the other pills */
    .comment-card__reaction-pill, .comment-card__view-replies { color: #96a4af !important; }

    /* ===== Review Text ===== */
    /* Slightly darken the text instead of using pure white */
    .comment-card__text { color: #cacdd1 !important; }
    /* The site truncates long reviews in JS, so the script expands them and this caps the result. Short reviews are unaffected since they never exceed the cap */
    .comment-card__text, .comment-card__text--highlight { display: block !important; max-height: 360px !important; overflow-y: auto !important; scrollbar-width: thin; scrollbar-color: #333348 transparent; padding-right: 6px; }
    .comment-card__text::-webkit-scrollbar { width: 6px; }
    .comment-card__text::-webkit-scrollbar-track { background: transparent; }
    .comment-card__text::-webkit-scrollbar-thumb { background: #333348; }
    /* Hide the site's "Show more" toggle now that long reviews are expanded and scroll */
    .comment-card__readmore { display: none !important; }
    /* Keep spoiler and non-spoiler review text at the same size */
    .comment-card__text, .comment-card__text we-spoiler-text { font-size: 14px !important; }

    /* ========================================================================== */
    /* Media Items                                                                */
    /* ========================================================================== */

    /* ===== Hover Border ===== */
    /* Remove the default hover border overlays */
    .media-item__border-overlay, .episode-item__border-overlay { display: none !important; }

    /* ===== Rating Badge ===== */
    /* Hide "Rate Now" on posters when no rating exists */
    .media-item__poster .media-item__rating-overlay:has(we-rating-badge.is-rate-now),
    .media-item__poster we-rating-badge.is-rate-now,
    .media-item__poster .we-rb--rate,
    .episode-item__poster .episode-item__rating-overlay:has(we-rating-badge.is-rate-now),
    .episode-item__poster we-rating-badge.is-rate-now,
    .episode-item__poster .we-rb--rate { display: none !important; }

    /* ===== Release / Watched Date ===== */
    /* Keep the eye icon, date, and time on one line to prevent wrapping and misalignment on narrow cards */
    .entity-release-date .wd-full { flex-wrap: unset !important; }

    /* ===== Empty Cards ===== */
    /* Hide empty placeholder cards */
    [class="we-empty-card"] { display: none; }
    /* Restore the tracking layout to prevent a large gap between the tabs and Watching */
    [class="tracking-layout"] { display: unset !important; }

    /* ========================================================================== */
    /* Profile Overview                                                           */
    /* ========================================================================== */

    /* ===== Stats Cards ===== */
    /* Lighten the stats card background */
    .stats-card { background: #282e38 !important; }

    /* ===== Badges ===== */
    /* Hide the separater */
    .profile-head .profile-headline-stats__sep { display: none !important; }
    /* Hide the badges container */
    .profile-head .earned-badges-link { display: none !important; }

    /* ========================================================================== */
    /* Navigation + Menus                                                         */
    /* ========================================================================== */

    /* ===== Profile Menu Overflow ===== */
    /* Allow profile menu content to overflow horizontally when needed */
    .profile-menu .profile-menu-content { overflow-x: unset !important; }
  `);

  // Settings modal styles are only needed once the modal is opened, so they are injected lazily
  const SETTINGS_CSS = `
    /* ===== Overlay ===== */
    .rs-settings-overlay { position: fixed; inset: 0; z-index: 10000; display: flex; align-items: center; justify-content: center; padding: 24px; background: rgba(8, 8, 14, 0.74); backdrop-filter: blur(6px); -webkit-backdrop-filter: blur(6px); font-family: 'Proxima Nova', 'Open Sans', Arial, sans-serif; line-height: 1.4; animation: rs-overlay-in 0.18s ease-out; }
    .rs-settings-overlay * { box-sizing: border-box; }
    @keyframes rs-overlay-in { from { opacity: 0; } }

    /* ===== Panel ===== */
    .rs-settings-modal { position: relative; width: 800px; max-width: 100%; max-height: 86vh; display: flex; flex-direction: column; overflow: hidden; background: #1e1e2e; color: #e0e0e0; border: 1px solid #2d2d48; box-shadow: 0 26px 72px rgba(0, 0, 0, 0.62); animation: rs-modal-in 0.22s cubic-bezier(0.16, 1, 0.3, 1); }
    .rs-settings-modal:focus { outline: none; }
    /* The seam covers the rail plus a stub and then stops cold, so the accent reads as a machined edge instead of a fade */
    .rs-settings-modal::before { content: ""; display: block; flex: 0 0 2px; height: 2px; background: linear-gradient(90deg, #4937e9 0%, #5a4bf1 20%, #2d2d48 20%, #2d2d48 100%); }
    @keyframes rs-modal-in { from { opacity: 0; transform: translateY(8px); } }

    /* ===== Header ===== */
    .rs-settings-header { display: flex; align-items: center; gap: 12px; padding: 13px 16px 13px 18px; border-bottom: 1px solid #2d2d48; background: #262640; }
    .rs-settings-mark { width: 30px; height: 30px; flex-shrink: 0; display: flex; align-items: center; justify-content: center; background: #1e1e2e; border: 1px solid #3d3d58; color: #8b8bff; }
    .rs-settings-mark svg { display: block; width: 14px; height: 14px; }
    .rs-settings-header h2 { display: flex; align-items: baseline; gap: 8px; min-width: 0; margin: 0; font-size: 14px; font-weight: 700; letter-spacing: 0.01em; color: #e8e8f0; line-height: 1.2; }
    .rs-settings-version { font-size: 10.5px; font-weight: 500; letter-spacing: 0.06em; color: #8888a8; line-height: 1.2; }
    .rs-settings-close { margin-left: auto; width: 28px; height: 28px; flex-shrink: 0; display: flex; align-items: center; justify-content: center; padding: 0; background-color: transparent; border: 1px solid transparent; color: #7d7d9e; font-family: inherit; font-size: 18px; line-height: 1; cursor: pointer; transition: color 0.14s, background-color 0.14s, border-color 0.14s; }
    .rs-settings-close:hover { color: #e8e8f0; border-color: #3d3d58; background-color: rgba(255, 255, 255, 0.06); }
    .rs-settings-close:focus-visible { outline: 2px solid #4937e9; outline-offset: 2px; }

    /* ===== Split Body ===== */
    .rs-settings-main { flex: 1 1 auto; min-height: 0; display: grid; grid-template-columns: clamp(132px, 18%, 168px) minmax(0, 1fr); }

    /* ===== Nav Rail ===== */
    .rs-settings-nav { display: flex; flex-direction: column; padding: 16px 0; background: #191926; border-right: 1px solid #2d2d48; overflow-y: auto; scrollbar-width: thin; scrollbar-color: #333348 transparent; }
    .rs-settings-nav-label { padding: 0 18px 10px; font-size: 9px; font-weight: 700; letter-spacing: 0.2em; line-height: 1; text-transform: uppercase; color: #4d4d68; }
    .rs-settings-tablist { display: flex; flex-direction: column; align-items: stretch; }
    .rs-settings-tab { position: relative; display: flex; align-items: center; gap: 10px; width: 100%; padding: 11px 16px; background-color: transparent; border: none; color: #7d7d9e; font-family: inherit; font-size: 11.5px; font-weight: 600; letter-spacing: 0.02em; line-height: 1.3; text-align: left; cursor: pointer; transition: color 0.14s, background-color 0.14s; }
    .rs-settings-tab:hover { color: #c8c8dc; background-color: rgba(255, 255, 255, 0.035); }
    .rs-settings-tab:focus-visible { outline: 2px solid #4937e9; outline-offset: -2px; }
    .rs-settings-tab--active, .rs-settings-tab--active:hover { color: #e8e8f0; background-color: #262640; }
    .rs-settings-tab--active::before { content: ""; position: absolute; top: 0; bottom: 0; left: 0; width: 2px; background-color: #4937e9; }
    .rs-settings-tab-index { font-size: 9px; font-weight: 700; letter-spacing: 0.08em; color: #4d4d68; transition: color 0.14s; }
    .rs-settings-tab--active .rs-settings-tab-index { color: #8b8bff; }

    /* ===== Scrolling Content ===== */
    .rs-settings-content { min-width: 0; overflow-y: auto; overscroll-behavior: contain; scrollbar-width: thin; scrollbar-color: #3d3d58 transparent; }
    .rs-settings-content::-webkit-scrollbar { width: 10px; }
    .rs-settings-content::-webkit-scrollbar-track { background: transparent; }
    .rs-settings-content::-webkit-scrollbar-thumb { background: #3d3d58; border: 2px solid #1e1e2e; }
    .rs-settings-content::-webkit-scrollbar-thumb:hover { background: #4d4d6e; }
    .rs-settings-panel { display: none; padding: 22px 24px 26px; }
    .rs-settings-panel--active { display: block; animation: rs-panel-fade 0.16s ease-out; }
    .rs-settings-panel:focus-visible { outline: 2px solid #4937e9; outline-offset: -4px; }
    @keyframes rs-panel-fade { from { opacity: 0; transform: translateY(3px); } }
    .rs-settings-intro { margin: 0 0 18px; font-size: 12px; line-height: 1.65; color: #9898b4; }

    /* ===== Sections ===== */
    .rs-settings-section + .rs-settings-section, .rs-settings-list + .rs-settings-section { margin-top: 22px; }
    .rs-settings-section-head { display: flex; align-items: center; gap: 10px; min-height: 14px; margin-bottom: 10px; }
    .rs-settings-section-title { font-size: 9.5px; font-weight: 700; letter-spacing: 0.18em; line-height: 1; text-transform: uppercase; color: #8888a8; }
    .rs-settings-section-rule { flex: 1 1 auto; height: 1px; background-color: #2d2d48; }
    .rs-settings-section-lead { margin: 0 0 10px; font-size: 11px; line-height: 1.5; color: #8888a8; }

    /* ===== Rows ===== */
    .rs-settings-list { border: 1px solid #2d2d48; }
    .rs-settings-row { position: relative; display: grid; grid-template-columns: minmax(0, 1fr) auto; align-items: center; gap: 16px; padding: 11px 14px 11px 15px; transition: background-color 0.14s; }
    .rs-settings-row + .rs-settings-row { border-top: 1px solid #2d2d48; }
    .rs-settings-row:hover { background-color: rgba(255, 255, 255, 0.022); }
    .rs-settings-row:focus-within { background-color: rgba(255, 255, 255, 0.03); }
    .rs-settings-row:has(.rs-settings-toggle) { cursor: pointer; }
    /* The edge tick sits on the list border so an enabled row carries a quieter second signal */
    .rs-settings-row::before { content: ""; position: absolute; top: -1px; bottom: -1px; left: -1px; width: 2px; background-color: transparent; transition: background-color 0.14s; }
    .rs-settings-row:has(.rs-settings-toggle:checked)::before { background-color: #4937e9; }
    .rs-settings-row--stack { grid-template-columns: minmax(0, 1fr); gap: 10px; }
    .rs-settings-label { min-width: 0; }
    .rs-settings-label strong { display: block; font-size: 12.5px; font-weight: 600; color: #e8e8f0; line-height: 1.35; }
    .rs-settings-label small { display: block; margin-top: 2px; font-size: 11px; line-height: 1.45; color: #8888a8; }

    /* ===== Square Toggle ===== */
    .rs-settings-toggle { position: relative; flex-shrink: 0; width: 38px; height: 20px; margin: 0; appearance: none; -webkit-appearance: none; background-color: #191926; border: 1px solid #3d3d58; cursor: pointer; transition: background-color 0.16s, border-color 0.16s; }
    .rs-settings-toggle::before { content: ""; position: absolute; top: 1px; left: 1px; width: 14px; height: 14px; background-color: #6f6f92; transition: transform 0.16s cubic-bezier(0.16, 1, 0.3, 1), background-color 0.16s; }
    .rs-settings-toggle:hover { border-color: #5c5c78; }
    .rs-settings-toggle:checked { background-color: #4937e9; border-color: #5a4bf1; }
    .rs-settings-toggle:checked::before { transform: translateX(20px); background-color: #fff; }
    .rs-settings-toggle:focus-visible { outline: 2px solid #4937e9; outline-offset: 2px; }

    /* ===== Select ===== */
    .rs-settings-select { flex-shrink: 0; width: 180px; height: 30px; padding: 0 26px 0 9px; appearance: none; -webkit-appearance: none; background-color: #262640; background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='10' viewBox='0 0 10 10'%3E%3Cpath d='M1.5 3.5L5 7L8.5 3.5' fill='none' stroke='%238888a8' stroke-width='1.4'/%3E%3C/svg%3E"); background-repeat: no-repeat; background-position: right 9px center; border: 1px solid #3d3d58; color: #e0e0e0; font-family: inherit; font-size: 12px; line-height: 28px; cursor: pointer; transition: border-color 0.14s, background-color 0.14s; }
    .rs-settings-select:hover { border-color: #5c5c78; background-color: #2d2d48; }
    .rs-settings-select:focus-visible { outline: 2px solid #4937e9; outline-offset: 1px; border-color: #4937e9; }
    .rs-settings-select option { background-color: #262640; color: #e0e0e0; }

    /* ===== Segmented Control ===== */
    .rs-settings-segmented { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); border: 1px solid #3d3d58; }
    .rs-settings-segment { padding: 8px 4px 7px; background-color: transparent; border: none; border-left: 1px solid #2d2d48; color: #8888a8; font-family: inherit; font-size: 10px; font-weight: 700; letter-spacing: 0.08em; line-height: 1.2; text-transform: uppercase; cursor: pointer; transition: background-color 0.14s, color 0.14s; }
    .rs-settings-segment:first-child { border-left: none; }
    .rs-settings-segment:hover { color: #d0d0e4; background-color: rgba(255, 255, 255, 0.04); }
    .rs-settings-segment:focus-visible { outline: 2px solid #4937e9; outline-offset: -2px; }
    .rs-settings-segment--active, .rs-settings-segment--active:hover { color: #fff; background-color: #4937e9; }

    /* ===== Profile Chips ===== */
    .rs-settings-chips { display: flex; flex-wrap: wrap; gap: 6px; }
    .rs-settings-chip { display: inline-flex; align-items: center; gap: 8px; padding: 7px 11px; background-color: rgba(73, 55, 233, 0.16); border: 1px solid #4b3be0; color: #d8d6f8; font-family: inherit; font-size: 11.5px; font-weight: 600; line-height: 1.2; cursor: pointer; transition: background-color 0.14s, border-color 0.14s, color 0.14s; }
    .rs-settings-chip:hover { background-color: rgba(73, 55, 233, 0.28); border-color: #6c5ce7; color: #fff; }
    .rs-settings-chip:focus-visible { outline: 2px solid #4937e9; outline-offset: 2px; }
    .rs-settings-chip-mark { width: 5px; height: 5px; flex-shrink: 0; background-color: #9a8bff; transition: background-color 0.14s, box-shadow 0.14s; }
    .rs-settings-chip--off { background-color: #191926; border-style: dashed; border-color: #3d3d58; color: #5c5c78; }
    .rs-settings-chip--off .rs-settings-chip-mark { background-color: transparent; box-shadow: inset 0 0 0 1px #4d4d68; }
    .rs-settings-chip--off .rs-settings-chip-label { text-decoration: line-through; text-decoration-color: #4d4d68; }
    .rs-settings-chip--off:hover { background-color: #1e1e2e; border-color: #4d4d68; color: #9898b4; }

    /* ===== Text Buttons ===== */
    .rs-settings-link { padding: 1px 0 0; background-color: transparent; border: none; color: #8b8bff; font-family: inherit; font-size: 9.5px; font-weight: 700; letter-spacing: 0.14em; line-height: 1; text-transform: uppercase; cursor: pointer; transition: color 0.14s; }
    .rs-settings-link:hover { color: #b6b6ff; text-decoration: underline; }
    .rs-settings-link:focus-visible { outline: 2px solid #4937e9; outline-offset: 3px; }
    .rs-settings-link + .rs-settings-link { margin-left: 10px; padding-left: 11px; border-left: 1px solid #2d2d48; }

    /* ===== About ===== */
    .rs-about-hero { display: flex; align-items: center; gap: 15px; padding-bottom: 16px; border-bottom: 1px solid #2d2d48; }
    .rs-about-mark { position: relative; width: 48px; height: 48px; flex-shrink: 0; display: flex; align-items: center; justify-content: center; background-color: #1a1a29; background-image: linear-gradient(rgba(73, 55, 233, 0.14), rgba(73, 55, 233, 0) 70%); border: 1px solid #3d3d58; color: #8b8bff; }
    .rs-about-mark svg { display: block; width: 22px; height: 22px; }
    /* Registration brackets hang off the corners so the mark reads as a stamped plate */
    .rs-about-mark::before, .rs-about-mark::after { content: ""; position: absolute; width: 9px; height: 9px; border: 1px solid #5a4bf1; }
    .rs-about-mark::before { top: -4px; left: -4px; border-right: 0; border-bottom: 0; }
    .rs-about-mark::after { right: -4px; bottom: -4px; border-top: 0; border-left: 0; }
    .rs-about-hero-body { min-width: 0; }
    .rs-about-hero-top { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; }
    .rs-about-wordmark { font-size: 17px; font-weight: 700; letter-spacing: 0.005em; line-height: 1.2; color: #f0f0f8; }
    .rs-about-tagline { margin: 6px 0 0; font-size: 12px; line-height: 1.55; color: #9898b4; }

    /* ===== About Chips ===== */
    .rs-about-chip { display: inline-flex; align-items: center; padding: 3px 7px; background-color: #262640; border: 1px solid #3d3d58; color: #a0a0c0; font-size: 9px; font-weight: 700; letter-spacing: 0.13em; line-height: 1.35; text-transform: uppercase; text-decoration: none; transition: color 0.14s, border-color 0.14s, background-color 0.14s; }
    .rs-about-chip--version { background-color: rgba(73, 55, 233, 0.16); border-color: #4b3be0; color: #b6b6ff; letter-spacing: 0.1em; }
    a.rs-about-chip:hover { color: #e8e8f0; border-color: #5c5c78; background-color: #2d2d48; }
    a.rs-about-chip:focus-visible { outline: 2px solid #4937e9; outline-offset: 2px; }

    /* ===== About Credits ===== */
    .rs-about-credits { margin-top: 20px; }
    .rs-about-source { position: relative; padding: 11px 0 12px 13px; transition: background-color 0.14s; }
    .rs-about-source + .rs-about-source { border-top: 1px solid #2d2d48; }
    .rs-about-source::before { content: ""; position: absolute; top: -1px; bottom: -1px; left: 0; width: 2px; background-color: transparent; transition: background-color 0.14s; }
    .rs-about-source:hover { background-color: rgba(255, 255, 255, 0.022); }
    .rs-about-source:hover::before, .rs-about-source:focus-within::before { background-color: #4937e9; }
    .rs-about-source-head { display: flex; flex-wrap: wrap; align-items: center; gap: 6px 10px; }
    .rs-about-source-name { font-size: 13px; font-weight: 700; line-height: 1.3; color: #e8e8f0; }
    .rs-about-source-head .rs-about-chip { margin-left: auto; }
    .rs-about-source-note { margin: 3px 0 0; font-size: 11px; line-height: 1.5; color: #8888a8; }

    /* ===== About Links ===== */
    .rs-about-links { display: flex; flex-wrap: wrap; align-items: center; }
    .rs-about-source .rs-about-links { margin-top: 8px; }
    .rs-about-links a { color: #a7a7ff; font-size: 10.5px; font-weight: 600; letter-spacing: 0.03em; line-height: 1.4; text-decoration: none; transition: color 0.14s; }
    .rs-about-links a + a { margin-left: 9px; padding-left: 10px; border-left: 1px solid #2d2d48; }
    .rs-about-links a:hover { color: #cbcbff; text-decoration: underline; text-underline-offset: 2px; }
    .rs-about-links a:focus-visible { outline: 2px solid #4937e9; outline-offset: 2px; }

    /* ===== About Footer ===== */
    .rs-about-footer { display: flex; flex-wrap: wrap; align-items: center; gap: 8px 14px; margin-top: 18px; padding-top: 11px; border-top: 1px solid #2d2d48; }
    .rs-about-legal { font-size: 9.5px; font-weight: 700; letter-spacing: 0.12em; line-height: 1.4; text-transform: uppercase; color: #5c5c78; }
    .rs-about-legal a { color: #8b8bff; text-decoration: none; border-bottom: 1px solid transparent; transition: color 0.14s, border-color 0.14s; }
    .rs-about-legal a:hover { color: #b6b6ff; border-bottom-color: currentColor; }
    .rs-about-legal a:focus-visible { outline: 2px solid #4937e9; outline-offset: 2px; }
    .rs-about-footer .rs-about-links { margin-left: auto; }

    /* ===== Footer ===== */
    /* The content column is the only scroll container, so this bar stays put without position: sticky */
    .rs-settings-footer { display: flex; align-items: center; gap: 12px; padding: 11px 16px 11px 18px; border-top: 1px solid #2d2d48; background-color: #191926; }
    .rs-settings-status { display: flex; align-items: center; gap: 8px; font-size: 9.5px; font-weight: 700; letter-spacing: 0.12em; text-transform: uppercase; color: #5c5c78; }
    .rs-settings-status::before { content: ""; width: 5px; height: 5px; flex-shrink: 0; background-color: #3d3d58; }
    .rs-settings-status--dirty { color: #e0b070; }
    .rs-settings-status--dirty::before { background-color: #e0b070; }
    .rs-settings-actions { display: flex; align-items: center; gap: 8px; margin-left: auto; }

    /* ===== Buttons ===== */
    .rs-settings-btn { padding: 7px 12px; background-color: transparent; border: 1px solid transparent; color: #9696b4; font-family: inherit; font-size: 9.5px; font-weight: 700; letter-spacing: 0.12em; line-height: 1.2; text-transform: uppercase; cursor: pointer; transition: color 0.14s, background-color 0.14s, border-color 0.14s; }
    .rs-settings-btn:focus-visible { outline: 2px solid #4937e9; outline-offset: 2px; }
    .rs-settings-btn--ghost { border-color: #2d2d48; color: #9696b4; }
    .rs-settings-btn--ghost:hover { color: #e0e0e0; border-color: #3d3d58; background-color: rgba(255, 255, 255, 0.04); }
    .rs-settings-btn--compact { padding: 6px 10px; font-size: 9px; }
    .rs-settings-btn--primary { padding: 8px 16px; background-color: #4937e9; border-color: #5a4bf1; color: #fff; }
    .rs-settings-btn--primary:hover { background-color: #5a4bf1; border-color: #6c5ce7; }

    /* ===== Narrow Viewports ===== */
    @media (max-width: 620px) {
      .rs-settings-overlay { padding: 0; align-items: stretch; }
      .rs-settings-modal { width: 100%; height: 100%; max-height: 100%; border: none; }
      .rs-settings-header { padding: 11px 14px; gap: 10px; }
      .rs-settings-main { grid-template-columns: minmax(0, 1fr); grid-template-rows: auto minmax(0, 1fr); }
      /* The rail flattens into two cells and the active bar rotates onto the bottom edge */
      .rs-settings-nav { padding: 0; border-right: none; border-bottom: 1px solid #2d2d48; overflow: visible; }
      .rs-settings-nav-label { display: none; }
      .rs-settings-tablist { flex-direction: row; }
      .rs-settings-tab { flex: 1 1 0; justify-content: center; gap: 6px; padding: 11px 4px; border-right: 1px solid #2d2d48; }
      .rs-settings-tab:last-child { border-right: none; }
      .rs-settings-tab--active::before { top: auto; bottom: 0; left: 0; right: 0; width: auto; height: 2px; }
      .rs-settings-panel { padding: 16px 14px 20px; }
      /* Select rows stack so the value keeps the full width instead of squeezing the label */
      .rs-settings-row:has(.rs-settings-select) { grid-template-columns: minmax(0, 1fr); gap: 8px; }
      .rs-settings-row:has(.rs-settings-select) .rs-settings-select { width: 100%; }
      .rs-settings-footer { flex-wrap: wrap; gap: 8px; padding: 10px 14px; }
      .rs-settings-status { order: 0; flex: 1 1 100%; }
      .rs-settings-actions { order: 1; flex: 1 1 100%; flex-wrap: wrap; margin-left: 0; }
      .rs-settings-actions .rs-settings-btn--primary { order: 0; flex: 1 1 100%; }
      .rs-settings-actions .rs-settings-btn--ghost { order: 1; flex: 1 1 100%; }
      .rs-about-footer .rs-about-links { margin-left: 0; flex: 1 1 100%; }
    }

    @media (max-height: 620px) {
      .rs-settings-modal { max-height: 94vh; }
      .rs-settings-header { padding: 10px 16px; }
      .rs-settings-tab { padding-top: 9px; padding-bottom: 9px; }
      .rs-settings-panel { padding: 16px 20px 20px; }
      .rs-settings-footer { padding: 9px 16px; }
    }

    @media (prefers-reduced-motion: reduce) {
      .rs-settings-overlay, .rs-settings-modal, .rs-settings-panel--active,
      .rs-settings-close, .rs-settings-tab, .rs-settings-tab-index, .rs-settings-row,
      .rs-settings-row::before, .rs-settings-toggle, .rs-settings-toggle::before,
      .rs-settings-select, .rs-settings-segment, .rs-settings-chip,
      .rs-settings-chip-mark, .rs-settings-link, .rs-settings-btn,
      .rs-about-chip, .rs-about-source, .rs-about-source::before,
      .rs-about-links a, .rs-about-legal a {
        animation: none !important;
        transition: none !important;
      }
    }
  `;

  let settingsStyleInjected = false;

  function ensureSettingsStyles() {
    if (settingsStyleInjected) return;
    settingsStyleInjected = true;
    GM_addStyle(SETTINGS_CSS);
  }

  // ============================================================================
  // Configuration
  // ============================================================================

  const ConfigStore = {
    defaults() {
      return this.normalize({});
    },

    normalize(config) {
      const source = config && typeof config === 'object' ? config : {};
      const bool = key => (typeof source[key] === 'boolean' ? source[key] : DEFAULT_CONFIG[key]);

      const validLanguage = DUB_LANGUAGES.some(language => language.value === source.dubLanguage);
      const validConfidence = DUB_CONFIDENCE_LEVELS.some(level => level.value === source.dubConfidence);

      const normalized = {
        dubInfo: bool('dubInfo'),
        dubLanguage: validLanguage ? source.dubLanguage : DEFAULT_CONFIG.dubLanguage,
        dubConfidence: validConfidence ? source.dubConfidence : DEFAULT_CONFIG.dubConfidence,
        debugLogging: bool('debugLogging')
      };

      for (const option of PROFILE_MENU_OPTIONS) normalized[option.key] = bool(option.key);
      return normalized;
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

  // Everything that has to change when a config (saved, previewed, or restored) takes effect
  function applyConfigEffects(config, announce = true) {
    setDebugLogging(config.debugLogging, announce);
    ProfileMenuFeature.apply(config);
  }

  // ============================================================================
  // Page context + anime ID resolution
  // ============================================================================

  const PageContext = {
    cachedHrefs: null,
    cachedIds: null,

    identity() {
      const match = location.pathname.match(WETRAKR_PATH_PATTERN);
      if (!match) return null;

      const [, section, id] = match;
      const type = section === 'shows' ? 'show' : 'movie';
      return { id: Number(id), type, key: `${type}:${id}` };
    },

    // The external link list is re-read on every pass, so the parsed result is cached against the raw hrefs
    externalIds() {
      const hrefs = [...$$(SELECTORS.externalLinks)].map(link => link.getAttribute('href') || '');
      const joined = hrefs.join('\n');
      if (this.cachedIds && joined === this.cachedHrefs) return this.cachedIds;

      const ids = { mal: null, anilist: null, imdb: null, tmdb: null, tvdb: null, tvdbType: null };

      for (const href of hrefs) {
        let match;
        if ((match = href.match(/myanimelist\.net\/anime\/(\d+)/i))) ids.mal = Number(match[1]);
        else if ((match = href.match(/anilist\.co\/anime\/(\d+)/i))) ids.anilist = Number(match[1]);
        else if ((match = href.match(/imdb\.com\/title\/(tt\d+)/i))) ids.imdb = match[1];
        else if ((match = href.match(/themoviedb\.org\/(?:movie|tv)\/(\d+)/i))) ids.tmdb = Number(match[1]);
        else if ((match = href.match(/thetvdb\.com\/(?:dereferrer\/)?(series|movie)\/(\d+)/i))) {
          ids.tvdbType = match[1].toLowerCase();
          ids.tvdb = Number(match[2]);
        }
      }

      this.cachedHrefs = joined;
      this.cachedIds = ids;
      return ids;
    },

    hasRelevantIds(ids) {
      return Boolean(ids.mal || ids.anilist || ids.imdb || ids.tmdb || ids.tvdb);
    },

    signature(identity, ids, language, confidence) {
      return [
        identity.key,
        language,
        confidence,
        ids.mal,
        ids.anilist,
        ids.imdb,
        ids.tmdb,
        ids.tvdb,
        ids.tvdbType
      ].join('|');
    }
  };

  const AnimeIdResolver = {
    candidates(identity, ids) {
      const candidates = [];

      if (ids.anilist) {
        candidates.push({ source: 'anilist', id: ids.anilist, label: 'AniList' });
      }

      if (ids.tmdb) {
        candidates.push({
          source: 'themoviedb',
          id: `${identity.type === 'show' ? 'tv' : 'movie'}/${ids.tmdb}`,
          label: 'TMDB'
        });
      }

      if (ids.imdb) {
        candidates.push({ source: 'imdb', id: ids.imdb, label: 'IMDb' });
      }

      if (ids.tvdb && identity.type === 'show' && ids.tvdbType !== 'movie') {
        candidates.push({ source: 'thetvdb', id: ids.tvdb, label: 'TheTVDB' });
      }

      return candidates;
    },

    async resolve(identity, ids) {
      if (ids.mal) {
        return { mal: ids.mal, anilist: ids.anilist, via: 'WeTrakr/MyAnimeList' };
      }

      const hit = await Providers.animeapi.resolveFirst(this.candidates(identity, ids));
      if (!hit) return null;

      return {
        mal: hit.mal,
        anilist: ids.anilist || hit.anilist,
        via: `AnimeAPI/${hit.label}`
      };
    }
  };

  // ============================================================================
  // DOM features
  // ============================================================================

  const TimeFormatter = {
    // Cheap pre-check so the three regex replacements only run on text that can actually change
    QUICK: /\d{2}:\d{2}|\d{1,2}\.\d{2}\s?[AP]M/i,
    DATE_TIME: /(\d{2}\/\d{2}\/\d{4}) \| (\d{2}):(\d{2})(?!\s*[AP]M)/gi,
    DOT_TIME: /· (\d{2}):(\d{2})(?!\s*[AP]M)/gi,
    DOTTED_PERIOD: /(\d{1,2})\.(\d{2})\s?(AM|PM)/gi,

    to12Hour(hours, minutes) {
      const period = hours >= 12 ? 'PM' : 'AM';
      const hour = hours % 12 || 12;
      return `${hour}:${String(minutes).padStart(2, '0')} ${period}`;
    },

    convertNode(node) {
      const original = node.nodeValue;
      if (!original || !this.QUICK.test(original)) return false;

      const converted = original
        .replace(this.DATE_TIME, (_, date, hour, minute) => `${date} | ${this.to12Hour(+hour, +minute)}`)
        .replace(this.DOT_TIME, (_, hour, minute) => `· ${this.to12Hour(+hour, +minute)}`)
        .replace(this.DOTTED_PERIOD, '$1:$2 $3');

      if (converted === original) return false;
      node.nodeValue = converted;
      return true;
    }
  };

  const StatusBadgeFeature = {
    BADGE_SELECTOR: '.detail-status-badge--airing:not(.rs-hidden-original):not(.rs-clone), .detail-status-badge--status:not(.rs-hidden-original):not(.rs-clone)',

    reset() {
      for (const clone of $$('.rs-clone')) clone.remove();
      for (const original of $$('.rs-hidden-original')) original.classList.remove('rs-hidden-original');
    },

    apply() {
      const stacks = $$(SELECTORS.titleStack);
      if (!stacks.length) return;

      const titleStack = [...stacks].find(element => element.offsetParent !== null);
      if (!titleStack || $('.rs-clone', titleStack)) return;

      const heading = $('.we-heading-1', titleStack);
      const statusBadge = $('.detail-status-line:not(.detail-meta-line)', titleStack)?.querySelector(this.BADGE_SELECTOR);
      if (!heading || !statusBadge) return;

      statusBadge.classList.add('rs-hidden-original');

      const clone = statusBadge.cloneNode(true);
      clone.classList.remove('rs-hidden-original');
      clone.classList.add('rs-clone');
      titleStack.prepend(clone);
    }
  };

  const TrackingTitleFeature = {
    isTrackingPage() {
      return TRACKING_PATH_PATTERN.test(location.pathname);
    },

    parentPath() {
      return location.pathname.replace(/\/tracking\/?$/, '');
    },

    reset() {
      for (const link of $$('a.rs-tracking-title-link')) link.replaceWith(...link.childNodes);
    },

    apply() {
      if (!this.isTrackingPage()) return;

      const target = this.parentPath();
      for (const title of $$(SELECTORS.trackingTitle)) {
        if (title.closest('a.rs-tracking-title-link')) continue;

        const link = document.createElement('a');
        link.className = 'rs-tracking-title-link';
        link.href = target;
        title.before(link);
        link.appendChild(title);
      }
    }
  };

  const TimestampFeature = {
    apply() {
      let converted = 0;

      for (const element of $$(SELECTORS.timestampTargets)) {
        for (const child of element.childNodes) {
          if (child.nodeType === Node.TEXT_NODE && TimeFormatter.convertNode(child)) converted++;
        }
      }

      if (converted) logger.debug(`Converted ${converted} timestamp${plural(converted)}`);
    }
  };

  const ReviewFeature = {
    TRUNCATED: /(…|\.\.\.)$/,
    LESS: /less/i,

    apply() {
      const buttons = $$(SELECTORS.reviewReadmore);
      if (!buttons.length) return;

      let expanded = 0;
      for (const button of buttons) {
        const card = button.closest('we-comment-card');
        if (!card || card.dataset.rsReviewExpanded) continue;

        card.dataset.rsReviewExpanded = 'true';

        const text = $(SELECTORS.reviewText, card)?.textContent.trimEnd() ?? '';
        if (!this.TRUNCATED.test(text) || this.LESS.test(button.textContent)) continue;

        button.click();
        expanded++;
      }

      if (expanded) logger.debug(`Expanded ${expanded} review card${plural(expanded)}`);
    }
  };

  const OverviewFeature = {
    intercepted: false,
    // A toggle is clicked at most once. Re-clicking before the site finishes re-rendering would collapse it again
    clicked: new WeakSet(),

    TOGGLE_GROUPS: Object.freeze([
      { selector: SELECTORS.overviewToggles, expand: 'see more', collapse: 'see less' },
      { selector: SELECTORS.episodeToggles, expand: 'read more', collapse: 'show less' }
    ]),

    isExcluded() {
      return location.pathname.startsWith('/people');
    },

    interceptClicks() {
      if (this.intercepted) return;
      this.intercepted = true;

      document.addEventListener('click', event => {
        if (this.isExcluded()) return;

        const closest = selector => event.target.closest?.(selector);
        if (closest(SELECTORS.overviewToggles) || closest('a[href]') || !closest(SELECTORS.overviewBlocks)) return;

        event.preventDefault();
        event.stopPropagation();
      }, true);
    },

    apply() {
      if (this.isExcluded()) return;
      this.interceptClicks();

      for (const block of $$(SELECTORS.overviewBlocks)) {
        if (block.style.cursor !== 'text') block.style.cursor = 'text';
      }

      let expanded = 0;
      for (const { selector, expand, collapse } of this.TOGGLE_GROUPS) {
        for (const toggle of $$(selector)) {
          const label = toggle.textContent.trim().toLowerCase();

          if (label.startsWith(expand)) {
            if (this.clicked.has(toggle)) continue;
            this.clicked.add(toggle);
            toggle.click();
            expanded++;
          } else if (!label.startsWith(collapse)) {
            continue;
          }

          if (toggle.style.display !== 'none') toggle.style.display = 'none';
        }
      }

      if (expanded) logger.debug(`Expanded ${expanded} overview${plural(expanded)}`);
    }
  };

  const ProfileMenuFeature = {
    lastCss: null,

    css(config) {
      const selectors = PROFILE_MENU_OPTIONS
        .filter(option => config?.[option.key] === false)
        .map(option => option.selector);

      return selectors.length ? `${selectors.join(',\n')} { display: none !important; }` : '';
    },

    styleElement() {
      let style = document.getElementById(OWN_STYLE_ID);
      if (!style) {
        style = document.createElement('style');
        style.id = OWN_STYLE_ID;
        (document.head || document.documentElement).appendChild(style);
      }
      return style;
    },

    // Hiding happens through a generated stylesheet rather than inline styles, so the site re-rendering the menu cannot undo it
    apply(config = App.config) {
      const css = this.css(config);
      const style = document.getElementById(OWN_STYLE_ID);

      // Skip only when nothing changed and the stylesheet is still attached
      if (css === this.lastCss && (style?.isConnected || !css)) return;

      this.lastCss = css;
      if (css || style) this.styleElement().textContent = css;
    }
  };

  // ============================================================================
  // Dub UI
  // ============================================================================

  const DubView = {
    row() {
      return $(SELECTORS.metaBox)?.querySelector('.rs-dub-info') || null;
    },

    clear() {
      this.row()?.remove();
    },

    render(label) {
      const metaBox = $(SELECTORS.metaBox);
      if (!metaBox) return;

      let row = metaBox.querySelector('.rs-dub-info');

      if (!label) {
        row?.remove();
        return;
      }

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

      // Writing identical text still replaces the text node and would wake the observer on every pass
      const value = row.querySelector('.detail-meta-box__value');
      if (value.textContent !== label) value.textContent = label;
    }
  };

  // ============================================================================
  // Dub orchestration
  // ============================================================================

  const DubService = {
    generation: 0,
    active: null,
    results: new Map(),
    unresolved: new Set(),
    failures: new Map(),

    // Abandons any in-flight lookup without discarding what has already been learned
    cancel() {
      this.generation++;
      this.active = null;
    },

    reset() {
      this.cancel();
      this.results.clear();
      this.unresolved.clear();
      this.failures.clear();
      DubView.clear();
    },

    remember(signature, label) {
      this.results.set(signature, label);
      if (this.results.size > DUB_CACHE_LIMIT) {
        this.results.delete(this.results.keys().next().value);
      }
    },

    async apply() {
      if (SettingsUI.isOpen) return;

      if (!App.config.dubInfo) {
        DubView.clear();
        return;
      }

      const identity = PageContext.identity();
      if (!identity || !$(SELECTORS.metaBox)) {
        DubView.clear();
        return;
      }

      const ids = PageContext.externalIds();
      if (!PageContext.hasRelevantIds(ids)) return;

      const { dubLanguage: language, dubConfidence: confidence } = App.config;
      const signature = PageContext.signature(identity, ids, language, confidence);

      if (this.results.has(signature)) {
        DubView.render(this.results.get(signature));
        return;
      }

      if (this.active === signature || this.unresolved.has(signature)) return;
      if (Date.now() < (this.failures.get(signature) ?? 0)) return;

      const generation = this.generation;
      const isCurrent = () => generation === this.generation &&
        this.active === signature &&
        PageContext.identity()?.key === identity.key;

      this.active = signature;

      try {
        const resolved = await AnimeIdResolver.resolve(identity, ids);
        if (!isCurrent()) return;

        if (!resolved?.mal) {
          this.unresolved.add(signature);
          DubView.clear();
          logger.debug('No MyAnimeList ID could be resolved', { identity, ids });
          return;
        }

        const dubbed = await Providers.mydublist.isDubbed(resolved.mal, { language, confidence });
        if (!isCurrent()) return;

        const label = dubbed ? Providers.mydublist.formatDubLabel(language) : null;
        this.remember(signature, label);
        this.failures.delete(signature);
        DubView.render(label);

        logger.debug('MyDubList dub result', {
          identity,
          mal: resolved.mal,
          anilist: resolved.anilist,
          via: resolved.via,
          language,
          confidence,
          dubbed
        });
      } catch (error) {
        if (!isCurrent()) return;

        this.failures.set(signature, Date.now() + FAILURE_COOLDOWN);
        DubView.clear();
        logger.debug('Dub lookup failed', { identity, ids, error: errorMessage(error) });
      } finally {
        if (this.active === signature) this.active = null;
      }
    }
  };

  // ============================================================================
  // Settings UI
  // ============================================================================

  const SettingsUI = {
    modal: null,
    isOpen: false,
    activeTab: 'features',
    saved: null,
    draft: null,
    returnFocus: null,

    tabs: Object.freeze([
      { name: 'features', label: 'Features' },
      { name: 'about', label: 'About' }
    ]),
    steps: Object.freeze({ ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }),
    FOCUSABLE: 'button:not([disabled]):not([tabindex="-1"]), select, input, [tabindex="0"]',

    logoMark() {
      return '<svg viewBox="0 0 16 16" aria-hidden="true" focusable="false"><rect x="0" y="0" width="7" height="7" fill="currentColor" opacity="0.35"/><rect x="9" y="0" width="7" height="7" fill="currentColor" opacity="0.35"/><rect x="0" y="9" width="7" height="7" fill="currentColor" opacity="0.35"/><rect x="9" y="9" width="7" height="7" fill="currentColor"/></svg>';
    },

    // Confidence reads better as four fixed choices than as a dropdown, so that one field renders as a radiogroup
    isSegmented(field) {
      return field.key === 'dubConfidence';
    },

    // The schema hint describes the setting; this row needs the consequence, which no other row shares
    hint(field) {
      return field.key === 'dubConfidence' ? 'Higher levels hide dubs that are less certain' : field.hint;
    },

    chipLabel(field, visible) {
      return visible ?
        `Hide ${field.label} from the profile menu` :
        `Show ${field.label} in the profile menu`;
    },

    // ---- Rendering ----------------------------------------------------------

    renderNav() {
      const tabs = this.tabs.map((tab, index) => {
        const active = tab.name === this.activeTab;
        return `
              <button type="button" class="rs-settings-tab${active ? ' rs-settings-tab--active' : ''}" id="rs-tab-${tab.name}" role="tab" aria-selected="${active}" aria-controls="rs-panel-${tab.name}" tabindex="${active ? '0' : '-1'}" data-tab="${tab.name}"><span class="rs-settings-tab-index">${String(index + 1).padStart(2, '0')}</span>${tab.label}</button>`;
      }).join('');

      return `
        <nav class="rs-settings-nav" aria-label="Settings">
          <span class="rs-settings-nav-label" id="rs-nav-label">Sections</span>
          <div class="rs-settings-tablist" role="tablist" aria-orientation="vertical" aria-labelledby="rs-nav-label">${tabs}
          </div>
        </nav>`;
    },

    renderLabel(field) {
      return `
          <span class="rs-settings-label">
            <strong>${escapeHtml(field.label)}</strong>
            <small>${escapeHtml(this.hint(field))}</small>
          </span>`;
    },

    renderToggle(field) {
      return `
        <label class="rs-settings-row">${this.renderLabel(field)}
          <input type="checkbox" class="rs-settings-toggle" data-key="${field.key}" ${this.draft[field.key] ? 'checked' : ''}>
        </label>`;
    },

    renderSelect(field) {
      const options = field.options.map(option =>
        `<option value="${escapeHtml(option.value)}" ${this.draft[field.key] === option.value ? 'selected' : ''}>${escapeHtml(option.name)}</option>`
      ).join('');

      return `
        <label class="rs-settings-row">${this.renderLabel(field)}
          <select class="rs-settings-select" data-key="${field.key}">${options}</select>
        </label>`;
    },

    renderSegmented(field) {
      const labelId = `rs-label-${field.key}`;
      const value = this.draft[field.key];

      const cells = field.options.map(option => {
        const active = option.value === value;
        return `<button type="button" class="rs-settings-segment${active ? ' rs-settings-segment--active' : ''}" role="radio" aria-checked="${active}" tabindex="${active ? '0' : '-1'}" data-value="${escapeHtml(option.value)}">${escapeHtml(option.name)}</button>`;
      }).join('');

      return `
        <div class="rs-settings-row rs-settings-row--stack">
          <div class="rs-settings-label">
            <strong id="${labelId}">${escapeHtml(field.label)}</strong>
            <small>${escapeHtml(this.hint(field))}</small>
          </div>
          <div class="rs-settings-segmented" data-key="${field.key}" role="radiogroup" aria-labelledby="${labelId}">${cells}</div>
        </div>`;
    },

    renderChip(option) {
      const field = FIELDS_BY_KEY.get(option.key);
      const visible = Boolean(this.draft[option.key]);

      return `<button type="button" class="rs-settings-chip${visible ? '' : ' rs-settings-chip--off'}" data-key="${option.key}" aria-pressed="${visible}" aria-label="${escapeHtml(this.chipLabel(field, visible))}" title="${escapeHtml(option.hint)}"><span class="rs-settings-chip-mark" aria-hidden="true"></span><span class="rs-settings-chip-label">${escapeHtml(option.label)}</span></button>`;
    },

    renderField(key) {
      const field = FIELDS_BY_KEY.get(key);
      if (!field) return '';

      if (this.isSegmented(field)) return this.renderSegmented(field);
      if (field.type === 'select') return this.renderSelect(field);
      return this.renderToggle(field);
    },

    renderSectionHead(id, title, extra = '') {
      return `
            <div class="rs-settings-section-head">
              <span class="rs-settings-section-title" id="${id}">${title}</span>
              <span class="rs-settings-section-rule"></span>${extra}
            </div>`;
    },

    renderFeaturesPanel() {
      const active = this.activeTab === 'features';

      return `
        <div class="rs-settings-panel${active ? ' rs-settings-panel--active' : ''}" role="tabpanel" id="rs-panel-features" data-panel="features" aria-labelledby="rs-tab-features" tabindex="-1">
          <p class="rs-settings-intro">Dub availability on detail pages and the buttons in your profile menu.</p>
          <section class="rs-settings-section" aria-labelledby="rs-section-dub">${this.renderSectionHead('rs-section-dub', 'Dub information')}
            <div class="rs-settings-list">
              ${this.renderField('dubInfo')}
              ${this.renderField('dubLanguage')}
              ${this.renderField('dubConfidence')}
            </div>
          </section>
          <section class="rs-settings-section" aria-labelledby="rs-section-profile">${this.renderSectionHead('rs-section-profile', 'Profile menu', `
              <button type="button" class="rs-settings-link" data-profile-bulk="show">Show all</button>
              <button type="button" class="rs-settings-link" data-profile-bulk="hide">Hide all</button>`)}
            <p class="rs-settings-section-lead">Highlighted buttons stay highlighted. Click one to hide it.</p>
            <div class="rs-settings-chips">${PROFILE_MENU_OPTIONS.map(option => this.renderChip(option)).join('')}</div>
          </section>
          <section class="rs-settings-section" aria-labelledby="rs-section-troubleshooting">${this.renderSectionHead('rs-section-troubleshooting', 'Troubleshooting')}
            <div class="rs-settings-list">
              ${this.renderField('debugLogging')}
              <div class="rs-settings-row">
                <div class="rs-settings-label">
                  <strong>Cached lookups</strong>
                  <small>AnimeAPI mappings and MyDubList datasets held in memory</small>
                </div>
                <button type="button" class="rs-settings-btn rs-settings-btn--ghost rs-settings-btn--compact" data-action="clear-cache">Clear cache</button>
              </div>
            </div>
          </section>
        </div>`;
    },

    renderSource({ name, license, licenseUrl, note, links }) {
      return `
              <article class="rs-about-source">
                <div class="rs-about-source-head">
                  <span class="rs-about-source-name">${name}</span>
                  <a class="rs-about-chip" href="${licenseUrl}" target="_blank" rel="noopener noreferrer">${license}</a>
                </div>
                <p class="rs-about-source-note">${note}</p>
                <div class="rs-about-links">
                  ${links.map(([label, url]) => `<a href="${url}" target="_blank" rel="noopener noreferrer">${label}</a>`).join('\n                  ')}
                </div>
              </article>`;
    },

    renderAboutPanel() {
      const active = this.activeTab === 'about';

      const sources = [
        {
          name: 'MyDubList',
          license: 'CC BY 4.0',
          licenseUrl: 'https://creativecommons.org/licenses/by/4.0/',
          note: 'Supplies the dub availability and language coverage shown on each title.',
          links: [
            ['mydublist.com', 'https://mydublist.com'],
            ['Repository', 'https://github.com/Joelis57/MyDubList']
          ]
        },
        {
          name: 'AnimeAPI',
          license: 'ODbL v1.0',
          licenseUrl: 'https://opendatacommons.org/licenses/odbl/1-0/',
          note: 'Matches external IDs so a title resolves to the right dub record.',
          links: [
            ['animeapi.my.id', 'https://animeapi.my.id'],
            ['animeApi', 'https://github.com/nattadasu/animeApi'],
            ['Anime Offline Database', 'https://github.com/cedya77/anime-offline-database']
          ]
        }
      ];

      return `
        <div class="rs-settings-panel${active ? ' rs-settings-panel--active' : ''}" role="tabpanel" id="rs-panel-about" data-panel="about" aria-labelledby="rs-tab-about" tabindex="-1">
          <div class="rs-about-hero">
            <span class="rs-about-mark" aria-hidden="true">${this.logoMark()}</span>
            <div class="rs-about-hero-body">
              <div class="rs-about-hero-top">
                <span class="rs-about-wordmark">WeTrakr Mods</span>
                <span class="rs-about-chip rs-about-chip--version">v${escapeHtml(SCRIPT.version)}</span>
              </div>
              <p class="rs-about-tagline">Dub availability on detail pages, a tidier profile menu, and small fixes across the detail view.</p>
            </div>
          </div>
          <section class="rs-about-credits" aria-labelledby="rs-about-credits-title">${this.renderSectionHead('rs-about-credits-title', 'Data sources')}
            <div class="rs-about-sources">${sources.map(source => this.renderSource(source)).join('')}
            </div>
          </section>
          <div class="rs-about-footer">
            <span class="rs-about-legal"><a href="https://github.com/StylusThemes/Userscripts/blob/main/LICENSE" target="_blank" rel="noopener noreferrer">MIT</a> &middot; Journey Over</span>
            <div class="rs-about-links">
              <a href="https://github.com/StylusThemes/Userscripts" target="_blank" rel="noopener noreferrer">Source</a>
              <a href="https://github.com/StylusThemes/Userscripts/issues" target="_blank" rel="noopener noreferrer">Report an issue</a>
            </div>
          </div>
        </div>`;
    },

    renderModal() {
      return `
        <div class="rs-settings-modal" role="dialog" aria-modal="true" aria-labelledby="rs-settings-title" tabindex="-1">
          <div class="rs-settings-header">
            <span class="rs-settings-mark" aria-hidden="true">${this.logoMark()}</span>
            <h2 id="rs-settings-title">WeTrakr Mods <span class="rs-settings-version">v${escapeHtml(SCRIPT.version)}</span></h2>
            <button type="button" class="rs-settings-close" aria-label="Close settings">&times;</button>
          </div>
          <div class="rs-settings-main">
            ${this.renderNav()}
            <div class="rs-settings-content">
              ${this.renderFeaturesPanel()}
              ${this.renderAboutPanel()}
            </div>
          </div>
          <div class="rs-settings-footer">
            <span class="rs-settings-status" aria-live="polite">No unsaved changes</span>
            <div class="rs-settings-actions">
              <button type="button" class="rs-settings-btn rs-settings-btn--ghost" data-action="reset">Restore defaults</button>
              <button type="button" class="rs-settings-btn rs-settings-btn--primary" data-action="save">Save &amp; close</button>
            </div>
          </div>
        </div>`;
    },

    // ---- State --------------------------------------------------------------

    isDirty() {
      return SETTINGS_FIELDS.some(field => this.draft[field.key] !== this.saved[field.key]);
    },

    updateDirty() {
      const status = $('.rs-settings-status', this.modal);
      if (!status) return;

      const dirty = this.isDirty();
      const text = dirty ? 'Unsaved changes' : 'No unsaved changes';
      if (status.textContent !== text) status.textContent = text;
      status.classList.toggle('rs-settings-status--dirty', dirty);
    },

    applyPreview(field) {
      if (field?.preview === 'logging') setDebugLogging(this.draft.debugLogging, true);
      else if (field?.preview === 'profile') ProfileMenuFeature.apply(this.draft);
    },

    syncControl(control) {
      const key = control.dataset.key;
      const field = FIELDS_BY_KEY.get(key);
      const value = this.draft[key];

      if (control.classList.contains('rs-settings-segmented')) {
        for (const cell of control.querySelectorAll('.rs-settings-segment')) {
          const active = cell.dataset.value === value;
          cell.classList.toggle('rs-settings-segment--active', active);
          cell.setAttribute('aria-checked', String(active));
          cell.tabIndex = active ? 0 : -1;
        }
      } else if (control.classList.contains('rs-settings-chip')) {
        const visible = Boolean(value);
        control.classList.toggle('rs-settings-chip--off', !visible);
        control.setAttribute('aria-pressed', String(visible));
        control.setAttribute('aria-label', this.chipLabel(field, visible));
      } else if (control.type === 'checkbox') {
        control.checked = Boolean(value);
      } else {
        control.value = value;
      }
    },

    syncFields() {
      for (const control of $$('[data-key]', this.modal)) this.syncControl(control);
    },

    commit(key, value) {
      const field = FIELDS_BY_KEY.get(key);
      if (!field || this.draft[key] === value) return;

      this.draft[key] = value;
      this.applyPreview(field);
      this.syncFields();
      this.updateDirty();
    },

    // ---- Navigation ---------------------------------------------------------

    switchPanel(name) {
      this.activeTab = name;
      if (!this.modal) return;

      for (const tab of $$('.rs-settings-tab', this.modal)) {
        const active = tab.dataset.tab === name;
        tab.classList.toggle('rs-settings-tab--active', active);
        tab.setAttribute('aria-selected', String(active));
        tab.tabIndex = active ? 0 : -1;
      }
      for (const panel of $$('.rs-settings-panel', this.modal)) {
        panel.classList.toggle('rs-settings-panel--active', panel.dataset.panel === name);
      }
      $('.rs-settings-content', this.modal).scrollTop = 0;
    },

    cyclePanel(step) {
      const names = this.tabs.map(tab => tab.name);
      const next = names[(names.indexOf(this.activeTab) + step + names.length) % names.length];

      this.switchPanel(next);
      $(`#rs-tab-${next}`, this.modal)?.focus();
    },

    cycleSegment(group, step, current) {
      const cells = [...group.querySelectorAll('.rs-settings-segment')];
      const index = Math.max(cells.indexOf(current), 0);
      const next = cells[(index + step + cells.length) % cells.length];

      this.commit(group.dataset.key, next.dataset.value);
      next.focus();
    },

    trapFocus(event) {
      const focusable = [...$$(this.FOCUSABLE, this.modal)].filter(element => element.offsetParent !== null);
      if (!focusable.length) return;

      const first = focusable[0];
      const last = focusable.at(-1);
      const current = document.activeElement;

      if (event.shiftKey && (current === first || !this.modal.contains(current))) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && (current === last || !this.modal.contains(current))) {
        event.preventDefault();
        first.focus();
      }
    },

    flashButton(button, temporaryText, normalText) {
      button.textContent = temporaryText;
      setTimeout(() => {
        if (button.isConnected) button.textContent = normalText;
      }, 1500);
    },

    // ---- Actions ------------------------------------------------------------

    actions: {
      'clear-cache'(button) {
        const mappingEntries = Providers.animeapi.clearMappingCache();
        Providers.mydublist.clearCache();
        DubService.reset();
        logger(`Request cache cleared (${mappingEntries} mapping entr${plural(mappingEntries, 'y', 'ies')} plus MyDubList datasets)`);
        SettingsUI.flashButton(button, 'Cleared!', 'Clear cache');
      },

      reset(button) {
        Object.assign(SettingsUI.draft, ConfigStore.defaults());
        applyConfigEffects(SettingsUI.draft);
        SettingsUI.syncFields();
        SettingsUI.updateDirty();
        logger('Settings restored to defaults');
        SettingsUI.flashButton(button, 'Restored!', 'Restore defaults');
      },

      save() {
        App.config = ConfigStore.save(SettingsUI.draft);
        applyConfigEffects(App.config);

        logger('Settings saved', {
          dubInfo: App.config.dubInfo,
          dubLanguage: App.config.dubLanguage,
          dubConfidence: App.config.dubConfidence,
          hiddenProfileButtons: PROFILE_MENU_OPTIONS
            .filter(option => !App.config[option.key])
            .map(option => option.label),
          debugLogging: App.config.debugLogging
        });

        SettingsUI.close();
        App.schedule();
      }
    },

    setAllProfileButtons(visible) {
      for (const option of PROFILE_MENU_OPTIONS) this.draft[option.key] = visible;
      ProfileMenuFeature.apply(this.draft);
      this.syncFields();
      this.updateDirty();
    },

    // All interaction is delegated from the overlay, so nothing has to be rebound when controls change
    bind(overlay) {
      overlay.addEventListener('click', event => {
        const target = event.target;
        if (target === overlay || target.closest('.rs-settings-close')) return this.cancel();

        const tab = target.closest('.rs-settings-tab');
        if (tab) return this.switchPanel(tab.dataset.tab);

        const chip = target.closest('.rs-settings-chip');
        if (chip) return this.commit(chip.dataset.key, !this.draft[chip.dataset.key]);

        const segment = target.closest('.rs-settings-segment');
        if (segment) return this.commit(segment.closest('[data-key]').dataset.key, segment.dataset.value);

        const bulk = target.closest('[data-profile-bulk]');
        if (bulk) return this.setAllProfileButtons(bulk.dataset.profileBulk === 'show');

        const action = target.closest('[data-action]');
        if (action) this.actions[action.dataset.action]?.(action);
      });

      overlay.addEventListener('change', event => {
        const control = event.target.closest('[data-key]');
        if (!control) return;

        if (control.type === 'checkbox') this.commit(control.dataset.key, control.checked);
        else if (control.tagName === 'SELECT') this.commit(control.dataset.key, control.value);
      });

      overlay.addEventListener('keydown', event => {
        // Keep the site's own hotkeys from firing while the dialog is in use
        event.stopPropagation();

        if (event.key === 'Escape') {
          event.preventDefault();
          this.cancel();
          return;
        }

        if (event.key === 'Tab') {
          this.trapFocus(event);
          return;
        }

        const step = this.steps[event.key];
        if (!step) return;

        // Arrows drive the control under focus when that control handles them itself
        const group = event.target.closest('.rs-settings-segmented');
        if (group) {
          event.preventDefault();
          this.cycleSegment(group, step, event.target.closest('.rs-settings-segment'));
          return;
        }

        if (event.target.closest('select, input, textarea')) return;

        event.preventDefault();
        this.cyclePanel(step);
      });
    },

    // ---- Lifecycle ----------------------------------------------------------

    cancel() {
      applyConfigEffects(this.saved);
      this.close();
      App.schedule();
    },

    close() {
      const returnFocus = this.returnFocus;

      this.modal?.remove();
      this.modal = null;
      this.isOpen = false;
      this.activeTab = 'features';
      this.saved = null;
      this.draft = null;
      this.returnFocus = null;

      if (returnFocus?.isConnected) returnFocus.focus({ preventScroll: true });
    },

    open() {
      if (this.modal) return;

      ensureSettingsStyles();

      this.isOpen = true;
      this.activeTab = 'features';
      this.saved = ConfigStore.normalize(App.config);
      this.draft = ConfigStore.normalize(this.saved);
      this.returnFocus = document.activeElement;

      const overlay = document.createElement('div');
      overlay.className = 'rs-settings-overlay';
      overlay.innerHTML = this.renderModal();

      document.body.appendChild(overlay);
      this.modal = overlay;

      this.bind(overlay);
      this.updateDirty();

      // Focusing the panel puts Esc and the rail arrows in reach before the first click
      $('.rs-settings-panel--active', overlay).focus({ preventScroll: true });
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

    // Order matters: the badge clone must exist before the dub row is rendered
    features: Object.freeze([
      ['status badge', StatusBadgeFeature],
      ['tracking title', TrackingTitleFeature],
      ['timestamps', TimestampFeature],
      ['reviews', ReviewFeature],
      ['overviews', OverviewFeature],
      ['dub info', DubService]
    ]),

    handleRouteChange() {
      if (location.pathname === this.lastPath) return;

      const previousPath = this.lastPath;
      this.lastPath = location.pathname;

      StatusBadgeFeature.reset();
      TrackingTitleFeature.reset();
      DubService.cancel();
      DubView.clear();

      logger('SPA navigation detected', { from: previousPath, to: this.lastPath });
    },

    // One failing feature must never take the others down with it
    runFeature(name, feature) {
      const fail = error => logger.debug(`Feature "${name}" failed`, errorMessage(error));

      try {
        const result = feature.apply();
        if (result?.catch) result.catch(fail);
      } catch (error) {
        fail(error);
      }
    },

    run() {
      this.handleRouteChange();
      for (const [name, feature] of this.features) this.runFeature(name, feature);
    },

    schedule() {
      if (this.framePending) return;
      this.framePending = true;

      requestAnimationFrame(() => {
        this.framePending = false;
        this.run();
      });
    },

    // Mutations caused by the script's own nodes (modal, clones, dub row) never need another pass
    isOwnMutation(record) {
      const target = record.target.nodeType === Node.ELEMENT_NODE ? record.target : record.target.parentElement;
      if (target?.closest(OWN_NODE_SELECTOR)) return true;

      if (record.type !== 'childList') return false;

      const changed = [...record.addedNodes, ...record.removedNodes];
      return changed.length > 0 && changed.every(node => node.nodeType === Node.ELEMENT_NODE && node.matches(OWN_NODE_SELECTOR));
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
      this.observer = new MutationObserver(records => {
        if (records.some(record => !this.isOwnMutation(record))) this.schedule();
      });

      this.observer.observe(document.body, {
        childList: true,
        subtree: true,
        characterData: true,
        attributes: true,
        attributeFilter: ['class']
      });
    },

    // Keep other open tabs in step when settings are saved elsewhere
    watchRemoteConfig() {
      if (typeof GM_addValueChangeListener !== 'function') return;

      GM_addValueChangeListener(CONFIG_KEY, (_name, _old, value, remote) => {
        if (!remote || SettingsUI.isOpen) return;

        this.config = ConfigStore.normalize(value);
        applyConfigEffects(this.config);
        this.schedule();
      });
    },

    start() {
      this.config = ConfigStore.load();
      setDebugLogging(this.config.debugLogging);
      ProfileMenuFeature.apply(this.config);

      GM_registerMenuCommand('WeTrakr Mods Settings', () => SettingsUI.open());

      this.startObserver();
      this.hookHistoryMethod('pushState');
      this.hookHistoryMethod('replaceState');
      window.addEventListener('popstate', () => this.schedule());
      this.watchRemoteConfig();

      logger('WeTrakr Mods started', {
        version: SCRIPT.version,
        path: location.pathname,
        debugLogging: this.config.debugLogging
      });

      this.run();
    }
  };

  App.start();
})();
