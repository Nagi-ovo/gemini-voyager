/**
 * A folder row drags its stored record, so every URL shape that storage can
 * hold (including imported protocol-relative and relative URLs) must keep the
 * row movable, alone or inside a multiselection.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { FolderImportExportService } from '@/features/folder/services/FolderImportExportService';

import type { ConversationReference, Folder } from '../types';
import { createFolderViewHarness, resetFolderViewBrowserMocks } from './folderViewHarness';
import { sidebarTree } from './sidebarTreeDriver';

vi.mock('webextension-polyfill', () => ({ default: chrome }));

vi.mock('@/utils/i18n', () => ({
  getTranslationSync: (key: string) => key,
  getTranslationSyncUnsafe: (key: string) => key,
  initI18n: () => Promise.resolve(),
}));

function folder(id: string, sortIndex: number): Folder {
  return {
    id,
    name: id,
    parentId: null,
    isExpanded: true,
    sortIndex,
    createdAt: 1,
    updatedAt: 1,
  };
}

function reference(hex: string, url: string | undefined, sortIndex: number): ConversationReference {
  const ref: ConversationReference = {
    conversationId: `c_${hex}`,
    title: `Conversation ${hex}`,
    url: url as string,
    addedAt: 1,
    sortIndex,
  };
  if (url === undefined) delete (ref as Partial<ConversationReference>).url;
  return ref;
}

function recordingTransfer(): DataTransfer & { stored: Map<string, string> } {
  const stored = new Map<string, string>();
  return {
    stored,
    types: ['application/json'],
    effectAllowed: 'all',
    dropEffect: 'none',
    getData: (type: string) => stored.get(type) ?? '',
    setData: (type: string, value: string) => stored.set(type, value),
    setDragImage: vi.fn(),
  } as unknown as DataTransfer & { stored: Map<string, string> };
}

function dragEvent(type: string, transfer: DataTransfer): DragEvent {
  const event = new Event(type, { bubbles: true, cancelable: true }) as DragEvent;
  Object.defineProperty(event, 'dataTransfer', { value: transfer, configurable: true });
  return event;
}

describe('dragging stored folder rows', () => {
  let harness: Awaited<ReturnType<typeof createFolderViewHarness>> | null = null;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    resetFolderViewBrowserMocks();
  });

  afterEach(() => {
    harness?.destroy();
    harness = null;
    document.body.innerHTML = '';
    localStorage.clear();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  const tree = () => sidebarTree(harness!.runtime.panel);

  /** The row of a conversation, found in whichever folder shows it. */
  function row(conversationId: string): HTMLElement {
    const element = Array.from(
      tree().root.querySelectorAll<HTMLElement>('[data-conversation-id]'),
    ).find((candidate) => candidate.dataset.conversationId === conversationId);
    expect(element).toBeDefined();
    return element!;
  }

  function folderHeader(folderId: string): HTMLElement {
    return tree().folderRow(folderId);
  }

  async function dragRowTo(conversationId: string, targetFolderId: string): Promise<void> {
    const transfer = recordingTransfer();
    row(conversationId).dispatchEvent(dragEvent('dragstart', transfer));
    expect(transfer.stored.get('application/json')).toBeTruthy();
    folderHeader(targetFolderId).dispatchEvent(dragEvent('drop', transfer));
    await vi.advanceTimersByTimeAsync(0);
  }

  it('moves an imported row whose URL is protocol-relative', async () => {
    const importedRef = {
      ...reference('abcdef1234567890', '//gemini.google.com/app/abcdef1234567890', 0),
      importedExtra: 'kept',
    };
    const exported = FolderImportExportService.exportToPayload({
      folders: [folder('source', 0), folder('target', 1)],
      folderContents: { source: [importedRef], target: [] },
    });
    const imported = await FolderImportExportService.importFromPayload(
      exported,
      { folders: [], folderContents: {} },
      { strategy: 'overwrite', createBackup: false },
    );
    expect(imported.success).toBe(true);
    if (!imported.success) return;
    const storedRef = imported.data.data.folderContents.source[0];
    expect(storedRef.url).toBe('//gemini.google.com/app/abcdef1234567890');

    harness = await createFolderViewHarness(imported.data.data);
    await vi.advanceTimersByTimeAsync(0);
    await dragRowTo(storedRef.conversationId, 'target');

    expect(harness.saved.folderContents.source).toEqual([]);
    expect(harness.saved.folderContents.target).toEqual([
      expect.objectContaining({
        conversationId: 'c_abcdef1234567890',
        title: storedRef.title,
        url: '//gemini.google.com/app/abcdef1234567890',
        importedExtra: 'kept',
      }),
    ]);
  });

  it('moves a multiselection that mixes every stored URL shape', async () => {
    const refs = [
      reference('1111', 'https://gemini.google.com/u/1/app/1111', 0),
      reference('2222', '//gemini.google.com/app/2222', 1),
      reference('3333', '/app/3333', 2),
      reference('4444', 'app/4444', 3),
      reference('5555', '', 4),
      reference('6666', undefined, 5),
    ];
    harness = await createFolderViewHarness({
      folders: [folder('source', 0), folder('target', 1)],
      folderContents: { source: refs.map((ref) => ({ ...ref })), target: [] },
    });
    await vi.advanceTimersByTimeAsync(0);

    // Long-press enters multi-select with the first row; clicks add the rest.
    row('c_1111').dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0 }));
    await vi.advanceTimersByTimeAsync(600);
    row('c_1111').dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
    for (const ref of refs.slice(1)) {
      tree()
        .titleButton('source', ref.title)
        .dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 }));
    }

    await dragRowTo('c_1111', 'target');

    expect(harness.saved.folderContents.source).toEqual([]);
    const moved = harness.saved.folderContents.target;
    expect(moved.map((ref) => ref.conversationId).sort()).toEqual(
      refs.map((ref) => ref.conversationId).sort(),
    );
    for (const ref of refs) {
      const stored = moved.find((item) => item.conversationId === ref.conversationId)!;
      expect(stored.url).toBe(ref.url);
      expect('url' in stored).toBe('url' in ref);
    }
  });
});
