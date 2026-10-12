import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { isFirefox } from '@/core/utils/browser';

import { type LifecycleHarness, installLifecycleHarness } from '../../__tests__/lifecycleHarness';
import { claimContentScript } from '../../contentScriptHandoff';
import type { StopNativeFeature } from '../../featureLifecycle';

vi.mock('@/core/utils/browser', () => ({
  isFirefox: vi.fn(() => false),
}));

type GlobalWithFlag = typeof globalThis & { __gvVisualEffectsStarted?: unknown };
type ReadCallback = (result: Record<string, unknown>) => void;

const EFFECTS = [
  { value: 'snow', elementId: 'gv-snow-effect-canvas' },
  { value: 'sakura', elementId: 'gv-sakura-effect-canvas' },
  { value: 'rain', elementId: 'gv-rain-effect-canvas' },
] as const;

const EFFECT_SELECTOR =
  '#gv-snow-effect-canvas, #gv-rain-effect-canvas, #gv-sakura-effect-canvas, #gv-sakura-effect-frame';

function effectNodes(): Element[] {
  return Array.from(document.querySelectorAll(EFFECT_SELECTOR));
}

function setVisualEffect(harness: LifecycleHarness, value: string): void {
  const oldValue = harness.storage.sync.get('gvVisualEffect');
  harness.storage.sync.set('gvVisualEffect', value);
  harness.emitStorageChange({ gvVisualEffect: { oldValue, newValue: value } }, 'sync');
}

