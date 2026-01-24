/**
 * Watermark Engine Main Module
 *
 * This module is ported from gemini-watermark-remover by journey-ad (Jad).
 * Original: https://github.com/journey-ad/gemini-watermark-remover/blob/main/src/core/watermarkEngine.js
 * License: MIT - Copyright (c) 2025 Jad
 *
 * Coordinates watermark detection, alpha map calculation, and removal operations.
 */
import { calculateAlphaMap } from './alphaMap';
// Import watermark background capture images - Vite will bundle these
import BG_48_IMPORT from './assets/bg_48.png';
import BG_96_IMPORT from './assets/bg_96.png';
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
}

export interface WatermarkInfo {
  size: number;
  position: WatermarkPosition;
  config: WatermarkConfig;
}

/**
 * Detect watermark configuration based on image size
 * @param imageWidth - Image width
 * @param imageHeight - Image height
 * @returns Watermark configuration {logoSize, marginRight, marginBottom}
 */
export function detectWatermarkConfig(imageWidth: number, imageHeight: number): WatermarkConfig {
  // Gemini's watermark rules:
  // If both image width and height are greater than 1024, use 96×96 watermark
  // Otherwise, use 48×48 watermark
  if (imageWidth > 1024 && imageHeight > 1024) {
    return {
      logoSize: 96,
      marginRight: 64,
      marginBottom: 64,
    };
  } else {
    return {
      logoSize: 48,
      marginRight: 32,
      marginBottom: 32,
    };
  }
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

interface BgCaptures {
  bg48: HTMLImageElement;
  bg96: HTMLImageElement;
}

/**
 * Watermark engine class
 * Coordinates watermark detection, alpha map calculation, and removal operations
 */
export class WatermarkEngine {
  private bgCaptures: BgCaptures;
  private alphaMaps: Record<number, Float32Array>;

  constructor(bgCaptures: BgCaptures) {
    this.bgCaptures = bgCaptures;
    this.alphaMaps = {};
  }

  static async create(): Promise<WatermarkEngine> {
    const bg48 = new Image();
    const bg96 = new Image();

    const bg48Path = getBgPath(BG_48_IMPORT);
    const bg96Path = getBgPath(BG_96_IMPORT);

    console.log('[Gemini Voyager] Loading watermark assets:', { bg48Path, bg96Path });

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
    ]);

    return new WatermarkEngine({ bg48, bg96 });
  }

  /**
   * Get alpha map from background captured image based on watermark size
   * @param size - Watermark size (48 or 96)
   * @returns Alpha map
   */
  async getAlphaMap(size: number): Promise<Float32Array> {
    // If cached, return directly
    if (this.alphaMaps[size]) {
      return this.alphaMaps[size];
    }

    // Select corresponding background capture based on watermark size
    const bgImage = size === 48 ? this.bgCaptures.bg48 : this.bgCaptures.bg96;

    // Create temporary canvas to extract ImageData
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      throw new Error('Failed to get canvas 2d context');
    }
    ctx.drawImage(bgImage, 0, 0);

    const imageData = ctx.getImageData(0, 0, size, size);

    // Calculate alpha map
    const alphaMap = calculateAlphaMap(imageData);

    // Cache result
    this.alphaMaps[size] = alphaMap;

    return alphaMap;
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

    // Detect watermark configuration
    const config = detectWatermarkConfig(canvas.width, canvas.height);
    const position = calculateWatermarkPosition(canvas.width, canvas.height, config);

    // Get alpha map for watermark size
    const alphaMap = await this.getAlphaMap(config.logoSize);

    // Remove watermark from image data
    removeWatermark(imageData, alphaMap, position);

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
