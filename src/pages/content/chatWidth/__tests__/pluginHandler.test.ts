/**
 * The chat width builtin plugin's handler: the native module's rules and
 * health probe under a plugin scope, its in-place width updates, and the
 * write-backs it keeps from the native module (with their boundaries).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { logger } from '@/core/services/LoggerService';
import { StorageKeys } from '@/core/types/common';
import { PluginScope } from '@/features/plugins/runtime/pluginScope';
import { elementValue } from '@/tests/pseudoElementPaint';

import {
  EDIT_INPUT_WIDTH_STYLE_ID,
  activateGeminiEditInputWidth,
} from '../../editInputWidth/pluginHandler';
import { nativeHealthReporter } from '../../nativeHealth';
import { activateGeminiChatWidth, updateGeminiChatWidthSettings } from '../pluginHandler';

const STYLE_ID = 'gv-plugin-chat-width';
const SCREEN_WIDTH = 1920;
const WIDTH = StorageKeys.CHAT_WIDTH;
const SWITCH = StorageKeys.CHAT_WIDTH_ENABLED;

/** Sync storage as a plain map: `get` reads it, `set` merges into it. */
function fakeSync(initial: Record<string, unknown>) {
  const stored: Record<string, unknown> = { ...initial };
  vi.mocked(chrome.storage.sync.get).mockImplementation((async (keys: string[]) =>
    Object.fromEntries(
      keys.filter((key) => key in stored).map((key) => [key, stored[key]]),
    )) as never);
  vi.mocked(chrome.storage.sync.set).mockImplementation((async (items: Record<string, unknown>) => {
    Object.assign(stored, items);
  }) as never);
  return stored;
}

/** Sync reads that wait until the test answers them, in any order. */
function heldSyncReads() {
  const answers: Array<(value: Record<string, unknown>) => void> = [];
  vi.mocked(chrome.storage.sync.get).mockImplementation(
    (() => new Promise((resolve) => answers.push(resolve))) as never,
  );
  return {
    pending: () => answers.length,
    async answer(index: number, value: Record<string, unknown>): Promise<void> {
      answers[index](value);
      await settle();
    },
  };
}

/** A `chrome.storage.onChanged` event, delivered to whatever the page registered. */
function storageChange(changes: Record<string, { newValue?: unknown }>, area: string): void {
  for (const [listener] of vi.mocked(chrome.storage.onChanged.addListener).mock.calls) {
    (listener as (changes: unknown, area: string) => void)(changes, area);
  }
}

async function settle(): Promise<void> {
  for (let i = 0; i < 4; i += 1) await Promise.resolve();
}

function styleText(): string {
  const style = document.getElementById(STYLE_ID);
  expect(style).not.toBeNull();
  return style?.textContent ?? '';
}

const px = (percent: number): number => Math.round((percent / 100) * SCREEN_WIDTH);

let scope: PluginScope;

beforeEach(() => {
  document.head.innerHTML = '';
  document.body.innerHTML = '<main></main>';
  Object.defineProperty(window, 'screen', {
    value: { availWidth: SCREEN_WIDTH, width: SCREEN_WIDTH },
    writable: true,
    configurable: true,
  });
  fakeSync({ [WIDTH]: 85, [SWITCH]: true });
  scope = new PluginScope();
});

afterEach(async () => {
  await scope.dispose();
  vi.mocked(chrome.storage.sync.get).mockReset();
  vi.mocked(chrome.storage.sync.set).mockReset();
  vi.mocked(chrome.storage.onChanged.addListener).mockClear();
  vi.restoreAllMocks();
  vi.useRealTimers();
  history.replaceState(null, '', '/');
});

