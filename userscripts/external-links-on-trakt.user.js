// ==UserScript==
// @name          External links on Trakt
// @version       3.0.0
// @description   Adds more external links to Trakt.tv pages.
// @author        Journey Over
// @license       MIT
// @match         *://trakt.tv/*
// @require       https://cdn.jsdelivr.net/gh/StylusThemes/Userscripts@main/libs/wikidata/index.min.js?version=1.1.0
// @require       https://cdn.jsdelivr.net/npm/node-creation-observer@1.2.0/release/node-creation-observer-latest.min.js
// @require       https://cdn.jsdelivr.net/npm/jquery@3.7.1/dist/jquery.min.js
// @grant         GM.deleteValue
// @grant         GM.getValue
// @grant         GM.listValues
// @grant         GM.setValue
// @grant         GM.xmlHttpRequest
// @run-at        document-start
// @inject-into   content
// @icon          https://www.google.com/s2/favicons?sz=64&domain=trakt.tv
// @homepageURL   https://github.com/StylusThemes/Userscripts
// @downloadURL   https://github.com/StylusThemes/Userscripts/raw/main/userscripts/external-links-on-trakt.user.js
// @updateURL     https://github.com/StylusThemes/Userscripts/raw/main/userscripts/external-links-on-trakt.user.js
// ==/UserScript==

/* global $, NodeCreationObserver, Wikidata */

