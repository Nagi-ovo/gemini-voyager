import { act } from 'react';

import { type Mock, describe, expect, it } from 'vitest';

import enMessages from '@locales/en/messages.json';

import { container, mockMessages, renderCatalog } from './pluginManagerHarness';

describe('PluginCatalogControls online catalog controls', () => {
  const CATALOG_HOST = 'claude.ai';
  const CACHE_KEY = `gvPluginHostCatalog:${CATALOG_HOST}`;

  function cachedCatalog(overrides: Record<string, unknown> = {}): Record<string, unknown> {
    return {
      host: CATALOG_HOST,
      status: 'ok',
      manifests: [],
      fetchedAt: 0,
      lastAttemptAt: 0,
      failureCount: 0,
      extensionVersion: '1.0.0',
      ...overrides,
    };
  }

  function onlineUpdatesToggle(): HTMLInputElement {
    const input = container.querySelector<HTMLInputElement>(
      'input[aria-label="pluginsOnlineUpdates"]',
    );
    if (!input) throw new Error('Expected the online-updates switch');
    return input;
  }

  function chooseInterval(value: string): void {
    const select = container.querySelector('select');
    if (!select) throw new Error('Expected the check-interval select');
    // Bypass React's value tracker so the synthetic onChange fires.
    const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')?.set;
    setter?.call(select, value);
    select.dispatchEvent(new Event('change', { bubbles: true }));
  }

  it('reflects the stored settings and hides the interval while updates are off', async () => {
    (chrome.storage.sync.get as unknown as Mock).mockResolvedValue({
      gvPluginOnlineUpdatesEnabled: false,
      gvPluginCatalogCheckInterval: '24h',
    });

    await renderCatalog({ catalogHost: CATALOG_HOST });

    expect(onlineUpdatesToggle().checked).toBe(false);
    expect(container.querySelector('select')).toBeNull();
  });

  it('persists the online-updates switch', async () => {
    await renderCatalog({ catalogHost: CATALOG_HOST });
    const toggle = onlineUpdatesToggle();
    expect(toggle.checked).toBe(true);

    await act(async () => {
      toggle.click();
      await Promise.resolve();
    });

    expect(chrome.storage.sync.set).toHaveBeenCalledWith({ gvPluginOnlineUpdatesEnabled: false });
    expect(onlineUpdatesToggle().checked).toBe(false);
    expect(container.querySelector('select')).toBeNull();
  });

  it('persists the chosen check interval', async () => {
    (chrome.storage.sync.get as unknown as Mock).mockResolvedValue({
      gvPluginOnlineUpdatesEnabled: true,
      gvPluginCatalogCheckInterval: '6h',
    });
    await renderCatalog({ catalogHost: CATALOG_HOST });

    await act(async () => {
      chooseInterval('1h');
      await Promise.resolve();
    });

    expect(chrome.storage.sync.set).toHaveBeenCalledWith({ gvPluginCatalogCheckInterval: '1h' });
    expect(container.querySelector<HTMLSelectElement>('select')?.value).toBe('1h');
  });

  it('omits the whole block on a host that can never have a catalog', async () => {
    await renderCatalog({});

    expect(container.querySelector('input[aria-label="pluginsOnlineUpdates"]')).toBeNull();
    expect(container.querySelector('select')).toBeNull();
    expect(container.textContent).not.toContain('pluginsOnlineUpdatesHint');
    expect(container.textContent).not.toContain('pluginsNeverChecked');
  });

  it('reports that no check has run yet when nothing is cached', async () => {
    await renderCatalog({ catalogHost: CATALOG_HOST });

    expect(container.textContent).toContain('pluginsNeverChecked');
  });

  it('reports the localized time of the last attempt', async () => {
    const lastAttemptAt = Date.UTC(2026, 1, 3, 4, 5, 6);
    (chrome.storage.local.get as unknown as Mock).mockResolvedValue({
      [CACHE_KEY]: cachedCatalog({ lastAttemptAt, fetchedAt: lastAttemptAt }),
    });
    mockMessages.current = { pluginsLastChecked: enMessages.pluginsLastChecked.message };

    await renderCatalog({ catalogHost: CATALOG_HOST });

    expect(container.textContent).toContain(new Date(lastAttemptAt).toLocaleString());
    expect(container.textContent).not.toContain('{time}');
    expect(container.textContent).not.toContain('pluginsNeverChecked');
  });

  it('says the site has no online catalog instead of dating a 404', async () => {
    const lastAttemptAt = Date.UTC(2026, 1, 3, 4, 5, 6);
    (chrome.storage.local.get as unknown as Mock).mockResolvedValue({
      [CACHE_KEY]: cachedCatalog({ status: 'missing', lastAttemptAt, fetchedAt: lastAttemptAt }),
    });
    mockMessages.current = { pluginsLastChecked: enMessages.pluginsLastChecked.message };

    await renderCatalog({ catalogHost: CATALOG_HOST });

    expect(container.textContent).toContain('pluginsNoOnlineCatalog');
    expect(container.textContent).not.toContain(new Date(lastAttemptAt).toLocaleString());
  });

  it('re-reads the cache once a manual check finishes', async () => {
    await renderCatalog({ catalogHost: CATALOG_HOST, refreshing: true });
    expect(container.textContent).toContain('pluginsNeverChecked');

    const lastAttemptAt = Date.UTC(2026, 1, 3, 4, 5, 6);
    (chrome.storage.local.get as unknown as Mock).mockResolvedValue({
      [CACHE_KEY]: cachedCatalog({ lastAttemptAt, fetchedAt: lastAttemptAt }),
    });
    mockMessages.current = { pluginsLastChecked: enMessages.pluginsLastChecked.message };

    await renderCatalog({ catalogHost: CATALOG_HOST, refreshing: false });

    expect(container.textContent).toContain(new Date(lastAttemptAt).toLocaleString());
  });
});
