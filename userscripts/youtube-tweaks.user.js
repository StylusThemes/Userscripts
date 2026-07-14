// ==UserScript==
// @name          YouTube - Tweaks
// @version       1.5.0
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

  const STYLES = `#ytt-overlay{position:fixed;inset:0;width:100vw;height:100vh;background:rgba(0,0,0,0.7);backdrop-filter:blur(12px);-webkit-backdrop-filter:blur(12px);z-index:99999;display:flex;align-items:center;justify-content:center;opacity:0;transition:opacity .3s ease;font-family:"Roboto","Arial",sans-serif}#ytt-overlay.visible{opacity:1}#ytt-modal{background:#1a1a1a;color:#fff;width:400px;border-radius:14px;box-shadow:0 24px 80px rgba(0,0,0,.55),0 0 0 1px rgba(255,255,255,.06);overflow:hidden;transform:scale(.94);transition:transform .35s cubic-bezier(.34,1.56,.64,1)}#ytt-overlay.visible #ytt-modal{transform:scale(1)}.ytt-header{padding:20px 20px 16px;position:relative;background:#141414}.ytt-header::after{content:"";position:absolute;bottom:0;left:20px;right:20px;height:1px;background:linear-gradient(90deg,transparent,rgba(255,0,0,.35),transparent)}.ytt-header-top{display:flex;justify-content:space-between;align-items:center}.ytt-title{font-size:14px;font-weight:600;letter-spacing:.8px;text-transform:uppercase;color:rgba(255,255,255,.9)}.ytt-subtitle{font-size:11px;color:rgba(255,255,255,.3);margin-top:3px;letter-spacing:.2px}.ytt-close{background:rgba(255,255,255,.06);border:none;color:rgba(255,255,255,.4);width:28px;height:28px;border-radius:8px;cursor:pointer;display:flex;align-items:center;justify-content:center;font-size:16px;transition:all .2s;line-height:1}.ytt-close:hover{background:rgba(255,255,255,.12);color:#fff}.ytt-body{padding:6px 10px;max-height:60vh;overflow-y:auto}.ytt-body::-webkit-scrollbar{width:4px}.ytt-body::-webkit-scrollbar-track{background:transparent}.ytt-body::-webkit-scrollbar-thumb{background:rgba(255,255,255,.12);border-radius:4px}.ytt-body::-webkit-scrollbar-thumb:hover{background:rgba(255,255,255,.2)}@keyframes ytt-slide-in{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:translateY(0)}}.ytt-card{display:flex;align-items:center;gap:12px;padding:10px 12px;border-radius:10px;transition:background .2s,border-color .2s;margin-bottom:2px;border:1px solid transparent;animation:ytt-slide-in .3s ease both}.ytt-card:hover{background:rgba(255,255,255,.04);border-color:rgba(255,255,255,.06)}.ytt-card-icon{width:34px;height:34px;border-radius:9px;background:rgba(255,255,255,.06);display:flex;align-items:center;justify-content:center;flex-shrink:0;color:rgba(255,255,255,.45);transition:all .25s}.ytt-card.active .ytt-card-icon{background:rgba(255,0,0,.14);color:#ff4444}.ytt-card-info{flex:1;min-width:0}.ytt-card-name{font-size:13px;font-weight:500;color:rgba(255,255,255,.88);line-height:1.3}.ytt-card-desc{font-size:11px;color:rgba(255,255,255,.32);margin-top:1px;line-height:1.3}.ytt-card-control{flex-shrink:0}.ytt-switch{position:relative;display:inline-block;width:38px;height:20px}.ytt-switch input{opacity:0;width:0;height:0;position:absolute}.ytt-slider{position:absolute;cursor:pointer;inset:0;background:rgba(255,255,255,.1);transition:all .25s cubic-bezier(.4,0,.2,1);border-radius:20px}.ytt-slider:before{position:absolute;content:"";height:14px;width:14px;left:3px;bottom:3px;background:#fff;border-radius:50%;transition:all .25s cubic-bezier(.4,0,.2,1);box-shadow:0 1px 3px rgba(0,0,0,.3)}input:checked+.ytt-slider{background:#ff0000;box-shadow:0 0 10px rgba(255,0,0,.3)}input:checked+.ytt-slider:before{transform:translateX(18px)}input:focus-visible+.ytt-slider{outline:2px solid rgba(255,0,0,.5);outline-offset:2px}.ytt-step-inline{display:flex;align-items:center;gap:10px;margin-top:6px}.ytt-step-inline .ytt-sub-label{font-size:11px;color:rgba(255,255,255,.3);white-space:nowrap}.ytt-input-wrap{display:flex;align-items:center;background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.08);border-radius:8px;overflow:hidden}.ytt-input-btn{width:26px;height:26px;border:none;background:transparent;color:rgba(255,255,255,.35);cursor:pointer;display:flex;align-items:center;justify-content:center;font-size:14px;transition:all .15s}.ytt-input-btn:hover{background:rgba(255,255,255,.08);color:#fff}.ytt-input{width:32px;text-align:center;background:transparent;border:none;color:#fff;font-size:12px;font-weight:500;outline:none;padding:0;-moz-appearance:textfield}.ytt-input::-webkit-outer-spin-button,.ytt-input::-webkit-inner-spin-button{-webkit-appearance:none;margin:0}`;

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
    createSvgIcon(elements, size) {
      const ns = 'http://www.w3.org/2000/svg';
      const svg = document.createElementNS(ns, 'svg');
      svg.setAttribute('width', String(size));
      svg.setAttribute('height', String(size));
      svg.setAttribute('viewBox', '0 0 24 24');
      svg.setAttribute('fill', 'none');
      svg.setAttribute('stroke', 'currentColor');
      svg.setAttribute('stroke-width', '2');
      svg.setAttribute('stroke-linecap', 'round');
      svg.setAttribute('stroke-linejoin', 'round');
      for (const [tag, attributes] of elements) {
        const element = document.createElementNS(ns, tag);
        for (const [key, value] of Object.entries(attributes)) element.setAttribute(key, value);
        svg.appendChild(element);
      }
      return svg;
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

    const units = { s: 'second', m: 'minute', h: 'hour', d: 'day', w: 'week', mo: 'month', y: 'year' };
    const unit = units[match[2].toLowerCase()];
    if (!unit) return text;

    const value = parseInt(match[1], 10);
    return value + ' ' + unit + (value !== 1 ? 's' : '') + ' ago';
  }

  function createPlaySingleButtons() {
    const isPlaylistPage = location.pathname === '/playlist';
    if (!isPlaylistPage) {
      for (const button of document.querySelectorAll(UI.buttonSelector)) button.remove();
      return;
    }

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
      const svgWrap = document.createElement('div');
      svgWrap.style.cssText = 'width:24px;height:24px;display:flex;align-items:center;justify-content:center';
      svgWrap.appendChild(Utilities.createSvgIcon([
        ['path', { d: 'M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6' }],
        ['polyline', { points: '15,3 21,3 21,9' }],
        ['line', { x1: '10', y1: '14', x2: '21', y2: '3' }]
      ], 24));
      iconWrapper.appendChild(svgWrap);
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

      const targetUrl = new URL(link.href, location.href);
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

  function createMouseWheelVolumeFeature() {
    const STEP_KEY = 'feature_mouseWheelVolume_step';

    let hideTimeout;
    let volumeIndicator = null;
    let wheelHandler = null;

    function getStep() {
      return parseInt(GM_getValue(STEP_KEY, 5), 10) || 5;
    }

    function getOrCreateIndicator(player) {
      if (!volumeIndicator || !document.getElementById('ytt-vol-indicator')) {
        volumeIndicator = document.createElement('div');
        volumeIndicator.id = 'ytt-vol-indicator';
        volumeIndicator.style.cssText = [
          'position:absolute',
          'top:15%',
          'left:50%',
          'transform:translateX(-50%)',
          'background:rgba(0,0,0,0.65)',
          'color:#fff',
          'font-size:28px',
          'font-weight:500',
          'font-family:Roboto,Arial,sans-serif',
          'padding:10px 24px',
          'border-radius:8px',
          'z-index:99999',
          'pointer-events:none',
          'opacity:0',
          'transition:opacity .15s ease-in-out',
          'text-shadow:0 1px 2px rgba(0,0,0,0.5)',
          'backdrop-filter:blur(2px)'
        ].join(';');
        player.appendChild(volumeIndicator);
      }
      return volumeIndicator;
    }

    function showVolumeUI(player, volume) {
      const indicator = getOrCreateIndicator(player);
      indicator.textContent = Math.round(volume) + '%';
      indicator.style.opacity = '1';
      clearTimeout(hideTimeout);
      hideTimeout = setTimeout(() => { indicator.style.opacity = '0'; }, 1200);
    }

    return {
      id: 'mouseWheelVolume',
      name: 'Mouse Wheel Volume Control',
      default: false,
      enabled: false,
      start() {
        if (wheelHandler) return;
        wheelHandler = (event) => {
          const player = document.getElementById('movie_player');
          if (!player || !player.contains(event.target)) return;

          if (document.fullscreenElement || document.webkitFullscreenElement ||
            player.classList.contains('ytp-fullscreen')) return;
          if (event.target.closest('.ytp-chrome-bottom')) return;
          if (typeof player.getVolume !== 'function' || typeof player.setVolume !== 'function') return;

          event.preventDefault();

          const step = getStep();
          const currentVolume = player.getVolume();
          const newVolume = event.deltaY < 0 ?
            Math.min(100, currentVolume + step) :
            Math.max(0, currentVolume - step);

          if (newVolume !== currentVolume) {
            player.setVolume(newVolume);
            if (typeof player.isMuted === 'function' && player.isMuted() && newVolume > 0) {
              player.unMute();
            }
            showVolumeUI(player, newVolume);
          }
        };
        document.addEventListener('wheel', wheelHandler, { passive: false });
      },
      stop() {
        if (!wheelHandler) return;
        document.removeEventListener('wheel', wheelHandler, { passive: false });
        wheelHandler = null;
        clearTimeout(hideTimeout);
        document.getElementById('ytt-vol-indicator')?.remove();
        volumeIndicator = null;
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
      setTimeout(() => overlay.remove(), 300);
    },

    createModal(featureManager) {
      if (document.getElementById(UI.overlayId)) return;

      const svg = (els) => Utilities.createSvgIcon(els, 18);
      const featureMeta = {
        playlistPlaySingle: {
          desc: 'Adds a play-single button to playlist items',
          icon: svg([['polygon', { points: '5 3 19 12 5 21 5 3' }]])
        },
        openVideosNewTab: {
          desc: 'Opens video links in a new tab',
          icon: svg([
            ['path', { d: 'M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6' }],
            ['polyline', { points: '15 3 21 3 21 9' }],
            ['line', { x1: '10', y1: '14', x2: '21', y2: '3' }]
          ])
        },
        monoAudioFix: {
          desc: 'Fixes mono and one-ear audio issues',
          icon: svg([
            ['path', { d: 'M3 18v-6a9 9 0 0 1 18 0v6' }],
            ['path', { d: 'M21 19a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3zM3 19a2 2 0 0 0 2 2h1a2 2 0 0 0 2-2v-3a2 2 0 0 0-2-2H3z' }]
          ])
        },
        actualTimeDisplay: {
          desc: 'Shows real playback time at current speed',
          icon: svg([
            ['circle', { cx: '12', cy: '12', r: '10' }],
            ['polyline', { points: '12 6 12 12 16 14' }]
          ])
        },
        layoutFix: {
          desc: 'Expands abbreviated metadata in results',
          icon: svg([
            ['rect', { x: '3', y: '3', width: '7', height: '7' }],
            ['rect', { x: '14', y: '3', width: '7', height: '7' }],
            ['rect', { x: '14', y: '14', width: '7', height: '7' }],
            ['rect', { x: '3', y: '14', width: '7', height: '7' }]
          ])
        },
        mouseWheelVolume: {
          desc: 'Scroll over the player to adjust volume',
          icon: svg([
            ['polygon', { points: '11 5 6 9 2 9 2 15 6 15 11 19 11 5' }],
            ['path', { d: 'M15.54 8.46a5 5 0 0 1 0 7.07' }]
          ])
        }
      };

      const overlay = Utilities.createElement('div');
      overlay.id = UI.overlayId;
      overlay.addEventListener('click', (event) => {
        if (event.target === overlay) this.removeModal();
      });

      const modal = Utilities.createElement('div');
      modal.id = UI.modalId;

      const header = Utilities.createElement('div', 'ytt-header');
      const headerTop = Utilities.createElement('div', 'ytt-header-top');
      const title = Utilities.createElement('div', 'ytt-title', 'YouTube Tweaks');
      const closeButton = Utilities.createElement('button', 'ytt-close', '\u00d7');
      closeButton.type = 'button';
      closeButton.addEventListener('click', () => this.removeModal());
      headerTop.appendChild(title);
      headerTop.appendChild(closeButton);
      const subtitle = Utilities.createElement('div', 'ytt-subtitle', 'Customize your viewing experience');
      header.appendChild(headerTop);
      header.appendChild(subtitle);

      const body = Utilities.createElement('div', 'ytt-body');

      for (const [index, feature] of featureManager.list().entries()) {
        const meta = featureMeta[feature.id] || {};
        const card = Utilities.createElement('div', 'ytt-card');
        if (feature.enabled) card.classList.add('active');
        card.style.animationDelay = (index * 40) + 'ms';

        const icon = Utilities.createElement('div', 'ytt-card-icon');
        if (meta.icon) icon.appendChild(meta.icon);
        card.appendChild(icon);

        const info = Utilities.createElement('div', 'ytt-card-info');
        info.appendChild(Utilities.createElement('div', 'ytt-card-name', feature.name));
        info.appendChild(Utilities.createElement('div', 'ytt-card-desc', meta.desc || ''));
        card.appendChild(info);

        if (feature.id === 'mouseWheelVolume') {
          const stepRow = Utilities.createElement('div', 'ytt-step-inline');
          stepRow.appendChild(Utilities.createElement('span', 'ytt-sub-label', 'Step size'));
          const wrap = Utilities.createElement('div', 'ytt-input-wrap');
          const minusButton = Utilities.createElement('button', 'ytt-input-btn', '\u2212');
          minusButton.type = 'button';
          const stepInput = Utilities.createElement('input', 'ytt-input');
          stepInput.type = 'number';
          stepInput.min = '1';
          stepInput.max = '50';
          stepInput.value = GM_getValue('feature_mouseWheelVolume_step', 5);
          const plusButton = Utilities.createElement('button', 'ytt-input-btn', '+');
          plusButton.type = 'button';

          const updateStep = (value) => {
            const clamped = Math.max(1, Math.min(50, parseInt(value, 10) || 5));
            stepInput.value = clamped;
            GM_setValue('feature_mouseWheelVolume_step', clamped);
          };
          stepInput.addEventListener('change', () => updateStep(stepInput.value));
          minusButton.addEventListener('click', () => updateStep(parseInt(stepInput.value, 10) - 1));
          plusButton.addEventListener('click', () => updateStep(parseInt(stepInput.value, 10) + 1));

          wrap.appendChild(minusButton);
          wrap.appendChild(stepInput);
          wrap.appendChild(plusButton);
          stepRow.appendChild(wrap);
          info.appendChild(stepRow);
        }

        const control = Utilities.createElement('div', 'ytt-card-control');
        const switchLabel = Utilities.createElement('label', 'ytt-switch');
        const input = Utilities.createElement('input');
        input.type = 'checkbox';
        input.checked = !!feature.enabled;
        input.addEventListener('change', () => {
          featureManager.setEnabled(feature.id, input.checked);
          card.classList.toggle('active', input.checked);
        });
        const slider = Utilities.createElement('span', 'ytt-slider');
        switchLabel.appendChild(input);
        switchLabel.appendChild(slider);
        control.appendChild(switchLabel);
        card.appendChild(control);

        body.appendChild(card);
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
    createLayoutFixFeature(),
    createMouseWheelVolumeFeature()
  ]);

  featureManager.init();

  try {
    GM_registerMenuCommand('Open YouTube Tweaks Settings', () => SettingsUI.createModal(featureManager));
  } catch (error) {
    logger.error('Failed to register menu command', error);
  }

})();
