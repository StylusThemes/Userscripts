// ==UserScript==
// @name          DMM - Add Trash Guide Regex Buttons
// @version       3.0.0
// @description   Adds buttons to Debrid Media Manager for applying Trash Guide regex patterns.
// @author        Journey Over
// @license       MIT
// @match         *://debridmediamanager.com/*
// @require       https://cdn.jsdelivr.net/gh/StylusThemes/Userscripts@c185c2777d00a6826a8bf3c43bbcdcfeba5a9566/libs/dmm/button-data.min.js
// @require       https://cdn.jsdelivr.net/gh/StylusThemes/Userscripts@{}/libs/dmm/quality-manager.min.js
// @require       https://cdn.jsdelivr.net/gh/StylusThemes/Userscripts@{}/libs/dmm/anime-manager.min.js
// @require       https://cdn.jsdelivr.net/gh/StylusThemes/Userscripts@c185c2777d00a6826a8bf3c43bbcdcfeba5a9566/libs/gm/gmcompat.min.js
// @require       https://cdn.jsdelivr.net/gh/StylusThemes/Userscripts@c185c2777d00a6826a8bf3c43bbcdcfeba5a9566/libs/utils/utils.min.js
// @require       https://cdn.jsdelivr.net/gh/StylusThemes/Userscripts@c185c2777d00a6826a8bf3c43bbcdcfeba5a9566/libs/wikidata/index.min.js
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
    CONTAINER_SELECTOR: '.mb-2', // CSS selector for button container
    RELEVANT_PAGE_RX: /debridmediamanager\.com\/(movie|show)\/[^\/]+/, // Pages where buttons should appear
    MAX_RETRIES: 20, // Max attempts to find container on SPA pages
    CSS_CLASS_PREFIX: 'dmm-tg' // Prefix for all CSS classes to avoid conflicts
  };

  // Ensure BUTTON_DATA is available and valid (loaded from external CDN)
  const BUTTON_DATA = Array.isArray(window?.DMM_BUTTON_DATA) ? window.DMM_BUTTON_DATA : [];

  // DOM utility functions for concise element selection and manipulation
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

  /**
   * Injects CSS styles for the UI components
   * Creates a cohesive dark theme that matches DMM's design
   */
  (function injectStyles() {
    const p = CONFIG.CSS_CLASS_PREFIX;
    const css = `
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
      h2.line-clamp-2{display:block!important;-webkit-line-clamp:unset!important;-webkit-box-orient:unset!important;overflow:visible!important;text-overflow:unset!important;white-space:normal!important;} //untruncates titles so they are easier to read
    `;
    const style = document.createElement('style');
    style.textContent = css;
    document.head.appendChild(style);
  })();

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
      this.qualityManager = new window.DMMQualityManager.QualityManager(CONFIG);
      this.animeManager = new window.DMMAnimeManager.AnimeManager(CONFIG);

      // Bind event handlers for proper 'this' context
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
      logger.debug('Dropdowns initialized');

      await this.qualityManager.initialize(container);
      logger.debug('QualityManager initialized');

      this.animeManager.detectAndSetup();
      logger.debug('AnimeManager initialized');

      // Set up global event listeners for menu management
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

      items.forEach((it) => {
        const item = document.createElement('div');
        item.className = `${CONFIG.CSS_CLASS_PREFIX}-item`;
        item.textContent = it.name || it.value || 'apply';
        item.addEventListener('click', (ev) => {
          ev.stopPropagation();
          this.onSelectPattern(it.value, it.name);
          this.closeOpenMenu();
        });
        menu.appendChild(item);
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
      let target = this.findTargetInput();

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
     * Finds target input using same logic as QualityManager
     */
    findTargetInput() {
      let target = qs('#query');
      if (!target || !isVisible(target)) {
        if (this.container) {
          target = this.container.querySelector('input, textarea');
          if (target && !isVisible(target)) target = null;
        }
        if (!target) {
          const candidates = qsa('input, textarea');
          target = candidates.find(isVisible) || null;
        }
      }
      return target;
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
     * Relies on isAnimePage()'s persistent GM storage cache for efficiency
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
        //logger.debug('Skipping duplicate check for same URL:', { url });
        this.lastUrl = url;
        return;
      }

      // Wait for container element to be available
      const container = qs(CONFIG.CONTAINER_SELECTOR);
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

      // Initialize buttons first
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
  function ready(fn) {
    if (document.readyState !== 'loading') fn();
    else document.addEventListener('DOMContentLoaded', fn);
  }

  ready(() => {
    try {
      if (!BUTTON_DATA.length) return;
      new PageManager();
    } catch (err) {
      logger.error('Load error:', err);
    }
  });
})();
