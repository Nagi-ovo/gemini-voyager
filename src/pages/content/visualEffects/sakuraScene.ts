/**
 * Browser-independent Sakura scene used by both the page fallback and the
 * Firefox OffscreenCanvas worker. Keeping the simulation here prevents the two
 * render paths from drifting visually: frame pacing, the drain ramp, resize
 * remapping and the light/dark palettes all live here or in `effectClock`.
 */
import type { Scheme } from '../platformTheme/scheme';
import { EffectClock, remapToViewport } from './effectClock';

export const SAKURA_MAX_DPR = 1;
export const SAKURA_SPRITE_SIZE = 48;
const SAKURA_SPRITE_SHAPE_HALF_SIZE = 18;

type SakuraLayer = {
  count: number;
  size: readonly [number, number];
  speed: readonly [number, number];
  opacity: readonly [number, number];
  drift: readonly [number, number];
};

const SAKURA_LAYERS: readonly SakuraLayer[] = [
  // far — tiny, slow, ghostly
  { count: 40, size: [2.5, 4.5], speed: [0.1, 0.3], opacity: [0.1, 0.25], drift: [0.15, 0.4] },
  // mid — main visible petals
  { count: 32, size: [4.5, 7.5], speed: [0.25, 0.55], opacity: [0.25, 0.5], drift: [0.35, 0.8] },
  // near — large, soft foreground
  { count: 16, size: [7.5, 11], speed: [0.4, 0.75], opacity: [0.4, 0.65], drift: [0.5, 1.0] },
] as const;

interface PetalColor {
  /** `hsla(…,` prefix; the alpha and closing paren are appended. */
  fill: string;
  /** Optional outline baked into the sprite. */
  edge?: string;
}

/**
 * Somei-yoshino palettes, same length so a petal keeps its colour index.
 * Dark pages get extremely pale pinks, almost white. On a light page those
 * vanish, so petals turn a deeper pink with a slightly darker edge.
 */
const SAKURA_PALETTES: Record<Scheme, readonly PetalColor[]> = {
  dark: [
    { fill: 'hsla(350,50%,94%,' },
    { fill: 'hsla(348,55%,92%,' },
    { fill: 'hsla(345,60%,90%,' },
    { fill: 'hsla(340,50%,92%,' },
    { fill: 'hsla(346,65%,88%,' },
    { fill: 'hsla(342,45%,93%,' },
    { fill: 'hsla(352,40%,95%,' },
    { fill: 'hsla(338,55%,89%,' },
  ],
  light: [
    { fill: 'hsla(350,72%,80%,', edge: 'hsla(350,60%,64%,0.8)' },
    { fill: 'hsla(348,75%,78%,', edge: 'hsla(348,62%,62%,0.8)' },
    { fill: 'hsla(345,78%,76%,', edge: 'hsla(345,64%,60%,0.8)' },
    { fill: 'hsla(340,70%,78%,', edge: 'hsla(340,58%,62%,0.8)' },
    { fill: 'hsla(346,80%,74%,', edge: 'hsla(346,66%,58%,0.8)' },
    { fill: 'hsla(342,68%,80%,', edge: 'hsla(342,56%,64%,0.8)' },
    { fill: 'hsla(352,65%,82%,', edge: 'hsla(352,54%,66%,0.8)' },
    { fill: 'hsla(338,76%,75%,', edge: 'hsla(338,62%,59%,0.8)' },
  ],
};
const PALETTE_SIZE = SAKURA_PALETTES.dark.length;
/** Sprite outline width, in sprite pixels (the petal shape is 36 px tall there). */
const SPRITE_EDGE_WIDTH = 1.5;

/** What one call to `renderFrame` did. */
export type SakuraFrame = 'skipped' | 'running' | 'drained';

interface Petal {
  x: number;
  y: number;
  size: number;
  opacity: number;
  speedY: number;
  drift: number;
  driftFreq: number;
  phase: number;
  flutter: number;
  flutterFreq: number;
  rotation: number;
  rotationSpeed: number;
  wobblePhase: number;
  wobbleSpeed: number;
  wobbleBase: number;
  wobbleAmp: number;
  colorIdx: number;
}

export type SakuraCanvas = HTMLCanvasElement | OffscreenCanvas;
export type SakuraContext = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;
export type SakuraSpriteCanvas = HTMLCanvasElement | OffscreenCanvas;

export interface SakuraSceneOptions {
  canvas: SakuraCanvas;
  context: SakuraContext;
  createSpriteCanvas: () => SakuraSpriteCanvas;
  random?: () => number;
  scheme?: Scheme;
}

function rand(random: () => number, min: number, max: number): number {
  return min + random() * (max - min);
}

