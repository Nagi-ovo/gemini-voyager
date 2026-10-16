import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import browser from 'webextension-polyfill';

import { StorageKeys } from '@/core/types/common';
import { PluginScope } from '@/features/plugins/runtime/pluginScope';

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

  async function start(count = 3): Promise<() => void> {
    const { activateGeminiGemsSidebar } = await import('../pluginHandler');
    const scope = new PluginScope();
    stop = () => {
      void scope.dispose();
    };
    activateGeminiGemsSidebar(scope, { count });
    for (let i = 0; i < 12; i++) await Promise.resolve();
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

  it('removes pins from detached Gemini lists so reattached lists get working buttons after re-enable', async () => {
    window.history.pushState({}, '', '/gems/view');
    mountGemsList();
    const firstStop = await start();
    const list = document.querySelector('[data-test-id="your-gems-list"]')!;
    const oldButton = list.querySelector<HTMLButtonElement>('.gv-gem-pin-toggle')!;
    list.remove();
    firstStop();

    expect(list.querySelectorAll('.gv-gem-pin-toggle')).toHaveLength(0);
    const oldClick = new MouseEvent('click', { cancelable: true });
    oldButton.dispatchEvent(oldClick);
    expect(oldClick.defaultPrevented).toBe(false);
    const hover = vi.fn();
    oldButton.addEventListener('mouseover', hover);
    oldButton.dispatchEvent(new MouseEvent('mouseover'));
    expect(hover).toHaveBeenCalledOnce();
    expect(chrome.storage.sync.set).not.toHaveBeenCalled();

    document.body.appendChild(list);
    expect(pinButtons()).toHaveLength(0);
    await start();
    expect(pinButtons()).toHaveLength(2);
    const newButton = list.querySelector<HTMLButtonElement>('.gv-gem-pin-toggle')!;
    expect(newButton).not.toBe(oldButton);
    newButton.click();
    await flush();
    expect(chrome.storage.sync.set).toHaveBeenCalledWith({ [StorageKeys.GV_GEMS_PINNED]: ['g1'] });
    expect(newButton.classList.contains('gv-pinned')).toBe(true);
  });

  it('does not refresh the sidebar after stop when a cache write or navigation was pending', async () => {
    // An already-submitted write finishes, but off prevents its follow-up work.
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

  it('keeps count-zero lists hidden while pins and catalog scraping remain enabled', async () => {
    window.history.pushState({}, '', '/gems/view');
    mountSidebar();
    document.body.insertAdjacentHTML(
      'beforeend',
      `
      <div data-test-id="your-gems-list">
        <bot-list-row><a class="bot-row" href="/gem/g1"><span class="title-container">Writer</span></a></bot-list-row>
      </div>`,
    );
    await start(0);
    await wait(350);

    expect(document.querySelector('.gv-gems-inline-list')).toBeNull();
    expect(pinButtons()).toHaveLength(1);
    expect(browser.storage.local.set).toHaveBeenCalledWith({
      [StorageKeys.GV_GEMS_LIST_CACHE]: expect.objectContaining({
        items: [expect.objectContaining({ id: 'g1', name: 'Writer' })],
      }),
    });
  });

  it('updates count live without restarting storage reads and hides pinned gems at zero', async () => {
    mountSidebar();
    (browser.storage.sync.get as unknown as Mock).mockResolvedValueOnce({
      [StorageKeys.GV_GEMS_PINNED]: ['g1'],
    });
    await start(1);
    const reads = (browser.storage.sync.get as unknown as Mock).mock.calls.length;
    const { updateGeminiGemsSidebarSettings } = await import('../pluginHandler');
    expect(document.querySelectorAll('.gv-gems-item')).toHaveLength(1);
    updateGeminiGemsSidebarSettings({ count: 2 });
    expect(document.querySelectorAll('.gv-gems-item')).toHaveLength(2);
    updateGeminiGemsSidebarSettings({ count: 0 });
    expect(document.querySelector('.gv-gems-inline-list')).toBeNull();
    expect(document.querySelector('.gv-gems-expand-toggle')).toBeNull();
    updateGeminiGemsSidebarSettings({ count: 1 });
    expect(document.querySelectorAll('.gv-gems-item')).toHaveLength(1);
    expect((browser.storage.sync.get as unknown as Mock).mock.calls.length).toBe(reads);
  });

  it('drops a late initial load after off without listeners, DOM or writes', async () => {
    window.history.pushState({}, '', '/gems/view');
    mountGemsList();
    const loaded = deferred<Record<string, unknown>>();
    (browser.storage.sync.get as unknown as Mock).mockReturnValueOnce(loaded.promise);
    const stopSidebar = await start();
    const writes = (browser.storage.local.set as unknown as Mock).mock.calls.length;
    stopSidebar();
    loaded.resolve({ [StorageKeys.GV_GEMS_PINNED]: ['g1'] });
    await flush();
    await wait(350);

    expect(browser.storage.onChanged.addListener).not.toHaveBeenCalled();
    expect(chrome.storage.onChanged.addListener).not.toHaveBeenCalled();
    expect(pinButtons()).toHaveLength(0);
    expect((browser.storage.local.set as unknown as Mock).mock.calls.length).toBe(writes);
  });

  it('keeps a live count change made while initial storage loads', async () => {
    mountSidebar();
    const loaded = deferred<Record<string, unknown>>();
    (browser.storage.sync.get as unknown as Mock).mockReturnValueOnce(loaded.promise);
    await start(3);
    const { updateGeminiGemsSidebarSettings } = await import('../pluginHandler');
    updateGeminiGemsSidebarSettings({ count: 0 });
    loaded.resolve({ [StorageKeys.GV_GEMS_SIDEBAR_COUNT]: 3 });
    for (let i = 0; i < 16; i++) await Promise.resolve();
    expect(document.querySelector('.gv-gems-inline-list')).toBeNull();
  });

  it('drops late scrape completion after off without pruning stored pins or MRU', async () => {
    window.history.pushState({}, '', '/gems/view');
    (browser.storage.sync.get as unknown as Mock).mockResolvedValueOnce({
      [StorageKeys.GV_GEMS_PINNED]: ['g2'],
    });
    (browser.storage.local.get as unknown as Mock)
      .mockImplementationOnce(async () => ({
        gvGemsSidebarExpanded: true,
      }))
      .mockImplementationOnce(async () => ({
        [StorageKeys.GV_GEMS_LIST_CACHE]: { items: [gem('g1'), gem('g2')], cachedAt: 1 },
      }))
      .mockImplementationOnce(async () => ({
        [StorageKeys.GV_GEMS_MRU]: { entries: [{ ...gem('g2'), lastUsedAt: 1 }] },
      }));
    const refresh = vi.fn();
    const state = createGemsState(refresh, () => {});
    await state.load();
    const written = deferred<void>();
    (browser.storage.local.set as unknown as Mock).mockReturnValueOnce(written.promise);
    const pending = state.saveCache([gem('g1')]);
    state.stop();
    written.resolve();
    await pending;

    expect(browser.storage.local.set).toHaveBeenCalledTimes(1);
    expect(browser.storage.sync.set).not.toHaveBeenCalled();
    expect(refresh).not.toHaveBeenCalled();
    await state.saveCache([gem('late')]);
    expect(browser.storage.local.set).toHaveBeenCalledTimes(1);
  });
});
