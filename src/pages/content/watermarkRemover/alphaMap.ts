/**
 * Alpha Map Calculator
 *
 * This module is ported from gemini-watermark-remover by journey-ad (Jad).
 * Original: https://github.com/journey-ad/gemini-watermark-remover/blob/main/src/core/alphaMap.js
 * License: MIT - Copyright (c) 2025 Jad
 *
 * Calculates alpha map from captured background watermark images.
 */

/**
 * Calculate alpha map from background captured image
 * @param bgCaptureImageData - ImageData object for background capture
 * @returns Float32Array containing alpha values (0.0-1.0)
 */
export function calculateAlphaMap(bgCaptureImageData: ImageData): Float32Array {
  const { width, height, data } = bgCaptureImageData;
  const alphaMap = new Float32Array(width * height);

  // For each pixel, take the maximum value of the three RGB channels and normalize it to [0, 1]
  for (let i = 0; i < alphaMap.length; i++) {
    const idx = i * 4; // RGBA format, 4 bytes per pixel
    const r = data[idx];
    const g = data[idx + 1];
    const b = data[idx + 2];

    // Take the maximum value of the three RGB channels as the brightness value
    const maxChannel = Math.max(r, g, b);

    // Normalize to [0, 1] range
    alphaMap[i] = maxChannel / 255.0;
  }

  return alphaMap;
}
