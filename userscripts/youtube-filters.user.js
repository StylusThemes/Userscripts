// ==UserScript==
// @name          YouTube - Filters
// @version       2.4.1
// @description   Filter out unwanted content on YouTube to enhance your browsing experience. (Currently is able to filter videos based on age and members-only status)
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
// @downloadURL   https://github.com/StylusThemes/Userscripts/raw/main/userscripts/youtube-filters.user.js
// @updateURL     https://github.com/StylusThemes/Userscripts/raw/main/userscripts/youtube-filters.user.js
// ==/UserScript==

(async function() {
  'use strict';

  // ---------- Constants & Selectors ----------
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
    'a#video-title-link span.yt-core-attributed-string',
    'span.ytp-modern-videowall-still-info-title'
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
    'ytd-reel-video-renderer',
    'a.ytp-modern-videowall-still'
  ];

  const AGE_SELECTORS = [
    'span.inline-metadata-item.style-scope.ytd-video-meta-block',
    'span.yt-content-metadata-view-model__metadata-text',
    'span.ytp-modern-videowall-still-view-count-and-date-info'
  ];

  const MEMBERS_SELECTORS = [
    '.badge.badge-style-type-members-only',
    'badge-shape[aria-label*="Members only" i]',
    '.yt-badge-shape--commerce .yt-badge-shape__text',
    '.yt-badge-shape__text'
  ];

  const MEMBERS_REGEX = /\bmembers\s*[- ]?\s*only\b/i;

  const UI = {
    overlayId: 'ytf-overlay',
    modalId: 'ytf-modal',
    closeButtonId: 'ytf-close-btn'
  };

  const css = '#ytf-overlay{position:fixed;top:0;left:0;width:100vw;height:100vh;background:rgba(0,0,0,0.6);backdrop-filter:blur(2px);z-index:99999;display:flex;align-items:center;justify-content:center;opacity:0;transition:opacity 0.2s ease;font-family:"Roboto","Arial",sans-serif}#ytf-overlay.visible{opacity:1}#ytf-modal{background:#212121;color:#fff;width:400px;border-radius:12px;box-shadow:0 10px 40px rgba(0,0,0,0.5);border:1px solid rgba(255,255,255,0.1);overflow:hidden;transform:scale(0.95);transition:transform 0.2s ease}#ytf-overlay.visible #ytf-modal{transform:scale(1)}.ytf-header{padding:16px 20px;border-bottom:1px solid rgba(255,255,255,0.1);display:flex;justify-content:space-between;align-items:center;background:#181818}.ytf-title{font-size:18px;font-weight:500}.ytf-close{background:none;border:none;color:#aaa;font-size:24px;cursor:pointer;line-height:1;padding:0}.ytf-close:hover{color:#fff}.ytf-body{padding:10px 0;max-height:60vh;overflow-y:auto}.ytf-row{display:flex;justify-content:space-between;align-items:center;padding:12px 20px;border-bottom:1px solid rgba(255,255,255,0.05);transition:background 0.2s}.ytf-row:last-child{border-bottom:none}.ytf-row:hover{background:rgba(255,255,255,0.03)}.ytf-label{font-size:14px;color:#eee}.ytf-switch{position:relative;display:inline-block;width:40px;height:24px}.ytf-switch input{opacity:0;width:0;height:0}.ytf-slider{position:absolute;cursor:pointer;top:0;left:0;right:0;bottom:0;background-color:#444;transition:.4s;border-radius:24px}.ytf-slider:before{position:absolute;content:"";height:18px;width:18px;left:3px;bottom:3px;background-color:white;transition:.4s;border-radius:50%}input:checked+.ytf-slider{background-color:#f00}input:checked+.ytf-slider:before{transform:translateX(16px)}.ytf-input-group{display:flex;gap:8px}.ytf-input,.ytf-select{background:#333;color:#fff;border:1px solid #555;padding:4px 8px;border-radius:4px;font-size:13px;outline:none}.ytf-input:focus,.ytf-select:focus{border-color:#f00}.ytf-input{width:60px}.ytf-footer{padding:16px 20px;border-top:1px solid rgba(255,255,255,0.1);display:flex;justify-content:flex-end;gap:12px;background:#181818}.ytf-btn{padding:8px 16px;border:none;border-radius:6px;font-size:14px;font-weight:500;cursor:pointer;transition:background 0.2s;color:#fff}.ytf-btn-secondary{background:#444}.ytf-btn-secondary:hover{background:#555}.ytf-btn-primary{background:#f00}.ytf-btn-primary:hover{background:#d00}';

  // ---------- Settings State ----------
  const DEBUG_ENABLED = GM_getValue('DEBUG_ENABLED', false);
  const logger = Logger('YT - Filters', { debug: DEBUG_ENABLED });
  const AGE_THRESHOLD = GM_getValue('AGE_THRESHOLD', { value: 4, unit: 'years' });
  const MEMBERS_ONLY_ENABLED = GM_getValue('MEMBERS_ONLY_ENABLED', false);
  const AGE_FILTERING_ENABLED = GM_getValue('AGE_FILTERING_ENABLED', true);
  const processedVideos = new WeakSet();

  // ---------- Utility Functions ----------
  function injectStyle(styleText) {
    const styleElement = document.createElement('style');
    styleElement.textContent = styleText;
    document.head.appendChild(styleElement);
  }

  function createElement(tagName, className, textContent) {
    const element = document.createElement(tagName);
    if (className) element.className = className;
    if (typeof textContent === 'string') element.textContent = textContent;
    return element;
  }

  function convertToYears(value, unit) {
    const conversions = { minutes: 525600, hours: 8760, days: 365, weeks: 52, months: 12, years: 1 };
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
        // Matches both classic ("2 days ago", "1 month ago") and new abbreviated ("2d ago", "1mo ago") formats
        const ageMatch = ageText.match(/(\d+)\s*(minute|hour|day|week|month|year|mo|m|h|d|w|y)s?\s+ago/i);

        if (ageMatch) {
          const ageValue = parseInt(ageMatch[1], 10);
          const rawUnit = ageMatch[2].toLowerCase();

          const unitMapping = {
            m: 'minutes',
            minute: 'minutes',
            h: 'hours',
            hour: 'hours',
            d: 'days',
            day: 'days',
            w: 'weeks',
            week: 'weeks',
            mo: 'months',
            month: 'months',
            y: 'years',
            year: 'years'
          };

          const ageUnit = unitMapping[rawUnit] || 'years';
          const ageInYears = convertToYears(ageValue, ageUnit);
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
    if (badge.classList.contains('badge-style-type-members-only')) return true;
    const label = badge.getAttribute('aria-label') || badge.textContent || '';
    return MEMBERS_REGEX.test(label);
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
          if (AGE_FILTERING_ENABLED && !window.location.href.includes('@')) {
            filterVideoByAge(videoElement);
          }
        }
        if (MEMBERS_ONLY_ENABLED) pruneMembersShelf();
      } catch (error) {
        logger.error(error);
      }
      await new Promise(resolve => setTimeout(resolve, 50));
    }
  }

  function observeMembersOnly() {
    // Use MutationObserver to detect newly added members-only badges and remove them
    // Also listen to YouTube's custom events for page changes to rescan content
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

  // ---------- Settings UI ----------
  function removeSettingsModal() {
    const overlay = document.getElementById(UI.overlayId);
    if (!overlay) return;
    overlay.classList.remove('visible');
    setTimeout(() => overlay.remove(), 200);
  }

  function createToggleRow(labelText, initialState, onChangeCallback) {
    const row = createElement('div', 'ytf-row');
    const label = createElement('span', 'ytf-label', labelText);
    const switchLabel = createElement('label', 'ytf-switch');

    const input = createElement('input');
    input.type = 'checkbox';
    input.checked = initialState;
    input.addEventListener('change', () => onChangeCallback(input.checked));

    const slider = createElement('span', 'ytf-slider');

    switchLabel.appendChild(input);
    switchLabel.appendChild(slider);
    row.appendChild(label);
    row.appendChild(switchLabel);
    return row;
  }

  function createThresholdRow(initialState, onChangeCallback) {
    const row = createElement('div', 'ytf-row');
    const label = createElement('span', 'ytf-label', 'Age Threshold');
    const group = createElement('div', 'ytf-input-group');

    const input = createElement('input', 'ytf-input');
    input.type = 'number';
    input.min = '0';
    input.value = initialState.value;

    const select = createElement('select', 'ytf-select');
    for (const unit of ['minutes', 'hours', 'days', 'weeks', 'months', 'years']) {
      const opt = createElement('option');
      opt.value = unit;
      opt.textContent = unit.charAt(0).toUpperCase() + unit.slice(1);
      if (initialState.unit === unit) opt.selected = true;
      select.appendChild(opt);
    }

    const handleUpdate = () => {
      onChangeCallback({ value: parseFloat(input.value) || 0, unit: select.value });
    };

    input.addEventListener('change', handleUpdate);
    select.addEventListener('change', handleUpdate);

    group.appendChild(input);
    group.appendChild(select);
    row.appendChild(label);
    row.appendChild(group);
    return row;
  }

  function openSettingsMenu() {
    if (document.getElementById(UI.overlayId)) return;

    let temporaryAgeFilteringEnabled = AGE_FILTERING_ENABLED;
    let temporaryAgeThreshold = { ...AGE_THRESHOLD };
    let temporaryMembersOnlyEnabled = MEMBERS_ONLY_ENABLED;
    let temporaryDebugEnabled = DEBUG_ENABLED;

    const overlay = createElement('div');
    overlay.id = UI.overlayId;
    overlay.addEventListener('click', (event) => {
      if (event.target === overlay) removeSettingsModal();
    });

    const modal = createElement('div');
    modal.id = UI.modalId;

    const header = createElement('div', 'ytf-header');
    const title = createElement('div', 'ytf-title', 'YouTube Filters');
    const closeButton = createElement('button', 'ytf-close', '×');
    closeButton.id = UI.closeButtonId;
    closeButton.type = 'button';
    closeButton.addEventListener('click', removeSettingsModal);

    header.appendChild(title);
    header.appendChild(closeButton);

    const body = createElement('div', 'ytf-body');

    body.appendChild(createToggleRow('Enable Age Filtering', temporaryAgeFilteringEnabled, (checked) => {
      temporaryAgeFilteringEnabled = checked;
    }));

    body.appendChild(createThresholdRow(temporaryAgeThreshold, (newThreshold) => {
      temporaryAgeThreshold = newThreshold;
    }));

    body.appendChild(createToggleRow('Hide Members-only Videos', temporaryMembersOnlyEnabled, (checked) => {
      temporaryMembersOnlyEnabled = checked;
    }));

    body.appendChild(createToggleRow('Debug Logging', temporaryDebugEnabled, (checked) => {
      temporaryDebugEnabled = checked;
    }));

    const footer = createElement('div', 'ytf-footer');

    const cancelButton = createElement('button', 'ytf-btn ytf-btn-secondary', 'Cancel');
    cancelButton.addEventListener('click', removeSettingsModal);

    const saveButton = createElement('button', 'ytf-btn ytf-btn-primary', 'Save & Reload');
    saveButton.addEventListener('click', () => {
      GM_setValue('AGE_FILTERING_ENABLED', temporaryAgeFilteringEnabled);
      GM_setValue('AGE_THRESHOLD', temporaryAgeThreshold);
      GM_setValue('MEMBERS_ONLY_ENABLED', temporaryMembersOnlyEnabled);
      GM_setValue('DEBUG_ENABLED', temporaryDebugEnabled);
      window.location.reload();
    });

    footer.appendChild(cancelButton);
    footer.appendChild(saveButton);

    modal.appendChild(header);
    modal.appendChild(body);
    modal.appendChild(footer);
    overlay.appendChild(modal);
    document.body.appendChild(overlay);

    requestAnimationFrame(() => overlay.classList.add('visible'));
  }

  // ---------- Initialization ----------
  injectStyle(css);
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

  GM_registerMenuCommand('Open YouTube Filters Settings', openSettingsMenu);

})();
