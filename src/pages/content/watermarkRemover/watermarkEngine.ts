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
import { logger } from '@/core/services/LoggerService';

import { calculateAlphaMap, downsampleAlphaMapWithAreaAverage } from './alphaMap';
import BG_36_20260520_IMPORT from './assets/bg_36_20260520.png';
// Import watermark background capture images - Vite will bundle these
import BG_48_IMPORT from './assets/bg_48.png';
import BG_96_IMPORT from './assets/bg_96.png';
import BG_96_20260520_IMPORT from './assets/bg_96_20260520.png';
import type { WatermarkPosition } from './blendModes';
import {
  type WatermarkAlphaVariant,
  type WatermarkConfig,
  calculateWatermarkPosition,
  removeWatermarkFromAnchorOptions,
} from './watermarkPixels';

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

export interface WatermarkInfo {
  size: number;
  position: WatermarkPosition;
  config: WatermarkConfig;
}

/**
 * What the anchor scan concluded about the image it was handed.
 *   reliable  — a watermark cleared the trusted thresholds and was removed
 *   difficult — no anchor was trusted, but a weak candidate was suppressed
 *   none      — nothing watermark-shaped was found, so the pixels are untouched
 *
 * 'none' is what tells us Gemini's own "Media watermark: Off" switch is doing
 * the work for this account, which the native-watermark notice reports back.
 */
export type WatermarkPresence = ReturnType<typeof removeWatermarkFromAnchorOptions>;

type WatermarkLogoSize = 36 | 48 | 96;
type WatermarkAlphaMapKey = WatermarkLogoSize | `${WatermarkLogoSize}-${WatermarkAlphaVariant}`;
const LEGACY_LARGE_IMAGE_MIN_EDGE = 1024;

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

const V2_LARGE_WATERMARK_CONFIG: WatermarkConfig = {
  logoSize: 96,
  marginRight: 192,
  marginBottom: 192,
  alphaVariant: '20260520',
};

const V2_DOWNSCALED_LARGE_WATERMARK_CONFIG: WatermarkConfig = {
  logoSize: 48,
  marginRight: 96,
  marginBottom: 96,
  alphaVariant: '20260520',
};

const areSameWatermarkConfig = (a: WatermarkConfig, b: WatermarkConfig): boolean =>
  a.logoSize === b.logoSize &&
  a.marginRight === b.marginRight &&
  a.marginBottom === b.marginBottom &&
  a.alphaVariant === b.alphaVariant;

function createV2SmallWatermarkConfig(imageWidth: number, imageHeight: number): WatermarkConfig {
  const longSide = Math.max(imageWidth, imageHeight);
  const shortSide = Math.min(imageWidth, imageHeight);
  const sourceLongDimension = shortSide >= 566 ? 2752 : shortSide >= 550 ? 2816 : 2848;
  const margin = Math.round((192 * longSide) / sourceLongDimension);

  return {
    logoSize: 36,
    marginRight: margin,
    marginBottom: margin,
    alphaVariant: '20260520-small',
  };
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
  const legacyConfig = detectWatermarkConfig(imageWidth, imageHeight);
  const isLarge =
    imageWidth > LEGACY_LARGE_IMAGE_MIN_EDGE && imageHeight > LEGACY_LARGE_IMAGE_MIN_EDGE;
  // Full-size downloads can still carry the downscaled 48px V2 watermark.
  const currentConfigs = isLarge
    ? [V2_LARGE_WATERMARK_CONFIG, V2_DOWNSCALED_LARGE_WATERMARK_CONFIG]
    : [createV2SmallWatermarkConfig(imageWidth, imageHeight), V2_DOWNSCALED_LARGE_WATERMARK_CONFIG];

  return [legacyConfig, ...currentConfigs].filter(
    (config, index, configs) =>
      calculateWatermarkPosition(imageWidth, imageHeight, config).x >= 0 &&
      calculateWatermarkPosition(imageWidth, imageHeight, config).y >= 0 &&
      configs.findIndex((candidate) => areSameWatermarkConfig(candidate, config)) === index,
  );
}

interface BgCaptures {
  bg36_20260520: HTMLImageElement;
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
    const bg36_20260520 = new Image();
    const bg96_20260520 = new Image();

    const bg48Path = getBgPath(BG_48_IMPORT);
    const bg96Path = getBgPath(BG_96_IMPORT);
    const bg36_20260520Path = getBgPath(BG_36_20260520_IMPORT);
    const bg96_20260520Path = getBgPath(BG_96_20260520_IMPORT);

    logger.info('[Gemini Voyager] Loading watermark assets:', {
      bg48Path,
      bg96Path,
      bg36_20260520Path,
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
        bg36_20260520.onload = () => resolve();
        bg36_20260520.onerror = (e) =>
          reject(
            new Error(
              `Failed to load bg_36_20260520.png from ${bg36_20260520Path}: ${e instanceof Event ? 'Image load error' : e}`,
            ),
          );
        bg36_20260520.crossOrigin = 'anonymous';
        bg36_20260520.src = bg36_20260520Path;
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

    return new WatermarkEngine({ bg36_20260520, bg48, bg96, bg96_20260520 });
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
    const bgImage =
      size === '36-20260520-small'
        ? this.bgCaptures.bg36_20260520
        : isVariant
          ? this.bgCaptures.bg96_20260520
          : logoSize === 48
            ? this.bgCaptures.bg48
            : this.bgCaptures.bg96;

    // The current 48px profile is derived from the native 96px V2 capture. Reading
    // the capture at 48px delegates interpolation to Canvas, whose filters do not
    // match the upstream INTER_AREA profile and can leave a visible star outline.
    const shouldAreaDownsampleV2 = size === '48-20260520';
    const captureSize = shouldAreaDownsampleV2 ? V2_LARGE_WATERMARK_CONFIG.logoSize : logoSize;

    // Create temporary canvas to extract ImageData
    const canvas = document.createElement('canvas');
    canvas.width = captureSize;
    canvas.height = captureSize;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      throw new Error('Failed to get canvas 2d context');
    }
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(bgImage, 0, 0, captureSize, captureSize);

    const imageData = ctx.getImageData(0, 0, captureSize, captureSize);

    // Calculate alpha map
    const sourceAlphaMap = calculateAlphaMap(imageData);
    const alphaMap = shouldAreaDownsampleV2
      ? downsampleAlphaMapWithAreaAverage(
          sourceAlphaMap,
          captureSize,
          captureSize,
          logoSize,
          logoSize,
        )
      : sourceAlphaMap;

    // Cache result
    this.alphaMaps[size] = alphaMap;

    return alphaMap;
  }

  private getAlphaMapKey(config: WatermarkConfig): WatermarkAlphaMapKey {
    const logoSize = config.logoSize === 36 ? 36 : config.logoSize === 48 ? 48 : 96;
    if (config.alphaVariant === '20260520-small') return '36-20260520-small';
    if (config.alphaVariant === '20260520') return `${logoSize}-20260520`;
    return logoSize;
  }

  /**
   * Remove watermark from image based on watermark size
   * @param image - Input image
   * @param onPresence - Optional observer for what the anchor scan concluded.
   *   Passed as a callback rather than folded into the return value so every
   *   existing caller keeps working unchanged.
   * @returns Processed canvas
   */
  async removeWatermarkFromImage(
    image: HTMLImageElement | HTMLCanvasElement,
    onPresence?: (presence: WatermarkPresence) => void,
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
    const presence = removeWatermarkFromAnchorOptions(imageData, anchorOptions);
    try {
      onPresence?.(presence);
    } catch {
      // Observation is bookkeeping only — never let it break image processing.
    }

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
