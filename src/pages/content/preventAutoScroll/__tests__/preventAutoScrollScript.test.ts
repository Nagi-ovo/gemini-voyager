import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const scriptPath = resolve(process.cwd(), 'public/prevent-auto-scroll.js');
const preventAutoScrollScript = readFileSync(scriptPath, 'utf8');

type PatchedWindow = Window & { __gvPreventAutoScrollInstalled?: boolean };

let originalElementScrollTo: PropertyDescriptor | undefined;
let originalElementScrollBy: PropertyDescriptor | undefined;
let originalElementScrollIntoView: PropertyDescriptor | undefined;
let originalWindowScrollTo: typeof window.scrollTo;
let originalWindowScrollBy: typeof window.scrollBy;
let originalHistoryPushState: typeof history.pushState;
let originalHistoryReplaceState: typeof history.replaceState;
let elementScrollToSpy: ReturnType<typeof vi.fn>;

function defineBrowserScrollStubs(): void {
  elementScrollToSpy = vi.fn(function (this: Element, ...args: unknown[]) {
    let targetTop: unknown;
    if (args.length === 1 && args[0] && typeof args[0] === 'object' && 'top' in args[0]) {
      targetTop = (args[0] as { top?: unknown }).top;
    } else if (args.length >= 2) {
      targetTop = args[1];
    }

    if (typeof targetTop === 'number') {
      (this as HTMLElement).scrollTop = targetTop;
    }
  });

  Object.defineProperty(Element.prototype, 'scrollTo', {
    configurable: true,
    writable: true,
    value: elementScrollToSpy,
  });
  Object.defineProperty(Element.prototype, 'scrollBy', {
    configurable: true,
    writable: true,
    value: vi.fn(),
  });
  Object.defineProperty(Element.prototype, 'scrollIntoView', {
    configurable: true,
    writable: true,
    value: vi.fn(),
  });

  window.scrollTo = vi.fn() as unknown as typeof window.scrollTo;
  window.scrollBy = vi.fn() as unknown as typeof window.scrollBy;
}

function restoreDescriptor(
  target: object,
  key: string,
  descriptor: PropertyDescriptor | undefined,
): void {
  if (descriptor) {
    Object.defineProperty(target, key, descriptor);
  } else {
    delete (target as Record<string, unknown>)[key];
  }
}

function createBridge(enabled: boolean): void {
  const bridge = document.createElement('div');
  bridge.id = 'gv-prevent-auto-scroll-bridge';
  bridge.dataset.enabled = String(enabled);
  document.documentElement.appendChild(bridge);
}

function installScript(enabled = true): void {
  createBridge(enabled);
  new Function(preventAutoScrollScript)();
}

function createScrollableElement(): { el: HTMLElement; getScrollTop: () => number } {
  const el = document.createElement('div');
  let scrollTop = 0;

  Object.defineProperties(el, {
    scrollTop: {
      configurable: true,
      get: () => scrollTop,
      set: (value: number) => {
        scrollTop = value;
      },
    },
    scrollHeight: {
      configurable: true,
      get: () => 2000,
    },
    clientHeight: {
      configurable: true,
      get: () => 500,
    },
  });

  document.body.appendChild(el);
  return { el, getScrollTop: () => scrollTop };
}

function submitFromComposer(): void {
  const input = document.createElement('textarea');
  document.body.appendChild(input);
  input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
}

describe('prevent-auto-scroll page script', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));

    originalElementScrollTo = Object.getOwnPropertyDescriptor(Element.prototype, 'scrollTo');
    originalElementScrollBy = Object.getOwnPropertyDescriptor(Element.prototype, 'scrollBy');
    originalElementScrollIntoView = Object.getOwnPropertyDescriptor(
      Element.prototype,
      'scrollIntoView',
    );
    originalWindowScrollTo = window.scrollTo;
    originalWindowScrollBy = window.scrollBy;
    originalHistoryPushState = history.pushState;
    originalHistoryReplaceState = history.replaceState;

    document.body.innerHTML = '';
    document.documentElement.removeAttribute('data-test');
    history.replaceState({}, '', '/app/current');
    delete (window as PatchedWindow).__gvPreventAutoScrollInstalled;

    defineBrowserScrollStubs();
  });

  afterEach(() => {
    restoreDescriptor(Element.prototype, 'scrollTo', originalElementScrollTo);
    restoreDescriptor(Element.prototype, 'scrollBy', originalElementScrollBy);
    restoreDescriptor(Element.prototype, 'scrollIntoView', originalElementScrollIntoView);
    window.scrollTo = originalWindowScrollTo;
    window.scrollBy = originalWindowScrollBy;
    history.pushState = originalHistoryPushState;
    history.replaceState = originalHistoryReplaceState;
    delete (window as PatchedWindow).__gvPreventAutoScrollInstalled;
    vi.useRealTimers();
  });

  it('allows Gemini to scroll to the latest message when there was no recent submit', () => {
    installScript();
    vi.advanceTimersByTime(10000);

    const { el, getScrollTop } = createScrollableElement();

    el.scrollTo({ top: 1800 });

    expect(elementScrollToSpy).toHaveBeenCalledTimes(1);
    expect(getScrollTop()).toBe(1800);
  });

  it('blocks downward auto-scroll after the user submits while reading older content', () => {
    installScript();
    submitFromComposer();

    const { el, getScrollTop } = createScrollableElement();

    el.scrollTo({ top: 1800 });

    expect(elementScrollToSpy).not.toHaveBeenCalled();
    expect(getScrollTop()).toBe(0);
  });

  it('re-allows native scrolls after route changes that are not part of a fresh submit', () => {
    installScript();
    submitFromComposer();
    vi.advanceTimersByTime(6000);
    history.pushState({}, '', '/app/older-conversation');
    vi.runOnlyPendingTimers();

    const { el, getScrollTop } = createScrollableElement();

    el.scrollTo({ top: 1800 });

    expect(elementScrollToSpy).toHaveBeenCalledTimes(1);
    expect(getScrollTop()).toBe(1800);
  });
});
