import { afterEach, beforeEach, describe, expect, it, onTestFinished, vi } from 'vitest';

import { StorageKeys } from '@/core/types/common';

import { buildInstructionBlock } from '../../folderProject/instructionBlock';

/** Mirrors the module's send-detection poll interval. */
const SEND_CHECK_INTERVAL_MS = 1000;

type StorageChangeListener = (
  changes: Record<string, chrome.storage.StorageChange>,
  area: string,
) => void;

/** In-memory store for chrome.storage.local mock */
let localStore: Record<string, unknown> = {};
let storageChangeListeners: StorageChangeListener[] = [];

function setupMocks(enabled: boolean) {
  localStore = {};
  storageChangeListeners = [];

  // Mock chrome.storage.sync.get (feature toggle)
  (chrome.storage.sync.get as unknown as ReturnType<typeof vi.fn>).mockImplementation(
    (defaults: Record<string, unknown>, callback: (value: Record<string, unknown>) => void) => {
      callback({ ...defaults, [StorageKeys.DRAFT_AUTO_SAVE]: enabled });
    },
  );

  // Mock chrome.storage.local
  (chrome.storage as unknown as Record<string, unknown>).local = {
    get: vi.fn(
      (key: string | string[] | null, callback: (result: Record<string, unknown>) => void) => {
        if (key === null) {
          callback({ ...localStore });
        } else if (typeof key === 'string') {
          callback({ [key]: localStore[key] });
        } else {
          const result: Record<string, unknown> = {};
          for (const k of key) {
            result[k] = localStore[k];
          }
          callback(result);
        }
      },
    ),
    set: vi.fn((items: Record<string, unknown>, callback?: () => void) => {
      Object.assign(localStore, items);
      callback?.();
    }),
    remove: vi.fn((keys: string | string[], callback?: () => void) => {
      const keyList = typeof keys === 'string' ? [keys] : keys;
      for (const k of keyList) {
        delete localStore[k];
      }
      callback?.();
    }),
  };

  // Mock chrome.runtime.lastError
  Object.defineProperty(chrome.runtime, 'lastError', {
    get: () => null,
    configurable: true,
  });

  // Mock storage change listeners
  (chrome.storage.onChanged.addListener as unknown as ReturnType<typeof vi.fn>).mockImplementation(
    (listener: StorageChangeListener) => {
      storageChangeListeners.push(listener);
    },
  );

  (
    chrome.storage.onChanged.removeListener as unknown as ReturnType<typeof vi.fn>
  ).mockImplementation((listener: StorageChangeListener) => {
    const idx = storageChangeListeners.indexOf(listener);
    if (idx >= 0) storageChangeListeners.splice(idx, 1);
  });
}

function createContentEditable(): HTMLElement {
  const el = document.createElement('div');
  el.setAttribute('contenteditable', 'true');
  el.setAttribute('role', 'textbox');
  // Make it "visible" for getBoundingClientRect
  Object.defineProperty(el, 'getBoundingClientRect', {
    value: () => ({
      height: 100,
      width: 500,
      top: 0,
      left: 0,
      bottom: 100,
      right: 500,
    }),
  });
  document.body.appendChild(el);
  return el;
}

function createMainComposer(): {
  input: HTMLElement;
  button: HTMLButtonElement;
  root: HTMLElement;
} {
  const input = createContentEditable();
  const root = document.createElement('div');
  root.className = 'text-input-field';
  const button = document.createElement('button');
  button.className = 'send-button';
  button.setAttribute('aria-label', 'Send message');
  Object.defineProperty(button, 'offsetParent', { configurable: true, value: root });
  root.append(input, button);
  document.body.append(root);
  return { input, button, root };
}

function addSentUserTurn(text: string): void {
  const turn = document.createElement('user-query');
  const bubble = document.createElement('div');
  bubble.className = 'user-query-bubble-with-background';
  bubble.textContent = text;
  turn.append(bubble);
  document.body.append(turn);
}

