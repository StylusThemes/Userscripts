// ==UserScript==
// @name          WeTrakr - Mods
// @version       1.0.0
// @description   Modifications and enhancements for WeTrakr
// @author        Journey Over
// @license       MIT
// @match         *://wetrakr.com/*
// @grant         GM_addStyle
// @icon          https://www.google.com/s2/favicons?sz=64&domain=wetrakr.com
// @homepageURL   https://github.com/StylusThemes/Userscripts
// @downloadURL   https://github.com/StylusThemes/Userscripts/raw/main/userscripts/wetrakr-mods.user.js
// @updateURL     https://github.com/StylusThemes/Userscripts/raw/main/userscripts/wetrakr-mods.user.js
// ==/UserScript==

(function() {
  'use strict';

  GM_addStyle(`

    /* ===== Title Stack (Actor) ===== */
    .detail-grid--person .person-badge-department {
      font-size: 14px !important;
      margin: 5px 0 0 12px !important;
    }

    .detail-grid--person [class="detail-status-line"] .detail-status-badge {
      background: none !important;
      padding: 0 !important;
    }

    .detail-grid--person [class="detail-status-line"] .detail-status-badge + .detail-status-badge::before {
      content: "∙";
      margin: 0 10px 0 4px;
      font-weight: bold;
    }

    /* ===== Title Stack (Movies + Shows) ===== */
    /* [class="detail-grid"] matches the exact class only, so it skips the modifier grids */
    [class="detail-grid"] .title-stack {
      display: flex;
      flex-direction: column;
    }

    [class="detail-grid"] .title-stack .we-heading-1 {
      order: 1;
    }

    [class="detail-grid"] .title-stack .detail-status-line.detail-meta-line {
      order: 2;
      margin-bottom: var(--space-2);
    }

    [class="detail-grid"] .title-stack .detail-status-line:not(.detail-meta-line) {
      order: 3;
      margin-bottom: 15px;
    }

    [class="detail-grid"] .detail-status-badge.rs-clone {
      align-self: center;
      margin-left: var(--space-2);
      margin-right: 0;
      margin-bottom: -4px;
    }

    [class="detail-grid"] .detail-status-badge.rs-clone:not(.detail-status-badge--airing) {
      border: 1px solid currentColor;
      border-radius: var(--radius-1);
      padding: 2px 6px;
      background: none;
    }

    [class="detail-grid"] .detail-status-line.detail-meta-line .detail-status-badge {
      background: none !important;
      padding: 0 !important;
    }

    [class="detail-grid"] .detail-status-line.detail-meta-line .detail-status-badge + .detail-status-badge::before {
      content: "∙";
      margin: 0 10px 0 4px;
      font-weight: bold;
    }

    [class="detail-grid"] .detail-overview-block .we-text-body.detail-directed-by {
      padding-bottom: 15px;
    }

    /* ===== Title Stack (Season) ===== */
    .detail-grid--season .detail-grid__info .title-stack.title-center {
      display: flex !important;
      flex-direction: column !important;
    }

    /* 1. Season nav pill - stays first */
    .detail-grid--season .detail-grid__info .title-stack .detail-nav-links--season {
      order: 1;
    }

    /* 2. Show title - promote breadcrumb link, hide the "/ Season X" part */
    .detail-grid--season .detail-grid__info .title-stack .detail-breadcrumb {
      order: 2;
    }

    .detail-grid--season .detail-grid__info .title-stack .detail-breadcrumb a.we-link-body {
      font-size: var(--font-size-4) !important;
      font-weight: 800 !important;
      letter-spacing: -0.02em;
      line-height: var(--line-height-0);
      color: #fff;
      text-decoration: none;
    }

    .detail-grid--season .detail-grid__info .title-stack .detail-breadcrumb a.we-link-body:hover {
      text-decoration: underline;
    }

    .detail-grid--season .detail-grid__info .title-stack .detail-breadcrumb span,
    .detail-grid--season .detail-grid__info .title-stack .detail-breadcrumb .detail-breadcrumb__current {
      display: none !important;
    }

    /* 3. Season number - demoted to secondary heading */
    .detail-grid--season .detail-grid__info .title-stack .we-heading-1 {
      order: 3;
      font-size: 22px !important;
      font-weight: 700 !important;
      letter-spacing: 0.4px !important;
    }

    .detail-grid--season .detail-grid__info .title-stack .we-heading-1 .we-text-accent {
      display: none;
    }

    /* 4. Date / episode count - positioned last */
    .detail-grid--season .detail-grid__info .title-stack > p.we-text-body:not(.detail-breadcrumb) {
      order: 4;
      margin-bottom: 10px !important;
      font-size: var(--font-size-0);
      font-weight: 600;
      letter-spacing: 0.6px;
      text-transform: uppercase;
    }

    /* ===== Title Stack (Episode) ===== */
    .detail-grid--episode .detail-grid__info .title-stack.title-center {
      display: flex !important;
      flex-flow: row wrap !important;
      align-items: baseline !important;
    }

    /* 1. Episode nav pill - stays first */
    .detail-grid--episode .detail-grid__info .title-stack .detail-nav-links {
      order: 1;
      flex-basis: 100%;
    }

    /* Breadcrumb becomes "invisible" as a box - its children join the flex flow directly */
    .detail-grid--episode .detail-grid__info .title-stack .detail-breadcrumb {
      display: contents;
    }

    /* New Episode + New Season Badge */
    .detail-grid--episode .detail-grid__info .title-stack .episode-milestone-badge-detail,
    .detail-grid--episode .detail-grid__info .title-stack .episode-upcoming-icon-detail {
      position: static !important;
      order: 2;
    }

    .detail-grid--episode .detail-grid__info .title-stack .badge-linebreak {
      order: 2;
      flex-basis: 100%;
      width: 0;
      height: 0;
    }

    /* 2. Episode title - split to own line, large */
    .detail-grid--episode .detail-grid__info .title-stack .detail-breadcrumb a.we-link-body:first-child {
      order: 3;
      font-size: var(--font-size-4) !important;
      font-weight: 800 !important;
      letter-spacing: -0.02em;
      line-height: var(--line-height-0);
      color: #fff;
      text-decoration: none;
      margin-bottom: -3px;
    }

    .detail-grid--episode .detail-grid__info .title-stack .detail-breadcrumb a.we-link-body:hover {
      text-decoration: underline;
    }

    .detail-grid--episode .detail-grid__info .title-stack .ep-linebreak {
      order: 3;
      flex-basis: 100%;
      width: 0;
      height: 0;
    }

    .detail-grid--episode .detail-grid__info .title-stack .detail-breadcrumb span:not(.detail-breadcrumb__current):not(.ep-linebreak) {
      display: none !important;
    }

    /* 3.1. Episode details - season # */
    .detail-grid--episode .detail-grid__info .title-stack .detail-breadcrumb a.we-link-body:nth-of-type(2) {
      order: 4;
      font-size: 22px !important;
      font-weight: 700 !important;
      letter-spacing: 0.4px !important;
      text-decoration: none;
    }

    /* 3.2. Episode details - episode # */
    .detail-grid--episode .detail-grid__info .title-stack .detail-breadcrumb .detail-breadcrumb__current {
      order: 5;
      font-size: 22px !important;
      font-weight: 700 !important;
      letter-spacing: 0.4px !important;
    }

    .detail-grid--episode .detail-grid__info .title-stack .detail-breadcrumb .detail-breadcrumb__current::before {
      content: "∙";
      margin: 0 6px;
    }

    /* 3.3. Episode details - episode title */
    .detail-grid--episode .detail-grid__info .title-stack .we-heading-1 {
      order: 6;
      font-size: 22px !important;
      font-weight: 700 !important;
      letter-spacing: 0.4px !important;
    }

    .detail-grid--episode .detail-grid__info .title-stack .we-heading-1::before {
      content: "–";
      margin: 0 2px 0 6px;
    }

    .detail-grid--episode .detail-grid__info .title-stack .we-heading-1 .we-text-accent {
      display: none;
    }

    /* 4. Date / runtime - positioned last */
    .detail-grid--episode .detail-grid__info .title-stack > p.we-text-body:not(.detail-breadcrumb) {
      order: 7;
      flex-basis: 100%;
      margin-bottom: 10px !important;
      font-size: var(--font-size-0);
      font-weight: 600;
      letter-spacing: 0.6px;
      text-transform: uppercase;
    }

    /* ===== Hover Border ===== */
    .media-item__border-overlay, .episode-item__border-overlay {
      display: none !important;
    }

  `);

  // ===== Move status badge to appear after the certification badge =====
  const visibleTitleStack = () => [...document.querySelectorAll('.title-stack')].find((element) => element.offsetParent !== null);

  const visibleEpisodeTitleStack = () => {
    const grid = document.querySelector('.detail-grid--episode .detail-grid__info');
    if (!grid) return null;
    return [...grid.querySelectorAll('.title-stack')].find((element) => element.offsetParent !== null);
  };

  function moveStatusBadge() {
    const titleStack = visibleTitleStack();
    const h1 = titleStack?.querySelector('.we-heading-1');
    const cert = h1?.querySelector('.detail-certification');
    const statusLine = titleStack?.querySelector('.detail-status-line:not(.detail-meta-line)');
    const statusBadge = statusLine?.querySelector('.detail-status-badge:not(.rs-hidden-original):not(.detail-status-badge--genre)');

    if (!h1 || !cert || !statusBadge || h1.querySelector('.rs-clone')) return;

    statusBadge.classList.add('rs-hidden-original');
    statusBadge.style.display = 'none';

    const clone = statusBadge.cloneNode(true);
    clone.classList.remove('rs-hidden-original');
    clone.classList.add('rs-clone');
    clone.style.display = '';
    cert.after(clone);
  }

  // Insert an invisible spacer span after a target, forcing the flex row to wrap.
  function ensureLineBreakAfter(container, targetSelector, spacerClass) {
    const target = container?.querySelector(targetSelector);
    if (!target) return;
    if (target.nextElementSibling?.classList.contains(spacerClass)) return;

    const spacer = document.createElement('span');
    spacer.className = spacerClass;
    target.insertAdjacentElement('afterend', spacer);
  }

  function applyEpisodeLineBreaks() {
    const titleStack = visibleEpisodeTitleStack();
    if (!titleStack) return;
    ensureLineBreakAfter(titleStack, '.detail-breadcrumb a.we-link-body:first-child', 'ep-linebreak');
    ensureLineBreakAfter(titleStack, '.episode-milestone-badge-detail, .episode-upcoming-icon-detail', 'badge-linebreak');
  }

  // ===== 24-hour to 12-hour timestamp conversion =====

  function convertTo12Hour(hours, minutes) {
    const period = hours >= 12 ? 'PM' : 'AM';
    const hour12 = hours % 12 || 12;
    return hour12 + ':' + minutes.toString().padStart(2, '0') + ' ' + period;
  }

  function convertTextNode(node) {
    const text = node.textContent;
    const trimmed = text.trim();

    // "MM/DD/YYYY | HH:MM" -> "MM/DD/YYYY | h:MM AM/PM"
    const dateMatch = trimmed.match(/^(\d{2}\/\d{2}\/\d{4}) \| (\d{2}):(\d{2})$/);
    if (dateMatch) {
      node.textContent = dateMatch[1] + ' | ' + convertTo12Hour(+dateMatch[2], +dateMatch[3]);
      return;
    }

    // "· HH:MM" -> "· h:MM AM/PM"; negative lookahead avoids re-matching already-converted times
    if (/· \d{2}:\d{2}(?!\s*[AP]M)/i.test(text)) {
      node.textContent = text.replace(/· (\d{2}):(\d{2})(?!\s*[AP]M)/gi, (_, hour, minute) => '· ' + convertTo12Hour(+hour, +minute));
      return;
    }

    // Dot-format fix: "8.00PM" -> "8:00 PM"
    node.textContent = node.textContent.replace(/(\d{1,2})\.(\d{2})\s?(AM|PM)/gi, '$1:$2 $3');
  }

  function updateTimestamps() {
    for (const element of document.querySelectorAll('.entity-release-date, .detail-status-badge--airing, .media-item__progress-bar-text--episode')) {
      for (const child of element.childNodes) {
        if (child.nodeType === Node.TEXT_NODE) {
          convertTextNode(child);
        }
      }
    }
  }

  function applyMods() {
    moveStatusBadge();
    applyEpisodeLineBreaks();
    updateTimestamps();
  }

  applyMods();

  // Throttle the body-wide observer so the mods reapply within ~100ms of any
  // change without starving during continuous mutation (a debounce would keep
  // resetting while the page churns). All helpers are idempotent.
  let applyTimer;
  let lastRun = 0;
  const RUN_INTERVAL = 100;

  const schedule = () => {
    const wait = Math.max(0, RUN_INTERVAL - (Date.now() - lastRun));
    clearTimeout(applyTimer);
    applyTimer = setTimeout(() => {
      lastRun = Date.now();
      applyMods();
    }, wait);
  };

  const observer = new MutationObserver(schedule);
  observer.observe(document.body, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['class', 'style']
  });
})();