(() => {
  'use strict';

  // ==============================
  //  Constants and Configuration
  // ==============================
  const CONSTANTS = {
    CACHE_DURATION: 36e5, // 1 hour in milliseconds
    SCRIPT_ID: GM.info.script.name.toLowerCase().replace(/\s/g, '-'),
    CONFIG_KEY: 'enhanced-trakt-links-config',
    TITLE: `${GM.info.script.name} Settings`,
    SCRIPT_NAME: GM.info.script.name,
    METADATA_SITES: [
      { name: 'Rotten Tomatoes', desc: 'Provides a direct link to Rotten Tomatoes for the selected title.' },
      { name: 'Metacritic', desc: 'Provides a direct link to Metacritic for the selected title.' },
      { name: 'Letterboxd', desc: 'Provides a direct link to Letterboxd for the selected title.' },
      { name: 'TVmaze', desc: 'Provides a direct link to TVmaze for the selected title.' },
      { name: 'Mediux', desc: 'Provides a direct link to the Mediux Poster site for the selected title.' },
      { name: 'MyAnimeList', desc: 'Provides a direct link to MyAnimeList for the selected title.' },
      { name: 'AniDB', desc: 'Provides a direct link to AniDB for the selected title.' },
      { name: 'AniList', desc: 'Provides a direct link to AniList for the selected title.' },
      { name: 'Kitsu', desc: 'Provides a direct link to Kitsu for the selected title.' },
      { name: 'AniSearch', desc: 'Provides a direct link to AniSearch for the selected title.' },
      { name: 'LiveChart', desc: 'Provides a direct link to LiveChart for the selected title.' },
    ],
    STREAMING_SITES: [
      { name: 'BrocoFlix', desc: 'Provides a direct link to the BrocoFlix streaming page for the selected title.' },
      { name: 'Cineby', desc: 'Provides a direct link to the Cineby streaming page for the selected title' },
      { name: 'Freek', desc: 'Provides a direct link to the Freek streaming page for the selected title.' },
      { name: 'P-Stream', desc: 'Provides a direct link to the P-Stream streaming page for the selected title.' },
      { name: 'Rive', desc: 'Provides a direct link to the Rive streaming page for the selected title.' },
      { name: 'Wovie', desc: 'Provides a direct link to the Wovie streaming page for the selected title.' },
      { name: 'XPrime', desc: 'Provides a direct link to the XPrime streaming page for the selected title.' },
    ]
  };

  // Default configuration values
  const DEFAULT_CONFIG = Object.fromEntries([
    ['logging', false],
    ['debugging', false],
    ...CONSTANTS.METADATA_SITES.map(site => [site.name, true]),
    ...CONSTANTS.STREAMING_SITES.map(site => [site.name, true])
  ]);

  // ======================
  //  Core Functionality
  // ======================
  class TraktExternalLinks {
    constructor() {
      // Initialize with default configuration
      this.config = { ...DEFAULT_CONFIG };
      this.wikidata = null;      // Wikidata API instance
      this.mediaInfo = null;     // Current media item metadata
      this.linkSettings = [      // All supported link settings
        ...CONSTANTS.METADATA_SITES,
        ...CONSTANTS.STREAMING_SITES
      ];
    }

    // ======================
    //  Logging Methods
    // ======================
    info(message, ...args) {
      if (this.config.logging) {
        console.info(`${CONSTANTS.SCRIPT_NAME}: INFO: ${message}`, ...args);
      }
    }

    warn(message, ...args) {
      if (this.config.logging) {
        console.warn(`${CONSTANTS.SCRIPT_NAME}: WARN: ${message}`, ...args);
      }
    }

    error(message, ...args) {
      if (this.config.logging) {
        console.error(`${CONSTANTS.SCRIPT_NAME}: ERROR: ${message}`, ...args);
      }
    }

    debug(message, ...args) {
      if (this.config.debugging) {
        console.debug(`${CONSTANTS.SCRIPT_NAME}: DEBUG: ${message}`, ...args);
      }
    }

    // ======================
    //  Initialization
    // ======================
    async init() {
      // Main initialization sequence
      await this.loadConfig();
      this.initializeWikidata();
      this.logInitialization();
      this.setupEventListeners();
    }

    logInitialization() {
      const { version, author } = GM.info.script;
      const headerStyle = 'color:red;font-weight:bold;font-size:18px;';
      const versionText = version ? `v${version} ` : '';

      console.log(
        `%c${CONSTANTS.SCRIPT_NAME}\n%c${versionText}by ${author} is running!`,
        headerStyle,
        ''
      );

      this.info('Script initialized');
      this.debug('Debugging mode enabled');
      this.debug('Current configuration:', this.config);
    }

    async loadConfig() {
      // Load saved configuration from storage
      const savedConfig = await GM.getValue(CONSTANTS.CONFIG_KEY);
      if (savedConfig) {
        this.config = { ...DEFAULT_CONFIG, ...savedConfig };
      }
    }

    initializeWikidata() {
      // Initialize Wikidata API with debugging option
      this.wikidata = new Wikidata({ debug: this.config.debugging });
    }

    // ======================
    //  Event Handling
    // ======================
    setupEventListeners() {
      // Watch for external links container and body element creation
      NodeCreationObserver.onCreation('.sidebar .external', () => this.handleExternalLinks());
      NodeCreationObserver.onCreation('body', () => this.addSettingsMenu());
    }

    // ======================
    //  Media Info
    // ======================
    getMediaInfo() {
      // Extract media metadata from URL and DOM elements
      const pathParts = location.pathname.split('/');
      const type = pathParts[1] === 'movies' ? 'movie' : 'tv';

      // Get IDs from existing external links
      const imdbId = $('#external-link-imdb').attr('href').match(/tt\d+/)[0];
      const tmdbId = $('#external-link-tmdb').attr('href').match(/\/(movie|tv)\/(\d+)/)[2];

      // Extract title from URL slug
      const slug = pathParts[2] || '';
      const title = slug.split('-')
        .slice(1) // Remove any leading ID
        .join('-')
        .replace(/-\d{4}$/, ''); // Remove year suffix

      // Parse season/episode structure
      const seasonIndex = pathParts.indexOf('seasons');
      const episodeIndex = pathParts.indexOf('episodes');
      const season = seasonIndex > 0 ? +pathParts[seasonIndex + 1] : null;
      const episode = episodeIndex > 0 ? +pathParts[episodeIndex + 1] : null;

      return {
        type,
        imdbId,
        tmdbId,
        title,
        season: season || '1',
        episode: episode || '1',
        isSeasonPage: !!season && !episode
      };
    }

    // ======================
    //  Link Management
    // ======================
    async handleExternalLinks() {
      // Main link processing pipeline
      try {
        await this.clearExpiredCache();
        this.mediaInfo = this.getMediaInfo();

        if (this.mediaInfo.imdbId) {
          await this.processWikidataLinks();
        }

        if (this.mediaInfo.tmdbId || this.mediaInfo.imdbId) {
          this.addCustomLinks();
        }
      } catch (error) {
        this.error(`Failed handling external links: ${error.message}`);
      }
    }

    createLink(name, url) {
      // Create new external link element if it doesn't exist
      const linkId = `external-link-${name.toLowerCase().replace(/\s/g, '_')}`;

      if (!this.linkExists(name)) {
        const linkHtml = `<a target="_blank" id="${linkId}" href="${url}" data-original-title="" title="">${name}</a>`;
        $('#info-wrapper .sidebar .external li a:not(:has(i))').last().after(linkHtml);
        this.debug(`Added ${name} link: ${url}`);
      }
    }

    // ======================
    //  Wikidata Integration
    // ======================
    async processWikidataLinks() {
      // Handle Wikidata links with caching
      const cache = await GM.getValue(this.mediaInfo.imdbId);

      if (this.isCacheValid(cache)) {
        this.debug('Using cached Wikidata data');
        this.addWikidataLinks(cache.links);
        return;
      }

      try {
        // Fetch fresh data from Wikidata API
        const data = await this.wikidata.links(this.mediaInfo.imdbId, 'IMDb', this.mediaInfo.type);
        await GM.setValue(this.mediaInfo.imdbId, {
          links: data.links,
          item: data.item,
          time: Date.now()
        });
        this.addWikidataLinks(data.links);
        this.debug('New Wikidata data fetched:', data.item);
      } catch (error) {
        this.error(`Failed fetching Wikidata links: ${error.message}`);
      }
    }

    addWikidataLinks(links) {
      // Add links from Wikidata data, filtering out anime sites for season pages
      const animeSites = new Set(['MyAnimeList', 'AniDB', 'AniList', 'Kitsu', 'AniSearch', 'LiveChart']);
      Object.entries(links).forEach(([site, link]) => {
        if (
          site !== 'Trakt' &&
          link?.value &&
          this.config[site] !== false &&
          !this.linkExists(site) &&
          !(this.mediaInfo.isSeasonPage && animeSites.has(site))
        ) {
          this.createLink(site, link.value);
        }
      });
    }

    // ======================
    //  Custom Link Builders
    // ======================
    addCustomLinks() {
      // Define custom link templates and conditions
      const customLinks = [
        {
          name: 'Letterboxd',
          url: () => `https://letterboxd.com/tmdb/${this.mediaInfo.tmdbId}`,
          condition: () => this.mediaInfo.type === 'movie',
          requiredData: 'tmdbId'
        },
        {
          name: 'Mediux',
          url: () => {
            const path = this.mediaInfo.type === 'movie' ? 'movies' : 'shows';
            return `https://mediux.pro/${path}/${this.mediaInfo.tmdbId}`;
          },
          condition: () => true,
          requiredData: 'tmdbId'
        },
        {
          name: 'BrocoFlix',
          url: () => `https://brocoflix.com/pages/info?id=${this.mediaInfo.tmdbId}&type=${this.mediaInfo.type}`,
          condition: () => true,
          requiredData: 'tmdbId'
        },
        {
          name: 'Cineby',
          url: () => {
            const show = this.mediaInfo.type === 'tv' ? `/${this.mediaInfo.season}/${this.mediaInfo.episode}` : '';
            return `https://www.cineby.app/${this.mediaInfo.type}/${this.mediaInfo.tmdbId}${show}`;
          },
          condition: () => true,
          requiredData: 'tmdbId'
        },
        {
          name: 'Freek',
          url: () => {
            const show = this.mediaInfo.type === 'tv' ? `?season=${this.mediaInfo.season}&ep=${this.mediaInfo.episode}` : '';
            return `https://freek.to/watch/${this.mediaInfo.type}/${this.mediaInfo.tmdbId}${show}`;
          },
          condition: () => true,
          requiredData: 'tmdbId'
        },
        {
          name: 'P-Stream',
          url: () => {
            const show = this.mediaInfo.type === 'tv' ? `/${this.mediaInfo.season}/${this.mediaInfo.episode}` : '';
            return `https://iframe.pstream.org/embed/tmdb-${this.mediaInfo.type}-${this.mediaInfo.tmdbId}${show}`;
          },
          condition: () => true,
          requiredData: 'tmdbId'
        },
        {
          name: 'Rive',
          url: () => {
            const show = this.mediaInfo.type === 'tv' ? `&season=${this.mediaInfo.season}&episode=${this.mediaInfo.episode}` : '';
            return `https://rivestream.live/watch?type=${this.mediaInfo.type}&id=${this.mediaInfo.tmdbId}${show}`;
          },
          condition: () => true,
          requiredData: 'tmdbId'
        },
        {
          name: 'Wovie',
          url: () => {
            const show = this.mediaInfo.type === 'tv' ? `?season=${this.mediaInfo.season}&episode=${this.mediaInfo.episode}` : '';
            return `https://wovie.vercel.app/play/${this.mediaInfo.type}/${this.mediaInfo.tmdbId}/${this.mediaInfo.title}${show}`;
          },
          condition: () => true,
          requiredData: 'tmdbId'
        },
        {
          name: 'XPrime',
          url: () => {
            const show = this.mediaInfo.type === 'tv' ? `/${this.mediaInfo.season}/${this.mediaInfo.episode}` : '';
            return `https://xprime.tv/watch/${this.mediaInfo.tmdbId}${show}`;
          },
          condition: () => true,
          requiredData: 'tmdbId'
        }
      ];

      customLinks.forEach(linkConfig => {
        if (
          this.config[linkConfig.name] !== false &&
          !this.linkExists(linkConfig.name) &&
          this.mediaInfo[linkConfig.requiredData] &&
          linkConfig.condition()
        ) {
          this.createLink(linkConfig.name, linkConfig.url());
        }
      });
    }

    // ======================
    //  Cache Management
    // ======================
    isCacheValid(cache) {
      return cache &&
        !this.config.debugging &&
        (Date.now() - cache.time) < CONSTANTS.CACHE_DURATION;
    }

    linkExists(site) {
      return $(`#info-wrapper .sidebar .external li a#external-link-${site.toLowerCase().replace(/\s/g, '_')}`).length > 0;
    }

    async clearExpiredCache() {
      // Clear expired cache entries
      const values = await GM.listValues();
      for (const value of values) {
        if (value === CONSTANTS.CONFIG_KEY) continue;
        const cache = await GM.getValue(value);
        if (cache?.time && (Date.now() - cache.time) > CONSTANTS.CACHE_DURATION) {
          await GM.deleteValue(value);
        }
      }
    }

    // ======================
    //  Settings UI
    // ======================
    addSettingsMenu() {
      // Add settings menu item to user navigation
      const menuItem = `<li class="${CONSTANTS.SCRIPT_ID}"><a href="javascript:void(0)">EL Settings</a></li>`;
      $('div.user-wrapper ul.menu li.divider').last().after(menuItem);
      $(`.${CONSTANTS.SCRIPT_ID}`).click(() => this.openSettingsModal());
    }

    openSettingsModal() {
      const modalHTML = this.generateSettingsModalHTML();
      $(modalHTML).appendTo('body');
      this.addModalStyles();
      this.setupModalEventListeners();
    }

    generateSettingsModalHTML() {
      const generateSection = (title, sites) => `
        <div class="settings-section">
          <h3><i class="fas fa-link"></i> ${title}</h3>
          <div class="link-settings-grid">
            ${sites.map(site => {
              const id = site.name.toLowerCase().replace(/\s+/g, '_');
              return `
                <div class="setting-item">
                  <div class="setting-info">
                    <label for="${id}" title="${site.desc}">${site.name}</label>
                  </div>
                  <label class="switch">
                    <input type="checkbox" id="${id}" ${this.config[site.name] ? 'checked' : ''}>
                    <span class="slider"></span>
                  </label>
                </div>
              `;
            }).join('')}
          </div>
        </div>
      `;

      return `
        <div id="${CONSTANTS.SCRIPT_ID}-config">
          <div class="modal-content">
            <div class="modal-header">
              <h2>${CONSTANTS.TITLE}</h2>
              <button class="close-button">&times;</button>
            </div>

            <div class="settings-sections">
              <div class="settings-section">
                <h3><i class="fas fa-cog"></i> General Settings</h3>
                <div class="setting-item">
                  <div class="setting-info">
                    <label for="logging">Enable Logging</label>
                    <div class="description">Show basic logs (info, warnings, errors) in console</div>
                  </div>
                  <label class="switch">
                    <input type="checkbox" id="logging" ${this.config.logging ? 'checked' : ''}>
                    <span class="slider"></span>
                  </label>
                </div>
                <div class="setting-item">
                  <div class="setting-info">
                    <label for="debugging">Enable Debugging</label>
                    <div class="description">Show detailed debug information in console</div>
                  </div>
                  <label class="switch">
                    <input type="checkbox" id="debugging" ${this.config.debugging ? 'checked' : ''}>
                    <span class="slider"></span>
                  </label>
                </div>
              </div>

              ${generateSection('Metadata Sites', CONSTANTS.METADATA_SITES)}
              ${generateSection('Streaming Sites', CONSTANTS.STREAMING_SITES)}
            </div>

            <div class="modal-footer">
              <button class="btn save" id="save-config">Save & Reload</button>
              <button class="btn warning" id="clear-cache">Clear Cache</button>
            </div>
          </div>
        </div>
      `;
    }

    addModalStyles() {
      const styles = `#${CONSTANTS.SCRIPT_ID}-config{position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.7);z-index:9999;display:flex;justify-content:center;align-items:center}#${CONSTANTS.SCRIPT_ID}-config .modal-content{background:#2b2b2b;color:#fff;border-radius:8px;width:450px;max-width:90%;box-shadow:0 8px 32px rgba(0,0,0,0.3)}#${CONSTANTS.SCRIPT_ID}-config .modal-header{padding:1.5rem;border-bottom:1px solid #404040;position:relative;display:flex;justify-content:space-between;align-items:center}#${CONSTANTS.SCRIPT_ID}-config .modal-header h2{margin:0;font-size:1.4rem;color:#fff}#${CONSTANTS.SCRIPT_ID}-config .close-button{background:0;border:0;color:#fff;font-size:1.5rem;cursor:pointer;padding:0 .5rem}#${CONSTANTS.SCRIPT_ID}-config .settings-sections{padding:1.5rem;max-height:60vh;overflow-y:auto}#${CONSTANTS.SCRIPT_ID}-config .settings-section{margin-bottom:2rem}#${CONSTANTS.SCRIPT_ID}-config .settings-section h3{font-size:1.1rem;margin:0 0 1.2rem;color:#fff;display:flex;align-items:center;gap:.5rem}#${CONSTANTS.SCRIPT_ID}-config .setting-item{display:flex;justify-content:space-between;align-items:center;padding:.8rem 0;border-bottom:1px solid #404040}#${CONSTANTS.SCRIPT_ID}-config .setting-info{flex-grow:1;margin-right:1.5rem}#${CONSTANTS.SCRIPT_ID}-config .setting-info label{display:block;font-weight:500;margin-bottom:.3rem;cursor:help}#${CONSTANTS.SCRIPT_ID}-config .description{color:#a0a0a0;font-size:.9rem;line-height:1.4}#${CONSTANTS.SCRIPT_ID}-config .switch{flex-shrink:0}#${CONSTANTS.SCRIPT_ID}-config .modal-footer{padding:1.5rem;border-top:1px solid #404040;display:flex;gap:.8rem;justify-content:flex-end}#${CONSTANTS.SCRIPT_ID}-config .btn{padding:.6rem 1.2rem;border-radius:4px;border:0;cursor:pointer;font-weight:500;transition:all .2s ease}#${CONSTANTS.SCRIPT_ID}-config .btn.save{background:#4CAF50;color:#fff}#${CONSTANTS.SCRIPT_ID}-config .btn.warning{background:#f44336;color:#fff}#${CONSTANTS.SCRIPT_ID}-config .btn:hover{opacity:.9}#${CONSTANTS.SCRIPT_ID}-config .link-settings-grid{display:grid;grid-template-columns:repeat(2,1fr);gap:.8rem}#${CONSTANTS.SCRIPT_ID}-config .link-settings-grid .setting-item{background:rgba(255,255,255,.05);border-radius:4px;padding:.8rem;border:1px solid #404040;margin:0}#${CONSTANTS.SCRIPT_ID}-config .link-settings-grid .setting-item:hover{background:rgba(255,255,255,.08)}`;
      $('<style>').prop('type', 'text/css').html(styles).appendTo('head');
    }

    setupModalEventListeners() {
      $('.close-button').click(() => $(`#${CONSTANTS.SCRIPT_ID}-config`).remove());

      $('#save-config').click(async () => {
        this.config.logging = $('#logging').is(':checked');
        this.config.debugging = $('#debugging').is(':checked');

        [...CONSTANTS.METADATA_SITES, ...CONSTANTS.STREAMING_SITES].forEach(site => {
          const checkboxId = site.name.toLowerCase().replace(/\s+/g, '_');
          this.config[site.name] = $(`#${checkboxId}`).is(':checked');
        });

        await GM.setValue(CONSTANTS.CONFIG_KEY, this.config);
        $(`#${CONSTANTS.SCRIPT_ID}-config`).remove();
        window.location.reload();
      });

      $('#clear-cache').click(async () => {
        const values = await GM.listValues();
        for (const value of values) {
          if (value === CONSTANTS.CONFIG_KEY) continue;
          await GM.deleteValue(value);
        }
        this.info('Cache cleared (excluding config)');
        $(`#${CONSTANTS.SCRIPT_ID}-config`).remove();
        window.location.reload();
      });
    }
  }

  // ======================
  //  Script Initialization
  // ======================
  $(document).ready(async () => {
    // Start the main application
    const traktLinks = new TraktExternalLinks();
    await traktLinks.init();
  });
})();
