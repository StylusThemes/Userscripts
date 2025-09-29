// ==UserScript==
// @name          Magnet Link to Real-Debrid
// @version       2.6.0
// @description   Automatically send magnet links to Real-Debrid
// @author        Journey Over
// @license       MIT
// @match         *://*/*
// @require       https://cdn.jsdelivr.net/gh/StylusThemes/Userscripts@c185c2777d00a6826a8bf3c43bbcdcfeba5a9566/libs/gm/gmcompat.min.js
// @require       https://cdn.jsdelivr.net/gh/StylusThemes/Userscripts@c185c2777d00a6826a8bf3c43bbcdcfeba5a9566/libs/utils/utils.min.js
// @grant         GM.xmlHttpRequest
// @grant         GM.getValue
// @grant         GM.setValue
// @grant         GM.registerMenuCommand
// @connect       api.real-debrid.com
// @icon          https://www.google.com/s2/favicons?sz=64&domain=real-debrid.com
// @homepageURL   https://github.com/StylusThemes/Userscripts
// @downloadURL   https://github.com/StylusThemes/Userscripts/raw/main/userscripts/magnet-link-to-real-debrid.user.js
// @updateURL     https://github.com/StylusThemes/Userscripts/raw/main/userscripts/magnet-link-to-real-debrid.user.js
// ==/UserScript==

