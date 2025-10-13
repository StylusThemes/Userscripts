// ==UserScript==
// @author       Journey Over
// @exclude      *
// ==UserLibrary==
// @name         @journeyover/utils
// @description  Utility helpers for my userscripts
// @license      MIT
// @version      1.0.4
// @homepageURL  https://github.com/StylusThemes/Userscripts
// ==/UserScript==

/**
 * Create a debounced function that delays calling `fn` until `wait`
 * milliseconds have passed without another call.
 *
 * The returned function preserves the original `this` binding and forwards
 * all arguments to `fn`. This implementation does not provide cancel/flush
 * helpers; it only postpones execution.
 *
 * Inputs:
 * - fn: Function to invoke after the quiet period.
 * - wait: Number of milliseconds to wait.
 *
 * Output:
 * - A callable function that schedules `fn` and returns undefined.
 *
 * Edge cases:
 * - If `fn` is not a function a TypeError will be thrown by the runtime when
 *   attempting to call it. `wait` is coerced by the timer APIs to a number.
 *
 * @param {Function} fn - Function to debounce. Called with the original `this`.
 * @param {number} wait - Delay in milliseconds.
 * @returns {Function} A debounced wrapper function.
 *
 * @example
 * const save = debounce(() => api.save(data), 250);
 * input.addEventListener('input', save);
 */
function debounce(fn, wait) {
  let timeoutId = null;
  return function(...args) {
    if (timeoutId) clearTimeout(timeoutId);
    const context = this;
    timeoutId = setTimeout(() => fn.apply(context, args), wait);
  };
}

/**
 * Styled logger factory for userscripts.
 *
 * Creates a logging function that prefixes every message with `[prefix]`
 * and an icon indicating the log level. The returned function delegates
 * to the corresponding `console` method for proper formatting.
 *
 * Debug logging can be enabled or disabled via the optional `opts` parameter:
 *   Logger('Prefix', { debug: true })
 *
 * The returned function is callable as:
 *   log(message, ...args)
 *
 * It also exposes helper methods:
 *   - log.error(message, ...args)  ❌ red
 *   - log.warn(message, ...args)   ⚠️ orange
 *   - log.debug(message, ...args)  🔍 blue (only logs if `opts.debug` is true)
 *   - log(message, ...args)        ✅ green
 *
 * Additional arguments are forwarded directly to the console API so
 * objects, arrays, and Error instances are preserved.
 *
 * @param {string} prefix - Label to display in brackets before each message
 *                          (e.g. 'YouTube - Resumer' → '[YouTube - Resumer]').
 * @param {Object} [opts] - Optional settings for the logger.
 * @param {boolean} [opts.debug=false] - Whether to enable debug logging.
 * @returns {Function} A logging function with `.error`, `.warn`, and `.debug` helpers.
 *
 * @example
 * const log = Logger('YouTube - Resumer', { debug: true });
 * log('Initialized', { version: '1.2.2' });
 * log.warn('Unstable connection');
 * log.error('Failed to resume playback', new Error('Timeout'));
 * log.debug('Progress data', { time: 123 });
 */
function Logger(prefix, opts = {}) {
  const baseStyle = 'font-weight: bold; padding:2px 6px; border-radius: 4px;';
  const formattedPrefix = `[${prefix}]`;

  const styles = {
    log: 'background: #4caf50; color: white;' + baseStyle, // green
    error: 'background: #f44336; color: white;' + baseStyle, // red
    warn: 'background: #ff9800; color: black;' + baseStyle, // orange
    debug: 'background: #2196f3; color: white;' + baseStyle, // blue
  };

  const icons = {
    log: '✅',
    error: '❌',
    warn: '⚠️',
    debug: '🔍',
  };

  function format(type, message, ...rest) {
    console[type](
      `%c${icons[type]} ${formattedPrefix}%c ${message}`,
      styles[type],
      '',
      ...rest
    );
  }

  function log(message, ...rest) {
    format('log', message, ...rest);
  }

  log.error = function(message, ...rest) {
    format('error', message, ...rest);
  };

  log.warn = function(message, ...rest) {
    format('warn', message, ...rest);
  };

  log.debug = function(message, ...rest) {
    if (opts.debug) {
      format('debug', message, ...rest);
    }
  };

  // expose debug flag
  log.debugEnabled = !!opts.debug;

  return log;
}

