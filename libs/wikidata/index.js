// ==UserScript==
// @author       Journey Over
// @exclude      *
// ==UserLibrary==
// @name         @journeyover/wikidata
// @description  Wikidata for my userscripts
// @license      MIT
// @version      1.0.0
// @homepageURL  https://github.com/StylusThemes/Userscripts
// ==/UserLibrary==
// @connect      query.wikidata.org
// @grant        GM.xmlHttpRequest
// ==/UserScript==

this.Wikidata = class {
  constructor(e = {}) {
    (this._config = { endpoint: e.endpoint || "https://query.wikidata.org", debug: e.debug || !1 }),
      (this._headers = { Accept: "application/sparql-results+json" }),
      (this._debug = (e) => {
        (this._config.debug || 200 !== e.status) && console.log(`${e.status}: ${e.finalUrl}`);
      }),
      (this._property = (e) => {
        switch (e) {
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
          case "MyAnimeList":
            return "P4086";
          case "AniDB":
            return "P5646";
          case "AniList":
            return "P8729";
          case "Letterboxd":
            return "P6127";
          case "TVmaze":
            return "P8600";
          default:
            throw new Error("An ID source is required");
        }
      }),
      (this._item = (e) => {
        switch (e) {
          case "movie":
            return "Q11424";
          case "tv":
            return "Q5398426";
          default:
            throw new Error("An ID type is required");
        }
      }),
      (this._link = (e, t) => {
        switch (e) {
          case "IMDb":
            return { value: `https://www.imdb.com/title/${t}` };
          case "TMDb_movie":
            return { value: `https://www.themoviedb.org/movie/${t}` };
          case "TMDb_tv":
            return { value: `https://www.themoviedb.org/tv/${t}` };
          case "TVDb_movie":
            return { value: `https://thetvdb.com/dereferrer/movie/${t}` };
          case "TVDb_tv":
            return { value: `https://thetvdb.com/dereferrer/series/${t}` };
          case "Trakt":
            return { value: `https://trakt.tv/${t}` };
          case "Rotten Tomatoes":
            return { value: `https://www.rottentomatoes.com/${t}` };
          case "Metacritic":
            return { value: `https://www.metacritic.com/${t}` };
          case "MyAnimeList":
            return { value: `https://myanimelist.net/anime/${t}` };
          case "AniDB":
            return { value: `https://anidb.net/anime/${t}` };
          case "AniList":
            return { value: `https://anilist.co/anime/${t}` };
          case "Letterboxd":
            return { value: `https://letterboxd.com/film/${t}` };
          case "TVmaze":
            return { value: `https://tvmaze.com/shows/${t}` };
        }
      });
  }
  links(e, t, i) {
    if (!e) throw new Error("An ID is required");
    const o = this._property(t),
      r = this._item(i),
      n = `\n      SELECT DISTINCT ?item ?itemLabel ?IMDb ?TMDb_movie ?TMDb_tv ?TVDb_movie ?TVDb_tv ?Trakt ?RottenTomatoes ?Metacritic ?MyAnimeList ?AniDB ?AniList ?Letterboxd ?TVmaze WHERE {\n        ?item p:${o} ?statement0.\n        ?statement0 ps:${o} "${e}".\n        ?item p:P31 ?statement1.\n        ?statement1 (ps:P31/(wdt:P279*)) wd:${r}.\n        MINUS {\n          ?item p:P31 ?statement2.\n          ?statement2 (ps:P31/(wdt:P279*)) wd:Q3464665.\n        }\n        MINUS {\n          ?item p:P31 ?statement3.\n          ?statement3 (ps:P31/(wdt:P279*)) wd:Q21191270.\n        }\n        OPTIONAL { ?item wdt:P345 ?IMDb. }\n        OPTIONAL { ?item wdt:P4947 ?TMDb_movie. }\n        OPTIONAL { ?item wdt:P4983 ?TMDb_tv. }\n        OPTIONAL { ?item wdt:P12196 ?TVDb_movie. }\n        OPTIONAL { ?item wdt:P4835 ?TVDb_tv. }\n        OPTIONAL { ?item wdt:P8013 ?Trakt. }\n        OPTIONAL { ?item wdt:P1258 ?RottenTomatoes. }\n        OPTIONAL { ?item wdt:P1712 ?Metacritic. }\n        OPTIONAL { ?item wdt:P4086 ?MyAnimeList. }\n        OPTIONAL { ?item wdt:P5646 ?AniDB. }\n        OPTIONAL { ?item wdt:P8729 ?AniList. }\n        OPTIONAL { ?item wdt:P6127 ?Letterboxd. }\n        OPTIONAL { ?item wdt:P8600 ?TVmaze. }\n        SERVICE wikibase:label { bd:serviceParam wikibase:language "en". }\n      }\n      LIMIT 1000\n      `;
    return new Promise((i, o) => {
      GM.xmlHttpRequest({
        method: "GET",
        url: `${this._config.endpoint}/sparql?query=${encodeURIComponent(n)}`,
        headers: this._headers,
        timeout: 15e3,
        onload: (r) => {
          this._debug(r);
          const n = JSON.parse(r.responseText)
            .results.bindings.map((e) => e)
            .find((i) => i[t].value === e);
          n && Object.keys(n).length > 0 && Object.getPrototypeOf(n) === Object.prototype
            ? i({
                title: n.itemLabel ? n.itemLabel.value : void 0,
                links: {
                  IMDB: n.IMDb ? this._link("IMDb", n.IMDb.value) : void 0,
                  TMDB: n.TMDb_movie || n.TMDb_tv ? (n.TMDb_movie ? this._link("TMDb_movie", n.TMDb_movie.value) : this._link("TMDb_tv", n.TMDb_tv.value)) : void 0,
                  TVDB: n.TVDb_movie || n.TVDb_tv ? (n.TVDb_movie ? this._link("TVDb_movie", n.TVDb_movie.value) : this._link("TVDb_tv", n.TVDb_tv.value)) : void 0,
                  Trakt: n.Trakt ? this._link("Trakt", n.Trakt.value) : void 0,
                  "Rotten Tomatoes": n.RottenTomatoes ? this._link("Rotten Tomatoes", n.RottenTomatoes.value) : void 0,
                  Metacritic: n.Metacritic ? this._link("Metacritic", n.Metacritic.value) : void 0,
                  MyAnimeList: n.MyAnimeList ? this._link("MyAnimeList", n.MyAnimeList.value) : void 0,
                  AniDB: n.AniDB ? this._link("AniDB", n.AniDB.value) : void 0,
                  AniList: n.AniList ? this._link("AniList", n.AniList.value) : void 0,
                  Letterboxd: n.Letterboxd ? this._link("Letterboxd", n.Letterboxd.value) : void 0,
                  TVmaze: n.TVmaze ? this._link("TVmaze", n.TVmaze.value) : void 0,
                },
                item: n.item.value,
              })
            : o(new Error("No results"));
        },
        onerror: () => {
          o(new Error("An error occurs while processing the request"));
        },
        ontimeout: () => {
          o(new Error("Request times out"));
        },
      });
    });
  }
};
