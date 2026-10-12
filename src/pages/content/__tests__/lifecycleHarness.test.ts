import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { type LifecycleHarness, installLifecycleHarness } from './lifecycleHarness';

describe('lifecycle harness listener ledger', () => {
  let harness: LifecycleHarness;

  beforeEach(() => {
    document.body.innerHTML = '';
    harness = installLifecycleHarness();
  });

  afterEach(() => {
    harness.restore();
    document.body.innerHTML = '';
  });

  it('sees a listener left on window', () => {
    const onResize = (): void => {};
    window.addEventListener('resize', onResize);
    expect(harness.ledger.openListeners()).toEqual([expect.stringMatching(/^window:resize:/)]);

    window.removeEventListener('resize', onResize);
    expect(harness.ledger.openListeners()).toEqual([]);
  });

  it('sees a listener left on a host element that is still in the page', () => {
    const item = document.createElement('button');
    item.className = 'menu-item';
    document.body.appendChild(item);
    const onEnter = (): void => {};
    item.addEventListener('mouseenter', onEnter);
    expect(harness.ledger.openListeners()).toEqual([
      expect.stringMatching(/^button\.menu-item:mouseenter:/),
    ]);

    // Gone from the page, nothing can reach it any more.
    item.remove();
    expect(harness.ledger.openListeners()).toEqual([]);
    document.body.appendChild(item);
    item.removeEventListener('mouseenter', onEnter);
    expect(harness.ledger.openListeners()).toEqual([]);
  });

  it('counts a listener removed by its signal, by a once firing, or added twice, as the DOM does', () => {
    const controller = new AbortController();
    const listener = (): void => {};
    document.addEventListener('focusin', listener, { signal: controller.signal });
    window.addEventListener('popstate', listener, { once: true });
    document.addEventListener('keydown', listener);
    document.addEventListener('keydown', listener);
    expect(harness.ledger.openListeners()).toHaveLength(3);

    controller.abort();
    window.dispatchEvent(new PopStateEvent('popstate'));
    document.removeEventListener('keydown', listener);

    expect(harness.ledger.openListeners()).toEqual([]);
  });

  it('keeps a listener on a host node that is detached, and reports it again when the host reattaches it', () => {
    const section = document.createElement('section');
    section.className = 'sidebar';
    document.body.appendChild(section);
    const onFocus = (): void => {};
    section.addEventListener('focusin', onFocus);

    section.remove();
    expect(harness.ledger.openListeners()).toEqual([]);
    expect(harness.ledger.openListeners({ includeDetached: true })).toEqual([
      expect.stringMatching(/^section\.sidebar:focusin:/),
    ]);
    expect(harness.ledger.openListeners({ detachedHosts: new Set([section]) })).toEqual([
      expect.stringMatching(/^section\.sidebar:focusin:/),
    ]);
    expect(harness.ledger.openListeners({ detachedHosts: new Set([document.body]) })).toEqual([]);

    document.body.appendChild(section);
    expect(harness.ledger.openListeners()).toEqual([
      expect.stringMatching(/^section\.sidebar:focusin:/),
    ]);
    section.removeEventListener('focusin', onFocus);
  });

  it('counts a listener on a node added inside a host after the host set was taken, while the host is detached', () => {
    const sidebar = document.createElement('nav');
    document.body.appendChild(sidebar);
    const hosts = new Set<EventTarget>([sidebar]);
    // A feature adds its own button inside the host later, then the host detaches.
    const button = document.createElement('button');
    button.className = 'added';
    sidebar.appendChild(button);
    const onClick = (): void => {};
    button.addEventListener('click', onClick);
    sidebar.remove();

    expect(harness.ledger.openListeners()).toEqual([]);
    expect(harness.ledger.openListeners({ detachedHosts: hosts })).toEqual([
      expect.stringMatching(/^button\.added:click:/),
    ]);
    button.removeEventListener('click', onClick);
  });

  it('takes back its hooks for a once listener that never fired and a signal that never aborted', () => {
    harness.restore();
    // Spies under the harness see the calls it makes on its own behalf.
    const windowRemove = vi.spyOn(window, 'removeEventListener');
    harness = installLifecycleHarness();
    const controller = new AbortController();
    const signalRemove = vi.spyOn(controller.signal, 'removeEventListener');
    const listener = (): void => {};
    window.addEventListener('popstate', listener, { once: true });
    document.addEventListener('focusin', listener, { signal: controller.signal });
    windowRemove.mockClear();

    harness.restore();

    expect(windowRemove).toHaveBeenCalledWith(
      'popstate',
      expect.any(Function),
      expect.objectContaining({ capture: false }),
    );
    expect(signalRemove).toHaveBeenCalledWith('abort', expect.any(Function));
    window.removeEventListener('popstate', listener);
    windowRemove.mockRestore();
    harness = installLifecycleHarness();
  });

  it('puts window back as it found it', () => {
    const add = window.addEventListener;
    harness.restore();
    expect(window.addEventListener).not.toBe(add);
    harness = installLifecycleHarness();
  });
});
