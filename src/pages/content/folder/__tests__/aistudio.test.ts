import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { AIStudioFolderManager, mutationAddsPromptLinks, parseDragDataPayload } from '../aistudio';
import type { Folder } from '../types';

type DragDataTransferMock = {
  effectAllowed: string;
  setData: ReturnType<typeof vi.fn>;
  setDragImage: ReturnType<typeof vi.fn>;
};

function createPromptRow(
  promptId: string,
  title: string,
): {
  root: HTMLElement;
  row: HTMLElement;
  host: HTMLElement;
  anchor: HTMLAnchorElement;
} {
  const root = document.createElement('ms-prompt-history-v3');
  const row = document.createElement('div');
  row.setAttribute('data-test-id', `history-item-${promptId}`);
  const li = document.createElement('li');
  const anchor = document.createElement('a');
  anchor.className = 'prompt-link';
  anchor.setAttribute('href', `/prompts/${promptId}`);
  anchor.textContent = title;
  li.appendChild(anchor);
  row.appendChild(li);
  root.appendChild(row);
  document.body.appendChild(root);
  return { root, row, host: li, anchor };
}

function createHistoryPopoverPromptLink(
  promptId: string,
  title: string,
  href: string = `/prompts/${promptId}`,
): {
  overlay: HTMLElement;
  row: HTMLElement;
  anchor: HTMLAnchorElement;
} {
  const overlay = document.createElement('div');
  overlay.className = 'cdk-overlay-pane';
  const row = document.createElement('div');
  row.setAttribute('role', 'listitem');
  const anchor = document.createElement('a');
  anchor.setAttribute('href', href);
  anchor.textContent = title;
  row.appendChild(anchor);
  overlay.appendChild(row);
  document.body.appendChild(overlay);
  return { overlay, row, anchor };
}

function createLibraryPromptRow(
  promptId: string,
  title: string,
): {
  table: HTMLTableElement;
  row: HTMLTableRowElement;
  anchor: HTMLAnchorElement;
  moreButton: HTMLButtonElement;
} {
  let table = document.querySelector('table.mat-mdc-table') as HTMLTableElement | null;
  if (!table) {
    table = document.createElement('table');
    table.className = 'mat-mdc-table';
    document.body.appendChild(table);
  }

  const row = document.createElement('tr');
  row.className = 'mat-mdc-row';

  const nameCell = document.createElement('td');
  const anchor = document.createElement('a');
  anchor.className = 'name-link';
  anchor.setAttribute('href', `/prompts/${promptId}`);
  anchor.textContent = title;
  nameCell.appendChild(anchor);
  row.appendChild(nameCell);

  const actionCell = document.createElement('td');
  const moreButton = document.createElement('button');
  moreButton.setAttribute('aria-label', 'More options');
  moreButton.textContent = 'more_vert';
  actionCell.appendChild(moreButton);
  row.appendChild(actionCell);

  table.appendChild(row);
  return { table, row, anchor, moreButton };
}

type AIStudioManagerInternals = {
  container: HTMLElement | null;
  activeFolderInput: HTMLElement | null;
  data: {
    folders: Folder[];
    folderContents: Record<
      string,
      Array<{
        conversationId: string;
        title: string;
        url: string;
        addedAt: number;
        customTitle?: boolean;
      }>
    >;
  };
  historyRoot: HTMLElement | null;
  observePromptList: () => void;
  observeLibraryTable: () => void;
  bindDraggablesInLibraryTable: () => void;
  syncConversationTitlesFromPromptList: () => Promise<void>;
  createFolder: (parentId?: string | null) => void;
  renameFolder: (folderId: string) => void;
  deleteFolder: (folderId: string) => void;
  save: () => Promise<void>;
  render: () => void;
};

function createFolderFixture(overrides: Partial<Folder> = {}): Folder {
  return {
    id: 'folder-a',
    name: 'Alpha',
    parentId: null,
    isExpanded: true,
    createdAt: 100,
    updatedAt: 100,
    ...overrides,
  };
}

function mountAIStudioFolderList(internals: AIStudioManagerInternals): HTMLElement {
  const container = document.createElement('div');
  container.className = 'gv-folder-container gv-aistudio';
  const list = document.createElement('div');
  list.className = 'gv-folder-list';
  container.appendChild(list);
  document.body.appendChild(container);
  internals.container = container;
  return list;
}

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  document.body.innerHTML = '';
});

