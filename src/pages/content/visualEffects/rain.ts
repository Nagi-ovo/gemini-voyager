/**
 * Rain effect — inspired by "The Garden of Words"
 *
 * A cinematic rain with depth layers, wind-angled streaks, and
 * tiny splash ripples where drops hit the viewport floor.
 *
 * Graceful transitions: when switching effects or disabling, no new
 * drops spawn and the existing ones speed up and fall out with final
 * splash ripples; the canvas is removed once drops and splashes are gone.
 *
 * Visual approach:
 * - Raindrops are thin, semi-transparent lines (not dots), drawn
 *   at a slight wind angle (~8°) for realism.
 * - Three depth layers: far mist, mid rain, near foreground.
 *   Each layer has its own speed, length, opacity, and thickness.
 * - When a drop reaches the bottom, it spawns a short-lived splash
 *   ring that expands and fades out.
 * - Colour: cool blue-grey on dark pages, a deeper slate blue on light
 *   ones, to evoke the melancholy atmosphere of Shinjuku Gyoen in the rain.
 * - Drops are sorted by opacity and width at init, so each bucket is one
 *   path and one stroke. At most 60 fps; motion is time-based.
 */

import { type Scheme, getScheme, subscribeScheme } from '../platformTheme/scheme';
import {
  EffectClock,
  type EffectActivity,
  remapToViewport,
  watchEffectActivity,
} from './effectClock';
import { EFFECT_CANVAS_STYLE, type VisualEffectRenderer } from './types';

const CANVAS_ID = 'gv-rain-effect-canvas';

/** Wind angle in radians (~8° from vertical) */
const WIND_ANGLE = 0.14;
const WIND_DX = Math.sin(WIND_ANGLE);
const WIND_DY = Math.cos(WIND_ANGLE);

/** Drop opacity is quantised to 1/30 steps and width to 1/4 px, the draw buckets. */
const OPACITY_STEPS = 30;
const WIDTH_STEPS = 4;
/** Room for every width step in a bucket key. */
const WIDTH_KEY_SPAN = 16;

/** Drop and splash colour per page scheme. */
const RAIN_RGB: Record<Scheme, string> = {
  dark: '180,200,220',
  light: '74,104,140',
};

const LAYERS = [
  // far — misty fine drizzle
  {
    count: 80,
    length: [6, 14],
    speed: [3, 6],
    opacity: [0.06, 0.14],
    width: [0.3, 0.6],
  },
  // mid — main rain
  {
    count: 60,
    length: [14, 28],
    speed: [7, 13],
    opacity: [0.12, 0.25],
    width: [0.5, 1.0],
  },
  // near — heavy foreground streaks
  {
    count: 30,
    length: [26, 48],
    speed: [12, 20],
    opacity: [0.2, 0.38],
    width: [0.8, 1.5],
  },
] as const;

/** Maximum concurrent splashes */
const MAX_SPLASHES = 24;

interface Raindrop {
  x: number;
  y: number;
  length: number;
  speed: number;
  /** Quantised opacity step, 0…OPACITY_STEPS. */
  opacityStep: number;
  /** Quantised width step, in quarter pixels. */
  widthStep: number;
  /** Whether this drop can spawn a splash (only near/mid layers) */
  canSplash: boolean;
}

interface Splash {
  x: number;
  y: number;
  radius: number;
  maxRadius: number;
  opacity: number;
  fadeSpeed: number;
  expandSpeed: number;
}

function bucketKey(drop: Raindrop): number {
  return drop.opacityStep * WIDTH_KEY_SPAN + drop.widthStep;
}

function buildStrokeStyles(rgb: string): string[] {
  return Array.from(
    { length: OPACITY_STEPS + 1 },
    (_, step) => `rgba(${rgb},${step / OPACITY_STEPS})`,
  );
}

