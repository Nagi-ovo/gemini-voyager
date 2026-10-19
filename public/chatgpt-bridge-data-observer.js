/**
 * ChatGPT page data observer for the Local Bridge (page world, document_start).
 *
 * The bridge's ops must not take a list that is still loading for the whole
 * list. ChatGPT's own responses say when a list is whole, so this reads clones
 * of four of them; it never sends a request, never changes one, and returns
 * the page's own promise. Measured on chatgpt.com 2026-10-18:
 *
 * - projects: GET /backend-api/gizmos/snorlax/sidebar, pages of 20 chained by
 *   `cursor`; the list is whole once a page answers `cursor: null`.
 *   Reported as { projects: [{ projectId, name }], complete }.
 * - files: a project's whole file list, from GET /backend-api/gizmos/<g-p-id>
 *   (`files`) and from the answers to an upload or a removal,
 *   POST /backend-api/projects/<g-p-id>/files and DELETE …/files/<file id>
 *   (`resource.files`): the page updates itself from those without asking
 *   again. Reported as { projectId, names, source: 'project' }. A sidebar page
 *   also lists each project's files; those are reported with
 *   source: 'sidebar' until the project's own list arrives.
 * - conversation: GET /backend-api/conversation(s)/<id>, reported as
 *   { conversationId, currentNode, messages }: the message the conversation
 *   ends on, and the branch that leads to it, oldest first, as
 *   { id, role, links }. `links` are the `[label](sandbox:/mnt/data/…)`
 *   Markdown links of an assistant's final-channel text (a file ChatGPT's
 *   python tool wrote); no other text of a message leaves the page.
 *
 * The sidebar asks while the page loads, before the content script can arm
 * this: every report is kept for the document's life and posted again on arm.
 * Only ids and names leave the page, bounded in count and length.
 *
 * - route: the page's router called history.pushState or replaceState. The
 *   bridge's waits wake on it (a hidden tab's timers can sleep a minute); it
 *   carries nothing, and the call itself goes through unchanged.
 *
 * One request of its own, and only when `files.download` asks (`download`):
 * GET /backend-api/conversation/<id>/interpreter/download?message_id=&
 * sandbox_path= with the headers of the page's last backend-api GET, then
 * GET of the same-origin `download_url` it answers, with the page's cookies.
 * On 401 the token is refreshed from GET /api/auth/session, as the page does.
 * The headers and the token stay in this closure: the reply carries only the
 * bytes (transferred), the file's name and type, and the message id that
 * answered. A message id ChatGPT answers 404 for ("Library file not found",
 * measured 2026-10-19 on the very message holding the link) is followed by
 * the next one the bridge names.
 *
 * Validation and use live in
 * src/features/plugins/builtin/chatgptLocalBridge/pageData/.
 */
