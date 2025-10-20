// ==UserScript==
// @author       Journey Over
// @exclude      *
// ==UserLibrary==
// @name         @journeyover/gmcompat
// @description  GM API Compatibility Library
// @license      MIT
// @version      3.0.1
// @homepageURL  https://github.com/StylusThemes/Userscripts
// ==/UserLibrary==
// @grant        GM.getValue
// @grant        GM.setValue
// @grant        GM.deleteValue
// @grant        GM.listValues
// @grant        GM.xmlHttpRequest
// @grant        GM.registerMenuCommand
// @grant        GM.addStyle
// @grant        GM.setClipboard
// @grant        GM.addValueChangeListener
// @grant        GM.removeValueChangeListener
// @grant        GM.info
// ==/UserScript==

/* global GM, GM_getValue, GM_setValue, GM_deleteValue, GM_listValues,
   GM_xmlhttpRequest, GM_registerMenuCommand, GM_addStyle, GM_setClipboard,
   GM_addValueChangeListener, GM_removeValueChangeListener */

(function(global) {
  'use strict';

  const hasGM = typeof GM !== 'undefined' && GM !== null;
  const hasLegacy =
    typeof GM_getValue !== 'undefined' ||
    typeof GM_setValue !== 'undefined';

  const isFunction = value => typeof value === 'function';

  // --- Storage ---
  async function getValue(key, defaultValue) {
    if (hasGM && isFunction(GM.getValue)) return GM.getValue(key, defaultValue);
    if (isFunction(GM_getValue)) {
      const value = GM_getValue(key);
      return value === undefined ? defaultValue : value;
    }
    throw new Error('GM.getValue not available');
  }

  async function setValue(key, value) {
    if (hasGM && isFunction(GM.setValue)) return GM.setValue(key, value);
    if (isFunction(GM_setValue)) return GM_setValue(key, value);
    throw new Error('GM.setValue not available');
  }

  async function deleteValue(key) {
    if (hasGM && isFunction(GM.deleteValue)) return GM.deleteValue(key);
    if (isFunction(GM_deleteValue)) return GM_deleteValue(key);
    throw new Error('GM.deleteValue not available');
  }

  async function listValues() {
    if (hasGM && isFunction(GM.listValues)) return GM.listValues();
    if (isFunction(GM_listValues)) return GM_listValues();
    throw new Error('GM.listValues not available');
  }

  // --- XHR ---
  function xmlHttpRequest(details = {}) {
    return new Promise((resolve, reject) => {
      const success = resp => resolve(resp);
      const fail = error => reject(error);
      const d = { ...details };

      if (!d.onload) d.onload = success;
      if (!d.onerror) d.onerror = fail;

      if (hasGM && isFunction(GM.xmlHttpRequest)) {
        try {
          GM.xmlHttpRequest(d);
          return;
        } catch (error) {
          return reject(error);
        }
      }

      if (isFunction(GM_xmlhttpRequest)) {
        try {
          GM_xmlhttpRequest(d);
          return;
        } catch (error) {
          return reject(error);
        }
      }

      reject(new Error('GM.xmlHttpRequest not available'));
    });
  }

  // --- Clipboard ---
  function setClipboard(data, type) {
    if (hasGM && isFunction(GM.setClipboard)) return GM.setClipboard(data, type);
    if (isFunction(GM_setClipboard)) return GM_setClipboard(data, type);
    throw new Error('GM.setClipboard not available');
  }

  // --- addStyle ---
  function addStyle(css) {
    if (!css) return;

    // Modern API
    if (hasGM && isFunction(GM.addStyle)) {
      try {
        return GM.addStyle(css);
      } catch {
        /* fallback */
      }
    }

    // Classic API
    if (isFunction(GM_addStyle)) {
      try {
        return GM_addStyle(css);
      } catch {
        /* fallback */
      }
    }

    // Manual fallback if both APIs are missing
    const style = document.createElement('style');
    style.textContent = css;
    document.head.appendChild(style);
    return style;
  }

  // --- Menu ---
  function registerMenuCommand(caption, callback, accessKey) {
    if (hasGM && isFunction(GM.registerMenuCommand))
      return GM.registerMenuCommand(caption, callback, accessKey);
    if (isFunction(GM_registerMenuCommand))
      return GM_registerMenuCommand(caption, callback, accessKey);
    throw new Error('GM.registerMenuCommand not available');
  }

  // --- Value change listeners ---
  function addValueChangeListener(name, callback) {
    if (hasGM && isFunction(GM.addValueChangeListener))
      return GM.addValueChangeListener(name, callback);
    if (isFunction(GM_addValueChangeListener))
      return GM_addValueChangeListener(name, callback);
    throw new Error('GM.addValueChangeListener not available');
  }

  function removeValueChangeListener(id) {
    if (hasGM && isFunction(GM.removeValueChangeListener))
      return GM.removeValueChangeListener(id);
    if (isFunction(GM_removeValueChangeListener))
      return GM_removeValueChangeListener(id);
    throw new Error('GM.removeValueChangeListener not available');
  }

  // --- Debug info ---
  const __internal = {
    hasGM,
    hasLegacy,
    available: {
      getValue: hasGM ? isFunction(GM.getValue) : isFunction(GM_getValue),
      setValue: hasGM ? isFunction(GM.setValue) : isFunction(GM_setValue),
      deleteValue: hasGM ? isFunction(GM.deleteValue) : isFunction(GM_deleteValue),
      listValues: hasGM ? isFunction(GM.listValues) : isFunction(GM_listValues),
      xmlHttpRequest: hasGM ? isFunction(GM.xmlHttpRequest) : isFunction(GM_xmlhttpRequest),
      registerMenuCommand: hasGM ? isFunction(GM.registerMenuCommand) : isFunction(GM_registerMenuCommand),
      addStyle: hasGM ? isFunction(GM.addStyle) : isFunction(GM_addStyle),
      setClipboard: hasGM ? isFunction(GM.setClipboard) : isFunction(GM_setClipboard),
      addValueChangeListener: hasGM ? isFunction(GM.addValueChangeListener) : isFunction(GM_addValueChangeListener),
      removeValueChangeListener: hasGM ? isFunction(GM.removeValueChangeListener) : isFunction(GM_removeValueChangeListener),
    }
  };

  // --- Public API ---
  const API = {
    getValue,
    setValue,
    deleteValue,
    listValues,
    xmlHttpRequest,
    setClipboard,
    addStyle,
    registerMenuCommand,
    addValueChangeListener,
    removeValueChangeListener,
    __internal
  };

  // --- Public GM Object ---
  const GMObject = { ...API };
  if (hasGM && GM.info) GMObject.info = GM.info;

  // Attach to global
  global.GM = GMObject;
  global.GMC = GMObject; // compatibility alias

})(typeof unsafeWindow !== 'undefined' ? unsafeWindow : window);
