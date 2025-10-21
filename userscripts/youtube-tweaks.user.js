// ==UserScript==
// @name          YouTube - Tweaks
// @version       1.0.0
// @description   Random tweaks and fixes for YouTube!
// @author        Journey Over
// @license       MIT
// @match         *://*.youtube.com/*
// @match         *://*.youtube-nocookie.com/*
// @require       https://cdn.jsdelivr.net/gh/StylusThemes/Userscripts@807f8f21e147eb4fbbd11173b30334f28665bf69/libs/utils/utils.min.js
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

    dimWatched: {
      id: 'dimWatched',
      name: 'Dim Watched Videos',
      default: true,
      enabled: false,
      DIMMED_CLASS_NAME: 'yt-dimmed',
      DIMMED_OPACITY: 0.1,
      DIMMED_OPACITY_HOVER: 1,
      isUpdatePending: false,
      mutationObserver: null,
      initializeStyles() {
        if (document.getElementById('gm-dimwatched-style')) return;
        const style = document.createElement('style');
        style.id = 'gm-dimwatched-style';
        style.textContent = `
                    ytd-rich-grid-media,
                    ytd-rich-item-renderer,
                    ytd-grid-video-renderer,
                    ytd-playlist-video-renderer,
                    ytd-video-renderer,
                    yt-lockup-view-model {
                        transition: opacity 0.3s ease;
                    }
                    .${this.DIMMED_CLASS_NAME} { opacity: ${this.DIMMED_OPACITY} !important; }
                    .${this.DIMMED_CLASS_NAME}:hover { opacity: ${this.DIMMED_OPACITY_HOVER} !important; }
                `;
        document.head.appendChild(style);
      },
      isVideoWatched(element) {
        return element.querySelector('ytd-thumbnail-overlay-resume-playback-renderer #progress') || element.querySelector('.ytThumbnailOverlayProgressBarHostWatchedProgressBarSegment');
      },
      updateDimmedVideos() {
        const processedVideoElements = new WeakSet();
        const videoRendererSelectors = { grid: ['ytd-rich-item-renderer'], channel: ['ytd-grid-video-renderer'], playlist: ['ytd-playlist-video-renderer'], sidebar: ['yt-lockup-view-model'], search: ['ytd-video-renderer'] };
        for (const [selectorCategory, selectorsForCategory] of Object.entries(videoRendererSelectors)) {
          for (const selector of selectorsForCategory) {
            for (const videoElement of document.querySelectorAll(selector)) {
              if (processedVideoElements.has(videoElement)) continue;

              // Avoid double-dimming nested elements
              if (selectorCategory === 'grid' && videoElement.tagName === 'YTD-RICH-GRID-MEDIA' && videoElement.closest('ytd-rich-item-renderer')?.classList.contains(this.DIMMED_CLASS_NAME)) {
                continue;
              }

              if (selectorCategory === 'sidebar' && videoElement.tagName === 'YT-LOCKUP-VIEW-MODEL' && videoElement.closest('ytd-rich-item-renderer')?.classList.contains(this.DIMMED_CLASS_NAME)) {
                continue;
              }

              processedVideoElements.add(videoElement);
              const watchedIndicator = this.isVideoWatched(videoElement);
              videoElement.classList.toggle(this.DIMMED_CLASS_NAME, !!watchedIndicator);
            }
          }
        }
      },
      debouncedUpdateDimmed() {
        if (this.isUpdatePending) return;
        this.isUpdatePending = true;
        requestAnimationFrame(() => {
          this.updateDimmedVideos();
          this.isUpdatePending = false;
        });
      },
      start() {
        this.initializeStyles();
        if (this.mutationObserver) return;
        this.mutationObserver = new MutationObserver(() => this.debouncedUpdateDimmed());
        this.mutationObserver.observe(document.body, { childList: true, subtree: true });
        this.updateDimmedVideos();
      },
      stop() {
        if (this.mutationObserver) {
          this.mutationObserver.disconnect();
          this.mutationObserver = null;
        }
        for (const videoElement of document.querySelectorAll('.' + this.DIMMED_CLASS_NAME)) videoElement.classList.remove(this.DIMMED_CLASS_NAME);
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
