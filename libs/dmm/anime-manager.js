// ==UserScript==
// @author       Journey Over
// @exclude      *
// ==UserLibrary==
// @name         @journeyover/dmm-add-release.moe-link
// @description  Adds Release.moe links to anime pages on DMM
// @license      MIT
// @version      1.0.0
// @homepageURL  https://github.com/StylusThemes/Userscripts
// ==/UserLibrary==
// @connect      releases.moe
// @grant        GM.xmlHttpRequest
// ==/UserScript==

(function() {
  'use strict';

  // Configuration constants specific to anime detection
  const CACHE_DURATION = 24 * 60 * 60 * 1000; // 24 hours in milliseconds

  /**
   * AnimeManager class handles anime detection and Releases.moe integration
   * Uses Wikidata API to determine if content is anime and check Releases.moe availability
   */
  class AnimeManager {
    constructor(config) {
      this.config = config;
      this.wikidata = new Wikidata();
      this.logger = Logger('DMM Anime Manager', { debug: false });
    }

    /**
     * Checks if the current page is for an anime by using Wikidata to get AniList ID
     * Also checks if the anime exists on Releases.moe
     * @returns {Promise<{isAnime: boolean, anilistId: string | null, releasesExists: boolean}>} Object with anime status, AniList ID, and releases existence
     */
    async isAnimePage() {
      try {
        // Get IMDB ID from the page
        const imdbLink = qs('a[href*="imdb.com/title/"]');
        if (!imdbLink) {
          this.logger.debug('No IMDB link found on page');
          return { isAnime: false, anilistId: null, releasesExists: false };
        }
        const href = imdbLink.href;
        const match = href.match(/imdb\.com\/title\/(tt\d+)/);
        if (!match) {
          this.logger.debug('Invalid IMDB URL format');
          return { isAnime: false, anilistId: null, releasesExists: false };
        }
        const imdbId = match[1];

        // Check cache first
        const cache = await GMC.getValue('cache') || {};
        const cacheKey = `dmm-anime-cache-${imdbId}`;
        const cached = cache[cacheKey];

        if (cached && (Date.now() - cached.timestamp) < CACHE_DURATION) {
          this.logger.debug(`Anime cache hit for ${imdbId} (${Math.round((Date.now() - cached.timestamp) / 1000)}s old)`);
          return cached.data;
        }

        this.logger.debug(`Anime cache miss for ${imdbId}, fetching from APIs`);

        // Determine media type from URL
        const url = location.href;
        const mediaType = url.includes('/movie/') ? 'movie' : 'tv';

        // Use Wikidata to get external links
        const data = await this.wikidata.links(imdbId, 'IMDb', mediaType);

        // Check if AniList link exists (indicates it's anime)
        const anilistLink = data.links?.AniList?.value;
        let result = { isAnime: false, anilistId: null, releasesExists: false };

        if (anilistLink) {
          const anilistMatch = anilistLink.match(/anilist\.co\/anime\/(\d+)/);
          const anilistId = anilistMatch ? anilistMatch[1] : null;

          if (anilistId) {
            // Check if anime exists on Releases.moe
            const releasesExists = await this.checkReleasesMoeExists(anilistId);
            result = { isAnime: true, anilistId, releasesExists };
            this.logger(`Anime detected: ${imdbId} -> AniList ${anilistId}, Releases.moe: ${releasesExists ? 'available' : 'not available'}`);
          } else {
            // No AniList ID found, so releases can't exist
            result = { isAnime: true, anilistId: null, releasesExists: false };
            this.logger.debug(`Anime detected: ${imdbId} but no AniList ID found`);
          }
        } else {
          this.logger.debug(`Non-anime content: ${imdbId} (no AniList link)`);
        }

        // Cache the result
        cache[cacheKey] = {
          data: result,
          timestamp: Date.now()
        };

        // Check if cleanup is needed (exactly every 24 hours)
        const lastCleanup = await GMC.getValue('cache-last-cleanup') || 0;
        const now = Date.now();
        if (now - lastCleanup >= CACHE_DURATION) {
          // Clean up expired entries
          let cleanedCount = 0;
          for (const [key, entry] of Object.entries(cache)) {
            if (key.startsWith('dmm-anime-cache-') && (now - entry.timestamp) > CACHE_DURATION) {
              delete cache[key];
              cleanedCount++;
            }
          }
          // Update last cleanup timestamp
          await GMC.setValue('cache-last-cleanup', now);
          if (cleanedCount > 0) {
            this.logger.debug(`Cache cleanup: Removed ${cleanedCount} expired entries`);
          }
        }

        await GMC.setValue('cache', cache);

        return result;
      } catch (error) {
        this.logger.error(`Anime detection failed for ${location.href}:`, error);
        return { isAnime: false, anilistId: null, releasesExists: false };
      }
    }

    /**
     * Checks if an anime exists on Releases.moe
     * @param {string} anilistId - The AniList ID to check
     * @returns {Promise<boolean>} Whether the anime exists on Releases.moe
     */
    checkReleasesMoeExists(anilistId) {
      return new Promise((resolve) => {
        const apiUrl = `https://releases.moe/api/collections/entries/records?filter=alID=${anilistId}`;

        GMC.xmlHttpRequest({
          method: 'GET',
          url: apiUrl,
          onload: (response) => {
            try {
              const data = JSON.parse(response.responseText);
              const exists = data.totalItems > 0;
              this.logger.debug(`Releases.moe: Anime ${anilistId} ${exists ? 'found' : 'not found'}`);
              resolve(exists);
            } catch (error) {
              this.logger.error(`Releases.moe API parse error for ${anilistId}:`, error);
              resolve(false);
            }
          },
          onerror: (error) => {
            this.logger.error(`Releases.moe API request failed for ${anilistId}:`, error);
            resolve(false);
          }
        });
      });
    }

    /**
     * Creates the Releases.moe button element
     * @param {string} link - The Releases.moe URL
     */
    createReleasesMoeButton(link) {
      // Check if a Releases.moe button already exists to prevent duplicates
      const existingButton = document.querySelector('a[href*="releases.moe"]');
      if (existingButton) {
        return;
      }

      this.logger.debug('Created Releases.moe button:', { link });

      const button = document.createElement('a');
      button.href = link;
      button.target = '_blank';
      button.className = 'mb-1 mr-2 mt-0 rounded border-2 border-orange-500 bg-orange-900/30 px-2 py-1 text-sm text-orange-100 transition-colors hover:bg-orange-800/50';
      button.innerHTML = '<b>Releases.moe</b>';

      const buttonContainer = qs('.grid > div:last-child');
      if (buttonContainer) {
        buttonContainer.appendChild(button);
        this.logger.debug('Releases.moe button added to container');
      } else {
        this.logger.warn('Releases.moe button container not found');
      }
    }

    /**
     * Detects anime status for the current page and sets up anime-specific features
     * This method combines detection and UI setup for cleaner integration
     */
    async detectAndSetup() {
      try {
        const { isAnime, anilistId, releasesExists } = await this.isAnimePage();

        // Update buttons with anime information if anime detected
        if (isAnime && anilistId && releasesExists) {
          this.logger('Anime detected with Releases.moe availability', { anilistId, releasesExists });
          this.createReleasesMoeButton(`https://releases.moe/${anilistId}/`);
        } else if (isAnime && anilistId && !releasesExists) {
          this.logger.debug('Anime detected but not available on Releases.moe', { anilistId });
        } else if (isAnime && !anilistId) {
          this.logger.debug('Anime detected but no AniList ID found');
        } else {
          this.logger.debug('Non-anime content detected');
        }
      } catch (error) {
        this.logger.error('Anime detection failed, continuing without anime features:', error);
      }
    }
  }

  // DOM utility functions (shared with QualityManager)
  const qs = (sel, root = document) => root.querySelector(sel);

  // Expose to global scope for the main script
  window.DMMAnimeManager = {
    AnimeManager
  };

})();
