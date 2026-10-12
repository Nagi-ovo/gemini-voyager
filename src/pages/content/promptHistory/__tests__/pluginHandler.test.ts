/**
 * Prompt history under its official builtin plugin: the native module's
 * runtime owned by a plugin scope, never reading its own switch, and leaving
 * stored history alone when the plugin turns off.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { StorageKeys } from '@/core/types/common';
import { hashString } from '@/core/utils/hash';
import { PluginScope } from '@/features/plugins/runtime/pluginScope';

import { addPromptHistory, getPromptHistory } from '../storage';

type StorageListener = (
  changes: Record<string, chrome.storage.StorageChange>,
  areaName: string,
) => void;
type SyncCallback = (result: Record<string, unknown>) => void;

let localStore: Record<string, unknown> = {};
let syncStore: Record<string, unknown> = {};
let storageListeners: StorageListener[] = [];
let heldSyncReads: Array<() => void> | null = null;
let scopes: PluginScope[] = [];
let uuidCounter = 0;
const PRIMARY_EMAIL = 'primary@example.com';
const SECONDARY_EMAIL = 'secondary@example.com';
const PRIMARY_ACCOUNT_SCOPE = `email:${hashString(PRIMARY_EMAIL)}`;
const SECONDARY_ACCOUNT_SCOPE = `email:${hashString(SECONDARY_EMAIL)}`;

function storageResult(keys: unknown, source: Record<string, unknown>): Record<string, unknown> {
  if (keys === null) return { ...source };
  if (typeof keys === 'string') return { [keys]: source[keys] };
  if (Array.isArray(keys)) {
    return Object.fromEntries(keys.map((key) => [String(key), source[String(key)]]));
  }
  if (keys && typeof keys === 'object') {
    return Object.fromEntries(
      Object.entries(keys as Record<string, unknown>).map(([key, fallback]) => [
        key,
        key in source ? source[key] : fallback,
      ]),
    );
  }
  return {};
}

/** The switch is stored off: the plugin host, not the runtime, decides whether it runs. */
function setupStorage(ctrlEnter = false): void {
  localStore = {};
  syncStore = {
    [StorageKeys.PROMPT_HISTORY_ENABLED]: false,
    [StorageKeys.CTRL_ENTER_SEND]: ctrlEnter,
  };
  storageListeners = [];
  heldSyncReads = null;
  (chrome.runtime as unknown as { lastError: null }).lastError = null;
  (chrome.storage as unknown as Record<string, unknown>).local = {
    get: vi.fn((keys: unknown, callback?: (result: Record<string, unknown>) => void) => {
      const result = storageResult(keys, localStore);
      callback?.(result);
      return Promise.resolve(result);
    }),
    set: vi.fn((items: Record<string, unknown>, callback?: () => void) => {
      Object.assign(localStore, items);
      callback?.();
      return Promise.resolve();
    }),
    remove: vi.fn((keys: string | string[], callback?: () => void) => {
      (Array.isArray(keys) ? keys : [keys]).forEach((key) => delete localStore[key]);
      callback?.();
      return Promise.resolve();
    }),
  };
  (chrome.storage as unknown as Record<string, unknown>).sync = {
    get: vi.fn((keys: unknown, callback: SyncCallback) => {
      // A held read answers, when the test releases it, with what was stored when it was made.
      const result = storageResult(keys, syncStore);
      if (heldSyncReads) heldSyncReads.push(() => callback(result));
      else callback(result);
    }),
  };
  (chrome.storage as unknown as { onChanged: unknown }).onChanged = {
    addListener: vi.fn((listener: StorageListener) => storageListeners.push(listener)),
    removeListener: vi.fn((listener: StorageListener) => {
      storageListeners = storageListeners.filter((candidate) => candidate !== listener);
    }),
  };
}

function setCurrentAccountEmail(email: string): void {
  let account = document.querySelector<HTMLElement>('[data-email]');
  if (!account) {
    account = document.createElement('button');
    document.body.appendChild(account);
  }
  account.dataset.email = email;
}

