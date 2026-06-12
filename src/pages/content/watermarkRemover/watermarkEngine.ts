/**
 * Watermark Engine Main Module
 *
 * This module is ported from gemini-watermark-remover by journey-ad (Jad),
 * itself based on GeminiWatermarkTool by AllenK (Kwyshell).
 * Original: https://github.com/journey-ad/gemini-watermark-remover/blob/main/src/core/watermarkEngine.js
 * License: MIT - Copyright (c) 2025 Jad; Copyright (c) 2024 AllenK (Kwyshell)
 * Full retained notice: see /THIRD_PARTY_NOTICES.md
 *
 * Coordinates watermark detection, alpha map calculation, and removal operations.
 */
import { calculateAlphaMap } from './alphaMap';
// Import watermark background capture images - Vite will bundle these
import BG_48_IMPORT from './assets/bg_48.png';
import BG_96_IMPORT from './assets/bg_96.png';
import BG_96_20260520_IMPORT from './assets/bg_96_20260520.png';
import { type WatermarkPosition, removeWatermark } from './blendModes';

// For content scripts, we need to use chrome.runtime.getURL to resolve asset paths
// The imported paths are relative to the bundle, which works in extension context
const getBgPath = (importedPath: string): string => {
  // If it's already a data URL, use it directly
  if (importedPath.startsWith('data:')) {
    return importedPath;
  }
  // For file paths, use chrome.runtime.getURL in extension context
  try {
    // Extract just the filename from the path
    const filename = importedPath.split('/').pop() || importedPath;
    return chrome.runtime.getURL(`assets/${filename}`);
  } catch {
    // Fallback to the original path
    return importedPath;
  }
};

export interface WatermarkConfig {
  logoSize: number;
  marginRight: number;
  marginBottom: number;
  alphaVariant?: WatermarkAlphaVariant;
}

export interface WatermarkInfo {
  size: number;
  position: WatermarkPosition;
  config: WatermarkConfig;
}

export type WatermarkAlphaVariant = '20260520';

type WatermarkLogoSize = 48 | 96;
type WatermarkAlphaMapKey = WatermarkLogoSize | `${WatermarkLogoSize}-${WatermarkAlphaVariant}`;
export interface WatermarkAnchorOption {
  config: WatermarkConfig;
  alphaMap: Float32Array;
}

const LEGACY_LARGE_IMAGE_MIN_EDGE = 1024;
const WATERMARK_ALPHA_MIN = 0.01;
const WATERMARK_ALPHA_HIGH = 0.35;
const WATERMARK_ALPHA_LOW = 0.08;
const WATERMARK_ANCHOR_SWITCH_EVIDENCE_GAP = 8;
const WATERMARK_MAX_REMOVAL_PASSES = 3;
const WATERMARK_REPEAT_EVIDENCE_MIN = 20;
const WATERMARK_REPEAT_LUMINANCE_DELTA_MIN = 12;

interface WatermarkEvidence {
  score: number;
  luminanceDelta: number;
}

const LEGACY_96_WATERMARK_CONFIG: WatermarkConfig = {
  logoSize: 96,
  marginRight: 64,
  marginBottom: 64,
};

const LEGACY_48_WATERMARK_CONFIG: WatermarkConfig = {
  logoSize: 48,
  marginRight: 32,
  marginBottom: 32,
};

const NEW_96_WATERMARK_CONFIG: WatermarkConfig = {
  logoSize: 96,
  marginRight: 192,
  marginBottom: 192,
  alphaVariant: '20260520',
};

const NEW_48_WATERMARK_CONFIG: WatermarkConfig = {
  logoSize: 48,
  marginRight: 96,
  marginBottom: 96,
  alphaVariant: '20260520',
};

const NEW_WATERMARK_CONFIG_BY_SIZE: Record<WatermarkLogoSize, WatermarkConfig> = {
  48: NEW_48_WATERMARK_CONFIG,
  96: NEW_96_WATERMARK_CONFIG,
};

const areSameWatermarkConfig = (a: WatermarkConfig, b: WatermarkConfig): boolean =>
  a.logoSize === b.logoSize &&
  a.marginRight === b.marginRight &&
  a.marginBottom === b.marginBottom &&
  a.alphaVariant === b.alphaVariant;

