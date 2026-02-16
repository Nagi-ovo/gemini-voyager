/**
 * Snow Effect for Gemini
 *
 * When enabled, renders a fullscreen canvas snow animation.
 * Uses `pointer-events: none` so it never blocks page interactions.
 * Pauses when the tab is hidden to save CPU.
 *
 * Performance notes:
 * - Single canvas with simple arc draws (no images, no shadows)
 * - Snowflakes sorted by opacity at init; drawn in batches to minimize fillStyle switches
 * - Animation pauses on hidden tabs via visibilitychange
 * - ~160 particles total — negligible GPU/CPU overhead
 */

const CANVAS_ID = 'gv-snow-effect-canvas';
const STORAGE_KEY = 'gvSnowEffect';

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
  opacity: number;
  speedY: number;
  drift: number;
  /** Individual oscillation frequency so flakes don't sway in unison */
  driftFreq: number;
  phase: number;
}

let enabled = false;
let canvas: HTMLCanvasElement | null = null;
let ctx: CanvasRenderingContext2D | null = null;
let animationFrameId: number | null = null;
let snowflakes: Snowflake[] = [];
let resizeHandler: (() => void) | null = null;
let visibilityHandler: (() => void) | null = null;

/** Random float in [min, max) */
function rand(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

function createSnowflake(
  canvasWidth: number,
  canvasHeight: number,
  layer: (typeof LAYERS)[number],
  randomY: boolean,
): Snowflake {
  return {
    x: Math.random() * canvasWidth,
    y: randomY ? Math.random() * canvasHeight : -(Math.random() * canvasHeight),
    radius: rand(layer.radius[0], layer.radius[1]),
    opacity: rand(layer.opacity[0], layer.opacity[1]),
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
      flakes.push(createSnowflake(width, height, layer, true));
    }
  }
  // Sort by opacity so we can batch fillStyle changes during draw
  flakes.sort((a, b) => a.opacity - b.opacity);
  snowflakes = flakes;
}

function updateAndDraw(time: number): void {
  if (!ctx || !canvas) return;

  const { width, height } = canvas;
  ctx.clearRect(0, 0, width, height);

  let currentOpacity = -1;

  for (const flake of snowflakes) {
    flake.y += flake.speedY;
    flake.x += Math.sin(flake.phase + time * flake.driftFreq) * flake.drift;

    // Recycle when off-screen bottom
    if (flake.y > height + flake.radius) {
      flake.y = -flake.radius;
      flake.x = Math.random() * width;
    }

    // Wrap horizontal
    if (flake.x > width + flake.radius) {
      flake.x = -flake.radius;
    } else if (flake.x < -flake.radius) {
      flake.x = width + flake.radius;
    }

    // Batch fillStyle: only update when opacity changes (quantised to 2 decimals)
    const quantised = Math.round(flake.opacity * 50) / 50;
    if (quantised !== currentOpacity) {
      currentOpacity = quantised;
      ctx.fillStyle = `rgba(255,255,255,${currentOpacity})`;
    }

    ctx.beginPath();
    ctx.arc(flake.x, flake.y, flake.radius, 0, Math.PI * 2);
    ctx.fill();
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
  if (enabled) return;
  enabled = true;

  canvas = document.createElement('canvas');
  canvas.id = CANVAS_ID;
  canvas.style.cssText =
    'position:fixed;top:0;left:0;width:100%;height:100%;pointer-events:none;z-index:2147483647;';
  document.documentElement.appendChild(canvas);

  ctx = canvas.getContext('2d');
  if (!ctx) {
    disable();
    return;
  }

  resizeCanvas();
  initSnowflakes(canvas.width, canvas.height);
  startAnimation();

  resizeHandler = resizeCanvas;
  window.addEventListener('resize', resizeHandler);

  visibilityHandler = handleVisibilityChange;
  document.addEventListener('visibilitychange', visibilityHandler);
}

function disable(): void {
  if (!enabled) return;
  enabled = false;

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
  snowflakes = [];
}

/**
 * Initialize and start the snow effect feature
 */
export function startSnowEffect(): void {
  // 1) Read initial setting
  try {
    chrome.storage?.sync?.get({ [STORAGE_KEY]: false }, (res) => {
      if (res?.[STORAGE_KEY] === true) {
        enable();
      }
    });
  } catch (e) {
    console.error('[Gemini Voyager] Failed to get snow effect setting:', e);
  }

  // 2) Respond to storage changes
  try {
    chrome.storage?.onChanged?.addListener((changes, area) => {
      if (area === 'sync' && changes[STORAGE_KEY]) {
        if (changes[STORAGE_KEY].newValue === true) {
          enable();
        } else {
          disable();
        }
      }
    });
  } catch (e) {
    console.error('[Gemini Voyager] Failed to add storage listener for snow effect:', e);
  }

  // 3) Cleanup on page unload
  window.addEventListener('beforeunload', () => {
    disable();
  });
}
