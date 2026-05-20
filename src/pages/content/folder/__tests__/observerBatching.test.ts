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
  mutationBatchQueue: MutationRecord[];
  flushMutationBatch: () => void;
  scheduleMutationBatchFlush: () => void;
  scheduleConversationRemovalCheck: (conversationId: string) => void;
  makeConversationDraggable: (el: HTMLElement) => void;
  applyHideArchivedToConversation: (el: HTMLElement) => void;
  scheduleNativeConversationTitleSync: () => void;
};

function createConversationEl(hexId: string, title: string = 'Title'): HTMLElement {
  const row = document.createElement('div');
  row.setAttribute('data-test-id', 'conversation');
  row.setAttribute('jslog', `["c_${hexId}"]`);

  const link = document.createElement('a');
  link.href = `/app/${hexId}`;
  const titleEl = document.createElement('span');
  titleEl.className = 'conversation-title-text';
  titleEl.textContent = title;
  link.appendChild(titleEl);
  row.appendChild(link);

  return row;
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

    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy).toHaveBeenCalledWith(conv);
    expect(archivedSpy).toHaveBeenCalledTimes(1);
  });

  it('cancels removal when the same conversation is added AND removed in the same batch', () => {
    const removalSpy = vi.spyOn(typed, 'scheduleConversationRemovalCheck');

    const conv = createConversationEl('bbbbbbbb');
    typed.sidebarContainer!.appendChild(conv);

    typed.mutationBatchQueue.push(makeChildListMutation({ added: [conv] }));
    typed.mutationBatchQueue.push(makeChildListMutation({ removed: [conv] }));

    typed.flushMutationBatch();

    expect(removalSpy).not.toHaveBeenCalled();
  });

  it('protects against bulk removal when not in multi-select mode', () => {
    const removalSpy = vi.spyOn(typed, 'scheduleConversationRemovalCheck');

    const c1 = createConversationEl('cccccccc1');
    const c2 = createConversationEl('cccccccc2');
    const c3 = createConversationEl('cccccccc3');

    typed.isMultiSelectMode = false;
    typed.mutationBatchQueue.push(makeChildListMutation({ removed: [c1, c2, c3] }));

    typed.flushMutationBatch();

    expect(removalSpy).not.toHaveBeenCalled();
  });

  it('honors bulk removal in multi-select mode', () => {
    const removalSpy = vi.spyOn(typed, 'scheduleConversationRemovalCheck');

    const c1 = createConversationEl('dddddddd1');
    const c2 = createConversationEl('dddddddd2');

    typed.isMultiSelectMode = true;
    typed.mutationBatchQueue.push(makeChildListMutation({ removed: [c1, c2] }));

    typed.flushMutationBatch();

    expect(removalSpy).toHaveBeenCalledTimes(2);
    expect(removalSpy).toHaveBeenCalledWith('dddddddd1');
    expect(removalSpy).toHaveBeenCalledWith('dddddddd2');
  });

  it('skips removals when navigator.onLine is false at flush time but still processes additions', () => {
    const removalSpy = vi.spyOn(typed, 'scheduleConversationRemovalCheck');
    const draggableSpy = vi.spyOn(typed, 'makeConversationDraggable');

    const added = createConversationEl('eeeeeeee1');
    const removed = createConversationEl('eeeeeeee2');
    typed.sidebarContainer!.appendChild(added);

    typed.mutationBatchQueue.push(makeChildListMutation({ added: [added] }));
    typed.mutationBatchQueue.push(makeChildListMutation({ removed: [removed] }));

    Object.defineProperty(navigator, 'onLine', { value: false, configurable: true });
    typed.flushMutationBatch();

    expect(draggableSpy).toHaveBeenCalledWith(added);
    expect(removalSpy).not.toHaveBeenCalled();
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

  it('schedules only one microtask flush even across many observer ticks', async () => {
    const flushSpy = vi.spyOn(typed, 'flushMutationBatch');

    typed.scheduleMutationBatchFlush();
    typed.scheduleMutationBatchFlush();
    typed.scheduleMutationBatchFlush();

    await Promise.resolve(); // exit current task, microtask drains
    await Promise.resolve();

    expect(flushSpy).toHaveBeenCalledTimes(1);
  });

  it('clears the batch queue on destroy so a pending microtask does no work', async () => {
    const flushSpy = vi.spyOn(typed, 'flushMutationBatch');

    const conv = createConversationEl('ffffffff');
    typed.mutationBatchQueue.push(makeChildListMutation({ added: [conv] }));
    typed.scheduleMutationBatchFlush();

    manager!.destroy();
    manager = null;

    await Promise.resolve();
    await Promise.resolve();

    expect(flushSpy).not.toHaveBeenCalled();
  });
});