(function() {
  'use strict';

  let logger;

  // Constants & Utilities
  const STORAGE_KEY = 'realDebridConfig';
  const API_BASE = 'https://api.real-debrid.com/rest/1.0';
  const ICON_SRC = 'https://fcdn.real-debrid.com/0830/favicons/favicon.ico';
  const INSERTED_ICON_ATTR = 'data-rd-inserted';

  const DEFAULTS = {
    apiKey: '',
    allowedExtensions: ['mp3', 'm4b', 'mp4', 'mkv', 'cbz', 'cbr'],
    filterKeywords: ['sample', 'bloopers', 'trailer'],
    manualFileSelection: false,
    debugEnabled: false
  };

  // Custom error for configuration problems
  class ConfigurationError extends Error {
    constructor(message) {
      super(message);
      this.name = 'ConfigurationError';
    }
  }

  // Custom error for Real-Debrid API issues
  class RealDebridError extends Error {
    constructor(message, statusCode = null, errorCode = null) {
      super(message);
      this.name = 'RealDebridError';
      this.statusCode = statusCode;
      this.errorCode = errorCode;
    }
  }

  // Handles loading and saving user configuration
  class ConfigManager {
    static _safeParse(value) {
      if (!value) return null;
      try {
        return typeof value === 'string' ? JSON.parse(value) : value;
      } catch (err) {
        logger.error('[Config] Failed to parse stored configuration, resetting to defaults.', err);
        return null;
      }
    }

    static async getConfig() {
      const stored = await GMC.getValue(STORAGE_KEY);
      const parsed = this._safeParse(stored) || {};
      return {
        ...DEFAULTS,
        ...parsed
      };
    }

    static async saveConfig(cfg) {
      if (!cfg || !cfg.apiKey) throw new ConfigurationError('API Key is required');
      await GMC.setValue(STORAGE_KEY, JSON.stringify(cfg));
    }

    static validateConfig(cfg) {
      const errors = [];
      if (!cfg || !cfg.apiKey) errors.push('API Key is missing');
      if (!Array.isArray(cfg.allowedExtensions)) errors.push('allowedExtensions must be an array');
      if (!Array.isArray(cfg.filterKeywords)) errors.push('filterKeywords must be an array');
      if (typeof cfg.manualFileSelection !== 'boolean') errors.push('manualFileSelection must be a boolean');
      if (typeof cfg.debugEnabled !== 'boolean') errors.push('debugEnabled must be a boolean');
      return errors;
    }
  }

  // Manages interactions with the Real-Debrid API
  class RealDebridService {
    #apiKey;

    // Cross-tab reservation settings
    static RATE_STORE_KEY = 'realDebrid_rate_counter';
    static RATE_LIMIT = 250; // max requests per 60s
    static RATE_HEADROOM = 5; // leave a small headroom
    static RATE_WINDOW_MS = 60 * 1000;

    static _sleep(ms) { return new Promise(res => setTimeout(res, ms)); }

    // Implements rate limiting by reserving slots in a sliding window using GM storage
    static async _reserveRequestSlot() {
      const key = RealDebridService.RATE_STORE_KEY;
      const limit = RealDebridService.RATE_LIMIT - RealDebridService.RATE_HEADROOM;
      const windowMs = RealDebridService.RATE_WINDOW_MS;
      const maxRetries = 8;
      let attempt = 0;
      while (attempt < maxRetries) {
        const now = Date.now();
        let obj = null;
        try {
          const raw = await GMC.getValue(key);
          obj = raw ? JSON.parse(raw) : null;
        } catch (e) {
          obj = null;
        }

        if (!obj || typeof obj !== 'object' || !obj.windowStart || (now - obj.windowStart) >= windowMs) {
          const fresh = { windowStart: now, count: 1 };
          try {
            await GMC.setValue(key, JSON.stringify(fresh));
            return;
          } catch (e) {
            attempt += 1;
            await RealDebridService._sleep(40 * attempt);
            continue;
          }
        }

        if ((obj.count || 0) < limit) {
          obj.count = (obj.count || 0) + 1;
          try {
            await GMC.setValue(key, JSON.stringify(obj));
            return;
          } catch (e) {
            attempt += 1;
            await RealDebridService._sleep(40 * attempt);
            continue;
          }
        }

        const earliest = obj.windowStart;
        const waitFor = Math.max(50, windowMs - (now - earliest) + 50);
        logger.warn(`[Real-Debrid API] Rate limit window full (${obj.count}/${RealDebridService.RATE_LIMIT}), waiting ${Math.round(waitFor)}ms`);
        await RealDebridService._sleep(waitFor);
        attempt += 1;
      }
      throw new Error('Failed to reserve request slot');
    }

    constructor(apiKey) {
      if (!apiKey) throw new ConfigurationError('API Key required');
      this.#apiKey = apiKey;
    }

    // Handles API requests with retry logic for rate limits and errors
    #request(method, endpoint, data = null) {
      const maxAttempts = 5;
      const baseDelay = 500; // initial backoff delay in ms

      const attemptRequest = async (attempt) => {
        try {
          await RealDebridService._reserveRequestSlot();
        } catch (err) {
          logger.error('Request slot reservation failed, proceeding (will rely on backoff)', err);
        }

        return new Promise((resolve, reject) => {
          const url = `${API_BASE}${endpoint}`;
          const payload = data ? new URLSearchParams(data).toString() : null;
          logger.debug(`[Real-Debrid API] ${method} ${endpoint} (attempt ${attempt + 1})`);

          GMC.xmlHttpRequest({
            method,
            url,
            headers: {
              Authorization: `Bearer ${this.#apiKey}`,
              Accept: 'application/json',
              'Content-Type': 'application/x-www-form-urlencoded'
            },
            data: payload,
            onload: (resp) => {
              logger.debug(`[Real-Debrid API] Response: ${resp.status}`);

              if (!resp || typeof resp.status === 'undefined') {
                return reject(new RealDebridError('Invalid API response'));
              }
              if (resp.status < 200 || resp.status >= 300) {
                if (resp.status === 429 && attempt < maxAttempts) {
                  const retryAfter = (() => {
                    try {
                      const parsed = JSON.parse(resp.responseText || '{}');
                      return parsed.retry_after || null;
                    } catch (e) {
                      return null;
                    }
                  })();
                  const jitter = Math.random() * 200;
                  const backoff = retryAfter ? (retryAfter * 1000) : (baseDelay * Math.pow(2, attempt) + jitter);
                  logger.warn(`[Real-Debrid API] Rate limited (429). Retrying in ${Math.round(backoff)}ms (attempt ${attempt + 1}/${maxAttempts})`);
                  return setTimeout(() => {
                    attemptRequest(attempt + 1).then(resolve).catch(reject);
                  }, backoff);
                }
                let errorMsg = `HTTP ${resp.status}`;
                let errorCode = null;
                if (resp.responseText) {
                  try {
                    const parsed = JSON.parse(resp.responseText.trim());
                    if (parsed.error) {
                      errorMsg = parsed.error;
                      errorCode = parsed.error_code || null;
                    } else {
                      errorMsg = resp.responseText;
                    }
                  } catch (e) {
                    errorMsg = resp.responseText;
                  }
                }
                return reject(new RealDebridError(`API Error: ${errorMsg}`, resp.status, errorCode));
              }
              if (resp.status === 204 || !resp.responseText) return resolve({});
              try {
                const parsed = JSON.parse(resp.responseText.trim());
                return resolve(parsed);
              } catch (err) {
                logger.error('[Real-Debrid API] Failed to parse JSON response', err);
                return reject(new RealDebridError(`Failed to parse API response: ${err.message}`, resp.status));
              }
            },
            onerror: (err) => {
              logger.error('[Real-Debrid API] Network request failed', err);
              return reject(new RealDebridError('Network request failed'));
            },
            ontimeout: () => {
              logger.warn('[Real-Debrid API] Request timed out');
              return reject(new RealDebridError('Request timed out'));
            }
          });
        });
      };

      return attemptRequest(0);
    }

    async addMagnet(magnet) {
      logger.debug('[Real-Debrid API] Adding magnet link');
      return this.#request('POST', '/torrents/addMagnet', {
        magnet
      });
    }

    async getTorrentInfo(torrentId) {
      logger.debug(`[Real-Debrid API] Fetching info for torrent ${torrentId}`);
      return this.#request('GET', `/torrents/info/${torrentId}`);
    }

    async selectFiles(torrentId, filesCsv) {
      const fileCount = filesCsv.split(',').length;
      logger.debug(`[Real-Debrid API] Selecting ${fileCount} files for torrent ${torrentId}`);
      return this.#request('POST', `/torrents/selectFiles/${torrentId}`, {
        files: filesCsv
      });
    }

    async deleteTorrent(torrentId) {
      logger.debug(`[Real-Debrid API] Deleting torrent ${torrentId}`);
      return this.#request('DELETE', `/torrents/delete/${torrentId}`);
    }

    // Fetches all existing torrents by paginating through API results
    async getExistingTorrents() {
      const all = [];
      const limit = 2500;
      let pageNum = 1;
      while (true) {
        try {
          logger.debug(`[Real-Debrid API] Fetching torrents page ${pageNum} (limit=${limit})`);
          const page = await this.#request('GET', `/torrents?page=${pageNum}&limit=${limit}`);
          if (!Array.isArray(page) || page.length === 0) {
            logger.warn(`[Real-Debrid API] No torrents returned for page ${pageNum}`);
            break;
          }
          all.push(...page);
          if (page.length < limit) {
            logger.debug(`[Real-Debrid API] Last page reached (${pageNum}) with ${page.length} items`);
            break;
          }
          pageNum += 1;
        } catch (err) {
          if (err instanceof RealDebridError && err.statusCode === 429) throw err;
          logger.error('[Real-Debrid API] Failed to fetch existing torrents page', err);
          break;
        }
      }
      logger.debug(`[Real-Debrid API] Fetched total ${all.length} existing torrents`);
      return all;
    }
  }

  // Represents the file structure of a torrent for selection
  class FileTree {
    constructor(files) {
      this.root = { name: 'Torrent Contents', children: [], type: 'folder', path: '', expanded: false };
      this.buildTree(files);
    }

    // Builds a hierarchical tree from flat file list with paths
    buildTree(files) {
      files.forEach(file => {
        const pathParts = file.path.split('/').filter(part => part.trim() !== '');
        let current = this.root;

        for (let i = 0; i < pathParts.length; i++) {
          const part = pathParts[i];
          const isFile = i === pathParts.length - 1;

          if (isFile) {
            current.children.push({
              ...file,
              name: part,
              type: 'file',
              checked: false
            });
          } else {
            let folder = current.children.find(child => child.name === part && child.type === 'folder');
            if (!folder) {
              folder = {
                name: part,
                type: 'folder',
                children: [],
                checked: false,
                expanded: false,
                path: pathParts.slice(0, i + 1).join('/')
              };
              current.children.push(folder);
            }
            current = folder;
          }
        }
      });
    }

    countFiles(node = this.root) {
      if (node.type === 'file') return 1;
      let count = 0;
      if (node.children) {
        node.children.forEach(child => {
          count += this.countFiles(child);
        });
      }
      return count;
    }

    getAllFiles() {
      const files = [];
      const traverse = (node) => {
        if (node.type === 'file') {
          files.push(node);
        }
        if (node.children) {
          node.children.forEach(traverse);
        }
      };
      traverse(this.root);
      return files;
    }

    getSelectedFiles() {
      return this.getAllFiles().filter(file => file.checked).map(file => file.id);
    }
  }

  // Processes magnet links, checks for duplicates, filters files
  class MagnetLinkProcessor {
    #config;
    #api;
    #existing = [];

    constructor(config, api) {
      this.#config = config;
      this.#api = api;
    }

    async initialize() {
      try {
        this.#existing = await this.#api.getExistingTorrents();
        logger.debug(`[Magnet Processor] Loaded ${this.#existing.length} existing torrents`);
      } catch (err) {
        logger.error('[Magnet Processor] Failed to load existing torrents', err);
        this.#existing = [];
      }
    }

    // Extracts the torrent hash from a magnet link's xt parameter
    static parseMagnetHash(magnetLink) {
      if (!magnetLink || typeof magnetLink !== 'string') return null;
      try {
        const qIdx = magnetLink.indexOf('?');
        const qs = qIdx >= 0 ? magnetLink.slice(qIdx + 1) : magnetLink;
        const params = new URLSearchParams(qs);
        const xt = params.get('xt');
        if (xt) {
          const match = xt.match(/urn:btih:([A-Za-z0-9]+)/i);
          if (match) return match[1].toUpperCase();
        }
        const fallback = magnetLink.match(/xt=urn:btih:([A-Za-z0-9]+)/i);
        if (fallback) return fallback[1].toUpperCase();
        return null;
      } catch (err) {
        const m = magnetLink.match(/xt=urn:btih:([A-Za-z0-9]+)/i);
        return m ? m[1].toUpperCase() : null;
      }
    }

    isTorrentExists(hash) {
      if (!hash) return false;
      return Array.isArray(this.#existing) && this.#existing.some(t => (t.hash || '').toUpperCase() === hash);
    }

    // Filters files by allowed extensions and excludes those matching keywords or regex
    filterFiles(files = []) {
      const allowed = new Set(this.#config.allowedExtensions.map(s => s.trim().toLowerCase()).filter(Boolean));
      const keywords = (this.#config.filterKeywords || []).map(k => k.trim()).filter(Boolean);

      return (files || []).filter(file => {
        const path = (file.path || '').toLowerCase();
        const name = path.split('/').pop() || '';
        const ext = name.includes('.') ? name.split('.').pop() : '';

        if (!allowed.has(ext)) return false;

        for (const kw of keywords) {
          if (!kw) continue;
          if (kw.startsWith('/') && kw.endsWith('/')) {
            try {
              const re = new RegExp(kw.slice(1, -1), 'i');
              if (re.test(path) || re.test(name)) return false;
            } catch (err) {
              // invalid regex: ignore it
            }
          }
          if (path.includes(kw.toLowerCase()) || name.includes(kw.toLowerCase())) return false;
        }
        return true;
      });
    }

    // Adds magnet to Real-Debrid, selects files, and handles cleanup on failure
    async processMagnetLink(magnetLink) {
      const hash = MagnetLinkProcessor.parseMagnetHash(magnetLink);
      if (!hash) throw new RealDebridError('Invalid magnet link');

      if (this.isTorrentExists(hash)) throw new RealDebridError('Torrent already exists on Real-Debrid');

      const addResult = await this.#api.addMagnet(magnetLink);
      if (!addResult || typeof addResult.id === 'undefined') {
        throw new RealDebridError('Failed to add magnet');
      }
      const torrentId = addResult.id;

      const info = await this.#api.getTorrentInfo(torrentId);
      const files = Array.isArray(info.files) ? info.files : [];

      let chosen;
      if (this.#config.manualFileSelection) {
        if (files.length === 1) {
          chosen = [files[0].id];
        } else {
          chosen = await UIManager.createFileSelectionDialog(files);
          if (chosen === null) {
            await this.#api.deleteTorrent(torrentId);
            throw new RealDebridError('File selection cancelled');
          }
          if (!chosen.length) {
            await this.#api.deleteTorrent(torrentId);
            throw new RealDebridError('No files selected');
          }
        }
      } else {
        chosen = this.filterFiles(files).map(f => f.id);
        if (!chosen.length) {
          await this.#api.deleteTorrent(torrentId);
          throw new RealDebridError('No matching files found after filtering');
        }
      }

      logger.debug(`[Magnet Processor] Selected files: ${chosen.map(id => files.find(f => f.id === id)?.path || `ID:${id}`).join(', ')}`);
      await this.#api.selectFiles(torrentId, chosen.join(','));
      return chosen.length;
    }
  }

  // Handles user interface elements like dialogs and toasts
  class UIManager {
    // Icon state management
    static setIconState(icon, state) {
      switch (state) {
        case 'default':
          icon.src = ICON_SRC;
          icon.style.filter = '';
          icon.style.opacity = '';
          icon.title = '';
          break;
        case 'processing':
          icon.style.opacity = '0.5';
          break;
        case 'added':
        case 'existing':
          icon.style.filter = 'grayscale(100%)';
          icon.style.opacity = '0.65';
          icon.title = state === 'existing' ? 'Already on Real-Debrid' : 'Added to Real-Debrid';
          break;
      }
    }

    static createConfigDialog(currentConfig) {
      const dialog = document.createElement('div');
      dialog.innerHTML = `
        <div class="rd-overlay">
          <div class="rd-dialog">
            <div class="rd-header">
              <h2 class="rd-title">Real-Debrid Settings</h2>
              <button class="rd-close" id="cancelBtnTop">×</button>
            </div>
            <div class="rd-content">
              <div class="rd-form-group">
                <label class="rd-label">API Key</label>
                <input type="text" id="apiKey" class="rd-input" placeholder="Enter your Real-Debrid API Key" value="${currentConfig.apiKey}">
              </div>
              <div class="rd-form-group">
                <label class="rd-label">Allowed Extensions</label>
                <textarea id="extensions" class="rd-textarea" placeholder="mp4,mkv,avi">${currentConfig.allowedExtensions.join(',')}</textarea>
                <div class="rd-help">Comma-separated file extensions</div>
              </div>
              <div class="rd-form-group">
                <label class="rd-label">Filter Keywords</label>
                <textarea id="keywords" class="rd-textarea" placeholder="sample,/trailer/">${currentConfig.filterKeywords.join(',')}</textarea>
                <div class="rd-help">Keywords or regex patterns to exclude</div>
              </div>
              <div class="rd-form-group">
                <label class="rd-checkbox-label">
                  <input type="checkbox" id="manualFileSelection" ${currentConfig.manualFileSelection ? 'checked' : ''}>
                  Manual File Selection
                </label>
                <div class="rd-help">Show file selection dialog for manual selection</div>
              </div>
              <div class="rd-form-group">
                <label class="rd-checkbox-label">
                  <input type="checkbox" id="debugEnabled" ${currentConfig.debugEnabled ? 'checked' : ''}>
                  Enable Debug Logging
                </label>
                <div class="rd-help">Log debug messages to console</div>
              </div>
            </div>
            <div class="rd-footer">
              <button class="rd-button rd-primary" id="saveBtn">Save Settings</button>
              <button class="rd-button rd-secondary" id="cancelBtn">Cancel</button>
            </div>
          </div>
        </div>
      `;

      this.injectStyles();
      document.body.appendChild(dialog);

      const saveBtn = dialog.querySelector('#saveBtn');
      const cancelBtn = dialog.querySelector('#cancelBtn');
      const cancelBtnTop = dialog.querySelector('#cancelBtnTop');
      const manualCheckbox = dialog.querySelector('#manualFileSelection');
      const extensionsTextarea = dialog.querySelector('#extensions');
      const keywordsTextarea = dialog.querySelector('#keywords');

      const toggleFiltering = () => {
        const disabled = manualCheckbox.checked;
        extensionsTextarea.disabled = disabled;
        keywordsTextarea.disabled = disabled;
        extensionsTextarea.style.opacity = disabled ? '0.5' : '1';
        keywordsTextarea.style.opacity = disabled ? '0.5' : '1';
      };

      manualCheckbox.addEventListener('change', toggleFiltering);
      toggleFiltering();

      const close = () => {
        if (dialog.parentNode) dialog.parentNode.removeChild(dialog);
        document.removeEventListener('keydown', escHandler);
      };

      const escHandler = (e) => {
        if (e.key === 'Escape') close();
      };
      document.addEventListener('keydown', escHandler);

      saveBtn.addEventListener('click', async () => {
        const newCfg = {
          apiKey: dialog.querySelector('#apiKey').value.trim(),
          allowedExtensions: dialog.querySelector('#extensions').value.split(',').map(e => e.trim()).filter(Boolean),
          filterKeywords: dialog.querySelector('#keywords').value.split(',').map(k => k.trim()).filter(Boolean),
          manualFileSelection: dialog.querySelector('#manualFileSelection').checked,
          debugEnabled: dialog.querySelector('#debugEnabled').checked
        };
        try {
          await ConfigManager.saveConfig(newCfg);
          close();
          this.showToast('Configuration saved successfully!', 'success');
          location.reload();
        } catch (error) {
          this.showToast(error.message, 'error');
        }
      });

      cancelBtn.addEventListener('click', close);
      cancelBtnTop.addEventListener('click', close);

      const apiInput = dialog.querySelector('#apiKey');
      if (apiInput) apiInput.focus();

      return dialog;
    }

    // Creates a dialog for manual file selection with tree view
    static createFileSelectionDialog(files) {
      return new Promise((resolve) => {
        const fileTree = new FileTree(files);
        const totalAllSize = fileTree.getAllFiles().reduce((sum, file) => sum + (file.bytes || 0), 0);
        const dialog = document.createElement('div');

        dialog.innerHTML = `
          <div class="rd-overlay">
            <div class="rd-dialog rd-file-dialog">
              <div class="rd-header">
                <h2 class="rd-title">Select Files</h2>
                <button class="rd-close" id="cancelBtnTop">×</button>
              </div>
              <div class="rd-content">
                <div class="rd-file-help">
                  <strong>How to use:</strong> Click folder names to expand/collapse. Click checkboxes to select files or entire folders.
                  Clicking file names will also select/deselect files.
                </div>
                <div class="rd-file-toolbar">
                  <button class="rd-button rd-small" id="toggleAllBtn">Select All</button>
                  <span class="rd-file-stats" id="fileStats">0 files selected</span>
                </div>
                <div class="rd-file-tree" id="fileTreeContainer"></div>
              </div>
              <div class="rd-footer">
                <button class="rd-button rd-primary" id="okBtn">Add Selected Files</button>
                <button class="rd-button rd-secondary" id="cancelBtn">Cancel</button>
              </div>
            </div>
          </div>
        `;

        this.injectStyles();
        document.body.appendChild(dialog);

        const treeContainer = dialog.querySelector('#fileTreeContainer');
        const toggleAllBtn = dialog.querySelector('#toggleAllBtn');
        const fileStats = dialog.querySelector('#fileStats');
        const okBtn = dialog.querySelector('#okBtn');
        const cancelBtn = dialog.querySelector('#cancelBtn');
        const cancelBtnTop = dialog.querySelector('#cancelBtnTop');

        // Function to recursively set folder checked state
        const setFolderChecked = (folder, checked) => {
          folder.checked = checked;
          if (folder.children) {
            folder.children.forEach(child => {
              child.checked = checked;
              if (child.type === 'folder') {
                setFolderChecked(child, checked);
              }
            });
          }
        };

        // Function to update parent states based on children
        const updateParentStates = (node = fileTree.root) => {
          if (node.type === 'file') return node.checked;

          if (node.children) {
            const childrenStates = node.children.map(updateParentStates);
            const allChecked = childrenStates.every(state => state === true);
            const someChecked = childrenStates.some(state => state === true);

            node.checked = allChecked;
            node.indeterminate = !allChecked && someChecked;

            return someChecked;
          }
          return false;
        };

        // Function to count selected files
        const countSelectedFiles = () => {
          return fileTree.getAllFiles().filter(file => file.checked).length;
        };

        // Function to update the UI
        const updateUI = () => {
          updateParentStates();
          const selectedCount = countSelectedFiles();
          const totalCount = fileTree.getAllFiles().length;
          const selectedFiles = fileTree.getAllFiles().filter(file => file.checked);
          const totalSize = selectedFiles.reduce((sum, file) => sum + (file.bytes || 0), 0);
          fileStats.textContent = `${selectedCount} of ${totalCount} files selected (${UIManager.formatBytes(totalSize)} / ${UIManager.formatBytes(totalAllSize)})`;

          const allSelected = totalCount > 0 && selectedCount === totalCount;
          toggleAllBtn.textContent = allSelected ? 'Select None' : 'Select All';
        };

        // Recursive function to render the file tree
        const renderTree = (node, level = 0) => {
          const element = document.createElement('div');
          element.className = `rd-tree-item rd-tree-level-${level}`;

          if (node.type === 'folder') {
            const fileCount = fileTree.countFiles(node);
            element.innerHTML = `
              <div class="rd-folder">
                <div class="rd-folder-header">
                  <span class="rd-expander">${node.expanded ? '▼' : '▶'}</span>
                  <input type="checkbox" class="rd-checkbox" ${node.checked ? 'checked' : ''} ${node.indeterminate ? 'data-indeterminate="true"' : ''}>
                  <span class="rd-folder-name">${node.name}</span>
                  <span class="rd-folder-badge">${fileCount} file${fileCount !== 1 ? 's' : ''}</span>
                </div>
                ${node.expanded ? `<div class="rd-folder-children"></div>` : ''}
              </div>
            `;

            const expander = element.querySelector('.rd-expander');
            const checkbox = element.querySelector('.rd-checkbox');
            const folderName = element.querySelector('.rd-folder-name');
            const childrenContainer = element.querySelector('.rd-folder-children');

            // Expand/collapse functionality
            expander.addEventListener('click', (e) => {
              e.stopPropagation();
              node.expanded = !node.expanded;
              renderFullTree();
            });

            folderName.addEventListener('click', (e) => {
              e.stopPropagation();
              node.expanded = !node.expanded;
              renderFullTree();
            });

            // Folder checkbox functionality
            checkbox.addEventListener('change', (e) => {
              e.stopPropagation();
              setFolderChecked(node, checkbox.checked);
              updateUI();
              renderFullTree();
            });

            // Render children if expanded
            if (node.expanded && childrenContainer && node.children) {
              node.children.forEach(child => {
                childrenContainer.appendChild(renderTree(child, level + 1));
              });
            }

          } else {
            // File element
            element.innerHTML = `
              <div class="rd-file">
                <input type="checkbox" class="rd-checkbox" ${node.checked ? 'checked' : ''}>
                <span class="rd-file-name">${node.name}</span>
                <span class="rd-file-size">${this.formatBytes(node.bytes)}</span>
              </div>
            `;

            const checkbox = element.querySelector('.rd-checkbox');
            const fileName = element.querySelector('.rd-file-name');

            // File selection functionality
            const toggleFile = () => {
              node.checked = !node.checked;
              checkbox.checked = node.checked;
              updateUI();
              // Re-render to update parent folder states visually
              renderFullTree();
            };

            checkbox.addEventListener('change', (e) => {
              e.stopPropagation();
              toggleFile();
            });

            fileName.addEventListener('click', (e) => {
              e.stopPropagation();
              toggleFile();
            });
          }

          return element;
        };

        // Function to render the entire tree
        const renderFullTree = () => {
          treeContainer.innerHTML = '';
          treeContainer.appendChild(renderTree(fileTree.root));
        };

        // Select All/None functionality
        toggleAllBtn.addEventListener('click', () => {
          const allFiles = fileTree.getAllFiles();
          const allSelected = allFiles.length > 0 && allFiles.every(file => file.checked);

          // Toggle all files
          allFiles.forEach(file => {
            file.checked = !allSelected;
          });

          // Update folder states
          updateParentStates();
          updateUI();
          renderFullTree();
        });

        const close = () => {
          if (dialog.parentNode) dialog.parentNode.removeChild(dialog);
          document.removeEventListener('keydown', escHandler);
        };

        const escHandler = (e) => {
          if (e.key === 'Escape') {
            close();
            resolve(null);
          }
        };
        document.addEventListener('keydown', escHandler);

        okBtn.addEventListener('click', () => {
          const selected = fileTree.getSelectedFiles();
          close();
          resolve(selected);
        });

        cancelBtn.addEventListener('click', () => {
          close();
          resolve(null);
        });

        cancelBtnTop.addEventListener('click', () => {
          close();
          resolve(null);
        });

        // Initial render
        updateUI();
        renderFullTree();
      });
    }

    static injectStyles() {
      if (document.getElementById('rd-styles')) return;

      const styles = `
        .rd-overlay{position:fixed;inset:0;background:rgba(0,0,0,0.8);display:flex;align-items:center;justify-content:center;z-index:10000;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Oxygen,Ubuntu,Cantarell,sans-serif;backdrop-filter:blur(4px)}.rd-dialog{background:#1a1d23;border-radius:12px;padding:0;max-width:600px;width:95vw;max-height:90vh;display:flex;flex-direction:column;border:1px solid #2a2f3a;box-shadow:0 20px 60px rgba(0,0,0,0.5);animation:rdSlideIn .2s ease-out}.rd-file-dialog{max-width:800px}.rd-header{display:flex;align-items:center;justify-content:space-between;padding:20px 24px;border-bottom:1px solid #2a2f3a}.rd-title{margin:0;font-size:18px;font-weight:600;color:#e2e8f0;flex:1}.rd-close{background:none;border:none;color:#94a3b8;font-size:24px;cursor:pointer;padding:4px;border-radius:4px;transition:all .2s}.rd-close:hover{background:#2a2f3a;color:#e2e8f0}.rd-content{padding:24px;flex:1;overflow-y:auto}.rd-form-group{margin-bottom:20px}.rd-label{display:block;margin-bottom:6px;font-weight:500;color:#e2e8f0;font-size:14px}.rd-input,.rd-textarea{width:100%;padding:10px 12px;border:1px solid #374151;border-radius:8px;background:#0f1117;color:#e2e8f0;font-size:14px;transition:all .2s}.rd-input:focus,.rd-textarea:focus{outline:none;border-color:#3b82f6;box-shadow:0 0 0 2px rgba(59,130,246,0.2)}.rd-textarea{min-height:80px;resize:vertical}.rd-help{margin-top:4px;font-size:12px;color:#94a3b8}.rd-checkbox-label{display:flex;align-items:center;gap:8px;cursor:pointer;color:#e2e8f0;font-size:14px}.rd-footer{padding:20px 24px;border-top:1px solid #2a2f3a;display:flex;gap:12px;justify-content:flex-end}.rd-button{padding:10px 20px;border:none;border-radius:8px;font-size:14px;font-weight:500;cursor:pointer;transition:all .2s}.rd-primary{background:#3b82f6;color:#fff}.rd-primary:hover{background:#2563eb}.rd-secondary{background:#374151;color:#e2e8f0}.rd-secondary:hover{background:#4b5563}.rd-small{padding:6px 12px;font-size:12px}.rd-file-help{background:#0f1117;border:1px solid #2a2f3a;border-radius:8px;padding:12px 16px;margin-bottom:16px;font-size:13px;color:#94a3b8;line-height:1.4}.rd-file-toolbar{display:flex;align-items:center;gap:16px;margin-bottom:16px;padding-bottom:16px;border-bottom:1px solid #2a2f3a}.rd-file-stats{font-size:13px;color:#94a3b8;font-weight:500}.rd-file-tree{max-height:400px;overflow-y:auto}.rd-tree-item{margin:2px 0}.rd-folder-header{display:flex;align-items:center;gap:8px;padding:6px 8px;border-radius:6px;cursor:pointer;transition:background .2s}.rd-folder-header:hover{background:#2a2f3a}.rd-expander{width:16px;height:16px;display:flex;align-items:center;justify-content:center;font-size:10px;color:#94a3b8;cursor:pointer;user-select:none}.rd-checkbox{margin:0}.rd-checkbox[data-indeterminate=true]{opacity:.7}.rd-folder-name{color:#e2e8f0;font-weight:500;font-size:14px;cursor:pointer}.rd-folder-badge{background:#374151;color:#94a3b8;padding:2px 6px;border-radius:4px;font-size:11px;font-weight:500}.rd-folder-children{margin-left:20px;border-left:1px solid #2a2f3a;padding-left:12px}.rd-file{display:flex;align-items:center;gap:8px;padding:4px 8px;border-radius:6px;transition:background .2s}.rd-file:hover{background:#2a2f3a}.rd-file-name{color:#cbd5e1;font-size:13px;flex:1;cursor:pointer}.rd-file-size{color:#94a3b8;font-size:12px;font-family:monospace}@keyframes rdSlideIn{from{opacity:0;transform:scale(0.95) translateY(-10px)}to{opacity:1;transform:scale(1) translateY(0)}}.rd-file-tree::-webkit-scrollbar{width:6px}.rd-file-tree::-webkit-scrollbar-track{background:#1a1d23}.rd-file-tree::-webkit-scrollbar-thumb{background:#374151;border-radius:3px}.rd-file-tree::-webkit-scrollbar-thumb:hover{background:#4b5563}
      `;

      const styleSheet = document.createElement('style');
      styleSheet.id = 'rd-styles';
      styleSheet.textContent = styles;
      document.head.appendChild(styleSheet);
    }

    static showToast(message, type = 'info') {
      const colors = {
        success: '#10b981',
        error: '#ef4444',
        info: '#3b82f6'
      };

      const msgDiv = document.createElement('div');
      Object.assign(msgDiv.style, {
        position: 'fixed',
        bottom: '20px',
        left: '20px',
        backgroundColor: colors[type] || colors.info,
        color: 'white',
        padding: '12px 16px',
        borderRadius: '8px',
        zIndex: 10001,
        fontWeight: '500',
        fontSize: '14px',
        boxShadow: '0 4px 12px rgba(0, 0, 0, 0.3)',
        animation: 'rdSlideIn 0.2s ease-out'
      });
      msgDiv.textContent = message;
      document.body.appendChild(msgDiv);
      setTimeout(() => {
        if (msgDiv.parentNode) msgDiv.parentNode.removeChild(msgDiv);
      }, 5000);
    }

    static createMagnetIcon() {
      const icon = document.createElement('img');
      icon.src = ICON_SRC;
      icon.style.cssText = `cursor:pointer;width:16px;height:16px;margin-left:6px;vertical-align:middle;border-radius:2px`;
      icon.setAttribute(INSERTED_ICON_ATTR, '1');
      return icon;
    }

    static formatBytes(bytes) {
      if (bytes === 0) return '0 B';
      const k = 1024;
      const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
      const i = Math.floor(Math.log(bytes) / Math.log(k));
      return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }
  }

  // Integrates the script with the page, adds icons to magnet links
  class PageIntegrator {
    constructor(processor = null) {
      this.processor = processor;
      this.observer = null;
      this.configPromise = ConfigManager.getConfig();
      this.keyToIcon = new Map();
      this._populateFromDOM();
    }

    setProcessor(processor) {
      this.processor = processor;
    }

    _populateFromDOM() {
      const links = Array.from(document.querySelectorAll('a[href^="magnet:"]'));
      links.forEach(link => {
        const next = link.nextElementSibling;
        if (next?.getAttribute && next.getAttribute(INSERTED_ICON_ATTR)) {
          const key = this._magnetKeyFor(link.href);
          if (key && !this.keyToIcon.has(key)) {
            this.keyToIcon.set(key, next);
          }
        }
      });
    }

    _magnetKeyFor(href) {
      const hash = MagnetLinkProcessor.parseMagnetHash(href);
      if (hash) return `hash:${hash}`;
      try {
        return `href:${href.trim().toLowerCase()}`;
      } catch {
        return `href:${String(href).trim().toLowerCase()}`;
      }
    }

    _attach(icon, link) {
      const processMagnet = async () => {
        const key = this._magnetKeyFor(link.href);
        const ok = await ensureApiInitialized();

        if (!ok) {
          UIManager.showToast('Real-Debrid API key not configured. Use the menu to set it.', 'info');
          return;
        }

        if (key?.startsWith('hash:') && this.processor?.isTorrentExists(key.split(':')[1])) {
          UIManager.showToast('Torrent already exists on Real-Debrid', 'info');
          UIManager.setIconState(icon, 'existing');
          return;
        }

        // set processing
        UIManager.setIconState(icon, 'processing');

        try {
          const count = await this.processor.processMagnetLink(link.href);
          UIManager.showToast(`Added to Real-Debrid — ${count} file(s) selected`, 'success');
          UIManager.setIconState(icon, 'added');
        } catch (err) {
          // reset to default
          UIManager.setIconState(icon, 'default');
          UIManager.showToast(err?.message || 'Failed to process magnet', 'error');
          logger.error('[Magnet Processor] Failed to process magnet link', err);
        }
      };

      icon.addEventListener('click', (ev) => {
        ev.preventDefault();
        processMagnet();
      });
    }

    addIconsTo(documentRoot = document) {
      const links = Array.from(documentRoot.querySelectorAll('a[href^="magnet:"]'));
      const newlyAddedKeys = [];
      links.forEach(link => {
        if (!link.parentNode) return;
        const next = link.nextElementSibling;
        if (next && next.getAttribute && next.getAttribute(INSERTED_ICON_ATTR)) return;

        const key = this._magnetKeyFor(link.href);
        if (key && this.keyToIcon.has(key)) return;

        const icon = UIManager.createMagnetIcon();
        this._attach(icon, link);
        link.parentNode.insertBefore(icon, link.nextSibling);
        const storeKey = key || `href:${link.href.trim().toLowerCase()}`;
        this.keyToIcon.set(storeKey, icon);
        newlyAddedKeys.push(storeKey);
      });

      if (newlyAddedKeys.length) {
        ensureApiInitialized().then(ok => {
          if (ok) this.markExistingTorrents();
        });
      }
    }

    markExistingTorrents() {
      if (!this.processor) return;

      for (const [key, icon] of this.keyToIcon.entries()) {
        if (!key.startsWith('hash:')) continue;
        const hash = key.split(':')[1];
        if (this.processor.isTorrentExists(hash)) {
          UIManager.setIconState(icon, 'existing');
        }
      }
    }

    // Uses MutationObserver to add icons to new magnet links as they appear
    startObserving() {
      if (this.observer) return;
      this.observer = new MutationObserver(debounce((mutations) => {
        for (const m of mutations) {
          if (m.addedNodes && m.addedNodes.length) {
            this.addIconsTo(document);
            break;
          }
        }
      }, 150));
      this.observer.observe(document.body, {
        childList: true,
        subtree: true
      });
    }

    stopObserving() {
      if (!this.observer) return;
      this.observer.disconnect();
      this.observer = null;
    }
  }

  // Delays API setup until a magnet link is clicked to avoid unnecessary requests
  let _apiInitPromise = null;
  let _realDebridService = null;
  let _magnetProcessor = null;
  let _integratorInstance = null;

  // Ensures the API is initialized lazily
  async function ensureApiInitialized() {
    if (_apiInitPromise) return _apiInitPromise;

    try {
      if (!document.querySelector || !document.querySelector('a[href^="magnet:"]')) {
        return Promise.resolve(false);
      }
    } catch (err) {
      // Continue with init if DOM access fails
    }

    const cfg = await ConfigManager.getConfig();
    if (!cfg.apiKey) {
      return Promise.resolve(false);
    }

    try {
      _realDebridService = new RealDebridService(cfg.apiKey);
    } catch (err) {
      logger.warn('[Initialization] Failed to create Real-Debrid service', err);
      return Promise.resolve(false);
    }

    _magnetProcessor = new MagnetLinkProcessor(cfg, _realDebridService);
    _apiInitPromise = _magnetProcessor.initialize()
      .then(() => {
        if (_integratorInstance) {
          _integratorInstance.setProcessor(_magnetProcessor);
          _integratorInstance.markExistingTorrents();
        }
        return true;
      })
      .catch(err => {
        logger.warn('[Initialization] Failed to initialize Real-Debrid integration', err);
        return false;
      });

    return _apiInitPromise;
  }

  // Main initialization function
  async function init() {
    try {
      const cfg = await ConfigManager.getConfig();
      logger = Logger('Magnet Link to Real-Debrid', { debug: cfg.debugEnabled });

      _integratorInstance = new PageIntegrator(null);
      _integratorInstance.addIconsTo();
      _integratorInstance.startObserving();

      GMC.registerMenuCommand('Configure Real-Debrid Settings', async () => {
        const currentCfg = await ConfigManager.getConfig();
        UIManager.createConfigDialog(currentCfg);
      });
    } catch (err) {
      logger.error('[Initialization] Script initialization failed', err);
    }
  }

  // Run immediately
  init();

})();
