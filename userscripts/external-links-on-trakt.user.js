// ==UserScript==
// @name          External links on Trakt
// @version       3.3.2
// @description   Adds more external links to Trakt.tv pages, including dub information for anime shows.
// @author        Journey Over
// @license       MIT
// @match         *://trakt.tv/*
// @require       https://cdn.jsdelivr.net/gh/StylusThemes/Userscripts@c185c2777d00a6826a8bf3c43bbcdcfeba5a9566/libs/gm/gmcompat.min.js
// @require       https://cdn.jsdelivr.net/gh/StylusThemes/Userscripts@c185c2777d00a6826a8bf3c43bbcdcfeba5a9566/libs/utils/utils.min.js
// @require       https://cdn.jsdelivr.net/gh/StylusThemes/Userscripts@[wip]/libs/metadata/wikidata/wikidata.min.js
// @require       https://cdn.jsdelivr.net/gh/StylusThemes/Userscripts@[wip]/libs/metadata/armhaglund/armhaglund.min.js
// @require       https://cdn.jsdelivr.net/gh/StylusThemes/Userscripts@[wip]/libs/metadata/anilist/anilist.min.js
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
    DUB_INFO: { name: 'Dub Information', desc: 'Show dub information for anime shows.' },
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
    ...CONSTANTS.STREAMING_SITES.map(site => [site.name, true]),
    [CONSTANTS.DUB_INFO.name, true]
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
      this.initializeArmHaglund();
      this.initializeAniList();
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
      this.wikidata = new Wikidata();
    }

    initializeArmHaglund() {
      this.armhaglund = new ArmHaglund();
    }

    initializeAniList() {
      this.anilist = new AniList();
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

        // Add dub info for anime if Anilist ID is available
        if (this.mediaInfo.anilistId) {
          this.addDubInfo();
        }
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
        this.mediaInfo.anilistId = cache.links.AniList?.value.match(/\/anime\/(\d+)/)?.[1];
        return;
      }

      try {
        // Fetch fresh data from Wikidata API
        let data = await this.wikidata.links(this.mediaInfo.imdbId, 'IMDb', this.mediaInfo.type);

        // If extra properties like AniList, AniDB, or MyAnimeList are missing,
        // try to fetch them using Arm Haglund API.
        if (!data.links.MyAnimeList || !data.links.AniDB || !data.links.AniList || !data.links.Kitsu || !data.links.AniSearch || !data.links.LiveChart) {
          try {
            const extData = await this.armhaglund.fetchIds("imdb", this.mediaInfo.imdbId);
            if (extData) {
              const mapping = {
                themoviedb: "TMDB",
                thetvdb: "TVDB",
                imdb: "IMDB",
                myanimelist: "MyAnimeList",
                anidb: "AniDB",
                anilist: "AniList",
                kitsu: "Kitsu",
                anisearch: "AniSearch",
                livechart: "LiveChart"
              };

              Object.keys(mapping).forEach((apiKey) => {
                const linkKey = mapping[apiKey];
                if (!data.links[linkKey] && extData[apiKey]) {
                  data.links[linkKey] = {
                    value: apiKey === "themoviedb" ? `https://www.themoviedb.org/${this.mediaInfo.type === 'movie' ? 'movie' : 'tv'}/${extData[apiKey]}` : apiKey === "thetvdb" ? `https://thetvdb.com/dereferrer/${this.mediaInfo.type === 'movie' ? 'movie' : 'series'}/${extData[apiKey]}` : apiKey === "imdb" ? `https://www.imdb.com/title/${extData[apiKey]}` : `https://${apiKey === 'myanimelist' ? 'myanimelist.net/anime' : apiKey === 'anidb' ? 'anidb.net/anime' : apiKey === 'anilist' ? 'anilist.co/anime' : apiKey === 'kitsu' ? 'kitsu.app/anime' : apiKey === 'anisearch' ? 'www.anisearch.com/anime' : 'www.livechart.me/anime'}/${extData[apiKey]}`
                  };
                }
              });
            }
          } catch (extError) {
            logger.debug(`Failed to fetch from Arm Haglund: ${extError.message}`);
          }
        }

        await GMC.setValue(this.mediaInfo.imdbId, {
          links: data.links,
          item: data.item,
          time: Date.now()
        });
        this.addWikidataLinks(data.links);
        this.mediaInfo.anilistId = data.links.AniList?.value.match(/\/anime\/(\d+)/)?.[1];
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
    //  Anilist Integration
    // ======================
    async queryAnilist(id) {
      const query = `
        query ($id: Int) {
          Media(id: $id, type: ANIME) {
            characters(sort: ROLE) {
              edges {
                role
                jpVoiceActors: voiceActors(language: JAPANESE) {
                  name {
                    full
                  }
                }
                enVoiceActors: voiceActors(language: ENGLISH) {
                  name {
                    full
                  }
                }
                node {
                  name {
                    full
                  }
                }
              }
            }
          }
        }
      `;

      const response = await this.anilist.query(query, { id: parseInt(id) });

      return response.data.Media.characters.edges.filter(edge => edge.role === 'MAIN');
    }

    addDubInfo() {
      if (!this.config['Dub Information'] || !this.mediaInfo?.anilistId) return;

      const titleElement = $('.mobile-title h1');
      if (!titleElement.length) return; // wait for element to exist

      const cacheKey = this.mediaInfo.imdbId;
      GMC.getValue(cacheKey).then(cache => {
        if (cache && cache.isdubbed !== undefined) {
          this.displayDubInfo(cache.isdubbed);
          return;
        }

        this.queryAnilist(this.mediaInfo.anilistId).then(edges => {
          const hasEnglishDub = edges.some(edge => edge.enVoiceActors && edge.enVoiceActors.length > 0);
          const updatedCache = { ...cache, isdubbed: hasEnglishDub };
          GMC.setValue(cacheKey, updatedCache);
          this.displayDubInfo(hasEnglishDub);
        }).catch(error => {
          logger.error(`Failed fetching Anilist dub info: ${error.message}`);
        });
      });
    }

    displayDubInfo(hasEnglishDub) {
      const container = $('.additional-stats');
      if (container.find('.dub-info').length) return; // already added

      const dubText = hasEnglishDub ? 'Yes' : 'No';

      container.append(`<li class="dub-info"><label>Dubbed in English</label>${dubText}</li>`);
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
      const generateSection = (title, sites, columns = 2) => `
        <div class="settings-section">
          <h3><i class="fas fa-link"></i> ${title}</h3>
          <div class="link-settings-grid" style="grid-template-columns: repeat(${columns}, 1fr);">
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
              ${generateSection('Other', [CONSTANTS.DUB_INFO], 1)}
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
      const styles = `#${CONSTANTS.SCRIPT_ID}-config{position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.8);backdrop-filter:blur(5px);z-index:9999;display:flex;justify-content:center;align-items:center;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;}#${CONSTANTS.SCRIPT_ID}-config .modal-content{background:linear-gradient(135deg,#2a2a2a 0%,#1a1a1a 100%);color:#fff;border-radius:16px;width:500px;max-width:90vw;max-height:90vh;box-shadow:0 20px 60px rgba(0,0,0,0.5);border:1px solid rgba(255,255,255,0.1);overflow:hidden;display:flex;flex-direction:column;}#${CONSTANTS.SCRIPT_ID}-config .modal-header{padding:1.5rem 2rem;border-bottom:1px solid rgba(255,255,255,0.1);position:relative;display:flex;justify-content:space-between;align-items:center;background:rgba(255,255,255,0.05);}#${CONSTANTS.SCRIPT_ID}-config .modal-header h2{margin:0;font-size:1.5rem;font-weight:600;color:#fff;}#${CONSTANTS.SCRIPT_ID}-config .close-button{background:none;border:none;color:#aaa;font-size:1.5rem;cursor:pointer;padding:0 0.5rem;border-radius:4px;transition:all 0.2s ease;}#${CONSTANTS.SCRIPT_ID}-config .close-button:hover{background:rgba(255,255,255,0.1);color:#fff;}#${CONSTANTS.SCRIPT_ID}-config .settings-sections{padding:2rem;flex:1;overflow-y:auto;scrollbar-width:thin;scrollbar-color:rgba(255,255,255,0.3) transparent;}#${CONSTANTS.SCRIPT_ID}-config .settings-sections::-webkit-scrollbar{width:6px;}#${CONSTANTS.SCRIPT_ID}-config .settings-sections::-webkit-scrollbar-track{background:transparent;}#${CONSTANTS.SCRIPT_ID}-config .settings-sections::-webkit-scrollbar-thumb{background:rgba(255,255,255,0.3);border-radius:3px;}#${CONSTANTS.SCRIPT_ID}-config .settings-section{margin-bottom:2rem;}#${CONSTANTS.SCRIPT_ID}-config .settings-section h3{font-size:1.2rem;margin:0 0 1.5rem;color:#fff;display:flex;align-items:center;gap:0.5rem;font-weight:500;}#${CONSTANTS.SCRIPT_ID}-config .link-settings-grid{display:grid;gap:1rem;}#${CONSTANTS.SCRIPT_ID}-config .setting-item{display:flex;justify-content:space-between;align-items:center;padding:1rem;border-radius:8px;background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.1);transition:all 0.2s ease;}#${CONSTANTS.SCRIPT_ID}-config .setting-item:hover{background:rgba(255,255,255,0.08);border-color:rgba(255,255,255,0.2);transform:translateY(-1px);}#${CONSTANTS.SCRIPT_ID}-config .setting-info{flex-grow:1;margin-right:1.5rem;}#${CONSTANTS.SCRIPT_ID}-config .setting-info label{display:block;font-weight:500;margin-bottom:0.25rem;cursor:help;color:#fff;}#${CONSTANTS.SCRIPT_ID}-config .description{color:#aaa;font-size:0.9rem;line-height:1.4;}#${CONSTANTS.SCRIPT_ID}-config .switch{flex-shrink:0;position:relative;display:inline-block;width:50px;height:24px;}#${CONSTANTS.SCRIPT_ID}-config .switch input{opacity:0;width:0;height:0;}#${CONSTANTS.SCRIPT_ID}-config .slider{position:absolute;cursor:pointer;top:0;left:0;right:0;bottom:0;background:#444;border-radius:24px;transition:0.3s;}#${CONSTANTS.SCRIPT_ID}-config .slider:before{position:absolute;content:"";height:18px;width:18px;left:3px;bottom:3px;background:white;border-radius:50%;transition:0.3s;}#${CONSTANTS.SCRIPT_ID}-config input:checked + .slider{background:#4CAF50;}#${CONSTANTS.SCRIPT_ID}-config input:checked + .slider:before{transform:translateX(26px);}#${CONSTANTS.SCRIPT_ID}-config .modal-footer{padding:1.5rem 2rem;border-top:1px solid rgba(255,255,255,0.1);display:flex;gap:1rem;justify-content:flex-end;background:rgba(255,255,255,0.05);}#${CONSTANTS.SCRIPT_ID}-config .btn{padding:0.75rem 1.5rem;border-radius:8px;border:none;cursor:pointer;font-weight:500;font-size:0.9rem;transition:all 0.2s ease;text-transform:uppercase;letter-spacing:0.5px;}#${CONSTANTS.SCRIPT_ID}-config .btn.save{background:linear-gradient(135deg,#4CAF50 0%,#45a049 100%);color:#fff;box-shadow:0 4px 15px rgba(76,175,80,0.3);}#${CONSTANTS.SCRIPT_ID}-config .btn.save:hover{transform:translateY(-2px);box-shadow:0 6px 20px rgba(76,175,80,0.4);}#${CONSTANTS.SCRIPT_ID}-config .btn.warning{background:linear-gradient(135deg,#f44336 0%,#d32f2f 100%);color:#fff;box-shadow:0 4px 15px rgba(244,67,54,0.3);}#${CONSTANTS.SCRIPT_ID}-config .btn.warning:hover{transform:translateY(-2px);box-shadow:0 6px 20px rgba(244,67,54,0.4);}`;
      $('<style>').prop('type', 'text/css').html(styles).appendTo('head');
    }

    setupModalEventListeners() {
      $('.close-button').click(() => $(`#${CONSTANTS.SCRIPT_ID}-config`).remove());

      $('#save-config').click(async () => {
        [...CONSTANTS.METADATA_SITES, ...CONSTANTS.STREAMING_SITES, CONSTANTS.DUB_INFO].forEach(site => {
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