function createMovedAnchorConfig(
  baseConfig: WatermarkConfig,
  imageWidth: number,
  imageHeight: number,
): WatermarkConfig | null {
  if (baseConfig.logoSize !== 48 && baseConfig.logoSize !== 96) return null;

  const optionConfig = NEW_WATERMARK_CONFIG_BY_SIZE[baseConfig.logoSize];
  if (areSameWatermarkConfig(baseConfig, optionConfig)) return null;

  const position = calculateWatermarkPosition(imageWidth, imageHeight, optionConfig);
  return position.x >= 0 && position.y >= 0 ? optionConfig : null;
}

/**
 * Detect watermark configuration based on image size
 * @param imageWidth - Image width
 * @param imageHeight - Image height
 * @returns Watermark configuration {logoSize, marginRight, marginBottom}
 */
export function detectWatermarkConfig(imageWidth: number, imageHeight: number): WatermarkConfig {
  if (imageWidth > LEGACY_LARGE_IMAGE_MIN_EDGE && imageHeight > LEGACY_LARGE_IMAGE_MIN_EDGE) {
    return { ...LEGACY_96_WATERMARK_CONFIG };
  }

  return { ...LEGACY_48_WATERMARK_CONFIG };
}

export function getWatermarkConfigOptions(
  imageWidth: number,
  imageHeight: number,
): WatermarkConfig[] {
  const baseConfig = detectWatermarkConfig(imageWidth, imageHeight);
  const movedConfig = createMovedAnchorConfig(baseConfig, imageWidth, imageHeight);

  if (!movedConfig || areSameWatermarkConfig(baseConfig, movedConfig)) {
    return [baseConfig];
  }

  return [baseConfig, movedConfig];
}

/**
 * Calculate watermark position in image based on image size and watermark configuration
 * @param imageWidth - Image width
 * @param imageHeight - Image height
 * @param config - Watermark configuration {logoSize, marginRight, marginBottom}
 * @returns Watermark position {x, y, width, height}
 */
export function calculateWatermarkPosition(
  imageWidth: number,
  imageHeight: number,
  config: WatermarkConfig,
): WatermarkPosition {
  const { logoSize, marginRight, marginBottom } = config;

  return {
    x: imageWidth - marginRight - logoSize,
    y: imageHeight - marginBottom - logoSize,
    width: logoSize,
    height: logoSize,
  };
}

function calculateLuminance(data: Uint8ClampedArray, index: number): number {
  return data[index] * 0.2126 + data[index + 1] * 0.7152 + data[index + 2] * 0.0722;
}

function measureWatermarkEvidenceDetails(
  imageData: ImageData,
  alphaMap: Float32Array,
  position: WatermarkPosition,
): WatermarkEvidence {
  let count = 0;
  let alphaSum = 0;
  let luminanceSum = 0;
  let alphaSquaredSum = 0;
  let luminanceSquaredSum = 0;
  let alphaLuminanceSum = 0;
  let highAlphaLuminanceSum = 0;
  let highAlphaCount = 0;
  let lowAlphaLuminanceSum = 0;
  let lowAlphaCount = 0;

  const { data, width: imageWidth, height: imageHeight } = imageData;
  const { x, y, width, height } = position;

  for (let row = 0; row < height; row++) {
    const pixelY = y + row;
    if (pixelY < 0 || pixelY >= imageHeight) continue;

    for (let col = 0; col < width; col++) {
      const alpha = alphaMap[row * width + col] ?? 0;
      if (alpha < WATERMARK_ALPHA_MIN) continue;

      const pixelX = x + col;
      if (pixelX < 0 || pixelX >= imageWidth) continue;

      const imageIndex = (pixelY * imageWidth + pixelX) * 4;
      const luminance = calculateLuminance(data, imageIndex);

      count++;
      alphaSum += alpha;
      luminanceSum += luminance;
      alphaSquaredSum += alpha * alpha;
      luminanceSquaredSum += luminance * luminance;
      alphaLuminanceSum += alpha * luminance;

      if (alpha > WATERMARK_ALPHA_HIGH) {
        highAlphaLuminanceSum += luminance;
        highAlphaCount++;
      } else if (alpha < WATERMARK_ALPHA_LOW) {
        lowAlphaLuminanceSum += luminance;
        lowAlphaCount++;
      }
    }
  }

  if (count === 0) {
    return { score: Number.NEGATIVE_INFINITY, luminanceDelta: Number.NEGATIVE_INFINITY };
  }

  const alphaMean = alphaSum / count;
  const luminanceMean = luminanceSum / count;
  const covariance = alphaLuminanceSum / count - alphaMean * luminanceMean;
  const alphaVariance = alphaSquaredSum / count - alphaMean * alphaMean;
  const luminanceVariance = luminanceSquaredSum / count - luminanceMean * luminanceMean;
  const correlation =
    covariance / (Math.sqrt(Math.max(alphaVariance, 0) * Math.max(luminanceVariance, 0)) + 1e-9);
  const luminanceDelta =
    highAlphaCount > 0 && lowAlphaCount > 0
      ? highAlphaLuminanceSum / highAlphaCount - lowAlphaLuminanceSum / lowAlphaCount
      : 0;

  return {
    score: correlation * 100 + luminanceDelta,
    luminanceDelta,
  };
}

