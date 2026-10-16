/**
 * The packaged official plugins whose on/off switch is an existing Voyager
 * setting, and how to read and write it.
 *
 * For a bound id the legacy sync keys are the only authority: its entry in
 * `gvPluginsState` is ignored, enabled flag and settings alike, so restoring a
 * plugins backup and a settings backup in either order cannot disagree about
 * whether or how the feature runs. Its settings come only from its value
 * bindings (`legacyValueBindings.ts`), `{}` without any. Every other id keeps
 * `isPluginEnabled`.
 *
 * Each `read` is today's production reading of that key, invalid values
 * included, and `read(undefined)` is the production default. Not part of the
 * CLI bundle (it imports `StorageKeys`): `hostPolicy` must not import it.
 */
import { logger } from '@/core/services/LoggerService';
import { StorageKeys } from '@/core/types/common';
import { readInitialAIStudioSidebarWidth } from '@/core/utils/aistudioSidebarWidthValues';
import { isSafari } from '@/core/utils/browser';
import { isChatWidthSwitchOn, isEditInputWidthSwitchOn } from '@/core/utils/chatAppearanceValues';
import { isExtensionContextInvalidatedError } from '@/core/utils/extensionContext';
import { isSidebarWidthSwitchOn } from '@/core/utils/sidebarWidthValues';
import { resolveVisualEffect } from '@/core/utils/visualEffectValues';

import { resolvePluginSettings } from '../runtime/resolvePluginSettings';
import { OFFICIAL_PLUGIN_IDS } from '../sites/featureOwners';
import type { PluginManifest, PluginSettings } from '../types';
import { legacyValueKeys } from './legacyValueBindings';
import { isPluginEnabled } from './pluginDefaults';

export interface LegacyEnableBinding {
  readonly pluginId: string;
  readonly area: 'sync';
  readonly key: string;
  /** The production reading of the stored value; `read(undefined)` is the default. */
  readonly read: (stored: unknown) => boolean;
  /** The value the existing settings UI stores for this switch. */
  readonly write: (enabled: boolean) => unknown;
  /**
   * When the native module decides from more than `key` (or decides once per
   * page), the page's decision; `read` stays the single-key reading the popup
   * shows and writes. Every key it reads must be in `legacyBindingKeys()`.
   */
  readonly derive?: (snapshot: LegacySettingSnapshot, wasChangedLive: WasChangedLive) => boolean;
}

/** Stored values by storage key. An own key holding `undefined` means "removed". */
export type LegacySettingSnapshot = Readonly<Record<string, unknown>>;

/** Whether `key` took a live change while this page lived (the first read is no change). */
export type WasChangedLive = (key: string) => boolean;

const neverChangedLive: WasChangedLive = () => false;

type StateEntries = Readonly<
  Record<string, { readonly enabled?: unknown; readonly settings?: PluginSettings } | undefined>
>;

const onUnlessFalse = (stored: unknown): boolean => stored !== false;
const onOnlyIfTrue = (stored: unknown): boolean => stored === true;
/** Off when never stored (the native read defaults to `false`); any stored value but `false` is on. */
const onUnlessMissingOrFalse = (stored: unknown): boolean =>
  stored !== undefined && stored !== false;
const storeBoolean = (enabled: boolean): boolean => enabled;

function binding(
  pluginId: string,
  key: string,
  read: (stored: unknown) => boolean,
): LegacyEnableBinding {
  return { pluginId, area: 'sync', key, read, write: storeBoolean };
}

/** Batch selection still needs the native folder surface, even after opting in explicitly. */
function batchDeleteBinding(pluginId: string): LegacyEnableBinding {
  return {
    ...binding(pluginId, StorageKeys.BATCH_DELETE_ENABLED, onUnlessFalse),
    derive: (snapshot) =>
      onUnlessFalse(snapshotValue(snapshot, StorageKeys.BATCH_DELETE_ENABLED)) &&
      onUnlessFalse(snapshotValue(snapshot, StorageKeys.FOLDER_ENABLED)),
  };
}

