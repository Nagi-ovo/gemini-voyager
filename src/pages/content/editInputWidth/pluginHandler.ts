/**
 * The Gemini edit input width feature as the packaged builtin plugin
 * `voyager.gemini-edit-input-width` runs it: the native module's stylesheet,
 * owned by the plugin's scope.
 *
 * The plugin host mounts this only while the feature is on, with
 * `widthPercent` read from `geminiEditInputWidth`; a width change arrives
 * through `updateGeminiEditInputWidthSettings` and rewrites the same
 * stylesheet in place. Differences from the native module: nothing observes
 * the page while the feature is off, turning it off removes the stylesheet at
 * once (not only on unload), and nothing is written back while it is off.
 *
 * While on, the handler keeps the two writes the native module made, as an
 * idempotent normalization of what is stored:
 *   - a switch never stored beside a customized width is stored as on (the
 *     host derived "on" from that width; storing it keeps the popup in step);
 *   - an old px width, or one out of range, is stored as its percent.
 * Each write re-reads storage first and writes only what still needs it, and
 * a read that a newer width or switch change overtook is dropped, so a choice
 * the popup stored meanwhile wins. Nothing is written once the plugin is torn
 * down or the extension context is gone.
 */
import { logger } from '@/core/services/LoggerService';
import { StorageKeys } from '@/core/types/common';
import {
  isCustomizedEditInputWidth,
  normalizeEditInputWidthPercent,
} from '@/core/utils/chatAppearanceValues';
import {
  hasValidExtensionContext,
  isExtensionContextInvalidatedError,
} from '@/core/utils/extensionContext';
import type { Dispose, PluginScope } from '@/features/plugins/runtime/pluginScope';
import type { PluginSettings } from '@/features/plugins/types';

import { buildEditInputWidthCss } from './editInputWidthCss';

export const EDIT_INPUT_WIDTH_STYLE_ID = 'gv-plugin-edit-input-width';
const REAPPLY_DEBOUNCE_MS = 200;

interface EditInputWidthRun {
  update(settings: PluginSettings): void;
}

/** The running activation(s); the engine sends setting changes to the handler, not to a scope. */
const runs = new Set<EditInputWidthRun>();

function chromeStorage(): typeof chrome.storage | undefined {
  return (globalThis as { chrome?: typeof chrome }).chrome?.storage;
}

/** What `stored` still needs rewritten; null when it needs nothing. */
function normalizationWrites(
  stored: Record<string, unknown> | undefined,
): Record<string, unknown> | null {
  const width = stored?.[StorageKeys.EDIT_INPUT_WIDTH];
  const writes: Record<string, unknown> = {};
  if (
    stored?.[StorageKeys.EDIT_INPUT_WIDTH_ENABLED] === undefined &&
    isCustomizedEditInputWidth(width)
  ) {
    writes[StorageKeys.EDIT_INPUT_WIDTH_ENABLED] = true;
  }
  if (typeof width === 'number' && normalizeEditInputWidthPercent(width) !== width) {
    writes[StorageKeys.EDIT_INPUT_WIDTH] = normalizeEditInputWidthPercent(width);
  }
  return Object.keys(writes).length > 0 ? writes : null;
}

const NORMALIZED_KEYS: readonly string[] = [
  StorageKeys.EDIT_INPUT_WIDTH,
  StorageKeys.EDIT_INPUT_WIDTH_ENABLED,
];

type StorageChanges = Record<string, chrome.storage.StorageChange>;

export function activateGeminiEditInputWidth(scope: PluginScope, settings: PluginSettings): void {
  let widthPercent = normalizeEditInputWidthPercent(settings.widthPercent);
  const style = document.createElement('style');
  style.id = EDIT_INPUT_WIDTH_STYLE_ID;

  const apply = (): void => {
    style.textContent = buildEditInputWidthCss(widthPercent);
    // Gemini's own head rewrites can drop the node; the next pass restores it.
    if (!style.isConnected) (document.head ?? document.documentElement).appendChild(style);
  };

  scope.effect(() => {
    apply();
    return () => style.remove();
  }, 'edit-input-width:style');

  const main = document.querySelector('main');
  if (main) {
    let pending: Dispose | null = null;
    // Entering edit mode toggles a class, so class changes count as well as new nodes.
    scope.observe(
      main,
      { childList: true, subtree: true, attributes: true, attributeFilter: ['class'] },
      () => {
        if (scope.isDisposed) return;
        void pending?.();
        pending = scope.timer(() => {
          pending = null;
          apply();
        }, REAPPLY_DEBOUNCE_MS);
      },
    );
  }

  // Every width or switch change starts a fresh read and voids the ones still
  // out: an old px width read before the user picked 90 % must not write 60 %.
  let revision = 0;
  const normalize = async (): Promise<void> => {
    const mine = ++revision;
    const sync = chromeStorage()?.sync;
    if (!sync || scope.isDisposed || !hasValidExtensionContext()) return;
    try {
      const stored = await sync.get<Record<string, unknown>>([...NORMALIZED_KEYS]);
      if (mine !== revision || scope.isDisposed || !hasValidExtensionContext()) return;
      const writes = normalizationWrites(stored);
      if (writes) await sync.set(writes);
    } catch (error) {
      if (isExtensionContextInvalidatedError(error)) return;
      logger.warn('Edit input width settings could not be normalized', { error: String(error) });
    }
  };

  const onChanged = chromeStorage()?.onChanged;
  if (onChanged) {
    // Faster than the host's update and covers the switch, which never reaches `update`.
    scope.onChromeEvent(onChanged, (changes: StorageChanges, areaName: string) => {
      if (scope.isDisposed || areaName !== 'sync') return;
      if (NORMALIZED_KEYS.some((key) => key in changes)) void normalize();
    });
  }

  const run: EditInputWidthRun = {
    update(next) {
      if (scope.isDisposed) return;
      widthPercent = normalizeEditInputWidthPercent(next.widthPercent);
      apply();
      void normalize();
    },
  };
  scope.effect(() => {
    runs.add(run);
    return () => {
      runs.delete(run);
    };
  }, 'edit-input-width:settings');

  void normalize();
}

export function updateGeminiEditInputWidthSettings(settings: PluginSettings): void {
  for (const run of runs) run.update(settings);
}
