import { describe, expect, it } from 'vitest';

import { canUseVisualEffects } from './visualEffectsAvailability';

describe('canUseVisualEffects', () => {
  const base = {
    isPluginSite: true,
    activeSiteDomain: 'claude.ai',
    customWebsites: [] as string[],
    sitePluginRuns: false,
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

  it('enables them when a plugin that is on holds the site’s access', () => {
    expect(canUseVisualEffects({ ...base, sitePluginRuns: true })).toBe(true);
  });

  it('does not expose them before Voyager runs on the third-party site', () => {
    expect(canUseVisualEffects(base)).toBe(false);
  });
});