export const LEGACY_ENABLE_BINDINGS: Readonly<Record<string, LegacyEnableBinding>> = {
  [OFFICIAL_PLUGIN_IDS.geminiMessageTimestamps]: binding(
    OFFICIAL_PLUGIN_IDS.geminiMessageTimestamps,
    StorageKeys.GV_SHOW_MESSAGE_TIMESTAMPS,
    onOnlyIfTrue,
  ),
  [OFFICIAL_PLUGIN_IDS.geminiBatchDelete]: batchDeleteBinding(
    OFFICIAL_PLUGIN_IDS.geminiBatchDelete,
  ),
  [OFFICIAL_PLUGIN_IDS.aistudioBatchDelete]: batchDeleteBinding(
    OFFICIAL_PLUGIN_IDS.aistudioBatchDelete,
  ),
  [OFFICIAL_PLUGIN_IDS.visualEffects]: {
    pluginId: OFFICIAL_PLUGIN_IDS.visualEffects,
    area: 'sync',
    key: StorageKeys.GV_VISUAL_EFFECT,
    read: (stored) => resolveVisualEffect(stored) !== 'off',
    write: (enabled) => (enabled ? 'snow' : 'off'),
    derive: (snapshot) =>
      resolveVisualEffect(
        snapshot[StorageKeys.GV_VISUAL_EFFECT],
        snapshot[StorageKeys.GV_SNOW_EFFECT],
      ) !== 'off',
  },
  [OFFICIAL_PLUGIN_IDS.aistudioSidebarWidth]: {
    ...binding(
      OFFICIAL_PLUGIN_IDS.aistudioSidebarWidth,
      StorageKeys.AISTUDIO_SIDEBAR_WIDTH_ENABLED,
      onUnlessFalse,
    ),
    derive: (snapshot) => {
      const stored = snapshotValue(snapshot, StorageKeys.AISTUDIO_SIDEBAR_WIDTH_ENABLED);
      // Until explicitly set, preserve the folder-owned layout switch, including live changes.
      return typeof stored === 'boolean'
        ? stored
        : onUnlessFalse(snapshotValue(snapshot, StorageKeys.FOLDER_ENABLED));
    },
  },
  [OFFICIAL_PLUGIN_IDS.geminiGemsSidebar]: binding(
    OFFICIAL_PLUGIN_IDS.geminiGemsSidebar,
    StorageKeys.GV_GEMS_SIDEBAR_ENABLED,
    onUnlessFalse,
  ),
  [OFFICIAL_PLUGIN_IDS.geminiContextSync]: binding(
    OFFICIAL_PLUGIN_IDS.geminiContextSync,
    StorageKeys.CONTEXT_SYNC_ENABLED,
    onOnlyIfTrue,
  ),
  [OFFICIAL_PLUGIN_IDS.geminiSidebarWidth]: {
    ...binding(
      OFFICIAL_PLUGIN_IDS.geminiSidebarWidth,
      StorageKeys.SIDEBAR_WIDTH_ENABLED,
      onOnlyIfTrue,
    ),
    derive: (snapshot, wasChangedLive) =>
      isSidebarWidthSwitchOn({
        storedSwitch: snapshotValue(snapshot, StorageKeys.SIDEBAR_WIDTH_ENABLED),
        storedWidth: snapshotValue(snapshot, StorageKeys.SIDEBAR_WIDTH),
        switchChangedLive: wasChangedLive(StorageKeys.SIDEBAR_WIDTH_ENABLED),
        widthChangedLive: wasChangedLive(StorageKeys.SIDEBAR_WIDTH),
      }),
  },
  [OFFICIAL_PLUGIN_IDS.geminiSidebarAutoHide]: binding(
    OFFICIAL_PLUGIN_IDS.geminiSidebarAutoHide,
    StorageKeys.GV_SIDEBAR_AUTO_HIDE,
    onOnlyIfTrue,
  ),
  [OFFICIAL_PLUGIN_IDS.geminiSidebarFullHide]: binding(
    OFFICIAL_PLUGIN_IDS.geminiSidebarFullHide,
    StorageKeys.GV_SIDEBAR_FULL_HIDE,
    onOnlyIfTrue,
  ),
  [OFFICIAL_PLUGIN_IDS.geminiTimeline]: binding(
    OFFICIAL_PLUGIN_IDS.geminiTimeline,
    StorageKeys.GV_TIMELINE_ENABLED,
    onUnlessFalse,
  ),
  [OFFICIAL_PLUGIN_IDS.geminiResponseNotification]: binding(
    OFFICIAL_PLUGIN_IDS.geminiResponseNotification,
    StorageKeys.RESPONSE_COMPLETE_NOTIFICATION_ENABLED,
    onOnlyIfTrue,
  ),
  [OFFICIAL_PLUGIN_IDS.geminiPreventAutoScroll]: binding(
    OFFICIAL_PLUGIN_IDS.geminiPreventAutoScroll,
    StorageKeys.PREVENT_AUTO_SCROLL_ENABLED,
    onOnlyIfTrue,
  ),
  [OFFICIAL_PLUGIN_IDS.geminiHighlight]: binding(
    OFFICIAL_PLUGIN_IDS.geminiHighlight,
    StorageKeys.HIGHLIGHT_ENABLED,
    onOnlyIfTrue,
  ),
  [OFFICIAL_PLUGIN_IDS.geminiQuoteReply]: binding(
    OFFICIAL_PLUGIN_IDS.geminiQuoteReply,
    StorageKeys.QUOTE_REPLY_ENABLED,
    onUnlessFalse,
  ),
  [OFFICIAL_PLUGIN_IDS.geminiUsageStatus]: binding(
    OFFICIAL_PLUGIN_IDS.geminiUsageStatus,
    StorageKeys.USAGE_STATUS_ENABLED,
    onOnlyIfTrue,
  ),
  [OFFICIAL_PLUGIN_IDS.geminiFork]: binding(
    OFFICIAL_PLUGIN_IDS.geminiFork,
    StorageKeys.FORK_ENABLED,
    onOnlyIfTrue,
  ),
  [OFFICIAL_PLUGIN_IDS.geminiDraftSave]: binding(
    OFFICIAL_PLUGIN_IDS.geminiDraftSave,
    StorageKeys.DRAFT_AUTO_SAVE,
    onOnlyIfTrue,
  ),
  [OFFICIAL_PLUGIN_IDS.aistudioEnterSend]: binding(
    OFFICIAL_PLUGIN_IDS.aistudioEnterSend,
    StorageKeys.AISTUDIO_ENTER_SEND,
    onOnlyIfTrue,
  ),
  [OFFICIAL_PLUGIN_IDS.geminiCtrlEnterSend]: binding(
    OFFICIAL_PLUGIN_IDS.geminiCtrlEnterSend,
    StorageKeys.CTRL_ENTER_SEND,
    onOnlyIfTrue,
  ),
  [OFFICIAL_PLUGIN_IDS.geminiSafariEnterFix]: {
    ...binding(
      OFFICIAL_PLUGIN_IDS.geminiSafariEnterFix,
      StorageKeys.SAFARI_ENTER_FIX,
      onOnlyIfTrue,
    ),
    derive: (snapshot) =>
      isSafari() && snapshotValue(snapshot, StorageKeys.SAFARI_ENTER_FIX) === true,
  },
  // One switch for both sites, as the popup has always presented it.
  [OFFICIAL_PLUGIN_IDS.geminiFormulaCopy]: binding(
    OFFICIAL_PLUGIN_IDS.geminiFormulaCopy,
    StorageKeys.FORMULA_COPY_ENABLED,
    onUnlessFalse,
  ),
  [OFFICIAL_PLUGIN_IDS.aistudioFormulaCopy]: binding(
    OFFICIAL_PLUGIN_IDS.aistudioFormulaCopy,
    StorageKeys.FORMULA_COPY_ENABLED,
    onUnlessFalse,
  ),
  [OFFICIAL_PLUGIN_IDS.geminiVimInput]: binding(
    OFFICIAL_PLUGIN_IDS.geminiVimInput,
    StorageKeys.INPUT_VIM_MODE,
    onOnlyIfTrue,
  ),
  // `true` hides the halo: the feature is on.
  [OFFICIAL_PLUGIN_IDS.geminiHideInputHalo]: binding(
    OFFICIAL_PLUGIN_IDS.geminiHideInputHalo,
    StorageKeys.INPUT_HALO_HIDDEN,
    onOnlyIfTrue,
  ),
  [OFFICIAL_PLUGIN_IDS.geminiChatFontSize]: binding(
    OFFICIAL_PLUGIN_IDS.geminiChatFontSize,
    StorageKeys.CHAT_FONT_SIZE_ENABLED,
    onOnlyIfTrue,
  ),
  // Also the paragraph spacing switch: the native modules share it.
  [OFFICIAL_PLUGIN_IDS.geminiChatLineHeight]: binding(
    OFFICIAL_PLUGIN_IDS.geminiChatLineHeight,
    StorageKeys.CHAT_LINE_HEIGHT_ENABLED,
    onOnlyIfTrue,
  ),
  // A switch never stored follows the width the page first read (see `isChatWidthSwitchOn`).
  [OFFICIAL_PLUGIN_IDS.geminiChatWidth]: {
    ...binding(OFFICIAL_PLUGIN_IDS.geminiChatWidth, StorageKeys.CHAT_WIDTH_ENABLED, onOnlyIfTrue),
    derive: (snapshot, wasChangedLive) =>
      isChatWidthSwitchOn({
        storedSwitch: snapshotValue(snapshot, StorageKeys.CHAT_WIDTH_ENABLED),
        storedWidth: snapshotValue(snapshot, StorageKeys.CHAT_WIDTH),
        switchChangedLive: wasChangedLive(StorageKeys.CHAT_WIDTH_ENABLED),
        widthChangedLive: wasChangedLive(StorageKeys.CHAT_WIDTH),
      }),
  },
  // The same upgrade rule as chat width: a never-stored switch follows a customized first width.
  [OFFICIAL_PLUGIN_IDS.geminiEditInputWidth]: {
    ...binding(
      OFFICIAL_PLUGIN_IDS.geminiEditInputWidth,
      StorageKeys.EDIT_INPUT_WIDTH_ENABLED,
      onOnlyIfTrue,
    ),
    derive: (snapshot, wasChangedLive) =>
      isEditInputWidthSwitchOn({
        storedSwitch: snapshotValue(snapshot, StorageKeys.EDIT_INPUT_WIDTH_ENABLED),
        storedWidth: snapshotValue(snapshot, StorageKeys.EDIT_INPUT_WIDTH),
        switchChangedLive: wasChangedLive(StorageKeys.EDIT_INPUT_WIDTH_ENABLED),
        widthChangedLive: wasChangedLive(StorageKeys.EDIT_INPUT_WIDTH),
      }),
  },
  [OFFICIAL_PLUGIN_IDS.geminiDeepResearchExport]: binding(
    OFFICIAL_PLUGIN_IDS.geminiDeepResearchExport,
    StorageKeys.DEEP_RESEARCH_EXPORT_ENABLED,
    onUnlessFalse,
  ),
  [OFFICIAL_PLUGIN_IDS.geminiMarkdownFix]: binding(
    OFFICIAL_PLUGIN_IDS.geminiMarkdownFix,
    StorageKeys.MARKDOWN_FIX_ENABLED,
    onUnlessFalse,
  ),
  [OFFICIAL_PLUGIN_IDS.geminiCanvasCopy]: binding(
    OFFICIAL_PLUGIN_IDS.geminiCanvasCopy,
    StorageKeys.CANVAS_COPY_ENABLED,
    onUnlessFalse,
  ),
  [OFFICIAL_PLUGIN_IDS.geminiUserLatex]: binding(
    OFFICIAL_PLUGIN_IDS.geminiUserLatex,
    StorageKeys.USER_LATEX_ENABLED,
    onUnlessFalse,
  ),
  [OFFICIAL_PLUGIN_IDS.geminiCodeCollapse]: binding(
    OFFICIAL_PLUGIN_IDS.geminiCodeCollapse,
    StorageKeys.CODE_BLOCK_COLLAPSE_ENABLED,
    onUnlessFalse,
  ),
  [OFFICIAL_PLUGIN_IDS.geminiWaveDrom]: binding(
    OFFICIAL_PLUGIN_IDS.geminiWaveDrom,
    StorageKeys.WAVEDROM_ENABLED,
    onUnlessFalse,
  ),
  [OFFICIAL_PLUGIN_IDS.geminiECharts]: binding(
    OFFICIAL_PLUGIN_IDS.geminiECharts,
    StorageKeys.ECHARTS_ENABLED,
    onUnlessFalse,
  ),
  [OFFICIAL_PLUGIN_IDS.geminiMermaid]: binding(
    OFFICIAL_PLUGIN_IDS.geminiMermaid,
    StorageKeys.MERMAID_ENABLED,
    onUnlessFalse,
  ),
  [OFFICIAL_PLUGIN_IDS.geminiPromptHistory]: binding(
    OFFICIAL_PLUGIN_IDS.geminiPromptHistory,
    StorageKeys.PROMPT_HISTORY_ENABLED,
    onOnlyIfTrue,
  ),
  [OFFICIAL_PLUGIN_IDS.geminiInputCollapse]: binding(
    OFFICIAL_PLUGIN_IDS.geminiInputCollapse,
    StorageKeys.INPUT_COLLAPSE_ENABLED,
    onUnlessMissingOrFalse,
  ),
  [OFFICIAL_PLUGIN_IDS.geminiResearchPack]: binding(
    OFFICIAL_PLUGIN_IDS.geminiResearchPack,
    StorageKeys.RESEARCH_PACK_ENABLED,
    onOnlyIfTrue,
  ),
  // A never-set switch is on, in the popup and the content script alike.
  [OFFICIAL_PLUGIN_IDS.geminiDefaultModel]: binding(
    OFFICIAL_PLUGIN_IDS.geminiDefaultModel,
    StorageKeys.DEFAULT_MODEL_AUTO_APPLY,
    onUnlessFalse,
  ),
};

