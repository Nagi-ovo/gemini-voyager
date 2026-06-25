/**
 * Usage Observer — injected into the MAIN world at document_start (via
 * usageObserverLoader content script) so it can hook the network BEFORE Gemini
 * bootstraps and fires the eager `/usage` metrics RPC.
 *
 * Two jobs, both bridged to the content script (isolated world) with
 * window.postMessage (works across worlds, same as response-complete-observer):
 *
 *   1. Capture: while on /usage, record each `batchexecute` request's rpcid +
 *      args + raw response and post it as a `capture` message. The content
 *      script DOM-verifies which one carries the usage numbers and remembers
 *      that {rpcid, args} as a "recipe".
 *
 *   2. Replay: on a `replay` command (a known rpcid + args), re-issue the
 *      batchexecute POST with the page's own auth tokens (only reachable from
 *      the MAIN world) and post the fresh response back as `replay-result`.
 *      This is what lets the content script refresh usage from any page without
 *      navigating to /usage.
 *
 * Inert by construction: it only acts on `batchexecute` URLs, only captures on
 * /usage, and the content script ignores everything when the feature is off.
 */
(function () {
  if (window.__gvUsageObserverInstalled) return;
  window.__gvUsageObserverInstalled = true;

  var SRC = 'gv-usage-observer';
  var CMD = 'gv-usage-observer-cmd';
  // Preserve the pristine fetch for replay so we never recurse through our hook.
  var origFetch = typeof window.fetch === 'function' ? window.fetch : null;

  function onUsagePath() {
    return /^\/(?:u\/\d+\/)?usage(?:\/|$)/.test(location.pathname);
  }

  /** A Gemini message-generation request — usage changes right after one finishes. */
  function isGenRequest(url, body) {
    var hay = (String(url || '') + '\n' + (typeof body === 'string' ? body : '')).toLowerCase();
    return (
      hay.indexOf('streamgenerate') > -1 ||
      hay.indexOf('bardfrontendservice') > -1 ||
      hay.indexOf('assistant.lamda') > -1
    );
  }

  function rpcOf(url) {
    var m = String(url).match(/rpcids=([^&]+)/);
    return m ? decodeURIComponent(m[1]) : '';
  }

  /** Pull the inner [rpcid, args, null, "generic"] tuple out of an f.req body. */
  function parseReqTuple(body) {
    try {
      if (typeof body === 'string') {
        var m = body.match(/f\.req=([^&]*)/);
        if (m) {
          var arr = JSON.parse(decodeURIComponent(m[1]));
          return arr && arr[0] && arr[0][0] ? arr[0][0] : null;
        }
      }
    } catch (e) {}
    return null;
  }

  function post(type, payload) {
    try {
      window.postMessage({ source: SRC, type: type, payload: payload }, location.origin);
    } catch (e) {}
  }

  function capture(url, reqBody, respText) {
    if (!onUsagePath()) return;
    if (String(url).indexOf('batchexecute') < 0) return;
    var tuple = parseReqTuple(reqBody);
    post('capture', {
      rpcid: rpcOf(url),
      args: tuple ? tuple[1] : null,
      body: typeof respText === 'string' ? respText : '',
    });
  }

  function notifyGenComplete() {
    post('generation-complete', {});
  }

  // --- fetch hook (regular function — must not wrap the passthrough promise) ---
  if (origFetch) {
    window.fetch = function (input, init) {
      var url = typeof input === 'string' ? input : (input && input.url) || '';
      var body = init && init.body;
      var p = origFetch.apply(this, arguments);
      if (url.indexOf('batchexecute') > -1 && onUsagePath()) {
        p.then(
          function (r) {
            try {
              if (r && typeof r.clone === 'function') {
                r.clone()
                  .text()
                  .then(
                    function (t) {
                      capture(url, body, t);
                    },
                    function () {},
                  );
              }
            } catch (e) {}
            return r;
          },
          function () {},
        );
      } else if (isGenRequest(url, body)) {
        // Fire when the streamed response finishes (arrayBuffer drains the body).
        p.then(
          function (r) {
            try {
              if (r && typeof r.clone === 'function') {
                r.clone().arrayBuffer().then(notifyGenComplete, notifyGenComplete);
              } else {
                notifyGenComplete();
              }
            } catch (e) {
              notifyGenComplete();
            }
            return r;
          },
          function () {},
        );
      }
      return p;
    };
  }

  // --- XHR hook ---
  if (typeof window.XMLHttpRequest === 'function') {
    var OrigXHR = window.XMLHttpRequest;
    window.XMLHttpRequest = function () {
      var xhr = new OrigXHR();
      var reqUrl = '';
      var reqBody = null;

      var origOpen = xhr.open;
      xhr.open = function (_method, url) {
        reqUrl = url;
        return origOpen.apply(xhr, arguments);
      };

      var origSend = xhr.send;
      xhr.send = function (body) {
        reqBody = body;
        if (typeof reqUrl === 'string' && reqUrl.indexOf('batchexecute') > -1 && onUsagePath()) {
          xhr.addEventListener(
            'load',
            function () {
              try {
                capture(reqUrl, reqBody, xhr.responseText);
              } catch (e) {}
            },
            { once: true },
          );
        } else if (isGenRequest(reqUrl, body)) {
          xhr.addEventListener('loadend', notifyGenComplete, { once: true });
        }
        return origSend.apply(xhr, arguments);
      };

      return xhr;
    };
  }

  // --- Replay: re-issue a known usage RPC with the page's own tokens ---
  window.addEventListener('message', function (ev) {
    if (ev.source !== window) return;
    var d = ev.data;
    if (!d || d.source !== CMD || d.type !== 'replay' || !d.payload) return;

    var id = d.payload.id;
    try {
      var wiz = window.WIZ_global_data || {};
      var at = wiz.SNlM0e,
        bl = wiz.cfb2h,
        fsid = wiz.FdrFJe;
      if (!at || !origFetch) {
        post('replay-result', { id: id, error: 'no-token' });
        return;
      }
      var rpcid = d.payload.rpcid;
      var args = d.payload.args;
      var sourcePath =
        typeof d.payload.sourcePath === 'string' && d.payload.sourcePath
          ? d.payload.sourcePath
          : location.pathname || '/app';
      var freq = JSON.stringify([[[rpcid, args, null, 'generic']]]);
      var reqBody = 'f.req=' + encodeURIComponent(freq) + '&at=' + encodeURIComponent(at) + '&';
      var reqid = 100000 + (Math.floor(performance.now()) % 800000);

      var match = sourcePath.match(/^\/u\/\d+/);
      var accountPrefix = match ? match[0] : '';
      var url =
        location.origin +
        accountPrefix +
        '/_/BardChatUi/data/batchexecute?rpcids=' +
        encodeURIComponent(rpcid) +
        '&source-path=' +
        encodeURIComponent(sourcePath) +
        '&bl=' +
        encodeURIComponent(bl || '') +
        '&f.sid=' +
        encodeURIComponent(fsid || '') +
        '&hl=en&_reqid=' +
        reqid +
        '&rt=c';
      origFetch
        .call(window, url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8' },
          body: reqBody,
          credentials: 'include',
        })
        .then(function (r) {
          return r.text();
        })
        .then(function (t) {
          post('replay-result', { id: id, body: t });
        })
        .catch(function (e) {
          post('replay-result', { id: id, error: String(e) });
        });
    } catch (e) {
      post('replay-result', { id: id, error: String(e) });
    }
  });
})();