describe('AIStudio inline folder editing', () => {
  it('reuses the active create input instead of opening duplicates', () => {
    const manager = new AIStudioFolderManager();
    const internals = manager as unknown as AIStudioManagerInternals;
    mountAIStudioFolderList(internals);

    internals.createFolder();

    const input = document.querySelector('.gv-folder-name-input') as HTMLInputElement | null;
    expect(input).not.toBeNull();
    expect(document.querySelectorAll('.gv-folder-inline-input')).toHaveLength(1);
    expect(internals.activeFolderInput).not.toBeNull();

    const focusTrap = document.createElement('button');
    document.body.appendChild(focusTrap);
    focusTrap.focus();
    expect(document.activeElement).toBe(focusTrap);

    internals.createFolder();

    expect(document.querySelectorAll('.gv-folder-inline-input')).toHaveLength(1);
    expect(document.activeElement).toBe(input);
  });

  it('saves a trimmed root folder from the inline input', async () => {
    const manager = new AIStudioFolderManager();
    const internals = manager as unknown as AIStudioManagerInternals;
    mountAIStudioFolderList(internals);
    const saveSpy = vi.fn<() => Promise<void>>().mockResolvedValue(undefined);
    internals.save = saveSpy;
    const renderSpy = vi.spyOn(internals, 'render');

    internals.createFolder();
    const input = document.querySelector('.gv-folder-name-input') as HTMLInputElement;
    input.value = '  Project Alpha  ';
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    await Promise.resolve();

    expect(internals.data.folders).toHaveLength(1);
    expect(internals.data.folders[0]?.name).toBe('Project Alpha');
    expect(internals.data.folders[0]?.parentId).toBeNull();
    expect(saveSpy).toHaveBeenCalledTimes(1);
    expect(renderSpy).toHaveBeenCalledTimes(1);
    expect(document.querySelector('.gv-folder-inline-input')).toBeNull();
  });

  it('cancels inline root creation without saving data', () => {
    const manager = new AIStudioFolderManager();
    const internals = manager as unknown as AIStudioManagerInternals;
    mountAIStudioFolderList(internals);
    const saveSpy = vi.fn<() => Promise<void>>().mockResolvedValue(undefined);
    internals.save = saveSpy;

    internals.createFolder();
    const input = document.querySelector('.gv-folder-name-input') as HTMLInputElement;
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));

    expect(internals.data.folders).toHaveLength(0);
    expect(saveSpy).not.toHaveBeenCalled();
    expect(document.querySelector('.gv-folder-inline-input')).toBeNull();
    expect(internals.activeFolderInput).toBeNull();
  });

  it('creates subfolders inline under the selected parent', async () => {
    const manager = new AIStudioFolderManager();
    const internals = manager as unknown as AIStudioManagerInternals;
    mountAIStudioFolderList(internals);
    internals.data = {
      folders: [createFolderFixture({ id: 'parent', name: 'Parent' })],
      folderContents: { parent: [] },
    };
    const saveSpy = vi.fn<() => Promise<void>>().mockResolvedValue(undefined);
    internals.save = saveSpy;
    internals.render();

    internals.createFolder('parent');

    const parentContent = document.querySelector('[data-folder-id="parent"] .gv-folder-content');
    expect(parentContent?.querySelector('.gv-folder-inline-input')).not.toBeNull();

    const input = document.querySelector('.gv-folder-name-input') as HTMLInputElement;
    input.value = 'Child';
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    await Promise.resolve();

    const child = internals.data.folders.find((folder) => folder.name === 'Child');
    expect(child?.parentId).toBe('parent');
    expect(saveSpy).toHaveBeenCalledTimes(1);
  });

  it('renames folders inline from double-click and restores on empty names', async () => {
    const manager = new AIStudioFolderManager();
    const internals = manager as unknown as AIStudioManagerInternals;
    mountAIStudioFolderList(internals);
    internals.data = {
      folders: [createFolderFixture()],
      folderContents: { 'folder-a': [] },
    };
    const saveSpy = vi.fn<() => Promise<void>>().mockResolvedValue(undefined);
    internals.save = saveSpy;
    internals.render();

    const name = document.querySelector('.gv-folder-name') as HTMLElement;
    name.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));

    const emptyInput = document.querySelector('.gv-folder-rename-input') as HTMLInputElement;
    expect(emptyInput.value).toBe('Alpha');
    emptyInput.value = '   ';
    emptyInput.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));

    expect(saveSpy).not.toHaveBeenCalled();
    expect(document.querySelector('.gv-folder-rename-input')).toBeNull();
    expect(name.classList.contains('gv-hidden')).toBe(false);

    name.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
    const input = document.querySelector('.gv-folder-rename-input') as HTMLInputElement;
    input.value = 'Beta';
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    await Promise.resolve();

    expect(internals.data.folders[0]?.name).toBe('Beta');
    expect(internals.data.folders[0]?.updatedAt).toBeGreaterThan(100);
    expect(saveSpy).toHaveBeenCalledTimes(1);
  });

  it('opens inline rename from the folder context menu', () => {
    const manager = new AIStudioFolderManager();
    const internals = manager as unknown as AIStudioManagerInternals;
    mountAIStudioFolderList(internals);
    internals.data = {
      folders: [createFolderFixture()],
      folderContents: { 'folder-a': [] },
    };
    internals.render();

    const moreBtn = document.querySelector('.gv-folder-actions-btn') as HTMLButtonElement;
    moreBtn.dispatchEvent(new MouseEvent('click', { bubbles: true, clientX: 20, clientY: 20 }));
    const renameItem = Array.from(document.querySelectorAll('.gv-context-menu button')).find(
      (button) => button.textContent === 'folder_rename',
    ) as HTMLButtonElement | undefined;

    expect(renameItem).not.toBeUndefined();
    renameItem?.click();

    const input = document.querySelector('.gv-folder-rename-input') as HTMLInputElement | null;
    expect(input?.value).toBe('Alpha');
  });

  it('uses an in-page delete confirmation instead of window.confirm', async () => {
    const manager = new AIStudioFolderManager();
    const internals = manager as unknown as AIStudioManagerInternals;
    mountAIStudioFolderList(internals);
    internals.data = {
      folders: [
        createFolderFixture({ id: 'folder-a', name: 'Alpha' }),
        createFolderFixture({ id: 'child-a', name: 'Child', parentId: 'folder-a' }),
        createFolderFixture({ id: 'folder-b', name: 'Beta' }),
      ],
      folderContents: {
        'folder-a': [],
        'child-a': [],
        'folder-b': [],
      },
    };
    const saveSpy = vi.fn<() => Promise<void>>().mockResolvedValue(undefined);
    internals.save = saveSpy;
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
    internals.render();

    internals.deleteFolder('folder-a');

    expect(confirmSpy).not.toHaveBeenCalled();
    const dialog = document.querySelector('.gv-folder-confirm-dialog.gv-aistudio-confirm');
    expect(dialog).not.toBeNull();

    const confirmBtn = dialog?.querySelector('.gv-confirm-delete') as HTMLButtonElement;
    confirmBtn.click();
    await Promise.resolve();
    await Promise.resolve();

    expect(internals.data.folders.map((folder) => folder.id)).toEqual(['folder-b']);
    expect(internals.data.folderContents['folder-a']).toBeUndefined();
    expect(internals.data.folderContents['child-a']).toBeUndefined();
    expect(saveSpy).toHaveBeenCalledTimes(1);
    expect(document.querySelector('.gv-folder-confirm-dialog.gv-aistudio-confirm')).toBeNull();
  });
});

