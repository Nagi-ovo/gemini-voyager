/**
 * The edit input width builtin plugin's handler: the native module's rules
 * under a plugin scope, its in-place width updates, its teardown, and the
 * write-backs it keeps from the native module (with their boundaries).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { StorageKeys } from '@/core/types/common';
import { PluginScope } from '@/features/plugins/runtime/pluginScope';

import {
  EDIT_INPUT_WIDTH_STYLE_ID,
  activateGeminiEditInputWidth,
  updateGeminiEditInputWidthSettings,
} from '../pluginHandler';

const STYLE_ID = EDIT_INPUT_WIDTH_STYLE_ID;
const WIDTH = StorageKeys.EDIT_INPUT_WIDTH;
const SWITCH = StorageKeys.EDIT_INPUT_WIDTH_ENABLED;

function getInjectedStyle(): HTMLStyleElement {
  const style = document.getElementById(STYLE_ID);
  expect(style).not.toBeNull();
  return style as HTMLStyleElement;
}

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

let scope: PluginScope;

/** The handler as the host mounts it: only while on, with the normalized width. */
function activate(widthPercent: unknown = 80): void {
  activateGeminiEditInputWidth(scope, { widthPercent } as never);
}

describe('Gemini edit input width plugin handler', () => {
  beforeEach(() => {
    document.head.innerHTML = '';
    document.body.innerHTML = '<main></main>';
    fakeSync({ [WIDTH]: 80, [SWITCH]: true });
    scope = new PluginScope();
  });

  afterEach(async () => {
    await scope.dispose();
    vi.mocked(chrome.storage.sync.get).mockReset();
    vi.mocked(chrome.storage.sync.set).mockReset();
    vi.mocked(chrome.storage.onChanged.addListener).mockClear();
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('applies the configured width to the main input area', () => {
    activate();

    const styleText = getInjectedStyle().textContent ?? '';
    expect(styleText).toContain('max-width: 80vw !important');
    expect(styleText).toContain('width: min(100%, 80vw) !important');
    // !important or Gemini's Angular host attribute selector keeps the
    // luminous default (#955)
    expect(styleText).toContain('--bard-chat-window-content-width-default: 80vw !important');
    expect(styleText).toContain('--bard-chat-window-max-width-default: 80vw !important');
    expect(styleText).toContain('html body input-container input-area-v2');
  });

  it('widens the file-drop overlay to match the input area (#887)', () => {
    activate();

    const styleText = getInjectedStyle().textContent ?? '';
    // Read the selector back out of the injected CSS so this test fails if the
    // shipped rule changes, instead of only checking a hardcoded copy of it
    const overlayRule = styleText.match(
      /(^|\n)\s*(html body input-container file-drop-indicator[^{]+)\{([^}]+)\}/,
    );
    expect(overlayRule).not.toBeNull();
    const selector = (overlayRule as RegExpMatchArray)[2].trim();
    const body = (overlayRule as RegExpMatchArray)[3];

    // More specific than chatWidth's input-container-prefixed overlay rule so
    // both-enabled sessions follow Edit input width for the composer (#955).
    expect(selector).toBe(
      'html body input-container file-drop-indicator .overlay-container[data-filedrop-id="chat-window-input-container"]',
    );
    expect(body).toContain('max-width: 80vw !important');
    expect(body).toContain('width: min(100%, 80vw) !important');
    expect(body).toContain('margin-left: auto !important');
    expect(body).toContain('margin-right: auto !important');

    // Behavioral check against the real DOM shape: the chat overlay matches,
    // an overlay for a different drop target does not
    document.body.innerHTML = `
      <main>
        <input-container>
          <fieldset class="input-area-container">
            <file-drop-indicator>
              <div class="overlay-container" data-filedrop-id="chat-window-input-container"></div>
            </file-drop-indicator>
          </fieldset>
        </input-container>
        <file-drop-indicator>
          <div class="overlay-container" data-filedrop-id="some-other-target"></div>
        </file-drop-indicator>
      </main>
    `;
    const matches = [...document.querySelectorAll(selector)];
    expect(matches.map((el) => el.getAttribute('data-filedrop-id'))).toEqual([
      'chat-window-input-container',
    ]);
  });

  it('sizes only the outermost edit container so the actions stay under the box', () => {
    activate();

    const styleText = getInjectedStyle().textContent ?? '';

    // Read the shipped rule back out so this fails if the selector changes.
    const nestedRule = styleText.match(
      /(^|\n)\s*(\.edit-mode \.edit-container \.edit-container,[^{]+)\{([^}]+)\}/,
    );
    expect(nestedRule).not.toBeNull();
    const selector = (nestedRule as RegExpMatchArray)[2].trim().replace(/\s*\n\s*/g, ' ');
    expect((nestedRule as RegExpMatchArray)[3]).toContain('width: 100% !important');

    // Gemini's real edit-mode shape: two nested .edit-container elements, the
    // outer one also holding .edit-button-area (Cancel/Update). The inner one
    // is indented by .query-content's padding, so sizing both to the slider
    // width pushed the box past the buttons by exactly that padding.
    document.body.innerHTML = `
      <main>
        <user-query-content class="user-query-container">
          <div class="user-query-container edit-mode">
            <div class="edit-container" id="outer">
              <div class="query-content ng-star-inserted edit-mode" id="query">
                <div class="edit-container" id="inner">
                  <mat-form-field class="mat-mdc-form-field edit-form"></mat-form-field>
                </div>
              </div>
              <div class="edit-button-area">
                <button type="button">Cancel</button>
                <button type="button">Update</button>
              </div>
            </div>
          </div>
        </user-query-content>
      </main>
    `;

    const filled = [...document.querySelectorAll(selector)].map((el) => el.id);
    // The outer container keeps the slider width; everything nested fills it.
    expect(filled).toContain('inner');
    expect(filled).toContain('query');
    expect(filled).not.toContain('outer');
  });

  it('measures every width rule against the border box', () => {
    activate();

    const styleText = getInjectedStyle().textContent ?? '';
    const borderBoxRule = styleText.match(/([^{}]+)\{\s*box-sizing: border-box !important;\s*\}/);
    expect(borderBoxRule).not.toBeNull();
    const selector = (borderBoxRule as RegExpMatchArray)[1];

    // These containers carry horizontal padding. A content-box width overflows
    // the parent by that padding and desyncs the box from the button row.
    for (const needed of [
      '.query-content.edit-mode',
      '.edit-mode .edit-container',
      '.edit-mode .edit-form',
      '.edit-mode .mat-mdc-form-field-infix',
    ]) {
      expect(selector).toContain(needed);
    }
  });

  it('moves the width in place and reads an old px or out-of-range width as the native module did', () => {
    activate(80);
    const style = getInjectedStyle();
    updateGeminiEditInputWidthSettings({ widthPercent: 45 });
    expect(document.getElementById(STYLE_ID)).toBe(style);
    expect(document.querySelectorAll(`#${STYLE_ID}`)).toHaveLength(1);
    expect(style.textContent).toContain('max-width: 45vw !important');
    expect(style.textContent).not.toContain('80vw');

    // 960 px of the old 1200 px baseline is 80 %; anything else clamps or falls back to 60 %.
    updateGeminiEditInputWidthSettings({ widthPercent: 960 });
    expect(style.textContent).toContain('max-width: 80vw !important');
    updateGeminiEditInputWidthSettings({ widthPercent: 12 });
    expect(style.textContent).toContain('max-width: 30vw !important');
    updateGeminiEditInputWidthSettings({ widthPercent: 'wide' } as never);
    expect(style.textContent).toContain('max-width: 60vw !important');
  });

  it('re-applies after Gemini drops the sheet on entering edit mode and leaves nothing behind when off', async () => {
    vi.useFakeTimers();
    activate(80);
    document.getElementById(STYLE_ID)?.remove();
    // Entering edit mode only adds a class: that alone must bring the sheet back.
    const turn = document.querySelector('main')!.appendChild(document.createElement('div'));
    await Promise.resolve();
    vi.advanceTimersByTime(200);
    expect(document.querySelectorAll(`#${STYLE_ID}`)).toHaveLength(1);
    document.getElementById(STYLE_ID)?.remove();
    turn.className = 'query-content edit-mode';
    await Promise.resolve();
    vi.advanceTimersByTime(200);
    expect(document.querySelectorAll(`#${STYLE_ID}`)).toHaveLength(1);

    // Turning the plugin off removes the sheet at once, not only on unload.
    await scope.dispose();
    expect(document.getElementById(STYLE_ID)).toBeNull();
    turn.className = 'query-content';
    document.querySelector('main')?.append(document.createElement('div'));
    await Promise.resolve();
    vi.advanceTimersByTime(1000);
    updateGeminiEditInputWidthSettings({ widthPercent: 50 });
    expect(document.getElementById(STYLE_ID)).toBeNull();
  });

  it('records the upgrade auto-enable and the percent of an old px width once', async () => {
    // An old px width and no switch: the host derived "on" from the width.
    const stored = fakeSync({ [WIDTH]: 960 });
    activate(80);
    await settle();
    expect(stored).toEqual({ [WIDTH]: 80, [SWITCH]: true });
    expect(chrome.storage.sync.set).toHaveBeenCalledTimes(1);

    updateGeminiEditInputWidthSettings({ widthPercent: 80 });
    await settle();
    expect(chrome.storage.sync.set).toHaveBeenCalledTimes(1);
  });

  it('never stores the switch on for a width the user left at the default', async () => {
    const stored = fakeSync({ [WIDTH]: 60 });
    activate(60);
    await settle();
    expect(stored).toEqual({ [WIDTH]: 60 });
    expect(chrome.storage.sync.set).not.toHaveBeenCalled();
  });

  it('drops a normalization read that the slider overtook instead of writing the old width over the new one', async () => {
    const reads = heldSyncReads();
    activate(80);
    expect(reads.pending()).toBe(1);
    updateGeminiEditInputWidthSettings({ widthPercent: 90 });
    expect(reads.pending()).toBe(2);

    // The first read answers from before the slider moved: an old 960 px width, no switch.
    await reads.answer(0, { [WIDTH]: 960 });
    expect(chrome.storage.sync.set).not.toHaveBeenCalled();
    await reads.answer(1, { [WIDTH]: 90, [SWITCH]: true });
    expect(chrome.storage.sync.set).not.toHaveBeenCalled();
  });

  it('drops a normalization read that a switch change overtook instead of turning the switch back on', async () => {
    const reads = heldSyncReads();
    activate(85);
    expect(reads.pending()).toBe(1);
    // The popup stores the switch off while the read is out; the plugin is still running.
    storageChange({ [SWITCH]: { newValue: false } }, 'sync');
    await reads.answer(0, { [WIDTH]: 85 });
    expect(chrome.storage.sync.set).not.toHaveBeenCalled();
    if (reads.pending() > 1) await reads.answer(1, { [WIDTH]: 85, [SWITCH]: false });
    expect(chrome.storage.sync.set).not.toHaveBeenCalled();
  });

  it('writes nothing after the plugin was torn down or the extension context died', async () => {
    let answer: (value: Record<string, unknown>) => void = () => {};
    vi.mocked(chrome.storage.sync.get).mockImplementation(
      (() => new Promise((resolve) => (answer = resolve))) as never,
    );
    activate(80);
    await scope.dispose();
    answer({ [WIDTH]: 960 });
    await settle();
    expect(chrome.storage.sync.set).not.toHaveBeenCalled();

    scope = new PluginScope();
    activate(80);
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
  });
});
