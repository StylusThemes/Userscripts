// ==UserScript==
// @name          EmuParadise Download Workaround
// @namespace     https://github.com/StylusThemes/Userscripts
// @description   Replaces the download button link with a working one
// @match         *://www.emuparadise.me/*/*/*
// @version       0.0.1
// @grant         none
// ==/UserScript==

(function() {
  'use strict';

  var id = encodeURIComponent(((document.URL).split('/'))[5]);
  var suf = '<a target="_blank" href="/roms/get-download.php'
    + '?gid=' + id
    + '&test=true"'
    + ' title="Download using the workaround script">'
    + 'Download using the workaround script</a>'
    + '<br /><br />';
  Array.from(
    document.getElementsByClassName('download-link')
  ).map(dl => {
    dl.innerHTML = suf + dl.innerHTML;
  });
})();
