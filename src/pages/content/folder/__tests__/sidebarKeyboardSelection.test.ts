/**
 * Enter on a focused conversation row acts as a click on it, so a folder
 * multi-select takes the key exactly as it takes a click: it toggles a row of
 * the same folder and refuses one from another folder, instead of opening it.
 */
import { type MockInstance, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { FolderNavigation } from '../FolderNavigation';
import type { ConversationReference, Folder } from '../types';
import { createFolderViewHarness, resetFolderViewBrowserMocks } from './folderViewHarness';
import { sidebarTree, sidebarTreeRoot } from './sidebarTreeDriver';

vi.mock('webextension-polyfill', () => ({ default: chrome }));
vi.mock('@/utils/i18n', () => ({
  getTranslationSync: (key: string) => key,
  getTranslationSyncUnsafe: (key: string) => key,
  initI18n: () => Promise.resolve(),
}));

function folder(id: string, sortIndex: number): Folder {
  return { id, name: id, parentId: null, isExpanded: true, sortIndex, createdAt: 1, updatedAt: 1 };
}

function chat(hex: string, sortIndex: number): ConversationReference {
  return {
    conversationId: `c_${hex}`,
    title: `Chat ${hex}`,
    url: `https://gemini.google.com/app/${hex}`,
    addedAt: 1,
    sortIndex,
  };
}

describe('Gemini sidebar keyboard activation in multi-select', () => {
  let harness: Awaited<ReturnType<typeof createFolderViewHarness>>;
  let navigate: MockInstance<FolderNavigation['navigate']>;

  const tree = () => sidebarTree(harness.runtime.panel);

  const pressEnter = (row: HTMLElement) => {
    row.focus();
    const init = { key: 'Enter', bubbles: true, cancelable: true, composed: true };
    row.dispatchEvent(new KeyboardEvent('keydown', init));
    row.dispatchEvent(new KeyboardEvent('keyup', init));
  };

  // The rows the tree marks as selected.
  const selectedIds = () =>
    Array.from(
      sidebarTreeRoot(harness.runtime.panel).querySelectorAll<HTMLElement>(
        '.gv-floating-folder-panel__conv--selected',
      ),
    )
      .map((row) => row.dataset.conversationId)
      .sort();

  beforeEach(async () => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    resetFolderViewBrowserMocks();
    harness = await createFolderViewHarness({
      folders: [folder('alpha', 0), folder('beta', 1)],
      folderContents: { alpha: [chat('a1', 0), chat('a2', 1)], beta: [chat('b1', 0)] },
    });
    await vi.advanceTimersByTimeAsync(0);
    navigate = vi.spyOn(harness.navigation, 'navigate').mockImplementation(() => {});

    // Long-press the first chat of "alpha" to start a folder multi-select.
    const first = tree().conversationRow('alpha', 'Chat a1');
    first.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0 }));
    await vi.advanceTimersByTimeAsync(600);
    first.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
  });

  afterEach(() => {
    harness?.destroy();
    document.body.innerHTML = '';
    localStorage.clear();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('toggles a chat of the same folder instead of opening it', () => {
    expect(selectedIds()).toEqual(['c_a1']);

    pressEnter(tree().conversationRow('alpha', 'Chat a2'));

    expect(selectedIds()).toEqual(['c_a1', 'c_a2']);
    expect(navigate).not.toHaveBeenCalled();
  });

  it('refuses a chat from another folder without opening it', () => {
    const other = tree().conversationRow('beta', 'Chat b1');

    pressEnter(other);

    expect(selectedIds()).toEqual(['c_a1']);
    expect(other.classList.contains('gv-invalid-selection')).toBe(true);
    expect(navigate).not.toHaveBeenCalled();
  });
});
