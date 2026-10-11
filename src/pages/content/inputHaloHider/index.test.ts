// @vitest-environment jsdom
// @vitest-environment-options { "url": "https://gemini.google.com/app" }
import { type Mock, afterEach, beforeEach, describe, expect, it } from 'vitest';

import { StorageKeys } from '@/core/types/common';

import { startInputHaloHider } from './index';

const KEY = StorageKeys.INPUT_HALO_HIDDEN;
const CLASS = 'gv-hide-input-halo';

type Listener = (changes: Record<string, { newValue?: unknown }>, area: string) => void;

let resolveRead: (value: Record<string, unknown>) => void = () => {};
const listeners = new Set<Listener>();

const hidden = (): boolean => document.body.classList.contains(CLASS);
const settle = async (): Promise<void> => {
  for (let i = 0; i < 3; i += 1) await Promise.resolve();
};
const emit = (newValue: unknown): void => {
  for (const listener of listeners) listener({ [KEY]: { newValue } }, 'sync');
};

beforeEach(() => {
  listeners.clear();
  (chrome.storage.sync.get as unknown as Mock).mockImplementation(
    () => new Promise((resolve) => (resolveRead = resolve)),
  );
  (chrome.storage.onChanged.addListener as unknown as Mock).mockImplementation((l: Listener) =>
    listeners.add(l),
  );
  (chrome.storage.onChanged.removeListener as unknown as Mock).mockImplementation((l: Listener) =>
    listeners.delete(l),
  );
});

afterEach(() => {
  document.body.className = '';
  (chrome.storage.sync.get as unknown as Mock).mockReset();
  (chrome.storage.onChanged.addListener as unknown as Mock).mockReset();
  (chrome.storage.onChanged.removeListener as unknown as Mock).mockReset();
});

describe('startInputHaloHider', () => {
  it('hides the halo from the stored setting and follows it live until stopped', async () => {
    const stop = startInputHaloHider();
    resolveRead({ [KEY]: true });
    await settle();
    expect(hidden()).toBe(true);

    emit(false);
    expect(hidden()).toBe(false);
    emit(true);
    expect(hidden()).toBe(true);

    stop();
    expect(hidden()).toBe(false);
    expect(listeners.size).toBe(0);
    emit(true);
    expect(hidden()).toBe(false);
  });

  it('stays stopped when the startup read lands after stop', async () => {
    const stop = startInputHaloHider();
    stop();
    resolveRead({ [KEY]: true });
    await settle();
    expect(hidden()).toBe(false);
  });

  it('keeps a live "show" when an older "hide" read lands after it', async () => {
    const stop = startInputHaloHider();
    emit(false);
    resolveRead({ [KEY]: true });
    await settle();
    expect(hidden()).toBe(false);
    stop();
  });

  it('drops a wait for the body when stopped before the document is ready', async () => {
    const body = document.body;
    document.documentElement.removeChild(body);
    const stop = startInputHaloHider();
    emit(true);
    stop();
    document.documentElement.appendChild(body);
    document.dispatchEvent(new Event('DOMContentLoaded'));
    expect(hidden()).toBe(false);
  });
});
