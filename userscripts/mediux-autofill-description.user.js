// ==UserScript==
// @name          Mediux - Auto-fill description field
// @version       1.0.0
// @description   Adds a button to auto-fill the description field with attribution text
// @author        Journey Over
// @license       MIT
// @match         *://mediux.pro/*
// @require       https://cdn.jsdelivr.net/gh/StylusThemes/Userscripts@0171b6b6f24caea737beafbc2a8dacd220b729d8/libs/utils/utils.min.js
// @grant         none
// @icon          https://www.google.com/s2/favicons?sz=32&domain=mediux.pro
// @homepageURL   https://github.com/StylusThemes/Userscripts
// @downloadURL   https://raw.githubusercontent.com/StylusThemes/Userscripts/master/userscripts/mediux-autofill-description.user.js
// @updateURL     https://raw.githubusercontent.com/StylusThemes/Userscripts/master/userscripts/mediux-autofill-description.user.js
// ==/UserScript==

(function() {
  'use strict';

  const logger = Logger('Mediux - Auto-fill description field', { debug: false });

  const BUTTON_ID = 'custom-autofill-btn';
  const EDITOR_SELECTOR = '.tiptap.ProseMirror';

  const TOOLBAR_VARIANTS = [
    {
      selector: '#toolbar',
      buttonClasses: 'inline-flex items-center justify-center rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 bg-transparent hover:bg-vibrant/20 hover:text-accent-foreground h-10 px-3'
    },
    {
      selector: '.flex.space-x-2',
      buttonClasses: 'text-muted-foreground bg-vibrant/20 hover:border-vibrant border border-muted-background rounded-lg px-2 py-1 font-semibold text-sm'
    }
  ];

  const ATTRIBUTION_HTML = `
    <p>All artwork, text, and assets used are sourced from or created using:</p>
    <ul>
        <li>Databases &amp; Repositories: CineMaterial, FanArt.tv, IMDB, MediUX, MovieStillsDB, PXFuel, Rotten Tomatoes, TMDB, TPDB, and TVDB.</li>
        <li>Official Sources: Original networks, streaming services, and promotional materials.</li>
        <li>General Search: Google Images.</li>
        <li>Original Content: Created and edited by me unless specifically stated otherwise.</li>
    </ul>
    <p>If you feel that your artwork has been used improperly, please report the poster.</p>
  `;

  function findToolbar() {
    const editor = document.querySelector(EDITOR_SELECTOR);
    if (!editor) return null;

    // Walk ancestors from the editor, looking for the nearest container
    // that also holds a toolbar. This guarantees spatial relationship.
    let ancestor = editor.parentElement;
    while (ancestor && ancestor !== document.body) {
      for (const variant of TOOLBAR_VARIANTS) {
        const toolbar = ancestor.querySelector(variant.selector);
        // toolbar must be inside this ancestor but NOT inside the editor itself
        if (toolbar && !editor.contains(toolbar)) {
          return { element: toolbar, buttonClasses: variant.buttonClasses };
        }
      }
      ancestor = ancestor.parentElement;
    }
    return null;
  }

  function replaceEditorContent(html) {
    const editor = document.querySelector(EDITOR_SELECTOR);
    if (!editor) {
      logger.error('Text editor not found.');
      return;
    }

    editor.focus();

    const range = document.createRange();
    range.selectNodeContents(editor);

    const selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);

    // execCommand is deprecated but required here for TipTap/ProseMirror undo/redo integration
    document.execCommand('insertHTML', false, html);
  }

  function injectButton() {
    if (document.getElementById(BUTTON_ID)) return;

    const toolbar = findToolbar();
    if (!toolbar) return;

    const button = document.createElement('button');
    button.id = BUTTON_ID;
    button.type = 'button';
    button.innerText = 'Fill Credits';
    button.className = toolbar.buttonClasses;
    button.style.marginLeft = '8px';

    button.addEventListener('click', () => replaceEditorContent(ATTRIBUTION_HTML));

    toolbar.element.appendChild(button);
  }

  const observer = new MutationObserver(() => injectButton());
  observer.observe(document.body, { childList: true, subtree: true });

  injectButton();
})();
