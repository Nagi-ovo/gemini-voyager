import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { isFirefox } from '@/core/utils/browser';
import { PluginScope } from '@/features/plugins/runtime/pluginScope';

import { type LifecycleHarness, installLifecycleHarness } from '../../__tests__/lifecycleHarness';
import { claimContentScript } from '../../contentScriptHandoff';
import type { VisualEffectsRuntime } from '../index';

vi.mock('@/core/utils/browser', () => ({
  isFirefox: vi.fn(() => false),
}));

type GlobalWithFlag = typeof globalThis & { __gvVisualEffectsStarted?: unknown };

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

describe('visual effects plugin handler', () => {
  const originalInnerHeight = window.innerHeight;
  let harness: LifecycleHarness;
  let frames: Map<number, FrameRequestCallback>;
  let nextFrameId: number;
  let now: number;

  function openListeners(): string[] {
    return harness.ledger.openListeners();
  }

  function runFrames(limit: number, until: () => boolean): void {
    for (let i = 0; i < limit && !until(); i += 1) {
      const pending = [...frames.entries()];
      frames.clear();
      now += 1000 / 60;
      for (const [, callback] of pending) callback(now);
    }
  }

  function pageTransition(type: 'pagehide' | 'pageshow', persisted: boolean): void {
    window.dispatchEvent(new PageTransitionEvent(type, { persisted }));
  }

  beforeEach(() => {
    vi.resetModules();
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'] });
    vi.clearAllMocks();
    vi.mocked(isFirefox).mockReturnValue(false);
    delete (globalThis as GlobalWithFlag).__gvVisualEffectsStarted;
    document.body.innerHTML = '';
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' });
    vi.spyOn(document, 'hasFocus').mockReturnValue(true);

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
    now = 0;
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
    pageTransition('pagehide', true);
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

  async function activate(runtime: VisualEffectsRuntime, effect: string): Promise<PluginScope> {
    const scope = new PluginScope();
    await runtime.handler.activate?.(scope, { effect }, null);
    return scope;
  }

  it('draws nothing before the host admits an activation and never reads storage', async () => {
    const { createVisualEffectsRuntime } = await import('../index');
    const runtime = createVisualEffectsRuntime();
    runtime.handler.updateSettings?.({ effect: 'snow' });
    expect(effectNodes()).toEqual([]);
    expect(chrome.storage.sync.get).not.toHaveBeenCalled();
    expect(chrome.storage.onChanged.addListener).not.toHaveBeenCalled();
    runtime.destroy();
    expect(openListeners()).toEqual([]);
  });

  it('removes every renderer and listener immediately when the page stops', async () => {
    const { createVisualEffectsRuntime } = await import('../index');
    const cases = [
      ...EFFECTS.map((effect) => ({ ...effect, firefox: false })),
      { value: 'sakura', elementId: 'gv-sakura-effect-frame', firefox: true },
    ];
    for (const effect of cases) {
      vi.mocked(isFirefox).mockReturnValue(effect.firefox);
      const runtime = createVisualEffectsRuntime();
      const scope = await activate(runtime, effect.value);
      expect(document.getElementById(effect.elementId), effect.elementId).not.toBeNull();
      await scope.dispose();
      expect(document.getElementById(effect.elementId), effect.elementId).not.toBeNull();
      runtime.destroy();
      expect(effectNodes(), effect.elementId).toEqual([]);
      expect(openListeners(), effect.elementId).toEqual([]);
      expect(frames.size, effect.elementId).toBe(0);
      expect(vi.getTimerCount(), effect.elementId).toBe(0);
    }
  });

  it('ignores late activation and settings after page teardown', async () => {
    const { createVisualEffectsRuntime } = await import('../index');
    const runtime = createVisualEffectsRuntime();
    runtime.destroy();
    const scope = await activate(runtime, 'snow');
    runtime.handler.updateSettings?.({ effect: 'rain' });
    await scope.dispose();
    expect(effectNodes()).toEqual([]);
    expect(openListeners()).toEqual([]);
    expect(frames.size).toBe(0);
  });

  it('keeps the effect through a cancelled unload', async () => {
    const { createVisualEffectsRuntime } = await import('../index');
    const runtime = createVisualEffectsRuntime();
    await activate(runtime, 'snow');
    const canvas = document.getElementById('gv-snow-effect-canvas');

    // "Leave site?" then Stay: beforeunload fired, the page never hid.
    window.dispatchEvent(new Event('beforeunload'));
    expect(document.getElementById('gv-snow-effect-canvas')).toBe(canvas);
    expect(frames.size).toBe(1);
    runtime.destroy();
  });

  it('restores the selected effect when the page returns from the back/forward cache', async () => {
    const { createVisualEffectsRuntime } = await import('../index');
    const runtime = createVisualEffectsRuntime();
    const scope = await activate(runtime, 'snow');
    runtime.handler.updateSettings?.({ effect: 'rain' });

    pageTransition('pagehide', true);
    expect(effectNodes()).toEqual([]);
    expect(frames.size).toBe(0);

    pageTransition('pageshow', true);
    expect(effectNodes().map((node) => node.id)).toEqual(['gv-rain-effect-canvas']);
    expect(frames.size).toBe(1);

    // The page scope survives, so a later off still drains normally.
    await scope.dispose();
    runFrames(2_000, () => effectNodes().length === 0);
    expect(effectNodes()).toEqual([]);
    runtime.destroy();
    expect(openListeners()).toEqual([]);
  });

  it('a real unload or a first page load starts nothing extra', async () => {
    const { createVisualEffectsRuntime } = await import('../index');
    const runtime = createVisualEffectsRuntime();
    const scope = await activate(runtime, 'snow');
    pageTransition('pagehide', false);
    expect(effectNodes()).toHaveLength(1);
    pageTransition('pageshow', false);
    expect(effectNodes()).toHaveLength(1);
    await scope.dispose();
    pageTransition('pagehide', true);
    pageTransition('pageshow', true);
    expect(effectNodes()).toEqual([]);
    runtime.destroy();
  });

  it('does not let an older activation drain the newer activation', async () => {
    const { createVisualEffectsRuntime } = await import('../index');
    const runtime = createVisualEffectsRuntime();
    const older = await activate(runtime, 'snow');
    const newer = await activate(runtime, 'snow');
    await older.dispose();
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: 40 });
    window.dispatchEvent(new Event('resize'));
    runFrames(2_000, () => effectNodes().length === 0);
    expect(effectNodes()).toHaveLength(1);
    await newer.dispose();
    runFrames(2_000, () => effectNodes().length === 0);
    expect(effectNodes()).toEqual([]);
    runtime.destroy();
  });

  it('shares one effect owner across duplicate content-script bundles', async () => {
    const { createVisualEffectsRuntime } = await import('../index');
    const older = createVisualEffectsRuntime();
    await activate(older, 'snow');
    vi.resetModules();
    const duplicate = (await import('../index')).createVisualEffectsRuntime();
    await activate(duplicate, 'rain');
    duplicate.destroy();
    expect(effectNodes().map((node) => node.id)).toEqual(['gv-snow-effect-canvas']);
    older.destroy();
    const newer = createVisualEffectsRuntime();
    await activate(newer, 'rain');
    older.destroy();
    expect(effectNodes().map((node) => node.id)).toEqual(['gv-rain-effect-canvas']);
    newer.destroy();
  });

  it('starts no second effect after a content-script handoff', async () => {
    const releases: (() => void)[] = [];
    let earlier: VisualEffectsRuntime | undefined;
    releases.push(
      claimContentScript(
        () => earlier?.destroy(),
        () => true,
      ),
    );
    earlier = (await import('../index')).createVisualEffectsRuntime();
    await activate(earlier, 'snow');
    expect(effectNodes()).toHaveLength(1);
    vi.resetModules();
    releases.push(
      claimContentScript(
        () => {},
        () => false,
      ),
    );
    const later = (await import('../index')).createVisualEffectsRuntime();
    await activate(later, 'rain');
    expect(effectNodes().map((node) => node.id)).toEqual(['gv-rain-effect-canvas']);
    later.destroy();
    for (const release of releases) release();
    expect(effectNodes()).toEqual([]);
    expect(openListeners()).toEqual([]);
  });

  it.each(EFFECTS)(
    'off drains $value and on during drain resumes the same renderer',
    async (effect) => {
      Object.defineProperty(window, 'innerHeight', { configurable: true, value: 40 });
      const { createVisualEffectsRuntime } = await import('../index');
      const runtime = createVisualEffectsRuntime();
      const first = await activate(runtime, effect.value);
      const node = document.getElementById(effect.elementId);
      expect(node).not.toBeNull();
      await first.dispose();
      expect(document.getElementById(effect.elementId)).toBe(node);
      const second = await activate(runtime, effect.value);
      expect(document.getElementById(effect.elementId)).toBe(node);
      expect(effectNodes()).toHaveLength(1);
      await second.dispose();
      runFrames(2_000, () => effectNodes().length === 0);
      expect(effectNodes()).toEqual([]);
      runtime.destroy();
      expect(openListeners()).toEqual([]);
      expect(frames.size).toBe(0);
    },
  );

  it('switches kinds while the previous renderer drains and tears down all of them', async () => {
    const { createVisualEffectsRuntime } = await import('../index');
    const runtime = createVisualEffectsRuntime();
    const scope = await activate(runtime, 'snow');
    for (const effect of ['sakura', 'rain', 'snow']) {
      runtime.handler.updateSettings?.({ effect });
    }
    expect(effectNodes()).toHaveLength(3);
    expect(document.querySelectorAll('#gv-snow-effect-canvas')).toHaveLength(1);
    pageTransition('pagehide', true);
    expect(effectNodes()).toEqual([]);
    expect(frames.size).toBe(0);
    await scope.dispose();
    runtime.destroy();
    expect(openListeners()).toEqual([]);
  });
});