/**
 * DOM utility functions for concise element selection and manipulation
 */
function qs(sel, root = document) {
  return root.querySelector(sel);
}

function qsa(sel, root = document) {
  return [...root.querySelectorAll(sel)];
}

function isVisible(el) {
  if (!el) return false;
  const style = getComputedStyle(el);
  return el.offsetParent !== null && style.visibility !== 'hidden' && style.display !== 'none' && style.opacity !== '0';
}

/**
 * Finds the target input element using priority-based search
 * Prefers #query, falls back to container inputs, then any visible input
 * @param {HTMLElement} container - Optional container to search within
 * @returns {HTMLInputElement|HTMLTextAreaElement|null} The target input element or null
 */
function findTargetInput(container = null) {
  // Primary target: #query input
  let target = qs('#query');
  if (target && isVisible(target)) return target;

  // Secondary: inputs within provided container
  if (container) {
    target = container.querySelector('input, textarea');
    if (target && isVisible(target)) return target;
  }

  // Fallback: any visible input
  const candidates = qsa('input, textarea');
  target = candidates.find(isVisible) || null;
  return target;
}

/**
 * Gets the native value property setter for React input compatibility
 * React overrides the default input.value setter, so we need the original
 * @param {HTMLInputElement|HTMLTextAreaElement} el - Input element
 * @returns {Function} Native setter function or null if not found
 */
function getNativeValueSetter(el) {
  const proto = el instanceof HTMLInputElement ? HTMLInputElement.prototype : HTMLTextAreaElement.prototype;
  const desc = Object.getOwnPropertyDescriptor(proto, 'value');
  return desc && desc.set;
}

/**
 * Sets input value in a React-compatible way that triggers re-renders
 * Uses native setter and dispatches events to ensure React sees the change
 * @param {HTMLInputElement|HTMLTextAreaElement} el - Target input element
 * @param {string} value - Value to set
 */
function setInputValueReactive(el, value) {
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
    if (el._valueTracker?.setValue) {
      el._valueTracker.setValue(value);
    }
  } catch (err) { /* Ignore React internals errors */ }
}

/**
 * Execute a function when the DOM is ready
 * @param {Function} fn - Function to execute when DOM is ready
 */
function ready(fn) {
  if (document.readyState !== 'loading') {
    fn();
  } else {
    document.addEventListener('DOMContentLoaded', fn);
  }
}

/**
 * Validates if cached data is still fresh based on timestamp and duration
 * @param {Object} cacheEntry - Cache entry with timestamp and data
 * @param {number} durationMs - Cache duration in milliseconds
 * @returns {boolean} True if cache is valid
 */
function isCacheValid(cacheEntry, durationMs) {
  return cacheEntry && cacheEntry.timestamp && (Date.now() - cacheEntry.timestamp < durationMs);
}

/**
 * Creates a MutationObserver with flexible configuration
 * @param {Function} callback - Observer callback function
 * @param {Object} options - Observer options
 * @param {Element} [target=document.body] - Element to observe
 * @returns {MutationObserver} Configured observer
 */
function createMutationObserver(callback, options = {}, target = document.body) {
  const defaultOptions = {
    childList: true,
    subtree: true,
    ...options
  };
  const observer = new MutationObserver(callback);
  observer.observe(target, defaultOptions);
  return observer;
}

