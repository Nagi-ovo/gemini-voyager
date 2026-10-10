/**
 * What AI Studio's folder tree does for a user, stated through `aistudioTreeDriver`
 * so the same cases hold when the tree's DOM changes. Drafts, placement policy
 * and the read-only window during loads are covered by aistudioFolderSync,
 * aistudioPlacementCharacterization and aistudioPersistence.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { logger } from '@/core/services/LoggerService';
import { StorageKeys } from '@/core/types/common';

import { AIStudioFolderManager } from '../aistudio';
import type { ConversationReference, Folder, FolderData } from '../types';
import { ROOT, fakeTransfer, nameInput, nativeRowTransfer, tree } from './aistudioTreeDriver';

const { mockBrowser } = vi.hoisted(() => ({
  mockBrowser: {
    runtime: {
      id: 'test-extension-id',
      onMessage: { addListener: vi.fn(), removeListener: vi.fn() },
      sendMessage: vi.fn(),
    },
    storage: {
      onChanged: { addListener: vi.fn(), removeListener: vi.fn() },
      local: { get: vi.fn(), set: vi.fn(), remove: vi.fn() },
      sync: { get: vi.fn(), set: vi.fn() },
    },
  },
}));

vi.mock('webextension-polyfill', () => ({ default: mockBrowser }));

const KEY = StorageKeys.FOLDER_DATA_AISTUDIO;
let local: Record<string, unknown>;
let sync: Record<string, unknown>;
const managers: Array<{ destroy(): void }> = [];

function pick(values: Record<string, unknown>, keys: unknown): Record<string, unknown> {
  if (typeof keys === 'string') return structuredClone({ [keys]: values[keys] });
  if (Array.isArray(keys)) {
    return structuredClone(Object.fromEntries(keys.map((key) => [key, values[key]])));
  }
  if (keys && typeof keys === 'object') {
    return structuredClone(
      Object.fromEntries(
        Object.entries(keys).map(([key, fallback]) => [key, values[key] ?? fallback]),
      ),
    );
  }
  return structuredClone(values);
}

function folder(id: string, name: string, extra: Partial<Folder> = {}): Folder {
  return { id, name, parentId: null, isExpanded: true, createdAt: 1, updatedAt: 1, ...extra };
}

function conv(id: string, title: string, extra: Partial<ConversationReference> = {}) {
  return {
    conversationId: id,
    title,
    url: `https://aistudio.google.com/prompts/${id}`,
    addedAt: 1,
    ...extra,
  };
}

/**
 * Creation order differs from both name and sortIndex order, so a tree that
 * sorts by either shows itself. Beta's prompts are stored oldest-added first,
 * with the starred one in the middle.
 */
function fixture(): FolderData {
  return {
    folders: [
      folder('b', 'Beta', { createdAt: 1, sortIndex: 2 }),
      folder('a', 'Alpha', { createdAt: 2, sortIndex: 0 }),
      folder('p', 'Pinned', { createdAt: 3, sortIndex: 1, pinned: true }),
      folder('b2', 'Late child', { parentId: 'b', createdAt: 9, sortIndex: 0 }),
      folder('b1', 'Early child', { parentId: 'b', createdAt: 5, sortIndex: 1 }),
      folder('g', 'Grandchild', { parentId: 'b1', createdAt: 6 }),
    ],
    folderContents: {
      b: [
        conv('c1', 'First stored', { addedAt: 1 }),
        conv('c2', 'Starred second', { addedAt: 2, starred: true }),
        conv('c3', 'Newest third', { addedAt: 3 }),
      ],
      a: [conv('c4', 'In alpha')],
      p: [],
      b1: [],
      b2: [],
      g: [conv('c5', 'Under grandchild')],
    },
  };
}

function stored(): FolderData {
  return local[KEY] as FolderData;
}

async function flush(): Promise<void> {
  for (let i = 0; i < 5; i++) await new Promise((resolve) => setTimeout(resolve, 0));
}

