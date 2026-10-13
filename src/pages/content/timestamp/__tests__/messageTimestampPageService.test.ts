// @vitest-environment-options { "url": "https://gemini.google.com/app/a" }
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { StorageKeys } from '@/core/types/common';

import {
  type ExtensionFake,
  GeminiPage,
  installExtension,
  settle,
} from '../../timeline/__tests__/geminiTimelineHarness';

vi.mock('webextension-polyfill', async () =>
  (await import('../../timeline/__tests__/geminiTimelineHarness')).polyfillMock(),
);

const FIRST = '1111111111111111';
const SECOND = '2222222222222222';
const THIRD = '3333333333333333';
const STORED_TIME = new Date(2024, 0, 1, 0, 0, 1).getTime();
type StoredTimes = { version: number; conversations: Record<string, Record<string, number>> };
let ext: ExtensionFake;
let api: typeof import('../messageTimestampPageService');
let stops: Array<() => void>;
let stopHistory: () => void;

async function flush(): Promise<void> {
  for (let round = 0; round < 30; round++) await Promise.resolve();
}

function saved(): StoredTimes | undefined {
  return ext.read('local', StorageKeys.GV_MESSAGE_TIMESTAMPS);
}

function seedTime(cid = 'gemini:conv:a'): void {
  ext.seed('local', {
    [StorageKeys.GV_MESSAGE_TIMESTAMPS]: {
      version: 2,
      conversations: { [cid]: { [`s-${FIRST}`]: STORED_TIME } },
    },
  });
}

function start(): () => void {
  const stop = api.startMessageTimestampPageService();
  stops.push(stop);
  return stop;
}

beforeEach(async () => {
  vi.useFakeTimers();
  vi.resetModules();
  vi.setSystemTime(new Date(2026, 8, 5, 12));
  localStorage.clear();
  document.body.innerHTML = '';
  history.replaceState({}, '', '/app/a');
  ext = installExtension();
  ext.seed('sync', { [StorageKeys.GV_SHOW_MESSAGE_TIMESTAMPS]: true });
  stops = [];
  api = await import('../messageTimestampPageService');
  const historyService = await import('../historyTimestampPageService');
  stopHistory = historyService.startHistoryTimestampPageService();
  await flush();
});

afterEach(async () => {
  stops.reverse().forEach((stop) => stop());
  stopHistory();
  await vi.runOnlyPendingTimersAsync();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
  document.body.innerHTML = '';
});

