import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { FolderManager } from '../manager';
import type { FolderData } from '../types';

vi.mock('webextension-polyfill', () => ({
  default: {
    storage: {
      sync: { get: vi.fn(), set: vi.fn() },
      local: { get: vi.fn(), set: vi.fn() },
      onChanged: { addListener: vi.fn(), removeListener: vi.fn() },
    },
    runtime: { id: 'test-extension-id', lastError: null },
  },
}));

vi.mock('@/utils/i18n', () => ({
  getTranslationSync: (key: string) => key,
  getTranslationSyncUnsafe: (key: string) => key,
  initI18n: () => Promise.resolve(),
}));

vi.mock('../floatingPanel', () => ({
  mountFloatingPanel: vi.fn(() => ({ destroy: vi.fn(), update: vi.fn() })),
}));

type TestableManager = {
  data: FolderData;
  sidebarContainer: HTMLElement | null;
  hideArchivedConversations: boolean;
  isMultiSelectMode: boolean;
  selectedConversations: Set<string>;
  mutationBatchQueue: MutationRecord[];
  pendingRemovals: Map<string, number>;
  enhancementQueue: Set<HTMLElement>;
  legacyActionsProbe: { present: boolean; at: number } | null;
  flushMutationBatch: () => void;
  scheduleMutationBatchFlush: () => void;
  drainEnhancementQueue: (deadline?: IdleDeadline) => void;
  scheduleConversationRemovalCheck: (conversationId: string) => void;
  makeConversationDraggable: (el: HTMLElement) => void;
  applyHideArchivedToConversation: (el: HTMLElement) => void;
  getNativeConversationActionsContainer: (el: HTMLElement) => HTMLElement | null;
  isConversationInFolders: (conversationId: string) => boolean;
  scheduleNativeConversationTitleSync: () => void;
  setupConversationClickTracking: () => void;
};

function createConversationEl(
  hexId: string,
  title: string = 'Title',
  titleClassName: string = 'conversation-title-text',
): HTMLElement {
  const row = document.createElement('div');
  row.setAttribute('data-test-id', 'conversation');
  row.setAttribute('jslog', `["c_${hexId}"]`);

  const link = document.createElement('a');
  link.href = `/app/${hexId}`;
  const titleEl = document.createElement('span');
  titleEl.className = titleClassName;
  titleEl.textContent = title;
  link.appendChild(titleEl);
  row.appendChild(link);

  return row;
}

function createLr26ConversationEl(hexId: string, title: string): HTMLElement {
  return createConversationEl(hexId, title, 'title-text gds-body-s');
}

function dispatchDragStart(element: HTMLElement) {
  const transfer = {
    effectAllowed: '',
    setData: vi.fn(),
    setDragImage: vi.fn(),
  };
  const dragstart = new Event('dragstart', { bubbles: true, cancelable: true }) as DragEvent;
  Object.defineProperty(dragstart, 'dataTransfer', {
    value: transfer,
    configurable: true,
  });

  element.dispatchEvent(dragstart);

  return transfer;
}

function getJsonDragPayload(transfer: ReturnType<typeof dispatchDragStart>) {
  const payload = (transfer.setData.mock.calls as Array<[string, string]>).find(
    ([type]) => type === 'application/json',
  )?.[1];

  expect(payload).toBeTruthy();
  return JSON.parse(payload || '{}');
}

/**
 * Build a single MutationRecord-like object. jsdom's MutationRecord can't be
 * constructed directly, so we pass synthetic objects with the same shape into
 * `flushMutationBatch` — which only reads `type`, `addedNodes`, `removedNodes`.
 */
function makeChildListMutation(opts: {
  target?: Element;
  added?: Node[];
  removed?: Node[];
}): MutationRecord {
  const target = opts.target ?? document.body;
  const added = opts.added ?? [];
  const removed = opts.removed ?? [];

  const wrapNodeList = (nodes: Node[]): NodeList => {
    const arr = nodes.slice();
    const fakeList = {
      length: arr.length,
      item: (i: number) => arr[i] ?? null,
      forEach(cb: (n: Node, i: number, list: NodeList) => void) {
        arr.forEach((n, i) => cb(n, i, fakeList as unknown as NodeList));
      },
      [Symbol.iterator]: () => arr[Symbol.iterator](),
    };
    return fakeList as unknown as NodeList;
  };

  return {
    type: 'childList',
    target,
    addedNodes: wrapNodeList(added),
    removedNodes: wrapNodeList(removed),
    previousSibling: null,
    nextSibling: null,
    attributeName: null,
    attributeNamespace: null,
    oldValue: null,
  } as MutationRecord;
}

