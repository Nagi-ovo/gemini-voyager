// @vitest-environment-options { "url": "https://gemini.google.com/app" }
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import * as accounts from '@/core/services/AccountIsolationService';
import { confirmDriver } from '@/tests/confirmDriver';

import { ligatureIcon } from '../folder/selectionToolbar';
import { GeminiBatchDeleteSelection, type GeminiBatchDeleteOptions } from './geminiSelection';

vi.mock('@/utils/i18n', () => ({
  getTranslationSyncUnsafe: (key: string) => key,
  getTranslationSync: (key: string) => key,
}));

let selection: GeminiBatchDeleteSelection;
let sidebar: HTMLElement;
let panel: HTMLElement;
let account: HTMLElement;
let deleteConversation: ReturnType<
  typeof vi.fn<GeminiBatchDeleteOptions['menus']['deleteConversation']>
>;
let onExit: ReturnType<typeof vi.fn<() => void>>;
let notify: ReturnType<typeof vi.fn<GeminiBatchDeleteOptions['feedback']['showNotification']>>;

async function flush(): Promise<void> {
  for (let i = 0; i < 30; i++) await Promise.resolve();
}

function row(id: string): HTMLElement {
  const element = document.createElement('div');
  element.dataset.testId = 'conversation';
  element.setAttribute('jslog', `["c_${id}"]`);
  sidebar.appendChild(element);
  return element;
}

function confirm(): void {
  selection.nativeRows.enterMultiSelect('first');
  document.querySelector<HTMLButtonElement>('.gv-multi-select-delete-btn')!.click();
}

beforeEach(() => {
  vi.useFakeTimers();
  history.replaceState({}, '', '/app');
  sidebar = document.createElement('aside');
  panel = document.createElement('section');
  panel.attachShadow({ mode: 'open' });
  panel.innerHTML =
    '<span data-selection-count="true"></span><div data-multi-select-actions="true"></div>';
  account = document.createElement('button');
  account.dataset.email = 'first@example.com';
  document.body.append(sidebar, panel, account);
  deleteConversation = vi.fn().mockResolvedValue(true);
  onExit = vi.fn();
  notify = vi.fn();
  selection = new GeminiBatchDeleteSelection({
    runtime: { sidebar, panel },
    toolbar: { host: () => panel, placement: 'floating', icon: ligatureIcon },
    feedback: {
      showNotification: notify,
      showBatchDeleteProgress: vi.fn(),
      updateBatchDeleteProgress: vi.fn(),
      hideBatchDeleteProgress: vi.fn(),
    },
    menus: { deleteConversation },
    activation: () => 0,
    getContext: () => ({ isDestroyed: false, accountIsolationEnabled: false }),
    onEnter: vi.fn(),
    onExit,
  });
});

afterEach(async () => {
  selection.reset();
  await selection.stop();
  document.body.innerHTML = '';
  vi.restoreAllMocks();
  vi.clearAllTimers();
  vi.useRealTimers();
});

it('does no account scans or sidebar binding for page mutations while idle or selecting', async () => {
  const scan = vi.spyOn(accounts, 'detectAccountContextFromDocument');
  const rows = vi.spyOn(sidebar, 'querySelectorAll');
  for (const selecting of [false, true]) {
    if (selecting) selection.nativeRows.enterMultiSelect('first');
    scan.mockClear();
    rows.mockClear();
    account.textContent = selecting ? 'render again' : 'render';
    account.title = 'header';
    await vi.advanceTimersByTimeAsync(20);
    expect(scan).not.toHaveBeenCalled();
    expect(rows).not.toHaveBeenCalled();
  }
  // Rows still bind after a sidebar update, coalesced across mutation batches into one frame.
  rows.mockClear();
  const first = row('aaaabbbbccccdddd');
  await flush();
  row('1111222233334444');
  await flush();
  expect(rows).not.toHaveBeenCalled();
  await vi.advanceTimersByTimeAsync(20);
  expect(rows).toHaveBeenCalledTimes(1);
  first.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0 }));
  await vi.advanceTimersByTimeAsync(500);
  expect(selection.nativeRows.isSelected('c_aaaabbbbccccdddd')).toBe(true);
});

it('keeps confirmation and healthy deletions when a header temporarily loses its email', async () => {
  confirm();
  account.dataset.email = '';
  await flush();
  expect(confirmDriver.isOpen()).toBe(true);
  confirmDriver.answer('pm_delete');
  await flush();
  expect(deleteConversation).toHaveBeenCalledExactlyOnceWith('first', expect.any(AbortSignal));
  expect(notify).toHaveBeenCalledWith('batch_delete_success', 'success');
});

it('retains the last real email across a blank header and cancels when another account appears', async () => {
  confirm();
  account.dataset.email = '';
  await flush();
  expect(confirmDriver.isOpen()).toBe(true);
  account.dataset.email = 'second@example.com';
  await flush();
  expect(confirmDriver.isOpen()).toBe(false);
  expect(deleteConversation).not.toHaveBeenCalled();
});

it('stops account scans after confirmation is cancelled', async () => {
  confirm();
  confirmDriver.answer('pm_cancel');
  await flush();
  const scan = vi.spyOn(accounts, 'detectAccountContextFromDocument');
  account.textContent = 'render';
  await flush();
  expect(scan).not.toHaveBeenCalled();
});

it('invalidates a confirmation when dragging makes another chat the only selected row', async () => {
  confirm();
  selection.nativeRows.selectOnly('second');
  await flush();
  expect(confirmDriver.isOpen()).toBe(false);
  expect(selection.nativeRows.selectedIds()).toEqual(['second']);
  expect(deleteConversation).not.toHaveBeenCalled();
});

it('ignores Escape while idle and preserves folder overlays but handles the panel shadow Escape', () => {
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
  expect(onExit).not.toHaveBeenCalled();
  selection.nativeRows.enterMultiSelect('first');
  for (const name of ['gv-folder-menu', 'gv-folder-dialog-overlay', 'gv-color-picker-dialog']) {
    const overlay = document.createElement('div');
    overlay.className = name;
    document.body.appendChild(overlay);
    overlay.click();
    expect(selection.nativeRows.isMultiSelectMode()).toBe(true);
  }
  panel.shadowRoot!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
  expect(selection.nativeRows.isMultiSelectMode()).toBe(false);
});

it('accepts the first selection after the native owner resets an idle account switch', async () => {
  account.dataset.email = 'second@example.com';
  await flush();
  selection.reset();
  confirm();
  expect(confirmDriver.isOpen()).toBe(true);
  confirmDriver.answer('pm_delete');
  await flush();
  expect(deleteConversation).toHaveBeenCalledExactlyOnceWith('first', expect.any(AbortSignal));
});
