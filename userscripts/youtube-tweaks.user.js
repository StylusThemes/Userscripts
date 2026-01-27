// ==UserScript==
// @name          YouTube - Tweaks
// @version       1.3.0
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

(async function() {
  'use strict';

  const logger = Logger('YT - Tweaks', { debug: false });

  const features = {
    removeBigMode: {
      id: 'removeBigMode',
      name: 'Remove YouTube Big Mode update',
      default: true,
      enabled: false,
      mutationObserver: null,
      removeBigModeClasses() {
        const bigModeElements = document.querySelectorAll('.ytp-big-mode');
        for (const bigModeElement of bigModeElements) bigModeElement.classList.remove('ytp-big-mode');
      },
      start() {
        if (this.mutationObserver) return;
        this.removeBigModeClasses();
        this.mutationObserver = new MutationObserver(() => this.removeBigModeClasses());
        this.mutationObserver.observe(document.body, { childList: true, subtree: true, attributes: true });
      },
      stop() {
        if (this.mutationObserver) {
          this.mutationObserver.disconnect();
          this.mutationObserver = null;
        }
      }
    },

    playlistPlaySingle: {
      id: 'playlistPlaySingle',
      name: 'Playlist: Play Single Button',
      default: true,
      enabled: false,
      eventHandlers: {},
      createPlaySingleButtons() {
        if (location.href.indexOf('/playlist?') <= 0) return;
        const playlistVideoRenderers = document.querySelectorAll('ytd-playlist-video-renderer');
        for (const videoRenderer of playlistVideoRenderers) {
          const thumbnailAnchor = videoRenderer.querySelector('a#thumbnail');
          if (!thumbnailAnchor) continue;
          const thumbnailHref = thumbnailAnchor.getAttribute('href') || '';
          const urlParts = thumbnailHref.split('&list=');
          if (urlParts.length <= 1) continue;
          const singlePlayUrl = urlParts[0];

          let playSingleButton = videoRenderer.querySelector('button-view-model#button-play-single');
          if (playSingleButton) { const buttonLink = playSingleButton.querySelector('a'); if (buttonLink) buttonLink.setAttribute('href', singlePlayUrl); continue; }

          playSingleButton = document.createElement('button-view-model');
          playSingleButton.className = 'yt-spec-button-view-model';
          playSingleButton.id = 'button-play-single';
          const buttonLink = document.createElement('a');
          buttonLink.className = 'yt-spec-button-shape-next yt-spec-button-shape-next--filled yt-spec-button-shape-next--overlay yt-spec-button-shape-next--size-m yt-spec-button-shape-next--icon-leading yt-spec-button-shape-next--enable-backdrop-filter-experiment';
          buttonLink.setAttribute('href', singlePlayUrl);
          buttonLink.setAttribute('aria-label', 'Play Single');
          buttonLink.style.paddingRight = '0';
          const iconDiv = document.createElement('div');
          iconDiv.className = 'yt-spec-button-shape-next__icon';
          iconDiv.setAttribute('aria-hidden', 'true');
          const iconImage = document.createElement('img');
          iconImage.setAttribute('src', 'https://static.thenounproject.com/png/open-link-icon-1395731-512.png');
          iconImage.style.width = '24px';
          iconImage.style.height = '24px';
          iconDiv.appendChild(iconImage);
          buttonLink.appendChild(iconDiv);
          playSingleButton.appendChild(buttonLink);
          const menuDiv = videoRenderer.querySelector('div#menu');
          if (menuDiv) menuDiv.before(playSingleButton);
        }
      },
      start() {
        if (this.eventHandlers._started) return;
        this.createPlaySingleButtons();
        this.eventHandlers.handleNavigateFinish = () => this.createPlaySingleButtons();
        this.eventHandlers.handleAction = (event_) => { const detail = event_ && event_.detail; if (detail && detail.actionName && (detail.actionName.indexOf('yt-append-continuation') >= 0 || detail.actionName === 'yt-update-playlist-action')) this.createPlaySingleButtons(); };
        document.addEventListener('yt-navigate-finish', this.eventHandlers.handleNavigateFinish);
        document.addEventListener('yt-action', this.eventHandlers.handleAction);
        this.eventHandlers._started = true;
      },
      stop() {
        if (!this.eventHandlers._started) return;
        document.removeEventListener('yt-navigate-finish', this.eventHandlers.handleNavigateFinish);
        document.removeEventListener('yt-action', this.eventHandlers.handleAction);
        for (const playSingleButton of document.querySelectorAll('button-view-model#button-play-single')) playSingleButton.remove();
        this.eventHandlers = {};
      }
    },

    // Open video links (watch/shorts) in a new tab instead of navigating in the current tab
    openVideosNewTab: {
      id: 'openVideosNewTab',
      name: 'Open video links in new tab',
      default: true,
      enabled: false,
      eventHandlers: {},
      // Extract video id from URL (supports /watch?v= and /shorts/)
      getVideoId(urlStr) {
        try {
          const url = new URL(urlStr, location.href);
          if (url.pathname.startsWith('/watch')) return url.searchParams.get('v');
          if (url.pathname.startsWith('/shorts/')) return url.pathname.split('/')[2] || null;
        } catch (e) {
          return null;
        }
        return null;
      },
      handleClick(event) {
        try {
          const link = event.target.closest && event.target.closest('a');
          if (!link || !link.href) return;

          // If link already opens in a new tab or is a download, respect it
          if (link.target === '_blank' || link.hasAttribute('download')) return;

          // Parse URL and check if it's a video link
          let url;
          try { url = new URL(link.href, location.href); } catch { return; }
          if (!url.pathname.startsWith('/watch') && !url.pathname.startsWith('/shorts/')) return;

          // Allow timestamps/chapters to function normally when they point to the same video
          const currentVideoId = this.getVideoId(location.href);
          const targetVideoId = this.getVideoId(url.href);
          if (currentVideoId && targetVideoId && currentVideoId === targetVideoId) return;

          // Clicks inside the player (up next / endscreen) should behave natively
          if (link.closest && (link.closest('.html5-video-player') || link.closest('#movie_player'))) return;

          // Only intercept plain left-clicks without modifier keys
          if (event.button === 0 && !event.ctrlKey && !event.metaKey && !event.shiftKey) {
            event.preventDefault();
            event.stopPropagation();
            window.open(url.href, '_blank');
          }
        } catch (err) {
          logger.error('openVideosNewTab handler error', err);
        }
      },
      start() {
        if (this.eventHandlers._started) return;
        this.eventHandlers.handleClick = this.handleClick.bind(this);
        document.body.addEventListener('click', this.eventHandlers.handleClick, true);
        this.eventHandlers._started = true;
      },
      stop() {
        if (!this.eventHandlers._started) return;
        document.body.removeEventListener('click', this.eventHandlers.handleClick, true);
        this.eventHandlers = {};
      }
    },

    // Fix for YouTube's mono audio bug where one channel is silent
    monoAudioFix: {
      id: 'monoAudioFix',
      name: 'YouTube Mono/One-Ear Audio Fix',
      default: true,
      enabled: false,
      audioContextInstance: null,
      processedVideoSet: new WeakSet(),
      mutationObserver: null,
      calculateRootMeanSquare(buffer) { return Math.sqrt(buffer.reduce((sum, value) => sum + ((value - 128) / 128) ** 2, 0) / buffer.length); },
      applyAudioFix(video) {
        if (!video || this.processedVideoSet.has(video)) return;
        this.audioContextInstance ||= new(window.AudioContext || window.webkitAudioContext)();
        if (this.audioContextInstance.state === 'suspended') try { this.audioContextInstance.resume(); } catch {}
        try {
          const audioSource = this.audioContextInstance.createMediaElementSource(video);
          const splitter = this.audioContextInstance.createChannelSplitter(2);
          const merger = this.audioContextInstance.createChannelMerger(2);
          const gainNode = this.audioContextInstance.createGain();
          const analyserLeft = this.audioContextInstance.createAnalyser(),
            analyserRight = this.audioContextInstance.createAnalyser();
          for (const analyser of [analyserLeft, analyserRight]) analyser.fftSize = 32;
          gainNode.gain.value = 1;
          audioSource.connect(splitter);
          merger.connect(this.audioContextInstance.destination);
          splitter.connect(analyserLeft, 0);
          splitter.connect(analyserRight, 1);
          this.processedVideoSet.add(video);

          // Detect silent channels and duplicate audio to both channels when mono detected
          const monitorAudioChannels = () => {
            const leftChannelData = new Uint8Array(analyserLeft.fftSize),
              rightChannelData = new Uint8Array(analyserRight.fftSize);
            analyserLeft.getByteTimeDomainData(leftChannelData);
            analyserRight.getByteTimeDomainData(rightChannelData);
            const isLeftChannelSilent = this.calculateRootMeanSquare(leftChannelData) < 0.02,
              isRightChannelSilent = this.calculateRootMeanSquare(rightChannelData) < 0.02;
            try { splitter.disconnect(); } catch {}
            try { gainNode.disconnect(); } catch {}
            if (isLeftChannelSilent || isRightChannelSilent) {
              splitter.connect(gainNode, 0);
              splitter.connect(gainNode, 1);
              gainNode.connect(merger, 0, 0);
              gainNode.connect(merger, 0, 1);
            } else {
              splitter.connect(merger, 0, 0);
              splitter.connect(merger, 1, 1);
            }
            if (!video.paused && !video.ended) setTimeout(monitorAudioChannels, 1500);
          };
          monitorAudioChannels();
        } catch {
          // Some browsers restrict createMediaElementSource if page not allowed
        }
      },
      start() {
        if (this.mutationObserver) return;
        this.mutationObserver = new MutationObserver(() => { for (const video of document.querySelectorAll('video')) this.applyAudioFix(video) });
        this.mutationObserver.observe(document.body, { childList: true, subtree: true });
        for (const video of document.querySelectorAll('video')) this.applyAudioFix(video);
      },
      stop() {
        if (this.mutationObserver) {
          this.mutationObserver.disconnect();
          this.mutationObserver = null;
        }
      }
    },

    actualTimeDisplay: {
      id: 'actualTimeDisplay',
      name: 'Display Actual Time and End Time',
      default: true,
      enabled: false,
      video: null,
      interval: null,
      handleNavigation: null,
      secondsToDHMS(value) {
        const d = Math.floor(value / 86400);
        const h = Math.floor((value % 86400) / 3600);
        const m = Math.floor((value % 3600) / 60);
        const s = Math.floor(value % 60);
        const days = d > 0 ? d + ':' : '';
        const hours = h.toString().padStart(2, '0');
        const minutes = m.toString().padStart(2, '0');
        const seconds = s.toString().padStart(2, '0');
        return `${days}${hours}:${minutes}:${seconds}`;
      },
      updateTimeDisplay() {
        const video = this.video;
        if (!video || isNaN(video.duration)) return;
        const times = document.querySelector('.ytp-time-contents') || document.querySelector('.ytp-time-display');
        const totalAtRate = video.duration / video.playbackRate;
        const actualTime = this.secondsToDHMS(totalAtRate);
        const rateText = video.playbackRate !== 1 ? ` (${actualTime} @ ${video.playbackRate}x)` : '';
        let actualTimeSpan = document.querySelector('.ytp-actual-time');
        if (!actualTimeSpan) {
          actualTimeSpan = document.createElement('span');
          actualTimeSpan.className = 'ytp-actual-time';
          times?.appendChild(actualTimeSpan);
        }
        actualTimeSpan.textContent = rateText;
        const remainingSec = (video.duration - video.currentTime) / video.playbackRate;
        const finishDate = new Date(Date.now() + remainingSec * 1000);
        const showDate = remainingSec >= 10 * 3600;
        let finishText = showDate ?
          finishDate.toLocaleDateString([], { month: 'short', day: 'numeric' }) + ' ' +
          finishDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) :
          finishDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        let finishTimeSpan = document.querySelector('.ytp-finish-time');
        if (!finishTimeSpan) {
          finishTimeSpan = document.createElement('span');
          finishTimeSpan.className = 'ytp-finish-time';
          times?.appendChild(finishTimeSpan);
        }
        finishTimeSpan.textContent = ` ends at ${finishText}`;
      },
      setupVideoListeners() {
        this.video = document.querySelector('.video-stream.html5-main-video');
        if (!this.video) return;
        for (const event of ['loadedmetadata', 'play', 'ratechange', 'seeked', 'timeupdate']) {
          this.video.addEventListener(event, () => this.updateTimeDisplay());
        }
        this.updateTimeDisplay();
      },
      start() {
        this.handleNavigation = () => {
          if (location.pathname !== '/watch') return;
          this.interval = setInterval(() => {
            if (document.querySelector('.video-stream.html5-main-video')) {
              clearInterval(this.interval);
              this.interval = null;
              this.setupVideoListeners();
            }
          }, 100);
        };
        window.addEventListener('yt-navigate-finish', this.handleNavigation);
        if (document.readyState === 'complete') {
          this.handleNavigation();
        } else {
          window.addEventListener('load', this.handleNavigation);
        }
      },
      stop() {
        if (this.handleNavigation) {
          window.removeEventListener('yt-navigate-finish', this.handleNavigation);
          window.removeEventListener('load', this.handleNavigation);
        }
        if (this.interval) {
          clearInterval(this.interval);
          this.interval = null;
        }
        const actualTimeSpan = document.querySelector('.ytp-actual-time');
        if (actualTimeSpan) actualTimeSpan.remove();
        const finishTimeSpan = document.querySelector('.ytp-finish-time');
        if (finishTimeSpan) finishTimeSpan.remove();
      }
    }
  };

  for (const featureName of Object.keys(features)) {
    const featureConfig = features[featureName];
    featureConfig.enabled = GM_getValue(`feature_${featureConfig.id}`, featureConfig.default);
    if (featureConfig.enabled) { try { featureConfig.start(); } catch (error) { logger.error('Error starting', featureConfig.id, error); } }
  }

  let settingsModalElement = null;

  function createSettingsModal() {
    if (settingsModalElement) return settingsModalElement;
    const settingsModal = document.createElement('div');
    settingsModal.id = 'combined-userscript-settings';
    Object.assign(settingsModal.style, { position: 'fixed', zIndex: 999999, left: '50%', top: '50%', transform: 'translate(-50%,-50%)', background: '#111', color: '#fff', padding: '14px', borderRadius: '8px', minWidth: '320px', boxShadow: '0 6px 30px rgba(0,0,0,0.6)' });
    const modalTitle = document.createElement('div');
    modalTitle.textContent = 'YouTube - Tweaks Settings';
    modalTitle.style.fontWeight = '600';
    modalTitle.style.marginBottom = '8px';
    settingsModal.appendChild(modalTitle);
    const featuresContainer = document.createElement('div');
    for (const featureName of Object.keys(features)) {
      const featureConfig = features[featureName];
      const featureSettingRow = document.createElement('label');
      featureSettingRow.style.display = 'flex';
      featureSettingRow.style.alignItems = 'center';
      featureSettingRow.style.gap = '8px';
      featureSettingRow.style.margin = '6px 0';
      const enableCheckbox = document.createElement('input');
      enableCheckbox.type = 'checkbox';
      enableCheckbox.checked = !!featureConfig.enabled;
      enableCheckbox.dataset.feature = featureConfig.id;
      enableCheckbox.addEventListener('change', async () => {
        const newEnabledState = !!enableCheckbox.checked;
        if (newEnabledState === featureConfig.enabled) return;
        featureConfig.enabled = newEnabledState;
        try { GM_setValue(`feature_${featureConfig.id}`, featureConfig.enabled); } catch (error) { logger.error('Failed to save feature state', featureConfig.id, error); }
        try {
          if (featureConfig.enabled) featureConfig.start();
          else featureConfig.stop();
        } catch (error) { logger.error('Error toggling feature', featureConfig.id, error); }
      });
      const featureNameLabel = document.createElement('span');
      featureNameLabel.textContent = featureConfig.name;
      featureSettingRow.appendChild(enableCheckbox);
      featureSettingRow.appendChild(featureNameLabel);
      featuresContainer.appendChild(featureSettingRow);
    }
    settingsModal.appendChild(featuresContainer);
    const modalButtons = document.createElement('div');
    modalButtons.style.display = 'flex';
    modalButtons.style.justifyContent = 'flex-end';
    modalButtons.style.marginTop = '10px';
    const saveSettingsButton = document.createElement('button');
    saveSettingsButton.textContent = 'Save';
    saveSettingsButton.style.marginRight = '8px';
    const closeModalButton = document.createElement('button');
    closeModalButton.textContent = 'Close';
    saveSettingsButton.addEventListener('click', async () => {
      for (const checkboxElement of settingsModal.querySelectorAll('input[type="checkbox"]')) {
        const featureId = checkboxElement.dataset.feature;
        const featureConfig = Object.values(features).find(featureItem => featureItem.id === featureId);
        if (!featureConfig) continue;
        const newEnabledState = !!checkboxElement.checked;
        if (newEnabledState === featureConfig.enabled) continue;
        featureConfig.enabled = newEnabledState;
        GM_setValue(`feature_${featureConfig.id}`, featureConfig.enabled);
        try {
          if (featureConfig.enabled) featureConfig.start();
          else featureConfig.stop();
        } catch (error) {
          logger.error(`Failed to ${featureConfig.enabled ? 'start' : 'stop'} feature ${featureId}:`, error);
        }
      }
      removeSettingsModal();
    });
    closeModalButton.addEventListener('click', removeSettingsModal);
    modalButtons.appendChild(saveSettingsButton);
    modalButtons.appendChild(closeModalButton);
    settingsModal.appendChild(modalButtons);
    settingsModalElement = settingsModal;
    return settingsModalElement;
  }

  function removeSettingsModal() {
    if (!settingsModalElement) return;
    settingsModalElement.remove();
    settingsModalElement = null;
  }

  try {
    GM_registerMenuCommand('Open YouTube Tweaks Settings', () => { const modalElement = createSettingsModal(); if (!document.body.contains(modalElement)) document.body.appendChild(modalElement); });
  } catch (error) { logger.error('Failed to register menu command', error); }

})();