function makeCharacterDataMutation(target: Node): MutationRecord {
  return {
    ...makeChildListMutation({ target: target as Element }),
    type: 'characterData',
    target,
  } as MutationRecord;
}

function nextAnimationFrame(): Promise<void> {
  return new Promise((resolve) => requestAnimationFrame(() => resolve()));
}

describe('FolderManager — observer batching (issue #678)', () => {
  let manager: FolderManager | null = null;
  let typed: TestableManager;
  let onlineDescriptor: PropertyDescriptor | undefined;

  beforeEach(() => {
    manager = new FolderManager();
    typed = manager as unknown as TestableManager;

    const sidebar = document.createElement('div');
    sidebar.setAttribute('data-test-id', 'overflow-container');
    document.body.appendChild(sidebar);
    typed.sidebarContainer = sidebar;

    onlineDescriptor = Object.getOwnPropertyDescriptor(navigator, 'onLine');
    Object.defineProperty(navigator, 'onLine', { value: true, configurable: true });
  });

  afterEach(() => {
    manager?.destroy();
    manager = null;
    document.body.innerHTML = '';
    if (onlineDescriptor) {
      Object.defineProperty(navigator, 'onLine', onlineDescriptor);
    }
    vi.restoreAllMocks();
  });

  it('dedupes added conversations — one element added across multiple mutations is set up once', () => {
    const spy = vi.spyOn(typed, 'makeConversationDraggable');
    const archivedSpy = vi.spyOn(typed, 'applyHideArchivedToConversation');

    const conv = createConversationEl('aaaaaaaa');
    typed.sidebarContainer!.appendChild(conv);

    // Five mutations all referring to the same added conversation element.
    for (let i = 0; i < 5; i++) {
      typed.mutationBatchQueue.push(makeChildListMutation({ added: [conv] }));
    }
    typed.flushMutationBatch();
    typed.drainEnhancementQueue();

    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy).toHaveBeenCalledWith(conv);
    expect(archivedSpy).toHaveBeenCalledTimes(1);
  });

  it('does not treat a same-batch row replacement as conversation deletion', () => {
    const removalSpy = vi.spyOn(typed, 'scheduleConversationRemovalCheck');

    const conv = createConversationEl('bbbbbbbb');
    typed.sidebarContainer!.appendChild(conv);

    typed.mutationBatchQueue.push(makeChildListMutation({ added: [conv] }));
    typed.mutationBatchQueue.push(makeChildListMutation({ removed: [conv] }));

    typed.flushMutationBatch();

    expect(removalSpy).not.toHaveBeenCalled();
  });

  it('does not treat bulk sidebar re-rendering as conversation deletion', () => {
    const removalSpy = vi.spyOn(typed, 'scheduleConversationRemovalCheck');

    const c1 = createConversationEl('cccccccc1');
    const c2 = createConversationEl('cccccccc2');
    const c3 = createConversationEl('cccccccc3');

    typed.isMultiSelectMode = false;
    typed.mutationBatchQueue.push(makeChildListMutation({ removed: [c1, c2, c3] }));

    typed.flushMutationBatch();

    expect(removalSpy).not.toHaveBeenCalled();
  });

  it('does not infer deletion from DOM removal even in multi-select mode', () => {
    const removalSpy = vi.spyOn(typed, 'scheduleConversationRemovalCheck');

    const c1 = createConversationEl('dddddddd1');
    const c2 = createConversationEl('dddddddd2');

    typed.isMultiSelectMode = true;
    typed.mutationBatchQueue.push(makeChildListMutation({ removed: [c1, c2] }));

    typed.flushMutationBatch();

    expect(removalSpy).not.toHaveBeenCalled();
  });

  it('still processes additions while offline without inferring deletion', () => {
    const removalSpy = vi.spyOn(typed, 'scheduleConversationRemovalCheck');
    const draggableSpy = vi.spyOn(typed, 'makeConversationDraggable');

    const added = createConversationEl('eeeeeeee1');
    const removed = createConversationEl('eeeeeeee2');
    typed.sidebarContainer!.appendChild(added);

    typed.mutationBatchQueue.push(makeChildListMutation({ added: [added] }));
    typed.mutationBatchQueue.push(makeChildListMutation({ removed: [removed] }));

    Object.defineProperty(navigator, 'onLine', { value: false, configurable: true });
    typed.flushMutationBatch();
    typed.drainEnhancementQueue();

    expect(draggableSpy).toHaveBeenCalledWith(added);
    expect(removalSpy).not.toHaveBeenCalled();
  });

  it('schedules cleanup only after the user confirms native Delete', () => {
    const removalSpy = vi.spyOn(typed, 'scheduleConversationRemovalCheck');
    typed.setupConversationClickTracking();

    const conv = createConversationEl('abcddcba');
    const trigger = document.createElement('button');
    trigger.setAttribute('data-test-id', 'actions-menu-button');
    trigger.setAttribute('aria-haspopup', 'menu');
    trigger.setAttribute('aria-expanded', 'true');
    trigger.setAttribute('aria-controls', 'native-conversation-menu');
    conv.appendChild(trigger);
    typed.sidebarContainer!.appendChild(conv);

    trigger.click();

    const menu = document.createElement('gem-menu');
    menu.id = 'native-conversation-menu';
    const deleteItem = document.createElement('gem-menu-item');
    deleteItem.setAttribute('data-test-id', 'delete-button');
    deleteItem.textContent = 'Delete';
    menu.appendChild(deleteItem);
    document.body.appendChild(menu);

    deleteItem.click();

    expect(removalSpy).not.toHaveBeenCalled();

    const dialog = document.createElement('div');
    dialog.setAttribute('role', 'dialog');
    const confirmButton = document.createElement('button');
    confirmButton.setAttribute('data-test-id', 'confirm-delete-button');
    confirmButton.textContent = 'Delete';
    dialog.appendChild(confirmButton);
    document.body.appendChild(dialog);

    confirmButton.click();

    expect(removalSpy).toHaveBeenCalledTimes(1);
    expect(removalSpy).toHaveBeenCalledWith('abcddcba');
  });

  it('triggers native title sync when characterData mutations affect a conversation row', () => {
    const titleSpy = vi.spyOn(typed, 'scheduleNativeConversationTitleSync');
    typed.data = {
      folders: [
        {
          id: 'f1',
          name: 'Test',
          parentId: null,
          isExpanded: true,
          sortIndex: 0,
          createdAt: 0,
          updatedAt: 0,
        },
      ],
      folderContents: {
        f1: [
          {
            conversationId: 'eeeeeeee',
            title: 'old',
            url: 'https://gemini.google.com/app/eeeeeeee',
            addedAt: 0,
            lastOpenedAt: 0,
            sortIndex: 0,
          },
        ],
      },
    };

    const conv = createConversationEl('eeeeeeee', 'old');
    typed.sidebarContainer!.appendChild(conv);
    const titleText = conv.querySelector('.conversation-title-text')!.firstChild!;

    typed.mutationBatchQueue.push(makeCharacterDataMutation(titleText));
    typed.flushMutationBatch();

    expect(titleSpy).toHaveBeenCalledTimes(1);
  });

  it('uses lr26 title-text when dragging a native conversation into folders', () => {
    const conv = createLr26ConversationEl('1234abcd', 'Quarterly planning notes');
    typed.sidebarContainer!.appendChild(conv);
    typed.makeConversationDraggable(conv);

    const payload = getJsonDragPayload(dispatchDragStart(conv));

    expect(payload).toMatchObject({
      conversationId: 'c_1234abcd',
      title: 'Quarterly planning notes',
      url: expect.stringContaining('/app/1234abcd'),
    });
  });

  it('uses lr26 title-text for every selected native conversation drag payload', () => {
    const first = createLr26ConversationEl('aaaabbbb', 'First selected chat');
    const second = createLr26ConversationEl('ccccdddd', 'Second selected chat');
    typed.sidebarContainer!.append(first, second);
    typed.makeConversationDraggable(first);
    typed.makeConversationDraggable(second);
    typed.selectedConversations = new Set(['c_aaaabbbb', 'c_ccccdddd']);

    const payload = getJsonDragPayload(dispatchDragStart(first));

    expect(payload.title).toBe('2 conversations');
    expect(payload.conversations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          conversationId: 'c_aaaabbbb',
          title: 'First selected chat',
        }),
        expect.objectContaining({
          conversationId: 'c_ccccdddd',
          title: 'Second selected chat',
        }),
      ]),
    );
  });

  it('schedules only one animation-frame flush even across many observer ticks', async () => {
    const flushSpy = vi.spyOn(typed, 'flushMutationBatch');

    typed.scheduleMutationBatchFlush();
    typed.scheduleMutationBatchFlush();
    typed.scheduleMutationBatchFlush();

    await nextAnimationFrame();

    expect(flushSpy).toHaveBeenCalledTimes(1);
  });

  it('clears the batch queue on destroy so a pending animation-frame flush does no work', async () => {
    const flushSpy = vi.spyOn(typed, 'flushMutationBatch');

    const conv = createConversationEl('ffffffff');
    typed.mutationBatchQueue.push(makeChildListMutation({ added: [conv] }));
    typed.scheduleMutationBatchFlush();

    manager!.destroy();
    manager = null;

    await nextAnimationFrame();

    expect(flushSpy).not.toHaveBeenCalled();
  });

  it('skips archived-folder lookup for added conversations when hide archived is off', () => {
    const archivedLookupSpy = vi.spyOn(typed, 'isConversationInFolders');

    typed.hideArchivedConversations = false;
    const conv = createConversationEl('99999999');
    typed.sidebarContainer!.appendChild(conv);

    typed.mutationBatchQueue.push(makeChildListMutation({ added: [conv] }));
    typed.flushMutationBatch();
    typed.drainEnhancementQueue();

    expect(archivedLookupSpy).not.toHaveBeenCalled();
  });

  describe('idle enhancement drain + legacy layout probe (issue #753)', () => {
    it('defers per-row enhancement work to the queue instead of running it inside the flush', () => {
      const spy = vi.spyOn(typed, 'makeConversationDraggable');

      const c1 = createConversationEl('aa11aa11');
      const c2 = createConversationEl('bb22bb22');
      typed.sidebarContainer!.append(c1, c2);

      typed.mutationBatchQueue.push(makeChildListMutation({ added: [c1, c2] }));
      typed.flushMutationBatch();

      expect(spy).not.toHaveBeenCalled();
      expect(typed.enhancementQueue.size).toBe(2);

      typed.drainEnhancementQueue();

      expect(spy).toHaveBeenCalledTimes(2);
      expect(typed.enhancementQueue.size).toBe(0);
    });

    it('schedules queued enhancement work with idle callback instead of animation frame', () => {
      const originalRequestIdleCallback = window.requestIdleCallback;
      const originalCancelIdleCallback = window.cancelIdleCallback;
      const requestIdleCallback = vi.fn(() => 123);
      const cancelIdleCallback = vi.fn();
      Object.defineProperty(window, 'requestIdleCallback', {
        configurable: true,
        value: requestIdleCallback,
      });
      Object.defineProperty(window, 'cancelIdleCallback', {
        configurable: true,
        value: cancelIdleCallback,
      });

      try {
        const rafSpy = vi.spyOn(window, 'requestAnimationFrame');
        const conv = createConversationEl('cc00cc00');
        typed.sidebarContainer!.appendChild(conv);

        typed.mutationBatchQueue.push(makeChildListMutation({ added: [conv] }));
        typed.flushMutationBatch();

        expect(requestIdleCallback).toHaveBeenCalledTimes(1);
        expect(rafSpy).not.toHaveBeenCalled();
      } finally {
        Object.defineProperty(window, 'requestIdleCallback', {
          configurable: true,
          value: originalRequestIdleCallback,
        });
        Object.defineProperty(window, 'cancelIdleCallback', {
          configurable: true,
          value: originalCancelIdleCallback,
        });
      }
    });

    it('stops draining when the idle budget is exhausted and resumes on the next pass', () => {
      const spy = vi.spyOn(typed, 'makeConversationDraggable');

      const rows = ['cc11cc11', 'cc22cc22', 'cc33cc33'].map((id) => createConversationEl(id));
      typed.sidebarContainer!.append(...rows);
      rows.forEach((row) => typed.enhancementQueue.add(row));

      // drainEnhancementQueue reads performance.now() once for the fallback deadline,
      // once inside the legacy-layout probe of the first row, then once for
      // the budget check — exceed the 8ms budget right after the first row.
      const ticks = [0, 0, 100];
      vi.spyOn(performance, 'now').mockImplementation(() =>
        ticks.length > 0 ? (ticks.shift() as number) : 100,
      );

      typed.drainEnhancementQueue();
      expect(spy).toHaveBeenCalledTimes(1);
      expect(typed.enhancementQueue.size).toBe(2);

      typed.drainEnhancementQueue();
      expect(spy).toHaveBeenCalledTimes(3);
      expect(typed.enhancementQueue.size).toBe(0);
    });

    it('uses the fallback budget when idle callback fires from timeout', () => {
      const spy = vi.spyOn(typed, 'makeConversationDraggable');
      const deadline = {
        didTimeout: true,
        timeRemaining: vi.fn(() => 0),
      } as unknown as IdleDeadline;

      const rows = ['ce11ce11', 'ce22ce22'].map((id) => createConversationEl(id));
      typed.sidebarContainer!.append(...rows);
      rows.forEach((row) => typed.enhancementQueue.add(row));

      const ticks = [0, 0, 100];
      vi.spyOn(performance, 'now').mockImplementation(() =>
        ticks.length > 0 ? (ticks.shift() as number) : 100,
      );

      typed.drainEnhancementQueue(deadline);

      expect(spy).toHaveBeenCalledTimes(1);
      expect(deadline.timeRemaining).not.toHaveBeenCalled();
      expect(typed.enhancementQueue.size).toBe(1);
    });

    it('keeps an explicit delete check pending across a transient row re-add', () => {
      const hexId = 'dd44dd44';
      const timerId = window.setTimeout(() => {}, 60_000);
      typed.pendingRemovals.set(hexId, timerId);

      const conv = createConversationEl(hexId);
      typed.sidebarContainer!.appendChild(conv);

      typed.mutationBatchQueue.push(makeChildListMutation({ added: [conv] }));
      typed.flushMutationBatch();

      expect(typed.pendingRemovals.has(hexId)).toBe(true);
      // The delayed check sees the visible row and safely keeps the folder
      // assignment. A transient re-add must not cancel a later confirmation
      // check before Gemini finishes its delete flow.
      expect(typed.enhancementQueue.size).toBe(1);
    });

    it('probes the legacy actions-container layout once and serves the cached miss per row', () => {
      const conv = createConversationEl('ee55ee55');
      typed.sidebarContainer!.appendChild(conv);

      typed.legacyActionsProbe = null;
      const querySpy = vi.spyOn(typed.sidebarContainer!, 'querySelector');

      expect(typed.getNativeConversationActionsContainer(conv)).toBeNull();
      expect(typed.getNativeConversationActionsContainer(conv)).toBeNull();

      const probeCalls = querySpy.mock.calls.filter(
        ([selector]) => selector === '.conversation-actions-container',
      );
      expect(probeCalls.length).toBe(1);
    });

    it('still clears leftover archived state in the legacy sibling layout (back-compat)', () => {
      typed.hideArchivedConversations = false;
      typed.legacyActionsProbe = null;

      const conv = createConversationEl('ff66ff66');
      const actions = document.createElement('div');
      actions.className = 'conversation-actions-container gv-conversation-archived-actions';
      typed.sidebarContainer!.append(conv, actions);

      typed.applyHideArchivedToConversation(conv);

      expect(actions.classList.contains('gv-conversation-archived-actions')).toBe(false);
      expect(conv.classList.contains('gv-conversation-archived')).toBe(false);
    });
  });
});
