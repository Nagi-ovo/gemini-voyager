import React, { act } from 'react';
import { type Root, createRoot } from 'react-dom/client';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { PluginManifest } from '@/features/plugins/types';

import { PluginManager } from '../PluginManager';

vi.mock('@/contexts/LanguageContext', () => ({
  useLanguage: () => ({ language: 'en', setLanguage: vi.fn(), t: (key: string) => key }),
}));

vi.mock('@/core/utils/browser', () => ({
  isFirefox: () => false,
  isSafari: () => false,
}));

vi.mock('@/features/plugins/runtime/siteRegistration', () => ({
  pluginsToOriginPatterns: () => [],
}));

// The slider-debounce behaviour under test lives in PluginManager; the storage
// layer is mocked so we can assert exactly how often (and with what value) the
// persistence call fires. `vi.hoisted` lets the (hoisted) vi.mock factory below
// reference these without a TDZ error.
const { setPluginSetting, PLUGIN_ID } = vi.hoisted(() => ({
  setPluginSetting: vi.fn().mockResolvedValue(undefined),
  PLUGIN_ID: 'voyager.test-width',
}));
vi.mock('@/features/plugins/storage/pluginState', () => ({
  setPluginSetting,
  setPluginEnabled: vi.fn().mockResolvedValue(undefined),
  setPluginCollapsed: vi.fn().mockResolvedValue(undefined),
  loadCollapsedPlugins: vi.fn().mockResolvedValue([]),
  loadPluginState: vi.fn().mockResolvedValue({ [PLUGIN_ID]: { enabled: true, installedAt: 0 } }),
  subscribePluginState: vi.fn().mockReturnValue(() => {}),
}));

const widthPlugin: PluginManifest = {
  id: PLUGIN_ID,
  name: 'Test · Width',
  version: '1.0.0',
  description: 'Adjustable width',
  author: 'Test',
  category: 'readability',
  license: 'MIT',
  engine: '>=1.0.0',
  tier: 'declarative',
  matches: ['https://claude.ai/*'],
  contributes: {
    settings: { width: { type: 'number', label: 'Reading width (px)', default: 768, min: 600, max: 1600 } },
  },
};

let container: HTMLElement;
let root: Root;

function nativeSetSliderValue(input: HTMLInputElement, value: number): void {
  // Bypass React's value tracker so the synthetic onChange fires.
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
  setter?.call(input, String(value));
  input.dispatchEvent(new Event('input', { bubbles: true }));
}

async function render(): Promise<void> {
  await act(async () => {
    root.render(React.createElement(PluginManager, { manifests: [widthPlugin] }));
  });
  // Let the async state hydration (loadPluginState) resolve so the plugin shows
  // as enabled and its settings slider is rendered.
  await act(async () => {
    await Promise.resolve();
  });
}

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  vi.useFakeTimers();
  setPluginSetting.mockClear();
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  // Some tests unmount mid-body to exercise the flush-on-close path; unmounting
  // again here is a no-op but guard it so React doesn't warn.
  try {
    act(() => root.unmount());
  } catch {
    /* already unmounted */
  }
  container.remove();
  vi.useRealTimers();
});

describe('PluginManager setting slider', () => {
  it('debounces rapid drag changes into a single storage write with the final value', async () => {
    await render();
    const slider = container.querySelector('input[type="range"]') as HTMLInputElement;
    expect(slider).toBeTruthy();

    act(() => {
      for (const v of [800, 900, 1000, 1100, 1300]) nativeSetSliderValue(slider, v);
    });

    // Mid-drag: nothing persisted yet.
    expect(setPluginSetting).not.toHaveBeenCalled();

    // After the debounce window: exactly one write, carrying the last value.
    act(() => vi.advanceTimersByTime(200));
    expect(setPluginSetting).toHaveBeenCalledTimes(1);
    expect(setPluginSetting).toHaveBeenCalledWith(PLUGIN_ID, 'width', 1300);
  });

  it('flushes a pending write when the popup unmounts mid-drag', async () => {
    await render();
    const slider = container.querySelector('input[type="range"]') as HTMLInputElement;

    act(() => nativeSetSliderValue(slider, 1024));
    expect(setPluginSetting).not.toHaveBeenCalled();

    act(() => root.unmount());

    expect(setPluginSetting).toHaveBeenCalledTimes(1);
    expect(setPluginSetting).toHaveBeenCalledWith(PLUGIN_ID, 'width', 1024);
  });
});
