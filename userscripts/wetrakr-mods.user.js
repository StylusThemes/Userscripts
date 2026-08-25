// ==UserScript==
// @name          WeTrakr - Mods
// @version       1.9.1
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
// @grant         GM_listValues
// @grant         GM_deleteValue
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
    /* Hide the circular progress ring on the avatar because it clashes with the square theme. */
    svg.ring { display: none !important; }

    /* ==== Actor credit bar ===== */
    .media-item__sort-badge { background: #6B3041 !important; } /* not 100% sure on where to stick this at yet, but global is fine for now */

    /* ========================================================================== */
    /* Detail Pages                                                               */
    /* ========================================================================== */

    /* ===== Title Stack: Actor ===== */
    .detail-grid--person .person-badge-department { font-size: 14px !important; margin: 5px 0 0 12px !important; }
    .detail-grid--person [class="detail-status-line"] .detail-status-badge { background: none !important; padding: 0 !important; }
    .detail-grid--person [class="detail-status-line"] .detail-status-badge + .detail-status-badge::before { content: "∙"; margin: 0 10px 0 4px; font-weight: bold; }

    /* ===== Title Stack: Movies + Shows ===== */
    /* Exact class match targets only the plain detail grid, never modifier grids such as --person, --season, or --episode. */
    [class="detail-grid"] .title-stack { display: flex; flex-direction: column; }
    [class="detail-grid"] .title-stack .we-heading-1 { order: 1; }
    [class="detail-grid"] .title-stack .detail-status-line.detail-meta-line { order: 2; margin-bottom: var(--space-2); }
    [class="detail-grid"] .title-stack .detail-status-line:not(.detail-meta-line) { order: 3; margin-bottom: 15px; }
    [class="detail-grid"] .detail-status-badge.rs-clone { align-self: center; margin-left: var(--space-2); margin-right: 0; margin-bottom: -4px; }
    [class="detail-grid"] .detail-status-badge.rs-clone:not(.detail-status-badge--airing) { border: 1px solid currentColor; border-radius: var(--radius-1); padding: 2px 6px; background: none; }
    [class="detail-grid"] .detail-status-line.detail-meta-line .detail-status-badge { background: none !important; padding: 0 !important; }
    [class="detail-grid"] .detail-status-line.detail-meta-line .detail-status-badge + .detail-status-badge::before { content: "∙"; margin: 0 10px 0 4px; font-weight: bold; }
    [class="detail-grid"] .detail-overview-block .we-text-body.detail-directed-by { padding-bottom: 15px; }

    /* ===== Title Stack: Season ===== */
    .detail-grid--season .detail-grid__info .title-stack.title-center { display: flex !important; flex-direction: column !important; }
    /* 1. Season navigation pill */
    .detail-grid--season .detail-grid__info .title-stack .detail-nav-links--season { order: 1; }
    /* 2. Show title: promoted to main heading while hiding the "/ Season X" portion */
    .detail-grid--season .detail-grid__info .title-stack .detail-breadcrumb { order: 2; }
    .detail-grid--season .detail-grid__info .title-stack .detail-breadcrumb a.we-link-body { font-size: var(--font-size-4) !important; font-weight: 800 !important; letter-spacing: -0.02em; line-height: var(--line-height-0); color: #fff; text-decoration: none; }
    .detail-grid--season .detail-grid__info .title-stack .detail-breadcrumb a.we-link-body:hover { color: #8283ff; }
    .detail-grid--season .detail-grid__info .title-stack .detail-breadcrumb span, .detail-grid--season .detail-grid__info .title-stack .detail-breadcrumb .detail-breadcrumb__current { display: none !important; }
    /* 3. Season number: demoted to secondary heading */
    .detail-grid--season .detail-grid__info .title-stack .we-heading-1 { order: 3; font-size: 22px !important; font-weight: 700 !important; letter-spacing: 0.4px !important; }
    .detail-grid--season .detail-grid__info .title-stack .we-heading-1 .we-text-accent { display: none; }
    /* 4. Date and episode count */
    .detail-grid--season .detail-grid__info .title-stack > p.we-text-body:not(.detail-breadcrumb) { order: 4; margin-bottom: 10px !important; font-size: var(--font-size-0); font-weight: 600; letter-spacing: 0.6px; text-transform: uppercase; }

    /* ===== Title Stack: Episode ===== */
    .detail-grid--episode .detail-grid__info .title-stack.title-center { display: flex !important; flex-flow: row wrap !important; align-items: baseline !important; }
    /* 1. Episode navigation pill */
    .detail-grid--episode .detail-grid__info .title-stack .detail-nav-links { order: 1; flex-basis: 100%; }
    /* Breadcrumb becomes invisible as a box so its children participate directly in the flex layout. */
    .detail-grid--episode .detail-grid__info .title-stack .detail-breadcrumb { display: contents; }
    /* 2. New Episode and New Season badges */
    .detail-grid--episode .detail-grid__info .title-stack .episode-milestone-badge-detail, .detail-grid--episode .detail-grid__info .title-stack .episode-upcoming-icon-detail { position: static !important; margin-right: 7px; order: 2; }
    .detail-grid--episode .detail-grid__info .title-stack .badge-linebreak { order: 2; flex-basis: 100%; width: 0; height: 0; }
    /* 3. Episode title: placed on its own line and enlarged */
    .detail-grid--episode .detail-grid__info .title-stack .detail-breadcrumb a.we-link-body:first-child { order: 3; font-size: var(--font-size-4) !important; font-weight: 800 !important; letter-spacing: -0.02em; line-height: var(--line-height-0); color: #fff; text-decoration: none; margin-bottom: -3px; }
    .detail-grid--episode .detail-grid__info .title-stack .detail-breadcrumb a.we-link-body:hover { color: #8283ff; }
    .detail-grid--episode .detail-grid__info .title-stack .ep-linebreak { order: 3; flex-basis: 100%; width: 0; height: 0; }
    .detail-grid--episode .detail-grid__info .title-stack .detail-breadcrumb span:not(.detail-breadcrumb__current):not(.ep-linebreak) { display: none !important; }
    /* 4. Episode details: season number, episode number, and episode title */
    .detail-grid--episode .detail-grid__info .title-stack .detail-breadcrumb a.we-link-body:nth-of-type(2) { order: 4; font-size: 22px !important; font-weight: 700 !important; letter-spacing: 0.4px !important; text-decoration: none; }
    .detail-grid--episode .detail-grid__info .title-stack .detail-breadcrumb .detail-breadcrumb__current { order: 5; font-size: 22px !important; font-weight: 700 !important; letter-spacing: 0.4px !important; }
    .detail-grid--episode .detail-grid__info .title-stack .detail-breadcrumb .detail-breadcrumb__current::before { content: "∙"; margin: 0 6px; }
    .detail-grid--episode .detail-grid__info .title-stack .we-heading-1 { order: 6; font-size: 22px !important; font-weight: 700 !important; letter-spacing: 0.4px !important; }
    .detail-grid--episode .detail-grid__info .title-stack .we-heading-1::before { content: "–"; margin: 0 2px 0 6px; }
    .detail-grid--episode .detail-grid__info .title-stack .we-heading-1 .we-text-accent { display: none; }
    /* 5. Date and runtime */
    .detail-grid--episode .detail-grid__info .title-stack > p.we-text-body:not(.detail-breadcrumb) { order: 7; flex-basis: 100%; margin-bottom: 10px !important; font-size: var(--font-size-0); font-weight: 600; letter-spacing: 0.6px; text-transform: uppercase; }

    /* ===== Title Stack: Tracking ===== */
    .detail-grid--min .title-stack.title-center { display: flex; flex-direction: column; }
    /* 1. Title */
    .detail-grid--min .title-stack .we-heading-1 { order: 1; }
    /* 2. Meta line: dates, seasons, and runtime */
    .detail-grid--min .title-stack .detail-status-line.detail-meta-line { order: 2; margin-bottom: var(--space-2); }
    /* 3. Status line: airing status and genres */
    .detail-grid--min .title-stack .detail-status-line:not(.detail-meta-line) { order: 3; margin-bottom: 15px; }
    /* Airing badge: cloned beside the title and vertically centered */
    .detail-grid--min .detail-status-badge.rs-clone { align-self: center; margin-left: var(--space-2); margin-right: 0; margin-bottom: -4px; }
    .detail-grid--min .detail-status-badge.rs-clone:not(.detail-status-badge--airing) { border: 1px solid currentColor; border-radius: var(--radius-1); padding: 2px 6px; background: none; }
    /* Meta badges: flattened and separated with dots */
    .detail-grid--min .detail-status-line.detail-meta-line .detail-status-badge { background: none !important; padding: 0 !important; }
    .detail-grid--min .detail-status-line.detail-meta-line .detail-status-badge + .detail-status-badge::before { content: "∙"; margin: 0 10px 0 4px; font-weight: bold; }

    /* ===== All Watched Block ===== */
    /* Hide the "still ongoing" hint and its remove-all-watched toggle shown for ongoing shows. */
    .watching-details--all-watched { display: none !important; }

    /* ===== Dub Information ===== */
    .detail-meta-box .rs-dub-info { display: flex; flex-direction: row; align-items: baseline; justify-content: space-between; gap: var(--space-3); padding: var(--space-4) var(--space-4); }
    .detail-meta-box .rs-dub-info .detail-meta-box__label { display: flex; align-items: center; gap: var(--space-2); flex-shrink: 0; font-size: var(--font-size-0); font-weight: 600; color: #fff; letter-spacing: 0.04em; line-height: 1.4; margin: 0; }
    .detail-meta-box .rs-dub-info .detail-meta-box__value { font-size: var(--font-size-0); font-weight: 400; color: #96a4af; line-height: 1.4; text-align: right; margin: 0; min-width: 0; overflow-wrap: anywhere; word-break: break-word; }

    /* ========================================================================== */
    /* Media Items                                                                */
    /* ========================================================================== */

    /* ===== Hover Border ===== */
    .media-item__border-overlay, .episode-item__border-overlay { display: none !important; }

    /* ===== Upcoming Section ===== */
    /* Hide upcoming items without a progress bar, such as already-watched episodes. */
    #upcoming we-item-poster:not(:has(.media-item__progress)) { display: none !important; }

    /* ===== Release / Watched Date ===== */
    /* Keep the eye icon, date, and time on one line to prevent wrapping and misalignment on narrow cards. */
    .entity-release-date .wd-full { flex-wrap: unset !important; }

    /* ===== Empty Cards ===== */
    [class="we-empty-card"] { display: none; }
    [class="tracking-layout"] { display: unset !important; } /* Seems to be needed otherwise there is a huge gap between the tabs and watching when hiding the empty card */

    /* ========================================================================== */
    /* Reviews                                                                    */
    /* ========================================================================== */

    /* Add New */
    /* Change the "Add New" font coloring to match "Top" */
    .reviews-section__add-btn { color: #96a4af !important; }

    /* ===== Review Card ===== */
    /* Give every review a visible containing shape so author, text, pills, and Reply all clearly belong to one card. */
     we-review-card { display: block !important; background: rgba(255, 255, 255, 0.03) !important; border: 1px solid #2d2d48 !important; margin-bottom: 16px !important; padding: 16px !important; transition: border-color 0.15s !important; }
    .review-card:not(.review-card--reply) { background: unset !important; }
    /* Tighten the gap between profile picture and rating and change size of rating font slightly */
    .review-card__rating { margin-top: 0 !important; font-size: 13px !important; }
    /* Slightly reduce the font size of the author name, date and handle */
    .review-card__author-name, .review-card__date, .review-card__handle { font-size: 13px !important; }
    /* Make the pills text color match the other pills */
    .review-card__reaction-pill, .review-card__view-replies { color: #96a4af !important; }

    /* ===== Review Text ===== */
    /* Slightly darken the text instead of just making white */
    .review-card__text { color: #cacdd1 !important; }
    /* Long reviews become scrollable instead of clamped with no way to read the rest. Short reviews are unaffected since they never exceed the cap. */
    .review-card__text--clamp, .review-card__text--highlight { display: block !important; -webkit-line-clamp: unset !important; max-height: 360px !important; overflow-y: auto !important; scrollbar-width: thin; scrollbar-color: #333348 transparent; padding-right: 6px; }
    .review-card__text--clamp::-webkit-scrollbar, .review-card__text--highlight::-webkit-scrollbar { width: 6px; }
    .review-card__text--clamp::-webkit-scrollbar-track, .review-card__text--highlight::-webkit-scrollbar-track { background: transparent; }
    .review-card__text--clamp::-webkit-scrollbar-thumb, .review-card__text--highlight::-webkit-scrollbar-thumb { background: #333348; }
    /* Hide the site's read more button now that long reviews scroll instead. */
    .review-card__readmore { display: none !important; }
    /* Spoiler and non-spoiler review text share one size; the we-spoiler-text rule guards against site styles targeting the custom element directly. */
    .review-card__text, .review-card__text we-spoiler-text { font-size: 14px !important; }

    /* ========================================================================== */
    /* Navigation + Menus                                                         */
    /* ========================================================================== */

    /* ===== Profile Menu Overflow ===== */
    .profile-menu .profile-menu-content { overflow-x: unset !important; }

    /* ===== Hide Profile Header Toggle ===== */
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
  // Cache Manager
  // ==========================================
  const ModuleCache = {
    isKey(key) {
      return key.startsWith('dub-') || key.startsWith('anilist-');
    },
    get(key) {
      const entry = GM_getValue(key);
      if (entry && (Date.now() - entry.time) < CACHE_DURATION) {
        return entry.value;
      }
      return undefined; // Distinguishes from null which might be a cached negative response
    },
    set(key, value) {
      GM_setValue(key, { value, time: Date.now() });
    },
    clearExpired() {
      let cleared = 0;
      for (const key of GM_listValues()) {
        if (!this.isKey(key)) continue;
        const entry = GM_getValue(key);
        if (!entry || (Date.now() - entry.time) > CACHE_DURATION) {
          GM_deleteValue(key);
          cleared++;
        }
      }
      if (cleared) logger.debug(`Cleared ${cleared} expired cache entries`);
    },
    clearAll() {
      let cleared = 0;
      for (const key of GM_listValues()) {
        if (this.isKey(key)) {
          GM_deleteValue(key);
          cleared++;
        }
      }
      logger.debug(`Cleared ${cleared} cache entries manually`);
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
    convertDurationNode(node) {
      // Converts "10053h 10m" / "77h 18m" / "61h" style durations into
      // "1y 1mo 23d 21h 10m" / "3d 5h 18m" / "2d 13h".
      // Idempotent: the hours portion after conversion is always < 24, so a
      // re-run matches it back to itself and leaves the text unchanged.
      const original = node.textContent;
      const newText = original.replace(/(\d+)\s*h(?:\s*(\d+)\s*m(?:in)?)?/gi, (match, hours, minutes) => {
        let rem = +hours * 60 + (+minutes || 0);
        const parts = [];
        for (const [divisor, unit] of [[525600, 'y'], [43200, 'mo'], [1440, 'd'], [60, 'h'], [1, 'm']]) {
          if (rem >= divisor) {
            parts.push(`${Math.floor(rem / divisor)}${unit}`);
            rem %= divisor;
          }
        }
        return parts.join(' ') || '0m';
      });
      if (newText !== original) {
        node.textContent = newText;
        return true;
      }
      return false;
    }
  };

  // ==========================================
  // DOM Modification Modules
  // ==========================================
  const DOMModifiers = {
    getVisibleTitleStack() {
      return [...document.querySelectorAll('.title-stack')].find(element => element.offsetParent !== null);
    },

    getVisibleEpisodeTitleStack() {
      const grid = document.querySelector('.detail-grid--episode .detail-grid__info');
      return grid ? [...grid.querySelectorAll('.title-stack')].find(element => element.offsetParent !== null) : null;
    },

    moveStatusBadge() {
      const titleStack = this.getVisibleTitleStack();
      const h1 = titleStack?.querySelector('.we-heading-1');
      const cert = h1?.querySelector('.detail-certification');
      const statusBadge = titleStack?.querySelector('.detail-status-line:not(.detail-meta-line) .detail-status-badge:not(.rs-hidden-original):not(.rs-clone):not(.detail-status-badge--genre)');

      if (!h1 || !cert || !statusBadge || h1.querySelector('.rs-clone')) return;

      statusBadge.classList.add('rs-hidden-original');
      statusBadge.style.display = 'none';

      const clone = statusBadge.cloneNode(true);
      clone.classList.remove('rs-hidden-original');
      clone.classList.add('rs-clone');
      clone.style.display = '';
      cert.after(clone);
    },

    ensureLineBreakAfter(container, targetSelector, spacerClass) {
      if (!container) return;

      const targets = container.querySelectorAll(targetSelector);
      if (!targets.length) return;

      const lastTarget = targets[targets.length - 1];

      if (lastTarget.nextElementSibling?.classList.contains(spacerClass)) {
        return;
      }

      for (const element of container.querySelectorAll(`.${spacerClass}`)) {
        element.remove();
      }

      const spacer = document.createElement('span');
      spacer.className = spacerClass;
      lastTarget.after(spacer);
    },

    applyEpisodeLineBreaks() {
      const titleStack = this.getVisibleEpisodeTitleStack();
      if (!titleStack) return;
      this.ensureLineBreakAfter(titleStack, '.detail-breadcrumb a.we-link-body:first-child', 'ep-linebreak');
      this.ensureLineBreakAfter(titleStack, '.episode-milestone-badge-detail, .episode-upcoming-icon-detail', 'badge-linebreak');
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

    updateDurations() {
      const elements = document.querySelectorAll('.episode-item__progress-bar-text--episode, .grid-header-total__time, .results-count__time-total');
      if (!elements.length) return;

      let converted = 0;
      for (const element of elements) {
        for (const child of element.childNodes) {
          if (child.nodeType === Node.TEXT_NODE && TimeUtilities.convertDurationNode(child)) {
            converted++;
          }
        }
      }
      if (converted) logger.debug(`Converted ${converted} durations`);
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

    getExternalIds() {
      const ids = { anilist: null, imdb: null, tmdb: null };
      for (const link of document.querySelectorAll('.detail-tags a.detail-tag')) {
        const href = link.getAttribute('href') || '';
        ids.anilist = href.match(/anilist\.co\/anime\/(\d+)/)?.[1] || ids.anilist;
        ids.imdb = href.match(/imdb\.com\/title\/(tt\d+)/)?.[1] || ids.imdb;
        ids.tmdb = href.match(/themoviedb\.org\/(?:movie|tv)\/(\d+)/)?.[1] || ids.tmdb;
      }
      return ids;
    },

    async resolveAnilistId(ids) {
      if (ids.anilist) return ids.anilist;

      const titleKey = ids.imdb || ids.tmdb;
      if (!titleKey) return null;

      const cacheKey = `anilist-${titleKey}`;
      const cached = ModuleCache.get(cacheKey);
      if (cached !== undefined) return cached;

      // Let the caller handle failures so a transient lookup error isn't cached
      // as a definitive "no AniList ID" result.
      const data = await armhaglund.fetchIds(ids.imdb ? 'imdb' : 'themoviedb', titleKey);
      const anilistId = data?.anilist || null;
      ModuleCache.set(cacheKey, anilistId);
      if (!anilistId) logger.warn(`No AniList ID for ${titleKey} (cached 24h)`);
      return anilistId;
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

      const ids = this.getExternalIds();
      // External ID links can sometimes render after the metadata box. Don't lock in a
      // premature "no ID" result; retry on the next DOM update instead.
      if (!ids.anilist && !ids.imdb && !ids.tmdb) return;

      this.hasStarted = true;
      const generation = this.generation;
      const route = location.pathname;

      let anilistId;
      try {
        anilistId = await this.resolveAnilistId(ids);
      } catch (error) {
        if (!this.isCurrent(generation, route)) return;
        logger.error(`Failed to resolve AniList ID: ${error.message}`);
        this.hasStarted = false;
        return;
      }
      if (!this.isCurrent(generation, route)) return;

      if (!anilistId) {
        logger.warn('No AniList ID available for dub info');
        return;
      }

      const { dubLanguage: language } = config;
      const cacheKey = `dub-${anilistId}-${language}`;
      const cached = ModuleCache.get(cacheKey);

      if (cached !== undefined) {
        if (!this.isCurrent(generation, route)) return;
        this.displayDubInfo(cached, language);
        return;
      }

      try {
        const edges = await this.queryAnilistDub(anilistId, language);
        if (!this.isCurrent(generation, route)) return;
        const hasDub = edges.some(edge => edge.voiceActors?.length > 0);
        ModuleCache.set(cacheKey, hasDub);
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
    DOMModifiers.applyEpisodeLineBreaks();
    DOMModifiers.updateTimestamps();
    DOMModifiers.updateDurations();
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
