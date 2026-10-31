// ==UserScript==
// @author       Journey Over
// @exclude      *
// ==UserLibrary==
// @name         @journeyover/animeapi
// @description  AnimeAPI v3 client for fetching anime relations across 22 providers
// @license      MIT
// @version      1.3.0
// @homepageURL  https://github.com/StylusThemes/Userscripts
// ==/UserLibrary==
// @connect      animeapi.my.id
// @grant        GM_xmlhttpRequest
// ==/UserScript==

/**
 * AnimeAPI v3 client for fetching anime relation mapping across 22 providers.
 * Supports canonical names and aliases (case-insensitive) with provider-exclusive path rules.
 */
this.AnimeAPI = class AnimeAPI {
  /**
   * Canonical provider name to the aliases it answers to (lowercase).
   * @type {Object<string, string[]>}
   */
  static PROVIDER_ALIASES = {
    anidb: ['ad', 'adb', 'anidb.net'],
    anilist: ['al', 'anilist.co'],
    animenewsnetwork: ['an', 'ann', 'animenewsnetwork.com'],
    animeplanet: ['ap', 'anime-planet', 'anime-planet.com', 'animeplanet.com'],
    anisearch: ['as', 'anisearch.com', 'anisearch.de', 'anisearch.it', 'anisearch.es', 'anisearch.fr', 'anisearch.jp'],
    annict: ['ac', 'anc', 'act', 'annict.com', 'annict.jp', 'en.annict.com'],
    hikka: ['hk', 'hka', 'hikka.io'],
    imdb: ['im', 'imdb.com'],
    kaize: ['kz', 'kaize.io'],
    kitsu: ['kt', 'kts', 'kitsu.io', 'kitsu.app'],
    letterboxd: ['lb', 'lx', 'letterboxd.com'],
    livechart: ['lc', 'livechart.me'],
    myanimelist: ['ma', 'mal', 'myanimelist.net'],
    nautiljon: ['nj', 'ntj', 'nautiljon.com'],
    notify: ['nf', 'ntf', 'ntm', 'notifymoe', 'notify.moe'],
    otakotaku: ['oo', 'otakotaku.com'],
    shikimori: ['sh', 'shiki', 'shk', 'shiki.one', 'shikimori.io', 'shikimori.me', 'shikimori.one', 'shikimori.org'],
    shoboi: ['sb', 'shb', 'syb', 'shobocal', 'syoboi', 'syobocal', 'cal.syoboi.jp'],
    silveryasha: ['sy', 'dbti', 'db.silveryasha.id', 'db.silveryasha.web.id'],
    simkl: ['sm', 'smk', 'simkl.com', 'animecountdown', 'animecountdown.com'],
    themoviedb: ['tm', 'tmdb', 'themoviedb.org'],
    thetvdb: ['tv', 'tvdb', 'thetvdb.com', 'tvtime', 'tt', 'tvtime.com'],
    trakt: ['tr', 'trk', 'trakt.tv']
  };

  /**
   * Flattened alias to canonical lookup, built once at load time.
   * @type {Map<string, string>}
   */
  static SOURCE_LOOKUP = AnimeAPI._buildSourceLookup();

  /**
   * @returns {Map<string, string>} Lookup covering canonical names and aliases.
   */
  static _buildSourceLookup() {
    const lookup = new Map();
    for (const [canonical, aliases] of Object.entries(AnimeAPI.PROVIDER_ALIASES)) {
      if (lookup.has(canonical)) throw new Error(`Duplicate AnimeAPI provider alias: ${canonical}`);
      lookup.set(canonical, canonical);
      for (const alias of aliases) {
        if (lookup.has(alias)) throw new Error(`Duplicate AnimeAPI provider alias: ${alias}`);
        lookup.set(alias, canonical);
      }
    }
    return lookup;
  }

  constructor() {
    this._mappingCache = new Map();
    this._mappingPending = new Map();
    this._mappingGeneration = 0;
  }

  /**
   * Normalize source alias to canonical platform name (case-insensitive).
   * @param {string} source - Source name or alias.
   * @returns {string} Canonical platform name.
   */
  _normalizeSource(source) {
    const key = String(source).trim().toLowerCase();
    return AnimeAPI.SOURCE_LOOKUP.get(key) || key;
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

  /**
   * Cached wrapper around fetch with positive/negative TTL and pending dedup.
   * @param {string} source - Source platform or alias.
   * @param {string|number} id - ID value.
   * @param {Object} [options] - TTL overrides.
   * @param {number} [options.positiveTtl=86400000] - TTL when result has myanimelist/anilist.
   * @param {number} [options.negativeTtl=1800000] - TTL when result is null/empty.
   * @returns {Promise<Object|null>} Same shape as fetch.
   */
  async fetchCached(source, id, { positiveTtl = 86400000, negativeTtl = 1800000 } = {}) {
    if (!this._mappingCache) this._mappingCache = new Map();
    if (!this._mappingPending) this._mappingPending = new Map();
    if (typeof this._mappingGeneration !== 'number') this._mappingGeneration = 0;
    const key = `${source}:${id}`;
    const entry = this._mappingCache.get(key);
    if (entry && entry.expiresAt > Date.now()) return entry.value;
    if (this._mappingPending.has(key)) return this._mappingPending.get(key);
    const generation = this._mappingGeneration;
    const pending = this.fetch(source, id).then((data) => {
      if (generation === this._mappingGeneration) {
        this._mappingCache.set(key, {
          value: data,
          expiresAt: Date.now() + (data?.myanimelist || data?.anilist ? positiveTtl : negativeTtl)
        });
      }
      if (this._mappingPending.get(key) === pending) this._mappingPending.delete(key);
      return data;
    }, (error) => {
      if (this._mappingPending.get(key) === pending) this._mappingPending.delete(key);
      throw error;
    });
    this._mappingPending.set(key, pending);
    return pending;
  }

  /**
   * Try candidates in order, return first mapping with a MAL id.
   * @param {Array<{source: string, id: string|number, label?: string}>} candidates - Candidates to try.
   * @returns {Promise<{source: string, id: string|number, label: string|undefined, data: Object, mal: number, anilist: number|null}|null>} First match or null.
   */
  async resolveFirst(candidates) {
    let lastError = null;
    for (const candidate of candidates || []) {
      try {
        const data = await this.fetchCached(candidate.source, candidate.id);
        const mal = data?.myanimelist ? Number(data.myanimelist) : null;
        if (!mal) continue;
        return {
          source: candidate.source,
          id: candidate.id,
          label: candidate.label,
          data,
          mal,
          anilist: data?.anilist ? Number(data.anilist) : null
        };
      } catch (error) {
        lastError = error;
      }
    }
    if (lastError) throw lastError;
    return null;
  }

  /**
   * Clear cached mappings and pending requests.
   * @returns {number} Number of cached entries cleared.
   */
  clearMappingCache() {
    const count = this._mappingCache ? this._mappingCache.size : 0;
    this._mappingGeneration = (typeof this._mappingGeneration === 'number' ? this._mappingGeneration : 0) + 1;
    if (this._mappingCache) this._mappingCache.clear();
    if (this._mappingPending) this._mappingPending.clear();
    return count;
  }
};
