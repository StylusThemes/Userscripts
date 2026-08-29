// ==UserScript==
// @name          WeTrakr - Mods
// @version       1.12.0
// @description   Modifications and enhancements for WeTrakr
// @author        Journey Over
// @license       MIT
// @match         *://wetrakr.com/*
// @require       https://cdn.jsdelivr.net/gh/StylusThemes/Userscripts@9e8f1b9bdc1acac2e76f3e8d2348f76817ec5bf4/libs/utils/utils.min.js
// @require       https://cdn.jsdelivr.net/gh/StylusThemes/Userscripts@644b86d55bf5816a4fa2a165bdb011ef7c22dfe1/libs/metadata/anilist/anilist.min.js
// @require       https://cdn.jsdelivr.net/gh/StylusThemes/Userscripts@644b86d55bf5816a4fa2a165bdb011ef7c22dfe1/libs/metadata/armhaglund/armhaglund.min.js
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

  const logger = Logger('WeTrakr - Mods', { debug: false });
  const anilist = new AniList();
  const armhaglund = new ArmHaglund();
  const maldubs = new MalDubs();

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

  // Selectors referenced from more than one place below, so there's exactly
  // one string to update if WeTrakr renames a class.
  const SELECTORS = {
    metaBox: '.detail-meta-box--desktop',
    titleStack: '.title-stack'
  };

  // How long a successful provider response stays cached in memory (ms).
  // Dub/ID data is never written to GM storage, so this cache is lost on reload.
  //   anilistDub / malDub : dub-availability lookups (cheap, refreshed often)
  //   armPositive         : ArmHaglund resolved an id (rarely changes)
  //   armNegative         : ArmHaglund found nothing (recheck sooner)
  const REQUEST_TTL = {
    anilistDub: 30 * 60 * 1000,
    malDub: 30 * 60 * 1000,
    armPositive: 24 * 60 * 60 * 1000,
    armNegative: 30 * 60 * 1000
  };

  // After a provider request fails, block retries for this long (ms) so a broken
  // lookup can't hammer the provider on every page mutation.
  const FAILURE_COOLDOWN = 60 * 1000;

  // Minimum gap between the start of two requests to the same provider (ms).
  // AniList is currently capped at 30 req/min (~2000ms) while degraded, so its
  // interval sits at that ceiling; the others are polite pacing under churn.
  const SERVICE_MIN_INTERVAL = {
    anilist: 2000,
    armhaglund: 750,
    maldubs: 1000
  };

  // Languages offered in the settings dropdown. `value` is the AniList
  // StaffLanguage enum consumed by the dub query; `name` is the display label.
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

  // Action buttons whose active/listed state we recolour. `hint` is shown in
  // the settings UI, `selector` is the CSS rule target, and `extra` is
  // optional inline CSS appended to the generated rule.
  const ACTION_COLORS = [
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
  ];
  // Flat { key: defaultColour } map, used as the base for any stored overrides.
  const DEFAULT_ACTION_COLORS = Object.fromEntries(ACTION_COLORS.map(({ key, default: value }) => [key, value]));

  // Fallback settings used when storage is empty or a key is missing.
  const DEFAULT_CONFIG = { dubInfo: true, dubLanguage: 'ENGLISH' };

  // Declarative description of every field shown in the settings modal. This
  // drives HTML generation, live-preview binding, and "restore defaults" in
  // one place, instead of three separate hand-written blocks per field.
  //   type    : 'toggle' | 'select' | 'color'
  //   key     : dotted path into the settings draft (e.g. 'actionColors.watched')
  //   preview : which live-preview function a change should trigger
  const SETTINGS_FIELDS = [
    { key: 'dubInfo', type: 'toggle', label: 'Dub Information', hint: 'Show dub availability for anime shows', preview: 'dub' },
    { key: 'dubLanguage', type: 'select', label: 'Preferred Dub Language', hint: 'Language to check for', options: DUB_LANGUAGES, preview: 'dub' },
    ...ACTION_COLORS.map(({ key, label, hint }) => ({ key: `actionColors.${key}`, type: 'color', label, hint, preview: 'color' }))
  ];

  // Read/write access to persisted settings. `get` merges stored values over
  // defaults; `set` replaces the whole stored object.
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

  // Get/set a settings-draft value by a SETTINGS_FIELDS key, which may be a
  // plain property ('dubInfo') or a dotted nested path ('actionColors.watched').
  function getFieldValue(draft, key) {
    return key.includes('.') ? key.split('.').reduce((object, part) => object[part], draft) : draft[key];
  }

  function setFieldValue(draft, key, value) {
    if (!key.includes('.')) {
      draft[key] = value;
      return;
    }
    const [parent, child] = key.split('.');
    draft[parent][child] = value;
  }

  function applyActionColors(config = ModuleConfig.get()) {
    let styleElement = document.getElementById('wetrakr-action-colors');
    if (!styleElement) {
      styleElement = document.createElement('style');
      styleElement.id = 'wetrakr-action-colors';
      document.head.appendChild(styleElement);
      styleElement.textContent = ACTION_COLORS.map(({ key, default: value, extra, selector }) =>
        `${selector} { background-color: var(--wt-${key}, ${value}) !important;${extra ? ` ${extra}` : ''} }`
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
  const WETRAKR_PATH_PATTERN = /^\/(shows|movies)\/(\d+)/;

  function getWeTrakrIdentity() {
    const match = location.pathname.match(WETRAKR_PATH_PATTERN);
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
  // Runtime Request Management
  // ==========================================
  // All provider requests live only in memory for the lifetime of the page.
  // Cache keys describe the external lookup itself (e.g. an AniList id +
  // language), not the WeTrakr title, so there is no per-title cache to keep
  // in sync.
  function sleep(milliseconds) {
    return new Promise(resolve => setTimeout(resolve, milliseconds));
  }

  // Serialises tasks for one provider and enforces a minimum gap between starts.
  // Each limiter owns a promise chain; a rejected task is swallowed so one
  // failure can't wedge the queue for later requests.
  function createRateLimiter(minInterval) {
    let queue = Promise.resolve();
    let nextAllowedAt = 0;

    return {
      run(task) {
        const request = queue.then(async () => {
          const wait = Math.max(0, nextAllowedAt - Date.now());
          if (wait > 0) await sleep(wait);

          nextAllowedAt = Date.now() + minInterval;
          return task();
        });

        // A rejected request must not permanently break the queue.
        queue = request.catch(() => {});
        return request;
      }
    };
  }

  const ServiceLimiters = {
    anilist: createRateLimiter(SERVICE_MIN_INTERVAL.anilist),
    armhaglund: createRateLimiter(SERVICE_MIN_INTERVAL.armhaglund),
    maldubs: createRateLimiter(SERVICE_MIN_INTERVAL.maldubs)
  };

  // Single entry point for any provider lookup, keyed by an arbitrary string
  // the caller defines (e.g. `anilist:123:ENGLISH`). Each key owns one entry
  // holding whatever of its lifecycle currently applies: a fresh cached
  // value, an in-flight promise, and/or a failure cooldown. `generation` is
  // bumped by clear() so a still-in-flight request from before a clear can't
  // repopulate a key after the fact — its result lands on an entry object
  // that's no longer reachable from `entries`.
  const RequestManager = {
    entries: new Map(),
    generation: 0,

    entryFor(key) {
      let entry = this.entries.get(key);
      if (!entry) {
        entry = { value: undefined, expiresAt: 0, retryAt: 0, pending: null };
        this.entries.set(key, entry);
      }
      return entry;
    },

    async request({ key, service, ttl, fetcher }) {
      const entry = this.entryFor(key);
      const now = Date.now();

      if (entry.expiresAt > now) return entry.value;
      if (entry.pending) return entry.pending;

      if (entry.retryAt > now) {
        const error = new Error(`Request cooldown active until ${new Date(entry.retryAt).toISOString()}`);
        error.code = 'REQUEST_COOLDOWN';
        error.retryAt = entry.retryAt;
        throw error;
      }

      const limiter = ServiceLimiters[service];
      if (!limiter) throw new Error(`Unknown request service: ${service}`);

      const generation = this.generation;

      entry.pending = limiter.run(fetcher)
        .then(value => {
          entry.retryAt = 0;
          if (generation === this.generation) {
            const duration = typeof ttl === 'function' ? ttl(value) : ttl;
            if (Number.isFinite(duration) && duration > 0) {
              entry.value = value;
              entry.expiresAt = Date.now() + duration;
            }
          }
          return value;
        })
        .catch(error => {
          if (generation === this.generation) entry.retryAt = Date.now() + FAILURE_COOLDOWN;
          throw error;
        })
        .finally(() => {
          entry.pending = null;
        });

      return entry.pending;
    },

    clear() {
      this.generation++;
      this.entries.clear();
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
        // "05/12/2026 | 14:30" -> "05/12/2026 | 2:30 PM"
        .replace(/(\d{2}\/\d{2}\/\d{4}) \| (\d{2}):(\d{2})(?!\s*[AP]M)/gi, (_, date, hour, minute) => `${date} | ${this.to12Hour(+hour, +minute)}`)
        // "· 14:30" -> "· 2:30 PM"
        .replace(/· (\d{2}):(\d{2})(?!\s*[AP]M)/gi, (_, hour, minute) => `· ${this.to12Hour(+hour, +minute)}`)
        // "2.30 PM" -> "2:30 PM"
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
      return [...document.querySelectorAll(SELECTORS.titleStack)].find(element => element.offsetParent !== null);
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

      // Clone rather than move the badge so its original position in the DOM
      // (and anything else relying on it) is undisturbed; the clone is what
      // gets repositioned above the heading via the CSS `order` rules.
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
  // Resolves whether a title has a dub in the user's preferred language and
  // renders that into the detail meta box. Orchestrates the external providers
  // (AniList, MAL-Dubs, ArmHaglund) and guards against stale or duplicate work.
  const DubService = {
    // Signature of the most recent attempt; used to ignore superseded results.
    lastSignature: null,
    // Last failure details (signature + retry timestamp) for cooldown checks.
    lastFailure: null,
    // Bumped on reset so in-flight applies from a previous page are discarded.
    generation: 0,

    // True only if this attempt still belongs to the current page generation and
    // matches the latest signature (no newer or richer attempt superseded it).
    isCurrent(generation, signature) {
      return generation === this.generation && signature === this.lastSignature;
    },

    getLanguageName(language) {
      return DUB_LANGUAGES.find(lang => lang.value === language)?.name || 'Dub';
    },

    // Scrape AniList / IMDb / TMDB / MAL ids from the page's external links.
    // Any of them can be absent; callers decide which are usable.
    getExternalIds() {
      const ids = { anilist: null, imdb: null, tmdb: null, mal: null };
      for (const link of document.querySelectorAll('.detail-tags a.detail-tag')) {
        const href = link.getAttribute('href') || '';

        const anilistMatch = href.match(/anilist\.co\/anime\/(\d+)/);
        if (anilistMatch) ids.anilist = Number(anilistMatch[1]);

        const imdbMatch = href.match(/imdb\.com\/title\/(tt\d+)/);
        if (imdbMatch) ids.imdb = imdbMatch[1];

        const tmdbMatch = href.match(/themoviedb\.org\/(?:movie|tv)\/(\d+)/);
        if (tmdbMatch) ids.tmdb = Number(tmdbMatch[1]);

        const malMatch = href.match(/myanimelist\.net\/anime\/(\d+)/);
        if (malMatch) ids.mal = Number(malMatch[1]);
      }
      return ids;
    },

    // Ask AniList whether any main-character voice actor exists for the given
    // language. Returns true when at least one dub voice actor is present.
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

      const edges = response?.data?.Media?.characters?.edges;
      if (!Array.isArray(edges)) throw new Error('Unexpected AniList response structure');
      return edges.some(edge => edge.voiceActors?.length > 0);
    },

    // Insert, update, or remove the "Dub" row in the desktop meta box. A null
    // `label` clears the row; otherwise `label` becomes the displayed value.
    renderDubRow(label) {
      const metaBox = document.querySelector(SELECTORS.metaBox);
      if (!metaBox) return;

      let row = metaBox.querySelector('.rs-dub-info');

      if (!label) {
        row?.remove();
        return;
      }

      if (!row) {
        row = document.createElement('div');
        row.className = 'detail-meta-box__row rs-dub-info';

        const dt = document.createElement('dt');
        dt.className = 'detail-meta-box__label';
        dt.textContent = 'Dub';

        const dd = document.createElement('dd');
        dd.className = 'detail-meta-box__value';

        row.append(dt, dd);
        metaBox.appendChild(row);
      }

      row.querySelector('.detail-meta-box__value').textContent = label;
    },

    // Stable key for a dub attempt: title + every known external id + language.
    // Changing any part yields a new signature, letting newer attempts supersede
    // older ones.
    getSignature(identity, pageIds, language) {
      return `${identity.key}|${pageIds.anilist}|${pageIds.imdb}|${pageIds.tmdb}|${pageIds.mal}|${language}`;
    },

    // Decide whether a fresh attempt for `signature` is allowed: always for a new
    // signature, never while an identical failure is still cooling down, and only
    // after the cooldown passes for a repeated failure.
    canAttempt(signature) {
      if (signature !== this.lastSignature) return true;
      if (!this.lastFailure || this.lastFailure.signature !== signature) return false;
      return Date.now() >= this.lastFailure.retryAt;
    },

    // Record a failed attempt so identical retries wait out the cooldown. Uses the
    // error's retryAt when provided (request cooldown), else a default window.
    noteFailure(signature, error) {
      this.lastFailure = {
        signature,
        retryAt: error?.retryAt || (Date.now() + FAILURE_COOLDOWN)
      };
    },

    // Pick which provider can answer the dub question for this page, in priority
    // order (kept aligned with the previously working behaviour):
    //   1. AniList id on the page        -> query AniList directly
    //   2. MAL id on the page (English)  -> query MAL-Dubs directly
    //   3. TMDB/IMDb on the page         -> ArmHaglund resolves an AniList or
    //                                       MAL id, then use that (MAL only for English)
    // Returns { type, id } or null when no usable source exists.
    async resolveDubSource(pageIds, generation, signature, language) {
      const englishOnly = language === 'ENGLISH';

      if (pageIds.anilist) return { type: 'anilist', id: pageIds.anilist };
      if (pageIds.mal && englishOnly) return { type: 'mal', id: pageIds.mal };

      const source = pageIds.tmdb ? 'tmdb' : (pageIds.imdb ? 'imdb' : null);
      if (!source) return null;

      const lookupValue = source === 'tmdb' ? pageIds.tmdb : pageIds.imdb;
      const requestKey = `arm:${source}:${lookupValue}`;

      const data = await RequestManager.request({
        key: requestKey,
        service: 'armhaglund',
        ttl: result => (result?.anilist || result?.myanimelist) ?
          REQUEST_TTL.armPositive :
          REQUEST_TTL.armNegative,
        fetcher: () => armhaglund.fetchIds(source === 'tmdb' ? 'themoviedb' : 'imdb', lookupValue)
      });

      if (!this.isCurrent(generation, signature)) return null;

      const resolvedAnilist = data?.anilist ? Number(data.anilist) : null;
      const resolvedMal = data?.myanimelist ? Number(data.myanimelist) : null;

      if (resolvedAnilist) return { type: 'anilist', id: resolvedAnilist };
      if (resolvedMal && englishOnly) return { type: 'mal', id: resolvedMal };
      return null;
    },

    // Resolves a source (from resolveDubSource) to a display label, or null
    // when no dub was found. Isolates the two providers' differing response
    // shapes (a status string vs. a boolean) behind one return type.
    async fetchDubLabel(source, language) {
      if (source.type === 'mal') {
        const status = await RequestManager.request({
          key: `mal-dubs:${source.id}`,
          service: 'maldubs',
          ttl: REQUEST_TTL.malDub,
          fetcher: () => maldubs.getStatus(source.id)
        });
        if (!status) return null;
        return status === 'incomplete' ? 'English Dub Incomplete' : 'English Dub Exists';
      }

      const hasDub = await RequestManager.request({
        key: `anilist:${source.id}:${language}`,
        service: 'anilist',
        ttl: REQUEST_TTL.anilistDub,
        fetcher: () => this.queryAnilistDub(source.id, language)
      });
      return hasDub ? `${this.getLanguageName(language)} Dub Exists` : null;
    },

    // Main entry point: determine dub availability for the current title and
    // render the result. No-ops when the meta box is absent, dub info is
    // disabled, or no external ids are present yet. Every provider call routes
    // through RequestManager and is guarded by isCurrent() so a slower earlier
    // attempt can't overwrite a newer one.
    async apply(configOverride) {
      if (!document.querySelector(SELECTORS.metaBox)) return;

      const config = configOverride || ModuleConfig.get();
      if (!config.dubInfo) {
        this.renderDubRow(null);
        return;
      }

      const identity = getWeTrakrIdentity();
      if (!identity) return;

      const pageIds = this.getExternalIds();

      // External ID links can render after the metadata box. Do not mark the page
      // as processed until at least one usable external identifier exists.
      if (!pageIds.anilist && !pageIds.mal && !pageIds.imdb && !pageIds.tmdb) return;

      const { dubLanguage: language } = config;
      const signature = this.getSignature(identity, pageIds, language);
      if (!this.canAttempt(signature)) return;

      this.lastSignature = signature;
      this.lastFailure = null;
      const generation = this.generation;

      try {
        const source = await this.resolveDubSource(pageIds, generation, signature, language);
        if (!this.isCurrent(generation, signature)) return;

        if (!source) {
          this.renderDubRow(null);
          return;
        }

        const label = await this.fetchDubLabel(source, language);
        if (!this.isCurrent(generation, signature)) return;

        this.renderDubRow(label);
      } catch (error) {
        if (!this.isCurrent(generation, signature)) return;

        this.noteFailure(signature, error);
        this.lastSignature = null;

        if (error?.code !== 'REQUEST_COOLDOWN') {
          logger.error(`Failed to fetch dub information: ${error?.message || error}`);
        }
      }
    },

    // Forget the current attempt and clear any rendered row. Bumps generation so
    // in-flight applies from before a route change are discarded on arrival.
    reset() {
      this.lastSignature = null;
      this.lastFailure = null;
      this.generation++;
      this.renderDubRow(null);
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

    applyPreview(field, draft) {
      if (field.preview === 'dub') this.applyDubPreview(draft);
      else this.applyColorPreview(draft);
    },

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
              ${field.options.map(option => `<option value="${option.value}" ${value === option.value ? 'selected' : ''}>${option.name}</option>`).join('')}
            </select>
          </label>`;
      }

      // 'color'
      return `
        <label class="rs-color-card">
          <input type="color" class="rs-color-swatch" id="${id}" value="${value}">
          <div class="rs-color-card-info">
            <strong>${field.label}</strong>
            <small>${field.hint}</small>
          </div>
        </label>`;
    },

    // Wire every field's input to update the draft, trigger its live preview,
    // and (for colour swatches) use 'input' rather than 'change' so the preview
    // updates continuously as the user drags the picker.
    bindFields(overlay, draft) {
      for (const field of SETTINGS_FIELDS) {
        const input = overlay.querySelector('#' + this.fieldId(field));
        const eventName = field.type === 'color' ? 'input' : 'change';

        input.addEventListener(eventName, (event) => {
          const value = field.type === 'toggle' ? event.target.checked : event.target.value;
          setFieldValue(draft, field.key, value);
          this.applyPreview(field, draft);
        });
      }
    },

    // Reflects a reset draft (e.g. from "Restore Defaults") back into the inputs.
    syncFieldInputs(overlay, draft) {
      for (const field of SETTINGS_FIELDS) {
        const input = overlay.querySelector('#' + this.fieldId(field));
        const value = getFieldValue(draft, field.key);
        if (field.type === 'toggle') input.checked = value;
        else input.value = value;
      }
    },

    open() {
      if (this.modal) return;
      this.isOpen = true;
      const saved = ModuleConfig.get();
      const draft = { ...saved, actionColors: { ...saved.actionColors } };

      const dubFieldsHtml = SETTINGS_FIELDS.filter(field => field.preview === 'dub').map(field => this.renderField(field, draft)).join('');
      const colorFieldsHtml = SETTINGS_FIELDS.filter(field => field.preview === 'color').map(field => this.renderField(field, draft)).join('');

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
            ${dubFieldsHtml}
            <h3>Action Button Colours</h3>
            <div class="rs-color-grid">
              ${colorFieldsHtml}
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
        RequestManager.clear();
        DubService.reset();
        if (draft.dubInfo) DubService.apply(draft);
        event.target.textContent = 'Cleared!';
        setTimeout(() => { event.target.textContent = 'Clear Request Cache'; }, 1500);
      });

      this.bindFields(overlay, draft);

      overlay.querySelector('#rs-reset').addEventListener('click', (event) => {
        Object.assign(draft, { ...DEFAULT_CONFIG, actionColors: { ...DEFAULT_ACTION_COLORS } });
        this.syncFieldInputs(overlay, draft);
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