async function mount(data: FolderData = fixture(), path = '/prompts/new_chat') {
  (
    globalThis as unknown as { jsdom: { reconfigure(options: { url: string }): void } }
  ).jsdom.reconfigure({ url: `https://aistudio.google.com${path}` });
  local[KEY] = structuredClone(data);
  const manager = new AIStudioFolderManager();
  managers.push(manager as unknown as { destroy(): void });
  await manager.init();
  await flush();
  return manager;
}

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  document.body.innerHTML = `
    <span class="account-switcher-text" data-email="a@example.com">a@example.com</span>
    <div class="nav-content v3-left-nav"><nav><div class="empty-space"></div></nav></div>`;
  local = {};
  sync = {
    [StorageKeys.LANGUAGE]: 'en',
    [StorageKeys.GV_ACCOUNT_ISOLATION_ENABLED]: false,
    geminiFolderEnabled: true,
  };
  mockBrowser.storage.local.get.mockImplementation(async (keys: unknown) => pick(local, keys));
  mockBrowser.storage.local.set.mockImplementation(async (values: Record<string, unknown>) => {
    Object.assign(local, structuredClone(values));
  });
  mockBrowser.storage.sync.get.mockImplementation(async (keys: unknown) => pick(sync, keys));
  mockBrowser.storage.sync.set.mockImplementation(async (values: Record<string, unknown>) => {
    Object.assign(sync, structuredClone(values));
  });
  chrome.storage.local.get = mockBrowser.storage.local.get as typeof chrome.storage.local.get;
  chrome.storage.local.set = mockBrowser.storage.local.set as typeof chrome.storage.local.set;
  chrome.storage.sync.get = mockBrowser.storage.sync.get as typeof chrome.storage.sync.get;
  chrome.storage.sync.set = mockBrowser.storage.sync.set as typeof chrome.storage.sync.set;
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  for (const manager of managers.splice(0)) manager.destroy();
  vi.restoreAllMocks();
  document.body.innerHTML = '';
  document.documentElement.className = '';
});

describe('AI Studio folder tree: what it shows', () => {
  it('orders folders pinned first, then by creation time, ignoring name and sortIndex', async () => {
    await mount();
    expect(tree.folderOrder().filter((name) => !name.includes('›'))).toEqual([
      'Pinned',
      'Beta',
      'Alpha',
    ]);
    expect(tree.folderOrder().filter((name) => name.startsWith('Beta ›'))).toEqual([
      'Beta › Early child',
      'Beta › Late child',
    ]);
  });

  it('pins a subfolder ahead of an older sibling', async () => {
    const data = fixture();
    data.folders.find((f) => f.id === 'b2')!.pinned = true;
    await mount(data);
    expect(tree.folderOrder().filter((name) => name.startsWith('Beta ›'))).toEqual([
      'Beta › Late child',
      'Beta › Early child',
    ]);
  });

  it('lists a folder’s prompts in stored order, not starred-first or by recency', async () => {
    await mount();
    expect(tree.conversationIds('b')).toEqual(['c1', 'c2', 'c3']);
  });

  it('stops at two levels: a subfolder offers no subfolder of its own', async () => {
    await mount();
    expect(tree.canCreateSubfolder('b')).toBe(true);
    expect(tree.canCreateSubfolder('b1')).toBe(false);
  });

  // The old sidebar tree hid a third level that imported data could hold; the
  // shared tree shows it, so those prompts stay reachable and deletable.
  it('shows a third level that stored data holds', async () => {
    await mount();
    expect(tree.folderOrder()).toContain('Early child › Grandchild');
    expect(tree.conversationIds('g')).toEqual(['c5']);
  });

  it('shows Uncategorized only while the root bucket holds prompts, after the folders', async () => {
    await mount();
    expect(tree.rootSectionLabel()).toBeNull();

    const data = fixture();
    data.folderContents[ROOT] = [conv('r1', 'Loose prompt')];
    for (const manager of managers.splice(0)) manager.destroy();
    document.querySelector('.gv-folder-container')?.remove();
    await mount(data);

    expect(tree.rootSectionLabel()).toBe('Uncategorized');
    expect(tree.rootSectionIsLast()).toBe(true);
    expect(tree.conversationIds(ROOT)).toEqual(['r1']);
  });

  it('marks the prompt the page has open, and follows navigation', async () => {
    await mount(fixture(), '/prompts/c3');
    expect(tree.activeConversationIds()).toEqual(['c3']);

    history.pushState({}, '', '/prompts/c4');
    window.dispatchEvent(new PopStateEvent('popstate'));
    await flush();

    expect(tree.activeConversationIds()).toEqual(['c4']);
  });
});

