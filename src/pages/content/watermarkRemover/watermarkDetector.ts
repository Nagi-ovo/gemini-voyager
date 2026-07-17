/**
 * Conservative watermark-presence detection and removal validation.
 *
 * The detector ports the useful signal checks from GeminiWatermarkTool's C++
 * implementation and the upstream userscript to TypeScript: luminance NCC,
 * Sobel-gradient NCC, and a counterfactual damage check before pixels are
 * committed to the output image.
 * License: MIT - Copyright (c) 2025 Jad; Copyright (c) 2024 AllenK (Kwyshell)
 * Full retained notice: see /THIRD_PARTY_NOTICES.md
 */
import type { WatermarkPosition } from './blendModes';

const EPSILON = 1e-9;
const DIRECT_MATCH_MIN_SPATIAL_SCORE = 0.3;
const DIRECT_MATCH_MIN_GRADIENT_SCORE = 0.12;
const STRONG_GRADIENT_MIN_SPATIAL_SCORE = 0.295;
const STRONG_GRADIENT_MIN_GRADIENT_SCORE = 0.45;
const MAX_RESIDUAL_SPATIAL_SCORE = 0.2;
const MAX_RESIDUAL_GRADIENT_SCORE = 0.12;
const MIN_SUPPRESSION_GAIN = 0.25;
const NEAR_BLACK_THRESHOLD = 5;
const MAX_NEAR_BLACK_INCREASE = 0.05;
const CLIP_ORIGINAL_THRESHOLD = 5;
const CLIP_CANDIDATE_THRESHOLD = 0;
const MAX_NEWLY_CLIPPED_RATIO = 0.03;
const TEXTURE_REFERENCE_MARGIN = 1;
const TEXTURE_STD_FLOOR_RATIO = 0.8;
const DARKNESS_VISIBILITY_HARD_REJECT_THRESHOLD = 1.5;
const DARKNESS_HARD_REJECT_PENALTY_THRESHOLD = 0.5;
const FLATNESS_HARD_REJECT_PENALTY_THRESHOLD = 0.2;

export interface WatermarkSignal {
  spatialScore: number;
  gradientScore: number;
}

export interface WatermarkRemovalAssessment {
  safe: boolean;
  originalSignal: WatermarkSignal;
  candidateSignal: WatermarkSignal;
  suppressionGain: number;
  nearBlackIncrease: number;
  newlyClippedRatio: number;
  visibleDarkHole: boolean;
}

interface TextureStats {
  meanLuminance: number;
  standardDeviation: number;
}

function calculateLuminance(data: Uint8ClampedArray, index: number): number {
  return data[index] * 0.2126 + data[index + 1] * 0.7152 + data[index + 2] * 0.0722;
}

function isRegionInBounds(imageData: ImageData, position: WatermarkPosition): boolean {
  return (
    position.width > 0 &&
    position.height > 0 &&
    position.x >= 0 &&
    position.y >= 0 &&
    position.x + position.width <= imageData.width &&
    position.y + position.height <= imageData.height
  );
}

function extractLuminanceRegion(
  imageData: ImageData,
  position: WatermarkPosition,
): Float32Array | null {
  if (!isRegionInBounds(imageData, position)) return null;

  const values = new Float32Array(position.width * position.height);
  for (let row = 0; row < position.height; row++) {
    for (let col = 0; col < position.width; col++) {
      const imageIndex = ((position.y + row) * imageData.width + position.x + col) * 4;
      values[row * position.width + col] = calculateLuminance(imageData.data, imageIndex) / 255;
    }
  }
  return values;
}

function normalizedCrossCorrelation(a: Float32Array, b: Float32Array): number {
  if (a.length === 0 || a.length !== b.length) return 0;

  let sumA = 0;
  let sumB = 0;
  for (let i = 0; i < a.length; i++) {
    sumA += a[i];
    sumB += b[i];
  }

  const meanA = sumA / a.length;
  const meanB = sumB / b.length;
  let covariance = 0;
  let varianceA = 0;
  let varianceB = 0;

  for (let i = 0; i < a.length; i++) {
    const centeredA = a[i] - meanA;
    const centeredB = b[i] - meanB;
    covariance += centeredA * centeredB;
    varianceA += centeredA * centeredA;
    varianceB += centeredB * centeredB;
  }

  const denominator = Math.sqrt(varianceA * varianceB);
  return denominator <= EPSILON ? 0 : covariance / denominator;
}

