/** Input start points retain their page coordinator and independent public-collapse setting. */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { CleanupPositions } from '@/core/types/cleanupPositions';
import { StorageKeys } from '@/core/types/common';
import type { PluginScope } from '@/features/plugins/runtime/pluginScope';

import { type LifecycleHarness, installLifecycleHarness } from './lifecycleHarness';

const COLLAPSED = 'gv-input-collapsed';
const STYLE_ID = 'gemini-voyager-input-collapse';
const WHEN_NOT_EMPTY = StorageKeys.INPUT_COLLAPSE_WHEN_NOT_EMPTY;
type Changes = Record<string, { newValue?: unknown }>;
let harness: LifecycleHarness;
const teardowns: Array<() => void> = [];

beforeEach(() => {
  vi.resetModules();
  vi.useFakeTimers();
  document.body.innerHTML = '';
  window.history.replaceState(null, '', '/app/abc123def456');
  harness = installLifecycleHarness();
});

afterEach(async () => {
  for (const teardown of teardowns.splice(0)) teardown();
  await vi.advanceTimersByTimeAsync(0);
  harness.restore();
  vi.useRealTimers();
  document.body.innerHTML = '';
  window.history.replaceState(null, '', '/');
});

async function settle(ms = 0): Promise<void> {
  await vi.advanceTimersByTimeAsync(ms);
}

it('names a page send-key site only on the three supported composer hosts', async () => {
  const { sendKeySiteForHost } = await import('../inputStartup');
  expect(sendKeySiteForHost('gemini.google.com')).toBe('gemini');
  expect(sendKeySiteForHost('aistudio.google.com')).toBe('aistudio');
  expect(sendKeySiteForHost('aistudio.google.cn')).toBe('aistudio');
  for (const host of ['business.gemini.google', 'chatgpt.com', 'claude.ai', 'example.com']) {
    expect(sendKeySiteForHost(host), host).toBeNull();
  }
});

it('tears the page send coordinator down on handoff and ignores late mode registrations', async () => {
  harness.storage.sync.set(StorageKeys.CTRL_ENTER_SEND, true);
  const container = document.createElement('div');
  container.className = 'text-input-field';
  const input = document.createElement('div');
  input.setAttribute('contenteditable', 'true');
  const button = document.createElement('button');
  button.setAttribute('aria-label', 'Send message');
  Object.defineProperty(button, 'offsetParent', { configurable: true, value: document.body });
  container.append(input, button);
  document.body.append(container);
  const click = vi.spyOn(button, 'click');
  const press = () => {
    const event = new KeyboardEvent('keydown', {
      key: 'Enter',
      ctrlKey: true,
      bubbles: true,
      cancelable: true,
    });
    input.dispatchEvent(event);
    return event.defaultPrevented;
  };
  const { CleanupManager } = await import('@/core/utils/cleanupManager');
  const { claimContentScript } = await import('../contentScriptHandoff');
  const { startPageSendKeys } = await import('../inputStartup');
  const { getSendKeyCoordinator } =
    await import('@/core/services/composer/sendKeys/sendKeyCoordinator');
  const cleanupManager = new CleanupManager();
  teardowns.push(() => cleanupManager.executeCleanups());
  teardowns.push(
    claimContentScript(
      () => cleanupManager.executeCleanups(),
      () => true,
    ),
  );
  startPageSendKeys('gemini.google.com', cleanupManager);
  const coordinator = getSendKeyCoordinator('gemini')!;
  cleanupManager.registerCleanupFunction(
    coordinator.registerMainMode({ source: 'test-plugin', mode: 'ctrlEnterSends' }),
    CleanupPositions.CleanupPluginHost,
  );
  await settle();
  expect(press()).toBe(true);
  expect(click).toHaveBeenCalledTimes(1);

  claimContentScript(
    () => {},
    () => false,
  )();
  expect(press()).toBe(false);
  coordinator.registerMainMode({ source: 'late-plugin', mode: 'ctrlEnterSends' });
  input.remove();
  container.prepend(input);
  await settle(200);
  expect(press()).toBe(false);
  expect(click).toHaveBeenCalledTimes(1);
  expect(harness.ledger.openStorageListeners()).toBe(0);
  expect(harness.ledger.openListeners()).toEqual([]);
  expect(harness.ledger.openObservers()).toEqual([]);
});