export function legacyBindingFor(id: string): LegacyEnableBinding | null {
  return Object.prototype.hasOwnProperty.call(LEGACY_ENABLE_BINDINGS, id)
    ? LEGACY_ENABLE_BINDINGS[id]
    : null;
}

/** The storage keys behind every enable and value binding, each once. */
export function legacyBindingKeys(): readonly string[] {
  return [
    ...new Set([
      ...Object.values(LEGACY_ENABLE_BINDINGS).map((entry) => entry.key),
      ...legacyValueKeys(),
      StorageKeys.FOLDER_ENABLED,
    ]),
  ];
}

function snapshotValue(legacy: LegacySettingSnapshot, key: string): unknown {
  return Object.prototype.hasOwnProperty.call(legacy, key) ? legacy[key] : undefined;
}

/**
 * Whether plugin `id` should run: its legacy keys when bound, otherwise its
 * plugin-state entry. `wasChangedLive` only matters to a binding that
 * derives its switch; a caller without a page lifetime (the popup) omits it.
 */
export function resolveEffectiveEnabled(
  state: StateEntries,
  legacy: LegacySettingSnapshot,
  id: string,
  wasChangedLive: WasChangedLive = neverChangedLive,
): boolean {
  const bound = legacyBindingFor(id);
  if (bound) {
    return bound.derive
      ? bound.derive(legacy, wasChangedLive)
      : bound.read(snapshotValue(legacy, bound.key));
  }
  return isPluginEnabled(state, id);
}