describe('draftSave', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    vi.useFakeTimers({ shouldAdvanceTime: true });
    document.body.innerHTML = '';

    // Mock window.location
    Object.defineProperty(window, 'location', {
      value: {
        pathname: '/app/test-conversation-123',
        hostname: 'gemini.google.com',
        origin: 'https://gemini.google.com',
        search: '',
        get href() {
          return `https://gemini.google.com${this.pathname}${this.search}`;
        },
      },
      writable: true,
      configurable: true,
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('saves draft on input change when enabled', async () => {
    setupMocks(true);
    const input = createContentEditable();
    input.textContent = '';

    const { startDraftSave } = await import('../index');
    const cleanup = await startDraftSave();

    // Simulate typing
    input.textContent = 'Hello, this is my draft';
    input.dispatchEvent(new Event('input', { bubbles: true }));

    // Advance past the debounce
    vi.advanceTimersByTime(1000);

    // Check that a draft was saved to local storage
    const draftKey = 'gvDraft_/app/test-conversation-123';
    expect(localStore[draftKey]).toBeDefined();
    const draft = localStore[draftKey] as {
      content: string;
      timestamp: number;
      path: string;
    };
    expect(draft.content).toBe('Hello, this is my draft');
    expect(draft.path).toBe('/app/test-conversation-123');

    cleanup();
  });

  it('strips folder project instructions before saving a draft', async () => {
    setupMocks(true);
    const input = createContentEditable();

    const { startDraftSave } = await import('../index');
    const cleanup = await startDraftSave();

    input.textContent = `${buildInstructionBlock('Inbox', 'Always answer tersely.')}User draft`;
    input.dispatchEvent(new Event('input', { bubbles: true }));
    vi.advanceTimersByTime(1000);

    const draft = localStore['gvDraft_/app/test-conversation-123'] as {
      content: string;
    };
    expect(draft.content).toBe('User draft');

    cleanup();
  });

  it('does not save draft when feature is disabled', async () => {
    setupMocks(false);
    const input = createContentEditable();

    const { startDraftSave } = await import('../index');
    const cleanup = await startDraftSave();

    input.textContent = 'This should not be saved';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    vi.advanceTimersByTime(1000);

    const draftKey = 'gvDraft_/app/test-conversation-123';
    expect(localStore[draftKey]).toBeUndefined();

    cleanup();
  });

  it('removes draft when input becomes empty', async () => {
    setupMocks(true);
    const input = createContentEditable();

    const { startDraftSave } = await import('../index');
    const cleanup = await startDraftSave();

    // Save a draft first
    input.textContent = 'Some content';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    vi.advanceTimersByTime(1000);

    const draftKey = 'gvDraft_/app/test-conversation-123';
    expect(localStore[draftKey]).toBeDefined();

    // Now clear the input
    input.textContent = '';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    vi.advanceTimersByTime(1000);

    expect(localStore[draftKey]).toBeUndefined();

    cleanup();
  });

  it('keeps a pending draft bound to the route where typing happened', async () => {
    setupMocks(true);
    const input = createContentEditable();

    const { startDraftSave } = await import('../index');
    const cleanup = await startDraftSave();

    input.textContent = 'Draft from the first conversation';
    input.dispatchEvent(new Event('input', { bubbles: true }));

    window.location.pathname = '/app/second-conversation';
    input.textContent = '';
    vi.advanceTimersByTime(500);

    expect(localStore['gvDraft_/app/test-conversation-123']).toMatchObject({
      content: 'Draft from the first conversation',
      path: '/app/test-conversation-123',
    });
    expect(localStore['gvDraft_/app/second-conversation']).toBeUndefined();

    cleanup();
  });

  it('uses the live route when typing starts before the shared route poller catches up', async () => {
    setupMocks(true);
    const input = createContentEditable();

    const { startDraftSave } = await import('../index');
    const cleanup = await startDraftSave();

    window.location.pathname = '/app/second-conversation';
    input.textContent = 'Draft typed immediately after navigation';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    vi.advanceTimersByTime(1000);

    expect(localStore['gvDraft_/app/second-conversation']).toMatchObject({
      content: 'Draft typed immediately after navigation',
      path: '/app/second-conversation',
    });
    expect(localStore['gvDraft_/app/test-conversation-123']).toBeUndefined();

    cleanup();
  });

  it('does not re-save sent text when the first message creates a conversation route', async () => {
    setupMocks(true);
    window.location.pathname = '/app';
    const { input } = createMainComposer();

    const { startDraftSave } = await import('../index');
    const cleanup = await startDraftSave();

    input.textContent = 'Message that is about to be sent';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    vi.advanceTimersByTime(1000);
    expect(localStore['gvDraft_/app']).toBeDefined();

    input.textContent = 'Updated message that is sent';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }),
    );
    window.location.pathname = '/app/new-conversation-id';
    addSentUserTurn('Updated message that is sent');
    input.textContent = '';
    vi.advanceTimersByTime(400);

    expect(localStore['gvDraft_/app']).toBeUndefined();
    expect(localStore['gvDraft_/app/new-conversation-id']).toBeUndefined();

    cleanup();
  });

  it('keeps the draft when an upload blocks the send and the user leaves within two seconds', async () => {
    setupMocks(true);
    document.execCommand = vi.fn().mockReturnValue(false);
    window.location.pathname = '/app';
    localStore['gvDraft_/app/existing'] = {
      content: 'Destination draft',
      timestamp: 1,
      path: '/app/existing',
    };
    const { input, root } = createMainComposer();
    root.append(document.createElement('progress'));
    const { startDraftSave } = await import('../index');
    const stop = await startDraftSave();
    onTestFinished(stop);

    input.textContent = 'An unsent message with an uploading attachment';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    const link = document.createElement('a');
    link.href = '/app/existing';
    document.body.append(link);
    link.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    window.location.pathname = '/app/existing';
    input.textContent = '';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    await vi.advanceTimersByTimeAsync(1400);

    expect(localStore['gvDraft_/app']).toMatchObject({
      content: 'An unsent message with an uploading attachment',
    });
    expect(localStore['gvDraft_/app/existing']).toMatchObject({ content: 'Destination draft' });
    stop();
  });

  it('does not delete a stored draft when the host clears the composer without sending', async () => {
    setupMocks(true);
    const { input } = createMainComposer();
    const { startDraftSave } = await import('../index');
    const stop = await startDraftSave();
    input.textContent = 'Keep the unsent draft';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    await vi.advanceTimersByTimeAsync(1000);

    input.textContent = '';
    await vi.advanceTimersByTimeAsync(2500);
    expect(localStore['gvDraft_/app/test-conversation-123']).toMatchObject({
      content: 'Keep the unsent draft',
    });
    stop();
  });

  it.each(['load', 'retry'])(
    'drops a late restore when the same pathname now belongs to another email during %s',
    async (stage) => {
      setupMocks(true);
      const key = 'gvDraft_/app/test-conversation-123';
      localStore[key] = {
        content: 'Previous account draft',
        timestamp: 1,
        path: window.location.pathname,
      };
      const account = document.createElement('div');
      account.dataset.email = 'previous@example.com';
      document.body.append(account);
      document.execCommand = vi.fn().mockReturnValue(true);
      let answer = () => {};
      if (stage === 'load') {
        (chrome.storage.local.get as unknown as ReturnType<typeof vi.fn>).mockImplementationOnce(
          (_key: string, callback: (result: Record<string, unknown>) => void) => {
            answer = () => callback({ [key]: localStore[key] });
          },
        );
        createContentEditable();
      }
      const { startDraftSave } = await import('../index');
      const stop = await startDraftSave();
      await vi.advanceTimersByTimeAsync(0);
      account.dataset.email = 'next@example.com';
      answer();
      if (stage === 'retry') createContentEditable();
      await vi.advanceTimersByTimeAsync(2500);

      expect(document.execCommand).not.toHaveBeenCalled();
      expect(localStore[key]).toMatchObject({ content: 'Previous account draft' });
      stop();
    },
  );

  it('does not restore an old draft after typing and sending while its load is pending', async () => {
    setupMocks(true);
    const key = 'gvDraft_/app/test-conversation-123';
    localStore[key] = { content: 'Old draft', timestamp: 1, path: window.location.pathname };
    let answer = () => {};
    (chrome.storage.local.get as unknown as ReturnType<typeof vi.fn>).mockImplementationOnce(
      (_key: string, callback: (result: Record<string, unknown>) => void) => {
        const snapshot = { [key]: localStore[key] };
        answer = () => callback(snapshot);
      },
    );
    document.execCommand = vi.fn().mockReturnValue(true);
    const { input, button } = createMainComposer();
    const { startDraftSave } = await import('../index');
    const stop = await startDraftSave();
    input.textContent = 'New message';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    button.click();
    input.textContent = '';
    await vi.advanceTimersByTimeAsync(300);
    answer();
    await vi.advanceTimersByTimeAsync(1000);

    expect(document.execCommand).not.toHaveBeenCalled();
    expect(localStore[key]).toBeUndefined();
    stop();
  });

  it('flushes the last keystrokes on unload before the legacy feature stops', async () => {
    setupMocks(true);
    const input = createContentEditable();
    const { startDraftSave } = await import('../index');
    const { flushDraftsBeforeUnload } = await import('../draftUnloadFlush');
    const stop = await startDraftSave();
    input.textContent = 'Final keystrokes';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    const beforeUnload = () => {
      flushDraftsBeforeUnload();
      stop();
    };
    window.addEventListener('beforeunload', beforeUnload);
    try {
      window.dispatchEvent(new Event('beforeunload'));
      window.dispatchEvent(new Event('pagehide'));
      expect(localStore['gvDraft_/app/test-conversation-123']).toMatchObject({
        content: 'Final keystrokes',
      });
    } finally {
      window.removeEventListener('beforeunload', beforeUnload);
      stop();
    }
  });

  it('does not flush the unsaved tail when the legacy draft switch turns off', async () => {
    setupMocks(true);
    const key = 'gvDraft_/app/test-conversation-123';
    localStore[key] = { content: 'Stored draft', timestamp: 1, path: window.location.pathname };
    const input = createContentEditable();
    const { startDraftSave } = await import('../index');
    const { flushDraftsBeforeUnload } = await import('../draftUnloadFlush');
    const stop = await startDraftSave();
    input.textContent = 'Unsaved tail';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    for (const listener of storageChangeListeners) {
      listener({ [StorageKeys.DRAFT_AUTO_SAVE]: { newValue: false } }, 'sync');
    }
    flushDraftsBeforeUnload();
    await vi.advanceTimersByTimeAsync(2500);
    expect(localStore[key]).toMatchObject({ content: 'Stored draft' });
    stop();
  });

  it('does not delete the destination draft when navigation empties the input', async () => {
    setupMocks(true);
    const destinationKey = 'gvDraft_/app/second-conversation';
    localStore[destinationKey] = {
      content: 'Destination draft',
      timestamp: Date.now(),
      path: '/app/second-conversation',
    };
    const input = createContentEditable();
    input.textContent = 'Source draft';
    document.execCommand = vi.fn().mockReturnValue(true);

    const { startDraftSave } = await import('../index');
    const cleanup = await startDraftSave();

    // Let send detection observe non-empty content on the source route.
    vi.advanceTimersByTime(1000);
    window.location.pathname = '/app/second-conversation';
    input.textContent = '';
    vi.advanceTimersByTime(1000);

    expect(localStore[destinationKey]).toMatchObject({ content: 'Destination draft' });

    cleanup();
  });

  it('enables feature when storage setting changes to true', async () => {
    setupMocks(false);
    const input = createContentEditable();

    const { startDraftSave } = await import('../index');
    const cleanup = await startDraftSave();

    // Feature is disabled, should not save
    input.textContent = 'before enable';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    vi.advanceTimersByTime(1000);
    expect(localStore['gvDraft_/app/test-conversation-123']).toBeUndefined();

    // Enable via storage change
    for (const listener of storageChangeListeners) {
      listener({ [StorageKeys.DRAFT_AUTO_SAVE]: { oldValue: false, newValue: true } }, 'sync');
    }

    // Now typing should save
    input.textContent = 'after enable';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    vi.advanceTimersByTime(1000);

    const draft = localStore['gvDraft_/app/test-conversation-123'] as {
      content: string;
    };
    expect(draft?.content).toBe('after enable');

    cleanup();
  });

  it('restores draft on startup when input is empty', async () => {
    vi.useRealTimers();
    setupMocks(true);

    // Pre-seed a draft
    const draftKey = 'gvDraft_/app/test-conversation-123';
    localStore[draftKey] = {
      content: 'My saved draft',
      timestamp: Date.now(),
      path: '/app/test-conversation-123',
    };

    const input = createContentEditable();
    input.textContent = '';

    // Mock execCommand for text insertion
    document.execCommand = vi.fn().mockReturnValue(true);

    const { startDraftSave } = await import('../index');
    const cleanup = await startDraftSave();

    // Wait for the async restore to complete (loadDraft + restore delay retries)
    await new Promise((resolve) => setTimeout(resolve, 1500));

    // execCommand should have been called with the draft content
    expect(document.execCommand).toHaveBeenCalledWith('insertText', false, 'My saved draft');

    cleanup();
  });

  describe('a restore still pending when the feature stops', () => {
    const draftKey = 'gvDraft_/app/test-conversation-123';

    function seedDraft(): void {
      localStore[draftKey] = {
        content: 'My saved draft',
        timestamp: Date.now(),
        path: '/app/test-conversation-123',
      };
    }

    function expectInert(input: HTMLElement): void {
      expect(document.execCommand).not.toHaveBeenCalled();
      input.textContent = 'Typed after stopping';
      input.dispatchEvent(new Event('input', { bubbles: true }));
      vi.advanceTimersByTime(2000);
      expect((localStore[draftKey] as { content: string }).content).toBe('My saved draft');
    }

    it('does not rebind or restore when a retry fires after stopping', async () => {
      setupMocks(true);
      seedDraft();
      document.execCommand = vi.fn().mockReturnValue(true);
      const { startDraftSave } = await import('../index');
      const stop = await startDraftSave();
      await vi.advanceTimersByTimeAsync(0);

      // The composer has not rendered yet, so restore is waiting on a retry.
      stop();
      const input = createContentEditable();
      await vi.advanceTimersByTimeAsync(5 * 500);

      expectInert(input);
    });

    it('does not rebind or restore when the draft load resolves after stopping', async () => {
      setupMocks(true);
      seedDraft();
      document.execCommand = vi.fn().mockReturnValue(true);
      const local = chrome.storage.local as unknown as { get: ReturnType<typeof vi.fn> };
      const immediateGet = local.get.getMockImplementation() as (
        key: unknown,
        callback: (r: unknown) => void,
      ) => void;
      local.get.mockImplementation((key: unknown, callback: (r: unknown) => void) => {
        setTimeout(() => immediateGet(key, callback), 50);
      });
      const input = createContentEditable();
      const { startDraftSave } = await import('../index');
      const stop = await startDraftSave();

      stop();
      await vi.advanceTimersByTimeAsync(5 * 500);

      expectInert(input);
    });
  });

  it('strips folder project instructions from an older stored draft on restore', async () => {
    vi.useRealTimers();
    setupMocks(true);

    localStore['gvDraft_/app/test-conversation-123'] = {
      content: `${buildInstructionBlock('Coding', 'Reply with tests first.')}Recovered user text`,
      timestamp: Date.now(),
      path: '/app/test-conversation-123',
    };

    createContentEditable();
    document.execCommand = vi.fn().mockReturnValue(true);

    const { startDraftSave } = await import('../index');
    const cleanup = await startDraftSave();

    await new Promise((resolve) => setTimeout(resolve, 1500));

    expect(document.execCommand).toHaveBeenCalledWith('insertText', false, 'Recovered user text');

    cleanup();
  });

  it('ignores a slow startup read once the user has changed the setting', async () => {
    setupMocks(true);
    let answerStartupRead: (() => void) | null = null;
    (chrome.storage.sync.get as unknown as ReturnType<typeof vi.fn>).mockImplementation(
      (defaults: Record<string, unknown>, callback: (value: Record<string, unknown>) => void) => {
        answerStartupRead = () => callback({ ...defaults, [StorageKeys.DRAFT_AUTO_SAVE]: true });
      },
    );
    const input = createContentEditable();
    input.textContent = '';

    const { startDraftSave } = await import('../index');
    const starting = startDraftSave();
    for (const listener of storageChangeListeners) {
      listener({ [StorageKeys.DRAFT_AUTO_SAVE]: { oldValue: false, newValue: true } }, 'sync');
      listener({ [StorageKeys.DRAFT_AUTO_SAVE]: { oldValue: true, newValue: false } }, 'sync');
    }
    answerStartupRead!();
    const cleanup = await starting;

    input.textContent = 'typed after turning auto-save off';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    await vi.advanceTimersByTimeAsync(3000);

    expect(Object.keys(localStore).filter((key) => key.startsWith('gvDraft_'))).toEqual([]);
    cleanup();
  });

  it('cleans up listeners on cleanup call', async () => {
    setupMocks(true);
    createContentEditable();

    const { startDraftSave } = await import('../index');
    const cleanup = await startDraftSave();

    const listenerCountBefore = storageChangeListeners.length;
    expect(listenerCountBefore).toBeGreaterThan(0);

    cleanup();

    // Storage listener should be removed
    expect(chrome.storage.onChanged.removeListener).toHaveBeenCalled();
  });

  it('does not look up the input while unrelated content streams into the page', async () => {
    setupMocks(true);
    let rectReads = 0;
    const input = document.createElement('div');
    input.setAttribute('contenteditable', 'true');
    input.setAttribute('role', 'textbox');
    Object.defineProperty(input, 'getBoundingClientRect', {
      value: () => {
        rectReads += 1;
        return { height: 100, width: 500, top: 0, left: 0, bottom: 100, right: 500 };
      },
    });
    document.body.appendChild(input);
    const { startDraftSave } = await import('../index');
    const cleanup = await startDraftSave();
    // Start right after a send-detection tick so the poller stays out of the window.
    await vi.advanceTimersByTimeAsync(SEND_CHECK_INTERVAL_MS);

    rectReads = 0;
    const querySpy = vi.spyOn(document, 'querySelectorAll');
    const chat = document.createElement('div');
    document.body.appendChild(chat);
    for (let i = 0; i < 30; i++) {
      const chunk = document.createElement('p');
      chunk.textContent = `Streamed chunk ${i}`;
      chat.appendChild(chunk);
      await vi.advanceTimersByTimeAsync(16);
    }

    expect(rectReads).toBe(0);
    expect(querySpy).not.toHaveBeenCalled();
    cleanup();
  });

  it('follows Gemini when it replaces the chat input', async () => {
    setupMocks(true);
    const original = createContentEditable();
    const { startDraftSave } = await import('../index');
    const cleanup = await startDraftSave();

    original.remove();
    const replacement = createContentEditable();
    await vi.advanceTimersByTimeAsync(16);

    replacement.textContent = 'Typed into the new composer';
    replacement.dispatchEvent(new Event('input', { bubbles: true }));
    vi.advanceTimersByTime(1000);

    const draft = localStore['gvDraft_/app/test-conversation-123'] as { content: string };
    expect(draft.content).toBe('Typed into the new composer');
    cleanup();
  });

  describe('when Gemini switches between two mounted composers', () => {
    let stop: (() => void) | null = null;

    afterEach(() => {
      stop?.();
      stop = null;
    });

    function createComposer(): { el: HTMLElement; setVisible: (visible: boolean) => void } {
      let visible = true;
      const el = document.createElement('div');
      el.setAttribute('contenteditable', 'true');
      el.setAttribute('role', 'textbox');
      Object.defineProperty(el, 'getBoundingClientRect', {
        value: () => ({ height: visible ? 100 : 0, width: visible ? 500 : 0, top: 0, left: 0 }),
      });
      document.body.appendChild(el);
      return { el, setVisible: (next) => (visible = next) };
    }

    async function startWithSwitchedComposer(): Promise<HTMLElement> {
      setupMocks(true);
      const previous = createComposer();
      const next = createComposer();
      next.setVisible(false);
      const { startDraftSave } = await import('../index');
      stop = await startDraftSave();
      // Gemini hides the bound composer and reveals the other one; both stay connected.
      previous.setVisible(false);
      next.setVisible(true);
      return next.el;
    }

    function type(input: HTMLElement, text: string): void {
      input.textContent = text;
      input.dispatchEvent(new Event('input', { bubbles: true }));
      vi.advanceTimersByTime(1000);
    }

    it('saves typing in the composer the user focuses', async () => {
      const next = await startWithSwitchedComposer();

      next.dispatchEvent(new FocusEvent('focusin', { bubbles: true }));
      await vi.advanceTimersByTimeAsync(16);
      type(next, 'Typed into the revealed composer');

      const draft = localStore['gvDraft_/app/test-conversation-123'] as { content: string };
      expect(draft?.content).toBe('Typed into the revealed composer');
    });

    it('saves input dispatched in the same tick as the focus that switched composers', async () => {
      const next = await startWithSwitchedComposer();

      // Prompt Manager focuses the composer and dispatches `input` synchronously.
      next.dispatchEvent(new FocusEvent('focusin', { bubbles: true }));
      type(next, 'Inserted prompt');

      const draft = localStore['gvDraft_/app/test-conversation-123'] as { content: string };
      expect(draft?.content).toBe('Inserted prompt');
    });

    it('rebinds to the visible composer on the next send-detection check', async () => {
      const next = await startWithSwitchedComposer();

      vi.advanceTimersByTime(SEND_CHECK_INTERVAL_MS);
      type(next, 'Typed without a focus event');

      const draft = localStore['gvDraft_/app/test-conversation-123'] as { content: string };
      expect(draft?.content).toBe('Typed without a focus event');
    });
  });
  describe('the Gemini draft policy', () => {
    const draftKey = 'gvDraft_/app/test-conversation-123';

    function storedDrafts(): string[] {
      return Object.keys(localStore).filter((key) => key.startsWith('gvDraft'));
    }

    it('stores four blank lines the way the native draft did', async () => {
      setupMocks(true);
      document.execCommand = vi.fn().mockReturnValue(true);
      const input = createContentEditable();
      const { startDraftSave } = await import('../index');
      let stop = await startDraftSave();

      // Input and store each fold `\n\n` into `\n`: four newlines are stored as one.
      input.textContent = 'First\n\n\n\nSecond';
      input.dispatchEvent(new Event('input', { bubbles: true }));
      vi.advanceTimersByTime(1000);
      expect((localStore[draftKey] as { content: string }).content).toBe('First\nSecond');

      // A refresh restores what was stored.
      stop();
      input.textContent = '';
      stop = await startDraftSave();
      await vi.advanceTimersByTimeAsync(0);
      expect(document.execCommand).toHaveBeenLastCalledWith('insertText', false, 'First\nSecond');
      stop();

      // A draft stored before the input stage existed is folded once more on restore.
      localStore[draftKey] = { content: 'First\n\n\n\nSecond', timestamp: 1, path: '/app/x' };
      stop = await startDraftSave();
      await vi.advanceTimersByTimeAsync(0);
      expect(document.execCommand).toHaveBeenLastCalledWith('insertText', false, 'First\n\nSecond');
      stop();
    });

    it('treats a placeholder-only input as empty', async () => {
      setupMocks(true);
      localStore[draftKey] = { content: 'My saved draft', timestamp: 1, path: '/app/x' };
      document.execCommand = vi.fn().mockReturnValue(true);
      const input = createContentEditable();
      input.setAttribute('data-placeholder', 'Ask Gemini');
      input.textContent = 'Ask Gemini';

      const { startDraftSave } = await import('../index');
      const stop = await startDraftSave();
      await vi.advanceTimersByTimeAsync(0);

      expect(document.execCommand).toHaveBeenCalledWith('insertText', false, 'My saved draft');
      stop();
    });

    it('keeps the gvDraft_ prefix and full pathname for Gemini drafts', async () => {
      setupMocks(true);
      window.location.pathname = '/u/1/gem/abc123/c9f0';
      const input = createContentEditable();
      const { startDraftSave } = await import('../index');
      const stop = await startDraftSave();

      input.textContent = 'Draft in a Gem on the second account';
      input.dispatchEvent(new Event('input', { bubbles: true }));
      vi.advanceTimersByTime(1000);

      expect(storedDrafts()).toEqual(['gvDraft_/u/1/gem/abc123/c9f0']);
      expect(localStore['gvDraft_/u/1/gem/abc123/c9f0']).toMatchObject({
        content: 'Draft in a Gem on the second account',
        path: '/u/1/gem/abc123/c9f0',
      });
      stop();
    });

    it('restores nothing when the page turns out to be Enterprise while the draft loads', async () => {
      setupMocks(true);
      onTestFinished(() => {
        document.body.className = '';
      });
      localStore[draftKey] = { content: 'Personal draft', timestamp: 1, path: '/app/x' };
      document.execCommand = vi.fn().mockReturnValue(true);
      const local = chrome.storage.local as unknown as { get: ReturnType<typeof vi.fn> };
      const immediateGet = local.get.getMockImplementation() as (
        key: unknown,
        callback: (r: unknown) => void,
      ) => void;
      let answer: () => void = () => {};
      local.get.mockImplementationOnce((key: unknown, callback: (r: unknown) => void) => {
        answer = () => immediateGet(key, callback);
      });
      const input = createContentEditable();
      const { startDraftSave } = await import('../index');
      const stop = await startDraftSave();

      document.body.classList.add('enterprise-shell');
      answer();
      await vi.advanceTimersByTimeAsync(5 * 500);

      expect(document.execCommand).not.toHaveBeenCalled();
      expect(input.textContent).toBe('');
      expect(localStore[draftKey]).toMatchObject({ content: 'Personal draft' });
      stop();
    });

    it('restores nothing when the page turns out to be Enterprise before a restore retry', async () => {
      setupMocks(true);
      onTestFinished(() => {
        document.body.className = '';
      });
      localStore[draftKey] = { content: 'Personal draft', timestamp: 1, path: '/app/x' };
      document.execCommand = vi.fn().mockReturnValue(true);
      const { startDraftSave } = await import('../index');
      const stop = await startDraftSave();
      await vi.advanceTimersByTimeAsync(0);

      // The composer renders only after Enterprise surfaced; the next retry finds it.
      document.body.classList.add('enterprise-shell');
      const input = createContentEditable();
      await vi.advanceTimersByTimeAsync(5 * 500);

      expect(document.execCommand).not.toHaveBeenCalled();
      expect(input.textContent).toBe('');
      stop();
    });

    it.each([
      ['URL', () => Object.assign(window.location, { search: '?workspace=1' })],
      ['DOM', () => document.body.classList.add('enterprise-shell')],
    ])(
      'writes no draft when the page turns out to be Gemini Enterprise by %s hint',
      async (_hint, turnEnterprise) => {
        setupMocks(true);
        onTestFinished(() => {
          document.body.className = '';
        });
        const destinationKey = 'gvDraft_/app/second-conversation';
        localStore[destinationKey] = { content: 'Destination', timestamp: 1, path: '/app/x' };
        document.execCommand = vi.fn().mockReturnValue(true);
        const input = createContentEditable();
        const { startDraftSave } = await import('../index');
        const stop = await startDraftSave();

        turnEnterprise();
        input.textContent = 'Typed on Enterprise';
        input.dispatchEvent(new Event('input', { bubbles: true }));
        vi.advanceTimersByTime(1000);
        window.location.pathname = '/app/second-conversation';
        input.textContent = '';
        await vi.advanceTimersByTimeAsync(3000);

        expect(storedDrafts()).toEqual([destinationKey]);
        expect(localStore[destinationKey]).toMatchObject({ content: 'Destination' });
        expect(document.execCommand).not.toHaveBeenCalled();
        stop();
      },
    );
  });
});
