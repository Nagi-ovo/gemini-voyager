import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { StorageKeys } from '@/core/types/common';
import {
  type LifecycleHarness,
  installLifecycleHarness,
} from '@/pages/content/__tests__/lifecycleHarness';
import {
  type VisualEffectsRuntime,
  createVisualEffectsRuntime,
} from '@/pages/content/visualEffects';
import { admitVisualEffectsForPage } from '@/pages/content/visualEffectsStartup';

import { OFFICIAL_PLUGIN_IDS } from '../sites/featureOwners';
import { resolvePluginPlatformId } from '../sites/registry';
import { BuiltinPluginSource } from '../sources/BuiltinPluginSource';
import { PluginHost } from './PluginHost';
import { registerNativeHandler, resetNativeHandlersForTests } from './nativeHandlers';
import { createOfficialAdmission } from './officialAdmission';

vi.mock('@/core/utils/browser', () => ({
  isFirefox: () => false,
  isSafari: () => false,
}));

const ID = OFFICIAL_PLUGIN_IDS.visualEffects;
const KEY = 'gvVisualEffect';
const LEGACY_KEY = 'gvSnowEffect';
const SELECTOR =
  '#gv-snow-effect-canvas, #gv-sakura-effect-canvas, #gv-rain-effect-canvas, #gv-sakura-effect-frame';
const nodes = () => [...document.querySelectorAll(SELECTOR)];
const canvas = (effect: string) => document.getElementById(`gv-${effect}-effect-canvas`);
let harness: LifecycleHarness;
let runtime: VisualEffectsRuntime;
let host: PluginHost | null;
let frames: Map<number, FrameRequestCallback>;
const originalHeight = window.innerHeight;

async function flush(): Promise<void> {
  for (let index = 0; index < 160; index++) await Promise.resolve();
}

function runFrames(limit: number, until: () => boolean): void {
  for (let index = 0; index < limit && !until(); index++) {
    const pending = [...frames.values()];
    frames.clear();
    for (const callback of pending) callback(index * 16);
  }
}

function change(value: unknown, key = KEY): void {
  if (value === undefined) harness.storage.sync.delete(key);
  else harness.storage.sync.set(key, value);
  harness.emitStorageChange({ [key]: { newValue: value } }, 'sync');
}

async function start(
  url = 'https://gemini.google.com/app/test',
  admitted = true,
  isTopFrame = true,
): Promise<void> {
  const admission = createOfficialAdmission();
  if (admitted) {
    admitVisualEffectsForPage(admission, !isTopFrame && resolvePluginPlatformId(url) !== null);
  }
  admission.close();
  host = new PluginHost({
    url,
    sources: [new BuiltinPluginSource()],
    admission,
    isTopFrame,
    requestCatalogRefresh: () => {},
  });
  await host.start();
  await flush();
}

const mounted = () => host?.getStatuses().find((status) => status.id === ID)?.kind === 'mounted';

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'] });
  document.body.innerHTML = '';
  Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' });
  Object.defineProperty(window, 'innerHeight', { configurable: true, value: 40 });
  const noop = () => {};
  const context = {
    clearRect: noop,
    beginPath: noop,
    moveTo: noop,
    lineTo: noop,
    stroke: noop,
    ellipse: noop,
    arc: noop,
    fill: noop,
    bezierCurveTo: noop,
    quadraticCurveTo: noop,
    closePath: noop,
    save: noop,
    restore: noop,
    translate: noop,
    rotate: noop,
    scale: noop,
    setTransform: noop,
    drawImage: noop,
  };
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(
    context as unknown as CanvasRenderingContext2D,
  );
  frames = new Map();
  let nextFrame = 1;
  vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
    const id = nextFrame++;
    frames.set(id, callback);
    return id;
  });
  vi.spyOn(window, 'cancelAnimationFrame').mockImplementation((id) => {
    frames.delete(id);
  });
  harness = installLifecycleHarness();
  resetNativeHandlersForTests();
  runtime = createVisualEffectsRuntime();
  registerNativeHandler(ID, runtime.handler);
  host = null;
});

afterEach(async () => {
  host?.stop();
  runtime.destroy();
  await flush();
  harness.restore();
  resetNativeHandlersForTests();
  vi.restoreAllMocks();
  vi.useRealTimers();
  for (const node of nodes()) node.remove();
  Object.defineProperty(window, 'innerHeight', { configurable: true, value: originalHeight });
});