/**
 * Creates a temporary MutationObserver that disconnects after a condition is met
 * @param {Function} conditionFn - Function that returns true when observer should disconnect
 * @param {Function} callback - Observer callback function
 * @param {Object} options - Observer options
 * @param {Element} [target=document.body] - Element to observe
 * @returns {MutationObserver} Configured observer
 */
function createTemporaryObserver(conditionFn, callback, options = {}, target = document.body) {
  const wrappedCallback = (mutations, observer) => {
    if (conditionFn(mutations, observer)) {
      observer.disconnect();
      return;
    }
    callback(mutations, observer);
  };
  return createMutationObserver(wrappedCallback, options, target);
}

/**
 * Waits for an element to appear in the DOM
 * @param {string} selector - CSS selector to wait for
 * @param {Element} [root=document] - Root element to search within
 * @param {number} [timeout=10000] - Timeout in milliseconds
 * @returns {Promise<Element>} Promise that resolves with the found element
 */
function waitForElement(selector, root = document, timeout = 10000) {
  return new Promise((resolve, reject) => {
    const element = root.querySelector(selector);
    if (element) {
      resolve(element);
      return;
    }

    const timeoutId = setTimeout(() => {
      observer.disconnect();
      reject(new Error(`Element "${selector}" not found within ${timeout}ms`));
    }, timeout);

    const observer = createTemporaryObserver(
      () => {
        const found = root.querySelector(selector);
        if (found) {
          clearTimeout(timeoutId);
          resolve(found);
          return true; // Disconnect
        }
        return false; // Continue observing
      },
      () => {} // No-op callback, condition does the work
    );
  });
}

/**
 * Creates a styled button element with common properties
 * @param {string} text - Button text content
 * @param {string} className - CSS class name
 * @param {Function} clickHandler - Click event handler
 * @returns {HTMLButtonElement} Created button element
 */
function createButton(text, className = '', clickHandler = null) {
  const button = document.createElement('button');
  button.textContent = text;
  if (className) button.className = className;
  if (clickHandler) button.addEventListener('click', clickHandler);
  return button;
}

/**
 * Injects CSS styles into the document head
 * @param {string} css - CSS string to inject
 * @param {string} id - Optional ID for the style element
 * @returns {HTMLStyleElement} The created style element
 */
function injectStyles(css, id = null) {
  const style = document.createElement('style');
  style.textContent = css;
  if (id) {
    // Remove existing style with same ID
    const existing = document.getElementById(id);
    if (existing) existing.remove();
    style.id = id;
  }
  document.head.appendChild(style);
  return style;
}

/**
 * Parses a date string with fallback parsing methods
 * @param {string} dateString - Date string to parse
 * @returns {number} Timestamp in milliseconds, or NaN if invalid
 */
function parseDate(dateString) {
  if (!dateString) return NaN;
  const cleanedText = dateString.replace(/\s+/g, ' ').trim();
  const parsedTimestamp = Date.parse(cleanedText);
  return isNaN(parsedTimestamp) ? new Date(cleanedText).getTime() || NaN : parsedTimestamp;
}

// Expose utilities.
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { debounce, Logger, qs, qsa, isVisible, findTargetInput, getNativeValueSetter, setInputValueReactive, ready, isCacheValid, createMutationObserver, createButton, injectStyles, parseDate, createTemporaryObserver, waitForElement };
}

if (typeof window !== 'undefined') {
  window.debounce = debounce;
  window.Logger = Logger;
  window.qs = qs;
  window.qsa = qsa;
  window.isVisible = isVisible;
  window.findTargetInput = findTargetInput;
  window.getNativeValueSetter = getNativeValueSetter;
  window.setInputValueReactive = setInputValueReactive;
  window.ready = ready;
  window.isCacheValid = isCacheValid;
  window.createMutationObserver = createMutationObserver;
  window.createButton = createButton;
  window.injectStyles = injectStyles;
  window.parseDate = parseDate;
  window.createTemporaryObserver = createTemporaryObserver;
  window.waitForElement = waitForElement;
}