describe('Gemini chat width plugin handler', () => {
  it('sizes the conversation from the screen width so split screen fills the window', () => {
    activateGeminiChatWidth(scope, { widthPercent: 70 });
    const text = styleText();
    // 70 % of a 1920 px screen; in a 960 px split-screen window min(100%, …) fills it.
    expect(text).toContain(`max-width: ${px(70)}px !important`);
    expect(text).toContain(`width: min(100%, ${px(70)}px) !important`);
    expect(text).toContain(`--bard-chat-window-content-width-default: ${px(70)}px !important`);
    expect(text).not.toMatch(/\d+vw/);
  });

  it('widens markdown children only inside conversation turns and leaves canvas content alone', () => {
    document.body.innerHTML = `<main class="enable-extended-and-xl-grid">
      <div class="conversation-container"><div class="md-content"><span id="turn-text">Turn</span></div></div>
      <aside><div class="md-content"><span id="canvas-text">Canvas</span></div></aside>
    </main>`;
    activateGeminiChatWidth(scope, { widthPercent: 70 });
    expect(elementValue(document.getElementById('turn-text')!, 'max-width')).toBe(`${px(70)}px`);
    expect(elementValue(document.getElementById('canvas-text')!, 'max-width')).toBeNull();
    updateGeminiChatWidthSettings({ widthPercent: 90 });
    expect(elementValue(document.getElementById('turn-text')!, 'max-width')).toBe(`${px(90)}px`);
    expect(elementValue(document.getElementById('canvas-text')!, 'max-width')).toBeNull();
  });

  it('applies widescreen rules to Gemini table blocks and moves them with the width in place', () => {
    activateGeminiChatWidth(scope, { widthPercent: 85 });
    const style = document.getElementById(STYLE_ID);
    expect(styleText()).toMatch(
      new RegExp(
        String.raw`\/\* Gemini table containers \*\/[\s\S]*table-block,[\s\S]*\{[\s\S]*max-width: ${px(85)}px !important;`,
      ),
    );
    expect(styleText()).toContain('.horizontal-scroll-wrapper');

    updateGeminiChatWidthSettings({ widthPercent: 92 });
    expect(document.getElementById(STYLE_ID)).toBe(style);
    expect(document.querySelectorAll(`#${STYLE_ID}`)).toHaveLength(1);
    expect(styleText()).toContain(`width: min(100%, ${px(92)}px) !important`);
    expect(styleText()).not.toContain(`${px(85)}px`);
  });

  it('excludes the header logo pill wrapper from the sparkle width rule (#875)', () => {
    activateGeminiChatWidth(scope, { widthPercent: 85 });
    const selector = styleText().match(/main > div:has\(img\[src\*="sparkle"\]\)[^{]*/)?.[0];
    expect(selector).toBeDefined();
    document.body.innerHTML = `
      <main>
        <div class="side-nav-menu-button">
          <chat-app-side-nav-menu-button><img src="https://x/gemini_sparkle_aurora.svg" /></chat-app-side-nav-menu-button>
        </div>
        <div class="loading-wrapper"><img src="https://x/gemini_sparkle_loading.svg" /></div>
      </main>`;
    const matches = [...document.querySelectorAll(selector?.trim() ?? '')];
    expect(matches.map((el) => el.className)).toEqual(['loading-wrapper']);
  });

  it('widens the file-drop overlay to match the input area (#887)', () => {
    activateGeminiChatWidth(scope, { widthPercent: 85 });
    const rule = styleText().match(/(input-container file-drop-indicator[^{]+)\{([^}]+)\}/);
    expect(rule).not.toBeNull();
    const [, selector, body] = rule as RegExpMatchArray;
    expect(body).toContain(`max-width: ${px(85)}px !important`);
    document.body.innerHTML = `
      <main>
        <input-container><file-drop-indicator>
          <div class="overlay-container" data-filedrop-id="chat-window-input-container"></div>
        </file-drop-indicator></input-container>
        <file-drop-indicator><div class="overlay-container" data-filedrop-id="other"></div></file-drop-indicator>
      </main>`;
    expect(
      [...document.querySelectorAll(selector.trim())].map((el) =>
        el.getAttribute('data-filedrop-id'),
      ),
    ).toEqual(['chat-window-input-container']);
  });

  it('keeps the edit-input width winning on the file-drop overlay whichever stylesheet comes last', async () => {
    document.body.innerHTML = `
      <main><input-container><file-drop-indicator>
        <div class="overlay-container" data-filedrop-id="chat-window-input-container"></div>
      </file-drop-indicator></input-container></main>`;
    const overlay = document.querySelector('.overlay-container')!;
    const editScope = new PluginScope();
    activateGeminiEditInputWidth(editScope, { widthPercent: 80 });
    const editInput = document.getElementById(EDIT_INPUT_WIDTH_STYLE_ID)!;
    const editInputWidth = elementValue(overlay, 'max-width');
    expect(editInputWidth).not.toBeNull();

    // The chat width sheet after the edit-input one: source order alone would let it win.
    activateGeminiChatWidth(scope, { widthPercent: 85 });
    const chatWidth = document.getElementById(STYLE_ID)!;
    expect(chatWidth.compareDocumentPosition(editInput)).toBe(Node.DOCUMENT_POSITION_PRECEDING);
    expect(elementValue(overlay, 'max-width')).toBe(editInputWidth);

    // Alone, the chat width rule does size the overlay.
    editInput.remove();
    expect(elementValue(overlay, 'max-width')).toBe(`${px(85)}px`);
    await editScope.dispose();
  });

  it('re-applies after Gemini re-renders and keeps nothing alive after teardown', async () => {
    vi.useFakeTimers();
    activateGeminiChatWidth(scope, { widthPercent: 85 });
    document.getElementById(STYLE_ID)?.remove();
    document.querySelector('main')?.append(document.createElement('div'));
    await Promise.resolve();
    vi.advanceTimersByTime(200);
    expect(document.querySelectorAll(`#${STYLE_ID}`)).toHaveLength(1);

    await scope.dispose();
    expect(document.getElementById(STYLE_ID)).toBeNull();
    document.querySelector('main')?.append(document.createElement('div'));
    await Promise.resolve();
    vi.advanceTimersByTime(1000);
    updateGeminiChatWidthSettings({ widthPercent: 50 });
    expect(document.getElementById(STYLE_ID)).toBeNull();
  });

  it('records the upgrade auto-enable once and never overwrites a newer popup choice', async () => {
    // An old px width and no switch: the host derived "on" from the width.
    const stored = fakeSync({ [WIDTH]: 960 });
    activateGeminiChatWidth(scope, { widthPercent: 80 });
    await settle();
    expect(stored).toEqual({ [WIDTH]: 80, [SWITCH]: true });
    expect(chrome.storage.sync.set).toHaveBeenCalledTimes(1);

    // Already normalized: a later width change writes nothing more.
    updateGeminiChatWidthSettings({ widthPercent: 80 });
    await settle();
    expect(chrome.storage.sync.set).toHaveBeenCalledTimes(1);
  });

  it('drops a normalization read that the slider overtook instead of writing the old width over the new one', async () => {
    const reads = heldSyncReads();
    activateGeminiChatWidth(scope, { widthPercent: 80 });
    // The page's first read is out when the user drags the slider to 90 %.
    expect(reads.pending()).toBe(1);
    updateGeminiChatWidthSettings({ widthPercent: 90 });
    expect(reads.pending()).toBe(2);

    // The first read answers from before the slider moved: an old 960 px width, no switch.
    await reads.answer(0, { [WIDTH]: 960 });
    expect(chrome.storage.sync.set).not.toHaveBeenCalled();

    await reads.answer(1, { [WIDTH]: 90, [SWITCH]: true });
    expect(chrome.storage.sync.set).not.toHaveBeenCalled();
  });

  it('drops a normalization read that a switch change overtook instead of turning the switch back on', async () => {
    const reads = heldSyncReads();
    activateGeminiChatWidth(scope, { widthPercent: 85 });
    expect(reads.pending()).toBe(1);

    // The popup stores the switch off while the read is out; the plugin is still running.
    storageChange({ [SWITCH]: { newValue: false } }, 'sync');

    // The first read answers from before the switch was stored.
    await reads.answer(0, { [WIDTH]: 85 });
    expect(chrome.storage.sync.set).not.toHaveBeenCalled();
    if (reads.pending() > 1) await reads.answer(1, { [WIDTH]: 85, [SWITCH]: false });
    expect(chrome.storage.sync.set).not.toHaveBeenCalled();
  });

  it('a live switch removal is not turned back on while the host has not torn the plugin down', async () => {
    // A pre-switch customized width: the first read records the derived on.
    const stored = fakeSync({ [WIDTH]: 85 });
    activateGeminiChatWidth(scope, { widthPercent: 85 });
    await settle();
    expect(stored[SWITCH]).toBe(true);
    expect(chrome.storage.sync.set).toHaveBeenCalledTimes(1);

    // The user removes the switch; the host has not unmounted the plugin yet.
    delete stored[SWITCH];
    storageChange({ [SWITCH]: { newValue: undefined } }, 'sync');
    await settle();
    expect(SWITCH in stored).toBe(false);
    expect(chrome.storage.sync.set).toHaveBeenCalledTimes(1);
  });

  it('a switch removed during the first read is not derived back on by the read that replaces it', async () => {
    const reads = heldSyncReads();
    activateGeminiChatWidth(scope, { widthPercent: 85 });
    expect(reads.pending()).toBe(1);
    storageChange({ [SWITCH]: { newValue: undefined } }, 'sync');
    expect(reads.pending()).toBe(2);
    // Both reads see a missing switch beside a customized width; neither may record it as on.
    await reads.answer(0, { [WIDTH]: 85 });
    await reads.answer(1, { [WIDTH]: 85 });
    expect(chrome.storage.sync.set).not.toHaveBeenCalled();
  });

  it('writes nothing after the chat width plugin was torn down or the extension context died', async () => {
    let answer: (value: Record<string, unknown>) => void = () => {};
    vi.mocked(chrome.storage.sync.get).mockImplementation(
      (() => new Promise((resolve) => (answer = resolve))) as never,
    );
    activateGeminiChatWidth(scope, { widthPercent: 80 });
    await scope.dispose();
    answer({ [WIDTH]: 960 });
    await settle();
    expect(chrome.storage.sync.set).not.toHaveBeenCalled();

    // The context died while the read was out.
    scope = new PluginScope();
    vi.mocked(chrome.storage.sync.get).mockImplementation(
      (() => new Promise((resolve) => (answer = resolve))) as never,
    );
    activateGeminiChatWidth(scope, { widthPercent: 80 });
    const runtime = chrome.runtime as { id?: string };
    const id = runtime.id;
    runtime.id = undefined;
    try {
      answer({ [WIDTH]: 960 });
      await settle();
      expect(chrome.storage.sync.set).not.toHaveBeenCalled();
    } finally {
      runtime.id = id;
    }

    // A read rejected by an invalidated context is no failure to report.
    const warn = vi.spyOn(logger, 'warn').mockImplementation(() => {});
    vi.mocked(chrome.storage.sync.get).mockRejectedValue(
      new Error('Extension context invalidated.'),
    );
    updateGeminiChatWidthSettings({ widthPercent: 80 });
    await settle();
    expect(chrome.storage.sync.set).not.toHaveBeenCalled();
    expect(warn).not.toHaveBeenCalled();
  });

  it('reports a missing chat-width anchor to native health while the plugin runs and withdraws it when off', async () => {
    const reportMissing = vi.spyOn(nativeHealthReporter, 'reportMissing');
    const withdraw = vi.spyOn(nativeHealthReporter, 'withdraw');
    history.replaceState(null, '', '/app/abc123');

    activateGeminiChatWidth(scope, { widthPercent: 85 });
    expect(reportMissing).toHaveBeenCalledWith(
      'chat-width',
      expect.objectContaining({ route: 'conversation' }),
    );
    expect(withdraw).not.toHaveBeenCalled();

    await scope.dispose();
    expect(withdraw).toHaveBeenCalledWith('chat-width');
  });
});
