// ==UserScript==
// @name          GitHub - Latest
// @version       1.5.1
// @description   Always keep an eye on the latest activity of your favorite projects
// @author        Journey Over
// @license       MIT
// @match         *://github.com/*
// @grant         none
// @icon          https://www.google.com/s2/favicons?sz=64&domain=github.com
// @homepageURL   https://github.com/StylusThemes/Userscripts
// @downloadURL   https://github.com/StylusThemes/Userscripts/raw/main/userscripts/github-latest.user.js
// @updateURL     https://github.com/StylusThemes/Userscripts/raw/main/userscripts/github-latest.user.js
// ==/UserScript==

// add a button to "latest issues"
function addLatestButton() {
  // do not add button again if already present
  if (document.getElementById("latest-button")) {
    return;
  }

  var reponav_list = document.querySelector("nav.js-repo-nav > .UnderlineNav-body");
  if (reponav_list) {
    var list_item_issues_copy = reponav_list.children[1].cloneNode(true);
    list_item_issues_copy.style.marginLeft = "auto";

    var button = list_item_issues_copy.firstElementChild;
    button.id = "latest-button"
    button.href += "?q=sort%3Aupdated-desc";
    button.style.float = "right";

    // unselect
    button.classList.remove("selected");
    button.removeAttribute("data-selected-links");
    button.removeAttribute("aria-current");

    // adjust icon
    var icon = button.getElementsByTagName("svg")[0];
    icon.setAttribute("class", icon.getAttribute("class").replace("octicon-issue-opened", "octicon-flame"));
    icon.firstElementChild.setAttribute("d", "M5.05 0.31c0.81 2.17 0.41 3.38-0.52 4.31-0.98 1.05-2.55 1.83-3.63 3.36-1.45 2.05-1.7 6.53 3.53 7.7-2.2-1.16-2.67-4.52-0.3-6.61-0.61 2.03 0.53 3.33 1.94 2.86 1.39-0.47 2.3 0.53 2.27 1.67-0.02 0.78-0.31 1.44-1.13 1.81 3.42-0.59 4.78-3.42 4.78-5.56 0-2.84-2.53-3.22-1.25-5.61-1.52 0.13-2.03 1.13-1.89 2.75 0.09 1.08-1.02 1.8-1.86 1.33-0.67-0.41-0.66-1.19-0.06-1.78 1.25-1.23 1.75-4.09-1.88-6.22l-0.02-0.02z");
    icon.lastElementChild.remove();

    // adjust name
    var label = button.getElementsByTagName("span")[0];
    label.textContent = "Latest issues"

    // remove counter
    var counter = button.getElementsByClassName('counter')[0] || button.getElementsByClassName('Counter')[0];
    if (counter) {
      button.removeChild(counter);
    }

    reponav_list.appendChild(list_item_issues_copy);
  }
}

addLatestButton();

// GitHub uses usage of https://github.com/defunkt/jquery-pjax#events and https://turbo.hotwired.dev/reference/events.
// https://github.com/refined-github/refined-github/issues/5719
document.addEventListener('turbo:render', addLatestButton);