async function composer(content = 'draft'): Promise<HTMLElement> {
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

async function start(stored: Record<string, unknown> = {}) {
  for (const [key, value] of Object.entries(stored)) harness.storage.sync.set(key, value);
  const { CleanupManager } = await import('@/core/utils/cleanupManager');
  const { createOfficialAdmission } = await import('@/features/plugins/runtime/officialAdmission');
  const { createGeminiInputStartup } = await import('../inputStartup');
  const cleanupManager = new CleanupManager();
  teardowns.push(() => cleanupManager.executeCleanups());
  const admission = createOfficialAdmission();
  const startup = createGeminiInputStartup(admission, cleanupManager);
  const route = (changes: Changes, area: string) => startup.handleStorageChange(changes, area);
  chrome.storage.onChanged.addListener(route);
  cleanupManager.registerCleanupFunction(
    () => chrome.storage.onChanged.removeListener(route),
    CleanupPositions.RemoveStorageOnChangedListener,
  );
  return { cleanupManager, admission, startup, started: startup.startInputCollapse() };
}

const flip = (value: unknown, area: 'sync' | 'local' = 'sync') =>
  harness.emitStorageChange({ [WHEN_NOT_EMPTY]: { newValue: value } }, area);

function holdInitialRead(): (value: unknown) => void {
  let answer!: (value: Record<string, unknown>) => void;
  vi.mocked(chrome.storage.sync.get).mockImplementationOnce(
    () =>
      new Promise<Record<string, unknown>>((resolve) => {
        answer = resolve;
      }) as never,
  );
  return (value) => answer({ [WHEN_NOT_EMPTY]: value });
}

describe('the page collapse setting while its plugin is off', () => {
  it('public collapse gets its stored sub-setting and every sync change, including removal', async () => {
    const { collapseInput } = await import('../inputCollapse');
    const { started } = await start({ [WHEN_NOT_EMPTY]: true });
    await started;
    const container = await composer();
    expect(document.getElementById(STYLE_ID)).toBeNull();
    collapseInput();
    expect(container.classList.contains(COLLAPSED)).toBe(true);
    container.classList.remove(COLLAPSED);
    flip(false, 'local');
    collapseInput();
    expect(container.classList.contains(COLLAPSED)).toBe(true);
    container.classList.remove(COLLAPSED);
    flip(undefined);
    collapseInput();
    expect(container.classList.contains(COLLAPSED)).toBe(false);
    flip(true);
    collapseInput();
    expect(container.classList.contains(COLLAPSED)).toBe(true);
  });

  it('a live collapse-with-content change wins over an older held startup read', async () => {
    const { collapseInput } = await import('../inputCollapse');
    const answer = holdInitialRead();
    const { started } = await start();
    flip(true);
    answer(false);
    await started;
    const container = await composer();
    collapseInput();
    expect(container.classList.contains(COLLAPSED)).toBe(true);
  });

  it('a late startup read cannot change the public collapse setting after page teardown', async () => {
    const { collapseInput } = await import('../inputCollapse');
    const { setCollapseWhenNotEmpty } = await import('../inputCollapse/runtime');
    const answer = holdInitialRead();
    const { cleanupManager, started } = await start();
    cleanupManager.executeCleanups();
    setCollapseWhenNotEmpty(false);
    answer(true);
    await started;
    flip(true);
    const container = await composer();
    collapseInput();
    expect(container.classList.contains(COLLAPSED)).toBe(false);
    expect(harness.ledger.openStorageListeners()).toBe(0);
  });

  it('a retired input startup cannot admit collapse, drafts or history or change the public sub-setting', async () => {
    const { CleanupManager } = await import('@/core/utils/cleanupManager');
    const { createOfficialAdmission } =
      await import('@/features/plugins/runtime/officialAdmission');
    const { createGeminiInputStartup } = await import('../inputStartup');
    const { collapseInput } = await import('../inputCollapse');
    const cleanupManager = new CleanupManager();
    const admission = createOfficialAdmission();
    const startup = createGeminiInputStartup(admission, cleanupManager);
    cleanupManager.executeCleanups();
    await startup.startInputCollapse();
    await startup.startDraftSave();
    await startup.startPromptHistory();
    startup.handleStorageChange({ [WHEN_NOT_EMPTY]: { newValue: true } }, 'sync');
    admission.close();
    for (const id of [
      'voyager.gemini-input-collapse',
      'voyager.gemini-draft-save',
      'voyager.gemini-prompt-history',
    ])
      expect(admission.stateOf(id)).toBe('denied');
    const container = await composer();
    collapseInput();
    expect(container.classList.contains(COLLAPSED)).toBe(false);
  });
});

describe('the scoped collapse session retains the former native lifecycle guarantees', () => {
  async function mountScope(): Promise<PluginScope> {
    const { PluginScope } = await import('@/features/plugins/runtime/pluginScope');
    const { activateGeminiInputCollapse } = await import('../inputCollapse/pluginHandler');
    const scope = new PluginScope();
    activateGeminiInputCollapse(scope, { collapseWhenNotEmpty: false });
    teardowns.push(() => void scope.dispose());
    document.body.appendChild(document.createElement('span'));
    await settle(100);
    return scope;
  }

  function blur(container: HTMLElement): void {
    const event = new Event('focusout', { bubbles: true });
    Object.defineProperty(event, 'relatedTarget', { value: null });
    container.dispatchEvent(event);
  }

  it('does not collapse after the plugin turns off while a collapse is queued', async () => {
    const container = await composer('');
    const scope = await mountScope();
    container.classList.remove(COLLAPSED);
    blur(container);
    await settle(100);
    await scope.dispose();
    await settle(500);
    expect(container.classList.contains(COLLAPSED)).toBe(false);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('five plugin reopens leave no collapse DOM, timers or listeners after stop', async () => {
    const container = await composer('');
    for (let round = 0; round < 5; round++) {
      const scope = await mountScope();
      blur(container);
      await settle(100);
      await scope.dispose();
      expect(document.getElementById(STYLE_ID)).toBeNull();
    }
    expect(harness.ledger.openListeners()).toEqual([]);
    expect(harness.ledger.openObservers()).toEqual([]);
    expect(harness.ledger.openStorageListeners()).toBe(0);
    expect(vi.getTimerCount()).toBe(0);
    expect(container.classList.contains(COLLAPSED)).toBe(false);
  });
});