describe('independent message timestamp page service', () => {
  it('is ready before the first turn renders and records only after the 800ms baseline', async () => {
    start();
    expect(await api.whenMessageTimestampsReady()).toBe(true);
    const page = new GeminiPage([{ prompt: 'Old turn', serverId: FIRST }]);
    await settle(801);
    expect(saved()).toBeUndefined();
    page.append({ prompt: 'New turn', serverId: SECOND });
    await settle(201);
    expect(saved()?.conversations['gemini:conv:a']?.[`s-${SECOND}`]).toBe(Date.now() - 1);
    expect(document.querySelector('.gv-timestamp')?.textContent).toContain('2026-09-05');
  });

  it('finds a replacement main and viewport and continues recording without a rail', async () => {
    seedTime();
    const page = new GeminiPage([{ prompt: 'Old turn', serverId: FIRST }]);
    start();
    await api.whenMessageTimestampsReady();
    await settle(801);
    const oldMain = page.main;
    const label = document.querySelector('.gv-timestamp');
    page.render([{ prompt: 'Old turn', serverId: FIRST }]);
    await settle(201);
    expect(oldMain.querySelector('.gv-timestamp')).toBeNull();
    expect(document.querySelector('.gv-timestamp')).toBe(label);
    expect(label?.isConnected).toBe(true);
    page.append({ prompt: 'After remount', serverId: SECOND });
    await settle(201);
    expect(saved()?.conversations['gemini:conv:a']?.[`s-${SECOND}`]).toBeDefined();
    expect(document.querySelectorAll('.gv-timestamp')).toHaveLength(2);
    expect(document.querySelector('.gemini-timeline-bar')).toBeNull();
  });

  it('own history-label rendering does not restart the first-seen baseline', async () => {
    const page = new GeminiPage([{ prompt: 'Old turn', serverId: FIRST }]);
    start();
    await api.whenMessageTimestampsReady();
    await settle(700);
    const turn = [['c_a', `r_${FIRST}`], null, [['Old turn']], [Math.floor(STORED_TIME / 1000), 0]];
    const rows = JSON.stringify([
      ['wrb.fr', 'hNvQHb', JSON.stringify([[turn], null]), null, null, null, 'generic'],
    ]);
    window.dispatchEvent(
      new MessageEvent('message', {
        source: window,
        origin: location.origin,
        data: {
          source: 'gv-history-observer',
          type: 'capture',
          payload: { id: 'baseline-history', body: `)]}'\n\n${rows.length}\n${rows}\n` },
        },
      }),
    );
    await flush();
    expect(document.querySelector('.gv-timestamp')).not.toBeNull();
    await settle(101);
    page.append({ prompt: 'New turn', serverId: SECOND });
    await settle(201);
    expect(saved()?.conversations['gemini:conv:a']?.[`s-${SECOND}`]).toBeDefined();
  });

  it('does not display a full-conversation time on an unverified mounted positional turn', async () => {
    seedTime();
    const { historyTimestampStore } = await import('../historyTimestamps');
    vi.spyOn(historyTimestampStore, 'getTurnIdAliases').mockReturnValue([`s-${FIRST}`, 'u-0']);
    new GeminiPage([{ prompt: 'An unidentified turn from a partial window' }]);
    start();
    await api.whenMessageTimestampsReady();
    await settle(801);
    expect(document.querySelector('.gv-timestamp')).toBeNull();
    expect(saved()?.conversations['gemini:conv:a']?.[`s-${FIRST}`]).toBe(STORED_TIME);
  });

  it('retires old-route collection before the new chat DOM settles', async () => {
    seedTime();
    const page = new GeminiPage([{ prompt: 'A', serverId: FIRST }]);
    start();
    await api.whenMessageTimestampsReady();
    await settle(801);
    history.pushState({}, '', '/app/b');
    window.dispatchEvent(new PopStateEvent('popstate'));
    expect(document.querySelector('.gv-timestamp')).toBeNull();
    page.render([{ prompt: 'B', serverId: SECOND }]);
    await settle(499);
    expect(saved()?.conversations['gemini:conv:a']?.[`s-${SECOND}`]).toBeUndefined();
    expect(document.querySelector('.gv-timestamp')).toBeNull();
    await settle(802);
    page.append({ prompt: 'New B', serverId: THIRD });
    await settle(201);
    expect(saved()?.conversations['gemini:conv:b']?.[`s-${THIRD}`]).toBeDefined();
    expect(saved()?.conversations['gemini:conv:a']?.[`s-${THIRD}`]).toBeUndefined();
  });

  it('a route change without popstate cannot write the new DOM into the old conversation', async () => {
    const page = new GeminiPage([{ prompt: 'A', serverId: FIRST }]);
    start();
    await api.whenMessageTimestampsReady();
    await settle(801);
    history.pushState({}, '', '/u/1/app/b');
    page.render([{ prompt: 'B', serverId: SECOND }]);
    await settle(201);
    expect(saved()).toBeUndefined();
    await settle(1800);
    page.append({ prompt: 'New B', serverId: THIRD });
    await settle(201);
    expect(saved()?.conversations['gemini:conv:b']?.[`s-${THIRD}`]).toBeDefined();
    expect(saved()?.conversations['gemini:conv:a']).toBeUndefined();
  });

  it('keeps both conversation caches when an old-route persist finishes after a new-route write', async () => {
    const page = new GeminiPage([{ prompt: 'Baseline A', serverId: FIRST }]);
    const local = chrome.storage.local;
    const normalSet = local.set.bind(local) as (
      items: Record<string, unknown>,
      callback?: () => void,
    ) => Promise<void>;
    let finish!: () => void;
    let held = false;
    vi.spyOn(local, 'set').mockImplementation(
      (items: Record<string, unknown>, callback?: () => void) => {
        if (!held && StorageKeys.GV_MESSAGE_TIMESTAMPS in items) {
          held = true;
          return new Promise<void>((resolve) => {
            finish = () => {
              void normalSet(items, callback);
              resolve();
            };
          });
        }
        return normalSet(items, callback);
      },
    );
    start();
    await api.whenMessageTimestampsReady();
    await settle(801);
    page.append({ prompt: 'New A', serverId: SECOND });
    await settle(201);
    expect(held).toBe(true);
    history.pushState({}, '', '/app/b');
    window.dispatchEvent(new PopStateEvent('popstate'));
    page.render([{ prompt: 'Baseline B', serverId: FIRST }]);
    await settle(1301);
    page.append({ prompt: 'New B', serverId: THIRD });
    await settle(201);
    finish();
    await settle(201);
    expect(saved()?.conversations['gemini:conv:a']?.[`s-${SECOND}`]).toBeDefined();
    expect(saved()?.conversations['gemini:conv:b']?.[`s-${THIRD}`]).toBeDefined();
  });

  it.each(['sync', 'local'] as const)(
    'a %s time toggle wins over a late initial settings read and off preserves data',
    async (area) => {
      seedTime();
      ext.seed('sync', { [StorageKeys.GV_SHOW_MESSAGE_TIMESTAMPS]: false });
      new GeminiPage([{ prompt: 'Old turn', serverId: FIRST }]);
      const { storageService } = await import('@/core/services/StorageService');
      let finish!: (value: { success: true; data: boolean }) => void;
      vi.spyOn(storageService, 'get').mockReturnValueOnce(
        new Promise((resolve) => (finish = resolve)),
      );
      start();
      await flush();
      ext.external(area, { [StorageKeys.GV_SHOW_MESSAGE_TIMESTAMPS]: true });
      await flush();
      finish({ success: true, data: false });
      await api.whenMessageTimestampsReady();
      await flush();
      expect(document.querySelector('.gv-timestamp')).not.toBeNull();
      ext.external(area, { [StorageKeys.GV_SHOW_MESSAGE_TIMESTAMPS]: false });
      await flush();
      expect(document.querySelector('.gv-timestamp')).toBeNull();
      expect(saved()?.conversations['gemini:conv:a']?.[`s-${FIRST}`]).toBe(STORED_TIME);
    },
  );

  it('does not watch Gemini while message times are off and starts recording once switched on', async () => {
    ext.seed('sync', { [StorageKeys.GV_SHOW_MESSAGE_TIMESTAMPS]: false });
    const page = new GeminiPage([{ prompt: 'Old turn', serverId: FIRST }]);
    const observe = vi.spyOn(MutationObserver.prototype, 'observe');
    start();
    await api.whenMessageTimestampsReady();
    await settle(801);
    expect(observe.mock.calls.some(([target]) => target === document.body)).toBe(false);

    ext.external('sync', { [StorageKeys.GV_SHOW_MESSAGE_TIMESTAMPS]: true });
    await settle(801);
    page.append({ prompt: 'New turn', serverId: SECOND });
    await settle(201);
    expect(saved()?.conversations['gemini:conv:a']?.[`s-${SECOND}`]).toBeDefined();
  });

  it('records a new turn while the answer above it keeps streaming', async () => {
    const page = new GeminiPage([{ prompt: 'Old turn', serverId: FIRST }]);
    start();
    await api.whenMessageTimestampsReady();
    await settle(801);
    const streaming = page.main.appendChild(document.createTextNode(''));
    page.append({ prompt: 'New turn', serverId: SECOND });
    for (let tick = 0; tick < 10; tick++) {
      streaming.data += 'token ';
      await settle(50);
    }
    expect(saved()?.conversations['gemini:conv:a']?.[`s-${SECOND}`]).toBeDefined();
  });

  it('a retired service late read and stop cannot disturb its successor labels', async () => {
    seedTime();
    new GeminiPage([{ prompt: 'Old turn', serverId: FIRST }]);
    const { storageService } = await import('@/core/services/StorageService');
    let finish!: (value: { success: true; data: boolean }) => void;
    vi.spyOn(storageService, 'get').mockReturnValueOnce(
      new Promise((resolve) => (finish = resolve)),
    );
    const stopOld = start();
    await flush();
    vi.spyOn(chrome.storage.onChanged, 'removeListener').mockImplementationOnce(() => {
      throw new Error('Extension context invalidated');
    });
    start();
    await api.whenMessageTimestampsReady();
    await flush();
    const label = document.querySelector('.gv-timestamp');
    expect(label).not.toBeNull();
    finish({ success: true, data: false });
    await flush();
    stopOld();
    expect(document.querySelector('.gv-timestamp')).toBe(label);
    expect(label?.isConnected).toBe(true);
  });
});
