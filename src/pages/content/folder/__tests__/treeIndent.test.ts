import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  FolderManager,
  calculateFolderConversationPaddingLeft,
  calculateFolderDialogPaddingLeft,
  calculateFolderHeaderPaddingLeft,
  clampFolderTreeIndent,
} from '../manager';

vi.mock('@/utils/i18n', () => ({
  getTranslationSync: (key: string) => key,
  getTranslationSyncUnsafe: (key: string) => key,
  initI18n: () => Promise.resolve(),
}));

describe('folder tree indentation', () => {
  let manager: FolderManager | null = null;

  afterEach(() => {
    manager?.destroy();
    manager = null;
    document.body.innerHTML = '';
  });

  it('clamps configured indent into [-8, 32] and defaults to -8 for invalid values', () => {
    expect(clampFolderTreeIndent(-40)).toBe(-8);
    expect(clampFolderTreeIndent(64)).toBe(32);
    expect(clampFolderTreeIndent(0)).toBe(0);
    expect(clampFolderTreeIndent(16)).toBe(16);
    expect(clampFolderTreeIndent('invalid')).toBe(-8);
  });

  it('calculates folder and conversation paddings from indent and level', () => {
    expect(calculateFolderHeaderPaddingLeft(2, 16)).toBe(40); // 2 * 16 + 8
    expect(calculateFolderConversationPaddingLeft(2, 16)).toBe(56); // 2 * 16 + 24
    expect(calculateFolderDialogPaddingLeft(2, 16)).toBe(44); // 2 * 16 + 12
    expect(calculateFolderHeaderPaddingLeft(2, -16)).toBe(0);
    expect(calculateFolderConversationPaddingLeft(3, -16)).toBe(0);
    expect(calculateFolderDialogPaddingLeft(2, -16)).toBe(0);
  });

  it('updates indent and refreshes render when setting changes', () => {
    manager = new FolderManager();
    const typedManager = manager as unknown as {
      folderEnabled: boolean;
      containerElement: HTMLElement | null;
      folderTreeIndent: number;
      renderAllFolders: () => void;
      applyFolderTreeIndentSetting: (value: unknown) => void;
    };

    typedManager.folderEnabled = true;
    typedManager.containerElement = document.createElement('div');
    typedManager.folderTreeIndent = 16;
    const renderSpy = vi.spyOn(typedManager, 'renderAllFolders').mockImplementation(() => {});

    typedManager.applyFolderTreeIndentSetting(28);
    expect(typedManager.folderTreeIndent).toBe(28);
    expect(renderSpy).toHaveBeenCalledTimes(1);
  });
});