(function () {
  'use strict';
  // Firefox before 128 refuses the MAIN-world registration. Should a browser still run this
  // as an isolated content script, its `fetch` is not the page's: stay silent.
  if (typeof window.wrappedJSObject !== 'undefined') return;
  if (window.__gvChatGptBridgeDataObserver) return;
  window.__gvChatGptBridgeDataObserver = true;

  // Repeated in src/features/plugins/builtin/chatgptLocalBridge/pageData/protocol.ts.
  var OUT = 'gv-chatgpt-bridge-data-observer';
  var IN = 'gv-chatgpt-bridge-data';
  var SIDEBAR_PATH = '/backend-api/gizmos/snorlax/sidebar';
  var PROJECT_PATH = /^\/backend-api\/gizmos\/(g-p-[0-9a-f]{32})$/;
  var PROJECT_FILES_PATH = /^\/backend-api\/projects\/(g-p-[0-9a-f]{32})\/files(?:\/[^/]+)?$/;
  var CONVERSATION_PATH = /^\/backend-api\/conversations?\/([0-9a-f-]{36})$/;
  var BACKEND_PREFIX = '/backend-api/';
  var SESSION_PATH = '/api/auth/session';
  var SANDBOX_DIR = '/mnt/data/';
  var SANDBOX_LINK = /\[([^\]\n]*)\]\((sandbox:\/mnt\/data\/[^)\n]+)\)/g;
  var REQUEST_ID = /^[A-Za-z0-9-]{1,64}$/;
  // Headers that belong to one request, not to the page's session.
  var REQUEST_OWN_HEADER =
    /^(?:content-type|content-length|openai-sentinel-.*|x-openai-target-.*)$/;
  var PROJECT_ID = /^g-p-[0-9a-f]{32}$/;
  var MAX_PROJECTS = 500;
  var MAX_FILES = 1000;
  var MAX_NAME = 512;
  var MAX_KEPT = 64;
  var MAX_MESSAGES = 2000;
  var MAX_LINKS = 100;
  var MAX_HREF = 2048;
  var MAX_LABEL = 1000;
  var MAX_ROLE = 32;
  var MAX_TRIED_IDS = 64;

  var armed = false;
  var originalFetch = window.fetch;
  // The sidebar's pages so far: the cursor the next page must be asked with, and the rows.
  var sidebar = null;
  var projects = null;
  var files = {};
  var fileOrder = [];
  var conversations = {};
  var conversationOrder = [];
  // The last backend-api GET's headers (authorization and the client's own); never posted.
  var pageHeaders = null;
  var downloads = {};

  function post(type, payload, transfer) {
    try {
      var message = { source: OUT, type: type, payload: payload };
      if (transfer) window.postMessage(message, location.origin, transfer);
      else window.postMessage(message, location.origin);
    } catch (e) {}
  }

  function replay() {
    if (projects) post('projects', projects);
    for (var i = 0; i < fileOrder.length; i += 1) post('files', files[fileOrder[i]]);
    for (var j = 0; j < conversationOrder.length; j += 1) {
      post('conversation', conversations[conversationOrder[j]]);
    }
  }

  window.addEventListener('message', function (event) {
    if (event.source !== window) return;
    var data = event.data;
    if (!data || data.source !== IN) return;
    if (data.type === 'arm') {
      armed = true;
      // Tells the bridge this browser runs the observer; then everything kept so far.
      post('armed', {});
      replay();
    } else if (data.type === 'disarm') {
      armed = false;
    } else if (data.type === 'download') {
      startDownload(data.payload);
    } else if (data.type === 'download-cancel') {
      var id = isObject(data.payload) ? data.payload.requestId : null;
      var running = typeof id === 'string' ? downloads[id] : null;
      if (running && running.abort) running.abort();
    }
  });

  function isObject(value) {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
  }

  function name(value) {
    return typeof value === 'string' && value.length > 0 && value.length <= MAX_NAME ? value : null;
  }

  /** Keep the newest `MAX_KEPT` entries of a table, oldest first in `order`. */
  function keep(table, order, key, value) {
    var at = order.indexOf(key);
    if (at >= 0) order.splice(at, 1);
    order.push(key);
    table[key] = value;
    while (order.length > MAX_KEPT) delete table[order.shift()];
  }

  /** A file list's names, or null when the list is not one. */
  function fileNames(list) {
    if (!Array.isArray(list) || list.length > MAX_FILES) return null;
    var names = [];
    for (var i = 0; i < list.length; i += 1) {
      var entry = isObject(list[i]) ? name(list[i].name) : null;
      if (entry === null) return null;
      names.push(entry);
    }
    return names;
  }

  function reportFiles(projectId, list, source) {
    var names = fileNames(list);
    if (names === null) return;
    // A sidebar page is older news than the project's own answer.
    if (source === 'sidebar' && files[projectId] && files[projectId].source === 'project') return;
    var report = { projectId: projectId, names: names, source: source };
    keep(files, fileOrder, projectId, report);
    if (armed) post('files', report);
  }

  function readSidebar(data, cursorAsked) {
    if (!isObject(data) || !Array.isArray(data.items)) return;
    if (cursorAsked === null) {
      sidebar = { next: undefined, rows: [] };
    } else if (!sidebar || sidebar.next !== cursorAsked) {
      // A page out of the chain the first page started: the list cannot be called whole.
      sidebar = null;
      return;
    }
    for (var i = 0; i < data.items.length; i += 1) {
      var item = data.items[i];
      var gizmo = isObject(item) && isObject(item.gizmo) ? item.gizmo : null;
      var inner = gizmo && isObject(gizmo.gizmo) ? gizmo.gizmo : null;
      var id = inner && typeof inner.id === 'string' && PROJECT_ID.test(inner.id) ? inner.id : null;
      var title = inner && isObject(inner.display) ? name(inner.display.name) : null;
      if (id === null || title === null) continue;
      if (sidebar.rows.length < MAX_PROJECTS) sidebar.rows.push({ projectId: id, name: title });
      reportFiles(id, gizmo.files, 'sidebar');
    }
    sidebar.next = typeof data.cursor === 'string' && data.cursor ? data.cursor : null;
    projects = {
      projects: sidebar.rows.slice(),
      complete: data.cursor === null && sidebar.rows.length < MAX_PROJECTS,
    };
    if (armed) post('projects', projects);
  }

  /** The sandbox links of an assistant's final-channel text, or none. */
  function sandboxLinks(message) {
    var links = [];
    if (!isObject(message) || !isObject(message.author) || message.author.role !== 'assistant') {
      return links;
    }
    // Reasoning and tool chatter use other channels; a reply of a model without channels has none.
    if (message.channel !== 'final' && message.channel != null) return links;
    var parts = isObject(message.content) ? message.content.parts : null;
    if (!Array.isArray(parts)) return links;
    for (var i = 0; i < parts.length && links.length < MAX_LINKS; i += 1) {
      if (typeof parts[i] !== 'string') continue;
      SANDBOX_LINK.lastIndex = 0;
      var match;
      while ((match = SANDBOX_LINK.exec(parts[i])) !== null && links.length < MAX_LINKS) {
        var href = match[2].trim();
        if (href.length > MAX_HREF) continue;
        links.push({ label: match[1].slice(0, MAX_LABEL), href: href });
      }
    }
    return links;
  }

  /** One message as the bridge sees it: its id, its role and its sandbox links. */
  function messageSummary(id, message) {
    var author = message && isObject(message.author) ? message.author : null;
    var role = author && typeof author.role === 'string' ? author.role.slice(0, MAX_ROLE) : '';
    return { id: id, role: role, links: sandboxLinks(message) };
  }

  /**
   * The branch that ends at `current_node`, oldest first: ids, roles and sandbox links.
   * The page's `conversations/<id>?num_turns=` answer lists that branch as `messages`
   * (measured 2026-10-19); `conversation/<id>` keeps the older `mapping` tree.
   */
  function branchMessages(data) {
    if (Array.isArray(data.messages)) {
      var listed = [];
      for (var i = 0; i < data.messages.length && listed.length < MAX_MESSAGES; i += 1) {
        var entry = data.messages[i];
        if (isObject(entry) && name(entry.id) !== null)
          listed.push(messageSummary(entry.id, entry));
      }
      return listed;
    }
    if (!isObject(data.mapping)) return null;
    var branch = [];
    var seen = {};
    var id = data.current_node;
    while (name(id) !== null && !seen[id] && branch.length < MAX_MESSAGES) {
      seen[id] = true;
      var node = data.mapping[id];
      if (!isObject(node)) break;
      branch.push(messageSummary(id, isObject(node.message) ? node.message : null));
      id = node.parent;
    }
    return branch.reverse();
  }

  function readConversation(conversationId, data) {
    if (!isObject(data) || typeof data.current_node !== 'string' || !data.current_node) return;
    if (data.current_node.length > MAX_NAME) return;
    var report = { conversationId: conversationId, currentNode: data.current_node };
    var messages = branchMessages(data);
    if (messages) report.messages = messages;
    keep(conversations, conversationOrder, conversationId, report);
    if (armed) post('conversation', report);
  }

  /** What to read from this request's answer, or null for a request this ignores. */
  function readerFor(input, init) {
    var raw = typeof input === 'string' ? input : input && input.url ? input.url : String(input);
    var url = new URL(raw, location.href);
    if (url.origin !== location.origin) return null;
    var method = String(
      (init && init.method) || (input && typeof input === 'object' && input.method) || 'GET',
    ).toUpperCase();
    var path = url.pathname;
    var match;
    if (method === 'GET' && path === SIDEBAR_PATH) {
      var cursor = url.searchParams.get('cursor');
      return function (data) {
        readSidebar(data, cursor);
      };
    }
    if (method === 'GET' && (match = PROJECT_PATH.exec(path))) {
      var shown = match[1];
      return function (data) {
        if (isObject(data)) reportFiles(shown, data.files, 'project');
      };
    }
    if ((method === 'POST' || method === 'DELETE') && (match = PROJECT_FILES_PATH.exec(path))) {
      var changed = match[1];
      return function (data) {
        if (isObject(data) && isObject(data.resource)) {
          reportFiles(changed, data.resource.files, 'project');
        }
      };
    }
    if (method === 'GET' && (match = CONVERSATION_PATH.exec(path))) {
      var conversationId = match[1];
      return function (data) {
        readConversation(conversationId, data);
      };
    }
    return null;
  }

  function ignore() {}

  /** A request's headers as lowercase name → value, from `init` or the `Request`. */
  function headersOf(input, init) {
    var source = init && init.headers ? init.headers : null;
    if (!source && input && typeof input === 'object' && input.headers) source = input.headers;
    if (!source) return null;
    var out = {};
    if (Array.isArray(source)) {
      for (var i = 0; i < source.length; i += 1) {
        if (Array.isArray(source[i]) && source[i].length === 2) {
          out[String(source[i][0]).toLowerCase()] = String(source[i][1]);
        }
      }
    } else if (typeof source.forEach === 'function') {
      source.forEach(function (value, key) {
        out[String(key).toLowerCase()] = String(value);
      });
    } else if (isObject(source)) {
      for (var key in source) {
        if (Object.prototype.hasOwnProperty.call(source, key)) {
          out[key.toLowerCase()] = String(source[key]);
        }
      }
    }
    return out;
  }

  /** Keep the session headers of the page's backend-api GETs for `download`. */
  function noteHeaders(input, init) {
    var raw = typeof input === 'string' ? input : input && input.url ? input.url : String(input);
    var url = new URL(raw, location.href);
    if (url.origin !== location.origin || url.pathname.indexOf(BACKEND_PREFIX) !== 0) return;
    var method = String(
      (init && init.method) || (input && typeof input === 'object' && input.method) || 'GET',
    ).toUpperCase();
    if (method !== 'GET') return;
    var headers = headersOf(input, init);
    if (!headers || !headers.authorization) return;
    var kept = {};
    for (var key in headers) {
      if (!REQUEST_OWN_HEADER.test(key)) kept[key] = headers[key];
    }
    pageHeaders = kept;
  }

  function sessionHeaders() {
    var copy = {};
    for (var key in pageHeaders || {}) copy[key] = pageHeaders[key];
    return copy;
  }

  /** A fresh access token, as the page asks for one; null when the session has none. */
  function refreshToken(signal) {
    return originalFetch
      .call(window, SESSION_PATH, { credentials: 'include', signal: signal })
      .then(function (response) {
        return response.ok ? response.json() : null;
      })
      .then(function (session) {
        var token = isObject(session) ? session.accessToken : null;
        return typeof token === 'string' && token ? token : null;
      })
      .catch(function () {
        return null;
      });
  }

  /** ChatGPT's answer for one message id: { status, data } with the JSON of a 200. */
  function askDownload(request, messageId, signal, refreshed) {
    var url =
      '/backend-api/conversation/' +
      encodeURIComponent(request.conversationId) +
      '/interpreter/download?message_id=' +
      encodeURIComponent(messageId) +
      '&sandbox_path=' +
      encodeURIComponent(request.sandboxPath);
    return originalFetch
      .call(window, url, {
        method: 'GET',
        headers: sessionHeaders(),
        credentials: 'include',
        signal: signal,
      })
      .then(function (response) {
        if (response.status === 401 && !refreshed) {
          return refreshToken(signal).then(function (token) {
            if (!token) return { status: 401 };
            pageHeaders = sessionHeaders();
            pageHeaders.authorization = 'Bearer ' + token;
            return askDownload(request, messageId, signal, true);
          });
        }
        if (!response.ok) return { status: response.status };
        return response.json().then(
          function (data) {
            return { status: 200, data: data };
          },
          function () {
            return { status: 200, data: null };
          },
        );
      });
  }

  /** The first message id that answers 200, or why none did. */
  function locate(request, index, signal) {
    if (index >= request.messageIds.length) {
      return Promise.resolve({ fail: 'not-found', tried: index });
    }
    var messageId = request.messageIds[index];
    return askDownload(request, messageId, signal, false).then(function (answer) {
      if (answer.status === 404) return locate(request, index + 1, signal);
      if (answer.status === 401) return { fail: 'unauthorized', status: 401 };
      if (answer.status !== 200) return { fail: 'http', status: answer.status };
      var data = answer.data;
      if (!isObject(data) || typeof data.download_url !== 'string' || !data.download_url) {
        return { fail: 'bad-answer' };
      }
      return { found: data, messageId: messageId, tried: index + 1 };
    });
  }

  function fetchBytes(request, located, signal) {
    var data = located.found;
    var target = new URL(data.download_url, location.href);
    // Cookies go to ChatGPT's own origin only.
    if (target.origin !== location.origin) return Promise.resolve({ fail: 'off-origin' });
    var declared = data.file_size_bytes;
    if (typeof declared === 'number' && declared > request.maxBytes) {
      return Promise.resolve({ fail: 'too-large', size: declared });
    }
    return originalFetch
      .call(window, target.href, { method: 'GET', credentials: 'include', signal: signal })
      .then(function (response) {
        if (!response.ok) return { fail: 'http', status: response.status };
        var length = Number(response.headers.get('content-length'));
        if (length > request.maxBytes) return { fail: 'too-large', size: length };
        return response.arrayBuffer().then(function (bytes) {
          if (bytes.byteLength > request.maxBytes) {
            return { fail: 'too-large', size: bytes.byteLength };
          }
          var mime = typeof data.mime_type === 'string' ? data.mime_type : null;
          return {
            bytes: bytes,
            name: typeof data.file_name === 'string' ? data.file_name.slice(0, MAX_NAME) : null,
            mime: (mime || response.headers.get('content-type') || '').slice(0, 255) || null,
            messageId: located.messageId,
            tried: located.tried,
          };
        });
      });
  }

  /** The request `files.download` posted, checked; null when it is not one. */
  function readDownloadRequest(raw) {
    if (!isObject(raw) || typeof raw.requestId !== 'string' || !REQUEST_ID.test(raw.requestId)) {
      return null;
    }
    var ids = raw.messageIds;
    if (!Array.isArray(ids) || ids.length === 0 || ids.length > MAX_TRIED_IDS) return null;
    for (var i = 0; i < ids.length; i += 1) if (name(ids[i]) === null) return null;
    if (name(raw.conversationId) === null) return null;
    var path = raw.sandboxPath;
    if (typeof path !== 'string' || path.indexOf(SANDBOX_DIR) !== 0 || path.length > MAX_HREF) {
      return null;
    }
    var maxBytes = raw.maxBytes;
    if (typeof maxBytes !== 'number' || !(maxBytes > 0)) return null;
    return {
      requestId: raw.requestId,
      conversationId: raw.conversationId,
      messageIds: ids.slice(),
      sandboxPath: path,
      maxBytes: maxBytes,
    };
  }

  function startDownload(raw) {
    var request = readDownloadRequest(raw);
    if (!request || downloads[request.requestId]) return;
    var controller = typeof AbortController === 'function' ? new AbortController() : null;
    var signal = controller ? controller.signal : undefined;
    downloads[request.requestId] = controller || {};
    var reply = function (payload, transfer) {
      delete downloads[request.requestId];
      payload.requestId = request.requestId;
      post('download', payload, transfer);
    };
    locate(request, 0, signal)
      .then(function (located) {
        return located.fail ? located : fetchBytes(request, located, signal);
      })
      .then(
        function (result) {
          if (result.fail) {
            var failure = { ok: false, reason: result.fail };
            if (typeof result.status === 'number') failure.status = result.status;
            if (typeof result.tried === 'number') failure.tried = result.tried;
            if (typeof result.size === 'number') failure.size = result.size;
            reply(failure);
            return;
          }
          reply(
            {
              ok: true,
              bytes: result.bytes,
              name: result.name,
              mime: result.mime,
              messageId: result.messageId,
              tried: result.tried,
            },
            [result.bytes],
          );
        },
        function () {
          reply({ ok: false, reason: signal && signal.aborted ? 'cancelled' : 'network' });
        },
      );
  }

  function watch(result, read) {
    if (!result || typeof result.then !== 'function') return;
    // Observe through a derived promise: the page's own promise keeps its handling state.
    result.then(function (response) {
      try {
        if (!response || !response.ok || typeof response.clone !== 'function') return;
        response
          .clone()
          .json()
          .then(function (data) {
            try {
              read(data);
            } catch (e) {}
          })
          .catch(ignore);
      } catch (e) {}
    }, ignore);
  }

  if (typeof originalFetch === 'function') {
    window.fetch = function (input, init) {
      var read = null;
      try {
        read = readerFor(input, init);
      } catch (e) {
        read = null;
      }
      try {
        noteHeaders(input, init);
      } catch (e) {}
      var result = originalFetch.apply(this, arguments);
      if (read) {
        try {
          watch(result, read);
        } catch (e) {}
      }
      return result;
    };
  }

  /** Report a route change after the page's own call, which returns as it would. */
  function watchHistory(method) {
    var original = history[method];
    if (typeof original !== 'function') return;
    history[method] = function () {
      var result = original.apply(this, arguments);
      if (armed) post('route', {});
      return result;
    };
  }
  try {
    watchHistory('pushState');
    watchHistory('replaceState');
  } catch (e) {}

  // A content script that started first is waiting for this to arm it.
  post('ready');
})();
