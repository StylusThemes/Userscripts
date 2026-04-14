// ==UserScript==
// @name          DMM - Add Trash Guide Regex Buttons
// @version       4.0.0
// @description   Adds buttons to Debrid Media Manager for applying Trash Guide regex patterns.
// @author        Journey Over
// @license       MIT
// @match         *://debridmediamanager.com/*
// @require       https://cdn.jsdelivr.net/gh/StylusThemes/Userscripts@dc8ecd635120f4174e5cff7173de89555fb69a9b/libs/dmm/button-data.min.js
// @require       https://cdn.jsdelivr.net/gh/StylusThemes/Userscripts@0171b6b6f24caea737beafbc2a8dacd220b729d8/libs/utils/utils.min.js
// @require       https://cdn.jsdelivr.net/gh/StylusThemes/Userscripts@644b86d55bf5816a4fa2a165bdb011ef7c22dfe1/libs/metadata/armhaglund/armhaglund.min.js
// @grant         GM_getValue
// @grant         GM_setValue
// @grant         GM_xmlhttpRequest
// @icon          https://www.google.com/s2/favicons?sz=64&domain=debridmediamanager.com
// @homepageURL   https://github.com/StylusThemes/Userscripts
// @downloadURL   https://github.com/StylusThemes/Userscripts/raw/main/userscripts/dmm-add-trash-buttons.user.js
// @updateURL     https://github.com/StylusThemes/Userscripts/raw/main/userscripts/dmm-add-trash-buttons.user.js
// ==/UserScript==

