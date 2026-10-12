/**
 * The chat width builtin plugin's handler: the native module's rules and
 * health probe under a plugin scope, its in-place width updates, and the
 * write-backs it keeps from the native module (with their boundaries).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { logger } from '@/core/services/LoggerService';
import { StorageKeys } from '@/core/types/common';
import { PluginScope } from '@/features/plugins/runtime/pluginScope';

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

  it('keeps the edit-input width rule winning over the chat width overlay rule', async () => {
    activateGeminiChatWidth(scope, { widthPercent: 85 });
    const overlay = styleText()
      .match(/(input-container file-drop-indicator[^{]+)\{/)?.[1]
      ?.trim();
    vi.mocked(chrome.storage.sync.get).mockImplementation(((
      _keys: unknown,
      callback: (value: Record<string, unknown>) => void,
    ) => callback({ geminiEditInputWidth: 80, gvEditInputWidthEnabled: true })) as never);
    const { startEditInputWidthAdjuster } = await import('../../editInputWidth');
    startEditInputWidthAdjuster();
    const editInput = document.getElementById('gemini-voyager-edit-input-width')?.textContent;
    window.dispatchEvent(new Event('beforeunload'));
    // Both are !important: the `html body` prefix is what makes the edit-input rule win.
    expect(overlay).toBeDefined();
    expect(editInput).toContain(`html body ${overlay} {`);
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
    await scope.dispose();

    // The popup turned the switch off before this page's write: it stays off.
    scope = new PluginScope();
    vi.mocked(chrome.storage.sync.set).mockClear();
    const chosen = fakeSync({ [WIDTH]: 85, [SWITCH]: false });
    activateGeminiChatWidth(scope, { widthPercent: 85 });
    await settle();
    expect(chosen[SWITCH]).toBe(false);
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
