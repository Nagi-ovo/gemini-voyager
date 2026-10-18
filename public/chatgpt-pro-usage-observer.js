/**
 * ChatGPT Pro usage observer (page world, document_start).
 *
 * Reports what the page's own requests already carry; it never sends a
 * request and never changes one. Every call is forwarded once, with its
 * original arguments, and its original promise is returned. It stays inert
 * until the Voyager content script arms it, and goes inert again on disarm,
 * so a registration that outlives the plugin switch costs nothing.
 *
 * - account: the first same-origin /backend-api/ request naming one, and
 *   any later one whose chatgpt-account-id header changed, reports a hash of
 *   that header. send and quota carry it too: the request's own, else the
 *   last one seen, else null.
 * - send: a same-origin 2xx POST to /backend-api/f/conversation or
 *   /backend-api/conversation, reported as { account, model, mode, key, at }.
 *   The key is a hash of conversation id + last message id. No id or header
 *   value leaves the page, only hashes.
 * - quota: a /backend-api/conversation/init response with a non-empty
 *   model_limits or blocked_features, reported as those two lists.
 * - plan: a GET /backend-api/accounts/check/… response, reported as
 *   { account, planType, subscriptionPlan } for the account the page uses:
 *   account.plan_type and entitlement.subscription_plan, nothing else. The
 *   page asks for it once while loading, before the content script can arm
 *   this, so that one request is watched before arming (only until a plan is
 *   seen) and its plan is posted on arm.
 *
 * Which model counts as Pro is decided by the content script
 * (src/features/plugins/builtin/chatgptProUsage/usageStore.ts).
 */
