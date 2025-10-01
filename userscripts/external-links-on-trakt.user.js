// ==UserScript==
// @name          External links on Trakt
// @version       3.3.1
// @description   Adds more external links to Trakt.tv pages.
// @author        Journey Over
// @license       MIT
// @match         *://trakt.tv/*
// @require       https://cdn.jsdelivr.net/gh/StylusThemes/Userscripts@c185c2777d00a6826a8bf3c43bbcdcfeba5a9566/libs/gm/gmcompat.min.js
// @require       https://cdn.jsdelivr.net/gh/StylusThemes/Userscripts@c185c2777d00a6826a8bf3c43bbcdcfeba5a9566/libs/utils/utils.min.js
// @require       https://cdn.jsdelivr.net/gh/StylusThemes/Userscripts@214bd129e5e1c8530b80cacbbb5efecc5e975666/libs/wikidata/index.min.js
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

(function() {
  'use strict';

  const logger = Logger('External links on Trakt', { debug: false });

  // ==============================
  //  Constants and Configuration
  // ==============================
  const CONSTANTS = {
    CACHE_DURATION: 36e5, // 1 hour in milliseconds
    SCRIPT_ID: GM.info.script.name.toLowerCase().replace(/\s/g, '-'),
    CONFIG_KEY: 'external-trakt-links-config',
    TITLE: `${GM.info.script.name} Settings`,
    METADATA_SITES: [{
        name: 'Rotten Tomatoes',
        desc: 'Provides a direct link to Rotten Tomatoes for the selected title.'
      },
      {
        name: 'Metacritic',
        desc: 'Provides a direct link to Metacritic for the selected title.'
      },
      {
        name: 'Letterboxd',
        desc: 'Provides a direct link to Letterboxd for the selected title.'
      },
      {
        name: 'TVmaze',
        desc: 'Provides a direct link to TVmaze for the selected title.'
      },
      {
        name: 'Mediux',
        desc: 'Provides a direct link to the Mediux Poster site for the selected title.'
      },
      {
        name: 'MyAnimeList',
        desc: 'Provides a direct link to MyAnimeList for the selected title.'
      },
      {
        name: 'AniDB',
        desc: 'Provides a direct link to AniDB for the selected title.'
      },
      {
        name: 'AniList',
        desc: 'Provides a direct link to AniList for the selected title.'
      },
      {
        name: 'Kitsu',
        desc: 'Provides a direct link to Kitsu for the selected title.'
      },
      {
        name: 'AniSearch',
        desc: 'Provides a direct link to AniSearch for the selected title.'
      },
      {
        name: 'LiveChart',
        desc: 'Provides a direct link to LiveChart for the selected title.'
      },
    ],
    STREAMING_SITES: [{
        name: 'BrocoFlix',
        desc: 'Provides a direct link to the BrocoFlix streaming page for the selected title.'
      },
      {
        name: 'Cineby',
        desc: 'Provides a direct link to the Cineby streaming page for the selected title'
      },
      {
        name: 'Moviemaze',
        desc: 'Provides a direct link to the Moviemaze streaming page for the selected title.'
      },
      {
        name: 'P-Stream',
        desc: 'Provides a direct link to the P-Stream streaming page for the selected title.'
      },
      {
        name: 'Rive',
        desc: 'Provides a direct link to the Rive streaming page for the selected title.'
      },
      {
        name: 'Wovie',
        desc: 'Provides a direct link to the Wovie streaming page for the selected title.'
      },
      {
        name: 'XPrime',
        desc: 'Provides a direct link to the XPrime streaming page for the selected title.'
      },
    ],
    LINK_ORDER: [
      'Official Site', 'IMDb', 'TMDB', 'TVDB', 'Rotten Tomatoes', 'Metacritic',
      'Letterboxd', 'TVmaze', 'MyAnimeList', 'AniDB', 'AniList', 'Kitsu',
      'AniSearch', 'LiveChart', 'Fanart.tv', 'Mediux', 'BrocoFlix', 'Cineby',
      'Moviemaze', 'P-Stream', 'Rive', 'Wovie', 'XPrime', 'JustWatch',
      'Wikipedia', 'Twitter', 'Facebook', 'Instagram'
    ]
  };

  // Default configuration values
  const DEFAULT_CONFIG = Object.fromEntries([
    ...CONSTANTS.METADATA_SITES.map(site => [site.name, true]),
    ...CONSTANTS.STREAMING_SITES.map(site => [site.name, true])
  ]);

  // ======================
  //  Core Functionality
  // ======================
  class TraktExternalLinks {
    constructor() {
      // Initialize with default configuration
      this.config = {
        ...DEFAULT_CONFIG
      };
      this.wikidata = null; // Wikidata API instance
      this.mediaInfo = null; // Current media item metadata
      this.linkSettings = [ // All supported link settings
        ...CONSTANTS.METADATA_SITES,
        ...CONSTANTS.STREAMING_SITES
      ];
    }

    // ======================
    //  Initialization
    // ======================
    async init() {
      // Main initialization sequence
      await this.loadConfig();
      this.initializeWikidata();
      this.setupEventListeners();
    }

    async loadConfig() {
      // Load saved configuration from storage
      const savedConfig = await GMC.getValue(CONSTANTS.CONFIG_KEY);
      if (savedConfig) {
        this.config = {
          ...DEFAULT_CONFIG,
          ...savedConfig
        };
      }
    }

    initializeWikidata() {
      this.wikidata = new Wikidata({
        debug: logger.debugEnabled
      });
    }

    // ======================
    //  Event Handling
    // ======================
    setupEventListeners() {
      // Watch for external links container and body element creation
      NodeCreationObserver.onCreation('.sidebar .external', () => this.handleExternalLinks());
      NodeCreationObserver.onCreation('body', () => this.addSettingsMenu());

      // Watch for collection links in list descriptions on collection pages
      NodeCreationObserver.onCreation('.text.readmore', () => this.handleCollectionLinks());
    }

    // ======================
    //  Media Info
    // ======================
    getMediaInfo() {
      // Extract media metadata from URL and DOM elements
      const pathParts = location.pathname.split('/');
      const type = pathParts[1] === 'movies' ? 'movie' : 'tv';

      // Safely get IDs from existing external links
      const imdbHref = $('#external-link-imdb').attr('href') || '';
      const imdbId = imdbHref.match(/tt\d+/)?.[0] || null;

      const tmdbHref = $('#external-link-tmdb').attr('href') || '';
      const tmdbMatch = tmdbHref.match(/\/(movie|tv)\/(\d+)/);
      const tmdbId = tmdbMatch ? tmdbMatch[2] : null;

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
        this.sortLinks();
      } catch (error) {
        logger.error(`Failed handling external links: ${error.message}`);
      }
    }

    sortLinks() {
      const container = $('.sidebar .external');
      const listItem = container.find('li').first();
      const links = listItem.children('a').detach();

      const orderMap = new Map(CONSTANTS.LINK_ORDER.map((name, i) => [name.toLowerCase(), i]));

      const sorted = links.toArray().sort((a, b) => {
        const getKey = el => {
          const $el = $(el);
          // Check data-site first, then data-original-title, then text
          return $el.data('site') ||
            $el.data('original-title') ||
            $el.text().trim();
        };

        // Normalize the key for comparison
        const aKey = getKey(a).toLowerCase();
        const bKey = getKey(b).toLowerCase();

        return (orderMap.get(aKey) ?? Infinity) - (orderMap.get(bKey) ?? Infinity);
      });

      listItem.append(sorted);
    }

    createLink(name, url) {
      // Create new external link element if it doesn't exist
      const id = `external-link-${name.toLowerCase().replace(/\s/g, '-')}`;
      if (!document.getElementById(id)) {
        $('.sidebar .external li').append(
          `<a target="_blank" id="${id}" href="${url}" data-original-title="" title="">${name}</a>`
        );
        logger.debug(`Added link: ${name} -> ${url}`);
      }
    }

    // ======================
    //  Wikidata Integration
    // ======================
    async processWikidataLinks() {
      // Handle Wikidata links with caching
      const cache = await GMC.getValue(this.mediaInfo.imdbId);

      if (this.isCacheValid(cache)) {
        this.addWikidataLinks(cache.links);
        return;
      }

      try {
        // Fetch fresh data from Wikidata API
        const data = await this.wikidata.links(this.mediaInfo.imdbId, 'IMDb', this.mediaInfo.type);
        await GMC.setValue(this.mediaInfo.imdbId, {
          links: data.links,
          item: data.item,
          time: Date.now()
        });
        this.addWikidataLinks(data.links);
        logger.debug(`Fetched new Wikidata links: ${JSON.stringify(data.links)}`);
      } catch (error) {
        logger.error(`Failed fetching Wikidata links: ${error.message}`);
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
      const customLinks = [{
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
          name: 'Moviemaze',
          url: () => {
            const show = this.mediaInfo.type === 'tv' ? `?season=${this.mediaInfo.season}&ep=${this.mediaInfo.episode}` : '';
            return `https://moviemaze.cc/watch/${this.mediaInfo.type}/${this.mediaInfo.tmdbId}${show}`;
          },
          condition: () => true,
          requiredData: 'tmdbId'
        },
        {
          name: 'P-Stream',
          url: () => {
            const show = this.mediaInfo.type === 'tv' ? `/${this.mediaInfo.season}/${this.mediaInfo.episode}` : '';
            return `https://iframe.pstream.mov/embed/tmdb-${this.mediaInfo.type}-${this.mediaInfo.tmdbId}${show}`;
          },
          condition: () => true,
          requiredData: 'tmdbId'
        },
        {
          name: 'Rive',
          url: () => {
            const show = this.mediaInfo.type === 'tv' ? `&season=${this.mediaInfo.season}&episode=${this.mediaInfo.episode}` : '';
            return `https://rivestream.org/watch?type=${this.mediaInfo.type}&id=${this.mediaInfo.tmdbId}${show}`;
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
    //  Collection Link Handling
    // ======================
    handleCollectionLinks() {
      if (!this.config.Mediux) return;

      const tmdbCollectionLinks = $('.text.readmore a[href*="themoviedb.org/collection/"]');

      tmdbCollectionLinks.each((index, element) => {
        const $tmdbLink = $(element);
        const tmdbUrl = $tmdbLink.attr('href');
        const collectionId = tmdbUrl.match(/collection\/(\d+)/)?.[1];

        if (collectionId) {
          const mediuxUrl = `https://mediux.pro/collections/${collectionId}`;
          const mediuxLink = `<p><a href="${mediuxUrl}" target="_blank" class="comment-link">Mediux Collection</a></p>`;

          if (!$tmdbLink.next(`a[href="${mediuxUrl}"]`).length) {
            $tmdbLink.after(`${mediuxLink}`);
          }
        }
      });
    }

    // ======================
    //  Cache Management
    // ======================
    isCacheValid(cache) {
      return cache &&
        !logger.debugEnabled &&
        (Date.now() - cache.time) < CONSTANTS.CACHE_DURATION;
    }

    linkExists(site) {
      return $(`#external-link-${site.toLowerCase().replace(/\s/g, '-')}`).length > 0;
    }

    async clearExpiredCache() {
      // Clear expired cache entries
      const values = await GMC.listValues();
      for (const value of values) {
        if (value === CONSTANTS.CONFIG_KEY) continue;
        const cache = await GMC.getValue(value);
        if (cache?.time && (Date.now() - cache.time) > CONSTANTS.CACHE_DURATION) {
          await GMC.deleteValue(value);
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
        [...CONSTANTS.METADATA_SITES, ...CONSTANTS.STREAMING_SITES].forEach(site => {
          const checkboxId = site.name.toLowerCase().replace(/\s+/g, '_');
          this.config[site.name] = $(`#${checkboxId}`).is(':checked');
        });

        await GMC.setValue(CONSTANTS.CONFIG_KEY, this.config);
        $(`#${CONSTANTS.SCRIPT_ID}-config`).remove();
        window.location.reload();
      });

      $('#clear-cache').click(async () => {
        const values = await GMC.listValues();
        for (const value of values) {
          if (value === CONSTANTS.CONFIG_KEY) continue;
          await GMC.deleteValue(value);
        }
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
