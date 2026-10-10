import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { toastDriver } from '@/tests/toastDriver';

import type { ExportMessage, ExportMessageRole } from '../conversationCollector';
import {
  type ExportSelectionSessionOptions,
  startExportSelectionSession,
} from '../exportSelectionSession';

const t = (key: string) => `T:${key}`;

function message(messageId: string, role: ExportMessageRole): ExportMessage {
  const hostElement = document.createElement('div');
  hostElement.dataset.testMessage = messageId;
  document.body.appendChild(hostElement);
  return { messageId, role, hostElement, text: messageId, starred: false };
}

function start(overrides: Partial<ExportSelectionSessionOptions> = {}) {
  const messages = [message('1:u', 'user'), message('1:a', 'assistant'), message('2:u', 'user')];
  const options: ExportSelectionSessionOptions = {
    t,
    abortExport: vi.fn(),
    readMessages: () => messages,
    initialSelectedMessageId: null,
    anchors: { topUserElement: () => null, conversationRoot: () => document.body },
    isSameConversation: () => true,
    onConfirm: vi.fn(async () => {}),
    ...overrides,
  };
  const session = startExportSelectionSession(options);
  return { session, options, messages };
}

function barButton(action: string): HTMLButtonElement {
  const button = document.querySelector<HTMLButtonElement>(`[data-gv-export-action="${action}"]`);
  expect(button).not.toBeNull();
  return button!;
}

function selectedHostIds(): string[] {
  return Array.from(document.querySelectorAll<HTMLElement>('.gv-export-msg-selected')).map(
    (host) => host.dataset.testMessage!,
  );
}

function expectSelectionUiRemoved(): void {
  expect(document.querySelector('[data-gv-export-select-bar="true"]')).toBeNull();
  expect(document.querySelector('.gv-export-msg-selector')).toBeNull();
  expect(document.querySelector('.gv-export-msg-host')).toBeNull();
  expect(document.body.classList.contains('gv-export-select-mode')).toBe(false);
}

