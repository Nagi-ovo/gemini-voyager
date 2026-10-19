/**
 * What AI Studio's folder tree does for a user, stated through `aistudioTreeDriver`
 * so the same cases hold when the tree's DOM changes. Drafts, placement policy
 * and the read-only window during loads are covered by aistudioFolderSync,
 * aistudioPlacementCharacterization and aistudioPersistence; opening prompts and
 * /library by aistudioTreeCharacterization.navigation.
 */
import { describe, expect, it, vi } from 'vitest';

import type { Folder } from '../types';
import {
  conv,
  destroyManagers,
  flush,
  folder,
  mockBrowser,
  mountTree as mount,
  stored,
  treeFixture,
  installAIStudioFolderPage,
} from './aistudioFolderHarness';
import { ROOT, fakeTransfer, nameInput, nativeRowTransfer, tree } from './aistudioTreeDriver';

vi.mock('webextension-polyfill', () => ({ default: chrome }));

installAIStudioFolderPage();

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
    const data = treeFixture();
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

  it('stops at three levels: a third-level folder offers no subfolder', async () => {
    await mount();
    expect(tree.canCreateSubfolder('b1')).toBe(true);
    expect(tree.canCreateSubfolder('g')).toBe(false);
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

    const data = treeFixture();
    data.folderContents[ROOT] = [conv('r1', 'Loose prompt')];
    destroyManagers();
    document.querySelector('.gv-folder-container')?.remove();
    await mount(data);

    expect(tree.rootSectionLabel()).toBe('Uncategorized');
    expect(tree.rootSectionIsLast()).toBe(true);
    expect(tree.conversationIds(ROOT)).toEqual(['r1']);
  });

  it('marks the prompt the page has open, and follows navigation', async () => {
    await mount(treeFixture(), '/prompts/c3');
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
    const data = treeFixture();
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
