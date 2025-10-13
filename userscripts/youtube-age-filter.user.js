// ==UserScript==
// @name          YouTube - Filters
// @version       2.0.1
// @description   Filters YouTube videos by age, excluding channel pages.
// @author        Journey Over
// @license       MIT
// @match         *://*.youtube.com/*
// @match         *://*.youtube-nocookie.com/*
// @require       https://cdn.jsdelivr.net/gh/StylusThemes/Userscripts@c185c2777d00a6826a8bf3c43bbcdcfeba5a9566/libs/gm/gmcompat.min.js
// @require       https://cdn.jsdelivr.net/gh/StylusThemes/Userscripts@c185c2777d00a6826a8bf3c43bbcdcfeba5a9566/libs/utils/utils.min.js
// @grant         GM.setValue
// @grant         GM.getValue
// @grant         GM.registerMenuCommand
// @run-at        document-body
// @icon          https://www.google.com/s2/favicons?sz=64&domain=youtube.com
// @homepageURL   https://github.com/StylusThemes/Userscripts
// @downloadURL   https://github.com/StylusThemes/Userscripts/raw/main/userscripts/youtube-age-filter.user.js
// @updateURL     https://github.com/StylusThemes/Userscripts/raw/main/userscripts/youtube-age-filter.user.js
// ==/UserScript==

