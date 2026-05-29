import { type Mock, beforeEach, describe, expect, it } from 'vitest';

import { loadCollapsedPlugins, setPluginCollapsed } from './pluginState';

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
