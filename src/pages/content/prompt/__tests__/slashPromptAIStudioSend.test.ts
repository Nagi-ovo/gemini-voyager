import { type Mock, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { promptStorageService } from '@/core/services/StorageService';
import { StorageKeys } from '@/core/types/common';

import { type SlashPromptController, startStoredPromptSlashCommand } from '../slashPrompt';
import { createTextarea, press, prompts, typeInto } from './slashPromptTestHarness';

vi.mock('webextension-polyfill', () => ({ default: globalThis.chrome }));

type Values = Record<string, unknown>;
type StorageListener = (
  changes: Record<string, chrome.storage.StorageChange>,
  area: string,
) => void;
let controller: SlashPromptController | null = null;
let stored: Values;
let listeners: StorageListener[];

function emit(key: string, value: unknown): void {
  stored[key] = value;
  listeners.slice().forEach((listener) => listener({ [key]: { newValue: value } }, 'sync'));
}

function composer(): { input: HTMLTextAreaElement; button: HTMLButtonElement } {
  const input = createTextarea('/review');
  const wrapper = input.parentElement!;
  const box = document.createElement('ms-prompt-box');
  wrapper.replaceWith(box);
  box.append(input);
  input.setAttribute('formcontrolname', 'promptText');
  const run = document.createElement('ms-run-button');
  const button = document.createElement('button');
  button.textContent = 'Run';
  run.append(button);
  box.append(run);
  return { input, button };
}

function place(input: HTMLTextAreaElement): void {
  input.value = '/review';
  input.setSelectionRange(input.value.length, input.value.length);
  typeInto(input);
  press(input, 'Enter');
  expect(input.value.trimEnd()).toBe('Code Review');
}

const settle = () => new Promise((resolve) => window.setTimeout(resolve, 10));

beforeEach(() => {
  stored = {
    [StorageKeys.CTRL_ENTER_SEND]: true,
    [StorageKeys.AISTUDIO_ENTER_SEND]: true,
    [StorageKeys.GV_AISTUDIO_ENABLED]: true,
  };
  listeners = [];
  vi.spyOn(promptStorageService, 'get').mockResolvedValue({ success: true, data: prompts });
  (chrome.storage.sync.get as unknown as Mock).mockImplementation(async (defaults: Values) => ({
    ...defaults,
    ...stored,
  }));
  (chrome.storage.onChanged.addListener as unknown as Mock).mockImplementation(
    (listener: StorageListener) => listeners.push(listener),
  );
  (chrome.storage.onChanged.removeListener as unknown as Mock).mockImplementation(
    (listener: StorageListener) => {
      listeners = listeners.filter((candidate) => candidate !== listener);
    },
  );
});

afterEach(() => {
  controller?.destroy();
  controller = null;
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  document.body.replaceChildren();
});

describe('AI Studio slash send mode (runtime only; the site startup gate stays closed)', () => {
  it.each(['com', 'cn'])(
    'expands on AI Studio %s Enter while the Gemini Ctrl+Enter switch is off, keeping newline chords intact',
    async (domain) => {
      vi.stubGlobal('location', new URL(`https://aistudio.google.${domain}/prompts/new_chat`));
      stored[StorageKeys.CTRL_ENTER_SEND] = false;
      const { input } = composer();
      controller = await startStoredPromptSlashCommand(() => 'light');
      place(input);
      for (const modifiers of [
        { ctrlKey: true },
        { metaKey: true },
        { shiftKey: true },
        { altKey: true },
      ]) {
        expect(press(input, 'Enter', modifiers).defaultPrevented).toBe(false);
        expect(input.value.trimEnd()).toBe('Code Review');
      }
      const hostTexts: string[] = [];
      input.addEventListener('keydown', () => hostTexts.push(input.value.trimEnd()));
      expect(press(input, 'Enter').defaultPrevented).toBe(true);
      await settle();
      expect(hostTexts).toEqual(['Review this code and report correctness issues.']);
    },
  );

  it.each(['com', 'cn'])(
    'keeps Enter as a newline on AI Studio %s when its own switch is off and Gemini Ctrl+Enter is on',
    async (domain) => {
      vi.stubGlobal('location', new URL(`https://aistudio.google.${domain}/prompts/new_chat`));
      stored[StorageKeys.AISTUDIO_ENTER_SEND] = false;
      const { input } = composer();
      controller = await startStoredPromptSlashCommand(() => 'light');
      place(input);
      expect(press(input, 'Enter').defaultPrevented).toBe(false);
      expect(input.value.trimEnd()).toBe('Code Review');
      expect(press(input, 'Enter', { ctrlKey: true }).defaultPrevented).toBe(true);
      await settle();
      expect(input.value.trimEnd()).toBe('Review this code and report correctness issues.');
    },
  );

  it('follows the AI Studio switch and master live while ignoring Gemini mode changes', async () => {
    vi.stubGlobal('location', new URL('https://aistudio.google.com/prompts/new_chat'));
    const { input } = composer();
    controller = await startStoredPromptSlashCommand(() => 'light');
    emit(StorageKeys.CTRL_ENTER_SEND, false);
    emit(StorageKeys.GV_AISTUDIO_ENABLED, false);
    place(input);
    expect(press(input, 'Enter').defaultPrevented).toBe(false);
    expect(input.value.trimEnd()).toBe('Code Review');
    emit(StorageKeys.GV_AISTUDIO_ENABLED, true);
    emit(StorageKeys.AISTUDIO_ENTER_SEND, false);
    expect(press(input, 'Enter').defaultPrevented).toBe(false);
    expect(input.value.trimEnd()).toBe('Code Review');
    emit(StorageKeys.AISTUDIO_ENTER_SEND, true);
    expect(press(input, 'Enter').defaultPrevented).toBe(true);
    await settle();
    expect(input.value.trimEnd()).toBe('Review this code and report correctness issues.');
  });

  it('keeps newer AI Studio switch and master changes when the initial read returns late', async () => {
    vi.stubGlobal('location', new URL('https://aistudio.google.com/prompts/new_chat'));
    const { input } = composer();
    let answer!: (snapshot: Values) => void;
    (chrome.storage.sync.get as unknown as Mock).mockImplementation(
      () =>
        new Promise<Values>((resolve) => {
          answer = resolve;
        }),
    );
    const starting = startStoredPromptSlashCommand(() => 'light');
    emit(StorageKeys.AISTUDIO_ENTER_SEND, false);
    emit(StorageKeys.GV_AISTUDIO_ENABLED, false);
    answer({
      [StorageKeys.AISTUDIO_ENTER_SEND]: true,
      [StorageKeys.GV_AISTUDIO_ENABLED]: true,
      [StorageKeys.CTRL_ENTER_SEND]: false,
    });
    controller = await starting;
    place(input);
    expect(press(input, 'Enter').defaultPrevented).toBe(false);
    emit(StorageKeys.GV_AISTUDIO_ENABLED, true);
    // Only master changed: the newer per-feature OFF still keeps Enter for newline.
    expect(press(input, 'Enter').defaultPrevented).toBe(false);
    expect(input.value.trimEnd()).toBe('Code Review');
    expect(press(input, 'Enter', { metaKey: true }).defaultPrevented).toBe(true);
    await settle();
    expect(input.value.trimEnd()).toBe('Review this code and report correctness issues.');
  });

  it('expands the selected prompt before AI Studio’s actual Run button sees its click', async () => {
    vi.stubGlobal('location', new URL('https://aistudio.google.com/prompts/new_chat'));
    const { input, button } = composer();
    controller = await startStoredPromptSlashCommand(() => 'light');
    place(input);
    const hostTexts: string[] = [];
    button.addEventListener('click', () => hostTexts.push(input.value.trimEnd()));
    button.click();
    await settle();
    expect(hostTexts).toEqual(['Review this code and report correctness issues.']);
  });
});
