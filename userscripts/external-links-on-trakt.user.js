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
      { name: 'LiveChart', desc: 'Provides a direct link to LiveChart for the selected title.' }
    ],
    STREAMING_SITES: [
      { name: 'BrocoFlix', desc: 'Provides a direct link to the BrocoFlix streaming page for the selected title.' },
      { name: 'Cineby', desc: 'Provides a direct link to the Cineby streaming page for the selected title.' },
      { name: 'Moviemaze', desc: 'Provides a direct link to the Moviemaze streaming page for the selected title.' },
      { name: 'P-Stream', desc: 'Provides a direct link to the P-Stream streaming page for the selected title.' },
      { name: 'Rive', desc: 'Provides a direct link to the Rive streaming page for the selected title.' },
      { name: 'Wovie', desc: 'Provides a direct link to the Wovie streaming page for the selected title.' },
      { name: 'XPrime', desc: 'Provides a direct link to the XPrime streaming page for the selected title.' }
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

  // ==============================
  //  Main Application Class
  // ==============================
  class TraktExternalLinks {
    constructor() {
      this.config = { ...DEFAULT_CONFIG };
      this.mediaInfo = null;
      this.wikidata = null;
      this.armhaglund = null;
      this.anilist = null;
      this.linkSettings = [
        ...CONSTANTS.METADATA_SITES,
        ...CONSTANTS.STREAMING_SITES
      ];
    }

    // ==============================
    //  Initialization
    // ==============================
    async init() {
      await this.loadConfig();
      this.initializeAPIs();
      this.setupEventListeners();
    }

    async loadConfig() {
      const savedConfig = await GMC.getValue(CONSTANTS.CONFIG_KEY);
      if (savedConfig) {
        this.config = { ...DEFAULT_CONFIG, ...savedConfig };
      }
    }

    initializeAPIs() {
      this.wikidata = new Wikidata();
      this.armhaglund = new ArmHaglund();
      this.anilist = new AniList();
    }

    // ==============================
    //  Event Handling
    // ==============================
    setupEventListeners() {
      NodeCreationObserver.onCreation('.sidebar .external', () => this.handleExternalLinks());
      NodeCreationObserver.onCreation('body', () => this.addSettingsMenu());
      NodeCreationObserver.onCreation('.text.readmore', () => this.handleCollectionLinks());
    }

    // ==============================
    //  Media Information Extraction
    // ==============================
    getMediaInfo() {
      const pathParts = location.pathname.split('/');
      const type = pathParts[1] === 'movies' ? 'movie' : 'tv';

      const imdbHref = $('#external-link-imdb').attr('href') || '';
      const imdbId = imdbHref.match(/tt\d+/)?.[0] || null;

      const tmdbHref = $('#external-link-tmdb').attr('href') || '';
      const tmdbMatch = tmdbHref.match(/\/(movie|tv)\/(\d+)/);
      const tmdbId = tmdbMatch ? tmdbMatch[2] : null;

      const slug = pathParts[2] || '';
      const title = slug.split('-')
        .slice(1)
        .join('-')
        .replace(/-\d{4}$/, '');

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

    // ==============================
    //  Link Processing
    // ==============================
    async handleExternalLinks() {
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
          return $el.data('site') || $el.data('original-title') || $el.text().trim();
        };

        const aKey = getKey(a).toLowerCase();
        const bKey = getKey(b).toLowerCase();

        return (orderMap.get(aKey) ?? Infinity) - (orderMap.get(bKey) ?? Infinity);
      });

      listItem.append(sorted);
    }

    createLink(name, url) {
      const id = `external-link-${name.toLowerCase().replace(/\s/g, '-')}`;
      if (!document.getElementById(id)) {
        $('.sidebar .external li').append(
          `<a target="_blank" id="${id}" href="${url}" data-original-title="" title="">${name}</a>`
        );
        logger.debug(`Added link: ${name} -> ${url}`);
      }
    }

    // ==============================
    //  Wikidata Integration
    // ==============================
    async processWikidataLinks() {
      const cache = await GMC.getValue(this.mediaInfo.imdbId);

      if (this.isCacheValid(cache)) {
        this.addWikidataLinks(cache.links);
        this.mediaInfo.anilistId = cache.links.AniList?.value.match(/\/anime\/(\d+)/)?.[1];
        return;
      }

      try {
        let data = await this.wikidata.links(this.mediaInfo.imdbId, 'IMDb', this.mediaInfo.type);

        if (this.needsExtraIds(data.links)) {
          await this.fetchExtraIds(data);
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

    needsExtraIds(links) {
      const required = ['MyAnimeList', 'AniDB', 'AniList', 'Kitsu', 'AniSearch', 'LiveChart'];
      return required.some(site => !links[site]);
    }

    async fetchExtraIds(data) {
      try {
        const extData = await this.armhaglund.fetchIds('imdb', this.mediaInfo.imdbId);
        if (extData) {
          this.mergeExtraIds(data.links, extData);
        }
      } catch (extError) {
        logger.debug(`Failed to fetch from Arm Haglund: ${extError.message}`);
      }
    }

    mergeExtraIds(links, extData) {
      const urlMappings = {
        themoviedb: (id) => `https://www.themoviedb.org/${this.mediaInfo.type === 'movie' ? 'movie' : 'tv'}/${id}`,
        thetvdb: (id) => `https://thetvdb.com/dereferrer/${this.mediaInfo.type === 'movie' ? 'movie' : 'series'}/${id}`,
        imdb: (id) => `https://www.imdb.com/title/${id}`,
        myanimelist: (id) => `https://myanimelist.net/anime/${id}`,
        anidb: (id) => `https://anidb.net/anime/${id}`,
        anilist: (id) => `https://anilist.co/anime/${id}`,
        kitsu: (id) => `https://kitsu.app/anime/${id}`,
        anisearch: (id) => `https://www.anisearch.com/anime/${id}`,
        livechart: (id) => `https://www.livechart.me/anime/${id}`
      };

      const linkMappings = {
        themoviedb: 'TMDB',
        thetvdb: 'TVDB',
        imdb: 'IMDb',
        myanimelist: 'MyAnimeList',
        anidb: 'AniDB',
        anilist: 'AniList',
        kitsu: 'Kitsu',
        anisearch: 'AniSearch',
        livechart: 'LiveChart'
      };

      Object.keys(linkMappings).forEach(apiKey => {
        const linkKey = linkMappings[apiKey];
        if (!links[linkKey] && extData[apiKey]) {
          links[linkKey] = { value: urlMappings[apiKey](extData[apiKey]) };
        }
      });
    }

    addWikidataLinks(links) {
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

    // ==============================
    //  AniList Integration
    // ==============================
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
      if (!$('.sidebar .poster').length) return;

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
          logger.error(`Failed fetching AniList dub info: ${error.message}`);
        });
      });
    }

    displayDubInfo(hasEnglishDub) {
      if (!hasEnglishDub) return;
      const container = $('.sidebar .btn-watch-now');
      if (!container.length || $('.dub-info').length) return;
      container.after(`<div class="dub-info" style="border: 1px solid #000; padding: 4px; margin: 5px 0; background: #1d1d1d; border-radius: 4px; text-align: center;">English Dub Exists</div>`);
    }

    // ==============================
    //  Custom Link Builders
    // ==============================
    addCustomLinks() {
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

    // ==============================
    //  Collection Link Handling
    // ==============================
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

    // ==============================
    //  Cache Management
    // ==============================
    isCacheValid(cache) {
      return cache &&
        !logger.debugEnabled &&
        (Date.now() - cache.time) < CONSTANTS.CACHE_DURATION;
    }

    linkExists(site) {
      return $(`#external-link-${site.toLowerCase().replace(/\s/g, '-')}`).length > 0;
    }

    async clearExpiredCache() {
      const values = await GMC.listValues();
      for (const value of values) {
        if (value === CONSTANTS.CONFIG_KEY) continue;
        const cache = await GMC.getValue(value);
        if (cache?.time && (Date.now() - cache.time) > CONSTANTS.CACHE_DURATION) {
          await GMC.deleteValue(value);
        }
      }
    }

    // ==============================
    //  Settings UI
    // ==============================
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
      const generateSection = (title, sites, columns = 2) => `
        <div class="settings-section">
          <h3>${title}</h3>
          <div class="link-settings-grid" style="grid-template-columns: repeat(${columns}, 1fr);">
            ${sites.map(site => {
              const id = site.name.toLowerCase().replace(/\s+/g, '_');
              return `
                <div class="setting-item">
                  <label class="setting-label" for="${id}" title="${site.desc}">${site.name}</label>
                  <input type="checkbox" id="${id}" ${this.config[site.name] ? 'checked' : ''} class="checkbox">
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

              <div class="settings-section standalone">
                <h3>Dub Information</h3>
                <div class="setting-item">
                  <label class="setting-label" for="dub_information" title="${CONSTANTS.DUB_INFO.desc}">${CONSTANTS.DUB_INFO.name}</label>
                  <input type="checkbox" id="dub_information" ${this.config[CONSTANTS.DUB_INFO.name] ? 'checked' : ''} class="checkbox">
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
      const modalId = `${CONSTANTS.SCRIPT_ID}-config`;
      const styles = `#${modalId}{position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,.8);display:flex;justify-content:center;align-items:center;z-index:9999;font-family:'Roboto',sans-serif}#${modalId} .modal-content{background:#121212;color:#e0e0e0;border-radius:16px;width:600px;max-width:90%;box-shadow:0 10px 40px rgba(0,0,0,.6);overflow:hidden;display:flex;flex-direction:column}#${modalId} .modal-header{padding:1.5rem;background:#1f1f1f;border-bottom:1px solid #333;display:flex;justify-content:space-between;align-items:center}#${modalId} .modal-header h2{margin:0;font-size:1.8rem;font-weight:bold}#${modalId} .close-button{background:none;border:none;color:#aaa;font-size:1.5rem;cursor:pointer;transition:color .2s}#${modalId} .close-button:hover{color:#fff}#${modalId} .settings-sections{padding:1.5rem;flex:1;overflow-y:auto}#${modalId} .settings-section{margin-bottom:2rem}#${modalId} .settings-section.standalone{margin-top:2rem;padding-top:1rem;border-top:1px solid #333}#${modalId} .settings-section h3{font-size:1.4rem;margin-bottom:1rem;color:#fff}#${modalId} .link-settings-grid{display:grid;gap:1rem}#${modalId} .setting-item{display:flex;justify-content:space-between;align-items:center;padding:.75rem 1rem;background:#1f1f1f;border-radius:8px;transition:background .2s}#${modalId} .setting-item:hover{background:#292929}#${modalId} .setting-label{font-size:1rem;color:#e0e0e0}#${modalId} .checkbox{width:20px;height:20px;accent-color:#4caf50}#${modalId} .modal-footer{padding:1.5rem;background:#1f1f1f;border-top:1px solid #333;display:flex;justify-content:flex-end;gap:1rem}#${modalId} .btn{padding:.75rem 1.5rem;border-radius:8px;border:none;cursor:pointer;font-weight:500;font-size:.9rem;text-transform:uppercase;letter-spacing:.5px;transition:background .2s}#${modalId} .btn.save{background:#4caf50;color:#fff}#${modalId} .btn.save:hover{background:#45a049}#${modalId} .btn.warning{background:#f44336;color:#fff}#${modalId} .btn.warning:hover{background:#d32f2f}`;
      $('<style>').prop('type', 'text/css').html(styles).appendTo('head');
    }

    setupModalEventListeners() {
      const modalSelector = `#${CONSTANTS.SCRIPT_ID}-config`;
      $(`${modalSelector} .close-button`).click(() => $(modalSelector).remove());

      $(`${modalSelector} #save-config`).click(async () => {
        [...CONSTANTS.METADATA_SITES, ...CONSTANTS.STREAMING_SITES, CONSTANTS.DUB_INFO].forEach(site => {
          const checkboxId = site.name.toLowerCase().replace(/\s+/g, '_');
          this.config[site.name] = $(`${modalSelector} #${checkboxId}`).is(':checked');
        });

        await GMC.setValue(CONSTANTS.CONFIG_KEY, this.config);
        $(modalSelector).remove();
        window.location.reload();
      });

      $(`${modalSelector} #clear-cache`).click(async () => {
        const values = await GMC.listValues();
        for (const value of values) {
          if (value === CONSTANTS.CONFIG_KEY) continue;
          await GMC.deleteValue(value);
        }
        $(modalSelector).remove();
        window.location.reload();
      });
    }
  }

  // ==============================
  //  Script Initialization
  // ==============================
  $(document).ready(async () => {
    const traktLinks = new TraktExternalLinks();
    await traktLinks.init();
  });
})();
