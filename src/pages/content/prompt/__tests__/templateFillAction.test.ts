import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { StorageKeys } from '@/core/types/common';

import { insertTextIntoChatInput } from '../../chatInput/index';
import { startPromptManager } from '../index';
import { resolvePromptSiteAdapter } from '../resolvePromptSiteAdapter';

vi.mock('webextension-polyfill', () => ({ default: globalThis.chrome }));
vi.mock('../../chatInput/index', () => ({ insertTextIntoChatInput: vi.fn(() => true) }));

const prompt = {
  id: 'explain',
  name: 'Explain',
  text: 'Explain {{topic}}',
  tags: [],
  createdAt: 1,
};

let syncValues: Record<string, unknown>;
let manager: Awaited<ReturnType<typeof startPromptManager>> | undefined;
const writeText = vi.fn(async (_text: string) => {});
const clipboardDescriptor = Object.getOwnPropertyDescriptor(navigator, 'clipboard');

function storageGet(values: Record<string, unknown>): typeof chrome.storage.sync.get {
  const get = (
    keys: string | string[] | Record<string, unknown> | null = null,
    callback?: (items: Record<string, unknown>) => void,
  ): Promise<Record<string, unknown>> => {
    const result =
      keys === null
        ? { ...values }
        : Object.fromEntries(
            (typeof keys === 'string'
              ? [keys]
              : Array.isArray(keys)
                ? keys
                : Object.keys(keys)
            ).map((key) => [
              key,
              values[key] ??
                (typeof keys === 'object' && !Array.isArray(keys) ? keys[key] : undefined),
            ]),
          );
    callback?.(result);
    return Promise.resolve(result);
  };
  return get as typeof chrome.storage.sync.get;
}

function openFill(): HTMLButtonElement {
  const row = document.querySelector<HTMLButtonElement>('.gv-pm-item-text');
  expect(row).not.toBeNull();
  row!.dispatchEvent(new MouseEvent('mousedown', { button: 0, bubbles: true, cancelable: true }));
  const submit = document.querySelector<HTMLButtonElement>('.gv-pm-fill .gv-pm-save');
  expect(submit).not.toBeNull();
  return submit!;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  document.body.innerHTML = '';
  localStorage.clear();
  syncValues = { [StorageKeys.LANGUAGE]: 'en' };
  vi.mocked(chrome.storage.sync.get).mockImplementation(storageGet(syncValues));
  vi.mocked(chrome.storage.local.get).mockImplementation(
    storageGet({ [StorageKeys.PROMPT_ITEMS]: [prompt] }),
  );
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } });
  vi.spyOn(console, 'error').mockImplementation(() => {});
  // startPromptManager temporarily wraps console.warn for KaTeX; restore it after each run.
  vi.spyOn(console, 'warn');
});

afterEach(() => {
  manager?.destroy();
  manager = undefined;
  vi.clearAllTimers();
  vi.useRealTimers();
  if (clipboardDescriptor) Object.defineProperty(navigator, 'clipboard', clipboardDescriptor);
  else Reflect.deleteProperty(navigator, 'clipboard');
  vi.restoreAllMocks();
  document.body.innerHTML = '';
});

describe('template fill delivery follows its displayed action', () => {
  it.each([
    { insertInitially: false, keepRaw: false },
    { insertInitially: true, keepRaw: false },
    { insertInitially: false, keepRaw: true },
    { insertInitially: true, keepRaw: true },
  ])(
    'keeps the opening mode when insert=$insertInitially and keepRaw=$keepRaw',
    async ({ insertInitially, keepRaw }) => {
      syncValues[StorageKeys.PROMPT_INSERT_ON_CLICK] = insertInitially;
      manager = await startPromptManager(resolvePromptSiteAdapter(location.href));
      expect(console.error).not.toHaveBeenCalled();
      const trigger = document.querySelector<HTMLButtonElement>('#gv-pm-trigger');
      expect(trigger).not.toBeNull();
      trigger!.click();

      const submit = openFill();
      expect(submit.textContent).toBe(insertInitially ? 'Insert' : 'Copy');
      document.querySelector<HTMLElement>('.gv-pm-slot')!.textContent = 'gravity';

      syncValues[StorageKeys.PROMPT_INSERT_ON_CLICK] = !insertInitially;
      const listeners = vi.mocked(chrome.storage.onChanged.addListener).mock.calls;
      expect(listeners.length).toBeGreaterThan(0);
      for (const [listener] of listeners) {
        listener(
          {
            [StorageKeys.PROMPT_INSERT_ON_CLICK]: {
              oldValue: insertInitially,
              newValue: !insertInitially,
            },
          },
          'sync',
        );
      }

      expect(submit.textContent).toBe(insertInitially ? 'Insert' : 'Copy');
      const action = keepRaw
        ? document.querySelector<HTMLButtonElement>('.gv-pm-fill .gv-pm-cancel')!
        : submit;
      action.click();
      await Promise.resolve();

      const expectedText = keepRaw ? prompt.text : 'Explain gravity';
      expect(insertInitially ? insertTextIntoChatInput : writeText).toHaveBeenCalledExactlyOnceWith(
        expectedText,
      );
      expect(insertInitially ? writeText : insertTextIntoChatInput).not.toHaveBeenCalled();
      expect(document.querySelector('.gv-pm-fill')).toBeNull();

      vi.mocked(insertTextIntoChatInput).mockClear();
      writeText.mockClear();
      const nextSubmit = openFill();
      expect(nextSubmit.textContent).toBe(insertInitially ? 'Copy' : 'Insert');
      document.querySelector<HTMLElement>('.gv-pm-slot')!.textContent = 'light';
      nextSubmit.click();
      await Promise.resolve();

      expect(insertInitially ? writeText : insertTextIntoChatInput).toHaveBeenCalledExactlyOnceWith(
        'Explain light',
      );
      expect(insertInitially ? insertTextIntoChatInput : writeText).not.toHaveBeenCalled();
      expect(console.error).not.toHaveBeenCalled();
    },
  );
});
