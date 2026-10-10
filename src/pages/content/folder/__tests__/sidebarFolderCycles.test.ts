/**
 * Folders whose stored parents form a cycle have no root above them. Gemini's
 * sidebar used to start from `parentId === null` and lost them; it now lays
 * out the cycle-cut tree, and its search and account filters walk that tree.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { FolderData } from '../types';
import { createFolderViewHarness, resetFolderViewBrowserMocks } from './folderViewHarness';
import { sidebarTree } from './sidebarTreeDriver';

vi.mock('webextension-polyfill', () => ({ default: chrome }));
vi.mock('@/utils/i18n', () => ({
  getTranslationSync: (key: string) => key,
  getTranslationSyncUnsafe: (key: string) => key,
  initI18n: () => Promise.resolve(),
}));

const CYCLE: FolderData = {
  folders: [
    { id: 'x', name: 'Ex', parentId: 'y', isExpanded: true, createdAt: 1, updatedAt: 1 },
    { id: 'y', name: 'Why', parentId: 'x', isExpanded: true, createdAt: 2, updatedAt: 2 },
  ],
  folderContents: {
    x: [
      {
        conversationId: 'c_0123456789abcdef',
        title: 'Loop chat',
        url: 'https://gemini.google.com/app/0123456789abcdef',
        addedAt: 1,
      },
    ],
    y: [],
  },
};

describe('Gemini sidebar folders in a parent cycle', () => {
  let harness: Awaited<ReturnType<typeof createFolderViewHarness>>;

  beforeEach(async () => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    resetFolderViewBrowserMocks();
    harness = await createFolderViewHarness(structuredClone(CYCLE));
  });

  afterEach(() => {
    harness?.destroy();
    document.body.innerHTML = '';
    localStorage.clear();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('shows both folders and their conversation', () => {
    const tree = sidebarTree(harness.runtime.panel);
    expect(tree.folderNames().sort()).toEqual(['Ex', 'Why']);
    expect(tree.bucketsShowing('Loop chat')).toEqual(['x']);
  });

  it('finds a conversation inside the cycle by search', () => {
    const input =
      harness.runtime.panel!.querySelector<HTMLInputElement>('.gv-folder-search-input')!;
    input.value = 'loop';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    vi.advanceTimersByTime(200);

    const tree = sidebarTree(harness.runtime.panel);
    expect(tree.bucketsShowing('Loop chat')).toEqual(['x']);
  });
});
