(function () {
  'use strict';
  if (window.__gvPreventAutoScrollInstalled) return;
  window.__gvPreventAutoScrollInstalled = true;

  console.log('[Gemini Voyager] Prevent auto scroll script loaded');

  const BRIDGE_ID = 'gv-prevent-auto-scroll-bridge';
  const INITIAL_NATIVE_SCROLL_ALLOW_MS = 8000;
  const ROUTE_NATIVE_SCROLL_ALLOW_MS = 4000;
  const SUBMIT_SCROLL_BLOCK_MS = 120000;
  const SUBMIT_ROUTE_GRACE_MS = 5000;
  const SEND_BUTTON_TEXT_RE =
    /\b(send|submit|run|update)\b|发送|提交|傳送|送出|送信|전송|enviar|envoyer|senden|отправ|إرسال|运行|執行|実行|실행|更新/i;

  let nativeScrollAllowedUntil = Date.now() + INITIAL_NATIVE_SCROLL_ALLOW_MS;
  let blockScrollUntil = 0;
  let lastSubmitIntentAt = 0;
  let lastUrl = location.href;

  function isEnabled() {
    const bridge = document.getElementById(BRIDGE_ID);
    return bridge && bridge.dataset.enabled === 'true';
  }

  function allowNativeScrollFor(durationMs) {
    const now = Date.now();
    if (now - lastSubmitIntentAt < SUBMIT_ROUTE_GRACE_MS) return;
    blockScrollUntil = 0;
    nativeScrollAllowedUntil = Math.max(nativeScrollAllowedUntil, now + durationMs);
  }

  function markSubmitIntent() {
    if (!isEnabled()) return;
    const now = Date.now();
    lastSubmitIntentAt = now;
    blockScrollUntil = now + SUBMIT_SCROLL_BLOCK_MS;
    nativeScrollAllowedUntil = 0;
  }

  function shouldBlockAutoScroll() {
    const now = Date.now();
    return isEnabled() && now >= nativeScrollAllowedUntil && now < blockScrollUntil;
  }

  function handlePossibleRouteChange() {
    setTimeout(() => {
      if (location.href === lastUrl) return;
      lastUrl = location.href;
      allowNativeScrollFor(ROUTE_NATIVE_SCROLL_ALLOW_MS);
    }, 0);
  }

  function wrapHistoryMethod(name) {
    const original = history[name];
    if (typeof original !== 'function') return;
    history[name] = function (...args) {
      const result = original.apply(this, args);
      handlePossibleRouteChange();
      return result;
    };
  }

  function isEditableTarget(target) {
    if (!(target instanceof Element)) return false;
    return Boolean(target.closest('textarea, input, [contenteditable="true"], [role="textbox"]'));
  }

  function closestButton(target) {
    if (!(target instanceof Element)) return null;
    return target.closest('button, [role="button"]');
  }

  function isLikelySendButton(button) {
    if (!button) return false;
    const text = [
      button.getAttribute('aria-label'),
      button.getAttribute('title'),
      button.getAttribute('data-tooltip'),
      button.getAttribute('data-test-id'),
      button.textContent,
    ]
      .filter(Boolean)
      .join(' ');

    if (SEND_BUTTON_TEXT_RE.test(text)) return true;

    const icon = button.querySelector(
      'mat-icon[fonticon], .material-icons, .material-symbols-rounded',
    );
    const iconName = icon?.getAttribute('fonticon') || icon?.textContent?.trim();
    return iconName === 'send' || iconName === 'play_arrow';
  }

  document.addEventListener(
    'keydown',
    (event) => {
      if (event.key !== 'Enter' || event.shiftKey || event.altKey || event.isComposing) return;
      if (isEditableTarget(event.target)) markSubmitIntent();
    },
    true,
  );

  document.addEventListener(
    'click',
    (event) => {
      const button = closestButton(event.target);
      if (isLikelySendButton(button)) markSubmitIntent();
    },
    true,
  );

  wrapHistoryMethod('pushState');
  wrapHistoryMethod('replaceState');
  window.addEventListener('popstate', handlePossibleRouteChange, true);
  window.addEventListener('hashchange', handlePossibleRouteChange, true);
  window.addEventListener(
    'pageshow',
    () => allowNativeScrollFor(INITIAL_NATIVE_SCROLL_ALLOW_MS),
    true,
  );

  function getScrollTop(el) {
    if (el === window) return document.documentElement.scrollTop || document.body.scrollTop;
    return el.scrollTop;
  }

  function getScrollHeight(el) {
    if (el === window) return document.documentElement.scrollHeight || document.body.scrollHeight;
    return el.scrollHeight;
  }

  function getClientHeight(el) {
    if (el === window) return document.documentElement.clientHeight || window.innerHeight;
    return el.clientHeight;
  }

  function isScrolledUp(el) {
    const st = getScrollTop(el);
    const sh = getScrollHeight(el);
    const ch = getClientHeight(el);
    // If not scrollable or very small
    if (sh <= ch + 10) return false;
    return sh - st - ch > 150;
  }

  function isScrollingDownTo(el, args) {
    if (args.length === 0) return false;
    let targetY = undefined;
    if (args.length === 1 && args[0] && typeof args[0] === 'object') {
      if ('top' in args[0]) targetY = args[0].top;
    } else if (args.length >= 2) {
      targetY = args[1];
    }

    if (targetY === undefined) return false;
    const currentScrollTop = getScrollTop(el);
    return targetY > currentScrollTop;
  }

  function isScrollingDownBy(args) {
    if (args.length === 0) return false;
    if (args.length === 1 && args[0] && typeof args[0] === 'object') {
      return args[0].top > 0;
    } else if (args.length >= 2) {
      return args[1] > 0;
    }
    return false;
  }

  function shouldBlockScrollTo(el, args) {
    if (!shouldBlockAutoScroll()) return false;
    if (isScrolledUp(el) && isScrollingDownTo(el, args)) {
      return true;
    }
    return false;
  }

  function shouldBlockScrollBy(el, args) {
    if (!shouldBlockAutoScroll()) return false;
    if (isScrolledUp(el) && isScrollingDownBy(args)) {
      return true;
    }
    return false;
  }

  const originalWindowScrollTo = window.scrollTo;
  window.scrollTo = function (...args) {
    if (shouldBlockScrollTo(window, args)) return;
    return originalWindowScrollTo.apply(this, args);
  };

  const originalWindowScrollBy = window.scrollBy;
  window.scrollBy = function (...args) {
    if (shouldBlockScrollBy(window, args)) return;
    return originalWindowScrollBy.apply(this, args);
  };

  const originalElementScrollTo = Element.prototype.scrollTo;
  Element.prototype.scrollTo = function (...args) {
    if (shouldBlockScrollTo(this, args)) return;
    return originalElementScrollTo.apply(this, args);
  };

  const originalElementScrollBy = Element.prototype.scrollBy;
  Element.prototype.scrollBy = function (...args) {
    if (shouldBlockScrollBy(this, args)) return;
    return originalElementScrollBy.apply(this, args);
  };

  const originalScrollIntoView = Element.prototype.scrollIntoView;
  Element.prototype.scrollIntoView = function (...args) {
    if (shouldBlockAutoScroll()) {
      let ancestor = this.parentElement;
      let blocked = false;
      while (ancestor) {
        if (ancestor.scrollHeight > ancestor.clientHeight) {
          if (isScrolledUp(ancestor)) {
            const rect = this.getBoundingClientRect();
            if (rect.top > (window.innerHeight || document.documentElement.clientHeight)) {
              blocked = true;
            } else if (rect.bottom > ancestor.getBoundingClientRect().bottom) {
              blocked = true;
            }
            break;
          }
        }
        ancestor = ancestor.parentElement;
      }
      if (!ancestor && isScrolledUp(window)) {
        const rect = this.getBoundingClientRect();
        if (rect.top > (window.innerHeight || document.documentElement.clientHeight)) {
          blocked = true;
        }
      }

      if (blocked) return;
    }
    return originalScrollIntoView.apply(this, args);
  };

  const originalScrollTopDescriptor = Object.getOwnPropertyDescriptor(
    Element.prototype,
    'scrollTop',
  );
  if (originalScrollTopDescriptor) {
    Object.defineProperty(Element.prototype, 'scrollTop', {
      get: originalScrollTopDescriptor.get,
      set: function (value) {
        if (shouldBlockAutoScroll() && isScrolledUp(this)) {
          const currentVal = originalScrollTopDescriptor.get.call(this);
          if (value > currentVal) {
            return;
          }
        }
        return originalScrollTopDescriptor.set.call(this, value);
      },
    });
  }
})();
