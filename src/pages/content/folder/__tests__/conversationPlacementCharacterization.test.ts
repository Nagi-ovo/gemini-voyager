/**
 * Pins how each Gemini entry point that adds or moves a conversation places it
 * today: dedupe, which buckets lose it, sortIndex, carried fields and side
 * effects. The S4 refactor routes all of them through one pure core and must
 * keep these results; deliberate behavior changes update a test on purpose.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { accountIsolationService } from '@/core/services/AccountIsolationService';
import { ROOT_CONVERSATIONS_ID } from '@/features/folder/constants';

import { FolderStore, type FolderStoreChange } from '../FolderStore';
import type { IFolderStorageAdapter } from '../storage/FolderStorageAdapter';
import type { ConversationReference, DragData, FolderData } from '../types';

const NOW = 1_700_000_000_000;

function folder(id: string) {
  return { id, name: id, parentId: null, isExpanded: true, createdAt: 1, updatedAt: 1 };
}

function ref(
  conversationId: string,
  extra: Partial<ConversationReference> = {},
): ConversationReference {
  return {
    conversationId,
    title: `Title ${conversationId}`,
    url: `https://gemini.google.com/app/${conversationId}`,
    addedAt: 10,
    ...extra,
  };
}

function data(folderIds: string[], contents: Record<string, ConversationReference[]>): FolderData {
  return { folders: folderIds.map(folder), folderContents: contents };
}

describe('Gemini conversation placement entry points', () => {
  let stored: FolderData;
  let adapter: IFolderStorageAdapter;
  let store: FolderStore;
  let onChange: ReturnType<typeof vi.fn<(reason: FolderStoreChange) => void>>;
  let onArchive: ReturnType<typeof vi.fn<() => void>>;

  async function mount(initial: FolderData): Promise<void> {
    stored = structuredClone(initial);
    await store.init();
    vi.mocked(adapter.saveData).mockClear();
    onChange.mockClear();
    onArchive.mockClear();
  }

  function ids(folderId: string): string[] {
    return (store.data.folderContents[folderId] ?? []).map((c) => c.conversationId);
  }

  function find(folderId: string, conversationId: string): ConversationReference | undefined {
    return store.data.folderContents[folderId]?.find((c) => c.conversationId === conversationId);
  }

  async function saves(): Promise<number> {
    await vi.advanceTimersByTimeAsync(0);
    return vi.mocked(adapter.saveData).mock.calls.length;
  }

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    vi.clearAllMocks();
    localStorage.clear();
    document.body.innerHTML = '';
    vi.spyOn(accountIsolationService, 'isIsolationEnabled').mockResolvedValue(false);
    vi.spyOn(console, 'log').mockImplementation(() => {});
    onChange = vi.fn<(reason: FolderStoreChange) => void>();
    onArchive = vi.fn<() => void>();
    adapter = {
      init: vi.fn(async () => {}),
      loadData: vi.fn(async () => structuredClone(stored)),
      saveData: vi.fn(async (_key: string, value: FolderData) => {
        stored = structuredClone(value);
        return true;
      }),
      removeData: vi.fn(async () => {}),
      getBackendName: () => 'test-memory',
    };
    store = new FolderStore(
      {
        getContext: () => ({ sidebar: null, sortMode: 'manual', enabled: true }),
        onChange,
        onArchive,
        onRecovery: vi.fn(),
      },
      adapter,
    );
  });

  afterEach(() => {
    store.destroy();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  describe('ensureConversationsInFolder (native row dropped at a position)', () => {
    it('appends new ids after the highest sortIndex, without saving or notifying', async () => {
      await mount(
        data(['f'], {
          f: [ref('a', { sortIndex: 4 }), ref('b'), ref('c', { sortIndex: 1 })],
        }),
      );
      const drag: DragData = {
        type: 'conversation',
        title: '3 conversations',
        conversations: [
          ref('n1', { title: '  Spaced  ', isGem: true, gemId: 'g' }),
          ref('a'),
          ref('n2', { title: 'Untitled', url: undefined as unknown as string }),
          ref('n1'),
        ],
      };

      store.ensureConversationsInFolder('f', drag);

      // Normalization on load seeded b's missing sortIndex by recency.
      expect(ids('f')).toEqual(['a', 'b', 'c', 'n1', 'n2']);
      expect(find('f', 'n1')).toEqual({
        conversationId: 'n1',
        title: 'Spaced',
        url: `https://gemini.google.com/app/n1`,
        addedAt: NOW,
        lastTurnAt: undefined,
        isGem: true,
        gemId: 'g',
        sortIndex: 5,
      });
      expect(find('f', 'n2')).toMatchObject({ title: 'Untitled', url: '', sortIndex: 6 });
      expect(await saves()).toBe(0);
      expect(onChange).not.toHaveBeenCalled();
    });

    it('creates a missing bucket and reads a single-conversation payload', async () => {
      await mount(data([], {}));
      store.ensureConversationsInFolder(ROOT_CONVERSATIONS_ID, {
        type: 'conversation',
        conversationId: 'x',
        title: 'X',
        url: 'https://gemini.google.com/app/x',
      });
      expect(store.data.folderContents[ROOT_CONVERSATIONS_ID]).toEqual([
        {
          conversationId: 'x',
          title: 'X',
          url: 'https://gemini.google.com/app/x',
          addedAt: NOW,
          lastTurnAt: undefined,
          isGem: undefined,
          gemId: undefined,
          sortIndex: 0,
        },
      ]);
    });

    it('positions the new row when followed by the reorder the drop performs', async () => {
      await mount(
        data(['f'], {
          f: [ref('a', { sortIndex: 0 }), ref('b', { sortIndex: 1 }), ref('c', { sortIndex: 2 })],
        }),
      );
      const drag: DragData = { type: 'conversation', conversationId: 'n', title: 'N' };
      store.ensureConversationsInFolder('f', drag);
      store.reorderOrMoveConversations(['n'], 'f', 'f', 1);

      expect(
        [...store.data.folderContents.f]
          .sort((x, y) => x.sortIndex! - y.sortIndex!)
          .map((c) => c.conversationId),
      ).toEqual(['a', 'n', 'b', 'c']);
      expect(await saves()).toBe(1);
    });
  });

  describe('addConversationToFolder (single native drag)', () => {
    it('appends after the highest sortIndex, saves, notifies and nudges', async () => {
      await mount(data(['f'], { f: [ref('a', { sortIndex: 2 })] }));

      store.addConversationToFolder('f', {
        type: 'conversation',
        conversationId: 'n',
        title: '',
        isGem: false,
      });

      expect(find('f', 'n')).toEqual({
        conversationId: 'n',
        title: 'Untitled',
        url: '',
        addedAt: NOW,
        lastTurnAt: undefined,
        isGem: false,
        gemId: undefined,
        sortIndex: 3,
      });
      expect(await saves()).toBe(1);
      expect(onChange).toHaveBeenCalledWith('data');
      expect(onArchive).toHaveBeenCalledTimes(1);
    });

    it('ignores a payload without a conversation id', async () => {
      await mount(data(['f'], { f: [] }));
      store.addConversationToFolder('f', { type: 'conversation', title: 'No id' });
      expect(store.data.folderContents.f).toEqual([]);
      expect(await saves()).toBe(0);
      expect(onChange).not.toHaveBeenCalled();
    });

    it('does nothing when the target already holds the exact id', async () => {
      await mount(data(['f', 's'], { f: [ref('a', { sortIndex: 0 })], s: [ref('a')] }));
      const before = structuredClone(store.data);

      store.addConversationToFolder('f', {
        type: 'conversation',
        conversationId: 'a',
        title: 'A',
        sourceFolderId: 's',
      });

      expect(store.data).toEqual(before);
      expect(await saves()).toBe(0);
      expect(onChange).not.toHaveBeenCalled();
      expect(onArchive).not.toHaveBeenCalled();
    });

    it('moves from a source folder without nudging', async () => {
      await mount(data(['f', 's'], { f: [], s: [ref('a', { starred: true }), ref('b')] }));

      store.addConversationToFolder('f', {
        type: 'conversation',
        conversationId: 'a',
        title: 'A',
        url: 'https://gemini.google.com/app/a',
        sourceFolderId: 's',
      });

      expect(ids('s')).toEqual(['b']);
      // Built from the payload, but the chat's star is the conversation's and travels.
      expect(find('f', 'a')).toMatchObject({ title: 'A', addedAt: NOW, sortIndex: 0 });
      expect(find('f', 'a')?.starred).toBe(true);
      expect(await saves()).toBe(1);
      expect(onChange).toHaveBeenCalledWith('data');
      expect(onArchive).not.toHaveBeenCalled();
    });
  });

  describe('addConversationsToFolder (multi-select or stored-row drag)', () => {
    it('carries every incoming field except addedAt and sortIndex', async () => {
      await mount(data(['f', 's'], { f: [ref('a', { sortIndex: 7 })], s: [] }));
      const incoming = ref('n', {
        title: 'Stored',
        starred: true,
        customTitle: true,
        lastOpenedAt: 50,
        lastTurnAt: 60,
        updatedAt: 70,
        sortIndex: 0,
        addedAt: 5,
      });

      store.addConversationsToFolder('f', [incoming], 's');

      expect(find('f', 'n')).toEqual({ ...incoming, addedAt: NOW, sortIndex: 8 });
      expect(find('f', 'n')).not.toBe(incoming);
    });

    it('resolves blank titles only for payloads from outside a folder', async () => {
      await mount(data(['f', 'g'], { f: [], g: [] }));
      store.addConversationsToFolder('f', [ref('x', { title: '' })]);
      store.addConversationsToFolder('g', [ref('y', { title: '' })], 'f');
      expect(find('f', 'x')?.title).toBe('Untitled');
      expect(find('g', 'y')?.title).toBe('');
    });

    it('removes moved ids from the source but keeps ids the target already held', async () => {
      await mount(
        data(['f', 's'], {
          f: [ref('a', { sortIndex: 0 })],
          s: [ref('a', { sortIndex: 0 }), ref('b', { sortIndex: 1 }), ref('c', { sortIndex: 2 })],
        }),
      );

      store.addConversationsToFolder('f', [ref('a'), ref('b'), ref('b')], 's');

      expect(ids('f')).toEqual(['a', 'b']);
      expect(find('f', 'b')?.sortIndex).toBe(1);
      expect(ids('s')).toEqual(['a', 'c']);
      expect(await saves()).toBe(1);
      expect(onChange).toHaveBeenCalledWith('data');
      expect(onArchive).not.toHaveBeenCalled();
    });

    it('nudges only for additions from outside a folder', async () => {
      await mount(data(['f'], { f: [] }));
      store.addConversationsToFolder(ROOT_CONVERSATIONS_ID, [ref('a'), ref('b')]);
      expect(ids(ROOT_CONVERSATIONS_ID)).toEqual(['a', 'b']);
      expect(onArchive).toHaveBeenCalledTimes(1);
    });

    it('saves and notifies even when every id was already there', async () => {
      await mount(data(['f'], { f: [ref('a', { sortIndex: 0 })] }));
      const before = structuredClone(store.data);
      store.addConversationsToFolder('f', [ref('a')]);
      expect(store.data).toEqual(before);
      expect(await saves()).toBe(1);
      expect(onChange).toHaveBeenCalledWith('data');
      expect(onArchive).not.toHaveBeenCalled();
    });

    it('completes a move whose source bucket is missing', async () => {
      await mount(data(['f', 's'], { f: [] }));
      delete store.data.folderContents.s;
      store.addConversationsToFolder('f', [ref('a')], 's');
      expect(ids('f')).toEqual(['a']);
      expect(await saves()).toBe(1);
      expect(onChange).toHaveBeenCalledWith('data');
    });

    it('leaves another spelling in the source when moving by id', async () => {
      await mount(data(['f', 's'], { f: [], s: [ref('c_abc', { sortIndex: 0 })] }));
      store.addConversationsToFolder('f', [ref('abc')], 's');
      expect(ids('f')).toEqual(['abc']);
      expect(ids('s')).toEqual(['c_abc']);
    });
  });

  describe('moveConversationToFolder (floating panel drag)', () => {
    it('appends the record after the target rows, keeping its fields with a fresh addedAt', async () => {
      const moving = ref('a', { sortIndex: 0, starred: true, lastOpenedAt: 9 });
      await mount(
        data(['s', 't'], {
          s: [moving, ref('b', { sortIndex: 1 })],
          t: [ref('c', { sortIndex: 0 }), ref('d', { sortIndex: 1 })],
        }),
      );
      const record = find('s', 'a')!;

      store.moveConversationToFolder('s', 't', record);

      expect(ids('s')).toEqual(['b']);
      expect(ids('t')).toEqual(['c', 'd', 'a']);
      // Its source index 0 would have tied with the target's first row.
      expect(find('t', 'a')).toEqual({ ...moving, addedAt: NOW, sortIndex: 2 });
      expect(find('t', 'a')).not.toBe(record);
      expect(await saves()).toBe(1);
      expect(onChange).toHaveBeenCalledWith('data');
      expect(onArchive).not.toHaveBeenCalled();
    });

    it('still removes the source copy when the target already holds the id', async () => {
      await mount(
        data(['s', 't'], {
          s: [ref('a', { sortIndex: 0, title: 'Source' })],
          t: [ref('a', { sortIndex: 3, title: 'Target' })],
        }),
      );
      store.moveConversationToFolder('s', 't', find('s', 'a')!);
      expect(ids('s')).toEqual([]);
      expect(store.data.folderContents.t).toEqual([ref('a', { sortIndex: 3, title: 'Target' })]);
    });

    it('creates a missing target bucket', async () => {
      await mount(data(['s'], { s: [ref('a', { sortIndex: 0 })] }));
      store.moveConversationToFolder('s', 'gone', find('s', 'a')!);
      expect(ids('gone')).toEqual(['a']);
    });
  });

  describe('addConversationToFolderFromNative (Move to folder menu, folder project)', () => {
    it('inserts at the top, shifting the bucket after seeding missing indices', async () => {
      await mount(
        data(['f'], {
          f: [ref('a', { sortIndex: 0 }), ref('b', { sortIndex: 1 })],
        }),
      );
      store.data.folderContents.f.push(ref('c', { addedAt: 99 })); // no sortIndex yet

      store.addConversationToFolderFromNative(
        'f',
        'n',
        'Native title',
        'https://gemini.google.com/app/n',
        true,
        'gem',
        123,
      );

      expect(
        Object.fromEntries(store.data.folderContents.f.map((c) => [c.conversationId, c.sortIndex])),
      ).toEqual({ a: 1, b: 2, c: 1, n: 0 });
      expect(find('f', 'n')).toEqual({
        conversationId: 'n',
        title: 'Native title',
        url: 'https://gemini.google.com/app/n',
        addedAt: NOW,
        lastOpenedAt: NOW,
        lastTurnAt: 123,
        isGem: true,
        gemId: 'gem',
        sortIndex: 0,
      });
      expect(await saves()).toBe(1);
      expect(onChange).toHaveBeenCalledWith('data');
      expect(onArchive).toHaveBeenCalledTimes(1);
    });

    it('ignores a folder that no longer exists, including the root bucket', async () => {
      await mount(data(['f'], { f: [] }));
      store.addConversationToFolderFromNative('gone', 'n', 'N', '/app/n');
      store.addConversationToFolderFromNative(ROOT_CONVERSATIONS_ID, 'n', 'N', '/app/n');
      expect(store.data.folderContents.gone).toBeUndefined();
      expect(store.data.folderContents[ROOT_CONVERSATIONS_ID]).toBeUndefined();
      expect(await saves()).toBe(0);
      expect(onChange).not.toHaveBeenCalled();
    });

    it('saves and notifies without nudging when the exact id is already there', async () => {
      await mount(data(['f'], { f: [ref('a', { sortIndex: 0 })] }));
      const before = structuredClone(store.data);
      store.addConversationToFolderFromNative('f', 'a', 'A', '/app/a');
      expect(store.data).toEqual(before);
      expect(await saves()).toBe(1);
      expect(onChange).toHaveBeenCalledWith('data');
      expect(onArchive).not.toHaveBeenCalled();
    });

    it('does not remove the conversation from its other folders', async () => {
      await mount(data(['f', 'g'], { f: [], g: [ref('a', { sortIndex: 0 })] }));
      store.addConversationToFolderFromNative('f', 'a', 'A', '/app/a');
      expect(ids('f')).toEqual(['a']);
      expect(ids('g')).toEqual(['a']);
    });
  });

  describe('a new placement under another spelling of a held conversation', () => {
    // f holds abc twice (bare and c_) and def under a synthetic id with its route URL.
    const held = () => [
      ref('c_abc', { sortIndex: 0 }),
      ref('abc', { sortIndex: 1 }),
      ref('conv_1', { url: 'https://gemini.google.com/app/def', sortIndex: 2 }),
    ];
    const entries: Array<[string, (id: string) => void]> = [
      [
        'ensureConversationsInFolder',
        (id) => store.ensureConversationsInFolder('f', { conversationId: id, title: id }),
      ],
      [
        'addConversationToFolder',
        (id) => store.addConversationToFolder('f', { conversationId: id, title: id }),
      ],
      ['addConversationsToFolder', (id) => store.addConversationsToFolder('f', [ref(id)])],
      [
        'moveConversationToFolder',
        (id) => store.moveConversationToFolder('s', 'f', find('s', id)!),
      ],
      [
        'addConversationToFolderFromNative',
        (id) => store.addConversationToFolderFromNative('f', id, id, `/app/${id}`),
      ],
    ];

    it.each(entries)('%s adds no row and keeps the existing duplicates', async (_name, place) => {
      await mount(data(['f', 's'], { f: held(), s: [ref('c_def'), ref('abc')] }));
      const before = structuredClone(store.data.folderContents.f);

      place('abc');
      place('c_def');

      expect(store.data.folderContents.f).toEqual(before);
    });

    it('still places a conversation no key matches', async () => {
      await mount(data(['f'], { f: held() }));
      store.addConversationToFolder('f', { conversationId: 'xyz', title: 'X' });
      expect(ids('f')).toEqual(['c_abc', 'abc', 'conv_1', 'xyz']);
    });
  });
});
