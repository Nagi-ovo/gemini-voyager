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
 * choice the popup stored meanwhile wins. A read that a newer width or switch
 * change overtook (a host update, or this page's own storage listener) is
 * dropped: its answer may predate that change, and only the latest read may
 * write. Nothing is written once the plugin is torn down or the extension
 * context is gone, and the host never waits on these writes.
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

function chromeStorage(): typeof chrome.storage | undefined {
  return (globalThis as { chrome?: typeof chrome }).chrome?.storage;
}

/**
 * Rewrites what `stored` says only where it still needs normalizing; null
 * when it needs nothing.
 */
function normalizationWrites(
  stored: Record<string, unknown> | undefined,
): Record<string, unknown> | null {
  const width = stored?.[StorageKeys.CHAT_WIDTH];
  const writes: Record<string, unknown> = {};
  if (stored?.[StorageKeys.CHAT_WIDTH_ENABLED] === undefined && isCustomizedChatWidth(width)) {
    writes[StorageKeys.CHAT_WIDTH_ENABLED] = true;
  }
  if (typeof width === 'number' && normalizeChatWidthPercent(width) !== width) {
    writes[StorageKeys.CHAT_WIDTH] = normalizeChatWidthPercent(width);
  }
  return Object.keys(writes).length > 0 ? writes : null;
}

const NORMALIZED_KEYS: readonly string[] = [StorageKeys.CHAT_WIDTH, StorageKeys.CHAT_WIDTH_ENABLED];

type StorageChanges = Record<string, chrome.storage.StorageChange>;

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

  // Every width or switch change starts a fresh read and voids the ones still
  // out: an old px width read before the user picked 90 % must not write 80 %.
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
      logger.warn('Chat width settings could not be normalized', { error: String(error) });
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

  const run: ChatWidthRun = {
    update(next) {
      if (scope.isDisposed) return;
      widthPercent = widthPercentOf(next);
      apply();
      void normalize();
    },
  };
  scope.effect(() => {
    runs.add(run);
    return () => {
      runs.delete(run);
    };
  }, 'chat-width:settings');

  void normalize();
}

export function updateGeminiChatWidthSettings(settings: PluginSettings): void {
  for (const run of runs) run.update(settings);
}
