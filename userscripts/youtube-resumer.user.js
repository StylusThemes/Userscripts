// ==UserScript==
// @name          YouTube - Resumer
// @version       2.0.0
// @description   Automatically saves and resumes YouTube videos from where you left off, with playlist, Shorts, and preview handling, plus automatic cleanup.
// @author        Journey Over
// @license       MIT
// @match         *://*.youtube.com/*
// @match         *://*.youtube-nocookie.com/*
// @require       https://cdn.jsdelivr.net/gh/StylusThemes/Userscripts@c185c2777d00a6826a8bf3c43bbcdcfeba5a9566/libs/gm/gmcompat.min.js
// @require       https://cdn.jsdelivr.net/gh/StylusThemes/Userscripts@c185c2777d00a6826a8bf3c43bbcdcfeba5a9566/libs/utils/utils.min.js
// @grant         GM.setValue
// @grant         GM.getValue
// @grant         GM.deleteValue
// @grant         GM.listValues
// @grant         GM.addValueChangeListener
// @icon          https://www.google.com/s2/favicons?sz=64&domain=youtube.com
// @homepageURL   https://github.com/StylusThemes/Userscripts
// @downloadURL   https://github.com/StylusThemes/Userscripts/raw/main/userscripts/youtube-resumer.user.js
// @updateURL     https://github.com/StylusThemes/Userscripts/raw/main/userscripts/youtube-resumer.user.js
// ==/UserScript==

