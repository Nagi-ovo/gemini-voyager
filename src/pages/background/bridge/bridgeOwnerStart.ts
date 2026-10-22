/**
 * Start-up of the Local Bridge owner (`bridgeOwner.ts`) in the background: the
 * Chrome APIs it runs on, and the listeners registered synchronously at worker start.
 */
import { getVoyagerBuildTarget, isEdge } from '@/core/utils/browser';
import type { BridgeBrowser } from '@/features/bridge/protocol';
import type { HostCatalogRefreshResult } from '@/features/plugins/remote/hostCatalogRefresh';
import {
  loadPluginCatalogSettings,
  savePluginCatalogSettings,
} from '@/features/plugins/remote/hostCatalogSettings';

import { type BridgeOwner, createBridgeOwner } from './bridgeOwner';
import { BRIDGE_POLICY_HOST } from './bridgePolicy';
import { createBridgeRuntimeMessageHandler } from './bridgeRuntimeMessages';
import { type StorageAreaLike, createMemoryArea } from './bridgeTaskStore';

function chromeArea(area: chrome.storage.StorageArea | undefined): StorageAreaLike | null {
  if (!area?.get) return null;
  return {
    get: async (keys) => ((await area.get(keys)) ?? {}) as Record<string, unknown>,
    set: (items) => area.set(items),
    remove: (keys) => area.remove(keys),
  };
}

function detectBrowser(): BridgeBrowser {
  if (getVoyagerBuildTarget() === 'firefox') return 'firefox';
  return isEdge() ? 'edge' : 'chrome';
}

/**
 * Register the bridge's listeners synchronously and return its runtime-message
 * handler. Safari has no bridge in v1: the handler then only tells the popup so.
 */
export function startBridgeOwner(options: {
  readonly refreshCatalog: (host: string) => Promise<unknown>;
  readonly refreshCatalogNow: (host: string) => Promise<HostCatalogRefreshResult>;
}): BridgeOwner['handleMessage'] {
  if (getVoyagerBuildTarget() === 'safari') return createBridgeRuntimeMessageHandler(null);
  const local = chromeArea(chrome.storage?.local);
  if (!local) return createBridgeRuntimeMessageHandler(null);
  const owner = createBridgeOwner({
    session: chromeArea(chrome.storage?.session) ?? createMemoryArea(),
    local,
    tabs: {
      create: async (props) => {
        const tab = await chrome.tabs.create(props);
        // A Pro reply can take hours in a background tab; Memory Saver would discard it mid-wait.
        if (tab.id !== undefined) {
          await chrome.tabs.update(tab.id, { autoDiscardable: false }).catch(() => undefined);
        }
        return tab;
      },
      remove: (tabId) => chrome.tabs.remove(tabId),
      get: (tabId) => chrome.tabs.get(tabId),
      sendMessage: (tabId, message, sendOptions) =>
        sendOptions
          ? chrome.tabs.sendMessage(tabId, message, sendOptions)
          : chrome.tabs.sendMessage(tabId, message),
    },
    fetch: (...args) => fetch(...args),
    hasOrigin: async (pattern) =>
      (await chrome.permissions?.contains({ origins: [pattern] })) === true,
    refreshCatalog: () => options.refreshCatalog(BRIDGE_POLICY_HOST),
    refreshCatalogNow: options.refreshCatalogNow,
    loadOnlineUpdatesEnabled: async () => (await loadPluginCatalogSettings()).onlineUpdatesEnabled,
    saveOnlineUpdatesEnabled: (enabled) =>
      savePluginCatalogSettings({ onlineUpdatesEnabled: enabled }),
    alarms: chrome.alarms
      ? {
          get: (name) => chrome.alarms.get(name),
          create: (name, info) => chrome.alarms.create(name, info),
          clear: (name) => chrome.alarms.clear(name),
        }
      : undefined,
    browser: detectBrowser(),
  });
  chrome.alarms?.onAlarm?.addListener((alarm) => owner.onAlarm(alarm.name));
  chrome.tabs?.onRemoved?.addListener((tabId) => owner.onTabRemoved(tabId));
  chrome.storage?.onChanged?.addListener((changes, area) => owner.onStorageChanged(changes, area));
  chrome.permissions?.onAdded?.addListener((permissions) =>
    owner.onPermissionsAdded(permissions.origins),
  );
  chrome.permissions?.onRemoved?.addListener(() => owner.onPermissionsRemoved());
  chrome.runtime?.onStartup?.addListener(() => void owner.wake());
  chrome.runtime?.onInstalled?.addListener(() => void owner.wake());
  void owner.wake();
  return owner.handleMessage;
}
