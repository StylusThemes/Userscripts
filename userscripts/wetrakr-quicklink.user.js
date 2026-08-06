// ==UserScript==
// @name          WeTrakr - Quick Link
// @version       1.0.0
// @description   Floating button linking the current title/person page to its WeTrakr page
// @author        Journey Over
// @license       MIT
// @match         https://www.imdb.com/title/*
// @match         https://www.imdb.com/name/*
// @match         https://thetvdb.com/series/*
// @match         https://www.thetvdb.com/series/*
// @match         https://thetvdb.com/movies/*
// @match         https://www.thetvdb.com/movies/*
// @match         https://thetvdb.com/people/*
// @match         https://www.thetvdb.com/people/*
// @match         https://www.themoviedb.org/movie/*
// @match         https://www.themoviedb.org/tv/*
// @match         https://www.themoviedb.org/person/*
// @match         https://letterboxd.com/film/*
// @grant         none
// @icon          https://www.google.com/s2/favicons?sz=64&domain=wetrakr.com
// @homepageURL   https://github.com/StylusThemes/Userscripts
// @downloadURL   https://github.com/StylusThemes/Userscripts/raw/main/userscripts/wetrakr-quicklink.user.js
// @updateURL     https://github.com/StylusThemes/Userscripts/raw/main/userscripts/wetrakr-quicklink.user.js
// ==/UserScript==

