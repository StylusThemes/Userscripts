// ==UserScript==
// @author       Journey Over
// @exclude      *
// ==UserLibrary==
// @name         @journeyover/dmm-add-quality-buttons
// @description  Adds quality buttons on DMM
// @license      MIT
// @version      1.0.0
// @homepageURL  https://github.com/StylusThemes/Userscripts
// ==/UserScript==

(function() {
  'use strict';

  // Quality tokens for building regex patterns
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

  // Configuration constants specific to quality management
  const STORAGE_KEY = 'dmm-tg-quality-options'; // Local storage key for selected quality options
  const POLARITY_STORAGE_KEY = 'dmm-tg-quality-polarity'; // Storage key for quality polarity (positive/negative)
  const LOGIC_STORAGE_KEY = 'dmm-tg-logic-mode'; // Storage key for AND/OR logic mode preference

  // Flatten all quality values for pattern matching
  const allQualityValues = QUALITY_TOKENS.flatMap(token => token.values);

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
    const andMatch = cleaned.match(/\^(\(\?[\=!].*?\))+\.\*/);
    if (andMatch && andMatch.index === 0) {
      const matched = andMatch[0];
      const hasQuality = allQualityValues.some(q => matched.includes(q));
      if (hasQuality) {
        cleaned = cleaned.replace(matched, '');
      }
    }

    // Remove OR patterns: alternations at the end
    const orMatch = cleaned.match(/\|\([^)]+\)$/);
    if (orMatch) {
      const matched = orMatch[0];
      const hasQuality = allQualityValues.some(q => matched.includes(q));
      if (hasQuality) {
        cleaned = cleaned.replace(matched, '');
      }
    }

    // If the remaining string is just a quality pattern, clear it
    if (cleaned.match(/^\([^)]+\)$/) || cleaned.match(/^\(\?[\=!].*?\)$/)) {
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
   * Injects CSS styles for the quality UI components
   * @param {string} prefix - CSS class prefix
   */
  const injectQualityStyles = (prefix) => {
    const css = `
      .${prefix}-quality-section{display:flex;align-items:center;gap:.75rem;margin-left:.75rem;padding-left:.75rem;border-left:1px solid rgba(148,163,184,.15);}
      .${prefix}-quality-grid{display:flex;flex-wrap:wrap;gap:.6rem;}
      .${prefix}-quality-item{display:inline-flex;align-items:center;font-size:12px;}
      .${prefix}-quality-button{padding:.25rem .5rem;border-radius:.375rem;border:1px solid rgba(148,163,184,.15);background:transparent;color:#e6f0ff;cursor:pointer;font-size:12px;line-height:1}
      .${prefix}-quality-button.active{background:#3b82f6;color:#fff;border-color:#3b82f6}
      .${prefix}-quality-button.active.negative{background:#dc2626;color:#fff;border-color:#dc2626}
      .${prefix}-quality-button:focus{outline:1px solid rgba(59,130,246,.5);}
      .${prefix}-quality-label{color:#e6f0ff;cursor:pointer;white-space:nowrap;}
      .${prefix}-logic-selector{margin-right:.75rem;padding-right:.75rem;border-right:1px solid rgba(148,163,184,.15);display:flex;align-items:center;}
      .${prefix}-logic-toggle{display:inline-flex;border:1px solid rgba(148,163,184,.4);border-radius:.375rem;overflow:hidden;}
      .${prefix}-logic-option{background:#1f2937;color:#e6f0ff;border:none;padding:.25rem .5rem;font-size:12px;cursor:pointer;transition:all 0.2s ease;line-height:1;display:flex;align-items:center;position:relative;}
      .${prefix}-logic-option:hover{background:#374151;}
      .${prefix}-logic-option.active{background:#3b82f6;color:#fff;border-left:1px solid #3b82f6;border-right:1px solid #3b82f6;margin-left:-1px;margin-right:-1px;z-index:1;}
      .${prefix}-logic-option:focus{outline:1px solid rgba(59,130,246,.5);}
      .${prefix}-help-icon{background:#1f2937;color:#e6f0ff;border:1px solid rgba(148,163,184,.4);border-radius:50%;width:16px;height:16px;font-size:11px;cursor:help;margin-left:.25rem;display:inline-flex;align-items:center;justify-content:center;font-weight:bold;}
      .${prefix}-help-icon:hover{background:#374151;}
    `;
    const style = document.createElement('style');
    style.textContent = css;
    document.head.appendChild(style);
  };

  /**
   * Manages quality selection buttons and logic mode
   * Persists user preferences and handles regex generation
   */
  class QualityManager {
    constructor(config) {
      this.config = config;
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
      injectQualityStyles(this.config.CSS_CLASS_PREFIX);
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
        const stored = await GMC.getValue(STORAGE_KEY, null);
        this.selectedOptions = stored ? JSON.parse(stored) : [];

        const polarityStored = await GMC.getValue(POLARITY_STORAGE_KEY, null);
        const polarityData = polarityStored ? JSON.parse(polarityStored) : {};
        this.qualityPolarity = new Map(Object.entries(polarityData));

        const logicStored = await GMC.getValue(LOGIC_STORAGE_KEY, null);
        this.useAndLogic = logicStored ? JSON.parse(logicStored) : false;
      } catch (err) {
        console.error('dmm-tg: failed to load quality options', err);
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
      const existing = this.container.querySelector(`.${this.config.CSS_CLASS_PREFIX}-quality-section`);
      if (existing) existing.remove();

      const section = document.createElement('div');
      section.className = `${this.config.CSS_CLASS_PREFIX}-quality-section`;

      // AND/OR logic selector dropdown
      const logicSelector = document.createElement('div');
      logicSelector.className = `${this.config.CSS_CLASS_PREFIX}-logic-selector`;

      const logicSelect = document.createElement('div');
      logicSelect.className = `${this.config.CSS_CLASS_PREFIX}-logic-toggle`;
      logicSelect.setAttribute('tabindex', '0');
      logicSelect.innerHTML = `
        <button type="button" class="${this.config.CSS_CLASS_PREFIX}-logic-option active" data-mode="or">OR</button>
        <button type="button" class="${this.config.CSS_CLASS_PREFIX}-logic-option" data-mode="and">AND</button>
      `;
      logicSelect.addEventListener('click', (e) => this.onLogicToggle(e));

      // Add help icon
      const helpIcon = document.createElement('button');
      helpIcon.type = 'button';
      helpIcon.className = `${this.config.CSS_CLASS_PREFIX}-help-icon`;
      helpIcon.textContent = '?';
      helpIcon.title = `Logic Modes:\n\nOR Mode: Match ANY selected quality\nExample: (720p|1080p) - matches files with 720p OR 1080p\n\nAND Mode: Match ALL selected qualities (advanced filtering)\n- Requires EVERY selected quality to be present in the filename\n- Useful for precise filtering, e.g., only 1080p remux files\nExample: (?=.*1080p)(?=.*remux) - matches files with BOTH 1080p AND remux\n\nNegative Matching in AND Mode:\n- Click a quality button twice to exclude it\n- Creates a negative lookahead: (?!.*quality)\nExample: (?=.*1080p)(?!.*720p) - requires 1080p but excludes 720p\n\nTip: AND mode is powerful for complex filters but may match fewer files`;

      logicSelector.appendChild(logicSelect);
      logicSelector.appendChild(helpIcon);
      this.logicSelect = logicSelect;

      // Quality token buttons
      const grid = document.createElement('div');
      grid.className = `${this.config.CSS_CLASS_PREFIX}-quality-grid`;

      QUALITY_TOKENS.forEach((token) => {
        const item = document.createElement('div');
        item.className = `${this.config.CSS_CLASS_PREFIX}-quality-item`;

        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = `${this.config.CSS_CLASS_PREFIX}-quality-button`;
        btn.id = `${this.config.CSS_CLASS_PREFIX}-${token.key}`;
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
        const allOptions = this.logicSelect.querySelectorAll(`.${this.config.CSS_CLASS_PREFIX}-logic-option`);
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

      // Check if clicked element is a logic option button
      const target = e.target;
      if (!target.classList.contains(`${this.config.CSS_CLASS_PREFIX}-logic-option`)) return;

      const mode = target.dataset.mode;
      const useAndLogic = mode === 'and';

      // Update visual state
      const allOptions = this.logicSelect.querySelectorAll(`.${this.config.CSS_CLASS_PREFIX}-logic-option`);
      allOptions.forEach(option => option.classList.remove('active'));
      target.classList.add('active');

      // Update logic
      this.onLogicChange(useAndLogic);
    }

    onLogicChange(useAndLogic) {
      // Clean existing patterns before switching modes
      const target = this.findTargetInput();
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
        GMC.setValue(LOGIC_STORAGE_KEY, JSON.stringify(this.useAndLogic));
      } catch (err) {
        console.error('dmm-tg: failed to save logic mode', err);
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

      if (!isActive && !isNegative) {
        // Currently off -> positive (or just on in OR mode)
        btn.classList.add('active');
        if (!this.selectedOptions.includes(key)) this.selectedOptions.push(key);
        // Only set polarity in AND mode
        if (this.useAndLogic) {
          this.qualityPolarity.set(key, true); // positive
        }
      } else if (isActive && !isNegative) {
        if (this.useAndLogic) {
          // Currently positive -> negative (only in AND mode)
          btn.classList.add('negative');
          this.qualityPolarity.set(key, false); // negative
        } else {
          // Currently on -> off (in OR mode)
          btn.classList.remove('active');
          const idx = this.selectedOptions.indexOf(key);
          if (idx > -1) this.selectedOptions.splice(idx, 1);
        }
      } else {
        // Currently negative -> off (only possible in AND mode)
        btn.classList.remove('active');
        btn.classList.remove('negative');
        const idx = this.selectedOptions.indexOf(key);
        if (idx > -1) this.selectedOptions.splice(idx, 1);
        this.qualityPolarity.delete(key);
      }

      try {
        GMC.setValue(STORAGE_KEY, JSON.stringify(this.selectedOptions));
        GMC.setValue(POLARITY_STORAGE_KEY, JSON.stringify(Object.fromEntries(this.qualityPolarity)));
      } catch (err) {
        console.error('dmm-tg: failed to save quality options', err);
      }

      this.updateInputWithQualityOptions();
    }

    /**
     * Updates the input field with current quality options
     * Appends or prepends quality regex based on logic mode, cleans when turning off
     * AND mode: Prepends ^(?=.*quality).* to require all qualities
     * OR mode: Appends |quality to allow any quality
     */
    updateInputWithQualityOptions() {
      const target = this.findTargetInput();
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

    /**
     * Finds the target input element using priority-based search
     * Prefers #query, falls back to container inputs, then any visible input
     */
    findTargetInput() {
      // Primary target: #query input
      let target = qs('#query');
      if (target && isVisible(target)) return target;

      // Secondary: inputs within our container
      if (this.container) {
        target = this.container.querySelector('input, textarea');
        if (target && isVisible(target)) return target;
      }

      // Fallback: any visible input
      const candidates = qsa('input, textarea');
      target = candidates.find(isVisible) || null;
      return target;
    }

    cleanup() {
      this.buttons.clear();
      this.qualityPolarity.clear();
      const existing = this.container?.querySelector(`.${this.config.CSS_CLASS_PREFIX}-quality-section`);
      if (existing) existing.remove();
    }
  }

  // Utility functions that need to be available
  const qs = (sel, root = document) => root.querySelector(sel);
  const qsa = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  const isVisible = (el) => !!(el && el.offsetParent !== null && getComputedStyle(el).visibility !== 'hidden');

  /**
   * Gets the native value property setter for React input compatibility
   * React overrides the default input.value setter, so we need the original
   * @param {HTMLInputElement|HTMLTextAreaElement} el - Input element
   * @returns {Function} Native setter function or null if not found
   */
  const getNativeValueSetter = (el) => {
    const proto = el instanceof HTMLInputElement ? HTMLInputElement.prototype : HTMLTextAreaElement.prototype;
    const desc = Object.getOwnPropertyDescriptor(proto, 'value');
    return desc && desc.set;
  };

  /**
   * Sets input value in a React-compatible way that triggers re-renders
   * Uses native setter and dispatches events to ensure React sees the change
   * @param {HTMLInputElement|HTMLTextAreaElement} el - Target input element
   * @param {string} value - Value to set
   */
  const setInputValueReactive = (el, value) => {
    const nativeSetter = getNativeValueSetter(el);
    if (nativeSetter) {
      nativeSetter.call(el, value);
    } else {
      el.value = value;
    }

    // Set focus and cursor position for better UX
    try {
      el.focus();
      if (typeof el.setSelectionRange === 'function') el.setSelectionRange(value.length, value.length);
    } catch (err) { /* Ignore focus errors */ }

    // Trigger events that React listens for
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));

    // Handle React's internal value tracking if present
    try {
      if (el._valueTracker && typeof el._valueTracker.setValue === 'function') {
        el._valueTracker.setValue(value);
      }
    } catch (err) { /* Ignore React internals errors */ }
  };

  // Expose to global scope for the main script
  window.DMMQualityManager = {
    QualityManager,
    buildQualityString,
    removeQualityFromRegex,
    QUALITY_TOKENS,
    allQualityValues,
    setInputValueReactive,
    qs,
    qsa,
    isVisible
  };

})();
