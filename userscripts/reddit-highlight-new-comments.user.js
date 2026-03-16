// ==UserScript==
// @name          Reddit highlight new comments
// @version       1.0.0
// @description   Highlights new comments since your last visit
// @author        Journey Over
// @license       MIT
// @match         *://*.reddit.com/r/*/comments/*/*
// @require       https://cdn.jsdelivr.net/gh/bgrins/TinyColor@13851a7f4950040d9ad8557c3a92d9f4d8d02843/tinycolor.min.js
// @require       https://cdn.jsdelivr.net/gh/StylusThemes/Userscripts@0171b6b6f24caea737beafbc2a8dacd220b729d8/libs/utils/utils.min.js
// @grant         GM_setValue
// @grant         GM_getValue
// @grant         GM_addStyle
// @icon          https://www.google.com/s2/favicons?sz=64&domain=reddit.com
// @homepageURL   https://github.com/StylusThemes/Userscripts
// @downloadURL   https://github.com/StylusThemes/Userscripts/raw/main/userscripts/reddit-highlight-new-comments.user.js
// @updateURL     https://github.com/StylusThemes/Userscripts/raw/main/userscripts/reddit-highlight-new-comments.user.js
// ==/UserScript==

'use strict';

/* global tinycolor */

const logger = Logger('Reddit Highlight New Comments', { debug: false });

const HNC = {
  init() {
    if (!document.getElementById('siteTable')) return;

    const threadElement = document.querySelector('#siteTable .thing.link');
    if (!threadElement) return;

    let thread = threadElement.getAttribute('data-fullname');
    if (!thread) {
      const match = threadElement.className.match(/id-(t3_[^ ]+)/);
      if (!match) return;
      thread = match[1];
    }

    const now = Date.now();
    this.config = this.cfg.load();
    this.clear_history();

    if (!this.config.history[thread]) {
      this.config.history[thread] = [];
    }

    this.config.history[thread].unshift(now);

    if (!document.getElementById('noresults')) {
      if (this.config.history[thread].length > 1) {
        this.highlight(this.config.history[thread][1]);
        this.ui.create_comment_highlighter(this.config.history[thread]);
        this.ui.create_config_dialog();
        GM_addStyle(this.data.config_style);
      }
    }

    this.cfg.save();
  },

  highlight(since) {
    const comments = document.getElementsByClassName('comment');
    let username;

    if (document.body.classList.contains('loggedin')) {
      const userElement = document.getElementsByClassName('user')[0];
      if (userElement && userElement.firstElementChild) {
        username = userElement.firstElementChild.textContent;
      }
    }

    for (const comment of comments) {
      if (comment.classList.contains('deleted') || comment.classList.contains('spam')) continue;

      const authorElement = comment.getElementsByClassName('author')[0];
      if (!authorElement) continue;

      const author = authorElement.textContent;
      if (username && username === author) continue;

      const tagline = comment.getElementsByClassName('tagline')[0];
      if (!tagline) continue;

      const times = tagline.getElementsByTagName('time');
      if (!times.length) continue;

      const timeIndex = this.config.prefer_edited_time ? times.length - 1 : 0;
      const time = Date.parse(times[timeIndex].getAttribute('datetime'));

      if (time > since) {
        comment.classList.add('hnc_new');

        const elements = {
          'comment': comment,
          'text': comment.getElementsByClassName('usertext-body')[0]?.firstElementChild,
          'time': comment.getElementsByClassName('live-timestamp')[0] || times[0],
        };

        if (elements[this.config.apply_on]) {
          elements[this.config.apply_on].setAttribute('style', this.generate_comment_style(time, since));
        }
      }
    }
  },

  reset_highlighting() {
    const comments = document.getElementsByClassName('hnc_new');

    for (let index = comments.length - 1; index >= 0; index--) {
      const comment = comments[index];
      comment.classList.remove('hnc_new');

      const elements = {
        'comment': comment,
        'text': comment.getElementsByClassName('usertext-body')[0]?.firstElementChild,
        'time': comment.getElementsByTagName('time')[0],
      };

      for (const key in elements) {
        if (elements[key]) {
          elements[key].removeAttribute('style');
        }
      }
    }
  },

  clear_history() {
    const now = Date.now();
    const expiration = this.config.history_expiration * 24 * 60 * 60 * 1000;

    for (const thread in this.config.history) {
      const visits = this.config.history[thread];

      for (let index = 0; index < visits.length; index++) {
        if (now - visits[index] > expiration) {
          this.config.history[thread].splice(index);
          if (!this.config.history[thread].length) {
            delete this.config.history[thread];
          }
        }
      }
    }
  },

  generate_comment_style(comment_time, since) {
    let style = this.config.comment_style;
    style = style.replace(/\s+/g, ' ');
    style = style.replace(/%color/g, this.get_color(Date.now() - comment_time, Date.now() - since));
    return style;
  },

  get_color(comment_age, highlighting_since) {
    if (!this.config.use_color_gradient) return this.config.color_newer;
    if (comment_age > highlighting_since - 1) return this.config.color_older;

    const time_diff = 1 - comment_age / highlighting_since;
    const color_newer = tinycolor(this.config.color_newer).toHsl();
    const color_older = tinycolor(this.config.color_older).toHsl();

    const a_newer = color_newer.a !== undefined ? color_newer.a : 1;
    const a_older = color_older.a !== undefined ? color_older.a : 1;

    const color_final = tinycolor({
      h: color_older.h + (color_newer.h - color_older.h) * time_diff,
      s: color_older.s + (color_newer.s - color_older.s) * time_diff,
      l: color_older.l + (color_newer.l - color_older.l) * time_diff,
      a: a_older + (a_newer - a_older) * time_diff
    });

    return color_final.toHslString();
  },
};

