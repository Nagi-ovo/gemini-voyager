import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  FLOATING_PANEL_CLASS,
  click,
  contextMenu,
  createConversation,
  createData,
  createDataTransfer,
  createDragEvent,
  createFolder,
  destroyMountedPanels,
  folderHeader,
  installResizeObserverMock,
  keydown,
  mountPanel,
  panelRoot,
  pointerEvent,
  requireElement,
  setElementRect,
  setWindowSize,
  stubPointerCapture,
} from './__tests__/floatingPanelHarness';

vi.mock('@/utils/i18n', () => ({
  getTranslationSyncUnsafe: (key: string) => key,
}));

let originalResizeObserver: typeof ResizeObserver | undefined;
let originalInnerWidth: number;
let originalInnerHeight: number;

afterEach(() => {
  destroyMountedPanels();
  document.body.innerHTML = '';
  vi.restoreAllMocks();
  globalThis.ResizeObserver = originalResizeObserver as typeof ResizeObserver;
  setWindowSize(originalInnerWidth, originalInnerHeight);
});

describe('mountFloatingPanel', () => {
  beforeEach(() => {
    originalResizeObserver = globalThis.ResizeObserver;
    originalInnerWidth = window.innerWidth;
    originalInnerHeight = window.innerHeight;
  });

  it('renders folder conversations and fires navigation from a conversation row', () => {
    const onNavigate = vi.fn();
    const handle = mountPanel({ onNavigate });

    expect(panelRoot(handle).textContent).toContain('Alpha');
    expect(panelRoot(handle).textContent).toContain('Conversation A');

    const title = requireElement<HTMLButtonElement>(
      panelRoot(handle),
      `.${FLOATING_PANEL_CLASS}__conv-title`,
    );
    click(title);

    expect(onNavigate).toHaveBeenCalledWith(expect.objectContaining({ conversationId: 'conv-a' }));
  });

  it('follows the conversation order selected in folder settings', () => {
    const data = createData();
    data.folderContents['folder-a'] = [
      createConversation('manual-first', 'Manual first', { sortIndex: 0, lastOpenedAt: 100 }),
      createConversation('recent-first', 'Recent first', { sortIndex: 1, lastOpenedAt: 200 }),
    ];
    const handle = mountPanel({ data });
    const getOrder = () =>
      Array.from(
        panelRoot(handle).querySelectorAll<HTMLElement>(`.${FLOATING_PANEL_CLASS}__conv`),
      ).map((row) => row.dataset.conversationId);

    expect(getOrder()).toEqual(['manual-first', 'recent-first']);

    expect(
      panelRoot(handle).querySelector(`.${FLOATING_PANEL_CLASS}__icon-button--sort`),
    ).toBeNull();

    handle.update(data, 'recent');
    expect(getOrder()).toEqual(['recent-first', 'manual-first']);
  });

  it('renders the move-to-folder hint above the folder tree', () => {
    const handle = mountPanel();

    const hint = requireElement<HTMLElement>(
      panelRoot(handle),
      `.${FLOATING_PANEL_CLASS}__hint-stack`,
    );

    expect(hint.textContent).toContain('floatingPanelMoveHint');
    expect(hint.textContent).toContain('floatingPanelGestureHint');
  });

  it('fires onCreateFolder for the header create input', () => {
    const onCreateFolder = vi.fn();
    const handle = mountPanel({ onCreateFolder });

    const createButton = requireElement<HTMLButtonElement>(
      panelRoot(handle),
      `.${FLOATING_PANEL_CLASS}__icon-button--create`,
    );
    click(createButton);

    const input = requireElement<HTMLInputElement>(
      panelRoot(handle),
      `.${FLOATING_PANEL_CLASS}__inline-input`,
    );
    input.value = 'New root';
    keydown(input, 'Enter');

    expect(onCreateFolder).toHaveBeenCalledWith('New root', null);
  });

  it('fires onCreateFolder with a parent id from the folder-row add button', () => {
    const onCreateFolder = vi.fn();
    const handle = mountPanel({ onCreateFolder });

    const addChildButton = requireElement<HTMLButtonElement>(
      folderHeader(panelRoot(handle), 'folder-a'),
      `.${FLOATING_PANEL_CLASS}__icon-button--add-child`,
    );
    click(addChildButton);

    const input = requireElement<HTMLInputElement>(
      panelRoot(handle),
      `.${FLOATING_PANEL_CLASS}__inline-input`,
    );
    input.value = 'Nested';
    keydown(input, 'Enter');

    expect(onCreateFolder).toHaveBeenCalledWith('Nested', 'folder-a');
  });

  it('fires onRenameFolder from double-click inline rename', () => {
    const onRenameFolder = vi.fn();
    const handle = mountPanel({ onRenameFolder });

    const name = requireElement<HTMLElement>(
      folderHeader(panelRoot(handle), 'folder-a'),
      `.${FLOATING_PANEL_CLASS}__folder-name`,
    );
    name.dispatchEvent(new MouseEvent('dblclick', { bubbles: true, cancelable: true }));

    const input = requireElement<HTMLInputElement>(
      panelRoot(handle),
      `.${FLOATING_PANEL_CLASS}__inline-input`,
    );
    input.value = 'Renamed';
    keydown(input, 'Enter');

    expect(onRenameFolder).toHaveBeenCalledWith('folder-a', 'Renamed');
  });

  it('fires context-menu pin and delete callbacks without mutating data directly', () => {
    const onToggleFolderPinned = vi.fn();
    const onDeleteFolder = vi.fn();
    const confirmFolderRemoval = vi.fn<(anchor: HTMLElement, onConfirm: () => void) => void>();
    const handle = mountPanel({ onToggleFolderPinned, onDeleteFolder, confirmFolderRemoval });

    contextMenu(folderHeader(panelRoot(handle), 'folder-a'));
    const pinButton = requireElement<HTMLButtonElement>(
      panelRoot(handle),
      `.${FLOATING_PANEL_CLASS}__menu-item`,
    );
    click(pinButton);
    expect(onToggleFolderPinned).toHaveBeenCalledWith('folder-a');

    contextMenu(folderHeader(panelRoot(handle), 'folder-a'));
    const deleteButton = requireElement<HTMLButtonElement>(
      panelRoot(handle),
      `.${FLOATING_PANEL_CLASS}__menu-item--danger`,
    );
    click(deleteButton);

    // The host asks beside the folder's row; nothing is deleted until it answers.
    const [anchor, onConfirm] = confirmFolderRemoval.mock.calls[0];
    expect(anchor).toBe(folderHeader(panelRoot(handle), 'folder-a'));
    expect(onDeleteFolder).not.toHaveBeenCalled();
    onConfirm();

    expect(onDeleteFolder).toHaveBeenCalledWith('folder-a');
    expect(panelRoot(handle).textContent).toContain('Alpha');
  });

  it('fires conversation star and remove callbacks from row action buttons', () => {
    const onToggleStar = vi.fn();
    const onRemoveConversation = vi.fn();
    const handle = mountPanel({ onToggleStar, onRemoveConversation });

    const row = requireElement<HTMLElement>(panelRoot(handle), `.${FLOATING_PANEL_CLASS}__conv`);
    click(requireElement<HTMLButtonElement>(row, `.${FLOATING_PANEL_CLASS}__icon-button--star`));
    click(requireElement<HTMLButtonElement>(row, `.${FLOATING_PANEL_CLASS}__icon-button--remove`));

    expect(onToggleStar).toHaveBeenCalledWith('conv-a', false);
    expect(onRemoveConversation).toHaveBeenCalledWith('folder-a', 'conv-a');
  });

  it('moves an existing floating-panel conversation by dragging it onto another folder', () => {
    const onMoveConversation = vi.fn();
    const handle = mountPanel({ onMoveConversation });
    const row = requireElement<HTMLElement>(
      panelRoot(handle),
      `.${FLOATING_PANEL_CLASS}__conv[data-conversation-id="conv-a"]`,
    );
    const target = folderHeader(panelRoot(handle), 'folder-b');
    const dataTransfer = createDataTransfer();

    row.dispatchEvent(createDragEvent('dragstart', dataTransfer));
    const dragover = createDragEvent('dragover', dataTransfer);
    target.dispatchEvent(dragover);
    target.dispatchEvent(createDragEvent('drop', dataTransfer));

    expect(row.draggable).toBe(true);
    expect(dataTransfer.effectAllowed).toBe('move');
    expect(dragover.defaultPrevented).toBe(true);
    expect(onMoveConversation).toHaveBeenCalledWith('conv-a', 'folder-a', 'folder-b');
  });

  it('does not move anything when a native conversation drag payload is dropped', () => {
    // The panel accepts any `application/json` payload at dragover time — it
    // can't peek at the content then (browser security blocks getData()), so
    // the native "drop target highlight" may flash briefly. The drop handler
    // is where native payloads (no `sourceFolderId`) are actually rejected.
    const onMoveConversation = vi.fn();
    const handle = mountPanel({ onMoveConversation });
    const target = folderHeader(panelRoot(handle), 'folder-b');
    const dataTransfer = createDataTransfer();
    dataTransfer.setData(
      'application/json',
      JSON.stringify({
        type: 'conversation',
        conversationId: 'native-a',
        title: 'Native Conversation A',
        url: 'https://gemini.google.com/app/native-a',
      }),
    );

    target.dispatchEvent(createDragEvent('dragover', dataTransfer));
    target.dispatchEvent(createDragEvent('drop', dataTransfer));

    expect(onMoveConversation).not.toHaveBeenCalled();
  });

  it('suppresses create-subfolder affordances at the floating panel max depth', () => {
    const handle = mountPanel({
      data: {
        folders: [
          createFolder('root', 'Root', null, 0),
          createFolder('child', 'Child', 'root', 0),
          createFolder('grandchild', 'Grandchild', 'child', 0),
        ],
        folderContents: {
          root: [],
          child: [],
          grandchild: [],
        },
      },
    });

    expect(
      folderHeader(panelRoot(handle), 'grandchild').querySelector(
        `.${FLOATING_PANEL_CLASS}__icon-button--add-child`,
      ),
    ).toBeNull();

    contextMenu(folderHeader(panelRoot(handle), 'grandchild'));
    expect(panelRoot(handle).textContent).not.toContain('floatingPanelCreateSubfolder');
  });

  it('cancels create and rename inline forms on outside mousedown', () => {
    const onCreateFolder = vi.fn();
    const onRenameFolder = vi.fn();
    const handle = mountPanel({ onCreateFolder, onRenameFolder });

    click(
      requireElement<HTMLButtonElement>(
        panelRoot(handle),
        `.${FLOATING_PANEL_CLASS}__icon-button--create`,
      ),
    );
    expect(
      panelRoot(handle).querySelector(`.${FLOATING_PANEL_CLASS}__inline-input`),
    ).not.toBeNull();
    document.body.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
    expect(panelRoot(handle).querySelector(`.${FLOATING_PANEL_CLASS}__inline-input`)).toBeNull();
    expect(onCreateFolder).not.toHaveBeenCalled();

    requireElement<HTMLElement>(
      folderHeader(panelRoot(handle), 'folder-a'),
      `.${FLOATING_PANEL_CLASS}__folder-name`,
    ).dispatchEvent(new MouseEvent('dblclick', { bubbles: true, cancelable: true }));
    expect(
      panelRoot(handle).querySelector(`.${FLOATING_PANEL_CLASS}__inline-input`),
    ).not.toBeNull();
    document.body.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
    expect(panelRoot(handle).querySelector(`.${FLOATING_PANEL_CLASS}__inline-input`)).toBeNull();
    expect(onRenameFolder).not.toHaveBeenCalled();
  });

  it('fires onSetFolderColor from the context-menu color swatches', () => {
    const onSetFolderColor = vi.fn();
    const handle = mountPanel({ onSetFolderColor });

    contextMenu(folderHeader(panelRoot(handle), 'folder-a'));
    const redSwatch = requireElement<HTMLButtonElement>(
      panelRoot(handle),
      `.${FLOATING_PANEL_CLASS}__color-swatch[aria-label="folder_color_red"]`,
    );
    click(redSwatch);

    expect(onSetFolderColor).toHaveBeenCalledWith('folder-a', 'red');
  });

  it('renders cloud buttons, fires callbacks, and updates dynamic tooltips', async () => {
    const onCloudUpload = vi.fn();
    const onCloudSync = vi.fn();
    const getCloudUploadTooltip = vi.fn().mockResolvedValue('Upload latest folders');
    const getCloudSyncTooltip = vi.fn().mockResolvedValue('Sync from Drive');
    const handle = mountPanel({
      onCloudUpload,
      onCloudSync,
      getCloudUploadTooltip,
      getCloudSyncTooltip,
    });

    const uploadButton = requireElement<HTMLButtonElement>(
      panelRoot(handle),
      `.${FLOATING_PANEL_CLASS}__icon-button--cloud-upload`,
    );
    const syncButton = requireElement<HTMLButtonElement>(
      panelRoot(handle),
      `.${FLOATING_PANEL_CLASS}__icon-button--cloud-sync`,
    );

    click(uploadButton);
    click(syncButton);
    uploadButton.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));
    syncButton.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));
    await Promise.resolve();

    expect(onCloudUpload).toHaveBeenCalledTimes(1);
    expect(onCloudSync).toHaveBeenCalledTimes(1);
    expect(getCloudUploadTooltip).toHaveBeenCalledTimes(1);
    expect(getCloudSyncTooltip).toHaveBeenCalledTimes(1);
    expect(uploadButton.title).toBe('Upload latest folders');
    expect(syncButton.title).toBe('Sync from Drive');
  });

  it('applies a stored floating panel size on mount', () => {
    const handle = mountPanel({
      storedSize: { w: 500, h: 550 },
    });

    expect(handle.element.style.width).toBe('500px');
    expect(handle.element.style.height).toBe('550px');
  });

  it('clamps stored floating panel size to min and viewport max bounds', () => {
    setWindowSize(700, 500);

    const handle = mountPanel({
      storedSize: { w: 1000, h: 100 },
    });

    expect(handle.element.style.width).toBe('640px');
    expect(handle.element.style.height).toBe('320px');
  });

  it('ignores non-primary-button pointerdown on the header (no right/middle drags)', () => {
    const handle = mountPanel();
    const header = requireElement<HTMLElement>(
      panelRoot(handle),
      `.${FLOATING_PANEL_CLASS}__header`,
    );
    stubPointerCapture(header);
    setElementRect(handle.element, 320, 420);
    const initialLeft = handle.element.style.left;
    const initialTop = handle.element.style.top;

    header.dispatchEvent(pointerEvent('pointerdown', { button: 2, clientX: 700, clientY: 330 }));
    header.dispatchEvent(pointerEvent('pointermove', { clientX: 500, clientY: 200 }));

    expect(handle.element.style.left).toBe(initialLeft);
    expect(handle.element.style.top).toBe(initialTop);
    expect(header.classList.contains(`${FLOATING_PANEL_CLASS}__header--dragging`)).toBe(false);

    // Sanity: a primary-button drag still moves the panel.
    header.dispatchEvent(pointerEvent('pointerdown', { button: 0, clientX: 700, clientY: 330 }));
    header.dispatchEvent(pointerEvent('pointermove', { clientX: 500, clientY: 200 }));

    expect(handle.element.style.left).not.toBe(initialLeft);
    header.dispatchEvent(pointerEvent('pointerup', { button: 0, clientX: 500, clientY: 200 }));
  });

  it('defers a background update while an inline form is focused, applying it on submit', () => {
    const handle = mountPanel();

    click(
      requireElement<HTMLButtonElement>(
        panelRoot(handle),
        `.${FLOATING_PANEL_CLASS}__icon-button--create`,
      ),
    );
    const input = requireElement<HTMLInputElement>(
      panelRoot(handle),
      `.${FLOATING_PANEL_CLASS}__inline-input`,
    );
    input.value = 'Half-typed name';
    input.focus();

    const next = createData();
    next.folders[0] = createFolder('folder-a', 'Alpha Renamed', null, 0);
    handle.update(next);

    // The form (and the user's typed value) must survive the background update.
    const inputAfter = requireElement<HTMLInputElement>(
      panelRoot(handle),
      `.${FLOATING_PANEL_CLASS}__inline-input`,
    );
    expect(inputAfter).toBe(input);
    expect(inputAfter.value).toBe('Half-typed name');
    expect(panelRoot(handle).textContent).toContain('Alpha');
    expect(panelRoot(handle).textContent).not.toContain('Alpha Renamed');

    // Closing the form applies the deferred data.
    keydown(input, 'Enter');
    expect(panelRoot(handle).textContent).toContain('Alpha Renamed');
  });

  it('rebuilds immediately when the folder being renamed was deleted by the update', () => {
    const handle = mountPanel();

    requireElement<HTMLElement>(
      folderHeader(panelRoot(handle), 'folder-a'),
      `.${FLOATING_PANEL_CLASS}__folder-name`,
    ).dispatchEvent(new MouseEvent('dblclick', { bubbles: true, cancelable: true }));
    const input = requireElement<HTMLInputElement>(
      panelRoot(handle),
      `.${FLOATING_PANEL_CLASS}__inline-input`,
    );
    input.focus();

    handle.update({
      folders: [createFolder('folder-b', 'Beta', null, 1)],
      folderContents: { 'folder-b': [] },
    });

    expect(panelRoot(handle).querySelector(`.${FLOATING_PANEL_CLASS}__inline-input`)).toBeNull();
    expect(panelRoot(handle).textContent).not.toContain('Alpha');
  });

  it.each(['create-root', 'create-child', 'rename'] as const)(
    'discards a focused %s draft and old rows on account reset while preserving panel geometry',
    (mode) => {
      const onCreateFolder = vi.fn();
      const onRenameFolder = vi.fn();
      const handle = mountPanel({
        onCreateFolder,
        onRenameFolder,
        storedPos: { x: 24, y: 32 },
        storedSize: { w: 400, h: 500 },
      });
      const geometry = handle.element.style.cssText;
      if (mode === 'rename') {
        requireElement<HTMLElement>(
          folderHeader(panelRoot(handle), 'folder-a'),
          `.${FLOATING_PANEL_CLASS}__folder-name`,
        ).dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
      } else {
        click(
          requireElement<HTMLButtonElement>(
            mode === 'create-root'
              ? panelRoot(handle)
              : folderHeader(panelRoot(handle), 'folder-a'),
            `.${FLOATING_PANEL_CLASS}__icon-button--${mode === 'create-root' ? 'create' : 'add-child'}`,
          ),
        );
      }
      const input = requireElement<HTMLInputElement>(
        panelRoot(handle),
        `.${FLOATING_PANEL_CLASS}__inline-input`,
      );
      input.value = 'Account A private draft';
      input.focus();

      handle.reset({ folders: [], folderContents: {} });

      expect(panelRoot(handle).querySelector(`.${FLOATING_PANEL_CLASS}__inline-input`)).toBeNull();
      expect(panelRoot(handle).querySelector(`.${FLOATING_PANEL_CLASS}__folder`)).toBeNull();
      expect(panelRoot(handle).textContent).not.toContain('Conversation A');
      expect(handle.element.style.cssText).toBe(geometry);
      expect(onCreateFolder).not.toHaveBeenCalled();
      expect(onRenameFolder).not.toHaveBeenCalled();
      const outsideClick = new MouseEvent('mousedown', { bubbles: true, cancelable: true });
      document.body.dispatchEvent(outsideClick);
      expect(outsideClick.defaultPrevented).toBe(false);

      click(
        requireElement<HTMLButtonElement>(
          panelRoot(handle),
          `.${FLOATING_PANEL_CLASS}__icon-button--create`,
        ),
      );
      expect(
        requireElement<HTMLInputElement>(
          panelRoot(handle),
          `.${FLOATING_PANEL_CLASS}__inline-input`,
        ).value,
      ).toBe('');
    },
  );

  it('clears the previous account menu and expansion when the next account reuses folder ids', () => {
    const handle = mountPanel();
    click(folderHeader(panelRoot(handle), 'folder-a'));
    contextMenu(folderHeader(panelRoot(handle), 'folder-a'));
    expect(
      panelRoot(handle).querySelector(`.${FLOATING_PANEL_CLASS}__context-menu`),
    ).not.toBeNull();

    const next = createData();
    next.folders[0].name = 'Other account';
    next.folderContents['folder-a'] = [];
    handle.reset(next);

    expect(panelRoot(handle).querySelector(`.${FLOATING_PANEL_CLASS}__context-menu`)).toBeNull();
    expect(panelRoot(handle).textContent).toContain('Other account');
    expect(panelRoot(handle).textContent).not.toContain('Conversation A');
    // Expansion starts over from the new data, which has folder-a open.
    expect(folderHeader(panelRoot(handle), 'folder-a').getAttribute('aria-expanded')).toBe('true');
  });

  it('debounces onSizeChange and commits only the final observed size', () => {
    vi.useFakeTimers();
    const resizeObserver = installResizeObserverMock();
    const onSizeChange = vi.fn();
    const handle = mountPanel({ onSizeChange });

    setElementRect(handle.element, 410, 520);
    resizeObserver.emit();
    vi.advanceTimersByTime(100);

    setElementRect(handle.element, 430, 540);
    resizeObserver.emit();
    vi.advanceTimersByTime(299);
    expect(onSizeChange).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1);
    expect(onSizeChange).toHaveBeenCalledTimes(1);
    expect(onSizeChange).toHaveBeenCalledWith({ w: 430, h: 540 });

    vi.useRealTimers();
  });
});
