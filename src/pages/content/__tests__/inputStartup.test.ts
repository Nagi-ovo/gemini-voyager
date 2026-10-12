/**
 * The input chain start points on the content script's real wiring: the page
 * send-key coordinator created before anything registers on it, and the
 * native input collapse following its popup switch through the content
 * script's storage router while the native module owns it.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { CleanupPositions } from '@/core/types/cleanupPositions';
import { StorageKeys } from '@/core/types/common';

import { type LifecycleHarness, installLifecycleHarness } from './lifecycleHarness';

const COLLAPSED = 'gv-input-collapsed';
const STYLE_ID = 'gemini-voyager-input-collapse';
const ENABLED = StorageKeys.INPUT_COLLAPSE_ENABLED;
const WHEN_NOT_EMPTY = StorageKeys.INPUT_COLLAPSE_WHEN_NOT_EMPTY;

type Changes = Record<string, { newValue?: unknown }>;

let harness: LifecycleHarness;
/** Every page started here, torn down after its test even when an assertion failed first. */
let teardowns: Array<() => void> = [];

beforeEach(() => {
  vi.resetModules();
  vi.useFakeTimers();
  document.body.innerHTML = '';
  window.history.replaceState(null, '', '/app/abc123def456');
  harness = installLifecycleHarness();
});

afterEach(() => {
  for (const teardown of teardowns.splice(0)) teardown();
  harness.restore();
  vi.useRealTimers();
  document.body.innerHTML = '';
  window.history.replaceState(null, '', '/');
});

async function settle(ms = 0): Promise<void> {
  await vi.advanceTimersByTimeAsync(ms);
}

describe('sendKeySiteForHost', () => {
  it('names a send-key site only where the native send behavior mounts', async () => {
    const { sendKeySiteForHost } = await import('../inputStartup');
    expect(sendKeySiteForHost('gemini.google.com')).toBe('gemini');
    expect(sendKeySiteForHost('aistudio.google.com')).toBe('aistudio');
    expect(sendKeySiteForHost('aistudio.google.cn')).toBe('aistudio');
    for (const host of ['business.gemini.google', 'chatgpt.com', 'claude.ai', 'example.com']) {
      expect(sendKeySiteForHost(host), host).toBeNull();
    }
  });
});

