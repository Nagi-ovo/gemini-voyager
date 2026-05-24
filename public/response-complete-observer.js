(function () {
  if (window.__gvResponseCompleteObserverInstalled) return;
  window.__gvResponseCompleteObserverInstalled = true;

  const SOURCE = 'gemini-voyager-response-complete-observer';
  const MIN_REQUEST_DURATION_MS = 800;
  let nextRequestId = 1;

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

    const haystack = `${absoluteUrl}\n${bodyText}`.toLowerCase();
    return (
      haystack.includes('streamgenerate') ||
      haystack.includes('bardfrontendservice') ||
      haystack.includes('generatecontent') ||
      haystack.includes('assistant.lamda') ||
      (normalizedUrl.includes('batchexecute') && haystack.includes('f.req'))
    );
  }

  function post(type, payload) {
    try {
      window.postMessage({ source: SOURCE, type, payload }, window.location.origin);
    } catch {}
  }

  function postComplete(requestId, url, startedAt) {
    const duration = Date.now() - startedAt;
    post('request-complete', {
      requestId,
      url,
      duration,
      shouldNotify: duration >= MIN_REQUEST_DURATION_MS,
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
        post('request-start', { requestId, url });
      }

      return originalFetch.apply(this, arguments).then(
        function (response) {
          if (!isCandidate) return response;
          if (!response || !response.body || typeof response.clone !== 'function') {
            postComplete(requestId, url, startedAt);
            return response;
          }

          try {
            response
              .clone()
              .arrayBuffer()
              .then(
                function () {
                  postComplete(requestId, url, startedAt);
                },
                function () {
                  postComplete(requestId, url, startedAt);
                },
              );
          } catch {
            postComplete(requestId, url, startedAt);
          }

          return response;
        },
        function (error) {
          if (isCandidate) {
            postComplete(requestId, url, startedAt);
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
      let isCandidate = false;
      let requestId = 0;
      let startedAt = 0;

      const originalOpen = xhr.open;
      xhr.open = function gvXhrOpen(_method, url) {
        requestUrl = toAbsoluteUrl(url);
        return originalOpen.apply(xhr, arguments);
      };

      const originalSend = xhr.send;
      xhr.send = function gvXhrSend(body) {
        const bodyText = typeof body === 'string' ? body : '';
        isCandidate = isGeminiGenerationRequest(requestUrl, bodyText);
        requestId = nextRequestId++;
        startedAt = Date.now();

        if (isCandidate) {
          post('request-start', { requestId, url: requestUrl });
        }

        xhr.addEventListener(
          'loadend',
          function () {
            if (!isCandidate) return;
            postComplete(requestId, requestUrl, startedAt);
          },
          { once: true },
        );

        return originalSend.apply(xhr, arguments);
      };

      return xhr;
    };
  }
})();
