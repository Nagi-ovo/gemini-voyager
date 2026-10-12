import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { StorageKeys } from '@/core/types/common';
import { getCurrentLanguage } from '@/utils/i18n';
import type { AppLanguage } from '@/utils/language';

import { startUsageStatus } from '../index';
import { startUsageStatusRuntime } from '../runtime';
import type { UsageSnapshot } from '../usageSnapshot';

vi.mock('webextension-polyfill', () => ({ default: chrome }));
vi.mock('@/utils/i18n', () => ({
  initI18n: vi.fn(async () => undefined),
  getCurrentLanguage: vi.fn(async () => 'en'),
  getTranslationSync: (key: string) => key,
}));

const now = new Date(2026, 6, 18, 10).getTime();
const resetEpoch = Math.floor(now / 1000) + 4 * 3600;
let route: { hostname: string; origin: string; pathname: string; href: string };
let stored: Record<string, unknown>;
let runs: AbortController[];
let stopNative: (() => void) | undefined;

function setPath(pathname: string): void {
  route.pathname = pathname;
  route.href = `${route.origin}${pathname}`;
}

function navigate(pathname: string): void {
  setPath(pathname);
  window.dispatchEvent(new PopStateEvent('popstate'));
}

function cached(percent: number, accountKey: string): UsageSnapshot {
  return {
    accountKey,
    daily: { percent, resetLabel: '2:00 PM', resetEpoch },
    weekly: null,
    tier: 'PRO',
    sourceStartedAt: now - 1000,
    updatedAt: now,
  };
}

function response(percent: number): string {
  return JSON.stringify([
    ['wrb.fr', 'jSf9Qc', JSON.stringify([2, [[2400, percent / 100, 1, [[resetEpoch, 0]]]], false])],
  ]);
}

function observer(type: string, payload?: unknown): void {
  window.dispatchEvent(
    new MessageEvent('message', {
      source: window,
      data: { source: 'gv-usage-observer', type, payload },
    }),
  );
}

function replayIds(): number[] {
  return vi
    .mocked(window.postMessage)
    .mock.calls.flatMap(([data]) => (data.type === 'replay' ? [data.payload.id as number] : []));
}

function pill(): HTMLElement | null {
  return document.getElementById('gv-usage-pill');
}

function shownPercent(): string | null | undefined {
  return pill()?.querySelector('.gv-usage-pct')?.textContent;
}

function cacheWrites(key: string): unknown[] {
  return vi
    .mocked(chrome.storage.local.set)
    .mock.calls.flatMap(([items]) =>
      key in (items as Record<string, unknown>) ? [(items as Record<string, unknown>)[key]] : [],
    );
}

function liveStorageListeners(): number {
  return (
    vi.mocked(chrome.storage.onChanged.addListener).mock.calls.length -
    vi.mocked(chrome.storage.onChanged.removeListener).mock.calls.length
  );
}

function mountUsagePage(percent: number): void {
  document.body.innerHTML = `<usage-metrics-window><div class="gxu-currently">${percent}% used</div></usage-metrics-window>`;
}

async function startRun(): Promise<AbortController> {
  const controller = new AbortController();
  runs.push(controller);
  await startUsageStatusRuntime({ signal: controller.signal });
  return controller;
}

function pending<T>(): { promise: Promise<T>; resolve: (value: T) => void } {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(now);
  vi.clearAllMocks();
  route = {
    hostname: 'gemini.google.com',
    origin: 'https://gemini.google.com',
    pathname: '/u/2/app',
    href: 'https://gemini.google.com/u/2/app',
  };
  vi.stubGlobal('location', route);
  vi.spyOn(window, 'postMessage').mockImplementation(() => {});
  stored = { 'gvUsageCache:u/2': cached(7, 'u/2') };
  vi.mocked(chrome.storage.local.get).mockImplementation(async () => stored);
  vi.mocked(chrome.storage.local.set).mockResolvedValue();
  vi.mocked(chrome.storage.sync.get).mockImplementation(async () => ({
    [StorageKeys.USAGE_STATUS_ENABLED]: false,
  }));
  runs = [];
  document.body.innerHTML = '';
});

afterEach(() => {
  for (const run of runs) run.abort();
  stopNative?.();
  stopNative = undefined;
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
  document.body.innerHTML = '';
});

