// ==UserScript==
// @name          Magnet Link to Real-Debrid
// @version       2.10.0
// @description   Automatically send magnet links to Real-Debrid
// @author        Journey Over
// @license       MIT
// @match         *://*/*
// @require       https://cdn.jsdelivr.net/gh/StylusThemes/Userscripts@0171b6b6f24caea737beafbc2a8dacd220b729d8/libs/utils/utils.min.js
// @grant         GM_xmlhttpRequest
// @grant         GM_getValue
// @grant         GM_setValue
// @grant         GM_registerMenuCommand
// @connect       api.real-debrid.com
// @icon          https://www.google.com/s2/favicons?sz=64&domain=real-debrid.com
// @homepageURL   https://github.com/StylusThemes/Userscripts
// @downloadURL   https://github.com/StylusThemes/Userscripts/raw/main/userscripts/magnet-link-to-real-debrid.user.js
// @updateURL     https://github.com/StylusThemes/Userscripts/raw/main/userscripts/magnet-link-to-real-debrid.user.js
// ==/UserScript==

(function() {
  'use strict';

  let logger;

  const STORAGE_KEY = 'realDebridConfig';
  const API_BASE = 'https://api.real-debrid.com/rest/1.0';
  const INSERTED_ICON_ATTR = 'data-rd-inserted';

  // Rate limiting to respect Real-Debrid's 250 requests/minute limit with headroom
  const RATE_LIMIT_MAX = 250;
  const RATE_LIMIT_HEADROOM = 5;
  const RATE_LIMIT_WINDOW_MS = 60 * 1000;
  const RATE_LIMIT_MAX_RETRIES = 8;
  const RATE_LIMIT_RETRY_BASE_DELAY = 40;

  const API_MAX_RETRY_ATTEMPTS = 5;
  const API_BASE_BACKOFF_DELAY = 500;
  const API_JITTER_MAX = 200;

  const MUTATION_DEBOUNCE_MS = 150;
  const TOAST_DURATION_MS = 5000;
  const TORRENTS_PAGE_LIMIT = 2500;

  const DEFAULTS = {
    apiKey: '',
    allowedExtensions: ['mp3', 'm4b', 'mp4', 'mkv', 'cbz', 'cbr'],
    filterKeywords: ['sample', 'bloopers', 'trailer'],
    manualFileSelection: false,
    debugEnabled: false,
    enableTorrentSupport: false
  };

  class ConfigurationError extends Error {
    constructor(message) {
      super(message);
      this.name = 'ConfigurationError';
    }
  }

  class RealDebridError extends Error {
    constructor(message, statusCode = null, errorCode = null) {
      super(message);
      this.name = 'RealDebridError';
      this.statusCode = statusCode;
      this.errorCode = errorCode;
    }
  }

  const ConfigManager = {
    _safeParse(value) {
      if (!value) return null;
      try {
        return typeof value === 'string' ? JSON.parse(value) : value;
      } catch (error) {
        logger.error('[Config] Failed to parse stored configuration, resetting to defaults.', error);
        return null;
      }
    },

    // Synchronous retrieval since GM_getValue is synchronous
    getConfigSync() {
      const stored = GM_getValue(STORAGE_KEY);
      const parsed = this._safeParse(stored) || {};
      return {
        ...DEFAULTS,
        ...parsed
      };
    },

    async getConfig() {
      return this.getConfigSync();
    },

    async saveConfig(config) {
      if (!config || !config.apiKey) throw new ConfigurationError('API Key is required');
      GM_setValue(STORAGE_KEY, JSON.stringify(config));
    },

    validateConfig(config) {
      const errors = [];
      if (!config || !config.apiKey) errors.push('API Key is missing');
      if (!Array.isArray(config.allowedExtensions)) errors.push('allowedExtensions must be an array');
      if (!Array.isArray(config.filterKeywords)) errors.push('filterKeywords must be an array');
      if (typeof config.manualFileSelection !== 'boolean') errors.push('manualFileSelection must be a boolean');
      if (typeof config.debugEnabled !== 'boolean') errors.push('debugEnabled must be a boolean');
      if (typeof config.enableTorrentSupport !== 'boolean') errors.push('enableTorrentSupport must be a boolean');
      return errors;
    },
  };

  class RealDebridService {
    #apiKey;

    static RATE_STORE_KEY = 'realDebrid_rate_counter';

    static _sleep(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }

    // Cross-tab rate limiting using GM storage to coordinate between multiple script instances
    static async _reserveRequestSlot() {
      const key = RealDebridService.RATE_STORE_KEY;
      const limit = RATE_LIMIT_MAX - RATE_LIMIT_HEADROOM;
      const windowMs = RATE_LIMIT_WINDOW_MS;
      const maxRetries = RATE_LIMIT_MAX_RETRIES;
      let attempt = 0;
      while (attempt < maxRetries) {
        const now = Date.now();
        let rateLimitData = null;
        try {
          const raw = GM_getValue(key);
          rateLimitData = raw ? JSON.parse(raw) : null;
        } catch {
          rateLimitData = null;
        }

        // Reset window if expired or invalid
        if (!rateLimitData || typeof rateLimitData !== 'object' || !rateLimitData.windowStart || (now - rateLimitData.windowStart) >= windowMs) {
          const fresh = { windowStart: now, count: 1 };
          try {
            GM_setValue(key, JSON.stringify(fresh));
            return;
          } catch {
            attempt += 1;
            await RealDebridService._sleep(RATE_LIMIT_RETRY_BASE_DELAY * attempt);
            continue;
          }
        }

        if ((rateLimitData.count || 0) < limit) {
          rateLimitData.count = (rateLimitData.count || 0) + 1;
          try {
            GM_setValue(key, JSON.stringify(rateLimitData));
            return;
          } catch {
            attempt += 1;
            await RealDebridService._sleep(RATE_LIMIT_RETRY_BASE_DELAY * attempt);
            continue;
          }
        }

        // Wait for current window to expire before retrying
        const earliest = rateLimitData.windowStart;
        const waitFor = Math.max(50, windowMs - (now - earliest) + 50);
        logger.warn(`[Real-Debrid API] Rate limit window full (${rateLimitData.count}/${RATE_LIMIT_MAX}), waiting ${Math.round(waitFor)}ms`);
        await RealDebridService._sleep(waitFor);
        attempt += 1;
      }
      throw new Error('Failed to reserve request slot');
    }

    constructor(apiKey) {
      if (!apiKey) throw new ConfigurationError('API Key required');
      this.#apiKey = apiKey;
    }

    #request(method, endpoint, data = null) {
      const attemptRequest = async (attempt) => {
        try {
          await RealDebridService._reserveRequestSlot();
        } catch (error) {
          logger.error('Request slot reservation failed, proceeding (will rely on backoff)', error);
        }

        return new Promise((resolve, reject) => {
          const url = `${API_BASE}${endpoint}`;
          let payload = null;
          let headers = {
            Authorization: `Bearer ${this.#apiKey}`,
            Accept: 'application/json'
          };
          if (data) {
            if (data instanceof FormData) {
              payload = data;
            } else if (data instanceof Blob) {
              payload = data;
              headers['Content-Type'] = 'application/x-bittorrent';
            } else {
              payload = new URLSearchParams(data).toString();
              headers['Content-Type'] = 'application/x-www-form-urlencoded';
            }
          }
          logger.debug(`[Real-Debrid API] ${method} ${endpoint} (attempt ${attempt + 1})`);

          GM_xmlhttpRequest({
            method,
            url,
            headers,
            data: payload,
            onload: (response) => {
              logger.debug(`[Real-Debrid API] Response: ${response.status}`);

              if (!response || typeof response.status === 'undefined') {
                return reject(new RealDebridError('Invalid API response'));
              }
              if (response.status < 200 || response.status >= 300) {
                if (response.status === 429 && attempt < API_MAX_RETRY_ATTEMPTS) {
                  const retryAfter = (() => {
                    try {
                      const parsed = JSON.parse(response.responseText || '{}');
                      return parsed.retry_after || null;
                    } catch {
                      return null;
                    }
                  })();
                  const jitter = Math.random() * API_JITTER_MAX;
                  const backoff = retryAfter ? (retryAfter * 1000) : (API_BASE_BACKOFF_DELAY * Math.pow(2, attempt) + jitter);
                  logger.warn(`[Real-Debrid API] Rate limited (429). Retrying in ${Math.round(backoff)}ms (attempt ${attempt + 1}/${API_MAX_RETRY_ATTEMPTS})`);
                  return setTimeout(() => {
                    attemptRequest(attempt + 1).then(resolve).catch(reject);
                  }, backoff);
                }
                let errorMessage = `HTTP ${response.status}`;
                let errorCode = null;
                try {
                  const parsed = JSON.parse(response.responseText?.trim() || '{}');
                  errorMessage = parsed.error || response.responseText || errorMessage;
                  errorCode = parsed.error_code || null;
                } catch {
                  errorMessage = response.responseText || errorMessage;
                }
                return reject(new RealDebridError(`API Error: ${errorMessage}`, response.status, errorCode));
              }
              if (response.status === 204 || !response.responseText) return resolve({});
              try {
                const parsed = JSON.parse(response.responseText.trim());
                logger.debug('[Real-Debrid API] Parsed response:', parsed);
                if (parsed.error) {
                  return reject(new RealDebridError(parsed.error, response.status, parsed.error_code));
                }
                return resolve(parsed);
              } catch (error) {
                logger.error('[Real-Debrid API] Failed to parse JSON response', error);
                return reject(new RealDebridError(`Failed to parse API response: ${error.message}`, response.status));
              }
            },
            onerror: (error) => {
              logger.error('[Real-Debrid API] Network request failed', error);
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

    async addTorrent(torrentBlob) {
      logger.debug('[Real-Debrid API] Adding torrent file');
      return this.#request('PUT', '/torrents/addTorrent', torrentBlob);
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

    // Paginate through all torrents to check for existing duplicates
    async getExistingTorrents() {
      const torrents = [];
      const limit = TORRENTS_PAGE_LIMIT;
      let pageNumber = 1;
      while (true) {
        try {
          logger.debug(`[Real-Debrid API] Fetching torrents page ${pageNumber} (limit=${limit})`);
          const page = await this.#request('GET', `/torrents?page=${pageNumber}&limit=${limit}`);
          if (!Array.isArray(page) || page.length === 0) {
            logger.warn(`[Real-Debrid API] No torrents returned for page ${pageNumber}`);
            break;
          }
          torrents.push(...page);
          if (page.length < limit) {
            logger.debug(`[Real-Debrid API] Last page reached (${pageNumber}) with ${page.length} items`);
            break;
          }
          pageNumber += 1;
        } catch (error) {
          if (error instanceof RealDebridError && error.statusCode === 429) throw error;
          logger.error('[Real-Debrid API] Failed to fetch existing torrents page', error);
          break;
        }
      }
      logger.debug(`[Real-Debrid API] Fetched total ${torrents.length} existing torrents`);
      return torrents;
    }
  }

  class FileTree {
    constructor(files) {
      this.root = { name: 'Torrent Contents', children: [], type: 'folder', path: '', expanded: true };
      this.buildTree(files);
    }

    // Convert flat file list with paths into hierarchical tree structure
    buildTree(files) {
      for (const file of files) {
        const pathParts = file.path.split('/').filter(part => part.trim() !== '');
        let current = this.root;

        for (let index = 0; index < pathParts.length; index++) {
          const part = pathParts[index];
          const isFile = index === pathParts.length - 1;

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
                path: pathParts.slice(0, index + 1).join('/')
              };
              current.children.push(folder);
            }
            current = folder;
          }
        }
      }
    }

    countFiles(node = this.root) {
      if (node.type === 'file') return 1;
      let count = 0;
      if (node.children) {
        for (const child of node.children) {
          count += this.countFiles(child);
        }
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
          for (const child of node.children) {
            traverse(child);
          }
        }
      };
      traverse(this.root);
      return files;
    }

    getSelectedFiles() {
      return this.getAllFiles().filter(file => file.checked).map(file => file.id);
    }
  }

  const UIManager = {
    injectStyles() {
      const id = 'rd-modern-styles';
      if (document.getElementById(id)) return;

      const styles = `:root{--rd-green:#64cc2e;--rd-green-hover:#52a825;--rd-bg:#1d1d1d;--rd-panel:#242424;--rd-border:#333;--rd-text:#eee;--rd-text-dim:#999;--rd-input-bg:#161616;--rd-overlay:rgba(0,0,0,0.85)}.rd-overlay{position:fixed;inset:0;z-index:10000;display:flex;align-items:center;justify-content:center;background:var(--rd-overlay);backdrop-filter:blur(5px);font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;opacity:0;animation:rd-fade-in .2s forwards}@keyframes rd-fade-in{to{opacity:1}}.rd-dialog{width:800px;max-width:90%;height:600px;max-height:90vh;background:var(--rd-bg);border-radius:8px;box-shadow:0 20px 50px rgba(0,0,0,0.5);display:flex;flex-direction:column;overflow:hidden;border:1px solid var(--rd-border)}.rd-header{padding:20px 25px;border-bottom:1px solid var(--rd-border);display:flex;justify-content:space-between;align-items:center;background:var(--rd-panel)}.rd-title{margin:0;font-size:20px;color:#fff;font-weight:600}.rd-close{background:0 0;border:none;color:var(--rd-text-dim);font-size:24px;cursor:pointer;line-height:1;padding:5px}.rd-close:hover{color:#fff}.rd-body{flex:1;display:flex;overflow:hidden}.rd-sidebar{width:200px;background:#181818;border-right:1px solid var(--rd-border);padding:15px 0;display:flex;flex-direction:column;gap:5px}.rd-nav-item{padding:12px 20px;cursor:pointer;color:var(--rd-text-dim);font-size:14px;font-weight:500;transition:.2s;border-left:3px solid transparent}.rd-nav-item:hover{color:#fff;background:rgba(255,255,255,.03)}.rd-nav-item.active{color:#fff;background:rgba(100,204,46,.1);border-left-color:var(--rd-green)}.rd-content{flex:1;padding:0;overflow-y:auto;position:relative}.rd-tab-pane{display:none;padding:25px}.rd-tab-pane.active{display:block;animation:rd-slide-up .3s ease}@keyframes rd-slide-up{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:translateY(0)}}.rd-group{margin-bottom:20px}.rd-label{display:block;margin-bottom:8px;font-weight:600;color:var(--rd-text);font-size:14px}.rd-sub-label{font-size:12px;color:var(--rd-text-dim);margin-top:4px}.rd-input,.rd-textarea{width:100%;padding:12px;border-radius:6px;background:var(--rd-input-bg);border:1px solid var(--rd-border);color:#fff;font-size:14px;outline:0;transition:.2s;box-sizing:border-box}.rd-input:focus,.rd-textarea:focus{border-color:var(--rd-green)}.rd-textarea{min-height:100px;line-height:1.5;font-family:monospace}.rd-list-item{display:flex;align-items:center;justify-content:space-between;padding:15px;margin-bottom:10px;background:var(--rd-panel);border-radius:6px;border:1px solid transparent;transition:.2s}.rd-list-item:hover{border-color:#444}.rd-info h4{margin:0 0 4px;font-size:15px;color:#fff}.rd-info p{margin:0;font-size:12px;color:var(--rd-text-dim)}.rd-toggle{position:relative;width:44px;height:24px;flex-shrink:0}.rd-toggle input{opacity:0;width:0;height:0}.rd-slider{position:absolute;cursor:pointer;inset:0;background-color:#444;border-radius:24px;transition:.3s}.rd-slider:before{position:absolute;content:"";height:18px;width:18px;left:3px;bottom:3px;background-color:#fff;border-radius:50%;transition:.3s;box-shadow:0 2px 4px rgba(0,0,0,.2)}input:checked+.rd-slider{background-color:var(--rd-green)}input:checked+.rd-slider:before{transform:translateX(20px)}.rd-footer{padding:15px 25px;border-top:1px solid var(--rd-border);background:var(--rd-panel);display:flex;justify-content:flex-end;gap:10px}.rd-btn{padding:8px 16px;border-radius:4px;font-size:13px;font-weight:600;cursor:pointer;border:none;transition:.2s}.rd-btn-ghost{background:0 0;color:var(--rd-text-dim)}.rd-btn-ghost:hover{color:#fff;background:rgba(255,255,255,.05)}.rd-btn-primary{background:var(--rd-green);color:#fff}.rd-btn-primary:hover{background:var(--rd-green-hover)}.rd-file-dialog .rd-content{display:flex;flex-direction:column;height:100%}.rd-file-toolbar{display:flex;align-items:center;justify-content:space-between;padding:15px 25px;border-bottom:1px solid var(--rd-border);background:var(--rd-panel)}.rd-file-stats{font-size:13px;color:var(--rd-text-dim)}.rd-file-tree{flex:1;overflow-y:auto;padding:10px}.rd-tree-item{margin:1px 0}.rd-folder-header,.rd-file{display:flex;align-items:center;gap:8px;padding:6px 10px;border-radius:4px;cursor:pointer;color:var(--rd-text-dim);font-size:13px}.rd-folder-header:hover,.rd-file:hover{background:var(--rd-panel);color:#fff}.rd-folder-name,.rd-file-name{flex:1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.rd-checkbox{accent-color:var(--rd-green);cursor:pointer}.rd-badge{background:#333;padding:2px 6px;border-radius:4px;font-size:11px}.rd-folder-children{margin-left:22px;border-left:1px solid #333}.rd-toast{position:fixed;bottom:20px;left:20px;background:var(--rd-panel);color:#fff;padding:12px 16px;border-radius:6px;z-index:10001;font-size:14px;box-shadow:0 5px 15px rgba(0,0,0,.3);border-left:4px solid var(--rd-green);animation:rd-slide-up .2s ease-out}.rd-input-wrapper{position:relative;width:100%}.rd-eye-btn{position:absolute;right:12px;top:50%;transform:translateY(-50%);background:0 0;border:none;color:var(--rd-text-dim);cursor:pointer;font-size:16px;padding:0}.rd-eye-btn:hover{color:#fff}`;

      const styleSheet = document.createElement('style');
      styleSheet.id = id;
      styleSheet.textContent = styles;
      document.head.appendChild(styleSheet);
    },

    createConfigDialog(currentConfig) {
      this.injectStyles();

      const html = `
        <div class="rd-dialog">
          <div class="rd-header">
            <h2 class="rd-title">Real-Debrid Settings</h2>
            <button class="rd-close">&times;</button>
          </div>

          <div class="rd-body">
            <div class="rd-sidebar">
              <div class="rd-nav-item active" data-tab="tab-general">General</div>
              <div class="rd-nav-item" data-tab="tab-filtering">Filters</div>
            </div>

            <div class="rd-content">
              <div id="tab-general" class="rd-tab-pane active">
                <div class="rd-group">
                  <label class="rd-label">API Token</label>
                  <div class="rd-input-wrapper">
                    <input type="password" id="apiKeyInput" class="rd-input" value="${currentConfig.apiKey || ''}" placeholder="Paste your Real-Debrid API Token here" style="padding-right: 40px;">
                    <button id="toggleApiVisibility" class="rd-eye-btn" title="Show/Hide Token">👁️</button>
                  </div>
                  <div class="rd-sub-label">Find this at real-debrid.com/apitoken</div>
                </div>

                <div class="rd-list-item">
                  <div class="rd-info">
                    <h4>Manual File Selection</h4>
                    <p>Always show the file selection dialog before adding <br><span style="color:var(--rd-text-dim); font-size:11px">(Enabling this hides the Filters tab)</span></p>
                  </div>
                  <label class="rd-toggle">
                    <input type="checkbox" id="manualFileSelection" ${currentConfig.manualFileSelection ? 'checked' : ''}>
                    <span class="rd-slider"></span>
                  </label>
                </div>

                <div class="rd-list-item">
                  <div class="rd-info">
                    <h4>Torrent Support</h4>
                    <p>Alt+Click magnet links to process .torrent files instead</p>
                  </div>
                  <label class="rd-toggle">
                    <input type="checkbox" id="enableTorrentSupport" ${currentConfig.enableTorrentSupport ? 'checked' : ''}>
                    <span class="rd-slider"></span>
                  </label>
                </div>

                 <div class="rd-list-item">
                  <div class="rd-info">
                    <h4>Debug Mode</h4>
                    <p>Log detailed information to the browser console</p>
                  </div>
                  <label class="rd-toggle">
                    <input type="checkbox" id="debugEnabled" ${currentConfig.debugEnabled ? 'checked' : ''}>
                    <span class="rd-slider"></span>
                  </label>
                </div>
              </div>

              <div id="tab-filtering" class="rd-tab-pane">
                <div class="rd-group">
                  <label class="rd-label">Allowed Extensions</label>
                  <textarea id="allowedExtensions" class="rd-textarea" placeholder="mkv, mp4, avi">${currentConfig.allowedExtensions.join(', ')}</textarea>
                  <div class="rd-sub-label">Comma separated list of file extensions to auto-select</div>
                </div>

                <div class="rd-group">
                  <label class="rd-label">Filter Keywords</label>
                  <textarea id="filterKeywords" class="rd-textarea" placeholder="sample, trailer">${currentConfig.filterKeywords.join(', ')}</textarea>
                  <div class="rd-sub-label">Files containing these words (or Regex /.../) will be skipped</div>
                </div>
              </div>
            </div>
          </div>

          <div class="rd-footer">
            <button class="rd-btn rd-btn-ghost" id="cancelButton">Cancel</button>
            <button class="rd-btn rd-btn-primary" id="saveButton">Save Changes</button>
          </div>
        </div>
      `;

      const overlay = document.createElement('div');
      overlay.className = 'rd-overlay';
      overlay.innerHTML = html;
      document.body.appendChild(overlay);

      // --- Logic for Tabs and Toggles ---

      const manualCheckbox = overlay.querySelector('#manualFileSelection');
      const filterTabNav = overlay.querySelector('.rd-nav-item[data-tab="tab-filtering"]');
      const apiKeyInput = overlay.querySelector('#apiKeyInput');
      const toggleApiBtn = overlay.querySelector('#toggleApiVisibility');

      // 1. API Token Visibility Toggle
      toggleApiBtn.onclick = () => {
        if (apiKeyInput.type === 'password') {
          apiKeyInput.type = 'text';
          toggleApiBtn.style.color = '#fff'; // Highlight when visible
        } else {
          apiKeyInput.type = 'password';
          toggleApiBtn.style.color = '';
        }
      };

      // 2. Hide "Filters" tab if Manual Selection is enabled
      const updateFilterTabVisibility = () => {
        if (manualCheckbox.checked) {
          filterTabNav.style.display = 'none';
          // If the user was on the hidden tab, switch them back to General
          if (filterTabNav.classList.contains('active')) {
             overlay.querySelector('[data-tab="tab-general"]').click();
          }
        } else {
          filterTabNav.style.display = 'block';
        }
      };
      manualCheckbox.addEventListener('change', updateFilterTabVisibility);
      updateFilterTabVisibility(); // Run on init

      // Event Listeners for Closing
      const close = () => {
        overlay.remove();
        document.removeEventListener('keydown', escHandler);
      };
      const escHandler = (e) => {
        if (e.key === 'Escape') close();
      };
      document.addEventListener('keydown', escHandler);

      overlay.querySelector('.rd-close').onclick = close;
      overlay.querySelector('#cancelButton').onclick = close;

      // Tab Switching
      const tabs = overlay.querySelectorAll('.rd-nav-item');
      tabs.forEach(tab => {
        tab.onclick = () => {
          overlay.querySelectorAll('.rd-nav-item').forEach(t => t.classList.remove('active'));
          overlay.querySelectorAll('.rd-tab-pane').forEach(p => p.classList.remove('active'));

          tab.classList.add('active');
          overlay.querySelector(`#${tab.dataset.tab}`).classList.add('active');
        };
      });

      // Save Logic
      overlay.querySelector('#saveButton').onclick = async () => {
        const btn = overlay.querySelector('#saveButton');
        btn.textContent = 'Saving...';

        try {
          const newConfig = {
            apiKey: overlay.querySelector('#apiKeyInput').value.trim(),
            enableTorrentSupport: overlay.querySelector('#enableTorrentSupport').checked,
            debugEnabled: overlay.querySelector('#debugEnabled').checked,
            manualFileSelection: overlay.querySelector('#manualFileSelection').checked,
            allowedExtensions: overlay.querySelector('#allowedExtensions').value.split(',').map(s => s.trim()).filter(Boolean),
            filterKeywords: overlay.querySelector('#filterKeywords').value.split(',').map(s => s.trim()).filter(Boolean)
          };

          await ConfigManager.saveConfig(newConfig);
          close();
          this.showToast('Settings saved successfully', 'success');
          location.reload();
        } catch (error) {
           this.showToast(error.message, 'error');
           btn.textContent = 'Save Changes';
        }
      };
    },

    createFileSelectionDialog(files) {
      this.injectStyles();
      return new Promise((resolve) => {
        const fileTree = new FileTree(files);
        const totalSizeAll = fileTree.getAllFiles().reduce((s, f) => s + (f.bytes || 0), 0);

        const overlay = document.createElement('div');
        overlay.className = 'rd-overlay';
        overlay.innerHTML = `
          <div class="rd-dialog rd-file-dialog">
            <div class="rd-header">
              <h2 class="rd-title">Select Files</h2>
              <button class="rd-close">&times;</button>
            </div>

            <div class="rd-file-toolbar">
               <button class="rd-btn rd-btn-ghost" id="toggleAll" style="padding:4px 8px; font-size:12px; border:1px solid #444">Select All</button>
               <span class="rd-file-stats" id="stats">0 files selected</span>
            </div>

            <div class="rd-content">
               <div class="rd-file-tree" id="treeRoot"></div>
            </div>

            <div class="rd-footer">
              <button class="rd-btn rd-btn-ghost" id="cancel">Cancel</button>
              <button class="rd-btn rd-btn-primary" id="confirm">Add Selected</button>
            </div>
          </div>
        `;

        document.body.appendChild(overlay);

        const treeRoot = overlay.querySelector('#treeRoot');
        const statsLabel = overlay.querySelector('#stats');
        const toggleBtn = overlay.querySelector('#toggleAll');

        const updateUI = () => {
          const updateStates = (node) => {
             if (node.type === 'file') return node.checked;
             if (node.children) {
                const states = node.children.map(updateStates);
                node.checked = states.every(s => s);
                node.indeterminate = !node.checked && states.some(s => s);
                return states.some(s => s);
             }
             return false;
          };
          updateStates(fileTree.root);

          const selected = fileTree.getAllFiles().filter(f => f.checked);
          const size = selected.reduce((s, f) => s + (f.bytes || 0), 0);
          statsLabel.textContent = `${selected.length} files (${this.formatBytes(size)} / ${this.formatBytes(totalSizeAll)})`;
          toggleBtn.textContent = selected.length === fileTree.getAllFiles().length ? 'Select None' : 'Select All';
        };

        const renderNode = (node) => {
          const div = document.createElement('div');
          div.className = 'rd-tree-item';

          if (node.type === 'folder') {
            const fileCount = fileTree.countFiles(node);
            div.innerHTML = `
              <div class="rd-folder-header">
                 <span style="font-size:10px; width:12px">${node.expanded ? '▼' : '▶'}</span>
                 <input type="checkbox" class="rd-checkbox" ${node.checked ? 'checked' : ''}>
                 <span class="rd-folder-name">${node.name}</span>
                 <span class="rd-badge">${fileCount}</span>
              </div>
              <div class="rd-folder-children" style="display:${node.expanded ? 'block' : 'none'}"></div>
            `;

            const childrenContainer = div.querySelector('.rd-folder-children');

            const toggleExpand = (e) => {
               // PREVENT PROPAGATION HERE is redundant if we handle click on the container,
               // but explicitly separating logic helps.
               e.stopPropagation();
               node.expanded = !node.expanded;
               childrenContainer.style.display = node.expanded ? 'block' : 'none';
               div.querySelector('span').textContent = node.expanded ? '▼' : '▶';
               if(node.expanded && !childrenContainer.hasChildNodes()) {
                  node.children.forEach(c => childrenContainer.appendChild(renderNode(c)));
               }
            };

            // Explicitly handle checkbox clicks to PREVENT bubbling to the row click
            div.querySelector('.rd-checkbox').onclick = (e) => {
               e.stopPropagation(); // Stop bubbling so row doesn't toggle
            };

            div.querySelector('.rd-checkbox').onchange = (e) => {
               e.stopPropagation(); // Stop bubbling
               const setAll = (n, v) => {
                  n.checked = v;
                  if(n.children) n.children.forEach(c => setAll(c, v));
               };
               setAll(node, e.target.checked);
               updateUI();
               if(node.expanded) {
                  childrenContainer.innerHTML = '';
                  node.children.forEach(c => childrenContainer.appendChild(renderNode(c)));
               }
            };

            div.querySelector('.rd-folder-header').onclick = toggleExpand;
            if(node.expanded) {
               node.children.forEach(c => childrenContainer.appendChild(renderNode(c)));
            }

          } else {
            div.innerHTML = `
               <div class="rd-file">
                 <input type="checkbox" class="rd-checkbox" ${node.checked ? 'checked' : ''}>
                 <span class="rd-file-name">${node.name}</span>
                 <span style="font-size:11px; opacity:0.7">${this.formatBytes(node.bytes)}</span>
               </div>
            `;
            div.onclick = (e) => {
               e.stopPropagation();
               if(e.target.type !== 'checkbox') {
                  node.checked = !node.checked;
                  div.querySelector('input').checked = node.checked;
               } else {
                  node.checked = e.target.checked;
               }
               updateUI();
            };
          }
          return div;
        };

        // Render children directly, skipping the dummy root
        fileTree.root.children.forEach(child => {
           treeRoot.appendChild(renderNode(child));
        });

        updateUI();

        toggleBtn.onclick = () => {
           const all = fileTree.getAllFiles();
           const val = all.some(f => !f.checked);
           all.forEach(f => f.checked = val);
           treeRoot.innerHTML = '';
           fileTree.root.children.forEach(child => {
             treeRoot.appendChild(renderNode(child));
           });
           updateUI();
        };

        const close = (val) => {
           overlay.remove();
           resolve(val);
        };

        overlay.querySelector('#confirm').onclick = () => close(fileTree.getSelectedFiles());
        overlay.querySelector('#cancel').onclick = () => close(null);
        overlay.querySelector('.rd-close').onclick = () => close(null);
      });
    },

    showToast(message, type = 'info') {
      this.injectStyles();
      const toast = document.createElement('div');
      toast.className = 'rd-toast';
      toast.textContent = message;
      if (type === 'error') toast.style.borderLeftColor = '#ef4444';
      if (type === 'success') toast.style.borderLeftColor = '#64cc2e';

      document.body.appendChild(toast);
      setTimeout(() => toast.remove(), 4000);
    },

    setIconState(icon, state, torrentSupportEnabled = false) {
      // Common styles for transition
      icon.style.transition = 'all 0.2s';

      if(state === 'processing') {
         icon.style.opacity = '0.5';
         icon.style.cursor = 'wait';
         icon.title = 'Processing...';
      }
      else if(state === 'added') {
         icon.textContent = '✓';
         icon.style.background = '#64cc2e'; // Green
         icon.style.opacity = '1';
         icon.style.cursor = 'default';
         icon.title = 'Torrent successfully added to Real-Debrid';
      }
      else if(state === 'existing') {
         icon.textContent = '✓';
         icon.style.background = '#64cc2e'; // Green
         icon.style.opacity = '1';
         icon.style.cursor = 'default';
         icon.title = 'Torrent already exists on Real-Debrid';
      } else {
         icon.textContent = 'RD';
         icon.style.background = '#3b82f6'; // Blue
         icon.style.opacity = '1';
         icon.style.cursor = 'pointer';
         if(torrentSupportEnabled) {
            icon.title = 'Click to send magnet to Real-Debrid, Alt+click to send torrent file';
         } else {
            icon.title = 'Click to send magnet to Real-Debrid';
         }
      }
    },

    createMagnetIcon(torrentSupportEnabled = false) {
      const icon = document.createElement('span');
      icon.className = 'rd-icon';
      icon.textContent = 'RD';
      icon.style.cssText = `cursor:pointer;display:inline-block;width:18px;height:18px;margin-left:6px;vertical-align:middle;border-radius:3px;background:#3b82f6;color:white;text-align:center;line-height:18px;font-size:11px;font-weight:bold;font-family:sans-serif;`;
      icon.setAttribute('data-rd-inserted', '1');
      if(torrentSupportEnabled) {
         icon.title = 'Click to send magnet to Real-Debrid, Alt+click to send torrent file';
      } else {
         icon.title = 'Click to send magnet to Real-Debrid';
      }
      return icon;
    },

    createMagnetIconWithCheckbox(torrentSupportEnabled = false) {
      const container = document.createElement('span');
      container.style.cssText = `display:inline-flex;align-items:center;gap:4px;vertical-align:middle;`;
      container.setAttribute('data-rd-inserted', '1');

      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.style.cssText = `cursor:pointer;width:14px;height:14px;margin:0;accent-color:#64cc2e;`;

      const icon = this.createMagnetIcon(torrentSupportEnabled);
      icon.style.marginLeft = '0';
      icon.removeAttribute('data-rd-inserted'); // Remove from icon, keep on container

      container.appendChild(checkbox);
      container.appendChild(icon);
      return container;
    },

    formatBytes(bytes) {
      if (bytes === 0) return '0 B';
      const k = 1024;
      const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
      const i = Math.floor(Math.log(bytes) / Math.log(k));
      return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    },
  };

  class MagnetLinkProcessor {
    #config;
    #realDebridApi;
    #existingTorrents = [];

    constructor(config, realDebridApi) {
      this.#config = config;
      this.#realDebridApi = realDebridApi;
    }

    async initialize() {
      try {
        this.#existingTorrents = await this.#realDebridApi.getExistingTorrents();
        logger.debug(`[Magnet Processor] Loaded ${this.#existingTorrents.length} existing torrents`);
      } catch (error) {
        logger.error('[Magnet Processor] Failed to load existing torrents', error);
        this.#existingTorrents = [];
      }
    }

    // Extract torrent hash from magnet link's xt parameter (btih = BitTorrent Info Hash)
    static parseMagnetHash(magnetLink) {
      if (!magnetLink || typeof magnetLink !== 'string') return null;
      try {
        const queryIndex = magnetLink.indexOf('?');
        if (queryIndex === -1) return null;
        const urlParameters = new URLSearchParams(magnetLink.substring(queryIndex));
        const xt = urlParameters.get('xt');
        if (xt && xt.startsWith('urn:btih:')) {
          return xt.substring(9).toUpperCase();
        }
      } catch (error) {
        logger.debug('[Magnet Processor] Failed to parse magnet hash', error);
      }
      return null;
    }

    isTorrentExists(hash) {
      if (!hash) return false;
      return Array.isArray(this.#existingTorrents) && this.#existingTorrents.some(torrent => (torrent.hash || '').toUpperCase() === hash);
    }

    // Filter files by extension and exclude those matching keywords or regex patterns
    filterFiles(files = []) {
      const allowed = new Set(this.#config.allowedExtensions.map(extension => extension.trim().toLowerCase()).filter(Boolean));
      const keywords = (this.#config.filterKeywords || []).map(keyword => keyword.trim()).filter(Boolean);

      return (files || []).filter(file => {
        const path = (file.path || '').toLowerCase();
        const name = path.split('/').pop() || '';
        const extension = name.includes('.') ? name.split('.').pop() : '';

        if (!allowed.has(extension)) return false;

        for (const keyword of keywords) {
          if (!keyword) continue;
          // Handle regex patterns (format: /pattern/)
          if (keyword.startsWith('/') && keyword.endsWith('/')) {
            try {
              const regex = new RegExp(keyword.slice(1, -1), 'i');
              if (regex.test(path) || regex.test(name)) return false;
            } catch {
              // invalid regex: ignore it
            }
          }
          if (path.includes(keyword.toLowerCase()) || name.includes(keyword.toLowerCase())) return false;
        }
        return true;
      });
    }

    async processMagnetLink(magnetLink) {
      const hash = MagnetLinkProcessor.parseMagnetHash(magnetLink);
      if (!hash) throw new RealDebridError('Invalid magnet link');

      if (this.isTorrentExists(hash)) throw new RealDebridError('Torrent already exists on Real-Debrid');

      const addResult = await this.#realDebridApi.addMagnet(magnetLink);
      if (!addResult || typeof addResult.id === 'undefined') {
        throw new RealDebridError(`Failed to add magnet: ${JSON.stringify(addResult)}`);
      }
      const torrentId = addResult.id;

      const info = await this.#realDebridApi.getTorrentInfo(torrentId);
      const files = Array.isArray(info.files) ? info.files : [];

      let selectedFileIds;
      if (this.#config.manualFileSelection) {
        if (files.length === 1) {
          selectedFileIds = [files[0].id];
        } else {
          selectedFileIds = await UIManager.createFileSelectionDialog(files);
          if (selectedFileIds === null) {
            await this.#realDebridApi.deleteTorrent(torrentId);
            throw new RealDebridError('File selection cancelled');
          }
          if (!selectedFileIds.length) {
            await this.#realDebridApi.deleteTorrent(torrentId);
            throw new RealDebridError('No files selected');
          }
        }
      } else {
        selectedFileIds = this.filterFiles(files).map(f => f.id);
        if (!selectedFileIds.length) {
          await this.#realDebridApi.deleteTorrent(torrentId);
          throw new RealDebridError('No matching files found after filtering');
        }
      }

      logger.debug(`[Magnet Processor] Selected files: ${selectedFileIds.map(id => files.find(f => f.id === id)?.path || `ID:${id}`).join(', ')}`);
      await this.#realDebridApi.selectFiles(torrentId, selectedFileIds.join(','));
      return selectedFileIds.length;
    }

    async processTorrentLink(torrentUrl) {
      const torrentBlob = await this.fetchTorrentFile(torrentUrl);

      const addResult = await this.#realDebridApi.addTorrent(torrentBlob);
      if (!addResult || typeof addResult.id === 'undefined') {
        throw new RealDebridError('Failed to add torrent');
      }
      const torrentId = addResult.id;

      const info = await this.#realDebridApi.getTorrentInfo(torrentId);
      const files = Array.isArray(info.files) ? info.files : [];

      let selectedFileIds;
      if (this.#config.manualFileSelection) {
        if (files.length === 1) {
          selectedFileIds = [files[0].id];
        } else {
          selectedFileIds = await UIManager.createFileSelectionDialog(files);
          if (selectedFileIds === null) {
            await this.#realDebridApi.deleteTorrent(torrentId);
            throw new RealDebridError('File selection cancelled');
          }
          if (!selectedFileIds.length) {
            await this.#realDebridApi.deleteTorrent(torrentId);
            throw new RealDebridError('No files selected');
          }
        }
      } else {
        selectedFileIds = this.filterFiles(files).map(f => f.id);
        if (!selectedFileIds.length) {
          await this.#realDebridApi.deleteTorrent(torrentId);
          throw new RealDebridError('No matching files found after filtering');
        }
      }

      logger.debug(`[Torrent Processor] Selected files: ${selectedFileIds.map(id => files.find(f => f.id === id)?.path || `ID:${id}`).join(', ')}`);
      await this.#realDebridApi.selectFiles(torrentId, selectedFileIds.join(','));
      return selectedFileIds.length;
    }

    async fetchTorrentFile(url) {
      return new Promise((resolve, reject) => {
        GM_xmlhttpRequest({
          method: 'GET',
          url,
          responseType: 'blob',
          onload: (response) => {
            if (response.status >= 200 && response.status < 300) {
              resolve(response.response);
            } else {
              reject(new RealDebridError(`Failed to fetch torrent file: ${response.status}`));
            }
          },
          onerror: () => reject(new RealDebridError('Network request failed for torrent file'))
        });
      });
    }

    isTorrentSupportEnabled() {
      return this.#config.enableTorrentSupport;
    }
  }

  class PageIntegrator {
    constructor(processor = null) {
      this.processor = processor;
      this.observer = null;
      this.keyToIcon = new Map();
      this.selectedLinks = new Set();
      this.totalMagnetLinks = 0;
      this.initialMagnetLinkCount = 0; // Store the initial count separately
      this.batchButton = null;
    }

    setProcessor(processor) {
      this.processor = processor;
    }

    _shouldShowBatchUI() {
      return this.initialMagnetLinkCount > 1;
    }

    _updateBatchButton() {
      if (!this._shouldShowBatchUI()) {
        this._removeBatchButton();
        return;
      }
      const selectedCount = this.selectedLinks.size;
      if (selectedCount === 0) {
        this._removeBatchButton();
        return;
      }
      if (!this.batchButton) {
        this._createBatchButton();
      }
      this.batchButton.textContent = `Process ${selectedCount} Selected Link${selectedCount !== 1 ? 's' : ''}`;
    }

    _createBatchButton() {
      if (this.batchButton) return;

      this.batchButton = document.createElement('button');
      Object.assign(this.batchButton.style, {
        position: 'fixed',
        bottom: '20px',
        right: '20px',
        backgroundColor: '#3b82f6',
        color: 'white',
        border: 'none',
        borderRadius: '8px',
        padding: '12px 16px',
        fontSize: '14px',
        fontWeight: '500',
        cursor: 'pointer',
        zIndex: '10000',
        boxShadow: '0 4px 12px rgba(0, 0, 0, 0.3)',
        transition: 'all 0.2s'
      });
      this.batchButton.addEventListener('mouseenter', () => { this.batchButton.style.backgroundColor = '#2563eb'; });
      this.batchButton.addEventListener('mouseleave', () => { this.batchButton.style.backgroundColor = '#3b82f6'; });
      this.batchButton.addEventListener('click', () => this._processBatch());
      document.body.appendChild(this.batchButton);
    }

    _removeBatchButton() {
      if (this.batchButton && this.batchButton.parentNode) {
        this.batchButton.parentNode.removeChild(this.batchButton);
        this.batchButton = null;
      }
    }

    async _processBatch() {
      const selectedUrls = [...this.selectedLinks];
      if (selectedUrls.length === 0) return;

      const isInitialized = await ensureApiInitialized();
      if (!isInitialized) {
        UIManager.showToast('Real-Debrid API key not configured. Use the menu to set it.', 'info');
        return;
      }
      // Re-fetch config synchronously to ensure we have the latest UI preferences
      const config = ConfigManager.getConfigSync();

      let successCount = 0;
      let errorCount = 0;

      for (let index = 0; index < selectedUrls.length; index++) {
        const url = selectedUrls[index];
        const key = this._magnetKeyFor(url);
        const icon = this.keyToIcon.get(key);

        UIManager.showToast(`Processing ${index + 1}/${selectedUrls.length} links...`, 'info');
        if (icon) UIManager.setIconState(icon, 'processing', config.enableTorrentSupport);

        try {
          await this.processor.processMagnetLink(url);
          successCount++;
          if (icon) UIManager.setIconState(icon, 'added', config.enableTorrentSupport);
        } catch (error) {
          errorCount++;
          if (icon) UIManager.setIconState(icon, 'default', config.enableTorrentSupport);
          logger.error(`[Batch Processing] Failed to process ${url}`, error);
        }
      }

      // Clear selections after processing
      this.selectedLinks.clear();
      this._updateBatchButton();

      if (errorCount === 0) UIManager.showToast(`Successfully processed ${successCount} link${successCount !== 1 ? 's' : ''}!`, 'success');
      else if (successCount === 0) UIManager.showToast(`Failed to process all ${errorCount} link${errorCount !== 1 ? 's' : ''}`, 'error');
      else UIManager.showToast(`Processed ${successCount} successfully, ${errorCount} failed`, 'info');
    }

    _magnetKeyFor(href) {
      const hash = MagnetLinkProcessor.parseMagnetHash(href);
      if (hash) return `hash:${hash}`;
      try { return `href:${href.trim().toLowerCase()}`; } catch { return `href:${String(href).trim().toLowerCase()}`; }
    }

    _attach(iconContainer, link) {
      const icon = iconContainer.querySelector('.rd-icon') || iconContainer;
      const checkbox = iconContainer.querySelector('input[type="checkbox"]');

      const processLink = async (event) => {
        if (icon.textContent === '✓') return; // Already processed

        // Fetch latest config for current operation
        const config = ConfigManager.getConfigSync();
        const torrentSupport = config.enableTorrentSupport;

        const isMagnet = link.href.startsWith('magnet:');
        let linkToProcess = link;
        if (isMagnet && event.altKey) {
          if (!torrentSupport) {
            UIManager.showToast('Torrent support not enabled. Enable it in settings.', 'info');
            return;
          }
          const container = link.closest('tr') || link.closest('div') || link.closest('li') || link.parentElement;
          const torrentLink = container?.querySelector('a[href$=".torrent"]');
          if (torrentLink) linkToProcess = torrentLink;
          else {
            UIManager.showToast('No torrent link found nearby', 'info');
            return;
          }
        }
        const isProcessingMagnet = linkToProcess.href.startsWith('magnet:');
        const key = this._magnetKeyFor(link.href);
        const isInitialized = await ensureApiInitialized();

        if (!isInitialized) {
          UIManager.showToast('Real-Debrid API key not configured. Use the menu to set it.', 'info');
          return;
        }

        if (isProcessingMagnet && key?.startsWith('hash:') && this.processor?.isTorrentExists(key.split(':')[1])) {
          UIManager.showToast('Torrent already exists on Real-Debrid', 'info');
          UIManager.setIconState(icon, 'existing', torrentSupport); // This sets text to checkmark
          return;
        }

        UIManager.setIconState(icon, 'processing', torrentSupport);

        try {
          const fileCount = isProcessingMagnet ?
            await this.processor.processMagnetLink(linkToProcess.href) :
            await this.processor.processTorrentLink(linkToProcess.href);
          UIManager.showToast(`Added to Real-Debrid — ${fileCount} file(s) selected`, 'success');
          UIManager.setIconState(icon, 'added', torrentSupport);
        } catch (error) {
          UIManager.setIconState(icon, 'default', torrentSupport);
          UIManager.showToast(error?.message || 'Failed to process link', 'error');
          logger.error('[Link Processor] Failed to process link', error);
        }
      };

      icon.addEventListener('click', (event_) => {
        event_.preventDefault();
        processLink(event_);
      });

      // Handle checkbox selection for batch processing
      if (checkbox) {
        checkbox.addEventListener('change', (event_) => {
          event_.stopPropagation();
          if (icon.textContent === '✓') return; // Already processed
          if (checkbox.checked) this.selectedLinks.add(link.href);
          else this.selectedLinks.delete(link.href);
          this._updateBatchButton();
        });
        checkbox.addEventListener('click', (event_) => { event_.stopPropagation(); });
      }
    }

    addIconsTo(documentRoot = document) {
      const links = [...documentRoot.querySelectorAll('a[href^="magnet:"]')];
      this.totalMagnetLinks = links.length;

      // Set initial count only once when we first find magnet links
      if (this.initialMagnetLinkCount === 0 && links.length > 0) {
        // Count unique magnet hashes
        const uniqueHashes = new Set();
        for (const link of links) {
          const hash = MagnetLinkProcessor.parseMagnetHash(link.href);
          if (hash) uniqueHashes.add(hash);
        }
        this.initialMagnetLinkCount = uniqueHashes.size;
      }

      // Retrieve config synchronously to set correct initial tooltips
      const config = ConfigManager.getConfigSync();
      const torrentSupport = config.enableTorrentSupport;

      const newlyAddedKeys = [];
      for (const link of links) {
        if (!link.parentNode) continue;

        // Check if this link has already been processed
        if (link.hasAttribute('data-rd-processed')) {
          const key = this._magnetKeyFor(link.href);
          if (key && !this.keyToIcon.has(key)) {
            // Find the icon - it might not be the immediate next sibling anymore
            const icon = link.parentNode.querySelector(`[${INSERTED_ICON_ATTR}]`);
            if (icon) this.keyToIcon.set(key, icon);
          }
          continue;
        }

        const key = this._magnetKeyFor(link.href);
        if (key && this.keyToIcon.has(key)) continue;

        const iconContainer = this._shouldShowBatchUI() ?
           UIManager.createMagnetIconWithCheckbox(torrentSupport) :
           UIManager.createMagnetIcon(torrentSupport);

        this._attach(iconContainer, link);
        link.parentNode.insertBefore(iconContainer, link.nextSibling);
        link.setAttribute('data-rd-processed', '1');
        const storeKey = key || `href:${link.href.trim().toLowerCase()}`;
        this.keyToIcon.set(storeKey, iconContainer);
        newlyAddedKeys.push(storeKey);
      }

      if (newlyAddedKeys.length) {
        ensureApiInitialized().then(isInitialized => {
          if (isInitialized) this.markExistingTorrents();
        });
      }
      this._updateBatchButton();
    }

    markExistingTorrents() {
      if (!this.processor) return;
      // We need config here too to preserve tooltips if we update state
      const config = ConfigManager.getConfigSync();

      for (const [key, iconContainer] of this.keyToIcon.entries()) {
        if (!key.startsWith('hash:')) continue;
        const hash = key.split(':')[1];
        if (this.processor.isTorrentExists(hash)) {
          const icon = iconContainer.querySelector('.rd-icon') || iconContainer;
          UIManager.setIconState(icon, 'existing', config.enableTorrentSupport);
        }
      }
    }

    // Watch for new magnet links added to the page dynamically
    startObserving() {
      if (this.observer) return;
      const debouncedHandler = debounce((mutations) => {
        let hasNewMagnetLinks = false;
        for (const mutation of mutations) {
          if (mutation.addedNodes && mutation.addedNodes.length) {
            for (const node of mutation.addedNodes) {
              if (node.nodeType === Node.ELEMENT_NODE) {
                if (node.matches && node.matches('a[href^="magnet:"]')) {
                  hasNewMagnetLinks = true;
                  break;
                }
                // Check descendants too
                if (node.querySelector && node.querySelector('a[href^="magnet:"]')) {
                  hasNewMagnetLinks = true;
                  break;
                }
              }
            }
            if (hasNewMagnetLinks) break;
          }
        }
        if (hasNewMagnetLinks) this.addIconsTo(document);
      }, MUTATION_DEBOUNCE_MS);

      this.observer = new MutationObserver(debouncedHandler);
      this.observer.observe(document.body, { childList: true, subtree: true });
    }

    stopObserving() {
      if (!this.observer) return;
      this.observer.disconnect();
      this.observer = null;
      this._removeBatchButton();
    }
  }

  // Lazy initialization to avoid API calls until first magnet link is clicked
  let _apiInitPromise = null;
  let _realDebridService = null;
  let _magnetProcessor = null;
  let _integratorInstance = null;

  async function ensureApiInitialized() {
    if (_apiInitPromise) return _apiInitPromise;

    try {
      if (!document.querySelector || !document.querySelector('a[href^="magnet:"]')) return false;
    } catch {}

    const config = await ConfigManager.getConfig();
    if (!config.apiKey) return false;

    try {
      _realDebridService = new RealDebridService(config.apiKey);
    } catch (error) {
      logger.warn('[Initialization] Failed to create Real-Debrid service', error);
      return false;
    }

    _magnetProcessor = new MagnetLinkProcessor(config, _realDebridService);
    _apiInitPromise = _magnetProcessor.initialize()
      .then(() => {
        if (_integratorInstance) {
          _integratorInstance.setProcessor(_magnetProcessor);
          _integratorInstance.markExistingTorrents();
        }
        return true;
      })
      .catch(error => {
        logger.warn('[Initialization] Failed to initialize Real-Debrid integration', error);
        return false;
      });

    return _apiInitPromise;
  }

  async function init() {
    try {
      const config = await ConfigManager.getConfig();
      logger = Logger('Magnet Link to Real-Debrid', { debug: config.debugEnabled });

      _integratorInstance = new PageIntegrator(null);
      _integratorInstance.addIconsTo();
      _integratorInstance.startObserving();

      GM_registerMenuCommand('Configure Real-Debrid Settings', async () => {
        const currentConfig = await ConfigManager.getConfig();
        UIManager.createConfigDialog(currentConfig);
      });
    } catch (error) {
      logger.error('[Initialization] Script initialization failed', error);
    }
  }

  init();

})();
