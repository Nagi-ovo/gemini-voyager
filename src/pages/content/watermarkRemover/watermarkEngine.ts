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
import {
  assessWatermarkRemovalCandidate,
  getWatermarkSignalStrength,
  hasReliableWatermarkSignal,
  measureWatermarkSignal,
} from './watermarkDetector';

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
const WATERMARK_MAX_REMOVAL_PASSES = 3;

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
  const baseSignal = measureWatermarkSignal(imageData, baseOption.alphaMap, basePosition);

  let strongestOption = baseOption;
  let strongestSignal = baseSignal;

  for (const option of options.slice(1)) {
    const position = calculateWatermarkPosition(imageData.width, imageData.height, option.config);
    const signal = measureWatermarkSignal(imageData, option.alphaMap, position);
    if (getWatermarkSignalStrength(signal) > getWatermarkSignalStrength(strongestSignal)) {
      strongestOption = option;
      strongestSignal = signal;
    }
  }

  return hasReliableWatermarkSignal(strongestSignal) ? strongestOption : baseOption;
}

export function removeWatermarkWithResidualCheck(
  imageData: ImageData,
  alphaMap: Float32Array,
  position: WatermarkPosition,
): number {
  let passes = 0;

  while (passes < WATERMARK_MAX_REMOVAL_PASSES) {
    const originalSignal = measureWatermarkSignal(imageData, alphaMap, position);
    if (!hasReliableWatermarkSignal(originalSignal)) break;

    const candidateImageData = {
      data: new Uint8ClampedArray(imageData.data),
      width: imageData.width,
      height: imageData.height,
    } as ImageData;
    removeWatermark(candidateImageData, alphaMap, position);
    const assessment = assessWatermarkRemovalCandidate(
      imageData,
      candidateImageData,
      alphaMap,
      position,
      originalSignal,
    );
    if (!assessment.safe) break;

    imageData.data.set(candidateImageData.data);
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