describe('AI Studio folder tree: what it changes', () => {
  it('stars and unstars a prompt and saves it', async () => {
    await mount();
    tree.toggleStar('b', 'c1');
    await flush();
    expect(stored().folderContents.b.find((c) => c.conversationId === 'c1')?.starred).toBe(true);
    expect(tree.isStarredInView('b', 'c1')).toBe(true);

    tree.toggleStar('b', 'c1');
    await flush();
    expect(stored().folderContents.b.find((c) => c.conversationId === 'c1')?.starred).toBe(false);
  });

  it('stars a prompt that legacy data files in two folders in both, from either row', async () => {
    const data = fixture();
    data.folderContents.a.push(conv('c1', 'First stored'));
    await mount(data);
    const stars = () =>
      (['b', 'a'] as const).map(
        (id) => !!stored().folderContents[id].find((c) => c.conversationId === 'c1')?.starred,
      );

    tree.toggleStar('a', 'c1');
    await flush();
    expect(stars()).toEqual([true, true]);
    expect(tree.isStarredInView('b', 'c1')).toBe(true);

    tree.toggleStar('b', 'c1');
    await flush();
    expect(stars()).toEqual([false, false]);
  });

  it('pins a folder, saves it and moves it up among pinned folders by creation', async () => {
    await mount();
    tree.togglePinned('a');
    await flush();
    expect(stored().folders.find((f) => f.id === 'a')?.pinned).toBe(true);
    expect(tree.folderOrder().filter((name) => !name.includes('›'))).toEqual([
      'Alpha',
      'Pinned',
      'Beta',
    ]);

    tree.togglePinned('a');
    await flush();
    expect(stored().folders.find((f) => f.id === 'a')?.pinned).toBe(false);
  });

  it('collapses a folder, saves that and hides its contents', async () => {
    await mount();
    tree.toggleExpanded('a');
    await flush();
    expect(stored().folders.find((f) => f.id === 'a')?.isExpanded).toBe(false);
    expect(tree.conversationIds('a')).toEqual([]);

    tree.toggleExpanded('a');
    await flush();
    expect(stored().folders.find((f) => f.id === 'a')?.isExpanded).toBe(true);
    expect(tree.conversationIds('a')).toEqual(['c4']);
  });

  it('asks before removing a prompt from a folder', async () => {
    await mount();
    tree.requestRemoval('b', 'c2');
    expect(tree.pendingQuestion()).toBe('Remove "Starred second" from this folder?');

    tree.answer(false);
    await flush();
    expect(stored().folderContents.b).toHaveLength(3);

    tree.requestRemoval('b', 'c2');
    tree.answer(true);
    await flush();
    expect(stored().folderContents.b.map((c) => c.conversationId)).toEqual(['c1', 'c3']);
    expect(tree.conversationIds('b')).toEqual(['c1', 'c3']);
  });

  // Same question and subtree removal as Gemini's sidebar (`removeFolder`):
  // "all its contents" covers the subfolders, which neither site names.
  it('deletes a folder with every folder inside it and their contents after asking', async () => {
    await mount();
    tree.requestFolderDeletion('b');
    expect(tree.pendingQuestion()).toBe('Delete this folder and all its contents?');
    tree.answer(false);
    await flush();
    expect(stored().folders).toHaveLength(6);

    tree.requestFolderDeletion('b');
    tree.answer(true);
    await flush();
    const data = stored();
    expect(data.folders.map((f) => f.id).sort()).toEqual(['a', 'p']);
    for (const id of ['b', 'b1', 'b2', 'g']) {
      expect(Object.hasOwn(data.folderContents, id)).toBe(false);
    }
    expect(tree.isRendered('b')).toBe(false);
    // Only the folder references go: other folders keep theirs, and nothing asks
    // AI Studio to delete a prompt.
    expect(data.folderContents.a.map((c) => c.conversationId)).toEqual(['c4']);
    expect(mockBrowser.runtime.sendMessage).not.toHaveBeenCalled();
  });

  it('renames a folder from its name', async () => {
    await mount();
    tree.rename('a', 'Renamed');
    await flush();
    expect(stored().folders.find((f) => f.id === 'a')?.name).toBe('Renamed');
    expect(tree.text()).toContain('Renamed');
  });

  it('creates root folders and subfolders, expanded and empty', async () => {
    await mount();
    tree.createRootFolder('Fresh');
    await flush();
    const fresh = stored().folders.find((f) => f.name === 'Fresh')!;
    expect(fresh).toMatchObject({ parentId: null, isExpanded: true });
    expect(stored().folderContents[fresh.id]).toEqual([]);

    tree.createSubfolder('a', 'Inner');
    await flush();
    expect(stored().folders.find((f) => f.name === 'Inner')?.parentId).toBe('a');
    expect(tree.folderOrder()).toContain('Alpha › Inner');
  });

  it('keeps Escape from creating a folder and Enter from creating an empty one', async () => {
    await mount();
    const before = stored().folders.length;
    tree.startRootFolder();
    nameInput()!.value = 'Abandoned';
    nameInput()!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await flush();
    expect(nameInput()).toBeNull();

    tree.createRootFolder('   ');
    await flush();
    expect(stored().folders).toHaveLength(before);
  });
});

