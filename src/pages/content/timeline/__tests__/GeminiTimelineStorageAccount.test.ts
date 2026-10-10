import { afterEach, expect, it, vi } from 'vitest';

import { accountIsolationService } from '@/core/services/AccountIsolationService';
import { hashString } from '@/core/utils/hash';

import { createGeminiTimelineStoragePolicy } from '../GeminiTimelineStorage';

afterEach(() => {
  document.body.replaceChildren();
  vi.restoreAllMocks();
});

it('uses an account header that renders after policy creation for stars and hierarchy', async () => {
  const policy = createGeminiTimelineStoragePolicy('https://gemini.google.com/app/one');
  document.body.innerHTML = '<span data-email="current@example.com"></span>';
  vi.spyOn(accountIsolationService, 'resolveAccountScope').mockImplementation(async (hints) => ({
    accountKey: hints?.email === 'current@example.com' ? 'email:opaque-current' : 'default',
    accountId: 1,
    routeUserId: hints?.routeUserId ?? null,
    emailHash: 'opaque-current',
  }));
  expect(await policy.stars.resolveAccount()).toBe('email:opaque-current');
  expect(await policy.hierarchy.resolveAccountScope()).toMatchObject({
    accountKey: 'email:opaque-current',
  });
});

it('keeps the account captured at lookup time when the header changes during resolution', async () => {
  document.body.innerHTML = '<span data-email="original@example.com"></span>';
  let release!: () => void;
  const pending = new Promise<void>((resolve) => {
    release = resolve;
  });
  vi.spyOn(accountIsolationService, 'resolveAccountScope').mockImplementation(async (hints) => {
    await pending;
    return {
      accountKey:
        hints?.email === 'original@example.com' ? 'email:opaque-original' : 'email:opaque-other',
      accountId: 1,
      routeUserId: hints?.routeUserId ?? null,
      emailHash: 'opaque-original',
    };
  });
  const policy = createGeminiTimelineStoragePolicy('https://gemini.google.com/u/1/app/one');
  const starAccount = policy.stars.resolveAccount();
  const hierarchyScope = policy.hierarchy.resolveAccountScope();
  document.body.innerHTML = '<span data-email="other@example.com"></span>';
  release();
  expect(await starAccount).toBe('email:opaque-original');
  expect(await hierarchyScope).toMatchObject({ accountKey: 'email:opaque-original' });
  expect(await policy.stars.resolveAccount()).toBe('email:opaque-other');
});

it('resolves a reused account route to the email shown at star time', async () => {
  const stored: Record<string, unknown> = {};
  vi.spyOn(chrome.storage.local, 'get').mockImplementation(async () => structuredClone(stored));
  vi.spyOn(chrome.storage.local, 'set').mockImplementation(async (values) => {
    Object.assign(stored, structuredClone(values));
  });
  const pageUrl = 'https://gemini.google.com/u/1/app/one';
  const prior = await accountIsolationService.resolveAccountScope({
    pageUrl,
    routeUserId: '1',
    email: 'prior@example.com',
  });
  const policy = createGeminiTimelineStoragePolicy(pageUrl);
  document.body.innerHTML = '<span data-email="current@example.com"></span>';
  const account = await policy.stars.resolveAccount();
  expect(account).toBe(`email:${hashString('current@example.com')}`);
  expect(account).not.toBe(prior.accountKey);
  expect(await policy.hierarchy.resolveAccountScope()).toMatchObject({ accountKey: account });
});

it('omits star account metadata when neither route nor email identifies the page', async () => {
  const policy = createGeminiTimelineStoragePolicy('https://gemini.google.com/app/one');
  expect(await policy.stars.resolveAccount()).toBeUndefined();
  expect(await policy.hierarchy.resolveAccountScope()).toBeNull();
});

it('surfaces account lookup failures instead of inventing a star account', async () => {
  vi.spyOn(accountIsolationService, 'resolveAccountScope').mockRejectedValue(
    new Error('Profile storage unavailable'),
  );
  const policy = createGeminiTimelineStoragePolicy('https://gemini.google.com/u/1/app/one');
  await expect(policy.stars.resolveAccount()).rejects.toThrow('Profile storage unavailable');
  await expect(policy.hierarchy.resolveAccountScope()).rejects.toThrow(
    'Profile storage unavailable',
  );
});