(async function() {
  'use strict';

  const logger = Logger('YT - Age Filter', { debug: false });

  let AGE_THRESHOLD = await GMC.getValue('AGE_THRESHOLD', { value: 4, unit: 'years' });
  const processedVideos = new WeakSet();

  // eslint-disable-next-line no-unused-vars
  const TAG_VIDEO_SELECTORS = [
    // Generic
    '#channel-name a',
    'ytd-channel-name a',
    'a[href*="/@"]',
    'a[href*="/channel/"]',
    'a[href*="/c/"]',
    'a[href*="/user/"]',
    // Sidebars
    '.yt-lockup-byline a',
    '.yt-lockup-metadata-view-model__title a',
    'span.yt-core-attributed-string.yt-content-metadata-view-model__metadata-text',
    // Homepage
    '.yt-lockup-metadata-view-model__metadata .yt-core-attributed-string__link',
    '.yt-content-metadata-view-model__metadata-row .yt-core-attributed-string__link',
    // Search
    '#text-container a.yt-simple-endpoint.style-scope.yt-formatted-string',
    // Fallbacks
    'yt-formatted-string a',
    'yt-formatted-string',
    '.yt-lockup-metadata-view-model__title',
    '.yt-lockup-metadata-view-model'
  ];

  const TITLE_SELECTORS = [
    'a#video-title',
    'h3 .yt-lockup-metadata-view-model__title span.yt-core-attributed-string',
    '.yt-lockup-view-model__content-image span.yt-core-attributed-string',
    'span.yt-core-attributed-string[role="text"]',
    'a.yt-lockup-metadata-view-model__title span.yt-core-attributed-string',
    'yt-formatted-string#video-title',
    'yt-formatted-string[id="video-title"]',
    'yt-formatted-string[class="style-scope ytd-video-renderer"]',
    'a#video-title-link span.yt-core-attributed-string'
  ];

  const VIDEO_SELECTORS = [
    'ytd-rich-item-renderer',
    'yt-lockup-view-model',
    'ytd-grid-video-renderer',
    'ytd-video-renderer',
    'ytd-compact-video-renderer',
    'ytd-playlist-panel-video-renderer'
  ];

  const AGE_SELECTORS = [
    'span.inline-metadata-item.style-scope.ytd-video-meta-block',
    'span.yt-content-metadata-view-model__metadata-text'
  ];

  // Convert various time units to years for consistent comparison
  function convertToYears(value, unit) {
    switch (unit) {
      case 'minutes': {
        return value / 525600;
      }
      case 'hours': {
        return value / 8760;
      }
      case 'days': {
        return value / 365;
      }
      case 'weeks': {
        return value / 52;
      }
      case 'months': {
        return value / 12;
      }
      case 'years': {
        return value;
      }
      default: {
        return value;
      }
    }
  }

  function getVideoAgeTextAndYears(videoElement) {
    const ageText = [...videoElement.querySelectorAll(AGE_SELECTORS.join(','))]
      .map(ageElement => (ageElement.textContent || '').trim())
      .find(text => /\bago\b/i.test(text));

    if (ageText) {
      const ageMatch = ageText.match(/(\d+)\s+(minute|hour|day|week|month|year)s?\s+ago/i);
      if (ageMatch) {
        const ageValue = parseInt(ageMatch[1], 10);
        const ageUnit = ageMatch[2].toLowerCase();
        const ageInYears = convertToYears(ageValue, ageUnit.includes('minute') ? 'minutes' :
          ageUnit.includes('hour') ? 'hours' :
          ageUnit.includes('day') ? 'days' :
          ageUnit.includes('week') ? 'weeks' :
          ageUnit.includes('month') ? 'months' :
          'years');
        return { text: ageText, years: ageInYears };
      }
      return { text: ageText, years: 0 };
    }
    return { text: 'Unknown', years: 0 };
  }

  function getVideoTitle(videoElement) {
    for (const titleSelector of TITLE_SELECTORS) {
      const titleElement = videoElement.querySelector(titleSelector);
      if (titleElement && titleElement.innerText.trim()) return titleElement.innerText.trim();
    }
    return '';
  }

  function filterVideo(videoElement) {
    if (processedVideos.has(videoElement)) return;

    const { text: ageText, years: ageYears } = getVideoAgeTextAndYears(videoElement);
    if (ageText === 'Unknown') return;

    processedVideos.add(videoElement);
    videoElement.dataset.processed = 'true';

    const thresholdInYears = convertToYears(AGE_THRESHOLD.value, AGE_THRESHOLD.unit);

    if (ageYears >= thresholdInYears) {
      for (const selector of VIDEO_SELECTORS) {
        const videoContainer = videoElement.closest(selector);
        if (videoContainer) {
          try { videoContainer.setAttribute('hidden', 'true'); } catch {
            (videoContainer.style || {}).display = 'none';
          }
        }
      }

      logger.debug(`Removed "${getVideoTitle(videoElement)}" (${ageText})`);
    }
  }

  // Continuous polling observer for YouTube's dynamic content (MutationObserver can miss videos)
  async function observeNewVideos() {
    if (window.location.href.includes('@')) return;
    while (true) {
      try {
        const unprocessedVideos = [...document.querySelectorAll(
          VIDEO_SELECTORS.map(selector => `${selector}:not([data-processed])`).join(',')
        )];
        for (const videoElement of unprocessedVideos) {
          filterVideo(videoElement);
        }
      } catch (error) {
        logger.error(error);
      }
      await new Promise(r => setTimeout(r, 50));
    }
  }

  observeNewVideos();

  function openSettingsMenu() {
    if (document.getElementById('yt-filters-settings')) return;

    const settingsOverlay = document.createElement('div');
    settingsOverlay.id = 'yt-filters-overlay';
    settingsOverlay.style = `position:fixed; inset:0; background:rgba(0,0,0,0.5); display:flex; align-items:center; justify-content:center; z-index:10000; backdrop-filter:blur(5px);`;

    const settingsModal = document.createElement('div');
    settingsModal.id = 'yt-filters-settings';
    settingsModal.style = `background:#1e1e2e; color:#f1f1f1; padding:24px; border-radius:16px; width:360px; max-width:90%; box-shadow:0 12px 40px rgba(0,0,0,0.6); font-family:system-ui,sans-serif; transform:translateY(20px); opacity:0; transition:all .25s ease;`;

    settingsModal.innerHTML = `
      <h2 style="margin:0 0 20px;font-size:1.4em;text-align:center;color:#61dafb;">YouTube Filters</h2>
      <div style="display:flex; gap:8px; align-items:center; margin-bottom:8px;">
        <input type="number" id="age-threshold" value="${AGE_THRESHOLD.value}" min="0" style="flex:1;padding:10px 12px;border-radius:8px;border:none;background:#2c2c3e;color:#fff;font-size:1em;">
        <select id="age-unit" style="flex:1;padding:10px 12px;border-radius:8px;border:none;background:#2c2c3e;color:#fff;font-size:1em;">
          <option value="minutes" ${AGE_THRESHOLD.unit==='minutes'?'selected':''}>Minutes</option>
          <option value="hours" ${AGE_THRESHOLD.unit==='hours'?'selected':''}>Hours</option>
          <option value="days" ${AGE_THRESHOLD.unit==='days'?'selected':''}>Days</option>
          <option value="weeks" ${AGE_THRESHOLD.unit==='weeks'?'selected':''}>Weeks</option>
          <option value="months" ${AGE_THRESHOLD.unit==='months'?'selected':''}>Months</option>
          <option value="years" ${AGE_THRESHOLD.unit==='years'?'selected':''}>Years</option>
        </select>
      </div>
      <div style="display:flex; justify-content:center; gap:12px; margin-top:8px;">
        <button id="save-settings" style="flex:1;padding:10px 0;border:none;border-radius:8px;background:#61dafb;color:#111;font-weight:600;font-size:1em;cursor:pointer;transition:all .2s;">Save</button>
        <button id="close-settings" style="flex:1;padding:10px 0;border:none;border-radius:8px;background:#e06c75;color:#fff;font-weight:600;font-size:1em;cursor:pointer;transition:all .2s;">Close</button>
      </div>
    `;

    settingsOverlay.appendChild(settingsModal);
    document.body.appendChild(settingsOverlay);

    requestAnimationFrame(() => {
      settingsModal.style.opacity = "1";
      settingsModal.style.transform = "translateY(0)";
    });

    const ageThresholdInput = document.getElementById('age-threshold');
    const ageUnitSelect = document.getElementById('age-unit');

    for (const buttonId of ['save-settings', 'close-settings']) {
      const settingsButton = document.getElementById(buttonId);
      settingsButton.addEventListener('mouseenter', () => settingsButton.style.filter = 'brightness(1.1)');
      settingsButton.addEventListener('mouseleave', () => settingsButton.style.filter = 'brightness(1)');
    }

    document.getElementById('save-settings').addEventListener('click', async () => {
      const thresholdValue = parseFloat(ageThresholdInput.value);
      const thresholdUnit = ageUnitSelect.value;
      AGE_THRESHOLD = { value: thresholdValue, unit: thresholdUnit };
      await GMC.setValue('AGE_THRESHOLD', AGE_THRESHOLD);
      settingsOverlay.remove();
    });

    function closeMenu() {
      settingsModal.style.opacity = "0";
      settingsModal.style.transform = "translateY(20px)";
      setTimeout(() => settingsOverlay.remove(), 200);
    }

    document.getElementById('close-settings').addEventListener('click', closeMenu);
    settingsOverlay.addEventListener('click', clickEvent => { if (clickEvent.target === settingsOverlay) closeMenu(); });
  }

  GMC.registerMenuCommand('Open YouTube Filters Settings', openSettingsMenu);

})();