describe('AI Studio folder tree: stored structure', () => {
  // The old tree rendered roots by `!folder.parentId`; stored and imported
  // folders can hold `''` or no parentId at all.
  it('shows folders whose parent is empty, missing or deleted, with their prompts', async () => {
    const { parentId: _omitted, ...noParent } = folder('n', 'No parent', { createdAt: 2 });
    await mount({
      folders: [
        folder('e', 'Empty parent', { parentId: '' as unknown as null, createdAt: 1 }),
        noParent as Folder,
        folder('o', 'Orphan', { parentId: 'gone', createdAt: 3 }),
      ],
      folderContents: {
        e: [conv('pe', 'In empty')],
        n: [conv('pn', 'In none')],
        o: [conv('po', 'In orphan')],
      },
    });
    expect(tree.folderOrder()).toEqual(['Empty parent', 'No parent', 'Orphan']);
    expect(tree.conversationIds('o')).toEqual(['po']);
    expect(stored().folders.find((f) => f.id === 'o')?.parentId).toBe('gone');
  });
});

describe('AI Studio folder tree: drag and drop', () => {
  it('files a prompt dragged from the native list into a folder', async () => {
    await mount();
    expect(tree.drop(tree.dropTarget('a'), nativeRowTransfer('n1', 'Native prompt'))).toBe(true);
    await flush();
    expect(stored().folderContents.a.map((c) => c.conversationId)).toEqual(['c4', 'n1']);
    expect(stored().folderContents.a[1]).toMatchObject({ title: 'Native prompt' });
  });

  it('files a native prompt under Uncategorized from the root drop target, even with no folders', async () => {
    await mount({ folders: [], folderContents: {} });
    expect(tree.drop(tree.dropTarget(ROOT), nativeRowTransfer('n1', 'Native prompt'))).toBe(true);
    await flush();
    expect(stored().folderContents[ROOT].map((c) => c.conversationId)).toEqual(['n1']);
    expect(tree.rootSectionLabel()).toBe('Uncategorized');
  });

  it('files a prompt link dragged from anywhere on the page, which carries only a URL', async () => {
    await mount();
    const link = fakeTransfer({ 'text/uri-list': 'https://aistudio.google.com/prompts/n2' });
    expect(tree.drop(tree.dropTarget('a'), link)).toBe(true);
    await flush();
    expect(stored().folderContents.a.map((c) => c.conversationId)).toEqual(['c4', 'n2']);
  });

  it('files a prompt dropped anywhere in a folder block, into the innermost folder', async () => {
    await mount();
    expect(tree.drop(tree.rowElement('a', 'c4'), nativeRowTransfer('n1', 'Into alpha'))).toBe(true);
    await flush();
    expect(stored().folderContents.a.map((c) => c.conversationId)).toEqual(['c4', 'n1']);

    tree.drop(tree.rowElement('g', 'c5'), nativeRowTransfer('n2', 'Into grandchild'));
    await flush();
    expect(stored().folderContents.g.map((c) => c.conversationId)).toEqual(['c5', 'n2']);
    expect(stored().folderContents.b1).toEqual([]);
    expect(stored().folderContents.b.map((c) => c.conversationId)).toEqual(['c1', 'c2', 'c3']);
  });

  it('moves a filed prompt between folders by dragging its row, keeping its record', async () => {
    await mount();
    const transfer = tree.dragRow('b', 'c2');
    tree.drop(tree.dropTarget('a'), transfer);
    await flush();
    expect(stored().folderContents.b.map((c) => c.conversationId)).toEqual(['c1', 'c3']);
    expect(stored().folderContents.a.find((c) => c.conversationId === 'c2')).toMatchObject({
      title: 'Starred second',
      starred: true,
    });
  });

  it('takes a prompt out of its folder when it is dropped on the root', async () => {
    await mount();
    tree.drop(tree.dropTarget(ROOT), tree.dragRow('a', 'c4'));
    await flush();
    expect(stored().folderContents.a).toEqual([]);
    expect(stored().folderContents[ROOT].map((c) => c.conversationId)).toEqual(['c4']);
  });
});

