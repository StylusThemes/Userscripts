// ==UserScript==
// @name          YouTube - Resumer
// @version       2.2.3
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

  const MIN_SEEK_DIFFERENCE = 1.5;
  const DAYS_TO_KEEP_REGULAR = 90;
  const DAYS_TO_KEEP_SHORTS = 1;
  const DAYS_TO_KEEP_PREVIEWS = 10 / (24 * 60);
  const CLEANUP_INTERVAL_MS = 5 * 60 * 1000;

  let currentAbortController = null;
  let currentVideoContext = { videoId: null, playlistId: null };
  let lastPlaylistId = null;

  const isExpired = status => {
    if (!status?.lastUpdated) return true;
    let daysToKeep;
    switch (status.videoType) {
      case 'short': {
        daysToKeep = DAYS_TO_KEEP_SHORTS;
        break;
      }
      case 'preview': {
        daysToKeep = DAYS_TO_KEEP_PREVIEWS;
        break;
      }
      default: {
        daysToKeep = DAYS_TO_KEEP_REGULAR;
      }
    }
    return Date.now() - status.lastUpdated > daysToKeep * 86400 * 1000;
  };

  async function getStorage() {
    const storedData = GM_getValue('yt_resumer_storage');
    return storedData || { videos: {}, playlists: {}, meta: {} };
  }

  async function setStorage(storage) {
    GM_setValue('yt_resumer_storage', storage);
  }

  async function seekVideo(player, videoElement, time) {
    if (!player || !videoElement || isNaN(time)) return;
    if (Math.abs(player.getCurrentTime() - time) < MIN_SEEK_DIFFERENCE) return;

    logger.debug('Seeking video', { currentTime: player.getCurrentTime(), targetTime: time });

    const releaseLock = () => {
      if (videoElement._ytAutoResumeSeekPending) videoElement._ytAutoResumeSeekPending = false;
      clearTimeout(seekTimeout);
      for (const event of ['seeked', 'abort', 'emptied', 'error']) {
        videoElement.removeEventListener(event, releaseLock);
      }
    };

    // If the browser is busy seeking, wait for it to finish then try again
    if (videoElement.seeking && !videoElement._ytAutoResumeSeekPending) {
      const retrySeek = () => {
        setTimeout(() => seekVideo(player, videoElement, time), 0);
      };
      videoElement.addEventListener('seeked', retrySeek, { once: true });
      return;
    }

    for (const event of ['seeked', 'abort', 'emptied', 'error']) {
      videoElement.addEventListener(event, releaseLock, { once: true });
    }
    const seekTimeout = setTimeout(releaseLock, 2000);
    videoElement._ytAutoResumeSeekPending = true;

    player.seekTo(time, true, { skipBufferingCheck: window.location.pathname === '/' });
  }

  async function resumePlayback(player, videoId, videoElement, inPlaylist = false, playlistId = '', previousPlaylistId = null) {
    try {
      logger.debug('Attempting to resume playback', { videoId, inPlaylist, playlistId, previousPlaylistId });

      const storage = await getStorage();
      const storedData = inPlaylist ? storage.playlists[playlistId] : storage.videos[videoId];
      if (!storedData) return;

      let targetVideoId = videoId;
      let resumeTime = storedData.timestamp;

      // Handle playlist navigation - resume last watched video if switching playlists
      if (inPlaylist && storedData.videos) {
        const lastWatchedVideoId = storedData.lastWatchedVideoId;
        if (playlistId !== previousPlaylistId && lastWatchedVideoId && videoId !== lastWatchedVideoId) {
          targetVideoId = lastWatchedVideoId;
        }
        resumeTime = storedData.videos?.[targetVideoId]?.timestamp;
      }

      if (resumeTime) {
        logger('Resuming playback', { videoId: targetVideoId, resumeTime, inPlaylist });

        if (inPlaylist && videoId !== targetVideoId) {
          const playlistVideos = await waitForPlaylist(player);
          const videoIndex = playlistVideos.indexOf(targetVideoId);
          if (videoIndex !== -1) player.playVideoAt(videoIndex);
        } else {
          await seekVideo(player, videoElement, resumeTime);
        }
      }
    } catch (error) {
      logger.error('Failed to resume playback', error);
    }
  }

  async function updateStatus(player, videoElement, type, playlistId = '') {
    try {
      const videoId = player.getVideoData()?.video_id;
      if (!videoId) return;

      const currentTime = videoElement.currentTime;
      if (isNaN(currentTime) || currentTime === 0) return;

      logger.debug('Updating status', { videoId, currentTime, type, playlistId });

      const storage = await getStorage();
      if (playlistId) {
        storage.playlists[playlistId] = storage.playlists[playlistId] || { lastWatchedVideoId: '', videos: {} };
        storage.playlists[playlistId].videos[videoId] = {
          timestamp: currentTime,
          lastUpdated: Date.now(),
          videoType: type
        };
        storage.playlists[playlistId].lastWatchedVideoId = videoId;
      } else {
        storage.videos[videoId] = {
          timestamp: currentTime,
          lastUpdated: Date.now(),
          videoType: type
        };
      }

      await setStorage(storage);
    } catch (error) {
      logger.error('Failed to update playback status', error);
    }
  }

  async function handleVideo(playerContainer, player, videoElement, skipResume = false) {
    logger.debug('Handling video load', { videoId: player.getVideoData()?.video_id, skipResume });

    // Cancel any existing listeners from the previous video
    if (currentAbortController) currentAbortController.abort();
    currentVideoContext = { videoId: null, playlistId: null };
    currentAbortController = new AbortController();
    const signal = currentAbortController.signal;

    const urlSearchParameters = new URLSearchParams(window.location.search);
    const videoId = urlSearchParameters.get('v') || player.getVideoData()?.video_id;
    if (!videoId) return;

    // Exclude "Watch Later" playlist (WL) from playlist tracking
    const playlistId = ((rawPlaylistId) => (rawPlaylistId !== 'WL' ? rawPlaylistId : null))(urlSearchParameters.get('list'));
    currentVideoContext = { videoId, playlistId };

    const isLiveStream = player.getVideoData()?.isLive;
    const isPreviewVideo = playerContainer.id === 'inline-player';
    const hasTimeParameter = urlSearchParameters.has('t');

    // Don't resume live streams or videos with explicit timestamps
    if (isLiveStream || hasTimeParameter) {
      lastPlaylistId = playlistId;
      return;
    }

    const videoType = window.location.pathname.startsWith('/shorts/') ? 'short' : isPreviewVideo ? 'preview' : 'regular';
    let hasResumed = false;
    let isResuming = false;
    let lastSaveTime = Date.now();

    const onTimeUpdate = () => {
      const isAdShowing = playerContainer.classList.contains('ad-showing') || playerContainer.classList.contains('ad-interrupting');

      // Do not save progress while an ad is playing, while waiting for the resume jump, or while seeking natively!
      if (isAdShowing || isResuming || videoElement._ytAutoResumeSeekPending) return;

      if (!hasResumed && skipResume) {
        hasResumed = true;
      } else if (!hasResumed) {
        isResuming = true;

        // Wait for the async resume process to completely finish before unlocking
        resumePlayback(player, videoId, videoElement, !!playlistId, playlistId, lastPlaylistId).then(() => {
          hasResumed = true;
          isResuming = false;
          lastSaveTime = Date.now();
        });
      } else if (hasResumed) {
        const now = Date.now();
        if (now - lastSaveTime > 1000) {
          updateStatus(player, videoElement, videoType, playlistId);
          lastSaveTime = now;
        }
      }
    };

    const onRemoteUpdate = async (event_) => {
      logger.debug('Remote update received', { time: event_.detail.time });
      await seekVideo(player, videoElement, event_.detail.time);
    };

    videoElement.addEventListener('timeupdate', onTimeUpdate, { signal });
    window.addEventListener('yt-resumer-remote-update', onRemoteUpdate, { signal });

    lastPlaylistId = playlistId;
  }

  function waitForPlaylist(player) {
    logger.debug('Waiting for playlist data');

    return new Promise((resolve, reject) => {
      const existingPlaylist = player.getPlaylist();
      if (existingPlaylist?.length) {
        logger.debug('Playlist already available', { length: existingPlaylist.length });
        return resolve(existingPlaylist);
      }

      let hasResolved = false;
      let checkInterval = null;

      const cleanup = () => {
        document.removeEventListener('yt-playlist-data-updated', checkPlaylist);
        if (checkInterval) clearInterval(checkInterval);
      };

      const checkPlaylist = () => {
        if (hasResolved) return;
        const playlist = player.getPlaylist();
        if (playlist?.length) {
          logger.debug('Playlist data received', { length: playlist.length });
          hasResolved = true;
          cleanup();
          resolve(playlist);
        }
      };

      // Listen for YouTube's native event
      document.addEventListener('yt-playlist-data-updated', checkPlaylist, { once: true });

      // Fallback polling just in case the event fired before we started listening
      let attempts = 0;
      checkInterval = setInterval(() => {
        checkPlaylist();
        if (!hasResolved && ++attempts > 50) {
          hasResolved = true;
          cleanup();
          reject(new Error('Playlist not found'));
        }
      }, 100);
    });
  }

  function onStorageChange(storageKey, oldStorageValue, newStorageValue, isRemoteChange) {
    if (!isRemoteChange || !newStorageValue) return;

    logger.debug('Storage change detected', { storageKey, isRemoteChange });
    // Sync playback position across tabs for current video
    let resumeTime;
    if (currentVideoContext.playlistId && newStorageValue.playlists?.[currentVideoContext.playlistId]?.videos) {
      resumeTime = newStorageValue.playlists[currentVideoContext.playlistId].videos[currentVideoContext.videoId]?.timestamp;
    } else if (currentVideoContext.videoId && newStorageValue.videos?.[currentVideoContext.videoId]) {
      resumeTime = newStorageValue.videos[currentVideoContext.videoId].timestamp;
    }
    if (resumeTime) {
      window.dispatchEvent(new CustomEvent('yt-resumer-remote-update', { detail: { time: resumeTime } }));
    }
  }

  async function cleanupOldData() {
    try {
      logger.debug('Starting cleanup of old data');

      const storage = await getStorage();
      const videoCleanup = async () => {
        for (const videoId in storage.videos) {
          if (isExpired(storage.videos[videoId])) delete storage.videos[videoId];
        }
      };
      const playlistCleanup = async () => {
        for (const playlistId in storage.playlists) {
          let hasChanged = false;
          const playlist = storage.playlists[playlistId];
          for (const videoId in playlist.videos) {
            if (isExpired(playlist.videos[videoId])) {
              delete playlist.videos[videoId];
              hasChanged = true;
            }
          }
          if (Object.keys(playlist.videos).length === 0) delete storage.playlists[playlistId];
          else if (hasChanged) storage.playlists[playlistId] = playlist;
        }
      };
      await Promise.all([videoCleanup(), playlistCleanup()]);
      await setStorage(storage);
    } catch (error) {
      logger.error(`Failed to clean up stored playback statuses: ${error}`);
    }
  }

  async function periodicCleanup() {
    logger.debug('Checking if periodic cleanup is needed');

    const storage = await getStorage();
    const lastCleanupTime = storage.meta.lastCleanup || 0;
    if (Date.now() - lastCleanupTime < CLEANUP_INTERVAL_MS) return;
    storage.meta.lastCleanup = Date.now();
    await setStorage(storage);
    logger('This tab is handling the scheduled cleanup');
    await cleanupOldData();
  }

  function interceptTimestampLinks() {
    logger.debug('Setting up timestamp link interception');

    document.documentElement.addEventListener('click', (event) => {
      if (!(event.target instanceof Element)) return;
      const anchor = event.target.closest('a');
      if (!anchor || !anchor.href || !/[?&]t=/.test(anchor.href)) return;

      // Allow native timestamp clicks inside comments and descriptions
      if (anchor.closest('ytd-comments, ytd-text-inline-expander, #description, #content-text')) return;

      const isNewTabClick = event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey;
      if (isNewTabClick) return;

      try {
        const url = new URL(anchor.href);
        if (url.searchParams.has('t')) {
          logger.debug('Intercepting timestamp link', { originalUrl: anchor.href });
          url.searchParams.delete('t');
          const newUrl = url.toString();
          anchor.href = newUrl;

          event.preventDefault();
          event.stopImmediatePropagation();
          history.pushState(null, '', newUrl);
          window.dispatchEvent(new PopStateEvent('popstate', { state: null }));
        }
      } catch (error) {
        logger('Could not modify link href:', error);
      }
    }, true);
  }

  async function init() {
    try {
      logger('Initializing YouTube Resumer');

      window.addEventListener('pagehide', () => {
        currentAbortController?.abort();
        currentVideoContext = { videoId: null, playlistId: null };
      }, true);

      await periodicCleanup();
      setInterval(periodicCleanup, CLEANUP_INTERVAL_MS);

      GM_addValueChangeListener('yt_resumer_storage', onStorageChange);

      interceptTimestampLinks();

      logger('This tab is handling the initial load');
      window.addEventListener('pageshow', () => {
        logger('This tab is handling the video load');
        initVideoLoad();
        window.addEventListener('yt-player-updated', onVideoContainerLoad, true);
        // window.addEventListener('yt-autonav-pause-player-ended', () => currentAbortController?.abort(), true);
      }, { once: true });

    } catch (error) { logger.error('Initialization failed', error); }
  }

  function initVideoLoad() {
    logger.debug('Initializing video load');

    const player = document.querySelector('#movie_player');
    if (!player) return;
    const videoElement = player.querySelector('video');
    if (videoElement) handleVideo(player, player.player_ || player, videoElement);
  }

  function onVideoContainerLoad(event_) {
    logger.debug('Video container updated');

    const videoContainer = event_.target;
    const playerInstance = videoContainer?.player_;
    const videoElement = videoContainer?.querySelector('video');
    if (playerInstance && videoElement) handleVideo(videoContainer, playerInstance, videoElement);
  }

  init();

})();
