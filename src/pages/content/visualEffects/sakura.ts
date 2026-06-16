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
import { isFirefox } from '@/core/utils/browser';

const CANVAS_ID = 'gv-sakura-effect-canvas';
const STORAGE_KEY = 'gvVisualEffect';
const LEGACY_KEY = 'gvSnowEffect';
const EFFECT_VALUE = 'sakura';
const BASE_FRAME_MS = 1000 / 60;
const SPRITE_SIZE = 48;
const SPRITE_SHAPE_HALF_SIZE = 18;
const ADAPTIVE_SLOW_FRAMES = 3;
const ADAPTIVE_FAST_FRAMES = 180;

type SakuraLayer = {
  count: number;
  size: readonly [number, number];
  speed: readonly [number, number];
  opacity: readonly [number, number];
  drift: readonly [number, number];
};

type SakuraQualityProfile = {
  name: 'full' | 'balanced' | 'low';
  layers: readonly SakuraLayer[];
  frameIntervalMs: number;
  maxDpr: number;
  slowFrameBudgetMs: number;
};

const FULL_LAYERS: readonly SakuraLayer[] = [
  // far — tiny, slow, ghostly
  { count: 40, size: [2.5, 4.5], speed: [0.1, 0.3], opacity: [0.1, 0.25], drift: [0.15, 0.4] },
  // mid — main visible petals
  { count: 32, size: [4.5, 7.5], speed: [0.25, 0.55], opacity: [0.25, 0.5], drift: [0.35, 0.8] },
  // near — large, soft foreground
  { count: 16, size: [7.5, 11], speed: [0.4, 0.75], opacity: [0.4, 0.65], drift: [0.5, 1.0] },
] as const;

const BALANCED_LAYERS: readonly SakuraLayer[] = [
  { count: 22, size: [2.5, 4.5], speed: [0.1, 0.3], opacity: [0.1, 0.25], drift: [0.15, 0.4] },
  { count: 18, size: [4.5, 7.5], speed: [0.25, 0.55], opacity: [0.25, 0.5], drift: [0.35, 0.8] },
  { count: 8, size: [7.5, 11], speed: [0.4, 0.75], opacity: [0.4, 0.65], drift: [0.5, 1.0] },
] as const;

const LOW_LAYERS: readonly SakuraLayer[] = [
  { count: 14, size: [2.5, 4.5], speed: [0.1, 0.3], opacity: [0.1, 0.25], drift: [0.15, 0.4] },
  { count: 10, size: [4.5, 7.5], speed: [0.25, 0.55], opacity: [0.25, 0.5], drift: [0.35, 0.8] },
  { count: 4, size: [7.5, 11], speed: [0.4, 0.75], opacity: [0.4, 0.65], drift: [0.5, 1.0] },
] as const;

