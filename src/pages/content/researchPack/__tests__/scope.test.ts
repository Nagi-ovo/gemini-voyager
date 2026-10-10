import { describe, expect, it, vi } from 'vitest';

import { buildScopedStorageKey } from '@/core/services/AccountIsolationService';
import { StorageKeys } from '@/core/types/common';

import { createResearchPackKeyResolver, isIsolationSettingChange, scopeIdentity } from '../scope';

const PAGE = 'https://gemini.google.com/u/1/app/abc';
const context = { pageUrl: PAGE, routeUserId: '1', email: null };

function resolverWith(sync: Record<string, unknown> | Error) {
  const resolveAccountScope = vi.fn(async (hints: { routeUserId?: string | null }) => ({
    accountKey: `route:${hints.routeUserId}`,
    accountId: 'id',
    routeUserId: hints.routeUserId ?? null,
  }));
  const resolve = createResearchPackKeyResolver({
    getSync: async () => {
      if (sync instanceof Error) throw sync;
      return sync;
    },
    resolveAccountScope: resolveAccountScope as never,
  });
  return { resolve, resolveAccountScope };
}

describe('research pack key resolver', () => {
  it('fails closed when the isolation setting cannot be read', async () => {
    const { resolve, resolveAccountScope } = resolverWith(new Error('sync unavailable'));

    await expect(resolve(context)).rejects.toThrow('sync unavailable');
    expect(resolveAccountScope).not.toHaveBeenCalled();
  });

  it('fails closed on a page that belongs to no account platform', async () => {
    const getSync = vi.fn(async () => ({}));
    const resolveAccountScope = vi.fn();
    const resolve = createResearchPackKeyResolver({
      getSync,
      resolveAccountScope: resolveAccountScope as never,
    });

    for (const pageUrl of ['https://chatgpt.com/c/1', 'http://localhost/u/0/app']) {
      await expect(resolve({ ...context, pageUrl })).rejects.toThrow();
    }
    expect(getSync).not.toHaveBeenCalled();
    expect(resolveAccountScope).not.toHaveBeenCalled();
    expect(
      isIsolationSettingChange(
        { [StorageKeys.GV_ACCOUNT_ISOLATION_ENABLED_GEMINI]: { newValue: true } },
        'sync',
        'https://chatgpt.com/c/1',
      ),
    ).toBe(false);
  });

  it('uses the global pack while isolation is off', async () => {
    const { resolve } = resolverWith({});
    await expect(resolve(context)).resolves.toBe(StorageKeys.RESEARCH_PACK);
  });

  it('scopes by the bound context, honoring the platform flag over the legacy one', async () => {
    const { resolve, resolveAccountScope } = resolverWith({
      [StorageKeys.GV_ACCOUNT_ISOLATION_ENABLED_GEMINI]: true,
      [StorageKeys.GV_ACCOUNT_ISOLATION_ENABLED]: false,
    });

    await expect(resolve(context)).resolves.toBe(
      buildScopedStorageKey(StorageKeys.RESEARCH_PACK, 'route:1'),
    );
    expect(resolveAccountScope).toHaveBeenCalledWith({
      pageUrl: PAGE,
      routeUserId: '1',
      email: null,
    });
  });

  it('falls back to the legacy isolation flag', async () => {
    const { resolve } = resolverWith({ [StorageKeys.GV_ACCOUNT_ISOLATION_ENABLED]: true });
    await expect(resolve(context)).resolves.toBe(
      buildScopedStorageKey(StorageKeys.RESEARCH_PACK, 'route:1'),
    );
  });
});

describe('research pack scope changes', () => {
  it('identifies a scope by platform, route and email, not by conversation', () => {
    const bound = { pageUrl: PAGE, routeUserId: '0', email: null };
    const same = scopeIdentity(bound);
    expect(scopeIdentity({ ...bound, pageUrl: `${PAGE}/other` })).toBe(same);
    expect(scopeIdentity({ ...bound, routeUserId: '1' })).not.toBe(same);
    expect(scopeIdentity({ ...bound, email: 'b@example.com' })).not.toBe(same);
    expect(scopeIdentity({ ...bound, email: 'c@example.com' })).not.toBe(
      scopeIdentity({ ...bound, email: 'b@example.com' }),
    );
    expect(scopeIdentity({ ...bound, pageUrl: 'https://aistudio.google.com/prompts' })).not.toBe(
      same,
    );
  });

  it('reacts only to isolation flags in sync storage', () => {
    const flag = { [StorageKeys.GV_ACCOUNT_ISOLATION_ENABLED_GEMINI]: { newValue: true } };

    expect(isIsolationSettingChange(flag, 'sync', PAGE)).toBe(true);
    expect(
      isIsolationSettingChange({ [StorageKeys.GV_ACCOUNT_ISOLATION_ENABLED]: {} }, 'sync', PAGE),
    ).toBe(true);
    expect(isIsolationSettingChange(flag, 'local', PAGE)).toBe(false);
    expect(isIsolationSettingChange({ [StorageKeys.LANGUAGE]: {} }, 'sync', PAGE)).toBe(false);
  });
});
