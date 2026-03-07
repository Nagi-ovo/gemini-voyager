/**
 * Sakura (Cherry Blossom) Effect for Gemini
 *
 * Renders a fullscreen canvas with gently falling sakura petals.
 * Uses `pointer-events: none` so it never blocks page interactions.
 * Pauses when the tab is hidden to save CPU.
 *
 * Graceful transitions: when switching effects or disabling, existing
 * petals continue falling naturally instead of vanishing instantly.
 * New petals stop spawning, and the canvas is cleaned up once all
 * particles have left the viewport.
 *
 * Visual approach:
 * - Petal shape: wide, rounded heart-like silhouette with a small
 *   V-notch — drawn via quadratic bezier curves. Width ≈ height
 *   so it reads as a petal, not a leaf.
 * - 3D flutter: gentle oscillating scaleX (never fully flips) to
 *   simulate a petal wobbling in the air, not aggressively tumbling.
 * - Colour: very pale pink, almost white — the hallmark of somei
 *   yoshino cherry blossoms.
 * - Motion: slow fall, wide lazy drift + tiny fast flutter. Petals
 *   feel like they're floating, not dropping.
 */

const CANVAS_ID = 'gv-sakura-effect-canvas';
const STORAGE_KEY = 'gvVisualEffect';
const LEGACY_KEY = 'gvSnowEffect';
const EFFECT_VALUE = 'sakura';

const LAYERS = [
  // far — tiny, slow, ghostly
  { count: 40, size: [2.5, 4.5], speed: [0.1, 0.3], opacity: [0.1, 0.25], drift: [0.15, 0.4] },
  // mid — main visible petals
  { count: 32, size: [4.5, 7.5], speed: [0.25, 0.55], opacity: [0.25, 0.5], drift: [0.35, 0.8] },
  // near — large, soft foreground
  { count: 16, size: [7.5, 11], speed: [0.4, 0.75], opacity: [0.4, 0.65], drift: [0.5, 1.0] },
] as const;

/**
 * Somei-yoshino palette: extremely pale pinks, almost white.
 * Pre-built fill prefixes — append opacity + `)`.
 */
const PALETTE = [
  'hsla(350,50%,94%,', // near-white blush
  'hsla(348,55%,92%,', // faint pink
  'hsla(345,60%,90%,', // soft petal
  'hsla(340,50%,92%,', // warm white-pink
  'hsla(346,65%,88%,', // gentle sakura
  'hsla(342,45%,93%,', // whisper pink
  'hsla(352,40%,95%,', // almost white
  'hsla(338,55%,89%,', // subtle rose
] as const;

interface Petal {
  x: number;
  y: number;
  /** Overall size scale of this petal */
  size: number;
  opacity: number;
  speedY: number;

  // primary sway — slow, wide
  drift: number;
  driftFreq: number;
  phase: number;

  // secondary flutter — fast, tiny
  flutter: number;
  flutterFreq: number;

  // 2D spin
  rotation: number;
  rotationSpeed: number;

  // 3D wobble — gentle scaleX oscillation (never fully flips)
  wobblePhase: number;
  wobbleSpeed: number;
  /** Baseline scaleX (0.6–1.0); wobble oscillates around this */
  wobbleBase: number;
  /** Amplitude of scaleX wobble (0.15–0.35) */
  wobbleAmp: number;

  colorIdx: number;
}

/** Effect lifecycle: off → active ⇄ draining → off */
let state: 'off' | 'active' | 'draining' = 'off';
let canvas: HTMLCanvasElement | null = null;
let ctx: CanvasRenderingContext2D | null = null;
let animationFrameId: number | null = null;
let petals: Petal[] = [];
let resizeHandler: (() => void) | null = null;
let visibilityHandler: (() => void) | null = null;

