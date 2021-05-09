// ==UserScript==
// @name          Plext
// @namespace     https://github.com/StylusThemes/Userscripts
// @include       /^https?://[a-zA-Z0-9.]+:32400/web/index.html/
// @include       http*://app.plex.tv*
// @include       http*://plex.*
// @version       1.0
// @grant         none
// ==/UserScript==

(function () {
  ////////////////////////////////////////////////////
  //////////////////Settings//////////////////////////
  ////////////////////////////////////////////////////
  var hideCastList = false;
  var hideMovieReviews = false;
  var hideRelatedMovies = false;
  var hideRelatedShows = false;
  var hideMoviesYouMightLike = false;
  var hideShowsYouMightLike = false;
  ////////////////////////////////////////////////////
  ////////////////////////////////////////////////////
  ////////////////////////////////////////////////////

  //yay for jquery
  var script = document.createElement('script');
  script.src = 'https://code.jquery.com/jquery-1.11.0.min.js';
  script.type = 'text/javascript';
  document.getElementsByTagName('head')[0].appendChild(script);

  if (hideCastList==true) {
      let interval = setInterval((function() {
      'use strict';
      var xpath = "//div[text()='Cast'][contains(@class, 'HubTitle-hubTitle')][not(contains(@style, 'hidden'))]/../..";
      var matchingElement = document.evaluate(xpath, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null).singleNodeValue;
      if(matchingElement && matchingElement.style.visibility !== 'hidden') {
        matchingElement.style.visibility = 'hidden';
        matchingElement.style.height = '0';
        matchingElement.style.margin = '0';
      }
    }), 500);
  }

  if (hideMovieReviews==true) {
      let interval = setInterval((function() {
      'use strict';
      var xpath = "//div[text()='Reviews'][contains(@class, 'HubTitle-hubTitle')][not(contains(@style, 'hidden'))]/../..";
      var matchingElement = document.evaluate(xpath, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null).singleNodeValue;
      if(matchingElement && matchingElement.style.visibility !== 'hidden') {
        matchingElement.style.visibility = 'hidden';
        matchingElement.style.height = '0';
        matchingElement.style.margin = '0';
      }
    }), 500);
  }

  if (hideRelatedMovies==true) {
      let interval = setInterval((function() {
      'use strict';
      var xpath = "//div[text()='Related Movies'][contains(@class, 'HubTitle-hubTitle')][not(contains(@style, 'hidden'))]/../..";
      var matchingElement = document.evaluate(xpath, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null).singleNodeValue;
      if(matchingElement && matchingElement.style.visibility !== 'hidden') {
        matchingElement.style.visibility = 'hidden';
        matchingElement.style.height = '0';
        matchingElement.style.margin = '0';
      }
    }), 500);
  }

  if (hideRelatedShows==true) {
      let interval = setInterval((function() {
      'use strict';
      var xpath = "//div[text()='Related Shows'][contains(@class, 'HubTitle-hubTitle')][not(contains(@style, 'hidden'))]/../..";
      var matchingElement = document.evaluate(xpath, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null).singleNodeValue;
      if(matchingElement && matchingElement.style.visibility !== 'hidden') {
        matchingElement.style.visibility = 'hidden';
        matchingElement.style.height = '0';
        matchingElement.style.margin = '0';
      }
    }), 500);
  }

  if (hideMoviesYouMightLike==true) {
      let interval = setInterval((function() {
      'use strict';
      var xpath = "//div[text()='Movies You Might Like'][contains(@class, 'HubTitle-hubTitle')][not(contains(@style, 'hidden'))]/../..";
      var matchingElement = document.evaluate(xpath, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null).singleNodeValue;
      if(matchingElement && matchingElement.style.visibility !== 'hidden') {
        matchingElement.style.visibility = 'hidden';
        matchingElement.style.height = '0';
        matchingElement.style.margin = '0';
      }
    }), 500);
  }

  if (hideShowsYouMightLike==true) {
      let interval = setInterval((function() {
      'use strict';
      var xpath = "//div[text()='Shows You Might Like'][contains(@class, 'HubTitle-hubTitle')][not(contains(@style, 'hidden'))]/../..";
      var matchingElement = document.evaluate(xpath, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null).singleNodeValue;
      if(matchingElement && matchingElement.style.visibility !== 'hidden') {
        matchingElement.style.visibility = 'hidden';
        matchingElement.style.height = '0';
        matchingElement.style.margin = '0';
      }
    }), 500);
  }

})();
