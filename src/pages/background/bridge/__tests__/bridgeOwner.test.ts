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
  const requests: {
    path: string;
    port: number;
    body: unknown;
    headers: Record<string, string>;
  }[] = [];
  const fetchImpl = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    const parsed = new URL(String(url));
    const path = parsed.pathname;
    const body = init?.body ? (JSON.parse(String(init.body)) as unknown) : undefined;
    requests.push({
      path,
      port: Number(parsed.port),
      body,
      headers: (init?.headers ?? {}) as Record<string, string>,
    });
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
          serverId: 'srv1',
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

  it('relays an upload chunk to the page holding the attach task, fetched with the token by POST', async () => {
    const t = setup({
      local: { [StorageKeys.BRIDGE_PAIRING]: PAIRING },
      session: {
        [BRIDGE_SESSION_KEYS.task]: {
          taskId: 'T1',
          jobId: 'J1',
          op: 'composer.attach',
          state: 'running',
          startedAt: 1,
          deadline: Number.MAX_SAFE_INTEGER,
          lastProgressAt: 1,
          progressSeq: 0,
          tabId: 100,
          docNonce: 'doc-1',
          serverId: 'srv1',
          blobs: [{ blobId: 'b1', size: 6 }],
        },
      },
    });
    t.routes['/v1/ext/blobs/b1/read'] = () =>
      json({ ok: true, data: { blobId: 'b1', offset: 2, base64: 'AAEC' } });
    const reply = await t.owner.handleMessage(
      {
        type: 'gv.bridge.blob.read',
        taskId: 'T1',
        docNonce: 'doc-1',
        blobId: 'b1',
        offset: 2,
        length: 3,
      },
      contentSender(100),
    );
    expect(reply).toEqual({ ok: true, base64: 'AAEC' });
    const fetched = t.requests.find((r) => r.path === '/v1/ext/blobs/b1/read');
    expect(fetched?.body).toEqual({ offset: 2, length: 3 });
    expect(fetched?.headers.Authorization).toBe(`Bearer ${TOKEN}`);
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

  it('pairs when the same code is tried again after the first try failed', async () => {
    const t = setup();
    t.origins.add('http://127.0.0.1/*');
    const helloOk = t.routes['/v1/hello'];
    // Another program on the port answers the first try.
    t.routes['/v1/hello'] = () => new Response('Unsupported method', { status: 501 });
    const message = { type: 'gv.bridge.pair', port: 47321, code: '12345678' };
    expect(await t.send(message)).toMatchObject({ ok: false });

    t.routes['/v1/hello'] = helloOk;
    expect(await t.send(message)).toEqual({ ok: true, data: { serverId: 'srv1' } });
    expect(t.requests.filter((r) => r.path === '/v1/pair')).toHaveLength(1);
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

  it("tells the server the plan of the account the bridge's pages last used, with each poll", async () => {
    const plan = { planType: 'pro', planDisplayName: 'Pro', observedAt: 1_792_000_000_000 };
    const t = setup({
      local: {
        [StorageKeys.BRIDGE_PAIRING]: PAIRING,
        [StorageKeys.PLUGINS_STATE]: { [BRIDGE_PLUGIN_ID]: { enabled: true, installedAt: 1 } },
        [StorageKeys.BRIDGE_ACCOUNT_PLANS]: {
          version: 1,
          accounts: { aaaaaaaa: plan, bbbbbbbb: { planType: 'plus', observedAt: 1 } },
          current: 'aaaaaaaa',
        },
      },
    });
    t.origins.add('http://127.0.0.1/*');
    t.routes['/v1/ext/poll'] = () => json({ ok: true, data: { kind: 'unpaired' } });
    await t.owner.wake();

    expect(t.requests.find((r) => r.path === '/v1/ext/poll')?.body).toMatchObject({
      account: plan,
    });
  });

  it('polls with no plan before any page showed one', async () => {
    const t = setup({
      local: {
        [StorageKeys.BRIDGE_PAIRING]: PAIRING,
        [StorageKeys.PLUGINS_STATE]: { [BRIDGE_PLUGIN_ID]: { enabled: true, installedAt: 1 } },
      },
    });
    t.origins.add('http://127.0.0.1/*');
    t.routes['/v1/ext/poll'] = () => json({ ok: true, data: { kind: 'unpaired' } });
    await t.owner.wake();

    expect(t.requests.find((r) => r.path === '/v1/ext/poll')?.body).toMatchObject({
      account: null,
    });
  });

  it('stops the task of a pairing another server replaced and runs nothing its old poll brings', async () => {
    const t = setup({
      local: {
        [StorageKeys.BRIDGE_PAIRING]: PAIRING,
        [StorageKeys.PLUGINS_STATE]: { [BRIDGE_PLUGIN_ID]: { enabled: true, installedAt: 1 } },
      },
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
          serverId: 'srv1',
        },
      },
    });
    t.origins.add('http://127.0.0.1/*');
    let answerPoll!: (response: Response) => void;
    t.routes['/v1/ext/poll'] = () =>
      new Promise<Response>((resolve) => {
        answerPoll = resolve;
      });
    void t.owner.wake();
    await vi.waitFor(() => expect(t.requests.some((r) => r.path === '/v1/ext/poll')).toBe(true));
    t.routes['/v1/ext/poll'] = () => new Promise<Response>(() => {});

    const replaced = { ...PAIRING, serverId: 'srv2', port: 47322 };
    t.local.values[StorageKeys.BRIDGE_PAIRING] = replaced;
    t.owner.onStorageChanged(
      { [StorageKeys.BRIDGE_PAIRING]: { oldValue: PAIRING, newValue: replaced } },
      'local',
    );
    answerPoll(
      json({
        ok: true,
        data: {
          kind: 'task',
          task: {
            taskId: 'T9',
            jobId: 'J9',
            op: 'turns.read',
            opVersion: 1,
            params: { conversationId: 'abc-123', assistantTurnKey: 't-8' },
            deadlineMs: 60_000,
            issuedAt: 1,
          },
        },
      }),
    );
    // The next poll goes to the new server, after whatever the old poll brought was handled.
    await vi.waitFor(() =>
      expect(t.requests.filter((r) => r.path === '/v1/ext/poll').length).toBeGreaterThan(1),
    );
    await vi.waitFor(async () =>
      expect((await t.send({ type: 'gv.bridge.status' })).data).not.toHaveProperty('activeTask'),
    );
    expect(t.requests.filter((r) => r.path.startsWith('/v1/ext/tasks/'))).toEqual([]);
  });

  const OUTBOX = [
    {
      taskId: 'T1',
      result: { ok: true, data: { markdown: 'a private reply' } },
      at: 1,
      serverId: 'srv1',
    },
  ];
  const ON = { [BRIDGE_PLUGIN_ID]: { enabled: true, installedAt: 1 } };

  it('drops reply text waiting in the outbox when the person unpairs', async () => {
    const t = setup({
      local: { [StorageKeys.BRIDGE_PAIRING]: PAIRING, [StorageKeys.BRIDGE_OUTBOX]: OUTBOX },
    });
    await t.send({ type: 'gv.bridge.unpair' });
    expect(t.local.values[StorageKeys.BRIDGE_OUTBOX]).toBeUndefined();
  });

  it('drops reply text waiting in the outbox when the bridge is turned off', async () => {
    const t = setup({
      local: {
        [StorageKeys.BRIDGE_PAIRING]: PAIRING,
        [StorageKeys.PLUGINS_STATE]: ON,
        [StorageKeys.BRIDGE_OUTBOX]: OUTBOX,
      },
    });
    t.owner.onStorageChanged(
      { [StorageKeys.PLUGINS_STATE]: { oldValue: ON, newValue: {} } },
      'local',
    );
    await vi.waitFor(() => expect(t.local.values[StorageKeys.BRIDGE_OUTBOX]).toBeUndefined());
    expect(t.local.values[StorageKeys.BRIDGE_PAIRING]).toEqual(PAIRING);
  });

  it('reads no session state for closed tabs while it is not paired', async () => {
    const t = setup({ local: { [StorageKeys.PLUGINS_STATE]: ON } });
    await t.send({ type: 'gv.bridge.status' }); // hydrated
    const get = vi.spyOn(t.session, 'get');
    t.owner.onTabRemoved(5);
    t.owner.onTabRemoved(6);
    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(get).not.toHaveBeenCalled();
  });

  it('still frees the page when a bridge tab closes while it is on and paired', async () => {
    const t = setup({
      local: { [StorageKeys.BRIDGE_PAIRING]: PAIRING, [StorageKeys.PLUGINS_STATE]: ON },
      session: { [BRIDGE_SESSION_KEYS.tab]: { tabId: 5, jobId: 'J1', openedAt: 1 } },
    });
    t.owner.onTabRemoved(5);
    await vi.waitFor(() => expect(t.session.values[BRIDGE_SESSION_KEYS.tab]).toBeUndefined());
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
