// ==UserScript==
// @name          Mediux - YAML to Kometa
// @version       2.4.0
// @description   Adds buttons to transform MediUX TV and movie YAML into Kometa-compatible metadata.
// @author        Journey Over
// @license       MIT
// @match         *://mediux.pro/*
// @require       https://cdn.jsdelivr.net/gh/StylusThemes/Userscripts@0171b6b6f24caea737beafbc2a8dacd220b729d8/libs/utils/utils.min.js
// @grant         none
// @run-at        document-end
// @icon          https://www.google.com/s2/favicons?sz=64&domain=mediux.pro
// @homepageURL   https://github.com/StylusThemes/Userscripts
// @downloadURL   https://github.com/StylusThemes/Userscripts/raw/main/userscripts/mediux-yaml-to-kometa.user.js
// @updateURL     https://github.com/StylusThemes/Userscripts/raw/main/userscripts/mediux-yaml-to-kometa.user.js
// ==/UserScript==

(function() {
  'use strict';

  const logger = Logger('Mediux - YAML to Kometa', { debug: false });

  const App = {
    utils: {
      getYear(setId) {
        const setLinkText = document.querySelector(`a[href="/sets/${setId}"]`)?.textContent?.trim() || '';
        const headingText = document.querySelector('h1')?.textContent?.trim() || '';
        const headerYearText = document.querySelector('header p:first-of-type')?.textContent?.trim() || '';

        return setLinkText.match(/\((\d{4})\)/)?.[1] ||
          headingText.match(/\((\d{4})\)/)?.[1] ||
          headerYearText.match(/^(\d{4})$/)?.[1] ||
          'Unknown';
      },

      showNotification(message, targetButton, duration = 3000) {
        const tooltip = document.createElement('div');
        tooltip.textContent = message;
        Object.assign(tooltip.style, {
          position: 'fixed',
          bottom: (window.innerHeight - targetButton.getBoundingClientRect().top + 6) + 'px',
          left: (targetButton.getBoundingClientRect().left + targetButton.offsetWidth / 2) + 'px',
          transform: 'translateX(-50%)',
          background: '#1f2937',
          color: '#f3f4f6',
          padding: '4px 10px',
          borderRadius: '6px',
          fontSize: '11px',
          lineHeight: '1.4',
          whiteSpace: 'nowrap',
          zIndex: '999',
          pointerEvents: 'none',
          boxShadow: '0 4px 6px -1px rgba(0,0,0,0.3)'
        });

        document.body.appendChild(tooltip);
        setTimeout(() => tooltip.remove(), duration);
      },

      updateButtonState(button, success = true) {
        const successClass = success ? 'text-green-500' : 'text-red-500';
        button.classList.remove('text-gray-400');
        button.classList.add(successClass);

        setTimeout(() => {
          button.classList.remove('text-green-500', 'text-red-500');
          button.classList.add('text-gray-400');
        }, 3000);
      },

      async resolveTvdbId(showTitle) {
        const tvdbLink = document.querySelector('a[href*="thetvdb.com/series/"]');
        if (tvdbLink) {
          const match = tvdbLink.href.match(/\/series\/(\d+)/);
          if (match) {
            logger.debug('TVDB ID resolved from DOM', { showTitle, tvdbId: match[1] });
            return match[1];
          }
        }

        try {
          const encodedTitle = encodeURIComponent(showTitle.trim());
          const response = await fetch(`https://api.tvmaze.com/search/shows?q=${encodedTitle}`);

          if (!response.ok) {
            logger.warn('TVmaze API request failed', { status: response.status, showTitle });
            return null;
          }

          const results = await response.json();

          if (!Array.isArray(results) || results.length === 0) {
            logger.debug('TVmaze returned no results', { showTitle });
            return null;
          }

          const tvdbId = results[0]?.show?.externals?.thetvdb;
          if (tvdbId) {
            logger.debug('TVDB ID resolved from TVmaze', { showTitle, tvdbId });
            return String(tvdbId);
          }

          logger.debug('TVmaze result missing TVDB ID', { showTitle });
          return null;
        } catch (error) {
          logger.error('TVmaze fetch failed', { showTitle, error: error.message });
          return null;
        }
      }
    },

    yaml: {
      async formatTvYml(codeblock, button) {
        let yamlContent = codeblock.textContent;

        const regexSetInfo = /(null|\d+): # TVDB id for (.*?)\. Set by (.*?) on MediUX\. (https:\/\/mediux\.pro\/sets\/(\d+))/;

        const setMatch = yamlContent.match(regexSetInfo);
        if (setMatch) {
          const originalTvdbId = setMatch[1];
          const showTitle = setMatch[2];
          const setUrl = setMatch[4];
          const setId = setMatch[5];
          const year = App.utils.getYear(setId);

          let tvdbId = originalTvdbId;

          if (originalTvdbId === 'null') {
            const resolvedId = await App.utils.resolveTvdbId(showTitle);
            if (resolvedId) {
              tvdbId = resolvedId;
            }
          }

          button.dataset.tvdbResolved = tvdbId !== originalTvdbId ? 'true' : 'false';

          yamlContent = yamlContent.replace(regexSetInfo, `# Posters from:\n# ${setUrl}\n\nmetadata:\n\n  ${tvdbId}: # ${showTitle} (${year})`);
        }

        yamlContent = yamlContent.replace(/^\s+# Posters from:/m, `# Posters from:`);
        yamlContent = yamlContent.replace(/(url_poster|url_background): (https:\/\/api\.mediux\.pro\/assets\/[a-z0-9\-]+)/g, '$1: "$2"');
        yamlContent = yamlContent.replace(/(\d+):\n\s+url_poster: (https:\/\/api\.mediux\.pro\/assets\/[a-z0-9\-]+)\n/g,
          (match, season, posterUrl) => `      ${season}:\n        url_poster: "${posterUrl}"\n`);

        codeblock.innerText = yamlContent;
        navigator.clipboard.writeText(yamlContent)
          .then(() => {
            App.utils.updateButtonState(button);
          })
          .catch(error => {
            logger.error('Clipboard write failed', error);
            App.utils.updateButtonState(button, false);
          });
      },

      formatMovieYml(codeblock, button) {
        let yamlContent = codeblock.textContent;

        const regexSetUrl = /https:\/\/mediux\.pro\/sets\/\d+/;
        const urlMatch = yamlContent.match(regexSetUrl);
        const setUrl = urlMatch ? urlMatch[0] : null;

        if (setUrl) {
          yamlContent = yamlContent.replace(
            /(\d+):\s*#\s*(.*?)\s*\((\d{4})\).*?(https:\/\/mediux\.pro\/sets\/\d+)/g,
            (match, movieId, movieTitle, releaseYear) => `${movieId}: # ${movieTitle.trim()} (${releaseYear})`
          );

          const yamlHeader = `# Posters from:\n# ${setUrl}\n\nmetadata:\n\n`;
          yamlContent = yamlContent.replace(/(^|\n)metadata:\n/g, '');
          yamlContent = yamlHeader + yamlContent;

          yamlContent = yamlContent
            .replace(/(url_poster|url_background): (https:\/\/api\.mediux\.pro\/assets\/\S+)/g, '$1: "$2"')
            .replace(/(\n\n)(\s+\n)/g, '\n\n')
            .replace(/\n{3,}/g, '\n\n');
        }

        codeblock.innerText = yamlContent;
        navigator.clipboard.writeText(yamlContent)
          .then(() => {
            App.utils.showNotification('YAML transformed and copied to clipboard!', button);
            App.utils.updateButtonState(button);
          })
          .catch(error => {
            logger.error('Clipboard write failed', error);
            App.utils.updateButtonState(button, false);
          });
      }
    },

    ui: {
      createInterface(codeblock) {
        if (!codeblock) return;

        const dialog = codeblock.closest('[role="dialog"]');
        if (!dialog) return;

        if (dialog.querySelector('#extbuttons')) return;

        const buttonConfigs = [
          {
            id: 'fytvbutton',
            title: 'Copy TV YAML to clipboard',
            icon: '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-tv w-4 h-4"><rect x="2" y="7" width="20" height="15" rx="2" ry="2"></rect><polyline points="17 2 12 7 7 2"></polyline></svg>',
            text: 'TV',
            action: async (button) => {
              try {
                const span = button.querySelector('span');
                if (span) span.textContent = 'Resolving…';
                button.style.opacity = '0.6';
                button.style.pointerEvents = 'none';
                button.setAttribute('aria-disabled', 'true');

                await App.yaml.formatTvYml(codeblock, button);

                if (span) span.textContent = 'TV';
                button.style.opacity = '1';
                button.style.pointerEvents = 'auto';
                button.removeAttribute('aria-disabled');

                const resolved = button.dataset.tvdbResolved === 'true';
                delete button.dataset.tvdbResolved;
                const message = resolved ?
                  'TVDB ID resolved · YAML copied to clipboard!' :
                  'YAML transformed and copied to clipboard!';
                App.utils.showNotification(message, button);
              } catch (error) {
                logger.error('TV YAML formatting failed', error);
                const span = button.querySelector('span');
                if (span) span.textContent = 'TV';
                button.style.opacity = '1';
                button.style.pointerEvents = 'auto';
                button.removeAttribute('aria-disabled');
                App.utils.updateButtonState(button, false);
                App.utils.showNotification('Failed to format TV YAML', button);
              }
            }
          },
          {
            id: 'fymoviebutton',
            title: 'Copy Movie YAML to clipboard',
            icon: '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-film-reel w-4 h-4"><circle cx="12" cy="12" r="8" stroke="currentColor" stroke-width="2"></circle><line x1="12" y1="4" x2="12" y2="20"></line><line x1="4" y1="12" x2="20" y2="12"></line><circle cx="12" cy="12" r="3" stroke="currentColor" stroke-width="2"></circle></svg>',
            text: 'Movie',
            action: async (button) => {
              try {
                await App.yaml.formatMovieYml(codeblock, button);
              } catch (error) {
                logger.error('Movie YAML formatting failed', error);
                App.utils.updateButtonState(button, false);
                App.utils.showNotification('Failed to format Movie YAML', button);
              }
            }
          }
        ];

        const extensionButtons = document.createElement('div');
        extensionButtons.id = 'extbuttons';
        extensionButtons.className = 'flex flex-wrap gap-2';
        extensionButtons.setAttribute('role', 'group');
        extensionButtons.setAttribute('aria-label', 'YAML actions');

        for (const config of buttonConfigs) {
          const button = document.createElement('button');
          button.id = config.id;
          button.type = 'button';
          button.title = config.title;
          button.className = 'inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium text-gray-400 hover:text-white border border-gray-700 hover:border-gray-500 transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-1 focus-visible:ring-gray-500';
          button.innerHTML = config.icon + '<span>' + config.text + '</span>';
          button.addEventListener('click', () => config.action(button));
          extensionButtons.appendChild(button);
        }

        // Find the dialog's direct child that contains the code block
        const codeBlockContainer = [...dialog.children].find(child => child.contains(codeblock));
        if (codeBlockContainer) {
          codeBlockContainer.before(extensionButtons);
        } else {
          dialog.appendChild(extensionButtons);
        }
      }
    },

    init() {
      observeElement('code.whitespace-pre-wrap', (codeblock) => {
        this.ui.createInterface(codeblock);
        logger('Initialized');
      });
    }
  };

  App.init();

  function observeElement(selector, callback) {
    const existing = document.querySelector(selector);
    if (existing) { callback(existing); return; }

    const observer = new MutationObserver(() => {
      const element = document.querySelector(selector);
      if (element) {
        callback(element);
      }
    });
    observer.observe(document.body, { childList: true, subtree: true });
  }

})();
