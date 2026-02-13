// ==UserScript==
// @name          External links on Trakt
// @version       3.6.0
// @description   Adds more external links to Trakt.tv pages, including dub information for anime shows.
// @author        Journey Over
// @license       MIT
// @match         *://trakt.tv/*
// @require       https://cdn.jsdelivr.net/gh/StylusThemes/Userscripts@0171b6b6f24caea737beafbc2a8dacd220b729d8/libs/utils/utils.min.js
// @require       https://cdn.jsdelivr.net/gh/StylusThemes/Userscripts@644b86d55bf5816a4fa2a165bdb011ef7c22dfe1/libs/metadata/wikidata/wikidata.min.js
// @require       https://cdn.jsdelivr.net/gh/StylusThemes/Userscripts@644b86d55bf5816a4fa2a165bdb011ef7c22dfe1/libs/metadata/armhaglund/armhaglund.min.js
// @require       https://cdn.jsdelivr.net/gh/StylusThemes/Userscripts@644b86d55bf5816a4fa2a165bdb011ef7c22dfe1/libs/metadata/anilist/anilist.min.js
// @require       https://cdn.jsdelivr.net/npm/node-creation-observer@1.2.0/release/node-creation-observer-latest.min.js
// @require       https://cdn.jsdelivr.net/npm/jquery@3.7.1/dist/jquery.min.js
// @grant         GM_deleteValue
// @grant         GM_getValue
// @grant         GM_listValues
// @grant         GM_setValue
// @grant         GM_xmlhttpRequest
// @grant         GM_info
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

  // Define all custom sites here.
  // group: 'streaming' or 'metadata' (determines which tab they appear in settings)
  // movie/tv: URL templates. Use {tmdbId}, {imdbId}, {title}, {season}, {episode}, {type}
  // set movie/tv to null if the site doesn't support that format.
  const SITE_DEFINITIONS = {
    'Rotten Tomatoes': { group: 'metadata', desc: 'Provides a direct link to Rotten Tomatoes.', builtIn: true },
    'Metacritic': { group: 'metadata', desc: 'Provides a direct link to Metacritic.', builtIn: true },
    'TVmaze': { group: 'metadata', desc: 'Provides a direct link to TVmaze.', builtIn: true },
    'MyAnimeList': { group: 'metadata', desc: 'Provides a direct link to MyAnimeList.', builtIn: true },
    'AniDB': { group: 'metadata', desc: 'Provides a direct link to AniDB.', builtIn: true },
    'AniList': { group: 'metadata', desc: 'Provides a direct link to AniList.', builtIn: true },
    'Kitsu': { group: 'metadata', desc: 'Provides a direct link to Kitsu.', builtIn: true },
    'AniSearch': { group: 'metadata', desc: 'Provides a direct link to AniSearch.', builtIn: true },
    'LiveChart': { group: 'metadata', desc: 'Provides a direct link to LiveChart.', builtIn: true },
    'Letterboxd': {
      group: 'metadata',
      desc: 'Provides a direct link to Letterboxd.',
      movie: 'https://letterboxd.com/tmdb/{tmdbId}',
      tv: null // Letterboxd is primarily movies
    },
    'Mediux': {
      group: 'metadata',
      desc: 'Provides a direct link to the Mediux Poster site.',
      movie: 'https://mediux.pro/movies/{tmdbId}',
      tv: 'https://mediux.pro/shows/{tmdbId}'
    },
    'Bobmovies': {
      group: 'streaming',
      desc: 'Provides a direct link to the Bobmovies streaming page.',
      movie: 'https://bobmovies.org/watch/movie/{tmdbId}',
      tv: 'https://bobmovies.org/watch/tv/{tmdbId}?season={season}&episode={episode}'
    },
    'Cineby': {
      group: 'streaming',
      desc: 'Provides a direct link to the Cineby streaming page.',
      movie: 'https://www.cineby.gd/movie/{tmdbId}',
      tv: 'https://www.cineby.gd/tv/{tmdbId}/{season}/{episode}?play=true'
    },
    'P-Stream': {
      group: 'streaming',
      desc: 'Provides a direct link to the P-Stream streaming page.',
      movie: 'https://pstream.mov/media/tmdb-movie-{tmdbId}',
      tv: 'https://pstream.mov/media/tmdb-tv-{tmdbId}/{season}/{episode}'
    },
    'Rive': {
      group: 'streaming',
      desc: 'Provides a direct link to the Rive streaming page.',
      movie: 'https://rivestream.org/watch?type=movie&id={tmdbId}',
      tv: 'https://rivestream.org/watch?type=tv&id={tmdbId}&season={season}&episode={episode}'
    }
  };

  const CONSTANTS = {
    CACHE_DURATION: 24 * 60 * 60 * 1000,
    SCRIPT_ID: GM_info.script.name.toLowerCase().replace(/\s/g, '-'),
    CONFIG_KEY: 'external-trakt-links-config',
    DUB_LANGUAGE_KEY: 'Dub Language',

    // Dynamic lists for settings menu
    METADATA_SITES: Object.entries(SITE_DEFINITIONS)
      .filter(([, definition]) => definition.group === 'metadata')
      .map(([name, definition]) => ({ name, desc: definition.desc })),

    STREAMING_SITES: Object.entries(SITE_DEFINITIONS)
      .filter(([, definition]) => definition.group === 'streaming')
      .map(([name, definition]) => ({ name, desc: definition.desc })),

    DUB_INFO: { name: 'Dub Information', desc: 'Show dub information for anime shows.' },
    DUB_LANGUAGES: [
      { name: 'English', value: 'ENGLISH' },
      { name: 'German', value: 'GERMAN' },
      { name: 'Italian', value: 'ITALIAN' },
      { name: 'Spanish', value: 'SPANISH' },
      { name: 'French', value: 'FRENCH' },
      { name: 'Korean', value: 'KOREAN' },
      { name: 'Portuguese', value: 'PORTUGUESE' },
      { name: 'Hebrew', value: 'HEBREW' },
      { name: 'Hungarian', value: 'HUNGARIAN' },
      { name: 'Chinese', value: 'CHINESE' },
      { name: 'Arabic', value: 'ARABIC' },
      { name: 'Filipino', value: 'FILIPINO' },
      { name: 'Catalan', value: 'CATALAN' },
      { name: 'Polish', value: 'POLISH' },
      { name: 'Norwegian', value: 'NORWEGIAN' }
    ],
    LINK_ORDER: [
      'Official Site', 'IMDb', 'TMDB', 'TVDB', 'Rotten Tomatoes', 'Metacritic',
      'Letterboxd', 'TVmaze', 'MyAnimeList', 'AniDB', 'AniList', 'Kitsu',
      'AniSearch', 'LiveChart', 'Fanart.tv', 'Mediux', 'Bobmovies', 'Cineby',
      'Moviemaze', 'P-Stream', 'Rive', 'Wovie', 'XPrime', 'JustWatch',
      'Wikipedia', 'Twitter', 'Facebook', 'Instagram'
    ]
  };

  const DEFAULT_CONFIG = Object.fromEntries([
    ...CONSTANTS.METADATA_SITES.map(site => [site.name, true]),
    ...CONSTANTS.STREAMING_SITES.map(site => [site.name, true]),
    [CONSTANTS.DUB_INFO.name, true],
    [CONSTANTS.DUB_LANGUAGE_KEY, 'ENGLISH']
  ]);

  class TraktExternalLinks {
    constructor() {
      this.config = { ...DEFAULT_CONFIG };
      this.mediaInfo = null;
      this.wikidata = null;
      this.armhaglund = null;
      this.anilist = null;
    }

    async init() {
      await this.loadConfig();
      this.initializeAPIs();
      this.setupEventListeners();
    }

    async loadConfig() {
      const savedConfig = GM_getValue(CONSTANTS.CONFIG_KEY);
      if (savedConfig) {
        this.config = { ...DEFAULT_CONFIG, ...savedConfig };
      }
    }

    initializeAPIs() {
      this.wikidata = new Wikidata();
      this.armhaglund = new ArmHaglund();
      this.anilist = new AniList();
    }

    setupEventListeners() {
      NodeCreationObserver.onCreation('.sidebar .external', () => this.handleExternalLinks());
      NodeCreationObserver.onCreation('body', () => this.addSettingsMenu());
      NodeCreationObserver.onCreation('.text.readmore', () => this.handleCollectionLinks());
    }

    // Extract media information from URL path and existing external links
    getMediaInfo() {
      const pathParts = location.pathname.split('/');
      const type = pathParts[1] === 'movies' ? 'movie' : 'tv';

      const imdbHref = $('#external-link-imdb').attr('href') || '';
      const imdbId = imdbHref.match(/tt\d+/)?.[0] || null;

      const tmdbHref = $('#external-link-tmdb').attr('href') || '';
      const tmdbMatch = tmdbHref.match(/\/(movie|tv)\/(\d+)/);
      const tmdbId = tmdbMatch?.[2] || null;

      const slug = pathParts[2] || '';
      const title = slug
        .split('-')
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
        slug,
        season: season || '1',
        episode: episode || '1',
        isSeasonPage: !!season && !episode
      };
    }

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

    // Sort links according to predefined order, keeping unknown links at the end
    sortLinks() {
      const container = $('.sidebar .external');
      const listItem = container.find('li').first();
      const links = listItem.children('a').detach();

      const getKey = element => {
        const $element = $(element);
        const key = $element.data('site') || $element.data('original-title') || $element.text().trim();
        return key.toLowerCase();
      };

      const orderMap = new Map(
        CONSTANTS.LINK_ORDER.map((name, index) => [name.toLowerCase(), index])
      );

      const sorted = links.toArray().sort((firstLink, secondLink) => {
        const aKey = getKey(firstLink);
        const bKey = getKey(secondLink);
        const aOrder = orderMap.get(aKey) ?? Infinity;
        const bOrder = orderMap.get(bKey) ?? Infinity;

        return aOrder - bOrder;
      });

      listItem.append(sorted);
    }

    createLink(name, url) {
      const id = `external-link-${name.toLowerCase().replace(/\s/g, '-')}`;

      if (document.getElementById(id)) return;

      const linkElement = `<a target="_blank" id="${id}" href="${url}" data-original-title="" title="">${name}</a>`;
      $('.sidebar .external li').append(linkElement);
      logger.debug(`Added link: ${name} -> ${url}`);
    }

    // Fetch Wikidata links with fallback to ArmHaglund for missing anime IDs
    async processWikidataLinks() {
      const cache = GM_getValue(this.mediaInfo.imdbId);

      if (this.isCacheValid(cache)) {
        this.addWikidataLinks(cache.links);
        this.mediaInfo.anilistId = cache.links.AniList?.value.match(/\/anime\/(\d+)/)?.[1];
        return;
      }

      try {
        const data = await this.wikidata.links(this.mediaInfo.imdbId, 'IMDb', this.mediaInfo.type);

        // ArmHaglund provides better anime ID coverage than Wikidata
        if (this.needsExtraIds(data.links)) {
          await this.fetchExtraIds(data);
        }

        const hasMeaningfulData = Object.keys(data.links).length > 0 || data.item;

        if (hasMeaningfulData) {
          GM_setValue(this.mediaInfo.imdbId, {
            links: data.links,
            item: data.item,
            time: Date.now()
          });

          this.addWikidataLinks(data.links);
          this.mediaInfo.anilistId = data.links.AniList?.value.match(/\/anime\/(\d+)/)?.[1];
          logger.debug(`Fetched new Wikidata links: ${JSON.stringify(data.links)}`);
        }
      } catch (error) {
        logger.error(`Failed fetching Wikidata links: ${error.message}`);
        // Don't create empty cache entries on failure
      }
    }

    // Check if we're missing key anime database links that ArmHaglund can provide
    needsExtraIds(links) {
      const required = ['MyAnimeList', 'AniDB', 'AniList', 'Kitsu', 'AniSearch', 'LiveChart'];
      return required.some(site => !links[site]);
    }

    async fetchExtraIds(data) {
      try {
        const extensionData = await this.armhaglund.fetchIds('imdb', this.mediaInfo.imdbId);
        if (extensionData) {
          this.mergeExtraIds(data.links, extensionData);
        }
      } catch (extensionError) {
        logger.debug(`Failed to fetch from Arm Haglund: ${extensionError.message}`);
      }
    }

    // Map ArmHaglund API response keys to Wikidata link format and URLs
    mergeExtraIds(links, extensionData) {
      const URL_MAPPINGS = {
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

      const LINK_MAPPINGS = {
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

      for (const [apiKey, linkKey] of Object.entries(LINK_MAPPINGS)) {
        if (!links[linkKey] && extensionData[apiKey]) {
          links[linkKey] = { value: URL_MAPPINGS[apiKey](extensionData[apiKey]) };
        }
      }
    }

    addWikidataLinks(links) {
      const animeSites = new Set(['MyAnimeList', 'AniDB', 'AniList', 'Kitsu', 'AniSearch', 'LiveChart']);

      for (const [site, link] of Object.entries(links)) {
        if (
          site !== 'Trakt' &&
          link?.value &&
          this.config[site] !== false &&
          !this.linkExists(site) &&
          // Don't show anime sites on season pages (they're show-level only for now)
          !(this.mediaInfo.isSeasonPage && animeSites.has(site))
        ) {
          this.createLink(site, link.value);
        }
      }
    }

    // Query AniList for dub information using voice actor language filtering
    async queryAnilist(id) {
      const query = `
        query($id: Int!, $type: MediaType, $page: Int = 1, $language: StaffLanguage){
          Media(id: $id, type: $type){
            characters(page: $page, sort: [ROLE], role: MAIN){
              edges {
                node{id}
                voiceActors(language: $language){language}
              }
            }
          }
        }
      `;

      const response = await this.anilist.query(query, {
        id: parseInt(id),
        type: 'ANIME',
        language: this.config[CONSTANTS.DUB_LANGUAGE_KEY]
      });
      return response.data.Media.characters.edges;
    }

    addDubInfo() {
      if (!this.config['Dub Information'] || !this.mediaInfo?.anilistId) return;
      if (!$('.sidebar .poster').length) return;

      const cacheKey = this.mediaInfo.imdbId;
      const selectedLanguage = this.config['Dub Language'];

      const cache = GM_getValue(cacheKey);
      if (cache?.dubStatus?.[selectedLanguage] !== undefined) {
        this.displayDubInfo(cache.dubStatus[selectedLanguage]);
        return;
      }

      this.queryAnilist(this.mediaInfo.anilistId)
        .then(edges => {
          // Check if any main characters have voice actors in the selected language
          const hasDub = edges.some(edge => edge.voiceActors?.length > 0);
          const updatedCache = {
            ...cache,
            dubStatus: {
              ...cache?.dubStatus,
              [selectedLanguage]: hasDub
            }
          };
          GM_setValue(cacheKey, updatedCache);
          this.displayDubInfo(hasDub);
        })
        .catch(error => {
          logger.error(`Failed fetching AniList dub info: ${error.message}`);
          // Cache the failure to avoid repeated API calls
          const currentCache = GM_getValue(cacheKey);
          const updatedCache = {
            ...currentCache,
            dubStatus: {
              ...currentCache?.dubStatus,
              [selectedLanguage]: false
            }
          };
          GM_setValue(cacheKey, updatedCache);
        });
    }

    displayDubInfo(hasDub) {
      if (!hasDub) return;

      const selectedLang = CONSTANTS.DUB_LANGUAGES.find(
        lang => lang.value === this.config['Dub Language']
      );
      const langName = selectedLang?.name || 'Dub';
      const container = $('.sidebar .btn-watch-now');

      if (!container.length || $('.dubbed-info').length) return;

      const dubbedInfoHtml = `
        <div class="dubbed-info" style="
          border: 1px solid #000;
          padding: 4px;
          margin: 5px 0;
          background: transparent;
          border-radius: 4px;
          text-align: center;
        ">${langName} Dub Exists</div>
      `;

      container.after(dubbedInfoHtml);
    }

    // Resolves a URL template by replacing placeholders with actual values
    resolveUrl(template) {
      if (!template) return null;

      // Simple regex to find {placeholders}
      return template.replace(/{(\w+)}/g, (match, key) => {
        // If the key is not in mediaInfo, or null, returns an empty string which might break the URL.
        // In this specific context, we usually want to abort if a required ID is missing.
        const value = this.mediaInfo[key];
        return value !== undefined && value !== null ? value : '';
      });
    }

    // Adds custom links to the media info sidebar
    addCustomLinks() {
      for (const [siteName, siteDefinition] of Object.entries(SITE_DEFINITIONS)) {
        // Skip built-in sites (handled by wikidata) or disabled sites
        if (siteDefinition.builtIn || this.config[siteName] === false) continue;

        // Skip if link already exists
        if (this.linkExists(siteName)) continue;

        const template = this.mediaInfo.type === 'movie' ? siteDefinition.movie : siteDefinition.tv;

        // If no template for this type (e.g. Letterboxd for TV), skip
        if (!template) continue;

        // Check for required data (if template uses {tmdbId}, ensure we have it)
        if (template.includes('{tmdbId}') && !this.mediaInfo.tmdbId) continue;
        if (template.includes('{imdbId}') && !this.mediaInfo.imdbId) continue;

        const url = this.resolveUrl(template);
        if (url) {
          this.createLink(siteName, url);
        }
      }
    }

    handleCollectionLinks() {
      if (!this.config.Mediux) return;

      const tmdbCollectionLinks = $('.text.readmore a[href*="themoviedb.org/collection/"]');

      for (const element of tmdbCollectionLinks) {
        const $tmdbLink = $(element);
        const tmdbUrl = $tmdbLink.attr('href');
        const collectionIdMatch = tmdbUrl.match(/collection\/(\d+)/);

        if (!collectionIdMatch) continue;

        const collectionId = collectionIdMatch[1];
        const mediuxUrl = `https://mediux.pro/collections/${collectionId}`;

        if ($tmdbLink.next(`a[href="${mediuxUrl}"]`).length) continue;

        const mediuxLink = `<p><a href="${mediuxUrl}" target="_blank" class="comment-link">Mediux Collection</a></p>`;
        $tmdbLink.after(mediuxLink);
      }
    }

    isCacheValid(cache) {
      if (!cache) return false;
      // Bypass cache in debug mode to test fresh data
      if (logger.debugEnabled) return false;
      return (Date.now() - cache.time) < CONSTANTS.CACHE_DURATION;
    }

    linkExists(site) {
      return $(`#external-link-${site.toLowerCase().replace(/\s/g, '-')}`).length > 0;
    }

    clearExpiredCache() {
      try {
        const values = GM_listValues();
        for (const value of values) {
          if (value === CONSTANTS.CONFIG_KEY) continue;
          const cache = GM_getValue(value);
          if (cache?.time && (Date.now() - cache.time) > CONSTANTS.CACHE_DURATION) {
            GM_deleteValue(value);
          }
        }
      } catch (error) {
        logger.error(`Failed to clear expired cache: ${error.message}`);
      }
    }

    addSettingsMenu() {
      const menuItem = `<li class="${CONSTANTS.SCRIPT_ID}"><a href="javascript:void(0)" aria-haspopup="dialog">EL Settings</a></li>`;
      $('div.user-wrapper ul.menu li.divider').last().after(menuItem);
      $(`.${CONSTANTS.SCRIPT_ID}`).click(() => this.openSettingsModal());
    }

    openSettingsModal() {
      const existingModal = $(`#${CONSTANTS.SCRIPT_ID}-config`);
      if (existingModal.length) existingModal.remove();

      const modalHTML = this.generateSettingsModalHTML();
      $(modalHTML).appendTo('body');
      this.addModalStyles();
      this.setupModalEventListeners();
      $('body').css('overflow', 'hidden');
    }

    addModalStyles() {
      const id = `${CONSTANTS.SCRIPT_ID}-config`;
      const styles = `#${id}{--tel-red:#ed1c24;--tel-red-hover:#c01219;--tel-bg:#f4f6f8;--tel-panel:#ffffff;--tel-border:#dcdfe6;--tel-text:#222;--tel-text-dim:#666;--tel-hover:#f0f2f5;--tel-input-bg:#e0e0e0;--tel-overlay:rgba(0,0,0,0.5)}body.dark-knight #${id}{--tel-bg:#1d1d1d;--tel-panel:#242424;--tel-border:#333;--tel-text:#eee;--tel-text-dim:#999;--tel-hover:#2f2f2f;--tel-input-bg:#444;--tel-overlay:rgba(0,0,0,0.85)}#${id}{position:fixed;inset:0;z-index:10000;display:flex;align-items:center;justify-content:center;background:var(--tel-overlay);backdrop-filter:blur(5px);font-family:'Proxima Nova','Open Sans',Arial,sans-serif;opacity:0;animation:tel-fade-in 0.2s forwards}@keyframes tel-fade-in{to{opacity:1}}#${id} .tel-modal{width:800px;max-width:90%;height:600px;max-height:90vh;background:var(--tel-bg);border-radius:8px;box-shadow:0 20px 50px rgba(0,0,0,0.5);display:flex;flex-direction:column;overflow:hidden;border:1px solid var(--tel-border)}#${id} .tel-header{padding:20px 25px;border-bottom:1px solid var(--tel-border);display:flex;justify-content:space-between;align-items:center;background:var(--tel-panel)}#${id} .tel-header h2{margin:0;font-size:20px;color:var(--tel-text);font-weight:600}#${id} .tel-close{background:none;border:none;color:var(--tel-text-dim);font-size:24px;cursor:pointer;line-height:1}#${id} .tel-close:hover{color:var(--tel-text)}#${id} .tel-body{flex:1;display:flex;overflow:hidden}#${id} .tel-sidebar{width:200px;background:var(--tel-bg);border-right:1px solid var(--tel-border);padding:15px 0;display:flex;flex-direction:column;gap:5px}#${id} .tel-nav-item{padding:12px 20px;cursor:pointer;color:var(--tel-text-dim);font-size:14px;font-weight:500;transition:0.2s;border-left:3px solid transparent}#${id} .tel-nav-item:hover{color:var(--tel-text);background:var(--tel-hover)}#${id} .tel-nav-item.active{color:var(--tel-text);background:rgba(237,28,36,0.1);border-left-color:var(--tel-red)}#${id} .tel-content{flex:1;padding:0;overflow-y:auto;position:relative}#${id} .tel-tab-pane{display:none;padding:25px}#${id} .tel-tab-pane.active{display:block;animation:tel-slide-up 0.3s ease}@keyframes tel-slide-up{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:translateY(0)}}#${id} .tel-list-item{display:flex;align-items:center;justify-content:space-between;padding:12px 15px;margin-bottom:8px;background:var(--tel-panel);border-radius:6px;border:1px solid transparent;transition:0.2s}#${id} .tel-list-item:hover{border-color:var(--tel-border)}#${id} .tel-info h4{margin:0 0 4px;font-size:15px;color:var(--tel-text)}#${id} .tel-info p{margin:0;font-size:12px;color:var(--tel-text-dim)}#${id} .tel-toggle{position:relative;width:44px;height:24px;flex-shrink:0}#${id} .tel-toggle input{opacity:0;width:0;height:0}#${id} .tel-slider{position:absolute;cursor:pointer;inset:0;background-color:var(--tel-input-bg);border-radius:24px;transition:.3s}#${id} .tel-slider:before{position:absolute;content:"";height:18px;width:18px;left:3px;bottom:3px;background-color:#fff;border-radius:50%;transition:.3s;box-shadow:0 2px 4px rgba(0,0,0,0.2)}#${id} input:checked+.tel-slider{background-color:var(--tel-red)}#${id} input:checked+.tel-slider:before{transform:translateX(20px)}#${id} .tel-select-group{margin-top:20px}#${id} .tel-select-label{display:block;margin-bottom:8px;font-weight:600;color:var(--tel-text)}#${id} .tel-select{width:100%;padding:10px;border-radius:4px;background:var(--tel-panel);border:1px solid var(--tel-border);color:var(--tel-text);font-size:14px;outline:none}#${id} .tel-select:focus{border-color:var(--tel-red)}#${id} .tel-footer{padding:15px 25px;border-top:1px solid var(--tel-border);background:var(--tel-panel);display:flex;justify-content:space-between}#${id} .tel-btn{padding:8px 16px;border-radius:4px;font-size:13px;font-weight:600;cursor:pointer;border:none;transition:0.2s}#${id} .tel-btn-ghost{background:transparent;color:var(--tel-text-dim)}#${id} .tel-btn-ghost:hover{color:var(--tel-text);background:var(--tel-hover)}#${id} .tel-btn-primary{background:var(--tel-red);color:#fff}#${id} .tel-btn-primary:hover{background:var(--tel-red-hover)}#${id} ::-webkit-scrollbar{width:8px}#${id} ::-webkit-scrollbar-track{background:var(--tel-bg)}#${id} ::-webkit-scrollbar-thumb{background:var(--tel-input-bg);border-radius:4px}#${id} ::-webkit-scrollbar-thumb:hover{background:var(--tel-text-dim)}`;
      $('<style>').prop('type', 'text/css').html(styles).appendTo('head');
    }

    generateSettingsModalHTML() {
      // Helper to generate a toggle row
      const createToggle = (site) => `
        <div class="tel-list-item">
          <div class="tel-info">
            <h4>${site.name}</h4>
            <p>${site.desc}</p>
          </div>
          <label class="tel-toggle">
            <input type="checkbox" id="${site.name.toLowerCase().replace(/\s+/g, '_')}" ${this.config[site.name] ? 'checked' : ''}>
            <span class="tel-slider"></span>
          </label>
        </div>
      `;

      return `
        <div id="${CONSTANTS.SCRIPT_ID}-config">
          <div class="tel-modal">
            <div class="tel-header">
              <h2>External Links Settings</h2>
              <button class="tel-close">&times;</button>
            </div>

            <div class="tel-body">
              <div class="tel-sidebar">
                <div class="tel-nav-item active" data-tab="tab-metadata">Metadata Sites</div>
                <div class="tel-nav-item" data-tab="tab-streaming">Streaming Sites</div>
                <div class="tel-nav-item" data-tab="tab-dub">Dubbing</div>
              </div>

              <div class="tel-content">
                <div id="tab-metadata" class="tel-tab-pane active">
                  ${CONSTANTS.METADATA_SITES.map(createToggle).join('')}
                </div>

                <div id="tab-streaming" class="tel-tab-pane">
                  ${CONSTANTS.STREAMING_SITES.map(createToggle).join('')}
                </div>

                <div id="tab-dub" class="tel-tab-pane">
                  <div class="tel-list-item">
                     <div class="tel-info">
                        <h4>${CONSTANTS.DUB_INFO.name}</h4>
                        <p>${CONSTANTS.DUB_INFO.desc}</p>
                     </div>
                     <label class="tel-toggle">
                        <input type="checkbox" id="dub_information" ${this.config[CONSTANTS.DUB_INFO.name] ? 'checked' : ''}>
                        <span class="tel-slider"></span>
                     </label>
                  </div>

                  <div class="tel-select-group">
                    <label class="tel-select-label">Preferred Dub Language</label>
                    <select id="dub_language" class="tel-select">
                        ${CONSTANTS.DUB_LANGUAGES.map(lang =>
                          `<option value="${lang.value}" ${this.config['Dub Language'] === lang.value ? 'selected' : ''}>${lang.name}</option>`
                        ).join('')}
                    </select>
                  </div>
                </div>
              </div>
            </div>

            <div class="tel-footer">
              <div class="footer-left">
                <button class="tel-btn tel-btn-ghost" id="reset-defaults">Reset Defaults</button>
                <button class="tel-btn tel-btn-ghost" id="clear-cache" style="margin-left: 10px;">Clear Cache</button>
              </div>
              <button class="tel-btn tel-btn-primary" id="save-reload">Save & Reload</button>
            </div>
          </div>
        </div>
      `;
    }

    setupModalEventListeners() {
      const modalSelector = `#${CONSTANTS.SCRIPT_ID}-config`;
      const $modal = $(modalSelector);

      $modal.find('.tel-close').on('click', () => this.closeModal());

      $(document).on('keydown.extLinksSettings', (event) => {
        if (event.key === 'Escape') this.closeModal();
      });

      $modal.find('.tel-nav-item').on('click', function() {
        const target = $(this).data('tab');
        $modal.find('.tel-nav-item').removeClass('active');
        $(this).addClass('active');
        $modal.find('.tel-tab-pane').removeClass('active');
        $modal.find(`#${target}`).addClass('active');
      });

      $modal.find('#reset-defaults').on('click', () => {
        if (!confirm('Are you sure you want to reset all settings to default?')) return;
        this.config = { ...DEFAULT_CONFIG };
        this.refreshModalValues();
      });

      $modal.find('#clear-cache').on('click', () => {
        try {
          const values = GM_listValues();
          for (const value of values) {
            if (value !== CONSTANTS.CONFIG_KEY) GM_deleteValue(value);
          }
          const button = $modal.find('#clear-cache');
          const originalText = button.text();
          button.text('Cleared!').css('color', '#ed1c24');
          setTimeout(() => button.text(originalText).css('color', ''), 1500);
        } catch (error) {
          logger.error(`Failed to clear cache: ${error.message}`);
        }
      });

      $modal.find('#save-reload').on('click', () => {
        try {
          this.saveSettingsFromModal();
          const button = $modal.find('#save-reload');
          button.text('Saving...');
          setTimeout(() => window.location.reload(), 200);
          this.closeModal();
        } catch (error) {
          logger.error(`Failed to save settings: ${error.message}`);
          alert('Error saving settings');
        }
      });
    }

    closeModal() {
      const modalSelector = `#${CONSTANTS.SCRIPT_ID}-config`;
      $(modalSelector).remove();
      $('body').css('overflow', '');
      $(document).off('keydown.extLinksSettings');
    }

    refreshModalValues() {
      const modalSelector = `#${CONSTANTS.SCRIPT_ID}-config`;
      const $modal = $(modalSelector);

      // Refresh values from the dynamic lists
      for (const site of [...CONSTANTS.METADATA_SITES, ...CONSTANTS.STREAMING_SITES, CONSTANTS.DUB_INFO]) {
        const checkboxId = site.name.toLowerCase().replace(/\s+/g, '_');
        $modal.find(`#${checkboxId}`).prop('checked', !!this.config[site.name]);
      }

      $modal.find('#dub_language').val(this.config['Dub Language']);
    }

    saveSettingsFromModal() {
      const modalSelector = `#${CONSTANTS.SCRIPT_ID}-config`;
      const $modal = $(modalSelector);

      // Save values from the dynamic lists
      for (const site of [...CONSTANTS.METADATA_SITES, ...CONSTANTS.STREAMING_SITES, CONSTANTS.DUB_INFO]) {
        const checkboxId = site.name.toLowerCase().replace(/\s+/g, '_');
        this.config[site.name] = $modal.find(`#${checkboxId}`).is(':checked');
      }

      this.config['Dub Language'] = $modal.find('#dub_language').val();
      GM_setValue(CONSTANTS.CONFIG_KEY, this.config);
      logger.debug('Settings saved', this.config);
    }
  }

  $(document).ready(async () => {
    const traktLinks = new TraktExternalLinks();
    await traktLinks.init();
  });
})();
