import { describe, expect, it, vi } from 'vitest';

import { StorageKeys } from '@/core/types/common';

import { createBridgeOwner } from '../bridgeOwner';
import { BRIDGE_PLUGIN_ID } from '../bridgePolicy';
import { BRIDGE_SESSION_KEYS } from '../bridgeTaskStore';
import { contentSender, fakeTabs, testArea } from './bridgeTestKit';

const TOKEN = 'A'.repeat(43);
const PAIRING = { serverId: 'srv1', port: 47321, token: TOKEN, pairedAt: 1, protocol: 1 };
const READ = { markdown: 'OK', turnKey: 't-8', textSha256: '0'.repeat(64), files: [] };

const popup = {
  id: chrome.runtime.id,
  url: chrome.runtime.getURL('src/pages/popup/index.html'),
} as chrome.runtime.MessageSender;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

function setup(
  options: {
    session?: Record<string, unknown>;
    local?: Record<string, unknown>;
    onlineUpdatesEnabled?: boolean;
  } = {},
) {
  const session = testArea(options.session);
  const local = testArea(options.local);
  const page = fakeTabs();
  const origins = new Set<string>(['https://chatgpt.com/*']);
  const routes: Record<string, (body: unknown) => Response | Promise<Response>> = {
    '/v1/hello': () =>
      json({
        ok: true,
        data: {
          serverId: 'srv1',
          serverVersion: '0.1.0',
          protocol: { min: 1, max: 1, selected: 1 },
          paired: false,
        },
      }),
    '/v1/pair': () => json({ ok: true, data: { token: TOKEN, serverId: 'srv1' } }),
  };
  const requests: { path: string; body: unknown; headers: Record<string, string> }[] = [];
  const fetchImpl = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    const path = new URL(String(url)).pathname;
    const body = init?.body ? (JSON.parse(String(init.body)) as unknown) : undefined;
    requests.push({ path, body, headers: (init?.headers ?? {}) as Record<string, string> });
    const route = routes[path];
    return route ? route(body) : json({ ok: true, data: {} });
  });
  const settings = { onlineUpdatesEnabled: options.onlineUpdatesEnabled ?? true };
  /** What the online-update switch read when each catalog check ran. */
  const refreshes: boolean[] = [];
  const owner = createBridgeOwner({
    session,
    local,
    tabs: page.api,
    fetch: fetchImpl as unknown as typeof fetch,
    hasOrigin: async (pattern) => origins.has(pattern),
    refreshCatalog: async () => {
      refreshes.push(settings.onlineUpdatesEnabled);
    },
    loadOnlineUpdatesEnabled: async () => settings.onlineUpdatesEnabled,
    saveOnlineUpdatesEnabled: async (enabled) => {
      settings.onlineUpdatesEnabled = enabled;
    },
    alarms: { get: async () => undefined, create: vi.fn(), clear: vi.fn(async () => true) },
    browser: 'chrome',
    sleep: async () => {},
  });
  const send = async (message: Record<string, unknown>, sender = popup) =>
    (await owner.handleMessage(message, sender)) as Record<string, unknown>;
  return { session, local, page, origins, routes, requests, owner, send, settings, refreshes };
}