HNC.ui = {
  create_comment_highlighter(visits) {
    const highlighter = document.createElement('div');
    highlighter.innerHTML = HNC.data.comment_highlighter;

    highlighter.classList.add('rounded', 'comment-visits-box', 'hnc-toolbar');
    if (HNC.config.dark_mode) {
      highlighter.classList.add('hnc-dark-mode');
    } else {
      highlighter.classList.add('hnc-light-mode');
    }

    const commentarea = document.getElementsByClassName('commentarea')[0];
    if (!commentarea) return;

    const sitetable = commentarea.getElementsByClassName('sitetable')[0];
    if (!sitetable || !sitetable.firstChild) return;

    const comment_margin = window.getComputedStyle(sitetable.firstChild).getPropertyValue('margin-left');
    const existing_highlighter = document.getElementsByClassName('comment-visits-box')[0];

    if (existing_highlighter && !existing_highlighter.classList.contains('hnc-toolbar')) {
      existing_highlighter.parentNode.removeChild(existing_highlighter);
    }

    highlighter.style.setProperty('margin-left', comment_margin);
    sitetable.before(highlighter);

    const select = document.getElementById('comment-visits');
    const seenLabels = new Set();

    for (const visit of visits) {
      const label = time_ago(visit);

      if (seenLabels.has(label)) continue;
      seenLabels.add(label);

      const option = document.createElement('option');
      option.textContent = label;
      option.value = visit;
      select.appendChild(option);
    }

    if (visits.length > 1 && select.children[3]) {
      select.children[3].setAttribute('selected', '');
    }

    select.addEventListener('change', this.update_highlighting.bind(this));

    const custom = document.getElementById('hnc_custom_visit');
    custom.style.setProperty('width', `${select.getBoundingClientRect().width}px`);
    custom.addEventListener('keydown', this.custom_visit_key_monitor.bind(this));
    custom.addEventListener('blur', this.set_custom_visit.bind(this));

    this.custom_pos = 0;

    const config_button = document.getElementById('hnc_config_icon');
    config_button.innerHTML = HNC.data.gear_icon;
    config_button.addEventListener('click', this.show_config_dialog.bind(this));
  },

  update_highlighting(event) {
    if (event.target.value === '') {
      HNC.reset_highlighting();
    } else if (event.target.value === 'custom') {
      document.getElementById('comment-visits').style.setProperty('display', 'none');
      const custom = document.getElementById('hnc_custom_visit');
      custom.style.removeProperty('display');
      custom.focus();
      custom.setSelectionRange(0, 2);
    } else {
      HNC.reset_highlighting();
      HNC.highlight(parseInt(event.target.value, 10));
    }
  },

  custom_visit_key_monitor(event) {
    if (event.altKey || event.ctrlKey || (event.shiftKey && event.key !== 'Tab')) return;

    if (event.key === 'Tab') {
      const match = event.target.value.match(/^(\d+?:)\d+?$/);
      if (match) {
        event.shiftKey ? this.custom_pos-- : this.custom_pos++;
        if (this.custom_pos % 2 === 0) {
          event.target.setSelectionRange(0, match[1].length - 1);
        } else {
          event.target.setSelectionRange(match[1].length, match[0].length);
        }
        event.preventDefault();
        event.stopPropagation();
      }
    } else if (event.key === 'Enter') {
      event.target.blur();
      event.preventDefault();
      event.stopPropagation();
    }
  },

  set_custom_visit(event) {
    const select = document.getElementById('comment-visits');
    const match = event.target.value.match(/^(\d+?):(\d+?)$/);

    if (match) {
      const option = document.createElement('option');
      const hours = parseInt(match[1], 10);
      const minutes = parseInt(match[2], 10);
      const visit = Date.now() - (hours * 60 + minutes) * 60 * 1000;

      option.value = visit;
      option.textContent = time_ago(visit);

      select.add(option, 2);
      select.selectedIndex = 2;
    } else {
      select.selectedIndex = 0;
    }

    select.dispatchEvent(new Event('change'));
    event.target.value = '00:00';
    event.target.style.setProperty('display', 'none');
    select.style.removeProperty('display');
  },

  create_config_dialog() {
    const wrapper = document.createElement('div');
    document.body.appendChild(wrapper);
    wrapper.id = 'hnc_dialog_wrapper';
    wrapper.innerHTML = HNC.data.config_dialog;

    if (HNC.config.dark_mode) wrapper.classList.add('hnc-dark-mode');

    const comment_preview = document.getElementById('hnc_comment_preview');
    const first_comment_source = document.getElementsByClassName('comment')[0];

    if (first_comment_source) {
      const first_comment = first_comment_source.cloneNode(true);
      const childContainer = first_comment.getElementsByClassName('child')[0];
      if (childContainer) first_comment.removeChild(childContainer);
      first_comment.style.setProperty('margin-left', '0');
      comment_preview.appendChild(first_comment);
    }

    wrapper.style.setProperty('display', 'none');
    wrapper.addEventListener('click', this.hide_config_dialog.bind(this));

    this.load_config_values();
    this.add_listeners();
  },

  show_config_dialog() {
    document.getElementById('hnc_dialog_wrapper').style.removeProperty('display');
  },

  hide_config_dialog(event) {
    if (event.target.id !== 'hnc_dialog_wrapper' && event.target.id !== 'hnc_close_button') return;

    document.getElementById('hnc_dialog_wrapper').style.setProperty('display', 'none');
    HNC.reset_highlighting();

    const selectValue = document.getElementById('comment-visits').value;
    if (selectValue) {
      HNC.highlight(parseInt(selectValue, 10));
    }

    if (event.target.id === 'hnc_close_button') {
      HNC.cfg.save();
    }
  },

  load_config_values() {
    const dialog_settings = document.getElementsByClassName('hnc_setting');

    for (const element of dialog_settings) {
      const name = element.id.slice(4);

      if (element.tagName === 'INPUT' && element.type === 'checkbox') {
        element.checked = HNC.config[name];
        if (element.dataset.disable) {
          document.getElementById(element.dataset.disable).disabled = !element.checked;
        }
      } else {
        element.value = HNC.config[name] || '';
      }
    }
    this.update_preview();
  },

  add_listeners() {
    const dialog_settings = document.getElementsByClassName('hnc_setting');

    for (const element of dialog_settings) {
      element.addEventListener('change', this.setting_change.bind(this));
      if (element.tagName === 'INPUT' && element.type === 'text' || element.tagName === 'TEXTAREA') {
        element.addEventListener('input', this.setting_change.bind(this));
      }
    }

    document.getElementById('hnc_clear_history_button').addEventListener('click', this.clear_all_history.bind(this));
    document.getElementById('hnc_reset_button').addEventListener('click', this.reset_config.bind(this));
    document.getElementById('hnc_close_button').addEventListener('click', this.hide_config_dialog.bind(this));
  },

  setting_change(event) {
    const name = event.target.id.slice(4);

    if (event.target.tagName === 'INPUT' && event.target.type === 'text' && !event.target.validity.valid) {
      if (event.type === 'change') {
        event.target.value = HNC.config[name];
      }
      return;
    }

    if (event.target.tagName === 'INPUT' && event.target.type === 'checkbox') {
      HNC.config[name] = event.target.checked;

      if (name === 'dark_mode') {
        document.getElementById('hnc_dialog_wrapper').classList.toggle('hnc-dark-mode', event.target.checked);

        const toolbar = document.querySelector('.hnc-toolbar');
        if (toolbar) {
          toolbar.classList.toggle('hnc-dark-mode', event.target.checked);
          toolbar.classList.toggle('hnc-light-mode', !event.target.checked);
        }
      }
      if (event.target.dataset.disable) {
        document.getElementById(event.target.dataset.disable).disabled = !event.target.checked;
      }
    } else {
      HNC.config[name] = event.target.value;
    }

    this.update_preview();
  },

  reset_config() {
    const history = HNC.config.history;
    HNC.config = HNC.cfg.default();
    HNC.config.history = history;

    document.getElementById('hnc_dialog_wrapper').classList.toggle('hnc-dark-mode', HNC.config.dark_mode);

    const toolbar = document.querySelector('.hnc-toolbar');
    if (toolbar) {
      toolbar.classList.toggle('hnc-dark-mode', HNC.config.dark_mode);
      toolbar.classList.toggle('hnc-light-mode', !HNC.config.dark_mode);
    }

    this.load_config_values();
  },

  clear_all_history() {
    HNC.config.history = {};
    alert('History cleared.');
  },

  update_preview() {
    const previewContainer = document.getElementById('hnc_comment_preview');
    if (!previewContainer.firstElementChild) return;

    const preview = previewContainer.firstElementChild;
    const elements = {
      'comment': preview,
      'text': preview.getElementsByClassName('usertext-body')[0]?.firstElementChild,
      'time': preview.getElementsByClassName('live-timestamp')[0] || preview.getElementsByTagName('time')[0],
    };

    for (const key in elements) {
      if (elements[key]) elements[key].removeAttribute('style');
    }

    if (elements.time) {
      const comment_age = Date.parse(elements.time.getAttribute('dateTime'));
      const double_comment_age = comment_age - (Date.now() - comment_age) * 2;

      if (elements[HNC.config.apply_on]) {
        elements[HNC.config.apply_on].setAttribute('style', HNC.generate_comment_style(comment_age, double_comment_age));
      }
    }
  },
};

