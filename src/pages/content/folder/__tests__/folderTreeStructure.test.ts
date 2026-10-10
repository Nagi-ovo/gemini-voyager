/**
 * The shared folder tree on stored or imported data whose folder structure is
 * not clean. Every folder must render exactly once, so neither it nor the
 * conversations it holds go missing.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

import { getFolderAndDescendants } from '@/features/folder/model/folderData';

import { cls } from '../floatingTree/shared';
import { type FolderTreeController, mountFolderTree } from '../floatingTree/treeController';
import type { Folder, FolderData } from '../types';

vi.mock('@/utils/i18n', () => ({ getTranslationSyncUnsafe: (key: string) => key }));

const ROOT = 'root-bucket';
const mounted: Array<{ tree: FolderTreeController; host: HTMLElement }> = [];

afterEach(() => {
  for (const { tree, host } of mounted.splice(0)) {
    tree.destroy();
    host.remove();
  }
});

function folder(id: string, parentId: unknown, extra: Partial<Folder> = {}): Folder {
  return {
    id,
    name: `Name ${id}`,
    parentId: parentId as string | null,
    isExpanded: true,
    createdAt: 1,
    updatedAt: 1,
    ...extra,
  };
}

function withoutParent(id: string): Folder {
  const { parentId: _omitted, ...rest } = folder(id, null);
  return rest as Folder;
}

function mount(data: FolderData): ShadowRoot {
  const host = document.createElement('div');
  const root = host.attachShadow({ mode: 'open' });
  const body = document.createElement('div');
  root.appendChild(body);
  document.body.appendChild(host);
  const tree = mountFolderTree({
    body,
    boundary: host,
    focusRoot: root,
    data,
    rootBucketId: ROOT,
    conversationSortMode: 'manual',
    actions: {},
  });
  mounted.push({ tree, host });
  return root;
}

/** Rendered folders as `depth:id`, in document order. */
function rendered(root: ShadowRoot): string[] {
  return Array.from(
    root.querySelectorAll<HTMLElement>(`.${cls('folder')}`),
    (node) =>
      `${node.dataset.depth}:${node.querySelector(`.${cls('folder-header')}`)?.getAttribute('data-folder-id')}`,
  );
}

function bucketsOf(...ids: string[]): FolderData['folderContents'] {
  return Object.fromEntries(
    ids.map((id) => [
      id,
      [{ conversationId: `in-${id}`, title: `In ${id}`, url: `https://x.test/${id}`, addedAt: 1 }],
    ]),
  );
}

const shownConversations = (root: ShadowRoot) =>
  Array.from(
    root.querySelectorAll<HTMLElement>(`.${cls('conv')}`),
    (row) => row.dataset.conversationId,
  ).sort();

describe('folders without a usable parent', () => {
  it('renders a folder whose parent is null, missing or empty at the root', () => {
    const root = mount({
      folders: [folder('a', null), withoutParent('b'), folder('c', '')],
      folderContents: bucketsOf('a', 'b', 'c'),
    });
    expect(rendered(root)).toEqual(['0:a', '0:b', '0:c']);
    expect(shownConversations(root)).toEqual(['in-a', 'in-b', 'in-c']);
  });

  it('renders a folder whose parent no longer exists at the root, with its subfolders', () => {
    const root = mount({
      folders: [folder('orphan', 'deleted-parent'), folder('child', 'orphan')],
      folderContents: bucketsOf('orphan', 'child'),
    });
    expect(rendered(root)).toEqual(['0:orphan', '1:child']);
    expect(shownConversations(root)).toEqual(['in-child', 'in-orphan']);
  });
});

describe('folders on a parent cycle', () => {
  it('renders a folder that is its own parent once, at the root', () => {
    const root = mount({ folders: [folder('s', 's')], folderContents: bucketsOf('s') });
    expect(rendered(root)).toEqual(['0:s']);
    expect(shownConversations(root)).toEqual(['in-s']);
  });

  it('renders each folder of a cycle once, the first one standing in as a root', () => {
    const root = mount({
      folders: [folder('a', 'b'), folder('b', 'a'), folder('c', 'b')],
      folderContents: bucketsOf('a', 'b', 'c'),
    });
    expect(rendered(root)).toEqual(['0:a', '1:b', '2:c']);
    expect(shownConversations(root)).toEqual(['in-a', 'in-b', 'in-c']);
  });

  it('renders a duplicated id once, even when the duplicate names itself as parent', () => {
    const root = mount({
      folders: [folder('x', null), folder('x', 'x'), folder('y', 'x')],
      folderContents: bucketsOf('x', 'y'),
    });
    expect(rendered(root)).toEqual(['0:x', '1:y']);
  });

  it('stops at a cycle under a real root, even with every folder collapsed', () => {
    const root = mount({
      folders: [
        folder('r', null, { isExpanded: false }),
        folder('a', 'r', { isExpanded: false }),
        folder('b', 'a', { isExpanded: false }),
        folder('a', 'b', { isExpanded: false }),
      ],
      folderContents: bucketsOf('r', 'a', 'b'),
    });
    // The tree renders only open folders' rows, so open each level in turn.
    expect(rendered(root)).toEqual(['0:r']);
    for (const id of ['r', 'a', 'b']) {
      root
        .querySelector<HTMLButtonElement>(
          `.${cls('folder-header')}[data-folder-id="${id}"] .${cls('caret')}`,
        )!
        .click();
    }
    expect(rendered(root)).toEqual(['0:r', '1:a', '2:b']);
  });

  it('counts only the subfolders it renders', () => {
    const root = mount({
      folders: [folder('x', null), folder('x', 'x'), folder('y', 'x')],
      folderContents: { x: [], y: [] },
    });
    const count = (id: string) =>
      root.querySelector(`.${cls('folder-header')}[data-folder-id="${id}"] .${cls('count')}`)
        ?.textContent;
    expect(count('x')).toBe('1');
  });
});

describe('removing a folder takes what the tree shows inside it', () => {
  /**
   * Each rendered folder with the folders rendered under it: the rows are flat,
   * so a folder's subtree is the deeper rows that follow it.
   */
  function shownSubtrees(root: ShadowRoot): Map<string, string[]> {
    const rows = rendered(root).map((entry) => {
      const [depth, id] = entry.split(':');
      return { depth: Number(depth), id };
    });
    const subtrees = new Map<string, string[]>();
    rows.forEach((row, index) => {
      const ids = [row.id];
      for (const next of rows.slice(index + 1)) {
        if (next.depth <= row.depth) break;
        ids.push(next.id);
      }
      subtrees.set(row.id, ids.sort());
    });
    return subtrees;
  }

  it.each([
    ['its own parent', [folder('s', 's'), folder('t', 's')]],
    ['a pair', [folder('a', 'b'), folder('b', 'a'), folder('c', 'b')]],
    [
      'three folders beside a real root',
      [folder('r', null), folder('k', 'r'), folder('a', 'c'), folder('b', 'a'), folder('c', 'b')],
    ],
    ['a repeated id', [folder('p', null), folder('x', null), folder('x', 'p')]],
  ])('on a cycle through %s', (_kind, folders) => {
    const data: FolderData = { folders, folderContents: {} };
    const subtrees = shownSubtrees(mount(data));

    expect(subtrees.size).toBe(new Set(folders.map((item) => item.id)).size);
    for (const [id, shown] of subtrees) {
      expect([...getFolderAndDescendants(data, id)].sort(), id).toEqual(shown);
    }
  });
});
