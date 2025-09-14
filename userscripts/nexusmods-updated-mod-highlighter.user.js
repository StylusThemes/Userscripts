// ==UserScript==
// @name          Nexus Mods - Updated Mod Highlighter
// @version       2.0.0
// @description   Highlight mods that have updated since you last downloaded them
// @author        Journey Over
// @license       MIT
// @match         *://www.nexusmods.com/*
// @require       https://cdn.jsdelivr.net/gh/StylusThemes/Userscripts@c185c2777d00a6826a8bf3c43bbcdcfeba5a9566/libs/utils/utils.min.js
// @grant         none
// @icon          https://www.google.com/s2/favicons?sz=64&domain=nexusmods.com
// @homepageURL   https://github.com/StylusThemes/Userscripts
// @downloadURL   https://github.com/StylusThemes/Userscripts/raw/main/userscripts/nexusmods-updated-mod-highlighter.user.js
// @updateURL     https://github.com/StylusThemes/Userscripts/raw/main/userscripts/nexusmods-updated-mod-highlighter.user.js
// ==/UserScript==

(function() {
  'use strict';

  // ============================================================================
  // CONFIGURATION
  // ============================================================================

  /**
   * Application configuration object containing all customizable settings
   * @type {Object}
   */
  const CONFIG = {
    /** Table highlighting configuration */
    table: {
      highlightClass: 'nexus-updated-mod-highlight',
      highlightColor: 'rgba(0,180,255,0.1)', // Electric blue
    },

    /** Tile highlighting configuration */
    tile: {
      styleId: 'nm-highlighter-style',
      updateClass: 'nm-update-card',
      downloadClass: 'nm-downloaded-card',

      /** Color schemes for different highlight types */
      colors: {
        update: {
          primary: 'rgba(0,180,255,0.8)', // Electric blue
          secondary: 'rgba(0,240,255,0.6)', // Cyan
          glow: 'rgba(0,180,255,0.4)',
          bg: 'rgba(0,180,255,0.05)'
        },
        download: {
          primary: 'rgba(180,0,255,0.8)', // Electric purple
          secondary: 'rgba(255,0,180,0.6)', // Magenta
          glow: 'rgba(180,0,255,0.4)',
          bg: 'rgba(180,0,255,0.05)'
        }
      },

      /** CSS selectors for different tile types */
      selectors: [
        '[data-e2eid="mod-tile"]',
        '[data-e2eid="mod-tile-list"]',
        '[data-e2eid="mod-tile-standard"]',
        '[data-e2eid="mod-tile-compact"]',
        '[data-e2eid="mod-tile-teaser"]',
        '[class*="group/mod-tile"]'
      ],
    },

    /** Global style configuration */
    global: {
      styleId: 'nexus-global-style',
    },

    /** Performance settings */
    debounceDelay: 100,
  };

  // ============================================================================
  // CONSTANTS
  // ============================================================================

  /** Animation durations in seconds */
  const ANIMATION_DURATIONS = {
    TILE_GLOW: 2,
    TILE_PULSE: 2.5,
    TABLE_GLOW: 3,
    TABLE_STRIPE: 4,
    GRADIENT_SHIFT: 3,
  };

  /** CSS selectors for page detection */
  const PAGE_SELECTORS = {
    DOWNLOAD_HISTORY: {
      path: '/users/myaccount',
      tab: 'tab=download+history'
    }
  };

  // ============================================================================
  // GLOBAL VARIABLES
  // ============================================================================

  /** Logger instance for debugging */
  const logger = Logger('Nexus Mod - Updated Mod Highlighter', { debug: false });

  /** MutationObserver for dynamic content changes */
  let mutationObserver = null;

  // ============================================================================
  // UTILITY FUNCTIONS
  // ============================================================================

  /**
   * Parses date strings into timestamps
   * @param {string} text - Date string to parse
   * @returns {number} Timestamp or NaN if invalid
   */
  function parseDate(text) {
    if (!text) return NaN;

    const cleaned = text.replace(/\s+/g, ' ').trim();
    const parsed = Date.parse(cleaned);

    return isNaN(parsed) ? new Date(cleaned).getTime() || NaN : parsed;
  }

  /**
   * Checks if current page is the download history page
   * @returns {boolean} True if on download history page
   */
  function isDownloadHistoryPage() {
    return window.location.pathname.includes(PAGE_SELECTORS.DOWNLOAD_HISTORY.path) &&
      window.location.search.includes(PAGE_SELECTORS.DOWNLOAD_HISTORY.tab);
  }

  /**
   * Generates combined tile selector string
   * @returns {string} Combined CSS selector
   */
  function getTileSelector() {
    return CONFIG.tile.selectors.join(', ');
  }

  /**
   * Creates and injects a style element if it doesn't exist
   * @param {string} id - Style element ID
   * @param {string} css - CSS content
   * @param {string} description - Description for logging
   */
  function injectStyleElement(id, css, description) {
    if (document.getElementById(id)) return;

    const style = document.createElement('style');
    style.id = id;
    style.textContent = css;
    document.head.appendChild(style);

    logger.debug(`Injected ${description}`);
  }

  // ============================================================================
  // STYLE INJECTION FUNCTIONS
  // ============================================================================

  /**
   * Injects all required CSS styles
   */
  function injectStyles() {
    injectTableStyles();
    injectTileStyles();
    injectGlobalStyles();
  }

  /**
   * Injects table highlighting styles
   */
  function injectTableStyles() {
    const css = `
      @keyframes table-row-glow {
        0%, 100% {
          box-shadow:
            inset 0 0 8px rgba(0,180,255,0.1),
            0 0 4px rgba(0,180,255,0.2);
          background:
            linear-gradient(90deg,
              rgba(0,180,255,0.05) 0%,
              rgba(0,180,255,0.08) 50%,
              rgba(0,180,255,0.05) 100%);
        }
        50% {
          box-shadow:
            inset 0 0 12px rgba(0,180,255,0.15),
            0 0 8px rgba(0,180,255,0.3);
          background:
            linear-gradient(90deg,
              rgba(0,180,255,0.08) 0%,
              rgba(0,180,255,0.12) 50%,
              rgba(0,180,255,0.08) 100%);
        }
      }

      @keyframes table-stripe {
        0% { background-position: -200% 0; }
        100% { background-position: 200% 0; }
      }

      .${CONFIG.table.highlightClass} {
        position: relative;
        animation: table-row-glow ${ANIMATION_DURATIONS.TABLE_GLOW}s ease-in-out infinite;
        background:
          linear-gradient(90deg,
            rgba(0,180,255,0.03) 0%,
            rgba(0,180,255,0.06) 50%,
            rgba(0,180,255,0.03) 100%);
        background-size: 200% 100%;
        transition: all 0.3s ease;
      }

      .${CONFIG.table.highlightClass}::before {
        content: '';
        position: absolute;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background:
          linear-gradient(90deg,
            transparent 0%,
            rgba(0,180,255,0.1) 20%,
            rgba(0,180,255,0.2) 50%,
            rgba(0,180,255,0.1) 80%,
            transparent 100%);
        background-size: 200% 100%;
        animation: table-stripe ${ANIMATION_DURATIONS.TABLE_STRIPE}s linear infinite;
        pointer-events: none;
        z-index: 1;
      }

      .${CONFIG.table.highlightClass}::after {
        content: '';
        position: absolute;
        top: 0;
        left: 0;
        bottom: 0;
        width: 3px;
        background: linear-gradient(180deg,
          rgba(0,180,255,0.8) 0%,
          rgba(0,240,255,0.6) 50%,
          rgba(0,180,255,0.8) 100%);
        box-shadow: 0 0 8px rgba(0,180,255,0.4);
        z-index: 2;
      }

      .${CONFIG.table.highlightClass} td {
        position: relative;
        z-index: 3;
        color: inherit !important;
        font-weight: 500;
        transition: color 0.3s ease;
      }

      .${CONFIG.table.highlightClass}:hover {
        animation-duration: 1.5s;
        transform: translateY(-1px);
      }

      .${CONFIG.table.highlightClass}:hover::before {
        animation-duration: 2s;
      }
    `;

    injectStyleElement('nexus-updated-style', css, 'enhanced table styles');
  }

  /**
   * Injects tile highlighting styles
   */
  function injectTileStyles() {
    const css = `
      @keyframes nm-glow {
        0%, 100% {
          box-shadow:
            0 0 8px ${CONFIG.tile.colors.update.glow},
            0 0 16px ${CONFIG.tile.colors.update.glow.replace('0.4', '0.2')},
            0 0 24px ${CONFIG.tile.colors.update.glow.replace('0.4', '0.1')},
            inset 0 0 8px ${CONFIG.tile.colors.update.glow.replace('0.4', '0.1')};
          filter: brightness(1.05) saturate(1.1);
        }
        50% {
          box-shadow:
            0 0 12px ${CONFIG.tile.colors.update.primary.replace('0.8', '0.6')},
            0 0 24px ${CONFIG.tile.colors.update.primary.replace('0.8', '0.4')},
            0 0 36px ${CONFIG.tile.colors.update.primary.replace('0.8', '0.2')},
            inset 0 0 12px ${CONFIG.tile.colors.update.primary.replace('0.8', '0.15')};
          filter: brightness(1.08) saturate(1.15);
        }
      }

      @keyframes nm-download-pulse {
        0%, 100% {
          box-shadow:
            0 0 6px ${CONFIG.tile.colors.download.glow},
            0 0 12px ${CONFIG.tile.colors.download.glow.replace('0.4', '0.2')},
            inset 0 0 6px ${CONFIG.tile.colors.download.glow.replace('0.4', '0.05')};
        }
        50% {
          box-shadow:
            0 0 10px ${CONFIG.tile.colors.download.primary.replace('0.8', '0.5')},
            0 0 20px ${CONFIG.tile.colors.download.primary.replace('0.8', '0.3')},
            inset 0 0 10px ${CONFIG.tile.colors.download.primary.replace('0.8', '0.08')};
        }
      }

      .${CONFIG.tile.updateClass} {
        position: relative;
        background: linear-gradient(135deg,
          ${CONFIG.tile.colors.update.bg} 0%,
          ${CONFIG.tile.colors.update.bg.replace('0.05', '0.03')} 50%,
          ${CONFIG.tile.colors.update.bg.replace('0.05', '0.01')} 100%);
        border: 2px solid transparent;
        border-image: linear-gradient(135deg,
          ${CONFIG.tile.colors.update.primary} 0%,
          ${CONFIG.tile.colors.update.secondary} 50%,
          ${CONFIG.tile.colors.update.primary.replace('0.8', '0.4')} 100%);
        border-image-slice: 1;
        animation: nm-glow ${ANIMATION_DURATIONS.TILE_GLOW}s ease-in-out infinite;
        transform: scale(1.02);
        transition: all 0.3s ease;
      }

      .${CONFIG.tile.updateClass}::before {
        content: '';
        position: absolute;
        top: -2px;
        left: -2px;
        right: -2px;
        bottom: -2px;
        background: linear-gradient(45deg,
          transparent 0%,
          ${CONFIG.tile.colors.update.bg.replace('0.05', '0.1')} 25%,
          ${CONFIG.tile.colors.update.bg.replace('0.05', '0.2')} 50%,
          ${CONFIG.tile.colors.update.bg.replace('0.05', '0.1')} 75%,
          transparent 100%);
        background-size: 200% 200%;
        animation: gradient-shift ${ANIMATION_DURATIONS.GRADIENT_SHIFT}s ease-in-out infinite;
        pointer-events: none;
        z-index: -1;
      }

      .${CONFIG.tile.downloadClass} {
        position: relative;
        background: linear-gradient(135deg,
          ${CONFIG.tile.colors.download.bg} 0%,
          ${CONFIG.tile.colors.download.bg.replace('0.05', '0.03')} 50%,
          ${CONFIG.tile.colors.download.bg.replace('0.05', '0.01')} 100%);
        border: 2px solid transparent;
        border-image: linear-gradient(135deg,
          ${CONFIG.tile.colors.download.primary} 0%,
          ${CONFIG.tile.colors.download.secondary} 50%,
          ${CONFIG.tile.colors.download.primary.replace('0.8', '0.3')} 100%);
        border-image-slice: 1;
        animation: nm-download-pulse ${ANIMATION_DURATIONS.TILE_PULSE}s ease-in-out infinite;
        transform: scale(1.01);
        transition: all 0.3s ease;
      }

      .${CONFIG.tile.downloadClass}::after {
        content: '';
        position: absolute;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background: radial-gradient(circle at center,
          ${CONFIG.tile.colors.download.bg.replace('0.05', '0.03')} 0%,
          transparent 70%);
        pointer-events: none;
        z-index: -1;
      }

      @keyframes gradient-shift {
        0% { background-position: 0% 0%; }
        50% { background-position: 100% 100%; }
        100% { background-position: 0% 0%; }
      }
    `;

    injectStyleElement(CONFIG.tile.styleId, css, 'enhanced tile styles');
  }

  /**
   * Injects global styles (border-radius removal)
   */
  function injectGlobalStyles() {
    const css = `*{border-radius: 0 !important;}`;
    injectStyleElement(CONFIG.global.styleId, css, 'global styles');
  }

  // ============================================================================
  // PROCESSING FUNCTIONS
  // ============================================================================

  /**
   * Processes table rows for highlighting updated mods
   */
  function processTable() {
    if (!isDownloadHistoryPage()) return;

    const rows = document.querySelectorAll('tr.even, tr.odd');
    let highlighted = 0;

    rows.forEach(row => {
      const downloadCell = row.querySelector('td.table-download');
      const updateCell = row.querySelector('td.table-update');

      if (!downloadCell || !updateCell) return;

      const downloadDate = parseDate(downloadCell.textContent);
      const updateDate = parseDate(updateCell.textContent);

      if (!isNaN(downloadDate) && !isNaN(updateDate) && downloadDate < updateDate) {
        row.classList.add(CONFIG.table.highlightClass);
        highlighted++;
      }
    });

    logger.debug(`Processed ${rows.length} table rows, highlighted ${highlighted}`);
  }

  /**
   * Processes mod tiles for highlighting based on badges
   */
  function processTiles() {
    if (isDownloadHistoryPage()) return;

    const tileSelector = getTileSelector();
    const tiles = document.querySelectorAll(tileSelector);

    // Clear existing highlights
    tiles.forEach(tile => {
      tile.classList.remove(CONFIG.tile.updateClass, CONFIG.tile.downloadClass);
    });

    // Apply highlights based on badges
    document.querySelectorAll('[data-e2eid="mod-tile-update-available"]').forEach(badge => {
      const tile = badge.closest(tileSelector);
      if (tile) tile.classList.add(CONFIG.tile.updateClass);
    });

    document.querySelectorAll('[data-e2eid="mod-tile-downloaded"]').forEach(badge => {
      const tile = badge.closest(tileSelector);
      if (tile && !tile.classList.contains(CONFIG.tile.updateClass)) {
        tile.classList.add(CONFIG.tile.downloadClass);
      }
    });

    logger.debug(`Processed ${tiles.length} tiles`);
  }

  /**
   * Processes both table and tiles based on current page
   */
  function processAll() {
    processTable();
    processTiles();
  }

  /**
   * Debounced version of processAll to prevent excessive processing
   */
  const debouncedProcess = debounce(processAll, CONFIG.debounceDelay);

  // ============================================================================
  // OBSERVER & EVENT SETUP
  // ============================================================================

  /**
   * Sets up MutationObserver for dynamic content changes
   */
  function setupMutationObserver() {
    if (mutationObserver) mutationObserver.disconnect();

    mutationObserver = new MutationObserver(debouncedProcess);
    mutationObserver.observe(document.body, {
      childList: true,
      subtree: true
    });
  }

  /**
   * Sets up navigation event listeners for SPA support
   */
  function setupNavigationHooks() {
    const originalPushState = history.pushState;
    const originalReplaceState = history.replaceState;

    history.pushState = function(...args) {
      const result = originalPushState.apply(this, args);
      debouncedProcess();
      return result;
    };

    history.replaceState = function(...args) {
      const result = originalReplaceState.apply(this, args);
      debouncedProcess();
      return result;
    };

    window.addEventListener('popstate', debouncedProcess);
  }

  // ============================================================================
  // INITIALIZATION
  // ============================================================================

  /**
   * Main initialization function
   */
  function init() {
    injectStyles();
    processAll();
    setupMutationObserver();
    setupNavigationHooks();
  }

  // ============================================================================
  // SCRIPT STARTUP
  // ============================================================================

  // Start the script when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
