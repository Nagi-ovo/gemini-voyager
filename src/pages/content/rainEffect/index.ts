/**
 * Rain Effect for Gemini — inspired by "The Garden of Words"
 *
 * A cinematic rain with depth layers, wind-angled streaks, and
 * tiny splash ripples where drops hit the viewport floor.
 *
 * Graceful transitions: when switching effects or disabling, existing
 * raindrops continue falling naturally with final splash ripples.
 * New drops stop spawning, and the canvas is cleaned up once all
 * particles and splashes have left the viewport.
 *
 * Visual approach:
 * - Raindrops are thin, semi-transparent lines (not dots), drawn
 *   at a slight wind angle (~8°) for realism.
 * - Three depth layers: far mist, mid rain, near foreground.
 *   Each layer has its own speed, length, opacity, and thickness.
 * - When a drop reaches the bottom, it spawns a short-lived splash
 *   ring that expands and fades out.
 * - Colour: cool blue-grey (hsl 210–220) to evoke the melancholy
 *   atmosphere of Shinjuku Gyoen in the rain.
 */

const CANVAS_ID = 'gv-rain-effect-canvas';
const STORAGE_KEY = 'gvVisualEffect';
const LEGACY_KEY = 'gvSnowEffect';
const EFFECT_VALUE = 'rain';

/** Wind angle in radians (~8° from vertical) */
const WIND_ANGLE = 0.14;
const WIND_DX = Math.sin(WIND_ANGLE);
const WIND_DY = Math.cos(WIND_ANGLE);

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
  opacity: number;
  lineWidth: number;
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

/** Effect lifecycle: off → active ⇄ draining → off */
let state: 'off' | 'active' | 'draining' = 'off';
let canvas: HTMLCanvasElement | null = null;
let ctx: CanvasRenderingContext2D | null = null;
let animationFrameId: number | null = null;
let drops: Raindrop[] = [];
let splashes: Splash[] = [];
let resizeHandler: (() => void) | null = null;
let visibilityHandler: (() => void) | null = null;