(function() {
  'use strict';

  const WETRAKR_PURPLE = '#4937E9';
  const WETRAKR_ICON_URL = 'https://wetrakr.com/assets/images/we_small.png';

  // Edit this to reposition the floating button.
  // Supported values: 'bottom-right', 'bottom-left', 'top-right', 'top-left'
  const CONFIG = { position: 'bottom-right' };

  // --- Per-site URL resolvers ---------------------------------------------
  // Each resolver looks at the current page and returns either:
  //   - a WeTrakr URL string, or
  //   - null if this page isn't a supported "top level" title/person page
  //     (e.g. a season/episode page, or an ID we can't find).

  // Detect IMDb episode pages from the <title>. Episode pages use a tt-id
  // just like top-level title pages, so the URL alone can't tell them
  // apart. Episode titles vary a lot - "Episode #1.6", a real episode
  // name ("Tuklo"), or a dated placeholder ("Episode dated 31 December
  // 2024") - but they all carry a "(TV Episode <year>)" marker, e.g.
  //   "The Night Manager" Episode #1.6 (TV Episode 2016) - IMDb
  //   "Echo" Tuklo (TV Episode 2024) - IMDb
  function isImdbEpisodePage() {
    const title = (document.title || '').trim();
    return /\(TV Episode\b/i.test(title);
  }

  function resolveImdb() {
    const path = location.pathname;

    // Title pages: only top-level tt pages, not seasons/episodes.
    const titleMatch = path.match(/^\/title\/(tt\d+)\/?$/);
    if (titleMatch) {
      if (isImdbEpisodePage()) {
        return null;
      }
      return `https://wetrakr.com/imdb/${titleMatch[1]}`;
    }

    // Name/person pages
    const nameMatch = path.match(/^\/name\/(nm\d+)\/?$/);
    if (nameMatch) {
      return `https://wetrakr.com/imdb/${nameMatch[1]}/`;
    }

    return null;
  }

  // Grabs a clean title for TVDB movie/person pages, which don't need a
  // numeric-id lookup for the search fallback - just the title text.
  // Prefer the page's <h1>, falling back to the <title> tag with the
  // " - TheTVDB.com" suffix stripped.
  function getTvdbPageTitle() {
    const h1 = document.querySelector('h1');
    if (h1 && h1.textContent.trim()) {
      return h1.textContent.trim();
    }
    return (document.title || '').replace(/\s*-\s*TheTVDB\.com\s*$/i, '').trim();
  }

  // Cast-credit pages, e.g. /series/dexter/people/63318585 or
  // /movies/iron-man/people/12139864. The page's own <h1> is the
  // *character* name, not the actor - the actor's real name and TVDB
  // person link live in a separate "Played By" list item, e.g.
  //   <li><strong>Played By</strong><span><a href="/people/310980-...">
  //     Michael C. Hall</a></span></li>
  function getTvdbCastCreditActorName() {
    const items = document.querySelectorAll('li');
    for (const item of items) {
      const label = item.querySelector('strong');
      if (label && /Played By/i.test(label.textContent)) {
        const link = item.querySelector('a');
        if (link && link.textContent.trim()) {
          return link.textContent.trim();
        }
        const span = item.querySelector('span');
        if (span && span.textContent.trim()) {
          return span.textContent.trim();
        }
      }
    }
    return null;
  }

  function resolveTvdb() {
    const path = location.pathname;

    // Cast-credit pages under a series or movie, e.g.
    // /series/dexter/people/63318585, /movies/iron-man/people/12139864
    if (/^\/(series|movies)\/[^/]+\/people\/\d+\/?$/.test(path)) {
      const actorName = getTvdbCastCreditActorName();
      if (actorName) {
        return `https://wetrakr.com/search/people?q=${encodeURIComponent(actorName)}`;
      }
      return null;
    }

    // Series pages: restrict to the top-level series page itself, not
    // /series/<slug>/seasons/... or /series/<slug>/episodes/...
    if (/^\/series\/[^/]+\/?$/.test(path)) {
      // Strategy 1: the numeric TheTVDB series ID appears as plain text
      // after a "TheTVDB.com Series ID" <strong> label, e.g.
      //   <li><strong>TheTVDB.com Series ID</strong> 81189</li>
      const items = document.querySelectorAll('li');
      for (const item of items) {
        const label = item.querySelector('strong');
        if (label && /TheTVDB\.com Series ID/i.test(label.textContent)) {
          const rest = item.textContent.replace(label.textContent, '');
          const idMatch = rest.match(/\d+/);
          if (idMatch) {
            return `https://wetrakr.com/tvdb/${idMatch[0]}`;
          }
        }
      }

      // Strategy 2 (fallback): the "Edit Series" link always encodes the
      // numeric series ID in its href, e.g. /series/81189/edit
      const editLink = document.querySelector('a[href*="/series/"][href$="/edit"]');
      if (editLink) {
        const idMatch = editLink.getAttribute('href').match(/\/series\/(\d+)\/edit/);
        if (idMatch) {
          return `https://wetrakr.com/tvdb/${idMatch[1]}`;
        }
      }

      return null;
    }

    // Movie pages: no reliable WeTrakr movie-id lookup, so fall back to a
    // WeTrakr site search on the movie's title, e.g. /movies/iron-man
    if (/^\/movies\/[^/]+\/?$/.test(path) && path !== '/movies/create') {
      const title = getTvdbPageTitle();
      if (title) {
        return `https://wetrakr.com/search/movies?q=${encodeURIComponent(title)}`;
      }
      return null;
    }

    // Person pages: same search fallback, e.g. /people/255143-robert-downey-jr
    if (/^\/people\/\d+(?:-[^/]*)?\/?$/.test(path)) {
      const title = getTvdbPageTitle();
      if (title) {
        return `https://wetrakr.com/search/people?q=${encodeURIComponent(title)}`;
      }
      return null;
    }

    return null;
  }

  function resolveTmdb() {
    const path = location.pathname;

    // Match the movie/tv/person id+slug prefix, and persist across that
    // title's subpages (cast, crew, reviews, etc.) the same way Letterboxd
    // does - but explicitly exclude season/episode subpages, which aren't
    // supported.
    if (/\/(season|episode)\//i.test(path)) {
      return null;
    }

    const match = path.match(/^\/(movie|tv|person)\/(\d+)(?:-[^/]*)?(?:\/.*)?$/);
    if (!match) {
      return null;
    }

    const [, kind, id] = match;
    const typeMap = { movie: 'movie', tv: 'show', person: 'person' };
    return `https://wetrakr.com/tmdb/${typeMap[kind]}/${id}`;
  }

  function resolveLetterboxd() {
    // Persist across a film's subpages (crew, reviews, genres, etc.) since
    // they all live under the same /film/<slug>/ prefix and the slug is
    // all WeTrakr needs.
    const match = location.pathname.match(/^\/film\/([^/]+)\/?/);
    if (!match) {
      return null;
    }
    return `https://wetrakr.com/letterboxd/${match[1]}`;
  }

  function resolveWetrakrUrl() {
    const host = location.hostname;
    if (host === 'www.imdb.com') return resolveImdb();
    if (host === 'thetvdb.com' || host === 'www.thetvdb.com') return resolveTvdb();
    if (host === 'www.themoviedb.org') return resolveTmdb();
    if (host === 'letterboxd.com') return resolveLetterboxd();
    return null;
  }

  // --- UI -------------------------------------------------------------

  function getPositionOffsets() {
    const map = {
      'bottom-right': 'bottom: 24px; right: 28px;',
      'bottom-left': 'bottom: 24px; left: 28px;',
      'top-right': 'top: 24px; right: 28px;',
      'top-left': 'top: 24px; left: 28px;'
    };
    return map[CONFIG.position] || map['bottom-right'];
  }

  function injectStyles() {
    const pos = getPositionOffsets();
    const style = document.createElement('style');
    style.textContent = `
      #wetrakr-quicklink {
        position: fixed;
        ${pos}
        z-index: 99999;
      }

      #wetrakr-quicklink a {
        width: 52px;
        height: 52px;
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
        background: ${WETRAKR_PURPLE};
        box-shadow:
          0 2px 6px rgba(0,0,0,0.28),
          0 0 0 3px rgba(73,55,233,0.18);
        text-decoration: none;
        transition:
          transform 0.2s cubic-bezier(0.34,1.56,0.64,1),
          box-shadow 0.2s ease,
          filter 0.2s ease;
      }

      #wetrakr-quicklink a:hover {
        transform: scale(1.1);
        box-shadow:
          0 4px 14px rgba(73,55,233,0.45),
          0 0 0 3px rgba(73,55,233,0.32);
        filter: brightness(1.08);
      }

      #wetrakr-quicklink a:active {
        transform: scale(0.95);
        box-shadow:
          0 1px 4px rgba(0,0,0,0.3),
          0 0 0 3px rgba(73,55,233,0.2);
        transition-duration: 0.08s;
      }

      #wetrakr-quicklink a:focus-visible {
        outline: 2px solid ${WETRAKR_PURPLE};
        outline-offset: 3px;
        box-shadow:
          0 2px 6px rgba(0,0,0,0.28),
          0 0 0 5px rgba(73,55,233,0.28);
      }

      #wetrakr-quicklink img {
        width: 30px;
        height: 30px;
        border-radius: 50%;
        pointer-events: none;
        transition: filter 0.2s ease;
      }

      #wetrakr-quicklink a:hover img {
        filter: brightness(1.12);
      }
    `;
    document.head.appendChild(style);
  }

  function createButton(url) {
    const isSearch = /\/search\//.test(url);
    const label = isSearch ? 'Search on WeTrakr' : 'Open on WeTrakr';

    const container = document.createElement('div');
    container.id = 'wetrakr-quicklink';

    const link = document.createElement('a');
    link.href = url;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    link.title = label;
    link.setAttribute('aria-label', label);

    const img = document.createElement('img');
    img.src = WETRAKR_ICON_URL;
    img.alt = 'WeTrakr';

    link.appendChild(img);
    container.appendChild(link);
    document.body.appendChild(container);
  }

  function init() {
    const url = resolveWetrakrUrl();
    if (!url) {
      return;
    }
    injectStyles();
    createButton(url);
  }

  init();
})();
