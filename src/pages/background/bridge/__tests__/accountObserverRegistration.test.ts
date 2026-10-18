import { describe, expect, it, vi } from 'vitest';

import { BUILTIN_PLUGINS } from '@/features/plugins/builtin';
import { CHATGPT_LOCAL_BRIDGE_PLUGIN_ID } from '@/features/plugins/builtin/chatgptLocalBridge/manifest';
import { CHATGPT_PRO_USAGE_PLUGIN_ID } from '@/features/plugins/builtin/chatgptProUsage/manifest';

import {
  isBridgeAccountObserverSupported,
  syncBridgeAccountObserver,
} from '../accountObserverRegistration';

const bridge = BUILTIN_PLUGINS.find((plugin) => plugin.id === CHATGPT_LOCAL_BRIDGE_PLUGIN_ID)!;
const proUsage = BUILTIN_PLUGINS.find((plugin) => plugin.id === CHATGPT_PRO_USAGE_PLUGIN_ID);

function scripting() {
  return {
    registerContentScripts: vi.fn(async () => {}),
    executeScript: vi.fn(async () => []),
  };
}

describe('syncBridgeAccountObserver', () => {
  it("registers the page observers at document_start on the bridge's granted ChatGPT origins only", async () => {
    const registry = scripting();
    await syncBridgeAccountObserver({
      scripting: registry as never,
      enabledPlugins: [bridge],
      grantedOrigins: ['https://chatgpt.com/*', 'https://claude.ai/*'],
      supportsMainWorld: true,
    });

    const [[scripts]] = registry.registerContentScripts.mock.calls as unknown as [
      [chrome.scripting.RegisteredContentScript[]],
    ];
    expect(scripts).toEqual([
      expect.objectContaining({
        js: ['chatgpt-account-observer.js', 'chatgpt-bridge-data-observer.js'],
        matches: ['https://chatgpt.com/*'],
        world: 'MAIN',
        runAt: 'document_start',
      }),
    ]);
  });

  it('registers nothing while the bridge is off (even with Pro usage on), ungranted, or without MAIN world', async () => {
    const registry = scripting();
    const base = {
      scripting: registry as never,
      grantedOrigins: ['https://chatgpt.com/*'],
      supportsMainWorld: true,
    };
    await syncBridgeAccountObserver({ ...base, enabledPlugins: proUsage ? [proUsage] : [] });
    await syncBridgeAccountObserver({ ...base, enabledPlugins: [bridge], grantedOrigins: [] });
    await syncBridgeAccountObserver({
      ...base,
      enabledPlugins: [bridge],
      supportsMainWorld: false,
    });

    expect(registry.registerContentScripts).not.toHaveBeenCalled();
  });

  it('runs wherever the bridge runs: Chrome, Edge and Firefox, never Safari', () => {
    expect(isBridgeAccountObserverSupported('chrome')).toBe(true);
    expect(isBridgeAccountObserverSupported('edge')).toBe(true);
    expect(isBridgeAccountObserverSupported('firefox')).toBe(true);
    expect(isBridgeAccountObserverSupported('safari')).toBe(false);
  });
});
