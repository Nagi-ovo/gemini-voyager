import { describe, expect, it } from 'vitest';

import { canUseVisualEffects } from './visualEffectsAvailability';

describe('canUseVisualEffects', () => {
  const base = {
    isPluginSite: true,
    activeSiteDomain: 'claude.ai',
    customWebsites: [] as string[],
    sitePluginIds: ['voyager.claude-usage'],
    pluginState: {},
  };

  it('keeps visual effects available on native sites', () => {
    expect(canUseVisualEffects({ ...base, isPluginSite: false, activeSiteDomain: '' })).toBe(true);
  });

  it('enables them when Prompt Manager already activated the site', () => {
    expect(
      canUseVisualEffects({
        ...base,
        activeSiteDomain: 'chat.example.com',
        customWebsites: ['example.com'],
      }),
    ).toBe(true);
  });

  it('enables them when a matching plugin is active', () => {
    expect(
      canUseVisualEffects({
        ...base,
        pluginState: {
          'voyager.claude-usage': { enabled: true, installedAt: 1 },
        },
      }),
    ).toBe(true);
  });

  it('does not expose them before the third-party site is enabled', () => {
    expect(canUseVisualEffects(base)).toBe(false);
  });
});
