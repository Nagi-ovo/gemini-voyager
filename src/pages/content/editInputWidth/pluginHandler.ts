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
 * While on, the handler keeps the two writes the native module made
 * (`startLegacyWriteBack` owns the flow and its guards):
 *   - a switch never stored beside a customized width is stored as on, from
 *     the activation's first read only (the host derived "on" from that read);
 *   - an old px width, or one out of range, is stored as its percent.
 */
import { StorageKeys } from '@/core/types/common';
import {
  isCustomizedEditInputWidth,
  normalizeEditInputWidthPercent,
} from '@/core/utils/chatAppearanceValues';
import {
  type LegacyWriteBackCheck,
  startLegacyWriteBack,
} from '@/features/plugins/runtime/legacyWriteBack';
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

/**
 * What `stored` still needs rewritten; null when it needs nothing. The switch
 * is recorded only from the first read: the host derived "on" from that
 * storage, and a later missing switch is a live removal, not an upgrade.
 */
export function planEditInputWidthWrites(
  stored: Readonly<Record<string, unknown>>,
  { firstRead }: LegacyWriteBackCheck,
): Record<string, unknown> | null {
  const width = stored[StorageKeys.EDIT_INPUT_WIDTH];
  const writes: Record<string, unknown> = {};
  if (
    firstRead &&
    stored[StorageKeys.EDIT_INPUT_WIDTH_ENABLED] === undefined &&
    isCustomizedEditInputWidth(width)
  ) {
    writes[StorageKeys.EDIT_INPUT_WIDTH_ENABLED] = true;
  }
  if (typeof width === 'number' && normalizeEditInputWidthPercent(width) !== width) {
    writes[StorageKeys.EDIT_INPUT_WIDTH] = normalizeEditInputWidthPercent(width);
  }
  return Object.keys(writes).length > 0 ? writes : null;
}

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

  const writeBack = startLegacyWriteBack(scope, {
    keys: [StorageKeys.EDIT_INPUT_WIDTH, StorageKeys.EDIT_INPUT_WIDTH_ENABLED],
    plan: planEditInputWidthWrites,
    label: 'Edit input width',
  });

  const run: EditInputWidthRun = {
    update(next) {
      if (scope.isDisposed) return;
      widthPercent = normalizeEditInputWidthPercent(next.widthPercent);
      apply();
      writeBack.recheck();
    },
  };
  scope.effect(() => {
    runs.add(run);
    return () => {
      runs.delete(run);
    };
  }, 'edit-input-width:settings');
}

export function updateGeminiEditInputWidthSettings(settings: PluginSettings): void {
  for (const run of runs) run.update(settings);
}
