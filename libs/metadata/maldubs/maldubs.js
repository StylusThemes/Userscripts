// ==UserScript==
// @author       Journey Over
// @exclude      *
// ==UserLibrary==
// @name         @journeyover/maldubs
// @description  MAL-Dubs client for checking English dub status of MyAnimeList anime
// @license      MIT
// @version      1.0.0
// @homepageURL  https://github.com/StylusThemes/Userscripts
// ==/UserLibrary==
// @connect      raw.githubusercontent.com
// @grant        GM_xmlhttpRequest
// ==/UserScript==

/**
 * MAL-Dubs client for checking English dub status from the MAL-Dubs dataset.
 * Source: https://github.com/MAL-Dubs/MAL-Dubs
 */
this.MalDubs = class {
  /**
   * Creates a new MAL-Dubs client instance.
   */
  constructor() {
    this._url = 'https://raw.githubusercontent.com/MAL-Dubs/MAL-Dubs/main/data/dubInfo.json';
    this._data = null;
    this._dubbed = null;
    this._incomplete = null;
  }

  /**
   * Fetches and caches the MAL-Dubs dataset.
   * @returns {Promise<Object>} A promise that resolves to the parsed dataset.
   */
  fetch() {
    if (this._data) return Promise.resolve(this._data);

    return new Promise((resolve, reject) => {
      GM_xmlhttpRequest({
        method: 'GET',
        url: this._url,
        timeout: 15e3,
        onload: (response) => {
          if (response.status !== 200) {
            // Debug: ${response.status}: ${response.finalUrl}
          }
          try {
            const data = JSON.parse(response.responseText);
            this._data = data;
            this._dubbed = new Set(data.dubbed || []);
            this._incomplete = new Set(data.incomplete || []);
            resolve(data);
          } catch {
            reject(new Error('Failed to parse MAL-Dubs response'));
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
   * Checks whether a MyAnimeList ID is fully English dubbed.
   * @param {number|string} id - The MyAnimeList anime ID.
   * @returns {Promise<boolean>} A promise that resolves to true if fully dubbed.
   */
  async isDubbed(id) {
    await this.fetch();
    return this._dubbed.has(Number(id));
  }

  /**
   * Checks whether a MyAnimeList ID is English dubbed but incomplete.
   * @param {number|string} id - The MyAnimeList anime ID.
   * @returns {Promise<boolean>} A promise that resolves to true if dubbed but incomplete.
   */
  async isIncomplete(id) {
    await this.fetch();
    return this._incomplete.has(Number(id));
  }

  /**
   * Returns the dub status of a MyAnimeList ID.
   * @param {number|string} id - The MyAnimeList anime ID.
   * @returns {Promise<string|null>} 'dubbed', 'incomplete', or null if not dubbed.
   */
  async getStatus(id) {
    await this.fetch();
    const numberId = Number(id);
    if (this._incomplete.has(numberId)) return 'incomplete';
    if (this._dubbed.has(numberId)) return 'dubbed';
    return null;
  }
};
