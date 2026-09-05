// ==UserScript==
// @name          WeTrakr - Mods
// @version       1.15.1
// @description   Modifications and enhancements for WeTrakr
// @author        Journey Over
// @license       MIT
// @match         *://wetrakr.com/*
// @require       https://cdn.jsdelivr.net/gh/StylusThemes/Userscripts@9e8f1b9bdc1acac2e76f3e8d2348f76817ec5bf4/libs/utils/utils.min.js
// @require       https://cdn.jsdelivr.net/gh/StylusThemes/Userscripts@e1613fcefb81ed7b05afe90edc479e06088039f2/libs/metadata/animeapi/animeapi.min.js
// @require       https://cdn.jsdelivr.net/gh/StylusThemes/Userscripts@df79b8fc4607937cfadcf2544eb8798e079ebbf9/libs/metadata/mydublist/mydublist.min.js
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
    name: globalThis.GM_info?.script?.name ?? 'WeTrakr - Mods',
    version: globalThis.GM_info?.script?.version ?? '0.0.0'
  });

  const CONFIG_KEY = 'wetrakr-mods-config';
  const FAILURE_COOLDOWN = 60 * 1000;
  const WETRAKR_PATH_PATTERN = /^\/(shows|movies)\/(\d+)/;
  const MAPPING_TTL = Object.freeze({
    positive: 24 * 60 * 60 * 1000,
    negative: 30 * 60 * 1000
  });

  const SELECTORS = Object.freeze({
    metaBox: '.detail-meta-box--desktop',
    titleStack: '.title-stack',
    externalLinks: '.detail-tags a.detail-tag',
    timestampTargets: '.entity-release-date, .detail-status-badge--airing, .media-item__progress-bar-text--episode',
    collapsedReviews: '.review-card__readmore[aria-expanded="false"]',
    overviewBlocks: '.overview-toggle.clickable',
    overviewToggles: '.overview-toggle .see-toggle'
  });

  const DUB_LANGUAGES = Object.freeze([
    { name: 'Arabic', value: 'ARABIC' },
    { name: 'Catalan', value: 'CATALAN' },
    { name: 'Chinese', value: 'CHINESE' },
    { name: 'Danish', value: 'DANISH' },
    { name: 'Dutch', value: 'DUTCH' },
    { name: 'English', value: 'ENGLISH' },
    { name: 'Finnish', value: 'FINNISH' },
    { name: 'French', value: 'FRENCH' },
    { name: 'German', value: 'GERMAN' },
    { name: 'Hebrew', value: 'HEBREW' },
    { name: 'Hindi', value: 'HINDI' },
    { name: 'Hungarian', value: 'HUNGARIAN' },
    { name: 'Indonesian', value: 'INDONESIAN' },
    { name: 'Italian', value: 'ITALIAN' },
    { name: 'Japanese', value: 'JAPANESE' },
    { name: 'Korean', value: 'KOREAN' },
    { name: 'Lithuanian', value: 'LITHUANIAN' },
    { name: 'Norwegian', value: 'NORWEGIAN' },
    { name: 'Polish', value: 'POLISH' },
    { name: 'Portuguese', value: 'PORTUGUESE' },
    { name: 'Russian', value: 'RUSSIAN' },
    { name: 'Spanish', value: 'SPANISH' },
    { name: 'Swedish', value: 'SWEDISH' },
    { name: 'Filipino', value: 'FILIPINO' },
    { name: 'Thai', value: 'THAI' },
    { name: 'Turkish', value: 'TURKISH' },
    { name: 'Vietnamese', value: 'VIETNAMESE' }
  ]);

  const DUB_CONFIDENCE_LEVELS = Object.freeze([
    { name: 'Low', value: 'low' },
    { name: 'Normal', value: 'normal' },
    { name: 'High', value: 'high' },
    { name: 'Very High', value: 'very-high' }
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
    dubConfidence: 'normal',
    debugLogging: false
  });

  const SETTINGS_FIELDS = Object.freeze([
    { key: 'dubInfo', type: 'toggle', label: 'Dub Information', hint: 'Show dub availability for anime titles', preview: 'dub' },
    { key: 'dubLanguage', type: 'select', label: 'Preferred Dub Language', hint: 'Language to check for', options: DUB_LANGUAGES, preview: 'dub' },
    { key: 'dubConfidence', type: 'select', label: 'Dub Confidence', hint: 'Minimum verification confidence', options: DUB_CONFIDENCE_LEVELS, preview: 'dub' },
    { key: 'debugLogging', type: 'toggle', label: 'Debug Logging', hint: 'Show detailed diagnostic logs in the browser console', preview: 'logging' },
    ...ACTION_COLORS.map(({ key, label, hint }) => ({ key: `actionColors.${key}`, type: 'color', label, hint, preview: 'color' }))
  ]);

  // ============================================================================
  // Logging
  // ============================================================================

  const loggerOptions = { debug: false };
  const logger = Logger(SCRIPT.name, loggerOptions);

  const Providers = Object.freeze({
    animeapi: new AnimeAPI(),
    mydublist: new MyDubList()
  });

  function errorMessage(error) {
    return error?.message || String(error);
  }

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

    /* ===== Title Stack: Tracking ===== */
    .detail-grid--min .title-stack { display: flex; flex-direction: column; }
    /* Airing badge clone: first, own line, above h1 */
    .detail-grid--min .title-stack .detail-status-badge.rs-clone { order: 0; width: fit-content; margin-bottom: 8px; }
    /* Title: second */
    .detail-grid--min .title-stack .we-heading-1 { order: 1; display: unset !important; font-size: 26px; }
    /* Date, seasons, episodes, and runtime line: third */
    .detail-grid--min .title-stack .detail-status-line.detail-meta-line { order: 2; margin-bottom: var(--space-2); }
    /* Genre line with hidden airing badge: fourth, below meta line */
    .detail-grid--min .title-stack .detail-status-line:not(.detail-meta-line) { order: 3; }

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
    .rs-settings-overlay { position: fixed; inset: 0; z-index: 10000; display: flex; align-items: center; justify-content: center; background: rgba(0, 0, 0, 0.6); backdrop-filter: blur(4px); -webkit-backdrop-filter: blur(4px); font-family: 'Proxima Nova', 'Open Sans', Arial, sans-serif; animation: rs-overlay-in 0.2s ease-out; }
    @keyframes rs-overlay-in { from { opacity: 0; } }

    /* ===== Modal Panel ===== */
    .rs-settings-modal { width: 500px; max-width: 90vw; max-height: 85vh; display: flex; flex-direction: column; overflow: hidden; background: #1e1e2e; color: #e0e0e0; border: 1px solid #2d2d48; border-radius: 10px; box-shadow: 0 32px 80px rgba(0, 0, 0, 0.55), 0 0 0 1px rgba(73, 55, 233, 0.1), inset 0 1px 0 rgba(255, 255, 255, 0.03); animation: rs-modal-in 0.3s cubic-bezier(0.16, 1, 0.3, 1); }
    .rs-settings-modal::before { content: ""; display: block; height: 2px; flex-shrink: 0; background: linear-gradient(90deg, #4937e9, #6c5ce7, #4937e9); border-radius: 10px 10px 0 0; }
    @keyframes rs-modal-in { from { opacity: 0; transform: translateY(16px) scale(0.97); } }

    /* ===== Modal Header ===== */
    .rs-settings-header { display: flex; justify-content: space-between; align-items: center; padding: 16px 22px; border-bottom: 1px solid #2d2d48; background: linear-gradient(180deg, rgba(73, 55, 233, 0.06) 0%, transparent 100%); }
    .rs-settings-header h2 { margin: 0; font-size: 15px; font-weight: 700; letter-spacing: 0.3px; color: #e8e8f0; }
    .rs-settings-close { width: 30px; height: 30px; display: flex; align-items: center; justify-content: center; background: none; border: 1px solid transparent; color: #666680; font-size: 20px; line-height: 1; cursor: pointer; transition: color 0.15s, border-color 0.15s, background 0.15s; border-radius: 6px; }
    .rs-settings-close:hover { color: #e0e0e0; border-color: #2d2d48; background: rgba(255, 255, 255, 0.04); }

    /* ===== Tab Bar ===== */
    .rs-settings-tabs { display: flex; border-bottom: 1px solid #2d2d48; background: rgba(0, 0, 0, 0.1); padding: 0 12px; }
    .rs-settings-tab { flex: 1; padding: 13px 8px; background: none; border: none; color: #5c5c78; font-size: 12.5px; font-weight: 600; cursor: pointer; position: relative; transition: color 0.2s; letter-spacing: 0.3px; font-family: inherit; }
    .rs-settings-tab:hover { color: #9898b4; }
    .rs-settings-tab--active { color: #e0e0e0; }
    .rs-settings-tab--active::after { content: ""; position: absolute; bottom: -1px; left: 0; right: 0; height: 2px; background: #4937e9; border-radius: 2px 2px 0 0; animation: rs-tab-slide 0.25s cubic-bezier(0.16, 1, 0.3, 1); }
    @keyframes rs-tab-slide { from { transform: scaleX(0); } to { transform: scaleX(1); } }

    /* ===== Tab Panels ===== */
    .rs-settings-body { padding: 0; overflow-y: auto; scrollbar-width: thin; scrollbar-color: #333348 transparent; }
    .rs-settings-body::-webkit-scrollbar { width: 6px; }
    .rs-settings-body::-webkit-scrollbar-track { background: transparent; }
    .rs-settings-body::-webkit-scrollbar-thumb { background: #333348; border-radius: 3px; }
    .rs-settings-tab-panel { display: none; padding: 18px 22px; }
    .rs-settings-tab-panel--active { display: block; animation: rs-panel-fade 0.2s ease-out; }
    @keyframes rs-panel-fade { from { opacity: 0; transform: translateY(6px); } }

    /* ===== Section Labels ===== */
    .rs-settings-section-label { margin: 0 0 12px; padding-bottom: 8px; font-size: 10.5px; font-weight: 700; letter-spacing: 1.2px; text-transform: uppercase; color: #4937e9; border-bottom: 1px solid #2d2d48; }

    /* ===== Settings Rows ===== */
    .rs-settings-row { display: flex; justify-content: space-between; align-items: center; gap: 16px; padding: 11px 14px; background: rgba(255, 255, 255, 0.02); border: 1px solid #2d2d48; transition: border-color 0.15s, background 0.15s; border-radius: 6px; }
    .rs-settings-row:hover { border-color: #3d3d58; background: rgba(255, 255, 255, 0.04); }
    .rs-settings-row + .rs-settings-row { margin-top: 6px; }
    .rs-settings-row strong { display: block; font-size: 13px; font-weight: 600; color: #e8e8f0; }
    .rs-settings-row small { display: block; margin-top: 2px; color: #8888a8; font-size: 11.5px; line-height: 1.4; }

    /* ===== Toggle Switch ===== */
    .rs-settings-toggle { width: 42px; height: 24px; flex-shrink: 0; appearance: none; position: relative; background: #2d2d48; cursor: pointer; transition: background 0.25s; border-radius: 12px; }
    .rs-settings-toggle::before { content: ""; position: absolute; top: 4px; left: 4px; width: 16px; height: 16px; background: #5c5c78; transition: transform 0.25s cubic-bezier(0.34, 1.56, 0.64, 1), background 0.2s; border-radius: 50%; }
    .rs-settings-toggle:checked { background: #4937e9; }
    .rs-settings-toggle:checked::before { transform: translateX(18px); background: #fff; }
    .rs-settings-toggle:focus-visible { outline: 2px solid #4937e9; outline-offset: 2px; }

    /* ===== Select Menu ===== */
    .rs-settings-row select { flex-shrink: 0; padding: 7px 30px 7px 10px; background: #262640; color: #e0e0e0; border: 1px solid #2d2d48; font-size: 12.5px; font-family: inherit; outline: none; cursor: pointer; transition: border-color 0.15s; appearance: none; border-radius: 6px; background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12'%3E%3Cpath d='M3 4.5L6 7.5L9 4.5' stroke='%238888a8' fill='none' stroke-width='1.5'/%3E%3C/svg%3E"); background-repeat: no-repeat; background-position: right 10px center; }
    .rs-settings-row select:focus { border-color: #4937e9; }

    /* ===== Colour Grid ===== */
    .rs-color-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
    .rs-color-card { display: flex; flex-direction: column; background: rgba(255, 255, 255, 0.02); border: 1px solid #2d2d48; cursor: pointer; transition: border-color 0.15s, background 0.15s, box-shadow 0.15s; overflow: hidden; border-radius: 6px; }
    .rs-color-card:hover { border-color: #3d3d58; background: rgba(255, 255, 255, 0.04); box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2); }
    .rs-color-card:last-child:nth-child(odd) { grid-column: 1 / -1; }
    .rs-color-swatch { width: 100%; height: 40px; padding: 0; border: none; display: block; cursor: pointer; background: none; }
    .rs-color-swatch::-webkit-color-swatch-wrapper { padding: 0; }
    .rs-color-swatch::-webkit-color-swatch { border: none; border-radius: 5px 5px 0 0; }
    .rs-color-swatch::-moz-color-swatch { border: none; border-radius: 5px 5px 0 0; }
    .rs-color-card-info { padding: 9px 12px; }
    .rs-color-card-info strong { display: block; font-size: 12.5px; font-weight: 600; color: #e8e8f0; line-height: 1.3; }
    .rs-color-card-info small { display: block; margin-top: 2px; font-size: 10.5px; color: #8888a8; line-height: 1.3; }

    /* ===== About Tab ===== */
    .rs-about-header { display: flex; align-items: center; gap: 14px; padding-bottom: 16px; margin-bottom: 16px; border-bottom: 1px solid #2d2d48; }
    .rs-about-logo { width: 42px; height: 42px; display: flex; align-items: center; justify-content: center; background: linear-gradient(135deg, #4937e9, #6c5ce7); color: #fff; font-size: 18px; font-weight: 800; letter-spacing: -0.5px; border-radius: 8px; flex-shrink: 0; }
    .rs-about-title h3 { margin: 0; font-size: 14px; font-weight: 700; color: #e8e8f0; line-height: 1.2; }
    .rs-about-title span { font-size: 11.5px; color: #666680; }
    .rs-about-card { background: rgba(255, 255, 255, 0.02); border: 1px solid #2d2d48; padding: 14px 16px; margin-bottom: 10px; transition: border-color 0.15s; border-radius: 8px; }
    .rs-about-card:hover { border-color: #3d3d58; }
    .rs-about-card h4 { margin: 0 0 6px; font-size: 13px; font-weight: 600; color: #e8e8f0; display: flex; align-items: center; gap: 8px; }
    .rs-about-card h4 .rs-about-badge { display: inline-block; padding: 2px 7px; font-size: 10px; font-weight: 600; color: #9898b4; background: rgba(255, 255, 255, 0.06); border: 1px solid #2d2d48; border-radius: 4px; }
    .rs-about-card p { margin: 0; font-size: 12px; color: #9999b0; line-height: 1.65; }
    .rs-about-card a { color: #8b8bff; text-decoration: none; transition: color 0.15s; }
    .rs-about-card a:hover { color: #a7a7ff; text-decoration: underline; }
    .rs-about-divider { height: 1px; background: #2d2d48; margin: 6px 0 16px; }
    .rs-about-footer { display: flex; justify-content: space-between; align-items: center; padding-top: 14px; border-top: 1px solid #2d2d48; margin-top: 10px; }
    .rs-about-footer span { font-size: 11px; color: #555570; }
    .rs-about-footer a { color: #8888a8; text-decoration: none; font-size: 11px; transition: color 0.15s; }
    .rs-about-footer a:hover { color: #a7a7c2; text-decoration: underline; }

    /* ===== Modal Footer ===== */
    .rs-settings-footer { display: flex; justify-content: space-between; align-items: center; padding: 14px 22px; border-top: 1px solid #2d2d48; background: rgba(0, 0, 0, 0.18); }
    .rs-settings-footer-group { display: flex; gap: 8px; }

    /* ===== Footer Buttons ===== */
    .rs-settings-btn { padding: 8px 18px; border: none; font-size: 13px; font-weight: 600; cursor: pointer; font-family: inherit; transition: background 0.15s, color 0.15s, border-color 0.15s, transform 0.1s; border-radius: 6px; }
    .rs-settings-btn:active { transform: scale(0.97); }
    .rs-settings-btn--ghost { background: transparent; color: #8888a8; border: 1px solid #2d2d48; }
    .rs-settings-btn--ghost:hover { background: rgba(255, 255, 255, 0.04); color: #e0e0e0; border-color: #3d3d58; }
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
      dubConfidence: config.dubConfidence,
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
      const validConfidence = DUB_CONFIDENCE_LEVELS.some(level => level.value === config.dubConfidence);
      const colors = config.actionColors && typeof config.actionColors === 'object' ? config.actionColors : {};

      return {
        dubInfo: config.dubInfo ?? DEFAULT_CONFIG.dubInfo,
        dubLanguage: validLanguage ? config.dubLanguage : DEFAULT_CONFIG.dubLanguage,
        dubConfidence: validConfidence ? config.dubConfidence : DEFAULT_CONFIG.dubConfidence,
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
  // Page context + anime ID resolution
  // ============================================================================

  const PageContext = {
    identity() {
      const match = location.pathname.match(WETRAKR_PATH_PATTERN);
      if (!match) return null;

      const [, section, id] = match;
      const type = section === 'shows' ? 'show' : 'movie';
      return { id: Number(id), type, key: `${type}:${id}` };
    },

    externalIds() {
      const ids = {
        mal: null,
        anilist: null,
        imdb: null,
        tmdb: null,
        tvdb: null,
        tvdbType: null
      };

      for (const link of document.querySelectorAll(SELECTORS.externalLinks)) {
        const href = link.getAttribute('href') || '';

        const malMatch = href.match(/myanimelist\.net\/anime\/(\d+)/i);
        if (malMatch) ids.mal = Number(malMatch[1]);

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
      }

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

  const AnimeMappingCache = {
    entries: new Map(),
    generation: 0,

    async request(source, id) {
      const key = `${source}:${id}`;
      const now = Date.now();
      const entry = this.entries.get(key);

      if (entry?.expiresAt > now) return entry.value;
      if (entry?.pending) return entry.pending;

      const generation = this.generation;
      const pending = Providers.animeapi.fetch(source, id)
        .then(data => {
          const value = data ? {
            mal: data.myanimelist ? Number(data.myanimelist) : null,
            anilist: data.anilist ? Number(data.anilist) : null
          } : null;

          if (generation === this.generation) {
            this.entries.set(key, {
              value,
              expiresAt: Date.now() + (value?.mal || value?.anilist ? MAPPING_TTL.positive : MAPPING_TTL.negative),
              pending: null
            });
          }
          return value;
        })
        .catch(error => {
          if (generation === this.generation) this.entries.delete(key);
          throw error;
        });

      this.entries.set(key, { value: null, expiresAt: 0, pending });
      return pending;
    },

    clear() {
      const count = this.entries.size;
      this.generation++;
      this.entries.clear();
      return count;
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
        return {
          mal: ids.mal,
          anilist: ids.anilist,
          via: 'WeTrakr/MyAnimeList'
        };
      }

      let lastError = null;

      for (const candidate of this.candidates(identity, ids)) {
        try {
          const mapping = await AnimeMappingCache.request(candidate.source, candidate.id);
          if (!mapping?.mal) continue;

          return {
            mal: mapping.mal,
            anilist: ids.anilist || mapping.anilist,
            via: `AnimeAPI/${candidate.label}`
          };
        } catch (error) {
          lastError = error;
          logger.debug('Anime ID mapping failed', {
            source: candidate.label,
            id: candidate.id,
            error: errorMessage(error)
          });
        }
      }

      if (lastError) throw lastError;
      return null;
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

  const OverviewFeature = {
    intercepted: false,

    isExcluded() {
      return location.pathname.startsWith('/people');
    },

    apply() {
      if (this.isExcluded()) return;

      if (!this.intercepted) {
        this.intercepted = true;
        document.addEventListener('click', event => {
          const closest = selector => event.target.closest?.(selector);
          if (this.isExcluded() || closest(SELECTORS.overviewToggles) || closest('a[href]') || !closest(SELECTORS.overviewBlocks)) return;
          event.preventDefault();
          event.stopPropagation();
        }, true);
      }

      for (const block of document.querySelectorAll(SELECTORS.overviewBlocks)) block.style.cursor = 'text';

      let expanded = 0;
      for (const toggle of document.querySelectorAll(SELECTORS.overviewToggles)) {
        const label = toggle.textContent.trim().toLowerCase();
        if (label.startsWith('see more')) {
          toggle.click();
          expanded++;
        } else if (!label.startsWith('see less')) {
          continue;
        }
        toggle.style.display = 'none';
      }
      if (expanded) logger.debug(`Expanded ${expanded} overview${expanded === 1 ? '' : 's'}`);
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
  // Dub orchestration
  // ============================================================================

  const DubService = {
    generation: 0,
    active: null,
    settled: null,
    unresolvedSignature: null,
    failure: null,

    reset() {
      this.generation++;
      this.active = null;
      this.settled = null;
      this.unresolvedSignature = null;
      this.failure = null;
      DubView.clear();
    },

    languageName(language) {
      return DUB_LANGUAGES.find(item => item.value === language)?.name || 'Dub';
    },

    async apply() {
      if (SettingsUI.isOpen) return;

      if (!App.config.dubInfo) {
        DubView.clear();
        return;
      }

      const identity = PageContext.identity();
      if (!identity || !document.querySelector(SELECTORS.metaBox)) {
        DubView.clear();
        return;
      }

      const ids = PageContext.externalIds();
      if (!PageContext.hasRelevantIds(ids)) return;

      const signature = PageContext.signature(
        identity,
        ids,
        App.config.dubLanguage,
        App.config.dubConfidence
      );

      if (this.settled?.signature === signature) {
        DubView.render(this.settled.label);
        return;
      }

      if (this.active?.signature === signature || this.unresolvedSignature === signature) return;
      if (this.failure?.signature === signature && Date.now() < this.failure.retryAt) return;

      const generation = this.generation;
      const isCurrent = () => generation === this.generation &&
        this.active?.signature === signature &&
        PageContext.identity()?.key === identity.key &&
        App.config.dubLanguage === this.active?.language &&
        App.config.dubConfidence === this.active?.confidence;

      this.active = {
        signature,
        language: App.config.dubLanguage,
        confidence: App.config.dubConfidence
      };

      try {
        const resolved = await AnimeIdResolver.resolve(identity, ids);
        if (!isCurrent()) return;

        if (!resolved?.mal) {
          this.unresolvedSignature = signature;
          DubView.clear();
          logger.debug('No MyAnimeList ID could be resolved', { identity, ids });
          return;
        }

        const dubbed = await Providers.mydublist.isDubbed(
          resolved.mal,
          App.config.dubLanguage,
          App.config.dubConfidence
        );
        if (!isCurrent()) return;

        const label = dubbed ? `${this.languageName(App.config.dubLanguage)} Dub Exists` : null;
        this.settled = { signature, label };
        this.unresolvedSignature = null;
        this.failure = null;
        DubView.render(label);

        logger.debug('MyDubList dub result', {
          identity,
          mal: resolved.mal,
          anilist: resolved.anilist,
          via: resolved.via,
          language: App.config.dubLanguage,
          confidence: App.config.dubConfidence,
          dubbed
        });
      } catch (error) {
        if (!isCurrent()) return;

        this.failure = {
          signature,
          retryAt: Date.now() + FAILURE_COOLDOWN
        };
        DubView.clear();
        logger.debug('Dub lookup failed', {
          identity,
          ids,
          error: errorMessage(error)
        });
      } finally {
        if (this.active?.signature === signature) this.active = null;
      }
    }
  };

  // ============================================================================
  // Settings UI
  // ============================================================================

  const SettingsUI = {
    modal: null,
    isOpen: false,
    activeTab: 'dubbing',

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
    },

    bindFields(overlay, draft) {
      for (const field of SETTINGS_FIELDS) {
        const input = overlay.querySelector(`#${this.fieldId(field)}`);
        if (!input) continue;
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
        if (!input) continue;
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

    switchTab(tabName) {
      this.activeTab = tabName;
      const modal = this.modal;
      if (!modal) return;

      for (const tab of modal.querySelectorAll('.rs-settings-tab')) {
        const isActive = tab.dataset.tab === tabName;
        tab.classList.toggle('rs-settings-tab--active', isActive);
        tab.setAttribute('aria-selected', String(isActive));
      }
      for (const panel of modal.querySelectorAll('.rs-settings-tab-panel')) {
        panel.classList.toggle('rs-settings-tab-panel--active', panel.dataset.panel === tabName);
      }
      modal.querySelector('.rs-settings-body').scrollTop = 0;
    },

    close() {
      this.modal?.remove();
      this.modal = null;
      this.isOpen = false;
      this.activeTab = 'dubbing';
    },

    open() {
      if (this.modal) return;

      this.isOpen = true;
      const saved = cloneConfig(App.config);
      const draft = cloneConfig(saved);

      const dubFields = SETTINGS_FIELDS.filter(field => field.preview === 'dub');
      const loggingField = SETTINGS_FIELDS.find(field => field.preview === 'logging');
      const colorFields = SETTINGS_FIELDS.filter(field => field.preview === 'color');

      const overlay = document.createElement('div');
      overlay.className = 'rs-settings-overlay';
      overlay.innerHTML = `
        <div class="rs-settings-modal" role="dialog" aria-modal="true" aria-label="WeTrakr Mods Settings">
          <div class="rs-settings-header">
            <h2>WeTrakr Mods Settings</h2>
            <button type="button" class="rs-settings-close" aria-label="Close">&times;</button>
          </div>
          <nav class="rs-settings-tabs" role="tablist" aria-label="Settings sections">
            <button type="button" class="rs-settings-tab rs-settings-tab--active" role="tab" aria-selected="true" aria-controls="rs-panel-dubbing" data-tab="dubbing">Dubbing</button>
            <button type="button" class="rs-settings-tab" role="tab" aria-selected="false" aria-controls="rs-panel-appearance" data-tab="appearance">Appearance</button>
            <button type="button" class="rs-settings-tab" role="tab" aria-selected="false" aria-controls="rs-panel-about" data-tab="about">About</button>
          </nav>
          <div class="rs-settings-body">
            <div class="rs-settings-tab-panel rs-settings-tab-panel--active" role="tabpanel" id="rs-panel-dubbing" data-panel="dubbing">
              ${dubFields.map(field => this.renderField(field, draft)).join('')}
              ${loggingField ? '<div class="rs-about-divider"></div>' + this.renderField(loggingField, draft) : ''}
            </div>
            <div class="rs-settings-tab-panel" role="tabpanel" id="rs-panel-appearance" data-panel="appearance">
              <div class="rs-settings-section-label">Action Button Colours</div>
              <div class="rs-color-grid">
                ${colorFields.map(field => this.renderField(field, draft)).join('')}
              </div>
            </div>
            <div class="rs-settings-tab-panel" role="tabpanel" id="rs-panel-about" data-panel="about">
              <div class="rs-about-header">
                <div class="rs-about-logo">W</div>
                <div class="rs-about-title">
                  <h3>WeTrakr Mods</h3>
                  <span>v${SCRIPT.version} &middot; MIT License</span>
                </div>
              </div>
              <div class="rs-about-card">
                <h4>MyDubList <span class="rs-about-badge">CC BY 4.0</span></h4>
                <p>Dub availability data provided by <a href="https://mydublist.com" target="_blank" rel="noopener noreferrer">MyDubList</a><br>
                Source: <a href="https://github.com/Joelis57/MyDubList" target="_blank" rel="noopener noreferrer">github.com/Joelis57/MyDubList</a><br>
                Licensed under <a href="https://creativecommons.org/licenses/by/4.0/" target="_blank" rel="noopener noreferrer">Creative Commons Attribution 4.0 International</a></p>
              </div>
              <div class="rs-about-card">
                <h4>AnimeAPI <span class="rs-about-badge">ODbL v1.0</span></h4>
                <p>Contains information from <a href="https://github.com/nattadasu/animeApi" target="_blank" rel="noopener noreferrer">AnimeAPI</a> and <a href="https://github.com/manami-project/anime-offline-database" target="_blank" rel="noopener noreferrer">Anime Offline Database</a>, which are made available under the <a href="https://opendatacommons.org/licenses/odbl/1-0/" target="_blank" rel="noopener noreferrer">Open Database License (ODbL) v1.0</a>.<br>Data via <a href="https://animeapi.my.id" target="_blank" rel="noopener noreferrer">animeapi.my.id</a> (MIT / ODbL / DbCL)</p>
              </div>
              <div class="rs-about-footer">
                <span>&copy; Journey Over</span>
                <a href="https://github.com/StylusThemes/Userscripts" target="_blank" rel="noopener noreferrer">Homepage</a>
              </div>
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
      this.bindFields(overlay, draft);

      for (const tab of overlay.querySelectorAll('.rs-settings-tab')) {
        tab.addEventListener('click', () => this.switchTab(tab.dataset.tab));
      }

      overlay.addEventListener('keydown', event => {
        if (event.key === 'Escape') {
          cancel();
          return;
        }
        if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') {
          const tabs = ['dubbing', 'appearance', 'about'];
          const index = tabs.indexOf(this.activeTab);
          const next = event.key === 'ArrowRight' ?
            tabs[(index + 1) % tabs.length] :
            tabs[(index - 1 + tabs.length) % tabs.length];
          this.switchTab(next);
          overlay.querySelector(`.rs-settings-tab[data-tab="${next}"]`).focus();
        }
      });

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
        const mappingEntries = AnimeMappingCache.clear();
        Providers.mydublist.clearCache();
        DubService.reset();
        logger(`Request cache cleared (${mappingEntries} mapping entr${mappingEntries === 1 ? 'y' : 'ies'} plus MyDubList datasets)`);
        this.flashButton(event.currentTarget, 'Cleared!', 'Clear Cache');
      });

      overlay.querySelector('#rs-reset').addEventListener('click', event => {
        Object.assign(draft, ConfigStore.defaults());
        draft.actionColors = { ...DEFAULT_ACTION_COLORS };
        this.syncFields(overlay, draft);
        ActionColorTheme.apply(draft);
        setDebugLogging(draft.debugLogging, true);
        DubService.reset();
        logger('Settings restored to defaults');
        this.flashButton(event.currentTarget, 'Restored!', 'Restore Defaults');
      });

      overlay.querySelector('#rs-save').addEventListener('click', () => {
        App.config = ConfigStore.save(draft);
        ActionColorTheme.apply(App.config);
        setDebugLogging(App.config.debugLogging, true);
        DubService.reset();

        logger('Settings saved', {
          dubInfo: App.config.dubInfo,
          dubLanguage: App.config.dubLanguage,
          dubConfidence: App.config.dubConfidence,
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

      logger('SPA navigation detected', {
        from: previousPath,
        to: this.lastPath
      });
    },

    run() {
      this.handleRouteChange();
      StatusBadgeFeature.apply();
      TimestampFeature.apply();
      ReviewFeature.apply();
      OverviewFeature.apply();
      DubService.apply();
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
