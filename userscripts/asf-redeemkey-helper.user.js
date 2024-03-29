// ==UserScript==
// @name          ASF Redeem Helper
// @namespace     https://github.com/StylusThemes/Userscripts
// @description   Make redeem key commands clickable.
// @match         *://*.steamgifts.com/giveaways/won
// @version       1.0
// @grant         GM_xmlhttpRequest
// @grant         GM_getValue
// @grant         GM_setValue
// ==/UserScript==

(function() {
  /*  Configure Custom Server or Password  */
  let ASF_SERVER = ""; // e.g. 127.0.0.1:1242
  let ASF_PASSWORD = ""; // e.g. 123456
  /*  End Configuration  */

  // Promise wrapper for GM_xmlhttpRequest
  const Request = (details) =>
    new Promise((resolve, reject) => {
      details.onerror = details.ontimeout = reject;
      details.onload = resolve;
      GM_xmlhttpRequest(details);
    });

  async function sendASF(command) {
    if (Array.isArray(command)) command = command.filter((e) => e !== undefined).join(" ");
    const ASF_URL = "http://" + ASF_SERVER + "/Api/Command";
    return await Request({
      method: "POST",
      url: ASF_URL,
      headers: {
        "Content-Type": "application/json",
        accept: "application/json",
        Authentication: ASF_PASSWORD,
      },
      data: JSON.stringify({
        COMMAND: "!redeem " + command,
      }),
    });
  }

  async function addRedeemClick(event) {
    const el = event.target;
    el.style.textDecoration = "";
    el.style.cursor = "";
    el.style.color = "inherit";
    el.onclick = undefined;
    console.log("Executing " + el.dataset.asfcommand);
    const resp = await sendASF(el.dataset.asfcommand);
    const indicator = document.createElement("span");
    if (resp.responseText.includes("Status: OK")) {
      indicator.innerText = "✔️";
      indicator.title = "Successfully added";
    } else {
      indicator.innerText = "❗";
      indicator.title = "Error adding Game. See console for more info";
      console.log(resp.responseText);
    }
    el.after(indicator);
    return false;
  }

  // https://stackoverflow.com/questions/10730309/find-all-text-nodes-in-html-page
  function textNodesUnder(el) {
    let n,
      a = [],
      walk = document.createTreeWalker(el, NodeFilter.SHOW_TEXT, null, false);
    while ((n = walk.nextNode())) a.push(n);
    return a;
  }

  function findCommands(ps) {
    const addreg = /^(?:(?:([A-Z0-9])(?!\1{4})){5}-){2,5}[A-Z0-9]{5}/gim;
    ps.forEach((p) => {
      textNodesUnder(p).forEach((node) => {
        const ms = node.textContent.matchAll(addreg);
        for (const m of ms) {
          // tail contains any remaining text after the ASF command
          const tail = node.textContent.substring(m.index + m[0].length);
          // truncate the existing text node at the start of the ASF command
          node.textContent = node.textContent.substring(0, m.index);
          // full ASF command
          const cmd = m[0].trim();
          const a = document.createElement("span");
          a.style = "color:#4B72D4; background-color:inherit; cursor: pointer; text-decoration: underline; border:0;margin:0;padding:0;display:inline;text-align:inherit;";
          a.dataset.asfcommand = cmd;
          a.innerText = cmd;
          a.onclick = addRedeemClick;
          node.after(a);
          // if text was present after the ASF command, append it as a new text node
          if (tail !== "") {
            a.after(document.createTextNode(tail));
          }
        }
      });
    });
  }

  // Handles loading and storing of custom settings
  function CustomSettings() {
    if (ASF_PASSWORD !== "") {
      GM_setValue("asf_password", ASF_PASSWORD);
    } else {
      ASF_PASSWORD = GM_getValue("asf_password", "");
    }
    if (ASF_SERVER !== "") {
      GM_setValue("asf_server", ASF_SERVER);
    } else {
      ASF_SERVER = GM_getValue("asf_server", "127.0.0.1:1242");
    }
  }

  CustomSettings();

  if (/steamgifts\.com/.test(location.href)) {
    const ps = document.querySelectorAll(".table__column__key > span");
    findCommands(ps);
  }
})();
