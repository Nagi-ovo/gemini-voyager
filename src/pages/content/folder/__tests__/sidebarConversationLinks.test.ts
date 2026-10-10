import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createFolderViewHarness, resetFolderViewBrowserMocks } from './folderViewHarness';
import { sidebarTree } from './sidebarTreeDriver';

vi.mock('webextension-polyfill', () => ({ default: chrome }));
vi.mock('@/utils/i18n', () => ({
  getTranslationSync: (key: string) => key,
  getTranslationSyncUnsafe: (key: string) => key,
  initI18n: () => Promise.resolve(),
}));

const ID = '4d5e6f7890abcdef';

describe('Gemini sidebar conversation links', () => {
  let harness: Awaited<ReturnType<typeof createFolderViewHarness>>;

  beforeEach(async () => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    resetFolderViewBrowserMocks();
    harness = await createFolderViewHarness({
      folders: [
        {
          id: 'folder-1',
          name: 'Folder 1',
          parentId: null,
          isExpanded: true,
          createdAt: 1,
          updatedAt: 1,
        },
      ],
      folderContents: {
        'folder-1': [
          {
            conversationId: `c_${ID}`,
            title: 'Conversation',
            url: `https://gemini.google.com/app/${ID}`,
            addedAt: 1,
          },
        ],
      },
    });
  });

  afterEach(() => {
    harness?.destroy();
    document.body.innerHTML = '';
    localStorage.clear();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  const link = () =>
    sidebarTree(harness.runtime.panel).titleButton('folder-1', 'Conversation') as HTMLAnchorElement;

  it('links each conversation to its route', () => {
    expect(link().href).toBe(`https://gemini.google.com/app/${ID}`);
  });

  it('routes a plain click with the folder and the latest stored record', () => {
    const navigate = vi.spyOn(harness.navigation, 'navigate').mockImplementation(() => {});
    const row = link();
    // A storage update may replace the record without redrawing this row.
    const latest = { ...harness.store.data.folderContents['folder-1'][0], lastOpenedAt: 100 };
    harness.store.data = { ...harness.store.data, folderContents: { 'folder-1': [latest] } };

    const click = new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 });
    expect(row.dispatchEvent(click)).toBe(false);
    expect(navigate).toHaveBeenCalledExactlyOnceWith(latest, 'folder-1');
  });

  it('leaves modified and middle clicks to the browser', () => {
    const navigate = vi.spyOn(harness.navigation, 'navigate').mockImplementation(() => {});
    const ctrlClick = new MouseEvent('click', {
      bubbles: true,
      cancelable: true,
      button: 0,
      ctrlKey: true,
    });
    expect(link().dispatchEvent(ctrlClick)).toBe(true);

    const middleClick = new MouseEvent('auxclick', { bubbles: true, cancelable: true, button: 1 });
    expect(link().dispatchEvent(middleClick)).toBe(true);
    expect(navigate).not.toHaveBeenCalled();
  });
});
