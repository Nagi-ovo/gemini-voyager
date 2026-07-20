import { beforeEach, describe, expect, it, vi } from 'vitest';

import { StorageKeys } from '@/core/types/common';

import {
  AccountIsolationService,
  buildScopedFolderStorageKey,
  detectAccountContextFromDocument,
  detectAccountPlatformFromUrl,
  extractRouteUserIdFromUrl,
} from '../AccountIsolationService';

type MockedChrome = typeof chrome;

function createChromeMock(syncSeed: Record<string, unknown> = {}): MockedChrome {
  const localStore: Record<string, unknown> = {};
  const syncStore: Record<string, unknown> = { ...syncSeed };

  const getFromStore = (
    store: Record<string, unknown>,
    keys?: unknown,
  ): Record<string, unknown> => {
    if (Array.isArray(keys)) {
      return Object.fromEntries(keys.map((key) => [String(key), store[String(key)]]));
    }
    if (typeof keys === 'string') {
      return { [keys]: store[keys] };
    }
    if (keys && typeof keys === 'object') {
      const defaults = keys as Record<string, unknown>;
      return Object.fromEntries(
        Object.keys(defaults).map((key) => [key, store[key] ?? defaults[key]]),
      );
    }
    return { ...store };
  };

  return {
    runtime: {
      sendMessage: vi.fn(),
    },
    storage: {
      local: {
        get: vi.fn(async (keys?: unknown) => getFromStore(localStore, keys)),
        set: vi.fn(async (items: Record<string, unknown>) => {
          Object.assign(localStore, items);
        }),
        remove: vi.fn(async (keys: string | string[]) => {
          const list = Array.isArray(keys) ? keys : [keys];
          list.forEach((key) => delete localStore[key]);
        }),
      },
      sync: {
        get: vi.fn(async (keys?: unknown) => getFromStore(syncStore, keys)),
        set: vi.fn(async (items: Record<string, unknown>) => {
          Object.assign(syncStore, items);
        }),
        remove: vi.fn(async (keys: string | string[]) => {
          const list = Array.isArray(keys) ? keys : [keys];
          list.forEach((key) => delete syncStore[key]);
        }),
        clear: vi.fn(async () => {
          Object.keys(syncStore).forEach((key) => delete syncStore[key]);
        }),
      },
      onChanged: {
        addListener: vi.fn(),
        removeListener: vi.fn(),
      },
    },
  } as unknown as MockedChrome;
}

