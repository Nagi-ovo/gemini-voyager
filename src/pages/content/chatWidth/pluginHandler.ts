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
 * While on, the handler keeps the two writes the native module made, as an
 * idempotent normalization of what is stored, never as a one-time event:
 *   - a switch never stored beside a customized width is stored as on (the
 *     host derived "on" from that width; storing it keeps the popup in step);
 *   - an old px width, or one out of range, is stored as its percent.
 * Each write re-reads storage first and writes only what still needs it, so a
 * choice the popup stored meanwhile wins. Nothing is written once the plugin
 * is torn down or the extension context is gone, and the host never waits on
 * these writes.
 */
import { logger } from '@/core/services/LoggerService';
import { StorageKeys } from '@/core/types/common';
import {
  isCustomizedChatWidth,
  normalizeChatWidthPercent,
} from '@/core/utils/chatAppearanceValues';
import {
  hasValidExtensionContext,
  isExtensionContextInvalidatedError,
} from '@/core/utils/extensionContext';
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

function syncStorage(): chrome.storage.SyncStorageArea | undefined {
  const g = globalThis as { chrome?: typeof chrome };
  return g.chrome?.storage?.sync;
}

async function normalizeStoredChatWidth(scope: PluginScope): Promise<void> {
  const sync = syncStorage();
  if (!sync || scope.isDisposed || !hasValidExtensionContext()) return;
  try {
    const stored = await sync.get<Record<string, unknown>>([
      StorageKeys.CHAT_WIDTH,
      StorageKeys.CHAT_WIDTH_ENABLED,
    ]);
    if (scope.isDisposed || !hasValidExtensionContext()) return;
    const width = stored?.[StorageKeys.CHAT_WIDTH];
    const writes: Record<string, unknown> = {};
    if (stored?.[StorageKeys.CHAT_WIDTH_ENABLED] === undefined && isCustomizedChatWidth(width)) {
      writes[StorageKeys.CHAT_WIDTH_ENABLED] = true;
    }
    if (typeof width === 'number' && normalizeChatWidthPercent(width) !== width) {
      writes[StorageKeys.CHAT_WIDTH] = normalizeChatWidthPercent(width);
    }
    if (Object.keys(writes).length > 0) await sync.set(writes);
  } catch (error) {
    if (isExtensionContextInvalidatedError(error)) return;
    logger.warn('Chat width settings could not be normalized', { error: String(error) });
  }
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

  const run: ChatWidthRun = {
    update(next) {
      if (scope.isDisposed) return;
      widthPercent = widthPercentOf(next);
      apply();
      void normalizeStoredChatWidth(scope);
    },
  };
  scope.effect(() => {
    runs.add(run);
    return () => {
      runs.delete(run);
    };
  }, 'chat-width:settings');

  void normalizeStoredChatWidth(scope);
}

export function updateGeminiChatWidthSettings(settings: PluginSettings): void {
  for (const run of runs) run.update(settings);
}
