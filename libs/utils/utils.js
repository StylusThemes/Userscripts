// ==UserScript==
// @author       Journey Over
// @exclude      *
// ==UserLibrary==
// @name         @journeyover/utils
// @description  Utility helpers for my userscripts
// @license      MIT
// @version      1.0.2
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
function debounce(callback, wait) {
  let timeoutId = null;
  return function(...arguments_) {
    if (timeoutId) clearTimeout(timeoutId);
    const context = this;
    timeoutId = setTimeout(() => callback.apply(context, arguments_), wait);
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
function Logger(prefix, options = {}) {
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
    // eslint-disable-next-line no-console
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
    if (options.debug) {
      format('debug', message, ...rest);
    }
  };

  // expose debug flag
  log.debugEnabled = !!options.debug;

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

function isVisible(element) {
  if (!element) return false;
  const style = getComputedStyle(element);
  return element.offsetParent !== null && style.visibility !== 'hidden' && style.display !== 'none' && style.opacity !== '0';
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
 * @param {HTMLInputElement|HTMLTextAreaElement} element - Input element
 * @returns {Function} Native setter function or null if not found
 */
function getNativeValueSetter(element) {
  const proto = element instanceof HTMLInputElement ? HTMLInputElement.prototype : HTMLTextAreaElement.prototype;
  const desc = Object.getOwnPropertyDescriptor(proto, 'value');
  return desc && desc.set;
}

/**
 * Sets input value in a React-compatible way that triggers re-renders
 * Uses native setter and dispatches events to ensure React sees the change
 * @param {HTMLInputElement|HTMLTextAreaElement} element - Target input element
 * @param {string} value - Value to set
 */
function setInputValueReactive(element, value) {
  const nativeSetter = getNativeValueSetter(element);
  if (nativeSetter) {
    nativeSetter.call(element, value);
  } else {
    element.value = value;
  }

  // Set focus and cursor position for better UX
  try {
    element.focus();
    if (typeof element.setSelectionRange === 'function') element.setSelectionRange(value.length, value.length);
  } catch {
    /* Ignore focus errors */
  }

  // Trigger events that React listens for
  element.dispatchEvent(new Event('input', { bubbles: true }));
  element.dispatchEvent(new Event('change', { bubbles: true }));

  // Handle React's internal value tracking if present
  try {
    if (element._valueTracker?.setValue) {
      element._valueTracker.setValue(value);
    }
  } catch {
    /* Ignore React internals errors */
  }
}

/**
 * Execute a function when the DOM is ready
 * @param {Function} callback - Function to execute when DOM is ready
 */
function ready(callback) {
  if (document.readyState !== 'loading') {
    callback();
  } else {
    document.addEventListener('DOMContentLoaded', callback);
  }
}

// Expose utilities.
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { debounce, Logger, qs, qsa, isVisible, findTargetInput, getNativeValueSetter, setInputValueReactive, ready };
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
}
