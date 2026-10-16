/**
 * The sidebar width builtin plugin's handler: the native module's rules
 * under a plugin scope, its in-place width updates, its teardown, and the
 * write-backs it keeps from the native module (with their boundaries).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { StorageKeys } from '@/core/types/common';
import { isCustomizedSidebarWidth, isSidebarWidthSwitchOn } from '@/core/utils/sidebarWidthValues';
import { PluginScope } from '@/features/plugins/runtime/pluginScope';

import {
  SIDEBAR_WIDTH_STYLE_ID,
  activateGeminiSidebarWidth,
  updateGeminiSidebarWidthSettings,
  planSidebarWidthWrites,
} from '../pluginHandler';

const STYLE_ID = SIDEBAR_WIDTH_STYLE_ID;
const WIDTH = StorageKeys.SIDEBAR_WIDTH;
const SWITCH = StorageKeys.SIDEBAR_WIDTH_ENABLED;

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
function activate(widthPx: unknown = 312): void {
  activateGeminiSidebarWidth(scope, { widthPx } as never);
}

describe('Gemini sidebar width plugin handler', () => {
  it.each([
    [undefined, false],
    [312, false],
    ['312', false],
    ['invalid', false],
    [400, true],
    ['400', true],
    [26, true],
    [null, true],
  ])('derives the native customized-width switch for %s as %s', (width, customized) => {
    expect(isCustomizedSidebarWidth(width)).toBe(customized);
    const input = {
      storedSwitch: undefined,
      storedWidth: width,
      switchChangedLive: false,
      widthChangedLive: false,
    };
    expect(isSidebarWidthSwitchOn(input)).toBe(customized);
    expect(isSidebarWidthSwitchOn({ ...input, storedSwitch: false })).toBe(false);
    expect(isSidebarWidthSwitchOn({ ...input, storedSwitch: true })).toBe(true);
    expect(isSidebarWidthSwitchOn({ ...input, switchChangedLive: true })).toBe(false);
    expect(isSidebarWidthSwitchOn({ ...input, widthChangedLive: true })).toBe(false);
  });

  it('preserves legacy percentages and numeric-string storage unless native clamping changes the number', () => {
    expect(planSidebarWidthWrites({ [WIDTH]: 26 }, { firstRead: true })).toEqual({
      [SWITCH]: true,
    });
    expect(planSidebarWidthWrites({ [WIDTH]: '420' }, { firstRead: false })).toBeNull();
    expect(planSidebarWidthWrites({ [WIDTH]: '600' }, { firstRead: false })).toEqual({
      [WIDTH]: 540,
    });
    expect(planSidebarWidthWrites({ [WIDTH]: 'invalid' }, { firstRead: true })).toBeNull();
  });

  beforeEach(() => {
    document.head.innerHTML = '';
    document.body.innerHTML = '<main></main>';
    fakeSync({ [WIDTH]: 540, [SWITCH]: true });
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

  it.each([
    [undefined, '312px'],
    ['wide', '312px'],
    ['420', '420px'],
    [100, '180px'],
    [900, '540px'],
    [26, 'clamp(200px, 26vw, 800px)'],
    [10, 'clamp(200px, 15vw, 800px)'],
    [44.8, 'clamp(200px, 45vw, 800px)'],
  ])('preserves the native width interpretation of %s', (width, expected) => {
    activate(width);
    expect(getInjectedStyle().textContent).toContain(`--bard-sidenav-open-width: ${expected}`);
  });

  it('updates the sheet in place and removes styles and listeners on each off→on cycle', async () => {
    const eventTarget: EventTarget = window;
    const added = vi.spyOn(eventTarget, 'addEventListener');
    const removed = vi.spyOn(eventTarget, 'removeEventListener');
    activate(400);
    const style = getInjectedStyle();
    updateGeminiSidebarWidthSettings({ widthPx: 500 });
    expect(getInjectedStyle()).toBe(style);
    expect(style.textContent).toContain('--bard-sidenav-open-width: 500px');
    const listeners = added.mock.calls.filter(([type]) => type === 'pointerdown');
    expect(listeners).toHaveLength(2);
    await scope.dispose();
    expect(document.getElementById(STYLE_ID)).toBeNull();
    for (const [type, listener, options] of listeners) {
      expect(removed).toHaveBeenCalledWith(type, listener, options);
    }
    updateGeminiSidebarWidthSettings({ widthPx: 450 });
    expect(document.getElementById(STYLE_ID)).toBeNull();
    scope = new PluginScope();
    activate(450);
    expect(document.querySelectorAll(`#${STYLE_ID}`)).toHaveLength(1);
    expect(added.mock.calls.filter(([type]) => type === 'pointerdown')).toHaveLength(4);
  });

  it('records a derived-on switch and clamps an out-of-range width once', async () => {
    // A customized width and no switch: the host derived "on" from the width.
    const stored = fakeSync({ [WIDTH]: 600 });
    activate(540);
    await settle();
    expect(stored).toEqual({ [WIDTH]: 540, [SWITCH]: true });
    expect(chrome.storage.sync.set).toHaveBeenCalledTimes(1);

    updateGeminiSidebarWidthSettings({ widthPx: 540 });
    await settle();
    expect(chrome.storage.sync.set).toHaveBeenCalledTimes(1);
  });

  it('never stores the switch on for a width the user left at the default', async () => {
    const stored = fakeSync({ [WIDTH]: 312 });
    activate(312);
    await settle();
    expect(stored).toEqual({ [WIDTH]: 312 });
    expect(chrome.storage.sync.set).not.toHaveBeenCalled();
  });

  it('drops a normalization read that the slider overtook instead of writing the old width over the new one', async () => {
    const reads = heldSyncReads();
    activate(540);
    expect(reads.pending()).toBe(1);
    updateGeminiSidebarWidthSettings({ widthPx: 500 });
    expect(reads.pending()).toBe(2);

    // The first read answers from before the slider moved: an out-of-range width, no switch.
    await reads.answer(0, { [WIDTH]: 600 });
    expect(chrome.storage.sync.set).not.toHaveBeenCalled();
    await reads.answer(1, { [WIDTH]: 500, [SWITCH]: true });
    expect(chrome.storage.sync.set).not.toHaveBeenCalled();
  });

  it('drops a normalization read that a switch change overtook instead of turning the switch back on', async () => {
    const reads = heldSyncReads();
    activate(420);
    expect(reads.pending()).toBe(1);
    // The popup stores the switch off while the read is out; the plugin is still running.
    storageChange({ [SWITCH]: { newValue: false } }, 'sync');
    await reads.answer(0, { [WIDTH]: 420 });
    expect(chrome.storage.sync.set).not.toHaveBeenCalled();
    if (reads.pending() > 1) await reads.answer(1, { [WIDTH]: 420, [SWITCH]: false });
    expect(chrome.storage.sync.set).not.toHaveBeenCalled();
  });

  it('a live switch removal is not turned back on while the host has not torn the plugin down', async () => {
    // A pre-switch customized width: the first read records the derived on.
    const stored = fakeSync({ [WIDTH]: 420 });
    activate(420);
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
    activate(420);
    expect(reads.pending()).toBe(1);
    storageChange({ [SWITCH]: { newValue: undefined } }, 'sync');
    expect(reads.pending()).toBe(2);
    // Both reads see a missing switch beside a customized width; neither may record it as on.
    await reads.answer(0, { [WIDTH]: 420 });
    await reads.answer(1, { [WIDTH]: 420 });
    expect(chrome.storage.sync.set).not.toHaveBeenCalled();
  });

  it('writes nothing after the plugin was torn down or the extension context died', async () => {
    let answer: (value: Record<string, unknown>) => void = () => {};
    vi.mocked(chrome.storage.sync.get).mockImplementation(
      (() => new Promise((resolve) => (answer = resolve))) as never,
    );
    activate(540);
    await scope.dispose();
    answer({ [WIDTH]: 600 });
    await settle();
    expect(chrome.storage.sync.set).not.toHaveBeenCalled();

    scope = new PluginScope();
    activate(540);
    const runtime = chrome.runtime as { id?: string };
    const id = runtime.id;
    runtime.id = undefined;
    try {
      answer({ [WIDTH]: 600 });
      await settle();
      expect(chrome.storage.sync.set).not.toHaveBeenCalled();
    } finally {
      runtime.id = id;
    }
  });
});