describe('AccountIsolationService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.unstubAllEnvs();
    Object.defineProperty(navigator, 'locks', {
      configurable: true,
      value: undefined,
    });
    (globalThis as { chrome: MockedChrome }).chrome = createChromeMock({
      [StorageKeys.GV_ACCOUNT_ISOLATION_ENABLED]: true,
    });
  });

  it('keeps stable account id for the same email', async () => {
    const service = new AccountIsolationService();
    const first = await service.resolveAccountScope({
      pageUrl: 'https://gemini.google.com/u/1/app',
      routeUserId: '1',
      email: 'User@example.com',
    });
    const second = await service.resolveAccountScope({
      pageUrl: 'https://gemini.google.com/u/1/app/abc',
      routeUserId: '1',
      email: 'user@example.com',
    });

    expect(first.accountId).toBe(second.accountId);
    expect(first.accountKey).toBe(second.accountKey);
    expect(first.accountKey.startsWith('email:')).toBe(true);
  });

  it('reuses the same account scope when only route id is provided later', async () => {
    const service = new AccountIsolationService();
    const withEmail = await service.resolveAccountScope({
      pageUrl: 'https://gemini.google.com/u/2/app',
      routeUserId: '2',
      email: 'route-owner@example.com',
    });
    const withRouteOnly = await service.resolveAccountScope({
      pageUrl: 'https://gemini.google.com/u/2/app',
      routeUserId: '2',
    });

    expect(withRouteOnly.accountId).toBe(withEmail.accountId);
    expect(withRouteOnly.accountKey).toBe(withEmail.accountKey);
  });

  it('does not rewrite the profile map when an identical scope is resolved again', async () => {
    const service = new AccountIsolationService();
    const hints = {
      pageUrl: 'https://gemini.google.com/u/1/app',
      routeUserId: '1',
      email: 'user@example.com',
    };

    await service.resolveAccountScope(hints);
    const setSpy = chrome.storage.local.set as unknown as ReturnType<typeof vi.fn>;
    const writesAfterFirst = setSpy.mock.calls.length;
    // The first resolve creates a new profile and must persist it.
    expect(writesAfterFirst).toBeGreaterThan(0);

    const repeat = await service.resolveAccountScope(hints);
    // A second identical resolve changes nothing, so it must not write again
    // (no updatedAt-only churn / storage.onChanged fan-out on the hot path).
    expect(setSpy.mock.calls.length).toBe(writesAfterFirst);
    expect(repeat.accountKey.startsWith('email:')).toBe(true);
  });

  it('serializes profile-map updates across service instances with Web Locks', async () => {
    let lockQueue = Promise.resolve();
    const request = vi.fn(async <T>(_name: string, operation: () => Promise<T>): Promise<T> => {
      const previous = lockQueue;
      let releaseQueue: () => void = () => undefined;
      lockQueue = new Promise<void>((resolve) => {
        releaseQueue = resolve;
      });
      await previous;
      try {
        return await operation();
      } finally {
        releaseQueue();
      }
    });
    Object.defineProperty(navigator, 'locks', {
      configurable: true,
      value: { request },
    });

    const firstService = new AccountIsolationService();
    const secondService = new AccountIsolationService();
    const [first, second] = await Promise.all([
      firstService.resolveAccountScope({ routeUserId: '1', email: 'first@example.com' }),
      secondService.resolveAccountScope({ routeUserId: '2', email: 'second@example.com' }),
    ]);

    const stored = await chrome.storage.local.get(StorageKeys.GV_ACCOUNT_PROFILE_MAP);
    const map = stored[StorageKeys.GV_ACCOUNT_PROFILE_MAP] as {
      profiles: Record<string, { id: number }>;
      routeAliases: Record<string, string>;
      emailAliases: Record<string, string>;
    };

    expect(request).toHaveBeenCalledTimes(2);
    expect(request).toHaveBeenNthCalledWith(1, 'gv-account-profile-map', expect.any(Function));
    expect(Object.keys(map.profiles)).toEqual(
      expect.arrayContaining([first.accountKey, second.accountKey]),
    );
    expect(map.routeAliases).toMatchObject({ '1': first.accountKey, '2': second.accountKey });
    expect(map.emailAliases[first.emailHash!]).toBe(first.accountKey);
    expect(map.emailAliases[second.emailHash!]).toBe(second.accountKey);
    expect(new Set([first.accountId, second.accountId]).size).toBe(2);
  });

  it('resolves Firefox content-script scopes in the background instead of using Web Locks', async () => {
    vi.stubEnv('VOYAGER_BUILD_TARGET', 'firefox');
    const request = vi.fn(async () => {
      throw new Error('Permission denied to access property "then"');
    });
    Object.defineProperty(navigator, 'locks', {
      configurable: true,
      value: { request },
    });

    const scope = {
      accountKey: 'email:firefox-account',
      accountId: 7,
      routeUserId: '2',
      emailHash: 'firefox-account',
    };
    const sendMessage = chrome.runtime.sendMessage as unknown as ReturnType<typeof vi.fn>;
    sendMessage.mockResolvedValue({ ok: true, scope });
    const hints = {
      pageUrl: 'https://gemini.google.com/u/2/app',
      routeUserId: '2',
      email: 'firefox@example.com',
    };

    await expect(new AccountIsolationService().resolveAccountScope(hints)).resolves.toEqual(scope);
    expect(sendMessage).toHaveBeenCalledWith({
      type: 'gv.account.resolve',
      payload: hints,
    });
    expect(request).not.toHaveBeenCalled();
    expect(chrome.storage.local.get).not.toHaveBeenCalled();
  });

  it('extracts route user id from gemini urls', () => {
    expect(extractRouteUserIdFromUrl('https://gemini.google.com/u/3/app')).toBe('3');
    expect(extractRouteUserIdFromUrl('https://gemini.google.com/app')).toBeNull();
    expect(extractRouteUserIdFromUrl('not-a-url')).toBeNull();
  });

  it('builds deterministic scoped folder storage keys', () => {
    const keyA = buildScopedFolderStorageKey('email:abc');
    const keyB = buildScopedFolderStorageKey('email:abc');
    const keyC = buildScopedFolderStorageKey('route:1');

    expect(keyA).toBe(keyB);
    expect(keyA).not.toBe(keyC);
    expect(keyA.startsWith('gvFolderData:acct:')).toBe(true);
  });

  it('reads account context from document attributes', () => {
    document.body.innerHTML = `
      <button aria-label="Google Account: User Name (sample.user@example.com)"></button>
    `;
    const context = detectAccountContextFromDocument('https://gemini.google.com/u/4/app', document);
    expect(context.routeUserId).toBe('4');
    expect(context.email).toBe('sample.user@example.com');
  });

  it('reads AI Studio account email from account switcher structure', () => {
    document.body.innerHTML = `
      <div class="account-switcher-container">
        <button class="account-switcher-button">
          <span class="account-switcher-text"> z13264500190@gmail.com </span>
        </button>
        <alkali-accountswitcher>
          <div id="account-switcher-button">
            <div class="button-container" aria-label="Google 账号：Nag1 (z13264500190@gmail.com)"></div>
          </div>
        </alkali-accountswitcher>
      </div>
    `;

    const context = detectAccountContextFromDocument(
      'https://aistudio.google.com/prompts',
      document,
    );
    expect(context.routeUserId).toBeNull();
    expect(context.email).toBe('z13264500190@gmail.com');
  });

  it('detects account platform from url', () => {
    expect(detectAccountPlatformFromUrl('https://aistudio.google.com/prompts')).toBe('aistudio');
    expect(detectAccountPlatformFromUrl('https://aistudio.google.cn/library')).toBe('aistudio');
    expect(detectAccountPlatformFromUrl('https://gemini.google.com/app')).toBe('gemini');
    expect(detectAccountPlatformFromUrl(null)).toBe('gemini');
  });

  it('prefers platform-specific isolation switches over legacy switch', async () => {
    (globalThis as { chrome: MockedChrome }).chrome = createChromeMock({
      [StorageKeys.GV_ACCOUNT_ISOLATION_ENABLED]: true,
      [StorageKeys.GV_ACCOUNT_ISOLATION_ENABLED_GEMINI]: false,
      [StorageKeys.GV_ACCOUNT_ISOLATION_ENABLED_AISTUDIO]: true,
    });

    const service = new AccountIsolationService();
    await expect(service.isIsolationEnabled({ platform: 'gemini' })).resolves.toBe(false);
    await expect(service.isIsolationEnabled({ platform: 'aistudio' })).resolves.toBe(true);
  });

  it('falls back to legacy isolation switch when platform-specific switch is missing', async () => {
    (globalThis as { chrome: MockedChrome }).chrome = createChromeMock({
      [StorageKeys.GV_ACCOUNT_ISOLATION_ENABLED]: true,
    });

    const service = new AccountIsolationService();
    await expect(service.isIsolationEnabled({ platform: 'gemini' })).resolves.toBe(true);
    await expect(service.isIsolationEnabled({ platform: 'aistudio' })).resolves.toBe(true);
  });
});
