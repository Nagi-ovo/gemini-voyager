import browser from 'webextension-polyfill';

import { createHighlighterIcon } from '@/core/icons/highlighterIcon';
import { StorageKeys } from '@/core/types/common';
import { type HighlightColor, isHighlightColor } from '@/core/types/highlight';
import { getTranslationSync } from '@/utils/i18n';

import type { NativeFeatureToggle, StopNativeFeature } from '../featureLifecycle';
import { createHighlightColorPicker } from '../quoteReply/highlightColorPicker';
import {
  markSelectionToolbarInternalClick,
  registerSelectionAction,
  restoreSelectionToolbarRange,
} from '../selectionToolbar/host';
import { HighlightManager } from './manager';

/** Sub-settings the caller already read; omitted, the action reads them itself. */
export interface HighlightActionOptions {
  readonly defaultColor?: HighlightColor;
  readonly colorPalette?: readonly HighlightColor[];
  readonly timelineMarkersEnabled?: boolean;
}

/** Off unless explicitly turned on; its sub-settings are read by the action itself. */
export const HIGHLIGHT_TOGGLE: NativeFeatureToggle = {
  key: StorageKeys.HIGHLIGHT_ENABLED,
  isEnabled: (value) => value === true,
  areas: ['sync'],
};

const SUB_SETTING_KEYS = [
  StorageKeys.HIGHLIGHT_DEFAULT_COLOR,
  StorageKeys.HIGHLIGHT_COLOR_PALETTE,
  StorageKeys.HIGHLIGHT_TIMELINE_MARKERS_ENABLED,
] as const;

/**
 * Run saved highlights and the toolbar's Highlight action. Stop is synchronous: it unregisters the
 * action and destroys the manager even while its first load is still pending.
 */
export function startHighlightAction(options?: HighlightActionOptions): StopNativeFeature {
  const manager = new HighlightManager();
  const picker = createHighlightColorPicker(
    {
      highlightDefaultColor: options?.defaultColor,
      highlightColorPalette: options?.colorPalette,
    },
    {
      onInternalClick: markSelectionToolbarInternalClick,
      restoreSelection: restoreSelectionToolbarRange,
      onPaletteChange: (colors) => manager.setColorPalette(colors),
    },
  );
  manager.setColorPalette(picker.colors);
  manager.setTimelineMarkersEnabled(options?.timelineMarkersEnabled !== false);
  let stopped = false;
  // Per key: a live change to one sub-setting must not discard the initial read of the others.
  const changedLive = new Set<string>();

  const onStorageChanged = (
    changes: Record<string, browser.Storage.StorageChange>,
    areaName: string,
  ): void => {
    if (areaName !== 'sync') return;
    for (const key of SUB_SETTING_KEYS) if (key in changes) changedLive.add(key);
    picker.applyStorageChanges(changes);
    const markersChange = changes[StorageKeys.HIGHLIGHT_TIMELINE_MARKERS_ENABLED];
    if (markersChange) manager.setTimelineMarkersEnabled(markersChange.newValue !== false);
  };

  async function readSubSettings(): Promise<void> {
    let stored: Record<string, unknown>;
    try {
      stored = await browser.storage.sync.get({
        [StorageKeys.HIGHLIGHT_DEFAULT_COLOR]: 'yellow',
        [StorageKeys.HIGHLIGHT_COLOR_PALETTE]: null,
        [StorageKeys.HIGHLIGHT_TIMELINE_MARKERS_ENABLED]: true,
      });
    } catch {
      return;
    }
    if (stopped) return;
    // A key changed while reading is newer than the read; every other key takes the read.
    const fresh = (key: string): boolean => !changedLive.has(key);
    const storedColor = stored[StorageKeys.HIGHLIGHT_DEFAULT_COLOR];
    const initial: Record<string, browser.Storage.StorageChange> = {};
    if (fresh(StorageKeys.HIGHLIGHT_COLOR_PALETTE)) {
      initial[StorageKeys.HIGHLIGHT_COLOR_PALETTE] = {
        newValue: stored[StorageKeys.HIGHLIGHT_COLOR_PALETTE],
      };
    }
    if (fresh(StorageKeys.HIGHLIGHT_DEFAULT_COLOR)) {
      initial[StorageKeys.HIGHLIGHT_DEFAULT_COLOR] = {
        newValue: isHighlightColor(storedColor) ? storedColor : 'yellow',
      };
    }
    picker.applyStorageChanges(initial);
    if (fresh(StorageKeys.HIGHLIGHT_TIMELINE_MARKERS_ENABLED)) {
      manager.setTimelineMarkersEnabled(
        stored[StorageKeys.HIGHLIGHT_TIMELINE_MARKERS_ENABLED] !== false,
      );
    }
  }

  browser.storage.onChanged.addListener(onStorageChanged);
  const unregister = registerSelectionAction({
    id: 'highlight',
    order: 20,
    className: 'gv-highlight-action',
    label: () => getTranslationSync('highlightAction'),
    createIcon: () => createHighlighterIcon(16),
    isAvailable: (range) => manager.canCreateFromRange(range),
    run: (range) => manager.createFromRange(range, picker.color),
    controls: picker,
  });
  if (!options) void readSubSettings();
  void manager.init();

  return () => {
    if (stopped) return;
    stopped = true;
    browser.storage.onChanged.removeListener(onStorageChanged);
    unregister();
    manager.destroy();
    picker.hide();
    picker.unmount();
  };
}
