// ==UserScript==
// @name          YouTube - Filters
// @version       2.2.0
// @description   Filter YouTube videos by age and members-only videos.
// @author        Journey Over
// @license       MIT
// @match         *://*.youtube.com/*
// @match         *://*.youtube-nocookie.com/*
// @require       https://cdn.jsdelivr.net/gh/StylusThemes/Userscripts@0171b6b6f24caea737beafbc2a8dacd220b729d8/libs/utils/utils.min.js
// @grant         GM_setValue
// @grant         GM_getValue
// @grant         GM_registerMenuCommand
// @run-at        document-body
// @icon          https://www.google.com/s2/favicons?sz=64&domain=youtube.com
// @homepageURL   https://github.com/StylusThemes/Userscripts
// @downloadURL   https://github.com/StylusThemes/Userscripts/raw/main/userscripts/youtube-age-filter.user.js
// @updateURL     https://github.com/StylusThemes/Userscripts/raw/main/userscripts/youtube-age-filter.user.js
// ==/UserScript==

(async function() {
  'use strict';

  // ---------- Constants ----------
  const TITLE_SELECTORS = [
    'a#video-title',
    'h3 .yt-lockup-metadata-view-model__title span.yt-core-attributed-string',
    '.yt-lockup-view-model__content-image span.yt-core-attributed-string',
    'span.yt-core-attributed-string[role="text"]',
    'a.yt-lockup-metadata-view-model__title span.yt-core-attributed-string',
    'a.yt-lockup-metadata-view-model__title',
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
    'ytd-playlist-video-renderer',
    'ytd-playlist-panel-video-renderer',
    'ytd-radio-renderer',
    'ytd-reel-item-renderer',
    'ytd-reel-video-renderer'
  ];

  const AGE_SELECTORS = [
    'span.inline-metadata-item.style-scope.ytd-video-meta-block',
    'span.yt-content-metadata-view-model__metadata-text'
  ];

  const MEMBERS_SELECTORS = [
    '.badge.badge-style-type-members-only',
    '.yt-badge-shape--commerce .yt-badge-shape__text'
  ];

  const MEMBERS_REGEX = /\bmembers\s*[- ]?\s*only\b/i;

  // ---------- Settings ----------
  let DEBUG_ENABLED = GM_getValue('DEBUG_ENABLED', false);
  const logger = Logger('YT - Filters', { debug: DEBUG_ENABLED });
  let AGE_THRESHOLD = GM_getValue('AGE_THRESHOLD', { value: 4, unit: 'years' });
  let MEMBERS_ONLY_ENABLED = GM_getValue('MEMBERS_ONLY_ENABLED', false);
  const processedVideos = new WeakSet();

  // ---------- Utility Functions ----------
  function convertToYears(value, unit) {
    const conversions = {
      minutes: 525600,
      hours: 8760,
      days: 365,
      weeks: 52,
      months: 12,
      years: 1
    };
    return value / (conversions[unit] || 1);
  }

  function matchesAnySelector(element, selectors) {
    return selectors.some(selector => element.matches(selector));
  }

  function queryAll(root, selectors) {
    return root.querySelectorAll(selectors.join(','));
  }

  // ---------- Video Processing ----------
  function getVideoAgeTextAndYears(videoElement) {
    for (const ageElement of queryAll(videoElement, AGE_SELECTORS)) {
      const ageText = (ageElement.textContent || '').trim();
      if (/\bago\b/i.test(ageText)) {
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
    }
    return { text: 'Unknown', years: 0 };
  }

  function getVideoTitle(videoElement) {
    for (const titleSelector of TITLE_SELECTORS) {
      const titleElement = videoElement.querySelector(titleSelector);
      if (titleElement && titleElement.innerText.trim()) {
        return titleElement.innerText.trim();
      }
    }
    return '';
  }

  function hideVideo(videoElement, reason) {
    for (const selector of VIDEO_SELECTORS) {
      const videoContainer = videoElement.closest(selector);
      if (videoContainer) {
        try {
          videoContainer.setAttribute('hidden', 'true');
        } catch {
          videoContainer.style.display = 'none';
        }
      }
    }
    logger.debug(`Hidden "${getVideoTitle(videoElement)}" (${reason})`);
  }

  // ---------- Age Filtering ----------
  function filterVideoByAge(videoElement) {
    if (processedVideos.has(videoElement)) return;

    const { text: ageText, years: ageYears } = getVideoAgeTextAndYears(videoElement);
    if (ageText === 'Unknown') return;

    processedVideos.add(videoElement);
    videoElement.dataset.processed = 'true';

    const thresholdInYears = convertToYears(AGE_THRESHOLD.value, AGE_THRESHOLD.unit);
    if (ageYears >= thresholdInYears) {
      hideVideo(videoElement, ageText);
    }
  }

  // ---------- Members-Only Filtering ----------
  function isMembersOnlyBadge(badge) {
    return badge.classList.contains('badge-style-type-members-only') ||
      MEMBERS_REGEX.test(badge.textContent || '');
  }

  function removeMembersOnlyVideo(badge) {
    const videoElement = badge.closest(VIDEO_SELECTORS.join(','));
    if (videoElement) {
      videoElement.remove();
      logger.debug(`Removed Members-only "${getVideoTitle(videoElement)}"`);
    }
  }

  function pruneMembersShelf(root = document) {
    for (const shelf of root.querySelectorAll('ytd-shelf-renderer')) {
      const title = (shelf.querySelector('#title')?.textContent || '').trim();
      const subtitle = (shelf.querySelector('#subtitle')?.textContent || '').trim();
      if (MEMBERS_REGEX.test(title) || /videos available to members/i.test(subtitle)) {
        shelf.remove();
      }
    }
  }

  function scanForMembersOnly(root = document) {
    for (const badge of queryAll(root, MEMBERS_SELECTORS)) {
      if (isMembersOnlyBadge(badge)) {
        removeMembersOnlyVideo(badge);
      }
    }
    pruneMembersShelf(root);
  }

  // ---------- Observers ----------
  async function observeNewVideos() {
    while (true) {
      try {
        const unprocessedVideos = [...document.querySelectorAll(
          VIDEO_SELECTORS.map(selector => `${selector}:not([data-processed])`).join(',')
        )];
        for (const videoElement of unprocessedVideos) {
          // Age filtering only on non-channel pages
          if (!window.location.href.includes('@')) {
            filterVideoByAge(videoElement);
          }
        }
        if (MEMBERS_ONLY_ENABLED) {
          pruneMembersShelf();
        }
      } catch (error) {
        logger.error(error);
      }
      await new Promise(resolve => setTimeout(resolve, 50));
    }
  }

  function observeMembersOnly() {
    const observer = new MutationObserver(mutations => {
      for (const mutation of mutations) {
        if (mutation.type === 'childList') {
          for (const node of mutation.addedNodes) {
            if (!(node instanceof Element)) continue;
            if (matchesAnySelector(node, MEMBERS_SELECTORS) && isMembersOnlyBadge(node)) {
              removeMembersOnlyVideo(node);
            } else {
              scanForMembersOnly(node);
            }
          }
        }
      }
    });
    observer.observe(document.documentElement, { childList: true, subtree: true });

    const rescan = () => setTimeout(() => scanForMembersOnly(document), 50);
    window.addEventListener('yt-navigate-finish', rescan);
    window.addEventListener('yt-page-data-updated', rescan);
  }

  // ---------- Initialization ----------
  observeNewVideos();

  if (MEMBERS_ONLY_ENABLED) {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => {
        scanForMembersOnly();
        observeMembersOnly();
      });
    } else {
      scanForMembersOnly();
      observeMembersOnly();
    }
  }

  // ---------- Settings UI ----------
  function toggleSwitch(element) {
    element.classList.toggle('active');
  }

  function handleToggle(element) {
    toggleSwitch(element);
    element.setAttribute('aria-checked', element.classList.contains('active'));
  }

  function openSettingsMenu() {
    if (document.getElementById('yt-filters-settings')) return;

    const overlay = document.createElement('div');
    overlay.id = 'yt-filters-overlay';
    overlay.style = `position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.6);backdrop-filter:blur(12px);display:flex;align-items:center;justify-content:center;z-index:10000;opacity:0;animation:overlayFadeIn 0.4s ease forwards;`;

    const modal = document.createElement('div');
    modal.id = 'yt-filters-settings';
    modal.style = `background:linear-gradient(135deg,#1a1a1a 0%,#2d2d2d 100%);color:#e4e4e4;border-radius:20px;width:420px;max-width:95vw;max-height:85vh;overflow:hidden;box-shadow:0 25px 50px rgba(0,0,0,0.5),0 0 0 1px rgba(255,255,255,0.1);font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;transform:translateY(30px) scale(0.95);opacity:0;animation:modalSlideIn 0.4s cubic-bezier(0.34,1.56,0.64,1) 0.1s forwards;display:flex;flex-direction:column;`;

    modal.innerHTML = `<style>@keyframes overlayFadeIn{to{opacity:1}}@keyframes modalSlideIn{to{opacity:1;transform:translateY(0)scale(1)}}.header{background:linear-gradient(135deg,#ff0000 0%,#cc0000 100%);color:white;padding:20px 24px;text-align:center;position:relative}.header::before{content:'';position:absolute;top:0;left:0;right:0;bottom:0;background:url('data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><circle cx="20" cy="20" r="2" fill="rgba(255,255,255,0.1)"/><circle cx="80" cy="30" r="1" fill="rgba(255,255,255,0.1)"/><circle cx="60" cy="70" r="1.5" fill="rgba(255,255,255,0.1)"/></svg>');opacity:0.3}.header h1{margin:0;font-size:20px;font-weight:700;position:relative;z-index:1}.header p{margin:2px 0 0 0;font-size:13px;opacity:0.9;position:relative;z-index:1}.content{padding:24px;flex:1;overflow-y:auto}.setting-card{background:#2a2a2a;border:1px solid #404040;border-radius:12px;padding:16px;margin-bottom:12px;transition:all 0.3s ease;position:relative;overflow:hidden}.setting-card::before{content:'';position:absolute;top:0;left:0;right:0;height:3px;background:linear-gradient(90deg,#ff0000,#cc0000);transform:scaleX(0);transition:transform 0.3s ease}.setting-card:hover{transform:translateY(-1px);box-shadow:0 6px 24px rgba(0,0,0,0.3);border-color:#555}.setting-card:hover::before{transform:scaleX(1)}.card-header{display:flex;align-items:center;margin-bottom:12px;gap:10px}.card-icon{width:32px;height:32px;border-radius:8px;display:flex;align-items:center;justify-content:center;font-size:16px;background:linear-gradient(135deg,#ff0000,#cc0000);color:white;flex-shrink:0}.card-title{font-size:14px;font-weight:600;color:#e4e4e4;margin:0}.card-description{font-size:12px;color:#a0a0a0;margin:2px 0 0 0;line-height:1.3}.form-group{margin-bottom:12px}.form-group:last-child{margin-bottom:0}.input-row{display:flex;gap:10px;align-items:center}.input-field{flex:1;padding:10px 12px;border:1px solid #555;border-radius:8px;font-size:13px;background:#333;color:#e4e4e4;transition:all 0.3s ease;outline:none}.input-field:focus{border-color:#ff0000;box-shadow:0 0 0 2px rgba(255,0,0,0.2)}.input-field::placeholder{color:#888}.select-field{padding:10px 12px;border:1px solid #555;border-radius:8px;font-size:13px;background:#333;color:#e4e4e4;cursor:pointer;transition:all 0.3s ease;outline:none;min-width:100px}.select-field:focus{border-color:#ff0000;box-shadow:0 0 0 2px rgba(255,0,0,0.2)}.toggle-container{display:flex;align-items:center;justify-content:space-between;padding:6px 0}.toggle-label{font-size:13px;font-weight:500;color:#e4e4e4;cursor:pointer;user-select:none}.toggle-description{font-size:11px;color:#888;margin-top:1px;line-height:1.2}.toggle-switch{position:relative;width:44px;height:24px;background:#555;border-radius:12px;cursor:pointer;transition:all 0.3s ease}.toggle-switch::after{content:'';position:absolute;top:2px;left:2px;width:18px;height:18px;background:#e4e4e4;border-radius:50%;transition:all 0.3s cubic-bezier(0.4,0,0.2,1);box-shadow:0 1px 3px rgba(0,0,0,0.3)}.toggle-switch.active{background:#ff0000}.toggle-switch.active::after{transform:translateX(20px)}.toggle-switch:hover{transform:scale(1.05)}.footer{padding:20px 24px;background:#232323;border-top:1px solid #404040;display:flex;gap:10px;justify-content:flex-end}.btn{padding:10px 20px;border:none;border-radius:8px;font-size:13px;font-weight:600;cursor:pointer;transition:all 0.3s ease;text-transform:uppercase;letter-spacing:0.3px;outline:none;position:relative;overflow:hidden}.btn::before{content:'';position:absolute;top:50%;left:50%;width:0;height:0;background:rgba(255,255,255,0.1);border-radius:50%;transform:translate(-50%,-50%);transition:width 0.5s,height 0.5s}.btn:hover::before{width:300px;height:300px}.btn-primary{background:linear-gradient(135deg,#ff0000,#cc0000);color:white;box-shadow:0 2px 8px rgba(255,0,0,0.3)}.btn-primary:hover{transform:translateY(-1px);box-shadow:0 4px 12px rgba(255,0,0,0.4)}.btn-secondary{background:#404040;color:#e4e4e4;border:1px solid #555}.btn-secondary:hover{background:#4a4a4a;border-color:#666}@media(max-width:600px){.modal{width:95vw;margin:20px}.header,.content,.footer{padding:16px}.input-row{flex-direction:column;align-items:stretch}.footer{flex-direction:column}.btn{width:100%}}</style><div class="header"><h1>YouTube Filters</h1><p>Customize your video filtering experience</p></div><div class="content"><div class="setting-card"><div class="card-header"><div class="card-icon">⏱️</div><div><h3 class="card-title">Age Filter</h3><p class="card-description">Hide videos older than your specified threshold</p></div></div><div class="form-group"><div class="input-row"><input type="number" class="input-field" id="age-threshold" value="${AGE_THRESHOLD.value}" min="0" placeholder="Enter threshold"><select class="select-field" id="age-unit"><option value="minutes"${AGE_THRESHOLD.unit==='minutes'?' selected':''}>Minutes</option><option value="hours"${AGE_THRESHOLD.unit==='hours'?' selected':''}>Hours</option><option value="days"${AGE_THRESHOLD.unit==='days'?' selected':''}>Days</option><option value="weeks"${AGE_THRESHOLD.unit==='weeks'?' selected':''}>Weeks</option><option value="months"${AGE_THRESHOLD.unit==='months'?' selected':''}>Months</option><option value="years"${AGE_THRESHOLD.unit==='years'?' selected':''}>Years</option></select></div></div></div><div class="setting-card"><div class="card-header"><div class="card-icon">🎬</div><div><h3 class="card-title">Content Filters</h3><p class="card-description">Control what types of content to filter out</p></div></div><div class="form-group"><div class="toggle-container"><div><label class="toggle-label" for="members-only-toggle">Members-only videos</label><p class="toggle-description">Hide videos that require channel membership</p></div><div class="toggle-switch${MEMBERS_ONLY_ENABLED?' active':''}" id="members-only-toggle" tabindex="0" role="switch" aria-checked="${MEMBERS_ONLY_ENABLED}"></div></div></div></div><div class="setting-card"><div class="card-header"><div class="card-icon">🔧</div><div><h3 class="card-title">Advanced Settings</h3><p class="card-description">Developer options and debugging tools</p></div></div><div class="form-group"><div class="toggle-container"><div><label class="toggle-label" for="debug-toggle">Debug logging</label><p class="toggle-description">Enable detailed logging for troubleshooting</p></div><div class="toggle-switch${DEBUG_ENABLED?' active':''}" id="debug-toggle" tabindex="0" role="switch" aria-checked="${DEBUG_ENABLED}"></div></div></div></div></div><div class="footer"><button class="btn btn-secondary" id="close-settings">Cancel</button><button class="btn btn-primary" id="save-settings">Save Changes</button></div>`;

    overlay.appendChild(modal);
    document.body.appendChild(overlay);

    // Toggle switches with keyboard support
    const membersToggle = document.getElementById('members-only-toggle');
    const debugToggle = document.getElementById('debug-toggle');

    membersToggle.addEventListener('click', () => handleToggle(membersToggle));
    membersToggle.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        handleToggle(membersToggle);
      }
    });

    debugToggle.addEventListener('click', () => handleToggle(debugToggle));
    debugToggle.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        handleToggle(debugToggle);
      }
    });

    document.getElementById('save-settings').addEventListener('click', () => {
      const thresholdValue = parseFloat(document.getElementById('age-threshold').value);
      const thresholdUnit = document.getElementById('age-unit').value;
      AGE_THRESHOLD = { value: thresholdValue, unit: thresholdUnit };
      GM_setValue('AGE_THRESHOLD', AGE_THRESHOLD);

      MEMBERS_ONLY_ENABLED = membersToggle.classList.contains('active');
      GM_setValue('MEMBERS_ONLY_ENABLED', MEMBERS_ONLY_ENABLED);

      DEBUG_ENABLED = debugToggle.classList.contains('active');
      GM_setValue('DEBUG_ENABLED', DEBUG_ENABLED);

      // Update logger if debug changed
      if (logger.debug !== DEBUG_ENABLED) {
        logger.debug = DEBUG_ENABLED;
      }

      closeModal();
    });

    document.getElementById('close-settings').addEventListener('click', closeModal);
    overlay.addEventListener('click', event => {
      if (event.target === overlay) closeModal();
    });

    function closeModal() {
      modal.style.animation = 'modalSlideIn 0.3s ease reverse';
      overlay.style.animation = 'overlayFadeIn 0.3s ease reverse';
      setTimeout(() => overlay.remove(), 300);
    }
  }

  GM_registerMenuCommand('Open YouTube Filters Settings', openSettingsMenu);

})();
