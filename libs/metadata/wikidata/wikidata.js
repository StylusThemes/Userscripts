// ==UserScript==
// @author       Journey Over
// @exclude      *
// ==UserLibrary==
// @name         @journeyover/wikidata
// @description  Wikidata API client for fetching external IDs
// @license      MIT
// @version      1.2.1
// @homepageURL  https://github.com/StylusThemes/Userscripts
// ==/UserLibrary==
// @connect      query.wikidata.org
// @grant        GM_xmlhttpRequest
// ==/UserScript==

/**
 * Wikidata API client for fetching external links and metadata for movies and TV shows.
 * Queries Wikidata using SPARQL.
 */
this.Wikidata = class {
  /**
   * Creates a new Wikidata client instance.
   */
  constructor() {
    this._property = (source) => {
      switch (source) {
        case 'IMDb': {
          return 'P345';
        }
        case 'TMDb_movie': {
          return 'P4947';
        }
        case 'TMDb_tv': {
          return 'P4983';
        }
        case 'TVDb_movie': {
          return 'P12196';
        }
        case 'TVDb_tv': {
          return 'P4835';
        }
        case 'Trakt': {
          return 'P8013';
        }
        case 'Rotten Tomatoes': {
          return 'P1258';
        }
        case 'Metacritic': {
          return 'P1712';
        }
        case 'Letterboxd': {
          return 'P6127';
        }
        case 'TVmaze': {
          return 'P8600';
        }
        case 'MyAnimeList': {
          return 'P4086';
        }
        case 'AniDB': {
          return 'P5646';
        }
        case 'AniList': {
          return 'P8729';
        }
        case 'Kitsu': {
          return 'P11495';
        }
        case 'AniSearch': {
          return 'P12477';
        }
        case 'LiveChart': {
          return 'P12489';
        }
        default: {
          throw new Error('An ID source is required');
        }
      }
    };

    this._item = (type) => {
      switch (type) {
        case 'movie': {
          return 'Q11424';
        }
        case 'tv': {
          return 'Q5398426';
        }
        default: {
          throw new Error('An ID type is required');
        }
      }
    };

    this._link = (site, id) => {
      switch (site) {
        case 'IMDb': {
          return {
            value: `https://www.imdb.com/title/${id}`
          };
        }
        case 'TMDb_movie': {
          return {
            value: `https://www.themoviedb.org/movie/${id}`
          };
        }
        case 'TMDb_tv': {
          return {
            value: `https://www.themoviedb.org/tv/${id}`
          };
        }
        case 'TVDb_movie': {
          return {
            value: `https://thetvdb.com/dereferrer/movie/${id}`
          };
        }
        case 'TVDb_tv': {
          return {
            value: `https://thetvdb.com/dereferrer/series/${id}`
          };
        }
        case 'Trakt': {
          return {
            value: `https://trakt.tv/${id}`
          };
        }
        case 'Rotten Tomatoes': {
          return {
            value: `https://www.rottentomatoes.com/${id}`
          };
        }
        case 'Metacritic': {
          return {
            value: `https://www.metacritic.com/${id}`
          };
        }
        case 'Letterboxd': {
          return {
            value: `https://letterboxd.com/film/${id}`
          };
        }
        case 'TVmaze': {
          return {
            value: `https://tvmaze.com/shows/${id}`
          };
        }
        case 'MyAnimeList': {
          return {
            value: `https://myanimelist.net/anime/${id}`
          };
        }
        case 'AniDB': {
          return {
            value: `https://anidb.net/anime/${id}`
          };
        }
        case 'AniList': {
          return {
            value: `https://anilist.co/anime/${id}`
          };
        }
        case 'Kitsu': {
          return {
            value: `https://kitsu.app/anime/${id}`
          };
        }
        case 'AniSearch': {
          return {
            value: `https://www.anisearch.com/anime/${id}`
          };
        }
        case 'LiveChart': {
          return {
            value: `https://www.livechart.me/anime/${id}`
          };
        }
      }
    };
  }

  /**
   * Builds the links object from Wikidata SPARQL query results.
   * @param {Object} results - A single binding result from the SPARQL query.
   * @returns {Object} An object mapping link display names to their URL objects.
   */
  _buildLinks(results) {
    const simpleMappings = [
      ['IMDB', 'IMDb', 'IMDb'],
      ['Trakt', 'Trakt', 'Trakt'],
      ['Rotten Tomatoes', 'RottenTomatoes', 'Rotten Tomatoes'],
      ['Metacritic', 'Metacritic', 'Metacritic'],
      ['Letterboxd', 'Letterboxd', 'Letterboxd'],
      ['TVmaze', 'TVmaze', 'TVmaze'],
      ['MyAnimeList', 'MyAnimeList', 'MyAnimeList'],
      ['AniDB', 'AniDB', 'AniDB'],
      ['AniList', 'AniList', 'AniList'],
      ['Kitsu', 'Kitsu', 'Kitsu'],
      ['AniSearch', 'AniSearch', 'AniSearch'],
      ['LiveChart', 'LiveChart', 'LiveChart'],
    ];

    const links = {};

    for (const [linkKey, resultKey, linkSource] of simpleMappings) {
      links[linkKey] = results[resultKey] ? this._link(linkSource, results[resultKey].value) : void 0;
    }

    // TMDB and TVDB have movie/tv type variants with movie taking priority
    links.TMDB = results.TMDb_movie ? this._link('TMDb_movie', results.TMDb_movie.value) :
      results.TMDb_tv ? this._link('TMDb_tv', results.TMDb_tv.value) : void 0;
    links.TVDB = results.TVDb_movie ? this._link('TVDb_movie', results.TVDb_movie.value) :
      results.TVDb_tv ? this._link('TVDb_tv', results.TVDb_tv.value) : void 0;

    return links;
  }

  /**
   * Fetches external links and metadata for a given ID from Wikidata.
   * @param {string} id - The ID value (e.g., IMDB ID like "tt0111161").
   * @param {string} idSource - The source of the ID (e.g., "IMDb").
   * @param {string} itemType - The type of item ("movie" or "tv").
   * @returns {Promise<Object>} A promise that resolves to an object with title, links, and item properties.
   *                           If no data is found, resolves to { title: undefined, links: {}, item: undefined }.
   */
  links(id, idSource, itemType) {
    if (!id) throw new Error('An ID is required');
    if (!idSource) throw new Error('An ID source is required');
    if (!itemType || (itemType !== 'movie' && itemType !== 'tv')) throw new Error('Item type must be \'movie\' or \'tv\'');
    const property = this._property(idSource);
    const item = this._item(itemType);

    const query = `
      SELECT DISTINCT ?item ?itemLabel ?IMDb ?TMDb_movie ?TMDb_tv ?TVDb_movie ?TVDb_tv ?Trakt ?RottenTomatoes ?Metacritic ?Letterboxd ?TVmaze ?MyAnimeList ?AniDB ?AniList ?Kitsu ?AniSearch ?LiveChart WHERE {
        ?item p:${property} ?statement0.
        ?statement0 ps:${property} "${id}".
        ?item p:P31 ?statement1.
        ?statement1 (ps:P31/(wdt:P279*)) wd:${item}.
        MINUS {
          ?item p:P31 ?statement2.
          ?statement2 (ps:P31/(wdt:P279*)) wd:Q3464665.
        }
        MINUS {
          ?item p:P31 ?statement3.
          ?statement3 (ps:P31/(wdt:P279*)) wd:Q21191270.
        }
        OPTIONAL { ?item wdt:P345 ?IMDb. }
        OPTIONAL { ?item wdt:P4947 ?TMDb_movie. }
        OPTIONAL { ?item wdt:P4983 ?TMDb_tv. }
        OPTIONAL { ?item wdt:P12196 ?TVDb_movie. }
        OPTIONAL { ?item wdt:P4835 ?TVDb_tv. }
        OPTIONAL { ?item wdt:P8013 ?Trakt. }
        OPTIONAL { ?item wdt:P1258 ?RottenTomatoes. }
        OPTIONAL { ?item wdt:P1712 ?Metacritic. }
        OPTIONAL { ?item wdt:P6127 ?Letterboxd. }
        OPTIONAL { ?item wdt:P8600 ?TVmaze. }
        OPTIONAL { ?item wdt:P4086 ?MyAnimeList. }
        OPTIONAL { ?item wdt:P5646 ?AniDB. }
        OPTIONAL { ?item wdt:P8729 ?AniList. }
        OPTIONAL { ?item wdt:P11495 ?Kitsu. }
        OPTIONAL { ?item wdt:P12477 ?AniSearch. }
        OPTIONAL { ?item wdt:P12489 ?LiveChart. }
        SERVICE wikibase:label { bd:serviceParam wikibase:language "en". }
      }
      LIMIT 1000
    `;

    return new Promise((resolve, reject) => {
      GM_xmlhttpRequest({
        method: 'GET',
        url: `https://query.wikidata.org/sparql?query=${encodeURIComponent(query)}`,
        headers: { Accept: 'application/sparql-results+json' },
        timeout: 15e3,
        onload: (response) => {
          if (response.status !== 200) {
            // Debug: ${response.status}: ${response.finalUrl}
          }
          try {
            const results = JSON.parse(response.responseText)
              .results.bindings
              .find((binding) => binding[idSource] && binding[idSource].value === id);

            if (
              results &&
              Object.keys(results).length > 0
            ) {
              const data = {
                title: results.itemLabel ? results.itemLabel.value : void 0,
                links: this._buildLinks(results),
                item: results.item ? results.item.value : void 0,
              };

              resolve(data);
            } else {
              resolve({ title: void 0, links: {}, item: void 0 });
            }
          } catch {
            reject(new Error('Failed to parse Wikidata response'));
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
