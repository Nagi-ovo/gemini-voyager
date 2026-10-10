import { type Mock, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { accountIsolationService } from '@/core/services/AccountIsolationService';

import { FolderStore } from '../FolderStore';
import { createLegacyFolderCommands } from '../legacyFolderCommands';
import type { IFolderStorageAdapter } from '../storage/FolderStorageAdapter';
import type { ConversationReference, FolderData } from '../types';

vi.mock('webextension-polyfill', () => ({
  default: {
    storage: {
      sync: { get: vi.fn(async () => ({})), set: vi.fn(async () => {}) },
      local: { get: vi.fn(async () => ({})), set: vi.fn(async () => {}) },
      onChanged: { addListener: vi.fn(), removeListener: vi.fn() },
    },
    runtime: { id: 'test-extension-id' },
  },
}));

const hex = (n: number) => n.toString(16).padStart(16, 'a');

function nativeRow(id: string, title: string): HTMLElement {
  const row = document.createElement('gem-nav-list-item');
  row.setAttribute('data-test-id', 'conversation');
  row.setAttribute('jslog', `1;BardVeMetadataKey:[["c_${id}",null,0]]`);
  row.innerHTML = `<a href="/app/${id}"><div class="gds-label-l">${title}</div></a>`;
  return row;
}

function reference(
  conversationId: string,
  url: string,
  title: string,
  extra: Partial<ConversationReference> = {},
): ConversationReference {
  return { conversationId, url, title, addedAt: 1, ...extra };
}

describe('FolderStore native title sync', () => {
  let store: FolderStore;
  let sidebar: HTMLElement;
  let stored: FolderData;
  let saveData: Mock<IFolderStorageAdapter['saveData']>;
  const onChange = vi.fn();

  const folder = (id: string) => ({
    id,
    name: id,
    parentId: null,
    isExpanded: true,
    createdAt: 1,
    updatedAt: 1,
  });

  async function createStore(data: FolderData): Promise<void> {
    stored = data;
    saveData = vi.fn(async () => true);
    const adapter: IFolderStorageAdapter = {
      init: vi.fn(async () => {}),
      loadData: vi.fn(async () => structuredClone(stored)),
      saveData,
      removeData: vi.fn(async () => {}),
      getBackendName: () => 'test-memory',
    };
    store = new FolderStore(
      {
        getContext: () => ({ sidebar, sortMode: 'manual', enabled: true }),
        onChange,
        onArchive: vi.fn(),
        onRecovery: vi.fn(),
      },
      adapter,
    );
    await store.init();
    saveData.mockClear();
    onChange.mockClear();
  }

  const titleOf = (folderId: string, index: number) =>
    store.data.folderContents[folderId][index].title;

  beforeEach(() => {
    vi.spyOn(accountIsolationService, 'isIsolationEnabled').mockResolvedValue(false);
    window.history.replaceState({}, '', '/app');
    sidebar = document.createElement('div');
    document.body.appendChild(sidebar);
  });

  afterEach(() => {
    store.destroy();
    document.body.innerHTML = '';
    localStorage.clear();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('matches every stored id shape the per-conversation lookup accepts', async () => {
    const [a, b, c, d, e, stale, staleGem] = [1, 2, 3, 4, 5, 6, 7].map(hex);
    await createStore({
      folders: [folder('one'), folder('two')],
      folderContents: {
        one: [
          reference(`c_${a}`, `https://gemini.google.com/app/${a}`, 'Old A'),
          reference(b, '', 'Old B'),
          // Stored id is stale; only the stored URL identifies the conversation.
          reference(`c_${stale}`, `https://gemini.google.com/u/1/app/${c}`, 'Old C'),
          reference(`c_${staleGem}`, `https://gemini.google.com/gem/g1/${d}?hl=en`, 'Old D'),
          reference(`c_${e}`, `https://gemini.google.com/app/${e}`, 'Mine', {
            customTitle: true,
          }),
        ],
        two: [reference(a, `/app/${a}`, 'Old A elsewhere')],
      },
    });
    sidebar.append(
      nativeRow(a, '  New A  '),
      nativeRow(b, 'New B'),
      nativeRow(c, 'New C'),
      nativeRow(d, 'New D'),
      nativeRow(e, 'Native E'),
      nativeRow(stale, ''),
      nativeRow(hex(99), 'Not stored'),
    );

    await createLegacyFolderCommands(store).run({ kind: 'syncNativeSidebarTitles' });

    expect(store.data.folderContents.one.map((conv) => conv.title).sort()).toEqual([
      'Mine',
      'New A',
      'New B',
      'New C',
      'New D',
    ]);
    expect(titleOf('two', 0)).toBe('New A');
    const byTitle = (title: string) =>
      store.data.folderContents.one.find((conv) => conv.title === title);
    expect(byTitle('New A')?.updatedAt).toEqual(expect.any(Number));
    expect(byTitle('Mine')?.updatedAt).toBeUndefined();
    expect(saveData).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith('title');
  });

  it('lets the later native row win when two rows carry the same conversation', async () => {
    const id = hex(7);
    await createStore({
      folders: [folder('one')],
      folderContents: { one: [reference(`c_${id}`, `/app/${id}`, 'Old')] },
    });
    sidebar.append(nativeRow(id, 'First'), nativeRow(id, 'Second'));

    await createLegacyFolderCommands(store).run({ kind: 'syncNativeSidebarTitles' });

    expect(titleOf('one', 0)).toBe('Second');
  });

  it('keeps the per-conversation matching rules at the edges', async () => {
    const [a, b, c, d, e] = [11, 12, 13, 14, 15].map(hex);
    await createStore({
      folders: [folder('one')],
      folderContents: {
        one: [
          reference(`  C_${a} `, '', 'Old A'),
          // An unparseable URL falls back to the stored id.
          reference(`c_${b}`, 'http://[bad', 'Old B'),
          // Matched by its stored id and by the different id in its URL.
          reference(`c_${c}`, `/app/${d}`, 'Old CD'),
          reference(`c_${e}`, `/app/${e}`, 'Old E'),
        ],
      },
    });
    sidebar.append(
      nativeRow(a, 'New A'),
      nativeRow(b, 'New B'),
      nativeRow(c, 'From C'),
      nativeRow(d, 'From D'),
      nativeRow(e, 'Real E'),
      nativeRow(e, ''),
    );

    await createLegacyFolderCommands(store).run({ kind: 'syncNativeSidebarTitles' });

    expect(store.data.folderContents.one.map((conv) => conv.title)).toEqual([
      'New A',
      'New B',
      'From D',
      'Real E',
    ]);
  });

  it('does not save or re-render when every stored title already matches', async () => {
    const id = hex(8);
    await createStore({
      folders: [folder('one')],
      folderContents: { one: [reference(`c_${id}`, `/app/${id}`, 'Same')] },
    });
    sidebar.append(nativeRow(id, 'Same'));

    await createLegacyFolderCommands(store).run({ kind: 'syncNativeSidebarTitles' });

    expect(saveData).not.toHaveBeenCalled();
    expect(onChange).not.toHaveBeenCalledWith('title');
  });

  it('parses each stored URL once per pass on a long sidebar (#1040)', async () => {
    const ROWS = 1500;
    const FOLDERS = 50;
    const PER_FOLDER = 10;
    const data: FolderData = { folders: [], folderContents: {} };
    for (let f = 0; f < FOLDERS; f += 1) {
      data.folders.push(folder(`f${f}`));
      data.folderContents[`f${f}`] = Array.from({ length: PER_FOLDER }, (_, j) => {
        const id = hex((f * PER_FOLDER + j) * 2);
        return reference(`c_${id}`, `https://gemini.google.com/app/${id}`, `Old ${id}`);
      });
    }
    await createStore(data);
    const nativeTitles = new Map<string, string>();
    for (let i = 0; i < ROWS; i += 1) {
      nativeTitles.set(`c_${hex(i)}`, `Title ${i}`);
      sidebar.appendChild(nativeRow(hex(i), `Title ${i}`));
    }

    let urlParses = 0;
    const NativeURL = globalThis.URL;
    vi.stubGlobal(
      'URL',
      class CountingURL extends NativeURL {
        constructor(url: string | URL, base?: string | URL) {
          super(url, base);
          urlParses += 1;
        }
      },
    );

    await createLegacyFolderCommands(store).run({ kind: 'syncNativeSidebarTitles' });

    // The per-row linear match parsed every stored URL for every row:
    // ROWS × stored = 750,000 parses for this fixture.
    expect(urlParses).toBeLessThanOrEqual(FOLDERS * PER_FOLDER * 2);
    const titles = Object.values(store.data.folderContents).flatMap((list) =>
      list.map((conv) => [conv.conversationId, conv.title]),
    );
    expect(titles).toHaveLength(FOLDERS * PER_FOLDER);
    for (const [conversationId, title] of titles) {
      expect(title).toBe(nativeTitles.get(conversationId));
    }
    expect(saveData).toHaveBeenCalledTimes(1);
  });
});