function sobelMagnitude(values: Float32Array, width: number, height: number): Float32Array {
  const gradient = new Float32Array(values.length);

  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const index = y * width + x;
      const gradientX =
        -values[index - width - 1] -
        2 * values[index - 1] -
        values[index + width - 1] +
        values[index - width + 1] +
        2 * values[index + 1] +
        values[index + width + 1];
      const gradientY =
        -values[index - width - 1] -
        2 * values[index - width] -
        values[index - width + 1] +
        values[index + width - 1] +
        2 * values[index + width] +
        values[index + width + 1];
      gradient[index] = Math.hypot(gradientX, gradientY);
    }
  }

  return gradient;
}

export function measureWatermarkSignal(
  imageData: ImageData,
  alphaMap: Float32Array,
  position: WatermarkPosition,
): WatermarkSignal {
  const luminance = extractLuminanceRegion(imageData, position);
  if (!luminance || alphaMap.length !== position.width * position.height) {
    return { spatialScore: 0, gradientScore: 0 };
  }

  return {
    spatialScore: normalizedCrossCorrelation(luminance, alphaMap),
    gradientScore: normalizedCrossCorrelation(
      sobelMagnitude(luminance, position.width, position.height),
      sobelMagnitude(alphaMap, position.width, position.height),
    ),
  };
}

export function hasReliableWatermarkSignal(signal: WatermarkSignal): boolean {
  return (
    (signal.spatialScore >= DIRECT_MATCH_MIN_SPATIAL_SCORE &&
      signal.gradientScore >= DIRECT_MATCH_MIN_GRADIENT_SCORE) ||
    (signal.spatialScore >= STRONG_GRADIENT_MIN_SPATIAL_SCORE &&
      signal.gradientScore >= STRONG_GRADIENT_MIN_GRADIENT_SCORE)
  );
}

export function getWatermarkSignalStrength(signal: WatermarkSignal): number {
  return Math.max(0, signal.spatialScore) * 0.5 + Math.max(0, signal.gradientScore) * 0.3;
}

function calculateTextureStats(
  imageData: ImageData,
  position: WatermarkPosition,
): TextureStats | null {
  const luminance = extractLuminanceRegion(imageData, position);
  if (!luminance) return null;

  let sum = 0;
  let squaredSum = 0;
  for (const value of luminance) {
    const byteValue = value * 255;
    sum += byteValue;
    squaredSum += byteValue * byteValue;
  }

  const meanLuminance = sum / luminance.length;
  return {
    meanLuminance,
    standardDeviation: Math.sqrt(
      Math.max(0, squaredSum / luminance.length - meanLuminance * meanLuminance),
    ),
  };
}

function createsVisibleDarkHole(
  originalImageData: ImageData,
  candidateImageData: ImageData,
  position: WatermarkPosition,
): boolean {
  const referencePosition = {
    ...position,
    y: position.y - position.height,
  };
  const reference = calculateTextureStats(originalImageData, referencePosition);
  const candidate = calculateTextureStats(candidateImageData, position);
  if (!reference || !candidate) return false;

  const luminanceDeficit = Math.max(
    0,
    reference.meanLuminance - candidate.meanLuminance - TEXTURE_REFERENCE_MARGIN,
  );
  const darknessPenalty = luminanceDeficit / Math.max(1, reference.meanLuminance);
  const flatnessPenalty =
    Math.max(
      0,
      reference.standardDeviation * TEXTURE_STD_FLOOR_RATIO - candidate.standardDeviation,
    ) / Math.max(1, reference.standardDeviation);
  const darknessVisibility = luminanceDeficit / Math.max(1, reference.standardDeviation);

  return (
    darknessVisibility >= DARKNESS_VISIBILITY_HARD_REJECT_THRESHOLD ||
    (darknessPenalty >= DARKNESS_HARD_REJECT_PENALTY_THRESHOLD &&
      flatnessPenalty >= FLATNESS_HARD_REJECT_PENALTY_THRESHOLD)
  );
}

