import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { CONFIRM_ANCHOR_ATTR } from '@/core/ui/confirm';
import { confirmDriver } from '@/tests/confirmDriver';

import { FOLDER_COLORS } from './folderColors';
import { type FolderDialogs, createFolderDialogs } from './folderDialogs';

vi.mock('@/utils/i18n', () => ({
  getTranslationSync: (key: string) => key,
  getTranslationSyncUnsafe: (key: string) =>
    key === 'folder_remove_conversation_confirm' ? 'Remove {title}?' : key,
}));

function query<T extends Element = HTMLElement>(selector: string): T {
  const element = document.querySelector<T>(selector);
  expect(element, selector).not.toBeNull();
  return element!;
}

function mountList(): HTMLElement {
  document.body.innerHTML = `
    <div class="gv-folder-list">
      <div data-folder-id="parent">
        <div class="gv-folder-item-header"><span class="gv-folder-name">Original</span></div>
        <div class="gv-folder-content"><div class="existing-conversation"></div></div>
      </div>
    </div>`;
  return query('.gv-folder-list');
}

const clickAt = () => new MouseEvent('click', { clientX: 30, clientY: 45 });

describe('folder dialogs', () => {
  let dialogs: FolderDialogs;

  beforeEach(() => {
    vi.useFakeTimers();
    dialogs = createFolderDialogs();
  });

  afterEach(() => {
    dialogs.closeAll();
    document.body.innerHTML = '';
    document.documentElement.removeAttribute('data-theme');
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it.each([
    ['root', null, '.gv-folder-list', false],
    ['expanded parent', 'parent', '.gv-folder-content', false],
    ['parent without content', 'parent', '.gv-folder-list', true],
    ['missing parent', 'missing', '.gv-folder-list', false],
  ] as const)(
    'places a create editor in the %s location',
    (_label, parentId, hostSelector, removeContent) => {
      const list = mountList();
      if (removeContent) query('.gv-folder-content').remove();
      dialogs.openCreate(list, parentId, vi.fn());
      const editor = query('.gv-folder-inline-input');
      expect(editor.parentElement).toBe(query(hostSelector));
      if (parentId === 'parent' && removeContent) {
        expect(editor.previousElementSibling?.getAttribute('data-folder-id')).toBe('parent');
      } else if (parentId !== 'missing') {
        expect(editor.parentElement?.firstElementChild).toBe(editor);
      }
      expect(document.activeElement).toBe(query('.gv-folder-name-input'));
    },
  );

  it('submits a trimmed create name only on an explicit save, once', () => {
    const onSubmit = vi.fn();
    dialogs.openCreate(mountList(), null, onSubmit);
    const input = query<HTMLInputElement>('.gv-folder-name-input');
    expect(input.maxLength).toBe(50);
    expect(input.placeholder).toBe('folder_name_prompt');
    input.value = '  New folder  ';
    input.dispatchEvent(new FocusEvent('blur'));
    expect(onSubmit).not.toHaveBeenCalled();
    const save = query<HTMLButtonElement>('.gv-folder-inline-save');
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
    save.click();
    expect(onSubmit).toHaveBeenCalledExactlyOnceWith('New folder');
    expect(document.querySelector('.gv-folder-inline-input')).toBeNull();
  });

  it.each(['empty', 'cancel', 'Escape'])('discards a create draft on %s', (action) => {
    const onSubmit = vi.fn();
    dialogs.openCreate(mountList(), null, onSubmit);
    const input = query<HTMLInputElement>('.gv-folder-name-input');
    input.value = action === 'empty' ? '   ' : 'Draft';
    if (action === 'cancel') query<HTMLButtonElement>('.gv-folder-inline-cancel').click();
    else
      input.dispatchEvent(
        new KeyboardEvent('keydown', { key: action === 'empty' ? 'Enter' : action }),
      );
    expect(onSubmit).not.toHaveBeenCalled();
    expect(document.querySelector('.gv-folder-inline-input')).toBeNull();
  });

  it('opens a rename with selected text, then restores the label on cancellation', () => {
    mountList();
    const onSubmit = vi.fn();
    dialogs.openRename(query('[data-folder-id="parent"]'), 'Original', onSubmit);
    const input = query<HTMLInputElement>('.gv-folder-rename-input');
    expect(input.value).toBe('Original');
    expect(input.maxLength).toBe(50);
    expect(document.activeElement).toBe(input);
    expect([input.selectionStart, input.selectionEnd]).toEqual([0, 8]);
    expect(query('.gv-folder-name').classList.contains('gv-hidden')).toBe(true);
    input.value = 'Discarded';
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(query('.gv-folder-name').textContent).toBe('Original');
    expect(query('.gv-folder-name').classList.contains('gv-hidden')).toBe(false);
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('submits a trimmed rename and prevents a retained old editor from submitting again', () => {
    mountList();
    const onSubmit = vi.fn();
    dialogs.openRename(query('[data-folder-id="parent"]'), 'Original', onSubmit);
    const input = query<HTMLInputElement>('.gv-folder-rename-input');
    input.value = '  Renamed  ';
    query<HTMLButtonElement>('.gv-folder-inline-save').click();
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
    expect(onSubmit).toHaveBeenCalledExactlyOnceWith('Renamed');
    expect(document.querySelector('.gv-folder-rename-inline')).toBeNull();
  });

  it('keeps the input-bearing modals across a panel remount and drops the anchored ones', () => {
    const list = mountList();
    const onSave = vi.fn();
    const onMove = vi.fn();
    dialogs.openInstructions('Original', onSave);
    dialogs.openMove([], onMove);
    dialogs.openCreate(list, null, vi.fn());
    dialogs.openColor('parent', undefined, new MouseEvent('click'), vi.fn());

    const textarea = query<HTMLTextAreaElement>('.gv-fi-textarea');
    textarea.value = 'half-typed instructions';

    dialogs.closeTransient();

    // The two modals hold unsaved input and survive, textarea contents included.
    expect(document.querySelector('.gv-fi-overlay')).not.toBeNull();
    expect(document.querySelector('.gv-folder-dialog-overlay')).not.toBeNull();
    expect(query<HTMLTextAreaElement>('.gv-fi-textarea').value).toBe('half-typed instructions');
    // The row-anchored views would be stranded against a rebuilt list, so they go.
    expect(document.querySelector('.gv-folder-name-input')).toBeNull();
    expect(document.querySelector('.gv-color-picker-dialog')).toBeNull();

    // A full stop still takes everything.
    dialogs.closeAll();
    expect(document.querySelector('.gv-fi-overlay')).toBeNull();
    expect(document.querySelector('.gv-folder-dialog-overlay')).toBeNull();
  });

  it('closes only inline drafts during list refresh and leaves an open move dialog usable', () => {
    const list = mountList();
    const onCreate = vi.fn();
    const onRename = vi.fn();
    dialogs.openCreate(list, null, onCreate);
    dialogs.openRename(query('[data-folder-id="parent"]'), 'Original', onRename);
    dialogs.openMove([], vi.fn());
    const create = query<HTMLInputElement>('.gv-folder-name-input');
    const rename = query<HTMLInputElement>('.gv-folder-rename-input');
    dialogs.closeInline();
    create.value = rename.value = 'Old account';
    create.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
    rename.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
    expect(onCreate).not.toHaveBeenCalled();
    expect(onRename).not.toHaveBeenCalled();
    expect(document.querySelector('.gv-folder-inline-input, .gv-folder-rename-inline')).toBeNull();
    expect(query('.gv-folder-name').classList.contains('gv-hidden')).toBe(false);
    expect(document.querySelector('.gv-folder-dialog-overlay')).not.toBeNull();
    query<HTMLButtonElement>('.gv-folder-dialog-cancel').click();
    expect(document.querySelector('.gv-folder-dialog-overlay')).toBeNull();
  });

  it.each(['light', 'dark'])('shows the selected preset and its %s theme colors', (theme) => {
    document.documentElement.setAttribute('data-theme', theme);
    const onSelect = vi.fn();
    dialogs.openColor('folder', 'red', clickAt(), onSelect);
    const dialog = query('.gv-color-picker-dialog');
    expect([dialog.style.left, dialog.style.top, dialog.style.zIndex]).toEqual([
      '40px',
      '45px',
      '10001',
    ]);
    const selected = query<HTMLButtonElement>('.gv-color-picker-item.selected');
    expect(selected.title).toBe('folder_color_red');
    const red = FOLDER_COLORS.find((color) => color.id === 'red')!;
    const expected = document.createElement('div');
    expected.style.backgroundColor = theme === 'dark' ? red.darkColor : red.lightColor;
    expect(selected.style.backgroundColor).toBe(expected.style.backgroundColor);
    selected.click();
    selected.click();
    expect(onSelect).toHaveBeenCalledExactlyOnceWith('red');
    expect(document.querySelector('.gv-color-picker-dialog')).toBeNull();
  });

  it('toggles the same folder color picker and replaces it when toggle is disabled', () => {
    const onSelect = vi.fn();
    dialogs.openColor('a', undefined, clickAt(), onSelect);
    expect(query<HTMLButtonElement>('.gv-color-picker-item.selected').title).toBe(
      'folder_color_default',
    );
    dialogs.openColor('a', undefined, clickAt(), onSelect);
    expect(document.querySelector('.gv-color-picker-dialog')).toBeNull();
    dialogs.openColor('a', undefined, clickAt(), onSelect);
    const old = query<HTMLButtonElement>('.gv-color-picker-item');
    dialogs.openColor('a', '#123456', clickAt(), onSelect, false);
    old.click();
    expect(onSelect).not.toHaveBeenCalled();
    expect(document.querySelectorAll('.gv-color-picker-dialog')).toHaveLength(1);
    const input = query<HTMLInputElement>('.gv-color-picker-custom input');
    expect(input.value).toBe('#123456');
    expect(query('.gv-color-picker-custom').classList.contains('selected')).toBe(true);
    input.value = '#abcdef';
    input.dispatchEvent(new Event('change'));
    expect(onSelect).toHaveBeenCalledExactlyOnceWith('#abcdef');
    expect(document.querySelector('.gv-color-picker-dialog')).toBeNull();
  });

  it('waits for the opening click before dismissing a picker on an outside click', () => {
    dialogs.openColor('a', undefined, clickAt(), vi.fn());
    document.body.click();
    expect(document.querySelector('.gv-color-picker-dialog')).not.toBeNull();
    vi.advanceTimersByTime(0);
    query('.gv-color-picker-dialog').click();
    expect(document.querySelector('.gv-color-picker-dialog')).not.toBeNull();
    document.body.click();
    expect(document.querySelector('.gv-color-picker-dialog')).toBeNull();
  });

  it('counts instruction characters and closes after the save promise settles', async () => {
    let finishSave!: (saved: boolean) => void;
    const onSave = vi.fn(
      () =>
        new Promise<boolean>((resolve) => {
          finishSave = resolve;
        }),
    );
    dialogs.openInstructions('Original', onSave);
    const input = query<HTMLTextAreaElement>('.gv-fi-textarea');
    expect(query('.gv-fi-title').textContent).toBe('folderAsProject_editInstructions');
    expect(input.placeholder).toBe('folderAsProject_setInstructions');
    expect(input.maxLength).toBe(10000);
    expect(query('.gv-fi-char-count').textContent).toBe('8 / 10000');
    vi.advanceTimersByTime(50);
    expect(document.activeElement).toBe(input);
    input.value = '  New instructions  ';
    input.dispatchEvent(new InputEvent('input'));
    expect(query('.gv-fi-char-count').textContent).toBe('20 / 10000');
    query<HTMLButtonElement>('.gv-fi-btn-save').click();
    expect(onSave).toHaveBeenCalledExactlyOnceWith('New instructions');
    expect(document.querySelector('.gv-fi-overlay')).not.toBeNull();
    finishSave(true);
    await Promise.resolve();
    expect(document.querySelector('.gv-fi-overlay')).toBeNull();
  });

  it('preserves an instructions draft after a failed save and permits retry', async () => {
    let finishSave!: (saved: boolean) => void;
    const onSave = vi.fn(
      () =>
        new Promise<boolean>((resolve) => {
          finishSave = resolve;
        }),
    );
    dialogs.openInstructions('Original', onSave);
    const input = query<HTMLTextAreaElement>('.gv-fi-textarea');
    const save = query<HTMLButtonElement>('.gv-fi-btn-save');
    input.value = 'Keep this draft';
    save.click();
    save.click();
    expect(onSave).toHaveBeenCalledExactlyOnceWith('Keep this draft');
    expect(save.disabled).toBe(true);
    finishSave(false);
    await Promise.resolve();
    expect(input.isConnected).toBe(true);
    expect(input.value).toBe('Keep this draft');
    expect(save.disabled).toBe(false);
    save.click();
    finishSave(true);
    await Promise.resolve();
    expect(onSave).toHaveBeenCalledTimes(2);
    expect(document.querySelector('.gv-fi-overlay')).toBeNull();
  });

  it('saves an empty instructions draft as undefined', async () => {
    const onSave = vi.fn().mockResolvedValue(true);
    dialogs.openInstructions(undefined, onSave);
    expect(query('.gv-fi-title').textContent).toBe('folderAsProject_setInstructions');
    query<HTMLTextAreaElement>('.gv-fi-textarea').value = '   ';
    query<HTMLButtonElement>('.gv-fi-btn-save').click();
    await Promise.resolve();
    expect(onSave).toHaveBeenCalledExactlyOnceWith(undefined);
    expect(document.querySelector('.gv-fi-overlay')).toBeNull();
  });

  it.each(['cancel', 'Escape', 'overlay'])('discards instruction changes on %s', (action) => {
    const onSave = vi.fn().mockResolvedValue(true);
    dialogs.openInstructions('Original', onSave);
    query<HTMLTextAreaElement>('.gv-fi-textarea').value = 'Discarded';
    const oldSave = query<HTMLButtonElement>('.gv-fi-btn-save');
    if (action === 'cancel') query<HTMLButtonElement>('.gv-fi-btn-cancel').click();
    else if (action === 'Escape')
      query('.gv-fi-overlay').dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    else query('.gv-fi-overlay').click();
    oldSave.click();
    expect(onSave).not.toHaveBeenCalled();
    expect(document.querySelector('.gv-fi-overlay')).toBeNull();
  });

  it('invalidates old account dialogs and their deferred work without closing the next account editor', async () => {
    const onCreate = vi.fn();
    const onConfirm = vi.fn();
    const onColor = vi.fn();
    let finishSave!: (saved: boolean) => void;
    const onSave = vi.fn(
      () =>
        new Promise<boolean>((resolve) => {
          finishSave = resolve;
        }),
    );
    dialogs.openCreate(mountList(), null, onCreate);
    dialogs.openColor('a', 'red', clickAt(), onColor);
    dialogs.confirmFolderRemoval(query('[data-folder-id="parent"]'), onConfirm);
    dialogs.openInstructions('Account A', onSave);
    expect(confirmDriver.isOpen()).toBe(true);
    const create = query<HTMLInputElement>('.gv-folder-name-input');
    const color = query<HTMLButtonElement>('.gv-color-picker-item');
    const oldInput = query<HTMLTextAreaElement>('.gv-fi-textarea');
    const oldFocus = vi.spyOn(oldInput, 'focus');
    const oldSave = query<HTMLButtonElement>('.gv-fi-btn-save');
    oldSave.click();
    const addListener = vi.spyOn(document, 'addEventListener');
    dialogs.closeAll();
    dialogs.closeAll();
    expect(
      document.querySelector('.gv-fi-overlay, .gv-color-picker-dialog, .gv-folder-inline-input'),
    ).toBeNull();
    expect(confirmDriver.isOpen()).toBe(false);
    create.value = 'Stale folder';
    create.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
    color.click();
    await Promise.resolve();
    oldSave.click();
    expect(onCreate).not.toHaveBeenCalled();
    expect(onConfirm).not.toHaveBeenCalled();
    expect(onColor).not.toHaveBeenCalled();
    expect(onSave).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(50);
    expect(oldFocus).not.toHaveBeenCalled();
    expect(addListener).not.toHaveBeenCalled();

    dialogs.openInstructions('Account B', vi.fn().mockResolvedValue(true));
    finishSave(true);
    await Promise.resolve();
    expect(query<HTMLTextAreaElement>('.gv-fi-textarea').value).toBe('Account B');
  });

  it('asks before deleting a folder, with Cancel focused, and deletes once on the answer', async () => {
    mountList();
    const onConfirm = vi.fn();
    dialogs.confirmFolderRemoval(query('[data-folder-id="parent"]'), onConfirm);
    expect(confirmDriver.message()).toBe('folder_delete_confirm');
    // Deleting a folder deletes it, so the button says so.
    expect(confirmDriver.labels()).toEqual(['pm_cancel', 'folder_delete']);
    expect(confirmDriver.focusedLabel()).toBe('pm_cancel');

    confirmDriver.answer('folder_delete');
    await Promise.resolve();
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(confirmDriver.isOpen()).toBe(false);
  });

  it('renders a conversation title as text and labels its confirmation as a removal', async () => {
    const anchor = document.createElement('button');
    document.body.appendChild(anchor);
    const onConfirm = vi.fn();
    const title = '<img src=x onerror="bad()">';
    dialogs.confirmConversationRemoval(title, anchor, onConfirm);
    expect(confirmDriver.message()).toBe(`Remove ${title}?`);
    // The conversation stays; only its folder entry goes, so this is not "Delete".
    expect(confirmDriver.labels()).toEqual(['pm_cancel', 'folder_remove_conversation_action']);
    confirmDriver.answer('pm_cancel');
    await Promise.resolve();
    expect(onConfirm).not.toHaveBeenCalled();
    expect(confirmDriver.isOpen()).toBe(false);
  });

  it('opens a removal question under its row, ending where the row ends, with the row marked', async () => {
    Object.defineProperty(document.documentElement, 'clientWidth', {
      value: 1000,
      configurable: true,
    });
    Object.defineProperty(document.documentElement, 'clientHeight', {
      value: 700,
      configurable: true,
    });
    const row = document.createElement('div');
    document.body.appendChild(row);
    const rowRect = { left: 20, top: 100, right: 300, bottom: 132, width: 280, height: 32 };
    const cardRect = { left: 0, top: 0, right: 220, bottom: 90, width: 220, height: 90 };
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(
      function (this: HTMLElement) {
        return (this === row ? rowRect : cardRect) as DOMRect;
      },
    );

    dialogs.confirmFolderRemoval(row, vi.fn());
    const host = query('[data-gv-layer="popover"]');
    expect({ left: host.style.left, top: host.style.top }).toEqual({ left: '80px', top: '140px' });
    expect(row.hasAttribute(CONFIRM_ANCHOR_ATTR)).toBe(true);

    dialogs.closeTransient();
    await Promise.resolve();
    expect(row.hasAttribute(CONFIRM_ANCHOR_ATTR)).toBe(false);
  });

  it('drops an open removal question on a panel remount, and asks again afterwards', async () => {
    const anchor = document.createElement('button');
    document.body.appendChild(anchor);
    const stale = vi.fn();
    dialogs.confirmConversationRemoval('Old', anchor, stale);
    dialogs.closeTransient();
    await Promise.resolve();
    expect(confirmDriver.isOpen()).toBe(false);
    expect(stale).not.toHaveBeenCalled();

    const fresh = vi.fn();
    dialogs.confirmConversationRemoval('New', anchor, fresh);
    confirmDriver.answer('folder_remove_conversation_action');
    await Promise.resolve();
    expect(fresh).toHaveBeenCalledTimes(1);
    expect(stale).not.toHaveBeenCalled();
  });

  it('keeps conversation actions single and closes the menu before running a native command', () => {
    const oldAction = vi.fn();
    const newAction = vi.fn(() =>
      expect(document.querySelector('.gv-folder-conversation-menu')).toBeNull(),
    );
    dialogs.openMenu(clickAt(), [{ label: 'old', action: oldAction }], 'conversation');
    const oldButton = query<HTMLButtonElement>('.gv-folder-menu-item');
    dialogs.openMenu(clickAt(), [{ label: 'rename', action: newAction }], 'conversation');
    oldButton.click();
    expect(oldAction).not.toHaveBeenCalled();
    expect(document.querySelectorAll('.gv-folder-conversation-menu')).toHaveLength(1);
    query<HTMLButtonElement>('.gv-folder-menu-item').click();
    expect(newAction).toHaveBeenCalledTimes(1);
  });

  it('preserves folder menu action timing and clears its old action at runtime teardown', () => {
    const action = vi.fn(() => expect(document.querySelector('.gv-folder-menu')).not.toBeNull());
    dialogs.openMenu(clickAt(), [{ label: '<b>Folder action</b>', action }]);
    const menu = query('.gv-folder-menu');
    expect([menu.style.left, menu.style.top]).toEqual(['30px', '45px']);
    expect(menu.querySelector('b')).toBeNull();
    query<HTMLButtonElement>('.gv-folder-menu-item').click();
    expect(action).toHaveBeenCalledTimes(1);
    expect(document.querySelector('.gv-folder-menu')).toBeNull();
    dialogs.openMenu(clickAt(), [{ label: 'Old account action', action }]);
    const old = query<HTMLButtonElement>('.gv-folder-menu-item');
    dialogs.closeAll();
    old.click();
    expect(action).toHaveBeenCalledTimes(1);
  });
});
