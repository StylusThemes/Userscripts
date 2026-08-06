// ==UserScript==
// @name          WeTrakr - Quick Link
// @version       1.2.0
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

  // Supported: 'bottom-right' | 'bottom-left' | 'top-right' | 'top-left'
  const CONFIG = { position: 'bottom-right' };

  // ---------------------------------------------------------------------------
  // URL builders
  // ---------------------------------------------------------------------------

  const wetrakrUrl = (path) => `https://wetrakr.com/${path}`;
  const searchUrl = (kind, query) => wetrakrUrl(`search/${kind}?q=${encodeURIComponent(query)}`);

  // ---------------------------------------------------------------------------
  // Extraction helpers (small, focused, site-specific)
  // ---------------------------------------------------------------------------

  // IMDb episode pages use a tt-id just like title pages, but the <title> tag
  // always contains "(TV Episode <year>)" — episode titles vary wildly
  // ("Episode #1.6", "Tuklo", "Episode dated 31 December 2024") but the
  // parenthesised marker is consistent.
  const isImdbEpisode = () => /\(TV Episode\b/i.test(document.title || '');

  const imdbId = (path) => {
    const match = path.match(/^\/(title|name)\/(tt\d+|nm\d+)\/?$/);
    return match ? { kind: match[1], id: match[2] } : null;
  };

  // TVDB "Played By" actor name lives in a <li> with a <strong> label; the
  // actor's name is in the first <a> or <span> child — not the page <h1>,
  // which is the *character* name.
  const tvdbPlayedByActor = () => {
    for (const li of document.querySelectorAll('li')) {
      const label = li.querySelector('strong');
      if (label && /Played By/i.test(label.textContent)) {
        const name = (li.querySelector('a') || li.querySelector('span'));
        if (name && name.textContent.trim()) return name.textContent.trim();
      }
    }
    return null;
  };

  const tvdbPageTitle = () => {
    const h1 = document.querySelector('h1');
    if (h1 && h1.textContent.trim()) return h1.textContent.trim();
    return (document.title || '').replace(/\s*-\s*TheTVDB\.com\s*$/i, '').trim();
  };

  // TVDB series numeric ID: two strategies — (1) the "TheTVDB.com Series ID"
  // label followed by digits in a <li>, (2) the /series/<digits>/edit link.
  const tvdbSeriesId = () => {
    for (const li of document.querySelectorAll('li')) {
      const label = li.querySelector('strong');
      if (label && /TheTVDB\.com Series ID/i.test(label.textContent)) {
        const id = li.textContent.replace(label.textContent, '').match(/\d+/);
        if (id) return id[0];
      }
    }
    const editLink = document.querySelector('a[href*="/series/"][href$="/edit"]');
    if (editLink) {
      const id = editLink.getAttribute('href').match(/\/series\/(\d+)\/edit/);
      if (id) return id[1];
    }
    return null;
  };

  const tmdbMatch = (path) => {
    if (/\/(season|episode)\//i.test(path)) return null;
    return path.match(/^\/(movie|tv|person)\/(\d+)(?:-[^/]*)?(?:\/.*)?$/);
  };

  const letterboxdSlug = (path) => {
    const match = path.match(/^\/film\/([^/]+)\/?/);
    return match ? match[1] : null;
  };

  // ---------------------------------------------------------------------------
  // Resolvers — one per hostname group
  // ---------------------------------------------------------------------------

  const TMDB_KIND = { movie: 'movie', tv: 'show', person: 'person' };

  function resolveImdb() {
    const info = imdbId(location.pathname);
    if (!info) return null;
    if (info.kind === 'title' && isImdbEpisode()) return null;
    return wetrakrUrl(`imdb/${info.id}${info.kind === 'name' ? '/' : ''}`);
  }

  function resolveTvdb() {
    const path = location.pathname;

    // Cast-credit: /series|movies/<slug>/people/<digits>
    if (/^\/(series|movies)\/[^/]+\/people\/\d+\/?$/.test(path)) {
      const actor = tvdbPlayedByActor();
      return actor ? searchUrl('people', actor) : null;
    }

    // Top-level series: find the numeric TheTVDB ID
    if (/^\/series\/[^/]+\/?$/.test(path)) {
      const id = tvdbSeriesId();
      return id ? wetrakrUrl(`tvdb/${id}`) : null;
    }

    // Movies: search fallback by title
    if (/^\/movies\/[^/]+\/?$/.test(path) && path !== '/movies/create') {
      const title = tvdbPageTitle();
      return title ? searchUrl('movies', title) : null;
    }

    // Person: search fallback by title
    if (/^\/people\/\d+(?:-[^/]*)?\/?$/.test(path)) {
      const title = tvdbPageTitle();
      return title ? searchUrl('people', title) : null;
    }

    return null;
  }

  function resolveTmdb() {
    const match = tmdbMatch(location.pathname);
    return match ? wetrakrUrl(`tmdb/${TMDB_KIND[match[1]]}/${match[2]}`) : null;
  }

  function resolveLetterboxd() {
    const slug = letterboxdSlug(location.pathname);
    return slug ? wetrakrUrl(`letterboxd/${slug}`) : null;
  }

  // ---------------------------------------------------------------------------
  // Dispatch table: hostname → resolver
  // ---------------------------------------------------------------------------

  const RESOLVERS = {
    'www.imdb.com': resolveImdb,
    'thetvdb.com': resolveTvdb,
    'www.thetvdb.com': resolveTvdb,
    'www.themoviedb.org': resolveTmdb,
    'letterboxd.com': resolveLetterboxd
  };

  function resolveWetrakrUrl() {
    const resolver = RESOLVERS[location.hostname];
    return resolver ? resolver() : null;
  }

  // ---------------------------------------------------------------------------
  // UI — styles + button
  // ---------------------------------------------------------------------------

  const POSITION_STYLES = {
    'bottom-right': 'bottom:24px;right:28px;',
    'bottom-left': 'bottom:24px;left:28px;',
    'top-right': 'top:24px;right:28px;',
    'top-left': 'top:24px;left:28px;'
  };

  function injectStyles() {
    const pos = POSITION_STYLES[CONFIG.position] || POSITION_STYLES['bottom-right'];
    const isTop = CONFIG.position.startsWith('top');
    const tipEdge = isTop ? 'top' : 'bottom';
    const tipSlide = isTop ? '-4px' : '4px';
    const style = document.createElement('style');
    style.textContent = `
      @keyframes wetrakr-pop { 0% { transform: scale(0); opacity: 0; } 60% { transform: scale(1.08); } 100% { transform: scale(1); opacity: 1; } }
      #wetrakr-quicklink { position: fixed; ${pos} z-index: 99999; }
      #wetrakr-quicklink a { position: relative; display: flex; align-items: center; justify-content: center; width: 48px; height: 48px; border-radius: 14px; background: linear-gradient(145deg, #6c5ce7, ${WETRAKR_PURPLE}); border: 1px solid rgba(255,255,255,0.15); box-shadow: 0 2px 8px rgba(73,55,233,0.25), 0 1px 2px rgba(0,0,0,0.1); outline: none; text-decoration: none; animation: wetrakr-pop 0.4s cubic-bezier(0.34,1.56,0.64,1) both; transition: transform 0.2s cubic-bezier(0.4,0,0.2,1), box-shadow 0.2s ease; }
      #wetrakr-quicklink a::after { content: attr(aria-label); position: absolute; left: 50%; ${tipEdge}: calc(100% + 8px); transform: translateX(-50%) translateY(${tipSlide}); z-index: 1; white-space: nowrap; padding: 5px 10px; border-radius: 6px; background: rgba(30,30,30,0.92); color: #fff; font: 600 12px/1.3 system-ui, -apple-system, sans-serif; opacity: 0; pointer-events: none; transition: opacity 0.15s ease, transform 0.15s ease; }
      #wetrakr-quicklink a:hover { transform: translateY(-1px) scale(1.05); box-shadow: 0 6px 20px rgba(73,55,233,0.35), 0 2px 4px rgba(0,0,0,0.1); }
      #wetrakr-quicklink a:hover::after { opacity: 1; transform: translateX(-50%) translateY(0); }
      #wetrakr-quicklink a:active { transform: translateY(1px) scale(0.95); box-shadow: 0 1px 3px rgba(73,55,233,0.3); transition-duration: 0.08s; }
      #wetrakr-quicklink a:focus-visible { outline: 2px solid rgba(255,255,255,0.9); outline-offset: 3px; }
      #wetrakr-quicklink img { width: 26px; height: 26px; pointer-events: none; }
    `.trim();
    document.head.appendChild(style);
  }

  function createButton(url) {
    const isSearch = /\/search\//.test(url);
    const label = isSearch ? 'Search on WeTrakr' : 'Open on WeTrakr';

    const wrap = document.createElement('div');
    wrap.id = 'wetrakr-quicklink';

    const link = document.createElement('a');
    link.href = url;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    link.setAttribute('aria-label', label);

    const img = document.createElement('img');
    img.src = WETRAKR_ICON_URL;
    img.alt = '';

    link.appendChild(img);
    wrap.appendChild(link);
    document.body.appendChild(wrap);
  }

  // ---------------------------------------------------------------------------
  // Boot
  // ---------------------------------------------------------------------------

  const url = resolveWetrakrUrl();
  if (url) {
    injectStyles();
    createButton(url);
  }
})();
