import { vi } from 'vitest';

import type { BridgeConnection, ClientResult } from '../bridgeClient';
import type { TabsApi } from '../bridgeTabs';
import type { StorageAreaLike } from '../bridgeTaskStore';

/** Yields to the macrotask queue, so interleaved async storage calls really interleave. */
export const tick = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

export interface TestArea extends StorageAreaLike {
  readonly values: Record<string, unknown>;
  /** Called after each write lands, with the keys written. */
  onWrite?: (keys: string[]) => void | Promise<void>;
  failNextGet?: boolean;
  failNextSet?: boolean;
  /** While set, every read waits for it. */
  gate?: Promise<void>;
}

/** A storage area whose reads and writes yield like the real async API. */
export function testArea(initial: Record<string, unknown> = {}): TestArea {
  const values: Record<string, unknown> = structuredClone(initial);
  const area: TestArea = {
    values,
    async get(keys) {
      if (area.gate) await area.gate;
      await tick();
      if (area.failNextGet) {
        area.failNextGet = false;
        throw new Error('read failed');
      }
      const names = typeof keys === 'string' ? [keys] : keys;
      return structuredClone(
        Object.fromEntries(names.filter((k) => k in values).map((k) => [k, values[k]])),
      );
    },
    async set(items) {
      await tick();
      if (area.failNextSet) {
        area.failNextSet = false;
        throw new Error('write failed');
      }
      Object.assign(values, structuredClone(items));
      await area.onWrite?.(Object.keys(items));
    },
    async remove(keys) {
      await tick();
      for (const key of typeof keys === 'string' ? [keys] : keys) delete values[key];
    },
  };
  return area;
}

export interface FakeTab {
  id: number;
  url: string;
  active: boolean;
}

/** Tabs API over an in-memory tab list; `onMessage` decides each content reply. */
export function fakeTabs() {
  const tabs = new Map<number, FakeTab>();
  let nextId = 100;
  const sent: { tabId: number; message: Record<string, unknown>; documentId?: string }[] = [];
  const state = {
    onMessage: (_tabId: number, _message: Record<string, unknown>): unknown => ({ accepted: true }),
  };
  const api: TabsApi = {
    create: vi.fn(async ({ url, active }) => {
      const id = nextId++;
      tabs.set(id, { id, url, active });
      return { id };
    }),
    remove: vi.fn(async (tabId: number) => {
      tabs.delete(tabId);
    }),
    get: vi.fn(async (tabId: number) => {
      const tab = tabs.get(tabId);
      if (!tab) throw new Error(`No tab with id: ${tabId}`);
      return { ...tab };
    }),
    sendMessage: vi.fn(
      async (tabId: number, message: unknown, options?: { documentId?: string }) => {
        if (!tabs.has(tabId))
          throw new Error('Could not establish connection. Receiving end does not exist.');
        const record = message as Record<string, unknown>;
        sent.push({
          tabId,
          message: record,
          ...(options?.documentId ? { documentId: options.documentId } : {}),
        });
        return state.onMessage(tabId, record);
      },
    ),
  };
  const addTab = (tab: Partial<FakeTab> = {}): FakeTab => {
    const id = tab.id ?? nextId++;
    const entry = { id, url: 'https://chatgpt.com/c/abc', active: true, ...tab };
    tabs.set(id, entry);
    return entry;
  };
  return {
    api,
    tabs,
    sent,
    state,
    addTab,
    starts: () => sent.filter((s) => s.message.type === 'gv.bridge.op.start'),
  };
}

/** The sender of our content script in `tabId`'s top frame. */
export function contentSender(tabId: number, documentId?: string): chrome.runtime.MessageSender {
  return {
    id: chrome.runtime.id,
    frameId: 0,
    tab: { id: tabId, url: 'https://chatgpt.com/c/abc' } as chrome.tabs.Tab,
    url: 'https://chatgpt.com/c/abc',
    ...(documentId ? { documentId } : {}),
  } as chrome.runtime.MessageSender;
}

/** A server-side recorder for ack / progress / result calls. */
export function fakeServer() {
  const calls: { kind: 'ack' | 'progress' | 'result'; taskId: string; body?: unknown }[] = [];
  const ok = <T>(data: T): ClientResult<T> => ({ ok: true, status: 200, data });
  const state = {
    unreachable: false,
    /** What the server answers an ack with, when not a plain ok. */
    ackReply: null as ClientResult<unknown> | null,
  };
  /** The port each result was posted to. */
  const resultPorts: number[] = [];
  const unreachable = (): ClientResult<unknown> => ({
    ok: false,
    status: 0,
    error: { code: 'server-unreachable', category: 'transient', message: 'down' },
  });
  const client = {
    ack: vi.fn(async (_c: BridgeConnection, taskId: string) => {
      calls.push({ kind: 'ack', taskId });
      if (state.ackReply) return state.ackReply;
      return state.unreachable ? unreachable() : ok({});
    }),
    progress: vi.fn(async (_c: BridgeConnection, taskId: string, seq: number, event: unknown) => {
      calls.push({ kind: 'progress', taskId, body: { seq, event } });
      return ok({});
    }),
    result: vi.fn(async (connection: BridgeConnection, taskId: string, body: unknown) => {
      if (state.unreachable) return unreachable();
      calls.push({ kind: 'result', taskId, body });
      resultPorts.push(connection.port);
      return ok({});
    }),
  };
  const results = () => calls.filter((c) => c.kind === 'result');
  return { client, calls, state, results, resultPorts };
}