HNC.data = {
  gear_icon: `<svg viewBox="0 0 24 24" fill="currentColor" width="16" height="16" style="vertical-align: middle;"><path d="M19.14,12.94c0.04-0.3,0.06-0.61,0.06-0.94c0-0.32-0.02-0.64-0.06-0.94l2.03-1.58c0.18-0.14,0.23-0.41,0.12-0.61 l-1.92-3.32c-0.12-0.22-0.37-0.29-0.59-0.22l-2.39,0.96c-0.5-0.38-1.03-0.7-1.62-0.94L14.4,2.81c-0.04-0.24-0.24-0.41-0.48-0.41 h-3.84c-0.24,0-0.43,0.17-0.47,0.41L9.25,5.35C8.66,5.59,8.12,5.92,7.63,6.29L5.24,5.33c-0.22-0.08-0.47,0-0.59,0.22L2.73,8.87 C2.62,9.08,2.66,9.34,2.86,9.48l2.03,1.58C4.84,11.36,4.8,11.69,4.8,12s0.02,0.64,0.06,0.94l-2.03,1.58 c-0.18,0.14-0.23,0.41-0.12,0.61l1.92,3.32c0.12,0.22,0.37,0.29,0.59,0.22l2.39-0.96c0.5,0.38,1.03,0.7,1.62,0.94l0.36,2.54 c0.05,0.24,0.24,0.41,0.48,0.41h3.84c0.24,0,0.43-0.17,0.47-0.41l0.36-2.54c0.59-0.24,1.13-0.56,1.62-0.94l2.39,0.96 c0.22,0.08,0.47,0,0.59-0.22l1.92-3.32c0.12-0.22,0.07-0.49-0.12-0.61L19.14,12.94z M12,15.6c-1.98,0-3.6-1.62-3.6-3.6 s1.62-3.6,3.6-3.6s3.6,1.62,3.6,3.6S13.98,15.6,12,15.6z"/></svg>`,

  comment_highlighter: `
        <div class="title" style="display: flex; align-items: center; gap: 8px;">
            <span>Highlight comments since:</span>
            <select id="comment-visits" class="hnc-input">
                <option value="">no highlighting</option>
                <option value="custom">custom</option>
            </select>
            <input id="hnc_custom_visit" class="hnc-input" type="text" value="00:00" pattern="\\d+?:\\d+?" style="display: none;" />
            <span id="hnc_config_icon" title="Settings" style="cursor: pointer; padding: 4px; border-radius: 4px; opacity: 0.7;"></span>
        </div>
    `,

  config_dialog: `
        <div id="hnc_dialog">
            <div class="hnc-dialog-header">
                <h2>Highlight New Comments</h2>
                <label class="hnc-toggle"><input id="hnc_dark_mode" class="hnc_setting" type="checkbox"> Night Mode</label>
            </div>

            <div class="hnc-section">
                <label class="hnc-checkbox-label">
                    <input id="hnc_prefer_edited_time" class="hnc_setting" type="checkbox">
                    Highlight edited comments
                </label>
            </div>

            <div class="hnc-section">
                <div class="hnc-flex-column">
                    <div class="hnc-flex-row">
                        <label class="hnc_fixed_width" for="hnc_history_expiration">Keep history for (days)</label>
                        <input type="number" id="hnc_history_expiration" class="hnc_setting hnc-input" min="1" max="9999">
                    </div>
                    <small style="color: var(--hnc-text-muted); margin-top: 4px;">Higher values may increase browser storage usage.</small>
                </div>
            </div>

            <hr />

            <div class="hnc-section">
                <label class="hnc-checkbox-label" style="margin-bottom: 12px;">
                    <input type="checkbox" id="hnc_use_color_gradient" class="hnc_setting" data-disable="hnc_color_older">
                    Use time based color gradient
                </label>
                <div class="hnc-flex-row">
                    <label class="hnc_fixed_width" for="hnc_color_newer">Newer comments color</label>
                    <input type="text" id="hnc_color_newer" class="hnc_setting hnc-input" title="Supported formats: #80bfff, rgba(128, 191, 255, 0.25), hsla(210, 100%, 55%, 0.25)" pattern="(#(?:[\\da-fA-F]{3}){1,2}|rgb\\((?:\\d{1,3},\\s*){2}\\d{1,3}\\)|rgba\\((?:\\d{1,3},\\s*){3}\\d*\\.?\\d+\\)|hsl\\(\\d{1,3}(?:,\\s*\\d{1,3}%){2}\\)|hsla\\(\\d{1,3}(?:,\\s*\\d{1,3}%){2},\\s*\\d*\\.?\\d+\\))">
                </div>
                <div class="hnc-flex-row">
                    <label class="hnc_fixed_width" for="hnc_color_older">Older comments color</label>
                    <input type="text" id="hnc_color_older" class="hnc_setting hnc-input" title="Supported formats: #cce5ff, rgba(204, 229, 255, 0.05), hsla(210, 100%, 55%, 0.05)" pattern="(#(?:[\\da-fA-F]{3}){1,2}|rgb\\((?:\\d{1,3},\\s*){2}\\d{1,3}\\)|rgba\\((?:\\d{1,3},\\s*){3}\\d*\\.?\\d+\\)|hsl\\(\\d{1,3}(?:,\\s*\\d{1,3}%){2}\\)|hsla\\(\\d{1,3}(?:,\\s*\\d{1,3}%){2},\\s*\\d*\\.?\\d+\\))">
                </div>
            </div>

            <hr />

            <div class="hnc-section">
                <div class="hnc-flex-row">
                    <label class="hnc_fixed_width" for="hnc_apply_on">Apply styles on</label>
                    <select id="hnc_apply_on" class="hnc_setting hnc-input">
                        <option>text</option>
                        <option>comment</option>
                        <option>time</option>
                    </select>
                </div>
                <div class="hnc-flex-column" style="margin-top: 12px;">
                    <label for="hnc_comment_style">CSS Comment Style</label>
                    <textarea id="hnc_comment_style" class="hnc_setting hnc-input"></textarea>
                </div>
            </div>

            <hr />

            <div class="hnc-section">
                <label>Live Preview</label>
                <div id="hnc_comment_preview" style="margin-top: 10px; padding: 10px; border-radius: 4px; border: 1px solid var(--hnc-border);"></div>
            </div>

            <div class="hnc-dialog-footer">
                <button id="hnc_clear_history_button" class="hnc-btn hnc-btn-danger">Clear History</button>
                <div style="flex-grow: 1;"></div>
                <button id="hnc_reset_button" class="hnc-btn hnc-btn-secondary">Reset to Defaults</button>
                <button id="hnc_close_button" class="hnc-btn hnc-btn-primary">Save & Close</button>
            </div>
        </div>
    `,

  config_style: `
        /* Main Toolbar Styling */
        .hnc-toolbar {
            padding: 8px 12px;
            margin-bottom: 12px;
            border-radius: 4px;
            font-size: 13px;
            display: inline-block;
        }

        .hnc-toolbar.hnc-dark-mode {
            background-color: #1a1a1b;
            color: #d7dadc;
            border: 1px solid #343536;
        }

        .hnc-toolbar.hnc-light-mode {
            background-color: #f6f7f8;
            color: #1c1c1c;
            border: 1px solid #ccc;
        }

        .hnc-toolbar select.hnc-input,
        .hnc-toolbar input.hnc-input {
            padding: 4px 6px;
            border-radius: 4px;
            font-size: 13px;
            outline: none;
        }

        .hnc-toolbar.hnc-dark-mode select.hnc-input,
        .hnc-toolbar.hnc-dark-mode input.hnc-input {
            background-color: #272729;
            color: #d7dadc;
            border: 1px solid #4a4a4b;
        }

        .hnc-toolbar.hnc-dark-mode select.hnc-input option {
            background-color: #272729;
            color: #d7dadc;
        }

        .hnc-toolbar.hnc-light-mode select.hnc-input,
        .hnc-toolbar.hnc-light-mode input.hnc-input {
            background-color: #ffffff;
            color: #333333;
            border: 1px solid #cccccc;
        }

        /* Settings Dialog Styling */
        #hnc_dialog_wrapper {
            /* Light Theme Variables */
            --hnc-bg: #ffffff;
            --hnc-text: #333333;
            --hnc-text-muted: #666666;
            --hnc-border: #e0e0e0;
            --hnc-input-bg: #f9f9f9;
            --hnc-input-border: #cccccc;
            --hnc-overlay: rgba(0, 0, 0, 0.5);
            --hnc-btn-text: #333;
            --hnc-btn-bg: #e5e5e5;
            --hnc-btn-hover: #d5d5d5;
            --hnc-primary: #0079D3;
            --hnc-primary-hover: #005a9e;
            --hnc-danger: #d93a00;

            display: flex;
            justify-content: center;
            align-items: center;
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            z-index: 2147483647;
            background-color: var(--hnc-overlay);
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
            font-size: 13px;
            backdrop-filter: blur(2px);
        }

        #hnc_dialog_wrapper.hnc-dark-mode {
            /* Dark Theme Variables */
            --hnc-bg: #1a1a1b;
            --hnc-text: #d7dadc;
            --hnc-text-muted: #818384;
            --hnc-border: #343536;
            --hnc-input-bg: #272729;
            --hnc-input-border: #4a4a4b;
            --hnc-overlay: rgba(0, 0, 0, 0.7);
            --hnc-btn-text: #d7dadc;
            --hnc-btn-bg: #343536;
            --hnc-btn-hover: #4a4a4b;
        }

        #hnc_dialog {
            background-color: var(--hnc-bg);
            color: var(--hnc-text);
            padding: 24px;
            width: 600px;
            max-width: 90vw;
            max-height: 90vh;
            overflow-y: auto;
            border-radius: 8px;
            box-shadow: 0 4px 24px rgba(0,0,0,0.2);
            box-sizing: border-box;
        }

        #hnc_dialog h2 {
            margin: 0;
            font-size: 18px;
            font-weight: 500;
        }

        .hnc-dialog-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 20px;
        }

        #hnc_dialog hr {
            border: none;
            height: 1px;
            background-color: var(--hnc-border);
            margin: 20px 0;
        }

        .hnc-section { margin-bottom: 16px; }

        .hnc-flex-row {
            display: flex;
            align-items: center;
            margin-bottom: 10px;
        }

        .hnc-flex-column {
            display: flex;
            flex-direction: column;
            gap: 6px;
        }

        .hnc_fixed_width { width: 180px; font-weight: 500; }

        .hnc-checkbox-label {
            display: inline-flex;
            align-items: center;
            cursor: pointer;
            font-weight: 500;
        }
        .hnc-checkbox-label input { margin-right: 8px; }

        .hnc-input {
            background-color: var(--hnc-input-bg);
            border: 1px solid var(--hnc-input-border);
            color: var(--hnc-text);
            padding: 6px 10px;
            border-radius: 4px;
            font-size: 13px;
        }

        .hnc-input:focus { outline: 1px solid var(--hnc-primary); }

        #hnc_comment_style {
            width: 100%;
            height: 60px;
            font-family: monospace;
            resize: vertical;
        }

        input.hnc_setting[pattern]:invalid, #hnc_custom_visit:invalid {
            border-color: var(--hnc-danger);
            background-color: rgba(217, 58, 0, 0.1);
        }

        .hnc-dialog-footer {
            display: flex;
            gap: 12px;
            margin-top: 24px;
            padding-top: 16px;
            border-top: 1px solid var(--hnc-border);
        }

        .hnc-btn {
            background-color: var(--hnc-btn-bg);
            color: var(--hnc-btn-text);
            border: none;
            padding: 8px 16px;
            border-radius: 999px;
            cursor: pointer;
            font-weight: 600;
            transition: background-color 0.2s;
        }
        .hnc-btn:hover { background-color: var(--hnc-btn-hover); }

        .hnc-btn-primary {
            background-color: var(--hnc-primary);
            color: #fff;
        }
        .hnc-btn-primary:hover { background-color: var(--hnc-primary-hover); }

        .hnc-btn-danger {
            background-color: transparent;
            color: var(--hnc-danger);
            border: 1px solid var(--hnc-danger);
        }
        .hnc-btn-danger:hover {
            background-color: rgba(217, 58, 0, 0.1);
        }

        #hnc_config_icon:hover { opacity: 1 !important; background-color: rgba(128,128,128,0.2); }

        /*.thing.hnc_new.res-selected,
        .thing.hnc_new .entry.res-selected,
        .thing.hnc_new .RES-keyNav-activeElement,
        .res-nightmode .thing.hnc_new.res-selected,
        .res-nightmode .thing.hnc_new .entry.res-selected,
        .res-nightmode .thing.hnc_new .RES-keyNav-activeElement,
        .res-nightmode .entry.res-selected, .res-nightmode .entry.res-selected .md-container {
            background-color: transparent !important;
        }*/
    `
};

