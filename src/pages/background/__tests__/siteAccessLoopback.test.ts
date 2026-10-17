import { beforeEach, describe, expect, it, vi } from 'vitest';

const syncStore: Record<string, unknown> = {};

vi.mock('webextension-polyfill', () => ({
  default: {
    storage: {
      sync: {
        get: vi.fn(async (defaults: Record<string, unknown>) => ({ ...defaults, ...syncStore })),
        set: vi.fn(async (items: Record<string, unknown>) => Object.assign(syncStore, items)),
      },
    },
    permissions: { contains: vi.fn(async () => false) },
    scripting: {
      getRegisteredContentScripts: vi.fn(async () => []),
      registerContentScripts: vi.fn(async () => {}),
      unregisterContentScripts: vi.fn(async () => {}),
    },
  },
}));

vi.mock('@/features/plugins/sources/defaultSources', () => ({
  listPluginManifests: vi.fn(async () => []),
}));

vi.mock('../enabledPlugins', () => ({ loadEnabledPlugins: vi.fn(async () => []) }));

describe('permission grants and the Prompt Manager custom websites', () => {
  beforeEach(() => {
    for (const key of Object.keys(syncStore)) delete syncStore[key];
    chrome.runtime.getManifest = vi.fn((): chrome.runtime.Manifest => ({
      manifest_version: 3,
      name: 'Voyager',
      version: '0.0.0',
      host_permissions: ['https://gemini.google.com/*'],
    }));
  });

  it('does not add the Local Bridge loopback grant as a custom website', async () => {
    const { createSiteAccessRegistration } = await import('../siteAccessRegistration');
    const registration = createSiteAccessRegistration();

    await registration.permissionAdded(['http://127.0.0.1/*', 'https://example.com/*']);

    expect(syncStore.gvPromptCustomWebsites).toEqual(['example.com']);
  });
});
