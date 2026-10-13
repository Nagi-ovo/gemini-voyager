import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { StorageKeys } from '@/core/types/common';
import {
  NOTIFICATION_ENABLEMENT_MESSAGE,
  type NotificationEnablementPayload,
} from '@/core/utils/notificationEnablement';

import {
  NOTIFICATION_ENABLEMENT_TTL_MS,
  createNotificationEnablement,
} from '../notificationEnablement';

vi.mock('webextension-polyfill', () => ({
  default: new Proxy({}, { get: (_target, key) => Reflect.get(chrome, key) }),
}));

const pendingKey = StorageKeys.RESPONSE_NOTIFICATION_ENABLE_PENDING;
const enabledKey = StorageKeys.RESPONSE_COMPLETE_NOTIFICATION_ENABLED;

function event<Args extends unknown[]>() {
  const listeners = new Set<(...args: Args) => void>();
  return {
    addListener: (listener: (...args: Args) => void) => listeners.add(listener),
    removeListener: (listener: (...args: Args) => void) => listeners.delete(listener),
    emit: (...args: Args) => [...listeners].forEach((listener) => listener(...args)),
    clear: () => listeners.clear(),
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((finish) => (resolve = finish));
  return { promise, resolve };
}

async function flush(): Promise<void> {
  for (let round = 0; round < 50; round++) await Promise.resolve();
}

describe('notification enablement retained by the background', () => {
  let local: Record<string, unknown>;
  let sync: Record<string, unknown>;
  let permission: boolean;
  let changes: ReturnType<typeof event<[Record<string, chrome.storage.StorageChange>, string]>>;
  let additions: ReturnType<typeof event<[chrome.permissions.Permissions]>>;
  let owner: ReturnType<typeof createNotificationEnablement>;

  const sender = () => ({ id: chrome.runtime.id, url: chrome.runtime.getURL('popup.html') });
  const send = (payload: NotificationEnablementPayload) =>
    owner.handle({ type: NOTIFICATION_ENABLEMENT_MESSAGE, payload }, sender())!;

  beforeEach(() => {
    vi.stubEnv('VOYAGER_BUILD_TARGET', 'chrome');
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-13T12:00:00Z'));
    local = {};
    sync = { [enabledKey]: false };
    permission = false;
    changes = event();
    additions = event();
    const area = (data: Record<string, unknown>, name: string) => ({
      get: vi.fn(async (keys: unknown) => {
        if (typeof keys === 'string') return { [keys]: structuredClone(data[keys]) };
        return { ...(keys && typeof keys === 'object' ? keys : {}), ...structuredClone(data) };
      }),
      set: vi.fn(async (items: Record<string, unknown>) => {
        const changed: Record<string, chrome.storage.StorageChange> = {};
        for (const [key, newValue] of Object.entries(items)) {
          const oldValue = data[key];
          data[key] = structuredClone(newValue);
          if (JSON.stringify(oldValue) !== JSON.stringify(newValue))
            changed[key] = { oldValue, newValue };
        }
        if (Object.keys(changed).length) changes.emit(changed, name);
      }),
      remove: vi.fn(async (key: string) => {
        const oldValue = data[key];
        delete data[key];
        if (oldValue !== undefined) changes.emit({ [key]: { oldValue } }, name);
      }),
    });
    vi.stubGlobal('chrome', {
      ...chrome,
      storage: { local: area(local, 'local'), sync: area(sync, 'sync'), onChanged: changes },
      permissions: {
        contains: vi.fn(async () => permission),
        onAdded: additions,
      },
    });
    owner = createNotificationEnablement();
    owner.registerListeners();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    vi.useRealTimers();
  });

  it.each(['intent-first', 'grant-first'] as const)(
    'a notifications grant completes the same request in either arrival order (%s)',
    async (order) => {
      if (order === 'grant-first') {
        permission = true;
        additions.emit({ permissions: ['notifications'] });
        await flush();
        expect(sync[enabledKey]).toBe(false);
      }
      await send({ action: 'begin', requestId: 'first' });
      if (order === 'intent-first') {
        expect(local[pendingKey]).toEqual({ id: 'first', requestedAt: Date.now() });
        permission = true;
        additions.emit({ permissions: ['notifications'] });
        await flush();
      }
      expect(sync[enabledKey]).toBe(true);
      expect(local[pendingKey]).toBeUndefined();
    },
  );

  it('unrelated grants and notification grants without an intent never turn completion notifications on', async () => {
    permission = true;
    additions.emit({ permissions: ['notifications'] });
    await flush();
    expect(sync[enabledKey]).toBe(false);
    permission = false;
    await send({ action: 'begin', requestId: 'waiting' });
    permission = true;
    additions.emit({ origins: ['https://example.com/*'] });
    await flush();
    expect(sync[enabledKey]).toBe(false);
    expect(local[pendingKey]).toMatchObject({ id: 'waiting' });
  });

  it('an obsolete finish cannot complete or discard a newer request, and denial retires its own intent', async () => {
    await send({ action: 'begin', requestId: 'older' });
    await send({ action: 'begin', requestId: 'newer' });
    permission = true;
    await send({ action: 'finish', requestId: 'older', granted: true });
    expect(sync[enabledKey]).toBe(false);
    expect(local[pendingKey]).toMatchObject({ id: 'newer' });
    await send({ action: 'finish', requestId: 'newer', granted: false });
    additions.emit({ permissions: ['notifications'] });
    await flush();
    expect(sync[enabledKey]).toBe(false);
    expect(local[pendingKey]).toBeUndefined();
  });

  it.each(['popup-disable', 'external-disable'] as const)(
    'a late granted permission read cannot reopen completion notifications after %s',
    async (off) => {
      if (off === 'external-disable') sync[enabledKey] = true;
      const pendingPermission = deferred<boolean>();
      vi.spyOn(chrome.permissions, 'contains').mockImplementationOnce(
        () => pendingPermission.promise,
      );
      const starting = send({ action: 'begin', requestId: 'waiting' });
      await flush();
      expect(local[pendingKey]).toMatchObject({ id: 'waiting' });
      const disabling =
        off === 'popup-disable'
          ? send({ action: 'disable' })
          : chrome.storage.sync.set({ [enabledKey]: false });
      pendingPermission.resolve(true);
      await Promise.all([starting, disabling]);
      await flush();
      expect(sync[enabledKey]).toBe(false);
      expect(local[pendingKey]).toBeUndefined();
    },
  );

  it('disable explicitly cancels a pending request even when the saved setting was already false', async () => {
    await send({ action: 'begin', requestId: 'waiting' });
    await send({ action: 'disable' });
    permission = true;
    await send({ action: 'finish', requestId: 'waiting', granted: true });
    expect(sync[enabledKey]).toBe(false);
    expect(local[pendingKey]).toBeUndefined();
    expect(chrome.storage.sync.set).toHaveBeenCalledWith({ [enabledKey]: false });
  });

  it('worker startup recovers a granted durable intent and discards expired or future intents', async () => {
    permission = true;
    local[pendingKey] = { id: 'previous-worker', requestedAt: Date.now() - 1000 };
    changes.clear();
    additions.clear();
    owner = createNotificationEnablement();
    owner.registerListeners();
    await owner.reconcile();
    expect(sync[enabledKey]).toBe(true);
    expect(local[pendingKey]).toBeUndefined();
    expect(await send({ action: 'reconcile', source: 'popup' })).toEqual({
      ok: true,
      enabled: true,
    });
    sync[enabledKey] = false;
    for (const requestedAt of [Date.now() - NOTIFICATION_ENABLEMENT_TTL_MS - 1, Date.now() + 1]) {
      local[pendingKey] = { id: 'stale', requestedAt };
      owner = createNotificationEnablement();
      await owner.reconcile();
      expect(sync[enabledKey]).toBe(false);
      expect(local[pendingKey]).toBeUndefined();
    }
  });

  it('reopening the popup clears an ungranted intent before a later announcement grant', async () => {
    await send({ action: 'begin', requestId: 'closed-denied-popup' });
    await send({ action: 'reconcile', source: 'popup' });
    expect(local[pendingKey]).toBeUndefined();
    permission = true;
    additions.emit({ permissions: ['notifications'] });
    await flush();
    expect(sync[enabledKey]).toBe(false);
  });

  it('a local intent change during an outstanding permission read wins over its obsolete grant', async () => {
    const pendingPermission = deferred<boolean>();
    vi.spyOn(chrome.permissions, 'contains').mockImplementationOnce(
      () => pendingPermission.promise,
    );
    const starting = send({ action: 'begin', requestId: 'old' });
    await flush();
    await chrome.storage.local.set({
      [pendingKey]: { id: 'replacement', requestedAt: Date.now() },
    });
    pendingPermission.resolve(true);
    await starting;
    await flush();
    expect(sync[enabledKey]).toBe(false);
    expect(local[pendingKey]).toMatchObject({ id: 'replacement' });
  });

  it('removing the intent cancels an enable whose storage write finishes late', async () => {
    await send({ action: 'begin', requestId: 'waiting' });
    permission = true;
    const writing = deferred<void>();
    const normalSet = chrome.storage.sync.set.bind(chrome.storage.sync);
    vi.spyOn(chrome.storage.sync, 'set').mockImplementationOnce(async (items) => {
      await writing.promise;
      await normalSet(items);
    });
    additions.emit({ permissions: ['notifications'] });
    await flush();
    expect(chrome.storage.sync.set).toHaveBeenCalledWith({ [enabledKey]: true });
    await chrome.storage.local.remove(pendingKey);
    writing.resolve();
    await flush();
    expect(sync[enabledKey]).toBe(false);
    expect(local[pendingKey]).toBeUndefined();
  });

  it('a recovered response does not repaint the popup on after an off during intent cleanup', async () => {
    await send({ action: 'begin', requestId: 'waiting' });
    permission = true;
    const removing = deferred<void>();
    const normalRemove = chrome.storage.local.remove.bind(chrome.storage.local);
    vi.spyOn(chrome.storage.local, 'remove').mockImplementationOnce(async (key) => {
      await removing.promise;
      await normalRemove(key);
    });
    const recovering = send({ action: 'reconcile', source: 'popup' });
    await flush();
    expect(sync[enabledKey]).toBe(true);
    await chrome.storage.sync.set({ [enabledKey]: false });
    removing.resolve();
    expect(await recovering).toEqual({ ok: true });
    await flush();
    expect(sync[enabledKey]).toBe(false);
    expect(local[pendingKey]).toBeUndefined();
  });

  it('rejects content-script and malformed requests without writing either storage area', async () => {
    expect(
      await owner.handle(
        { type: NOTIFICATION_ENABLEMENT_MESSAGE, payload: { action: 'begin', requestId: 'web' } },
        { id: chrome.runtime.id, url: 'https://gemini.google.com/app/a' },
      ),
    ).toEqual({ ok: false });
    for (const payload of [
      null,
      { action: 'begin', requestId: '' },
      { action: 'finish', requestId: 'id', granted: 'true' },
      { action: 'reconcile', source: 'web' },
    ]) {
      expect(
        await owner.handle({ type: NOTIFICATION_ENABLEMENT_MESSAGE, payload }, sender()),
      ).toEqual({ ok: false });
    }
    expect(owner.handle({ type: 'unrelated' }, sender())).toBeNull();
    expect(chrome.storage.local.set).not.toHaveBeenCalled();
    expect(chrome.storage.sync.set).not.toHaveBeenCalled();
  });
});