(function() {
  'use strict';

  const logger = Logger('DMM - Add Trash Guide Regex Buttons', { debug: false });

  // ─── Configuration ───────────────────────────────────────────────────────────

  const CONFIG = {
    RELEVANT_PAGE_RX: /^https:\/\/debridmediamanager\.com\/(movie|show)\/(tt\d+)(?:\/(\d+))?$/,
    CONTAINER_SELECTORS: [
      'div.mb-2.flex.items-center.gap-2.overflow-x-auto.p-2',
      '.mb-2.flex.items-center.gap-2',
      '.mb-2'
    ],
    MAX_RETRIES: 15,
    CSS_CLASS_PREFIX: 'dmm-tg',
    QUALITY_OPTIONS_KEY: 'dmm-tg-quality-options',
    QUALITY_POLARITY_KEY: 'dmm-tg-quality-polarity',
    LOGIC_MODE_KEY: 'dmm-tg-logic-mode',
    CACHE_KEY: 'cache',
    CACHE_PREFIX: 'dmm-anime-cache-',
    CACHE_LAST_CLEANUP_KEY: 'cache-last-cleanup',
    CACHE_DURATION: 24 * 60 * 60 * 1000,
    MUTATION_DEBOUNCE: 150,
    EXTERNAL_BUTTON_CONTAINERS: [
      '.grid > div:last-child',
      '.flex.flex-col.gap-2 > div:last-child',
      'div[class*="gap-2"] > div:last-child',
      '.grid > div'
    ]
  };

  const BUTTON_DATA = Array.isArray(window?.DMM_BUTTON_DATA) ? window.DMM_BUTTON_DATA : [];
  const armhaglund = new ArmHaglund();

  // ─── Quality Tokens ──────────────────────────────────────────────────────────

  const QUALITY_TOKENS = [
    { key: '720p', name: '720p', values: ['720p'] },
    { key: '1080p', name: '1080p', values: ['1080p'] },
    { key: '4k', name: '4k', values: ['\\b4k\\b', '2160p'] },
    { key: 'dv', name: 'Dolby Vision', values: ['dovi', '\\bdv\\b', 'dolby', 'vision'] },
    { key: 'x264', name: 'x264', values: ['264'] },
    { key: 'x265', name: 'x265', values: ['265', '\\bHEVC\\b'] },
    { key: 'hdr', name: 'HDR', values: ['hdr'] },
    { key: 'remux', name: 'Remux', values: ['remux'] },
    { key: 'atmos', name: 'Atmos', values: ['atmos'] }
  ];

  const ALL_QUALITY_VALUES = QUALITY_TOKENS.flatMap(token => token.values);

  // ─── Regex Helpers ───────────────────────────────────────────────────────────

  const removeQualityFromRegex = (regex) => {
    if (!regex || typeof regex !== 'string') return '';

    let cleaned = regex;

    const andPattern = /^\^((?:\(\?[=!].*?\))+)\.\*/;
    const andMatch = cleaned.match(andPattern);
    if (andMatch) {
      const lookaheadBlock = andMatch[1];
      const containsQuality = ALL_QUALITY_VALUES.some(value => lookaheadBlock.includes(value));
      if (containsQuality) {
        cleaned = cleaned.slice(andMatch[0].length);
      }
    }

    const orPattern = /\|\(([^)]+)\)$/;
    const orMatch = cleaned.match(orPattern);
    if (orMatch) {
      const containsQuality = ALL_QUALITY_VALUES.some(value => orMatch[1].includes(value));
      if (containsQuality) {
        cleaned = cleaned.slice(0, cleaned.length - orMatch[0].length);
      }
    }

    const standalonePattern = /^(?:\([^)]+\)|\(\?[=!].*?\))$/;
    if (standalonePattern.test(cleaned)) {
      const containsQuality = ALL_QUALITY_VALUES.some(value => cleaned.includes(value));
      if (containsQuality) cleaned = '';
    }

    return cleaned.trim();
  };

  const buildQualityString = (selectedOptions, useAndLogic = false, qualityPolarity = new Map()) => {
    if (!selectedOptions.length) return '';

    const tokenValues = [];
    for (const key of selectedOptions) {
      const token = QUALITY_TOKENS.find(tokenItem => tokenItem.key === key);
      if (token?.values) tokenValues.push(token.values);
    }

    if (!tokenValues.length) return '';

    if (useAndLogic) {
      return selectedOptions.map((key, index) => {
        const values = tokenValues[index];
        const isPositive = qualityPolarity.get(key) !== false;
        const type = isPositive ? '=' : '!';
        return values.length === 1 ?
          `(?${type}.*${values[0]})` :
          `(?${type}.*(?:${values.join('|')}))`;
      }).join('');
    }

    return `(${tokenValues.flat().join('|')})`;
  };

  // ─── Styles ──────────────────────────────────────────────────────────────────

  const generateStyles = () => {
    const prefix = CONFIG.CSS_CLASS_PREFIX;
    return `
      .${prefix}-btn{cursor:pointer;display:inline-flex;align-items:center;gap:.35rem;margin-right:.5rem;padding:.25rem .5rem;font-size:12px;line-height:1;border-radius:.375rem;color:#e6f0ff;background:rgba(15,23,42,.5);border:1px solid rgba(59,130,246,.55);box-shadow:none;user-select:none;white-space:nowrap;}
      .${prefix}-btn:hover{background:rgba(59,130,246,.08);}
      .${prefix}-btn:focus{outline:2px solid rgba(59,130,246,.18);outline-offset:2px;}
      .${prefix}-chev{width:12px;height:12px;color:rgba(226,240,255,.95);margin-left:.15rem;display:inline-block;transition:transform 160ms ease;transform-origin:center;}
      .${prefix}-btn[aria-expanded="true"] .${prefix}-chev{transform:rotate(180deg);}
      .${prefix}-menu{position:absolute;min-width:10rem;background:#111827;color:#fff;border:1px solid rgba(148,163,184,.06);border-radius:.375rem;box-shadow:0 6px 18px rgba(2,6,23,.6);padding:.25rem 0;z-index:9999;display:none;}
      .${prefix}-menu::before{content:"";position:absolute;top:-6px;left:12px;width:0;height:0;border-left:6px solid transparent;border-right:6px solid transparent;border-bottom:6px solid #111827;}
      .${prefix}-item{padding:.45rem .75rem;cursor:pointer;font-size:13px;white-space:nowrap;border-bottom:1px solid rgba(255,255,255,.03);}
      .${prefix}-item:last-child{border-bottom:none;}
      .${prefix}-item:hover{background:#1f2937;}
      .${prefix}-quality-section{display:contents;}
      .${prefix}-quality-grid{display:contents;}
      .${prefix}-quality-item{display:inline-flex;align-items:center;font-size:12px;}
      .${prefix}-quality-button{padding:.25rem .5rem;border-radius:.375rem;border:1px solid rgba(148,163,184,.15);background:transparent;color:#e6f0ff;cursor:pointer;font-size:12px;line-height:1}
      .${prefix}-quality-button.active{background:#3b82f6;color:#fff;border-color:#3b82f6}
      .${prefix}-quality-button.active.negative{background:#dc2626;color:#fff;border-color:#dc2626}
      .${prefix}-quality-button:focus{outline:1px solid rgba(59,130,246,.5);}
      .${prefix}-quality-label{color:#e6f0ff;cursor:pointer;white-space:nowrap;}
      .${prefix}-logic-selector{margin:0 .75rem;padding:0 .75rem;border-left:1px solid rgba(148,163,184,.15);border-right:1px solid rgba(148,163,184,.15);display:flex;align-items:center;}
      .${prefix}-logic-toggle{display:inline-flex;border:1px solid rgba(148,163,184,.4);border-radius:.375rem;overflow:hidden;}
      .${prefix}-logic-option{background:#1f2937;color:#e6f0ff;border:none;padding:.25rem .5rem;font-size:12px;cursor:pointer;transition:all 0.2s ease;line-height:1;display:flex;align-items:center;position:relative;}
      .${prefix}-logic-option:hover{background:#374151;}
      .${prefix}-logic-option.active{background:#3b82f6;color:#fff;border-left:1px solid #3b82f6;border-right:1px solid #3b82f6;margin-left:-1px;margin-right:-1px;z-index:1;}
      .${prefix}-logic-option:focus{outline:1px solid rgba(59,130,246,.5);}
      .${prefix}-help-icon{background:#1f2937;color:#e6f0ff;border:1px solid rgba(148,163,184,.4);border-radius:50%;width:16px;height:16px;font-size:11px;cursor:help;margin-left:.25rem;display:inline-flex;align-items:center;justify-content:center;font-weight:bold;}
      .${prefix}-help-icon:hover{background:#374151;}
      .${prefix}-loading{opacity:.5;pointer-events:none;}
      .${prefix}-error{color:#f87171;font-size:11px;margin-left:.5rem;}
      div.mb-2.flex.items-center.gap-2.overflow-x-auto.p-2{flex-wrap:wrap;overflow-x:visible;}
      h2.line-clamp-2{display:block!important;-webkit-line-clamp:unset!important;-webkit-box-orient:unset!important;overflow:visible!important;text-overflow:unset!important;white-space:normal!important;}
    `;
  };

  (function injectStyles() {
    const style = document.createElement('style');
    style.textContent = generateStyles();
    document.head.appendChild(style);
  })();

  // ─── Cache Manager ───────────────────────────────────────────────────────────

  const CacheManager = {
    get(imdbId) {
      try {
        const cache = GM_getValue(CONFIG.CACHE_KEY);
        if (!cache || typeof cache !== 'object' || Array.isArray(cache)) return null;
        const entry = cache[`${CONFIG.CACHE_PREFIX}${imdbId}`];
        if (entry && (Date.now() - entry.timestamp) < CONFIG.CACHE_DURATION) {
          return entry.data;
        }
      } catch {
        // ignore
      }
      return null;
    },

    set(imdbId, data) {
      try {
        let cache = GM_getValue(CONFIG.CACHE_KEY);
        if (!cache || typeof cache !== 'object' || Array.isArray(cache)) cache = {};
        cache[`${CONFIG.CACHE_PREFIX}${imdbId}`] = { data, timestamp: Date.now() };

        const now = Date.now();
        const lastCleanup = GM_getValue(CONFIG.CACHE_LAST_CLEANUP_KEY) || 0;
        if (now - lastCleanup >= CONFIG.CACHE_DURATION) {
          let cleaned = 0;
          for (const [key, entry] of Object.entries(cache)) {
            if (key.startsWith(CONFIG.CACHE_PREFIX) && (now - entry.timestamp) > CONFIG.CACHE_DURATION) {
              delete cache[key];
              cleaned++;
            }
          }
          GM_setValue(CONFIG.CACHE_LAST_CLEANUP_KEY, now);
          if (cleaned > 0) logger.debug(`Cache cleanup: removed ${cleaned} expired entries`);
        }
        GM_setValue(CONFIG.CACHE_KEY, cache);
      } catch (error) {
        logger.error('Cache write failed:', error);
      }
    }
  };

  // ─── Anime Detection ─────────────────────────────────────────────────────────

  const AnimeDetector = {
    async fetchAnimeData(imdbId) {
      try {
        const data = await armhaglund.fetchIds('imdb', imdbId);
        return data?.anilist ? { isAnime: true, anilistId: data.anilist } : { isAnime: false, anilistId: null };
      } catch (error) {
        logger.debug(`ArmHaglund fetch failed: ${error.message}`);
        return { isAnime: false, anilistId: null };
      }
    },

    checkReleasesMoe(anilistId) {
      return new Promise((resolve) => {
        GM_xmlhttpRequest({
          method: 'GET',
          url: `https://releases.moe/api/collections/entries/records?filter=alID=${anilistId}`,
          timeout: 10000,
          onload: (response) => {
            try {
              const data = JSON.parse(response.responseText);
              resolve(data.totalItems > 0);
            } catch {
              logger.error(`Releases.moe parse error for ${anilistId}`);
              resolve(false);
            }
          },
          onerror: () => {
            logger.error(`Releases.moe request failed for ${anilistId}`);
            resolve(false);
          },
          ontimeout: () => {
            logger.error(`Releases.moe timeout for ${anilistId}`);
            resolve(false);
          }
        });
      });
    },

    async detect(imdbId) {
      const cached = CacheManager.get(imdbId);
      if (cached) {
        logger.debug(`Anime cache hit for ${imdbId}`);
        return cached;
      }

      logger.debug(`Anime cache miss for ${imdbId}`);
      const result = await this.fetchAnimeData(imdbId);

      result.releasesExists = result.isAnime && result.anilistId ? (await this.checkReleasesMoe(result.anilistId)) : false;

      CacheManager.set(imdbId, result);
      return result;
    }
  };

  // ─── Input Manager ───────────────────────────────────────────────────────────

  const InputManager = {
    _cache: null,

    find(scope) {
      const primary = document.getElementById('query');
      if (this._isUsable(primary)) {
        this._cache = primary;
        return primary;
      }

      if (scope) {
        const scoped = scope.querySelector('input:not([type="hidden"]):not([type="checkbox"]):not([type="radio"]), textarea');
        if (this._isUsable(scoped)) {
          this._cache = scoped;
          return scoped;
        }
      }

      const all = document.querySelectorAll('input:not([type="hidden"]):not([type="checkbox"]):not([type="radio"]), textarea');
      for (const element of all) {
        if (this._isUsable(element)) {
          this._cache = element;
          return element;
        }
      }

      return null;
    },

    invalidate() {
      this._cache = null;
    },

    _isUsable(element) {
      if (!element) return false;
      if (element.disabled || element.readOnly) return false;
      if (element.offsetParent === null) return false;
      const style = getComputedStyle(element);
      return style.visibility !== 'hidden' && style.display !== 'none' && style.opacity !== '0';
    },

    write(element, value) {
      if (!element) return;
      const string_ = typeof value === 'string' ? value : String(value ?? '');
      const proto = element instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
      const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;

      if (setter) setter.call(element, string_);
      else element.value = string_;

      try {
        element.focus();
        element.setSelectionRange?.(string_.length, string_.length);
      } catch { /* ignore */ }

      element.dispatchEvent(new Event('input', { bubbles: true }));
      element.dispatchEvent(new Event('change', { bubbles: true }));

      try { element._valueTracker?.setValue?.(string_); } catch { /* ignore React internals */ }
    }
  };

  // ─── Quality Manager ─────────────────────────────────────────────────────────

  class QualityManager {
    constructor() {
      this.state = { selectedOptions: [], qualityPolarity: new Map(), useAndLogic: false };
      this.container = null;
      this.buttons = new Map();
      this.logicSelect = null;
    }

    async initialize(container) {
      this.container = container;
      this._createSection();
      await this._loadSettings();
      this._restoreStates();

      if (this.state.selectedOptions.length > 0) {
        requestAnimationFrame(() => this.updateInput());
      }
    }

    _createSection() {
      if (!this.container) return;
      if (this.container.querySelector(`.${CONFIG.CSS_CLASS_PREFIX}-quality-section`)) return;

      const section = document.createElement('div');
      section.className = `${CONFIG.CSS_CLASS_PREFIX}-quality-section`;

      const logicSelector = document.createElement('div');
      logicSelector.className = `${CONFIG.CSS_CLASS_PREFIX}-logic-selector`;

      const logicToggle = document.createElement('div');
      logicToggle.className = `${CONFIG.CSS_CLASS_PREFIX}-logic-toggle`;
      logicToggle.setAttribute('tabindex', '0');
      const prefix = CONFIG.CSS_CLASS_PREFIX;
      logicToggle.innerHTML = `
        <button type="button" class="${prefix}-logic-option active" data-mode="or">OR</button>
        <button type="button" class="${prefix}-logic-option" data-mode="and">AND</button>
      `;
      logicToggle.addEventListener('click', (event_) => this._onLogicToggle(event_));

      const helpButton = document.createElement('button');
      helpButton.type = 'button';
      helpButton.className = `${prefix}-help-icon`;
      helpButton.textContent = '?';
      helpButton.title = 'Logic Modes:\n\nOR Mode: Match ANY selected quality\nExample: (720p|1080p) - matches files with 720p OR 1080p\n\nAND Mode: Match ALL selected qualities (advanced filtering)\n- Requires EVERY selected quality to be present in the filename\n- Useful for precise filtering, e.g., only 1080p remux files\nExample: (?=.*1080p)(?=.*remux) - matches files with BOTH 1080p AND remux\n\nNegative Matching in AND Mode:\n- Click a quality button twice to exclude it\n- Creates a negative lookahead: (?!.*quality)\nExample: (?=.*1080p)(?!.*720p) - requires 1080p but excludes 720p\n\nTip: AND mode is powerful for complex filters but may match fewer files';

      logicSelector.appendChild(logicToggle);
      logicSelector.appendChild(helpButton);
      this.logicSelect = logicToggle;

      const grid = document.createElement('div');
      grid.className = `${prefix}-quality-grid`;

      for (const token of QUALITY_TOKENS) {
        const item = document.createElement('div');
        item.className = `${prefix}-quality-item`;

        const button = document.createElement('button');
        button.type = 'button';
        button.className = `${prefix}-quality-button`;
        button.id = `${prefix}-${token.key}`;
        button.textContent = token.name;
        button.addEventListener('click', () => this._onToggle(token.key, button));

        item.appendChild(button);
        grid.appendChild(item);
        this.buttons.set(token.key, button);
      }

      section.appendChild(logicSelector);
      section.appendChild(grid);
      this.container.appendChild(section);
    }

    async _loadSettings() {
      try {
        const stored = GM_getValue(CONFIG.QUALITY_OPTIONS_KEY);
        this.state.selectedOptions = stored ? JSON.parse(stored) : [];

        const polarityStored = GM_getValue(CONFIG.QUALITY_POLARITY_KEY);
        const polarityData = polarityStored ? JSON.parse(polarityStored) : {};
        this.state.qualityPolarity = new Map(Object.entries(polarityData));

        const logicStored = GM_getValue(CONFIG.LOGIC_MODE_KEY);
        this.state.useAndLogic = logicStored ? JSON.parse(logicStored) : false;
      } catch (error) {
        logger.error('Failed to load quality settings:', error);
        this.state = { selectedOptions: [], qualityPolarity: new Map(), useAndLogic: false };
      }
    }

    _restoreStates() {
      for (const key of this.state.selectedOptions) {
        const button = this.buttons.get(key);
        if (button) {
          button.classList.add('active');
          if (this.state.useAndLogic && this.state.qualityPolarity.get(key) === false) {
            button.classList.add('negative');
          }
        }
      }

      if (this.logicSelect) {
        for (const opt of this.logicSelect.querySelectorAll(`.${CONFIG.CSS_CLASS_PREFIX}-logic-option`)) {
          opt.classList.toggle('active',
            (opt.dataset.mode === 'and' && this.state.useAndLogic) ||
            (opt.dataset.mode === 'or' && !this.state.useAndLogic)
          );
        }
      }
    }

    _onLogicToggle(event_) {
      event_.preventDefault();
      event_.stopPropagation();
      const target = event_.target;
      if (!target.classList.contains(`${CONFIG.CSS_CLASS_PREFIX}-logic-option`)) return;

      const useAnd = target.dataset.mode === 'and';
      for (const opt of this.logicSelect.querySelectorAll(`.${CONFIG.CSS_CLASS_PREFIX}-logic-option`)) {
        opt.classList.remove('active');
      }
      target.classList.add('active');
      this._onLogicChange(useAnd);
    }

    _onLogicChange(useAndLogic) {
      const input = InputManager.find(this.container);
      if (input) {
        InputManager.write(input, removeQualityFromRegex(input.value || ''));
      }

      this.state.useAndLogic = useAndLogic;

      for (const key of this.state.selectedOptions) {
        const button = this.buttons.get(key);
        if (button) {
          if (useAndLogic && this.state.qualityPolarity.get(key) === false) {
            button.classList.add('negative');
          } else {
            button.classList.remove('negative');
          }
        }
      }

      try {
        GM_setValue(CONFIG.LOGIC_MODE_KEY, JSON.stringify(this.state.useAndLogic));
      } catch (error) {
        logger.error('Failed to save logic mode:', error);
      }

      this.updateInput();
    }

    _onToggle(key, button) {
      const active = button.classList.contains('active');
      const negative = button.classList.contains('negative');

      if (!active && !negative) {
        this._activate(key, button);
      } else if (active && !negative) {
        this.state.useAndLogic ? this._makeNegative(key, button) : this._deactivate(key, button);
      } else {
        this._deactivate(key, button);
      }

      this._save();
      this.updateInput();
    }

    _activate(key, button) {
      button.classList.add('active');
      if (!this.state.selectedOptions.includes(key)) this.state.selectedOptions.push(key);
      if (this.state.useAndLogic) this.state.qualityPolarity.set(key, true);
    }

    _makeNegative(key, button) {
      button.classList.add('negative');
      this.state.qualityPolarity.set(key, false);
    }

    _deactivate(key, button) {
      button.classList.remove('active', 'negative');
      const index = this.state.selectedOptions.indexOf(key);
      if (index > -1) this.state.selectedOptions.splice(index, 1);
      this.state.qualityPolarity.delete(key);
    }

    _save() {
      try {
        GM_setValue(CONFIG.QUALITY_OPTIONS_KEY, JSON.stringify(this.state.selectedOptions));
        GM_setValue(CONFIG.QUALITY_POLARITY_KEY, JSON.stringify(Object.fromEntries(this.state.qualityPolarity)));
      } catch (error) {
        logger.error('Failed to save quality options:', error);
      }
    }

    updateInput() {
      const input = InputManager.find(this.container);
      if (!input) return;

      const current = input.value || '';
      const qualityString = buildQualityString(this.state.selectedOptions, this.state.useAndLogic, this.state.qualityPolarity);

      let newValue;
      if (qualityString) {
        const cleaned = removeQualityFromRegex(current);
        newValue = this.state.useAndLogic ?
          (cleaned ? `^${qualityString}.*${cleaned}` : `^${qualityString}.*`) :
          (cleaned ? `${cleaned}|${qualityString}` : qualityString);
      } else {
        newValue = removeQualityFromRegex(current);
      }

      InputManager.write(input, newValue);
    }

    applyToValue(baseValue) {
      const qualityString = buildQualityString(this.state.selectedOptions, this.state.useAndLogic, this.state.qualityPolarity);
      if (!qualityString) return baseValue;

      const cleaned = removeQualityFromRegex(baseValue);
      return this.state.useAndLogic ?
        (cleaned ? `^${qualityString}.*${cleaned}` : `^${qualityString}.*`) :
        (cleaned ? `${cleaned}|${qualityString}` : qualityString);
    }

    cleanup() {
      this.buttons.clear();
      this.state.qualityPolarity.clear();
      if (this.container) {
        this.container.querySelector(`.${CONFIG.CSS_CLASS_PREFIX}-quality-section`)?.remove();
      }
    }
  }

  // ─── Button Manager ──────────────────────────────────────────────────────────

  class ButtonManager {
    constructor() {
      this.dropdowns = new Map();
      this.container = null;
      this.openMenu = null;
      this.qualityManager = new QualityManager();
      this._listenersAttached = false;
      this._externalButtonsCreated = new Set();

      this._docClick = this._onDocClick.bind(this);
      this._resize = this._onResize.bind(this);
      this._keydown = this._onKeydown.bind(this);
    }

    cleanup() {
      for (const { button, menu } of this.dropdowns.values()) {
        button.remove();
        menu.remove();
      }
      this.dropdowns.clear();
      this.qualityManager.cleanup();
      this.container = null;
      this.openMenu = null;
      this._externalButtonsCreated.clear();
      InputManager.invalidate();

      if (this._listenersAttached) {
        document.removeEventListener('click', this._docClick, true);
        document.removeEventListener('keydown', this._keydown);
        window.removeEventListener('resize', this._resize);
        this._listenersAttached = false;
      }
    }

    async initialize(container) {
      if (!container) return;

      if (container.querySelector(`.${CONFIG.CSS_CLASS_PREFIX}-btn`)) {
        this.container = container;
        return;
      }

      this.cleanup();
      this.container = container;

      for (const spec of BUTTON_DATA) {
        const name = String(spec.name || 'Pattern');
        if (this.dropdowns.has(name)) continue;

        const button = this._createButton(name);
        const menu = this._createMenu(spec.buttonData || [], name);

        document.body.appendChild(menu);
        container.appendChild(button);
        this.dropdowns.set(name, { button, menu });

        button.addEventListener('click', (event_) => {
          event_.stopPropagation();
          this._toggleMenu(name);
        });
      }

      await this.qualityManager.initialize(container);
      this._attachListeners();

      requestIdleCallback
        ?
        requestIdleCallback(() => this._setupExternalLinks()) :
        setTimeout(() => this._setupExternalLinks(), 100);
    }

    _attachListeners() {
      if (this._listenersAttached) return;
      document.addEventListener('click', this._docClick, true);
      document.addEventListener('keydown', this._keydown);
      window.addEventListener('resize', this._resize);
      this._listenersAttached = true;
    }

    _createButton(name) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = `${CONFIG.CSS_CLASS_PREFIX}-btn`;
      button.appendChild(document.createTextNode(name));

      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      svg.setAttribute('viewBox', '0 0 20 20');
      svg.setAttribute('aria-hidden', 'true');
      svg.setAttribute('class', `${CONFIG.CSS_CLASS_PREFIX}-chev`);
      svg.innerHTML = '<path d="M6 8l4 4 4-4" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" />';
      button.appendChild(svg);

      button.setAttribute('aria-haspopup', 'true');
      button.setAttribute('aria-expanded', 'false');
      button.tabIndex = 0;
      return button;
    }

    _createMenu(items, name) {
      const menu = document.createElement('div');
      menu.className = `${CONFIG.CSS_CLASS_PREFIX}-menu`;
      menu.dataset.owner = name;

      for (const item of items) {
        const entry = document.createElement('div');
        entry.className = `${CONFIG.CSS_CLASS_PREFIX}-item`;
        entry.textContent = item.name || item.value || 'apply';
        entry.addEventListener('click', (event_) => {
          event_.stopPropagation();
          this._onSelect(item.value, item.name);
          this._closeMenu();
        });
        menu.appendChild(entry);
      }

      return menu;
    }

    _toggleMenu(name) {
      const entry = this.dropdowns.get(name);
      if (!entry) return;
      const { button, menu } = entry;

      if (this.openMenu && this.openMenu !== menu) {
        this.openMenu.style.display = 'none';
      }

      if (menu.style.display === 'block') {
        this._closeMenu();
      } else {
        this._positionMenu(menu, button);
        menu.style.display = 'block';
        button.setAttribute('aria-expanded', 'true');
        this.openMenu = menu;
      }
    }

    _positionMenu(menu, button) {
      const rect = button.getBoundingClientRect();
      menu.style.left = `${Math.max(8, rect.left)}px`;
      menu.style.top = `${window.scrollY + rect.bottom + 6}px`;
    }

    _onDocClick(event_) {
      if (!this.openMenu) return;
      const entry = [...this.dropdowns.values()].find(item => item.menu === this.openMenu);
      if (entry && (entry.button.contains(event_.target) || this.openMenu.contains(event_.target))) return;
      this._closeMenu();
    }

    _onResize() {
      if (!this.openMenu) return;
      const entry = this.dropdowns.get(this.openMenu.dataset.owner);
      if (entry) this._positionMenu(entry.menu, entry.button);
    }

    _onKeydown(event_) {
      if (!this.openMenu) return;
      if (event_.key === 'Escape' || event_.key === 'Esc') {
        event_.preventDefault();
        this._closeMenu();
      }
    }

    _closeMenu() {
      if (!this.openMenu) return;
      const entry = this.dropdowns.get(this.openMenu.dataset.owner);
      if (entry) entry.button.setAttribute('aria-expanded', 'false');
      this.openMenu.style.display = 'none';
      this.openMenu = null;
    }

    _onSelect(value, name) {
      const input = InputManager.find(this.container);
      if (!input) {
        logger.error('Could not find target input element:', { name, value });
        return;
      }

      try {
        const finalValue = this.qualityManager.applyToValue(value || '');
        logger.debug('Applied pattern:', { name, value, finalValue, targetId: input.id || null });
        InputManager.write(input, finalValue);
      } catch (error) {
        logger.error('Failed to set input value:', error, { value, name });
      }
    }

    async _setupExternalLinks() {
      try {
        const match = location.pathname.match(/\/(movie|show)\/(tt\d+)/);
        if (!match) return;

        const [, mediaType, imdbId] = match;
        this._createTraktButton(imdbId, mediaType);

        const animeResult = await AnimeDetector.detect(imdbId);
        if (animeResult.isAnime && animeResult.anilistId && animeResult.releasesExists !== false) {
          this._createReleasesMoeButton(animeResult.anilistId);
        }
      } catch (error) {
        logger.error('External links setup failed:', error);
      }
    }

    _createExternalButton({ link, iconUrl, iconAlt, label, className, debugName }) {
      const key = `${debugName}:${link}`;
      if (this._externalButtonsCreated.has(key)) return null;

      const button = document.createElement('button');
      button.type = 'button';
      button.className = className;
      button.setAttribute('data-url', link);
      button.innerHTML = `<b class="flex items-center justify-center"><img src="${iconUrl}" class="mr-1 h-3 w-3" alt="${iconAlt}">${label}</b>`;
      button.addEventListener('click', () => window.open(link, '_blank', 'noopener,noreferrer'));

      for (const selector of CONFIG.EXTERNAL_BUTTON_CONTAINERS) {
        const container = document.querySelector(selector);
        if (container) {
          container.appendChild(button);
          this._externalButtonsCreated.add(key);
          logger.debug(`${debugName} button placed via "${selector}"`);
          return button;
        }
      }

      logger.warn(`${debugName} button: no suitable container found`);
      return null;
    }

    _createReleasesMoeButton(anilistId) {
      return this._createExternalButton({
        link: `https://releases.moe/${anilistId}/`,
        iconUrl: 'https://www.google.com/s2/favicons?sz=64&domain=releases.moe',
        iconAlt: 'SeaDex icon',
        label: 'SeaDex',
        className: 'mb-1 mr-2 mt-0 rounded border-2 border-pink-500 bg-pink-900/30 p-1 text-xs text-pink-100 transition-colors hover:bg-pink-800/50',
        debugName: 'Releases.moe'
      });
    }

    _createTraktButton(imdbId, mediaType) {
      return this._createExternalButton({
        link: `https://trakt.tv/${mediaType}s/${imdbId}`,
        iconUrl: 'https://cdn.jsdelivr.net/gh/homarr-labs/dashboard-icons/svg/trakt.svg',
        iconAlt: 'Trakt icon',
        label: 'Trakt',
        className: 'mb-1 mr-2 mt-0 rounded border-2 border-red-500 bg-red-900/30 p-1 text-xs text-red-100 transition-colors hover:bg-red-800/50',
        debugName: 'Trakt.tv'
      });
    }
  }

  // ─── Page Manager ────────────────────────────────────────────────────────────

  class PageManager {
    constructor() {
      this.buttonManager = new ButtonManager();
      this._retryCount = 0;
      this._currentMediaId = null;
      this._initializing = false;
      this._mutationObserver = null;
      this._pollingTimer = null;
      this._historyPatched = false;

      this._checkPage = debounce(this._checkPageImpl.bind(this), CONFIG.MUTATION_DEBOUNCE);

      this._patchHistory();
      this._setupMutationObserver();
      this._setupPolling();
      this._checkPage();
    }

    _patchHistory() {
      if (this._historyPatched) return;
      this._historyPatched = true;

      const originalPush = history.pushState;
      const originalReplace = history.replaceState;

      history.pushState = function(...arguments_) {
        originalPush.apply(this, arguments_);
        window.dispatchEvent(new Event('locationchange'));
      };

      history.replaceState = function(...arguments_) {
        originalReplace.apply(this, arguments_);
        window.dispatchEvent(new Event('locationchange'));
      };

      window.addEventListener('locationchange', () => this._onNavigate());
      window.addEventListener('popstate', () => this._onNavigate());
    }

    _setupMutationObserver() {
      this._mutationObserver = new MutationObserver(() => this._checkPage());
      const target = document.querySelector('main, #app, [role="main"]') || document.body;
      this._mutationObserver.observe(target, { childList: true, subtree: true });
    }

    _setupPolling() {
      this._pollingTimer = setInterval(() => {
        this._checkPage();
      }, 500);
    }

    _onNavigate() {
      this._retryCount = 0;
      this._checkPage();
    }

    _extractMediaId(url) {
      const match = url.match(/\/(movie|show)\/(tt\d+)/);
      return match ? `${match[1]}:${match[2]}` : null;
    }

    _isRelevantPage() {
      return CONFIG.RELEVANT_PAGE_RX.test(location.href);
    }

    _findContainer() {
      for (const selector of CONFIG.CONTAINER_SELECTORS) {
        const element = document.querySelector(selector);
        if (element) return element;
      }
      return null;
    }

    async _checkPageImpl() {
      if (this._initializing) return;

      const mediaId = this._extractMediaId(location.href);

      if (mediaId && mediaId === this._currentMediaId) return;

      this._initializing = true;

      if (!this._isRelevantPage()) {
        this.buttonManager.cleanup();
        this._currentMediaId = null;
        this._initializing = false;
        return;
      }

      const container = this._findContainer();
      if (!container) {
        if (this._retryCount < CONFIG.MAX_RETRIES) {
          this._retryCount++;
          setTimeout(() => {
            this._initializing = false;
            this._checkPage();
          }, 200);
        } else {
          this._retryCount = 0;
          this._initializing = false;
        }
        return;
      }

      this._retryCount = 0;
      this.buttonManager.cleanup();
      await this.buttonManager.initialize(container);
      this._currentMediaId = mediaId;
      this._initializing = false;
    }

    _checkPage() {
      this._checkPageImpl().catch((error) => {
        logger.error('Page check error:', error);
        this._initializing = false;
      });
    }

    destroy() {
      if (this._mutationObserver) {
        this._mutationObserver.disconnect();
        this._mutationObserver = null;
      }
      if (this._pollingTimer) {
        clearInterval(this._pollingTimer);
        this._pollingTimer = null;
      }
      this.buttonManager.cleanup();
    }
  }

  // ─── Bootstrap ───────────────────────────────────────────────────────────────

  function initialize() {
    try {
      if (!BUTTON_DATA.length) {
        logger.warn('No button data loaded');
        return;
      }
      new PageManager();
    } catch (error) {
      logger.error('Initialization failed:', error);
    }
  }

  if (document.readyState !== 'loading') {
    initialize();
  } else {
    document.addEventListener('DOMContentLoaded', initialize, { once: true });
  }
})();