describe('AIStudio prompt binding performance guards', () => {
  it('detects prompt-link additions in mutations', () => {
    const wrapper = document.createElement('div');
    const promptAnchor = document.createElement('a');
    promptAnchor.className = 'prompt-link';
    promptAnchor.setAttribute('href', '/prompts/abc');
    wrapper.appendChild(promptAnchor);

    const hitMutation = {
      addedNodes: [wrapper],
    } as unknown as MutationRecord;
    const missMutation = {
      addedNodes: [document.createElement('span')],
    } as unknown as MutationRecord;

    expect(mutationAddsPromptLinks([hitMutation])).toBe(true);
    expect(mutationAddsPromptLinks([missMutation])).toBe(false);
  });

  it('detects body-level history popover prompt link additions', () => {
    const { overlay } = createHistoryPopoverPromptLink('hover123', 'Hover Prompt Title');

    const mutation = {
      addedNodes: [overlay],
    } as unknown as MutationRecord;

    expect(mutationAddsPromptLinks([mutation])).toBe(true);
  });

  it('detects absolute AI Studio prompt links in popovers', () => {
    const overlay = document.createElement('div');
    overlay.className = 'cdk-overlay-pane';
    const anchor = document.createElement('a');
    anchor.href = 'https://aistudio.google.com/prompts/absolute123';
    anchor.textContent = 'Absolute Prompt Title';
    overlay.appendChild(anchor);

    const mutation = {
      addedNodes: [overlay],
    } as unknown as MutationRecord;

    expect(mutationAddsPromptLinks([mutation])).toBe(true);
  });

  it('detects account-prefixed AI Studio prompt links in popovers', () => {
    const { overlay: relativeOverlay } = createHistoryPopoverPromptLink(
      'accountRelative123',
      'Account Relative Prompt',
      '/u/1/prompts/accountRelative123',
    );
    const absoluteOverlay = document.createElement('div');
    absoluteOverlay.className = 'cdk-overlay-pane';
    const absoluteAnchor = document.createElement('a');
    absoluteAnchor.href = 'https://aistudio.google.com/u/2/prompts/accountAbsolute123';
    absoluteAnchor.textContent = 'Account Absolute Prompt';
    absoluteOverlay.appendChild(absoluteAnchor);

    expect(
      mutationAddsPromptLinks([{ addedNodes: [relativeOverlay] } as unknown as MutationRecord]),
    ).toBe(true);
    expect(
      mutationAddsPromptLinks([{ addedNodes: [absoluteOverlay] } as unknown as MutationRecord]),
    ).toBe(true);
  });

  it('parses fallback URL payloads used by Firefox native drag data', () => {
    const fromUriList = parseDragDataPayload('https://aistudio.google.com/prompts/xyz987');
    expect(fromUriList?.conversationId).toBe('xyz987');

    const fromMozUrl = parseDragDataPayload(
      'https://aistudio.google.com/prompts/abc555\nPrompt title from firefox',
    );
    expect(fromMozUrl?.conversationId).toBe('abc555');
  });

  it('binds drag handler once per host and marks anchors as bound', () => {
    const { root, row, host, anchor } = createPromptRow('abc123', 'Prompt Title');
    const manager = new AIStudioFolderManager();
    const bindDraggablesInPromptList = (
      manager as unknown as {
        bindDraggablesInPromptList: (scope?: ParentNode | null) => void;
      }
    ).bindDraggablesInPromptList.bind(manager);

    bindDraggablesInPromptList(root);
    bindDraggablesInPromptList(root);

    expect(anchor.dataset.gvDragBound).toBe('1');
    expect(row.draggable).toBe(true);
    expect(host.draggable).toBe(false);

    const transfer: DragDataTransferMock = {
      effectAllowed: '',
      setData: vi.fn(),
      setDragImage: vi.fn(),
    };
    const dragstart = new Event('dragstart') as DragEvent;
    Object.defineProperty(dragstart, 'dataTransfer', {
      value: transfer,
      configurable: true,
    });

    row.dispatchEvent(dragstart);

    const calls = transfer.setData.mock.calls as Array<[string, string]>;
    expect(calls.length).toBeGreaterThanOrEqual(2);
    expect(calls).toEqual(
      expect.arrayContaining([
        ['application/json', expect.stringContaining('"conversationId":"abc123"')],
        ['text/plain', expect.stringContaining('"conversationId":"abc123"')],
      ]),
    );
  });

  it('uses aria-label/title fallback for drag payload titles when text is missing', () => {
    const { root, row, anchor } = createPromptRow('abc124', '');
    anchor.setAttribute('aria-label', 'Native prompt title');
    anchor.setAttribute('title', 'Backup title');

    const manager = new AIStudioFolderManager();
    const bindDraggablesInPromptList = (
      manager as unknown as {
        bindDraggablesInPromptList: (scope?: ParentNode | null) => void;
      }
    ).bindDraggablesInPromptList.bind(manager);

    bindDraggablesInPromptList(root);

    const transfer: DragDataTransferMock = {
      effectAllowed: '',
      setData: vi.fn(),
      setDragImage: vi.fn(),
    };
    const dragstart = new Event('dragstart') as DragEvent;
    Object.defineProperty(dragstart, 'dataTransfer', {
      value: transfer,
      configurable: true,
    });

    row.dispatchEvent(dragstart);

    const jsonPayload = (transfer.setData.mock.calls as Array<[string, string]>).find(
      ([type]) => type === 'application/json',
    )?.[1];
    expect(jsonPayload).toBeTruthy();
    expect(JSON.parse(jsonPayload || '{}')).toMatchObject({
      conversationId: 'abc124',
      title: 'Native prompt title',
    });
  });

  it('preserves titles when dragging from the body-level history popover', () => {
    const { row, anchor } = createHistoryPopoverPromptLink('hover456', 'Hover Prompt Title');
    const manager = new AIStudioFolderManager();
    const bindDraggablesInPromptList = (
      manager as unknown as {
        bindDraggablesInPromptList: (scope?: ParentNode | null) => void;
      }
    ).bindDraggablesInPromptList.bind(manager);

    bindDraggablesInPromptList(document.body);

    expect(anchor.dataset.gvDragBound).toBe('1');
    expect(row.draggable).toBe(true);

    const transfer: DragDataTransferMock = {
      effectAllowed: '',
      setData: vi.fn(),
      setDragImage: vi.fn(),
    };
    const dragstart = new Event('dragstart', { bubbles: true, cancelable: true }) as DragEvent;
    Object.defineProperty(dragstart, 'dataTransfer', {
      value: transfer,
      configurable: true,
    });

    anchor.dispatchEvent(dragstart);

    const jsonPayload = (transfer.setData.mock.calls as Array<[string, string]>).find(
      ([type]) => type === 'application/json',
    )?.[1];
    expect(jsonPayload).toBeTruthy();
    expect(JSON.parse(jsonPayload || '{}')).toMatchObject({
      conversationId: 'hover456',
      title: 'Hover Prompt Title',
      url: expect.stringMatching(/\/prompts\/hover456$/),
    });
  });

  it('preserves titles when dragging from account-prefixed history popovers', () => {
    const { row, anchor } = createHistoryPopoverPromptLink(
      'accountHover456',
      'Account Hover Prompt Title',
      '/u/1/prompts/accountHover456',
    );
    const manager = new AIStudioFolderManager();
    const bindDraggablesInPromptList = (
      manager as unknown as {
        bindDraggablesInPromptList: (scope?: ParentNode | null) => void;
      }
    ).bindDraggablesInPromptList.bind(manager);

    bindDraggablesInPromptList(document.body);

    expect(anchor.dataset.gvDragBound).toBe('1');
    expect(row.draggable).toBe(true);

    const transfer: DragDataTransferMock = {
      effectAllowed: '',
      setData: vi.fn(),
      setDragImage: vi.fn(),
    };
    const dragstart = new Event('dragstart', { bubbles: true, cancelable: true }) as DragEvent;
    Object.defineProperty(dragstart, 'dataTransfer', {
      value: transfer,
      configurable: true,
    });

    anchor.dispatchEvent(dragstart);

    const jsonPayload = (transfer.setData.mock.calls as Array<[string, string]>).find(
      ([type]) => type === 'application/json',
    )?.[1];
    expect(jsonPayload).toBeTruthy();
    expect(JSON.parse(jsonPayload || '{}')).toMatchObject({
      conversationId: 'accountHover456',
      title: 'Account Hover Prompt Title',
      url: expect.stringMatching(/\/u\/1\/prompts\/accountHover456$/),
    });
  });

  it('supports multi-select on AI Studio library rows', async () => {
    vi.useFakeTimers();
    const first = createLibraryPromptRow('library111', 'First Library Prompt');
    const second = createLibraryPromptRow('library222', 'Second Library Prompt');
    const manager = new AIStudioFolderManager();
    const internals = manager as unknown as AIStudioManagerInternals;

    internals.bindDraggablesInLibraryTable();

    first.row.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0 }));
    await vi.advanceTimersByTimeAsync(500);

    expect(first.row.classList.contains('gv-library-row-selected')).toBe(true);
    expect(
      document.querySelector(
        '[data-multi-select-floating-host="true"] [data-selection-count="true"]',
      )?.textContent,
    ).toBe('1 selected');

    second.row.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));

    expect(second.row.classList.contains('gv-library-row-selected')).toBe(true);
    expect(
      document.querySelector(
        '[data-multi-select-floating-host="true"] [data-selection-count="true"]',
      )?.textContent,
    ).toBe('2 selected');
  });

  it('does not re-bind library rows when the floating multi-select host changes', async () => {
    createLibraryPromptRow('library333', 'Loop Guard Prompt');
    const manager = new AIStudioFolderManager();
    const internals = manager as unknown as AIStudioManagerInternals;
    const bindSpy = vi.fn();

    internals.bindDraggablesInLibraryTable = bindSpy;
    internals.observeLibraryTable();

    const floatingHost = document.createElement('div');
    floatingHost.dataset.multiSelectFloatingHost = 'true';
    document.body.appendChild(floatingHost);
    floatingHost.appendChild(document.createElement('button'));

    await Promise.resolve();

    expect(bindSpy).not.toHaveBeenCalled();
  });
});

