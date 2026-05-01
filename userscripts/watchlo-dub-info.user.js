// ==UserScript==
// @name          Watchlo Dub Info
// @version       0.1.4
// @description   Show dub availability for anime titles on Watchlo.
// @author        Journey Over
// @license       MIT
// @match         https://watchlo.tv/*
// @require       https://cdn.jsdelivr.net/gh/StylusThemes/Userscripts@644b86d55bf5816a4fa2a165bdb011ef7c22dfe1/libs/metadata/armhaglund/armhaglund.min.js
// @require       https://cdn.jsdelivr.net/gh/StylusThemes/Userscripts@644b86d55bf5816a4fa2a165bdb011ef7c22dfe1/libs/metadata/anilist/anilist.min.js
// @grant         GM_getValue
// @grant         GM_setValue
// @grant         GM_xmlhttpRequest
// @grant         GM_addStyle
// @run-at        document-end
// @icon          https://www.google.com/s2/favicons?sz=64&domain=watchlo.tv
// @homepageURL   https://github.com/StylusThemes/Userscripts
// @downloadURL   https://github.com/StylusThemes/Userscripts/raw/main/userscripts/watchlo-dub-info.user.js
// @updateURL     https://github.com/StylusThemes/Userscripts/raw/main/userscripts/watchlo-dub-info.user.js
// ==/UserScript==

