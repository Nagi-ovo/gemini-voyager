/**
 * Google sends Voyager's OAuth answer here, because Google only verifies a
 * brand whose redirect URIs are on domains we own. Chromium's
 * launchWebAuthFlow waits for https://<extension id>.chromiumapp.org/, so this
 * page forwards the whole answer (query and fragment) there.
 *
 * The extension id comes from `state` ("<id>.<nonce>") and must be one of ours:
 * anything else stops here, so this page never becomes an open redirect. The
 * extension checks the nonce itself. Add new Chrome or Edge listing ids here;
 * Google Cloud keeps this relay as its single redirect URI.
 */
(function (window) {
  var ALLOWED_EXTENSION_IDS = [
    'iifacdnjakkhjjiengaffnegbndgingi', // Chrome Web Store, and unpacked builds that keep the manifest key
    'gibmkggjijalcjinbdhcpklodjkhhlne', // Microsoft Edge Add-ons
  ];

  function readState(url) {
    var fromHash = new URLSearchParams(url.hash.slice(1)).get('state');
    return fromHash || url.searchParams.get('state') || '';
  }

  function relayTarget(href) {
    var url;
    try {
      url = new URL(href);
    } catch {
      return null;
    }
    var match = /^([a-p]{32})\.[A-Za-z0-9_-]{16,}$/.exec(readState(url));
    if (!match || ALLOWED_EXTENSION_IDS.indexOf(match[1]) === -1) return null;
    return 'https://' + match[1] + '.chromiumapp.org/' + url.search + url.hash;
  }

  window.voyagerOAuthRelayTarget = relayTarget;
  var target = relayTarget(window.location.href);
  if (target) {
    // replace() keeps the token out of this tab's history.
    window.location.replace(target);
  } else {
    var status = window.document.getElementById('status');
    if (status)
      status.textContent =
        'This sign-in link is not valid. Close this window and try again from Voyager.';
  }
})(window);
