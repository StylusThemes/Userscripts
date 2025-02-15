// ==UserScript==
// @author       Journey Over
// @exclude      *
// ==UserLibrary==
// @name         @journeyover/wikidata
// @description  Wikidata for my userscripts
// @license      MIT
// @version      1.1.0
// @homepageURL  https://github.com/StylusThemes/Userscripts
// ==/UserLibrary==
// @connect      query.wikidata.org
// @connect      arm.haglund.dev
// @grant        GM.xmlHttpRequest
// ==/UserScript==

this.Wikidata = class {
  constructor(config = {}) {
    (this._config = { endpoint: config.endpoint || "https://query.wikidata.org", debug: config.debug || !1 }),
      (this._headers = { Accept: "application/sparql-results+json" }),
      (this._debug = (response) => {
        (this._config.debug || 200 !== response.status) && console.log(`${response.status}: ${response.finalUrl}`);
      }),
      (this._property = (source) => {
        switch (source) {
          case "IMDb":
            return "P345";
          case "TMDb_movie":
            return "P4947";
          case "TMDb_tv":
            return "P4983";
          case "TVDb_movie":
            return "P12196";
          case "TVDb_tv":
            return "P4835";
          case "Trakt":
            return "P8013";
          case "Rotten Tomatoes":
            return "P1258";
          case "Metacritic":
            return "P1712";
          case "Letterboxd":
            return "P6127";
          case "TVmaze":
            return "P8600";
          case "MyAnimeList":
            return "P4086";
          case "AniDB":
            return "P5646";
          case "AniList":
            return "P8729";
          case "Kitsu":
            return "P11495";
          case "AniSearch":
            return "P12477";
          case "LiveChart":
            return "P12489";
          default:
            throw new Error("An ID source is required");
        }
      }),

      (this._item = (type) => {
        switch (type) {
          case "movie":
            return "Q11424";
          case "tv":
            return "Q5398426";
          default:
            throw new Error("An ID type is required");
        }
      }),

      (this._link = (site, id) => {
        switch (site) {
          case "IMDb":
            return { value: `https://www.imdb.com/title/${id}` };
          case "TMDb_movie":
            return { value: `https://www.themoviedb.org/movie/${id}` };
          case "TMDb_tv":
            return { value: `https://www.themoviedb.org/tv/${id}` };
          case "TVDb_movie":
            return { value: `https://thetvdb.com/dereferrer/movie/${id}` };
          case "TVDb_tv":
            return { value: `https://thetvdb.com/dereferrer/series/${id}` };
          case "Trakt":
            return { value: `https://trakt.tv/${id}` };
          case "Rotten Tomatoes":
            return { value: `https://www.rottentomatoes.com/${id}` };
          case "Metacritic":
            return { value: `https://www.metacritic.com/${id}` };
          case "Letterboxd":
            return { value: `https://letterboxd.com/film/${id}` };
          case "TVmaze":
            return { value: `https://tvmaze.com/shows/${id}` };
          case "MyAnimeList":
            return { value: `https://myanimelist.net/anime/${id}` };
          case "AniDB":
            return { value: `https://anidb.net/anime/${id}` };
          case "AniList":
            return { value: `https://anilist.co/anime/${id}` };
          case "Kitsu":
            return { value: `https://kitsu.app/anime/${id}` };
          case "AniSearch":
            return { value: `https://www.anisearch.com/anime/${id}` };
          case "LiveChart":
            return { value: `https://www.livechart.me/anime/${id}` };
        }
      });
  }

  links(id, idSource, itemType) {
    if (!id) throw new Error("An ID is required");
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
      GM.xmlHttpRequest({
        method: "GET",
        url: `${this._config.endpoint}/sparql?query=${encodeURIComponent(query)}`,
        headers: this._headers,
        timeout: 15e3,
        onload: (response) => {
          this._debug(response);
          const results = JSON.parse(response.responseText)
            .results.bindings
            .find((item) => item[idSource].value === id);

          if (
            results &&
            Object.keys(results).length > 0 &&
            Object.getPrototypeOf(results) === Object.prototype
          ) {
            const data = {
              title: results.itemLabel ? results.itemLabel.value : void 0,
              links: {
                IMDB: results.IMDb ? this._link("IMDb", results.IMDb.value) : void 0,
                TMDB:
                  results.TMDb_movie || results.TMDb_tv
                    ? results.TMDb_movie
                      ? this._link("TMDb_movie", results.TMDb_movie.value)
                      : this._link("TMDb_tv", results.TMDb_tv.value)
                    : void 0,
                TVDB:
                  results.TVDb_movie || results.TVDb_tv
                    ? results.TVDb_movie
                      ? this._link("TVDb_movie", results.TVDb_movie.value)
                      : this._link("TVDb_tv", results.TVDb_tv.value)
                    : void 0,
                Trakt: results.Trakt ? this._link("Trakt", results.Trakt.value) : void 0,
                "Rotten Tomatoes": results.RottenTomatoes ? this._link("Rotten Tomatoes", results.RottenTomatoes.value) : void 0,
                Metacritic: results.Metacritic ? this._link("Metacritic", results.Metacritic.value) : void 0,
                Letterboxd: results.Letterboxd ? this._link("Letterboxd", results.Letterboxd.value) : void 0,
                TVmaze: results.TVmaze ? this._link("TVmaze", results.TVmaze.value) : void 0,
                MyAnimeList: results.MyAnimeList ? this._link("MyAnimeList", results.MyAnimeList.value) : void 0,
                AniDB: results.AniDB ? this._link("AniDB", results.AniDB.value) : void 0,
                AniList: results.AniList ? this._link("AniList", results.AniList.value) : void 0,
                Kitsu: results.Kitsu ? this._link("Kitsu", results.Kitsu.value) : void 0,
                AniSearch: results.AniSearch ? this._link("AniSearch", results.AniSearch.value) : void 0,
                LiveChart: results.LiveChart ? this._link("LiveChart", results.LiveChart.value) : void 0,
              },
              item: results.item.value,
            };

            // If extra properties like AniList, AniDB, or MyAnimeList are missing,
            // try to fetch them using an external API.
            if ( !data.links.MyAnimeList || !data.links.AniDB || !data.links.AniList || !data.links.Kitsu || !data.links.AniSearch || !data.links.LiveChart ) {
              let externalEndpoint = null;
              let externalId = null;
              // Prefer a TMDb ID if available; otherwise fall back to TVDb.
              if (results.TMDb_movie) {
                externalEndpoint = "themoviedb";
                externalId = results.TMDb_movie.value;
              } else if (results.TMDb_tv) {
                externalEndpoint = "themoviedb";
                externalId = results.TMDb_tv.value;
              } else if (results.TVDb_movie) {
                externalEndpoint = "thetvdb";
                externalId = results.TVDb_movie.value;
              } else if (results.TVDb_tv) {
                externalEndpoint = "thetvdb";
                externalId = results.TVDb_tv.value;
              }

              if (externalEndpoint && externalId) {
                GM.xmlHttpRequest({
                  method: "GET",
                  url: `https://arm.haglund.dev/api/v2/${externalEndpoint}?id=${externalId}`,
                  timeout: 15e3,
                  onload: (extRes) => {
                    try {
                      const extData = JSON.parse(extRes.responseText);
                      if (Array.isArray(extData) && extData.length > 0) {
                        const extInfo = extData[0];
                        const mapping = {
                          themoviedb: "TMDB",
                          thetvdb: "TVDB",
                          myanimelist: "MyAnimeList",
                          anidb: "AniDB",
                          anilist: "AniList",
                          kitsu: "Kitsu",
                          anisearch: "AniSearch",
                          livechart: "LiveChart"
                        };

                        Object.keys(mapping).forEach((apiKey) => {
                          const linkKey = mapping[apiKey];
                          if (!data.links[linkKey] && extInfo[apiKey]) {
                            data.links[linkKey] =
                              apiKey === "themoviedb" ? this._link(itemType === "movie" ? "TMDb_movie" : "TMDb_tv", extInfo[apiKey]) :
                              apiKey === "thetvdb" ? this._link(itemType === "movie" ? "TVDb_movie" : "TVDb_tv", extInfo[apiKey]) :
                              this._link(linkKey, extInfo[apiKey]);
                          }
                        });
                      }
                    } catch (error) {
                      console.error("Error parsing external API response:", error);
                    }
                    resolve(data);
                  },
                  onerror: () => resolve(data),
                  ontimeout: () => resolve(data)
                });
              } else {
                resolve(data);
              }
            } else {
              resolve(data);
            }
          } else {
            reject(new Error("No results"));
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