/**
 * The settings an unbound plugin runs with: declared defaults merged with its
 * plugin-state entry. A bound official plugin gets `{}` here and never its map
 * values (stray ones must not restart it); the host and popup diagnostics
 * give it its legacy values instead (`legacyBoundSettings`).
 */
export function resolveEffectiveSettings(
  manifest: PluginManifest,
  state: StateEntries,
): PluginSettings {
  if (legacyBindingFor(manifest.id)) return {};
  const entry = Object.prototype.hasOwnProperty.call(state, manifest.id)
    ? state[manifest.id]
    : undefined;
  return resolvePluginSettings(manifest, entry?.settings);
}

/**
 * The sync-storage write that switches bound plugin `id` on or off.
 * Enabling Visual effects selects snow; disabling selects off.
 */
export function legacyEnableWrite(id: string, enabled: boolean): Readonly<Record<string, unknown>> {
  const bound = legacyBindingFor(id);
  if (!bound) throw new Error(`No legacy setting binding for plugin "${id}"`);
  if (id === OFFICIAL_PLUGIN_IDS.visualEffects) {
    return {
      [StorageKeys.GV_VISUAL_EFFECT]: bound.write(enabled),
      [StorageKeys.GV_SNOW_EFFECT]: false,
    };
  }
  return { [bound.key]: bound.write(enabled) };
}

