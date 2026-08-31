// ==UserScript==
// @author       Journey Over
// @exclude      *
// ==UserLibrary==
// @name         @journeyover/animeapi
// @description  AnimeAPI v3 client for fetching anime relations across 22 providers
// @license      MIT
// @version      1.1.0
// @homepageURL  https://github.com/StylusThemes/Userscripts
// ==/UserLibrary==
// @connect      animeapi.my.id
// @grant        GM_xmlhttpRequest
// ==/UserScript==

/**
 * AnimeAPI v3 client for fetching anime relation mapping across 22 providers.
 * Supports canonical names and aliases (case-insensitive) with provider-exclusive path rules.
 */
this.AnimeAPI = class {
  /**
   * Normalize source alias to canonical platform name (case-insensitive).
   * @param {string} source - Source name or alias.
   * @returns {string} Canonical platform name.
   */
  _normalizeSource(source) {
    const key = String(source).trim().toLowerCase();
    const map = {
      'ad': 'anidb',
      'adb': 'anidb',
      'anidb': 'anidb',
      'anidb.net': 'anidb',
      'al': 'anilist',
      'anilist': 'anilist',
      'anilist.co': 'anilist',
      'an': 'animenewsnetwork',
      'ann': 'animenewsnetwork',
      'animenewsnetwork': 'animenewsnetwork',
      'animenewsnetwork.com': 'animenewsnetwork',
      'ap': 'animeplanet',
      'animeplanet': 'animeplanet',
      'anime-planet': 'animeplanet',
      'anime-planet.com': 'animeplanet',
      'animeplanet.com': 'animeplanet',
      'as': 'anisearch',
      'anisearch': 'anisearch',
      'anisearch.com': 'anisearch',
      'anisearch.de': 'anisearch',
      'anisearch.it': 'anisearch',
      'anisearch.es': 'anisearch',
      'anisearch.fr': 'anisearch',
      'anisearch.jp': 'anisearch',
      'ac': 'annict',
      'anc': 'annict',
      'act': 'annict',
      'annict': 'annict',
      'annict.com': 'annict',
      'annict.jp': 'annict',
      'en.annict.com': 'annict',
      'hk': 'hikka',
      'hka': 'hikka',
      'hikka': 'hikka',
      'hikka.io': 'hikka',
      'im': 'imdb',
      'imdb': 'imdb',
      'imdb.com': 'imdb',
      'kz': 'kaize',
      'kaize': 'kaize',
      'kaize.io': 'kaize',
      'kt': 'kitsu',
      'kts': 'kitsu',
      'kitsu': 'kitsu',
      'kitsu.io': 'kitsu',
      'kitsu.app': 'kitsu',
      'lb': 'letterboxd',
      'lx': 'letterboxd',
      'letterboxd': 'letterboxd',
      'letterboxd.com': 'letterboxd',
      'lc': 'livechart',
      'livechart': 'livechart',
      'livechart.me': 'livechart',
      'ma': 'myanimelist',
      'mal': 'myanimelist',
      'myanimelist': 'myanimelist',
      'myanimelist.net': 'myanimelist',
      'nj': 'nautiljon',
      'ntj': 'nautiljon',
      'nautiljon': 'nautiljon',
      'nautiljon.com': 'nautiljon',
      'nf': 'notify',
      'ntf': 'notify',
      'ntm': 'notify',
      'notify': 'notify',
      'notifymoe': 'notify',
      'notify.moe': 'notify',
      'oo': 'otakotaku',
      'otakotaku': 'otakotaku',
      'otakotaku.com': 'otakotaku',
      'sh': 'shikimori',
      'shiki': 'shikimori',
      'shk': 'shikimori',
      'shikimori': 'shikimori',
      'shiki.one': 'shikimori',
      'shikimori.io': 'shikimori',
      'shikimori.me': 'shikimori',
      'shikimori.one': 'shikimori',
      'shikimori.org': 'shikimori',
      'sb': 'shoboi',
      'shb': 'shoboi',
      'syb': 'shoboi',
      'shoboi': 'shoboi',
      'shobocal': 'shoboi',
      'syoboi': 'shoboi',
      'syobocal': 'shoboi',
      'cal.syoboi.jp': 'shoboi',
      'sy': 'silveryasha',
      'silveryasha': 'silveryasha',
      'dbti': 'silveryasha',
      'db.silveryasha.id': 'silveryasha',
      'db.silveryasha.web.id': 'silveryasha',
      'sm': 'simkl',
      'smk': 'simkl',
      'simkl': 'simkl',
      'simkl.com': 'simkl',
      'animecountdown': 'simkl',
      'animecountdown.com': 'simkl',
      'tm': 'themoviedb',
      'tmdb': 'themoviedb',
      'themoviedb': 'themoviedb',
      'themoviedb.org': 'themoviedb',
      'tv': 'thetvdb',
      'tvdb': 'thetvdb',
      'thetvdb': 'thetvdb',
      'thetvdb.com': 'thetvdb',
      'tvtime': 'thetvdb',
      'tt': 'thetvdb',
      'tvtime.com': 'thetvdb',
      'tr': 'trakt',
      'trk': 'trakt',
      'trakt': 'trakt',
      'trakt.tv': 'trakt'
    };
    return map[key] || key;
  }

  /**
   * Build request URL with normalized source and encoded id preserving slashes.
   * @param {string} source - Source platform or alias.
   * @param {string|number} id - ID value, may contain slashes for provider-exclusive paths.
   * @returns {string} Full request URL.
   */
  _buildUrl(source, id) {
    const canonical = this._normalizeSource(source);
    let idString = String(id);
    if (canonical === 'thetvdb' && !idString.toLowerCase().startsWith('series/')) {
      idString = `series/${idString}`;
    }
    const encodedId = idString.split('/').map(function(seg) {
      return encodeURIComponent(seg);
    }).join('/');
    return `https://animeapi.my.id/${canonical}/${encodedId}`;
  }

  /**
   * Fetches relation mapping data for a given source and ID.
   * @param {string} source - The source platform canonical name or alias (case-insensitive, e.g., 'myanimelist', 'mal', 'tmdb', 'anidb', 'anidb.net').
   * @param {string|number} id - The ID value. For providers requiring extra path segments, pass id with slashes (e.g., 'tv/30991', 'series/76885/seasons/11636', 'shows/152334/seasons/3'). For themoviedb use 'movie/:id' or 'tv/:id' optionally with '/seasons/:seasonId'; for trakt use 'movies/:id' or 'shows/:id' optionally with '/seasons/:seasonId'; for thetvdb 'series/' is auto-prefixed if omitted.
   * @returns {Promise<Object|null>} A promise that resolves to the data object or null if not found (404).
   * @example
   * api.fetch('myanimelist', '1')
   * api.fetch('themoviedb', 'tv/30991') // or via alias: api.fetch('tmdb', 'tv/30991/seasons/1')
   * api.fetch('thetvdb', '76885') // auto-prefixes to series/76885
   * api.fetch('thetvdb', 'series/76885/seasons/11636')
   * api.fetch('trakt', 'shows/152334/seasons/3')
   */
  fetch(source, id) {
    if (!source) throw new Error('A source is required');
    if (!id) throw new Error('An ID is required');

    const url = this._buildUrl(source, id);

    return new Promise((resolve, reject) => {
      GM_xmlhttpRequest({
        method: 'GET',
        url: url,
        timeout: 15e3,
        onload: (response) => {
          if (response.status === 404) {
            resolve(null);
            return;
          }
          if (response.status !== 200) {
            reject(new Error(`AnimeAPI request failed with status ${response.status}`));
            return;
          }
          try {
            const data = JSON.parse(response.responseText);
            resolve(data);
          } catch {
            reject(new Error('Failed to parse AnimeAPI response'));
          }
        },
        onerror: () => {
          reject(new Error('An error occurs while processing the request'));
        },
        ontimeout: () => {
          reject(new Error('Request times out'));
        },
      });
    });
  }
};
