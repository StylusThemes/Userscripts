// ==UserScript==
// @name          AniList - Add Trakt link
// @version       1.2.1
// @description   Add trakt and MyAnimeList links to AniList anime pages
// @author        Journey Over
// @license       MIT
// @match         *://anilist.co/*
// @require       https://cdn.jsdelivr.net/gh/StylusThemes/Userscripts@0171b6b6f24caea737beafbc2a8dacd220b729d8/libs/utils/utils.min.js
// @require       https://cdn.jsdelivr.net/gh/StylusThemes/Userscripts@644b86d55bf5816a4fa2a165bdb011ef7c22dfe1/libs/metadata/animeapi/animeapi.min.js
// @grant         GM_xmlhttpRequest
// @grant         GM_setValue
// @grant         GM_getValue
// @grant         GM_listValues
// @grant         GM_deleteValue
// @inject-into   content
// @icon          https://www.google.com/s2/favicons?sz=64&domain=anilist.co
// @homepageURL   https://github.com/StylusThemes/Userscripts
// @downloadURL   https://github.com/StylusThemes/Userscripts/raw/main/userscripts/anilist-add-trakt-link.user.js
// @updateURL     https://github.com/StylusThemes/Userscripts/raw/main/userscripts/anilist-add-trakt-link.user.js
// ==/UserScript==

