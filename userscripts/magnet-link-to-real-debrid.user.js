// ==UserScript==
// @name          Magnet Link to Real-Debrid
// @version       2.12.1
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
        logger?.error('[Config] Failed to parse stored configuration, resetting to defaults.', error);
        return null;
      }
    },

    getConfigSync() {
      const stored = GM_getValue(STORAGE_KEY);
      const parsed = this._safeParse(stored) || {};
      return {
        ...DEFAULTS,
        ...parsed
      };
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
          const headers = {
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

    getAllFiles(node = this.root) {
      const files = [];
      const traverse = current => {
        if (current.type === 'file') files.push(current);
        if (current.children)
          for (const child of current.children) traverse(child);
      };
      traverse(node);
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

      const styles = `:root{--rd-green:#64cc2e;--rd-green-hover:#52a825;--rd-bg:#1d1d1d;--rd-panel:#242424;--rd-border:#333;--rd-text:#eee;--rd-text-dim:#999;--rd-input-bg:#161616;--rd-overlay:rgba(0,0,0,0.85);--rd-shadow:0 20px 50px rgba(0,0,0,0.5);--rd-radius:8px;--rd-transition:all 0.2s ease}.rd-overlay{position:fixed;inset:0;z-index:10000;display:flex;align-items:center;justify-content:center;background:var(--rd-overlay);backdrop-filter:blur(5px);font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;opacity:0;animation:rd-fade-in 0.2s forwards}@keyframes rd-fade-in{to{opacity:1}}.rd-dialog{width:800px;max-width:90%;height:600px;max-height:90vh;background:var(--rd-bg);border-radius:var(--rd-radius);box-shadow:var(--rd-shadow);display:flex;flex-direction:column;overflow:hidden;border:1px solid var(--rd-border)}.rd-header{padding:20px 25px;border-bottom:1px solid var(--rd-border);display:flex;justify-content:space-between;align-items:center;background:var(--rd-panel)}.rd-title{margin:0;font-size:20px;color:#fff;font-weight:600}.rd-close{background:none;border:none;color:var(--rd-text-dim);font-size:24px;cursor:pointer;line-height:1;padding:5px;border-radius:4px;transition:var(--rd-transition)}.rd-close:hover{color:#fff;background:rgba(255,255,255,0.1)}.rd-body{flex:1;display:flex;overflow:hidden}.rd-sidebar{width:200px;background:#181818;border-right:1px solid var(--rd-border);padding:15px 0;display:flex;flex-direction:column;gap:5px}.rd-nav-item{padding:12px 20px;cursor:pointer;color:var(--rd-text-dim);font-size:14px;font-weight:500;transition:var(--rd-transition);border-left:3px solid transparent;background:none;border-top:none;border-right:none;border-bottom:none;text-align:left;font-family:inherit}.rd-nav-item:hover{color:#fff;background:rgba(255,255,255,0.03)}.rd-nav-item.active{color:#fff;background:rgba(100,204,46,0.1);border-left-color:var(--rd-green)}.rd-content{flex:1;padding:0;overflow-y:auto;position:relative}.rd-tab-pane{display:none;padding:20px}.rd-tab-pane.active{display:block}.rd-group{margin-bottom:20px}.rd-label{display:block;margin-bottom:8px;font-weight:500;color:var(--rd-text)}.rd-input-wrapper{position:relative;display:flex;align-items:center}.rd-input{width:100%;padding:12px 16px;background:var(--rd-input-bg);border:1px solid var(--rd-border);border-radius:6px;color:var(--rd-text);font-size:14px;transition:var(--rd-transition)}.rd-input:focus{outline:none;border-color:var(--rd-green);box-shadow:0 0 0 3px rgba(100,204,46,0.1)}.rd-input.invalid{border-color:#ef4444}.rd-eye-btn{position:absolute;right:12px;background:none;border:none;color:var(--rd-text-dim);cursor:pointer;padding:4px;border-radius:4px;transition:var(--rd-transition);display:flex;align-items:center;justify-content:center}.rd-eye-btn:hover{color:var(--rd-text);background:rgba(255,255,255,0.1)}.rd-eye-btn.active{color:var(--rd-green)}.rd-sub-label{display:block;margin-top:6px;font-size:12px;color:var(--rd-text-dim);line-height:1.4}.rd-sub-label a{color:var(--rd-green);text-decoration:none}.rd-sub-label a:hover{text-decoration:underline}.rd-list-item{display:flex;align-items:center;justify-content:space-between;padding:16px 0;border-bottom:1px solid var(--rd-border)}.rd-list-item:last-child{border-bottom:none}.rd-info{flex:1}.rd-info h4{margin:0 0 4px 0;font-size:16px;font-weight:600;color:var(--rd-text)}.rd-info p{margin:0;font-size:14px;color:var(--rd-text-dim);line-height:1.4}.rd-toggle{position:relative;display:inline-block;width:44px;height:24px;flex-shrink:0}.rd-toggle input{opacity:0;width:0;height:0}.rd-slider{position:absolute;cursor:pointer;inset:0;background:var(--rd-input-bg);border:1px solid var(--rd-border);border-radius:24px;transition:var(--rd-transition)}.rd-slider:before{position:absolute;content:"";height:18px;width:18px;left:2px;bottom:2px;background:#fff;border-radius:50%;transition:var(--rd-transition)}input:checked+.rd-slider{background:var(--rd-green);border-color:var(--rd-green)}input:checked+.rd-slider:before{transform:translateX(20px)}.rd-textarea{width:100%;min-height:80px;padding:12px 16px;background:var(--rd-input-bg);border:1px solid var(--rd-border);border-radius:6px;color:var(--rd-text);font-size:14px;font-family:inherit;resize:vertical;transition:var(--rd-transition)}.rd-textarea:focus{outline:none;border-color:var(--rd-green);box-shadow:0 0 0 3px rgba(100,204,46,0.1)}.rd-textarea.invalid{border-color:#ef4444}.rd-footer{padding:20px 25px;border-top:1px solid var(--rd-border);display:flex;justify-content:flex-end;gap:12px;background:var(--rd-panel)}.rd-btn{padding:10px 20px;border-radius:6px;font-size:14px;font-weight:500;cursor:pointer;transition:var(--rd-transition);border:1px solid transparent;display:inline-flex;align-items:center;gap:8px;font-family:inherit}.rd-btn:disabled{opacity:0.6;cursor:not-allowed}.rd-btn-primary{background:var(--rd-green);color:#fff;border-color:var(--rd-green)}.rd-btn-primary:hover:not(:disabled){background:var(--rd-green-hover);border-color:var(--rd-green-hover)}.rd-btn-ghost{background:transparent;color:var(--rd-text);border-color:var(--rd-border)}.rd-btn-ghost:hover:not(:disabled){background:rgba(255,255,255,0.1)}.rd-field-error{display:none;margin-top:6px;font-size:12px;color:#ef4444;animation:rd-shake 0.3s ease}.rd-field-error.show{display:block}@keyframes rd-shake{0%,100%{transform:translateX(0)}25%{transform:translateX(-2px)}75%{transform:translateX(2px)}}@keyframes rd-spin{to{transform:rotate(360deg)}}.rd-spinner{animation:rd-spin 1s linear infinite}.rd-toast{position:fixed;bottom:20px;left:20px;padding:12px 16px;background:var(--rd-bg);border:1px solid var(--rd-border);border-radius:6px;color:var(--rd-text);font-size:14px;box-shadow:var(--rd-shadow);z-index:10001;max-width:300px;animation:rd-toast-in 0.3s ease}.rd-toast.error{border-left:4px solid #ef4444}.rd-toast.success{border-left:4px solid var(--rd-green)}@keyframes rd-toast-in{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:translateY(0)}}@keyframes rd-toast-out{to{opacity:0;transform:translateY(-10px) scale(0.95)}}.rd-file-dialog .rd-file-toolbar{display:flex;justify-content:space-between;align-items:center;padding:12px 20px;border-bottom:1px solid var(--rd-border);background:#1a1a1a}.rd-file-stats{font-size:13px;color:var(--rd-text-dim);font-weight:500}.rd-file-tree{padding:16px 20px;flex:1;overflow-y:auto}.rd-tree-item{margin-bottom:4px;border-radius:6px;transition:var(--rd-transition)}.rd-tree-item:hover{background:rgba(255,255,255,0.02)}.rd-folder-header,.rd-file{display:flex;align-items:center;padding:10px 14px;border-radius:6px;cursor:pointer;gap:10px}.rd-folder-header:hover,.rd-file:hover{background:rgba(100,204,46,0.08)}.rd-folder-name,.rd-file-name{flex:1;font-size:14px;color:var(--rd-text);font-weight:500}.rd-badge{background:#3b82f6;color:#fff;font-size:11px;padding:3px 8px;border-radius:12px;margin-left:auto;font-weight:500}.rd-checkbox{appearance:none;width:18px;height:18px;border:2px solid #555;border-radius:4px;background:#252525;cursor:pointer;position:relative;transition:var(--rd-transition);flex-shrink:0}.rd-checkbox:hover{border-color:#888}.rd-checkbox:checked{background:var(--rd-green);border-color:var(--rd-green)}.rd-checkbox:checked::after{content:'✓';position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);color:#fff;font-size:12px;font-weight:bold}.rd-checkbox:indeterminate{background:var(--rd-green);border-color:var(--rd-green)}.rd-checkbox:indeterminate::after{content:'−';position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);color:#fff;font-size:14px;font-weight:bold}.rd-file{padding-left:48px}.rd-file .rd-file-name{font-weight:400;font-size:13px}.rd-file .rd-file-name,.rd-file .rd-file-size{color:var(--rd-text-dim)}.rd-file-size{text-align:right;font-size:12px;color:var(--rd-text-dim);min-width:70px;flex-shrink:0}.rd-folder-children{margin-left:24px;padding-left:12px;border-left:1px solid #2a2a2a}.rd-folder-children .rd-tree-item:first-child{margin-top:8px}.rd-folder-children .rd-tree-item:last-child{margin-bottom:8px}.rd-folder-icon,.rd-file-icon{width:16px;height:16px;flex-shrink:0;opacity:0.7}.rd-file.selected{background:rgba(100,204,46,0.12);border:1px solid rgba(100,204,46,0.3)}.rd-folder-header.selected{background:rgba(100,204,46,0.08)}@media(max-width:768px){.rd-dialog{width:95%;height:90vh}.rd-sidebar{width:100%;border-right:none;border-bottom:1px solid var(--rd-border);flex-direction:row;overflow-x:auto}.rd-nav-item{padding:12px 16px;white-space:nowrap;border-left:none;border-bottom:3px solid transparent}.rd-nav-item.active{border-bottom-color:var(--rd-green);background:rgba(100,204,46,0.05)}}@media(max-width:480px){.rd-header{padding:16px 20px}.rd-title{font-size:18px}.rd-tab-pane{padding:20px}.rd-footer{padding:16px 20px;flex-direction:column}.rd-btn{width:100%;justify-content:center}.rd-list-item{flex-direction:column;align-items:flex-start;gap:12px}.rd-toggle{align-self:flex-end}}@media(prefers-reduced-motion:reduce){*{animation-duration:0.01ms!important;animation-iteration-count:1!important;transition-duration:0.01ms!important}}`;

      const styleSheet = document.createElement('style');
      styleSheet.id = id;
      styleSheet.textContent = styles;
      document.head.appendChild(styleSheet);
    },

    escapeHtml(text) {
      const div = document.createElement('div');
      div.textContent = text;
      return div.innerHTML;
    },

    announceToScreenReader(message) {
      const announcement = document.createElement('div');
      announcement.setAttribute('aria-live', 'polite');
      announcement.setAttribute('aria-atomic', 'true');
      announcement.style.cssText = 'position:absolute;left:-10000px;width:1px;height:1px;overflow:hidden;';
      announcement.textContent = message;
      document.body.appendChild(announcement);
      setTimeout(() => announcement.remove(), 1000);
    },

    createConfigDialog(currentConfig) {
      this.injectStyles();

      const html = `<div class="rd-dialog" role="dialog" aria-labelledby="rd-dialog-title" aria-modal="true"><div class="rd-header"><h2 id="rd-dialog-title" class="rd-title">Real-Debrid Settings</h2><button class="rd-close" aria-label="Close settings dialog">&times;</button></div><div class="rd-body"><nav class="rd-sidebar" role="tablist" aria-label="Settings sections"><button class="rd-nav-item active" data-tab="tab-general" role="tab" aria-selected="true" id="tab-general-btn">General</button><button class="rd-nav-item" data-tab="tab-filtering" role="tab" aria-selected="false" id="tab-filtering-btn">Filters</button></nav><div class="rd-content"><div id="tab-general" class="rd-tab-pane active" role="tabpanel" aria-labelledby="tab-general-btn"><div class="rd-group"><label for="apiKeyInput" class="rd-label">API Token</label><div class="rd-input-wrapper"><input type="password" id="apiKeyInput" class="rd-input" value="${this.escapeHtml(currentConfig.apiKey||'')}" placeholder="Paste your Real-Debrid API Token here" style="padding-right:40px" aria-describedby="api-key-help" required><button id="toggleApiVisibility" class="rd-eye-btn" type="button" aria-label="Toggle API key visibility" title="Show/Hide Token"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg></button></div><div id="api-key-help" class="rd-sub-label">Find this at <a href="https://real-debrid.com/apitoken" target="_blank" rel="noopener">real-debrid.com/apitoken</a></div><div id="api-key-error" class="rd-field-error">API key is required</div></div><div class="rd-list-item"><div class="rd-info"><h4>Manual File Selection</h4><p>Always show the file selection dialog before adding<br><span style="color:var(--rd-text-dim);font-size:11px">(Enabling this hides the Filters tab)</span></p></div><label class="rd-toggle"><input type="checkbox" id="manualFileSelection" ${currentConfig.manualFileSelection?'checked':''}><span class="rd-slider"></span></label></div><div class="rd-list-item"><div class="rd-info"><h4>Torrent Support</h4><p>Alt+Click magnet links to process .torrent files instead</p></div><label class="rd-toggle"><input type="checkbox" id="enableTorrentSupport" ${currentConfig.enableTorrentSupport?'checked':''}><span class="rd-slider"></span></label></div><div class="rd-list-item"><div class="rd-info"><h4>Debug Mode</h4><p>Log detailed information to the browser console</p></div><label class="rd-toggle"><input type="checkbox" id="debugEnabled" ${currentConfig.debugEnabled?'checked':''}><span class="rd-slider"></span></label></div></div><div id="tab-filtering" class="rd-tab-pane" role="tabpanel" aria-labelledby="tab-filtering-btn"><div class="rd-group"><label for="allowedExtensions" class="rd-label">Allowed Extensions</label><textarea id="allowedExtensions" class="rd-textarea" placeholder="mkv, mp4, avi" aria-describedby="extensions-help">${this.escapeHtml(currentConfig.allowedExtensions.join(', '))}</textarea><div id="extensions-help" class="rd-sub-label">Comma separated list of file extensions to auto-select</div><div id="extensions-error" class="rd-field-error">Please enter at least one file extension</div></div><div class="rd-group"><label for="filterKeywords" class="rd-label">Filter Keywords</label><textarea id="filterKeywords" class="rd-textarea" placeholder="sample, trailer" aria-describedby="keywords-help">${this.escapeHtml(currentConfig.filterKeywords.join(', '))}</textarea><div id="keywords-help" class="rd-sub-label">Files containing these words (or Regex /.../) will be skipped</div></div></div></div></div><div class="rd-footer"><button class="rd-btn rd-btn-ghost" id="cancelButton" type="button">Cancel</button><button class="rd-btn rd-btn-primary" id="saveButton" type="button"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21H5a2 2 0 01-2-2V5a2 2 0 012-2h11l5 5v11a2 2 0 01-2 2z"></path><polyline points="17,21 17,13 7,13 7,21"></polyline><polyline points="7,3 7,8 15,8"></polyline></svg>Save Changes</button></div></div>`;

      const overlay = document.createElement('div');
      overlay.className = 'rd-overlay';
      overlay.innerHTML = html;
      document.body.appendChild(overlay);

      const manualCheckbox = overlay.querySelector('#manualFileSelection');
      const filterTabNav = overlay.querySelector('.rd-nav-item[data-tab="tab-filtering"]');
      const apiKeyInput = overlay.querySelector('#apiKeyInput');
      const toggleApiButton = overlay.querySelector('#toggleApiVisibility');
      const saveButton = overlay.querySelector('#saveButton');
      const apiKeyError = overlay.querySelector('#api-key-error');
      const extensionsError = overlay.querySelector('#extensions-error');

      const eyeOpenSvg = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>';
      const eyeClosedSvg = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19m-6.72-1.07a3 3 0 11-4.24-4.24"></path><line x1="1" y1="1" x2="23" y2="23"></line></svg>';

      toggleApiButton.addEventListener('click', () => {
        const isVisible = apiKeyInput.type === 'text';
        apiKeyInput.type = isVisible ? 'password' : 'text';
        toggleApiButton.innerHTML = isVisible ? eyeOpenSvg : eyeClosedSvg;
        toggleApiButton.classList.toggle('active', !isVisible);
        apiKeyInput.focus();
      });

      const updateFilterTabVisibility = () => {
        if (manualCheckbox.checked) {
          filterTabNav.style.display = 'none';
          if (filterTabNav.classList.contains('active')) {
            overlay.querySelector('[data-tab="tab-general"]').click();
          }
        } else {
          filterTabNav.style.display = '';
        }
      };
      manualCheckbox.addEventListener('change', updateFilterTabVisibility);
      updateFilterTabVisibility();

      apiKeyInput.addEventListener('input', () => {
        if (apiKeyInput.value.trim()) {
          apiKeyError.classList.remove('show');
          apiKeyInput.classList.remove('invalid');
        }
      });

      const extensionsTextarea = overlay.querySelector('#allowedExtensions');
      extensionsTextarea.addEventListener('input', () => {
        if (extensionsTextarea.value.trim()) {
          extensionsError.classList.remove('show');
          extensionsTextarea.classList.remove('invalid');
        }
      });

      const close = () => {
        overlay.remove();
        document.removeEventListener('keydown', escHandler);
      };
      const escHandler = (event) => {
        if (event.key === 'Escape') close();
      };
      document.addEventListener('keydown', escHandler);

      overlay.querySelector('.rd-close').addEventListener('click', close);
      overlay.querySelector('#cancelButton').addEventListener('click', close);

      // Tab switching
      const tabs = overlay.querySelectorAll('.rd-nav-item');
      for (const tab of tabs) {
        tab.addEventListener('click', () => {
          for (const tabElement of overlay.querySelectorAll('.rd-nav-item')) {
            tabElement.classList.remove('active');
            tabElement.setAttribute('aria-selected', 'false');
          }
          for (const paneElement of overlay.querySelectorAll('.rd-tab-pane')) {
            paneElement.classList.remove('active');
          }
          tab.classList.add('active');
          tab.setAttribute('aria-selected', 'true');
          const targetPane = overlay.querySelector(`#${tab.dataset.tab}`);
          if (targetPane) targetPane.classList.add('active');
          this.announceToScreenReader(`Switched to ${tab.textContent.trim()} tab`);
        });
      }

      saveButton.addEventListener('click', async () => {
        const originalHtml = saveButton.innerHTML;
        let hasError = false;

        const apiKeyValue = apiKeyInput.value.trim();
        if (!apiKeyValue) {
          apiKeyError.classList.add('show');
          apiKeyInput.classList.add('invalid');
          hasError = true;
        } else {
          apiKeyError.classList.remove('show');
          apiKeyInput.classList.remove('invalid');
        }

        const extensionsValue = extensionsTextarea.value.trim();
        if (!extensionsValue) {
          extensionsError.classList.add('show');
          extensionsTextarea.classList.add('invalid');
          hasError = true;
        } else {
          extensionsError.classList.remove('show');
          extensionsTextarea.classList.remove('invalid');
        }

        if (hasError) {
          this.showToast('Please correct the errors below', 'error');
          const firstInvalid = overlay.querySelector('.invalid');
          if (firstInvalid) firstInvalid.focus();
          return;
        }

        saveButton.disabled = true;
        saveButton.innerHTML = '<svg class="rd-spinner" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10" stroke="currentColor" stroke-opacity="0.25" stroke-width="4"></circle><path stroke="currentColor" stroke-opacity="0.75" stroke-width="4" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg> Saving...';

        try {
          const newConfig = {
            apiKey: apiKeyValue,
            enableTorrentSupport: overlay.querySelector('#enableTorrentSupport').checked,
            debugEnabled: overlay.querySelector('#debugEnabled').checked,
            manualFileSelection: manualCheckbox.checked,
            allowedExtensions: extensionsTextarea.value.split(',').map(extension => extension.trim()).filter(Boolean),
            filterKeywords: overlay.querySelector('#filterKeywords').value.split(',').map(keyword => keyword.trim()).filter(Boolean)
          };

          await ConfigManager.saveConfig(newConfig);
          close();
          this.showToast('Settings saved successfully', 'success');
          location.reload();
        } catch (error) {
          saveButton.disabled = false;
          saveButton.innerHTML = originalHtml;
          this.showToast(error.message, 'error');
        }
      });
    },

    createFileSelectionDialog(files) {
      this.injectStyles();
      return new Promise((resolve) => {
        const fileTree = new FileTree(files);
        const allFiles = fileTree.getAllFiles();
        const totalSizeAll = allFiles.reduce((totalSize, file) => totalSize + (file.bytes || 0), 0);

        const overlay = document.createElement('div');
        overlay.className = 'rd-overlay';
        overlay.innerHTML = `<div class="rd-dialog rd-file-dialog"><div class="rd-header"><h2 class="rd-title">Select Files</h2><button class="rd-close">&times;</button></div><div class="rd-file-toolbar"><button class="rd-btn rd-btn-ghost" id="toggleAll" style="padding:4px 8px;font-size:12px;border:1px solid #444">Select All</button><span class="rd-file-stats" id="stats">0 files selected</span></div><div class="rd-content"><div class="rd-file-tree" id="treeRoot"></div></div><div class="rd-footer"><button class="rd-btn rd-btn-ghost" id="cancel">Cancel</button><button class="rd-btn rd-btn-primary" id="confirm">Add Selected</button></div></div>`;

        document.body.appendChild(overlay);

        const treeRoot = overlay.querySelector('#treeRoot');
        const statsLabel = overlay.querySelector('#stats');
        const toggleButton = overlay.querySelector('#toggleAll');

        const updateUI = () => {
          const updateStates = (node) => {
            if (node.type === 'file') return node.checked;
            if (node.children) {
              const states = node.children.map(updateStates);
              node.checked = states.every(state => state);
              node.indeterminate = !node.checked && states.some(state => state);
              return states.some(state => state);
            }
            return false;
          };
          updateStates(fileTree.root);

          // Sync folder checkboxes in DOM
          const syncCheckboxes = (node, element) => {
            if (node.type === 'folder') {
              const checkbox = element.querySelector('.rd-checkbox');
              if (checkbox) {
                checkbox.checked = node.checked;
                checkbox.indeterminate = node.indeterminate;
              }
              const childrenDiv = element.querySelector('.rd-folder-children');
              if (childrenDiv && node.children) {
                const childElements = childrenDiv.children;
                for (let index = 0; index < node.children.length; index++) {
                  if (childElements[index]) syncCheckboxes(node.children[index], childElements[index]);
                }
              }
            }
          };
          for (let index = 0; index < treeRoot.children.length; index++) {
            syncCheckboxes(fileTree.root.children[index], treeRoot.children[index]);
          }

          const selected = allFiles.filter(file => file.checked);
          const size = selected.reduce((totalSize, file) => totalSize + (file.bytes || 0), 0);
          statsLabel.textContent = `${selected.length} files (${this.formatBytes(size)} / ${this.formatBytes(totalSizeAll)})`;
          toggleButton.textContent = selected.length === allFiles.length ? 'Select None' : 'Select All';
        };

        const renderNode = (node) => {
          const div = document.createElement('div');
          div.className = 'rd-tree-item';

          if (node.type === 'folder') {
            const fileCount = fileTree.getAllFiles(node).length;
            div.innerHTML = `<div class="rd-folder-header${node.checked?' selected':''}" data-path="${node.path}"><svg class="rd-folder-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z"></path></svg><span style="font-size:11px;width:16px">${node.expanded?'▼':'▶'}</span><input type="checkbox" class="rd-checkbox"${node.checked?' checked':''}${node.indeterminate?' style="indeterminate"':''}><span class="rd-folder-name">${node.name}</span><span class="rd-badge">${fileCount}</span></div><div class="rd-folder-children" style="display:${node.expanded?'block':'none'}"></div>`;

            if (node.indeterminate) {
              const checkbox = div.querySelector('.rd-checkbox');
              if (checkbox) checkbox.indeterminate = true;
            }

            const childrenContainer = div.querySelector('.rd-folder-children');

            const toggleExpand = (event) => {
              event.stopPropagation();
              node.expanded = !node.expanded;
              childrenContainer.style.display = node.expanded ? 'block' : 'none';
              div.querySelector('span').textContent = node.expanded ? '▼' : '▶';
              if (node.expanded && !childrenContainer.hasChildNodes()) {
                for (const child of node.children) childrenContainer.appendChild(renderNode(child));
              }
            };

            div.querySelector('.rd-checkbox').onclick = (event) => {
              event.stopPropagation();
            };

            div.querySelector('.rd-checkbox').onchange = (event) => {
              event.stopPropagation();
              const setAll = (nodeParameter, checkedValue) => {
                nodeParameter.checked = checkedValue;
                if (nodeParameter.children)
                  for (const child of nodeParameter.children) setAll(child, checkedValue);
              };
              setAll(node, event.target.checked);
              updateUI();
              if (node.expanded) {
                childrenContainer.innerHTML = '';
                for (const child of node.children) childrenContainer.appendChild(renderNode(child));
              }
            };

            div.querySelector('.rd-folder-header').onclick = toggleExpand;
            if (node.expanded) {
              for (const child of node.children) childrenContainer.appendChild(renderNode(child));
            }

          } else {
            div.innerHTML = `<div class="rd-file${node.checked?' selected':''}"><svg class="rd-file-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline></svg><input type="checkbox" class="rd-checkbox"${node.checked?' checked':''}><span class="rd-file-name">${node.name}</span><span class="rd-file-size">${this.formatBytes(node.bytes)}</span></div>`;
            div.onclick = (event) => {
              event.stopPropagation();
              if (event.target.type !== 'checkbox') {
                node.checked = !node.checked;
                div.querySelector('input').checked = node.checked;
              } else {
                node.checked = event.target.checked;
              }
              updateUI();
            };
          }
          return div;
        };

        for (const child of fileTree.root.children) {
          treeRoot.appendChild(renderNode(child));
        }

        updateUI();

        toggleButton.onclick = () => {
          const all = allFiles;
          const value = all.some(file => !file.checked);
          for (const file of all) file.checked = value;
          updateUI();
          treeRoot.innerHTML = '';
          for (const child of fileTree.root.children) {
            treeRoot.appendChild(renderNode(child));
          }
        };

        const close = (value) => {
          overlay.remove();
          resolve(value);
        };

        overlay.querySelector('#confirm').onclick = () => close(fileTree.getSelectedFiles());
        overlay.querySelector('#cancel').onclick = () => close(null);
        overlay.querySelector('.rd-close').onclick = () => close(null);
      });
    },

    showToast(message, type = 'info') {
      this.injectStyles();

      const existingToasts = document.querySelectorAll('.rd-toast');
      for (const toast of existingToasts) {
        toast.remove();
      }

      const toast = document.createElement('div');
      toast.className = `rd-toast ${type}`;

      const iconSvg = type === 'success' ? '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="flex-shrink:0;margin-top:2px"><path d="M22 11.08V12a10 10 0 11-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>' : type === 'error' ? '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="flex-shrink:0;margin-top:2px"><circle cx="12" cy="12" r="10"></circle><line x1="15" y1="9" x2="9" y2="15"></line><line x1="9" y1="9" x2="15" y2="15"></line></svg>' : '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="flex-shrink:0;margin-top:2px"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg>';

      toast.innerHTML = `<div style="display:flex;align-items:flex-start;gap:8px">${iconSvg}<div>${this.escapeHtml(message)}</div></div>`;

      document.body.appendChild(toast);
      setTimeout(() => {
        toast.style.animation = 'rd-toast-out 0.3s ease forwards';
        setTimeout(() => toast.remove(), 300);
      }, 4000);
    },

    setIconState(icon, state, torrentSupportEnabled = false) {
      const configs = { processing: { opacity: '0.5', cursor: 'wait', title: 'Processing...' }, added: { textContent: '✓', background: '#64cc2e', opacity: '1', cursor: 'default', title: 'Torrent successfully added to Real-Debrid' }, existing: { textContent: '✓', background: '#64cc2e', opacity: '1', cursor: 'not-allowed', title: 'Already in Real-Debrid library' }, default: { textContent: 'RD', background: '#3b82f6', opacity: '1', cursor: 'pointer', title: torrentSupportEnabled ? 'Click to send magnet to Real-Debrid, Alt+click to send torrent file' : 'Click to send magnet to Real-Debrid' } };
      icon.style.transition = 'all 0.2s';
      const config = configs[state] || configs.default;

      const { textContent, title, ...styles } = config;

      Object.assign(icon.style, styles);

      if (textContent) icon.textContent = textContent;
      if (title) icon.title = title;
    },

    createMagnetIcon(torrentSupportEnabled = false) {
      const icon = document.createElement('span');
      icon.className = 'rd-icon';
      icon.textContent = 'RD';
      icon.style.cssText = `cursor:pointer;display:inline-block;width:18px;height:18px;margin-left:6px;vertical-align:middle;border-radius:3px;background:#3b82f6;color:white;text-align:center;line-height:18px;font-size:11px;font-weight:bold;font-family:sans-serif;`;
      icon.setAttribute('data-rd-inserted', '1');
      icon.title = torrentSupportEnabled ? 'Click to send magnet to Real-Debrid, Alt+click to send torrent file' : 'Click to send magnet to Real-Debrid';
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
      const kilo = 1024;
      const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
      const index = Math.floor(Math.log(bytes) / Math.log(kilo));
      return parseFloat((bytes / Math.pow(kilo, index)).toFixed(2)) + ' ' + sizes[index];
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

    async _selectFiles(torrentId, files) {
      let selectedFileIds;
      if (this.#config.manualFileSelection) {
        if (files.length === 1) selectedFileIds = [files[0].id];
        else {
          selectedFileIds = await UIManager.createFileSelectionDialog(files);
          if (selectedFileIds === null) { await this.#realDebridApi.deleteTorrent(torrentId); throw new RealDebridError('File selection cancelled'); }
          if (!selectedFileIds.length) { await this.#realDebridApi.deleteTorrent(torrentId); throw new RealDebridError('No files selected'); }
        }
      } else {
        selectedFileIds = this.filterFiles(files).map(file => file.id);
        if (!selectedFileIds.length) { await this.#realDebridApi.deleteTorrent(torrentId); throw new RealDebridError('No matching files found after filtering'); }
      }
      logger.debug(`[File Selection] Selected files: ${selectedFileIds.map(id=>files.find(file=>file.id===id)?.path||`ID:${id}`).join(', ')}`);
      await this.#realDebridApi.selectFiles(torrentId, selectedFileIds.join(','));
      return selectedFileIds.length;
    }

    async processMagnetLink(magnetLink) {
      const hash = MagnetLinkProcessor.parseMagnetHash(magnetLink);
      if (!hash) throw new RealDebridError('Invalid magnet link');
      if (this.isTorrentExists(hash)) throw new RealDebridError('Torrent already exists on Real-Debrid');
      const addResult = await this.#realDebridApi.addMagnet(magnetLink);
      if (!addResult || typeof addResult.id === 'undefined') throw new RealDebridError(`Failed to add magnet: ${JSON.stringify(addResult)}`);
      const info = await this.#realDebridApi.getTorrentInfo(addResult.id);
      return this._selectFiles(addResult.id, Array.isArray(info.files) ? info.files : []);
    }

    async processTorrentLink(torrentUrl) {
      const torrentBlob = await this.fetchTorrentFile(torrentUrl);
      const addResult = await this.#realDebridApi.addTorrent(torrentBlob);
      if (!addResult || typeof addResult.id === 'undefined') throw new RealDebridError('Failed to add torrent');
      const info = await this.#realDebridApi.getTorrentInfo(addResult.id);
      return this._selectFiles(addResult.id, Array.isArray(info.files) ? info.files : []);
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
      this.initialMagnetLinkCount = 0;
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
      this.batchButton?.remove();
      this.batchButton = null;
    }

    async _processBatch() {
      const selectedUrls = [...this.selectedLinks];
      if (selectedUrls.length === 0) return;

      const isInitialized = await ensureApiInitialized();
      if (!isInitialized) {
        UIManager.showToast('Real-Debrid API key not configured. Use the menu to set it.', 'info');
        return;
      }
      const config = ConfigManager.getConfigSync();

      let successCount = 0;
      let errorCount = 0;

      for (let index = 0; index < selectedUrls.length; index++) {
        const url = selectedUrls[index];
        const key = this._magnetKeyFor(url);
        const iconContainers = this._iconsForKey(key);
        const icons = iconContainers.map(iconContainer => iconContainer.querySelector('.rd-icon') || iconContainer);

        UIManager.showToast(`Processing ${index + 1}/${selectedUrls.length} links...`, 'info');
        for (const icon of icons) {
          UIManager.setIconState(icon, 'processing', config.enableTorrentSupport);
        }

        try {
          await this.processor.processMagnetLink(url);
          successCount++;
          for (const icon of icons) {
            UIManager.setIconState(icon, 'added', config.enableTorrentSupport);
          }
        } catch (error) {
          errorCount++;
          for (const icon of icons) {
            UIManager.setIconState(icon, 'default', config.enableTorrentSupport);
          }
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

    _storeIconForKey(key, iconContainer) {
      if (!key || !iconContainer) return;
      const iconContainers = this.keyToIcon.get(key);
      if (!iconContainers) {
        this.keyToIcon.set(key, [iconContainer]);
        return;
      }
      if (!iconContainers.includes(iconContainer)) iconContainers.push(iconContainer);
    }

    _iconsForKey(key) {
      if (!key) return [];
      return this.keyToIcon.get(key) || [];
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
          UIManager.showToast(`Added to Real-Debrid - ${fileCount} file(s) selected`, 'success');
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

      if (this.initialMagnetLinkCount === 0 && links.length > 0) {
        const uniqueHashes = new Set();
        for (const link of links) {
          const hash = MagnetLinkProcessor.parseMagnetHash(link.href);
          if (hash) uniqueHashes.add(hash);
        }
        this.initialMagnetLinkCount = uniqueHashes.size;
      }

      const config = ConfigManager.getConfigSync();
      const torrentSupport = config.enableTorrentSupport;

      const newlyAddedKeys = [];
      for (const link of links) {
        if (!link.parentNode) continue;

        if (link.hasAttribute('data-rd-processed')) {
          const key = this._magnetKeyFor(link.href);
          // Find the icon - it might not be the immediate next sibling anymore
          const icon = link.parentNode.querySelector(`[${INSERTED_ICON_ATTR}]`);
          this._storeIconForKey(key, icon);
          continue;
        }

        const key = this._magnetKeyFor(link.href);

        const iconContainer = this._shouldShowBatchUI() ?
          UIManager.createMagnetIconWithCheckbox(torrentSupport) :
          UIManager.createMagnetIcon(torrentSupport);

        this._attach(iconContainer, link);
        link.parentNode.insertBefore(iconContainer, link.nextSibling);
        link.setAttribute('data-rd-processed', '1');
        const storeKey = key || `href:${link.href.trim().toLowerCase()}`;
        this._storeIconForKey(storeKey, iconContainer);
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
      const config = ConfigManager.getConfigSync();

      for (const [key, iconContainers] of this.keyToIcon.entries()) {
        if (!key.startsWith('hash:')) continue;
        const hash = key.split(':')[1];
        if (this.processor.isTorrentExists(hash)) {
          for (const iconContainer of iconContainers) {
            const icon = iconContainer.querySelector('.rd-icon') || iconContainer;
            UIManager.setIconState(icon, 'existing', config.enableTorrentSupport);
          }
        }
      }
    }

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

    const config = ConfigManager.getConfigSync();
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
      const config = ConfigManager.getConfigSync();
      logger = Logger('Magnet Link to Real-Debrid', { debug: config.debugEnabled });

      _integratorInstance = new PageIntegrator(null);
      _integratorInstance.addIconsTo();
      _integratorInstance.startObserving();

      GM_registerMenuCommand('Configure Real-Debrid Settings', () => {
        const currentConfig = ConfigManager.getConfigSync();
        UIManager.createConfigDialog(currentConfig);
      });
    } catch (error) {
      logger.error('[Initialization] Script initialization failed', error);
    }
  }

  init();

})();
