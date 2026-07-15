import { type Mock, beforeEach, describe, expect, it } from 'vitest';

import {
  loadCollapsedPlugins,
  restorePluginState,
  sanitizePluginState,
  setPluginCollapsed,
} from './pluginState';

const KEY = 'gvPluginUiCollapsed';

beforeEach(() => {
  (chrome.storage.local.get as unknown as Mock).mockReset();
  (chrome.storage.local.set as unknown as Mock).mockReset();
  (chrome.storage.local.set as unknown as Mock).mockResolvedValue(undefined);
});

describe('collapsed plugin persistence', () => {
  it('loads the stored collapsed ids', async () => {
    (chrome.storage.local.get as unknown as Mock).mockResolvedValue({ [KEY]: ['a', 'b'] });
    expect(await loadCollapsedPlugins()).toEqual(['a', 'b']);
  });

  it('filters out non-strings and tolerates malformed data', async () => {
    (chrome.storage.local.get as unknown as Mock).mockResolvedValue({ [KEY]: ['a', 1, null, 'b'] });
    expect(await loadCollapsedPlugins()).toEqual(['a', 'b']);
    (chrome.storage.local.get as unknown as Mock).mockResolvedValue({ [KEY]: 'not-an-array' });
    expect(await loadCollapsedPlugins()).toEqual([]);
  });

  it('adds an id when collapsing', async () => {
    (chrome.storage.local.get as unknown as Mock).mockResolvedValue({ [KEY]: ['a'] });
    await setPluginCollapsed('b', true);
    expect(chrome.storage.local.set).toHaveBeenCalledWith({ [KEY]: ['a', 'b'] });
  });

  it('removes an id when expanding', async () => {
    (chrome.storage.local.get as unknown as Mock).mockResolvedValue({ [KEY]: ['a', 'b'] });
    await setPluginCollapsed('a', false);
    expect(chrome.storage.local.set).toHaveBeenCalledWith({ [KEY]: ['b'] });
  });

  it('does not duplicate an already-collapsed id', async () => {
    (chrome.storage.local.get as unknown as Mock).mockResolvedValue({ [KEY]: ['a'] });
    await setPluginCollapsed('a', true);
    expect(chrome.storage.local.set).toHaveBeenCalledWith({ [KEY]: ['a'] });
  });
});

describe('cloud plugin-state restore', () => {
  it('sanitizes malformed entries and plugin setting values', () => {
    expect(
      sanitizePluginState({
        good: {
          enabled: true,
          installedAt: 123,
          settings: { width: 72, compact: true, label: 'wide', invalid: null },
        },
        missingEnabled: { installedAt: 1 },
        badEnabled: { enabled: 'yes', installedAt: 2 },
      }),
    ).toEqual({
      good: {
        enabled: true,
        installedAt: 123,
        settings: { width: 72, compact: true, label: 'wide' },
      },
    });
  });

  it('merges cloud entries over local plugin state by default', async () => {
    (chrome.storage.local.get as unknown as Mock).mockResolvedValue({
      gvPluginsState: {
        local: { enabled: true, installedAt: 1 },
        shared: { enabled: false, installedAt: 2, settings: { width: 60 } },
      },
    });

    await restorePluginState({
      shared: { enabled: true, installedAt: 3, settings: { width: 80 } },
      cloud: { enabled: true, installedAt: 4 },
    });

    expect(chrome.storage.local.set).toHaveBeenCalledWith({
      gvPluginsState: {
        local: { enabled: true, installedAt: 1 },
        shared: { enabled: true, installedAt: 3, settings: { width: 80 } },
        cloud: { enabled: true, installedAt: 4 },
      },
    });
  });

  it('replaces local plugin state in overwrite mode', async () => {
    await restorePluginState(
      { cloud: { enabled: false, installedAt: 5, settings: { compact: true } } },
      'overwrite',
    );

    expect(chrome.storage.local.get).not.toHaveBeenCalled();
    expect(chrome.storage.local.set).toHaveBeenCalledWith({
      gvPluginsState: {
        cloud: { enabled: false, installedAt: 5, settings: { compact: true } },
      },
    });
  });

  it('does not erase local state when a cloud payload is malformed', async () => {
    (chrome.storage.local.get as unknown as Mock).mockResolvedValue({
      gvPluginsState: { local: { enabled: true, installedAt: 1 } },
    });

    await expect(restorePluginState({ broken: { installedAt: 2 } }, 'overwrite')).resolves.toEqual({
      local: { enabled: true, installedAt: 1 },
    });
    expect(chrome.storage.local.set).not.toHaveBeenCalled();
  });
});
