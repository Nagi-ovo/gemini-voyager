import { getVoyagerBuildTarget } from '@/core/utils/browser';
import type { PluginScope } from '@/features/plugins/runtime/pluginScope';
import type { PluginSettings, SiteAdapter } from '@/features/plugins/types';

import { watchAccountPlans } from './account/watch';
import { getBridgeRuntime } from './runtime';

export { CHATGPT_LOCAL_BRIDGE_MANIFEST, CHATGPT_LOCAL_BRIDGE_PLUGIN_ID } from './manifest';

/**
 * The mount only lends the runtime the current adapter; it starts nothing.
 * The runtime outlives the mount, so a remount neither retries nor restarts
 * an op (spec §3.3). Safari has no bridge in v1.
 */
export function activateChatGptLocalBridge(
  scope: PluginScope,
  _settings: PluginSettings = {},
  adapter: SiteAdapter | null = null,
): void {
  if (getVoyagerBuildTarget() === 'safari') return;
  scope.effect(() => {
    const runtime = getBridgeRuntime();
    runtime.attach(adapter);
    return () => runtime.detach();
  }, 'chatgpt-local-bridge');
  // The plan the page is told on load, so each CLI result can say which plan ran it.
  scope.effect(() => watchAccountPlans(), 'chatgpt-local-bridge-account');
}