(function() {
  'use strict';

  const logger = Logger('YT - Resumer', { debug: false });

  /** CONFIG **/
  const MIN_SEEK_DIFF = 1.5;
  const DAYS_REGULAR = 90; // normal videos expire after 90 days
  const DAYS_SHORTS = 1; // Shorts expire after 1 day
  const DAYS_PREVIEWS = 10 / (24 * 60); // previews expire after 10 minutes
  const CLEANUP_INTERVAL = 5 * 60 * 1000; // 5 minutes

  /** STATE **/
  let activeCleanup = null;
  let currentContext = { videoId: null, playlistId: null };
  let lastPlaylistId = null;

  /** UTILS **/
  const isExpired = status => {
    if (!status?.lastUpdated) return true;
    let days;
    switch (status.videoType) {
      case 'short':
        days = DAYS_SHORTS;
        break;
      case 'preview':
        days = DAYS_PREVIEWS;
        break;
      default:
        days = DAYS_REGULAR;
    }
    return Date.now() - status.lastUpdated > days * 86400 * 1000;
  };

  /** STORAGE HELPERS **/
  async function getStorage() {
    const stored = await GMC.getValue('yt_resumer_storage');
    return stored || { videos: {}, playlists: {}, meta: {} };
  }

  async function setStorage(storage) {
    await GMC.setValue('yt_resumer_storage', storage);
  }

  /** VIDEO CONTROL **/
  async function seekVideo(player, videoEl, time) {
    if (!player || !videoEl || isNaN(time)) return;
    if (Math.abs(player.getCurrentTime() - time) > MIN_SEEK_DIFF) {
      await new Promise(resolve => {
        const onSeeked = () => {
          clearTimeout(timeout);
          videoEl.removeEventListener('seeked', onSeeked);
          resolve();
        };
        const timeout = setTimeout(onSeeked, 1500);
        videoEl.addEventListener('seeked', onSeeked, { once: true });
        player.seekTo(time, true, { skipBufferingCheck: window.location.pathname === '/' });
        logger(`Seeking to ${Math.round(time)}s`);
      });
    }
  }

  /** PLAYBACK MANAGEMENT **/
  async function resumePlayback(player, videoId, videoEl, inPlaylist = false, playlistId = '', prevPlaylistId = null) {
    try {
      const playerSize = player.getPlayerSize();
      if (playerSize.width === 0 || playerSize.height === 0) return;

      const storage = await getStorage();
      const stored = inPlaylist ? storage.playlists[playlistId] : storage.videos[videoId];
      if (!stored) return;

      let targetVideoId = videoId;
      let timeToResume = stored.timestamp;

      if (inPlaylist && stored.videos) {
        const lastVideo = stored.lastWatchedVideoId;
        if (playlistId !== prevPlaylistId && lastVideo && videoId !== lastVideo) {
          targetVideoId = lastVideo;
        }
        timeToResume = stored.videos?.[targetVideoId]?.timestamp;
      }

      if (timeToResume) {
        if (inPlaylist && videoId !== targetVideoId) {
          const playlist = await waitForPlaylist(player);
          const idx = playlist.indexOf(targetVideoId);
          if (idx !== -1) player.playVideoAt(idx);
        } else {
          await seekVideo(player, videoEl, timeToResume);
        }
      }
    } catch (err) {
      logger.error('Failed to resume playback', err);
    }
  }

  async function updateStatus(player, videoEl, type, playlistId = '') {
    try {
      const videoId = player.getVideoData()?.video_id;
      if (!videoId) return;

      const currentTime = videoEl.currentTime;
      if (isNaN(currentTime) || currentTime === 0) return;

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
    } catch (err) {
      logger.error('Failed to update playback status', err);
    }
  }

  /** VIDEO PROCESSING **/
  async function handleVideo(playerContainer, player, videoEl, skipResume = false) {
    if (activeCleanup) activeCleanup();

    const urlParams = new URLSearchParams(window.location.search);
    const videoId = urlParams.get('v') || player.getVideoData()?.video_id;
    if (!videoId) return;

    // Exclude the watch later playlist.
    const playlistId = ((rawId) => (rawId !== 'WL' ? rawId : null))(urlParams.get('list'));
    currentContext = { videoId, playlistId };

    const isLive = player.getVideoData()?.isLive;
    const isPreview = playerContainer.id === 'inline-player';
    const timeSpecified = urlParams.has('t');

    if (isLive || timeSpecified) {
      lastPlaylistId = playlistId;
      return;
    }

    const videoType = window.location.pathname.startsWith('/shorts/') ? 'short' : isPreview ? 'preview' : 'regular';
    let resumed = false;

    const onTimeUpdate = () => {
      if (!resumed && !skipResume) {
        resumed = true;
        resumePlayback(player, videoId, videoEl, !!playlistId, playlistId, lastPlaylistId);
      } else {
        updateStatus(player, videoEl, videoType, playlistId);
      }
    };

    const onRemoteUpdate = async (event) => {
      logger(`Remote update received`);
      await seekVideo(player, videoEl, event.detail.time);
    };

    videoEl.addEventListener('timeupdate', onTimeUpdate, true);
    window.addEventListener('yt-resumer-remote-update', onRemoteUpdate, true);

    activeCleanup = () => {
      videoEl.removeEventListener('timeupdate', onTimeUpdate, true);
      window.removeEventListener('yt-resumer-remote-update', onRemoteUpdate, true);
      currentContext = { videoId: null, playlistId: null };
    };

    lastPlaylistId = playlistId;
  }

  /** PLAYLIST HANDLER **/
  function waitForPlaylist(player) {
    return new Promise((resolve, reject) => {
      const existing = player.getPlaylist();
      if (existing?.length) return resolve(existing);

      let attempts = 0;
      const interval = setInterval(() => {
        const list = player.getPlaylist();
        if (list?.length) {
          clearInterval(interval);
          resolve(list);
        } else if (++attempts > 50) {
          clearInterval(interval);
          reject('Playlist not found');
        }
      }, 100);
    });
  }

  /** STORAGE EVENTS **/
  function onStorageChange(key, newValue, remote) {
    if (!remote || !newValue) return;
    // Broadcast update to video if it's current
    let time;
    if (key === currentContext.playlistId && newValue.videos) {
      time = newValue.videos[currentContext.videoId]?.timestamp;
    } else if (key === currentContext.videoId) {
      time = newValue.timestamp;
    }
    if (time) {
      window.dispatchEvent(new CustomEvent('yt-resumer-remote-update', { detail: { time } }));
    }
  }

  /** CLEANUP **/
  async function cleanupOldData() {
    try {
      const storage = await getStorage();
      for (const vid in storage.videos) {
        if (isExpired(storage.videos[vid])) delete storage.videos[vid];
      }
      for (const pl in storage.playlists) {
        let changed = false;
        const playlist = storage.playlists[pl];
        for (const vid in playlist.videos) {
          if (isExpired(playlist.videos[vid])) {
            delete playlist.videos[vid];
            changed = true;
          }
        }
        if (Object.keys(playlist.videos).length === 0) delete storage.playlists[pl];
        else if (changed) storage.playlists[pl] = playlist;
      }
      await setStorage(storage);
    } catch (err) {
      logger.error(`Failed to clean up stored playback statuses: ${err}`);
    }
  }

  async function periodicCleanup() {
    const storage = await getStorage();
    const last = storage.meta.lastCleanup || 0;
    if (Date.now() - last < CLEANUP_INTERVAL) return;
    storage.meta.lastCleanup = Date.now();
    await setStorage(storage);
    logger('This tab is handling the scheduled cleanup');
    await cleanupOldData();
  }

  /** INITIALIZATION **/
  async function init() {
    try {
      window.addEventListener('pagehide', () => activeCleanup?.(), true);

      await periodicCleanup();
      setInterval(periodicCleanup, CLEANUP_INTERVAL);

      GMC.addValueChangeListener(onStorageChange);

      logger('This tab is handling the initial load');
      window.addEventListener('pageshow', () => {
        logger('This tab is handling the video load');
        initVideoLoad();
        window.addEventListener('yt-player-updated', onVideoContainerLoad, true);
        window.addEventListener('yt-autonav-pause-player-ended', () => activeCleanup?.(), true);
      }, { once: true });

    } catch (err) { logger.error('Initialization failed', err); }
  }

  function initVideoLoad() {
    const player = document.querySelector('#movie_player');
    if (!player) return;
    const videoEl = player.querySelector('video');
    if (videoEl) handleVideo(player, player.player_ || player, videoEl);
  }

  function onVideoContainerLoad(event) {
    const container = event.target;
    const player = container?.player_;
    const videoEl = container?.querySelector('video');
    if (player && videoEl) handleVideo(container, player, videoEl);
  }

  /** START **/
  init();

})();
