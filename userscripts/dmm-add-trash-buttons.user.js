// ==UserScript==
// @name          DMM - Add Trash Guide Regex Buttons
// @version       3.1.1
// @description   Adds buttons to Debrid Media Manager for applying Trash Guide regex patterns.
// @author        Journey Over
// @license       MIT
// @match         *://debridmediamanager.com/*
// @require       https://cdn.jsdelivr.net/gh/StylusThemes/Userscripts@c185c2777d00a6826a8bf3c43bbcdcfeba5a9566/libs/dmm/button-data.min.js
// @require       https://cdn.jsdelivr.net/gh/StylusThemes/Userscripts@c185c2777d00a6826a8bf3c43bbcdcfeba5a9566/libs/gm/gmcompat.min.js
// @require       https://cdn.jsdelivr.net/gh/StylusThemes/Userscripts@daf2c0a40cf42b5bd783184e09919157bdad4873/libs/utils/utils.min.js
// @require       https://cdn.jsdelivr.net/gh/StylusThemes/Userscripts@daf2c0a40cf42b5bd783184e09919157bdad4873/libs/wikidata/index.min.js
// @grant         GM.getValue
// @grant         GM.setValue
// @grant         GM.xmlHttpRequest
// @icon          https://www.google.com/s2/favicons?sz=64&domain=debridmediamanager.com
// @homepageURL   https://github.com/StylusThemes/Userscripts
// @downloadURL   https://github.com/StylusThemes/Userscripts/raw/main/userscripts/dmm-add-trash-buttons.user.js
// @updateURL     https://github.com/StylusThemes/Userscripts/raw/main/userscripts/dmm-add-trash-buttons.user.js
// ==/UserScript==