(function() {
  'use strict';

  const CONFIG = {
    CACHE_DURATION: 24 * 60 * 60 * 1000,
    TRAKT_COLOR: '#ED1C24E0',
    ICON_URL_TRAKT: 'https://cdn.jsdelivr.net/gh/homarr-labs/dashboard-icons/svg/trakt.svg',
    MAL_COLOR: '#2E51A2',
    ICON_URL_MAL: 'https://www.google.com/s2/favicons?sz=64&domain=myanimelist.net',
    ICON_SIZE: '16px'
  };

  const animeApi = new AnimeAPI();
  const logger = Logger('AniList - Add Trakt link', { debug: false });

  class AniListExternalLinker {
    constructor() {
      this.lastProcessedAnimeId = null;
      this.init();
    }

    init() {
      this.clearExpiredCache();
      this.setupSPAWatcher();
      this.handlePageChange();
    }

    // Watches for DOM changes to handle AniList's SPA navigation.
    // Re-runs the check whenever the body changes to ensure links are present.
    setupSPAWatcher() {
      const mutationObserver = new MutationObserver(() => {
        this.handlePageChange();
      });

      mutationObserver.observe(document.body, {
        childList: true,
        subtree: true
      });
    }

    // Validates if we are on an anime page and if links need to be added.
    handlePageChange() {
      if (!this.isAnimePage()) {
        this.lastProcessedAnimeId = null;
        return;
      }

      const anilistId = this.getAniListId();
      if (!anilistId) return;

      const container = document.querySelector('.external-links-wrap');

      if (container) {
        const hasTrakt = this.hasTraktLink(container);
        const hasMal = this.hasMyAnimeListLink(container);

        // Process if links are missing, even if the ID is the same as the last check.
        // This solves the issue where SPA navigation wipes the container.
        if (!hasTrakt || !hasMal) {
          logger.debug(`Processing page for AniList ID: ${anilistId}`);
          this.processPage(anilistId, container);
        }
      }
    }

    async processPage(anilistId, container) {
      try {
        const traktData = await this.getTraktData(anilistId);
        if (traktData) {
          if (traktData.trakt && traktData.trakt_type && !this.hasTraktLink(container)) {
            this.addExternalLink('trakt', traktData, container);
          }
          if (traktData.myanimelist && !this.hasMyAnimeListLink(container)) {
            this.addExternalLink('mal', traktData, container);
          }
        }
      } catch (error) {
        logger.error(`Error processing page: ${error.message}`);
      }
    }

    async getTraktData(anilistId) {
      const cachedEntry = GM_getValue(anilistId);
      if (cachedEntry && this.isCacheValid(cachedEntry)) {
        logger.debug(`Using cached data for AniList ID ${anilistId}`);
        return cachedEntry.data;
      }

      const traktData = await this.fetchTraktData(anilistId);
      if (traktData) {
        GM_setValue(anilistId, {
          data: traktData,
          timestamp: Date.now()
        });
        logger.debug(`Cached Trakt data for AniList ID ${anilistId}`);
      }
      return traktData;
    }

    async fetchTraktData(anilistId) {
      try {
        const data = await animeApi.fetch('anilist', anilistId);
        if (data?.trakt && data?.trakt_type) {
          return data;
        }
        logger.warn(`No Trakt data in response for AniList ID ${anilistId}`);
        return null;
      } catch (error) {
        if (error.message.includes('404')) {
          logger.warn(`No mapping data found for AniList ID ${anilistId} (404)`);
          return null;
        }
        logger.error(`Failed to fetch Trakt data: ${error.message}`);
        throw error;
      }
    }

    addExternalLink(type, data, container) {
      let url, name, color, iconUrl;
      if (type === 'trakt') {
        url = `https://trakt.tv/${data.trakt_type}/${data.trakt}`;
        name = 'Trakt';
        color = CONFIG.TRAKT_COLOR;
        iconUrl = CONFIG.ICON_URL_TRAKT;
      } else if (type === 'mal') {
        url = `https://myanimelist.net/anime/${data.myanimelist}`;
        name = 'MyAnimeList';
        color = CONFIG.MAL_COLOR;
        iconUrl = CONFIG.ICON_URL_MAL;
      } else {
        return;
      }
      const linkElement = this.createExternalLinkElement(url, name, color, iconUrl);
      container.appendChild(linkElement);
      logger(`Added ${name} link: ${url}`);
    }

    createExternalLinkElement(url, name, color, iconUrl) {
      const linkElement = document.createElement('a');
      linkElement.setAttribute('data-v-c1b7ee7c', '');
      linkElement.href = url;
      linkElement.target = '_blank';
      linkElement.className = 'external-link';
      linkElement.style.cssText = `--link-color: ${color};`;

      const iconWrapper = document.createElement('div');
      iconWrapper.setAttribute('data-v-c1b7ee7c', '');
      iconWrapper.className = 'icon-wrap';
      iconWrapper.style.cssText = 'background: rgba(0, 0, 0, 0);';

      const iconImage = document.createElement('img');
      iconImage.setAttribute('data-v-c1b7ee7c', '');
      iconImage.src = iconUrl;
      iconImage.className = 'icon';
      iconImage.style.cssText = `width: ${CONFIG.ICON_SIZE}; height: ${CONFIG.ICON_SIZE};`;

      const nameSpan = document.createElement('span');
      nameSpan.setAttribute('data-v-c1b7ee7c', '');
      nameSpan.className = 'name';
      nameSpan.textContent = name;

      iconWrapper.appendChild(iconImage);
      linkElement.appendChild(iconWrapper);
      linkElement.appendChild(nameSpan);

      return linkElement;
    }

    /**
     * Extract AniList ID from URL path.
     */
    getAniListId() {
      const [, , animeId] = window.location.pathname.split('/');
      return animeId && !isNaN(animeId) ? animeId : null;
    }

    isAnimePage() {
      return window.location.pathname.startsWith('/anime/');
    }

    hasTraktLink(container) {
      return !!container.querySelector('a[href*="trakt.tv"]');
    }

    hasMyAnimeListLink(container) {
      return !!container.querySelector('a[href*="myanimelist.net"]');
    }

    isCacheValid(cachedEntry) {
      return cachedEntry.timestamp && (Date.now() - cachedEntry.timestamp < CONFIG.CACHE_DURATION);
    }

    clearExpiredCache() {
      try {
        const values = GM_listValues();
        for (const value of values) {
          const cache = GM_getValue(value);
          if (cache?.timestamp && (Date.now() - cache.timestamp) > CONFIG.CACHE_DURATION) {
            GM_deleteValue(value);
          }
        }
      } catch (error) {
        logger.error(`Failed to clear expired cache: ${error.message}`);
      }
    }
  }

  new AniListExternalLinker();
})();
