// @vitest-environment-options { "url": "https://chatgpt.com/" }
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import browser from 'webextension-polyfill';

import { PluginScope } from '@/features/plugins/runtime/pluginScope';
import {
  makeTurns,
  mountThreadFixture,
} from '@/pages/content/export/adapter/__tests__/chatgptThreadFixture';
import { toastDriver } from '@/tests/toastDriver';

import { markHandoffPageActive } from './handoff';
import type { HandoffDelivery } from './handoffPlan';
import { activateChatGptTemporaryHandoff, collectTemporaryChatTurns } from './index';
import {
  CHATGPT_HANDOFF_GET_TAB_ID_MESSAGE,
  CHATGPT_HANDOFF_SCHEDULE_EXPIRY_MESSAGE,
  PENDING_HANDOFF_KEY,
  PENDING_HANDOFF_TAB_KEY,
} from './storage';

const extensionStorage = vi.hoisted(() => new Map<string, unknown>());

vi.mock('webextension-polyfill', () => ({
  default: {
    storage: {
      local: {
        get: vi.fn(async (keys?: null | string | string[]) => {
          if (keys == null) return Object.fromEntries(extensionStorage);
          const requested = Array.isArray(keys) ? keys : [keys];
          return Object.fromEntries(requested.map((key) => [key, extensionStorage.get(key)]));
        }),
        remove: vi.fn(async (keys: string | string[]) => {
          for (const key of Array.isArray(keys) ? keys : [keys]) extensionStorage.delete(key);
        }),
        set: vi.fn(async (items: Record<string, unknown>) => {
          for (const [key, value] of Object.entries(items)) extensionStorage.set(key, value);
        }),
      },
      sync: { get: vi.fn(async () => ({})) },
    },
    runtime: { sendMessage: vi.fn() },
    i18n: { getUILanguage: () => 'en' },
  },
}));

const TAB_TOKEN = 'test-tab-token';
const PENDING_STORAGE_KEY = `${PENDING_HANDOFF_KEY}:${TAB_TOKEN}`;
const BUTTON = '[data-gv-chatgpt-handoff-button]';
const READY_TOAST = 'Backup saved. Review the handoff, then send it when ready.';

const scopes: PluginScope[] = [];
let downloads: Array<{ filename: string; blob: Blob }>;

function createScope(): PluginScope {
  const scope = new PluginScope();
  scopes.push(scope);
  return scope;
}

function answerExtensionMessages(message: unknown): Promise<unknown> {
  const type = (message as { type?: string }).type;
  return Promise.resolve(
    type === CHATGPT_HANDOFF_GET_TAB_ID_MESSAGE ? { ok: true, tabId: 42 } : { ok: true },
  );
}

function seedPending(delivery: HandoffDelivery): void {
  sessionStorage.setItem(PENDING_HANDOFF_TAB_KEY, TAB_TOKEN);
  extensionStorage.set(PENDING_STORAGE_KEY, {
    delivery,
    storedAt: Date.now(),
    accountScope: 'route:default',
    tabId: 42,
  });
}

function pendingStored(): boolean {
  return extensionStorage.has(PENDING_STORAGE_KEY);
}

// Discarding detaches the tab token synchronously, before the storage removal settles.
function pendingRetained(): boolean {
  return sessionStorage.getItem(PENDING_HANDOFF_TAB_KEY) === TAB_TOKEN && pendingStored();
}

// Cancellation detaches the tab token synchronously, before the composer change it guards lands.
function expectRecoveryDetachedNow(): void {
  expect(sessionStorage.getItem(PENDING_HANDOFF_TAB_KEY)).toBeNull();
}

function readBlob(blob: Blob): Promise<string> {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.readAsText(blob);
  });
}

function createComposer(text = ''): HTMLElement {
  const composer = document.createElement('div');
  composer.id = 'prompt-textarea';
  composer.contentEditable = 'true';
  composer.setAttribute('role', 'textbox');
  composer.textContent = text;
  return composer;
}