export function assessWatermarkRemovalCandidate(
  originalImageData: ImageData,
  candidateImageData: ImageData,
  alphaMap: Float32Array,
  position: WatermarkPosition,
  originalSignal = measureWatermarkSignal(originalImageData, alphaMap, position),
): WatermarkRemovalAssessment {
  const candidateSignal = measureWatermarkSignal(candidateImageData, alphaMap, position);
  const totalPixels = position.width * position.height;
  let originalNearBlack = 0;
  let candidateNearBlack = 0;
  let newlyClipped = 0;

  if (
    isRegionInBounds(originalImageData, position) &&
    isRegionInBounds(candidateImageData, position)
  ) {
    for (let row = 0; row < position.height; row++) {
      for (let col = 0; col < position.width; col++) {
        const index = ((position.y + row) * originalImageData.width + position.x + col) * 4;
        const originalBlack =
          originalImageData.data[index] <= NEAR_BLACK_THRESHOLD &&
          originalImageData.data[index + 1] <= NEAR_BLACK_THRESHOLD &&
          originalImageData.data[index + 2] <= NEAR_BLACK_THRESHOLD;
        const candidateBlack =
          candidateImageData.data[index] <= NEAR_BLACK_THRESHOLD &&
          candidateImageData.data[index + 1] <= NEAR_BLACK_THRESHOLD &&
          candidateImageData.data[index + 2] <= NEAR_BLACK_THRESHOLD;

        if (originalBlack) originalNearBlack++;
        if (candidateBlack) candidateNearBlack++;

        const newlyClippedPixel =
          (candidateImageData.data[index] <= CLIP_CANDIDATE_THRESHOLD &&
            originalImageData.data[index] > CLIP_ORIGINAL_THRESHOLD) ||
          (candidateImageData.data[index + 1] <= CLIP_CANDIDATE_THRESHOLD &&
            originalImageData.data[index + 1] > CLIP_ORIGINAL_THRESHOLD) ||
          (candidateImageData.data[index + 2] <= CLIP_CANDIDATE_THRESHOLD &&
            originalImageData.data[index + 2] > CLIP_ORIGINAL_THRESHOLD);
        if (newlyClippedPixel) {
          newlyClipped++;
        }
      }
    }
  }

  const suppressionGain = originalSignal.spatialScore - Math.abs(candidateSignal.spatialScore);
  const ratioDenominator = Math.max(1, totalPixels);
  const nearBlackIncrease = Math.max(0, candidateNearBlack - originalNearBlack) / ratioDenominator;
  const newlyClippedRatio = newlyClipped / ratioDenominator;
  const visibleDarkHole = createsVisibleDarkHole(originalImageData, candidateImageData, position);
  const residualStillReliable = hasReliableWatermarkSignal(candidateSignal);
  const residualCleared =
    Math.abs(candidateSignal.spatialScore) <= MAX_RESIDUAL_SPATIAL_SCORE &&
    candidateSignal.gradientScore <= MAX_RESIDUAL_GRADIENT_SCORE;
  const evidenceSafe =
    residualStillReliable || (suppressionGain >= MIN_SUPPRESSION_GAIN && residualCleared);
  const damageSafe =
    nearBlackIncrease <= MAX_NEAR_BLACK_INCREASE &&
    newlyClippedRatio <= MAX_NEWLY_CLIPPED_RATIO &&
    !visibleDarkHole;

  return {
    safe: hasReliableWatermarkSignal(originalSignal) && evidenceSafe && damageSafe,
    originalSignal,
    candidateSignal,
    suppressionGain,
    nearBlackIncrease,
    newlyClippedRatio,
    visibleDarkHole,
  };
}
