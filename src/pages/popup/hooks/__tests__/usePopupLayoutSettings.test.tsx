import React, { act, useEffect } from 'react';
import { type Root, createRoot } from 'react-dom/client';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { StorageKeys } from '@/core/types/common';

import {
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

  it('starts the folder sliders at their defaults without writing storage', () => {
    render(true);
    expect(settings.folderSpacingAdjuster.width).toBe(2);
    expect(settings.folderTreeIndentAdjuster.width).toBe(-8);
    expect(chrome.storage.sync.set).not.toHaveBeenCalled();
  });

  it('bounds stored numeric controls', () => {
    stored = { [StorageKeys.GV_FOLDER_TREE_INDENT]: -20 };
    render(true);
    expect(settings.folderTreeIndentAdjuster.width).toBe(-8);
    expect(chrome.storage.sync.set).not.toHaveBeenCalled();
  });

  it("saves AI Studio's folder spacing without touching Gemini's", () => {
    stored = {
      [StorageKeys.GV_FOLDER_SPACING]: 4,
      [StorageKeys.GV_AISTUDIO_FOLDER_SPACING]: 8,
    };
    render();
    expect(settings.folderSpacingAdjuster.width).toBe(4);
    render(true);
    expect(settings.folderSpacingAdjuster.width).toBe(8);
    act(() => {
      settings.folderSpacingAdjuster.handleChange(20);
      settings.folderSpacingAdjuster.handleChangeComplete();
    });
    expect(vi.mocked(chrome.storage.sync.set).mock.calls).toEqual([
      [{ [StorageKeys.GV_AISTUDIO_FOLDER_SPACING]: 16 }],
    ]);
    render();
    expect(settings.folderSpacingAdjuster.width).toBe(4);
    expect(chrome.storage.sync.set).toHaveBeenCalledTimes(1);
  });
});