const QUALITY_PROFILES: readonly SakuraQualityProfile[] = [
  {
    name: 'full',
    layers: FULL_LAYERS,
    frameIntervalMs: 0,
    maxDpr: 1,
    slowFrameBudgetMs: 18,
  },
  {
    name: 'balanced',
    layers: BALANCED_LAYERS,
    frameIntervalMs: 1000 / 40,
    maxDpr: 1,
    slowFrameBudgetMs: 18,
  },
  {
    name: 'low',
    layers: LOW_LAYERS,
    frameIntervalMs: 1000 / 30,
    maxDpr: 1,
    slowFrameBudgetMs: 22,
  },
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
  layerIndex: number;
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
let petalSprites: HTMLCanvasElement[] = [];
let resizeHandler: (() => void) | null = null;
let visibilityHandler: (() => void) | null = null;
let viewportWidth = 0;
let viewportHeight = 0;
let renderDpr = 1;
let initialQualityLevel = 0;
let qualityLevel = 0;
let lastDrawTime = 0;
let slowFrameCount = 0;
let fastFrameCount = 0;

function rand(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

function nowMs(): number {
  return typeof performance !== 'undefined' && typeof performance.now === 'function'
    ? performance.now()
    : Date.now();
}

function getActiveProfile(): SakuraQualityProfile {
  return QUALITY_PROFILES[qualityLevel] ?? QUALITY_PROFILES[0];
}

function getInitialQualityLevel(): number {
  return isFirefox() ? 2 : 0;
}

function createPetal(
  canvasWidth: number,
  canvasHeight: number,
  layer: SakuraLayer,
  layerIndex: number,
  randomY: boolean,
): Petal {
  return {
    layerIndex,
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

function sortPetals(items: Petal[]): Petal[] {
  return items.sort((a, b) => a.colorIdx - b.colorIdx || a.opacity - b.opacity);
}

function initPetals(width: number, height: number): void {
  const items: Petal[] = [];
  const profile = getActiveProfile();
  profile.layers.forEach((layer, layerIndex) => {
    for (let i = 0; i < layer.count; i++) {
      items.push(createPetal(width, height, layer, layerIndex, true));
    }
  });
  petals = sortPetals(items);
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

function buildPetalSprites(): void {
  petalSprites = PALETTE.flatMap((fillPrefix) => {
    const sprite = document.createElement('canvas');
    sprite.width = SPRITE_SIZE;
    sprite.height = SPRITE_SIZE;
    const spriteCtx = sprite.getContext('2d');
    if (!spriteCtx) return [];

    spriteCtx.clearRect(0, 0, SPRITE_SIZE, SPRITE_SIZE);
    spriteCtx.fillStyle = `${fillPrefix}1)`;
    spriteCtx.translate(SPRITE_SIZE / 2, SPRITE_SIZE / 2);
    tracePetal(spriteCtx, SPRITE_SHAPE_HALF_SIZE);
    spriteCtx.fill();
    return [sprite];
  });
}

function reconcilePetalsForProfile(width: number, height: number): void {
  const profile = getActiveProfile();
  const nextPetals: Petal[] = [];

  profile.layers.forEach((layer, layerIndex) => {
    const existing = petals
      .filter((petal) => petal.layerIndex === layerIndex)
      .slice(0, layer.count);
    while (existing.length < layer.count) {
      existing.push(createPetal(width, height, layer, layerIndex, false));
    }
    nextPetals.push(...existing);
  });

  petals = sortPetals(nextPetals);
}

function setQualityLevel(nextQualityLevel: number): void {
  const clamped = Math.max(0, Math.min(QUALITY_PROFILES.length - 1, nextQualityLevel));
  if (clamped === qualityLevel) return;

  qualityLevel = clamped;
  slowFrameCount = 0;
  fastFrameCount = 0;
  resizeCanvas();
  reconcilePetalsForProfile(viewportWidth, viewportHeight);
}

function recordRenderCost(renderCostMs: number): void {
  const profile = getActiveProfile();

  if (renderCostMs > profile.slowFrameBudgetMs) {
    slowFrameCount += 1;
    fastFrameCount = 0;
  } else if (renderCostMs < profile.slowFrameBudgetMs * 0.45) {
    fastFrameCount += 1;
    slowFrameCount = 0;
  } else {
    slowFrameCount = 0;
    fastFrameCount = 0;
  }

  if (slowFrameCount >= ADAPTIVE_SLOW_FRAMES && qualityLevel < QUALITY_PROFILES.length - 1) {
    setQualityLevel(qualityLevel + 1);
  } else if (fastFrameCount >= ADAPTIVE_FAST_FRAMES && qualityLevel > initialQualityLevel) {
    setQualityLevel(qualityLevel - 1);
  }
}

function drawPetal(p: Petal, time: number): void {
  if (!ctx) return;

  // 3D wobble — gentle scaleX oscillation, always positive (no full flip)
  const wobble = p.wobbleBase + Math.sin(p.wobblePhase + time * p.wobbleSpeed) * p.wobbleAmp;
  const sprite = petalSprites[p.colorIdx];

  ctx.save();
  ctx.translate(p.x, p.y);
  ctx.rotate(p.rotation);
  ctx.scale(wobble, 1);

  if (sprite) {
    const spriteScale = p.size / SPRITE_SHAPE_HALF_SIZE;
    const spriteDrawSize = SPRITE_SIZE * spriteScale;
    ctx.globalAlpha = p.opacity;
    ctx.drawImage(sprite, -spriteDrawSize / 2, -spriteDrawSize / 2, spriteDrawSize, spriteDrawSize);
  } else {
    const qOpacity = Math.round(p.opacity * 20) / 20;
    ctx.fillStyle = PALETTE[p.colorIdx] + qOpacity + ')';
    tracePetal(ctx, p.size);
    ctx.fill();
  }

  ctx.restore();
}

function updateAndDraw(time: number): void {
  if (!ctx || !canvas) return;

  const profile = getActiveProfile();
  if (
    lastDrawTime > 0 &&
    profile.frameIntervalMs > 0 &&
    time - lastDrawTime < profile.frameIntervalMs
  ) {
    animationFrameId = requestAnimationFrame(updateAndDraw);
    return;
  }

  const elapsedMs = lastDrawTime > 0 ? time - lastDrawTime : BASE_FRAME_MS;
  const frameScale = Math.min(2.5, Math.max(0.5, elapsedMs / BASE_FRAME_MS));
  lastDrawTime = time;

  const renderStart = nowMs();
  const width = viewportWidth || canvas.width / renderDpr;
  const height = viewportHeight || canvas.height / renderDpr;
  ctx.clearRect(0, 0, width, height);

  let visibleCount = 0;

  for (const p of petals) {
    // Gentle fall + dual-frequency sway
    p.y += p.speedY * frameScale;
    p.x +=
      (Math.sin(p.phase + time * p.driftFreq) * p.drift +
        Math.sin(p.phase * 2.7 + time * p.flutterFreq) * p.flutter) *
      frameScale;
    p.rotation += p.rotationSpeed * frameScale;

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

    drawPetal(p, time);
  }

  // All petals have left the viewport — finish draining
  if (state === 'draining' && visibleCount === 0) {
    finalizeDrain();
    return;
  }

  recordRenderCost(nowMs() - renderStart);
  animationFrameId = requestAnimationFrame(updateAndDraw);
}

function resizeCanvas(): void {
  if (!canvas) return;
  const profile = getActiveProfile();
  viewportWidth = Math.max(1, window.innerWidth || document.documentElement.clientWidth || 1);
  viewportHeight = Math.max(1, window.innerHeight || document.documentElement.clientHeight || 1);
  renderDpr = Math.max(1, Math.min(window.devicePixelRatio || 1, profile.maxDpr));
  canvas.width = Math.ceil(viewportWidth * renderDpr);
  canvas.height = Math.ceil(viewportHeight * renderDpr);
  ctx?.setTransform(renderDpr, 0, 0, renderDpr, 0, 0);
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
  initialQualityLevel = getInitialQualityLevel();
  qualityLevel = initialQualityLevel;
  slowFrameCount = 0;
  fastFrameCount = 0;
  lastDrawTime = 0;

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

  buildPetalSprites();
  resizeCanvas();
  initPetals(viewportWidth, viewportHeight);
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
  petalSprites = [];
  viewportWidth = 0;
  viewportHeight = 0;
  renderDpr = 1;
  lastDrawTime = 0;
  slowFrameCount = 0;
  fastFrameCount = 0;
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
