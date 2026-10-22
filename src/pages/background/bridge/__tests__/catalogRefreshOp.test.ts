import { describe, expect, it, vi } from 'vitest';

import { StorageKeys } from '@/core/types/common';
import type { OpName, ValidatedBridgeTask } from '@/features/bridge/protocol';
import type { HostCatalogCacheEntry } from '@/features/plugins/remote/hostCatalogCache';
import type { HostCatalogRefreshResult } from '@/features/plugins/remote/hostCatalogRefresh';

import { createBridgeDispatcher } from '../bridgeDispatcher';
import { BRIDGE_PLUGIN_ID, createBridgePolicy } from '../bridgePolicy';
import { createBridgeTabs } from '../bridgeTabs';
import { createBridgeTaskStore } from '../bridgeTaskStore';
import { createCatalogRefreshRunner } from '../catalogRefreshOp';
import { createPageLeaseArbiter } from '../pageLease';
import { fakeServer, fakeTabs, testArea } from './bridgeTestKit';

const NOW = 1_800_000_000_000;
const DAY = 24 * 60 * 60 * 1000;
const SERVER = { serverId: 'srv-a', port: 47321, token: 't' };

const site = (revision: number, allow: OpName[]) => ({
  id: 'chatgpt',
  label: 'ChatGPT',
  matches: ['https://chatgpt.com/*'],
  selectors: {},
  theme: { hostSelector: 'html', lightSelector: 'html.l', darkSelector: 'html.d' },
  catalogRevision: revision,
  bridge: { format: 1, allow },
});

const cached = (revision: number, fetchedAt: number): HostCatalogCacheEntry =>
  ({
    host: 'chatgpt.com',
    status: 'ok',
    manifests: [],
    fetchedAt,
    lastAttemptAt: fetchedAt,
    failureCount: 0,
    extensionVersion: 'test',
    site: site(revision, ['composer.send']),
  }) as unknown as HostCatalogCacheEntry;

function task(op: OpName, taskId: string, params: unknown = {}): ValidatedBridgeTask {
  return {
    taskId,
    jobId: `job-${taskId}`,
    op,
    opVersion: 1,
    params,
    deadlineMs: 30_000,
    issuedAt: 0,
  } as ValidatedBridgeTask;
}

function setup(options: { enabled?: boolean } = {}) {
  const session = testArea();
  const local = testArea({
    [StorageKeys.PLUGINS_STATE]: {
      [BRIDGE_PLUGIN_ID]: { enabled: options.enabled ?? true, installedAt: 1 },
    },
  });
  const store = createBridgeTaskStore({ session, local });
  const server = fakeServer();
  const now = () => NOW;
  // A policy 25 h old: stale, and it never listed catalog.refresh anyway.
  let entry: HostCatalogCacheEntry | null = cached(10, NOW - DAY - 60 * 60_000);
  const policy = createBridgePolicy({
    local,
    loadEntry: async () => entry,
    packaged: null,
    extensionVersion: 'test',
    hasOrigin: async () => true,
    refreshCatalog: async () => {},
    loadOnlineUpdatesEnabled: async () => true,
    now,
  });
  const refresh = vi.fn(async (_host: string): Promise<HostCatalogRefreshResult> => ({
    ok: true,
    status: 'unchanged',
    checkedAt: NOW,
  }));
  const dispatcher = createBridgeDispatcher({
    store,
    lease: createPageLeaseArbiter({
      area: session,
      ready: async () => {},
      probe: async () => 'no-answer',
      now,
    }),
    policy,
    tabs: createBridgeTabs({ store, api: fakeTabs().api, now }),
    client: server.client,
    connection: async () => SERVER,
    ready: async () => {},
    refreshCatalog: createCatalogRefreshRunner({
      refresh: (host) => refresh(host),
      loadEntry: async () => entry,
      extensionVersion: 'test',
    }),
    now,
  });
  const resultOf = (taskId: string) =>
    server.results().find((call) => call.taskId === taskId)?.body as
      | { ok: boolean; data?: Record<string, unknown>; error?: { code: string } }
      | undefined;
  return {
    dispatcher,
    refresh,
    resultOf,
    setEntry: (next: HostCatalogCacheEntry | null) => {
      entry = next;
    },
  };
}

describe('catalog.refresh', () => {
  it('refreshes the page data even when the cached policy does not list catalog.refresh', async () => {
    const t = setup();
    await t.dispatcher.onTask(task('composer.send', 'T0', { text: 'hi' }), SERVER);
    expect(t.resultOf('T0')?.error?.code).toBe('policy-stale');

    t.refresh.mockImplementation(async () => {
      // The new catalog lands while the op runs; the policy recheck that follows keeps it.
      t.setEntry(cached(11, NOW));
      await t.dispatcher.recheckPolicy();
      return { ok: true, status: 'updated', checkedAt: NOW };
    });
    await t.dispatcher.onTask(task('catalog.refresh', 'T1'), SERVER);

    expect(t.refresh).toHaveBeenCalledWith('chatgpt.com');
    expect(t.resultOf('T1')).toEqual({
      ok: true,
      data: {
        host: 'chatgpt.com',
        status: 'updated',
        revision: 11,
        checkedAt: NOW,
        extensionVersion: 'test',
      },
    });
    expect(await t.dispatcher.tasks()).toEqual([]);
  });

  it('refuses to refresh while the bridge is turned off', async () => {
    const t = setup({ enabled: false });
    await t.dispatcher.onTask(task('catalog.refresh', 'T1'), SERVER);
    expect(t.refresh).not.toHaveBeenCalled();
    expect(t.resultOf('T1')?.error?.code).toBe('bridge-disabled');
  });

  it('reports a fetch that failed as a result the CLI can show, keeping the cached revision', async () => {
    const t = setup();
    t.refresh.mockRejectedValue(new Error('offline'));
    await t.dispatcher.onTask(task('catalog.refresh', 'T1', { host: 'chatgpt.com' }), SERVER);
    expect(t.resultOf('T1')).toMatchObject({
      ok: true,
      data: { status: 'failed', revision: 10, reason: 'Error: offline' },
    });
  });
});
