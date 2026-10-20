import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { toastDriver } from '@/tests/toastDriver';

import type { ExportMessage, ExportMessageRole } from '../conversationCollector';
import {
  type ExportSelectionConfirmation,
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
  expect(document.querySelector('.gv-export-msg-room')).toBeNull();
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

  const place = (host: HTMLElement, left: number, width: number) =>
    vi
      .spyOn(host, 'getBoundingClientRect')
      .mockReturnValue(DOMRect.fromRect({ x: left, y: 0, width, height: 40 }));
  const checkboxX = (host: HTMLElement) =>
    host.getBoundingClientRect().left +
    parseFloat(host.querySelector<HTMLElement>('.gv-export-msg-selector')!.style.left);

  it('puts every checkbox in one column when user bubbles start further right than responses', () => {
    const user = message('1:u', 'user');
    const assistant = message('1:a', 'assistant');
    place(user.hostElement, 731, 708);
    place(assistant.hostElement, 300, 1570);
    const root = document.createElement('div');
    place(root, 300, 1570);
    const { session } = start({
      readMessages: () => [user, assistant],
      anchors: { topUserElement: () => null, conversationRoot: () => root },
    });

    expect(checkboxX(user.hostElement)).toBe(checkboxX(assistant.hostElement));
    expect(checkboxX(assistant.hostElement)).toBe(308);
    session.cancel();
  });

  it("keeps the checkboxes off a reply's text when the conversation leaves a gutter beside it", () => {
    const user = message('1:u', 'user');
    const assistant = message('1:a', 'assistant');
    place(user.hostElement, 731, 708);
    place(assistant.hostElement, 300, 768);
    const root = document.createElement('div');
    place(root, 0, 1368);
    const { session } = start({
      readMessages: () => [user, assistant],
      anchors: { topUserElement: () => null, conversationRoot: () => root },
    });

    expect(checkboxX(user.hostElement)).toBe(checkboxX(assistant.hostElement));
    // 20px checkbox, 8px clear of the reply's left edge.
    expect(checkboxX(assistant.hostElement)).toBe(272);
    session.cancel();
  });

  /** Gemini: each turn is `content-visibility: auto` and its reply starts at the turn's edge. */
  const startInClippingTurns = () => {
    const root = document.createElement('div');
    place(root, 0, 1368);
    const turn = (msg: ExportMessage) => {
      const container = document.createElement('div');
      container.style.setProperty('content-visibility', 'auto');
      place(container, 300, 768);
      container.appendChild(msg.hostElement);
      root.appendChild(container);
    };
    const user = message('1:u', 'user');
    const assistant = message('1:a', 'assistant');
    turn(user);
    turn(assistant);
    document.body.appendChild(root);
    place(user.hostElement, 731, 337);
    place(assistant.hostElement, 300, 768);
    const { session } = start({
      readMessages: () => [user, assistant],
      anchors: { topUserElement: () => null, conversationRoot: () => root },
    });
    return { session, user: user.hostElement, assistant: assistant.hostElement };
  };

  it('keeps the checkbox inside the turn when the turn clips its paint', () => {
    const { session, user, assistant } = startInClippingTurns();

    expect(checkboxX(user)).toBe(checkboxX(assistant));
    expect(checkboxX(assistant)).toBe(308);
    session.cancel();
  });

  it("does not cover the reply's first characters when the turn clips its paint", async () => {
    const style = document.createElement('style');
    style.textContent = readFileSync(
      resolve(
        __dirname,
        '../../../../styles/contentStyle/210-export-dialog-options-and-selection.css',
      ),
      'utf8',
    );
    document.head.appendChild(style);
    const textStart = (host: HTMLElement) =>
      host.getBoundingClientRect().left + (parseFloat(getComputedStyle(host).paddingLeft) || 0);
    try {
      const { session, user, assistant } = startInClippingTurns();

      expect(textStart(assistant)).toBeGreaterThan(checkboxX(assistant) + 20);
      // The right-aligned user bubble already clears the column and keeps its layout.
      expect(textStart(user)).toBe(731);

      session.cancel();
      await session.done;
      // Nothing moves outside selection mode.
      expect(textStart(assistant)).toBe(300);
    } finally {
      style.remove();
    }
  });

  it('still uses the gutter when a clipping wrapper spans it', () => {
    const root = document.createElement('div');
    place(root, 0, 1368);
    const wrapper = document.createElement('div');
    wrapper.style.overflowX = 'hidden';
    place(wrapper, 0, 1368);
    const assistant = message('1:a', 'assistant');
    wrapper.appendChild(assistant.hostElement);
    root.appendChild(wrapper);
    document.body.appendChild(root);
    place(assistant.hostElement, 300, 768);
    const { session } = start({
      readMessages: () => [assistant],
      anchors: { topUserElement: () => null, conversationRoot: () => root },
    });

    expect(checkboxX(assistant.hostElement)).toBe(272);
    expect(assistant.hostElement.classList.contains('gv-export-msg-room')).toBe(false);
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

  it('checkbox clicks after Export do not change the exported selection', async () => {
    let takenIds: ReadonlySet<string> | null = null;
    let grantGesture: () => void = () => {};
    const onConfirm = vi.fn(async ({ takeSelection }: ExportSelectionConfirmation) => {
      await new Promise<void>((resolve) => {
        grantGesture = resolve;
      });
      takenIds = takeSelection();
    });
    const { session, messages } = start({ onConfirm, initialSelectedMessageId: '1:u' });

    barButton('export').click();
    await vi.waitFor(() => expect(onConfirm).toHaveBeenCalledTimes(1));
    messages[1].hostElement.click();
    document.querySelector<HTMLButtonElement>('.gv-export-msg-checkbox')!.click();
    barButton('selectAll').click();
    barButton('selectAI').click();
    expect(selectedHostIds()).toEqual(['1:u']);

    grantGesture();
    await session.done;
    expect(takenIds).toEqual(new Set(['1:u']));
  });

  it('a second Export click while the first is pending does not export again', async () => {
    const onConfirm = vi.fn(() => new Promise<void>(() => {}));
    const { session } = start({ onConfirm, initialSelectedMessageId: '1:u' });

    barButton('export').click();
    barButton('export').click();
    barButton('export').dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await vi.waitFor(() => expect(onConfirm).toHaveBeenCalled());
    await Promise.resolve();

    expect(onConfirm).toHaveBeenCalledTimes(1);
    session.cancel();
  });

  it('done does not resolve while the selection bar is still mounted', async () => {
    const onConfirm = vi.fn(async () => {});
    const { session } = start({ onConfirm, initialSelectedMessageId: '1:u' });
    let barMountedWhenDone: boolean | null = null;
    void session.done.then(() => {
      barMountedWhenDone = document.querySelector('[data-gv-export-select-bar="true"]') !== null;
    });

    barButton('export').click();
    await session.done;

    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(barMountedWhenDone).toBe(false);
    expectSelectionUiRemoved();
  });

  it('cancel during role resolution leaves no stuck busy state', async () => {
    const messages = [message('a', 'unknown'), message('b', 'unknown')];
    let finishRoles: (roles: ReadonlyMap<string, 'user' | 'assistant'>) => void = () => {};
    const resolveRoles = vi.fn(
      () =>
        new Promise<ReadonlyMap<string, 'user' | 'assistant'>>((resolve) => {
          finishRoles = resolve;
        }),
    );
    const { session, options } = start({ readMessages: () => messages, resolveRoles });

    barButton('selectAI').click();
    expect(barButton('selectAll').disabled).toBe(true);
    document.querySelector<HTMLButtonElement>('.gv-export-select-cancel-btn')!.click();
    await session.done;

    expect(options.abortExport).toHaveBeenCalledTimes(1);
    expectSelectionUiRemoved();
    finishRoles(new Map([['b', 'assistant']]));
    await Promise.resolve();
    expectSelectionUiRemoved();
    expect(selectedHostIds()).toEqual([]);
    expect(toastDriver.all()).toEqual([]);
  });

  it('an export aborted during role resolution removes the frozen bar', async () => {
    const controller = new AbortController();
    const messages = [message('a', 'unknown')];
    const resolveRoles = vi.fn(() => new Promise<ReadonlyMap<string, 'user'>>(() => {}));
    const { session } = start({
      readMessages: () => messages,
      resolveRoles,
      signal: controller.signal,
    });

    barButton('selectUser').click();
    expect(barButton('selectUser').disabled).toBe(true);
    controller.abort();

    await session.done;
    expectSelectionUiRemoved();
  });
});