/** Trace the original wide, heart-like petal silhouette at the origin. */
function tracePetal(context: SakuraContext, size: number): void {
  const width = size * 0.85;

  context.beginPath();
  context.moveTo(0, size);
  context.quadraticCurveTo(width * 1.1, size * 0.15, width * 0.2, -size * 0.85);
  context.quadraticCurveTo(width * 0.05, -size * 0.55, 0, -size * 0.65);
  context.quadraticCurveTo(-width * 0.05, -size * 0.55, -width * 0.2, -size * 0.85);
  context.quadraticCurveTo(-width * 1.1, size * 0.15, 0, size);
  context.closePath();
}

/**
 * Full-quality Sakura simulation. There are deliberately no low-particle
 * profiles here: performance isolation belongs in the worker, not in a visibly
 * degraded animation mode. Like every effect it draws at most 60 fps, with
 * time-based motion, so a faster display only skips ticks.
 */
export class SakuraScene {
  private readonly canvas: SakuraCanvas;
  private readonly context: SakuraContext;
  private readonly createSpriteCanvas: () => SakuraSpriteCanvas;
  private readonly random: () => number;
  private readonly clock = new EffectClock();

  private petals: Petal[] = [];
  private petalSprites: Array<SakuraSpriteCanvas | null> = [];
  private scheme: Scheme;
  private viewportWidth = 1;
  private viewportHeight = 1;
  private renderDpr = 1;
  private pendingSize: { width: number; height: number; dpr: number } | null = null;

  constructor(options: SakuraSceneOptions) {
    this.canvas = options.canvas;
    this.context = options.context;
    this.createSpriteCanvas = options.createSpriteCanvas;
    this.random = options.random ?? Math.random;
    this.scheme = options.scheme ?? 'dark';
  }

  initialize(width: number, height: number, dpr: number): void {
    this.buildPetalSprites();
    this.petals = [];
    this.pendingSize = null;
    this.applySize(width, height, dpr);

    for (const layer of SAKURA_LAYERS) {
      for (let index = 0; index < layer.count; index += 1) {
        this.petals.push(this.createPetal(layer));
      }
    }
    this.petals.sort(
      (first, second) => first.colorIdx - second.colorIdx || first.opacity - second.opacity,
    );
  }

  /**
   * Record a new viewport. It is applied on the next drawn frame, so a burst
   * of resize events resets the canvas once and never between two draws.
   */
  resize(width: number, height: number, dpr: number): void {
    this.pendingSize = { width, height, dpr };
  }

  /** Swap palettes; sprites are re-rendered only when the scheme actually changes. */
  setScheme(scheme: Scheme): void {
    if (scheme === this.scheme) return;
    this.scheme = scheme;
    if (this.petalSprites.length > 0) this.buildPetalSprites();
  }

  /** Start accelerating petals out, or cancel a drain and return to resting speed. */
  setDraining(draining: boolean): void {
    if (draining) this.clock.startDrain();
    else this.clock.revive();
  }

  /** Call after a pause so the next frame takes one normal step. */
  resetTimeBase(): void {
    this.clock.resetTimeBase();
  }

  private applySize(width: number, height: number, dpr: number): void {
    const nextWidth = Math.max(1, width);
    const nextHeight = Math.max(1, height);
    const nextDpr = Math.max(1, Math.min(dpr || 1, SAKURA_MAX_DPR));
    const pixelWidth = Math.ceil(nextWidth * nextDpr);
    const pixelHeight = Math.ceil(nextHeight * nextDpr);

    if (
      this.viewportWidth === nextWidth &&
      this.viewportHeight === nextHeight &&
      this.renderDpr === nextDpr &&
      this.canvas.width === pixelWidth &&
      this.canvas.height === pixelHeight
    ) {
      return;
    }

    remapToViewport(this.petals, this.viewportWidth, this.viewportHeight, nextWidth, nextHeight);
    this.viewportWidth = nextWidth;
    this.viewportHeight = nextHeight;
    this.renderDpr = nextDpr;
    this.canvas.width = pixelWidth;
    this.canvas.height = pixelHeight;
    this.context.setTransform(nextDpr, 0, 0, nextDpr, 0, 0);
  }