(function() {
  'use strict';

  const logger = Logger('DMM - Add Trash Guide Regex Buttons', { debug: false });

  /**
   * Configuration constants for the userscript
   * Defines selectors, storage keys, and behavioral settings
   */
  const CONFIG = {
    // Page and DOM selectors
    RELEVANT_PAGE_RX: /debridmediamanager\.com\/(movie|show)\/[^\/]+/, // Pages where buttons should appear
    CONTAINER_SELECTOR: '.mb-2', // CSS selector for button container
    MAX_RETRIES: 20, // Max attempts to find container on SPA pages

    // Anime and IMDB selectors
    ANILIST_ID_REGEX: /anilist\.co\/anime\/(\d+)/,
    CACHE_PREFIX: 'dmm-anime-cache-',
    CACHE_DURATION: 24 * 60 * 60 * 1000, // 24 hours in milliseconds

    // UI styling
    CSS_CLASS_PREFIX: 'dmm-tg', // Prefix for all CSS classes to avoid conflicts

    // Storage keys
    QUALITY_OPTIONS_KEY: 'dmm-tg-quality-options', // Local storage key for selected quality options
    QUALITY_POLARITY_KEY: 'dmm-tg-quality-polarity', // Storage key for quality polarity (positive/negative)
    LOGIC_MODE_KEY: 'dmm-tg-logic-mode', // Storage key for AND/OR logic mode preference
    CACHE_KEY: 'cache',
    CACHE_LAST_CLEANUP_KEY: 'cache-last-cleanup',

    // Regex patterns for quality removal
    REGEX_PATTERNS: {
      AND_LOOKAHEAD: /\^(\(\?[\=!].*?\))+\.\*/,
      OR_ALTERNATION: /\|\([^)]+\)$/,
      QUALITY_GROUP: /^\([^)]+\)$/,
      NEGATIVE_LOOKAHEAD: /^\(\?[\=!].*?\)$/
    }
  };

  // Validate BUTTON_DATA from external CDN
  const BUTTON_DATA = Array.isArray(window?.DMM_BUTTON_DATA) ? window.DMM_BUTTON_DATA : [];

  // Initialize Wikidata API
  const wikidata = new Wikidata();

  /**
   * Quality tokens for building regex patterns
   * Each token represents a quality indicator that can be matched in filenames
   * Used to generate both positive and negative lookaheads in AND mode
   */
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

  // Flatten all quality values for pattern matching
  const allQualityValues = QUALITY_TOKENS.flatMap(token => token.values);

  /**
   * Retrieves cached anime data for an IMDB ID
   * @param {string} imdbId - The IMDB ID
   * @returns {Promise<Object|null>} Cached data or null
   */
  const getCachedAnimeData = async (imdbId) => {
    const cache = await GMC.getValue(CONFIG.CACHE_KEY) || {};
    if (typeof cache !== 'object' || Array.isArray(cache)) return null;
    const cacheKey = `${CONFIG.CACHE_PREFIX}${imdbId}`;
    const cached = cache[cacheKey];
    if (cached && (Date.now() - cached.timestamp) < CONFIG.CACHE_DURATION) {
      return cached.data;
    }
    return null;
  };

  /**
   * Fetches anime data from APIs
   * @param {string} imdbId - The IMDB ID
   * @param {string} mediaType - 'movie' or 'tv' (for Wikidata API)
   * @returns {Promise<Object>} Result object with isAnime, anilistId
   */
  const fetchAnimeData = async (imdbId, mediaType) => {
    const data = await wikidata.links(imdbId, 'IMDb', mediaType);
    const anilistLink = data.links?.AniList?.value;
    if (!anilistLink) {
      return { isAnime: false, anilistId: null };
    }
    const anilistMatch = anilistLink.match(CONFIG.ANILIST_ID_REGEX);
    const anilistId = anilistMatch ? anilistMatch[1] : null;
    if (!anilistId) {
      return { isAnime: true, anilistId: null };
    }
    return { isAnime: true, anilistId };
  };

  /**
   * Updates the cache with new data
   * @param {string} imdbId - The IMDB ID
   * @param {Object} result - The result to cache
   */
  const updateCache = async (imdbId, result) => {
    let cache = await GMC.getValue(CONFIG.CACHE_KEY) || {};
    if (typeof cache !== 'object' || Array.isArray(cache)) cache = {};
    const cacheKey = `${CONFIG.CACHE_PREFIX}${imdbId}`;
    cache[cacheKey] = { data: result, timestamp: Date.now() };
    // Cleanup old entries
    const now = Date.now();
    const lastCleanup = await GMC.getValue(CONFIG.CACHE_LAST_CLEANUP_KEY) || 0;
    if (now - lastCleanup >= CONFIG.CACHE_DURATION) {
      let cleanedCount = 0;
      for (const [key, entry] of Object.entries(cache)) {
        if (key.startsWith(CONFIG.CACHE_PREFIX) && (now - entry.timestamp) > CONFIG.CACHE_DURATION) {
          delete cache[key];
          cleanedCount++;
        }
      }
      await GMC.setValue(CONFIG.CACHE_LAST_CLEANUP_KEY, now);
      if (cleanedCount > 0) {
        logger.debug(`Cache cleanup: Removed ${cleanedCount} expired entries`);
      }
    }
    await GMC.setValue(CONFIG.CACHE_KEY, cache);
  };

  /**
   * Checks if an anime exists on Releases.moe
   * @param {string} anilistId - The AniList ID to check
   * @returns {Promise<boolean>} Whether the anime exists on Releases.moe
   */
  const checkReleasesMoeExists = (anilistId) => {
    return new Promise((resolve) => {
      const apiUrl = `https://releases.moe/api/collections/entries/records?filter=alID=${anilistId}`;

      GMC.xmlHttpRequest({
        method: 'GET',
        url: apiUrl,
        onload: (response) => {
          try {
            const data = JSON.parse(response.responseText);
            const exists = data.totalItems > 0;
            logger.debug(`Releases.moe: Anime ${anilistId} ${exists ? 'found' : 'not found'}`);
            resolve(exists);
          } catch (error) {
            logger.error(`Releases.moe API parse error for ${anilistId}:`, error);
            resolve(false);
          }
        },
        onerror: (error) => {
          logger.error(`Releases.moe API request failed for ${anilistId}:`, error);
          resolve(false);
        }
      });
    });
  };

  /**
   * Removes quality-related regex patterns from a base pattern
   * Handles both AND mode lookaheads (^.*(?=.*quality)) and OR mode alternations (|quality)
   * Only removes patterns that contain known quality values to preserve user input
   * @param {string} regex - Input regex pattern to clean
   * @returns {string} Cleaned regex with quality patterns removed
   */
  const removeQualityFromRegex = (regex) => {
    if (!regex || typeof regex !== 'string') return '';

    let cleaned = regex;

    // Remove AND patterns: lookaheads at the beginning (after ^)
    const andMatch = cleaned.match(CONFIG.REGEX_PATTERNS.AND_LOOKAHEAD);
    if (andMatch && andMatch.index === 0) {
      const matched = andMatch[0];
      const hasQuality = allQualityValues.some(q => matched.includes(q));
      if (hasQuality) {
        cleaned = cleaned.replace(matched, '');
      }
    }

    // Remove OR patterns: alternations at the end
    const orMatch = cleaned.match(CONFIG.REGEX_PATTERNS.OR_ALTERNATION);
    if (orMatch) {
      const matched = orMatch[0];
      const hasQuality = allQualityValues.some(q => matched.includes(q));
      if (hasQuality) {
        cleaned = cleaned.replace(matched, '');
      }
    }

    // If the remaining string is just a quality pattern, clear it
    if (cleaned.match(CONFIG.REGEX_PATTERNS.QUALITY_GROUP) || cleaned.match(CONFIG.REGEX_PATTERNS.NEGATIVE_LOOKAHEAD)) {
      const hasQuality = allQualityValues.some(q => cleaned.includes(q));
      if (hasQuality) {
        cleaned = '';
      }
    }

    return cleaned.trim();
  };

  /**
   * Builds quality regex string based on selected options and logic mode
   * @param {string[]} selectedOptions - Array of selected quality token keys
   * @param {boolean} useAndLogic - Whether to use AND logic (true) or OR logic (false)
   * @param {Map} qualityPolarity - Map of quality key to polarity (true=positive, false=negative)
   * @returns {string} Constructed regex pattern
   */
  const buildQualityString = (selectedOptions, useAndLogic = false, qualityPolarity = new Map()) => {
    if (!selectedOptions.length) return '';

    // Gather all regex values for selected quality tokens
    const tokenValues = [];
    selectedOptions.forEach((optionKey) => {
      const token = QUALITY_TOKENS.find((q) => q.key === optionKey);
      if (token && token.values) tokenValues.push(token.values);
    });

    if (!tokenValues.length) return '';

    if (useAndLogic) {
      // AND logic: Each token uses positive or negative lookaheads based on polarity
      const lookaheads = selectedOptions.map((optionKey, index) => {
        const vals = tokenValues[index];
        const isPositive = qualityPolarity.get(optionKey) !== false; // default to positive
        const lookaheadType = isPositive ? '=' : '!';

        if (vals.length === 1) {
          return `(?${lookaheadType}.*${vals[0]})`;
        }
        // Multiple values for one token = internal OR with non-capturing group
        return `(?${lookaheadType}.*(?:${vals.join('|')}))`;
      }).join('');
      return lookaheads;
    } else {
      // OR logic: Any token can match, flatten all values
      const flat = tokenValues.flat();
      return `(${flat.join('|')})`;
    }
  };

  /**
   * Generates CSS styles for the UI components
   * @returns {string} CSS string for injection
   */
  const generateStyles = () => {
    const p = CONFIG.CSS_CLASS_PREFIX;
    return `
      .${p}-btn{cursor:pointer;display:inline-flex;align-items:center;gap:.35rem;margin-right:.5rem;padding:.25rem .5rem;font-size:12px;line-height:1;border-radius:.375rem;color:#e6f0ff;background:rgba(15,23,42,.5);border:1px solid rgba(59,130,246,.55);box-shadow:none;user-select:none;white-space:nowrap;}
      .${p}-btn:hover{background:rgba(59,130,246,.08);}
      .${p}-btn:focus{outline:2px solid rgba(59,130,246,.18);outline-offset:2px;}
      .${p}-chev{width:12px;height:12px;color:rgba(226,240,255,.95);margin-left:.15rem;display:inline-block;transition:transform 160ms ease;transform-origin:center;}
      .${p}-btn[aria-expanded="true"] .${p}-chev{transform:rotate(180deg);}
      .${p}-menu{position:absolute;min-width:10rem;background:#111827;color:#fff;border:1px solid rgba(148,163,184,.06);border-radius:.375rem;box-shadow:0 6px 18px rgba(2,6,23,.6);padding:.25rem 0;z-index:9999;display:none;}
      .${p}-menu::before{content:"";position:absolute;top:-6px;left:12px;width:0;height:0;border-left:6px solid transparent;border-right:6px solid transparent;border-bottom:6px solid #111827;}
      .${p}-item{padding:.45rem .75rem;cursor:pointer;font-size:13px;white-space:nowrap;border-bottom:1px solid rgba(255,255,255,.03);}
      .${p}-item:last-child{border-bottom:none;}
      .${p}-item:hover{background:#1f2937;}
      .${p}-quality-section{display:flex;align-items:center;gap:.75rem;margin-left:.75rem;padding-left:.75rem;border-left:1px solid rgba(148,163,184,.15);}
      .${p}-quality-grid{display:flex;flex-wrap:wrap;gap:.6rem;}
      .${p}-quality-item{display:inline-flex;align-items:center;font-size:12px;}
      .${p}-quality-button{padding:.25rem .5rem;border-radius:.375rem;border:1px solid rgba(148,163,184,.15);background:transparent;color:#e6f0ff;cursor:pointer;font-size:12px;line-height:1}
      .${p}-quality-button.active{background:#3b82f6;color:#fff;border-color:#3b82f6}
      .${p}-quality-button.active.negative{background:#dc2626;color:#fff;border-color:#dc2626}
      .${p}-quality-button:focus{outline:1px solid rgba(59,130,246,.5);}
      .${p}-quality-label{color:#e6f0ff;cursor:pointer;white-space:nowrap;}
      .${p}-logic-selector{margin-right:.75rem;padding-right:.75rem;border-right:1px solid rgba(148,163,184,.15);display:flex;align-items:center;}
      .${p}-logic-toggle{display:inline-flex;border:1px solid rgba(148,163,184,.4);border-radius:.375rem;overflow:hidden;}
      .${p}-logic-option{background:#1f2937;color:#e6f0ff;border:none;padding:.25rem .5rem;font-size:12px;cursor:pointer;transition:all 0.2s ease;line-height:1;display:flex;align-items:center;position:relative;}
      .${p}-logic-option:hover{background:#374151;}
      .${p}-logic-option.active{background:#3b82f6;color:#fff;border-left:1px solid #3b82f6;border-right:1px solid #3b82f6;margin-left:-1px;margin-right:-1px;z-index:1;}
      .${p}-logic-option:focus{outline:1px solid rgba(59,130,246,.5);}
      .${p}-help-icon{background:#1f2937;color:#e6f0ff;border:1px solid rgba(148,163,184,.4);border-radius:50%;width:16px;height:16px;font-size:11px;cursor:help;margin-left:.25rem;display:inline-flex;align-items:center;justify-content:center;font-weight:bold;}
      .${p}-help-icon:hover{background:#374151;}
      h2.line-clamp-2{display:block!important;-webkit-line-clamp:unset!important;-webkit-box-orient:unset!important;overflow:visible!important;text-overflow:unset!important;white-space:normal!important;}
    `;
  };

  /**
   * Injects CSS styles for the UI components
   * Creates a cohesive dark theme that matches DMM's design
   */
  (function injectStyles() {
    const style = document.createElement('style');
    style.textContent = generateStyles();
    document.head.appendChild(style);
  })();

  /**
   * Manages quality selection buttons and logic mode
   * Persists user preferences and handles regex generation
   */
  class QualityManager {
    constructor() {
      this.selectedOptions = [];
      this.qualityPolarity = new Map();
      this.useAndLogic = false;
      this.container = null;
      this.buttons = new Map();
      this.logicSelect = null;
    }

    /**
     * Initializes the quality manager with a container element
     * Loads persisted settings and creates the UI
     * @param {HTMLElement} container - Container element for the quality UI
     */
    async initialize(container) {
      this.container = container;
      this.createQualitySection();
      await this.loadPersistedSettings();
      this.restoreStates();

      // Auto-apply quality options if any are selected
      if (this.selectedOptions.length > 0) {
        setTimeout(() => this.updateInputWithQualityOptions(), 50);
      }
    }

    /**
     * Loads user preferences from Greasemonkey storage
     * Handles migration from older storage formats and error recovery
     */
    async loadPersistedSettings() {
      try {
        const stored = await GMC.getValue(CONFIG.QUALITY_OPTIONS_KEY, null);
        this.selectedOptions = stored ? JSON.parse(stored) : [];

        const polarityStored = await GMC.getValue(CONFIG.QUALITY_POLARITY_KEY, null);
        const polarityData = polarityStored ? JSON.parse(polarityStored) : {};
        this.qualityPolarity = new Map(Object.entries(polarityData));

        const logicStored = await GMC.getValue(CONFIG.LOGIC_MODE_KEY, null);
        this.useAndLogic = logicStored ? JSON.parse(logicStored) : false;
      } catch (err) {
        logger.error('Failed to load quality options:', err);
        this.selectedOptions = [];
        this.qualityPolarity = new Map();
        this.useAndLogic = false;
      }
    }

    /**
     * Creates the quality selection UI with buttons and logic selector
     */
    createQualitySection() {
      if (!this.container) return;

      // Remove any existing section to prevent duplicates
      const existing = this.container.querySelector(`.${CONFIG.CSS_CLASS_PREFIX}-quality-section`);
      if (existing) existing.remove();

      const section = document.createElement('div');
      section.className = `${CONFIG.CSS_CLASS_PREFIX}-quality-section`;

      // AND/OR logic selector dropdown
      const logicSelector = document.createElement('div');
      logicSelector.className = `${CONFIG.CSS_CLASS_PREFIX}-logic-selector`;

      const logicSelect = document.createElement('div');
      logicSelect.className = `${CONFIG.CSS_CLASS_PREFIX}-logic-toggle`;
      logicSelect.setAttribute('tabindex', '0');
      logicSelect.innerHTML = `
        <button type="button" class="${CONFIG.CSS_CLASS_PREFIX}-logic-option active" data-mode="or">OR</button>
        <button type="button" class="${CONFIG.CSS_CLASS_PREFIX}-logic-option" data-mode="and">AND</button>
      `;
      logicSelect.addEventListener('click', (e) => this.onLogicToggle(e));

      const helpIcon = document.createElement('button');
      helpIcon.type = 'button';
      helpIcon.className = `${CONFIG.CSS_CLASS_PREFIX}-help-icon`;
      helpIcon.textContent = '?';
      helpIcon.title = `Logic Modes:\n\nOR Mode: Match ANY selected quality\nExample: (720p|1080p) - matches files with 720p OR 1080p\n\nAND Mode: Match ALL selected qualities (advanced filtering)\n- Requires EVERY selected quality to be present in the filename\n- Useful for precise filtering, e.g., only 1080p remux files\nExample: (?=.*1080p)(?=.*remux) - matches files with BOTH 1080p AND remux\n\nNegative Matching in AND Mode:\n- Click a quality button twice to exclude it\n- Creates a negative lookahead: (?!.*quality)\nExample: (?=.*1080p)(?!.*720p) - requires 1080p but excludes 720p\n\nTip: AND mode is powerful for complex filters but may match fewer files`;

      logicSelector.appendChild(logicSelect);
      logicSelector.appendChild(helpIcon);
      this.logicSelect = logicSelect;

      const grid = document.createElement('div');
      grid.className = `${CONFIG.CSS_CLASS_PREFIX}-quality-grid`;

      QUALITY_TOKENS.forEach((token) => {
        const item = document.createElement('div');
        item.className = `${CONFIG.CSS_CLASS_PREFIX}-quality-item`;

        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = `${CONFIG.CSS_CLASS_PREFIX}-quality-button`;
        btn.id = `${CONFIG.CSS_CLASS_PREFIX}-${token.key}`;
        btn.textContent = token.name;
        btn.addEventListener('click', () => this.onToggleOption(token.key, btn));

        item.appendChild(btn);
        grid.appendChild(item);

        this.buttons.set(token.key, btn);
      });

      section.appendChild(logicSelector);
      section.appendChild(grid);
      this.container.appendChild(section);
    }

    /**
     * Restores UI state from saved preferences
     */
    restoreStates() {
      this.selectedOptions.forEach((key) => {
        const btn = this.buttons.get(key);
        if (btn) {
          btn.classList.add('active');
          // Only show negative styling in AND mode
          if (this.useAndLogic) {
            const isPositive = this.qualityPolarity.get(key) !== false; // default to positive
            if (!isPositive) {
              btn.classList.add('negative');
            }
          }
        }
      });

      if (this.logicSelect) {
        const allOptions = this.logicSelect.querySelectorAll(`.${CONFIG.CSS_CLASS_PREFIX}-logic-option`);
        allOptions.forEach(option => {
          option.classList.remove('active');
          if ((option.dataset.mode === 'and' && this.useAndLogic) ||
            (option.dataset.mode === 'or' && !this.useAndLogic)) {
            option.classList.add('active');
          }
        });
      }
    }

    onLogicToggle(e) {
      e.preventDefault();
      e.stopPropagation();

      const target = e.target;
      if (!target.classList.contains(`${CONFIG.CSS_CLASS_PREFIX}-logic-option`)) return;

      const mode = target.dataset.mode;
      const useAndLogic = mode === 'and';

      const allOptions = this.logicSelect.querySelectorAll(`.${CONFIG.CSS_CLASS_PREFIX}-logic-option`);
      allOptions.forEach(option => option.classList.remove('active'));
      target.classList.add('active');

      this.onLogicChange(useAndLogic);
    }

    onLogicChange(useAndLogic) {
      // Clean existing patterns before switching modes
      const target = findTargetInput(this.container);
      if (target) {
        const currentValue = target.value || '';
        const cleanedValue = removeQualityFromRegex(currentValue);
        setInputValueReactive(target, cleanedValue);
      }

      this.useAndLogic = useAndLogic;

      // Update button visual states based on new mode
      this.selectedOptions.forEach((key) => {
        const btn = this.buttons.get(key);
        if (btn) {
          if (useAndLogic) {
            const isPositive = this.qualityPolarity.get(key) !== false;
            if (!isPositive) {
              btn.classList.add('negative');
            }
          } else {
            btn.classList.remove('negative');
          }
        }
      });

      try {
        GMC.setValue(CONFIG.LOGIC_MODE_KEY, JSON.stringify(this.useAndLogic));
      } catch (err) {
        logger.error('Failed to save logic mode:', err);
      }

      this.updateInputWithQualityOptions();
    }

    /**
     * Toggle option handler for button UI
     * Implements different behavior based on current logic mode:
     * OR mode: off -> on -> off
     * AND mode: off -> positive -> negative -> off
     * @param {string} key - Quality token key
     * @param {HTMLElement} btn - Button element that was clicked
     */
    onToggleOption(key, btn) {
      const isActive = btn.classList.contains('active');
      const isNegative = btn.classList.contains('negative');
      const isSelected = this.selectedOptions.includes(key);

      // Determine next state based on current state and logic mode
      if (!isActive && !isNegative) {
        // Off -> On (positive in AND mode, just active in OR mode)
        this._activateOption(key, btn);
      } else if (isActive && !isNegative) {
        if (this.useAndLogic) {
          // Positive -> Negative (only in AND mode)
          this._makeNegative(key, btn);
        } else {
          // On -> Off (in OR mode)
          this._deactivateOption(key, btn);
        }
      } else {
        // Negative -> Off (only possible in AND mode)
        this._deactivateOption(key, btn);
      }

      this._saveOptions();
      this.updateInputWithQualityOptions();
    }

    /**
     * Activate an option (add to selected and make positive)
     */
    _activateOption(key, btn) {
      btn.classList.add('active');
      if (!this.selectedOptions.includes(key)) {
        this.selectedOptions.push(key);
      }
      if (this.useAndLogic) {
        this.qualityPolarity.set(key, true); // positive
      }
    }

    /**
     * Make an option negative (only in AND mode)
     */
    _makeNegative(key, btn) {
      btn.classList.add('negative');
      this.qualityPolarity.set(key, false); // negative
    }

    /**
     * Deactivate an option (remove from selected and clean up)
     */
    _deactivateOption(key, btn) {
      btn.classList.remove('active');
      btn.classList.remove('negative');
      const idx = this.selectedOptions.indexOf(key);
      if (idx > -1) {
        this.selectedOptions.splice(idx, 1);
      }
      this.qualityPolarity.delete(key);
    }

    /**
     * Save current options to storage
     */
    _saveOptions() {
      try {
        GMC.setValue(CONFIG.QUALITY_OPTIONS_KEY, JSON.stringify(this.selectedOptions));
        GMC.setValue(CONFIG.QUALITY_POLARITY_KEY, JSON.stringify(Object.fromEntries(this.qualityPolarity)));
      } catch (err) {
        logger.error('Failed to save quality options:', err);
      }
    }

    /**
     * Updates the input field with current quality options
     * Appends or prepends quality regex based on logic mode, cleans when turning off
     * AND mode: Prepends ^(?=.*quality).* to require all qualities
     * OR mode: Appends |quality to allow any quality
     */
    updateInputWithQualityOptions() {
      const target = findTargetInput(this.container);
      if (!target) return;

      const currentValue = target.value || '';
      const qualityString = buildQualityString(this.selectedOptions, this.useAndLogic, this.qualityPolarity);

      let newValue;
      if (qualityString) {
        // Clean existing quality patterns first to prevent duplication
        const cleanedBase = removeQualityFromRegex(currentValue);
        if (this.useAndLogic) {
          newValue = cleanedBase ? `^${qualityString}.*${cleanedBase}` : `^${qualityString}.*`;
        } else {
          newValue = cleanedBase ? `${cleanedBase}|${qualityString}` : qualityString;
        }
      } else {
        // No quality options selected, clean any existing quality patterns
        newValue = removeQualityFromRegex(currentValue);
      }

      setInputValueReactive(target, newValue);
    }

    /**
     * Applies quality options to a base regex pattern
     * Used when selecting patterns from dropdown buttons
     */
    applyQualityOptionsToValue(baseValue) {
      const qualityString = buildQualityString(this.selectedOptions, this.useAndLogic, this.qualityPolarity);
      if (!qualityString) return baseValue;

      const cleanedBase = removeQualityFromRegex(baseValue);

      if (this.useAndLogic) {
        return cleanedBase ? `^${qualityString}.*${cleanedBase}` : `^${qualityString}.*`;
      } else {
        return cleanedBase ? `${cleanedBase}|${qualityString}` : qualityString;
      }
    }

    cleanup() {
      this.buttons.clear();
      this.qualityPolarity.clear();
      const existing = this.container?.querySelector(`.${CONFIG.CSS_CLASS_PREFIX}-quality-section`);
      if (existing) existing.remove();
    }
  }

  /**
   * Manages dropdown buttons and their menus
   * Handles button creation, menu positioning, and pattern selection
   * Coordinates with QualityManager for combined regex generation
   */
  class ButtonManager {
    constructor() {
      this.dropdowns = new Map();
      this.container = null;
      this.openMenu = null;
      this.qualityManager = new QualityManager();

      this.documentClickHandler = this.onDocumentClick.bind(this);
      this.resizeHandler = this.onWindowResize.bind(this);
      this.keydownHandler = this.onDocumentKeydown.bind(this);
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

      // Remove global event listeners
      document.removeEventListener('click', this.documentClickHandler, true);
      document.removeEventListener('keydown', this.keydownHandler);
      window.removeEventListener('resize', this.resizeHandler);
    }

    async initialize(container) {
      if (!container || this.container === container) return;
      logger.debug('ButtonManager initialized', { container: !!container, sameContainer: this.container === container });
      this.cleanup();
      this.container = container;
      this.cachedContainer = container; // Cache for performance

      // Create buttons for each pattern group
      BUTTON_DATA.forEach((spec) => {
        const name = String(spec.name || 'Pattern');
        if (this.dropdowns.has(name)) return;

        const btn = this._createButton(name);
        const menu = this._createMenu(spec.buttonData || [], name);

        document.body.appendChild(menu);
        this.container.appendChild(btn);
        this.dropdowns.set(name, { button: btn, menu });

        btn.addEventListener('click', (ev) => {
          ev.stopPropagation();
          this.toggleMenu(name);
        });
      });

      await this.qualityManager.initialize(container);
      logger.debug('Created dropdown buttons:', { count: this.dropdowns.size });

      await this.detectExternalLinksForCurrentPage();

      document.addEventListener('click', this.documentClickHandler, true);
      document.addEventListener('keydown', this.keydownHandler);
      window.addEventListener('resize', this.resizeHandler);
    }

    onDocumentKeydown(e) {
      if (!this.openMenu) return;
      if (e.key === 'Escape' || e.key === 'Esc') {
        e.preventDefault();
        this.closeOpenMenu();
      }
    }

    /**
     * Creates a dropdown button with chevron icon
     */
    _createButton(name) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = `${CONFIG.CSS_CLASS_PREFIX}-btn`;
      btn.appendChild(document.createTextNode(name));

      // Add chevron SVG icon
      const svgNs = 'http://www.w3.org/2000/svg';
      const chev = document.createElementNS(svgNs, 'svg');
      chev.setAttribute('viewBox', '0 0 20 20');
      chev.setAttribute('aria-hidden', 'true');
      chev.setAttribute('class', `${CONFIG.CSS_CLASS_PREFIX}-chev`);
      chev.innerHTML = '<path d="M6 8l4 4 4-4" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" />';
      btn.appendChild(chev);

      // Accessibility attributes
      btn.setAttribute('aria-haspopup', 'true');
      btn.setAttribute('aria-expanded', 'false');
      btn.tabIndex = 0;
      return btn;
    }

    /**
     * Creates dropdown menu with pattern items
     */
    _createMenu(items = [], name) {
      const menu = document.createElement('div');
      menu.className = `${CONFIG.CSS_CLASS_PREFIX}-menu`;
      menu.dataset.owner = name;

      items.forEach((item) => {
        const menuItem = document.createElement('div');
        menuItem.className = `${CONFIG.CSS_CLASS_PREFIX}-item`;
        menuItem.textContent = item.name || item.value || 'apply';
        menuItem.addEventListener('click', (ev) => {
          ev.stopPropagation();
          this.onSelectPattern(item.value, item.name);
          this.closeOpenMenu();
        });
        menu.appendChild(menuItem);
      });

      return menu;
    }

    toggleMenu(name) {
      const entry = this.dropdowns.get(name);
      if (!entry) return;
      const { button, menu } = entry;

      // Close other open menus
      if (this.openMenu && this.openMenu !== menu) this.openMenu.style.display = 'none';

      if (menu.style.display === 'block') {
        menu.style.display = 'none';
        button.setAttribute('aria-expanded', 'false');
        this.openMenu = null;
      } else {
        this.positionMenuUnderButton(menu, button);
        menu.style.display = 'block';
        button.setAttribute('aria-expanded', 'true');
        this.openMenu = menu;
      }
    }

    /**
     * Positions dropdown menu below its button with proper viewport constraints
     */
    positionMenuUnderButton(menu, button) {
      const rect = button.getBoundingClientRect();
      const left = Math.max(8, rect.left);
      const top = window.scrollY + rect.bottom + 6;
      menu.style.left = `${left}px`;
      menu.style.top = `${top}px`;
    }

    onDocumentClick(e) {
      if (!this.openMenu) return;
      const target = e.target;
      const matchingButton = Array.from(this.dropdowns.values()).find((v) => v.menu === this.openMenu)?.button;
      if (matchingButton && (matchingButton.contains(target) || this.openMenu.contains(target))) return;
      this.closeOpenMenu();
    }

    onWindowResize() {
      if (!this.openMenu) return;
      const owner = this.openMenu.dataset.owner;
      const entry = this.dropdowns.get(owner);
      if (entry) this.positionMenuUnderButton(entry.menu, entry.button);
    }

    closeOpenMenu() {
      if (!this.openMenu) return;
      const owner = this.openMenu.dataset.owner;
      const entry = this.dropdowns.get(owner);
      if (entry) entry.button.setAttribute('aria-expanded', 'false');
      this.openMenu.style.display = 'none';
      this.openMenu = null;
    }

    /**
     * Handles pattern selection from dropdown menus
     * Applies base pattern with quality options and sets input value
     * @param {string} value - The regex pattern from the selected menu item
     * @param {string} name - The display name of the selected pattern
     */
    onSelectPattern(value, name) {
      let target = findTargetInput(this.cachedContainer || this.container);

      if (!target) {
        logger.error('Could not find target input element:', { name, value });
        return;
      }

      try {
        const finalValue = this.qualityManager.applyQualityOptionsToValue(value || '');
        logger.debug('Applied pattern to input:', { name, value, finalValue, targetId: target.id || null });
        setInputValueReactive(target, finalValue);
      } catch (err) {
        logger.error('Failed to set input value:', err, {
          value,
          name,
          target: target?.id || target?.className || 'unknown'
        });
      }
    }

    /**
     * Detects external links for the current page (Trakt, Releases.moe, etc.)
     */
    async detectExternalLinksForCurrentPage() {
      try {
        // Extract IMDB ID directly from the URL path
        const urlMatch = location.pathname.match(/\/(movie|show)\/(tt\d+)/);
        if (!urlMatch) {
          logger.debug('Could not extract IMDB ID from URL:', location.pathname);
          return;
        }
        const mediaType = urlMatch[1]; // 'movie' or 'show'
        const imdbId = urlMatch[2]; // IMDB ID like 'tt0111161'

        const wikidataMediaType = mediaType === 'movie' ? 'movie' : 'tv';
        const traktMediaType = mediaType === 'movie' ? 'movie' : 'show';

        // Create Trakt button for all content
        this.createTraktButton(imdbId, traktMediaType);

        // Detect anime and create Releases.moe button if applicable
        await this.detectAnimeForCurrentPage(imdbId, wikidataMediaType);
      } catch (error) {
        logger.error(`External links detection failed for ${location.href}:`, error);
      }
    }

    /**
     * Detects if the current page is for an anime and creates Releases.moe button if applicable
     */
    async detectAnimeForCurrentPage(imdbId, mediaType) {
      // Check cache first
      const cachedData = await getCachedAnimeData(imdbId);
      if (cachedData) {
        logger.debug(`Anime cache hit for ${imdbId} (${Math.round((Date.now() - cachedData.timestamp) / 1000)}s old)`);
        this.handleAnimeResult(cachedData);
        return;
      }

      logger.debug(`Anime cache miss for ${imdbId}, fetching from APIs`);

      const result = await fetchAnimeData(imdbId, mediaType);
      if (result.isAnime && result.anilistId) {
        const button = this.createReleasesMoeButton(result.anilistId);
        checkReleasesMoeExists(result.anilistId).then(async (releasesExists) => {
          if (!releasesExists) {
            if (button && button.parentNode) {
              button.parentNode.removeChild(button);
            }
          }
          const fullResult = { ...result, releasesExists };
          await updateCache(imdbId, fullResult);
        });
      } else {
        const fullResult = { ...result, releasesExists: false };
        await updateCache(imdbId, fullResult);
      }
    }

    /**
     * Handles the result of anime detection
     * @param {Object} result - The result object
     */
    handleAnimeResult(result) {
      const { isAnime, anilistId, releasesExists } = result;
      if (isAnime && anilistId && releasesExists) {
        logger.debug('Anime detected with Releases.moe availability', { anilistId, releasesExists });
        this.createReleasesMoeButton(anilistId);
      } else if (isAnime && anilistId && !releasesExists) {
        logger.debug('Anime detected but not available on Releases.moe', { anilistId });
      } else if (isAnime && !anilistId) {
        logger.debug('Anime detected but no AniList ID found');
      } else {
        logger.debug('Non-anime content detected');
      }
    }

    /**
     * Creates a generic external link button
     * @param {Object} options - Button configuration options
     * @param {string} options.link - The URL for the button
     * @param {string} options.iconUrl - The favicon URL
     * @param {string} options.iconAlt - Alt text for the icon
     * @param {string} options.label - Button text label
     * @param {string} options.className - CSS classes for styling
     * @param {string} options.existingSelector - Selector to check for existing buttons
     * @param {string} options.debugName - Name for debug logging
     * @returns {HTMLElement|null} The created button or null if container not found
     */
    createExternalLinkButton({ link, iconUrl, iconAlt, label, className, existingSelector, debugName }) {
      // Check if button already exists to prevent duplicates
      const existingButton = qs(existingSelector);
      if (existingButton) {
        logger.debug(`${debugName} button already exists, skipping creation`);
        return existingButton;
      }

      logger.debug(`Created ${debugName} button:`, { link });
      const button = document.createElement('a');
      button.href = link;
      button.target = '_blank';
      button.className = className;
      button.innerHTML = `<b class="inline-flex items-center"><img src="${iconUrl}" class="mr-1 h-3 w-3" alt="${iconAlt}">${label}</b>`;

      const buttonContainer = qs('.grid > div:last-child');
      if (buttonContainer) {
        buttonContainer.appendChild(button);
        logger.debug(`${debugName} button added to container`);
        return button;
      } else {
        logger.warn(`${debugName} button container not found`);
        return null;
      }
    }

    /**
     * Creates the Releases.moe button element
     */
    createReleasesMoeButton(anilistId) {
      const link = `https://releases.moe/${anilistId}/`;
      return this.createExternalLinkButton({
        link,
        iconUrl: 'https://www.google.com/s2/favicons?sz=64&domain=releases.moe',
        iconAlt: 'SeaDex icon',
        label: 'SeaDex',
        className: 'mb-1 mr-2 mt-0 rounded border-2 border-pink-500 bg-pink-900/30 p-1 text-xs text-pink-100 transition-colors hover:bg-pink-800/50',
        existingSelector: 'a[href*="releases.moe"]',
        debugName: 'Releases.moe'
      });
    }

    /**
     * Creates the Trakt.tv button element
     */
    createTraktButton(imdbId, mediaType) {
      const link = `https://trakt.tv/${mediaType}s/${imdbId}`;
      return this.createExternalLinkButton({
        link,
        iconUrl: 'https://www.google.com/s2/favicons?sz=64&domain=trakt.tv',
        iconAlt: 'Trakt icon',
        label: 'Trakt',
        className: 'mb-1 mr-2 mt-0 rounded border-2 border-red-500 bg-red-900/30 p-1 text-xs text-red-100 transition-colors hover:bg-red-800/50',
        existingSelector: 'a[href*="trakt.tv"]',
        debugName: 'Trakt.tv'
      });
    }
  }

  /**
   * Manages SPA navigation detection and DOM change monitoring
   * Handles initialization and cleanup when navigating between pages
   * Uses mutation observers and history API hooks for reliable detection
   */
  class PageManager {
    constructor() {
      this.buttonManager = new ButtonManager();
      this.lastUrl = location.href;
      this.retry = 0;
      this.mutationObserver = null;
      this.debouncedCheck = debounce(this.checkPage.bind(this), 150);
      this.lastProcessedUrl = null;
      this.cachedContainer = null; // Cache for container element

      this.setupHistoryHooks();
      this.setupMutationObserver();
      this.checkPage();
    }

    /**
     * Hooks into browser history API to detect SPA navigation
     * Overrides pushState and replaceState to emit custom navigation events
     * This ensures the userscript responds to client-side routing changes
     */
    setupHistoryHooks() {
      const push = history.pushState;
      const replace = history.replaceState;

      // Override pushState to emit custom navigation event
      history.pushState = function pushState(...args) {
        push.apply(this, args);
        window.dispatchEvent(new Event('dmm:nav'));
      };

      // Override replaceState to emit custom navigation event
      history.replaceState = function replaceState(...args) {
        replace.apply(this, args);
        window.dispatchEvent(new Event('dmm:nav'));
      };

      // Listen for all navigation events
      window.addEventListener('popstate', () => window.dispatchEvent(new Event('dmm:nav')));
      window.addEventListener('hashchange', () => window.dispatchEvent(new Event('dmm:nav')));
      window.addEventListener('dmm:nav', () => {
        this.buttonManager.cleanup();
        this.debouncedCheck();
      });
    }

    /**
     * Sets up mutation observer to detect DOM changes
     * Only triggers on significant content changes to avoid spam
     */
    setupMutationObserver() {
      if (this.mutationObserver) this.mutationObserver.disconnect();
      this.mutationObserver = new MutationObserver((mutations) => {
        for (const m of mutations) {
          if (m.type === 'childList' && m.addedNodes.length > 0) {
            this.debouncedCheck();
            break;
          }
        }
      });
      this.mutationObserver.observe(document.body, { childList: true, subtree: true, attributes: false });
    }

    /**
     * Checks current page and initializes buttons if on relevant page
     * Uses retry mechanism for SPA pages that load content asynchronously
     * Only activates on movie/show detail pages in DMM
     */
    async checkPage() {
      const url = location.href;

      // Only run on movie/show pages
      if (!CONFIG.RELEVANT_PAGE_RX.test(url)) {
        this.buttonManager.cleanup();
        this.lastUrl = url;
        return;
      }

      // Early exit if we've already processed this exact URL
      if (url === this.lastProcessedUrl) {
        this.lastUrl = url;
        return;
      }

      // Wait for container element to be available
      let container = this.cachedContainer;
      if (!container || !document.contains(container)) {
        container = qs(CONFIG.CONTAINER_SELECTOR);
        this.cachedContainer = container;
      }
      if (!container) {
        if (this.retry < CONFIG.MAX_RETRIES) {
          this.retry++;
          this.debouncedCheck();
        } else {
          this.retry = 0;
        }
        return;
      }

      this.retry = 0;

      await this.buttonManager.initialize(container);
      this.lastProcessedUrl = url;
      this.lastUrl = url;
    }
  }

  /**
   * Initialize when DOM is ready
   * Creates the PageManager instance which handles all userscript functionality
   * Only initializes if BUTTON_DATA is available (loaded from CDN)
   */
  ready(() => {
    try {
      if (!BUTTON_DATA.length) return;
      new PageManager();
    } catch (err) {
      logger.error('Load error:', err);
    }
  });
})();