describe('startExportSelectionSession', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  afterEach(() => {
    vi.useRealTimers();
    document.body.innerHTML = '';
    document.body.className = '';
  });

  it('shows translated role filters that select only that role and toggle off again', async () => {
    const { session } = start();

    expect(barButton('selectUser').textContent).toBe('T:export_select_mode_only_user');
    expect(barButton('selectAI').textContent).toBe('T:export_select_mode_only_ai');
    expect(document.querySelectorAll('.gv-export-select-role-btn')).toHaveLength(2);

    barButton('selectUser').click();
    await vi.waitFor(() => expect(selectedHostIds()).toEqual(['1:u', '2:u']));
    expect(barButton('selectUser').dataset.checked).toBe('true');
    expect(document.querySelector('[data-gv-export-selection-count="true"]')?.textContent).toBe(
      'T:export_select_mode_count',
    );

    barButton('selectAI').click();
    await vi.waitFor(() => expect(selectedHostIds()).toEqual(['1:a']));

    barButton('selectAI').click();
    await vi.waitFor(() => expect(selectedHostIds()).toEqual([]));
    session.cancel();
  });

  it('resolves unknown roles before applying a role filter', async () => {
    const messages = [message('a', 'unknown'), message('b', 'unknown')];
    const resolveRoles = vi.fn(
      async () =>
        new Map([
          ['a', 'user'],
          ['b', 'assistant'],
        ] as const),
    );
    const { session } = start({ readMessages: () => messages, resolveRoles });

    barButton('selectAI').click();

    await vi.waitFor(() => expect(selectedHostIds()).toEqual(['b']));
    expect(resolveRoles).toHaveBeenCalledWith(new Set(['a', 'b']));
    session.cancel();
  });

  it('tells the user why a role filter failed and leaves the selection usable', async () => {
    const messages = [message('a', 'unknown'), message('b', 'unknown')];
    const resolveRoles = vi.fn(async () => {
      throw new Error('chatgpt_export_conversation_changed');
    });
    const { session } = start({ readMessages: () => messages, resolveRoles });

    barButton('selectAI').click();

    await vi.waitFor(() =>
      expect(toastDriver.all()).toMatchObject([
        { message: 'T:export_error_refresh_retry', tone: 'error' },
      ]),
    );
    expect(selectedHostIds()).toEqual([]);
    expect(barButton('selectAI').disabled).toBe(false);
    session.cancel();
  });

  it('preselects the requested message and toggles messages by clicking them', () => {
    const { session, messages } = start({ initialSelectedMessageId: '1:a' });

    expect(selectedHostIds()).toEqual(['1:a']);
    expect(barButton('export').disabled).toBe(false);

    messages[0].hostElement.click();
    expect(selectedHostIds()).toEqual(['1:u', '1:a']);
    session.cancel();
  });

  it('cancel aborts the export, removes the UI and ends the session', async () => {
    const { session, options } = start();
    barButton('selectAll').click();
    expect(selectedHostIds()).toHaveLength(3);

    document.querySelector<HTMLButtonElement>('.gv-export-select-cancel-btn')!.click();

    await session.done;
    expect(options.abortExport).toHaveBeenCalledTimes(1);
    expect(options.onConfirm).not.toHaveBeenCalled();
    expectSelectionUiRemoved();
  });

  it('Escape cancels the session', async () => {
    const { session, options } = start();

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));

    await session.done;
    expect(options.abortExport).toHaveBeenCalledTimes(1);
    expectSelectionUiRemoved();
  });

  it('hands the selected ids to the export with the UI already removed', async () => {
    let finishExport: () => void = () => {};
    let takenIds: ReadonlySet<string> | null = null;
    let uiPresentWhenTaken = true;
    const onConfirm = vi.fn(async ({ takeSelection }) => {
      takenIds = takeSelection();
      uiPresentWhenTaken = document.querySelector('[data-gv-export-select-bar="true"]') !== null;
      await new Promise<void>((resolve) => {
        finishExport = resolve;
      });
    });
    const { session } = start({ onConfirm });
    let ended = false;
    void session.done.then(() => {
      ended = true;
    });

    barButton('selectUser').click();
    await vi.waitFor(() => expect(selectedHostIds()).toEqual(['1:u', '2:u']));
    barButton('export').click();

    await vi.waitFor(() => expect(onConfirm).toHaveBeenCalledTimes(1));
    expect(takenIds).toEqual(new Set(['1:u', '2:u']));
    expect(uiPresentWhenTaken).toBe(false);
    expectSelectionUiRemoved();
    await Promise.resolve();
    expect(ended).toBe(false);

    finishExport();
    await session.done;
  });

  it('keeps Export disabled while nothing is selected', () => {
    const { session, options } = start();

    expect(barButton('export').disabled).toBe(true);
    barButton('export').click();
    expect(options.onConfirm).not.toHaveBeenCalled();

    barButton('selectAll').click();
    expect(barButton('export').disabled).toBe(false);
    session.cancel();
  });

  it('picks up lazy-loaded messages and ends when the conversation changes', async () => {
    vi.useFakeTimers();
    const messages = [message('1:u', 'user')];
    let sameConversation = true;
    const { session, options } = start({
      readMessages: () => messages,
      isSameConversation: () => sameConversation,
    });
    barButton('selectAll').click();

    messages.push(message('1:a', 'assistant'));
    await vi.advanceTimersByTimeAsync(300);
    expect(selectedHostIds()).toEqual(['1:u', '1:a']);

    sameConversation = false;
    document.body.appendChild(document.createElement('div'));
    await vi.advanceTimersByTimeAsync(300);

    await session.done;
    expect(options.abortExport).toHaveBeenCalledTimes(1);
    expectSelectionUiRemoved();
  });
});