describe('AI Studio folder tree: lifetime', () => {
  /** Whether a leftover name form still swallows a mousedown outside it. */
  function mousedownSwallowed(): boolean {
    const event = new MouseEvent('mousedown', { bubbles: true, cancelable: true });
    document.body.dispatchEvent(event);
    return event.defaultPrevented;
  }

  it('leaves one live tree after Angular rebuilds the nav twice, and none after teardown', async () => {
    const manager = await mount();
    for (let rebuild = 0; rebuild < 2; rebuild++) {
      tree.startRootFolder();
      expect(nameInput()).not.toBeNull();
      document.querySelector('.gv-folder-container')!.remove();
      // The re-inject is throttled to one per 250ms burst.
      await new Promise((resolve) => setTimeout(resolve, 300));
      await flush();
      expect(document.querySelectorAll('.gv-aistudio-folder-tree')).toHaveLength(1);
      // The folder menu's layer on document.body goes with each old tree.
      expect(document.querySelectorAll('.gv-folder-tree-popover-layer')).toHaveLength(1);
      expect(mousedownSwallowed()).toBe(false);
      expect(tree.folderOrder()).toContain('Alpha');
    }

    tree.startRootFolder();
    (manager as unknown as { destroy(): void }).destroy();
    expect(document.querySelector('.gv-aistudio-folder-tree')).toBeNull();
    expect(document.querySelector('.gv-folder-tree-popover-layer')).toBeNull();
    expect(mousedownSwallowed()).toBe(false);
  });
});

describe('AI Studio folder tree: navigation', () => {
  it('opens a prompt through the native link when the page shows one', async () => {
    await mount();
    const anchor = document.createElement('a');
    anchor.className = 'prompt-link';
    anchor.href = '/prompts/c4';
    const history = document.createElement('ms-prompt-history-v3');
    history.appendChild(anchor);
    document.body.appendChild(history);
    const clicked = vi.fn((event: Event) => event.preventDefault());
    anchor.addEventListener('click', clicked);

    tree.openConversation('a', 'c4');
    expect(clicked).toHaveBeenCalledTimes(1);
  });

  it('otherwise opens a prompt through the History API, without a page load', async () => {
    await mount();
    const pushState = vi.spyOn(history, 'pushState');
    const popstate = vi.fn();
    window.addEventListener('popstate', popstate);

    tree.openConversation('a', 'c4');

    expect(pushState).toHaveBeenCalledWith({}, '', 'https://aistudio.google.com/prompts/c4');
    expect(popstate).toHaveBeenCalledTimes(1);
    expect(location.pathname).toBe('/prompts/c4');
    window.removeEventListener('popstate', popstate);
  });

  it('stays on the page and logs when the History API refuses the prompt', async () => {
    await mount();
    const before = location.href;
    const refusal = new DOMException('blocked', 'SecurityError');
    vi.spyOn(history, 'pushState').mockImplementation(() => {
      throw refusal;
    });
    const warn = vi.spyOn(logger, 'warn').mockImplementation(() => {});
    // jsdom reports a page load it cannot perform through console.error.
    const pageLoad = vi.spyOn(console, 'error').mockImplementation(() => {});

    tree.openConversation('a', 'c4');

    expect(location.href).toBe(before);
    expect(pageLoad).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledWith(expect.any(String), {
      url: 'https://aistudio.google.com/prompts/c4',
      error: refusal,
    });
  });

  it("opens /library through the nav's own Library link when the nav has one", async () => {
    await mount();
    const nav = document.querySelector('.nav-content nav')!;
    const native = document.createElement('a');
    native.href = '/library';
    nav.appendChild(native);
    const clicked = vi.fn((event: Event) => event.preventDefault());
    native.addEventListener('click', clicked);
    const pushState = vi.spyOn(history, 'pushState');

    tree.libraryButton()!.click();

    expect(clicked).toHaveBeenCalledTimes(1);
    expect(pushState).not.toHaveBeenCalled();
  });

  it('otherwise opens /library through the History API, without a page load', async () => {
    await mount();
    const popstate = vi.fn();
    window.addEventListener('popstate', popstate);

    tree.libraryButton()!.click();

    expect(location.pathname).toBe('/library');
    expect(popstate).toHaveBeenCalledTimes(1);
    window.removeEventListener('popstate', popstate);
  });

  it('offers the Library shortcut away from /library and hides it there', async () => {
    await mount();
    expect(tree.libraryButton()?.style.display).toBe('');

    history.pushState({}, '', '/library');
    window.dispatchEvent(new PopStateEvent('popstate'));
    await flush();
    expect(tree.libraryButton()?.style.display).toBe('none');
  });
});
