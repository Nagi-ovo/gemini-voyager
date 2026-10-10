/**
 * The floating tree is diffed rather than rebuilt, so an open name form can
 * outlive a re-render. These pin what that must not break.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  FLOATING_PANEL_CLASS,
  createData,
  createFolder,
  dblclick,
  destroyMountedPanels,
  folderHeader,
  mountPanel,
  mousedown,
  panelRoot,
  part,
  queryPart,
  requireElement,
} from './floatingPanelHarness';

vi.mock('@/core/utils/browser', () => ({ isSafari: () => false }));
vi.mock('@/utils/i18n', () => ({ getTranslationSyncUnsafe: (key: string) => key }));

afterEach(() => {
  destroyMountedPanels();
  document.body.innerHTML = '';
});

describe('floating tree across re-renders', () => {
  it('still cancels an open form on an outside mousedown after a background update', () => {
    const onCreateFolder = vi.fn();
    const handle = mountPanel({ onCreateFolder });
    part(handle, 'icon-button--create').click();
    const input = part<HTMLInputElement>(handle, 'inline-input');
    input.value = 'Draft';
    input.blur();

    const next = createData();
    next.folders.push(createFolder('folder-c', 'Gamma', null, 2));
    handle.update(next);
    expect(part<HTMLInputElement>(handle, 'inline-input')).toBe(input);
    expect(panelRoot(handle).textContent).toContain('Gamma');

    const event = mousedown(document.body);
    expect(event.defaultPrevented).toBe(true);
    expect(queryPart(handle, 'inline-input')).toBeNull();
    expect(onCreateFolder).not.toHaveBeenCalled();
  });

  it('keeps a rename draft with its folder when the folders reorder', () => {
    const handle = mountPanel();
    const betaHeader = folderHeader(panelRoot(handle), 'folder-b');
    dblclick(requireElement(betaHeader, `.${FLOATING_PANEL_CLASS}__folder-name`));
    const input = part<HTMLInputElement>(handle, 'inline-input');
    expect(input.value).toBe('Beta');
    input.value = 'Beta draft';
    input.blur();

    const next = createData();
    next.folders[1] = { ...next.folders[1], pinned: true };
    handle.update(next);

    const moved = part<HTMLInputElement>(handle, 'inline-input');
    expect(moved.closest('[data-folder-id]')?.getAttribute('data-folder-id')).toBe('folder-b');
    expect(moved.value).toBe('Beta draft');
    const headers = panelRoot(handle).querySelectorAll('[data-folder-id]');
    expect(headers[0].getAttribute('data-folder-id')).toBe('folder-b');
  });

  it('stops listening for outside clicks once the panel is destroyed', () => {
    const handle = mountPanel();
    part(handle, 'icon-button--create').click();
    expect(queryPart(handle, 'inline-input')).not.toBeNull();

    handle.destroy();

    expect(mousedown(document.body).defaultPrevented).toBe(false);
  });
});