HNC.cfg = {
  load() {
    const config = GM_getValue('config');
    if (!config) return this.default();
    return JSON.parse(config);
  },

  save() {
    GM_setValue('config', JSON.stringify(HNC.config));
  },

  default () {
    return {
      prefer_edited_time: true,
      use_color_gradient: true,
      color_newer: 'hsla(210, 100%, 55%, 0.25)',
      color_older: 'hsla(210, 100%, 55%, 0.05)',
      apply_on: 'text',
      comment_style: 'background-color: %color !important;\npadding: 2px 5px;\nborder-radius: 3px;',
      dark_mode: true,
      history: {},
      history_expiration: 7,
    };
  },
};

function time_ago(time, precision = 2) {
  let parsedTime = time;
  if (typeof time === 'string') parsedTime = +new Date(time);
  if (typeof time === 'object' && time.constructor === Date) parsedTime = time.getTime();

  let seconds = (Date.now() - parsedTime) / 1000;
  if (seconds < 2) return 'just now';

  const time_formats = [
        [60, 'seconds', 1],
        [120, '1 minute', '1 minute from now'],
        [3600, 'minutes', 60],
        [7200, '1 hour', '1 hour from now'],
        [86400, 'hours', 3600],
        [172800, '1 day', 'Tomorrow'],
        [604800, 'days', 86400],
        [1209600, '1 week', 'Next week'],
        [2419200, 'weeks', 604800],
        [4838400, '1 month', 'Next month'],
        [29030400, 'months', 2419200],
        [58060800, '1 year', 'Next year'],
        [2903040000, 'years', 29030400],
    ];

  const durations = [];
  while (true) {
    let index = 0;
    let format;

    while ((format = time_formats[index++])) {
      if (seconds < format[0]) {
        if (typeof format[2] === 'string') {
          durations.push(format[1]);
        } else {
          durations.push(Math.floor(seconds / format[2]) + ' ' + format[1]);
        }
        break;
      }
    }

    if (index > time_formats.length) return 'a very long time ago';

    const previousFormat = time_formats[index - 1];
    seconds -= typeof previousFormat[2] === 'string' ? time_formats[index][2] : Math.floor(seconds / previousFormat[2]) * previousFormat[2];

    if (precision > index && durations.length > 1) {
      durations.pop();
      break;
    }

    if (seconds <= 0) break;
  }

  if (durations.length > 1) {
    const last = durations.pop();
    return durations.join(', ') + ' and ' + last + ' ago';
  }

  return durations[0] + ' ago';
}

try {
  HNC.init();
} catch (error) {
  logger.error('HNC Error:', error);
}
