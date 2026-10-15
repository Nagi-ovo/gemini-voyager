(function () {
  if (window.__gvResponseCompleteObserverInstalled) return;
  window.__gvResponseCompleteObserverInstalled = true;

  const SOURCE = 'gemini-voyager-response-complete-observer';
  const STOP_RESPONSE_SELECTOR = [
    'button[data-test-id="stop-button"]',
    'button[aria-label="Stop response"]',
    'button[aria-label="停止回答"]',
    'button[aria-label="停止回复"]',
  ].join(', ');
  const activeRequests = new Map();
  let nextRequestId = 1;

  document.addEventListener(
    'click',
    function (event) {
      if (!(event.target instanceof Element) || !event.target.closest(STOP_RESPONSE_SELECTOR))
        return;
      // Gemini can acknowledge Stop by ending a 200 stream instead of aborting the transport.
      for (const requestId of activeRequests.keys()) activeRequests.set(requestId, true);
    },
    true,
  );

  function toAbsoluteUrl(url) {
    try {
      return new URL(String(url || ''), window.location.href).href;
    } catch {}
    return String(url || '');
  }

  function getUrl(input) {
    try {
      if (typeof input === 'string') return toAbsoluteUrl(input);
      if (input instanceof URL) return input.href;
      if (input && typeof input.url === 'string') return toAbsoluteUrl(input.url);
    } catch {}
    return '';
  }

  function getBodyText(init) {
    try {
      const body = init && init.body;
      if (typeof body === 'string') return body;
      if (body instanceof URLSearchParams) return body.toString();
    } catch {}
    return '';
  }

  // Gemini's processSession channel (geminiweb-pa.clients6.google.com) streams
  // replies over one long-lived GET, so no request ends with a reply and it is
  // not matched here; the page detector in responseNotification/run.ts owns
  // completion there.
  function isGeminiGenerationRequest(url, bodyText) {
    const absoluteUrl = toAbsoluteUrl(url);
    const normalizedUrl = absoluteUrl.toLowerCase();
    let hostname = '';

    try {
      hostname = new URL(absoluteUrl).hostname.toLowerCase();
    } catch {}

    if (!hostname.endsWith('gemini.google.com') && hostname !== 'business.gemini.google') {
      return false;
    }

    if (normalizedUrl.includes('streamgenerate')) return true;
    // Copy RPC bodies can mention generation APIs; their text is not evidence of generation.
    if (normalizedUrl.includes('batchexecute')) return false;

    const haystack = `${absoluteUrl}\n${bodyText}`.toLowerCase();
    return (
      haystack.includes('bardfrontendservice') ||
      haystack.includes('generatecontent') ||
      haystack.includes('assistant.lamda')
    );
  }

  function post(type, payload) {
    try {
      window.postMessage({ source: SOURCE, type, payload }, window.location.origin);
    } catch {}
  }

  // 仅作否决，未经实测，失效时退回 DOM。Never search prompt/answer text for ids.
  function requestIdentity(bodyText) {
    try {
      const outer = JSON.parse(new URLSearchParams(bodyText).get('f.req'));
      const inner = JSON.parse(outer[1]);
      const prompt = inner[0][0];
      return typeof prompt === 'string' ? { prompt } : {};
    } catch {
      return {};
    }
  }

  function responseConversationId(text) {
    let found = null;
    for (const line of String(text || '').split('\n')) {
      if (!line.trimStart().startsWith('[[')) continue;
      try {
        const rows = JSON.parse(line);
        for (const row of rows) {
          if (row[0] !== 'wrb.fr' || typeof row[2] !== 'string') continue;
          const payload = JSON.parse(row[2]);
          const id = payload?.[1]?.[0];
          if (typeof id !== 'string' || !/^c_[a-f0-9]{16}$/.test(id)) continue;
          if (found && found !== id.slice(2)) return null;
          found = id.slice(2);
        }
      } catch {
        /* Unknown frames provide no veto; DOM remains authoritative. */
      }
    }
    return found;
  }

  function errorOutcome(error) {
    return error?.name === 'AbortError' ? 'cancelled' : 'failed';
  }

  function postComplete(requestId, url, startedAt, outcome, responseText) {
    if (!activeRequests.has(requestId)) return;
    if (activeRequests.get(requestId)) outcome = 'cancelled';
    activeRequests.delete(requestId);
    const duration = Date.now() - startedAt;
    post('request-complete', {
      requestId,
      url,
      duration,
      outcome,
      // A fast successful generation is still a completed answer; elapsed time is not evidence.
      shouldNotify: outcome === 'success',
      conversationId: responseConversationId(responseText),
    });
  }

  if (typeof window.fetch === 'function') {
    const originalFetch = window.fetch;
    window.fetch = function gvFetch(input, init) {
      const url = getUrl(input);
      const bodyText = getBodyText(init);
      const isCandidate = isGeminiGenerationRequest(url, bodyText);
      const requestId = nextRequestId++;
      const startedAt = Date.now();

      if (isCandidate) {
        activeRequests.set(requestId, false);
        post('request-start', {
          requestId,
          url,
          pageUrl: location.href,
          ...requestIdentity(bodyText),
        });
      }

      let result;
      try {
        result = originalFetch.apply(this, arguments);
      } catch (error) {
        if (isCandidate) postComplete(requestId, url, startedAt, errorOutcome(error));
        throw error;
      }
      return result.then(
        function (response) {
          if (!isCandidate) return response;
          if (!response?.ok || !response.body || typeof response.clone !== 'function') {
            postComplete(requestId, url, startedAt, 'failed');
            return response;
          }

          try {
            response
              .clone()
              .text()
              .then(
                function (text) {
                  postComplete(requestId, url, startedAt, 'success', text);
                },
                function (error) {
                  postComplete(requestId, url, startedAt, errorOutcome(error));
                },
              );
          } catch (error) {
            postComplete(requestId, url, startedAt, errorOutcome(error));
          }

          return response;
        },
        function (error) {
          if (isCandidate) {
            postComplete(requestId, url, startedAt, errorOutcome(error));
          }
          throw error;
        },
      );
    };
  }

  if (typeof window.XMLHttpRequest === 'function') {
    const OriginalXMLHttpRequest = window.XMLHttpRequest;

    window.XMLHttpRequest = function gvXMLHttpRequest() {
      const xhr = new OriginalXMLHttpRequest();
      let requestUrl = '';

      const originalOpen = xhr.open;
      xhr.open = function gvXhrOpen(_method, url) {
        requestUrl = toAbsoluteUrl(url);
        return originalOpen.apply(xhr, arguments);
      };

      const originalSend = xhr.send;
      xhr.send = function gvXhrSend(body) {
        const bodyText = typeof body === 'string' ? body : '';
        const isCandidate = isGeminiGenerationRequest(requestUrl, bodyText);
        const requestId = nextRequestId++;
        const startedAt = Date.now();
        const url = requestUrl;
        let cancelled = false;
        let finished = false;
        const onAbort = function () {
          cancelled = true;
        };
        const finish = function (forcedOutcome) {
          if (finished) return;
          finished = true;
          xhr.removeEventListener('abort', onAbort);
          xhr.removeEventListener('loadend', onLoadEnd);
          const outcome =
            forcedOutcome ||
            (cancelled
              ? 'cancelled'
              : xhr.status >= 200 && xhr.status < 300
                ? 'success'
                : 'failed');
          let text = '';
          try {
            text = xhr.responseText;
          } catch {
            // Non-text responseTypes throw here; the identity hint is optional, the outcome is not.
          }
          postComplete(requestId, url, startedAt, outcome, text);
        };
        const onLoadEnd = function () {
          finish();
        };

        if (isCandidate) {
          activeRequests.set(requestId, false);
          post('request-start', {
            requestId,
            url,
            pageUrl: location.href,
            ...requestIdentity(bodyText),
          });
          xhr.addEventListener('abort', onAbort, { once: true });
          // loadend also follows abort/error/timeout: only a successful HTTP status may notify.
          xhr.addEventListener('loadend', onLoadEnd, { once: true });
        }

        try {
          return originalSend.apply(xhr, arguments);
        } catch (error) {
          if (isCandidate) finish(errorOutcome(error));
          throw error;
        }
      };

      return xhr;
    };
    // Page code reads XMLHttpRequest.DONE and checks instanceof; keep the native constructor's statics and prototype.
    Object.setPrototypeOf(window.XMLHttpRequest, OriginalXMLHttpRequest);
    window.XMLHttpRequest.prototype = OriginalXMLHttpRequest.prototype;
  }
})();
