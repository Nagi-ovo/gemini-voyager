// @vitest-environment-options { "url": "https://gemini.google.com/app/source" }
import { type Mock, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import browser from 'webextension-polyfill';

import { StorageKeys } from '@/core/types/common';
import { PluginHost } from '@/features/plugins/runtime/PluginHost';
import { getNativeHandler } from '@/features/plugins/runtime/nativeHandlers';
import { createOfficialAdmission } from '@/features/plugins/runtime/officialAdmission';
import { PluginScope, type Dispose } from '@/features/plugins/runtime/pluginScope';
import { BuiltinPluginSource } from '@/features/plugins/sources/BuiltinPluginSource';
import { createForkMessagesOwner } from '@/pages/background/forkMessages';
import { confirmDriver } from '@/tests/confirmDriver';

import { registerBuiltinNativeHandlers } from '../../pluginNativeRegistration';
import { ForkNodesService } from '../ForkNodesService';
import { PENDING_FORK_KEY, type PendingForkData } from '../forkLaunch';
import type { ForkNode } from '../forkTypes';
import { startForkLinkFinisher } from '../linkFinisher';

vi.mock('webextension-polyfill', () => ({
  default: {
    storage: {
      sync: { get: vi.fn() },
      local: { get: vi.fn(), set: vi.fn(), remove: vi.fn() },
      onChanged: { addListener: vi.fn(), removeListener: vi.fn() },
    },
  },
}));

const ID = 'voyager.gemini-fork';
type StorageListener = (
  changes: Record<string, chrome.storage.StorageChange>,
  area: string,
) => void;
let local: Record<string, unknown>;
let listeners: Set<StorageListener>;
let flip: (enabled: boolean) => void;
let host: PluginHost | null;
let stopCore: () => void;
const scopes: PluginScope[] = [];

function result(keys: unknown): Record<string, unknown> {
  if (keys === null) return structuredClone(local);
  if (typeof keys === 'string') return { [keys]: structuredClone(local[keys]) };
  if (Array.isArray(keys))
    return Object.fromEntries(keys.map((key) => [key, structuredClone(local[key])]));
  return Object.fromEntries(
    Object.entries((keys ?? {}) as Record<string, unknown>).map(([key, fallback]) => [
      key,
      structuredClone(key in local ? local[key] : fallback),
    ]),
  );
}

async function flush(): Promise<void> {
  for (let i = 0; i < 30; i++) await Promise.resolve();
}

function conversation(): void {
  history.replaceState({}, '', '/u/1/app/source');
  document.title = 'Source';
  document.body.innerHTML = `<main>
    <div class="conversation-container" id="1111111111111111"><user-query><div class="user-query-bubble-with-background"><p class="query-text-line">Original question</p></div></user-query>
      <model-response><div class="markdown-main-panel">Original answer</div></model-response></div>
    <div class="conversation-container" id="2222222222222222"><user-query><div class="user-query-bubble-with-background"><p class="query-text-line">Follow-up question</p></div></user-query>
      <model-response><div class="markdown-main-panel">Follow-up answer</div></model-response></div>
  </main>`;
}

async function startHost(enabled: boolean): Promise<void> {
  const admission = createOfficialAdmission();
  admission.admit('gemini', 'fork');
  admission.close();
  host = new PluginHost({
    url: `https://gemini.google.com${location.pathname}`,
    sources: [new BuiltinPluginSource()],
    doc: document,
    admission,
    legacySettings: {
      load: async () => ({ [StorageKeys.FORK_ENABLED]: enabled }),
      subscribe(callback) {
        flip = (value) => callback({ [StorageKeys.FORK_ENABLED]: value });
        return () => {
          flip = () => {};
        };
      },
    },
    requestCatalogRefresh: () => {},
    isTopFrame: true,
  });
  await host.start();
  await flush();
}

function status(): string | undefined {
  return host?.getStatuses().find((entry) => entry.id === ID)?.kind;
}

beforeAll(registerBuiltinNativeHandlers);
beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
  local = { [StorageKeys.PLUGINS_STATE]: { [ID]: { enabled: true, installedAt: 1 } } };
  listeners = new Set();
  host = null;
  stopCore = startForkLinkFinisher();
  conversation();
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
    height: 24,
  } as DOMRect);
  vi.spyOn(HTMLElement.prototype, 'offsetParent', 'get').mockReturnValue(document.body);
  Object.defineProperty(document, 'execCommand', {
    value: vi.fn().mockReturnValue(false),
    configurable: true,
  });
  Object.defineProperty(chrome.runtime, 'lastError', { value: null, configurable: true });
  const get = (keys: unknown, callback?: (value: Record<string, unknown>) => void) => {
    const value = result(keys);
    callback?.(value);
    return Promise.resolve(value);
  };
  const set = async (items: Record<string, unknown>) => {
    const changes = Object.fromEntries(
      Object.entries(items).map(([key, value]) => [
        key,
        { oldValue: local[key], newValue: structuredClone(value) },
      ]),
    );
    Object.assign(local, structuredClone(items));
    for (const listener of listeners) listener(changes, 'local');
  };
  const remove = async (keys: string | string[]) => {
    for (const key of typeof keys === 'string' ? [keys] : keys) delete local[key];
  };
  (chrome.storage.local.get as unknown as Mock).mockImplementation(get);
  (chrome.storage.local.set as unknown as Mock).mockImplementation(set);
  (chrome.storage.local.remove as unknown as Mock).mockImplementation(remove);
  (chrome.storage.onChanged.addListener as unknown as Mock).mockImplementation(
    (listener: StorageListener) => listeners.add(listener),
  );
  (chrome.storage.onChanged.removeListener as unknown as Mock).mockImplementation(
    (listener: StorageListener) => listeners.delete(listener),
  );
  vi.mocked(browser.storage.local.get).mockImplementation(get);
  vi.mocked(browser.storage.local.set).mockImplementation(set);
  vi.mocked(browser.storage.local.remove).mockImplementation(remove);
  vi.mocked(browser.storage.sync.get).mockResolvedValue({ [StorageKeys.LANGUAGE]: 'en' });
  vi.mocked(browser.storage.onChanged.addListener).mockImplementation((listener) => {
    listeners.add(listener);
  });
  vi.mocked(browser.storage.onChanged.removeListener).mockImplementation((listener) => {
    listeners.delete(listener);
  });
  const background = createForkMessagesOwner({ get: async (keys) => result(keys), set });
  (chrome.runtime.sendMessage as unknown as Mock).mockImplementation(
    (message: unknown, callback?: (response: unknown) => void) => {
      const response = background.handle(message);
      if (response) void response.then(callback);
      else callback?.({ ok: true });
    },
  );
});

