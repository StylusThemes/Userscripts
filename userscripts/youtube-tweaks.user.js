// ==UserScript==
// @name          YouTube - Tweaks
// @version       1.4.2
// @description   Random tweaks and fixes for YouTube!
// @author        Journey Over
// @license       MIT
// @match         *://*.youtube.com/*
// @match         *://*.youtube-nocookie.com/*
// @require       https://cdn.jsdelivr.net/gh/StylusThemes/Userscripts@0171b6b6f24caea737beafbc2a8dacd220b729d8/libs/utils/utils.min.js
// @grant         GM_getValue
// @grant         GM_setValue
// @grant         GM_registerMenuCommand
// @icon          https://www.google.com/s2/favicons?sz=64&domain=youtube.com
// @homepageURL   https://github.com/StylusThemes/Userscripts
// @downloadURL   https://github.com/StylusThemes/Userscripts/raw/main/userscripts/youtube-tweaks.user.js
// @updateURL     https://github.com/StylusThemes/Userscripts/raw/main/userscripts/youtube-tweaks.user.js
// ==/UserScript==

(function() {
  'use strict';

  const logger = Logger('YT - Tweaks', { debug: false });

  // ==========================================
  // 1. CONSTANTS & CONFIGURATION
  // ==========================================
  const UI = {
    overlayId: 'ytt-overlay',
    modalId: 'ytt-modal',
    buttonSelector: 'button-view-model#button-play-single'
  };

  const STYLES = '#ytt-overlay{position:fixed;top:0;left:0;width:100vw;height:100vh;background:rgba(0,0,0,0.6);backdrop-filter:blur(2px);z-index:99999;display:flex;align-items:center;justify-content:center;opacity:0;transition:opacity 0.2s ease;font-family:"Roboto","Arial",sans-serif}#ytt-overlay.visible{opacity:1}#ytt-modal{background:#212121;color:#fff;width:400px;border-radius:12px;box-shadow:0 10px 40px rgba(0,0,0,0.5);border:1px solid rgba(255,255,255,0.1);overflow:hidden;transform:scale(0.95);transition:transform 0.2s ease}#ytt-overlay.visible #ytt-modal{transform:scale(1)}.ytt-header{padding:16px 20px;border-bottom:1px solid rgba(255,255,255,0.1);display:flex;justify-content:space-between;align-items:center;background:#181818}.ytt-title{font-size:18px;font-weight:500}.ytt-close{background:none;border:none;color:#aaa;font-size:24px;cursor:pointer;line-height:1;padding:0}.ytt-close:hover{color:#fff}.ytt-body{padding:10px 0;max-height:60vh;overflow-y:auto}.ytt-row{display:flex;justify-content:space-between;align-items:center;padding:12px 20px;border-bottom:1px solid rgba(255,255,255,0.05);transition:background 0.2s}.ytt-row:last-child{border-bottom:none}.ytt-row:hover{background:rgba(255,255,255,0.03)}.ytt-label{font-size:14px;color:#eee}.ytt-switch{position:relative;display:inline-block;width:40px;height:24px}.ytt-switch input{opacity:0;width:0;height:0}.ytt-slider{position:absolute;cursor:pointer;top:0;left:0;right:0;bottom:0;background-color:#444;transition:.4s;border-radius:24px}.ytt-slider:before{position:absolute;content:"";height:18px;width:18px;left:3px;bottom:3px;background-color:white;transition:.4s;border-radius:50%}input:checked+.ytt-slider{background-color:#f00}input:checked+.ytt-slider:before{transform:translateX(16px)}.ytt-footer{padding:12px 20px;background:#181818;border-top:1px solid rgba(255,255,255,0.1);text-align:right;font-size:12px;color:#888}';

  // ==========================================
  // 2. CORE UTILITIES
  // ==========================================
  const Utilities = {
    injectStyle(styleText) {
      const styleElement = document.createElement('style');
      styleElement.textContent = styleText;
      document.head.appendChild(styleElement);
    },
    createElement(tagName, className, textContent) {
      const element = document.createElement(tagName);
      if (className) element.className = className;
      if (typeof textContent === 'string') element.textContent = textContent;
      return element;
    },
    storage: {
      get(featureId, defaultValue) {
        return GM_getValue(`feature_${featureId}`, defaultValue);
      },
      set(featureId, enabled) {
        GM_setValue(`feature_${featureId}`, enabled);
      }
    }
  };

  // ==========================================
  // 3. MODULE-LEVEL HELPER FUNCTIONS
  // ==========================================

  function calculateRms(buffer) {
    let total = 0;
    for (const value of buffer) {
      const normalized = (value - 128) / 128;
      total += normalized * normalized;
    }
    return Math.sqrt(total / buffer.length);
  }

  function getVideoIdFromUrl(urlString) {
    try {
      const url = new URL(urlString, location.href);
      if (url.pathname.startsWith('/watch')) return url.searchParams.get('v');
      if (url.pathname.startsWith('/shorts/')) return url.pathname.split('/')[2] || null;
    } catch {
      return null;
    }
    return null;
  }

  function formatDuration(seconds) {
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);

    const dayPrefix = days > 0 ? `${days}:` : '';
    const hourText = String(hours).padStart(2, '0');
    const minuteText = String(minutes).padStart(2, '0');
    const secondText = String(secs).padStart(2, '0');
    return `${dayPrefix}${hourText}:${minuteText}:${secondText}`;
  }

  function expandSearchTimeText(text) {
    const match = text.match(/^(\d+)\s*(s|m|h|d|w|mo|y)\s*ago$/i);
    if (!match) return text;

    const value = parseInt(match[1], 10);
    const unitLetter = match[2].toLowerCase();
    let unit = '';

    switch (unitLetter) {
      case 's': { unit = 'second'; break; }
      case 'm': { unit = 'minute'; break; }
      case 'h': { unit = 'hour'; break; }
      case 'd': { unit = 'day'; break; }
      case 'w': { unit = 'week'; break; }
      case 'mo': { unit = 'month'; break; }
      case 'y': { unit = 'year'; break; }
      default: { return text; }
    }

    if (value !== 1) unit += 's';
    return value + ' ' + unit + ' ago';
  }

  function createPlaySingleButtons() {
    if (!location.href.includes('/playlist?')) return;

    const renderers = document.querySelectorAll('ytd-playlist-video-renderer, yt-lockup-view-model');

    for (const renderer of renderers) {
      const anchor = renderer.querySelector('a#thumbnail, a.ytLockupViewModelContentImage');
      if (!anchor) continue;

      const href = anchor.getAttribute('href') || '';
      const parts = href.split('&list=');
      if (parts.length <= 1) continue;

      const singleUrl = parts[0];
      let button = renderer.querySelector(UI.buttonSelector);

      if (button) {
        const link = button.querySelector('a');
        if (link && link.getAttribute('href') !== singleUrl) link.setAttribute('href', singleUrl);
        continue;
      }

      button = document.createElement('button-view-model');
      button.className = 'yt-spec-button-view-model';
      button.id = 'button-play-single';

      const link = document.createElement('a');
      link.className = 'yt-spec-button-shape-next yt-spec-button-shape-next--text yt-spec-button-shape-next--mono yt-spec-button-shape-next--size-m yt-spec-button-shape-next--icon-only-default';
      link.href = singleUrl;
      link.setAttribute('aria-label', 'Play Single');

      const iconWrapper = document.createElement('div');
      iconWrapper.className = 'yt-spec-button-shape-next__icon';
      iconWrapper.setAttribute('aria-hidden', 'true');

      const svgNS = 'http://www.w3.org/2000/svg';
      const svg = document.createElementNS(svgNS, 'svg');
      svg.setAttribute('width', '24');
      svg.setAttribute('height', '24');
      svg.setAttribute('viewBox', '0 0 24 24');
      svg.setAttribute('fill', 'none');
      svg.setAttribute('stroke', 'currentColor');
      svg.setAttribute('stroke-width', '2');
      svg.setAttribute('stroke-linecap', 'round');
      svg.setAttribute('stroke-linejoin', 'round');

      const path = document.createElementNS(svgNS, 'path');
      path.setAttribute('d', 'M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6');
      svg.appendChild(path);

      const polyline = document.createElementNS(svgNS, 'polyline');
      polyline.setAttribute('points', '15,3 21,3 21,9');
      svg.appendChild(polyline);

      const line = document.createElementNS(svgNS, 'line');
      line.setAttribute('x1', '10');
      line.setAttribute('y1', '14');
      line.setAttribute('x2', '21');
      line.setAttribute('y2', '3');
      svg.appendChild(line);

      const svgContainer = document.createElement('div');
      svgContainer.style.width = '24px';
      svgContainer.style.height = '24px';
      svgContainer.style.display = 'flex';
      svgContainer.style.alignItems = 'center';
      svgContainer.style.justifyContent = 'center';
      svgContainer.appendChild(svg);

      iconWrapper.appendChild(svgContainer);
      link.appendChild(iconWrapper);
      button.appendChild(link);

      const oldMenu = renderer.querySelector('div#menu');
      const newMenuContainer = renderer.querySelector('.ytLockupMetadataViewModelMenuButton');

      if (newMenuContainer) {
        newMenuContainer.style.display = 'flex';
        newMenuContainer.style.alignItems = 'center';
        newMenuContainer.style.flexDirection = 'row';
        newMenuContainer.style.gap = '8px';
        newMenuContainer.prepend(button);

        const textContainer = renderer.querySelector('.ytLockupMetadataViewModelTextContainer');
        if (textContainer && textContainer.style.paddingRight !== '50px') {
          textContainer.style.paddingRight = '50px';
          textContainer.style.boxSizing = 'border-box';
        }
      } else if (oldMenu) {
        button.style.marginRight = '8px';
        oldMenu.before(button);
      }
    }
  }

  function handleOpenVideoClick(event) {
    try {
      const link = event.target.closest?.('a');
      if (!link?.href || link.target === '_blank' || link.hasAttribute('download')) return;

      let targetUrl;
      try {
        targetUrl = new URL(link.href, location.href);
      } catch {
        return;
      }

      if (!targetUrl.pathname.startsWith('/watch') && !targetUrl.pathname.startsWith('/shorts/')) return;

      const currentId = getVideoIdFromUrl(location.href);
      const targetId = getVideoIdFromUrl(link.href);
      if (currentId && targetId && currentId === targetId) return;
      if (link.closest?.('.html5-video-player') || link.closest?.('#movie_player')) return;

      if (event.button === 0 && !event.ctrlKey && !event.metaKey && !event.shiftKey) {
        event.preventDefault();
        event.stopPropagation();
        window.open(link.href, '_blank');
      }
    } catch (error) {
      logger.error('openVideosNewTab handler error', error);
    }
  }

  function updateActualTimeDisplay() {
    const video = document.querySelector('.video-stream.html5-main-video');
    if (!video || Number.isNaN(video.duration)) return;

    const timeContainer = document.querySelector('.ytp-time-contents') || document.querySelector('.ytp-time-display');
    if (!timeContainer) return;

    const adjustedDuration = video.duration / video.playbackRate;
    const adjustedText = formatDuration(adjustedDuration);
    const rateText = video.playbackRate !== 1 ? ` (${adjustedText} @ ${video.playbackRate}x)` : '';

    let actualSpan = document.querySelector('.ytp-actual-time');
    if (!actualSpan) {
      actualSpan = document.createElement('span');
      actualSpan.className = 'ytp-actual-time';
      timeContainer.appendChild(actualSpan);
    }
    if (actualSpan.textContent !== rateText) actualSpan.textContent = rateText;

    const secondsRemaining = (video.duration - video.currentTime) / video.playbackRate;
    const now = new Date();
    const endDate = new Date(now.getTime() + secondsRemaining * 1000);
    const isDifferentDay = now.getDate() !== endDate.getDate();

    const endText = isDifferentDay ?
      `${endDate.toLocaleDateString([], { month: 'short', day: 'numeric' })} ${endDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` :
      endDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    let endSpan = document.querySelector('.ytp-finish-time');
    if (!endSpan) {
      endSpan = document.createElement('span');
      endSpan.className = 'ytp-finish-time';
      timeContainer.appendChild(endSpan);
    }

    const finishText = ` ends at ${endText}`;
    if (endSpan.textContent !== finishText) endSpan.textContent = finishText;
  }

  function fixLayouts() {
    // PART 1: SIDEBAR / EXPERIMENTAL DESIGN ROWS (WITH TRIANGLE)
    const targetPath = 'M5 4.623v14.755a1.5 1.5 0 002.261 1.294l12.766-7.51L22 12.002l-1.973-1.162L7.26 3.33A1.5 1.5 0 005 4.623Zm2 13.88V5.497L18.056 12 7 18.503Z';
    const paths = document.querySelectorAll('svg path');

    for (const path of paths) {
      if (path.getAttribute('d') === targetPath) {
        const metadataRow = path.closest('.ytContentMetadataViewModelMetadataRow');

        if (metadataRow && !metadataRow.hasAttribute('data-views-fixed')) {
          const hostContainer = metadataRow.closest('.ytContentMetadataViewModelHost');
          if (hostContainer) {
            hostContainer.style.setProperty('display', 'flex', 'important');
            hostContainer.style.setProperty('flex-direction', 'column', 'important');
            hostContainer.style.setProperty('align-items', 'flex-start', 'important');
            hostContainer.style.maxWidth = '100%';
          }

          metadataRow.style.flexWrap = 'nowrap';
          metadataRow.style.overflow = 'visible';
          metadataRow.style.marginTop = '2px';

          const iconWrapper = metadataRow.querySelector('.ytContentMetadataViewModelLeadingIcon');
          if (iconWrapper) iconWrapper.style.display = 'none';

          const countSpan = metadataRow.querySelector('span[aria-label*="view"]');
          if (countSpan) {
            let fullViewText = countSpan.getAttribute('aria-label');
            if (fullViewText) {
              fullViewText = fullViewText.replace(/\s+thousand\s+views/i, 'K views');
              fullViewText = fullViewText.replace(/\s+million\s+views/i, 'M views');
              fullViewText = fullViewText.replace(/\s+billion\s+views/i, 'B views');
              countSpan.textContent = fullViewText;
            } else {
              countSpan.textContent = countSpan.textContent.trim() + ' views';
            }
          }

          const delimiter = metadataRow.querySelector('.ytContentMetadataViewModelDelimiter');
          if (delimiter) delimiter.textContent = ' \u2022 ';

          const timeSpan = metadataRow.querySelector('span[aria-label*="ago"]');
          if (timeSpan) {
            const fullTimeText = timeSpan.getAttribute('aria-label');
            if (fullTimeText) timeSpan.textContent = fullTimeText;
          }

          metadataRow.setAttribute('data-views-fixed', 'true');
        }
      }
    }

    // PART 2: SEARCH RESULTS / CLASSIC LIST ROWS (WITHOUT TRIANGLE)
    const searchItems = document.querySelectorAll('.inline-metadata-item.ytd-video-meta-block:not([data-time-fixed])');

    for (const item of searchItems) {
      const text = item.textContent.trim();
      if (!text) continue;

      if (text.endsWith('ago')) {
        item.textContent = expandSearchTimeText(text);
        item.setAttribute('data-time-fixed', 'true');
      }

      const isCount = /^[0-9\.,]+[KMB]?$/i.test(text);
      if (isCount && !text.includes('view') && !text.endsWith('ago')) {
        item.textContent = text + ' views';
        item.setAttribute('data-time-fixed', 'true');
      }
    }
  }

  function toggleFeature(feature, enable) {
    if (feature.enabled === enable) return;
    feature.enabled = enable;
    try {
      if (enable) feature.start();
      else feature.stop();
    } catch (error) {
      logger.error(`Error ${enable ? 'starting' : 'stopping'} feature`, feature.id, error);
    }
  }

  // ==========================================
  // 4. FEATURE IMPLEMENTATIONS
  // ==========================================

  function createPlaylistPlaySingleFeature() {
    const state = {
      onNavigateFinish: null,
      onAction: null
    };

    return {
      id: 'playlistPlaySingle',
      name: 'Playlist: Play Single Button',
      default: true,
      enabled: false,
      start() {
        if (state.onNavigateFinish) return;

        createPlaySingleButtons();
        state.onNavigateFinish = () => setTimeout(createPlaySingleButtons, 500);
        state.onAction = (event) => {
          const actionName = event?.detail?.actionName;
          if (typeof actionName !== 'string') return;
          if (actionName.includes('yt-append-continuation') || actionName === 'yt-update-playlist-action') {
            setTimeout(createPlaySingleButtons, 100);
          }
        };

        document.addEventListener('yt-navigate-finish', state.onNavigateFinish);
        document.addEventListener('yt-action', state.onAction);
      },
      stop() {
        if (!state.onNavigateFinish) return;

        document.removeEventListener('yt-navigate-finish', state.onNavigateFinish);
        document.removeEventListener('yt-action', state.onAction);
        for (const button of document.querySelectorAll(UI.buttonSelector)) button.remove();

        state.onNavigateFinish = null;
        state.onAction = null;
      }
    };
  }

  function createOpenVideosNewTabFeature() {
    const state = {
      onClick: null
    };

    return {
      id: 'openVideosNewTab',
      name: 'Open video links in new tab',
      default: true,
      enabled: false,
      start() {
        if (state.onClick) return;
        state.onClick = handleOpenVideoClick;
        document.body.addEventListener('click', state.onClick, true);
      },
      stop() {
        if (!state.onClick) return;
        document.body.removeEventListener('click', state.onClick, true);
        state.onClick = null;
      }
    };
  }

  function createMonoAudioFixFeature() {
    const state = {
      observer: null,
      audioContext: null,
      processedVideos: new WeakSet()
    };

    function getAudioContext() {
      if (!state.audioContext) state.audioContext = new(window.AudioContext || window.webkitAudioContext)();
      if (state.audioContext.state === 'suspended') {
        try {
          state.audioContext.resume();
        } catch {}
      }
      return state.audioContext;
    }

    function applyAudioFix(video) {
      if (!video || state.processedVideos.has(video)) return;

      const audioContext = getAudioContext();

      try {
        const source = audioContext.createMediaElementSource(video);
        const splitter = audioContext.createChannelSplitter(2);
        const merger = audioContext.createChannelMerger(2);
        const gain = audioContext.createGain();
        const analyserLeft = audioContext.createAnalyser();
        const analyserRight = audioContext.createAnalyser();

        analyserLeft.fftSize = 32;
        analyserRight.fftSize = 32;

        source.connect(splitter);
        splitter.connect(analyserLeft, 0);
        splitter.connect(analyserRight, 1);
        merger.connect(audioContext.destination);

        state.processedVideos.add(video);

        const monitorChannels = () => {
          const leftData = new Uint8Array(analyserLeft.fftSize);
          const rightData = new Uint8Array(analyserRight.fftSize);

          analyserLeft.getByteTimeDomainData(leftData);
          analyserRight.getByteTimeDomainData(rightData);

          const leftSilent = calculateRms(leftData) < 0.02;
          const rightSilent = calculateRms(rightData) < 0.02;

          try { splitter.disconnect(); } catch {}
          try { gain.disconnect(); } catch {}

          if (leftSilent || rightSilent) {
            splitter.connect(gain, 0);
            splitter.connect(gain, 1);
            gain.connect(merger, 0, 0);
            gain.connect(merger, 0, 1);
          } else {
            splitter.connect(merger, 0, 0);
            splitter.connect(merger, 1, 1);
          }

          if (!video.paused && !video.ended) setTimeout(monitorChannels, 1500);
        };

        monitorChannels();
      } catch {}
    }

    function applyToExistingVideos() {
      for (const video of document.querySelectorAll('video')) applyAudioFix(video);
    }

    return {
      id: 'monoAudioFix',
      name: 'YouTube Mono/One-Ear Audio Fix',
      default: true,
      enabled: false,
      start() {
        if (state.observer) return;

        state.observer = new MutationObserver(applyToExistingVideos);
        state.observer.observe(document.body, { childList: true, subtree: true });

        applyToExistingVideos();
      },
      stop() {
        if (!state.observer) return;
        state.observer.disconnect();
        state.observer = null;
      }
    };
  }

  function createActualTimeDisplayFeature() {
    const playerEvents = ['loadedmetadata', 'play', 'ratechange', 'seeked', 'timeupdate'];

    const state = {
      observer: null,
      video: null,
      updateHandler: null
    };

    function detachVideoListeners() {
      if (!state.video || !state.updateHandler) return;
      for (const eventName of playerEvents) state.video.removeEventListener(eventName, state.updateHandler);
    }

    function attachVideoListeners() {
      const nextVideo = document.querySelector('.video-stream.html5-main-video');
      if (state.video === nextVideo && state.updateHandler) return;

      detachVideoListeners();

      state.video = nextVideo;
      state.updateHandler = updateActualTimeDisplay;

      if (!state.video) return;

      for (const eventName of playerEvents) state.video.addEventListener(eventName, state.updateHandler);
      updateActualTimeDisplay();
    }

    return {
      id: 'actualTimeDisplay',
      name: 'Display Actual Time and End Time',
      default: true,
      enabled: false,
      start() {
        if (state.observer) return;

        state.observer = new MutationObserver(() => {
          if (location.pathname.includes('/watch')) attachVideoListeners();
        });
        state.observer.observe(document.body, { childList: true, subtree: true });

        if (location.pathname.includes('/watch')) attachVideoListeners();
      },
      stop() {
        if (state.observer) {
          state.observer.disconnect();
          state.observer = null;
        }

        detachVideoListeners();
        state.video = null;
        state.updateHandler = null;

        document.querySelector('.ytp-actual-time')?.remove();
        document.querySelector('.ytp-finish-time')?.remove();
      }
    };
  }

  function createLayoutFixFeature() {
    const state = { observer: null };

    return {
      id: 'layoutFix',
      name: 'Fix metadata layout (views, dates, search results)',
      default: true,
      enabled: false,
      start() {
        if (state.observer) return;
        state.observer = new MutationObserver(() => fixLayouts());
        state.observer.observe(document.body, { childList: true, subtree: true });
        fixLayouts();
      },
      stop() {
        if (state.observer) {
          state.observer.disconnect();
          state.observer = null;
        }
      }
    };
  }

  // ==========================================
  // 5. FEATURE MANAGER
  // ==========================================
  function createFeatureManager(featureList) {
    const featuresById = new Map(featureList.map(feature => [feature.id, feature]));

    return {
      init() {
        for (const feature of featuresById.values()) {
          const isEnabled = Utilities.storage.get(feature.id, feature.default);
          toggleFeature(feature, isEnabled);
        }
      },
      list() {
        return [...featuresById.values()];
      },
      setEnabled(featureId, enabled) {
        const feature = featuresById.get(featureId);
        if (!feature) return;
        Utilities.storage.set(featureId, enabled);
        toggleFeature(feature, enabled);
      }
    };
  }

  // ==========================================
  // 6. SETTINGS UI MANAGER
  // ==========================================
  const SettingsUI = {
    removeModal() {
      const overlay = document.getElementById(UI.overlayId);
      if (!overlay) return;

      overlay.classList.remove('visible');
      setTimeout(() => overlay.remove(), 200);
    },

    createModal(featureManager) {
      if (document.getElementById(UI.overlayId)) return;

      const overlay = Utilities.createElement('div');
      overlay.id = UI.overlayId;
      overlay.addEventListener('click', (event) => {
        if (event.target === overlay) this.removeModal();
      });

      const modal = Utilities.createElement('div');
      modal.id = UI.modalId;

      const header = Utilities.createElement('div', 'ytt-header');
      const title = Utilities.createElement('div', 'ytt-title', 'YouTube Tweaks');

      const closeButton = Utilities.createElement('button', 'ytt-close', '×');
      closeButton.type = 'button';
      closeButton.addEventListener('click', () => this.removeModal());

      header.appendChild(title);
      header.appendChild(closeButton);

      const body = Utilities.createElement('div', 'ytt-body');

      for (const feature of featureManager.list()) {
        const row = Utilities.createElement('div', 'ytt-row');
        const label = Utilities.createElement('span', 'ytt-label', feature.name);
        const switchLabel = Utilities.createElement('label', 'ytt-switch');

        const input = Utilities.createElement('input');
        input.type = 'checkbox';
        input.checked = !!feature.enabled;
        input.addEventListener('change', () => {
          featureManager.setEnabled(feature.id, input.checked);
        });

        const slider = Utilities.createElement('span', 'ytt-slider');

        switchLabel.appendChild(input);
        switchLabel.appendChild(slider);
        row.appendChild(label);
        row.appendChild(switchLabel);
        body.appendChild(row);
      }

      modal.appendChild(header);
      modal.appendChild(body);
      overlay.appendChild(modal);
      document.body.appendChild(overlay);

      requestAnimationFrame(() => overlay.classList.add('visible'));
    }
  };

  // ==========================================
  // 7. INITIALIZATION BOOTSTRAP
  // ==========================================
  Utilities.injectStyle(STYLES);

  const featureManager = createFeatureManager([
    createPlaylistPlaySingleFeature(),
    createOpenVideosNewTabFeature(),
    createMonoAudioFixFeature(),
    createActualTimeDisplayFeature(),
    createLayoutFixFeature()
  ]);

  featureManager.init();

  try {
    GM_registerMenuCommand('Open YouTube Tweaks Settings', () => SettingsUI.createModal(featureManager));
  } catch (error) {
    logger.error('Failed to register menu command', error);
  }

})();
