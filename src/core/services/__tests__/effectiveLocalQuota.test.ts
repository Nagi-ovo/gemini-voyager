import { afterEach, describe, expect, it, vi } from 'vitest';

import { HighlightAnnotationService } from '../HighlightAnnotationService';
import { StorageQuotaService, storageQuotaService } from '../StorageQuotaService';
import {
  HighlightAnnotationError,
  createHighlightSourceTextHash,
} from '../highlightAnnotationData';

const MIB = 1024 * 1024;

type Target = 'chrome' | 'firefox' | 'safari';

function service(target: Target, granted: boolean, safari: number | null, declared?: number) {
  const area = {
    get: async () => ({}),
    getBytesInUse: async () => 0,
    ...(declared === undefined ? {} : { QUOTA_BYTES: declared }),
  };
  const required = granted && target !== 'safari';
  const chromeApi = {
    storage: { local: area, sync: { get: async () => ({}) } },
    permissions: { contains: async () => granted, request: async () => granted },
    runtime: {
      lastError: null,
      getManifest: () => ({
        permissions: required ? ['unlimitedStorage'] : [],
        optional_permissions: required ? [] : ['unlimitedStorage'],
      }),
    },
  };
  return new StorageQuotaService({
    chromeApi,
    buildTarget: () => target,
    userAgent: () => '',
    safariMajorVersion: () => safari,
    legacySafariStorageLimit: () => false,
  });
}

/** Every reader of the local quota, read once each. */
async function readers(quota: StorageQuotaService) {
  const snapshot = await quota.getSnapshot();
  const headroom = await quota.getLocalHeadroom('k');
  const resolved = await quota.resolveEffectiveLocalQuota();
  return [snapshot.local.quotaBytes, headroom.quotaBytes, resolved.quotaBytes];
}

describe('one effective local quota for every caller (T25c)', () => {
  afterEach(() => vi.restoreAllMocks());

  it.each([
    // Chrome and Firefox require unlimitedStorage: no practical quota, as today.
    { target: 'chrome', granted: true, safari: null, declared: 10 * MIB, expected: null },
    { target: 'firefox', granted: true, safari: null, declared: undefined, expected: null },
    { target: 'chrome', granted: false, safari: null, declared: 10 * MIB, expected: 10 * MIB },
    { target: 'firefox', granted: false, safari: null, declared: undefined, expected: 5 * MIB },
    { target: 'safari', granted: false, safari: 17, declared: 10 * MIB, expected: 5 * MIB },
    { target: 'safari', granted: true, safari: 15, declared: undefined, expected: 10 * MIB },
    { target: 'safari', granted: true, safari: 17, declared: 10 * MIB, expected: null },
    // An unknown Safari version with the grant: the lower of the two rules.
    { target: 'safari', granted: true, safari: null, declared: 99 * MIB, expected: 10 * MIB },
    { target: 'safari', granted: true, safari: null, declared: 4 * MIB, expected: 4 * MIB },
    { target: 'safari', granted: true, safari: null, declared: undefined, expected: 10 * MIB },
  ] as const)(
    '$target, granted $granted, Safari $safari, declared $declared',
    async ({ target, granted, safari, declared, expected }) => {
      const values = await readers(service(target, granted, safari, declared));

      expect(values).toEqual([expected, expected, expected]);
    },
  );

  it('re-reads the grant on every call', async () => {
    let granted = false;
    const quota = new StorageQuotaService({
      chromeApi: {
        storage: { local: { get: async () => ({}) } },
        permissions: { contains: async () => granted, request: async () => true },
        runtime: {
          lastError: null,
          getManifest: () => ({ optional_permissions: ['unlimitedStorage'] }),
        },
      },
      buildTarget: () => 'safari',
      userAgent: () => '',
      safariMajorVersion: () => 17,
      legacySafariStorageLimit: () => false,
    });

    await expect(quota.resolveEffectiveLocalQuota()).resolves.toMatchObject({
      quotaBytes: 5 * MIB,
    });
    granted = true;
    await expect(quota.resolveEffectiveLocalQuota()).resolves.toMatchObject({ quotaBytes: null });
  });

  it('is the quota the highlights check their soft cap against', async () => {
    const items: Record<string, unknown> = {};
    vi.stubGlobal('chrome', {
      ...globalThis.chrome,
      storage: {
        local: {
          get: async (keys: string[] | string | null) =>
            keys === null
              ? { ...items }
              : Object.fromEntries(
                  [keys]
                    .flat()
                    .filter((k) => k in items)
                    .map((k) => [k, items[k]]),
                ),
          set: async (next: Record<string, unknown>) => void Object.assign(items, next),
          remove: async () => undefined,
        },
      },
    });
    vi.spyOn(storageQuotaService, 'resolveEffectiveLocalQuota').mockResolvedValue({
      quotaBytes: 1024,
      estimated: false,
    });

    const error = await new HighlightAnnotationService()
      .add(
        { platform: 'gemini', accountKey: 'email:a@b.c', accountId: 1, routeUserId: '0' },
        {
          conversationId: 'gemini:conv:abc',
          conversationUrl: 'https://gemini.google.com/app/abc',
          conversationTitle: 'Notes',
          turnId: 'u-turn-1',
          role: 'assistant',
          anchor: {
            quote: { exact: 'passage', prefix: 'Before ', suffix: ' after' },
            position: { start: 0, end: 7 },
            sourceTextHash: createHighlightSourceTextHash('response source'),
          },
          color: 'yellow',
        },
      )
      .catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(HighlightAnnotationError);
    expect((error as HighlightAnnotationError).context).toMatchObject({ runtimeQuotaBytes: 1024 });
  });
});
