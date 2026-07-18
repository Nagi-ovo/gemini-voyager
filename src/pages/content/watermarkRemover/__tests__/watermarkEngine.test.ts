import { describe, expect, it } from 'vitest';

import {
  getWatermarkSignalStrength,
  hasAcceptableWatermarkRemovalEvidence,
  hasReliableWatermarkSignal,
  measureWatermarkSignal,
} from '../watermarkDetector';
import {
  type WatermarkAnchorOption,
  type WatermarkConfig,
  calculateWatermarkPosition,
  chooseWatermarkAnchorOption,
  detectWatermarkConfig,
  getWatermarkConfigOptions,
  removeWatermarkWithResidualCheck,
} from '../watermarkEngine';

const TEST_ALPHA_MAP = Float32Array.from([
  0.02, 0.15, 0.15, 0.02, 0.15, 0.8, 0.8, 0.15, 0.15, 0.8, 0.8, 0.15, 0.02, 0.15, 0.15, 0.02,
]);

function createImageDataWithWatermark(config: WatermarkConfig, layers = 1): ImageData {
  const width = 24;
  const height = 24;
  const data = new Uint8ClampedArray(width * height * 4);

  for (let i = 0; i < data.length; i += 4) {
    data[i] = 80;
    data[i + 1] = 80;
    data[i + 2] = 80;
    data[i + 3] = 255;
  }

  const position = calculateWatermarkPosition(width, height, config);
  for (let row = 0; row < position.height; row++) {
    for (let col = 0; col < position.width; col++) {
      const alpha = TEST_ALPHA_MAP[row * position.width + col];
      let value = 80;
      for (let layer = 0; layer < layers; layer++) {
        value = Math.round(255 * alpha + value * (1 - alpha));
      }
      const index = ((position.y + row) * width + position.x + col) * 4;
      data[index] = value;
      data[index + 1] = value;
      data[index + 2] = value;
    }
  }

  return { data, width, height } as ImageData;
}

function createImageDataWithWeakAlphaPattern(config: WatermarkConfig): ImageData {
  const imageData = createImageDataWithWatermark(config, 0);
  const position = calculateWatermarkPosition(imageData.width, imageData.height, config);

  for (let row = 0; row < position.height; row++) {
    for (let col = 0; col < position.width; col++) {
      const alpha = TEST_ALPHA_MAP[row * position.width + col];
      const value = Math.round(80 + alpha * 60);
      const index = ((position.y + row) * imageData.width + position.x + col) * 4;
      imageData.data[index] = value;
      imageData.data[index + 1] = value;
      imageData.data[index + 2] = value;
    }
  }

  return imageData;
}

function createTestAnchorOption(config: WatermarkConfig): WatermarkAnchorOption {
  return {
    config,
    alphaMap: TEST_ALPHA_MAP,
  };
}

function writeGrayscalePattern(
  imageData: ImageData,
  config: WatermarkConfig,
  values: number[],
): void {
  const position = calculateWatermarkPosition(imageData.width, imageData.height, config);
  for (let row = 0; row < position.height; row++) {
    for (let col = 0; col < position.width; col++) {
      const value = values[row * position.width + col];
      const index = ((position.y + row) * imageData.width + position.x + col) * 4;
      imageData.data[index] = value;
      imageData.data[index + 1] = value;
      imageData.data[index + 2] = value;
    }
  }
}

function expectWatermarkAreaNearBase(imageData: ImageData, config: WatermarkConfig): void {
  const position = calculateWatermarkPosition(imageData.width, imageData.height, config);

  for (let row = 0; row < position.height; row++) {
    for (let col = 0; col < position.width; col++) {
      const alpha = TEST_ALPHA_MAP[row * position.width + col];
      if (alpha < 0.08) continue;

      const index = ((position.y + row) * imageData.width + position.x + col) * 4;
      expect(Math.abs(imageData.data[index] - 80)).toBeLessThanOrEqual(1);
      expect(Math.abs(imageData.data[index + 1] - 80)).toBeLessThanOrEqual(1);
      expect(Math.abs(imageData.data[index + 2] - 80)).toBeLessThanOrEqual(1);
    }
  }
}