function rand(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

function createPetal(
  canvasWidth: number,
  canvasHeight: number,
  layer: (typeof LAYERS)[number],
  randomY: boolean,
): Petal {
  return {
    x: Math.random() * canvasWidth,
    y: randomY ? Math.random() * canvasHeight : -(Math.random() * canvasHeight * 0.4),
    size: rand(layer.size[0], layer.size[1]),
    opacity: rand(layer.opacity[0], layer.opacity[1]),
    speedY: rand(layer.speed[0], layer.speed[1]),

    drift: rand(layer.drift[0], layer.drift[1]),
    driftFreq: rand(0.0003, 0.0009),
    phase: Math.random() * Math.PI * 2,

    flutter: rand(0.04, 0.15),
    flutterFreq: rand(0.002, 0.006),

    rotation: Math.random() * Math.PI * 2,
    rotationSpeed: rand(0.001, 0.008) * (Math.random() > 0.5 ? 1 : -1),

    wobblePhase: Math.random() * Math.PI * 2,
    wobbleSpeed: rand(0.0006, 0.002),
    wobbleBase: rand(0.6, 0.9),
    wobbleAmp: rand(0.15, 0.35),

    colorIdx: Math.floor(Math.random() * PALETTE.length),
  };
}

function initPetals(width: number, height: number): void {
  const items: Petal[] = [];
  for (const layer of LAYERS) {
    for (let i = 0; i < layer.count; i++) {
      items.push(createPetal(width, height, layer, true));
    }
  }
  items.sort((a, b) => a.colorIdx - b.colorIdx || a.opacity - b.opacity);
  petals = items;
}

/**
 * Draw a sakura petal centred at the origin.
 *
 * Shape: wide, rounded, heart-like with a small notch at the top.
 * Width ≈ 85% of height — reads as a petal, not a leaf.
 *
 *        ╱ ‿ ╲        ← notch
 *      ╱       ╲
 *     (         )      ← round, fat body
 *      ╲       ╱
 *        ╲   ╱
 *          V           ← stem point
 */
function tracePetal(c: CanvasRenderingContext2D, s: number): void {
  // s = half-height; width is deliberately close to height
  const w = s * 0.85;

  c.beginPath();

  // Bottom stem point
  c.moveTo(0, s);

  // Right side — sweeps up and out in a fat curve
  c.quadraticCurveTo(w * 1.1, s * 0.15, w * 0.2, -s * 0.85);

  // Top-right → notch centre
  c.quadraticCurveTo(w * 0.05, -s * 0.55, 0, -s * 0.65);

  // Notch centre → top-left
  c.quadraticCurveTo(-w * 0.05, -s * 0.55, -w * 0.2, -s * 0.85);

  // Left side — mirror sweep back to stem
  c.quadraticCurveTo(-w * 1.1, s * 0.15, 0, s);

  c.closePath();
}

function updateAndDraw(time: number): void {
  if (!ctx || !canvas) return;

  const { width, height } = canvas;
  ctx.clearRect(0, 0, width, height);

  let currentFill = '';
  let visibleCount = 0;

  for (const p of petals) {
    // Gentle fall + dual-frequency sway
    p.y += p.speedY;
    p.x +=
      Math.sin(p.phase + time * p.driftFreq) * p.drift +
      Math.sin(p.phase * 2.7 + time * p.flutterFreq) * p.flutter;
    p.rotation += p.rotationSpeed;

    // Recycle off-screen (or skip during drain)
    if (p.y > height + p.size * 2) {
      if (state === 'draining') {
        continue;
      }
      p.y = -p.size * 2;
      p.x = Math.random() * width;
    }

    visibleCount++;

    if (p.x > width + p.size * 2) {
      p.x = -p.size * 2;
    } else if (p.x < -p.size * 2) {
      p.x = width + p.size * 2;
    }

    // Fill batching
    const qOpacity = Math.round(p.opacity * 20) / 20;
    const nextFill = PALETTE[p.colorIdx] + qOpacity + ')';
    if (nextFill !== currentFill) {
      currentFill = nextFill;
      ctx.fillStyle = currentFill;
    }

    // 3D wobble — gentle scaleX oscillation, always positive (no full flip)
    const wobble = p.wobbleBase + Math.sin(p.wobblePhase + time * p.wobbleSpeed) * p.wobbleAmp;

    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(p.rotation);
    ctx.scale(wobble, 1);

    tracePetal(ctx, p.size);
    ctx.fill();

    ctx.restore();
  }

  // All petals have left the viewport — finish draining
  if (state === 'draining' && visibleCount === 0) {
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
    // Cancel drain — resume normal particle recycling
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
  initPetals(canvas.width, canvas.height);
  startAnimation();

  resizeHandler = resizeCanvas;
  window.addEventListener('resize', resizeHandler);

  visibilityHandler = handleVisibilityChange;
  document.addEventListener('visibilitychange', visibilityHandler);
}

/**
 * Graceful disable: stop spawning new petals and let existing ones
 * fall off the bottom of the viewport naturally.
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
  petals = [];
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

export function startSakuraEffect(): void {
  try {
    chrome.storage?.sync?.get({ [STORAGE_KEY]: null, [LEGACY_KEY]: false }, (res) => {
      if (resolveEffect(res) === EFFECT_VALUE) {
        enable();
      }
    });
  } catch (e) {
    console.error('[Gemini Voyager] Failed to get sakura effect setting:', e);
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
    console.error('[Gemini Voyager] Failed to add storage listener for sakura effect:', e);
  }

  window.addEventListener('beforeunload', () => {
    forceDisable();
  });
}
