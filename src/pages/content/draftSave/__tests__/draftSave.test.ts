import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { StorageKeys } from '@/core/types/common';

import { buildInstructionBlock } from '../../folderProject/instructionBlock';

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

  it('strips folder project instructions from older polluted drafts during restore', async () => {
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
});
