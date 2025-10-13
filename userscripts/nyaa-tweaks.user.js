// ==UserScript==
// @name          Nyaa - Tweaks
// @version       1.0.0
// @description   Redirects to English-translated anime and formats timestamps in 12-hour time.
// @author        Journey Over
// @license       MIT
// @match         *://nyaa.si/*
// @require       https://cdn.jsdelivr.net/gh/StylusThemes/Userscripts@c185c2777d00a6826a8bf3c43bbcdcfeba5a9566/libs/utils/utils.min.js
// @grant         none
// @run-at        document-start
// @icon          https://www.google.com/s2/favicons?sz=64&domain=nyaa.si
// @homepageURL   https://github.com/StylusThemes/Userscripts
// @downloadURL   https://github.com/StylusThemes/Userscripts/raw/main/userscripts/nyaa-tweaks.user.js
// @updateURL     https://github.com/StylusThemes/Userscripts/raw/main/userscripts/nyaa-tweaks.user.js
// ==/UserScript==

(function() {
  'use strict';

  // --------------------------------------------------------
  // 1. Auto-Filter to English Translated Category
  // --------------------------------------------------------
  function enforceEnglishFilter() {
    const currentUrl = new URL(window.location.href);
    const categoryParameter = currentUrl.searchParams.get('c');

    // Redirect only if in "All (0_0)" or "Anime – All (1_0)"
    if (categoryParameter === '0_0' || categoryParameter === '1_0') {
      currentUrl.searchParams.set('c', '1_2');
      window.location.replace(currentUrl.toString());
    }
  }

  // --------------------------------------------------------
  // 2. Timestamp Conversion (24h -> 12h)
  // --------------------------------------------------------
  function convertTo12Hour(timestampString) {
    const [datePart, timePart] = timestampString.split(' ');
    let [hourValue, minuteValue] = timePart.split(':').map(Number);

    const amPmPeriod = hourValue >= 12 ? 'PM' : 'AM';
    hourValue = hourValue % 12 || 12;

    return `${datePart} ${hourValue}:${minuteValue.toString().padStart(2, '0')} ${amPmPeriod}`;
  }

  function updateTimestamps() {
    for (const tableDataCell of qsa('td.text-center')) {
      const cellContent = tableDataCell.textContent.trim();
      if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/.test(cellContent)) {
        tableDataCell.textContent = convertTo12Hour(cellContent);
      }
    }
  }

  function observeTimestamps() {
    updateTimestamps();
    createMutationObserver(updateTimestamps);
  }

  // --------------------------------------------------------
  // Init
  // --------------------------------------------------------
  enforceEnglishFilter();
  ready(observeTimestamps);

})();