describe('the page send-key coordinator', () => {
  function mountComposer(): { input: HTMLElement; button: HTMLButtonElement } {
    const container = document.createElement('div');
    container.className = 'text-input-field';
    const input = document.createElement('div');
    input.setAttribute('contenteditable', 'true');
    const button = document.createElement('button');
    button.setAttribute('aria-label', 'Send message');
    Object.defineProperty(button, 'offsetParent', { configurable: true, value: document.body });
    container.append(input, button);
    document.body.append(container);
    return { input, button };
  }

  function pressCtrlEnter(target: HTMLElement): KeyboardEvent {
    const event = new KeyboardEvent('keydown', {
      key: 'Enter',
      code: 'Enter',
      ctrlKey: true,
      bubbles: true,
      cancelable: true,
    });
    target.dispatchEvent(event);
    return event;
  }

  it('tears the send coordinator down on content-script handoff', async () => {
    harness.storage.sync.set(StorageKeys.CTRL_ENTER_SEND, true);
    const { input, button } = mountComposer();
    const click = vi.spyOn(button, 'click');
    const { CleanupManager } = await import('@/core/utils/cleanupManager');
    const { claimContentScript } = await import('../contentScriptHandoff');
    const { mountNativeFeature } = await import('../featureLifecycle');
    const { startPageSendKeys } = await import('../inputStartup');
    const { NATIVE_FEATURES } = await import('../nativeFeatures');

    // As index.tsx starts: claim the page, then the coordinator before any registrant.
    const cleanupManager = new CleanupManager();
    teardowns.push(() => cleanupManager.executeCleanups());
    teardowns.push(
      claimContentScript(
        () => cleanupManager.executeCleanups(),
        () => true,
      ),
    );
    startPageSendKeys('gemini.google.com', cleanupManager);
    await mountNativeFeature(cleanupManager, NATIVE_FEATURES.sendBehaviorGemini);
    await settle();
    expect(pressCtrlEnter(input).defaultPrevented).toBe(true);
    expect(click).toHaveBeenCalledTimes(1);

    // The retired copy's initialization, still in flight: a send start whose
    // switch read is out when the handoff lands.
    const syncGet = vi.mocked(chrome.storage.sync.get);
    const read = syncGet.getMockImplementation() as (...args: unknown[]) => unknown;
    let answerRead: () => void = () => {};
    syncGet.mockImplementationOnce(((...args: unknown[]) => {
      answerRead = () => void read(...args);
      return new Promise(() => {});
    }) as never);
    const inFlight = mountNativeFeature(cleanupManager, NATIVE_FEATURES.sendBehaviorGemini);

    // A re-injected copy claims the page and retires this one (its own claim is not under test).
    claimContentScript(
      () => {},
      () => false,
    )();
    answerRead();
    await inFlight;

    expect(pressCtrlEnter(input).defaultPrevented).toBe(false);
    expect(click).toHaveBeenCalledTimes(1);
    expect(harness.ledger.openStorageListeners()).toBe(0);
    expect(harness.ledger.openListeners()).toEqual([]);
    expect(harness.ledger.openObservers()).toEqual([]);

    // Or it starts the send behavior only after the handoff, through the same
    // mount: its stop lands in a cleanup manager that already ran, so nothing
    // here stops it.
    await mountNativeFeature(cleanupManager, NATIVE_FEATURES.sendBehaviorGemini);
    await settle(200);
    input.remove();
    document.body.append(input);
    await settle(200);
    expect(pressCtrlEnter(input).defaultPrevented).toBe(false);
    expect(click).toHaveBeenCalledTimes(1);
    expect(harness.ledger.openListeners()).toEqual([]);
    expect(harness.ledger.openObservers()).toEqual([]);
    expect(harness.ledger.openStorageListeners()).toBe(0);
  });
});

