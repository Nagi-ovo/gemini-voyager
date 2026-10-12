import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { StorageKeys } from '@/core/types/common';
import type {
  KeyboardShortcutConfig,
  KeyboardShortcutStorage,
} from '@/core/types/keyboardShortcut';

import { keyboardShortcutService } from '../KeyboardShortcutService';

function createCustomSingleLetterConfig(): KeyboardShortcutConfig {
  return {
    previous: {
      action: 'timeline:previous',
      modifiers: [],
      key: 'p',
      sequenceLength: 1,
    },
    next: {
      action: 'timeline:next',
      modifiers: [],
      key: 'n',
      sequenceLength: 1,
    },
    first: {
      action: 'timeline:first',
      modifiers: [],
      key: 'g',
      sequenceLength: 2,
    },
    last: {
      action: 'timeline:last',
      modifiers: ['Shift'],
      key: 'G',
      sequenceLength: 2,
    },
  };
}

describe('KeyboardShortcutService', () => {
  beforeEach(() => {
    vi.stubGlobal('chrome', undefined);
    localStorage.clear();
    keyboardShortcutService.destroy();
  });

  afterEach(() => {
    keyboardShortcutService.destroy();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('merges legacy shortcut config with first/last defaults', async () => {
    const legacyStorage = {
      shortcuts: {
        previous: {
          action: 'timeline:previous',
          modifiers: [],
          key: 'p',
        },
        next: {
          action: 'timeline:next',
          modifiers: [],
          key: 'n',
        },
      },
      enabled: true,
    } as unknown as KeyboardShortcutStorage;

    localStorage.setItem(StorageKeys.TIMELINE_SHORTCUTS, JSON.stringify(legacyStorage));

    await keyboardShortcutService.init();

    const { config } = keyboardShortcutService.getConfig();
    expect(config.previous.key).toBe('p');
    expect(config.next.key).toBe('n');
    expect(config.first.key).toBe('g');
    expect(config.first.sequenceLength).toBe(2);
    expect(config.last.key).toBe('G');
    expect(config.last.sequenceLength).toBe(2);
  });

  it('supports customizable repeated shortcut for timeline:last', async () => {
    await keyboardShortcutService.saveConfig({
      previous: {
        action: 'timeline:previous',
        modifiers: [],
        key: 'k',
        sequenceLength: 1,
      },
      next: {
        action: 'timeline:next',
        modifiers: [],
        key: 'j',
        sequenceLength: 1,
      },
      first: {
        action: 'timeline:first',
        modifiers: ['Shift'],
        key: 'G',
        sequenceLength: 2,
      },
      last: {
        action: 'timeline:last',
        modifiers: [],
        key: 'g',
        sequenceLength: 2,
      },
    });

    await keyboardShortcutService.init();

    const listener = vi.fn();
    const unsubscribe = keyboardShortcutService.on(listener);

    window.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'g', bubbles: true, cancelable: true }),
    );
    window.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'g', bubbles: true, cancelable: true }),
    );

    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenCalledWith('timeline:last', expect.any(KeyboardEvent));

    unsubscribe();
  });

  it('ignores shortcuts during IME composition', async () => {
    await keyboardShortcutService.saveConfig(createCustomSingleLetterConfig());

    await keyboardShortcutService.init();

    const listener = vi.fn();
    const unsubscribe = keyboardShortcutService.on(listener);
    const event = new KeyboardEvent('keydown', {
      key: 'n',
      bubbles: true,
      cancelable: true,
      isComposing: true,
    });

    window.dispatchEvent(event);

    expect(listener).not.toHaveBeenCalled();
    expect(event.defaultPrevented).toBe(false);

    unsubscribe();
  });

  it('ignores shortcuts from descendants of contenteditable chat inputs', async () => {
    await keyboardShortcutService.saveConfig(createCustomSingleLetterConfig());

    await keyboardShortcutService.init();

    const editor = document.createElement('div');
    editor.setAttribute('contenteditable', 'true');
    editor.setAttribute('role', 'textbox');
    const child = document.createElement('span');
    editor.appendChild(child);
    document.body.appendChild(editor);

    const listener = vi.fn();
    const unsubscribe = keyboardShortcutService.on(listener);
    const event = new KeyboardEvent('keydown', {
      key: 'n',
      bubbles: true,
      cancelable: true,
    });

    child.dispatchEvent(event);

    expect(listener).not.toHaveBeenCalled();
    expect(event.defaultPrevented).toBe(false);

    unsubscribe();
    editor.remove();
  });

  it('ignores shortcuts typed into an input inside an open shadow root', async () => {
    await keyboardShortcutService.saveConfig(createCustomSingleLetterConfig());

    await keyboardShortcutService.init();

    const host = document.createElement('div');
    document.body.appendChild(host);
    const input = document.createElement('input');
    host.attachShadow({ mode: 'open' }).appendChild(input);
    input.focus();

    const listener = vi.fn();
    const unsubscribe = keyboardShortcutService.on(listener);
    const event = new KeyboardEvent('keydown', {
      key: 'n',
      bubbles: true,
      cancelable: true,
      composed: true,
    });

    input.dispatchEvent(event);

    expect(listener).not.toHaveBeenCalled();
    expect(event.defaultPrevented).toBe(false);

    unsubscribe();
    host.remove();
  });

  it('ignores shortcuts while a contenteditable chat input is focused', async () => {
    await keyboardShortcutService.saveConfig(createCustomSingleLetterConfig());

    await keyboardShortcutService.init();

    const editor = document.createElement('div');
    editor.setAttribute('contenteditable', 'true');
    editor.setAttribute('role', 'textbox');
    editor.tabIndex = 0;
    document.body.appendChild(editor);
    editor.focus();

    const listener = vi.fn();
    const unsubscribe = keyboardShortcutService.on(listener);
    const event = new KeyboardEvent('keydown', {
      key: 'n',
      bubbles: true,
      cancelable: true,
    });

    window.dispatchEvent(event);

    expect(listener).not.toHaveBeenCalled();
    expect(event.defaultPrevented).toBe(false);

    unsubscribe();
    editor.remove();
  });
});