function rand(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

function createDrop(
  canvasWidth: number,
  canvasHeight: number,
  layer: (typeof LAYERS)[number],
  randomY: boolean,
  canSplash: boolean,
): Raindrop {
  return {
    x: Math.random() * (canvasWidth + 100) - 50,
    y: randomY ? Math.random() * canvasHeight : -(Math.random() * canvasHeight * 0.3),
    length: rand(layer.length[0], layer.length[1]),
    speed: rand(layer.speed[0], layer.speed[1]),
    opacity: rand(layer.opacity[0], layer.opacity[1]),
    lineWidth: rand(layer.width[0], layer.width[1]),
    canSplash,
  };
}

function initDrops(width: number, height: number): void {
  const items: Raindrop[] = [];
  for (let li = 0; li < LAYERS.length; li++) {
    const layer = LAYERS[li];
    const canSplash = li >= 1; // mid + near
    for (let i = 0; i < layer.count; i++) {
      items.push(createDrop(width, height, layer, true, canSplash));
    }
  }
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

function updateAndDraw(_time: number): void {
  if (!ctx || !canvas) return;

  const { width, height } = canvas;
  ctx.clearRect(0, 0, width, height);

  // --- Draw rain streaks ---
  ctx.lineCap = 'round';

  let currentOpacity = -1;
  let currentWidth = -1;
  let visibleDropCount = 0;

  for (const d of drops) {
    const prevY = d.y;

    // Move
    d.x += d.speed * WIND_DX;
    d.y += d.speed * WIND_DY;

    // Off-screen bottom
    if (d.y > height + d.length) {
      if (state === 'draining') {
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
      if (state === 'draining') {
        continue;
      }
      d.x = -50;
    }

    visibleDropCount++;

    // Batch strokeStyle
    const qo = Math.round(d.opacity * 30) / 30;
    if (qo !== currentOpacity) {
      currentOpacity = qo;
      ctx.strokeStyle = `rgba(180,200,220,${currentOpacity})`;
    }
    const qw = Math.round(d.lineWidth * 4) / 4;
    if (qw !== currentWidth) {
      currentWidth = qw;
      ctx.lineWidth = currentWidth;
    }

    ctx.beginPath();
    ctx.moveTo(d.x, d.y);
    ctx.lineTo(d.x + d.length * WIND_DX, d.y + d.length * WIND_DY);
    ctx.stroke();
  }

  // --- Draw splashes ---
  ctx.lineWidth = 0.6;
  for (let i = splashes.length - 1; i >= 0; i--) {
    const s = splashes[i];
    s.radius += s.expandSpeed;
    s.opacity -= s.fadeSpeed;

    if (s.opacity <= 0 || s.radius >= s.maxRadius) {
      splashes.splice(i, 1);
      continue;
    }

    ctx.strokeStyle = `rgba(180,200,220,${s.opacity})`;
    ctx.beginPath();
    ctx.ellipse(s.x, s.y, s.radius, s.radius * 0.35, 0, 0, Math.PI * 2);
    ctx.stroke();
  }

  // All drops off-screen and all splashes faded — finish draining
  if (state === 'draining' && visibleDropCount === 0 && splashes.length === 0) {
    finalizeDrain();
    return;
  }

  animationFrameId = requestAnimationFrame(updateAndDraw);
}

function resizeCanvas(): void {
  if (!canvas) return;
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
}

function startAnimation(): void {
  if (animationFrameId !== null) return;
  animationFrameId = requestAnimationFrame(updateAndDraw);
}

function stopAnimation(): void {
  if (animationFrameId !== null) {
    cancelAnimationFrame(animationFrameId);
    animationFrameId = null;
  }
}

function handleVisibilityChange(): void {
  if (document.visibilityState === 'visible') {
    startAnimation();
  } else {
    stopAnimation();
  }
}

function enable(): void {
  if (state === 'active') return;
  if (state === 'draining') {
    // Cancel drain — resume normal drop recycling
    state = 'active';
    return;
  }
  state = 'active';

  canvas = document.createElement('canvas');
  canvas.id = CANVAS_ID;
  canvas.style.cssText =
    'position:fixed;top:0;left:0;width:100%;height:100%;pointer-events:none;z-index:2147483647;';
  document.documentElement.appendChild(canvas);

  ctx = canvas.getContext('2d');
  if (!ctx) {
    forceDisable();
    return;
  }

  resizeCanvas();
  initDrops(canvas.width, canvas.height);
  startAnimation();

  resizeHandler = resizeCanvas;
  window.addEventListener('resize', resizeHandler);

  visibilityHandler = handleVisibilityChange;
  document.addEventListener('visibilitychange', visibilityHandler);
}

/**
 * Graceful disable: stop spawning new drops and let existing ones
 * fall off with final splash ripples.
 */
function disable(): void {
  if (state !== 'active') return;
  state = 'draining';
}

/** Complete the drain: remove canvas and clean up all resources. */
function finalizeDrain(): void {
  state = 'off';
  stopAnimation();

  if (resizeHandler) {
    window.removeEventListener('resize', resizeHandler);
    resizeHandler = null;
  }

  if (visibilityHandler) {
    document.removeEventListener('visibilitychange', visibilityHandler);
    visibilityHandler = null;
  }

  if (canvas) {
    canvas.remove();
    canvas = null;
  }

  ctx = null;
  drops = [];
  splashes = [];
}

/** Immediate disable: remove everything without draining (e.g. page unload). */
function forceDisable(): void {
  if (state === 'off') return;
  finalizeDrain();
}

function resolveEffect(res: Record<string, unknown>): string {
  if (typeof res[STORAGE_KEY] === 'string') return res[STORAGE_KEY] as string;
  if (res[LEGACY_KEY] === true) return 'snow';
  return 'off';
}

export function startRainEffect(): void {
  try {
    chrome.storage?.sync?.get({ [STORAGE_KEY]: null, [LEGACY_KEY]: false }, (res) => {
      if (resolveEffect(res) === EFFECT_VALUE) {
        enable();
      }
    });
  } catch (e) {
    console.error('[Gemini Voyager] Failed to get rain effect setting:', e);
  }

  try {
    chrome.storage?.onChanged?.addListener((changes, area) => {
      if (area === 'sync' && changes[STORAGE_KEY]) {
        if (changes[STORAGE_KEY].newValue === EFFECT_VALUE) {
          enable();
        } else {
          disable();
        }
      }
    });
  } catch (e) {
    console.error('[Gemini Voyager] Failed to add storage listener for rain effect:', e);
  }

  window.addEventListener('beforeunload', () => {
    forceDisable();
  });
}
