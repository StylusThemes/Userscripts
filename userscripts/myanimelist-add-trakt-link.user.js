// ==UserScript==
// @name          MyAnimeList - Add Trakt link
// @version       1.1.0
// @description   Add trakt link to MyAnimeList anime pages
// @author        Journey Over
// @license       MIT
// @match         *://myanimelist.net/anime/*
// @require       https://cdn.jsdelivr.net/gh/StylusThemes/Userscripts@c185c2777d00a6826a8bf3c43bbcdcfeba5a9566/libs/gm/gmcompat.min.js
// @require       https://cdn.jsdelivr.net/gh/StylusThemes/Userscripts@c185c2777d00a6826a8bf3c43bbcdcfeba5a9566/libs/utils/utils.min.js
// @require       https://cdn.jsdelivr.net/gh/StylusThemes/Userscripts@[wip]/libs/metadata/animeapi/animeapi.min.js
// @grant         GM.xmlHttpRequest
// @grant         GM.setValue
// @grant         GM.getValue
// @run-at        document-end
// @inject-into   content
// @icon          https://www.google.com/s2/favicons?sz=64&domain=myanimelist.net
// @homepageURL   https://github.com/StylusThemes/Userscripts
// @downloadURL   https://github.com/StylusThemes/Userscripts/raw/main/userscripts/myanimelist-add-trakt-link.user.js
// @updateURL     https://github.com/StylusThemes/Userscripts/raw/main/userscripts/myanimelist-add-trakt-link.user.js
// ==/UserScript==

(async function() {
  'use strict';

  const logger = Logger('MAL - Add Trakt link', { debug: false });

  const animeapi = new AnimeAPI();

  const malId = window.location.pathname.split('/')[2];
  if (!malId) {
    logger.warn('No MAL ID found in URL');
    return;
  }

  // Find navigation elements
  const navUl = document.querySelector('#horiznav_nav ul');
  if (!navUl) {
    logger.error('Could not find navigation list');
    return;
  }

  // Check for existing Trakt link
  if (navUl.querySelector('a[href*="trakt.tv"]')) {
    logger.debug('Trakt link already exists');
    return;
  }

  // Check cache first
  const cachedData = await GMC.getValue(malId);
  if (cachedData) {
    try {
      // Check if cache is still valid (24 hours)
      if (Date.now() - cachedData.timestamp < 24 * 60 * 60 * 1000) {
        logger.debug(`Using cached data for MAL ID ${malId}`);
        createTraktLink(cachedData.data);
        return;
      } else {
        logger.debug(`Cache expired for MAL ID ${malId}`);
      }
    } catch (err) {
      logger.error(`Error parsing cached data: ${err.message}`);
    }
  }

  // Fetch from API if no valid cache
  logger(`Fetching Trakt data for MAL ID ${malId}`);
  animeapi.fetch('myanimelist', malId).then(data => {
    if (!data.trakt || !data.trakt_type) {
      logger.warn('No Trakt data found in API response');
      return;
    }

    // Store in GMC storage with timestamp
    GMC.setValue(malId, {
      data: data,
      timestamp: Date.now()
    });

    // Add Trakt link to page
    addTraktLink(data.trakt, data.trakt_type);
  }).catch(error => {
    logger.error(`Failed to fetch from AnimeAPI: ${error.message}`);
  });

  function createTraktLink(data) {
    // Create Trakt URL
    const traktUrl = `https://trakt.tv/${data.trakt_type}/${data.trakt}`;

    // Create list item matching MAL's style
    const listItem = document.createElement('li');
    const link = document.createElement('a');

    // Styling to match MAL's navigation links
    link.href = traktUrl;
    link.textContent = 'Trakt';
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    link.className = 'horiznav_link';
    link.style.cssText = `
          color: inherit;
          text-decoration: none;
          transition: color 0.2s ease;
      `;

    // Hover effect
    link.addEventListener('mouseover', () => {
      link.style.color = '#2e51a2';
      link.style.textDecoration = 'none';
    });
    link.addEventListener('mouseout', () => {
      link.style.color = 'inherit';
    });

    // Append as the last item in the navigation list
    navUl.appendChild(listItem);
    listItem.appendChild(link);

    logger(`Added Trakt link: ${traktUrl}`);
  }
})();
