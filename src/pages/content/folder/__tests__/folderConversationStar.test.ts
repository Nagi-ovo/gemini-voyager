import { afterEach, describe, expect, it, vi } from 'vitest';

import type { ConversationReference, FolderData } from '../types';
import { createFolderViewHarness, resetFolderViewBrowserMocks } from './folderViewHarness';
import { sidebarTree } from './sidebarTreeDriver';

vi.mock('webextension-polyfill', () => ({ default: chrome }));

vi.mock('@/utils/i18n', () => ({
  getTranslationSync: (key: string) => key,
  getTranslationSyncUnsafe: (key: string) => key,
  initI18n: () => Promise.resolve(),
}));

const folder = (id: string, name: string, sortIndex: number) => ({
  id,
  name,
  parentId: null,
  isExpanded: true,
  sortIndex,
  createdAt: 1,
  updatedAt: 1,
});

/**
 * "Shared" is filed in Project as `c_shared` and in Copy as `shared`, the two
 * spellings Gemini records hold for one chat. "Other" sorts first in Copy
 * while neither chat is starred.
 */
function data(stars: { project?: boolean; copy?: boolean }): FolderData {
  const shared: ConversationReference = {
    conversationId: 'shared',
    title: 'Shared',
    url: 'https://gemini.google.com/app/shared',
    addedAt: 1,
  };
  return {
    folders: [folder('project', 'Project', 0), folder('copy', 'Copy', 1)],
    folderContents: {
      project: [{ ...shared, conversationId: 'c_shared', starred: stars.project }],
      copy: [
        { ...shared, starred: stars.copy },
        {
          conversationId: 'other',
          title: 'Other',
          url: 'https://gemini.google.com/app/other',
          addedAt: 2,
        },
      ],
    },
  };
}

describe('Gemini folder tree: a star belongs to the conversation', () => {
  let harness: Awaited<ReturnType<typeof createFolderViewHarness>>;

  async function mount(stored: FolderData) {
    resetFolderViewBrowserMocks();
    harness = await createFolderViewHarness(stored);
    return sidebarTree(harness.runtime.panel);
  }

  const storedStars = () =>
    Object.values(harness.saved.folderContents)
      .flat()
      .filter((c) => c.title === 'Shared')
      .map((c) => !!c.starred);

  afterEach(() => {
    harness?.destroy();
    document.body.innerHTML = '';
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it('starring a chat filed in two folders stars it in both', async () => {
    const view = await mount(data({}));

    view.toggleStar('project', 'Shared');
    await vi.waitFor(() => expect(storedStars()).toEqual([true, true]));

    expect(view.isStarred('project', 'Shared')).toBe(true);
    expect(view.isStarred('copy', 'Shared')).toBe(true);
  });

  it('a chat starred in only one folder shows starred and first in every folder', async () => {
    const view = await mount(data({ project: true }));

    expect(view.isStarred('copy', 'Shared')).toBe(true);
    expect(view.outline()).toEqual(['Project', '  · Shared', 'Copy', '  · Shared', '  · Other']);
  });

  it('unstarring a chat starred in only one folder clears it in every folder', async () => {
    const view = await mount(data({ project: true }));

    view.toggleStar('copy', 'Shared');
    await vi.waitFor(() => expect(storedStars()).toEqual([false, false]));

    expect(view.isStarred('project', 'Shared')).toBe(false);
    expect(view.isStarred('copy', 'Shared')).toBe(false);
  });

  it('an imported copy of a starred chat shows starred and unstars every copy', async () => {
    // An imported record keeps its own id; its link is the chat's real route.
    const stored = data({ project: true });
    stored.folderContents.copy[0] = {
      ...stored.folderContents.copy[0],
      conversationId: 'imported',
    };
    const view = await mount(stored);

    expect(view.isStarred('copy', 'Shared')).toBe(true);

    view.toggleStar('copy', 'Shared');
    await vi.waitFor(() => expect(storedStars()).toEqual([false, false]));
    expect(view.isStarred('project', 'Shared')).toBe(false);
  });

  it('dropping a chat after a starred row places it there when its star is from another folder', async () => {
    const chat = (id: string, starred: boolean, sortIndex: number): ConversationReference => ({
      conversationId: id,
      title: id.toUpperCase(),
      url: `https://gemini.google.com/app/${id}`,
      addedAt: 1,
      starred,
      sortIndex,
    });
    const view = await mount({
      folders: [folder('project', 'Project', 0), folder('copy', 'Copy', 1)],
      folderContents: {
        project: [chat('x', true, 0)],
        copy: [chat('x', false, 0), chat('y', true, 1), chat('z', true, 2)],
      },
    });

    dropAfter(view.conversationRow('copy', 'Y'), view.dragRow('copy', 'X'));

    await vi.waitFor(() =>
      expect(view.outline()).toEqual(['Project', '  · X', 'Copy', '  · Y', '  · X', '  · Z']),
    );
  });

  it('filing a starred chat into another folder keeps it starred after leaving the first', async () => {
    const stored = data({ copy: true });
    stored.folderContents.project = [];
    const view = await mount(stored);

    // Gemini's own row menu files the chat by its native id.
    harness.store.addConversationToFolderFromNative(
      'project',
      'c_shared',
      'Shared',
      'https://gemini.google.com/app/shared',
    );
    harness.store.removeConversationFromFolder('copy', 'shared');

    await vi.waitFor(() => expect(storedStars()).toEqual([true]));
    expect(view.isStarred('project', 'Shared')).toBe(true);
  });
});

/** Drops `transfer` in the lower half of `row`, which places it after the row. */
function dropAfter(
  row: HTMLElement,
  transfer: ReturnType<ReturnType<typeof sidebarTree>['dragRow']>,
) {
  vi.spyOn(row, 'getBoundingClientRect').mockReturnValue(
    DOMRect.fromRect({ width: 200, height: 20 }),
  );
  for (const type of ['dragenter', 'dragover', 'drop']) {
    const event = new Event(type, { bubbles: true, cancelable: true, composed: true });
    Object.defineProperties(event, { dataTransfer: { value: transfer }, clientY: { value: 18 } });
    row.dispatchEvent(event);
  }
}