function mountComposerForm(text = ''): { form: HTMLFormElement; composer: HTMLElement } {
  const form = document.createElement('form');
  const composer = createComposer(text);
  form.appendChild(composer);
  document.body.appendChild(form);
  return { form, composer };
}

/** A temporary chat whose native toggle swaps in a normal-chat composer carrying the draft. */
function mountTemporaryChat(draft = ''): { normalComposer: () => HTMLElement | null } {
  history.replaceState({}, '', '/?temporary-chat=true');
  mountThreadFixture({ turns: makeTurns(1, 200) });
  const { form, composer } = mountComposerForm(draft);
  let replacement: HTMLElement | null = null;
  const toggle = document.createElement('button');
  toggle.dataset.testid = 'temporary-chat-toggle';
  toggle.setAttribute('aria-label', 'Close temporary chat');
  toggle.addEventListener('click', () => {
    history.replaceState({}, '', '/');
    toggle.remove();
    composer.remove();
    replacement = createComposer(composer.textContent || '');
    form.appendChild(replacement);
  });
  document.body.appendChild(toggle);
  return { normalComposer: () => replacement };
}

async function confirmHandoff(): Promise<void> {
  document.querySelector<HTMLButtonElement>(BUTTON)?.click();
  await vi.waitFor(() =>
    expect(document.querySelector('.gv-chatgpt-handoff-dialog-button--primary')).not.toBeNull(),
  );
  document.querySelector<HTMLButtonElement>('.gv-chatgpt-handoff-dialog-button--primary')?.click();
}

function toastTexts(): string[] {
  return toastDriver.messages();
}

async function settle(): Promise<void> {
  for (let i = 0; i < 5; i += 1) await new Promise((resolve) => setTimeout(resolve, 0));
}

function legacyTurn(id: string, role?: 'user' | 'assistant', text = ''): HTMLElement {
  const container = document.createElement('div');
  container.setAttribute('data-turn-id-container', id);
  if (role) {
    const message = document.createElement('div');
    message.setAttribute('data-message-author-role', role);
    message.textContent = text;
    container.appendChild(message);
  }
  return container;
}

let createdBlob: Blob | null = null;

// The browser download is the boundary: record it instead of letting jsdom navigate.
function recordDownload(event: MouseEvent): void {
  const anchor = event.target instanceof HTMLAnchorElement ? event.target : null;
  if (!anchor?.download || !createdBlob) return;
  event.preventDefault();
  downloads.push({ filename: anchor.download, blob: createdBlob });
}

beforeEach(() => {
  vi.mocked(browser.runtime.sendMessage).mockImplementation(answerExtensionMessages);
  downloads = [];
  URL.createObjectURL = (blob: Blob) => {
    createdBlob = blob;
    return 'blob:https://chatgpt.com/handoff-backup';
  };
  URL.revokeObjectURL = () => {};
  document.addEventListener('click', recordDownload, true);
});

afterEach(async () => {
  await Promise.all(scopes.splice(0).map((scope) => scope.dispose()));
  document.removeEventListener('click', recordDownload, true);
  createdBlob = null;
  markHandoffPageActive();
  history.replaceState({}, '', '/');
  document.body.replaceChildren();
  document.head.querySelectorAll('style[data-gv-plugin-scope]').forEach((node) => node.remove());
  sessionStorage.clear();
  extensionStorage.clear();
  Reflect.deleteProperty(URL, 'createObjectURL');
  Reflect.deleteProperty(URL, 'revokeObjectURL');
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.clearAllMocks();
});