function syncArea(): chrome.storage.SyncStorageArea | undefined {
  const g = globalThis as { chrome?: typeof chrome };
  return g.chrome?.storage?.sync;
}

/**
 * Read every binding key from sync storage; missing switches stay missing.
 * An invalidated extension context rejects (the caller must not mount on a
 * guessed default). Any other failure is logged and read as "all missing",
 * the defaults the native modules have always fallen back to. AI Studio width
 * resolves its localStorage fallback here so a failed read differs from a missing key.
 */
export async function loadLegacySettingSnapshot(
  keys: readonly string[] = legacyBindingKeys(),
): Promise<LegacySettingSnapshot> {
  const sync = syncArea();
  const fallback = () => ({
    [StorageKeys.AISTUDIO_SIDEBAR_WIDTH]: readInitialAIStudioSidebarWidth(undefined, false),
  });
  if (!sync) return fallback();
  let stored: Record<string, unknown> | undefined;
  try {
    stored = await sync.get<Record<string, unknown>>([...keys]);
  } catch (error) {
    if (isExtensionContextInvalidatedError(error)) throw error;
    logger.warn('loadLegacySettingSnapshot failed', { error: String(error) });
    return fallback();
  }
  const snapshot: Record<string, unknown> = {};
  for (const key of keys) {
    if (stored && Object.prototype.hasOwnProperty.call(stored, key)) snapshot[key] = stored[key];
  }
  // Unlike most settings, AI Studio distinguishes a missing sync key from a failed read.
  snapshot[StorageKeys.AISTUDIO_SIDEBAR_WIDTH] = readInitialAIStudioSidebarWidth(
    snapshot[StorageKeys.AISTUDIO_SIDEBAR_WIDTH],
  );
  return snapshot;
}

/**
 * Report changes to binding keys in sync storage. A removed key arrives as an
 * own key holding `undefined`, so merging the change over a snapshot restores
 * that binding's default.
 */
export function subscribeLegacySettings(
  callback: (changed: LegacySettingSnapshot) => void,
  keys: readonly string[] = legacyBindingKeys(),
): () => void {
  const g = globalThis as { chrome?: typeof chrome };
  const onChanged = g.chrome?.storage?.onChanged;
  if (!onChanged) return () => {};

  const listener = (changes: Record<string, chrome.storage.StorageChange>, area: string): void => {
    if (area !== 'sync') return;
    const changed: Record<string, unknown> = {};
    let any = false;
    for (const key of keys) {
      if (!Object.prototype.hasOwnProperty.call(changes, key)) continue;
      changed[key] = changes[key]?.newValue;
      any = true;
    }
    if (any) callback(changed);
  };
  try {
    onChanged.addListener(listener);
  } catch (error) {
    if (isExtensionContextInvalidatedError(error)) return () => {};
    throw error;
  }
  return () => {
    try {
      onChanged.removeListener(listener);
    } catch {
      // ignore — context may be gone
    }
  };
}
