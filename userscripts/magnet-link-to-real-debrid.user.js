// ==UserScript==
// @name          Magnet Link to Real-Debrid
// @version       2.5.0
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

  const logger = Logger('Magnet Link to Real-Debrid', { debug: false });

  /* Constants & Utilities */
  const STORAGE_KEY = 'realDebridConfig';
  const API_BASE = 'https://api.real-debrid.com/rest/1.0';
  const ICON_SRC = 'https://fcdn.real-debrid.com/0830/favicons/favicon.ico';
  const INSERTED_ICON_ATTR = 'data-rd-inserted';
  const DEFAULTS = {
    apiKey: '',
    allowedExtensions: ['mp3', 'm4b', 'mp4', 'mkv', 'cbz', 'cbr'],
    filterKeywords: ['sample', 'bloopers', 'trailer'],
    manualFileSelection: false
  };

  /* Errors */
  class ConfigurationError extends Error {
    constructor(message) {
      super(message);
      this.name = 'ConfigurationError';
    }
  }

  class RealDebridError extends Error {
    constructor(message, statusCode = null) {
      super(message);
      this.name = 'RealDebridError';
      this.statusCode = statusCode;
    }
  }

  /* Config Manager */
  class ConfigManager {
    // Parse stored JSON safely, falling back to null on failure
    static _safeParse(value) {
      if (!value) return null;
      try {
        return typeof value === 'string' ? JSON.parse(value) : value;
      } catch (err) {
        logger.error('Config parse failed, resetting to defaults.', err);
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

    // Persist configuration; API key required
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
      return errors;
    }
  }

  /* Real-Debrid Service */
  class RealDebridService {
    #apiKey;

    // Cross-tab reservation settings
    static RATE_STORE_KEY = 'realDebrid_rate_counter';
    static RATE_LIMIT = 250; // max requests per 60s
    static RATE_HEADROOM = 5; // leave a small headroom
    static RATE_WINDOW_MS = 60 * 1000;

    static _sleep(ms) { return new Promise(res => setTimeout(res, ms)); }

    // Reserve a request slot across tabs using a simple counter + window stored in GM storage
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
          // start a fresh window and take slot 1
          const fresh = { windowStart: now, count: 1 };
          try {
            await GMC.setValue(key, JSON.stringify(fresh));
            return;
          } catch (e) {
            // retry
            attempt += 1;
            await RealDebridService._sleep(40 * attempt);
            continue;
          }
        }

        // existing window
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

        // window full, wait until it expires
        const earliest = obj.windowStart;
        const waitFor = Math.max(50, windowMs - (now - earliest) + 50);
        logger.warn(`Rate window full (${obj.count}/${RealDebridService.RATE_LIMIT}), waiting ${Math.round(waitFor)}ms`);
        await RealDebridService._sleep(waitFor);
        attempt += 1;
      }
      throw new Error('Failed to reserve request slot');
    }

    constructor(apiKey) {
      if (!apiKey) throw new ConfigurationError('API Key required');
      this.#apiKey = apiKey;
    }

    // Generic request wrapper: handles headers, encoding and JSON parsing/errors
    #request(method, endpoint, data = null) {
      const maxAttempts = 5;
      const baseDelay = 500; // ms
      // Rate reservation keys and limits
      if (!RealDebridService.RATE_STORE_KEY) RealDebridService.RATE_STORE_KEY = 'realDebrid_rate_counter';
      if (!RealDebridService.RATE_LIMIT) RealDebridService.RATE_LIMIT = 250;
      if (!RealDebridService.RATE_HEADROOM) RealDebridService.RATE_HEADROOM = 5; // keep a small headroom
      const attemptRequest = async (attempt) => {
        // Reserve a slot across tabs before making the request to avoid hitting the 1-minute cap
        try {
          await RealDebridService._reserveRequestSlot();
        } catch (err) {
          // reservation failures fallback to proceeding; the request wrapper still handles 429
          logger.error('Request slot reservation failed, proceeding (will rely on backoff)', err);
        }

        return new Promise((resolve, reject) => {
          const url = `${API_BASE}${endpoint}`;
          const payload = data ? new URLSearchParams(data).toString() : null;
          logger.debug('[RealDebridService] request', { method, url, data, attempt });

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
              logger.debug('[RealDebridService] response', { status: resp.status });

              if (!resp || typeof resp.status === 'undefined') {
                return reject(new RealDebridError('Invalid API response'));
              }
              if (resp.status < 200 || resp.status >= 300) {
                // handle rate limit specially with retry/backoff
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
                  logger.warn(`[RealDebridService] Rate limited (429). Retrying in ${Math.round(backoff)}ms (attempt ${attempt + 1}/${maxAttempts})`);
                  return setTimeout(() => {
                    attemptRequest(attempt + 1).then(resolve).catch(reject);
                  }, backoff);
                }
                const msg = resp.responseText ? resp.responseText : `HTTP ${resp.status}`;
                return reject(new RealDebridError(`API Error: ${msg}`, resp.status));
              }
              if (resp.status === 204 || !resp.responseText) return resolve({});
              try {
                const parsed = JSON.parse(resp.responseText.trim());
                return resolve(parsed);
              } catch (err) {
                logger.error('[RealDebridService] parse error', err);
                return reject(new RealDebridError(`Failed to parse API response: ${err.message}`, resp.status));
              }
            },
            onerror: (err) => {
              logger.error('[RealDebridService] Network request failed', err);
              return reject(new RealDebridError('Network request failed'));
            },
            ontimeout: () => {
              logger.warn('[RealDebridService] Request timed out');
              return reject(new RealDebridError('Request timed out'));
            }
          });
        });
      };

      return attemptRequest(0);
    }

    async addMagnet(magnet) {
      return this.#request('POST', '/torrents/addMagnet', {
        magnet
      });
    }

    async getTorrentInfo(torrentId) {
      return this.#request('GET', `/torrents/info/${torrentId}`);
    }

    async selectFiles(torrentId, filesCsv) {
      return this.#request('POST', `/torrents/selectFiles/${torrentId}`, {
        files: filesCsv
      });
    }

    async deleteTorrent(torrentId) {
      return this.#request('DELETE', `/torrents/delete/${torrentId}`);
    }

    async getExistingTorrents() {
      // Paginate through all torrents using limit/offset until empty or error
      const all = [];
      const limit = 2500; // page size
      let pageNum = 1;
      while (true) {
        try {
          logger.debug(`[RealDebridService] Fetching torrents page ${pageNum} (limit=${limit})`);
          const page = await this.#request('GET', `/torrents?page=${pageNum}&limit=${limit}`);
          if (!Array.isArray(page) || page.length === 0) {
            logger.warn(`[RealDebridService] No torrents returned for page ${pageNum}`);
            break;
          }
          all.push(...page);
          if (page.length < limit) {
            logger.debug(`[RealDebridService] Last page reached (${pageNum}) with ${page.length} items`);
            break;
          }
          pageNum += 1;
        } catch (err) {
          // If rate limited, propagate so caller can handle backoff; otherwise return what we have
          if (err instanceof RealDebridError && err.statusCode === 429) throw err;
          logger.error('[RealDebridService] Failed to fetch existing torrents page', err);
          break;
        }
      }
      logger.debug(`[RealDebridService] Fetched total ${all.length} existing torrents`);
      return all;
    }
  }

  /* Magnet Processing */
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
        logger.debug('[MagnetLinkProcessor] existing torrents', this.#existing);
      } catch (err) {
        logger.error('[MagnetLinkProcessor] Failed to load existing torrents', err);
        this.#existing = [];
      }
    }

    // Extract BTIH (hash) from magnet link
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

    // Filter torrent files by allowed extensions and filter keywords (supports regex-like /.../)
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
        chosen = await UIManager.createFileSelectionDialog(files);
        if (chosen === null) {
          await this.#api.deleteTorrent(torrentId);
          throw new RealDebridError('File selection cancelled');
        }
        if (!chosen.length) {
          await this.#api.deleteTorrent(torrentId);
          throw new RealDebridError('No files selected');
        }
      } else {
        chosen = this.filterFiles(files).map(f => f.id);
        if (!chosen.length) {
          await this.#api.deleteTorrent(torrentId);
          throw new RealDebridError('No matching files found after filtering');
        }
      }

      await this.#api.selectFiles(torrentId, chosen.join(','));
      return chosen.length;
    }
  }

  /* UI Manager */
  class UIManager {
    // Build and return modal dialog DOM. Caller must append it to document.
    static createConfigDialog(currentConfig) {
      const dialog = document.createElement('div');
      dialog.innerHTML = `
          <div style="position:fixed;inset:0;background:rgba(0,0,0,0.8);display:flex;align-items:center;justify-content:center;z-index:10000;font-family:Inter, system-ui, -apple-system, 'Segoe UI', Roboto, Arial;">
            <div role="dialog" aria-modal="true" style="background:#0f1724;color:#e6eef3;padding:24px;border-radius:12px;max-width:560px;width:94%;box-shadow:0 8px 30px rgba(2,6,23,0.6);border:1px solid rgba(255,255,255,0.04);">
              <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:18px;">
                <h2 style="margin:0;font-size:18px;color:#7dd3fc;">Real-Debrid Settings</h2>
                <button id="cancelBtnTop" aria-label="Close" style="background:transparent;border:none;color:#9fb7c8;cursor:pointer;font-size:18px;">✕</button>
              </div>

              <div style="display:grid;grid-template-columns:1fr;gap:12px;">
                <label style="font-weight:600;color:#cfeeff;">API Key
                  <input type="text" id="apiKey" placeholder="Enter your Real-Debrid API Key" value="${currentConfig.apiKey}"
                    style="width:100%;margin-top:6px;padding:10px;border-radius:8px;border:1px solid rgba(125,211,252,0.12);background:#051229;color:#e6eef3;font-size:13px;" />
                </label>

                <label style="font-weight:600;color:#cfeeff;">Allowed Extensions
                  <textarea id="extensions" placeholder="mp4,mkv,avi" style="width:100%;margin-top:6px;padding:10px;border-radius:8px;border:1px solid rgba(125,211,252,0.12);background:#051229;color:#e6eef3;font-size:13px;min-height:84px;">${currentConfig.allowedExtensions.join(',')}</textarea>
                  <small style="color:#96c5d8;display:block;margin-top:6px;">Comma-separated (e.g., mp4,mkv,avi)</small>
                </label>

                <label style="font-weight:600;color:#cfeeff;">Filter Keywords
                  <textarea id="keywords" placeholder="sample,/trailer/" style="width:100%;margin-top:6px;padding:10px;border-radius:8px;border:1px solid rgba(125,211,252,0.12);background:#051229;color:#e6eef3;font-size:13px;min-height:84px;">${currentConfig.filterKeywords.join(',')}</textarea>
                  <small style="color:#96c5d8;display:block;margin-top:6px;">Keywords or regex-like entries (comma-separated)</small>
                </label>

                <label style="display:flex;align-items:center;gap:8px;font-weight:600;color:#cfeeff;">
                  <input type="checkbox" id="manualFileSelection" ${currentConfig.manualFileSelection ? 'checked' : ''} style="margin:0;" />
                  Manual File Selection
                </label>
                <small style="color:#96c5d8;display:block;margin-top:6px;">When enabled, will show a file selection dialog for manual selection. Filtering options will be disabled.</small>
              </div>

              <div style="display:flex;justify-content:flex-end;gap:10px;margin-top:18px;">
                <button id="saveBtn" style="background:#06b6d4;color:#04202a;border:none;padding:10px 16px;border-radius:8px;cursor:pointer;font-weight:700;">Save</button>
                <button id="cancelBtn" style="background:transparent;color:#9fb7c8;border:1px solid rgba(159,183,200,0.08);padding:10px 16px;border-radius:8px;cursor:pointer;">Cancel</button>
              </div>
            </div>
          </div>
      `;

      const saveBtn = dialog.querySelector('#saveBtn');
      const cancelBtn = dialog.querySelector('#cancelBtn');

      // Handle manual file selection toggle
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
      toggleFiltering(); // initial state

      saveBtn.addEventListener('mouseover', () => saveBtn.style.background = '#2980b9');
      saveBtn.addEventListener('mouseout', () => saveBtn.style.background = '#4db6ac');

      cancelBtn.addEventListener('mouseover', () => cancelBtn.style.background = '#c0392b');
      cancelBtn.addEventListener('mouseout', () => cancelBtn.style.background = '#e57373');

      // ESC key handler: remove dialog on Escape
      const escHandler = (e) => {
        if (e.key === 'Escape') {
          if (dialog.parentNode) dialog.parentNode.removeChild(dialog);
          document.removeEventListener('keydown', escHandler);
        }
      };
      document.addEventListener('keydown', escHandler);
      dialog._escHandler = escHandler;

      return dialog;
    }

    static showToast(message, type = 'info') {
      const colors = {
        success: '#16a34a',
        error: '#dc2626',
        info: '#2563eb'
      };
      const msgDiv = document.createElement('div');
      Object.assign(msgDiv.style, {
        position: 'fixed',
        bottom: '20px',
        left: '20px',
        backgroundColor: colors[type] || colors.info,
        color: 'white',
        padding: '10px 14px',
        borderRadius: '8px',
        zIndex: 10000,
        fontWeight: '600'
      });
      msgDiv.textContent = message;
      document.body.appendChild(msgDiv);
      setTimeout(() => msgDiv.remove(), 8000);
    }

    static createMagnetIcon() {
      const icon = document.createElement('img');
      icon.src = ICON_SRC;
      icon.style.cursor = 'pointer';
      icon.style.width = '16px';
      icon.style.marginLeft = '5px';
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

    static createFileSelectionDialog(files) {
      return new Promise((resolve) => {
        const dialog = document.createElement('div');
        dialog.innerHTML = `
          <div style="position:fixed;inset:0;background:rgba(0,0,0,0.8);display:flex;align-items:center;justify-content:center;z-index:10001;font-family:Inter, system-ui, -apple-system, 'Segoe UI', Roboto, Arial;">
            <div role="dialog" aria-modal="true" style="background:#0f1724;color:#e6eef3;padding:24px;border-radius:12px;max-width:700px;width:94%;max-height:80vh;overflow-y:auto;box-shadow:0 8px 30px rgba(2,6,23,0.6);border:1px solid rgba(255,255,255,0.04);">
              <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:18px;">
                <h2 style="margin:0;font-size:18px;color:#7dd3fc;">Select Files to Add</h2>
                <button id="cancelBtnTop" aria-label="Close" style="background:transparent;border:none;color:#9fb7c8;cursor:pointer;font-size:18px;">✕</button>
              </div>

              <div style="display:flex;gap:10px;margin-bottom:12px;">
                <button id="selectAllBtn" style="background:#06b6d4;color:#04202a;border:none;padding:8px 12px;border-radius:6px;cursor:pointer;font-weight:600;">Select All</button>
                <button id="selectNoneBtn" style="background:#374151;color:#e6eef3;border:none;padding:8px 12px;border-radius:6px;cursor:pointer;">Select None</button>
              </div>

              <div id="filesList" style="max-height:400px;overflow-y:auto;margin-bottom:18px;">
                ${files.map(file => `
                  <label style="display:flex;align-items:center;gap:8px;padding:8px 0;border-bottom:1px solid rgba(255,255,255,0.05);">
                    <input type="checkbox" value="${file.id}" style="margin:0;" />
                    <span style="flex:1;color:#cfeeff;">${file.path}</span>
                    <span style="color:#96c5d8;font-size:12px;">${UIManager.formatBytes(file.bytes)}</span>
                  </label>
                `).join('')}
              </div>

              <div style="display:flex;justify-content:flex-end;gap:10px;">
                <button id="okBtn" style="background:#16a34a;color:white;border:none;padding:10px 16px;border-radius:8px;cursor:pointer;font-weight:700;">Add Selected</button>
                <button id="cancelBtn" style="background:transparent;color:#9fb7c8;border:1px solid rgba(159,183,200,0.08);padding:10px 16px;border-radius:8px;cursor:pointer;">Cancel</button>
              </div>
            </div>
          </div>
        `;

        const selectAllBtn = dialog.querySelector('#selectAllBtn');
        const selectNoneBtn = dialog.querySelector('#selectNoneBtn');
        const okBtn = dialog.querySelector('#okBtn');
        const cancelBtn = dialog.querySelector('#cancelBtn');
        const checkboxes = dialog.querySelectorAll('input[type="checkbox"]');

        selectAllBtn.addEventListener('click', () => checkboxes.forEach(cb => cb.checked = true));
        selectNoneBtn.addEventListener('click', () => checkboxes.forEach(cb => cb.checked = false));

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
          const selected = Array.from(checkboxes).filter(cb => cb.checked).map(cb => parseInt(cb.value));
          close();
          resolve(selected);
        });

        cancelBtn.addEventListener('click', () => {
          close();
          resolve(null);
        });
        const cancelTop = dialog.querySelector('#cancelBtnTop');
        if (cancelTop) cancelTop.addEventListener('click', () => {
          close();
          resolve(null);
        });

        document.body.appendChild(dialog);
      });
    }
  }

  /* Page Integration: find magnet links & insert icons (one icon per unique magnet) */
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

    _markIconAsExisting(icon, type) {
      icon.title = type === 'existing' ? 'Already on Real-Debrid' : 'Added to Real-Debrid';
      icon.style.filter = 'grayscale(100%)';
      icon.style.opacity = '0.65';
    }

    // Attach click behavior to the icon: lazily initializes API and processes magnet
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
          this._markIconAsExisting(icon, 'existing');
          return;
        }

        try {
          const count = await this.processor.processMagnetLink(link.href);
          UIManager.showToast(`Added to Real-Debrid — ${count} file(s) selected`, 'success');
          this._markIconAsExisting(icon, 'added');
        } catch (err) {
          UIManager.showToast(err?.message || 'Failed to process magnet', 'error');
          logger.error(err);
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
          this._markIconAsExisting(icon, 'existing');
        }
      }
    }


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

  /* Lazy API initialization - only when needed; cached promise so it runs once */
  let _apiInitPromise = null;
  let _realDebridService = null;
  let _magnetProcessor = null;
  let _integratorInstance = null;

  async function ensureApiInitialized() {
    if (_apiInitPromise) return _apiInitPromise;
    // Do not initialize API if page doesn't contain magnet links
    try {
      if (!document.querySelector || !document.querySelector('a[href^="magnet:"]')) {
        return Promise.resolve(false);
      }
    } catch (err) {
      // If DOM access fails, continue with init to be safe
    }

    const cfg = await ConfigManager.getConfig();
    if (!cfg.apiKey) {
      return Promise.resolve(false);
    }

    try {
      _realDebridService = new RealDebridService(cfg.apiKey);
    } catch (err) {
      logger.warn('RealDebridService not created:', err);
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
        logger.warn('Failed to initialize Real-Debrid integration', err);
        return false;
      });

    return _apiInitPromise;
  }

  /* Initialization & Menu */
  async function init() {
    try {
      _integratorInstance = new PageIntegrator(null);
      _integratorInstance.addIconsTo();
      _integratorInstance.startObserving();

      GMC.registerMenuCommand('Configure Real-Debrid Settings', async () => {
        const currentCfg = await ConfigManager.getConfig();
        const dialog = UIManager.createConfigDialog(currentCfg);
        document.body.appendChild(dialog);

        const saveBtn = dialog.querySelector('#saveBtn');
        const cancelBtn = dialog.querySelector('#cancelBtn');

        saveBtn.addEventListener('click', async () => {
          const newCfg = {
            apiKey: dialog.querySelector('#apiKey').value.trim(),
            allowedExtensions: dialog.querySelector('#extensions').value.split(',').map(e => e.trim()).filter(Boolean),
            filterKeywords: dialog.querySelector('#keywords').value.split(',').map(k => k.trim()).filter(Boolean),
            manualFileSelection: dialog.querySelector('#manualFileSelection').checked
          };
          try {
            await ConfigManager.saveConfig(newCfg);
            if (dialog.parentNode) document.body.removeChild(dialog);
            if (dialog._escHandler) document.removeEventListener('keydown', dialog._escHandler);
            UIManager.showToast('Configuration saved successfully!', 'success');
            location.reload();
          } catch (error) {
            UIManager.showToast(error.message, 'error');
          }
        });

        const cancelTop = dialog.querySelector('#cancelBtnTop');
        const doClose = () => {
          if (dialog.parentNode) document.body.removeChild(dialog);
          if (dialog._escHandler) document.removeEventListener('keydown', dialog._escHandler);
        };

        cancelBtn.addEventListener('click', doClose);
        if (cancelTop) cancelTop.addEventListener('click', doClose);

        const apiInput = dialog.querySelector('#apiKey');
        if (apiInput) apiInput.focus();
      });
    } catch (err) {
      logger.error('Initialization failed:', err);
    }
  }

  // Run immediately
  init();

})();
