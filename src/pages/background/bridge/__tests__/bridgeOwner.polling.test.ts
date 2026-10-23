import { describe, expect, it, vi } from 'vitest';

import { StorageKeys } from '@/core/types/common';
import { DEFAULT_PARALLEL_JOBS, MIN_PARALLEL_JOBS } from '@/features/bridge/parallelJobs';
import { bridgeError } from '@/features/bridge/protocol';
import { BUNDLED_SITE_ADAPTERS } from '@/features/plugins/catalog/sites';

import { MAX_BRIDGE_TASKS } from '../bridgeDispatcher';
import { BRIDGE_PLUGIN_ID } from '../bridgePolicy';
import { BRIDGE_SESSION_KEYS } from '../bridgeTaskStore';
import { PAIRING, json, setup } from './ownerTestKit';

describe('bridge owner: polling and pairings', () => {
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

  it('offers catalog.refresh and runs it although the policy does not list it', async () => {
    const packaged = BUNDLED_SITE_ADAPTERS.find((site) => site.id === 'chatgpt');
    expect(packaged?.bridge?.allow).not.toContain('catalog.refresh');
    const t = setup({
      local: {
        [StorageKeys.BRIDGE_PAIRING]: PAIRING,
        [StorageKeys.PLUGINS_STATE]: { [BRIDGE_PLUGIN_ID]: { enabled: true, installedAt: 1 } },
      },
    });
    t.origins.add('http://127.0.0.1/*');
    t.origins.delete('https://chatgpt.com/*');
    let polls = 0;
    t.routes['/v1/ext/poll'] = () =>
      json({
        ok: true,
        data:
          polls++ === 0
            ? {
                kind: 'task',
                task: {
                  taskId: 'T1',
                  jobId: 'J1',
                  op: 'catalog.refresh',
                  opVersion: 1,
                  params: {},
                  deadlineMs: 30_000,
                  issuedAt: 1,
                },
              }
            : { kind: 'unpaired' },
      });
    await t.owner.wake();

    // No chatgpt.com access: the page ops go, the refresh, which needs no page, stays.
    expect(t.requests.find((r) => r.path === '/v1/ext/poll')?.body).toMatchObject({
      capabilities: { ops: [{ name: 'catalog.refresh', v: 1 }] },
    });
    expect(t.catalog.refreshNow).toHaveBeenCalledWith('chatgpt.com');
    expect(t.requests.find((r) => r.path === '/v1/ext/tasks/T1/result')?.body).toMatchObject({
      ok: true,
      data: { host: 'chatgpt.com', status: 'unchanged', checkedAt: 5 },
    });
  });

  it('keeps polling a CLI 0.1.0 serve that refuses the poll over catalog.refresh, without it', async () => {
    const t = setup({
      local: {
        [StorageKeys.BRIDGE_PAIRING]: PAIRING,
        [StorageKeys.PLUGINS_STATE]: { [BRIDGE_PLUGIN_ID]: { enabled: true, installedAt: 1 } },
      },
    });
    t.origins.add('http://127.0.0.1/*');
    // As serve 0.1.0 answers: one op it does not know makes the whole poll invalid.
    t.routes['/v1/ext/poll'] = (body) => {
      const ops = (body as { capabilities: { ops: { name: string }[] } }).capabilities.ops;
      const index = ops.findIndex((op) => op.name === 'catalog.refresh');
      if (index < 0) return json({ ok: true, data: { kind: 'unpaired' } });
      return json(
        {
          ok: false,
          error: bridgeError('bad-request', 'invalid poll', {
            issues: [{ path: `capabilities.ops[${index}].name`, message: 'unknown value' }],
          }),
        },
        400,
      );
    };
    await t.owner.wake();

    const polls = t.requests.filter((r) => r.path === '/v1/ext/poll');
    expect(polls).toHaveLength(2);
    const offered = (polls[1].body as { capabilities: { ops: { name: string }[] } }).capabilities
      .ops;
    expect(offered.map((op) => op.name)).not.toContain('catalog.refresh');
    expect(offered.length).toBeGreaterThan(0);
    // The serve's answer to the second poll arrived: it dropped the pairing.
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

  it("tells the server with each poll how many jobs it runs side by side: one until allowed, then the person's count", async () => {
    const local = {
      [StorageKeys.BRIDGE_PAIRING]: PAIRING,
      [StorageKeys.PLUGINS_STATE]: { [BRIDGE_PLUGIN_ID]: { enabled: true, installedAt: 1 } },
    };
    const polled = async (extra: Record<string, unknown>) => {
      const t = setup({ local: { ...local, ...extra } });
      t.origins.add('http://127.0.0.1/*');
      t.routes['/v1/ext/poll'] = () => json({ ok: true, data: { kind: 'unpaired' } });
      await t.owner.wake();
      return t.requests.find((r) => r.path === '/v1/ext/poll')?.body;
    };
    const on = { [StorageKeys.BRIDGE_PARALLEL]: true };
    expect(await polled({})).toMatchObject({ maxTasks: 1 });
    expect(await polled({ [StorageKeys.BRIDGE_PARALLEL_JOBS]: 5 })).toMatchObject({ maxTasks: 1 });
    expect(await polled(on)).toMatchObject({ maxTasks: DEFAULT_PARALLEL_JOBS });
    expect(await polled({ ...on, [StorageKeys.BRIDGE_PARALLEL_JOBS]: 5 })).toMatchObject({
      maxTasks: 5,
    });
    // A stored count out of range or of the wrong type is clamped, never passed on.
    expect(await polled({ ...on, [StorageKeys.BRIDGE_PARALLEL_JOBS]: 99 })).toMatchObject({
      maxTasks: MAX_BRIDGE_TASKS,
    });
    expect(await polled({ ...on, [StorageKeys.BRIDGE_PARALLEL_JOBS]: 0 })).toMatchObject({
      maxTasks: MIN_PARALLEL_JOBS,
    });
    expect(await polled({ ...on, [StorageKeys.BRIDGE_PARALLEL_JOBS]: '7' })).toMatchObject({
      maxTasks: DEFAULT_PARALLEL_JOBS,
    });
  });

  it('stops the task of a pairing another server replaced and runs nothing its old poll brings', async () => {
    const t = setup({
      local: {
        [StorageKeys.BRIDGE_PAIRING]: PAIRING,
        [StorageKeys.PLUGINS_STATE]: { [BRIDGE_PLUGIN_ID]: { enabled: true, installedAt: 1 } },
      },
      session: {
        [BRIDGE_SESSION_KEYS.tasks]: [
          {
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
        ],
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
      session: { [BRIDGE_SESSION_KEYS.tabs]: [{ tabId: 5, jobId: 'J1', openedAt: 1 }] },
    });
    t.owner.onTabRemoved(5);
    await vi.waitFor(() => expect(t.session.values[BRIDGE_SESSION_KEYS.tabs]).toBeUndefined());
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
