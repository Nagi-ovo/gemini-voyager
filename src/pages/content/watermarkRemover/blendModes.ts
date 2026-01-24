/**
 * Reverse Alpha Blending Module
 *
 * This module is ported from gemini-watermark-remover by journey-ad (Jad).
 * Original: https://github.com/journey-ad/gemini-watermark-remover/blob/main/src/core/blendModes.js
 * License: MIT - Copyright (c) 2025 Jad
 *
 * Core algorithm for removing watermarks using reverse alpha blending.
 */

// Constants definition
const ALPHA_THRESHOLD = 0.002; // Ignore very small alpha values (noise)
const MAX_ALPHA = 0.99; // Avoid division by near-zero values
const LOGO_VALUE = 255; // Color value for white watermark

export interface WatermarkPosition {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Remove watermark using reverse alpha blending
 *
 * Principle:
 * Gemini adds watermark: watermarked = α × logo + (1 - α) × original
 * Reverse solve: original = (watermarked - α × logo) / (1 - α)
 *
 * @param imageData - Image data to process (will be modified in place)
 * @param alphaMap - Alpha channel data
 * @param position - Watermark position {x, y, width, height}
 */
export function removeWatermark(
  imageData: ImageData,
  alphaMap: Float32Array,
  position: WatermarkPosition,
): void {
  const { x, y, width, height } = position;

  // Process each pixel in the watermark area
  for (let row = 0; row < height; row++) {
    for (let col = 0; col < width; col++) {
      // Calculate index in original image (RGBA format, 4 bytes per pixel)
      const imgIdx = ((y + row) * imageData.width + (x + col)) * 4;

      // Calculate index in alpha map
      const alphaIdx = row * width + col;

      // Get alpha value
      let alpha = alphaMap[alphaIdx];

      // Skip very small alpha values (noise)
      if (alpha < ALPHA_THRESHOLD) {
        continue;
      }

      // Limit alpha value to avoid division by near-zero
      alpha = Math.min(alpha, MAX_ALPHA);
      const oneMinusAlpha = 1.0 - alpha;

      // Apply reverse alpha blending to each RGB channel
      for (let c = 0; c < 3; c++) {
        const watermarked = imageData.data[imgIdx + c];

        // Reverse alpha blending formula
        const original = (watermarked - alpha * LOGO_VALUE) / oneMinusAlpha;

        // Clip to [0, 255] range
        imageData.data[imgIdx + c] = Math.max(0, Math.min(255, Math.round(original)));
      }

      // Alpha channel remains unchanged
      // imageData.data[imgIdx + 3] does not need modification
    }
  }
}
