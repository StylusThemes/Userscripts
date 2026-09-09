// ==UserScript==
// @author       Journey Over
// @exclude      *
// ==UserLibrary==
// @name         @journeyover/anilist
// @description  AniList GraphQL API client
// @license      MIT
// @version      1.1.0
// @homepageURL  https://github.com/StylusThemes/Userscripts
// ==/UserLibrary==
// @connect      graphql.anilist.co
// @grant        GM_xmlhttpRequest
// ==/UserScript==

/**
 * AniList GraphQL API client.
 */
this.AniList = class {
  /**
   * Executes a GraphQL query against the AniList API.
   * @param {string} query - The GraphQL query string.
   * @param {Object} [variables={}] - Variables for the query.
   * @returns {Promise<Object>} A promise that resolves to the response data.
   */
  query(query, variables = {}) {
    if (!query) throw new Error('A GraphQL query is required');

    return new Promise((resolve, reject) => {
      GM_xmlhttpRequest({
        method: 'POST',
        url: 'https://graphql.anilist.co',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
        data: JSON.stringify({
          query,
          variables
        }),
        timeout: 15e3,
        onload: (response) => {
          if (response.status !== 200) {
            // Debug: ${response.status}: ${response.finalUrl}
          }
          if (response.status === 200) {
            try {
              const data = JSON.parse(response.responseText);
              resolve(data);
            } catch {
              reject(new Error('Failed to parse AniList response'));
            }
          } else {
            reject(new Error(`AniList API error: ${response.status}`));
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
   * Checks whether an anime has a dub in the given language.
   * Looks at main characters only; true if any has a voice actor in that language.
   * @param {number} anilistId - AniList anime ID.
   * @param {string} language - Staff language (e.g. 'ENGLISH', 'JAPANESE').
   * @returns {Promise<boolean>} True when a dub exists.
   */
  async hasDub(anilistId, language) {
    if (!anilistId) throw new Error('An AniList ID is required');
    if (!language) throw new Error('A language is required');

    const query = `
      query($id: Int, $language: StaffLanguage) {
        Media(id: $id, type: ANIME) {
          characters(role: MAIN, sort: ROLE) {
            edges {
              voiceActors(language: $language) { language }
            }
          }
        }
      }
    `;

    const response = await this.query(query, { id: Number(anilistId), language });
    const edges = response?.data?.Media?.characters?.edges;
    if (!Array.isArray(edges)) throw new Error('Unexpected AniList response structure');

    return edges.some((edge) => edge.voiceActors?.length > 0);
  }
};