  /**
   * Advance and draw one display frame at rAF time `time`. Returns `skipped`
   * when the 60 fps cap leaves this tick undrawn, and `drained` once a drain
   * has cleared the screen or reached its time cap.
   */
  renderFrame(time: number): SakuraFrame {
    const dt = this.clock.advance(time);
    if (dt === null) return 'skipped';
    if (this.pendingSize) {
      const { width, height, dpr } = this.pendingSize;
      this.pendingSize = null;
      this.applySize(width, height, dpr);
    }

    const width = this.viewportWidth;
    const height = this.viewportHeight;
    const draining = this.clock.draining;
    const fade = this.clock.fadeAlpha();

    this.context.setTransform(this.renderDpr, 0, 0, this.renderDpr, 0, 0);
    this.context.clearRect(0, 0, width, height);

    let visibleCount = 0;

    for (const petal of this.petals) {
      petal.y += this.clock.fallSpeed(petal.speedY, height) * dt;
      petal.x +=
        (Math.sin(petal.phase + time * petal.driftFreq) * petal.drift +
          Math.sin(petal.phase * 2.7 + time * petal.flutterFreq) * petal.flutter) *
        dt;
      petal.rotation += petal.rotationSpeed * dt;

      if (petal.y > height + petal.size * 2) {
        if (draining) continue;
        petal.y = -petal.size * 2;
        petal.x = this.random() * width;
      }

      visibleCount += 1;

      if (petal.x > width + petal.size * 2) {
        petal.x = -petal.size * 2;
      } else if (petal.x < -petal.size * 2) {
        petal.x = width + petal.size * 2;
      }

      this.drawPetal(petal, time, fade);
    }

    if (draining && (visibleCount === 0 || this.clock.drainExpired())) return 'drained';
    return 'running';
  }

  dispose(): void {
    this.petals = [];
    this.petalSprites = [];
  }

  private createPetal(layer: SakuraLayer): Petal {
    return {
      x: this.random() * this.viewportWidth,
      y: this.random() * this.viewportHeight,
      size: rand(this.random, layer.size[0], layer.size[1]),
      opacity: rand(this.random, layer.opacity[0], layer.opacity[1]),
      speedY: rand(this.random, layer.speed[0], layer.speed[1]),
      drift: rand(this.random, layer.drift[0], layer.drift[1]),
      driftFreq: rand(this.random, 0.0003, 0.0009),
      phase: this.random() * Math.PI * 2,
      flutter: rand(this.random, 0.04, 0.15),
      flutterFreq: rand(this.random, 0.002, 0.006),
      rotation: this.random() * Math.PI * 2,
      rotationSpeed: rand(this.random, 0.001, 0.008) * (this.random() > 0.5 ? 1 : -1),
      wobblePhase: this.random() * Math.PI * 2,
      wobbleSpeed: rand(this.random, 0.0006, 0.002),
      wobbleBase: rand(this.random, 0.6, 0.9),
      wobbleAmp: rand(this.random, 0.15, 0.35),
      colorIdx: Math.floor(this.random() * PALETTE_SIZE),
    };
  }

  private buildPetalSprites(): void {
    this.petalSprites = SAKURA_PALETTES[this.scheme].map((color) => {
      const sprite = this.createSpriteCanvas();
      sprite.width = SAKURA_SPRITE_SIZE;
      sprite.height = SAKURA_SPRITE_SIZE;
      const spriteContext = sprite.getContext('2d') as SakuraContext | null;
      if (!spriteContext) return null;

      spriteContext.clearRect(0, 0, SAKURA_SPRITE_SIZE, SAKURA_SPRITE_SIZE);
      spriteContext.fillStyle = `${color.fill}1)`;
      spriteContext.translate(SAKURA_SPRITE_SIZE / 2, SAKURA_SPRITE_SIZE / 2);
      tracePetal(spriteContext, SAKURA_SPRITE_SHAPE_HALF_SIZE);
      spriteContext.fill();
      if (color.edge) {
        spriteContext.strokeStyle = color.edge;
        spriteContext.lineWidth = SPRITE_EDGE_WIDTH;
        spriteContext.stroke();
      }
      return sprite;
    });
  }

  private drawPetal(petal: Petal, time: number, fade: number): void {
    const wobble =
      petal.wobbleBase + Math.sin(petal.wobblePhase + time * petal.wobbleSpeed) * petal.wobbleAmp;
    const sprite = this.petalSprites[petal.colorIdx];

    this.context.save();
    this.context.translate(petal.x, petal.y);
    this.context.rotate(petal.rotation);
    this.context.scale(wobble, 1);

    if (sprite) {
      const spriteScale = petal.size / SAKURA_SPRITE_SHAPE_HALF_SIZE;
      const spriteDrawSize = SAKURA_SPRITE_SIZE * spriteScale;
      this.context.globalAlpha = petal.opacity * fade;
      this.context.drawImage(
        sprite,
        -spriteDrawSize / 2,
        -spriteDrawSize / 2,
        spriteDrawSize,
        spriteDrawSize,
      );
    } else {
      const quantizedOpacity = (Math.round(petal.opacity * 20) / 20) * fade;
      this.context.fillStyle =
        SAKURA_PALETTES[this.scheme][petal.colorIdx].fill + quantizedOpacity + ')';
      tracePetal(this.context, petal.size);
      this.context.fill();
    }

    this.context.restore();
  }
}