afterEach(async () => {
  host?.stop();
  for (const scope of scopes.splice(0)) await scope.dispose();
  stopCore();
  await flush();
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.restoreAllMocks();
  Reflect.deleteProperty(document, 'execCommand');
  document.body.innerHTML = '';
});

describe('fork through its registered builtin handler', () => {
  it('keeps the official plugin off with its switch and mounts one live owner when enabled', async () => {
    await startHost(false);
    await vi.advanceTimersByTimeAsync(1200);
    expect(status()).toBe('ready');
    expect(document.querySelector('.gv-fork-btn')).toBeNull();
    flip(true);
    await flush();
    await vi.advanceTimersByTimeAsync(1200);
    expect(status()).toBe('mounted');
    expect(document.querySelectorAll('.gv-fork-btn')).toHaveLength(2);
    flip(true);
    await flush();
    await vi.advanceTimersByTimeAsync(1200);
    expect(document.querySelectorAll('.gv-fork-btn')).toHaveLength(2);
    flip(false);
    await flush();
    expect(document.querySelector('.gv-fork-btn')).toBeNull();
    document
      .querySelector('main')!
      .insertAdjacentHTML('beforeend', '<user-query>A later question</user-query>');
    await vi.advanceTimersByTimeAsync(1200);
    expect(document.querySelector('.gv-fork-btn')).toBeNull();
  });

  it('opens the same account new tab with the original markdown and pending handoff', async () => {
    const open = vi.spyOn(window, 'open').mockReturnValue({} as Window);
    await startHost(true);
    await vi.advanceTimersByTimeAsync(1200);
    document.querySelectorAll<HTMLButtonElement>('.gv-fork-btn')[1].click();
    await flush();
    confirmDriver.answer('Fork');
    await flush();
    expect(open).toHaveBeenCalledExactlyOnceWith(`${location.origin}/u/1/app`, '_blank');
    const pending = local[PENDING_FORK_KEY] as PendingForkData;
    expect(pending).toMatchObject({
      sourceConversationId: 'source',
      sourceTurnId: 's-2222222222222222',
      sourceTitle: 'Source',
      mode: 'paste',
      sourceForkIndex: 0,
      nextForkIndex: 1,
    });
    expect(pending.markdown).toBe(
      '# Branch Context\nYou are continuing a branched conversation.\n- The section below is the conversation history up to the fork point.\n- Continue from the final "User" message as a new branch.\n- Do not rewrite the history; only provide the next assistant response.\n\n# Conversation History\n# Source\n\n### 👤 User\n\nOriginal question\n\n### 🤖 Assistant\n\nOriginal answer\n\n### 👤 User\n\nFollow-up question\n',
    );
  });

  it('keeps fork nodes and a pending handoff and still merges Drive records after unmount', async () => {
    const existing: ForkNode = {
      conversationId: 'source',
      turnId: 's-1111111111111111',
      conversationUrl: `${location.origin}/u/1/app/source`,
      forkGroupId: 'existing',
      forkIndex: 0,
      createdAt: 1,
    };
    await ForkNodesService.addForkNode(existing);
    local[PENDING_FORK_KEY] = {
      sourceConversationId: existing.conversationId,
      sourceTurnId: existing.turnId,
      sourceUrl: existing.conversationUrl,
      sourceTitle: 'Source',
      forkGroupId: 'pending',
      sourceForkIndex: 0,
      nextForkIndex: 1,
      mode: 'paste',
      markdown: 'Pending context',
      createdAt: Date.now(),
    } satisfies PendingForkData;
    const saved = structuredClone(local);
    await startHost(true);
    await vi.advanceTimersByTimeAsync(1200);
    flip(false);
    await flush();
    expect(local[PENDING_FORK_KEY]).toEqual(saved[PENDING_FORK_KEY]);
    expect(local[StorageKeys.FORK_NODES]).toEqual(saved[StorageKeys.FORK_NODES]);
    const cloud: ForkNode = {
      ...existing,
      conversationId: 'cloud',
      conversationUrl: `${location.origin}/u/1/app/cloud`,
      turnId: 's-3333333333333333',
      forkIndex: 1,
    };
    await expect(
      ForkNodesService.mergeCloud({
        format: 'gemini-voyager.forks.v1',
        data: { nodes: { cloud: [cloud] }, groups: {} },
      }),
    ).resolves.toBe('merged');
    expect(await ForkNodesService.getGroup('existing')).toEqual([existing, cloud]);
    expect(document.querySelector('.gv-fork-btn')).toBeNull();
  });

  it('lets the page finisher link a handed-off first send after the real host unmounts fork UI', async () => {
    history.replaceState({}, '', '/u/1/app');
    document.body.innerHTML =
      '<main></main><div class="text-input-field"><rich-textarea><div id="input" contenteditable="true"></div></rich-textarea><button aria-label="Send">Send</button></div>';
    local[PENDING_FORK_KEY] = {
      sourceConversationId: 'source',
      sourceTurnId: 's-1111111111111111',
      sourceUrl: `${location.origin}/u/1/app/source`,
      sourceTitle: 'Source',
      forkGroupId: 'handoff',
      sourceForkIndex: 0,
      nextForkIndex: 1,
      markdown: 'First fork request',
      mode: 'paste',
      createdAt: Date.now(),
    } satisfies PendingForkData;
    await startHost(true);
    expect(document.querySelector('#input')?.textContent).toBe('First fork request');
    expect(local[PENDING_FORK_KEY]).toBeUndefined();
    flip(false);
    await flush();
    expect(status()).toBe('ready');
    document.querySelector<HTMLButtonElement>('button')!.click();
    history.pushState({}, '', '/u/1/app/branch');
    document.querySelector('main')!.innerHTML =
      '<div class="conversation-container" id="b7603911375615a5"><user-query>First fork request</user-query></div>';
    window.dispatchEvent(new PopStateEvent('popstate'));
    await flush();
    await vi.advanceTimersByTimeAsync(1200);
    expect(
      (await ForkNodesService.getGroup('handoff')).map((node) => [
        node.conversationId,
        node.turnId,
      ]),
    ).toEqual([
      ['source', 's-1111111111111111'],
      ['branch', 's-b7603911375615a5'],
    ]);
    expect(document.querySelector('.gv-fork-indicator-group, .gv-fork-btn')).toBeNull();
  });

  it('removes fork controls at scope abort even while an unrelated pending disposer delays settlement', async () => {
    const scope = new PluginScope();
    scopes.push(scope);
    getNativeHandler(ID)!.activate!(scope, {}, null);
    await vi.advanceTimersByTimeAsync(1200);
    expect(document.querySelectorAll('.gv-fork-btn')).toHaveLength(2);
    let release!: (dispose: Dispose) => void;
    scope.effect(
      () =>
        new Promise<Dispose>((resolve) => {
          release = resolve;
        }),
      'pending-later-effect',
    );
    const disposed = scope.dispose();
    try {
      expect(document.querySelector('.gv-fork-btn')).toBeNull();
      expect(document.getElementById('gemini-voyager-fork-style')).toBeNull();
    } finally {
      release(() => {});
      await disposed;
    }
  });
});
