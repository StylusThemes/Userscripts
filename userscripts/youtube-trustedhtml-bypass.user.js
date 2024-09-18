// ==UserScript==
// @name          YouTube - TrustedHTML Bypass
// @version       1.0.0
// @description   Bypass errors with userscripts caused by YouTube's TrustedHTML policy
// @author        Journey Over
// @license       MIT
// @match         *://*.youtube.com/*
// @grant         none
// @run-at        document-start
// @icon          https://www.google.com/s2/favicons?sz=64&domain=youtube.com
// @homepageURL   https://github.com/StylusThemes/Userscripts
// @downloadURL   https://github.com/StylusThemes/Userscripts/raw/main/userscripts/youtube-trustedhtml-bypass.user.js
// @updateURL     https://github.com/StylusThemes/Userscripts/raw/main/userscripts/youtube-trustedhtml-bypass.user.js
// ==/UserScript==

(function() {
  'use strict';

  // WORKAROUND: TypeError: Failed to set the 'innerHTML' property on 'Element': This document requires 'TrustedHTML' assignment.
  if (window.trustedTypes && trustedTypes.createPolicy) {
      if (!trustedTypes.defaultPolicy) {
          const passThroughFn = (x) => x;
          trustedTypes.createPolicy('default', {
              createHTML: passThroughFn,
              createScriptURL: passThroughFn,
              createScript: passThroughFn,
          });
      }
  }
})();
