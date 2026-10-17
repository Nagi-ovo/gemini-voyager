/**
 * Snow effect.
 *
 * Renders a fullscreen canvas snow animation with `pointer-events: none`, so it
 * never blocks page interactions. It pauses while the tab is hidden or the
 * window is unfocused (see `watchEffectActivity`).
 *
 * Graceful transitions: when switching effects or disabling, no new flakes
 * spawn and the existing ones speed up and fall out within a couple of
 * seconds; the canvas is removed once they are gone.
 *
 * Performance notes:
 * - Single canvas with simple arc draws (no images, no shadows)
 * - Flakes sorted by opacity at init; one path and one fill per opacity bucket
 * - At most 60 fps; motion is time-based, so speed is the same at any refresh rate
 * - 240 particles total
 */

import { type Scheme, getScheme, subscribeScheme } from '../platformTheme/scheme';
import {
  EffectClock,
  type EffectActivity,
  remapToViewport,
  watchEffectActivity,
} from './effectClock';
import { EFFECT_CANVAS_STYLE, type VisualEffectRenderer } from './types';

const CANVAS_ID = 'gv-snow-effect-canvas';
const TAU = Math.PI * 2;
/** Opacity is quantised to 1/50 steps so flakes share one fill per step. */
const OPACITY_STEPS = 50;

/** Flake colour per page scheme: white on dark, a soft blue-grey that still reads on white. */
const SNOW_RGB: Record<Scheme, string> = {
  dark: '255,255,255',
  light: '120,140,168',
};

/**
 * Three layers simulate depth-of-field:
 *   dust  – tiny background particles, slow, faint
 *   mid   – main visible snowflakes
 *   large – sparse foreground flakes, faster, more opaque
 */
const LAYERS = [
  // dust
  {
    count: 100,
    radius: [0.15, 0.45],
    speed: [0.15, 0.4],
    opacity: [0.15, 0.35],
    drift: [0.05, 0.2],
  },
  // mid
  { count: 80, radius: [0.5, 1.0], speed: [0.4, 1.0], opacity: [0.3, 0.6], drift: [0.15, 0.45] },
  // large
  { count: 60, radius: [1.2, 2.5], speed: [0.8, 1.6], opacity: [0.5, 0.8], drift: [0.25, 0.6] },
] as const;

interface Snowflake {
  x: number;
  y: number;
  radius: number;
  /** Quantised opacity step, 0…OPACITY_STEPS; flakes are sorted by it. */
  opacityStep: number;
  speedY: number;
  drift: number;
  /** Individual oscillation frequency so flakes don't sway in unison */
  driftFreq: number;
  phase: number;
}

function buildFillStyles(scheme: Scheme): string[] {
  const rgb = SNOW_RGB[scheme];
  return Array.from(
    { length: OPACITY_STEPS + 1 },
    (_, step) => `rgba(${rgb},${step / OPACITY_STEPS})`,
  );
}

