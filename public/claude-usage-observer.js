/**
 * Claude usage observer.
 *
 * Runs in the page world so it can read Claude's event-stream responses. The
 * content script listens for the small message_limit payload and does all UI +
 * storage work itself.
 */
(function () {
  if (window.__gvClaudeUsageObserverInstalled) return;
  window.__gvClaudeUsageObserverInstalled = true;

  var SOURCE = 'gv-claude-usage-observer';
  var originalFetch = window.fetch;

  function postMessageLimit(payload) {
    try {
      window.postMessage(
        { source: SOURCE, type: 'message-limit', payload: payload },
        location.origin,
      );
    } catch (e) {}
  }

  async function handleEventStream(response) {
    try {
      var clone = response.clone();
      var reader = clone.body && clone.body.getReader && clone.body.getReader();
      if (!reader) return;
      var decoder = new TextDecoder();
      var buffer = '';

      while (true) {
        var chunk = await reader.read();
        if (chunk.done) break;
        buffer += decoder.decode(chunk.value, { stream: true });
        var lines = buffer.split(/\r\n|\r|\n/);
        buffer = lines.pop() || '';

        for (var i = 0; i < lines.length; i += 1) {
          var line = lines[i];
          if (line.indexOf('data:') !== 0) continue;
          var raw = line.slice(5).trim();
          if (!raw) continue;
          try {
            var json = JSON.parse(raw);
            if (json && json.type === 'message_limit' && json.message_limit) {
              postMessageLimit(json.message_limit);
            }
          } catch (e) {}
        }
      }
    } catch (e) {}
  }

  if (typeof originalFetch === 'function') {
    window.fetch = async function () {
      var response = await originalFetch.apply(window, arguments);
      try {
        var contentType = response.headers && response.headers.get('content-type');
        if (contentType && contentType.indexOf('event-stream') !== -1) {
          handleEventStream(response);
        }
      } catch (e) {}
      return response;
    };
  }
})();
