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
 * - conversation: GET /backend-api/conversations/<id>, reported as
 *   { conversationId, currentNode }, the message the conversation ends on.
 *
 * The sidebar asks while the page loads, before the content script can arm
 * this: every report is kept for the document's life and posted again on arm.
 * Only ids and names leave the page, bounded in count and length.
 *
 * - route: the page's router called history.pushState or replaceState. The
 *   bridge's waits wake on it (a hidden tab's timers can sleep a minute); it
 *   carries nothing, and the call itself goes through unchanged.
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
  var CONVERSATION_PATH = /^\/backend-api\/conversations\/([0-9a-f-]{36})$/;
  var PROJECT_ID = /^g-p-[0-9a-f]{32}$/;
  var MAX_PROJECTS = 500;
  var MAX_FILES = 1000;
  var MAX_NAME = 512;
  var MAX_KEPT = 64;

  var armed = false;
  var originalFetch = window.fetch;
  // The sidebar's pages so far: the cursor the next page must be asked with, and the rows.
  var sidebar = null;
  var projects = null;
  var files = {};
  var fileOrder = [];
  var conversations = {};
  var conversationOrder = [];

  function post(type, payload) {
    try {
      window.postMessage({ source: OUT, type: type, payload: payload }, location.origin);
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

  function readConversation(conversationId, data) {
    if (!isObject(data) || typeof data.current_node !== 'string' || !data.current_node) return;
    if (data.current_node.length > MAX_NAME) return;
    var report = { conversationId: conversationId, currentNode: data.current_node };
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
