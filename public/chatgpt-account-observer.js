/**
 * ChatGPT account plan observer for the Local Bridge (page world, document_start).
 *
 * ChatGPT asks its own server for the account's plan when a page loads
 * (GET /backend-api/accounts/check/…, sent with the page's Authorization header).
 * This reads a clone of that response; it never sends a request, never changes
 * one, and returns the page's own promise. It stays inert until the Local Bridge
 * content script arms it, and goes inert again on disarm.
 *
 * Only these fields leave the page, per account:
 *   account.plan_type, plan_display_name, structure, workspace_type;
 *   entitlement.subscription_plan, has_active_subscription, billing_period,
 *   renews_at, expires_at, cancels_at, scheduled_plan_change (its plan's name).
 * The account is named by a hash of its id. No id, e-mail, name, token or
 * other field is posted.
 *
 * - plans: { accounts: [{ account, plan }], current } after each check response;
 *   current is the account the page uses (its chatgpt-account-id header, else
 *   the only account), or null.
 * - account: { account } when a later request names another account.
 *
 * Validation and storage live in
 * src/features/plugins/builtin/chatgptLocalBridge/account/.
 */
(function () {
  'use strict';
  if (window.__gvChatGptAccountObserver) return;
  window.__gvChatGptAccountObserver = true;

  // Repeated in src/features/plugins/builtin/chatgptLocalBridge/account/protocol.ts.
  var OUT = 'gv-chatgpt-account-observer';
  var IN = 'gv-chatgpt-account';
  var CHECK_PATH = /^\/backend-api\/accounts\/check(?:\/[^/]+)?\/?$/;
  var API_PREFIX = '/backend-api/';
  var ACCOUNT_HEADER = 'chatgpt-account-id';
  var MAX_ACCOUNTS = 16;
  var MAX_TEXT = 100;

  var armed = false;
  // The hash of the account the page's requests name; undefined until one does.
  var lastAccount;
  // The last plans report, posted again when the content script arms late.
  var lastPlans = null;
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
      // No `ready` here: the content script answers a `ready` with `arm`.
      if (lastPlans) post('plans', lastPlans);
    } else if (data.type === 'disarm') {
      armed = false;
    }
  });

  function hash(text) {
    var h = 0x811c9dc5;
    for (var i = 0; i < text.length; i += 1) {
      h ^= text.charCodeAt(i);
      h = Math.imul(h, 0x01000193);
    }
    return ('0000000' + (h >>> 0).toString(16)).slice(-8);
  }

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

  function headerAccount(input, init) {
    try {
      var source = init && init.headers ? init.headers : input && input.headers;
      var value = source ? new Headers(source).get(ACCOUNT_HEADER) : null;
      return value ? hash(value) : null;
    } catch (e) {
      return null;
    }
  }

  function isObject(value) {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
  }

  // A short string, null, or nothing: never an object or a long value.
  function text(value) {
    if (value === null) return null;
    return typeof value === 'string' && value.length > 0 && value.length <= MAX_TEXT
      ? value
      : undefined;
  }

  function scheduledPlan(value) {
    if (value === null || typeof value === 'string') return text(value);
    if (!isObject(value)) return undefined;
    var name = text(value.plan_type);
    if (typeof name !== 'string') name = text(value.subscription_plan);
    if (typeof name !== 'string') name = text(value.plan_display_name);
    return typeof name === 'string' ? name : undefined;
  }

  function put(plan, key, value) {
    if (value !== undefined) plan[key] = value;
  }

  function planOf(entry) {
    var account = isObject(entry.account) ? entry.account : {};
    var entitlement = isObject(entry.entitlement) ? entry.entitlement : {};
    var plan = {};
    put(plan, 'planType', text(account.plan_type));
    put(plan, 'planDisplayName', text(account.plan_display_name));
    put(plan, 'structure', text(account.structure));
    put(plan, 'workspaceType', text(account.workspace_type));
    put(plan, 'subscriptionPlan', text(entitlement.subscription_plan));
    var active = entitlement.has_active_subscription;
    if (active === null || typeof active === 'boolean') plan.hasActiveSubscription = active;
    put(plan, 'billingPeriod', text(entitlement.billing_period));
    put(plan, 'renewsAt', text(entitlement.renews_at));
    put(plan, 'expiresAt', text(entitlement.expires_at));
    put(plan, 'cancelsAt', text(entitlement.cancels_at));
    put(plan, 'scheduledPlanChange', scheduledPlan(entitlement.scheduled_plan_change));
    return plan;
  }

  function readPlans(data, requestAccount) {
    if (!isObject(data) || !isObject(data.accounts)) return null;
    var accounts = [];
    var seen = {};
    var keys = Object.keys(data.accounts);
    for (var i = 0; i < keys.length && accounts.length < MAX_ACCOUNTS; i += 1) {
      var entry = data.accounts[keys[i]];
      if (!isObject(entry)) continue;
      var own = isObject(entry.account) ? entry.account.account_id : undefined;
      // The map may list one account twice (under its id and as "default").
      var id = typeof own === 'string' && own ? own : keys[i];
      var key = hash(id);
      if (seen[key]) continue;
      seen[key] = true;
      var plan = planOf(entry);
      if (Object.keys(plan).length) accounts.push({ account: key, plan: plan });
    }
    if (!accounts.length) return null;
    var current = null;
    var named = requestAccount !== null ? requestAccount : lastAccount;
    for (var j = 0; j < accounts.length; j += 1) {
      if (accounts[j].account === named) current = named;
    }
    if (current === null && accounts.length === 1) current = accounts[0].account;
    return { accounts: accounts, current: current };
  }

  function ignore() {}

  function watchCheck(result, requestAccount) {
    if (!result || typeof result.then !== 'function') return;
    // Observe through a derived promise: the page's own promise keeps its handling state.
    result.then(function (response) {
      try {
        if (!response || !response.ok || typeof response.clone !== 'function') return;
        response
          .clone()
          .json()
          .then(function (data) {
            var plans = readPlans(data, requestAccount);
            if (!plans) return;
            // Round-trip through JSON so only plain data is posted.
            lastPlans = JSON.parse(JSON.stringify(plans));
            if (armed) post('plans', lastPlans);
          })
          .catch(ignore);
      } catch (e) {}
    }, ignore);
  }

  if (typeof originalFetch === 'function') {
    window.fetch = function (input, init) {
      if (!armed && lastPlans) return originalFetch.apply(this, arguments);
      var check = false;
      var account = null;
      try {
        var path = sameOriginPath(input);
        if (path !== null && path.indexOf(API_PREFIX) === 0) {
          account = headerAccount(input, init);
          if (account !== null && account !== lastAccount) {
            lastAccount = account;
            if (armed) post('account', { account: account });
          }
          check = CHECK_PATH.test(path) && methodOf(input, init) === 'GET';
        }
      } catch (e) {
        check = false;
      }
      var result = originalFetch.apply(this, arguments);
      try {
        if (check) watchCheck(result, account);
      } catch (e) {}
      return result;
    };
  }

  // A content script that started first is waiting for this to arm it.
  post('ready');
})();
