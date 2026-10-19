/**
 * AI Studio folder state that must survive another context's writes: inline
 * name drafts, archived /library rows, and the account-scope retry.
 */
import { describe, expect, it, vi } from 'vitest';

import { accountIsolationService } from '@/core/services/AccountIsolationService';
import { StorageKeys } from '@/core/types/common';

import type { FolderData } from '../types';
import {
  GLOBAL_KEY,
  folderData,
  local,
  mount,
  panelText,
  scopedKey,
  sync,
  installAIStudioFolderPage,
  writeFromElsewhere,
} from './aistudioFolderHarness';
import { nameInput, tree } from './aistudioTreeDriver';

vi.mock('webextension-polyfill', () => ({ default: chrome }));

installAIStudioFolderPage({ syncStorage: true });

// The sidebar tree is the shared folder tree: it keeps one name form open at a
// time, and while that form's input has focus it holds a reload back until the
// form closes, so typing is never rebuilt away.
describe('AI Studio inline folder drafts across reloads', () => {
  function twoFolders(first: string, second: string): FolderData {
    return {
      folders: [...folderData(first).folders, ...folderData(second).folders],
      folderContents: { [first]: [], [second]: [] },
    };
  }

  function press(input: HTMLInputElement, key: string): void {
    input.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }));
  }

  function folderNames(): string[] {
    return (local[GLOBAL_KEY] as FolderData).folders.map((folder) => folder.name);
  }

  it('keeps an unfinished new-folder name and creates it on top of the reloaded data', async () => {
    local[GLOBAL_KEY] = folderData('Mine');
    await mount();
    tree.startRootFolder();
    const input = nameInput()!;
    input.value = 'Draft';

    writeFromElsewhere({ [GLOBAL_KEY]: folderData('From another tab') });
    await vi.advanceTimersByTimeAsync(0);
    expect(nameInput()).toBe(input);
    expect(input.value).toBe('Draft');

    press(input, 'Enter');
    await vi.advanceTimersByTimeAsync(0);
    expect(folderNames()).toEqual(['From another tab', 'Draft']);
    expect(nameInput()).toBeNull();
    expect(panelText()).toContain('From another tab');
    expect(panelText()).not.toContain('Mine');
  });

  it('keeps an unfinished rename and applies it to the reloaded folder', async () => {
    local[GLOBAL_KEY] = folderData('Mine');
    await mount();
    tree.startRename('Mine');
    const input = nameInput()!;
    input.value = 'Renamed';

    writeFromElsewhere({ [GLOBAL_KEY]: twoFolders('Mine', 'From another tab') });
    await vi.advanceTimersByTimeAsync(0);
    expect(tree.headerHolds('Mine', input)).toBe(true);
    expect(input.value).toBe('Renamed');

    press(input, 'Enter');
    await vi.advanceTimersByTimeAsync(0);
    expect(folderNames()).toEqual(['Renamed', 'From another tab']);
    expect(nameInput()).toBeNull();
  });

  it('drops a rename whose folder another tab deleted', async () => {
    local[GLOBAL_KEY] = folderData('Mine');
    await mount();
    tree.startRename('Mine');

    writeFromElsewhere({ [GLOBAL_KEY]: folderData('From another tab') });
    await vi.advanceTimersByTimeAsync(0);

    expect(nameInput()).toBeNull();
    expect(panelText()).toContain('From another tab');
  });

  it('drops a new-subfolder draft whose parent another tab deleted', async () => {
    local[GLOBAL_KEY] = folderData('Mine');
    await mount();
    tree.startSubfolder('Mine');
    expect(nameInput()).not.toBeNull();

    writeFromElsewhere({ [GLOBAL_KEY]: folderData('From another tab') });
    await vi.advanceTimersByTimeAsync(0);

    expect(nameInput()).toBeNull();
  });

  it('keeps a new-subfolder draft while its parent stays, and creates it there', async () => {
    local[GLOBAL_KEY] = twoFolders('Mine', 'Other');
    await mount();
    tree.startSubfolder('Mine');
    const input = nameInput()!;
    input.value = 'Kid';

    writeFromElsewhere({ [GLOBAL_KEY]: twoFolders('Mine', 'Other') });
    await vi.advanceTimersByTimeAsync(0);
    expect(nameInput()).toBe(input);

    press(input, 'Enter');
    await vi.advanceTimersByTimeAsync(0);
    const kid = (local[GLOBAL_KEY] as FolderData).folders.find((folder) => folder.name === 'Kid');
    expect(kid?.parentId).toBe('Mine');
  });

  it('keeps one name form open: starting a new folder closes an open rename', async () => {
    local[GLOBAL_KEY] = folderData('Mine');
    await mount();
    tree.startRename('Mine');
    const rename = nameInput()!;
    tree.startRootFolder();

    expect(rename.isConnected).toBe(false);
    expect(nameInput()).not.toBeNull();
    expect(folderNames()).toEqual(['Mine']);
  });

  /** Parent P holds child S; `expanded` is P's state. */
  function nested(expanded: boolean, withChild = true): FolderData {
    const folders = [
      { id: 'P', name: 'Parent', parentId: null, isExpanded: expanded, createdAt: 1, updatedAt: 1 },
      { id: 'S', name: 'Child', parentId: 'P', isExpanded: true, createdAt: 2, updatedAt: 1 },
    ];
    return {
      folders: withChild ? folders : folders.slice(0, 1),
      folderContents: withChild ? { P: [], S: [] } : { P: [] },
    };
  }

  it('keeps a rename whose parent another tab collapsed and shows it again when expanded', async () => {
    local[GLOBAL_KEY] = nested(true);
    await mount();
    tree.startRename('S');
    const input = nameInput()!;
    input.value = 'Renamed';
    input.blur();

    writeFromElsewhere({ [GLOBAL_KEY]: nested(false) });
    await vi.advanceTimersByTimeAsync(0);
    expect(input.isConnected).toBe(true);
    expect(tree.isShown(input)).toBe(false);

    writeFromElsewhere({ [GLOBAL_KEY]: nested(true) });
    await vi.advanceTimersByTimeAsync(0);
    expect(tree.isShown(input)).toBe(true);
    expect(tree.headerHolds('S', input)).toBe(true);
    expect(input.value).toBe('Renamed');

    press(input, 'Enter');
    await vi.advanceTimersByTimeAsync(0);
    expect(folderNames()).toEqual(['Parent', 'Renamed']);
  });

  it('keeps a new-subfolder draft across a local collapse of its ancestor', async () => {
    local[GLOBAL_KEY] = nested(true);
    await mount();
    tree.startSubfolder('P');
    const input = nameInput()!;
    input.value = 'Kid';

    tree.toggleExpanded('P');
    await vi.advanceTimersByTimeAsync(0);
    expect(tree.isShown(input)).toBe(false);
    tree.toggleExpanded('P');
    await vi.advanceTimersByTimeAsync(0);

    expect(tree.isShown(input)).toBe(true);
    expect(input.value).toBe('Kid');
  });

  it('drops a hidden rename once another tab deletes its folder', async () => {
    local[GLOBAL_KEY] = nested(true);
    await mount();
    tree.startRename('S');
    nameInput()!.blur();

    writeFromElsewhere({ [GLOBAL_KEY]: nested(false) });
    await vi.advanceTimersByTimeAsync(0);
    writeFromElsewhere({ [GLOBAL_KEY]: nested(false, false) });
    await vi.advanceTimersByTimeAsync(0);
    writeFromElsewhere({ [GLOBAL_KEY]: nested(true, false) });
    await vi.advanceTimersByTimeAsync(0);
    expect(nameInput()).toBeNull();

    // An import or restore elsewhere brings the same folder id back: the old draft stays gone.
    writeFromElsewhere({ [GLOBAL_KEY]: nested(true) });
    await vi.advanceTimersByTimeAsync(0);
    expect(nameInput()).toBeNull();
    expect(panelText()).toContain('Child');
  });

  it('does not carry a new-folder draft into another account', async () => {
    sync[StorageKeys.GV_ACCOUNT_ISOLATION_ENABLED] = true;
    local[await scopedKey('a')] = folderData('Private a');
    const manager = await mount();
    tree.startRootFolder();
    expect(nameInput()).not.toBeNull();

    document.querySelector('.account-switcher-text')!.textContent = 'b@example.com';
    document.querySelector('.account-switcher-text')!.setAttribute('data-email', 'b@example.com');
    await vi.advanceTimersByTimeAsync(4000);

    expect(manager.activeStorageKey).toBe(await scopedKey('b'));
    expect(nameInput()).toBeNull();
  });
});

