/**
 * Inline rename in the shared folder tree. While the input has focus, the
 * controller defers renders, so the folder the form was opened on can be
 * stale by the time the user submits, so the tree compares with live data.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

import { cls } from '../floatingTree/shared';
import { type FolderTreeController, mountFolderTree } from '../floatingTree/treeController';
import type { FolderData } from '../types';

vi.mock('@/utils/i18n', () => ({ getTranslationSyncUnsafe: (key: string) => key }));

const mounted: Array<{ tree: FolderTreeController; host: HTMLElement }> = [];

afterEach(() => {
  for (const { tree, host } of mounted.splice(0)) {
    tree.destroy();
    host.remove();
  }
});

function named(name: string): FolderData {
  return {
    folders: [{ id: 'a', name, parentId: null, isExpanded: true, createdAt: 1, updatedAt: 1 }],
    folderContents: { a: [] },
  };
}

function mount(data: FolderData, onRenameFolder: (id: string, name: string) => void) {
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
    rootBucketId: 'root',
    conversationSortMode: 'manual',
    actions: { onRenameFolder },
  });
  mounted.push({ tree, host });
  return { root, tree };
}

function openRename(root: ShadowRoot): HTMLInputElement {
  root
    .querySelector<HTMLElement>(`.${cls('folder-name')}`)!
    .dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
  const input = root.querySelector<HTMLInputElement>(`.${cls('inline-input')}`)!;
  input.focus();
  return input;
}

function submit(input: HTMLInputElement, value: string): void {
  input.value = value;
  input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
}

describe('inline rename', () => {
  it('asks for the typed name even when it matches the name the form opened with', () => {
    const onRenameFolder = vi.fn();
    const { root, tree } = mount(named('Draft'), onRenameFolder);
    const input = openRename(root);

    // Another tab renames the folder while the form is open; the render waits.
    tree.update(named('Synced'));
    submit(input, 'Draft');

    expect(onRenameFolder).toHaveBeenCalledWith('a', 'Draft');
  });

  it('does not ask for the name the folder already has', () => {
    const onRenameFolder = vi.fn();
    const { root } = mount(named('Same'), onRenameFolder);
    submit(openRename(root), 'Same');

    expect(onRenameFolder).not.toHaveBeenCalled();
  });

  // ChatGPT's store saves every rename it is asked for, so the tree compares
  // with the live name, not the one the form opened on.
  it('does not ask for the name another tab gave the folder meanwhile', () => {
    const onRenameFolder = vi.fn();
    const { root, tree } = mount(named('Draft'), onRenameFolder);
    const input = openRename(root);

    tree.update(named('Synced'));
    submit(input, 'Synced');

    expect(onRenameFolder).not.toHaveBeenCalled();
  });

  it('does not ask for an empty name', () => {
    const onRenameFolder = vi.fn();
    const { root } = mount(named('Kept'), onRenameFolder);
    submit(openRename(root), '   ');

    expect(onRenameFolder).not.toHaveBeenCalled();
  });
});
