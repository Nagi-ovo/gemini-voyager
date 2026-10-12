import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import browser from 'webextension-polyfill';

import { StorageKeys } from '@/core/types/common';

import type { GemMetadata } from '../catalog';
import { createGemsState } from '../state';

const storageState = vi.hoisted(() => ({
  catalog: [] as Array<{ id: string; href: string; name: string }>,
}));

vi.mock('webextension-polyfill', () => ({
  default: {
    storage: {
      sync: {
        get: vi.fn(async (defaults: Record<string, unknown>) => ({
          ...defaults,
          gvGemsSidebarCount: 3,
        })),
        set: vi.fn(async () => {}),
        remove: vi.fn(async () => {}),
      },
      local: {
        get: vi.fn(async (key: unknown) => {
          if (key === 'gvGemsListCache') {
            return { [key]: { items: storageState.catalog, cachedAt: 1 } };
          }
          return typeof key === 'object' && key !== null ? key : {};
        }),
        set: vi.fn(async () => {}),
        remove: vi.fn(async () => {}),
      },
      onChanged: { addListener: vi.fn(), removeListener: vi.fn() },
    },
  },
}));

type Mock = ReturnType<typeof vi.fn>;

const gem = (id: string): GemMetadata => ({ id, name: id, href: `/gem/${id}` });

