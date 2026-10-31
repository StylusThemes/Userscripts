// ==UserScript==
// @author       Journey Over
// @exclude      *
// ==UserLibrary==
// @name         @journeyover/mydublist
// @description  MyDubList client for checking multilingual anime dub availability
// @license      MIT
// @version      2.0.0
// @homepageURL  https://github.com/StylusThemes/Userscripts
// ==/UserLibrary==
// @connect      raw.githubusercontent.com
// @grant        GM_xmlhttpRequest
// ==/UserScript==

/**
 * MyDubList client for checking multilingual anime dub availability by MyAnimeList ID.
 *
 * Dub data © MyDubList - https://mydublist.com - CC BY 4.0
 * Source: https://github.com/Joelis57/MyDubList
 */
this.MyDubList = class {
  /**
   * Supported dub languages as display name / StaffLanguage value pairs.
   * `file` overrides the dataset file name when it differs from the lowercased value.
   * @type {Array<{name: string, value: string, file?: string}>}
   */
  static LANGUAGES = Object.freeze([
    { name: 'Arabic', value: 'ARABIC' },
    { name: 'Catalan', value: 'CATALAN' },
    { name: 'Chinese', value: 'CHINESE' },
    { name: 'Danish', value: 'DANISH' },
    { name: 'Dutch', value: 'DUTCH' },
    { name: 'English', value: 'ENGLISH' },
    { name: 'Finnish', value: 'FINNISH' },
    { name: 'French', value: 'FRENCH' },
    { name: 'German', value: 'GERMAN' },
    { name: 'Hebrew', value: 'HEBREW' },
    { name: 'Hindi', value: 'HINDI' },
    { name: 'Hungarian', value: 'HUNGARIAN' },
    { name: 'Indonesian', value: 'INDONESIAN' },
    { name: 'Italian', value: 'ITALIAN' },
    { name: 'Japanese', value: 'JAPANESE' },
    { name: 'Korean', value: 'KOREAN' },
    { name: 'Lithuanian', value: 'LITHUANIAN' },
    { name: 'Norwegian', value: 'NORWEGIAN' },
    { name: 'Polish', value: 'POLISH' },
    { name: 'Portuguese', value: 'PORTUGUESE' },
    { name: 'Russian', value: 'RUSSIAN' },
    { name: 'Spanish', value: 'SPANISH' },
    { name: 'Swedish', value: 'SWEDISH' },
    { name: 'Filipino', value: 'FILIPINO', file: 'tagalog' },
    { name: 'Thai', value: 'THAI' },
    { name: 'Turkish', value: 'TURKISH' },
    { name: 'Vietnamese', value: 'VIETNAMESE' }
  ]);

  /**
   * Supported confidence levels as display name / dataset value pairs.
   * @type {Array<{name: string, value: string}>}
   */
  static CONFIDENCES = Object.freeze([
    { name: 'Low', value: 'low' },
    { name: 'Normal', value: 'normal' },
    { name: 'High', value: 'high' },
    { name: 'Very High', value: 'very-high' }
  ]);

  /** Language used when none is given. */
  static DEFAULT_LANGUAGE = 'english';

  /** Confidence level used when none is given. */
  static DEFAULT_CONFIDENCE = 'normal';

  /** Request timeout in milliseconds. */
  static TIMEOUT_MS = 15_000;

  constructor() {
    this._baseUrl = 'https://raw.githubusercontent.com/Joelis57/MyDubList/main/dubs/confidence';
    this._cache = new Map();
    this._pending = new Map();
    this._generation = 0;
  }

  /**
   * Reduce a language or confidence name to its dataset slug.
   * @param {string} value Raw name such as 'Very High', 'very_high' or 'FILIPINO'.
   * @returns {string} Slug such as 'very-high' or 'filipino'.
   */
  static _slug(value) {
    return String(value ?? '')
      .trim()
      .toLowerCase()
      .replace(/[\s_]+/g, '-');
  }

  /**
   * Look up a supported language by value, display name or file name.
   * @param {string} language Language name, value or alias (case-insensitive).
   * @returns {{name: string, value: string, file?: string}|undefined} Matching entry.
   */
  _findLanguage(language) {
    const slug = this.constructor._slug(language);

    return this.constructor.LANGUAGES.find(entry =>
      slug === entry.value.toLowerCase() || slug === entry.file
    );
  }

  /**
   * Resolve a language to its dataset slug.
   * @param {string} [language] Language name, value or alias (case-insensitive).
   * @returns {string} Dataset slug, e.g. 'english' or 'tagalog'.
   */
  _resolveLanguage(language = this.constructor.DEFAULT_LANGUAGE) {
    const entry = this._findLanguage(language);
    if (entry) return entry.file ?? entry.value.toLowerCase();

    // Unknown but well-formed languages are allowed, so new upstream datasets
    // keep working without a release.
    const slug = this.constructor._slug(language);
    if (!/^[a-z][a-z-]*$/.test(slug)) {
      throw new Error(`Unsupported MyDubList language: ${language}`);
    }

    return slug;
  }

  /**
   * Resolve a confidence level to its dataset slug.
   * @param {string} [confidence] Confidence name or value (case-insensitive).
   * @returns {string} Dataset slug, e.g. 'normal' or 'very-high'.
   */
  _resolveConfidence(confidence = this.constructor.DEFAULT_CONFIDENCE) {
    const slug = this.constructor._slug(confidence).replace(/^veryhigh$/, 'very-high');

    if (!this.constructor.CONFIDENCES.some(entry => entry.value === slug)) {
      throw new Error(`Unsupported MyDubList confidence: ${confidence}`);
    }

    return slug;
  }

  /**
   * Normalize a MyAnimeList ID.
   * @param {number|string} id Raw MyAnimeList ID.
   * @returns {number} Positive integer ID.
   */
  _normalizeMalId(id) {
    const normalized = Number(id);
    if (!Number.isInteger(normalized) || normalized <= 0) {
      throw new Error(`Invalid MyAnimeList ID: ${id}`);
    }
    return normalized;
  }

  /**
   * Fetch a dataset body.
   * @param {string} url Dataset URL.
   * @returns {Promise<string>} Raw response text.
   */
  _get(url) {
    return new Promise((resolve, reject) => {
      GM_xmlhttpRequest({
        method: 'GET',
        url,
        timeout: this.constructor.TIMEOUT_MS,
        onload: response => {
          if (response.status !== 200) {
            reject(new Error(`MyDubList request failed with status ${response.status}`));
            return;
          }
          resolve(response.responseText);
        },
        onerror: () => reject(new Error('An error occurs while processing the MyDubList request')),
        ontimeout: () => reject(new Error('MyDubList request times out'))
      });
    });
  }

  /**
   * Parse a dataset body into a lookup set.
   * @param {string} text Raw response text.
   * @returns {{dubbed: Set<number>}} Dubbed MyAnimeList IDs.
   */
  _parse(text) {
    let payload;

    try {
      payload = JSON.parse(text);
    } catch {
      throw new Error('Failed to parse MyDubList response');
    }

    if (!Array.isArray(payload?.dubbed)) {
      throw new Error('Unexpected MyDubList response structure');
    }

    return { dubbed: new Set(payload.dubbed.map(Number)) };
  }

  /**
   * Load a dataset, reusing cached and in-flight requests.
   * @param {string} language Language name, value or alias (case-insensitive).
   * @param {string} confidence Confidence name or value (case-insensitive).
   * @returns {Promise<{dubbed: Set<number>}>} Dataset entry.
   */
  _load(language, confidence) {
    const resolvedLanguage = this._resolveLanguage(language);
    const resolvedConfidence = this._resolveConfidence(confidence);
    const key = `${resolvedLanguage}:${resolvedConfidence}`;

    const existing = this._cache.get(key) ?? this._pending.get(key);
    if (existing) return Promise.resolve(existing);

    const generation = this._generation;
    const request = this._get(`${this._baseUrl}/${resolvedConfidence}/dubbed_${resolvedLanguage}.json`)
      .then(text => this._parse(text))
      .then(entry => {
        if (generation === this._generation) this._cache.set(key, entry);
        return entry;
      })
      .finally(() => {
        if (this._pending.get(key) === request) this._pending.delete(key);
      });

    this._pending.set(key, request);
    return request;
  }

  /**
   * Check whether a title has a dub in the given language.
   * @param {number|string} id MyAnimeList ID.
   * @param {{language?: string, confidence?: string}} [options] Language and confidence overrides.
   * @returns {Promise<boolean>} True when a dub exists.
   */
  async isDubbed(id, { language, confidence } = {}) {
    const malId = this._normalizeMalId(id);
    const { dubbed } = await this._load(language, confidence);
    return dubbed.has(malId);
  }

  /**
   * Resolve a language to its display name, falling back to 'Dub'.
   * @param {string} language Language name, value, or alias (case-insensitive).
   * @returns {string} Display name from LANGUAGES, or 'Dub' when unknown.
   */
  languageName(language) {
    return this._findLanguage(language)?.name ?? 'Dub';
  }

  /**
   * Build the dub-exists label for a language.
   * @param {string} language Language name, value, or alias (case-insensitive).
   * @returns {string} Label such as 'English Dub Exists'.
   */
  formatDubLabel(language) {
    return `${this.languageName(language)} Dub Exists`;
  }

  clearCache() {
    this._generation++;
    this._cache.clear();
    this._pending.clear();
  }
};
