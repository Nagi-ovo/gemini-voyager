/** Shared setup of the dispatcher tests: a dispatcher over in-memory storage, tabs and server. */
import { vi } from 'vitest';

import { type ErrorCode, type OpName, type ValidatedBridgeTask } from '@/features/bridge/protocol';

import {
  type DispatcherConfig,
  MAX_BRIDGE_TASKS,
  createBridgeDispatcher,
} from '../bridgeDispatcher';
import { createBridgeTabs } from '../bridgeTabs';
import { createBridgeTaskStore } from '../bridgeTaskStore';
import { type LeaseProbeOutcome, createPageLeaseArbiter } from '../pageLease';
import { fakeServer, fakeTabs, testArea } from './bridgeTestKit';

export const READY = {
  url: 'https://chatgpt.com/',
  conversationId: null,
  loggedIn: true,
  mode: 'chat',
  evidence: {},
};
export const SENT = {
  conversationId: 'abc-123',
  url: 'https://chatgpt.com/c/abc-123',
  userTurnKey: 't-7',
};
export const READ = { markdown: 'OK', turnKey: 't-8', textSha256: '0'.repeat(64), files: [] };

const PARAMS: Partial<Record<OpName, unknown>> = {
  'conversation.open': { new: true },
  'composer.send': { text: 'Reply with OK' },
  'turns.read': { conversationId: 'abc-123', assistantTurnKey: 't-8' },
  'model.select': { target: { preset: 'pro' } },
};

export function task(op: OpName, taskId: string, jobId = 'J1'): ValidatedBridgeTask {
  return {
    taskId,
    jobId,
    op,
    opVersion: 1,
    params: PARAMS[op] ?? {},
    deadlineMs: 60_000,
    issuedAt: 0,
  } as ValidatedBridgeTask;
}

export const SERVER_A = { serverId: 'srv-a', port: 47321, token: 't' };
export const SERVER_B = { serverId: 'srv-b', port: 47322, token: 'u' };

export interface SetupOptions {
  readonly probe?: () => Promise<LeaseProbeOutcome>;
}

export function setup(options: SetupOptions = {}) {
  const session = testArea();
  const local = testArea();
  const store = createBridgeTaskStore({ session, local });
  const page = fakeTabs();
  const server = fakeServer();
  let clock = 1_800_000_000_000;
  const now = () => clock;
  const policy = {
    denied: null as { code: 'policy-denied'; message: string } | null,
    checkOp: vi.fn(async () => policy.denied),
    refreshIfOld: vi.fn(async () => {}),
  };
  const lease = createPageLeaseArbiter({
    area: session,
    ready: async () => {},
    probe: options.probe ?? (async () => 'no-answer'),
    now,
  });
  const tabs = createBridgeTabs({ store, api: page.api, now });
  const pairing = { current: SERVER_A as typeof SERVER_A | null };
  /** The person's popup switch (off, as in a fresh install) and their count of jobs. */
  const parallel = { allowed: false, jobs: MAX_BRIDGE_TASKS };
  const make = (
    checkOp: (op: OpName) => Promise<{ code: ErrorCode; message: string } | null> = policy.checkOp,
    config?: Partial<DispatcherConfig>,
  ) =>
    createBridgeDispatcher({
      store,
      lease,
      policy: { checkOp, refreshIfOld: policy.refreshIfOld },
      tabs,
      client: server.client,
      connection: async () => pairing.current,
      ready: async () => {},
      parallelJobs: async () => (parallel.allowed ? parallel.jobs : 1),
      now,
      ...(config ? { config } : {}),
    });
  const dispatcher = make();
  /** A loaded bridge tab whose document said hello. */
  const bridgeTab = async (docNonce = 'doc-1', active = true, jobId = 'J1') => {
    const tab = page.addTab({ active });
    await store.setTab({ tabId: tab.id, jobId, openedAt: clock, docNonce });
    return tab.id;
  };
  const resultOf = (taskId: string) =>
    server.results().find((call) => call.taskId === taskId)?.body as
      | { ok: boolean; data?: unknown; error?: { code: string } }
      | undefined;
  return {
    session,
    local,
    store,
    page,
    server,
    policy,
    lease,
    dispatcher,
    make,
    pairing,
    parallel,
    bridgeTab,
    resultOf,
    advance: (ms: number) => {
      clock += ms;
    },
    now,
  };
}
