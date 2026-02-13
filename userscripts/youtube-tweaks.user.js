// ==UserScript==
// @name          YouTube - Tweaks
// @version       1.4.0
// @description   Random tweaks and fixes for YouTube!
// @author        Journey Over
// @license       MIT
// @match         *://*.youtube.com/*
// @match         *://*.youtube-nocookie.com/*
// @require       https://cdn.jsdelivr.net/gh/StylusThemes/Userscripts@0171b6b6f24caea737beafbc2a8dacd220b729d8/libs/utils/utils.min.js
// @grant         GM_getValue
// @grant         GM_setValue
// @grant         GM_registerMenuCommand
// @grant         GM_addStyle
// @icon          https://www.google.com/s2/favicons?sz=64&domain=youtube.com
// @homepageURL   https://github.com/StylusThemes/Userscripts
// @downloadURL   https://github.com/StylusThemes/Userscripts/raw/main/userscripts/youtube-tweaks.user.js
// @updateURL     https://github.com/StylusThemes/Userscripts/raw/main/userscripts/youtube-tweaks.user.js
// ==/UserScript==

(async function() {
  'use strict';

  const logger = Logger('YT - Tweaks', { debug: false });
  const playSingleIconUrl = 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path><polyline points="15,3 21,3 21,9"></polyline><line x1="10" y1="14" x2="21" y2="3"></line></svg>');

  const UI = {
    overlayId: 'ytt-overlay',
    modalId: 'ytt-modal',
    closeButtonId: 'ytt-close-btn',
    buttonSelector: 'button-view-model#button-play-single'
  };

  const css = '#ytt-overlay{position:fixed;top:0;left:0;width:100vw;height:100vh;background:rgba(0,0,0,0.6);backdrop-filter:blur(2px);z-index:99999;display:flex;align-items:center;justify-content:center;opacity:0;transition:opacity 0.2s ease;font-family:"Roboto","Arial",sans-serif}#ytt-overlay.visible{opacity:1}#ytt-modal{background:#212121;color:#fff;width:400px;border-radius:12px;box-shadow:0 10px 40px rgba(0,0,0,0.5);border:1px solid rgba(255,255,255,0.1);overflow:hidden;transform:scale(0.95);transition:transform 0.2s ease}#ytt-overlay.visible #ytt-modal{transform:scale(1)}.ytt-header{padding:16px 20px;border-bottom:1px solid rgba(255,255,255,0.1);display:flex;justify-content:space-between;align-items:center;background:#181818}.ytt-title{font-size:18px;font-weight:500}.ytt-close{background:none;border:none;color:#aaa;font-size:24px;cursor:pointer;line-height:1;padding:0}.ytt-close:hover{color:#fff}.ytt-body{padding:10px 0;max-height:60vh;overflow-y:auto}.ytt-row{display:flex;justify-content:space-between;align-items:center;padding:12px 20px;border-bottom:1px solid rgba(255,255,255,0.05);transition:background 0.2s}.ytt-row:last-child{border-bottom:none}.ytt-row:hover{background:rgba(255,255,255,0.03)}.ytt-label{font-size:14px;color:#eee}.ytt-switch{position:relative;display:inline-block;width:40px;height:24px}.ytt-switch input{opacity:0;width:0;height:0}.ytt-slider{position:absolute;cursor:pointer;top:0;left:0;right:0;bottom:0;background-color:#444;transition:.4s;border-radius:24px}.ytt-slider:before{position:absolute;content:"";height:18px;width:18px;left:3px;bottom:3px;background-color:white;transition:.4s;border-radius:50%}input:checked+.ytt-slider{background-color:#f00}input:checked+.ytt-slider:before{transform:translateX(16px)}.ytt-footer{padding:12px 20px;background:#181818;border-top:1px solid rgba(255,255,255,0.1);text-align:right;font-size:12px;color:#888}';

  const playerEvents = ['loadedmetadata', 'play', 'ratechange', 'seeked', 'timeupdate'];

  function injectStyle(styleText) {
    const styleElement = document.createElement('style');
    styleElement.textContent = styleText;
    document.head.appendChild(styleElement);
  }

  function getFeatureStorageKey(featureId) {
    return `feature_${featureId}`;
  }

  function getFeatureEnabledState(featureId, defaultValue) {
    return GM_getValue(getFeatureStorageKey(featureId), defaultValue);
  }

  function setFeatureEnabledState(featureId, enabled) {
    GM_setValue(getFeatureStorageKey(featureId), enabled);
  }

  function startFeatureInstance(feature, localLogger) {
    if (feature.enabled) return;
    feature.enabled = true;
    try {
      feature.start();
    } catch (error) {
      localLogger.error('Error starting feature', feature.id, error);
    }
  }

  function stopFeatureInstance(feature, localLogger) {
    if (!feature.enabled) return;
    feature.enabled = false;
    try {
      feature.stop();
    } catch (error) {
      localLogger.error('Error stopping feature', feature.id, error);
    }
  }

  function createPlaySingleButtons() {
    if (!location.href.includes('/playlist?')) return;

    for (const renderer of document.querySelectorAll('ytd-playlist-video-renderer')) {
      const anchor = renderer.querySelector('a#thumbnail');
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
      link.className = 'yt-spec-button-shape-next yt-spec-button-shape-next--filled yt-spec-button-shape-next--overlay yt-spec-button-shape-next--size-m yt-spec-button-shape-next--icon-leading yt-spec-button-shape-next--enable-backdrop-filter-experiment';
      link.href = singleUrl;
      link.setAttribute('aria-label', 'Play Single');
      link.style.paddingRight = '0';

      const iconWrapper = document.createElement('div');
      iconWrapper.className = 'yt-spec-button-shape-next__icon';
      iconWrapper.setAttribute('aria-hidden', 'true');

      const icon = document.createElement('img');
      icon.src = playSingleIconUrl;
      icon.style.width = '24px';
      icon.style.height = '24px';

      iconWrapper.appendChild(icon);
      link.appendChild(iconWrapper);
      button.appendChild(link);

      const menu = renderer.querySelector('div#menu');
      if (menu) menu.before(button);
    }
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

  function calculateRms(buffer) {
    let total = 0;
    for (const value of buffer) {
      const normalized = (value - 128) / 128;
      total += normalized * normalized;
    }
    return Math.sqrt(total / buffer.length);
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

  function getTimeContainer() {
    return document.querySelector('.ytp-time-contents') || document.querySelector('.ytp-time-display');
  }

  function handleOpenVideoClick(event, localLogger) {
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
      localLogger.error('openVideosNewTab handler error', error);
    }
  }

  function updateActualTimeDisplay() {
    const video = document.querySelector('.video-stream.html5-main-video');
    if (!video || Number.isNaN(video.duration)) return;

    const timeContainer = getTimeContainer();
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

  function createFeatureManager(featureList) {
    const featuresById = new Map(featureList.map(feature => [feature.id, feature]));

    function forEachFeature(callback) {
      for (const feature of featuresById.values()) callback(feature);
    }

    function init() {
      forEachFeature((feature) => {
        feature.enabled = getFeatureEnabledState(feature.id, feature.default);
        if (feature.enabled) {
          try {
            feature.start();
          } catch (error) {
            logger.error('Error during feature init', feature.id, error);
          }
        }
      });
    }

    function setEnabled(featureId, enabled) {
      const feature = featuresById.get(featureId);
      if (!feature) return;

      setFeatureEnabledState(featureId, enabled);
      if (enabled) startFeatureInstance(feature, logger);
      else stopFeatureInstance(feature, logger);
    }

    function list() {
      return [...featuresById.values()];
    }

    return {
      init,
      list,
      setEnabled
    };
  }

  function createPlaylistPlaySingleFeature() {
    const state = {
      started: false,
      onNavigateFinish: null,
      onAction: null
    };

    return {
      id: 'playlistPlaySingle',
      name: 'Playlist: Play Single Button',
      default: true,
      enabled: false,
      start() {
        if (state.started) return;

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
        state.started = true;
      },
      stop() {
        if (!state.started) return;

        document.removeEventListener('yt-navigate-finish', state.onNavigateFinish);
        document.removeEventListener('yt-action', state.onAction);
        for (const button of document.querySelectorAll(UI.buttonSelector)) button.remove();

        state.onNavigateFinish = null;
        state.onAction = null;
        state.started = false;
      }
    };
  }

  function createOpenVideosNewTabFeature() {
    const state = {
      started: false,
      onClick: null
    };

    return {
      id: 'openVideosNewTab',
      name: 'Open video links in new tab',
      default: true,
      enabled: false,
      start() {
        if (state.started) return;
        state.onClick = event => handleOpenVideoClick(event, logger);
        document.body.addEventListener('click', state.onClick, true);
        state.started = true;
      },
      stop() {
        if (!state.started) return;
        document.body.removeEventListener('click', state.onClick, true);
        state.onClick = null;
        state.started = false;
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
        gain.gain.value = 1;

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

          try {
            splitter.disconnect();
          } catch {}

          try {
            gain.disconnect();
          } catch {}

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

        state.observer = new MutationObserver(() => {
          applyToExistingVideos();
        });
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

  function createElement(tagName, className, textContent) {
    const element = document.createElement(tagName);
    if (className) element.className = className;
    if (typeof textContent === 'string') element.textContent = textContent;
    return element;
  }

  function removeSettingsModal() {
    const overlay = document.getElementById(UI.overlayId);
    if (!overlay) return;

    overlay.classList.remove('visible');
    setTimeout(() => {
      overlay.remove();
    }, 200);
  }

  function createSettingsModal(featureManager) {
    if (document.getElementById(UI.overlayId)) return;

    const overlay = createElement('div');
    overlay.id = UI.overlayId;
    overlay.addEventListener('click', (event) => {
      if (event.target === overlay) removeSettingsModal();
    });

    const modal = createElement('div');
    modal.id = UI.modalId;

    const header = createElement('div', 'ytt-header');
    const title = createElement('div', 'ytt-title', 'YouTube Tweaks');
    const closeButton = createElement('button', 'ytt-close', '×');
    closeButton.id = UI.closeButtonId;
    closeButton.type = 'button';
    closeButton.addEventListener('click', removeSettingsModal);

    header.appendChild(title);
    header.appendChild(closeButton);

    const body = createElement('div', 'ytt-body');

    for (const feature of featureManager.list()) {
      const row = createElement('div', 'ytt-row');
      const label = createElement('span', 'ytt-label', feature.name);
      const switchLabel = createElement('label', 'ytt-switch');

      const input = createElement('input');
      input.type = 'checkbox';
      input.checked = !!feature.enabled;
      input.addEventListener('change', () => {
        featureManager.setEnabled(feature.id, input.checked);
      });

      const slider = createElement('span', 'ytt-slider');

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

    requestAnimationFrame(() => {
      overlay.classList.add('visible');
    });
  }

  injectStyle(css);

  const featureManager = createFeatureManager([
    createPlaylistPlaySingleFeature(),
    createOpenVideosNewTabFeature(),
    createMonoAudioFixFeature(),
    createActualTimeDisplayFeature()
  ]);

  featureManager.init();

  try {
    GM_registerMenuCommand('Open YouTube Tweaks Settings', () => createSettingsModal(featureManager));
  } catch (error) {
    logger.error('Failed to register menu command', error);
  }

})();