describe('AI Studio library archive visibility across contexts', () => {
  function libraryRow(id: string): HTMLElement {
    const row = document.createElement('tr');
    row.className = 'mat-mdc-row';
    row.innerHTML = `<td><a class="name-btn" href="/prompts/${id}">${id}</a></td>`;
    document.body.appendChild(row);
    return row;
  }

  function filed(id: string): FolderData {
    const data = folderData('Mine');
    data.folderContents.Mine = [
      { conversationId: id, title: id, url: `/prompts/${id}`, addedAt: 1 },
    ];
    return data;
  }

  it('archives and unarchives existing rows when another tab moves prompts', async () => {
    (
      globalThis as unknown as { jsdom: { reconfigure(options: { url: string }): void } }
    ).jsdom.reconfigure({ url: 'https://aistudio.google.com/library' });
    sync[StorageKeys.FOLDER_HIDE_ARCHIVED_CONVERSATIONS_AISTUDIO] = true;
    local[GLOBAL_KEY] = filed('p1');
    const first = libraryRow('p1');
    const second = libraryRow('p2');
    await mount();
    expect(first.classList.contains('gv-conversation-archived')).toBe(true);
    expect(second.classList.contains('gv-conversation-archived')).toBe(false);

    writeFromElsewhere({ [GLOBAL_KEY]: filed('p2') });
    await vi.advanceTimersByTimeAsync(0);

    expect(first.classList.contains('gv-conversation-archived')).toBe(false);
    expect(second.classList.contains('gv-conversation-archived')).toBe(true);
  });
});

describe('AI Studio account scope retry', () => {
  it('binds before the next poll and later polls keep the bound account', async () => {
    sync[StorageKeys.GV_ACCOUNT_ISOLATION_ENABLED] = true;
    const key = await scopedKey('a');
    const privateA = folderData('Private a');
    privateA.folderContents['Private a'] = [
      {
        conversationId: 'p1',
        title: 'Prompt p1',
        url: 'https://aistudio.google.com/prompts/p1',
        addedAt: 1,
      },
    ];
    local[key] = privateA;
    const resolve = accountIsolationService.resolveAccountScope.bind(accountIsolationService);
    vi.spyOn(accountIsolationService, 'resolveAccountScope')
      .mockRejectedValueOnce(new Error('background not listening'))
      .mockImplementation(resolve);
    const manager = await mount();
    expect(manager.activeStorageKey).toBe('');

    await vi.advanceTimersByTimeAsync(400);
    expect(manager.activeStorageKey).toBe(key);
    expect(panelText()).toContain('Private a');

    tree.requestRemoval('Private a', 'p1');
    await vi.advanceTimersByTimeAsync(3600);

    expect(tree.pendingQuestion()).not.toBeNull();
    expect(manager.activeStorageKey).toBe(key);
  });
});
