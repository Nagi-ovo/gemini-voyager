import './pluginManagerHarness';
import React, { act } from 'react';

import { beforeEach, describe, expect, it } from 'vitest';

import { PluginManager } from '../PluginManager';
import {
  container,
  root,
  widthPlugin,
  PLUGIN_ID,
  pluginState,
  permissionOrigins,
  permissionContains,
  permissionRequest,
  runtimeSendMessage,
  setPluginEnabled,
  supportsDynamicRegistration,
} from './pluginManagerHarness';

describe('PluginManager host permission flow', () => {
  beforeEach(() => {
    pluginState.current = { [PLUGIN_ID]: { enabled: false, installedAt: 0 } };
    permissionOrigins.mockReturnValue(['https://chatgpt.com/*']);
  });

  it('reuses an existing site grant without requesting permission again', async () => {
    permissionContains.mockResolvedValue(true);
    await act(async () => {
      root.render(
        React.createElement(PluginManager, {
          manifests: [widthPlugin],
          activeUrl: 'https://chatgpt.com/c/current',
        }),
      );
      await Promise.resolve();
    });

    const toggle = container.querySelector<HTMLInputElement>('input[aria-label="Test · Width"]');
    if (!toggle) throw new Error('Expected plugin toggle');
    await act(async () => {
      toggle.click();
      await Promise.resolve();
    });

    expect(permissionContains).toHaveBeenCalledWith({ origins: ['https://chatgpt.com/*'] });
    expect(permissionRequest).not.toHaveBeenCalled();
    expect(setPluginEnabled).toHaveBeenCalledWith(PLUGIN_ID, true);
  });

  it('persists enable intent and explicitly reconciles after the host grant resolves', async () => {
    let resolvePermission: (granted: boolean) => void = () => {};
    permissionRequest.mockReturnValue(
      new Promise<boolean>((resolve) => {
        resolvePermission = resolve;
      }),
    );
    await act(async () => {
      root.render(
        React.createElement(PluginManager, {
          manifests: [widthPlugin],
          activeUrl: 'https://chatgpt.com/c/current',
        }),
      );
      await Promise.resolve();
    });

    const toggle = container.querySelector<HTMLInputElement>('input[aria-label="Test · Width"]');
    if (!toggle) throw new Error('Expected plugin toggle');
    await act(async () => {
      toggle.click();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(setPluginEnabled).toHaveBeenCalledWith(PLUGIN_ID, true);
    expect(permissionRequest).toHaveBeenCalledWith({ origins: ['https://chatgpt.com/*'] });
    expect(setPluginEnabled.mock.invocationCallOrder[0]).toBeLessThan(
      permissionRequest.mock.invocationCallOrder[0],
    );

    await act(async () => {
      resolvePermission(true);
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(runtimeSendMessage).toHaveBeenCalledWith({ type: 'gv.plugins.syncContentScripts' });
    expect(permissionRequest.mock.invocationCallOrder[0]).toBeLessThan(
      runtimeSendMessage.mock.invocationCallOrder[0],
    );
  });

  it('refuses the host grant when dynamic registration is unavailable', async () => {
    supportsDynamicRegistration.mockReturnValue(false);
    await act(async () => {
      root.render(
        React.createElement(PluginManager, {
          manifests: [widthPlugin],
          activeUrl: 'https://chatgpt.com/c/current',
        }),
      );
      await Promise.resolve();
    });

    const toggle = container.querySelector<HTMLInputElement>('input[aria-label="Test · Width"]');
    if (!toggle) throw new Error('Expected plugin toggle');
    await act(async () => {
      toggle.click();
      await Promise.resolve();
    });

    expect(permissionRequest).not.toHaveBeenCalled();
    expect(setPluginEnabled).not.toHaveBeenCalledWith(PLUGIN_ID, true);
  });

  it('repairs a missing companion-origin grant for an already-enabled plugin', async () => {
    pluginState.current = { [PLUGIN_ID]: { enabled: true, installedAt: 0 } };
    permissionOrigins.mockReturnValue([
      'https://claude.ai/*',
      'https://*.frame.claudeusercontent.com/*',
    ]);
    permissionContains.mockResolvedValue(false);

    await act(async () => {
      root.render(
        React.createElement(PluginManager, {
          manifests: [widthPlugin],
          activeUrl: 'https://claude.ai/code/artifact/example',
        }),
      );
      await Promise.resolve();
      await Promise.resolve();
    });

    const repairButton = Array.from(container.querySelectorAll('button')).find(
      (button) => button.textContent === 'pluginGrantRequiredAccess',
    );
    if (!repairButton) throw new Error('Expected permission repair button');
    expect(container.querySelector('input[type="range"]')).not.toBeNull();

    await act(async () => {
      repairButton.click();
      await Promise.resolve();
    });

    expect(permissionRequest).toHaveBeenCalledWith({
      origins: ['https://claude.ai/*', 'https://*.frame.claudeusercontent.com/*'],
    });
    expect(runtimeSendMessage).toHaveBeenCalledWith({ type: 'gv.plugins.syncContentScripts' });
    expect(container.textContent).not.toContain('pluginGrantRequiredAccess');
    expect(container.querySelector('input[type="range"]')).not.toBeNull();
  });

  it('keeps the permission repair available when content-script sync fails', async () => {
    pluginState.current = { [PLUGIN_ID]: { enabled: true, installedAt: 0 } };
    permissionOrigins.mockReturnValue([
      'https://claude.ai/*',
      'https://*.frame.claudeusercontent.com/*',
    ]);
    permissionContains.mockResolvedValue(false);
    runtimeSendMessage.mockRejectedValue(new Error('background unavailable'));

    await act(async () => {
      root.render(
        React.createElement(PluginManager, {
          manifests: [widthPlugin],
          activeUrl: 'https://claude.ai/code/artifact/example',
        }),
      );
      await Promise.resolve();
      await Promise.resolve();
    });

    const repairButton = Array.from(container.querySelectorAll('button')).find(
      (button) => button.textContent === 'pluginGrantRequiredAccess',
    );
    if (!repairButton) throw new Error('Expected permission repair button');

    await act(async () => {
      repairButton.click();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(runtimeSendMessage).toHaveBeenCalledWith({ type: 'gv.plugins.syncContentScripts' });
    expect(container.textContent).toContain('pluginGrantRequiredAccess');
  });
});
