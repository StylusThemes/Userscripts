// ==UserScript==
// @name          AniList - Add Trakt link
// @version       1.0.0
// @description   Add trakt link to AniList anime pages
// @author        Journey Over
// @license       MIT
// @match         *://anilist.co/*
// @require       https://cdn.jsdelivr.net/gh/StylusThemes/Userscripts@c185c2777d00a6826a8bf3c43bbcdcfeba5a9566/libs/gm/gmcompat.min.js
// @require       https://cdn.jsdelivr.net/gh/StylusThemes/Userscripts@c185c2777d00a6826a8bf3c43bbcdcfeba5a9566/libs/utils/utils.min.js
// @require       https://cdn.jsdelivr.net/gh/StylusThemes/Userscripts@[wip]/libs/metadata/animeapi/animeapi.min.js
// @grant         GM.xmlHttpRequest
// @grant         GM.setValue
// @grant         GM.getValue
// @run-at        document-end
// @inject-into   content
// @icon          https://www.google.com/s2/favicons?sz=64&domain=anilist.co
// @homepageURL   https://github.com/StylusThemes/Userscripts
// @downloadURL   https://github.com/StylusThemes/Userscripts/raw/main/userscripts/anilist-add-trakt-link.user.js
// @updateURL     https://github.com/StylusThemes/Userscripts/raw/main/userscripts/anilist-add-trakt-link.user.js
// ==/UserScript==

(function() {
  'use strict';

  const CONFIG = {
    CACHE_DURATION: 24 * 60 * 60 * 1000, // 24 hours
    TRAKT_COLOR: '#ED1C24E0',
    ICON_URL: 'https://cdn.jsdelivr.net/gh/homarr-labs/dashboard-icons/svg/trakt.svg',
    ICON_SIZE: '16px'
  };

  const animeapi = new AnimeAPI();

  const logger = Logger('AniList - Add Trakt link', { debug: false });

  class AniListTraktLinker {
    constructor() {
      this.lastProcessedId = null;
      this.init();
    }

    init() {
      this.setupSPAWatcher();
      this.handleCurrentPage();
    }

    setupSPAWatcher() {
      const observer = new MutationObserver(mutations => {
        mutations.forEach(mutation => {
          mutation.addedNodes.forEach(node => {
            if (this.isExternalLinksContainer(node)) {
              this.handlePageChange();
            }
          });
        });
      });

      observer.observe(document.body, {
        childList: true,
        subtree: true
      });
    }

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
      if (!anilistId || anilistId === this.lastProcessedId) {
        return;
      }

      this.lastProcessedId = anilistId;
      this.processPage(anilistId);
    }

    async processPage(anilistId) {
      try {
        const externalLinksWrap = await this.waitForElement('.external-links-wrap');
        if (!externalLinksWrap) {
          logger.error('External links container not found');
          return;
        }

        if (this.hasTraktLink(externalLinksWrap)) {
          logger.debug('Trakt link already exists');
          return;
        }

        const traktData = await this.getTraktData(anilistId);
        if (traktData) {
          this.addTraktLink(traktData, externalLinksWrap);
        }
      } catch (error) {
        logger.error(`Error processing page: ${error.message}`);
      }
    }

    async getTraktData(anilistId) {
      // Check cache
      const cached = await GMC.getValue(anilistId);
      if (cached && this.isCacheValid(cached)) {
        logger.debug(`Using cached data for AniList ID ${anilistId}`);
        return cached.data;
      }

      // Fetch Trakt data directly using AniList ID
      const traktData = await this.fetchTraktData(anilistId);
      if (traktData) {
        // Cache the data
        await GMC.setValue(anilistId, {
          data: traktData,
          timestamp: Date.now()
        });
        logger.debug(`Cached Trakt data for AniList ID ${anilistId}`);
      }

      return traktData;
    }

    async fetchTraktData(anilistId) {
      try {
        const data = await animeapi.fetch('anilist', anilistId);
        if (data.trakt && data.trakt_type) {
          logger.debug(`Fetched Trakt data for AniList ID ${anilistId}`);
          return data;
        } else {
          logger.warn(`No Trakt data in response for AniList ID ${anilistId}`);
          return null;
        }
      } catch (error) {
        if (error.message.includes('404')) {
          logger.warn(`No mapping data found for AniList ID ${anilistId} (404)`);
          return null;
        } else {
          logger.error(`Failed to fetch Trakt data: ${error.message}`);
          throw error;
        }
      }
    }

    addTraktLink(data, container) {
      const traktUrl = `https://trakt.tv/${data.trakt_type}/${data.trakt}`;
      const link = this.createTraktLinkElement(traktUrl);
      container.appendChild(link);
      logger(`Added Trakt link: ${traktUrl}`);
    }

    createTraktLinkElement(url) {
      const link = document.createElement('a');
      link.setAttribute('data-v-c1b7ee7c', '');
      link.href = url;
      link.target = '_blank';
      link.className = 'external-link';
      link.style.cssText = `--link-color: ${CONFIG.TRAKT_COLOR};`;

      const iconWrap = document.createElement('div');
      iconWrap.setAttribute('data-v-c1b7ee7c', '');
      iconWrap.className = 'icon-wrap';
      iconWrap.style.cssText = 'background: rgba(0, 0, 0, 0);';

      const img = document.createElement('img');
      img.setAttribute('data-v-c1b7ee7c', '');
      img.src = CONFIG.ICON_URL;
      img.className = 'icon';
      img.style.cssText = `width: ${CONFIG.ICON_SIZE}; height: ${CONFIG.ICON_SIZE};`;

      const nameSpan = document.createElement('span');
      nameSpan.setAttribute('data-v-c1b7ee7c', '');
      nameSpan.className = 'name';
      nameSpan.textContent = 'Trakt';

      iconWrap.appendChild(img);
      link.appendChild(iconWrap);
      link.appendChild(nameSpan);

      return link;
    }

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

    getAniListId() {
      const pathParts = window.location.pathname.split('/');
      return pathParts[2] && !isNaN(pathParts[2]) ? pathParts[2] : null;
    }

    isAnimePage() {
      return window.location.pathname.startsWith('/anime/');
    }

    hasTraktLink(container) {
      return container.querySelector('a[href*="trakt.tv"]') !== null;
    }

    isCacheValid(cached) {
      return cached.timestamp && (Date.now() - cached.timestamp < CONFIG.CACHE_DURATION);
    }
  }

  // Initialize the linker
  new AniListTraktLinker();
})();
