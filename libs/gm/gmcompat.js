// ==UserScript==
// @author       Journey Over
// @exclude      *
// ==UserLibrary==
// @name         @journeyover/gmcompat
// @description  GM Compatibility Layer with Legacy Aliases
// @license      MIT
// @version      2.0.0
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
      try {
        const value = GM_getValue(key);
        return value === undefined ? defaultValue : value;
      } catch (error) {
        throw error;
      }
    }
    throw new Error('GM.getValue not available');
  }

  async function setValue(key, value) {
    if (hasGM && isFunction(GM.setValue)) return GM.setValue(key, value);
    if (isFunction(GM_setValue)) {
      try {
        GM_setValue(key, value);
      } catch (error) {
        throw error;
      }
    } else {
      throw new Error('GM.setValue not available');
    }
  }

  async function deleteValue(key) {
    if (hasGM && isFunction(GM.deleteValue)) return GM.deleteValue(key);
    if (isFunction(GM_deleteValue)) {
      try {
        GM_deleteValue(key);
      } catch (error) {
        throw error;
      }
    } else {
      throw new Error('GM.deleteValue not available');
    }
  }

  async function listValues() {
    if (hasGM && isFunction(GM.listValues)) return GM.listValues();
    if (isFunction(GM_listValues)) {
      try {
        return GM_listValues();
      } catch (error) {
        throw error;
      }
    }
    throw new Error('GM.listValues not available');
  }

  // --- XHR ---
  function xmlHttpRequest(details = {}) {
    return new Promise((resolve, reject) => {
      const success = resp => resolve(resp);
      const fail = error => reject(error);

      if (hasGM && isFunction(GM.xmlHttpRequest)) {
        const d = { ...details };
        if (!d.onload) d.onload = success;
        if (!d.onerror) d.onerror = fail;
        try {
          GM.xmlHttpRequest(d);
        } catch (error) {
          reject(error);
        }
        return;
      }

      if (isFunction(GM_xmlhttpRequest)) {
        const d = { ...details };
        if (!d.onload) d.onload = success;
        if (!d.onerror) d.onerror = fail;
        try {
          GM_xmlhttpRequest(d);
        } catch (error) {
          reject(error);
        }
        return;
      }

      reject(new Error('GM.xmlHttpRequest not available'));
    });
  }

  // --- Clipboard ---
  async function setClipboard(data, type) {
    if (hasGM && isFunction(GM.setClipboard)) {
      try {
        return GM.setClipboard(data, type);
      } catch (error) {
        throw error;
      }
    }
    if (isFunction(GM_setClipboard)) {
      try {
        GM_setClipboard(data, type);
      } catch (error) {
        throw error;
      }
    } else {
      throw new Error('GM.setClipboard not available');
    }
  }

  // --- addStyle ---
  function addStyle(css) {
    if (!css) return;
    if (hasGM && isFunction(GM.addStyle)) {
      try {
        return GM.addStyle(css);
      } catch {
        /* fallback */
      }
    }
    if (isFunction(GM_addStyle)) {
      try {
        return GM_addStyle(css);
      } catch {
        /* fallback */
      }
    }
    throw new Error('GM.addStyle not available');
  }

  // --- Menu ---
  async function registerMenuCommand(caption, callback, accessKey) {
    if (hasGM && isFunction(GM.registerMenuCommand)) {
      try {
        return GM.registerMenuCommand(caption, callback, accessKey);
      } catch (error) {
        throw error;
      }
    }
    if (isFunction(GM_registerMenuCommand)) {
      try {
        return GM_registerMenuCommand(caption, callback, accessKey);
      } catch (error) {
        throw error;
      }
    }
    throw new Error('GM.registerMenuCommand not available');
  }

  // --- Value change listeners ---
  function addValueChangeListener(name, callback) {
    if (hasGM && isFunction(GM.addValueChangeListener)) {
      return GM.addValueChangeListener(name, callback);
    }
    if (isFunction(GM_addValueChangeListener)) {
      return GM_addValueChangeListener(name, callback);
    }
    throw new Error('GM.addValueChangeListener not available');
  }

  function removeValueChangeListener(id) {
    if (hasGM && isFunction(GM.removeValueChangeListener)) {
      return GM.removeValueChangeListener(id);
    }
    if (isFunction(GM_removeValueChangeListener)) {
      return GM_removeValueChangeListener(id);
    }
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

  // Attach to global for legacy drop-in
  global.GMC = API;
  global.GM_getValue = API.getValue;
  global.GM_setValue = API.setValue;
  global.GM_deleteValue = API.deleteValue;
  global.GM_listValues = API.listValues;
  global.GM_xmlhttpRequest = API.xmlHttpRequest;
  global.GM_setClipboard = API.setClipboard;
  global.GM_addStyle = API.addStyle;
  global.GM_registerMenuCommand = API.registerMenuCommand;
  global.GM_addValueChangeListener = API.addValueChangeListener;
  global.GM_removeValueChangeListener = API.removeValueChangeListener;

})(typeof unsafeWindow !== "undefined" ? unsafeWindow : window);
