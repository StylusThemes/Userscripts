// ==UserScript==
// @name          WeTrakr - Mods
// @version       1.5.0
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
    /* ===== Title Stack (Actor) ===== */
    .detail-grid--person .person-badge-department { font-size: 14px !important; margin: 5px 0 0 12px !important; }
    .detail-grid--person [class="detail-status-line"] .detail-status-badge { background: none !important; padding: 0 !important; }
    .detail-grid--person [class="detail-status-line"] .detail-status-badge + .detail-status-badge::before { content: "∙"; margin: 0 10px 0 4px; font-weight: bold; }

    /* ===== Title Stack (Movies + Shows) ===== */
    /* [class="detail-grid"] is an exact class match, so it only targets the plain grid, never the modifier grids (--person/--season/--episode) */
    [class="detail-grid"] .title-stack { display: flex; flex-direction: column; }
    [class="detail-grid"] .title-stack .we-heading-1 { order: 1; }
    [class="detail-grid"] .title-stack .detail-status-line.detail-meta-line { order: 2; margin-bottom: var(--space-2); }
    [class="detail-grid"] .title-stack .detail-status-line:not(.detail-meta-line) { order: 3; margin-bottom: 15px; }
    [class="detail-grid"] .detail-status-badge.rs-clone { align-self: center; margin-left: var(--space-2); margin-right: 0; margin-bottom: -4px; }
    [class="detail-grid"] .detail-status-badge.rs-clone:not(.detail-status-badge--airing) { border: 1px solid currentColor; border-radius: var(--radius-1); padding: 2px 6px; background: none; }
    [class="detail-grid"] .detail-status-line.detail-meta-line .detail-status-badge { background: none !important; padding: 0 !important; }
    [class="detail-grid"] .detail-status-line.detail-meta-line .detail-status-badge + .detail-status-badge::before { content: "∙"; margin: 0 10px 0 4px; font-weight: bold; }
    [class="detail-grid"] .detail-overview-block .we-text-body.detail-directed-by { padding-bottom: 15px; }

    /* ===== Title Stack (Season) ===== */
    .detail-grid--season .detail-grid__info .title-stack.title-center { display: flex !important; flex-direction: column !important; }
    /* 1. Season nav pill - stays first */
    .detail-grid--season .detail-grid__info .title-stack .detail-nav-links--season { order: 1; }
    /* 2. Show title - promoted to main heading; hides the "/ Season X" part */
    .detail-grid--season .detail-grid__info .title-stack .detail-breadcrumb { order: 2; }
    .detail-grid--season .detail-grid__info .title-stack .detail-breadcrumb a.we-link-body { font-size: var(--font-size-4) !important; font-weight: 800 !important; letter-spacing: -0.02em; line-height: var(--line-height-0); color: #fff; text-decoration: none; }
    .detail-grid--season .detail-grid__info .title-stack .detail-breadcrumb a.we-link-body:hover { text-decoration: underline; }
    .detail-grid--season .detail-grid__info .title-stack .detail-breadcrumb span,
    .detail-grid--season .detail-grid__info .title-stack .detail-breadcrumb .detail-breadcrumb__current { display: none !important; }
    /* 3. Season number - demoted to secondary heading */
    .detail-grid--season .detail-grid__info .title-stack .we-heading-1 { order: 3; font-size: 22px !important; font-weight: 700 !important; letter-spacing: 0.4px !important; }
    .detail-grid--season .detail-grid__info .title-stack .we-heading-1 .we-text-accent { display: none; }
    /* 4. Date / episode count - positioned last */
    .detail-grid--season .detail-grid__info .title-stack > p.we-text-body:not(.detail-breadcrumb) { order: 4; margin-bottom: 10px !important; font-size: var(--font-size-0); font-weight: 600; letter-spacing: 0.6px; text-transform: uppercase; }

    /* ===== Title Stack (Episode) ===== */
    .detail-grid--episode .detail-grid__info .title-stack.title-center { display: flex !important; flex-flow: row wrap !important; align-items: baseline !important; }
    /* 1. Episode nav pill - stays first */
    .detail-grid--episode .detail-grid__info .title-stack .detail-nav-links { order: 1; flex-basis: 100%; }
    /* Breadcrumb becomes "invisible" as a box - its children join the flex flow directly */
    .detail-grid--episode .detail-grid__info .title-stack .detail-breadcrumb { display: contents; }
    /* 2. New Episode + New Season badges */
    .detail-grid--episode .detail-grid__info .title-stack .episode-milestone-badge-detail,
    .detail-grid--episode .detail-grid__info .title-stack .episode-upcoming-icon-detail { position: static !important; order: 2; }
    .detail-grid--episode .detail-grid__info .title-stack .badge-linebreak { order: 2; flex-basis: 100%; width: 0; height: 0; }
    /* 3. Episode title - split to own line, large */
    .detail-grid--episode .detail-grid__info .title-stack .detail-breadcrumb a.we-link-body:first-child { order: 3; font-size: var(--font-size-4) !important; font-weight: 800 !important; letter-spacing: -0.02em; line-height: var(--line-height-0); color: #fff; text-decoration: none; margin-bottom: -3px; }
    .detail-grid--episode .detail-grid__info .title-stack .detail-breadcrumb a.we-link-body:hover { text-decoration: underline; }
    .detail-grid--episode .detail-grid__info .title-stack .ep-linebreak { order: 3; flex-basis: 100%; width: 0; height: 0; }
    .detail-grid--episode .detail-grid__info .title-stack .detail-breadcrumb span:not(.detail-breadcrumb__current):not(.ep-linebreak) { display: none !important; }
    /* 4. Episode details - season #, episode #, episode title */
    .detail-grid--episode .detail-grid__info .title-stack .detail-breadcrumb a.we-link-body:nth-of-type(2) { order: 4; font-size: 22px !important; font-weight: 700 !important; letter-spacing: 0.4px !important; text-decoration: none; }
    .detail-grid--episode .detail-grid__info .title-stack .detail-breadcrumb .detail-breadcrumb__current { order: 5; font-size: 22px !important; font-weight: 700 !important; letter-spacing: 0.4px !important; }
    .detail-grid--episode .detail-grid__info .title-stack .detail-breadcrumb .detail-breadcrumb__current::before { content: "∙"; margin: 0 6px; }
    .detail-grid--episode .detail-grid__info .title-stack .we-heading-1 { order: 6; font-size: 22px !important; font-weight: 700 !important; letter-spacing: 0.4px !important; }
    .detail-grid--episode .detail-grid__info .title-stack .we-heading-1::before { content: "–"; margin: 0 2px 0 6px; }
    .detail-grid--episode .detail-grid__info .title-stack .we-heading-1 .we-text-accent { display: none; }
    /* 5. Date / runtime - positioned last */
    .detail-grid--episode .detail-grid__info .title-stack > p.we-text-body:not(.detail-breadcrumb) { order: 7; flex-basis: 100%; margin-bottom: 10px !important; font-size: var(--font-size-0); font-weight: 600; letter-spacing: 0.6px; text-transform: uppercase; }

    /* ===== Title Stack (Tracking) ===== */
    /* 1. Title - on its own line */
    .detail-grid--min .title-stack.title-center { display: flex; flex-direction: column; }
    .detail-grid--min .title-stack .we-heading-1 { order: 1; }
    /* 2. Meta line (dates, seasons, runtime) - second */
    .detail-grid--min .title-stack .detail-status-line.detail-meta-line { order: 2; margin-bottom: var(--space-2); }
    /* 3. Status line (airing + genres) - last */
    .detail-grid--min .title-stack .detail-status-line:not(.detail-meta-line) { order: 3; margin-bottom: 15px; }
    /* Airing badge - cloned next to the title, centered */
    .detail-grid--min .detail-status-badge.rs-clone { align-self: center; margin-left: var(--space-2); margin-right: 0; margin-bottom: -4px; }
    .detail-grid--min .detail-status-badge.rs-clone:not(.detail-status-badge--airing) { border: 1px solid currentColor; border-radius: var(--radius-1); padding: 2px 6px; background: none; }
    /* Meta badges - flat, separated by dots */
    .detail-grid--min .detail-status-line.detail-meta-line .detail-status-badge { background: none !important; padding: 0 !important; }
    .detail-grid--min .detail-status-line.detail-meta-line .detail-status-badge + .detail-status-badge::before { content: "∙"; margin: 0 10px 0 4px; font-weight: bold; }

    /* ===== Hover Border ===== */
    .media-item__border-overlay, .episode-item__border-overlay { display: none !important; }

    /* ===== Upcoming Section ===== */
    /* Hide upcoming items that have no progress bar (e.g. already-watched episodes) */
    #upcoming we-item-poster:not(:has(.media-item__progress)) { display: none !important; }

    /* ===== Profile Menu Overflow ===== */
    .profile-menu .profile-menu-content { overflow-x: unset !important; }

    /* ===== Dub Info ===== */
    .detail-meta-box .rs-dub-info { display: flex; flex-direction: row; align-items: baseline; justify-content: space-between; gap: var(--space-3); padding: var(--space-4) var(--space-4); }
    .detail-meta-box .rs-dub-info .detail-meta-box__label { display: flex; align-items: center; gap: var(--space-2); flex-shrink: 0; font-size: var(--font-size-0); font-weight: 600; color: #fff; letter-spacing: 0.04em; line-height: 1.4; margin: 0; }
    .detail-meta-box .rs-dub-info .detail-meta-box__value { font-size: var(--font-size-0); font-weight: 400; color: #96a4af; line-height: 1.4; text-align: right; margin: 0; min-width: 0; overflow-wrap: anywhere; word-break: break-word; }

    /* ===== Settings Modal ===== */
    .rs-settings-overlay { position: fixed; inset: 0; z-index: 10000; display: flex; align-items: center; justify-content: center; background: rgba(0, 0, 0, 0.6); font-family: 'Proxima Nova', 'Open Sans', Arial, sans-serif; }
    .rs-settings-modal { width: 480px; max-width: 90vw; max-height: 85vh; display: flex; flex-direction: column; overflow: hidden; background: #1e1e2e; color: #e0e0e0; border: 1px solid #333; border-radius: 10px; box-shadow: 0 20px 50px rgba(0, 0, 0, 0.5); }
    .rs-settings-header { display: flex; justify-content: space-between; align-items: center; padding: 16px 20px; border-bottom: 1px solid #333; }
    .rs-settings-header h2 { margin: 0; font-size: 17px; font-weight: 700; }
    .rs-settings-close { background: none; border: none; color: #999; font-size: 22px; line-height: 1; cursor: pointer; }
    .rs-settings-close:hover { color: #e0e0e0; }
    .rs-settings-body { padding: 16px 20px; overflow-y: auto; }
    .rs-settings-body h3 { margin: 0 0 12px; font-size: 13px; font-weight: 700; letter-spacing: 0.6px; text-transform: uppercase; color: #999; }
    .rs-settings-row { display: flex; justify-content: space-between; align-items: center; gap: 16px; padding: 12px 0; }
    .rs-settings-row + .rs-settings-row { border-top: 1px solid #333; }
    .rs-settings-row strong { display: block; font-size: 14px; }
    .rs-settings-row small { display: block; margin-top: 2px; color: #999; font-size: 12px; }
    .rs-settings-toggle { width: 42px; height: 24px; flex-shrink: 0; appearance: none; position: relative; background: #444; border-radius: 24px; cursor: pointer; transition: background 0.2s; }
    .rs-settings-toggle::before { content: ""; position: absolute; top: 3px; left: 3px; width: 18px; height: 18px; background: #fff; border-radius: 50%; transition: transform 0.2s; }
    .rs-settings-toggle:checked { background: #4937e9; }
    .rs-settings-toggle:checked::before { transform: translateX(18px); }
    .rs-settings-row select { flex-shrink: 0; padding: 8px 10px; background: #2a2a3d; color: #e0e0e0; border: 1px solid #444; border-radius: 6px; font-size: 13px; outline: none; }
    .rs-settings-row select:focus { border-color: #4937e9; }
    .rs-settings-footer { display: flex; justify-content: space-between; padding: 14px 20px; border-top: 1px solid #333; }
    .rs-settings-btn { padding: 8px 16px; border: none; border-radius: 6px; font-size: 13px; font-weight: 600; cursor: pointer; transition: background 0.2s; }
    .rs-settings-btn--ghost { background: transparent; color: #999; }
    .rs-settings-btn--ghost:hover { background: #2a2a3d; color: #e0e0e0; }
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

  const ModuleConfig = {
    get() {
      const defaults = { dubInfo: true, dubLanguage: 'ENGLISH' };
      return { ...defaults, ...GM_getValue(CONFIG_KEY, {}) };
    },
    set(newConfig) {
      GM_setValue(CONFIG_KEY, newConfig);
    }
  };

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

    ensureLineBreakAfter(container, selector, spacerClass) {
      // Only insert once per container - a re-render can detach the spacer from
      // its target, so check anywhere in the container, not just the next sibling
      const target = container?.querySelector(selector);
      if (!target || container.querySelector(`.${spacerClass}`)) return;

      const spacer = document.createElement('span');
      spacer.className = spacerClass;
      target.after(spacer);
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
    }
  };

  // ==========================================
  // Dub Information Processing
  // ==========================================
  const DubService = {
    hasStarted: false,

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

      let anilistId = null;
      try {
        const data = await armhaglund.fetchIds(ids.imdb ? 'imdb' : 'themoviedb', titleKey);
        anilistId = data?.anilist || null;
      } catch (error) {
        logger.error(`Error resolving ID for ${titleKey}:`, error);
      }

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

    async apply() {
      // Runs once per page; reset() re-enables it on SPA navigation
      if (this.hasStarted || !document.querySelector('.detail-meta-box--desktop')) return;

      const config = ModuleConfig.get();
      if (!config.dubInfo) return;

      this.hasStarted = true;
      const anilistId = await this.resolveAnilistId(this.getExternalIds());

      if (!anilistId) {
        logger.warn('No AniList ID available for dub info');
        return;
      }

      const { dubLanguage: language } = config;
      const cacheKey = `dub-${anilistId}-${language}`;
      const cached = ModuleCache.get(cacheKey);

      if (cached !== undefined) {
        this.displayDubInfo(cached, language);
        return;
      }

      try {
        const edges = await this.queryAnilistDub(anilistId, language);
        const hasDub = edges.some(edge => edge.voiceActors?.length > 0);
        ModuleCache.set(cacheKey, hasDub);
        this.displayDubInfo(hasDub, language);
      } catch (error) {
        logger.error(`Failed to fetch dub info for ${anilistId}: ${error.message}`);
        ModuleCache.set(cacheKey, false);
      }
    },

    reset() {
      this.hasStarted = false;
    }
  };

  // ==========================================
  // Settings UI
  // ==========================================
  const SettingsUI = {
    modal: null,

    close() {
      this.modal?.remove();
      this.modal = null;
    },

    open() {
      if (this.modal) return;
      const config = ModuleConfig.get();

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
              <input type="checkbox" class="rs-settings-toggle" id="rs-setting-dub-info" ${config.dubInfo ? 'checked' : ''}>
            </label>
            <label class="rs-settings-row rs-settings-row--select">
              <span>
                <strong>Preferred Dub Language</strong>
                <small>Language to check for</small>
              </span>
              <select id="rs-setting-dub-language">
                ${DUB_LANGUAGES.map(lang => `<option value="${lang.value}" ${config.dubLanguage === lang.value ? 'selected' : ''}>${lang.name}</option>`).join('')}
              </select>
            </label>
          </div>
          <div class="rs-settings-footer">
            <button type="button" class="rs-settings-btn rs-settings-btn--ghost" id="rs-clear-cache">Clear Cache</button>
            <button type="button" class="rs-settings-btn rs-settings-btn--primary" id="rs-save">Save</button>
          </div>
        </div>
      `;

      document.body.appendChild(overlay);
      this.modal = overlay;

      // Event Listeners
      overlay.querySelector('.rs-settings-close').addEventListener('click', () => this.close());
      overlay.addEventListener('click', (event) => {
        if (event.target === overlay) this.close();
      });

      overlay.querySelector('#rs-clear-cache').addEventListener('click', (event) => {
        ModuleCache.clearAll();
        event.target.textContent = 'Cleared!';
        setTimeout(() => { event.target.textContent = 'Clear Cache'; }, 1500);
      });

      overlay.querySelector('#rs-save').addEventListener('click', () => {
        ModuleConfig.set({
          ...ModuleConfig.get(),
          dubInfo: overlay.querySelector('#rs-setting-dub-info').checked,
          dubLanguage: overlay.querySelector('#rs-setting-dub-language').value
        });
        this.close();
        window.location.reload();
      });
    }
  };

  // ==========================================
  // Core Execution Loop
  // ==========================================
  let lastPath = location.pathname;

  function runMods() {
    // Detect SPA route changes so per-page state (e.g. dub info) re-runs without a reload
    if (location.pathname !== lastPath) {
      lastPath = location.pathname;
      DubService.reset();
      logger.debug(`SPA navigation detected: ${lastPath}`);
    }

    DOMModifiers.moveStatusBadge();
    DOMModifiers.applyEpisodeLineBreaks();
    DOMModifiers.updateTimestamps();
    DOMModifiers.updateDurations();
    DubService.apply();
  }

  // Set up initialization and throttled observation
  function init() {
    GM_registerMenuCommand('WeTrakr Mods Settings', () => SettingsUI.open());
    ModuleCache.clearExpired();
    runMods();

    let applyTimer;
    let lastRun = 0;
    const RUN_INTERVAL = 100;

    // Throttle: coalesce rapid DOM mutations into at most one runMods() per 100ms
    const observer = new MutationObserver(() => {
      const wait = Math.max(0, RUN_INTERVAL - (Date.now() - lastRun));
      clearTimeout(applyTimer);
      applyTimer = setTimeout(() => {
        lastRun = Date.now();
        runMods();
      }, wait);
    });

    // Watch only structural changes. All runMods() work is idempotent and reacts
    // to new nodes; class/style churn (hover, progress updates) would otherwise
    // fire the observer constantly and cause page lag.
    observer.observe(document.body, {
      childList: true,
      subtree: true
    });
  }

  init();
})();
