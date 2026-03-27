// ==UserScript==
// @name          YouTube - Resumer
// @version       2.3.0
// @description   Automatically saves and resumes YouTube videos from where you left off, with playlist, Shorts, and preview handling, plus automatic cleanup.
// @author        Journey Over
// @license       MIT
// @match         *://*.youtube.com/*
// @match         *://*.youtube-nocookie.com/*
// @require       https://cdn.jsdelivr.net/gh/StylusThemes/Userscripts@0171b6b6f24caea737beafbc2a8dacd220b729d8/libs/utils/utils.min.js
// @grant         GM_setValue
// @grant         GM_getValue
// @grant         GM_deleteValue
// @grant         GM_listValues
// @grant         GM_addValueChangeListener
// @icon          https://www.google.com/s2/favicons?sz=64&domain=youtube.com
// @homepageURL   https://github.com/StylusThemes/Userscripts
// @downloadURL   https://github.com/StylusThemes/Userscripts/raw/main/userscripts/youtube-resumer.user.js
// @updateURL     https://github.com/StylusThemes/Userscripts/raw/main/userscripts/youtube-resumer.user.js
// ==/UserScript==

(function() {
  'use strict';

  const logger = Logger('YT - Resumer', { debug: false });

  const CONFIG = {
    MIN_SEEK_DIFFERENCE: 1.5,
    SEEK_VERIFY_DELAY_MS: 250,
    RESUME_SETTLE_DELAY_MS: 200,
    PLAYER_READY_POLL_MS: 100,
    PLAYER_READY_MAX_ATTEMPTS: 20,
    SAVE_THROTTLE_MS: 1000,
    SEEK_TIMEOUT_MS: 2000,
    CLEANUP_INTERVAL_MS: 5 * 60 * 1000,
    PREVIEW_VISIBILITY_THRESHOLD: 0.5,
    RETENTION_DAYS: { regular: 90, short: 1, preview: 10 / (24 * 60) },
  };

  const STORAGE_KEY = 'yt_resumer_storage';
  const SEEK_LOCK_PROP = '_ytResumerSeekPending';
  const REMOTE_UPDATE_EVENT = 'yt-resumer-remote-update';
  const SEEK_RELEASE_EVENTS = ['seeked', 'abort', 'emptied', 'error'];

  let activeAbortController = null;
  let activeVideoContext = { videoId: null, playlistId: null };
  let previousPlaylistId = null;

  // ── Utilities ──

  const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

  const formatTime = seconds => {
    const total = Math.floor(seconds);
    const hours = String(Math.floor(total / 3600)).padStart(2, '0');
    const minutes = String(Math.floor((total % 3600) / 60)).padStart(2, '0');
    const secs = String(total % 60).padStart(2, '0');
    return `${seconds.toFixed(2)}s (${hours}:${minutes}:${secs})`;
  };

  // ── Storage ──

  const Storage = {
    read() {
      return GM_getValue(STORAGE_KEY) || { videos: {}, playlists: {}, meta: {} };
    },

    write(data) {
      GM_setValue(STORAGE_KEY, data);
    },

    saveProgress(videoId, currentTime, videoType, playlistId) {
      if (!currentTime || currentTime < 1) return;

      try {
        const data = this.read();

        if (playlistId) {
          data.playlists[playlistId] = data.playlists[playlistId] || { lastWatchedVideoId: '', videos: {} };
          data.playlists[playlistId].videos[videoId] = { timestamp: currentTime, lastUpdated: Date.now(), videoType };
          data.playlists[playlistId].lastWatchedVideoId = videoId;
        } else {
          data.videos[videoId] = { timestamp: currentTime, lastUpdated: Date.now(), videoType };
        }

        this.write(data);
      } catch (error) {
        logger.error('Failed to save progress', error);
      }
    },

    getResumeInfo(videoId, playlistId) {
      const data = this.read();

      if (playlistId) {
        const playlistData = data.playlists[playlistId];
        if (!playlistData?.videos) return null;

        let targetVideoId = videoId;
        const lastWatchedId = playlistData.lastWatchedVideoId;
        if (playlistId !== previousPlaylistId && lastWatchedId && videoId !== lastWatchedId) {
          targetVideoId = lastWatchedId;
        }

        const timestamp = playlistData.videos[targetVideoId]?.timestamp;
        return timestamp ? { targetVideoId, timestamp, inPlaylist: true } : null;
      }

      const timestamp = data.videos[videoId]?.timestamp;
      return timestamp ? { targetVideoId: videoId, timestamp, inPlaylist: false } : null;
    },

    cleanup() {
      const data = this.read();
      const now = Date.now();

      for (const videoId of Object.keys(data.videos)) {
        if (this._isExpired(data.videos[videoId], now)) delete data.videos[videoId];
      }

      for (const playlistId of Object.keys(data.playlists)) {
        const playlist = data.playlists[playlistId];
        for (const videoId of Object.keys(playlist.videos)) {
          if (this._isExpired(playlist.videos[videoId], now)) delete playlist.videos[videoId];
        }
        if (Object.keys(playlist.videos).length === 0) delete data.playlists[playlistId];
      }

      this.write(data);
    },

    runPeriodicCleanup() {
      const data = this.read();
      const lastCleanup = data.meta.lastCleanup || 0;
      if (Date.now() - lastCleanup < CONFIG.CLEANUP_INTERVAL_MS) return;

      data.meta.lastCleanup = Date.now();
      this.write(data);
      logger('Running scheduled cleanup');
      this.cleanup();
    },

    _isExpired(entry, now) {
      if (!entry?.lastUpdated) return true;
      const daysToKeep = CONFIG.RETENTION_DAYS[entry.videoType] ?? CONFIG.RETENTION_DAYS.regular;
      return now - entry.lastUpdated > daysToKeep * 86_400_000;
    },
  };

  // ── Seeking ──

  async function waitForPlayerReady(player) {
    let attempts = 0;
    while (typeof player.getPlayerState !== 'function' || player.getPlayerState() === -1) {
      if (attempts++ > CONFIG.PLAYER_READY_MAX_ATTEMPTS) return;
      await wait(CONFIG.PLAYER_READY_POLL_MS);
    }
  }

  async function seekVideo(player, videoElement, time) {
    if (!player || !videoElement || isNaN(time)) return;
    if (Math.abs(player.getCurrentTime() - time) < CONFIG.MIN_SEEK_DIFFERENCE) return;

    await waitForPlayerReady(player);

    logger.debug('Seeking video', { currentTime: player.getCurrentTime(), targetTime: time });

    if (videoElement.seeking && !videoElement[SEEK_LOCK_PROP]) {
      videoElement.addEventListener('seeked', () => {
        setTimeout(() => seekVideo(player, videoElement, time), 0);
      }, { once: true });
      return;
    }

    videoElement[SEEK_LOCK_PROP] = true;

    const releaseLock = () => {
      videoElement[SEEK_LOCK_PROP] = false;
      clearTimeout(fallbackTimer);
      for (const event of SEEK_RELEASE_EVENTS) videoElement.removeEventListener(event, releaseLock);
    };

    for (const event of SEEK_RELEASE_EVENTS) videoElement.addEventListener(event, releaseLock, { once: true });
    const fallbackTimer = setTimeout(releaseLock, CONFIG.SEEK_TIMEOUT_MS);

    player.seekTo(time, true, { skipBufferingCheck: window.location.pathname === '/' });

    // YouTube often resets to 0 shortly after load; verify and re-seek if needed
    await wait(CONFIG.SEEK_VERIFY_DELAY_MS);

    if (player.getCurrentTime() < 1 && time > CONFIG.MIN_SEEK_DIFFERENCE) {
      logger.debug('Detected reset to 0, re-seeking...');
      player.seekTo(time, true);
    }
  }

  // ── Playlist Resolution ──

  function waitForPlaylist(player) {
    logger.debug('Waiting for playlist data');

    return new Promise((resolve, reject) => {
      const existing = player.getPlaylist();
      if (existing?.length) return resolve(existing);

      let settled = false;
      let pollTimer = null;
      let pollAttempts = 0;

      const cleanup = () => {
        document.removeEventListener('yt-playlist-data-updated', check);
        clearInterval(pollTimer);
      };

      const finish = (result) => {
        if (settled) return;
        settled = true;
        cleanup();
        resolve(result);
      };

      const check = () => {
        const playlist = player.getPlaylist();
        if (playlist?.length) finish(playlist);
      };

      document.addEventListener('yt-playlist-data-updated', check, { once: true });

      pollTimer = setInterval(() => {
        check();
        if (!settled && ++pollAttempts > 50) {
          settled = true;
          cleanup();
          reject(new Error('Playlist not found'));
        }
      }, 100);
    });
  }

  // ── Resume ──

  async function resumePlayback(player, videoId, videoElement, playlistId) {
    try {
      const resumeInfo = Storage.getResumeInfo(videoId, playlistId);
      if (!resumeInfo) return;

      logger('Resuming playback', {
        videoId: resumeInfo.targetVideoId,
        resumeTime: formatTime(resumeInfo.timestamp),
        inPlaylist: resumeInfo.inPlaylist,
      });

      if (resumeInfo.inPlaylist && videoId !== resumeInfo.targetVideoId) {
        const playlistVideos = await waitForPlaylist(player);
        const videoIndex = playlistVideos.indexOf(resumeInfo.targetVideoId);
        if (videoIndex !== -1) player.playVideoAt(videoIndex);
      } else {
        await seekVideo(player, videoElement, resumeInfo.timestamp);
      }
    } catch (error) {
      logger.error('Failed to resume playback', error);
    }
  }

  // ── Video Handler ──

  function parseVideoInfo(playerContainer, player) {
    const parameters = new URLSearchParams(window.location.search);
    const videoId = parameters.get('v') || player.getVideoData()?.video_id;
    const rawPlaylistId = parameters.get('list');
    const playlistId = rawPlaylistId !== 'WL' ? rawPlaylistId : null;
    const isPreview = playerContainer.id === 'inline-player';

    let videoType = 'regular';
    if (window.location.pathname.startsWith('/shorts/')) videoType = 'short';
    else if (isPreview) videoType = 'preview';

    return {
      videoId,
      playlistId,
      videoType,
      isPreview,
      isLive: player.getVideoData()?.isLive,
      hasExplicitTime: parameters.has('t'),
    };
  }

  function handleVideo(playerContainer, player, videoElement) {
    if (activeAbortController) activeAbortController.abort();
    activeVideoContext = { videoId: null, playlistId: null };
    activeAbortController = new AbortController();
    const { signal } = activeAbortController;

    const info = parseVideoInfo(playerContainer, player);
    if (!info.videoId) return;

    activeVideoContext = { videoId: info.videoId, playlistId: info.playlistId };

    if (info.isLive || info.hasExplicitTime) {
      previousPlaylistId = info.playlistId;
      return;
    }

    logger.debug('Handling video', { videoId: info.videoId });

    let hasResumed = false;
    let isResuming = false;
    let lastSaveTime = Date.now();

    const attachListeners = () => {
      const attemptResume = () => {
        if (hasResumed || isResuming) return;
        isResuming = true;
        setTimeout(() => {
          resumePlayback(player, info.videoId, videoElement, info.playlistId).then(() => {
            hasResumed = true;
            isResuming = false;
            lastSaveTime = Date.now();
          });
        }, CONFIG.RESUME_SETTLE_DELAY_MS);
      };

      const onTimeUpdate = () => {
        const adPlaying = playerContainer.classList.contains('ad-showing') || playerContainer.classList.contains('ad-interrupting');
        if (adPlaying || isResuming || videoElement[SEEK_LOCK_PROP]) return;

        if (hasResumed) {
          const now = Date.now();
          if (now - lastSaveTime > CONFIG.SAVE_THROTTLE_MS) {
            const videoId = player.getVideoData()?.video_id;
            if (videoId) {
              Storage.saveProgress(videoId, videoElement.currentTime, info.videoType, info.playlistId);
              lastSaveTime = now;
            }
          }
        }
      };

      const onRemoteUpdate = async (event_) => {
        logger.debug('Remote update received', { time: event_.detail.time });
        await seekVideo(player, videoElement, event_.detail.time);
      };

      videoElement.addEventListener('play', attemptResume, { signal, once: true });
      videoElement.addEventListener('timeupdate', onTimeUpdate, { signal });
      window.addEventListener(REMOTE_UPDATE_EVENT, onRemoteUpdate, { signal });
    };

    if (info.isPreview) {
      const observer = new IntersectionObserver((entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting && !signal.aborted) {
            attachListeners();
            observer.disconnect();
          }
        }
      }, { threshold: CONFIG.PREVIEW_VISIBILITY_THRESHOLD });
      observer.observe(playerContainer);
    } else {
      attachListeners();
    }

    previousPlaylistId = info.playlistId;
  }

  // ── Cross-Tab Sync ──

  function onStorageChange(_key, _oldValue, newValue, isRemote) {
    if (!isRemote || !newValue) return;

    logger.debug('Remote storage change detected');

    const { videoId, playlistId } = activeVideoContext;
    let resumeTime;

    if (playlistId) {
      resumeTime = newValue.playlists?.[playlistId]?.videos?.[videoId]?.timestamp;
    } else if (videoId) {
      resumeTime = newValue.videos?.[videoId]?.timestamp;
    }

    if (resumeTime) {
      window.dispatchEvent(new CustomEvent(REMOTE_UPDATE_EVENT, { detail: { time: resumeTime } }));
    }
  }

  // ── Timestamp Link Interception ──

  function interceptTimestampLinks() {
    document.documentElement.addEventListener('click', (event) => {
      if (!(event.target instanceof Element)) return;

      const anchor = event.target.closest('a');
      if (!anchor?.href || !/[?&]t=/.test(anchor.href)) return;

      // Allow native timestamp clicks inside comments and descriptions
      if (anchor.closest('ytd-comments, ytd-text-inline-expander, #description, #content-text')) return;

      if (event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey) return;

      try {
        const url = new URL(anchor.href);
        if (!url.searchParams.has('t')) return;

        logger.debug('Intercepting timestamp link', { originalUrl: anchor.href });
        url.searchParams.delete('t');
        const cleanUrl = url.toString();
        anchor.href = cleanUrl;

        event.preventDefault();
        event.stopImmediatePropagation();
        history.pushState(null, '', cleanUrl);
        window.dispatchEvent(new PopStateEvent('popstate', { state: null }));
      } catch (error) {
        logger('Could not modify link href:', error);
      }
    }, true);
  }

  // ── Bootstrap ──

  function initVideoLoad() {
    const player = document.querySelector('#movie_player');
    if (!player) return;
    const video = player.querySelector('video');
    if (video) handleVideo(player, player.player_ || player, video);
  }

  function onPlayerContainerLoad(event_) {
    const container = event_.target;
    const playerInstance = container?.player_;
    const video = container?.querySelector('video');
    if (playerInstance && video) handleVideo(container, playerInstance, video);
  }

  function init() {
    try {
      logger('Initializing YouTube Resumer');

      window.addEventListener('pagehide', () => {
        activeAbortController?.abort();
        activeVideoContext = { videoId: null, playlistId: null };
      }, true);

      Storage.runPeriodicCleanup();
      setInterval(() => Storage.runPeriodicCleanup(), CONFIG.CLEANUP_INTERVAL_MS);

      GM_addValueChangeListener(STORAGE_KEY, onStorageChange);
      interceptTimestampLinks();

      window.addEventListener('pageshow', () => {
        logger('Handling video load');
        initVideoLoad();
        window.addEventListener('yt-player-updated', onPlayerContainerLoad, true);
      }, { once: true });
    } catch (error) {
      logger.error('Initialization failed', error);
    }
  }

  init();

})();
