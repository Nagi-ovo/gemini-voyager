/**
 * Browser-independent Sakura scene used by both the page fallback and the
 * Firefox OffscreenCanvas worker. Keeping the simulation here prevents the two
 * render paths from drifting visually.
 */

export const SAKURA_BASE_FRAME_MS = 1000 / 60;
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

export const FULL_SAKURA_PARTICLE_COUNT = SAKURA_LAYERS.reduce(
  (total, layer) => total + layer.count,
  0,
);

/** Somei-yoshino palette: extremely pale pinks, almost white. */
const SAKURA_PALETTE = [
  'hsla(350,50%,94%,',
  'hsla(348,55%,92%,',
  'hsla(345,60%,90%,',
  'hsla(340,50%,92%,',
  'hsla(346,65%,88%,',
  'hsla(342,45%,93%,',
  'hsla(352,40%,95%,',
  'hsla(338,55%,89%,',
] as const;

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
 * Full-quality Sakura simulation. There are deliberately no low-particle or
 * low-frame-rate profiles here: performance isolation belongs in the worker,
 * not in a visibly degraded animation mode.
 */
export class SakuraScene {
  private readonly canvas: SakuraCanvas;
  private readonly context: SakuraContext;
  private readonly createSpriteCanvas: () => SakuraSpriteCanvas;
  private readonly random: () => number;

  private petals: Petal[] = [];
  private petalSprites: Array<SakuraSpriteCanvas | null> = [];
  private viewportWidth = 1;
  private viewportHeight = 1;
  private renderDpr = 1;

  constructor(options: SakuraSceneOptions) {
    this.canvas = options.canvas;
    this.context = options.context;
    this.createSpriteCanvas = options.createSpriteCanvas;
    this.random = options.random ?? Math.random;
  }

  initialize(width: number, height: number, dpr: number): void {
    this.buildPetalSprites();
    this.resize(width, height, dpr);
    this.petals = [];

    for (const layer of SAKURA_LAYERS) {
      for (let index = 0; index < layer.count; index += 1) {
        this.petals.push(this.createPetal(layer, true));
      }
    }
    this.petals.sort(
      (first, second) => first.colorIdx - second.colorIdx || first.opacity - second.opacity,
    );
  }

  resize(width: number, height: number, dpr: number): void {
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

    this.viewportWidth = nextWidth;
    this.viewportHeight = nextHeight;
    this.renderDpr = nextDpr;
    this.canvas.width = pixelWidth;
    this.canvas.height = pixelHeight;
    this.context.setTransform(nextDpr, 0, 0, nextDpr, 0, 0);
  }

  /** Draw one display frame and return the number of petals still on-screen. */
  renderFrame(time: number, elapsedMs: number, draining: boolean): number {
    const frameScale = Math.min(2.5, Math.max(0.5, elapsedMs / SAKURA_BASE_FRAME_MS));
    const width = this.viewportWidth;
    const height = this.viewportHeight;

    this.context.setTransform(this.renderDpr, 0, 0, this.renderDpr, 0, 0);
    this.context.clearRect(0, 0, width, height);

    let visibleCount = 0;

    for (const petal of this.petals) {
      petal.y += petal.speedY * frameScale;
      petal.x +=
        (Math.sin(petal.phase + time * petal.driftFreq) * petal.drift +
          Math.sin(petal.phase * 2.7 + time * petal.flutterFreq) * petal.flutter) *
        frameScale;
      petal.rotation += petal.rotationSpeed * frameScale;

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

      this.drawPetal(petal, time);
    }

    return visibleCount;
  }

  dispose(): void {
    this.petals = [];
    this.petalSprites = [];
  }

  getParticleCount(): number {
    return this.petals.length;
  }

  private createPetal(layer: SakuraLayer, randomY: boolean): Petal {
    return {
      x: this.random() * this.viewportWidth,
      y: randomY
        ? this.random() * this.viewportHeight
        : -(this.random() * this.viewportHeight * 0.4),
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
      colorIdx: Math.floor(this.random() * SAKURA_PALETTE.length),
    };
  }

  private buildPetalSprites(): void {
    this.petalSprites = SAKURA_PALETTE.map((fillPrefix) => {
      const sprite = this.createSpriteCanvas();
      sprite.width = SAKURA_SPRITE_SIZE;
      sprite.height = SAKURA_SPRITE_SIZE;
      const spriteContext = sprite.getContext('2d') as SakuraContext | null;
      if (!spriteContext) return null;

      spriteContext.clearRect(0, 0, SAKURA_SPRITE_SIZE, SAKURA_SPRITE_SIZE);
      spriteContext.fillStyle = `${fillPrefix}1)`;
      spriteContext.translate(SAKURA_SPRITE_SIZE / 2, SAKURA_SPRITE_SIZE / 2);
      tracePetal(spriteContext, SAKURA_SPRITE_SHAPE_HALF_SIZE);
      spriteContext.fill();
      return sprite;
    });
  }

  private drawPetal(petal: Petal, time: number): void {
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
      this.context.globalAlpha = petal.opacity;
      this.context.drawImage(
        sprite,
        -spriteDrawSize / 2,
        -spriteDrawSize / 2,
        spriteDrawSize,
        spriteDrawSize,
      );
    } else {
      const quantizedOpacity = Math.round(petal.opacity * 20) / 20;
      this.context.fillStyle = SAKURA_PALETTE[petal.colorIdx] + quantizedOpacity + ')';
      tracePetal(this.context, petal.size);
      this.context.fill();
    }

    this.context.restore();
  }
}
