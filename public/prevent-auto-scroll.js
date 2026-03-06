(function () {
  'use strict';
  if (window.__gvPreventAutoScrollInstalled) return;
  window.__gvPreventAutoScrollInstalled = true;

  console.log('[Gemini Voyager] Prevent auto scroll script loaded');

  const BRIDGE_ID = 'gv-prevent-auto-scroll-bridge';
  function isEnabled() {
    const bridge = document.getElementById(BRIDGE_ID);
    return bridge && bridge.dataset.enabled === 'true';
  }

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
    if (!isEnabled()) return false;
    if (isScrolledUp(el) && isScrollingDownTo(el, args)) {
      return true;
    }
    return false;
  }

  function shouldBlockScrollBy(el, args) {
    if (!isEnabled()) return false;
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
    if (isEnabled()) {
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
        if (isEnabled() && isScrolledUp(this)) {
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