describe('bridge owner', () => {
  it('matches a page report that wakes a fresh worker to the task stored before it stopped', async () => {
    const t = setup({
      local: { [StorageKeys.BRIDGE_PAIRING]: PAIRING },
      session: {
        [BRIDGE_SESSION_KEYS.task]: {
          taskId: 'T1',
          jobId: 'J1',
          op: 'turns.read',
          state: 'running',
          startedAt: 1,
          deadline: Number.MAX_SAFE_INTEGER,
          lastProgressAt: 1,
          progressSeq: 0,
          tabId: 100,
          docNonce: 'doc-1',
        },
      },
    });
    let hydrate!: () => void;
    t.session.gate = new Promise<void>((resolve) => {
      hydrate = resolve;
    });
    const reply = t.owner.handleMessage(
      {
        type: 'gv.bridge.op.done',
        taskId: 'T1',
        docNonce: 'doc-1',
        outcome: { ok: true, data: READ },
      },
      contentSender(100),
    );
    hydrate();
    t.session.gate = undefined;
    expect(await reply).toEqual({ ok: true });
    const posted = t.requests.find((r) => r.path === '/v1/ext/tasks/T1/result');
    expect(posted?.body).toEqual({ ok: true, data: READ });
    expect(posted?.headers.Authorization).toBe(`Bearer ${TOKEN}`);
  });

  it('pairs once when the permission arrives after the popup closed, and the late pair reuses that result', async () => {
    const t = setup();
    expect(await t.send({ type: 'gv.bridge.pairIntent', port: 47321, code: '1234-5678' })).toEqual({
      ok: true,
      data: { pending: true },
    });
    expect(t.requests).toHaveLength(0);

    t.origins.add('http://127.0.0.1/*');
    t.owner.onPermissionsAdded(['http://127.0.0.1/*']);
    await vi.waitFor(() => expect(t.local.values[StorageKeys.BRIDGE_PAIRING]).toBeDefined());
    expect(t.requests.find((r) => r.path === '/v1/pair')?.body).toMatchObject({ code: '12345678' });

    expect(await t.send({ type: 'gv.bridge.pair', port: 47321, code: '12345678' })).toEqual({
      ok: true,
      data: { serverId: 'srv1' },
    });
    expect(t.requests.filter((r) => r.path === '/v1/pair')).toHaveLength(1);
    expect(t.session.values[BRIDGE_SESSION_KEYS.pairIntent]).toBeUndefined();
  });

  it('pairs once when two requests bring the same code at the same time', async () => {
    const t = setup();
    t.origins.add('http://127.0.0.1/*');
    const message = { type: 'gv.bridge.pair', port: 47321, code: '12345678' };
    const [first, second] = await Promise.all([t.send(message), t.send(message)]);

    expect(t.requests.filter((r) => r.path === '/v1/pair')).toHaveLength(1);
    expect(first).toEqual({ ok: true, data: { serverId: 'srv1' } });
    expect(second).toEqual(first);
  });

  it('turns online updates on before it checks the catalog for a stale policy', async () => {
    const t = setup({ onlineUpdatesEnabled: false });
    const reply = await t.send({ type: 'gv.bridge.enableRefresh' });

    expect(t.settings.onlineUpdatesEnabled).toBe(true);
    expect(t.refreshes).toEqual([true]);
    expect(reply).toEqual({ ok: true, data: { policy: 'allowed' } });
    expect(await t.send({ type: 'gv.bridge.status' })).toMatchObject({
      data: { onlineUpdatesEnabled: true },
    });
  });

  it('names the side to upgrade when the protocol ranges do not meet', async () => {
    const t = setup();
    t.origins.add('http://127.0.0.1/*');
    t.routes['/v1/hello'] = () =>
      json({
        ok: true,
        data: {
          serverId: 'srv1',
          serverVersion: '9.0.0',
          protocol: { min: 2, max: 3, selected: 2 },
          paired: false,
        },
      });
    const reply = await t.send({ type: 'gv.bridge.pair', port: 47321, code: '12345678' });
    expect(reply).toMatchObject({
      ok: false,
      error: { code: 'protocol-mismatch', details: { upgrade: 'extension' } },
    });
    const status = await t.send({ type: 'gv.bridge.status' });
    expect(status).toMatchObject({
      ok: true,
      data: { lastError: { code: 'protocol-mismatch', upgrade: 'extension' }, paired: null },
    });
    expect(t.local.values[StorageKeys.BRIDGE_PAIRING]).toBeUndefined();
  });

  it('reports status in the shape the popup reads', async () => {
    const t = setup({ local: { [StorageKeys.BRIDGE_PAIRING]: PAIRING } });
    t.origins.add('http://127.0.0.1/*');
    expect(await t.send({ type: 'gv.bridge.status' })).toEqual({
      ok: true,
      data: {
        permission: true,
        paired: { serverId: 'srv1', port: 47321, pairedAt: 1 },
        server: 'unknown',
        policy: 'allowed', // unstamped test build: the packaged chatgpt policy applies
        onlineUpdatesEnabled: true,
      },
    });
  });

  it('polls while on and paired, and forgets the pairing the server dropped', async () => {
    const t = setup({
      local: {
        [StorageKeys.BRIDGE_PAIRING]: PAIRING,
        [StorageKeys.PLUGINS_STATE]: { [BRIDGE_PLUGIN_ID]: { enabled: true, installedAt: 1 } },
      },
    });
    t.origins.add('http://127.0.0.1/*');
    t.routes['/v1/ext/poll'] = () => json({ ok: true, data: { kind: 'unpaired' } });
    await t.owner.wake();

    const poll = t.requests.find((r) => r.path === '/v1/ext/poll');
    expect(poll?.body).toMatchObject({
      inflight: [],
      policy: { state: 'allowed' },
      capabilities: { ops: expect.arrayContaining([{ name: 'composer.send', v: 1 }]) },
    });
    expect(t.local.values[StorageKeys.BRIDGE_PAIRING]).toBeUndefined();
  });

  it('does not contact the server while the builtin is off', async () => {
    const t = setup({ local: { [StorageKeys.BRIDGE_PAIRING]: PAIRING } });
    t.origins.add('http://127.0.0.1/*');
    await t.owner.wake();
    expect(t.requests).toHaveLength(0);
  });

  it('refuses popup messages from a web page and content messages from other sites', async () => {
    const t = setup();
    const page = {
      id: chrome.runtime.id,
      url: 'https://evil.example/',
      tab: { id: 3, url: 'https://evil.example/' },
    };
    expect(
      await t.send(
        { type: 'gv.bridge.pair', port: 47321, code: '12345678' },
        page as chrome.runtime.MessageSender,
      ),
    ).toMatchObject({ ok: false, error: { code: 'unauthorized' } });
    expect(
      await t.send(
        { type: 'gv.bridge.hello', docNonce: 'n' },
        page as chrome.runtime.MessageSender,
      ),
    ).toEqual({ ok: false });
    expect(t.requests).toHaveLength(0);
  });
});
