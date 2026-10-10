/**
 * The panel's optional site props (used by ChatGPT folders) leave Gemini's mount
 * unchanged when omitted.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  FLOATING_PANEL_CLASS,
  click,
  contextMenu,
  destroyMountedPanels,
  folderHeader,
  mountPanel,
  panelRoot,
  part,
  queryPart,
} from './floatingPanelHarness';

vi.mock('@/core/utils/browser', () => ({ isSafari: () => false }));
vi.mock('@/utils/i18n', () => ({ getTranslationSyncUnsafe: (key: string) => key }));

afterEach(() => {
  destroyMountedPanels();
  document.body.innerHTML = '';
  vi.useRealTimers();
});

function headerButtons(handle: ReturnType<typeof mountPanel>): string[] {
  return Array.from(
    panelRoot(handle).querySelectorAll<HTMLButtonElement>(
      `.${FLOATING_PANEL_CLASS}__header-actions button`,
    ),
  ).map((button) => button.getAttribute('aria-label') ?? '');
}

function hintTexts(handle: ReturnType<typeof mountPanel>): string[] {
  return Array.from(
    panelRoot(handle).querySelectorAll(`.${FLOATING_PANEL_CLASS}__move-hint-text`),
  ).map((hint) => hint.textContent ?? '');
}

function menuItems(handle: ReturnType<typeof mountPanel>): string[] {
  return Array.from(panelRoot(handle).querySelectorAll(`.${FLOATING_PANEL_CLASS}__menu-item`)).map(
    (item) => item.textContent ?? '',
  );
}

describe('floating panel site props', () => {
  it('keeps Gemini’s header, hints and folder menu when no site props are passed', () => {
    const handle = mountPanel({ onToggleFolderPinned: () => {} });

    expect(headerButtons(handle)).toEqual([
      'floatingPanelCloudUpload',
      'floatingPanelCloudSync',
      'floatingPanelCreateFolder',
      'floatingPanelClose',
    ]);
    expect(hintTexts(handle)).toEqual(['floatingPanelMoveHint', 'floatingPanelGestureHint']);

    contextMenu(folderHeader(panelRoot(handle), 'folder-a'));
    expect(menuItems(handle)).not.toContain('floatingPanelAddCurrentHere');
  });

  it('swaps the cloud buttons and hints for the site’s own', () => {
    const exported = vi.fn();
    const handle = mountPanel({
      cloudActions: false,
      hintKeys: ['siteHint'],
      headerActions: [
        { modifier: 'add', labelKey: 'siteAdd', iconPath: 'M0 0', onClick: () => {} },
        { modifier: 'export', labelKey: 'siteExport', iconPath: 'M0 0', onClick: exported },
      ],
    });

    expect(headerButtons(handle)).toEqual([
      'siteAdd',
      'siteExport',
      'floatingPanelCreateFolder',
      'floatingPanelClose',
    ]);
    expect(hintTexts(handle)).toEqual(['siteHint']);
    click(part(handle, 'icon-button--export'));
    expect(exported).toHaveBeenCalledTimes(1);
  });

  it('disables site buttons with the rest of the header until data is ready', () => {
    const handle = mountPanel({
      dataReady: false,
      headerActions: [{ modifier: 'add', labelKey: 'siteAdd', iconPath: 'M0', onClick: () => {} }],
    });
    expect(part<HTMLButtonElement>(handle, 'icon-button--add').disabled).toBe(true);
    handle.setDataReady(true);
    expect(part<HTMLButtonElement>(handle, 'icon-button--add').disabled).toBe(false);
  });

  it('offers “add current conversation here” on a folder when the site handles it', () => {
    const addHere = vi.fn();
    const handle = mountPanel({ onAddCurrentConversation: addHere });

    contextMenu(folderHeader(panelRoot(handle), 'folder-b'));
    const item = Array.from(
      panelRoot(handle).querySelectorAll<HTMLElement>(`.${FLOATING_PANEL_CLASS}__menu-item`),
    ).find((button) => button.textContent === 'floatingPanelAddCurrentHere');
    click(item!);

    expect(addHere).toHaveBeenCalledWith('folder-b');
    expect(queryPart(handle, 'context-menu')).toBeNull();
  });
});