describe('usage status account and route epoch', () => {
  it('drops a scheduled usage scrape when the account changes before it fires', async () => {
    setPath('/u/2/usage');
    mountUsagePage(12);
    await startRun();
    // Gemini switched accounts; the route poller has not run yet and the old
    // account's usage page is still in the DOM.
    setPath('/u/3/usage');
    await vi.advanceTimersByTimeAsync(300);
    expect(cacheWrites('gvUsageCache:u/3')).toEqual([]);
    expect(cacheWrites(StorageKeys.GV_USAGE_CACHE)).toEqual([]);
  });

  it('disconnects the usage page observer as soon as the route leaves the account', async () => {
    setPath('/u/2/usage');
    mountUsagePage(12);
    await startRun();
    await vi.advanceTimersByTimeAsync(300);
    expect(cacheWrites('gvUsageCache:u/2')).toEqual([
      expect.objectContaining({ daily: expect.objectContaining({ percent: 12 }) }),
    ]);
    vi.mocked(chrome.storage.local.set).mockClear();
    // The next account's cache read is still in flight when the old page re-renders.
    vi.mocked(chrome.storage.local.get).mockImplementationOnce(() => pending<never>().promise);
    navigate('/u/3/usage');
    document.querySelector('.gxu-currently')!.textContent = '50% used';
    await vi.advanceTimersByTimeAsync(1_000);
    expect(chrome.storage.local.set).not.toHaveBeenCalled();
  });

  it('keeps a usage page that mutates after a pushState account switch out of the new account cache', async () => {
    setPath('/u/2/usage');
    mountUsagePage(12);
    await startRun();
    // Past the first scrape and the route poller's tick, so its next tick is 400ms away.
    await vi.advanceTimersByTimeAsync(401);
    vi.mocked(chrome.storage.local.set).mockClear();
    // Gemini's router moves to another account with pushState: no popstate.
    setPath('/u/3/usage');
    document.querySelector('.gxu-currently')!.textContent = '50% used';
    await vi.advanceTimersByTimeAsync(300);
    expect(cacheWrites('gvUsageCache:u/3')).toEqual([]);
    expect(cacheWrites(StorageKeys.GV_USAGE_CACHE)).toEqual([]);
  });

  it("shows the current account's cache when the account changes during the startup read", async () => {
    stored['gvUsageCache:u/3'] = cached(80, 'u/3');
    const startupRead = pending<Record<string, unknown>>();
    vi.mocked(chrome.storage.local.get).mockImplementationOnce(() => startupRead.promise);
    const controller = new AbortController();
    runs.push(controller);
    const started = startUsageStatusRuntime({ signal: controller.signal });
    await vi.advanceTimersByTimeAsync(0);
    setPath('/u/3/app');
    startupRead.resolve({ 'gvUsageCache:u/2': cached(7, 'u/2') });
    await started;
    expect(pill()!.querySelector('.gv-usage-empty')?.hasAttribute('hidden')).toBe(false);
    expect(shownPercent()).not.toContain('7%');
    await vi.advanceTimersByTimeAsync(250);
    expect(shownPercent()).toContain('80%');
  });
});

describe('usage status replay identity', () => {
  it('ignores a replay reply addressed to a request of a stopped usage runtime', async () => {
    const first = await startRun();
    pill()!.querySelector<HTMLButtonElement>('.gv-usage-refresh')!.click();
    const oldRequest = replayIds().at(-1)!;
    first.abort();
    await startRun();
    pill()!.querySelector<HTMLButtonElement>('.gv-usage-refresh')!.click();
    const currentRequest = replayIds().at(-1)!;
    observer('replay-result', { id: oldRequest, body: response(80) });
    expect(shownPercent()).toContain('7%');
    expect(chrome.storage.local.set).not.toHaveBeenCalled();
    observer('replay-result', { id: currentRequest, body: response(20) });
    expect(shownPercent()).toContain('20%');
  });

  it('drops a replay result that lands after the usage runtime stopped', async () => {
    const controller = await startRun();
    pill()!.querySelector<HTMLButtonElement>('.gv-usage-refresh')!.click();
    const request = replayIds().at(-1)!;
    controller.abort();
    observer('replay-result', { id: request, body: response(20) });
    await vi.advanceTimersByTimeAsync(10_000);
    expect(pill()).toBeNull();
    expect(chrome.storage.local.set).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });
});

describe('usage status runtime lifetime', () => {
  it('removes the drag listeners when usage stops in the middle of a drag', async () => {
    const added = vi.spyOn(window, 'addEventListener');
    const removed = vi.spyOn(window, 'removeEventListener');
    const controller = await startRun();
    const el = pill()!;
    el.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, button: 0, clientX: 10 }));
    expect(el.classList.contains('gv-usage-dragging')).toBe(true);
    controller.abort();
    const live = (type: string): number => {
      const gone = new Set(removed.mock.calls.filter(([t]) => t === type).map(([, fn]) => fn));
      return new Set(
        added.mock.calls.filter(([t, fn]) => t === type && !gone.has(fn)).map(([, fn]) => fn),
      ).size;
    };
    expect(live('pointermove')).toBe(0);
    expect(live('pointerup')).toBe(0);
    expect(live('resize')).toBe(0);
    expect(el.classList.contains('gv-usage-dragging')).toBe(false);
  });

  it('starts the usage runtime again when it is turned off and on before the first start finished', async () => {
    const language = pending<AppLanguage>();
    vi.mocked(getCurrentLanguage).mockImplementationOnce(() => language.promise);
    const first = new AbortController();
    runs.push(first);
    const firstStart = startUsageStatusRuntime({ signal: first.signal });
    first.abort();
    const second = await startRun();
    language.resolve('en');
    await firstStart;
    await vi.advanceTimersByTimeAsync(0);
    expect(document.querySelectorAll('#gv-usage-pill')).toHaveLength(1);
    expect(shownPercent()).toContain('7%');
    expect(liveStorageListeners()).toBe(1);
    second.abort();
    expect(pill()).toBeNull();
    expect(liveStorageListeners()).toBe(0);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('keeps scraping the usage page into the account cache while the native switch is off', async () => {
    setPath('/u/2/usage');
    mountUsagePage(12);
    stopNative = await startUsageStatus();
    await vi.advanceTimersByTimeAsync(300);
    expect(pill()).toBeNull();
    expect(cacheWrites('gvUsageCache:u/2')).toEqual([
      expect.objectContaining({
        accountKey: 'u/2',
        daily: expect.objectContaining({ percent: 12 }),
      }),
    ]);
    expect(replayIds()).toEqual([]);
  });
});
