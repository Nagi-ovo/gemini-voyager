import React, { act, useEffect } from 'react';
import { type Root, createRoot } from 'react-dom/client';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { StorageKeys } from '@/core/types/common';

import {
  LAYOUT_SETTINGS_STORAGE_DEFAULTS,
  type PopupLayoutSettingsController,
  usePopupLayoutSettings,
} from '../usePopupLayoutSettings';

function Harness({
  isAIStudio,
  capture,
}: {
  isAIStudio: boolean;
  capture: (settings: PopupLayoutSettingsController) => void;
}) {
  const settings = usePopupLayoutSettings({ isAIStudio });
  useEffect(() => {
    capture(settings);
  }, [capture, settings]);
  return null;
}

describe('usePopupLayoutSettings', () => {
  let container: HTMLDivElement;
  let root: Root;
  let settings: PopupLayoutSettingsController;
  let stored: Record<string, unknown>;

  const render = (isAIStudio = false) => {
    act(() => {
      root.render(<Harness isAIStudio={isAIStudio} capture={(next) => (settings = next)} />);
    });
  };

  beforeEach(() => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    vi.clearAllMocks();
    stored = {};
    vi.mocked(chrome.storage.sync.get).mockImplementation((...args: unknown[]) => {
      const defaults = args[0] as Record<string, unknown>;
      const result = Object.fromEntries(
        Object.entries(defaults).map(([key, fallback]) => [
          key,
          Object.hasOwn(stored, key) ? stored[key] : fallback,
        ]),
      );
      const callback = args[1];
      if (typeof callback === 'function') callback(result);
      return Promise.resolve(result);
    });
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it('hydrates the bulk defaults without enabling adjustments or writing storage', () => {
    render(true);
    act(() => settings.hydrateFromStorage(LAYOUT_SETTINGS_STORAGE_DEFAULTS));
    expect(settings.sidebarWidthEnabled).toBe(false);
    expect(settings.sidebarWidthAdjuster.width).toBe(280);
    expect(settings.folderSpacingAdjuster.width).toBe(2);
    expect(settings.folderTreeIndentAdjuster.width).toBe(-8);
    expect(settings.gemsSidebarCountAdjuster.width).toBe(3);
    expect(chrome.storage.sync.set).not.toHaveBeenCalled();
  });

  it('bounds stored numeric controls', () => {
    stored = {
      [StorageKeys.AISTUDIO_SIDEBAR_WIDTH]: Number.NaN,
      [StorageKeys.GV_FOLDER_TREE_INDENT]: -20,
      [StorageKeys.GV_GEMS_SIDEBAR_COUNT]: -1,
    };
    render(true);
    expect(settings.sidebarWidthAdjuster.width).toBe(280);
    expect(settings.folderTreeIndentAdjuster.width).toBe(-8);
    expect(settings.gemsSidebarCountAdjuster.width).toBe(0);
    expect(chrome.storage.sync.set).not.toHaveBeenCalled();
  });

  it("saves AI Studio's sidebar width and folder spacing without touching Gemini's", () => {
    stored = {
      [StorageKeys.SIDEBAR_WIDTH]: 360,
      [StorageKeys.AISTUDIO_SIDEBAR_WIDTH]: 496,
      [StorageKeys.GV_FOLDER_SPACING]: 4,
      [StorageKeys.GV_AISTUDIO_FOLDER_SPACING]: 8,
    };
    render();
    expect(settings.folderSpacingAdjuster.width).toBe(4);
    render(true);
    expect(settings.sidebarWidthAdjuster.width).toBe(496);
    expect(settings.folderSpacingAdjuster.width).toBe(8);
    act(() => {
      settings.sidebarWidthAdjuster.handleChange(1000);
      settings.sidebarWidthAdjuster.handleChangeComplete();
      settings.folderSpacingAdjuster.handleChange(20);
      settings.folderSpacingAdjuster.handleChangeComplete();
    });
    expect(vi.mocked(chrome.storage.sync.set).mock.calls).toEqual([
      [{ [StorageKeys.AISTUDIO_SIDEBAR_WIDTH]: 600 }],
      [{ [StorageKeys.GV_AISTUDIO_FOLDER_SPACING]: 16 }],
    ]);
    render();
    expect(settings.folderSpacingAdjuster.width).toBe(4);
    expect(chrome.storage.sync.set).toHaveBeenCalledTimes(2);
  });

  it('stores an explicit off under the shared sidebar width switch', () => {
    render(true);
    act(() => settings.hydrateFromStorage({ [StorageKeys.SIDEBAR_WIDTH_ENABLED]: true }));
    expect(settings.sidebarWidthEnabled).toBe(true);
    act(() => settings.onSidebarWidthEnabledChange(false));
    expect(settings.sidebarWidthEnabled).toBe(false);
    expect(chrome.storage.sync.set).toHaveBeenCalledExactlyOnceWith({
      [StorageKeys.SIDEBAR_WIDTH_ENABLED]: false,
    });
  });
});
