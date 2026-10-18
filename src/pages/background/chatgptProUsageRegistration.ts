import { logger } from '@/core/services/LoggerService';
import { CHATGPT_PRO_USAGE_PLUGIN_ID } from '@/features/plugins/builtin/chatgptProUsage/manifest';
import { pluginsToOriginPatterns } from '@/features/plugins/runtime/siteRegistration';
import type { PluginManifest } from '@/features/plugins/types';

export const CHATGPT_PRO_USAGE_MAIN_SCRIPT_ID = 'gv-plugin-chatgpt-pro-usage-main';
const OBSERVER_FILE = 'chatgpt-pro-usage-observer.js';

export interface ProUsageObserverRegistry {
  readonly registerContentScripts: typeof chrome.scripting.registerContentScripts;
  readonly executeScript?: typeof chrome.scripting.executeScript;
}

export interface ProUsageObserverOptions {
  readonly scripting: ProUsageObserverRegistry;
  readonly enabledPlugins: readonly PluginManifest[];
  /** Plugin origins the user has granted. */
  readonly grantedOrigins: readonly string[];
  /** Firefox's minimum version predates MAIN-world registered scripts. */
  readonly supportsMainWorld: boolean;
  readonly queryTabs?: (urls: string[]) => Promise<readonly { id?: number }[]>;
}

/**
 * Register the page-world Pro usage observer at document_start while its
 * plugin is on, and run it once in ChatGPT tabs that are already open. The
 * caller has already unregistered `CHATGPT_PRO_USAGE_MAIN_SCRIPT_ID`. A
 * page loaded while the plugin was on keeps the observer until it reloads;
 * the observer stays inert until the content script arms it.
 */
export async function syncChatGptProUsageObserver(options: ProUsageObserverOptions): Promise<void> {
  if (!options.supportsMainWorld) return;
  const plugin = options.enabledPlugins.find((entry) => entry.id === CHATGPT_PRO_USAGE_PLUGIN_ID);
  if (!plugin) return;
  const matches = pluginsToOriginPatterns([plugin]).filter((origin) =>
    options.grantedOrigins.includes(origin),
  );
  if (!matches.length) return;
  try {
    await options.scripting.registerContentScripts([
      {
        id: CHATGPT_PRO_USAGE_MAIN_SCRIPT_ID,
        js: [OBSERVER_FILE],
        matches,
        world: 'MAIN',
        runAt: 'document_start',
        persistAcrossSessions: true,
      },
    ]);
  } catch (error) {
    logger.error('[Background] Failed to register ChatGPT Pro usage observer', { error });
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
      // The observer's own install guard makes a repeat run a no-op.
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
