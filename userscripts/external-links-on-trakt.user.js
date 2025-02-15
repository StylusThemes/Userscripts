// ==UserScript==
// @name          External links on Trakt
// @version       2.2.0
// @description   Adds more external links to Trakt.tv pages.
// @author        Journey Over
// @license       MIT
// @match         *://trakt.tv/*
// @require       https://cdn.jsdelivr.net/gh/StylusThemes/Userscripts@main/libs/wikidata/index.min.js?version=1.0.0
// @require       https://cdn.jsdelivr.net/npm/node-creation-observer@1.2.0/release/node-creation-observer-latest.min.js
// @require       https://cdn.jsdelivr.net/npm/jquery@3.6.0/dist/jquery.min.js
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

  const CONSTANTS = {
    CACHE_DURATION: 36E5, // 1 hour in milliseconds
    SCRIPT_ID: GM.info.script.name.toLowerCase().replace(/\s/g, '-'),
    CONFIG_KEY: 'enhanced-trakt-links-config',
    TITLE: `${GM.info.script.name} Settings`,
    SCRIPT_NAME: GM.info.script.name
  };

  // Default configuration
  const DEFAULT_CONFIG = {
    logging: false,
    debugging: false
  };

  class TraktExternalLinks {
    constructor() {
      this.config = { ...DEFAULT_CONFIG };
      this.wikidata = null;
      this.mediaInfo = null;
    }

    // Logging methods
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

    async init() {
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
      const savedConfig = await GM.getValue(CONSTANTS.CONFIG_KEY);
      if (savedConfig) {
        this.config = { ...DEFAULT_CONFIG, ...savedConfig };
      }
    }

    initializeWikidata() {
      this.wikidata = new Wikidata({ debug: this.config.debugging });
    }

    setupEventListeners() {
      NodeCreationObserver.onCreation('.sidebar .external', () => this.handleExternalLinks());
      NodeCreationObserver.onCreation('body', () => this.addSettingsMenu());
    }

    async handleExternalLinks() {
      try {
        await this.clearExpiredCache();
        this.mediaInfo = this.getMediaInfo();

        if (this.mediaInfo.imdbId) {
          await this.processWikidataLinks();
        }
      } catch (error) {
        this.error(`Failed handling external links: ${error.message}`);
      }
    }

    getMediaInfo() {
      const pathParts = location.pathname.split('/');
      const type = pathParts[1] === 'movies' ? 'movie' : 'tv';
      const imdbLink = $('#external-link-imdb');
      const imdbId = imdbLink.length ? imdbLink.attr('href')?.match(/tt\d+/)?.[0] : null;

      return {
        type,
        imdbId
      };
    }

    createLink(name, url) {
      const linkId = `external-link-${name.toLowerCase().replace(/\s/g, '_')}`;

      if (!this.linkExists(name)) {
        const linkHtml = `<a target="_blank" id="${linkId}" href="${url}" data-original-title="" title="">${name}</a>`;
        $('#info-wrapper .sidebar .external li a:not(:has(i))').last().after(linkHtml);
        this.debug(`Added ${name} link: ${url}`);
      }
    }

    async processWikidataLinks() {
      const cache = await GM.getValue(this.mediaInfo.imdbId);

      if (this.isCacheValid(cache)) {
        this.debug('Using cached Wikidata data');
        this.addWikidataLinks(cache.links);
        return;
      }

      try {
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
      Object.entries(links).forEach(([site, link]) => {
        if (site !== 'Trakt' && link?.value && !this.linkExists(site)) {
          this.createLink(site, link.value);
        }
      });
    }

    isCacheValid(cache) {
      return cache &&
             !this.config.debugging &&
             (Date.now() - cache.time) < CONSTANTS.CACHE_DURATION;
    }

    linkExists(site) {
      return $(`#info-wrapper .sidebar .external li a#external-link-${site.toLowerCase().replace(/\s/g, '_')}`).length > 0;
    }

    async clearExpiredCache() {
      const values = await GM.listValues();
      for (const value of values) {
        if (value === CONSTANTS.CONFIG_KEY) continue;
        const cache = await GM.getValue(value);
        if (cache?.time && (Date.now() - cache.time) > CONSTANTS.CACHE_DURATION) {
          await GM.deleteValue(value);
        }
      }
    }

    addSettingsMenu() {
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
      // eslint-disable-next-line max-len
      const styles = `#${CONSTANTS.SCRIPT_ID}-config{position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.7);z-index:9999;display:flex;justify-content:center;align-items:center}#${CONSTANTS.SCRIPT_ID}-config .modal-content{background:#2b2b2b;color:#fff;border-radius:8px;width:450px;max-width:90%;box-shadow:0 8px 32px rgba(0,0,0,0.3)}#${CONSTANTS.SCRIPT_ID}-config .modal-header{padding:1.5rem;border-bottom:1px solid #404040;position:relative;display:flex;justify-content:space-between;align-items:center}#${CONSTANTS.SCRIPT_ID}-config .modal-header h2{margin:0;font-size:1.4rem;color:#fff}#${CONSTANTS.SCRIPT_ID}-config .close-button{background:none;border:none;color:#fff;font-size:1.5rem;cursor:pointer;padding:0 0.5rem}#${CONSTANTS.SCRIPT_ID}-config .settings-sections{padding:1.5rem;max-height:60vh;overflow-y:auto}#${CONSTANTS.SCRIPT_ID}-config .settings-section{margin-bottom:2rem}#${CONSTANTS.SCRIPT_ID}-config .settings-section h3{font-size:1.1rem;margin:0 0 1.2rem;color:#fff;display:flex;align-items:center;gap:0.5rem}#${CONSTANTS.SCRIPT_ID}-config .setting-item{display:flex;justify-content:space-between;align-items:center;padding:0.8rem 0;border-bottom:1px solid #404040}#${CONSTANTS.SCRIPT_ID}-config .setting-info{flex-grow:1;margin-right:1.5rem}#${CONSTANTS.SCRIPT_ID}-config .setting-info label{display:block;font-weight:500;margin-bottom:0.3rem}#${CONSTANTS.SCRIPT_ID}-config .description{color:#a0a0a0;font-size:0.9rem;line-height:1.4}#${CONSTANTS.SCRIPT_ID}-config .switch{flex-shrink:0}#${CONSTANTS.SCRIPT_ID}-config .modal-footer{padding:1.5rem;border-top:1px solid #404040;display:flex;gap:0.8rem;justify-content:flex-end}#${CONSTANTS.SCRIPT_ID}-config .btn{padding:0.6rem 1.2rem;border-radius:4px;border:none;cursor:pointer;font-weight:500;transition:all 0.2s ease}#${CONSTANTS.SCRIPT_ID}-config .btn.save{background:#4CAF50;color:#fff}#${CONSTANTS.SCRIPT_ID}-config .btn.warning{background:#f44336;color:#fff}#${CONSTANTS.SCRIPT_ID}-config .btn:hover{opacity:0.9}`;
      $('<style>').prop('type', 'text/css').html(styles).appendTo('head');
    }

    setupModalEventListeners() {
      $('.close-button').click(() => $(`#${CONSTANTS.SCRIPT_ID}-config`).remove());

      $('#save-config').click(async () => {
        this.config.logging = $('#logging').is(':checked');
        this.config.debugging = $('#debugging').is(':checked');

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

  // Initialize the script when the document is ready
  $(document).ready(async () => {
    const traktLinks = new TraktExternalLinks();
    await traktLinks.init();
  });
})();