describe('ChatGPT temporary handoff plugin', () => {
  it('mounts in temporary mode and on disable removes its UI and the pending handoff', async () => {
    history.replaceState({}, '', '/?temporary-chat=true');
    seedPending({ mode: 'inline', text: 'Continue' });
    const scope = createScope();
    await activateChatGptTemporaryHandoff(scope);

    expect(document.querySelectorAll(BUTTON)).toHaveLength(1);
    expect(document.head.querySelector('style[data-gv-plugin-scope]')?.textContent).toContain(
      '.gv-chatgpt-handoff-button',
    );
    await settle();
    expect(pendingRetained()).toBe(true);

    await scope.dispose();
    expect(document.querySelector(BUTTON)).toBeNull();
    expect(document.querySelector('[data-gv-chatgpt-handoff-owned]')).toBeNull();
    await vi.waitFor(() => expect(pendingStored()).toBe(false));
    expect(sessionStorage.getItem(PENDING_HANDOFF_TAB_KEY)).toBeNull();
  });

  it('retains a pending handoff when disposal is caused by page navigation', async () => {
    history.replaceState({}, '', '/?temporary-chat=true');
    seedPending({ mode: 'inline', text: 'Continue' });
    const scope = createScope();
    await activateChatGptTemporaryHandoff(scope);

    window.dispatchEvent(new Event('pagehide'));
    await scope.dispose();
    await settle();

    expect(pendingRetained()).toBe(true);
  });

  it('retains recovery through beforeunload teardown and clears it when the unload is cancelled', async () => {
    vi.useFakeTimers();
    history.replaceState({}, '', '/?temporary-chat=true');
    seedPending({ mode: 'inline', text: 'Continue' });
    const scope = createScope();
    await activateChatGptTemporaryHandoff(scope);

    window.dispatchEvent(new Event('beforeunload'));
    await scope.dispose();
    expect(pendingRetained()).toBe(true);

    await vi.runAllTimersAsync();

    expect(pendingStored()).toBe(false);
  });

  it('discards the pending handoff on disable after a cached page is restored', async () => {
    history.replaceState({}, '', '/?temporary-chat=true');
    seedPending({ mode: 'inline', text: 'Continue' });
    const scope = createScope();
    await activateChatGptTemporaryHandoff(scope);

    window.dispatchEvent(new Event('pagehide'));
    window.dispatchEvent(new Event('pageshow'));
    await scope.dispose();

    await vi.waitFor(() => expect(pendingStored()).toBe(false));
  });

  it('does not mount after async language loading finishes for a disposed plugin', async () => {
    history.replaceState({}, '', '/?temporary-chat=true');
    let resolveLanguage!: (stored: Record<string, unknown>) => void;
    vi.mocked(browser.storage.sync.get).mockReturnValueOnce(
      new Promise((resolve) => {
        resolveLanguage = resolve;
      }),
    );
    const scope = createScope();
    const activation = activateChatGptTemporaryHandoff(scope);
    const disposal = scope.dispose();
    resolveLanguage({});

    await Promise.all([activation, disposal]);
    expect(document.querySelector(BUTTON)).toBeNull();
  });

  it('removes the action when ChatGPT leaves temporary mode', async () => {
    vi.useFakeTimers();
    history.replaceState({}, '', '/?temporary-chat=true');
    const scope = createScope();
    await activateChatGptTemporaryHandoff(scope);
    expect(document.querySelector(BUTTON)).not.toBeNull();

    history.pushState(null, '', '/');
    await vi.advanceTimersByTimeAsync(500);

    expect(document.querySelector(BUTTON)).toBeNull();
  });

  it('confirms, saves a backup, and hands the whole conversation and draft to a normal chat once', async () => {
    const { normalComposer } = mountTemporaryChat('Unsent follow-up');
    await activateChatGptTemporaryHandoff(createScope());

    document.querySelector<HTMLButtonElement>(BUTTON)?.click();
    await vi.waitFor(() => expect(document.querySelector('[role="dialog"]')).not.toBeNull());
    const attribution = document.querySelector<HTMLAnchorElement>(
      '.gv-chatgpt-handoff-dialog-attribution',
    );
    expect(attribution?.textContent).toBe('Powered by ChatGPT Voyager');
    expect(attribution?.href).toBe('https://github.com/TanChuping/chatgpt-voyager');
    expect(attribution?.target).toBe('_blank');
    expect(attribution?.rel).toContain('noopener');
    expect(document.activeElement?.textContent).toBe('Cancel');
    const dialog = document.querySelector<HTMLElement>('[role="dialog"]');
    const description = document.querySelector<HTMLElement>('.gv-chatgpt-handoff-dialog-body');
    expect(description?.textContent).toContain('uploaded as a draft attachment');
    expect(dialog?.getAttribute('aria-describedby')).toBe(description?.id);
    await confirmHandoff();

    await vi.waitFor(() => expect(toastTexts()).toContain(READY_TOAST), { timeout: 5_000 });
    expect(downloads).toHaveLength(1);
    expect(downloads[0].filename).toMatch(/^chatgpt-temporary-handoff-\d+-\w+\.md$/);
    expect(await readBlob(downloads[0].blob)).toBe(
      '## User\n\nQuestion 1\n\n## ChatGPT\n\nAnswer 1\n\n## Unsent draft\n\nUnsent follow-up',
    );
    const delivered = normalComposer()?.textContent ?? '';
    expect(delivered.split('Question 1')).toHaveLength(2);
    expect(delivered).toContain('Answer 1');
    expect(delivered.endsWith('Unsent follow-up')).toBe(true);
    const pendingKey = `${PENDING_HANDOFF_KEY}:${sessionStorage.getItem(PENDING_HANDOFF_TAB_KEY)}`;
    expect(extensionStorage.get(pendingKey)).toMatchObject({
      draft: 'Unsent follow-up',
      deliveredRoute: '/',
    });
  });

  it('keeps the progress dialog mounted until departure bookkeeping finishes', async () => {
    mountTemporaryChat();
    let finishScheduling!: () => void;
    vi.mocked(browser.runtime.sendMessage).mockImplementation((message: unknown) => {
      if ((message as { type?: string }).type !== CHATGPT_HANDOFF_SCHEDULE_EXPIRY_MESSAGE) {
        return answerExtensionMessages(message);
      }
      return new Promise((resolve) => {
        finishScheduling = () => resolve({ ok: true });
      });
    });
    await activateChatGptTemporaryHandoff(createScope());

    await confirmHandoff();

    await vi.waitFor(() => expect(finishScheduling).toBeTypeOf('function'), { timeout: 5_000 });
    expect(document.querySelector('.gv-chatgpt-handoff-spinner')).not.toBeNull();

    finishScheduling();
    await vi.waitFor(
      () => expect(document.querySelector('.gv-chatgpt-handoff-spinner')).toBeNull(),
      { timeout: 5_000 },
    );
    expect(toastTexts()).toContain(READY_TOAST);
  });

  it('keeps temporary mode open when the unsent draft still has an attachment', async () => {
    mountTemporaryChat();
    const attachment = document.createElement('div');
    attachment.dataset.fileId = 'file-1';
    document.querySelector('form')?.appendChild(attachment);
    await activateChatGptTemporaryHandoff(createScope());

    await confirmHandoff();

    await vi.waitFor(() => expect(toastTexts().join('\n')).toContain('attached file or image'));
    expect(location.search).toBe('?temporary-chat=true');
    expect(downloads).toEqual([]);
    expect(extensionStorage.size).toBe(0);
  });

  it('takes its open toast away when the plugin is disabled', async () => {
    mountTemporaryChat();
    const attachment = document.createElement('div');
    attachment.dataset.fileId = 'file-1';
    document.querySelector('form')?.appendChild(attachment);
    const scope = createScope();
    await activateChatGptTemporaryHandoff(scope);
    await confirmHandoff();
    await vi.waitFor(() => expect(toastTexts()).toHaveLength(1));

    await scope.dispose();

    expect(toastTexts()).toEqual([]);
  });

  it('refuses handoff when the latest user turn has no mounted assistant yet', async () => {
    document.body.append(legacyTurn('user-1', 'user', 'Question'));

    await expect(collectTemporaryChatTurns(new AbortController().signal)).rejects.toThrow(
      'chatgpt_export_response_still_generating',
    );
  });

  it('collects every prompt and reply of a legacy chat, materializing unmounted turns', async () => {
    const shell = legacyTurn('user-2');
    shell.scrollIntoView = () => {
      if (shell.childElementCount === 0) {
        shell.append(legacyTurn('mounted', 'user', 'Question 2').firstElementChild!);
      }
    };
    document.body.append(
      legacyTurn('user-1', 'user', 'Question 1'),
      legacyTurn('assistant-1', 'assistant', 'Answer 1'),
      shell,
      legacyTurn('assistant-2', 'assistant', 'Answer 2'),
    );

    await expect(collectTemporaryChatTurns(new AbortController().signal)).resolves.toMatchObject([
      { user: 'Question 1', assistant: 'Answer 1' },
      { user: 'Question 2', assistant: 'Answer 2' },
    ]);
  });

  it('stops crawling a legacy chat as soon as the handoff is cancelled', async () => {
    const shell = legacyTurn('user-1');
    const cancel = new AbortController();
    let scrolls = 0;
    shell.scrollIntoView = () => {
      scrolls += 1;
      cancel.abort();
    };
    document.body.append(shell, legacyTurn('assistant-1', 'assistant', 'Answer'));

    const collection = collectTemporaryChatTurns(cancel.signal);

    await expect(collection).rejects.toMatchObject({ name: 'AbortError' });
    expect(scrolls).toBe(1);
  });

  it('refuses a legacy chat that navigates away while a turn materializes', async () => {
    history.replaceState({}, '', '/?temporary-chat=true');
    const shell = legacyTurn('user-1');
    shell.scrollIntoView = () => {
      if (shell.childElementCount > 0) return;
      shell.append(legacyTurn('mounted', 'user', 'Question').firstElementChild!);
      history.replaceState({}, '', '/c/another-chat');
    };
    document.body.append(shell, legacyTurn('assistant-1', 'assistant', 'Answer'));

    await expect(collectTemporaryChatTurns(new AbortController().signal)).rejects.toThrow(
      'chatgpt_export_conversation_changed',
    );
  });

  it('refuses a legacy chat that starts regenerating after every turn was read', async () => {
    document.body.append(
      legacyTurn('user-1', 'user', 'Question'),
      legacyTurn('assistant-1', 'assistant', 'Answer'),
    );
    // Restoring the reader's scroll position is the last page call after the turns are read.
    vi.spyOn(window, 'scrollTo').mockImplementation(() => {
      const stop = document.createElement('button');
      stop.dataset.testid = 'stop-button';
      document.body.append(stop);
    });

    await expect(collectTemporaryChatTurns(new AbortController().signal)).rejects.toThrow(
      'chatgpt_export_conversation_changed',
    );
  });

  it('refuses handoff when the conversation changes during collection', async () => {
    const userShell = legacyTurn('user-1');
    // Scrolling the unmounted prompt into view mounts it while the user sends a follow-up.
    userShell.scrollIntoView = () => {
      if (userShell.childElementCount > 0) return;
      userShell.append(legacyTurn('mounted', 'user', 'Question').firstElementChild!);
      document.body.append(legacyTurn('user-2', 'user', 'Follow-up'));
    };
    document.body.append(userShell, legacyTurn('assistant-1', 'assistant', 'Answer'));

    await expect(collectTemporaryChatTurns(new AbortController().signal)).rejects.toThrow(
      'chatgpt_export_conversation_changed',
    );
  });

  it('retries a pending attachment handoff when its late preview mounts in the composer', async () => {
    const { form, composer } = mountComposerForm();
    seedPending({
      mode: 'attachment',
      directive: 'Read the saved handoff',
      attachment: '# Transcript',
      filename: 'late-transcript.md',
    });
    await activateChatGptTemporaryHandoff(createScope());
    await vi.waitFor(() => expect(toastTexts()).toHaveLength(1));
    expect(composer.textContent).not.toContain('Read the saved handoff');

    const placeholder = document.createElement('div');
    placeholder.dataset.testid = 'attachment-placeholder';
    form.appendChild(placeholder);
    await settle();
    expect(toastTexts()).toHaveLength(1);

    const preview = document.createElement('div');
    preview.dataset.testid = 'attachment-preview';
    preview.textContent = 'late-transcript.md';
    form.appendChild(preview);

    await vi.waitFor(() => expect(toastTexts()).toContain(READY_TOAST));
    expect(composer.textContent).toContain('Read the saved handoff');
  });

  it('restores the delivered handoff when ChatGPT re-renders the composer empty', async () => {
    const { composer } = mountComposerForm();
    seedPending({ mode: 'inline', text: 'Continue this transcript' });
    await activateChatGptTemporaryHandoff(createScope());
    await vi.waitFor(() => expect(composer.textContent).toBe('Continue this transcript'));

    composer.replaceChildren();

    await vi.waitFor(() => expect(composer.textContent).toBe('Continue this transcript'));
  });

  it('keeps a delivered composer the user cleared instead of restoring the handoff', async () => {
    const { composer } = mountComposerForm();
    seedPending({ mode: 'inline', text: 'Continue this transcript' });
    await activateChatGptTemporaryHandoff(createScope());
    await vi.waitFor(() =>
      expect(extensionStorage.get(PENDING_STORAGE_KEY)).toMatchObject({ deliveredRoute: '/' }),
    );

    composer.dispatchEvent(new InputEvent('beforeinput', { bubbles: true }));
    composer.replaceChildren();
    await settle();

    expect(composer.textContent).toBe('');
    await vi.waitFor(() => expect(pendingStored()).toBe(false));
  });

  it('stops recovery before a user edit changes the delivered composer', async () => {
    const { composer } = mountComposerForm();
    await activateChatGptTemporaryHandoff(createScope());
    seedPending({ mode: 'inline', text: 'Continue' });

    composer.dispatchEvent(new InputEvent('beforeinput', { bubbles: true }));
    expectRecoveryDetachedNow();

    await vi.waitFor(() => expect(pendingStored()).toBe(false));
  });

  it('stops recovery before sending clears the delivered composer', async () => {
    const { form } = mountComposerForm();
    const send = document.createElement('button');
    send.type = 'button';
    send.dataset.testid = 'send-button';
    form.appendChild(send);
    await activateChatGptTemporaryHandoff(createScope());

    seedPending({ mode: 'inline', text: 'Continue' });
    send.click();
    expectRecoveryDetachedNow();
    await vi.waitFor(() => expect(pendingStored()).toBe(false));

    seedPending({ mode: 'inline', text: 'Continue' });
    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    expectRecoveryDetachedNow();
    await vi.waitFor(() => expect(pendingStored()).toBe(false));
  });

  it('stops recovery before the user removes a delivered attachment', async () => {
    const { form } = mountComposerForm();
    const preview = document.createElement('div');
    preview.dataset.testid = 'file-upload-preview';
    const remove = document.createElement('button');
    remove.type = 'button';
    remove.setAttribute('aria-label', 'Remove file');
    preview.appendChild(remove);
    form.appendChild(preview);
    await activateChatGptTemporaryHandoff(createScope());
    seedPending({ mode: 'inline', text: 'Continue' });

    remove.click();
    expectRecoveryDetachedNow();

    await vi.waitFor(() => expect(pendingStored()).toBe(false));
  });

  it('stops recovery before same-route New Chat actions', async () => {
    await activateChatGptTemporaryHandoff(createScope());

    for (const [route, newChatHref] of [
      ['/', '/'],
      ['/u/12/g/custom-gpt/', '/u/12/'],
    ]) {
      history.replaceState({}, '', route);
      seedPending({ mode: 'inline', text: 'Continue' });
      const newChat = document.createElement('a');
      newChat.href = newChatHref;
      newChat.addEventListener('click', (event) => event.preventDefault());
      document.body.appendChild(newChat);
      newChat.click();
      newChat.remove();
      expectRecoveryDetachedNow();

      await vi.waitFor(() => expect(pendingStored()).toBe(false));
    }
  });
});
