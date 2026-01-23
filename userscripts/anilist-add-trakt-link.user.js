// ==UserScript==
// @name          AniList - Add Trakt link
// @version       1.2.0
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
      this.handleCurrentPage();
    }

    setupSPAWatcher() {
      const mutationObserver = new MutationObserver(mutations => {
        for (const mutation of mutations) {
          for (const node of mutation.addedNodes) {
            if (this.isExternalLinksContainer(node)) {
              this.handlePageChange();
            }
          }
        }
      });

      mutationObserver.observe(document.body, {
        childList: true,
        subtree: true
      });
    }

    // Check both direct matches and child elements because SPA might insert wrapper elements
    // around the external links container during page transitions
    isExternalLinksContainer(node) {
      return node.nodeType === Node.ELEMENT_NODE &&
        (node.matches('.external-links-wrap') ||
          node.querySelector('.external-links-wrap'));
    }

    handleCurrentPage() {
      if (this.isAnimePage()) {
        this.handlePageChange();
      }
    }

    handlePageChange() {
      const anilistId = this.getAniListId();
      if (!anilistId || anilistId === this.lastProcessedAnimeId) {
        return;
      }

      this.lastProcessedAnimeId = anilistId;
      this.processPage(anilistId);
    }

    async processPage(anilistId) {
      try {
        const externalLinksContainer = await this.waitForElement('.external-links-wrap');
        if (!externalLinksContainer) {
          logger.error('External links container not found');
          return;
        }

        const traktData = await this.getTraktData(anilistId);
        if (traktData) {
          if (traktData.trakt && traktData.trakt_type && !this.hasTraktLink(externalLinksContainer)) {
            this.addTraktLink(traktData, externalLinksContainer);
          }
          if (traktData.myanimelist && !this.hasMyAnimeListLink(externalLinksContainer)) {
            this.addMyAnimeListLink(traktData, externalLinksContainer);
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
          logger.debug(`Fetched Trakt data for AniList ID ${anilistId}`);
          return data;
        }
        logger.warn(`No Trakt data in response for AniList ID ${anilistId}`);
        return null;
      } catch (error) {
        // Handle 404s differently - they mean no mapping exists, not an actual error
        if (error.message.includes('404')) {
          logger.warn(`No mapping data found for AniList ID ${anilistId} (404)`);
          return null; // No data available for this anime
        }
        logger.error(`Failed to fetch Trakt data: ${error.message}`);
        throw error; // Network or server errors should be thrown for retry
      }
    }

    addTraktLink(data, container) {
      const traktUrl = `https://trakt.tv/${data.trakt_type}/${data.trakt}`;
      const linkElement = this.createExternalLinkElement(traktUrl, 'Trakt', CONFIG.TRAKT_COLOR, CONFIG.ICON_URL_TRAKT);
      container.appendChild(linkElement);
      logger(`Added Trakt link: ${traktUrl}`);
    }

    addMyAnimeListLink(data, container) {
      const malUrl = `https://myanimelist.net/anime/${data.myanimelist}`;
      const linkElement = this.createExternalLinkElement(malUrl, 'MyAnimeList', CONFIG.MAL_COLOR, CONFIG.ICON_URL_MAL);
      container.appendChild(linkElement);
      logger(`Added MyAnimeList link: ${malUrl}`);
    }

    createExternalLinkElement(url, name, color, iconUrl) {
      const linkElement = document.createElement('a');
      linkElement.setAttribute('data-v-c1b7ee7c', '');
      linkElement.href = url;
      linkElement.target = '_blank';
      linkElement.className = 'external-link';
      // Use CSS custom property to match AniList's theming system
      linkElement.style.cssText = `--link-color: ${color};`;

      const iconWrapper = document.createElement('div');
      iconWrapper.setAttribute('data-v-c1b7ee7c', '');
      iconWrapper.className = 'icon-wrap';
      // Transparent background to inherit container styles while avoiding visual conflicts
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

    // Wait for element to appear in DOM with MutationObserver fallback
    // for dynamically loaded content in single-page applications
    waitForElement(selector) {
      return new Promise(resolve => {
        const element = document.querySelector(selector);
        if (element) {
          resolve(element);
          return;
        }

        const observer = new MutationObserver(() => {
          const element = document.querySelector(selector);
          if (element) {
            observer.disconnect();
            resolve(element);
          }
        });

        observer.observe(document.body, {
          childList: true,
          subtree: true
        });
      });
    }

    // Extract AniList ID from URL path: /anime/{id}/{slug} - assumes standard AniList URL structure
    getAniListId() {
      const pathParts = window.location.pathname.split('/');
      const animeId = pathParts[2];
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

    // Validates cache has timestamp and is within duration
    isCacheValid(cachedEntry) {
      return cachedEntry.timestamp && (Date.now() - cachedEntry.timestamp < CONFIG.CACHE_DURATION);
    }

    // clear expired cache entries
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