function measureWatermarkEvidence(
  imageData: ImageData,
  alphaMap: Float32Array,
  position: WatermarkPosition,
): number {
  return measureWatermarkEvidenceDetails(imageData, alphaMap, position).score;
}

export function chooseWatermarkAnchorOption(
  imageData: ImageData,
  options: WatermarkAnchorOption[],
): WatermarkAnchorOption {
  if (options.length <= 1) {
    return options[0];
  }

  const baseOption = options[0];
  const basePosition = calculateWatermarkPosition(
    imageData.width,
    imageData.height,
    baseOption.config,
  );
  const baseEvidence = measureWatermarkEvidence(imageData, baseOption.alphaMap, basePosition);

  let strongestOption = baseOption;
  let strongestEvidence = baseEvidence;

  for (const option of options.slice(1)) {
    const position = calculateWatermarkPosition(imageData.width, imageData.height, option.config);
    const evidence = measureWatermarkEvidence(imageData, option.alphaMap, position);
    if (evidence > strongestEvidence) {
      strongestOption = option;
      strongestEvidence = evidence;
    }
  }

  return strongestEvidence - baseEvidence >= WATERMARK_ANCHOR_SWITCH_EVIDENCE_GAP
    ? strongestOption
    : baseOption;
}

export function removeWatermarkWithResidualCheck(
  imageData: ImageData,
  alphaMap: Float32Array,
  position: WatermarkPosition,
): number {
  let passes = 0;

  while (passes < WATERMARK_MAX_REMOVAL_PASSES) {
    if (passes > 0) {
      const residualEvidence = measureWatermarkEvidenceDetails(imageData, alphaMap, position);
      if (
        residualEvidence.score < WATERMARK_REPEAT_EVIDENCE_MIN ||
        residualEvidence.luminanceDelta < WATERMARK_REPEAT_LUMINANCE_DELTA_MIN
      ) {
        break;
      }
    }

    removeWatermark(imageData, alphaMap, position);
    passes++;
  }

  return passes;
}

interface BgCaptures {
  bg48: HTMLImageElement;
  bg96: HTMLImageElement;
  bg96_20260520: HTMLImageElement;
}

/**
 * Watermark engine class
 * Coordinates watermark detection, alpha map calculation, and removal operations
 */
export class WatermarkEngine {
  private bgCaptures: BgCaptures;
  private alphaMaps: Partial<Record<WatermarkAlphaMapKey, Float32Array>>;

  constructor(bgCaptures: BgCaptures) {
    this.bgCaptures = bgCaptures;
    this.alphaMaps = {};
  }