describe('shared visual effects through the real builtin source and host', () => {
  it.each([
    ['missing', undefined, null],
    ['off', 'off', null],
    ['snow', 'snow', 'snow'],
    ['sakura', 'sakura', 'sakura'],
    ['rain', 'rain', 'rain'],
  ] as const)(
    'uses the %s legacy choice and ignores stale plugin state',
    async (_label, value, effect) => {
      if (value !== undefined) harness.storage.sync.set(KEY, value);
      const stale = { [ID]: { enabled: !effect, installedAt: 1, settings: { effect: 'rain' } } };
      harness.storage.local.set(StorageKeys.PLUGINS_STATE, stale);
      await start();
      expect(mounted()).toBe(effect !== null);
      expect(nodes()).toHaveLength(effect ? 1 : 0);
      if (effect) expect(canvas(effect)).not.toBeNull();
      expect(harness.storage.sync.get(KEY)).toBe(value);
      expect(harness.storage.local.get(StorageKeys.PLUGINS_STATE)).toEqual(stale);
    },
  );

  it('uses legacy snow only without a string and gives explicit off precedence', async () => {
    harness.storage.sync.set(LEGACY_KEY, true);
    await start();
    expect(canvas('snow')).not.toBeNull();
    change('off');
    await flush();
    expect(mounted()).toBe(false);
    runFrames(2000, () => nodes().length === 0);
    expect(nodes()).toHaveLength(0);
    change(undefined);
    await flush();
    expect(canvas('snow')).not.toBeNull();
  });

  it('switches kinds live and drains old renderers without duplicate nodes', async () => {
    harness.storage.sync.set(KEY, 'snow');
    await start();
    for (const effect of ['sakura', 'rain', 'snow']) {
      change(effect);
      await flush();
      expect(mounted()).toBe(true);
      expect(canvas(effect)).not.toBeNull();
      runFrames(2000, () => nodes().length === 1);
      expect(nodes()).toEqual([canvas(effect)]);
    }
  });

  it.each(['snow', 'sakura', 'rain'])(
    'off drains %s then removes it while on during drain resumes its renderer',
    async (effect) => {
      harness.storage.sync.set(KEY, effect);
      await start();
      const original = canvas(effect);
      change('off');
      await flush();
      expect(mounted()).toBe(false);
      expect(canvas(effect)).toBe(original);
      change(effect);
      await flush();
      expect(mounted()).toBe(true);
      expect(nodes()).toEqual([original]);
      change('off');
      await flush();
      runFrames(2000, () => nodes().length === 0);
      expect(nodes()).toHaveLength(0);
      expect(frames.size).toBe(0);
      change(effect);
      await flush();
      expect(nodes()).toHaveLength(1);
      expect(canvas(effect)).not.toBe(original);
      runtime.destroy();
      expect(nodes()).toHaveLength(0);
      expect(frames.size).toBe(0);
    },
  );

  it.each([
    'https://gemini.google.com/app/test',
    'https://business.gemini.google/',
    'https://aistudio.google.com/prompts/new_chat',
    'https://aistudio.google.cn/',
    'https://claude.ai/chat/1',
    'https://example.frame.claudeusercontent.com/',
    'https://chatgpt.com/c/1',
    'https://chat.openai.com/c/1',
    'https://chat.deepseek.com/a/chat/s/1',
    'https://custom.example/',
    'http://localhost:3000/',
  ])('preserves the shared choice on already-injected %s pages', async (url) => {
    harness.storage.sync.set(KEY, 'rain');
    harness.storage.sync.set(StorageKeys.GV_AISTUDIO_ENABLED, false);
    await start(url);
    expect(mounted()).toBe(true);
    expect(canvas('rain')).not.toBeNull();
    change('sakura');
    await flush();
    expect(canvas('sakura')).not.toBeNull();
  });

  it('reads only the visual keys on plugin and custom sites', async () => {
    await start('https://custom.example/');
    expect(chrome.storage.sync.get).toHaveBeenCalledWith([KEY, LEGACY_KEY]);
    const reads = vi.mocked(chrome.storage.sync.get).mock.calls;
    expect(reads.flatMap(([keys]) => (Array.isArray(keys) ? keys : []))).not.toContain(
      StorageKeys.FORMULA_COPY_ENABLED,
    );
  });

  it.each([
    ['unadmitted native page', 'https://gemini.google.com/app/test', true],
    ['unadmitted custom page', 'https://custom.example/', true],
    ['plugin subframe', 'https://example.frame.claudeusercontent.com/', false],
  ] as const)('does not render on an %s', async (_label, url, topFrame) => {
    harness.storage.sync.set(KEY, 'snow');
    await start(url, !topFrame, topFrame);
    expect(mounted()).toBe(false);
    expect(nodes()).toHaveLength(0);
    change('sakura');
    await flush();
    expect(nodes()).toHaveLength(0);
  });
});