describe('native input collapse at its start point', () => {
  /** A Gemini composer as the collapse finds it: a coloured flex island around the rich textarea. */
  async function mountComposer(content = ''): Promise<HTMLElement> {
    const container = document.createElement('div');
    container.style.backgroundColor = '#f0f0f0';
    container.style.display = 'flex';
    const textarea = document.createElement('rich-textarea');
    textarea.textContent = content;
    container.appendChild(textarea);
    document.body.appendChild(container);
    await settle(100);
    return container;
  }

  function blur(container: HTMLElement): void {
    const event = new Event('focusout', { bubbles: true });
    Object.defineProperty(event, 'relatedTarget', { value: null });
    container.dispatchEvent(event);
  }

  async function collapsesOnBlur(container: HTMLElement): Promise<boolean> {
    container.classList.remove(COLLAPSED);
    blur(container);
    await settle(300);
    return container.classList.contains(COLLAPSED);
  }

  /** Nudge the page so a session that just started finds the composer again. */
  async function rerender(): Promise<void> {
    document.body.appendChild(document.createElement('span'));
    await settle(100);
  }

  /** The content script's own wiring: owner gate, startup read, storage router, teardown. */
  async function startNative(
    stored: Record<string, unknown>,
    owner: 'legacy' | 'plugin' = 'legacy',
  ) {
    for (const [key, value] of Object.entries(stored)) harness.storage.sync.set(key, value);
    const { CleanupManager } = await import('@/core/utils/cleanupManager');
    const { createOfficialAdmission } =
      await import('@/features/plugins/runtime/officialAdmission');
    const { createGeminiInputStartup } = await import('../inputStartup');
    const cleanupManager = new CleanupManager();
    teardowns.push(() => cleanupManager.executeCleanups());
    const admission = createOfficialAdmission();
    const startup = createGeminiInputStartup(admission, cleanupManager, () => owner);
    const route = (changes: Changes, areaName: string): void =>
      startup.handleStorageChange(changes, areaName);
    chrome.storage.onChanged.addListener(route);
    cleanupManager.registerCleanupFunction(
      () => chrome.storage.onChanged.removeListener(route),
      CleanupPositions.RemoveStorageOnChangedListener,
    );
    const started = startup.startInputCollapse();
    return { cleanupManager, admission, started };
  }

  const flip = (changes: Changes): void => harness.emitStorageChange(changes, 'sync');

  it('turns input collapse off and on live from the popup switch while the native module owns it', async () => {
    const { cleanupManager, admission, started } = await startNative({ [ENABLED]: true });
    await started;
    admission.close();
    expect(admission.stateOf('voyager.gemini-input-collapse')).toBe('denied');
    const container = await mountComposer();
    expect(await collapsesOnBlur(container)).toBe(true);

    flip({ [ENABLED]: { newValue: false } });
    await settle();
    expect(document.getElementById(STYLE_ID)).toBeNull();
    expect(container.classList.contains(COLLAPSED)).toBe(false);
    expect(await collapsesOnBlur(container)).toBe(false);

    flip({ [ENABLED]: { newValue: true } });
    await settle();
    await rerender();
    expect(document.getElementById(STYLE_ID)).not.toBeNull();
    expect(await collapsesOnBlur(container)).toBe(true);

    cleanupManager.executeCleanups();
    expect(document.getElementById(STYLE_ID)).toBeNull();
    expect(harness.ledger.openStorageListeners()).toBe(0);
  });

  it.each([
    ['never stored', {}],
    ['stored off', { [ENABLED]: false }],
  ])('starts nothing while the switch is %s', async (_label, stored) => {
    const { cleanupManager, started } = await startNative(stored);
    await started;
    await mountComposer();
    expect(document.getElementById(STYLE_ID)).toBeNull();
    expect(harness.ledger.openListeners()).toEqual([]);
    expect(harness.ledger.openObservers()).toEqual([]);
    cleanupManager.executeCleanups();
  });

  it('follows the collapse-with-content switch live, also while collapse is off', async () => {
    const { cleanupManager, started } = await startNative({ [ENABLED]: false });
    await started;
    flip({ [WHEN_NOT_EMPTY]: { newValue: true } });
    flip({ [ENABLED]: { newValue: true } });
    await settle();
    const container = await mountComposer('draft');
    expect(await collapsesOnBlur(container)).toBe(true);

    // Removing the key reads as off, as the native listener always did.
    flip({ [WHEN_NOT_EMPTY]: { newValue: undefined } });
    expect(await collapsesOnBlur(container)).toBe(false);
    cleanupManager.executeCleanups();
  });

  it('keeps collapse-with-content current for the public collapse while the plugin owns collapse and it is off', async () => {
    const { collapseInput } = await import('../inputCollapse/index');
    const { cleanupManager, admission, started } = await startNative(
      { [ENABLED]: false, [WHEN_NOT_EMPTY]: true },
      'plugin',
    );
    await started;
    admission.close();
    const container = await mountComposer('draft');
    // Nothing mounted: the plugin is off and the native module does not run.
    expect(document.getElementById(STYLE_ID)).toBeNull();

    // The stored value reaches the page at startup ...
    collapseInput();
    expect(container.classList.contains(COLLAPSED)).toBe(true);

    // ... and a change made while the feature is off lands too.
    container.classList.remove(COLLAPSED);
    flip({ [WHEN_NOT_EMPTY]: { newValue: false } });
    collapseInput();
    expect(container.classList.contains(COLLAPSED)).toBe(false);
    cleanupManager.executeCleanups();
  });

  it('keeps a collapse-with-content change that lands while the startup read is in flight', async () => {
    const { cleanupManager, started } = await startNative({
      [ENABLED]: true,
      [WHEN_NOT_EMPTY]: false,
    });
    flip({ [WHEN_NOT_EMPTY]: { newValue: true } });
    await started;
    const container = await mountComposer('draft');
    expect(await collapsesOnBlur(container)).toBe(true);
    cleanupManager.executeCleanups();
  });

  it('turns input collapse off when its switch is removed and keeps it on for any other stored value', async () => {
    const { cleanupManager, started } = await startNative({ [ENABLED]: true });
    await started;
    for (const newValue of [null, 0, 'false']) {
      flip({ [ENABLED]: { newValue } });
      await settle();
      expect(document.getElementById(STYLE_ID), String(newValue)).not.toBeNull();
    }
    flip({ [ENABLED]: { newValue: undefined } });
    await settle();
    expect(document.getElementById(STYLE_ID)).toBeNull();
    cleanupManager.executeCleanups();
  });

  it('does not collapse after the popup switch turns it off while a collapse is queued', async () => {
    const { cleanupManager, started } = await startNative({ [ENABLED]: true });
    await started;
    const container = await mountComposer();

    blur(container);
    await settle(100); // the focusout delay is done; the 150ms collapse is queued
    flip({ [ENABLED]: { newValue: false } });
    await settle(500);

    expect(container.classList.contains(COLLAPSED)).toBe(false);
    expect(vi.getTimerCount()).toBe(0);
    cleanupManager.executeCleanups();
  });

  it('mounts nothing when the startup read lands after page teardown', async () => {
    let answer: (value: Record<string, unknown>) => void = () => {};
    vi.mocked(chrome.storage.sync.get).mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          answer = resolve;
        }) as never,
    );
    const { cleanupManager, started } = await startNative({});
    cleanupManager.executeCleanups();

    answer({ [ENABLED]: true });
    await started;
    await settle(200);

    expect(document.getElementById(STYLE_ID)).toBeNull();
    expect(harness.ledger.openListeners()).toEqual([]);
    expect(harness.ledger.openObservers()).toEqual([]);
    expect(harness.ledger.openStorageListeners()).toBe(0);
    flip({ [ENABLED]: { newValue: true } });
    await settle();
    expect(document.getElementById(STYLE_ID)).toBeNull();
  });

  it('mounts nothing when input collapse is started after page teardown', async () => {
    harness.storage.sync.set(ENABLED, true);
    const { CleanupManager } = await import('@/core/utils/cleanupManager');
    const { createOfficialAdmission } =
      await import('@/features/plugins/runtime/officialAdmission');
    const { createGeminiInputStartup } = await import('../inputStartup');
    const cleanupManager = new CleanupManager();
    const startup = createGeminiInputStartup(
      createOfficialAdmission(),
      cleanupManager,
      () => 'legacy',
    );
    cleanupManager.executeCleanups();
    teardowns.push(() => cleanupManager.executeCleanups());

    await startup.startInputCollapse();
    await settle(200);

    expect(document.getElementById(STYLE_ID)).toBeNull();
    expect(harness.ledger.openListeners()).toEqual([]);
    expect(harness.ledger.openStorageListeners()).toBe(0);
    startup.handleStorageChange({ [ENABLED]: { newValue: true } }, 'sync');
    await settle();
    expect(document.getElementById(STYLE_ID)).toBeNull();
  });

  it('stops input collapse without leaving a storage or language listener behind after five toggles', async () => {
    const { cleanupManager, started } = await startNative({ [ENABLED]: true });
    await started;
    const container = await mountComposer();

    for (let round = 1; round <= 5; round += 1) {
      flip({ [ENABLED]: { newValue: false } });
      await settle();
      expect(document.getElementById(STYLE_ID), `round ${round}`).toBeNull();
      flip({ [ENABLED]: { newValue: true } });
      await settle();
      await rerender();
      expect(document.getElementById(STYLE_ID), `round ${round}`).not.toBeNull();
      blur(container);
      await settle(100); // leave a collapse queued
    }

    cleanupManager.executeCleanups();
    expect(harness.ledger.openListeners()).toEqual([]);
    expect(harness.ledger.openObservers()).toEqual([]);
    expect(harness.ledger.openStorageListeners()).toBe(0);
    expect(vi.getTimerCount()).toBe(0);
    expect(container.classList.contains(COLLAPSED)).toBe(false);
    expect(document.getElementById(STYLE_ID)).toBeNull();
  });
});
