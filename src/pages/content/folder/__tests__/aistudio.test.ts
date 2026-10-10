import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { createToaster } from '@/core/ui/toast/toaster';
import { confirmDriver } from '@/tests/confirmDriver';
import { toastDriver } from '@/tests/toastDriver';
import { createTranslator } from '@/utils/i18n';

import { AIStudioFolderManager } from '../aistudio';
import { LibrarySelection } from '../aistudioLibrarySelection';
import { bindLibraryRows, watchLibraryTable } from '../aistudioLibraryTable';
import { buildFolderPanel } from '../aistudioPanel';
import { bindPromptDragSources, watchPromptHistory } from '../aistudioPromptHistory';
import { mutationAddsPromptLinks, parseDragDataPayload } from '../aistudioPromptLinks';

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
  data: {
    folders: Array<{
      id: string;
      name: string;
      parentId: string | null;
      isExpanded: boolean;
      createdAt: number;
      updatedAt: number;
    }>;
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
  dataSession: { ready: boolean };
  syncConversationTitlesFromPromptList: () => Promise<void>;
  save: () => Promise<boolean>;
  render: () => void;
};

afterEach(() => {
  vi.useRealTimers();
  document.body.innerHTML = '';
  window.history.replaceState({}, '', '/');
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
    bindPromptDragSources(root);
    bindPromptDragSources(root);

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

    bindPromptDragSources(root);

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
    bindPromptDragSources(document.body);

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
    bindPromptDragSources(document.body);

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
    const selection = new LibrarySelection(createTranslator(), vi.fn(), createToaster());

    bindLibraryRows((row) => selection.bindRow(row));

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

  it('asks before deleting the selected library prompts, and answering keeps the selection', async () => {
    vi.useFakeTimers();
    const doomed = createLibraryPromptRow('library444', 'Doomed Prompt');
    const notify = vi.fn();
    const selection = new LibrarySelection(createTranslator(), notify, createToaster());
    bindLibraryRows((row) => selection.bindRow(row));
    doomed.row.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0 }));
    await vi.advanceTimersByTimeAsync(500);
    await vi.advanceTimersByTimeAsync(0);
    const deleteButton = () =>
      document.querySelector<HTMLButtonElement>('.gv-multi-select-delete-btn')!;

    deleteButton().click();
    expect(confirmDriver.message()).toBe(
      'Are you sure you want to delete 1 conversation(s)? This action cannot be undone.',
    );
    expect(confirmDriver.focusedLabel()).toBe('Cancel');
    confirmDriver.answer('Cancel');
    await vi.advanceTimersByTimeAsync(0);
    expect(doomed.row.classList.contains('gv-library-row-selected')).toBe(true);

    deleteButton().click();
    confirmDriver.answer('Delete');
    await vi.advanceTimersByTimeAsync(0);
    expect(toastDriver.find('Deleting...')).toMatchObject({ pending: true });

    // AI Studio never opens a row menu here, so the one deletion fails.
    await vi.advanceTimersByTimeAsync(10_000);
    expect(toastDriver.find('Deleting...')).toBeUndefined();
    expect(notify).toHaveBeenCalledWith('Deletion complete: 0 succeeded, 1 failed', 'warning');
    expect(doomed.row.classList.contains('gv-library-row-selected')).toBe(false);
  });

  it('does not re-bind library rows when the floating multi-select host changes', async () => {
    window.history.replaceState({}, '', '/library');
    createLibraryPromptRow('library333', 'Loop Guard Prompt');
    const bindSpy = vi.fn();
    const stop = watchLibraryTable(bindSpy);

    const floatingHost = document.createElement('div');
    floatingHost.dataset.multiSelectFloatingHost = 'true';
    document.body.appendChild(floatingHost);
    floatingHost.appendChild(document.createElement('button'));

    await Promise.resolve();

    expect(bindSpy).not.toHaveBeenCalled();
    stop();
  });
});

describe('AIStudio theme compatibility', () => {
  it('defines the folder palette for both schemes, on every platform at once', () => {
    // This used to require AI Studio's own body selector. The palette hangs off
    // the shared scheme hook now, so AI Studio, DeepSeek and whatever comes next
    // are covered by the same two blocks.
    const css = readFileSync(resolve(process.cwd(), 'public/contentStyle.css'), 'utf8');
    const palettes = [...css.matchAll(/([^{}]+)\{([^{}]*--folder-bg[^{}]*)\}/g)];

    for (const scheme of ['dark', 'light']) {
      const hit = palettes.find(([, selector]) =>
        selector.includes(`html[data-gv-scheme='${scheme}']`),
      );
      expect(hit, `no --folder-bg block for ${scheme}`).toBeTruthy();
    }
    const headerCss = readFileSync(
      resolve(process.cwd(), 'src/pages/content/folder/folderHeader/folderHeader.css'),
      'utf8',
    );
    expect(headerCss).toContain("html[data-gv-scheme='dark'] .gv-folder-action-btn:hover");
  });

  it('renders cloud action icons with currentColor in AI Studio', () => {
    const { container } = buildFolderPanel(
      {
        t: (key) => key,
        onCloudUpload: vi.fn(),
        onCloudSync: vi.fn(),
        uploadTooltip: async () => '',
        syncTooltip: async () => '',
        onCreateFolder: vi.fn(),
      },
      true,
    );
    const fills = [...container.querySelectorAll('svg')].map((svg) => svg.getAttribute('fill'));

    expect(fills).toEqual(['currentColor', 'currentColor']);
  });
});

describe('AIStudio conversation title sync', () => {
  it('syncs stored conversation titles from native prompt links', async () => {
    createPromptRow('abc123', 'Renamed in AI Studio');
    const manager = new AIStudioFolderManager();
    const internals = manager as unknown as AIStudioManagerInternals;
    internals.dataSession.ready = true;

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

    const saveSpy = vi.fn<() => Promise<boolean>>().mockResolvedValue(true);
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
    internals.dataSession.ready = true;

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

    const saveSpy = vi.fn<() => Promise<boolean>>().mockResolvedValue(true);
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
    internals.dataSession.ready = true;

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
    const saveSpy = vi.fn<() => Promise<boolean>>().mockResolvedValue(true);
    const renderSpy = vi.fn<() => void>();
    internals.save = saveSpy;
    internals.render = renderSpy;

    const stop = watchPromptHistory(root, {
      hasStoredPrompts: () => true,
      syncTitles: () => internals.syncConversationTitlesFromPromptList(),
      onPromptClick: vi.fn(),
    });

    anchor.textContent = 'After Rename';
    await vi.advanceTimersByTimeAsync(350);

    expect(internals.data.folderContents.folderA[0]?.title).toBe('After Rename');
    expect(saveSpy).toHaveBeenCalledTimes(1);
    expect(renderSpy).toHaveBeenCalledTimes(1);
    stop();
  });
});