(function() {
  'use strict';

  const CONFIG_KEY = 'watchlo-dub-config';
  const CACHE_PREFIX = 'watchlo-dub-cache';
  const CACHE_TTL = 24 * 60 * 60 * 1000;
  const DEFAULT_CONFIG = {
    enabled: true,
    language: 'ENGLISH'
  };

  const LANGUAGE_OPTIONS = [
    { value: 'ENGLISH', label: 'English' },
    { value: 'JAPANESE', label: 'Japanese' },
    { value: 'PORTUGUESE', label: 'Portuguese (Brazil)' },
    { value: 'SPANISH', label: 'Spanish' },
    { value: 'FRENCH', label: 'French' },
    { value: 'GERMAN', label: 'German' },
    { value: 'ITALIAN', label: 'Italian' },
    { value: 'RUSSIAN', label: 'Russian' },
    { value: 'KOREAN', label: 'Korean' },
    { value: 'CHINESE', label: 'Chinese' }
  ];

  const LANGUAGE_LABELS = Object.fromEntries(LANGUAGE_OPTIONS.map(option => [option.value, option.label]));

  const anilist = new AniList();
  const armhaglund = new ArmHaglund();

  function logError(...arguments_) {
    globalThis.console.error('[Watchlo Dub Info]', ...arguments_);
  }

  /**
   * Create an HTML element with an optional class and text.
   */
  function createElement(tagName, className, textContent) {
    const element = document.createElement(tagName);

    if (className) {
      element.className = className;
    }

    if (textContent !== undefined) {
      element.textContent = textContent;
    }

    return element;
  }

  /**
   * Create an SVG element.
   */
  function createSvgElement(tagName) {
    return document.createElementNS('http://www.w3.org/2000/svg', tagName);
  }

  /**
   * Parse the current Watchlo URL into media metadata.
   */
  function getMediaInfo() {
    const match = location.pathname.match(/^\/(shows|movies)\/(\d+)-/);

    if (!match) {
      return null;
    }

    return {
      mediaKind: match[1],
      tmdbId: match[2]
    };
  }

  function isRelevantPath() {
    return location.pathname === '/settings' || getMediaInfo() !== null;
  }

  /**
   * Format a language code for display.
   */
  function formatLanguageLabel(language) {
    return LANGUAGE_LABELS[language] || language;
  }

  function getLanguageOption(language) {
    return LANGUAGE_OPTIONS.find(option => option.value === language) || LANGUAGE_OPTIONS[0];
  }

  function bindLanguageDropdownEvents(instance) {
    if (instance.languageDropdownEventsBound) {
      return;
    }

    document.addEventListener('click', event => {
      const row = instance.languageDropdownRow;
      if (!row || !(event.target instanceof Node) || row.contains(event.target)) {
        return;
      }

      instance.closeLanguageDropdown(row);
    });

    document.addEventListener('keydown', event => {
      if (event.key === 'Escape' && instance.languageDropdownRow) {
        instance.closeLanguageDropdown(instance.languageDropdownRow);
      }
    });

    instance.languageDropdownEventsBound = true;
  }

  class WatchloDubInfo {
    constructor() {
      this.config = { ...DEFAULT_CONFIG };
      this.observer = null;
      this.routeInterval = null;
      this.syncTimer = null;
      this.languageDropdownRow = null;
      this.languageDropdownEventsBound = false;
      this.pendingMediaKey = null;
      this.activeMediaKey = null;
      this.lastRoute = location.href;
      this.lastHistoryState = history.state;
      this.init();
    }

    /**
     * Initialize config, observer, and first render pass.
     */
    init() {
      try {
        this.loadConfig();
        this.startRouteWatcher();
        this.startDomObserver();
        if (isRelevantPath()) {
          void this.handlePage();
        }
      } catch (error) {
        logError('Initialization failed', error);
      }
    }

    loadConfig() {
      try {
        const savedConfig = GM_getValue(CONFIG_KEY);
        if (savedConfig && typeof savedConfig === 'object') {
          this.config = { ...DEFAULT_CONFIG, ...savedConfig };
        }
      } catch (error) {
        logError('Failed to load config', error);
      }
    }

    saveConfig() {
      try {
        GM_setValue(CONFIG_KEY, { ...this.config });
      } catch (error) {
        logError('Failed to save config', error);
      }
    }

    startRouteWatcher() {
      const checkRoute = () => {
        const currentHref = location.href;
        const currentState = history.state;

        if (currentHref === this.lastRoute && currentState === this.lastHistoryState) {
          return;
        }

        this.lastRoute = currentHref;
        this.lastHistoryState = currentState;

        if (isRelevantPath()) {
          void this.handlePage();
          return;
        }

        this.resetDetailState();
        this.removeDubInfo();
      };

      const wrapHistoryMethod = methodName => {
        const original = history[methodName];
        if (typeof original !== 'function' || original.__watchloDubWrapped) {
          return;
        }

        const wrapped = function() {
          const result = original.apply(this, arguments);
          window.dispatchEvent(new Event('watchlo-dub-routechange'));
          return result;
        };

        wrapped.__watchloDubWrapped = true;
        history[methodName] = wrapped;
      };

      wrapHistoryMethod('pushState');
      wrapHistoryMethod('replaceState');

      window.addEventListener('popstate', checkRoute);
      window.addEventListener('watchlo-dub-routechange', checkRoute);

      this.routeInterval = window.setInterval(checkRoute, 250);
    }

    startDomObserver() {
      const attachObserver = () => {
        if (!document.body || this.observer) {
          return;
        }

        this.observer = new MutationObserver(() => this.scheduleSync());
        this.observer.observe(document.body, {
          childList: true,
          subtree: true
        });
      };

      if (document.body) {
        attachObserver();
        return;
      }

      document.addEventListener('DOMContentLoaded', attachObserver, { once: true });
    }

    scheduleSync() {
      if (this.syncTimer !== null) {
        return;
      }

      this.syncTimer = window.setTimeout(() => {
        this.syncTimer = null;

        if (isRelevantPath()) {
          void this.handlePage();
        }
      }, 50);
    }

    /**
     * Route the current page to the matching feature.
     */
    async handlePage() {
      try {
        if (location.pathname === '/settings') {
          this.syncSettingsPage();
          return;
        }

        const mediaInfo = getMediaInfo();
        if (!mediaInfo) {
          this.resetDetailState();
          this.removeDubInfo();
          return;
        }

        await this.syncDetailPage(mediaInfo);
      } catch (error) {
        logError('Page handling failed', error);
      }
    }

    resetDetailState() {
      this.pendingMediaKey = null;
      this.activeMediaKey = null;
    }

    removeDubInfo() {
      const node = document.querySelector('[data-watchlo-dub-info="true"]');
      if (node) {
        node.remove();
      }
    }

    getMediaKey(mediaInfo) {
      return `${mediaInfo.mediaKind}:${mediaInfo.tmdbId}`;
    }

    getCacheKey(mediaInfo) {
      return `${CACHE_PREFIX}:${mediaInfo.mediaKind}:${mediaInfo.tmdbId}`;
    }

    isCacheValid(cache) {
      return !!cache?.checkedAt && Date.now() - cache.checkedAt < CACHE_TTL;
    }

    getCachedResult(mediaInfo) {
      try {
        const cache = GM_getValue(this.getCacheKey(mediaInfo));

        if (!this.isCacheValid(cache) || cache?.anilistId == null) {
          return null;
        }

        const cachedLanguageResult = cache.dubByLanguage?.[this.config.language];
        return cachedLanguageResult === undefined ? null : cachedLanguageResult;
      } catch (error) {
        logError('Failed reading cache', error);
        return null;
      }
    }

    cacheConfirmedResult(mediaInfo, anilistId, language, hasDub) {
      try {
        const cacheKey = this.getCacheKey(mediaInfo);
        const currentCache = GM_getValue(cacheKey) || {};

        GM_setValue(cacheKey, {
          checkedAt: Date.now(),
          anilistId,
          dubByLanguage: {
            ...(currentCache.dubByLanguage || {}),
            [language]: hasDub
          }
        });
      } catch (error) {
        logError('Failed writing cache', error);
      }
    }

    /**
     * Resolve AniList ID and render the dub marker when available.
     */
    async syncDetailPage(mediaInfo) {
      const mediaKey = this.getMediaKey(mediaInfo);
      const existingNode = document.querySelector('[data-watchlo-dub-info="true"]');

      if (!this.config.enabled) {
        this.removeDubInfo();
        this.resetDetailState();
        return;
      }

      if (this.activeMediaKey && this.activeMediaKey !== mediaKey) {
        this.removeDubInfo();
        this.resetDetailState();
      }

      if (existingNode) {
        this.activeMediaKey = mediaKey;
        return;
      }

      const cachedResult = this.getCachedResult(mediaInfo);
      if (cachedResult !== null) {
        this.activeMediaKey = mediaKey;

        if (cachedResult) {
          this.insertDubInfo(mediaInfo);
        }

        return;
      }

      if (this.pendingMediaKey === mediaKey || this.activeMediaKey === mediaKey) {
        return;
      }

      this.pendingMediaKey = mediaKey;

      try {
        const anilistId = await this.resolveAniListId(mediaInfo);
        if (!anilistId) {
          logError('AniList ID not resolved', mediaInfo);
          return;
        }

        const hasDub = await this.queryAniListDub(anilistId, this.config.language);
        if (this.getMediaKey(getMediaInfo() || mediaInfo) !== mediaKey) {
          return;
        }

        this.cacheConfirmedResult(mediaInfo, anilistId, this.config.language, hasDub);

        if (hasDub) {
          this.insertDubInfo(mediaInfo);
        }

        this.activeMediaKey = mediaKey;
      } catch (error) {
        logError('Detail page processing failed', error);
        this.activeMediaKey = mediaKey;
      } finally {
        if (this.pendingMediaKey === mediaKey) {
          this.pendingMediaKey = null;
        }
      }
    }

    async resolveAniListId() {
      try {
        const anilistLink = document.querySelector('a[href*="anilist.co/anime/"]');
        const href = anilistLink?.getAttribute('href') || '';
        const match = href.match(/\/anime\/(\d+)(?:\/|$)/);
        let anilistId = match ? match[1] : null;

        const tmdbLink = document.querySelector('a[href*="themoviedb.org/tv/"], a[href*="themoviedb.org/movie/"]');
        const tmdbId = tmdbLink?.href.match(/\/(?:tv|movie)\/(\d+)(?:\/)?$/)?.[1] || null;

        if (!anilistId && tmdbId) {
          try {
            const ids = await armhaglund.fetchIds('themoviedb', tmdbId);
            anilistId = ids?.anilist ? String(ids.anilist) : null;
          } catch (error) {
            logError('ArmHaglund fallback failed', error.message);
          }
        }

        return anilistId;
      } catch (error) {
        logError('Failed to resolve AniList ID', error);
        return null;
      }
    }

    /**
     * Query AniList for a dub match.
     */
    async queryAniListDub(anilistId, language) {
      const query = `
        query($id: Int!, $type: MediaType, $page: Int = 1, $language: StaffLanguage) {
          Media(id: $id, type: $type) {
            characters(page: $page, sort: [ROLE], role: MAIN) {
              edges {
                node { id }
                voiceActors(language: $language) {
                  language
                }
              }
            }
          }
        }
      `;

      const allResults = [];

      for (let page = 1; page <= 3; page++) {
        try {
          const response = await anilist.query(query, {
            id: Number(anilistId),
            type: 'ANIME',
            page,
            language
          });

          const edges = response?.data?.Media?.characters?.edges || [];
          allResults.push(...edges);

          if (edges.length === 0) {
            break;
          }
        } catch {
          break;
        }
      }

      return allResults.some(edge => (edge?.voiceActors?.length || 0) > 0);
    }

    /**
     * Insert the dub badge after the Japan/Japanese metadata row.
     */
    insertDubInfo() {
      if (document.querySelector('[data-watchlo-dub-info="true"]')) {
        return;
      }

      const anchor = this.findMetadataAnchor();
      if (!anchor) {
        return;
      }

      const label = formatLanguageLabel(this.config.language);
      const dubNode = this.createDubNode(label);
      anchor.after(dubNode);
    }

    findMetadataAnchor() {
      const candidates = [...document.querySelectorAll('.flex.items-center')];
      return candidates.find(candidate => {
        const text = (candidate.textContent || '').trim();
        return /^Japanese$/i.test(text) || /\bJapanese\b/i.test(text);
      }) || null;
    }

    createDubNode(languageLabel) {
      const node = createElement('div', 'flex items-center gap-1.5');
      node.dataset.watchloDubInfo = 'true';

      const svg = createSvgElement('svg');
      svg.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
      svg.setAttribute('width', '24');
      svg.setAttribute('height', '24');
      svg.setAttribute('viewBox', '0 0 24 24');
      svg.setAttribute('fill', 'none');
      svg.setAttribute('stroke', 'currentColor');
      svg.setAttribute('stroke-width', '2');
      svg.setAttribute('stroke-linecap', 'round');
      svg.setAttribute('stroke-linejoin', 'round');
      svg.classList.add('h-3.5', 'w-3.5', 'text-muted-foreground/80');

      const path = createSvgElement('path');
      path.setAttribute('d', 'M3 14h3a2 2 0 0 1 2 2v3a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-7a9 9 0 0 1 18 0v7a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3');

      const text = createElement('span', 'text-[13px] text-muted-foreground/80', `${languageLabel} Dub Exists`);

      svg.appendChild(path);
      node.appendChild(svg);
      node.appendChild(text);

      return node;
    }

    /**
     * Inject or refresh the settings toggle row.
     */
    syncSettingsPage() {
      const section = this.findPreferencesSection();
      if (!section) {
        return;
      }

      let row = section.querySelector('[data-watchlo-dub-setting="true"]');
      if (!row) {
        row = this.createSettingRow();
      }

      const anchor = this.findAnimeDisplayModeRow(section);
      if (anchor) {
        anchor.after(row);
      } else {
        const list = section.querySelector('ul, ol, [role="list"]');
        if (list) {
          list.appendChild(row);
        } else {
          section.appendChild(row);
        }
      }

      this.updateSettingRow(row);
    }

    findPreferencesSection() {
      const sections = [...document.querySelectorAll('section')];

      for (const section of sections) {
        const heading = section.querySelector('h1, h2, h3, h4, h5, h6');
        if (heading && /Preferences/i.test(heading.textContent || '')) {
          return section;
        }
      }

      return null;
    }

    findAnimeDisplayModeRow(section) {
      const candidates = [...section.querySelectorAll('li, [role="listitem"], label, p, span, div')];

      for (const candidate of candidates) {
        const text = (candidate.textContent || '').replace(/\s+/g, ' ').trim();
        if (!/Anime Display Mode/i.test(text)) {
          continue;
        }

        const row = candidate.closest('li, [role="listitem"]');
        if (row && row !== section) {
          return row;
        }
      }

      return null;
    }

    openLanguageDropdown(row) {
      const panel = row.querySelector('[data-dub-language-panel="true"]');
      const button = row.querySelector('[data-dub-language-button="true"]');

      if (!panel || !button) {
        return;
      }

      this.languageDropdownRow = row;
      panel.hidden = false;
      button.setAttribute('aria-expanded', 'true');
    }

    closeLanguageDropdown(row) {
      const panel = row?.querySelector('[data-dub-language-panel="true"]');
      const button = row?.querySelector('[data-dub-language-button="true"]');

      if (panel) {
        panel.hidden = true;
      }

      if (button) {
        button.setAttribute('aria-expanded', 'false');
      }

      if (this.languageDropdownRow === row) {
        this.languageDropdownRow = null;
      }
    }

    toggleLanguageDropdown(row) {
      const panel = row.querySelector('[data-dub-language-panel="true"]');

      if (!panel) {
        return;
      }

      if (this.languageDropdownRow && this.languageDropdownRow !== row) {
        this.closeLanguageDropdown(this.languageDropdownRow);
      }

      if (panel.hidden) {
        this.openLanguageDropdown(row);
      } else {
        this.closeLanguageDropdown(row);
      }
    }

    createSettingRow() {
      const row = createElement('li');
      row.dataset.watchloDubSetting = 'true';

      const wrapper = createElement('div', 'flex items-center justify-between gap-4 px-5 py-3.5');
      const copy = createElement('div');
      const title = createElement('p', 'text-[14px] font-medium text-foreground', 'Dub Information');
      const dropdown = createElement('div', 'relative');
      const button = createElement('button', 'btn-depth flex items-center justify-between gap-2 min-w-[120px] h-9 px-3 rounded-[var(--radius-sm)] border border-white/[0.08] bg-[#181920] text-sm text-muted-foreground shadow-[inset_0_1px_0_rgba(255,255,255,0.03),0_14px_34px_-30px_rgba(0,0,0,0.82)]');
      const buttonLabel = createElement('span', null, getLanguageOption(this.config.language).label);
      const chevron = createSvgElement('svg');
      const chevronPath = createSvgElement('path');
      const panel = createElement('div', 'absolute right-0 mt-2 w-48 origin-top-right rounded-[20px] bg-[linear-gradient(180deg,rgba(16,18,24,0.98),rgba(9,11,15,0.99))] border border-white/[0.1] shadow-[0_12px_40px_-12px_rgba(0,0,0,0.9)] backdrop-blur-md p-1.5 z-50');

      button.type = 'button';
      button.dataset.dubLanguageButton = 'true';
      button.setAttribute('aria-haspopup', 'listbox');
      button.setAttribute('aria-expanded', 'false');

      buttonLabel.dataset.dubLanguageLabel = 'true';

      chevron.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
      chevron.setAttribute('width', '16');
      chevron.setAttribute('height', '16');
      chevron.setAttribute('viewBox', '0 0 16 16');
      chevron.setAttribute('fill', 'none');
      chevron.setAttribute('stroke', 'currentColor');
      chevron.setAttribute('stroke-width', '1.75');
      chevron.setAttribute('stroke-linecap', 'round');
      chevron.setAttribute('stroke-linejoin', 'round');
      chevron.style.flexShrink = '0';

      chevronPath.setAttribute('d', 'M4 6l4 4 4-4');

      panel.dataset.dubLanguagePanel = 'true';
      panel.setAttribute('role', 'listbox');
      panel.hidden = true;

      for (const optionData of LANGUAGE_OPTIONS) {
        const optionButton = createElement('button', optionData.value === this.config.language ? 'w-full px-3 py-2 text-sm rounded-[14px] bg-white/[0.09] text-foreground' : 'w-full px-3 py-2 text-sm rounded-[14px] text-foreground/82 hover:bg-white/[0.06]');
        optionButton.type = 'button';
        optionButton.dataset.dubLanguageOption = optionData.value;
        optionButton.setAttribute('role', 'option');
        optionButton.setAttribute('aria-selected', optionData.value === this.config.language ? 'true' : 'false');
        optionButton.style.textAlign = 'left';
        optionButton.textContent = optionData.label;
        panel.appendChild(optionButton);
      }

      chevron.appendChild(chevronPath);
      button.appendChild(buttonLabel);
      button.appendChild(chevron);
      dropdown.appendChild(button);
      dropdown.appendChild(panel);

      copy.appendChild(title);
      wrapper.appendChild(copy);
      wrapper.appendChild(dropdown);
      row.appendChild(wrapper);

      return row;
    }

    updateSettingRow(row) {
      const button = row.querySelector('[data-dub-language-button="true"]');
      const buttonLabel = row.querySelector('[data-dub-language-label="true"]');
      const panel = row.querySelector('[data-dub-language-panel="true"]');

      if (!button || !buttonLabel || !panel) {
        return;
      }

      bindLanguageDropdownEvents(this);

      const selectedOption = getLanguageOption(this.config.language);
      buttonLabel.textContent = selectedOption.label;

      const optionButtons = [...panel.querySelectorAll('[data-dub-language-option]')];
      for (const optionButton of optionButtons) {
        const isSelected = optionButton.dataset.dubLanguageOption === selectedOption.value;
        optionButton.className = isSelected ? 'w-full px-3 py-2 text-sm rounded-[14px] bg-white/[0.09] text-foreground' : 'w-full px-3 py-2 text-sm rounded-[14px] text-foreground/82 hover:bg-white/[0.06]';
        optionButton.setAttribute('aria-selected', isSelected ? 'true' : 'false');

        if (!optionButton.dataset.bound) {
          optionButton.addEventListener('click', () => {
            const value = optionButton.dataset.dubLanguageOption;
            if (!value) {
              return;
            }

            this.config.language = value;
            this.saveConfig();
            this.closeLanguageDropdown(row);
            this.updateSettingRow(row);
            this.scheduleSync();
          });

          optionButton.dataset.bound = 'true';
        }
      }

      if (!button.dataset.bound) {
        button.addEventListener('click', () => {
          this.toggleLanguageDropdown(row);
        });

        button.dataset.bound = 'true';
      }
    }

    stop() {
      if (this.observer) {
        this.observer.disconnect();
      }

      if (this.routeInterval) {
        window.clearInterval(this.routeInterval);
      }
    }
  }

  new WatchloDubInfo();
})();