describe('AIStudio theme compatibility', () => {
  it('uses body light/dark theme selectors for folder palette variables', () => {
    const css = readFileSync(resolve(process.cwd(), 'public/contentStyle.css'), 'utf8');

    expect(css).toContain('.theme-host.dark-theme,\nbody.dark-theme');
    expect(css).toContain('.theme-host.light-theme,\nbody.light-theme');
    expect(css).toContain('body.dark-theme .gv-folder-action-btn:hover');
  });

  it('renders cloud action icons with currentColor in AI Studio', () => {
    const code = readFileSync(
      resolve(process.cwd(), 'src/pages/content/folder/aistudio.ts'),
      'utf8',
    );

    expect(code).toContain('fill="currentColor"');
    expect(code).not.toContain('fill="#e3e3e3"');
  });
});

describe('AIStudio conversation title sync', () => {
  it('syncs stored conversation titles from native prompt links', async () => {
    createPromptRow('abc123', 'Renamed in AI Studio');
    const manager = new AIStudioFolderManager();
    const internals = manager as unknown as AIStudioManagerInternals;

    internals.data = {
      folders: [],
      folderContents: {
        folderA: [
          {
            conversationId: 'abc123',
            title: 'Old title',
            url: '/prompts/abc123',
            addedAt: Date.now(),
          },
        ],
      },
    };

    const saveSpy = vi.fn<() => Promise<void>>().mockResolvedValue(undefined);
    const renderSpy = vi.fn<() => void>();
    internals.save = saveSpy;
    internals.render = renderSpy;

    await internals.syncConversationTitlesFromPromptList();

    expect(internals.data.folderContents.folderA[0]?.title).toBe('Renamed in AI Studio');
    expect(saveSpy).toHaveBeenCalledTimes(1);
    expect(renderSpy).toHaveBeenCalledTimes(1);
  });

  it('does not overwrite custom titles during native sync', async () => {
    createPromptRow('abc999', 'Native New Name');
    const manager = new AIStudioFolderManager();
    const internals = manager as unknown as AIStudioManagerInternals;

    internals.data = {
      folders: [],
      folderContents: {
        folderA: [
          {
            conversationId: 'abc999',
            title: 'Manually Renamed',
            url: '/prompts/abc999',
            addedAt: Date.now(),
            customTitle: true,
          },
        ],
      },
    };

    const saveSpy = vi.fn<() => Promise<void>>().mockResolvedValue(undefined);
    const renderSpy = vi.fn<() => void>();
    internals.save = saveSpy;
    internals.render = renderSpy;

    await internals.syncConversationTitlesFromPromptList();

    expect(internals.data.folderContents.folderA[0]?.title).toBe('Manually Renamed');
    expect(saveSpy).not.toHaveBeenCalled();
    expect(renderSpy).not.toHaveBeenCalled();
  });

  it('observes prompt title mutations and syncs with debounce', async () => {
    vi.useFakeTimers();
    const { root, anchor } = createPromptRow('debounce1', 'Before Rename');
    const manager = new AIStudioFolderManager();
    const internals = manager as unknown as AIStudioManagerInternals;

    internals.data = {
      folders: [],
      folderContents: {
        folderA: [
          {
            conversationId: 'debounce1',
            title: 'Before Rename',
            url: '/prompts/debounce1',
            addedAt: Date.now(),
          },
        ],
      },
    };
    internals.historyRoot = root;

    const saveSpy = vi.fn<() => Promise<void>>().mockResolvedValue(undefined);
    const renderSpy = vi.fn<() => void>();
    internals.save = saveSpy;
    internals.render = renderSpy;

    internals.observePromptList();

    anchor.textContent = 'After Rename';
    await vi.advanceTimersByTimeAsync(350);

    expect(internals.data.folderContents.folderA[0]?.title).toBe('After Rename');
    expect(saveSpy).toHaveBeenCalledTimes(1);
    expect(renderSpy).toHaveBeenCalledTimes(1);
  });
});
