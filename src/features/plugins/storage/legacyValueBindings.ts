/**
 * The settings a packaged official plugin takes from existing Voyager values
 * (a slider's number, a sub-switch's boolean), next to the on/off switch
 * `legacySettingBindings` binds.
 *
 * For an id with an enable binding, these are its only settings: its
 * `gvPluginsState` settings are ignored, and an id without value bindings
 * runs with `{}`. Each `read` is the shared normalize the native module uses,
 * so a stored value renders the same whoever runs the feature, and reading
 * never writes the normalized value back.
 *
 * A live change the native module would ignore (for a number, a value that is
 * not a number or the key's removal) is dropped by the snapshot feed through
 * `acceptsLiveChange`, so the plugin keeps the last value, as the native
 * listener did. A boolean takes every live change: its native listener read
 * anything but `true`, removal included, as off. The first read takes
 * whatever is stored and `read` falls back to the default.
 *
 * This module imports no other binding module at runtime, so
 * `legacySettingBindings` can import it (to load and subscribe these keys)
 * without a cycle. Not part of
 * the CLI bundle (it imports `StorageKeys`): `hostPolicy` must not import it.
 */
import { StorageKeys } from '@/core/types/common';
import {
  normalizeChatFontSizePercent,
  normalizeChatLineHeightPercent,
  normalizeChatWidthPercent,
  normalizeEditInputWidthPercent,
  normalizeParagraphSpacingPx,
} from '@/core/utils/chatAppearanceValues';
import { normalizeSidebarWidth } from '@/core/utils/sidebarWidthValues';

import { OFFICIAL_PLUGIN_IDS } from '../sites/featureOwners';
import type { PluginSettings } from '../types';
import type { LegacySettingSnapshot } from './legacySettingBindings';

export interface LegacyValueBinding {
  /** The manifest setting this value fills. */
  readonly settingKey: string;
  /** The sync storage key the native module reads. */
  readonly legacyKey: string;
  /** The native module's reading of the stored value; `read(undefined)` is the default. */
  readonly read: (stored: unknown) => number | boolean;
  /** Whether a live change to `legacyKey` replaces the current value (the native listener's test). */
  readonly acceptsLiveChange: (value: unknown) => boolean;
}

export type LegacyValueBindingTable = Readonly<Record<string, readonly LegacyValueBinding[]>>;

const isNumber = (value: unknown): boolean => typeof value === 'number';
const always = (): boolean => true;
const isTrue = (stored: unknown): boolean => stored === true;

function numberBinding(
  settingKey: string,
  legacyKey: string,
  read: (stored: unknown) => number,
): LegacyValueBinding {
  return { settingKey, legacyKey, read, acceptsLiveChange: isNumber };
}

/** A sub-switch the native module reads as `=== true`, at startup and live. */
function trueOnlyBinding(settingKey: string, legacyKey: string): LegacyValueBinding {
  return { settingKey, legacyKey, read: isTrue, acceptsLiveChange: always };
}

/**
 * Inert for an id until `LEGACY_ENABLE_BINDINGS` binds it: an unbound id
 * keeps reading its settings from `gvPluginsState`.
 */
export const LEGACY_VALUE_BINDINGS: LegacyValueBindingTable = {
  [OFFICIAL_PLUGIN_IDS.geminiSidebarWidth]: [
    {
      settingKey: 'widthPx',
      legacyKey: StorageKeys.SIDEBAR_WIDTH,
      read: normalizeSidebarWidth,
      // The sidebar's native listener coerced finite values, including old numeric strings.
      acceptsLiveChange: (value) => Number.isFinite(Number(value)),
    },
  ],
  [OFFICIAL_PLUGIN_IDS.geminiChatFontSize]: [
    numberBinding('fontSize', StorageKeys.CHAT_FONT_SIZE, normalizeChatFontSizePercent),
  ],
  // Line height and paragraph spacing share one switch, so one plugin.
  [OFFICIAL_PLUGIN_IDS.geminiChatLineHeight]: [
    numberBinding('lineHeight', StorageKeys.CHAT_LINE_HEIGHT, normalizeChatLineHeightPercent),
    numberBinding(
      'paragraphSpacing',
      StorageKeys.CHAT_PARAGRAPH_SPACING,
      normalizeParagraphSpacingPx,
    ),
  ],
  [OFFICIAL_PLUGIN_IDS.geminiChatWidth]: [
    numberBinding('widthPercent', StorageKeys.CHAT_WIDTH, normalizeChatWidthPercent),
  ],
  [OFFICIAL_PLUGIN_IDS.geminiEditInputWidth]: [
    numberBinding('widthPercent', StorageKeys.EDIT_INPUT_WIDTH, normalizeEditInputWidthPercent),
  ],
  [OFFICIAL_PLUGIN_IDS.geminiInputCollapse]: [
    trueOnlyBinding('collapseWhenNotEmpty', StorageKeys.INPUT_COLLAPSE_WHEN_NOT_EMPTY),
  ],
};

export function legacyValueBindingsFor(
  id: string,
  table: LegacyValueBindingTable = LEGACY_VALUE_BINDINGS,
): readonly LegacyValueBinding[] {
  return Object.prototype.hasOwnProperty.call(table, id) ? table[id] : [];
}

/** The storage keys behind every value binding, each once. */
export function legacyValueKeys(
  table: LegacyValueBindingTable = LEGACY_VALUE_BINDINGS,
): readonly string[] {
  return [
    ...new Set(
      Object.values(table).flatMap((bindings) => bindings.map((entry) => entry.legacyKey)),
    ),
  ];
}

/** The settings of bound official plugin `id`, read from its legacy value keys; `{}` without any. */
export function deriveLegacyValueSettings(
  id: string,
  legacy: LegacySettingSnapshot,
  table: LegacyValueBindingTable = LEGACY_VALUE_BINDINGS,
): PluginSettings {
  const settings: Record<string, number | boolean> = {};
  for (const entry of legacyValueBindingsFor(id, table)) {
    const stored = Object.prototype.hasOwnProperty.call(legacy, entry.legacyKey)
      ? legacy[entry.legacyKey]
      : undefined;
    settings[entry.settingKey] = entry.read(stored);
  }
  return settings;
}

/**
 * Whether a live change of `key` to `value` reaches the snapshot. A key no
 * value binding reads (an on/off switch) always does.
 */
export function acceptsLegacyLiveChange(
  key: string,
  value: unknown,
  table: LegacyValueBindingTable = LEGACY_VALUE_BINDINGS,
): boolean {
  for (const bindings of Object.values(table)) {
    for (const entry of bindings) {
      if (entry.legacyKey === key && !entry.acceptsLiveChange(value)) return false;
    }
  }
  return true;
}