export function createSnowRenderer(): VisualEffectRenderer {
  /** Effect lifecycle: off → active ⇄ draining → off */
  let state: 'off' | 'active' | 'draining' = 'off';
  let canvas: HTMLCanvasElement | null = null;
  let ctx: CanvasRenderingContext2D | null = null;
  let animationFrameId: number | null = null;
  let snowflakes: Snowflake[] = [];
  let fillStyles: string[] = [];
  let resizePending = false;
  let activity: EffectActivity | null = null;
  let unsubscribeScheme: (() => void) | null = null;
  const clock = new EffectClock();

  /** Random float in [min, max) */
  function rand(min: number, max: number): number {
    return min + Math.random() * (max - min);
  }

  function createSnowflake(
    canvasWidth: number,
    canvasHeight: number,
    layer: (typeof LAYERS)[number],
  ): Snowflake {
    return {
      x: Math.random() * canvasWidth,
      y: Math.random() * canvasHeight,
      radius: rand(layer.radius[0], layer.radius[1]),
      opacityStep: Math.round(rand(layer.opacity[0], layer.opacity[1]) * OPACITY_STEPS),
      speedY: rand(layer.speed[0], layer.speed[1]),
      drift: rand(layer.drift[0], layer.drift[1]),
      driftFreq: rand(0.0003, 0.0012),
      phase: Math.random() * Math.PI * 2,
    };
  }

  function initSnowflakes(width: number, height: number): void {
    const flakes: Snowflake[] = [];
    for (const layer of LAYERS) {
      for (let i = 0; i < layer.count; i++) {
        flakes.push(createSnowflake(width, height, layer));
      }
    }
    // Sorted by opacity so each opacity step is one contiguous path
    flakes.sort((a, b) => a.opacityStep - b.opacityStep);
    snowflakes = flakes;
  }

  function updateAndDraw(time: number): void {
    animationFrameId = null;
    if (!ctx || !canvas || state === 'off') return;

    const dt = clock.advance(time);
    if (dt === null) {
      startAnimation();
      return;
    }
    if (resizePending) syncCanvasSize();

    const { width, height } = canvas;
    const draining = state === 'draining';
    ctx.clearRect(0, 0, width, height);
    ctx.globalAlpha = clock.fadeAlpha();

    let currentStep = -1;
    let visibleCount = 0;

    for (const flake of snowflakes) {
      flake.y += clock.fallSpeed(flake.speedY, height) * dt;
      flake.x += Math.sin(flake.phase + time * flake.driftFreq) * flake.drift * dt;

      // Recycle when off-screen bottom (or skip during drain)
      if (flake.y > height + flake.radius) {
        if (draining) continue;
        flake.y = -flake.radius;
        flake.x = Math.random() * width;
      }

      visibleCount++;

      // Wrap horizontal
      if (flake.x > width + flake.radius) {
        flake.x = -flake.radius;
      } else if (flake.x < -flake.radius) {
        flake.x = width + flake.radius;
      }

      if (flake.opacityStep !== currentStep) {
        if (currentStep >= 0) ctx.fill();
        currentStep = flake.opacityStep;
        ctx.fillStyle = fillStyles[currentStep];
        ctx.beginPath();
      }
      // Without the moveTo, each arc joins the previous one and the fill covers the gap.
      ctx.moveTo(flake.x + flake.radius, flake.y);
      ctx.arc(flake.x, flake.y, flake.radius, 0, TAU);
    }
    if (currentStep >= 0) ctx.fill();

    // All particles have left the viewport, or the drain ran out of time
    if (draining && (visibleCount === 0 || clock.drainExpired())) {
      finalizeDrain();
      return;
    }

    startAnimation();
  }

  function syncCanvasSize(): void {
    resizePending = false;
    if (!canvas) return;
    const width = window.innerWidth;
    const height = window.innerHeight;
    if (width === canvas.width && height === canvas.height) return;
    remapToViewport(snowflakes, canvas.width, canvas.height, width, height);
    canvas.width = width;
    canvas.height = height;
  }

  /** Resize events only mark the size stale; the next drawn frame applies it once. */
  function handleResize(): void {
    resizePending = true;
  }

  function startAnimation(): void {
    if (animationFrameId !== null || !activity?.isRunning()) return;
    animationFrameId = requestAnimationFrame(updateAndDraw);
  }

  function stopAnimation(): void {
    if (animationFrameId !== null) {
      cancelAnimationFrame(animationFrameId);
      animationFrameId = null;
    }
  }

  function handleActivityChange(running: boolean): void {
    if (running) {
      clock.resetTimeBase();
      startAnimation();
    } else {
      stopAnimation();
    }
  }

  function enable(): void {
    activity?.preview();
    if (state === 'active') return;
    if (state === 'draining') {
      // Cancel drain — resume normal particle recycling at resting speed
      state = 'active';
      clock.revive();
      return;
    }
    state = 'active';

    canvas = document.createElement('canvas');
    canvas.id = CANVAS_ID;
    canvas.style.cssText = EFFECT_CANVAS_STYLE;
    document.documentElement.appendChild(canvas);

    ctx = canvas.getContext('2d');
    if (!ctx) {
      forceDisable();
      return;
    }

    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    initSnowflakes(canvas.width, canvas.height);
    fillStyles = buildFillStyles(getScheme());
    unsubscribeScheme = subscribeScheme((scheme) => {
      fillStyles = buildFillStyles(scheme);
    });

    clock.revive();
    clock.resetTimeBase();
    window.addEventListener('resize', handleResize);
    activity = watchEffectActivity(handleActivityChange);
    activity.preview();
    startAnimation();
  }

  /**
   * Graceful disable: stop spawning new snowflakes and let existing ones
   * speed up and fall out of the viewport.
   */
  function disable(): void {
    if (state !== 'active') return;
    state = 'draining';
    clock.startDrain();
    activity?.preview();
  }

  /** Complete the drain: remove canvas and clean up all resources. */
  function finalizeDrain(): void {
    state = 'off';
    stopAnimation();
    window.removeEventListener('resize', handleResize);
    resizePending = false;
    activity?.stop();
    activity = null;
    unsubscribeScheme?.();
    unsubscribeScheme = null;

    if (canvas) {
      canvas.remove();
      canvas = null;
    }

    ctx = null;
    snowflakes = [];
    clock.revive();
  }

  /** Immediate disable: remove everything without draining (e.g. page teardown). */
  function forceDisable(): void {
    if (state === 'off') return;
    finalizeDrain();
  }

  return { enable, drain: disable, destroy: forceDisable };
}
