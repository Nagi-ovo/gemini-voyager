import { type Mock, beforeEach, describe, expect, it } from 'vitest';

import enMessages from '@locales/en/messages.json';

import type { PluginManifest } from '@/features/plugins/types';

import {
  container,
  mockMessages,
  widthPlugin,
  PLUGIN_ID,
  renderManager,
} from './pluginManagerHarness';

describe('PluginManager updated badge', () => {
  const SEEN_KEY = 'gvPluginSeenVersions';

  function seenVersions(versions: Record<string, string>): void {
    (chrome.storage.local.get as unknown as Mock).mockResolvedValue({ [SEEN_KEY]: versions });
  }

  function updatesDot(): Element | null {
    return container.querySelector('[data-testid="plugin-updates-dot"]');
  }

  beforeEach(() => {
    mockMessages.current = { pluginUpdatedBadge: enMessages.pluginUpdatedBadge.message };
  });

  it('marks a plugin whose version changed since it was last shown', async () => {
    seenVersions({ [PLUGIN_ID]: '0.9.0' });
    await renderManager();

    expect(container.textContent).toContain('Updated');
    expect(updatesDot()).not.toBeNull();
  });

  it('does not mark a plugin the popup is seeing for the first time', async () => {
    await renderManager();

    expect(container.textContent).not.toContain('Updated');
    expect(updatesDot()).toBeNull();
  });

  it('does not mark a plugin still at the version last shown', async () => {
    seenVersions({ [PLUGIN_ID]: widthPlugin.version });
    await renderManager();

    expect(container.textContent).not.toContain('Updated');
    expect(updatesDot()).toBeNull();
    expect(chrome.storage.local.set).not.toHaveBeenCalled();
  });

  it('records the listed plugin versions as seen', async () => {
    seenVersions({ [PLUGIN_ID]: '0.9.0' });
    const second: PluginManifest = { ...widthPlugin, id: 'voyager.second', version: '3.2.1' };
    await renderManager({ manifests: [widthPlugin, second] });

    expect(chrome.storage.local.set).toHaveBeenCalledWith({
      [SEEN_KEY]: { [PLUGIN_ID]: widthPlugin.version, [second.id]: '3.2.1' },
    });
  });

  it('keeps the chip on screen for the rest of the session after marking it seen', async () => {
    seenVersions({ [PLUGIN_ID]: '0.9.0' });
    await renderManager();
    expect(container.textContent).toContain('Updated');

    // A re-render with the same manifests (e.g. a refresh finishing) must not
    // clear the chip just because the version has now been recorded.
    await renderManager({ refreshing: false });

    expect(container.textContent).toContain('Updated');
  });
});