describe('startVisualEffects', () => {
  const originalInnerHeight = window.innerHeight;
  let harness: LifecycleHarness;
  let frames: Map<number, FrameRequestCallback>;
  let nextFrameId: number;

  function openListeners(): string[] {
    return harness.ledger.openListeners();
  }

  function runFrames(limit: number, until: () => boolean): void {
    for (let i = 0; i < limit && !until(); i += 1) {
      const pending = [...frames.entries()];
      frames.clear();
      for (const [, callback] of pending) callback(i * 16);
    }
  }

  beforeEach(() => {
    vi.resetModules();
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'] });
    vi.clearAllMocks();
    vi.mocked(isFirefox).mockReturnValue(false);
    delete (globalThis as GlobalWithFlag).__gvVisualEffectsStarted;
    document.body.innerHTML = '';
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' });

    const context = {
      clearRect: vi.fn(),
      beginPath: vi.fn(),
      moveTo: vi.fn(),
      lineTo: vi.fn(),
      stroke: vi.fn(),
      ellipse: vi.fn(),
      arc: vi.fn(),
      fill: vi.fn(),
      bezierCurveTo: vi.fn(),
      quadraticCurveTo: vi.fn(),
      closePath: vi.fn(),
      save: vi.fn(),
      restore: vi.fn(),
      translate: vi.fn(),
      rotate: vi.fn(),
      scale: vi.fn(),
      setTransform: vi.fn(),
      drawImage: vi.fn(),
      fillStyle: '',
      strokeStyle: '',
      lineWidth: 1,
      lineCap: 'butt',
      globalAlpha: 1,
    };
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(
      context as unknown as CanvasRenderingContext2D,
    );

    frames = new Map();
    nextFrameId = 1;
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
      const id = nextFrameId++;
      frames.set(id, callback);
      return id;
    });
    vi.spyOn(window, 'cancelAnimationFrame').mockImplementation((id) => {
      frames.delete(id);
    });

    harness = installLifecycleHarness();
  });

  afterEach(() => {
    window.dispatchEvent(new Event('beforeunload'));
    // Effects append to <html>, so a failing case must not leak its canvas into the next one.
    for (const node of effectNodes()) node.remove();
    harness.restore();
    delete (globalThis as GlobalWithFlag).__gvVisualEffectsStarted;
    vi.restoreAllMocks();
    vi.useRealTimers();
    document.body.innerHTML = '';
    Object.defineProperty(window, 'innerHeight', {
      configurable: true,
      value: originalInnerHeight,
    });
  });

  it('initializes all effects only once in a content-script world', async () => {
    const { startVisualEffects } = await import('../index');

    startVisualEffects();
    startVisualEffects();

    expect(chrome.storage.sync.get).toHaveBeenCalledTimes(3);
    expect(chrome.storage.onChanged.addListener).toHaveBeenCalledTimes(3);
  });

  it('removes the effect canvas and every listener when visual effects stop', async () => {
    const { startVisualEffects } = await import('../index');
    const cases = [
      ...EFFECTS.map((effect) => ({ ...effect, firefox: false })),
      // Firefox draws sakura in an extension frame with a ready timeout.
      { value: 'sakura', elementId: 'gv-sakura-effect-frame', firefox: true },
    ];

    for (const effect of cases) {
      vi.mocked(isFirefox).mockReturnValue(effect.firefox);
      harness.storage.sync.set('gvVisualEffect', effect.value);

      const stop = startVisualEffects();
      expect(document.getElementById(effect.elementId), effect.elementId).not.toBeNull();

      stop();

      expect(effectNodes(), effect.elementId).toEqual([]);
      expect(openListeners(), effect.elementId).toEqual([]);
      expect(harness.ledger.openStorageListeners(), effect.elementId).toBe(0);
      expect(frames.size, effect.elementId).toBe(0);
      expect(vi.getTimerCount(), effect.elementId).toBe(0);
    }
  });

  it('does not re-enable an effect when the initial read lands after stop', async () => {
    const pendingReads: ReadCallback[] = [];
    vi.mocked(chrome.storage.sync.get).mockImplementation(((
      _defaults: unknown,
      callback: ReadCallback,
    ) => {
      pendingReads.push(callback);
    }) as unknown as typeof chrome.storage.sync.get);
    const { startVisualEffects } = await import('../index');

    const stop = startVisualEffects();
    stop();
    expect(pendingReads).toHaveLength(EFFECTS.length);
    for (const callback of pendingReads) {
      for (const effect of EFFECTS) callback({ gvVisualEffect: effect.value });
    }

    expect(effectNodes()).toEqual([]);
    expect(openListeners()).toEqual([]);
    expect(frames.size).toBe(0);
  });

  it('keeps a new effect run alive when an older run stops late', async () => {
    // Each effect module on its own: a replaced run's stop leaves the newer run's effect.
    const modules = [
      { start: (await import('../snow')).startSnowEffect, ...EFFECTS[0] },
      { start: (await import('../sakura')).startSakuraEffect, ...EFFECTS[1] },
      { start: (await import('../rain')).startRainEffect, ...EFFECTS[2] },
    ];
    for (const effect of modules) {
      harness.storage.sync.set('gvVisualEffect', effect.value);
      const stopOlder = effect.start();
      const stopNewer = effect.start();

      stopOlder();

      expect(document.getElementById(effect.elementId), effect.value).not.toBeNull();
      expect(harness.ledger.openStorageListeners(), effect.value).toBe(1);
      stopNewer();
      expect(effectNodes(), effect.value).toEqual([]);
    }

    // The shell: a stop of the previous page lifetime must not free the world either.
    harness.storage.sync.set('gvVisualEffect', 'snow');
    const { startVisualEffects } = await import('../index');
    const stopOlder = startVisualEffects();
    stopOlder();
    const stopNewer = startVisualEffects();

    stopOlder();

    expect(effectNodes()).toHaveLength(1);
    expect(harness.ledger.openStorageListeners()).toBe(3);
    vi.resetModules();
    const anotherCopy = await import('../index');
    anotherCopy.startVisualEffects();
    expect(effectNodes()).toHaveLength(1);
    expect(harness.ledger.openStorageListeners()).toBe(3);

    stopNewer();
    expect(effectNodes()).toEqual([]);
  });

  it('starts no second effect after a content-script handoff', async () => {
    harness.storage.sync.set('gvVisualEffect', 'snow');
    const releases: (() => void)[] = [];

    // The earlier copy claims the page, then mounts its effects.
    let stopEarlier: StopNativeFeature = () => {};
    releases.push(
      claimContentScript(
        () => stopEarlier(),
        () => true,
      ),
    );
    stopEarlier = (await import('../index')).startVisualEffects();
    expect(effectNodes()).toHaveLength(1);

    // A re-injected copy: fresh module state, same world. Claiming retires the earlier copy.
    vi.resetModules();
    const later = await import('../index');
    releases.push(
      claimContentScript(
        () => {},
        () => false,
      ),
    );
    const stopLater = later.startVisualEffects();

    expect(effectNodes()).toHaveLength(1);
    expect(harness.ledger.openStorageListeners()).toBe(3);
    setVisualEffect(harness, 'rain');
    expect(effectNodes().map((node) => node.id)).toEqual([
      'gv-snow-effect-canvas',
      'gv-rain-effect-canvas',
    ]);

    stopLater();
    for (const release of releases) release();
    expect(effectNodes()).toEqual([]);
    expect(openListeners()).toEqual([]);
  });

  it('keeps draining the snow when the popup turns it off while the page lives', async () => {
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: 40 });
    harness.storage.sync.set('gvVisualEffect', 'snow');
    const { startVisualEffects } = await import('../index');
    const stop = startVisualEffects();

    setVisualEffect(harness, 'off');

    // Turning it off is not a stop: the flakes keep falling and the run keeps listening.
    expect(document.getElementById('gv-snow-effect-canvas')).not.toBeNull();
    expect(harness.ledger.openStorageListeners()).toBe(3);
    runFrames(2_000, () => document.getElementById('gv-snow-effect-canvas') === null);
    expect(document.getElementById('gv-snow-effect-canvas')).toBeNull();

    setVisualEffect(harness, 'snow');
    expect(document.getElementById('gv-snow-effect-canvas')).not.toBeNull();

    // A stop mid-drain removes the canvas at once.
    setVisualEffect(harness, 'off');
    stop();
    expect(effectNodes()).toEqual([]);
    expect(openListeners()).toEqual([]);
  });
});
