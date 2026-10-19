/**
 * Conversation History Observer — injected into the MAIN world at
 * document_start (via usageObserverLoader) so it can hook the network BEFORE
 * Gemini bootstraps and fires the conversation-load RPC.
 *
 * Gemini loads a conversation's messages through a `batchexecute` RPC
 * (rpcid `hNvQHb`) whose payload carries a server-side `[seconds, nanos]`
 * timestamp and stable response id for every turn. Captures stay buffered only until the isolated
 * content script acknowledges them; SPA navigation therefore never replays
 * already-parsed multi-megabyte responses.
 *
 * The observer starts in an `unknown` state until the document_start loader
 * confirms that the isolated-world parser is ready. It preserves only a small
 * bounded set of responses during that short race so eager conversation-load
 * RPCs are not lost.
 *
 * The fetch wrapper deliberately returns the original promise. Making it an
 * async wrapper breaks Angular's zone.js change detection (see
 * public/fetchInterceptor.js).
 *
 * Every history request also posts a small `request` start/end message, whatever
 * the capture state: export preloading waits on it instead of guessing from time
 * whether an older page is still on its way.
 */
(function () {
  if (window.__gvHistoryObserverInstalled) return;
  window.__gvHistoryObserverInstalled = true;

  var SRC = 'gv-history-observer';
  var CMD = 'gv-history-observer-cmd';
  var MAX_BUFFER_COUNT = 4;
  var MAX_CAPTURE_BYTES = 16 * 1024 * 1024;
  var MAX_BUFFER_BYTES = 24 * 1024 * 1024;
  var observerId = Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
  var sequence = 0;
  var state = 'unknown';
  var readGeneration = 0;
  var unknownReadClaimed = false;
  var bufferedBytes = 0;
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

  function estimateStringBytes(value) {
    return value.length * 2;
  }

  function removeAt(index) {
    var removed = buffer.splice(index, 1)[0];
    if (removed) bufferedBytes = Math.max(0, bufferedBytes - removed.bytes);
  }

  function clearBuffer() {
    buffer.length = 0;
    bufferedBytes = 0;
  }

  function acknowledge(id) {
    if (typeof id !== 'string' || !id) return;
    for (var i = 0; i < buffer.length; i++) {
      if (buffer[i].id === id) {
        removeAt(i);
        return;
      }
    }
  }

  function claimResponseRead() {
    if (state === 'disabled') return null;
    if (state === 'unknown') {
      if (unknownReadClaimed) return null;
      unknownReadClaimed = true;
    }
    return readGeneration;
  }

  function capture(url, body, generation) {
    if (generation !== readGeneration || state === 'disabled') return;
    if (typeof body !== 'string' || !body) return;

    var bytes = estimateStringBytes(body);
    if (bytes > MAX_CAPTURE_BYTES || bytes > MAX_BUFFER_BYTES) return;

    while (
      buffer.length > 0 &&
      (buffer.length >= MAX_BUFFER_COUNT || bufferedBytes + bytes > MAX_BUFFER_BYTES)
    ) {
      removeAt(0);
    }
    if (buffer.length >= MAX_BUFFER_COUNT || bufferedBytes + bytes > MAX_BUFFER_BYTES) return;

    var item = {
      id: observerId + ':' + String(++sequence),
      url: String(url),
      body: body,
      bytes: bytes,
    };
    buffer.push(item);
    bufferedBytes += bytes;
    post('capture', { id: item.id, url: item.url, body: item.body });
  }

  function configure(enabled) {
    if (enabled) {
      state = 'enabled';
      return;
    }

    state = 'disabled';
    readGeneration++;
    unknownReadClaimed = false;
    clearBuffer();
  }

  // Install the command bridge before network hooks so a fast setting read can
  // configure the observer as soon as the external script executes.
  function handleCommand(ev) {
    if (ev.source !== window || ev.origin !== location.origin) return;
    var d = ev.data;
    if (!d || d.source !== CMD) return;

    if (d.type === 'configure') {
      configure(!!(d.payload && d.payload.enabled));
      return;
    }
    if (d.type === 'ack') {
      acknowledge(d.payload && d.payload.id);
      return;
    }
    if (d.type === 'flush') {
      for (var i = 0; i < buffer.length; i++) {
        var item = buffer[i];
        post('capture', { id: item.id, url: item.url, body: item.body });
      }
    }
  }
  window.addEventListener('message', handleCommand);

  // --- fetch hook (regular function — must not wrap the passthrough promise) ---
  if (typeof window.fetch === 'function') {
    var origFetch = window.fetch;
    window.fetch = function (input) {
      var url = typeof input === 'string' ? input : (input && (input.url || input.href)) || '';
      var p = origFetch.apply(this, arguments);
      if (isHistoryRequest(url)) {
        post('request', { phase: 'start' });
        var ended = false;
        var end = function () {
          if (ended) return;
          ended = true;
          post('request', { phase: 'end' });
        };
        p.then(function (r) {
          if (!r || typeof r.clone !== 'function') {
            end();
            return r;
          }
          var generation = claimResponseRead();
          if (generation === null) {
            end();
            return r;
          }
          try {
            // End only once the body has arrived: on a slow link it trails the headers by seconds.
            r.clone()
              .text()
              .then(function (t) {
                end();
                capture(url, t, generation);
              }, end);
          } catch (e) {
            end();
          }
          return r;
        }, end);
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
        reqUrl = String(url || '');
        return origOpen.apply(xhr, arguments);
      };

      var origSend = xhr.send;
      xhr.send = function () {
        if (isHistoryRequest(reqUrl)) {
          post('request', { phase: 'start' });
          xhr.addEventListener(
            'loadend',
            function () {
              post('request', { phase: 'end' });
            },
            { once: true },
          );
          xhr.addEventListener(
            'load',
            function () {
              try {
                if (xhr.responseType && xhr.responseType !== 'text') return;
                var generation = claimResponseRead();
                if (generation === null) return;
                capture(reqUrl, xhr.responseText, generation);
              } catch (e) {}
            },
            { once: true },
          );
        }
        return origSend.apply(xhr, arguments);
      };

      return xhr;
    };
    // Page code reads XMLHttpRequest.DONE and checks instanceof; keep the native constructor's statics and prototype.
    Object.setPrototypeOf(window.XMLHttpRequest, OrigXHR);
    window.XMLHttpRequest.prototype = OrigXHR.prototype;
  }

  window.addEventListener(
    'beforeunload',
    function () {
      window.removeEventListener('message', handleCommand);
      clearBuffer();
    },
    { once: true },
  );

  post('ready', { observerId: observerId });
})();
