import { logger } from '@/core/services/LoggerService';
import { CHATGPT_LOCAL_BRIDGE_PLUGIN_ID } from '@/features/plugins/builtin/chatgptLocalBridge/manifest';
import { pluginsToOriginPatterns } from '@/features/plugins/runtime/siteRegistration';
import type { PluginManifest } from '@/features/plugins/types';

/** Chrome and Edge register MAIN-world scripts; Firefox's minimum predates them, Safari has no bridge. */
export function isBridgeAccountObserverSupported(
  target: string | undefined = import.meta.env.VOYAGER_BUILD_TARGET,
): boolean {
  return target !== 'firefox' && target !== 'safari';
}

export const BRIDGE_ACCOUNT_MAIN_SCRIPT_ID = 'gv-plugin-chatgpt-bridge-account-main';
const OBSERVER_FILE = 'chatgpt-account-observer.js';

export interface AccountObserverRegistry {
  readonly registerContentScripts: typeof chrome.scripting.registerContentScripts;
  readonly executeScript?: typeof chrome.scripting.executeScript;
}

export interface AccountObserverOptions {
  readonly scripting: AccountObserverRegistry;
  readonly enabledPlugins: readonly PluginManifest[];
  /** Plugin origins the user has granted. */
  readonly grantedOrigins: readonly string[];
  /**
   * Builds that register MAIN-world scripts: Chrome and Edge. Firefox's minimum
   * predates them, and Safari has no Local Bridge.
   */
  readonly supportsMainWorld: boolean;
  readonly queryTabs?: (urls: string[]) => Promise<readonly { id?: number }[]>;
}

/**
 * Register the page-world account plan observer at document_start while the
 * Local Bridge is on, on the bridge's granted ChatGPT origins only, and run it
 * once in ChatGPT tabs already open. The caller has already unregistered
 * `BRIDGE_ACCOUNT_MAIN_SCRIPT_ID`. The observer stays silent until the
 * bridge's content script arms it.
 */
export async function syncBridgeAccountObserver(options: AccountObserverOptions): Promise<void> {
  if (!options.supportsMainWorld) return;
  const plugin = options.enabledPlugins.find(
    (entry) => entry.id === CHATGPT_LOCAL_BRIDGE_PLUGIN_ID,
  );
  if (!plugin) return;
  const matches = pluginsToOriginPatterns([plugin]).filter((origin) =>
    options.grantedOrigins.includes(origin),
  );
  if (!matches.length) return;
  try {
    await options.scripting.registerContentScripts([
      {
        id: BRIDGE_ACCOUNT_MAIN_SCRIPT_ID,
        js: [OBSERVER_FILE],
        matches,
        world: 'MAIN',
        runAt: 'document_start',
        persistAcrossSessions: true,
      },
    ]);
  } catch (error) {
    logger.error('[Background] Failed to register the ChatGPT account observer', { error });
    return;
  }
  const { scripting, queryTabs } = options;
  if (!scripting.executeScript || !queryTabs) return;
  let tabs: readonly { id?: number }[] = [];
  try {
    tabs = await queryTabs(matches);
  } catch {
    return;
  }
  for (const tab of tabs) {
    if (typeof tab.id !== 'number') continue;
    try {
      // The observer's own install guard makes a repeat run a no-op. A page already
      // loaded made its plan request before it ran: the plan shows from its next load.
      await scripting.executeScript({
        target: { tabId: tab.id },
        files: [OBSERVER_FILE],
        world: 'MAIN',
      });
    } catch {
      // A discarded or restricted tab picks the observer up on its next load.
    }
  }
}
