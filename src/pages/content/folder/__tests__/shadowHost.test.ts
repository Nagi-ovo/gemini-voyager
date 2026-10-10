import { afterEach, describe, expect, it, vi } from 'vitest';

import { SCHEME_ATTR } from '@/pages/content/platformTheme/scheme';
import { SHADOW_SURFACE_ATTR } from '@/pages/content/shadowKeyGuard';

import { SHADOW_RTL_ATTR, attachShadowSurface, eventPassedThrough } from '../shadowHost';
import { destroyMountedPanels, mountPanel } from './floatingPanelHarness';

vi.mock('@/core/utils/browser', () => ({ isSafari: () => false }));
vi.mock('@/utils/i18n', () => ({ getTranslationSyncUnsafe: (key: string) => key }));

async function flushObservers(): Promise<void> {
  await Promise.resolve();
}

afterEach(() => {
  destroyMountedPanels();
  document.documentElement.removeAttribute(SCHEME_ATTR);
  document.body.className = '';
  document.body.innerHTML = '';
});

describe('attachShadowSurface', () => {
  it('styles an open shadow root and mirrors the page scheme and direction', async () => {
    document.documentElement.setAttribute(SCHEME_ATTR, 'dark');
    const host = document.createElement('div');
    document.body.appendChild(host);
    const surface = attachShadowSurface(host, '.x { color: red; }');

    expect(surface.root).toBe(host.shadowRoot);
    // The document_start key guard only protects fields in marked surfaces.
    expect(host.hasAttribute(SHADOW_SURFACE_ATTR)).toBe(true);
    expect(surface.root.querySelector('style')!.textContent).toBe('.x { color: red; }');
    expect(host.getAttribute(SCHEME_ATTR)).toBe('dark');
    expect(host.hasAttribute(SHADOW_RTL_ATTR)).toBe(false);

    document.documentElement.setAttribute(SCHEME_ATTR, 'light');
    document.body.classList.add('gv-rtl');
    await flushObservers();
    expect(host.getAttribute(SCHEME_ATTR)).toBe('light');
    expect(host.hasAttribute(SHADOW_RTL_ATTR)).toBe(true);

    surface.disconnect();
    document.documentElement.setAttribute(SCHEME_ATTR, 'dark');
    document.body.classList.remove('gv-rtl');
    await flushObservers();
    expect(host.getAttribute(SCHEME_ATTR)).toBe('light');
    expect(host.hasAttribute(SHADOW_RTL_ATTR)).toBe(true);
  });

  it('reports whether an event crossed a node inside a shadow tree', () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const { root } = attachShadowSurface(host, '');
    const inner = document.createElement('button');
    const other = document.createElement('span');
    root.append(inner, other);

    // composedPath() is only populated while the event is being dispatched.
    const seen: { target: EventTarget | null; inner: boolean; other: boolean }[] = [];
    document.addEventListener(
      'click',
      (e) =>
        seen.push({
          target: e.target,
          inner: eventPassedThrough(e, inner),
          other: eventPassedThrough(e, other),
        }),
      { once: true },
    );
    inner.dispatchEvent(new MouseEvent('click', { bubbles: true, composed: true }));

    expect(seen).toEqual([{ target: host, inner: true, other: false }]);
  });
});

describe('typing inside a shadow surface', () => {
  function keysSeenByPage(dispatchFrom: (root: ShadowRoot) => Element): string[] {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const surface = attachShadowSurface(host, '');
    const seen: string[] = [];
    const pageShortcut = (e: KeyboardEvent) => seen.push(`${e.type}:${e.key}`);
    document.addEventListener('keydown', pageShortcut);
    document.addEventListener('keyup', pageShortcut);
    try {
      const origin = dispatchFrom(surface.root);
      for (const type of ['keydown', 'keyup']) {
        origin.dispatchEvent(new KeyboardEvent(type, { key: 'j', bubbles: true, composed: true }));
      }
      surface.disconnect();
      origin.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'k', bubbles: true, composed: true }),
      );
    } finally {
      document.removeEventListener('keydown', pageShortcut);
      document.removeEventListener('keyup', pageShortcut);
    }
    return seen;
  }

  it('keeps keys typed into a field away from page listeners until disconnected', () => {
    const fieldKeys = keysSeenByPage((root) => root.appendChild(document.createElement('input')));
    expect(fieldKeys).toEqual(['keydown:k']);
  });

  it('still lets keys on other controls reach the page', () => {
    const buttonKeys = keysSeenByPage((root) => root.appendChild(document.createElement('button')));
    expect(buttonKeys).toEqual(['keydown:j', 'keyup:j', 'keydown:k']);
  });

  it('still runs the field’s own key handler', () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const { root } = attachShadowSurface(host, '');
    const input = root.appendChild(document.createElement('input'));
    const own = vi.fn();
    input.addEventListener('keydown', own);
    input.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, composed: true }),
    );
    expect(own).toHaveBeenCalledTimes(1);
  });
});

describe('floating panel host', () => {
  it('follows the page scheme until the panel is destroyed', async () => {
    document.documentElement.setAttribute(SCHEME_ATTR, 'light');
    const handle = mountPanel();
    expect(handle.element.getAttribute(SCHEME_ATTR)).toBe('light');

    document.documentElement.setAttribute(SCHEME_ATTR, 'dark');
    await flushObservers();
    expect(handle.element.getAttribute(SCHEME_ATTR)).toBe('dark');

    handle.destroy();
    document.documentElement.setAttribute(SCHEME_ATTR, 'light');
    await flushObservers();
    expect(handle.element.getAttribute(SCHEME_ATTR)).toBe('dark');
  });
});