function deferred<T>(): { promise: Promise<T>; resolve: (value: T) => void } {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

async function flush(): Promise<void> {
  for (let i = 0; i < 6; i++) await Promise.resolve();
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function mountGemsList(): void {
  document.body.innerHTML = `
    <div data-test-id="your-gems-list">
      <bot-list-row><div><a class="bot-row" href="/gem/g1">Writer</a></div></bot-list-row>
      <bot-list-row><div><a class="bot-row" href="/gem/g2">Coder</a></div></bot-list-row>
    </div>`;
}

function mountSidebar(): HTMLElement {
  document.body.innerHTML = `
    <div data-test-id="overflow-container"><mat-nav-list class="nav"></mat-nav-list></div>`;
  const entry = document.createElement('gem-nav-list-item');
  entry.setAttribute('data-test-id', 'gems-side-nav-entry-button');
  Object.defineProperty(entry, 'getBoundingClientRect', {
    configurable: true,
    value: () => ({ top: 0, left: 0, right: 200, bottom: 40, width: 200, height: 40 }) as DOMRect,
  });
  document.querySelector('.nav')!.appendChild(entry);
  return entry;
}

function pinButtons(): NodeListOf<Element> {
  return document.querySelectorAll('.gv-gem-pin-toggle');
}

describe('gems sidebar lifecycle', () => {
  let stop: (() => void) | null = null;

  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    storageState.catalog = [
      { id: 'g1', href: '/gem/g1', name: 'Writer' },
      { id: 'g2', href: '/gem/g2', name: 'Coder' },
    ];
    (chrome.storage.sync.get as unknown as Mock).mockResolvedValue({
      [StorageKeys.GV_GEMS_PINNED]: [],
    });
    window.history.pushState({}, '', '/app');
  });

  afterEach(() => {
    stop?.();
    stop = null;
    document.body.innerHTML = '';
    document.head.innerHTML = '';
  });

  async function start(): Promise<() => void> {
    const { startGemsSidebar } = await import('../index');
    stop = await startGemsSidebar();
    await flush();
    return stop;
  }

  it('injects no pin buttons when the gems sidebar stops while pinned gems load', async () => {
    window.history.pushState({}, '', '/gems/view');
    mountGemsList();
    const pinned = deferred<Record<string, unknown>>();
    (chrome.storage.sync.get as unknown as Mock).mockReturnValue(pinned.promise);

    const stopSidebar = await start();
    stopSidebar();
    pinned.resolve({ [StorageKeys.GV_GEMS_PINNED]: ['g1'] });
    await flush();

    expect(pinButtons()).toHaveLength(0);
    expect(document.getElementById('gv-gem-pin-style')).toBeNull();
  });

  it('removes the Gems pin buttons and their style when the gems sidebar stops', async () => {
    window.history.pushState({}, '', '/gems/view');
    mountGemsList();

    const firstStop = await start();
    expect(pinButtons()).toHaveLength(2);
    expect(document.getElementById('gv-gem-pin-style')).not.toBeNull();

    firstStop();
    stop = null;
    expect(pinButtons()).toHaveLength(0);
    expect(document.getElementById('gv-gem-pin-style')).toBeNull();

    // A later start styles its buttons again instead of trusting a stale "already styled" flag.
    await start();
    expect(pinButtons()).toHaveLength(2);
    expect(document.getElementById('gv-gem-pin-style')).not.toBeNull();
  });

  it('does not refresh the sidebar after stop when a cache write or navigation was pending', async () => {
    // Cache write: the write and its pruning finish, the sidebar is not touched.
    window.history.pushState({}, '', '/gems/view');
    const refreshSidebar = vi.fn();
    const state = createGemsState(refreshSidebar, () => {});
    await state.saveCache([gem('g1'), gem('g2')]);
    const localSet = browser.storage.local.set as unknown as Mock;
    const written = deferred<void>();
    localSet.mockReturnValueOnce(written.promise);

    const pendingWrite = state.saveCache([gem('g1')]);
    state.stop();
    written.resolve();
    await pendingWrite;

    expect(refreshSidebar).not.toHaveBeenCalled();
    expect(localSet).toHaveBeenLastCalledWith({
      [StorageKeys.GV_GEMS_LIST_CACHE]: expect.objectContaining({ items: [gem('g1')] }),
    });

    // Navigation: the 250ms settle timer must not remount the list after stop.
    window.history.pushState({}, '', '/app');
    const entry = mountSidebar();
    const stopSidebar = await start();
    await wait(20);
    expect(entry.nextElementSibling?.classList.contains('gv-gems-inline-list')).toBe(true);

    window.history.pushState({}, '', '/app/next');
    window.dispatchEvent(new PopStateEvent('popstate'));
    stopSidebar();
    stop = null;
    await wait(300);

    expect(document.querySelector('.gv-gems-inline-list')).toBeNull();
  });

  it('keeps a restarted gems sidebar running when an earlier stop is called again', async () => {
    const entry = mountSidebar();
    const firstStop = await start();
    firstStop();

    await start();
    firstStop();
    await wait(20);

    expect(entry.nextElementSibling?.classList.contains('gv-gems-inline-list')).toBe(true);
  });

  it('keeps pinned, recent and cached gems stored when the gems sidebar stops', async () => {
    window.history.pushState({}, '', '/gems/view');
    mountGemsList();
    (chrome.storage.sync.get as unknown as Mock).mockResolvedValue({
      [StorageKeys.GV_GEMS_PINNED]: ['g1'],
    });
    const stopSidebar = await start();
    const writesBeforeStop = [
      (browser.storage.local.set as unknown as Mock).mock.calls.length,
      (browser.storage.sync.set as unknown as Mock).mock.calls.length,
      (chrome.storage.sync.set as unknown as Mock).mock.calls.length,
    ];

    stopSidebar();
    stop = null;
    await wait(350);

    expect(browser.storage.local.remove).not.toHaveBeenCalled();
    expect(browser.storage.sync.remove).not.toHaveBeenCalled();
    expect(chrome.storage.local.remove).not.toHaveBeenCalled();
    expect(chrome.storage.sync.remove).not.toHaveBeenCalled();
    expect([
      (browser.storage.local.set as unknown as Mock).mock.calls.length,
      (browser.storage.sync.set as unknown as Mock).mock.calls.length,
      (chrome.storage.sync.set as unknown as Mock).mock.calls.length,
    ]).toEqual(writesBeforeStop);
  });
});
