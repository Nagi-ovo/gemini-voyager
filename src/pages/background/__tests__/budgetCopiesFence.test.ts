import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { DataBackupService } from '@/core/services/DataBackupService';
import { AUTHORITY_FENCE_KEY } from '@/features/folder/owner/authorityFence';
import { LegacyFolderFence } from '@/features/folder/owner/legacyFolderFence';
import { FOLDER_PLATFORMS } from '@/features/folder/platforms';
import { requestBudgetCopy } from '@/features/storage/budgetCopyMessage';
import { createStorageBudget } from '@/features/storage/storageBudget';

import { startBudgetCopies } from '../budgetCopies';

vi.mock('webextension-polyfill', () => ({
  default: {
    get storage() {
      return chrome.storage;
    },
    get runtime() {
      return chrome.runtime;
    },
  },
}));

type Listener = (
  message: unknown,
  sender: chrome.runtime.MessageSender,
  response: (reply: unknown) => void,
) => boolean | undefined;
const sites = ['gemini', 'aistudio', 'chatgpt'] as const;
const cases = sites.flatMap((site) =>
  ['', ':acct:abc123'].map((scope) => ({
    site,
    namespace: `${site}-folders${scope}`,
    key: FOLDER_PLATFORMS[site].folderStorageKey,
  })),
);
let stored: Record<string, unknown>;
let listener: Listener;
let originalStorage: typeof chrome.storage;
const fences: LegacyFolderFence[] = [];
const backups: DataBackupService<unknown>[] = [];
const deferred = <T>() => Promise.withResolvers<T>();
const measure = { bytesInUse: 0, keyBytes: 0, limitBytes: 25 * 1024 * 1024, quotaBytes: null };
async function settle() {
  for (let i = 0; i < 60; i++) await Promise.resolve();
}
function wire(hold?: {
  at: 'queue' | 'measurement';
  entered: ReturnType<typeof deferred<void>>;
  release: ReturnType<typeof deferred<void>>;
}) {
  const budget = createStorageBudget({
    barrier: async () => undefined,
    quota: async () => null,
    measure: async () => {
      if (hold?.at === 'measurement') {
        hold.entered.resolve();
        await hold.release.promise;
      }
      return measure;
    },
  });
  if (hold?.at === 'queue')
    void budget.runChecked(async () => {
      hold.entered.resolve();
      await hold.release.promise;
    });
  startBudgetCopies({ budget, write: (items) => chrome.storage.local.set(items) });
  return budget;
}
function backup(namespace: string, key: string) {
  const fence = new LegacyFolderFence(key, () => {}, false);
  fences.push(fence);
  const service = new DataBackupService<unknown>(
    namespace,
    () => true,
    () => fence.canWrite,
    (operation) => fence.write(operation),
  );
  backups.push(service);
  return service;
}
beforeEach(() => {
  stored = {};
  originalStorage = chrome.storage;
  chrome.storage = {
    ...chrome.storage,
    local: {
      ...chrome.storage.local,
      get: vi.fn(async (keys: string | string[]) =>
        Object.fromEntries(
          (Array.isArray(keys) ? keys : [keys]).map((key) => [key, structuredClone(stored[key])]),
        ),
      ),
      set: vi.fn(async (items: Record<string, unknown>) => {
        Object.assign(stored, structuredClone(items));
      }),
    },
  } as unknown as typeof chrome.storage;
  vi.spyOn(chrome.runtime.onMessage, 'addListener').mockImplementation((next) => {
    listener = next as Listener;
  });
  vi.mocked(chrome.runtime.sendMessage).mockImplementation(
    (async (message: unknown) =>
      new Promise((resolve) => {
        listener(message, { id: chrome.runtime.id }, resolve);
      })) as unknown as typeof chrome.runtime.sendMessage,
  );
  vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue('Version/18.0 Safari/605.1.15');
  vi.spyOn(navigator, 'vendor', 'get').mockReturnValue('Apple Computer, Inc.');
  localStorage.clear();
  document.body.replaceChildren();
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => {
  for (const service of backups.splice(0)) service.destroy();
  for (const fence of fences.splice(0)) fence.destroy();
  chrome.storage = originalStorage;
  vi.restoreAllMocks();
  vi.useRealTimers();
  localStorage.clear();
  document.body.replaceChildren();
});

describe.each(cases)('$namespace background backup authority', ({ site, namespace, key }) => {
  const slot = `gvBackup_${namespace}_emergency`;
  it.each(['queue', 'measurement'] as const)(
    'a backup held in the budget %s cannot overwrite the owner recovery copy',
    async (at) => {
      const hold = { at, entered: deferred<void>(), release: deferred<void>() };
      wire(hold);
      const service = backup(namespace, key);
      const saving = service.createEmergencyBackup({ folders: ['Legacy'] });
      await hold.entered.promise;
      await settle();
      stored[AUTHORITY_FENCE_KEY] = { build: 'new', sites: { [site]: 'owner' } };
      const ownerCopy = JSON.stringify({
        data: { folders: ['Owner'] },
        metadata: {
          timestamp: new Date().toISOString(),
          version: '1.0',
          dataSize: 1,
          itemCount: 1,
        },
      });
      stored[slot] = ownerCopy;
      hold.release.resolve();
      expect(await saving).toBe(true); // The admitted page copy survives; only the durable write is refused.
      expect(stored[slot]).toBe(ownerCopy);
      expect(chrome.storage.local.set).not.toHaveBeenCalled();
    },
  );

  it.each(['unreadable', 'timeout', 'unknown'] as const)(
    'an %s background authority read skips a durable copy',
    async (failure) => {
      vi.useFakeTimers();
      wire();
      const service = backup(namespace, key);
      let backgroundRequestSent = false;
      const send = vi.mocked(chrome.runtime.sendMessage).getMockImplementation()! as unknown as (
        message: unknown,
      ) => Promise<unknown>;
      vi.mocked(chrome.runtime.sendMessage).mockImplementation((async (message: unknown) => {
        backgroundRequestSent = true;
        return send(message);
      }) as unknown as typeof chrome.runtime.sendMessage);
      vi.mocked(chrome.storage.local.get).mockImplementation((async (keys: string | string[]) => {
        if (keys === AUTHORITY_FENCE_KEY && backgroundRequestSent) {
          if (failure === 'unreadable') throw new Error('Unavailable');
          if (failure === 'timeout') return new Promise(() => {});
          return { [AUTHORITY_FENCE_KEY]: { sites: { [site]: 'unknown' } } };
        }
        return Object.fromEntries(
          (Array.isArray(keys) ? keys : [keys]).map((key) => [key, structuredClone(stored[key])]),
        );
      }) as typeof chrome.storage.local.get);
      stored[slot] = 'Existing recovery copy';
      const saving = service.createEmergencyBackup({ folders: ['Legacy'] });
      await settle();
      await vi.advanceTimersByTimeAsync(1000);
      expect(await saving).toBe(true);
      expect(stored[slot]).toBe('Existing recovery copy');
      expect(chrome.storage.local.set).not.toHaveBeenCalled();
    },
  );

  it('allows its legacy copies when another folder site has owner authority', async () => {
    wire();
    stored[AUTHORITY_FENCE_KEY] = {
      build: 'mixed',
      sites: {
        gemini: 'owner',
        aistudio: 'owner',
        chatgpt: 'owner',
        [site]: 'legacy',
      },
    };
    expect(await backup(namespace, key).createEmergencyBackup({ folders: ['Legacy'] })).toBe(true);
    expect(JSON.parse(stored[slot] as string).data).toEqual({ folders: ['Legacy'] });
  });

  it('a published fence missing this site refuses both page and durable writes', async () => {
    wire();
    stored[AUTHORITY_FENCE_KEY] = { build: 'incomplete', sites: {} };
    stored[key] = 'Existing folders';
    stored[slot] = 'Existing recovery copy';
    const fence = new LegacyFolderFence(key, () => {}, false);
    fences.push(fence);
    await expect(
      fence.write(() => chrome.storage.local.set({ [key]: 'Legacy' })),
    ).rejects.toThrow();
    expect(await requestBudgetCopy(slot, 'Legacy')).toBe(false);
    expect(stored[key]).toBe('Existing folders');
    expect(stored[slot]).toBe('Existing recovery copy');
  });

  it('keeps writing legacy folder copies when no authority fence exists', async () => {
    wire();
    expect(await backup(namespace, key).createEmergencyBackup({ folders: ['Legacy'] })).toBe(true);
    expect(JSON.parse(stored[slot] as string).data).toEqual({ folders: ['Legacy'] });
  });
});

it('generic backup copies do not depend on folder authority', async () => {
  wire();
  vi.mocked(chrome.storage.local.get).mockImplementation((async () => {
    throw new Error('Authority unavailable');
  }) as typeof chrome.storage.local.get);
  expect(
    await new DataBackupService('prompt-library').createEmergencyBackup({ prompts: ['Keep'] }),
  ).toBe(true);
  expect(JSON.parse(stored['gvBackup_prompt-library_emergency'] as string)).toBeDefined();
});

it('preserves underscored namespaces through every durable backup slot', async () => {
  wire();
  const namespace = 'prompt_library_primary';
  const data = { prompts: ['Keep'] };
  const service = new DataBackupService(namespace);
  backups.push(service);
  expect(await service.createPrimaryBackup(data)).toBe(true);
  expect(await service.createEmergencyBackup(data)).toBe(true);
  service.setupBeforeUnloadBackup(() => data);
  window.dispatchEvent(new Event('beforeunload'));
  await service.finishPendingWrites();
  for (const slot of ['primary', 'emergency', 'beforeUnload']) {
    expect(JSON.parse(stored[`gvBackup_${namespace}_${slot}`] as string).data).toEqual(data);
  }
  expect(JSON.parse(stored[`gvBackup_${namespace}_metadata`] as string).primary.itemCount).toBe(1);
});