describe('watermarkEngine config detection', () => {
  it('accepts a safely suppressed residual measured from a real moved-anchor output', () => {
    const candidateSignal = {
      spatialScore: 0.2143191174,
      gradientScore: 0.1471584466,
    };

    expect(hasReliableWatermarkSignal(candidateSignal)).toBe(false);
    expect(hasAcceptableWatermarkRemovalEvidence(candidateSignal, 0.3951623107)).toBe(true);
  });

  it('still rejects the same residual when the watermark was not sufficiently suppressed', () => {
    expect(
      hasAcceptableWatermarkRemovalEvidence(
        {
          spatialScore: 0.2143191174,
          gradientScore: 0.1471584466,
        },
        0.24,
      ),
    ).toBe(false);
  });

  it('keeps historical detection as the default for full-size 2816x1536 outputs', () => {
    expect(detectWatermarkConfig(2816, 1536)).toEqual({
      logoSize: 96,
      marginRight: 64,
      marginBottom: 64,
    });
  });

  it('offers old and May 2026 anchors for full-size 2816x1536 outputs', () => {
    const options = getWatermarkConfigOptions(2816, 1536);

    expect(options).toEqual([
      {
        logoSize: 96,
        marginRight: 64,
        marginBottom: 64,
      },
      {
        logoSize: 96,
        marginRight: 192,
        marginBottom: 192,
        alphaVariant: '20260520',
      },
    ]);
    expect(calculateWatermarkPosition(2816, 1536, options[1])).toEqual({
      x: 2528,
      y: 1248,
      width: 96,
      height: 96,
    });
  });

  it('offers old and May 2026 anchors for half-size 16:9 preview images', () => {
    const options = getWatermarkConfigOptions(1408, 768);

    expect(options).toEqual([
      {
        logoSize: 48,
        marginRight: 32,
        marginBottom: 32,
      },
      {
        logoSize: 48,
        marginRight: 96,
        marginBottom: 96,
        alphaVariant: '20260520',
      },
    ]);
    expect(calculateWatermarkPosition(1408, 768, options[1])).toEqual({
      x: 1264,
      y: 624,
      width: 48,
      height: 48,
    });
  });

  it('offers the moved anchor for square outputs', () => {
    expect(getWatermarkConfigOptions(1024, 1024)).toEqual([
      {
        logoSize: 48,
        marginRight: 32,
        marginBottom: 32,
      },
      {
        logoSize: 48,
        marginRight: 96,
        marginBottom: 96,
        alphaVariant: '20260520',
      },
    ]);
  });

  it('keeps the historical anchor first for other old-rule dimensions', () => {
    expect(getWatermarkConfigOptions(1376, 768)[0]).toEqual({
      logoSize: 48,
      marginRight: 32,
      marginBottom: 32,
    });
    expect(getWatermarkConfigOptions(2708, 1536)[0]).toEqual({
      logoSize: 96,
      marginRight: 64,
      marginBottom: 64,
    });
  });

  it('selects the historical anchor when the actual pixels still contain the old watermark', () => {
    const oldConfig = { logoSize: 4, marginRight: 1, marginBottom: 1 };
    const newConfig = {
      logoSize: 4,
      marginRight: 9,
      marginBottom: 9,
      alphaVariant: '20260520' as const,
    };
    const imageData = createImageDataWithWatermark(oldConfig);

    expect(
      chooseWatermarkAnchorOption(imageData, [
        createTestAnchorOption(oldConfig),
        createTestAnchorOption(newConfig),
      ]).config,
    ).toBe(oldConfig);
  });

  it('selects the May 2026 anchor when the actual pixels contain the moved watermark', () => {
    const oldConfig = { logoSize: 4, marginRight: 1, marginBottom: 1 };
    const newConfig = {
      logoSize: 4,
      marginRight: 9,
      marginBottom: 9,
      alphaVariant: '20260520' as const,
    };
    const imageData = createImageDataWithWatermark(newConfig);

    expect(
      chooseWatermarkAnchorOption(imageData, [
        createTestAnchorOption(oldConfig),
        createTestAnchorOption(newConfig),
      ]).config,
    ).toBe(newConfig);
  });

  it('prefers a reliable anchor over a stronger but unreliable candidate', () => {
    const oldConfig = { logoSize: 4, marginRight: 1, marginBottom: 1 };
    const newConfig = {
      logoSize: 4,
      marginRight: 9,
      marginBottom: 9,
      alphaVariant: '20260520' as const,
    };
    const imageData = createImageDataWithWatermark(oldConfig, 0);
    writeGrayscalePattern(
      imageData,
      oldConfig,
      [29, 49, 126, 66, 21, 97, 81, 47, 186, 39, 189, 109, 40, 25, 53, 120],
    );
    writeGrayscalePattern(
      imageData,
      newConfig,
      [109, 154, 46, 13, 72, 122, 166, 144, 93, 183, 94, 168, 172, 80, 145, 104],
    );

    const oldPosition = calculateWatermarkPosition(imageData.width, imageData.height, oldConfig);
    const newPosition = calculateWatermarkPosition(imageData.width, imageData.height, newConfig);
    const oldSignal = measureWatermarkSignal(imageData, TEST_ALPHA_MAP, oldPosition);
    const newSignal = measureWatermarkSignal(imageData, TEST_ALPHA_MAP, newPosition);
    expect(hasReliableWatermarkSignal(oldSignal)).toBe(false);
    expect(hasReliableWatermarkSignal(newSignal)).toBe(true);
    expect(getWatermarkSignalStrength(oldSignal)).toBeGreaterThan(
      getWatermarkSignalStrength(newSignal),
    );

    expect(
      chooseWatermarkAnchorOption(imageData, [
        createTestAnchorOption(oldConfig),
        createTestAnchorOption(newConfig),
      ]).config,
    ).toBe(newConfig);
  });

  it('removes a single transparent watermark layer in one pass', () => {
    const config = { logoSize: 4, marginRight: 1, marginBottom: 1 };
    const imageData = createImageDataWithWatermark(config);
    const position = calculateWatermarkPosition(imageData.width, imageData.height, config);

    const passes = removeWatermarkWithResidualCheck(imageData, TEST_ALPHA_MAP, position);

    expect(passes).toBe(1);
    expectWatermarkAreaNearBase(imageData, config);
  });

  it('repeats removal while a stacked watermark layer remains', () => {
    const config = { logoSize: 4, marginRight: 1, marginBottom: 1 };
    const imageData = createImageDataWithWatermark(config, 2);
    const position = calculateWatermarkPosition(imageData.width, imageData.height, config);

    const passes = removeWatermarkWithResidualCheck(imageData, TEST_ALPHA_MAP, position);

    expect(passes).toBe(2);
    expectWatermarkAreaNearBase(imageData, config);
  });

  it('leaves a clean image pixel-identical when no watermark signal is present', () => {
    const config = { logoSize: 4, marginRight: 1, marginBottom: 1 };
    const imageData = createImageDataWithWatermark(config, 0);
    const originalPixels = new Uint8ClampedArray(imageData.data);
    const position = calculateWatermarkPosition(imageData.width, imageData.height, config);

    const passes = removeWatermarkWithResidualCheck(imageData, TEST_ALPHA_MAP, position);

    expect(passes).toBe(0);
    expect(imageData.data).toEqual(originalPixels);
  });

  it('rejects a watermark-like pattern when trial removal would clip pixels', () => {
    const config = { logoSize: 4, marginRight: 1, marginBottom: 1 };
    const imageData = createImageDataWithWeakAlphaPattern(config);
    const originalPixels = new Uint8ClampedArray(imageData.data);
    const position = calculateWatermarkPosition(imageData.width, imageData.height, config);

    expect(
      hasReliableWatermarkSignal(measureWatermarkSignal(imageData, TEST_ALPHA_MAP, position)),
    ).toBe(true);

    const passes = removeWatermarkWithResidualCheck(imageData, TEST_ALPHA_MAP, position);

    expect(passes).toBe(0);
    expect(imageData.data).toEqual(originalPixels);
  });
});
