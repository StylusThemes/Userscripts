// ==UserScript==
// @name          GitHub - Latest
// @version       2.0.0
// @description   Always keep an eye on the latest activity of your favorite projects
// @author        Journey Over
// @license       MIT
// @match         *://github.com/*
// @require       https://cdn.jsdelivr.net/gh/StylusThemes/Userscripts@0171b6b6f24caea737beafbc2a8dacd220b729d8/libs/utils/utils.min.js
// @grant         none
// @run-at        document-end
// @icon          https://www.google.com/s2/favicons?sz=64&domain=github.com
// @homepageURL   https://github.com/StylusThemes/Userscripts
// @downloadURL   https://github.com/StylusThemes/Userscripts/raw/main/userscripts/github-latest.user.js
// @updateURL     https://github.com/StylusThemes/Userscripts/raw/main/userscripts/github-latest.user.js
// ==/UserScript==

(async function() {
  'use strict';

  const logger = Logger('GH - Latest', { debug: false });
  const BUTTON_ID = 'latest-issues-button';
  const QUERY_STRING = 'q=sort%3Aupdated-desc';
  const NAVIGATION_SELECTOR = 'nav[aria-label="Repository"][data-variant="inset"] > ul[role="list"]';

  const findTemplateTab = (navigationBody) => {
    for (const selector of ['a[data-tab-item="issues"]', 'a[data-tab-item="pulls"]', 'a[href*="/issues"], a[href*="/pulls"]']) {
      const anchor = navigationBody.querySelector(selector);
      if (anchor) return anchor.closest('li') || anchor;
    }
    return null;
  };

  const createLatestIssuesTab = (templateTab) => {
    const clonedTab = templateTab.cloneNode(true);
    const anchorElement = clonedTab.querySelector('a') || clonedTab;

    if (!anchorElement) return clonedTab;

    anchorElement.id = BUTTON_ID;

    try {
      const urlObject = new URL(anchorElement.href, location.origin);
      urlObject.search = QUERY_STRING;
      anchorElement.href = urlObject.href;
    } catch {
      const base = (anchorElement.href || '#').split('?')[0];
      anchorElement.href = base + '?' + QUERY_STRING;
    }

    anchorElement.removeAttribute('aria-current');
    anchorElement.removeAttribute('data-discover');
    anchorElement.removeAttribute('data-tab-item');
    anchorElement.removeAttribute('data-react-nav');

    const svgElement = clonedTab.querySelector('svg');
    if (svgElement) {
      svgElement.setAttribute('viewBox', '0 0 16 16');
      svgElement.innerHTML = `<path fill-rule="evenodd" d="M5.05 0.31c0.81 2.17 0.41 3.38-0.52 4.31-0.98 1.05-2.55 1.83-3.63 3.36-1.45 2.05-1.7 6.53 3.53 7.7-2.2-1.16-2.67-4.52-0.3-6.61-0.61 2.03 0.53 3.33 1.94 2.86 1.39-0.47 2.3 0.53 2.27 1.67-0.02 0.78-0.31 1.44-1.13 1.81 3.42-0.59 4.78-3.42 4.78-5.56 0-2.84-2.53-3.22-1.25-5.61-1.52 0.13-2.03 1.13-1.89 2.75 0.09 1.08-1.02 1.8-1.86 1.33-0.67-0.41-0.66-1.19-0.06-1.78 1.25-1.23 1.75-4.09-1.88-6.22l-0.02-0.02z"/>`;
    }

    const textSpan = clonedTab.querySelector('[data-component="text"]');
    if (textSpan) {
      textSpan.textContent = 'Latest issues';
      if (textSpan.hasAttribute('data-content')) textSpan.setAttribute('data-content', 'Latest issues');
    }

    const counterElement = clonedTab.querySelector('[data-component="counter"]');
    if (counterElement) counterElement.remove();

    return clonedTab;
  };

  const addLatestIssuesButton = () => {
    // Skip non-repo pages (e.g. /settings, /notifications, /dashboard)
    if (!/^\/[^\/]+\/[^\/]/.test(location.pathname)) return;

    const existingButton = document.getElementById(BUTTON_ID);
    if (existingButton && existingButton.isConnected) return;

    const navigationBody = document.querySelector(NAVIGATION_SELECTOR);
    if (!navigationBody) {
      logger.debug('Navigation selector not found');
      return;
    }

    const templateTab = findTemplateTab(navigationBody);
    if (!templateTab) {
      logger.debug('Template tab not found');
      return;
    }

    logger.debug('Adding latest issues button');
    const newTab = createLatestIssuesTab(templateTab);
    navigationBody.appendChild(newTab);

    if (location.pathname.includes('/issues') && location.search === '?' + QUERY_STRING) {
      const button = document.getElementById(BUTTON_ID);
      if (button) button.setAttribute('aria-current', 'page');
    }
  };

  const initialize = () => {
    logger('Initializing GitHub Latest Issues script');
    addLatestIssuesButton();

    // rAF polling: runs every frame (~16ms), pauses when tab is backgrounded.
    // Catches ALL removal scenarios (React re-render, CSS hide, tree replace).
    // addLatestIssuesButton has isConnected guard — repeated calls are cheap.
    const poll = () => {
      addLatestIssuesButton();
      requestAnimationFrame(poll);
    };
    requestAnimationFrame(poll);

    // Fallback for legacy GitHub pages that still use Turbo/PJAX (Gists, Wiki, etc.)
    document.addEventListener('turbo:render', addLatestIssuesButton);
    document.addEventListener('turbo:load', addLatestIssuesButton);
    document.addEventListener('pjax:end', addLatestIssuesButton);
    document.addEventListener('github-pjax', addLatestIssuesButton);
  };

  initialize();
})();
