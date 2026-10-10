/**
 * The folder display settings, one preference across sites: item font size,
 * row spacing and tree indent, stored in sync storage under Gemini's keys. The
 * settings popover steps them; each site's tree reads them as the custom
 * properties below. Gemini sets those on its folder container from page sheets
 * (folderItemFontSize, folderSpacing) and the indent on its tree host; a tree
 * elsewhere gets them on its host from `applyFolderDisplay`.
 */
import { StorageKeys } from '@/core/types/common';

export type FolderDisplaySetting = {
  labelKey: string;
  storageKey: string;
  min: number;
  max: number;
  defaultValue: number;
  unit?: string;
};

/** Default 13px matches Gemini's native sidebar after the May 2026 redesign. */
export const FOLDER_FONT_SIZE: FolderDisplaySetting = {
  labelKey: 'folder_item_font_size',
  storageKey: StorageKeys.GV_FOLDER_ITEM_FONT_SIZE,
  min: 12,
  max: 18,
  defaultValue: 13,
  unit: 'px',
};

export const FOLDER_SPACING: FolderDisplaySetting = {
  labelKey: 'folderSpacing',
  storageKey: StorageKeys.GV_FOLDER_SPACING,
  min: 0,
  max: 16,
  defaultValue: 2,
};

export const FOLDER_TREE_INDENT: FolderDisplaySetting = {
  labelKey: 'folderTreeIndent',
  storageKey: StorageKeys.GV_FOLDER_TREE_INDENT,
  min: -8,
  max: 32,
  defaultValue: -8,
};

/** In the settings popover's order. */
export const FOLDER_DISPLAY_SETTINGS = [FOLDER_FONT_SIZE, FOLDER_SPACING, FOLDER_TREE_INDENT];

/** The indent setting on a tree host, which the rows' padding reads. */
export const FOLDER_INDENT_PROPERTY = '--gv-folder-indent';

/** A whole number in the setting's range; anything not a finite number is its default. */
export function clampFolderDisplay(setting: FolderDisplaySetting, value: unknown): number {
  const numeric = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(numeric)) return setting.defaultValue;
  return Math.min(setting.max, Math.max(setting.min, Math.round(numeric)));
}

/** Line height tracks font size, at roughly the ratio Gemini's sidebar text uses. */
export function folderItemLineHeight(fontSize: number): number {
  return Math.round(fontSize * 1.3);
}

/** A row's block padding for a spacing: 4px at 0, 5px at the default 2, 12px at 16. */
export function folderRowPadding(spacing: number): number {
  return Math.max(4, Math.round(4 + spacing * 0.5));
}

/** The custom properties a tree reads for `setting` at `value`. */
export function folderDisplayProperties(
  setting: FolderDisplaySetting,
  value: number,
): Record<string, string> {
  if (setting === FOLDER_FONT_SIZE) {
    return {
      '--gv-folder-item-font-size': `${value}px`,
      '--gv-folder-item-line-height': `${folderItemLineHeight(value)}px`,
    };
  }
  if (setting === FOLDER_SPACING) {
    return {
      '--gv-folder-row-padding': `${folderRowPadding(value)}px`,
      '--gv-folder-row-gap': `${value}px`,
    };
  }
  return { [FOLDER_INDENT_PROPERTY]: `${value}px` };
}

/**
 * Calls `onValue` with the value stored under each of `keys` in sync storage
 * (undefined while unset), then with each change to one; one listener for all.
 * Returns the stop.
 */
export function watchSyncSettings(
  keys: readonly string[],
  onValue: (key: string, value: unknown) => void,
): () => void {
  let stopped = false;
  try {
    chrome.storage?.sync?.get([...keys], (stored) => {
      if (stopped) return;
      for (const key of keys) onValue(key, stored?.[key]);
    });
  } catch {
    // An invalidated context: the defaults stay.
  }
  const onChanged = (changes: Record<string, chrome.storage.StorageChange>, area: string) => {
    if (area !== 'sync') return;
    for (const key of keys) if (changes[key]) onValue(key, changes[key].newValue);
  };
  chrome.storage?.onChanged?.addListener(onChanged);
  return () => {
    stopped = true;
    try {
      chrome.storage?.onChanged?.removeListener(onChanged);
    } catch {
      // ignore
    }
  };
}

/** `watchSyncSettings` for one key. */
export function watchSyncSetting(key: string, onValue: (value: unknown) => void): () => void {
  return watchSyncSettings([key], (_key, value) => onValue(value));
}

/**
 * Follows the display settings on `target`, a tree's shadow host outside
 * Gemini. A setting the user never stored is left off, so the site's sheet
 * keeps its own metrics until one is chosen. Returns the stop, which also
 * clears the properties.
 */
export function applyFolderDisplay(target: HTMLElement): () => void {
  const applied = new Set<string>();
  const stop = watchSyncSettings(
    FOLDER_DISPLAY_SETTINGS.map((setting) => setting.storageKey),
    (key, value) => {
      const setting = FOLDER_DISPLAY_SETTINGS.find((candidate) => candidate.storageKey === key)!;
      const properties = folderDisplayProperties(setting, clampFolderDisplay(setting, value));
      for (const [name, propertyValue] of Object.entries(properties)) {
        if (value === undefined) {
          target.style.removeProperty(name);
          applied.delete(name);
        } else {
          target.style.setProperty(name, propertyValue);
          applied.add(name);
        }
      }
    },
  );
  return () => {
    stop();
    for (const name of applied) target.style.removeProperty(name);
    applied.clear();
  };
}
