import { logger } from '@/core/services/LoggerService';
import { CHATGPT_LOCAL_BRIDGE_PLUGIN_ID } from '@/features/plugins/builtin/chatgptLocalBridge/manifest';
import { pluginsToOriginPatterns } from '@/features/plugins/runtime/siteRegistration';
import type { PluginManifest } from '@/features/plugins/types';

/**
 * Chrome, Edge and Firefox 128+ register MAIN-world scripts. Firefox 115–127
 * refuses the registration (logged); the bridge's ops then say the browser is
 * too old. Safari has no bridge.
 */
export function isBridgeAccountObserverSupported(
  target: string | undefined = import.meta.env.VOYAGER_BUILD_TARGET,
): boolean {
  return target !== 'safari';
}

export const BRIDGE_ACCOUNT_MAIN_SCRIPT_ID = 'gv-plugin-chatgpt-bridge-account-main';
/** The account plan observer, and what ChatGPT's answers say about lists the ops read. */
const OBSERVER_FILES = ['chatgpt-account-observer.js', 'chatgpt-bridge-data-observer.js'];

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
   * Builds that may register MAIN-world scripts: Chrome, Edge and Firefox (128+;
   * an older one refuses the registration). Safari has no Local Bridge.
   */
  readonly supportsMainWorld: boolean;
  readonly queryTabs?: (urls: string[]) => Promise<readonly { id?: number }[]>;
}

/**
 * Register the page-world account plan and page data observers at
 * document_start while the Local Bridge is on, on the bridge's granted ChatGPT origins only, and run it
 * once in ChatGPT tabs already open. The caller has already unregistered
 * `BRIDGE_ACCOUNT_MAIN_SCRIPT_ID`. The observers stay silent until the
 * bridge's content script arms them.
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
        js: OBSERVER_FILES,
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
      // Each observer's own install guard makes a repeat run a no-op. A page already
      // loaded made its plan and sidebar requests before they ran: those show from its next load.
      await scripting.executeScript({
        target: { tabId: tab.id },
        files: OBSERVER_FILES,
        world: 'MAIN',
      });
    } catch {
      // A discarded or restricted tab picks the observer up on its next load.
    }
  }
}
