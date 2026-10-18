import { describe, expect, it, vi } from 'vitest';

import { BUILTIN_PLUGINS } from '@/features/plugins/builtin';
import { CHATGPT_PRO_USAGE_PLUGIN_ID } from '@/features/plugins/builtin/chatgptProUsage/manifest';

import { syncChatGptProUsageObserver } from '../chatgptProUsageRegistration';

const proUsage = BUILTIN_PLUGINS.find((plugin) => plugin.id === CHATGPT_PRO_USAGE_PLUGIN_ID)!;
const otherPlugin = BUILTIN_PLUGINS.find((plugin) => plugin.id === 'voyager.chatgpt-export')!;

function scripting() {
  return {
    registerContentScripts: vi.fn(async () => {}),
    executeScript: vi.fn(async () => []),
  };
}

describe('syncChatGptProUsageObserver', () => {
  it('registers the page observer at document_start only for granted ChatGPT origins', async () => {
    const registry = scripting();
    await syncChatGptProUsageObserver({
      scripting: registry as never,
      enabledPlugins: [proUsage],
      grantedOrigins: ['https://chatgpt.com/*', 'https://claude.ai/*'],
      supportsMainWorld: true,
    });

    const [[scripts]] = registry.registerContentScripts.mock.calls as unknown as [
      [chrome.scripting.RegisteredContentScript[]],
    ];
    expect(scripts).toHaveLength(1);
    expect(scripts[0]).toMatchObject({
      matches: ['https://chatgpt.com/*'],
      world: 'MAIN',
      runAt: 'document_start',
    });
  });

  it('registers nothing while the plugin is off, ungranted, or the browser lacks MAIN world', async () => {
    const registry = scripting();
    const base = {
      scripting: registry as never,
      grantedOrigins: ['https://chatgpt.com/*'],
      supportsMainWorld: true,
    };
    await syncChatGptProUsageObserver({ ...base, enabledPlugins: [otherPlugin] });
    await syncChatGptProUsageObserver({ ...base, enabledPlugins: [proUsage], grantedOrigins: [] });
    await syncChatGptProUsageObserver({
      ...base,
      enabledPlugins: [proUsage],
      supportsMainWorld: false,
    });

    expect(registry.registerContentScripts).not.toHaveBeenCalled();
  });

  it('runs the observer in ChatGPT tabs that are already open', async () => {
    const registry = scripting();
    const queryTabs = vi.fn(async () => [{ id: 7 }, {}]);
    await syncChatGptProUsageObserver({
      scripting: registry as never,
      enabledPlugins: [proUsage],
      grantedOrigins: ['https://chatgpt.com/*'],
      supportsMainWorld: true,
      queryTabs,
    });

    expect(queryTabs).toHaveBeenCalledWith(['https://chatgpt.com/*']);
    expect(registry.executeScript).toHaveBeenCalledTimes(1);
    expect(registry.executeScript).toHaveBeenCalledWith(
      expect.objectContaining({ target: { tabId: 7 }, world: 'MAIN' }),
    );
  });
});
