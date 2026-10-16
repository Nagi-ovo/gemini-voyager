/**
 * The Gemini chat width feature as the packaged builtin plugin
 * `voyager.gemini-chat-width` runs it: the native module's rules and health
 * probe, owned by the plugin's scope.
 *
 * The plugin host mounts this only while the feature is on, with
 * `widthPercent` read from `geminiChatWidth`; a width change arrives through
 * `updateGeminiChatWidthSettings` and rewrites the same stylesheet in place.
 * Differences from the native module: nothing observes the page while the
 * feature is off, and nothing is written back while it is off.
 *
 * While on, the handler keeps the two writes the native module made
 * (`startLegacyWriteBack` owns the flow and its guards):
 *   - a switch never stored beside a customized width is stored as on, from
 *     the activation's first read only (the host derived "on" from that read);
 *   - an old px width, or one out of range, is stored as its percent.
 */
import { StorageKeys } from '@/core/types/common';
import {
  isCustomizedChatWidth,
  normalizeChatWidthPercent,
} from '@/core/utils/chatAppearanceValues';
import {
  type LegacyWriteBackCheck,
  startLegacyWriteBack,
} from '@/features/plugins/runtime/legacyWriteBack';
import type { Dispose, PluginScope } from '@/features/plugins/runtime/pluginScope';
import type { PluginSettings } from '@/features/plugins/types';

import { buildChatWidthCss, chatWidthPx } from './chatWidthCss';
import { createUserTurnProbe } from './userTurnProbe';

const STYLE_ID = 'gv-plugin-chat-width';
const REAPPLY_DEBOUNCE_MS = 200;

interface ChatWidthRun {
  update(settings: PluginSettings): void;
}

/** The running activation(s); the engine sends setting changes to the handler, not to a scope. */
const runs = new Set<ChatWidthRun>();

function widthPercentOf(settings: PluginSettings): number {
  return normalizeChatWidthPercent(settings.widthPercent);
}

/**
 * What `stored` still needs rewritten; null when it needs nothing. The switch
 * is recorded only from the first read: the host derived "on" from that
 * storage, and a later missing switch is a live removal, not an upgrade.
 */
export function planChatWidthWrites(
  stored: Readonly<Record<string, unknown>>,
  { firstRead }: LegacyWriteBackCheck,
): Record<string, unknown> | null {
  const width = stored[StorageKeys.CHAT_WIDTH];
  const writes: Record<string, unknown> = {};
  if (
    firstRead &&
    stored[StorageKeys.CHAT_WIDTH_ENABLED] === undefined &&
    isCustomizedChatWidth(width)
  ) {
    writes[StorageKeys.CHAT_WIDTH_ENABLED] = true;
  }
  if (typeof width === 'number' && normalizeChatWidthPercent(width) !== width) {
    writes[StorageKeys.CHAT_WIDTH] = normalizeChatWidthPercent(width);
  }
  return Object.keys(writes).length > 0 ? writes : null;
}

export function activateGeminiChatWidth(scope: PluginScope, settings: PluginSettings): void {
  let widthPercent = widthPercentOf(settings);
  const probe = createUserTurnProbe();
  const style = document.createElement('style');
  style.id = STYLE_ID;

  const apply = (): void => {
    style.textContent = buildChatWidthCss(chatWidthPx(widthPercent));
    // Gemini's own head rewrites can drop the node; the next pass restores it.
    if (!style.isConnected) (document.head ?? document.documentElement).appendChild(style);
  };

  scope.effect(() => {
    apply();
    return () => style.remove();
  }, 'chat-width:style');
  scope.effect(() => () => probe.reset(), 'chat-width:health');
  probe.check();

  const main = document.querySelector('main');
  if (main) {
    let pending: Dispose | null = null;
    scope.observe(main, { childList: true, subtree: true }, () => {
      if (scope.isDisposed) return;
      void pending?.();
      pending = scope.timer(() => {
        pending = null;
        apply();
        probe.check();
      }, REAPPLY_DEBOUNCE_MS);
    });
  }

  const writeBack = startLegacyWriteBack(scope, {
    keys: [StorageKeys.CHAT_WIDTH, StorageKeys.CHAT_WIDTH_ENABLED],
    plan: planChatWidthWrites,
    label: 'Chat width',
  });

  const run: ChatWidthRun = {
    update(next) {
      if (scope.isDisposed) return;
      widthPercent = widthPercentOf(next);
      apply();
      writeBack.recheck();
    },
  };
  scope.effect(() => {
    runs.add(run);
    return () => {
      runs.delete(run);
    };
  }, 'chat-width:settings');
}

export function updateGeminiChatWidthSettings(settings: PluginSettings): void {
  for (const run of runs) run.update(settings);
}