function createMainComposer(): { input: HTMLDivElement; button: HTMLButtonElement } {
  const container = document.createElement('div');
  container.className = 'text-input-field';
  const input = document.createElement('div');
  input.setAttribute('contenteditable', 'true');
  input.setAttribute('role', 'textbox');
  const button = document.createElement('button');
  button.type = 'button';
  button.setAttribute('aria-label', 'Send message');
  container.append(input, button);
  document.body.appendChild(container);
  return { input, button };
}

function pressEnter(input: HTMLElement, text: string): void {
  input.textContent = text;
  input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
}

async function settle(): Promise<void> {
  for (let i = 0; i < 4; i += 1) await Promise.resolve();
}

async function activate(): Promise<PluginScope> {
  const { activateGeminiPromptHistory } = await import('../pluginHandler');
  const scope = new PluginScope();
  scopes.push(scope);
  void activateGeminiPromptHistory(scope);
  return scope;
}

async function activated(): Promise<PluginScope> {
  const scope = await activate();
  await vi.waitFor(() => expect(document.querySelector('.gv-ph-trigger')).not.toBeNull());
  return scope;
}

async function contents(accountScope: string): Promise<string[]> {
  return (await getPromptHistory(accountScope)).map((item) => item.content).sort();
}

describe('Prompt history under its official plugin', () => {
  beforeEach(() => {
    vi.resetModules();
    document.body.replaceChildren();
    window.history.replaceState({}, '', '/u/0/app/test');
    setCurrentAccountEmail(PRIMARY_EMAIL);
    uuidCounter = 0;
    vi.spyOn(crypto, 'randomUUID').mockImplementation(
      () => `00000000-0000-4000-8000-${String(++uuidCounter).padStart(12, '0')}`,
    );
    setupStorage();
  });

  afterEach(async () => {
    await Promise.all(scopes.map((scope) => scope.dispose()));
    scopes = [];
    vi.restoreAllMocks();
  });

  it('captures sends from the main and edit inputs under the official plugin as the native module did', async () => {
    await activated();
    const main = createMainComposer();
    main.input.textContent = 'main prompt';
    main.button.click();

    const message = document.createElement('chat-message');
    const edit = document.createElement('textarea');
    edit.value = 'edited prompt';
    const update = document.createElement('button');
    update.type = 'button';
    update.className = 'update-button';
    message.append(edit, update);
    document.body.appendChild(message);
    edit.focus();
    update.click();

    await vi.waitFor(async () => {
      const items = await getPromptHistory(PRIMARY_ACCOUNT_SCOPE);
      expect(items.map(({ content, type }) => ({ content, type }))).toEqual(
        expect.arrayContaining([
          { content: 'main prompt', type: 'sent' },
          { content: 'edited prompt', type: 'edited' },
        ]),
      );
      expect(items).toHaveLength(2);
    });
  });

  it('records the new-chat path for the first send that creates a conversation', async () => {
    for (const newChat of ['/app', '/u/1/app']) {
      window.history.replaceState({}, '', newChat);
      const scope = await activated();
      const { input, button } = createMainComposer();
      input.textContent = `first send from ${newChat}`;
      button.click();
      // Gemini moves to the new conversation before the account scope resolves.
      window.history.replaceState({}, '', `${newChat}/0123456789abcdef`);

      await vi.waitFor(async () => {
        const items = await getPromptHistory(PRIMARY_ACCOUNT_SCOPE);
        expect(items.find((item) => item.content === `first send from ${newChat}`)?.path).toBe(
          newChat,
        );
      });
      await scope.dispose();
      document.body.replaceChildren();
      setCurrentAccountEmail(PRIMARY_EMAIL);
    }
  });

  it('keeps captures separate when the same route switches to another account', async () => {
    await activated();
    const { input, button } = createMainComposer();
    input.textContent = 'primary prompt';
    button.click();
    await vi.waitFor(async () => expect(await contents(PRIMARY_ACCOUNT_SCOPE)).toHaveLength(1));

    setCurrentAccountEmail(SECONDARY_EMAIL);
    input.textContent = 'secondary prompt';
    button.click();

    await vi.waitFor(async () =>
      expect(await contents(SECONDARY_ACCOUNT_SCOPE)).toEqual(['secondary prompt']),
    );
    expect(await contents(PRIMARY_ACCOUNT_SCOPE)).toEqual(['primary prompt']);
  });

  it('keeps prompt history records when the plugin turns off and on', async () => {
    await addPromptHistory('earlier prompt', 'sent', '/u/0/app/test', PRIMARY_ACCOUNT_SCOPE);
    await addPromptHistory('other account', 'sent', '/u/1/app/test', SECONDARY_ACCOUNT_SCOPE);
    const listenersBefore = storageListeners.length;

    const first = await activated();
    await first.dispose();

    expect(document.querySelector('.gv-ph-trigger')).toBeNull();
    expect(storageListeners).toHaveLength(listenersBefore);
    expect(chrome.storage.local.remove).not.toHaveBeenCalled();
    expect(await contents(PRIMARY_ACCOUNT_SCOPE)).toEqual(['earlier prompt']);
    expect(await contents(SECONDARY_ACCOUNT_SCOPE)).toEqual(['other account']);

    await activated();
    document.querySelector<HTMLButtonElement>('.gv-ph-trigger')?.click();
    await vi.waitFor(() =>
      expect(document.querySelector('.gv-ph-item-text')?.textContent).toBe('earlier prompt'),
    );
  });

  it('attaches nothing when the send key read lands after the plugin unmounts', async () => {
    heldSyncReads = [];
    const listenersBefore = storageListeners.length;
    const scope = await activate();
    expect(heldSyncReads).toHaveLength(1);
    await scope.dispose();

    heldSyncReads.splice(0).forEach((answer) => answer());
    await settle();

    expect(document.querySelector('.gv-ph-trigger')).toBeNull();
    expect(storageListeners).toHaveLength(listenersBefore);
    const { input } = createMainComposer();
    pressEnter(input, 'after unmount');
    await settle();
    expect(await contents(PRIMARY_ACCOUNT_SCOPE)).toEqual([]);
  });

  it('ignores a late send-key read from an unmounted plugin in the next activation', async () => {
    heldSyncReads = [];
    syncStore[StorageKeys.CTRL_ENTER_SEND] = true;
    const first = await activate();
    await first.dispose();
    syncStore[StorageKeys.CTRL_ENTER_SEND] = false;
    await activate();
    const [lateRead, currentRead] = heldSyncReads.splice(0);

    currentRead();
    await vi.waitFor(() => expect(document.querySelector('.gv-ph-trigger')).not.toBeNull());
    // Answered now, the first activation's read says Ctrl+Enter mode; it must not count.
    heldSyncReads = null;
    lateRead();
    await settle();

    const { input } = createMainComposer();
    pressEnter(input, 'plain enter sends');
    await vi.waitFor(async () =>
      expect(await contents(PRIMARY_ACCOUNT_SCOPE)).toEqual(['plain enter sends']),
    );
  });

  it('keeps the first owner able to stop prompt history when a second owner starts beside it', async () => {
    syncStore[StorageKeys.PROMPT_HISTORY_ENABLED] = true;
    const { startPromptHistory } = await import('../index');
    const stopNative = await startPromptHistory();
    await activate();
    await settle();
    expect(document.querySelectorAll('.gv-ph-trigger')).toHaveLength(1);

    stopNative();

    expect(document.querySelector('.gv-ph-trigger')).toBeNull();
    const { input } = createMainComposer();
    pressEnter(input, 'after the native module stopped');
    await settle();
    expect(await contents(PRIMARY_ACCOUNT_SCOPE)).toEqual([]);
  });
});