export function createRainRenderer(): VisualEffectRenderer {
  /** Effect lifecycle: off → active ⇄ draining → off */
  let state: 'off' | 'active' | 'draining' = 'off';
  let canvas: HTMLCanvasElement | null = null;
  let ctx: CanvasRenderingContext2D | null = null;
  let animationFrameId: number | null = null;
  let drops: Raindrop[] = [];
  let splashes: Splash[] = [];
  let rgb = RAIN_RGB.dark;
  let strokeStyles: string[] = [];
  let resizePending = false;
  let activity: EffectActivity | null = null;
  let unsubscribeScheme: (() => void) | null = null;
  const clock = new EffectClock();

  function rand(min: number, max: number): number {
    return min + Math.random() * (max - min);
  }

  function setScheme(scheme: Scheme): void {
    rgb = RAIN_RGB[scheme];
    strokeStyles = buildStrokeStyles(rgb);
  }

  function createDrop(
    canvasWidth: number,
    canvasHeight: number,
    layer: (typeof LAYERS)[number],
    canSplash: boolean,
  ): Raindrop {
    return {
      x: Math.random() * (canvasWidth + 100) - 50,
      y: Math.random() * canvasHeight,
      length: rand(layer.length[0], layer.length[1]),
      speed: rand(layer.speed[0], layer.speed[1]),
      opacityStep: Math.round(rand(layer.opacity[0], layer.opacity[1]) * OPACITY_STEPS),
      widthStep: Math.round(rand(layer.width[0], layer.width[1]) * WIDTH_STEPS),
      canSplash,
    };
  }

  function initDrops(width: number, height: number): void {
    const items: Raindrop[] = [];
    for (let li = 0; li < LAYERS.length; li++) {
      const layer = LAYERS[li];
      const canSplash = li >= 1; // mid + near
      for (let i = 0; i < layer.count; i++) {
        items.push(createDrop(width, height, layer, canSplash));
      }
    }
    // Recycling never changes a drop's bucket, so this order holds for its lifetime
    items.sort((a, b) => bucketKey(a) - bucketKey(b));
    drops = items;
    splashes = [];
  }

  function spawnSplash(x: number, y: number): void {
    if (splashes.length >= MAX_SPLASHES) return;
    splashes.push({
      x,
      y,
      radius: 0.5,
      maxRadius: rand(3, 8),
      opacity: rand(0.15, 0.3),
      fadeSpeed: rand(0.004, 0.01),
      expandSpeed: rand(0.15, 0.4),
    });
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

    // --- Draw rain streaks ---
    ctx.lineCap = 'round';

    let currentKey = -1;
    let visibleDropCount = 0;

    for (const d of drops) {
      const prevY = d.y;

      // Move
      const step = clock.fallSpeed(d.speed, height) * dt;
      d.x += step * WIND_DX;
      d.y += step * WIND_DY;

      // Off-screen bottom
      if (d.y > height + d.length) {
        if (draining) {
          // Spawn one final splash as the drop exits (only on first crossing)
          if (prevY <= height + d.length && d.canSplash && Math.random() < 0.35) {
            spawnSplash(d.x, height - 1);
          }
          continue;
        }
        // Normal: recycle + splash
        if (d.canSplash && Math.random() < 0.35) {
          spawnSplash(d.x, height - 1);
        }
        d.y = -(d.length + Math.random() * height * 0.2);
        d.x = Math.random() * (width + 100) - 50;
      }

      // Off-screen right (wind pushes drops rightward)
      if (d.x > width + 50) {
        if (draining) continue;
        d.x = -50;
      }

      visibleDropCount++;

      const key = bucketKey(d);
      if (key !== currentKey) {
        if (currentKey >= 0) ctx.stroke();
        currentKey = key;
        ctx.strokeStyle = strokeStyles[d.opacityStep];
        ctx.lineWidth = d.widthStep / WIDTH_STEPS;
        ctx.beginPath();
      }
      ctx.moveTo(d.x, d.y);
      ctx.lineTo(d.x + d.length * WIND_DX, d.y + d.length * WIND_DY);
    }
    if (currentKey >= 0) ctx.stroke();

    // --- Draw splashes ---
    ctx.lineWidth = 0.6;
    for (let i = splashes.length - 1; i >= 0; i--) {
      const s = splashes[i];
      s.radius += s.expandSpeed * dt;
      s.opacity -= s.fadeSpeed * dt;

      if (s.opacity <= 0 || s.radius >= s.maxRadius) {
        splashes.splice(i, 1);
        continue;
      }

      ctx.strokeStyle = `rgba(${rgb},${s.opacity})`;
      ctx.beginPath();
      ctx.ellipse(s.x, s.y, s.radius, s.radius * 0.35, 0, 0, Math.PI * 2);
      ctx.stroke();
    }

    // All drops and splashes gone, or the drain ran out of time
    if (draining && ((visibleDropCount === 0 && splashes.length === 0) || clock.drainExpired())) {
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
    remapToViewport(drops, canvas.width, canvas.height, width, height);
    remapToViewport(splashes, canvas.width, canvas.height, width, height);
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
      // Cancel drain — resume normal drop recycling at resting speed
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
    initDrops(canvas.width, canvas.height);
    setScheme(getScheme());
    unsubscribeScheme = subscribeScheme(setScheme);

    clock.revive();
    clock.resetTimeBase();
    window.addEventListener('resize', handleResize);
    activity = watchEffectActivity(handleActivityChange);
    activity.preview();
    startAnimation();
  }

  /**
   * Graceful disable: stop spawning new drops and let existing ones
   * speed up and fall out with final splash ripples.
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
    drops = [];
    splashes = [];
    clock.revive();
  }

  /** Immediate disable: remove everything without draining (e.g. page teardown). */
  function forceDisable(): void {
    if (state === 'off') return;
    finalizeDrain();
  }

  return { enable, drain: disable, destroy: forceDisable };
}
