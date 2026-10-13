import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  type IStorageService,
  StorageFactory,
  storageService,
} from '@/core/services/StorageService';
import { type Result, type StorageKey, StorageKeys } from '@/core/types/common';
import { hashString } from '@/core/utils/hash';
import type { TimelineMarker } from '@/features/timeline/types';

import { TimestampService } from '../../timestamp/TimestampService';
import { startHistoryTimestampPageService } from '../../timestamp/historyTimestampPageService';
import {
  type HistoryTurnTimestamp,
  historyTimestampStore,
} from '../../timestamp/historyTimestamps';
import {
  startMessageTimestampPageService,
  whenMessageTimestampsReady,
} from '../../timestamp/messageTimestampPageService';
import { TimelineTimestamps } from '../TimelineTimestamps';

const SERVER_TURN_ID = 's-1111111111111111';
const STORED_TIME = new Date(2024, 0, 1, 0, 0, 1).getTime();
const SERVER_TIME = 1_783_370_737_000;
type Subscriber = Parameters<typeof historyTimestampStore.subscribe>[0];
type StorageChangeListener = Parameters<typeof chrome.storage.onChanged.addListener>[0];

describe('TimelineTimestamps', () => {
  let stored: Record<string, unknown>;
  let storage: IStorageService;
  let historyRevision: number;
  let historyTurns: HistoryTurnTimestamp[];
  const owners = new Set<TimelineTimestamps>();
  const subscribers = new Set<Subscriber>();
  const settingsListeners = new Set<StorageChangeListener>();
  let stopHistoryService: () => void = () => {};
  let stopMessageService: (() => void) | null = null;

  /** Restart the page service with a store whose identity-cache read waits for the caller. */
  function startPendingHistoryService(): () => void {
    stopHistoryService();
    let finish = () => {};
    vi.mocked(historyTimestampStore.start).mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve;
        }),
    );
    stopHistoryService = startHistoryTimestampPageService();
    return () => finish();
  }

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 8, 5, 12));
    document.body.innerHTML = '';
    history.replaceState({}, '', '/app/test');
    stored = { [StorageKeys.GV_SHOW_MESSAGE_TIMESTAMPS]: true };
    storage = {
      async get<T>(key: StorageKey): Promise<Result<T>> {
        return { success: true, data: structuredClone(stored[key]) as T };
      },
      async set<T>(key: StorageKey, value: T): Promise<Result<void>> {
        stored[key] = structuredClone(value);
        return { success: true, data: undefined };
      },
      async remove(key: StorageKey): Promise<Result<void>> {
        delete stored[key];
        return { success: true, data: undefined };
      },
      async clear(): Promise<Result<void>> {
        stored = {};
        return { success: true, data: undefined };
      },
    };
    vi.spyOn(StorageFactory, 'create').mockReturnValue(storage);
    vi.spyOn(storageService, 'get').mockImplementation(storage.get);
    vi.spyOn(TimestampService.prototype, 'recordTimestamp');
    vi.spyOn(TimestampService.prototype, 'adoptTimestamps');
    historyRevision = 0;
    historyTurns = [];
    vi.spyOn(historyTimestampStore, 'start').mockResolvedValue();
    vi.spyOn(historyTimestampStore, 'subscribe').mockImplementation((subscriber) => {
      subscribers.add(subscriber);
      return () => subscribers.delete(subscriber);
    });
    vi.spyOn(historyTimestampStore, 'getRevision').mockImplementation(() => historyRevision);
    vi.spyOn(historyTimestampStore, 'getTurns').mockImplementation(() =>
      historyTurns.length > 0 ? historyTurns : null,
    );
    vi.spyOn(historyTimestampStore, 'stop').mockImplementation(() => {});
    stopHistoryService = startHistoryTimestampPageService();
    vi.mocked(historyTimestampStore.start).mockClear();
    vi.spyOn(chrome.storage.onChanged, 'addListener').mockImplementation((listener) => {
      settingsListeners.add(listener);
    });
    vi.spyOn(chrome.storage.onChanged, 'removeListener').mockImplementation((listener) => {
      settingsListeners.delete(listener);
    });
  });

  afterEach(async () => {
    owners.forEach((owner) => owner.destroy());
    stopMessageService?.();
    stopMessageService = null;
    owners.clear();
    stopHistoryService();
    subscribers.clear();
    settingsListeners.clear();
    await vi.runOnlyPendingTimersAsync();
    vi.useRealTimers();
    vi.restoreAllMocks();
    document.body.innerHTML = '';
  });

  async function createOwner() {
    stopMessageService ??= startMessageTimestampPageService();
    await whenMessageTimestampsReady();
    const aliases = new Map<string, string[]>();
    const element = document.createElement('div');
    element.textContent = 'hello';
    const markers: TimelineMarker[] = [
      {
        id: SERVER_TURN_ID,
        element,
        summary: 'hello',
        assistantSummary: '',
        baseN: 0,
        starred: false,
      },
    ];
    const onIdentityChange = vi.fn();
    const owner = new TimelineTimestamps({
      getMarkers: () => markers,
      getTurnText: (element) => element.textContent ?? '',
      getTurnAliases: (id) => aliases.get(id) ?? [id],
      onIdentityChange,
    });
    owners.add(owner);
    await owner.init();
    return { owner, aliases, onIdentityChange };
  }

  function seed(conversationId: string, timestamps: Record<string, number>): void {
    stored[StorageKeys.GV_MESSAGE_TIMESTAMPS] = {
      version: 2,
      conversations: { [conversationId]: timestamps },
    };
  }

  function captureHistory(): void {
    historyRevision = 1;
    historyTurns = [{ turnId: SERVER_TURN_ID, userText: 'hello', timestampMs: SERVER_TIME }];
  }

  it('reads local timestamps for rail tooltips without owning labels or recording turns', async () => {
    seed('gemini:conv:test', { [SERVER_TURN_ID]: STORED_TIME });
    const h = await createOwner();
    h.owner.update();
    expect(h.owner.formatTooltipTimestamp(SERVER_TURN_ID)).toBe('2024-01-01 00:00:01');
    expect(document.querySelector('.gv-timestamp')).toBeNull();
    expect(TimestampService.prototype.recordTimestamp).not.toHaveBeenCalled();
    h.owner.destroy();
    expect(stored[StorageKeys.GV_MESSAGE_TIMESTAMPS]).toEqual({
      version: 2,
      conversations: { 'gemini:conv:test': { [SERVER_TURN_ID]: STORED_TIME } },
    });
  });

  it('prefers server history over local fallback without writing from the rail', async () => {
    seed('gemini:conv:test', { [SERVER_TURN_ID]: STORED_TIME });
    captureHistory();
    const h = await createOwner();
    expect(h.owner.formatTooltipTimestamp(SERVER_TURN_ID)).toBe(
      new TimestampService().formatAbsoluteTime(SERVER_TIME),
    );
    expect(TimestampService.prototype.recordTimestamp).not.toHaveBeenCalled();
  });

  it('looks up legacy content timestamps only through a proved full-turn index', async () => {
    seed('gemini:conv:test', { [`u-${hashString('hello|70')}`]: STORED_TIME });
    const h = await createOwner();
    expect(h.owner.formatTooltipTimestamp(SERVER_TURN_ID)).toBeNull();
    h.aliases.set(SERVER_TURN_ID, [SERVER_TURN_ID, 'u-70']);
    expect(h.owner.formatTooltipTimestamp(SERVER_TURN_ID)).toBe('2024-01-01 00:00:01');
    expect(TimestampService.prototype.recordTimestamp).not.toHaveBeenCalled();
  });

  it('refreshes only current-conversation identities even with time display off, then stops', async () => {
    stored[StorageKeys.GV_SHOW_MESSAGE_TIMESTAMPS] = false;
    const h = await createOwner();
    subscribers.forEach((subscriber) => subscriber(['c_other']));
    expect(h.onIdentityChange).not.toHaveBeenCalled();
    subscribers.forEach((subscriber) => subscriber(['c_test']));
    expect(h.onIdentityChange).toHaveBeenCalledOnce();
    expect(h.owner.formatTooltipTimestamp(SERVER_TURN_ID)).toBeNull();
    history.replaceState({}, '', '/app/other');
    subscribers.forEach((subscriber) => subscriber(['c_test']));
    expect(h.onIdentityChange).toHaveBeenCalledOnce();
    h.owner.destroy();
    history.replaceState({}, '', '/app/test');
    subscribers.forEach((subscriber) => subscriber(['c_test']));
    expect(h.onIdentityChange).toHaveBeenCalledOnce();
    expect(historyTimestampStore.stop).not.toHaveBeenCalled();
  });

  it('does not resume a destroyed facade after shared history initialization settles', async () => {
    const finishStart = startPendingHistoryService();
    vi.mocked(historyTimestampStore.stop).mockClear();
    const onIdentityChange = vi.fn();
    const owner = new TimelineTimestamps({
      getMarkers: () => [],
      getTurnText: () => '',
      getTurnAliases: (id) => [id],
      onIdentityChange,
    });
    owners.add(owner);
    const initializing = owner.init();
    owner.destroy();
    finishStart();
    await initializing;
    subscribers.forEach((subscriber) => subscriber(['c_test']));
    expect(onIdentityChange).not.toHaveBeenCalled();
    expect(owner.formatTooltipTimestamp(SERVER_TURN_ID)).toBeNull();
    expect(historyTimestampStore.stop).not.toHaveBeenCalled();
  });
});
