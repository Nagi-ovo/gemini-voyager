/**
 * Conversation History Observer — injected into the MAIN world at
 * document_start (via usageObserverLoader) so it can hook the network BEFORE
 * Gemini bootstraps and fires the conversation-load RPC.
 *
 * Gemini loads a conversation's messages through a `batchexecute` RPC
 * (rpcid `hNvQHb`) whose payload carries a server-side `[seconds, nanos]`
 * timestamp for every turn. This observer passively captures those responses
 * and bridges them to the content script (isolated world) with
 * window.postMessage, where the timeline feature parses them to show real
 * message times instead of "when the extension first saw the message".
 *
 * The content script loads at document_idle — long after the first
 * conversation-load RPC has fired — so captures are buffered here and
 * re-posted when the content script sends a `flush` command.
 *
 * Inert by construction: it only reads responses for `batchexecute` URLs
 * whose rpcids include `hNvQHb`, never modifies requests or responses, and
 * returns the original promise for passthrough (an async wrapper would break
 * Angular's zone.js change detection — see public/fetchInterceptor.js).
 */
(function () {
  if (window.__gvHistoryObserverInstalled) return;
  window.__gvHistoryObserverInstalled = true;

  var SRC = 'gv-history-observer';
  var CMD = 'gv-history-observer-cmd';
  var MAX_BUFFER = 8;
  var buffer = [];

  function isHistoryRequest(url) {
    var s = String(url || '');
    return s.indexOf('batchexecute') > -1 && s.indexOf('hNvQHb') > -1;
  }

  function post(type, payload) {
    try {
      window.postMessage({ source: SRC, type: type, payload: payload }, location.origin);
    } catch (e) {}
  }

  function capture(url, body) {
    if (typeof body !== 'string' || !body) return;
    var item = { url: String(url), body: body };
    buffer.push(item);
    if (buffer.length > MAX_BUFFER) buffer.shift();
    post('capture', item);
  }

  // --- fetch hook (regular function — must not wrap the passthrough promise) ---
  if (typeof window.fetch === 'function') {
    var origFetch = window.fetch;
    window.fetch = function (input) {
      // TODO(robustness): a URL/Request first-arg exposes .href, not .url, so a
      // URL-object fetch yields '' here and skips capture. Currently Gemini
      // passes a string for hNvQHb, so this is latent. Fall back to input.href.
      var url = typeof input === 'string' ? input : (input && input.url) || '';
      var p = origFetch.apply(this, arguments);
      if (isHistoryRequest(url)) {
        p.then(
          function (r) {
            try {
              if (r && typeof r.clone === 'function') {
                r.clone()
                  .text()
                  .then(
                    function (t) {
                      capture(url, t);
                    },
                    function () {},
                  );
              }
            } catch (e) {}
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

      var origOpen = xhr.open;
      xhr.open = function (_method, url) {
        // TODO(robustness): url may be a URL object; the send() guard below
        // requires typeof reqUrl === 'string', so a URL-object open() is never
        // captured. Store String(url) to match those too.
        reqUrl = url;
        return origOpen.apply(xhr, arguments);
      };

      var origSend = xhr.send;
      xhr.send = function () {
        if (typeof reqUrl === 'string' && isHistoryRequest(reqUrl)) {
          xhr.addEventListener(
            'load',
            function () {
              try {
                // TODO(robustness): responseText throws if responseType is
                // 'json'/'blob'/'arraybuffer' — the capture is silently lost.
                // Guard on xhr.responseType before reading, or read .response.
                capture(reqUrl, xhr.responseText);
              } catch (e) {}
            },
            { once: true },
          );
        }
        return origSend.apply(xhr, arguments);
      };

      return xhr;
    };
  }

  // --- flush: re-post buffered captures once the content script is listening ---
  window.addEventListener('message', function (ev) {
    if (ev.source !== window) return;
    var d = ev.data;
    if (!d || d.source !== CMD || d.type !== 'flush') return;
    for (var i = 0; i < buffer.length; i++) {
      post('capture', buffer[i]);
    }
  });
})();
