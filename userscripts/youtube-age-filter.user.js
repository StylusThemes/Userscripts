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

  // ---------- Settings ----------
  let AGE_THRESHOLD = await GMC.getValue('AGE_THRESHOLD', { value: 4, unit: 'years' });
  const processedVideos = new WeakSet();

  // ---------- Selectors ----------
// eslint-disable-next-line no-unused-vars
  const TAG_VIDEO_SELECTORS = [ // Currently unused
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

  // ---------- Time Conversion ----------
  function convertToYears(value, unit) {
    switch (unit) {
      case 'minutes':
        return value / 525600;
      case 'hours':
        return value / 8760;
      case 'days':
        return value / 365;
      case 'weeks':
        return value / 52;
      case 'months':
        return value / 12;
      case 'years':
        return value;
      default:
        return value;
    }
  }

  // Returns a string showing equivalent time in all units for display in settings
  function getEquivalentTimeText(value, unit) {
    const years = convertToYears(value, unit);
    const months = years * 12;
    const weeks = years * 52;
    const days = years * 365;
    const hours = days * 24;
    const minutes = hours * 60;
    return `≈ ${Math.round(minutes)} min | ${Math.round(hours)} hr | ${Math.round(days)} day | ${Math.round(weeks)} wk | ${Math.round(months)} mo | ${years.toFixed(2)} yr`;
  }

  // ---------- Video Parsing ----------
  function getVideoAgeTextAndYears(video) {
    const ageText = Array.from(video.querySelectorAll(AGE_SELECTORS.join(',')))
      .map(el => (el.textContent || '').trim())
      .find(text => /\bago\b/i.test(text));

    if (ageText) {
      // Extract numeric value and time unit (minutes/hours/days/weeks/months/years)
      const match = ageText.match(/(\d+)\s+(minute|hour|day|week|month|year)s?\s+ago/i);
      if (match) {
        const val = parseInt(match[1], 10);
        const unit = match[2].toLowerCase();
        // Normalize all variations to our conversion function
        const years = convertToYears(val, unit.includes('minute') ? 'minutes' :
          unit.includes('hour') ? 'hours' :
          unit.includes('day') ? 'days' :
          unit.includes('week') ? 'weeks' :
          unit.includes('month') ? 'months' :
          'years');
        return { text: ageText, years };
      }
      return { text: ageText, years: 0 };
    }
    return { text: 'Unknown', years: 0 };
  }

  function getVideoTitle(video) {
    for (const selector of TITLE_SELECTORS) {
      const el = video.querySelector(selector);
      if (el && el.innerText.trim()) return el.innerText.trim();
    }
    return '';
  }

  // ---------- Filter a single video ----------
  function filterVideo(video) {
    if (processedVideos.has(video)) return;

    const { text: ageText, years: ageYears } = getVideoAgeTextAndYears(video);
    if (ageText === 'Unknown') return;

    // Mark video as processed
    processedVideos.add(video);
    video.dataset.processed = 'true';

    const thresholdYears = convertToYears(AGE_THRESHOLD.value, AGE_THRESHOLD.unit);

    if (ageYears >= thresholdYears) {
      // Hide video element in all matching parent selectors
      VIDEO_SELECTORS.forEach(sel => {
        const target = video.closest(sel);
        if (target) {
          try { target.setAttribute('hidden', 'true'); } catch {
            (target.style || {}).display = 'none';
          }
        }
      });

      // Log removal for debugging
      logger.debug(`Removed "${getVideoTitle(video)}" (${ageText})`);
    }
  }

  // ---------- Continuous Video Detection ----------
  // Continuously checks for new videos and filters them
  async function observeNewVideos() {
    if (window.location.href.includes('@')) return; // Skip channel pages
    while (true) {
      try {
        const unprocessed = Array.from(document.querySelectorAll(
          VIDEO_SELECTORS.map(sel => `${sel}:not([data-processed])`).join(',')
        ));
        unprocessed.forEach(filterVideo);
      } catch (err) {
        logger.error(err);
      }
      // Short delay to reduce CPU usage while staying responsive
      await new Promise(r => setTimeout(r, 50));
    }
  }

  observeNewVideos();

  // ---------- Settings Menu ----------
  function openSettingsMenu() {
    if (document.getElementById('yt-filters-settings')) return;

    // Overlay background
    const overlay = document.createElement('div');
    overlay.id = 'yt-filters-overlay';
    overlay.style = `position:fixed; inset:0; background:rgba(0,0,0,0.5); display:flex; align-items:center; justify-content:center; z-index:10000; backdrop-filter:blur(5px);`;

    // Modal container
    const modal = document.createElement('div');
    modal.id = 'yt-filters-settings';
    modal.style = `background:#1e1e2e; color:#f1f1f1; padding:24px; border-radius:16px; width:360px; max-width:90%; box-shadow:0 12px 40px rgba(0,0,0,0.6); font-family:system-ui,sans-serif; transform:translateY(20px); opacity:0; transition:all .25s ease;`;

    // Inner HTML with threshold input and unit selector
    modal.innerHTML = `
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
      <div id="threshold-info" style="font-size:0.9em;color:#aaa;margin-bottom:16px;text-align:center;">
        ${getEquivalentTimeText(AGE_THRESHOLD.value, AGE_THRESHOLD.unit)}
      </div>
      <div style="display:flex; justify-content:center; gap:12px; margin-top:8px;">
        <button id="save-settings" style="flex:1;padding:10px 0;border:none;border-radius:8px;background:#61dafb;color:#111;font-weight:600;font-size:1em;cursor:pointer;transition:all .2s;">Save</button>
        <button id="close-settings" style="flex:1;padding:10px 0;border:none;border-radius:8px;background:#e06c75;color:#fff;font-weight:600;font-size:1em;cursor:pointer;transition:all .2s;">Close</button>
      </div>
    `;

    overlay.appendChild(modal);
    document.body.appendChild(overlay);

    requestAnimationFrame(() => {
      modal.style.opacity = "1";
      modal.style.transform = "translateY(0)";
    });

    // Update info label dynamically
    const thresholdInput = document.getElementById('age-threshold');
    const unitSelect = document.getElementById('age-unit');
    const infoLabel = document.getElementById('threshold-info');

    function updateInfo() {
      infoLabel.innerText = getEquivalentTimeText(parseFloat(thresholdInput.value), unitSelect.value);
    }

    thresholdInput.addEventListener('input', updateInfo);
    unitSelect.addEventListener('change', updateInfo);

    // Hover effect for buttons
    ['save-settings', 'close-settings'].forEach(id => {
      const btn = document.getElementById(id);
      btn.addEventListener('mouseenter', () => btn.style.filter = 'brightness(1.1)');
      btn.addEventListener('mouseleave', () => btn.style.filter = 'brightness(1)');
    });

    // Save button: updates threshold reactively
    document.getElementById('save-settings').addEventListener('click', async () => {
      const val = parseFloat(thresholdInput.value);
      const unit = unitSelect.value;
      AGE_THRESHOLD = { value: val, unit };
      await GMC.setValue('AGE_THRESHOLD', AGE_THRESHOLD);
      overlay.remove(); // reactive update, no reload needed
    });

    function closeMenu() {
      modal.style.opacity = "0";
      modal.style.transform = "translateY(20px)";
      setTimeout(() => overlay.remove(), 200);
    }

    document.getElementById('close-settings').addEventListener('click', closeMenu);
    overlay.addEventListener('click', e => { if (e.target === overlay) closeMenu(); });
  }

  GMC.registerMenuCommand('Open YouTube Filters Settings', openSettingsMenu);

})();