describe('KeyboardShortcutService sessions', () => {
  type StorageListener = (
    changes: Record<string, chrome.storage.StorageChange>,
    areaName: string,
  ) => void;
  let pendingReads: Array<(value: Record<string, unknown>) => void>;
  let storageListeners: Set<StorageListener>;

  const storedShortcuts = (next: string): KeyboardShortcutStorage => ({
    shortcuts: {
      ...createCustomSingleLetterConfig(),
      next: { ...createCustomSingleLetterConfig().next, key: next },
    },
    enabled: true,
  });
  const resolveRead = (index: number, next: string) =>
    pendingReads[index]({ [StorageKeys.TIMELINE_SHORTCUTS]: storedShortcuts(next) });
  const press = (key: string, init: KeyboardEventInit = {}): KeyboardEvent => {
    const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...init });
    window.dispatchEvent(event);
    return event;
  };

  beforeEach(async () => {
    localStorage.clear();
    keyboardShortcutService.destroy();
    // The singleton keeps the last session's config; start each case from j/k.
    vi.stubGlobal('chrome', undefined);
    await keyboardShortcutService.resetToDefaults();
    pendingReads = [];
    storageListeners = new Set();
    vi.stubGlobal('chrome', {
      storage: {
        sync: {
          get: vi.fn(
            () =>
              new Promise<Record<string, unknown>>((resolve) => {
                pendingReads.push(resolve);
              }),
          ),
          set: vi.fn(async () => {}),
        },
        onChanged: {
          addListener: vi.fn((listener: StorageListener) => storageListeners.add(listener)),
          removeListener: vi.fn((listener: StorageListener) => storageListeners.delete(listener)),
        },
      },
    });
  });

  afterEach(() => {
    keyboardShortcutService.destroy();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('stops swallowing j and k once no timeline listens', async () => {
    const lease = keyboardShortcutService.acquire();
    pendingReads[0]({});
    await lease.ready;
    const listener = vi.fn();
    const off = keyboardShortcutService.on(listener);
    expect(press('j').defaultPrevented).toBe(true);
    expect(listener).toHaveBeenCalledWith('timeline:next', expect.any(KeyboardEvent));

    off();
    // The lease is still held, but nobody would act on the key.
    expect(press('j').defaultPrevented).toBe(false);
    lease.release();
    expect(press('k').defaultPrevented).toBe(false);
    expect(listener).toHaveBeenCalledOnce();
  });

  it("two config reads resolving in reverse order keep the newer session's shortcuts", async () => {
    const first = keyboardShortcutService.acquire();
    first.release();
    const second = keyboardShortcutService.acquire();
    const listener = vi.fn();
    const off = keyboardShortcutService.on(listener);

    resolveRead(1, 'x');
    await second.ready;
    resolveRead(0, 'y');
    await first.ready;

    expect(keyboardShortcutService.getConfig().config.next.key).toBe('x');
    press('y');
    expect(listener).not.toHaveBeenCalled();
    press('x');
    expect(listener).toHaveBeenCalledWith('timeline:next', expect.any(KeyboardEvent));
    off();
    second.release();
  });

  it('a shortcut change made during the initial read wins over the read', async () => {
    const lease = keyboardShortcutService.acquire();
    storageListeners.forEach((listener) =>
      listener({ [StorageKeys.TIMELINE_SHORTCUTS]: { newValue: storedShortcuts('m') } }, 'sync'),
    );
    resolveRead(0, 'y');
    await lease.ready;

    expect(keyboardShortcutService.getConfig().config.next.key).toBe('m');
    lease.release();
  });

  it("releasing a lease twice does not release another owner's lease", async () => {
    const first = keyboardShortcutService.acquire();
    const second = keyboardShortcutService.acquire();
    pendingReads[0]({});
    await second.ready;
    const listener = vi.fn();
    const off = keyboardShortcutService.on(listener);

    first.release();
    first.release();
    expect(press('j').defaultPrevented).toBe(true);
    expect(listener).toHaveBeenCalledOnce();
    expect(storageListeners.size).toBe(1);

    second.release();
    expect(press('j').defaultPrevented).toBe(false);
    expect(storageListeners.size).toBe(0);
    off();
  });

  it('the last release clears a pending gg sequence', async () => {
    const first = keyboardShortcutService.acquire();
    pendingReads[0]({});
    await first.ready;
    const listener = vi.fn();
    const off = keyboardShortcutService.on(listener);
    press('g');
    first.release();

    const second = keyboardShortcutService.acquire();
    pendingReads[1]({});
    await second.ready;
    press('g');
    expect(listener).not.toHaveBeenCalled();
    press('g');
    expect(listener).toHaveBeenCalledWith('timeline:first', expect.any(KeyboardEvent));
    off();
    second.release();
  });
});
