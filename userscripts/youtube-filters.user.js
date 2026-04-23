// ==UserScript==
// @name          YouTube - Filters
// @version       2.5.3
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
    'span.ytp-modern-videowall-still-info-title',

    // Updated YouTube layout selectors
    'a.ytLockupMetadataViewModelTitle span.ytAttributedStringHost',
    'a.ytLockupMetadataViewModelTitle',
    'h3 .ytLockupMetadataViewModelTitle span.ytAttributedStringHost',
    '.ytLockupViewModelContentImage span.ytAttributedStringHost',
    'span.ytAttributedStringHost[role="text"]',
    'a.shortsLockupViewModelHostOutsideMetadataEndpoint span.ytAttributedStringHost',
    'h3.ytMiniGameCardViewModelTitle'
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
    'a.ytp-modern-videowall-still',

    // Updated YouTube layout selectors
    'ytm-shorts-lockup-view-model',
    'ytm-shorts-lockup-view-model-v2',
    'mini-game-card-view-model'
  ];

  const AGE_SELECTORS = [
    'span.inline-metadata-item.style-scope.ytd-video-meta-block',
    'span.yt-content-metadata-view-model__metadata-text',
    'span.ytp-modern-videowall-still-view-count-and-date-info',

    // Updated YouTube layout selectors
    'span.ytContentMetadataViewModelMetadataText'
  ];

  const MEMBERS_SELECTORS = [
    '.badge.badge-style-type-members-only',
    '.badge.badge-style-type-members-first',
    'badge-shape[aria-label*="Members only" i]',
    'badge-shape[aria-label*="Members first" i]',
    '.yt-badge-shape--commerce .yt-badge-shape__text',
    '.yt-badge-shape__text'
  ];

  const MEMBERS_REGEX = /\bmembers\s*[- ]?\s*(only|first)\b/i;
  const MEMBERS_SHELF_SUBTITLE_REGEX = /videos available to members/i;
  const UNKNOWN_AGE_TEXT = 'Unknown';
  const CHANNEL_HANDLE_SEGMENT = '@';
  const RESCAN_DELAY_MS = 50;
  const YOUTUBE_NAVIGATION_EVENTS = ['yt-navigate-finish', 'yt-page-data-updated'];
  const UNIT_CONFIG = {
    minutes: { factor: 525600, aliases: ['m', 'minute'] },
    hours: { factor: 8760, aliases: ['h', 'hour'] },
    days: { factor: 365, aliases: ['d', 'day'] },
    weeks: { factor: 52, aliases: ['w', 'week'] },
    months: { factor: 12, aliases: ['mo', 'month'] },
    years: { factor: 1, aliases: ['y', 'year'] }
  };

  const AGE_UNIT_ALIASES = Object.entries(UNIT_CONFIG).reduce((aliasMap, [unit, config]) => {
    aliasMap[unit] = unit;
    for (const alias of config.aliases) {
      aliasMap[alias] = unit;
    }
    return aliasMap;
  }, {});

  const AGE_CONVERSIONS = Object.fromEntries(
    Object.entries(UNIT_CONFIG).map(([unit, config]) => [unit, config.factor])
  );

  const AGE_UNITS = Object.keys(UNIT_CONFIG);

  const AGE_TEXT_REGEX = new RegExp(
    `(\\d+)\\s*(${Object.values(UNIT_CONFIG).flatMap(config => config.aliases).join('|')})s?\\s+ago`,
    'i'
  );
  const VIDEO_SELECTOR_QUERY = VIDEO_SELECTORS.join(',');
  const UNPROCESSED_VIDEO_SELECTOR_QUERY = VIDEO_SELECTORS.map(selector => `${selector}:not([data-processed])`).join(',');
  const MEMBERS_SELECTOR_QUERY = MEMBERS_SELECTORS.join(',');
  const SETTINGS_KEYS = {
    debugEnabled: 'DEBUG_ENABLED',
    ageThreshold: 'AGE_THRESHOLD',
    membersOnlyEnabled: 'MEMBERS_ONLY_ENABLED',
    ageFilteringEnabled: 'AGE_FILTERING_ENABLED'
  };

  const UI = {
    overlayId: 'ytf-overlay',
    modalId: 'ytf-modal',
    closeButtonId: 'ytf-close-btn'
  };

  const css = '#ytf-overlay{position:fixed;top:0;left:0;width:100vw;height:100vh;background:rgba(0,0,0,0.6);backdrop-filter:blur(2px);z-index:99999;display:flex;align-items:center;justify-content:center;opacity:0;transition:opacity 0.2s ease;font-family:"Roboto","Arial",sans-serif}#ytf-overlay.visible{opacity:1}#ytf-modal{background:#212121;color:#fff;width:400px;border-radius:12px;box-shadow:0 10px 40px rgba(0,0,0,0.5);border:1px solid rgba(255,255,255,0.1);overflow:hidden;transform:scale(0.95);transition:transform 0.2s ease}#ytf-overlay.visible #ytf-modal{transform:scale(1)}.ytf-header{padding:16px 20px;border-bottom:1px solid rgba(255,255,255,0.1);display:flex;justify-content:space-between;align-items:center;background:#181818}.ytf-title{font-size:18px;font-weight:500}.ytf-close{background:none;border:none;color:#aaa;font-size:24px;cursor:pointer;line-height:1;padding:0}.ytf-close:hover{color:#fff}.ytf-body{padding:10px 0;max-height:60vh;overflow-y:auto}.ytf-row{display:flex;justify-content:space-between;align-items:center;padding:12px 20px;border-bottom:1px solid rgba(255,255,255,0.05);transition:background 0.2s}.ytf-row:last-child{border-bottom:none}.ytf-row:hover{background:rgba(255,255,255,0.03)}.ytf-label{font-size:14px;color:#eee}.ytf-switch{position:relative;display:inline-block;width:40px;height:24px}.ytf-switch input{opacity:0;width:0;height:0}.ytf-slider{position:absolute;cursor:pointer;top:0;left:0;right:0;bottom:0;background-color:#444;transition:.4s;border-radius:24px}.ytf-slider:before{position:absolute;content:"";height:18px;width:18px;left:3px;bottom:3px;background-color:white;transition:.4s;border-radius:50%}input:checked+.ytf-slider{background-color:#f00}input:checked+.ytf-slider:before{transform:translateX(16px)}.ytf-input-group{display:flex;gap:8px}.ytf-input,.ytf-select{background:#333;color:#fff;border:1px solid #555;padding:4px 8px;border-radius:4px;font-size:13px;outline:none}.ytf-input:focus,.ytf-select:focus{border-color:#f00}.ytf-input{width:60px}.ytf-footer{padding:16px 20px;border-top:1px solid rgba(255,255,255,0.1);display:flex;justify-content:flex-end;gap:12px;background:#181818}.ytf-btn{padding:8px 16px;border:none;border-radius:6px;font-size:14px;font-weight:500;cursor:pointer;transition:background 0.2s;color:#fff}.ytf-btn-secondary{background:#444}.ytf-btn-secondary:hover{background:#555}.ytf-btn-primary{background:#f00}.ytf-btn-primary:hover{background:#d00}';

  // ---------- Settings State ----------
  const DEBUG_ENABLED = GM_getValue(SETTINGS_KEYS.debugEnabled, false);
  const logger = Logger('YT - Filters', { debug: DEBUG_ENABLED });
  const AGE_THRESHOLD = GM_getValue(SETTINGS_KEYS.ageThreshold, { value: 4, unit: 'years' });
  const MEMBERS_ONLY_ENABLED = GM_getValue(SETTINGS_KEYS.membersOnlyEnabled, false);
  const AGE_FILTERING_ENABLED = GM_getValue(SETTINGS_KEYS.ageFilteringEnabled, true);

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

  /**
   * Converts a relative age value into years.
   *
   * @param {number} value
   * @param {string} unit
   * @returns {number}
   */
  function convertToYears(value, unit) {
    return value / (AGE_CONVERSIONS[unit] || 1);
  }

  /**
   * Parses a YouTube relative age label into normalized years.
   *
   * @param {string} ageText
   * @returns {{ text: string, years: number } | null}
   */
  function parseAgeText(ageText) {
    if (!/\bago\b/i.test(ageText)) return null;

    const ageMatch = ageText.match(AGE_TEXT_REGEX);
    if (!ageMatch) {
      return { text: ageText, years: 0 };
    }

    const ageValue = parseInt(ageMatch[1], 10);
    const ageUnit = AGE_UNIT_ALIASES[ageMatch[2].toLowerCase()] || 'years';
    return { text: ageText, years: convertToYears(ageValue, ageUnit) };
  }

  function queryAll(root, selectors) {
    return root.querySelectorAll(selectors.join(','));
  }

  // ---------- Video Processing ----------
  /**
   * Returns the first recognized age label for a video.
   *
   * @param {Element} videoElement
   * @returns {{ text: string, years: number }}
   */
  function getVideoAgeTextAndYears(videoElement) {
    for (const ageElement of queryAll(videoElement, AGE_SELECTORS)) {
      const ageText = (ageElement.textContent || '').trim();
      const parsedAge = parseAgeText(ageText);
      if (parsedAge) {
        return parsedAge;
      }
    }
    return { text: UNKNOWN_AGE_TEXT, years: 0 };
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
    const videoContainer = videoElement.closest(VIDEO_SELECTOR_QUERY);
    if (videoContainer) {
      try {
        videoContainer.setAttribute('hidden', 'true');
      } catch {
        videoContainer.style.display = 'none';
      }
    }
    logger.debug(`Hidden "${getVideoTitle(videoElement)}" (${reason})`);
  }

  // ---------- Age Filtering ----------
  function filterVideoByAge(videoElement) {
    const { text: ageText, years: ageYears } = getVideoAgeTextAndYears(videoElement);
    if (ageText === UNKNOWN_AGE_TEXT) return;

    videoElement.dataset.processed = 'true';

    const thresholdInYears = convertToYears(AGE_THRESHOLD.value, AGE_THRESHOLD.unit);
    if (ageYears >= thresholdInYears) {
      hideVideo(videoElement, ageText);
    }
  }

  // ---------- Members-Only Filtering ----------
  /**
   * Detects whether a badge marks Members-only or Members-first content.
   *
   * @param {Element} badge
   * @returns {boolean}
   */
  function isMembersOnlyBadge(badge) {
    if (
      badge.classList.contains('badge-style-type-members-only') ||
      badge.classList.contains('badge-style-type-members-first')
    ) {
      return true;
    }

    const label = badge.getAttribute('aria-label') || badge.textContent || '';
    return MEMBERS_REGEX.test(label);
  }

  function removeMembersOnlyVideo(badge) {
    const videoElement = badge.closest(VIDEO_SELECTOR_QUERY);
    if (videoElement) {
      videoElement.remove();
      logger.debug(`Removed Members-only "${getVideoTitle(videoElement)}"`);
    }
  }

  function pruneMembersShelf(root = document) {
    for (const shelf of root.querySelectorAll('ytd-shelf-renderer')) {
      const title = (shelf.querySelector('#title')?.textContent || '').trim();
      const subtitle = (shelf.querySelector('#subtitle')?.textContent || '').trim();
      if (MEMBERS_REGEX.test(title) || MEMBERS_SHELF_SUBTITLE_REGEX.test(subtitle)) {
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
  function processUnfilteredVideos() {
    try {
      const unprocessedVideos = document.querySelectorAll(UNPROCESSED_VIDEO_SELECTOR_QUERY);
      const shouldFilterAges = AGE_FILTERING_ENABLED && !window.location.href.includes(CHANNEL_HANDLE_SEGMENT);
      for (const videoElement of unprocessedVideos) {
        if (shouldFilterAges) {
          filterVideoByAge(videoElement);
        }
      }
      if (MEMBERS_ONLY_ENABLED) pruneMembersShelf();
    } catch (error) {
      logger.error(error);
    }
  }

  /**
   * Re-runs a scan after YouTube client-side navigation events settle.
   *
   * @param {() => void} callback
   */
  function registerYouTubeRescan(callback) {
    const rescan = () => setTimeout(callback, RESCAN_DELAY_MS);
    for (const eventName of YOUTUBE_NAVIGATION_EVENTS) {
      window.addEventListener(eventName, rescan);
    }
  }

  function observeNewVideos() {
    const observer = new MutationObserver(mutations => {
      for (const mutation of mutations) {
        if (mutation.type !== 'childList') continue;
        for (const node of mutation.addedNodes) {
          if (!(node instanceof Element)) continue;
          if (node.matches(UNPROCESSED_VIDEO_SELECTOR_QUERY) || node.querySelector(UNPROCESSED_VIDEO_SELECTOR_QUERY)) {
            processUnfilteredVideos();
            return;
          }
        }
      }
    });
    observer.observe(document.documentElement, { childList: true, subtree: true });

    registerYouTubeRescan(processUnfilteredVideos);

    processUnfilteredVideos();
  }

  function observeMembersOnly() {
    const observer = new MutationObserver(mutations => {
      for (const mutation of mutations) {
        if (mutation.type === 'childList') {
          for (const node of mutation.addedNodes) {
            if (!(node instanceof Element)) continue;
            if (node.matches(MEMBERS_SELECTOR_QUERY) && isMembersOnlyBadge(node)) {
              removeMembersOnlyVideo(node);
            } else {
              scanForMembersOnly(node);
            }
          }
        }
      }
    });
    observer.observe(document.documentElement, { childList: true, subtree: true });

    registerYouTubeRescan(() => scanForMembersOnly(document));
  }

  // ---------- Settings UI ----------
  function removeSettingsModal() {
    const overlay = document.getElementById(UI.overlayId);
    if (!overlay) return;
    overlay.classList.remove('visible');
    setTimeout(() => overlay.remove(), 200);
  }

  function createToggleRow(labelText, initialState, onChangeCallback) {
    const inputId = `ytf-toggle-${labelText.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
    const row = createElement('div', 'ytf-row');
    const label = createElement('label', 'ytf-label', labelText);
    label.setAttribute('for', inputId);
    const switchLabel = createElement('label', 'ytf-switch');

    const input = createElement('input');
    input.type = 'checkbox';
    input.id = inputId;
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
    const label = createElement('label', 'ytf-label', 'Age Threshold');
    label.setAttribute('for', 'ytf-threshold-value');
    const group = createElement('div', 'ytf-input-group');

    const input = createElement('input', 'ytf-input');
    input.type = 'number';
    input.id = 'ytf-threshold-value';
    input.min = '0';
    input.value = initialState.value;

    const select = createElement('select', 'ytf-select');
    select.id = 'ytf-threshold-unit';
    select.setAttribute('aria-label', 'Age Threshold Unit');
    for (const unit of AGE_UNITS) {
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

  /**
   * Persists settings to userscript storage.
   *
   * @param {{
   *   ageFilteringEnabled: boolean,
   *   ageThreshold: { value: number, unit: string },
   *   membersOnlyEnabled: boolean,
   *   debugEnabled: boolean
   * }} settings
   */
  function saveSettings(settings) {
    GM_setValue(SETTINGS_KEYS.ageFilteringEnabled, settings.ageFilteringEnabled);
    GM_setValue(SETTINGS_KEYS.ageThreshold, settings.ageThreshold);
    GM_setValue(SETTINGS_KEYS.membersOnlyEnabled, settings.membersOnlyEnabled);
    GM_setValue(SETTINGS_KEYS.debugEnabled, settings.debugEnabled);
  }

  function openSettingsMenu() {
    if (document.getElementById(UI.overlayId)) return;

    const draftSettings = {
      ageFilteringEnabled: AGE_FILTERING_ENABLED,
      ageThreshold: { ...AGE_THRESHOLD },
      membersOnlyEnabled: MEMBERS_ONLY_ENABLED,
      debugEnabled: DEBUG_ENABLED
    };

    const overlay = createElement('div');
    overlay.id = UI.overlayId;
    overlay.addEventListener('click', (event) => {
      if (event.target === overlay) removeSettingsModal();
    });

    const modal = createElement('div');
    modal.id = UI.modalId;
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');

    const header = createElement('div', 'ytf-header');
    const title = createElement('div', 'ytf-title', 'YouTube Filters');
    const closeButton = createElement('button', 'ytf-close', '×');
    closeButton.id = UI.closeButtonId;
    closeButton.type = 'button';
    closeButton.setAttribute('aria-label', 'Close');
    closeButton.addEventListener('click', removeSettingsModal);

    header.appendChild(title);
    header.appendChild(closeButton);

    const body = createElement('div', 'ytf-body');

    body.appendChild(createToggleRow('Enable Age Filtering', draftSettings.ageFilteringEnabled, (checked) => {
      draftSettings.ageFilteringEnabled = checked;
    }));

    body.appendChild(createThresholdRow(draftSettings.ageThreshold, (newThreshold) => {
      draftSettings.ageThreshold = newThreshold;
    }));

    body.appendChild(createToggleRow('Hide Members-only Videos', draftSettings.membersOnlyEnabled, (checked) => {
      draftSettings.membersOnlyEnabled = checked;
    }));

    body.appendChild(createToggleRow('Debug Logging', draftSettings.debugEnabled, (checked) => {
      draftSettings.debugEnabled = checked;
    }));

    const footer = createElement('div', 'ytf-footer');

    const cancelButton = createElement('button', 'ytf-btn ytf-btn-secondary', 'Cancel');
    cancelButton.addEventListener('click', removeSettingsModal);

    const saveButton = createElement('button', 'ytf-btn ytf-btn-primary', 'Save & Reload');
    saveButton.addEventListener('click', () => {
      saveSettings(draftSettings);
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
