// ==UserScript==
// @author       Journey Over
// @exclude      *
// ==UserLibrary==
// @name         @journeyover/animeapi
// @description  AnimeAPI client for fetching external IDs
// @license      MIT
// @version      1.0.0
// @homepageURL  https://github.com/StylusThemes/Userscripts
// ==/UserLibrary==
// @connect      animeapi.my.id
// @grant        GM.xmlHttpRequest
// ==/UserScript==

/**
 * AnimeAPI client for fetching data from MyAnimeList and AniList IDs.
 */
this.AnimeAPI = class {
  /**
   * Fetches data for a given source and ID.
   * @param {string} source - The source platform (e.g., 'myanimelist', 'anilist', 'anidb', etc.).
   * @param {string} id - The ID value.
   * @returns {Promise<Object|null>} A promise that resolves to the data object or null if not found.
   */
  fetch(source, id) {
    if (!source) throw new Error("A source is required");
    if (!id) throw new Error("An ID is required");

    return new Promise((resolve, reject) => {
      GM.xmlHttpRequest({
        method: "GET",
        url: `https://animeapi.my.id/${source}/${id}`,
        timeout: 15e3,
        onload: (response) => {
          if (response.status !== 200) {
            // Debug: ${response.status}: ${response.finalUrl}
          }
          try {
            const data = JSON.parse(response.responseText);
            resolve(data);
          } catch {
            reject(new Error("Failed to parse AnimeAPI response"));
          }
        },
        onerror: () => {
          reject(new Error("An error occurs while processing the request"));
        },
        ontimeout: () => {
          reject(new Error("Request times out"));
        },
      });
    });
  }
};