  static async create(): Promise<WatermarkEngine> {
    const bg48 = new Image();
    const bg96 = new Image();
    const bg96_20260520 = new Image();

    const bg48Path = getBgPath(BG_48_IMPORT);
    const bg96Path = getBgPath(BG_96_IMPORT);
    const bg96_20260520Path = getBgPath(BG_96_20260520_IMPORT);

    console.log('[Gemini Voyager] Loading watermark assets:', {
      bg48Path,
      bg96Path,
      bg96_20260520Path,
    });

    await Promise.all([
      new Promise<void>((resolve, reject) => {
        bg48.onload = () => resolve();
        bg48.onerror = (e) =>
          reject(
            new Error(
              `Failed to load bg_48.png from ${bg48Path}: ${e instanceof Event ? 'Image load error' : e}`,
            ),
          );
        // Set crossOrigin before src to prevent canvas tainting in Firefox
        bg48.crossOrigin = 'anonymous';
        bg48.src = bg48Path;
      }),
      new Promise<void>((resolve, reject) => {
        bg96.onload = () => resolve();
        bg96.onerror = (e) =>
          reject(
            new Error(
              `Failed to load bg_96.png from ${bg96Path}: ${e instanceof Event ? 'Image load error' : e}`,
            ),
          );
        // Set crossOrigin before src to prevent canvas tainting in Firefox
        bg96.crossOrigin = 'anonymous';
        bg96.src = bg96Path;
      }),
      new Promise<void>((resolve, reject) => {
        bg96_20260520.onload = () => resolve();
        bg96_20260520.onerror = (e) =>
          reject(
            new Error(
              `Failed to load bg_96_20260520.png from ${bg96_20260520Path}: ${e instanceof Event ? 'Image load error' : e}`,
            ),
          );
        bg96_20260520.crossOrigin = 'anonymous';
        bg96_20260520.src = bg96_20260520Path;
      }),
    ]);

    return new WatermarkEngine({ bg48, bg96, bg96_20260520 });
  }

  /**
   * Get alpha map from background captured image based on watermark size/variant
   * @param size - Watermark size key
   * @returns Alpha map
   */
  async getAlphaMap(size: WatermarkAlphaMapKey): Promise<Float32Array> {
    // If cached, return directly
    if (this.alphaMaps[size]) {
      return this.alphaMaps[size];
    }

    // Select corresponding background capture based on watermark size
    const isVariant = typeof size === 'string';
    const logoSize = (isVariant ? Number(size.split('-')[0]) : size) as WatermarkLogoSize;
    const bgImage = isVariant
      ? this.bgCaptures.bg96_20260520
      : logoSize === 48
        ? this.bgCaptures.bg48
        : this.bgCaptures.bg96;

    // Create temporary canvas to extract ImageData
    const canvas = document.createElement('canvas');
    canvas.width = logoSize;
    canvas.height = logoSize;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      throw new Error('Failed to get canvas 2d context');
    }
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(bgImage, 0, 0, logoSize, logoSize);

    const imageData = ctx.getImageData(0, 0, logoSize, logoSize);

    // Calculate alpha map
    const alphaMap = calculateAlphaMap(imageData);

    // Cache result
    this.alphaMaps[size] = alphaMap;

    return alphaMap;
  }

  private getAlphaMapKey(config: WatermarkConfig): WatermarkAlphaMapKey {
    const logoSize = config.logoSize === 48 ? 48 : 96;
    if (config.alphaVariant === '20260520') return `${logoSize}-20260520`;
    return logoSize;
  }

  /**
   * Remove watermark from image based on watermark size
   * @param image - Input image
   * @returns Processed canvas
   */
  async removeWatermarkFromImage(
    image: HTMLImageElement | HTMLCanvasElement,
  ): Promise<HTMLCanvasElement> {
    // Create canvas to process image
    const canvas = document.createElement('canvas');
    canvas.width = image.width;
    canvas.height = image.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      throw new Error('Failed to get canvas 2d context');
    }

    // Draw original image onto canvas
    ctx.drawImage(image, 0, 0);

    // Get image data
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);

    const anchorOptions = await Promise.all(
      getWatermarkConfigOptions(canvas.width, canvas.height).map(async (config) => ({
        config,
        alphaMap: await this.getAlphaMap(this.getAlphaMapKey(config)),
      })),
    );
    const { config, alphaMap } = chooseWatermarkAnchorOption(imageData, anchorOptions);
    const position = calculateWatermarkPosition(canvas.width, canvas.height, config);

    // Remove watermark from image data. Gemini can stack multiple transparent
    // marks after iterative image edits, so repeat only while the known alpha
    // pattern is still clearly present at the selected anchor.
    removeWatermarkWithResidualCheck(imageData, alphaMap, position);

    // Write processed image data back to canvas
    ctx.putImageData(imageData, 0, 0);

    return canvas;
  }

  /**
   * Get watermark information (for display)
   * @param imageWidth - Image width
   * @param imageHeight - Image height
   * @returns Watermark information {size, position, config}
   */
  getWatermarkInfo(imageWidth: number, imageHeight: number): WatermarkInfo {
    const config = detectWatermarkConfig(imageWidth, imageHeight);
    const position = calculateWatermarkPosition(imageWidth, imageHeight, config);

    return {
      size: config.logoSize,
      position: position,
      config: config,
    };
  }
}