(function () {
  'use strict';
  if (window.__gvChatGptProUsageObserver) return;
  window.__gvChatGptProUsageObserver = true;

  // Repeated in src/features/plugins/builtin/chatgptProUsage/protocol.ts.
  var OUT = 'gv-chatgpt-pro-usage-observer';
  var IN = 'gv-chatgpt-pro-usage';
  var SEND_PATH = /^\/backend-api\/(?:f\/)?conversation\/?$/;
  var INIT_PATH = '/backend-api/conversation/init';
  var MAX_BODY_CHARS = 1000000;
  var MAX_LIST = 32;
  var MAX_MODEL = 100;

  var ACCOUNT_HEADER = 'chatgpt-account-id';
  var API_PREFIX = '/backend-api/';
  var CHECK_PATH = /^\/backend-api\/accounts\/check(?:\/[^/]+)?\/?$/;
  var MAX_ACCOUNTS = 16;

  var armed = false;
  // The account hash last reported; undefined until one is seen while armed.
  var lastAccount;
  // The last plan seen, posted again on each arm.
  var lastPlan = null;
  var originalFetch = window.fetch;

  function post(type, payload) {
    try {
      window.postMessage({ source: OUT, type: type, payload: payload }, location.origin);
    } catch (e) {}
  }

  window.addEventListener('message', function (event) {
    if (event.source !== window) return;
    var data = event.data;
    if (!data || data.source !== IN) return;
    if (data.type === 'arm') {
      armed = true;
      post('ready', lastAccount === undefined ? undefined : { account: lastAccount });
      if (lastPlan) post('plan', lastPlan);
    } else if (data.type === 'disarm') {
      armed = false;
    }
  });

  function sameOriginPath(input) {
    try {
      var raw = typeof input === 'string' ? input : input && input.url ? input.url : String(input);
      var url = new URL(raw, location.href);
      return url.origin === location.origin ? url.pathname : null;
    } catch (e) {
      return null;
    }
  }

  function methodOf(input, init) {
    var method = (init && init.method) || (input && typeof input === 'object' && input.method);
    return String(method || 'GET').toUpperCase();
  }

  function hash(text) {
    var h = 0x811c9dc5;
    for (var i = 0; i < text.length; i += 1) {
      h ^= text.charCodeAt(i);
      h = Math.imul(h, 0x01000193);
    }
    return ('0000000' + (h >>> 0).toString(16)).slice(-8);
  }

  function accountOf(input, init) {
    try {
      var source = init && init.headers ? init.headers : input && input.headers;
      var value = source ? new Headers(source).get(ACCOUNT_HEADER) : null;
      return value ? hash(value) : null;
    } catch (e) {
      return null;
    }
  }

  function readBody(input, init) {
    if (init && typeof init.body === 'string') return Promise.resolve(init.body);
    if (init && init.body != null) return Promise.resolve(null);
    if (input && typeof input === 'object' && typeof input.clone === 'function') {
      try {
        return input
          .clone()
          .text()
          .catch(function () {
            return null;
          });
      } catch (e) {}
    }
    return Promise.resolve(null);
  }

  function readSend(body) {
    if (typeof body !== 'string' || body.length > MAX_BODY_CHARS) return null;
    var data;
    try {
      data = JSON.parse(body);
    } catch (e) {
      return null;
    }
    if (!data || typeof data.model !== 'string' || !data.model || data.model.length > MAX_MODEL) {
      return null;
    }
    var mode = data.conversation_mode && data.conversation_mode.kind;
    if (typeof mode !== 'string' || !mode) mode = data.conversation_mode_kind;
    var messages = Array.isArray(data.messages) ? data.messages : [];
    var last = messages[messages.length - 1];
    var id = (last && (last.id || (last.message && last.message.id))) || null;
    return {
      model: data.model,
      mode: typeof mode === 'string' && mode && mode.length <= MAX_MODEL ? mode : null,
      key:
        typeof id === 'string' && id
          ? hash(
              (typeof data.conversation_id === 'string' ? data.conversation_id : 'new') + ':' + id,
            )
          : null,
    };
  }

  function ignore() {}

  // Observe through a derived promise: the page's own promise keeps its handling state.
  function onResponse(result, onOk) {
    if (!result || typeof result.then !== 'function') return;
    result.then(function (response) {
      try {
        if (response && response.ok) onOk(response);
      } catch (e) {}
    }, ignore);
  }

  function watchSend(result, bodyPromise, account) {
    onResponse(result, function () {
      var at = Date.now();
      bodyPromise
        .then(function (body) {
          var send = readSend(body);
          if (!send || !armed) return;
          post('send', {
            account: account,
            model: send.model,
            mode: send.mode,
            key: send.key,
            at: at,
          });
        })
        .catch(ignore);
    });
  }

  function list(value) {
    return Array.isArray(value) ? value.slice(0, MAX_LIST) : [];
  }

  function watchInit(result, account) {
    onResponse(result, function (response) {
      if (typeof response.clone !== 'function') return;
      response
        .clone()
        .json()
        .then(function (data) {
          if (!data || typeof data !== 'object') return;
          var modelLimits = list(data.model_limits);
          var blockedFeatures = list(data.blocked_features);
          if (!armed || (!modelLimits.length && !blockedFeatures.length)) return;
          // Round-trip through JSON so only plain data is posted.
          var lists = JSON.parse(
            JSON.stringify({ model_limits: modelLimits, blocked_features: blockedFeatures }),
          );
          post('quota', {
            account: account,
            model_limits: lists.model_limits,
            blocked_features: lists.blocked_features,
          });
        })
        .catch(ignore);
    });
  }

  function isObject(value) {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
  }

  function planText(value) {
    return typeof value === 'string' && value.length > 0 && value.length <= MAX_MODEL
      ? value
      : null;
  }

  // The check response lists accounts by id; pick the one this page uses.
  function readPlan(data, account) {
    if (!isObject(data) || !isObject(data.accounts)) return null;
    var keys = Object.keys(data.accounts).slice(0, MAX_ACCOUNTS);
    var entries = [];
    var seen = {};
    for (var i = 0; i < keys.length; i += 1) {
      var entry = data.accounts[keys[i]];
      if (!isObject(entry)) continue;
      var info = isObject(entry.account) ? entry.account : {};
      // The map may list one account twice (under its id and as "default").
      var id = typeof info.account_id === 'string' && info.account_id ? info.account_id : keys[i];
      var key = hash(id);
      if (seen[key]) continue;
      seen[key] = true;
      entries.push({ key: key, entry: entry });
    }
    var chosen = null;
    for (var j = 0; j < entries.length; j += 1) {
      if (account !== null && entries[j].key === account) chosen = entries[j].entry;
    }
    if (!chosen && entries.length === 1) chosen = entries[0].entry;
    if (!chosen) return null;
    var accountInfo = isObject(chosen.account) ? chosen.account : {};
    var entitlement = isObject(chosen.entitlement) ? chosen.entitlement : {};
    var planType = planText(accountInfo.plan_type);
    var subscriptionPlan = planText(entitlement.subscription_plan);
    if (planType === null && subscriptionPlan === null) return null;
    // Only these two strings and the account hash leave the page.
    return { account: account, planType: planType, subscriptionPlan: subscriptionPlan };
  }

  function watchCheck(result, account) {
    onResponse(result, function (response) {
      if (typeof response.clone !== 'function') return;
      response
        .clone()
        .json()
        .then(function (data) {
          var plan = readPlan(data, account);
          if (!plan) return;
          lastPlan = plan;
          if (armed) post('plan', plan);
        })
        .catch(ignore);
    });
  }

  function isCheck(input, init) {
    var path = sameOriginPath(input);
    return path !== null && CHECK_PATH.test(path) && methodOf(input, init) === 'GET';
  }

  function noteAccount(account) {
    if (account === lastAccount) return;
    lastAccount = account;
    post('account', { account: account });
  }

  if (typeof originalFetch === 'function') {
    window.fetch = function (input, init) {
      if (!armed) {
        // Before the first plan only, the page's own plan check is watched too.
        var early = false;
        var earlyAccount = null;
        try {
          early = !lastPlan && isCheck(input, init);
          if (early) earlyAccount = accountOf(input, init);
        } catch (e) {
          early = false;
        }
        var passed = originalFetch.apply(this, arguments);
        try {
          if (early) watchCheck(passed, earlyAccount);
        } catch (e) {}
        return passed;
      }
      var kind = null;
      var bodyPromise = null;
      var account = null;
      try {
        var path = sameOriginPath(input);
        if (path !== null && path.indexOf(API_PREFIX) === 0) {
          // Not every request names the account: one without the header keeps the last one seen.
          account = accountOf(input, init);
          if (account !== null) noteAccount(account);
          else if (lastAccount !== undefined) account = lastAccount;
        }
        if (path !== null && methodOf(input, init) === 'POST') {
          if (SEND_PATH.test(path)) {
            kind = 'send';
            // Read before forwarding: a Request body can be read only once.
            bodyPromise = readBody(input, init);
          } else if (path === INIT_PATH) {
            kind = 'init';
          }
        } else if (isCheck(input, init)) {
          kind = 'check';
        }
      } catch (e) {
        kind = null;
      }
      var result = originalFetch.apply(this, arguments);
      try {
        if (kind === 'send') watchSend(result, bodyPromise, account);
        else if (kind === 'init') watchInit(result, account);
        else if (kind === 'check') watchCheck(result, account);
      } catch (e) {}
      return result;
    };
  }

  // A content script that started first is waiting for this to arm us.
  post('ready');
})();
