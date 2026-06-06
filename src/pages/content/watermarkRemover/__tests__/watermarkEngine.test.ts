import { describe, expect, it } from 'vitest';

import {
  calculateWatermarkPosition,
  chooseWatermarkAnchorOption,
  detectWatermarkConfig,
  getWatermarkConfigOptions,
  type WatermarkAnchorOption,
  type WatermarkConfig,
} from '../watermarkEngine';

const TEST_ALPHA_MAP = Float32Array.from([
  0.02, 0.15, 0.15, 0.02, 0.15, 0.8, 0.8, 0.15, 0.15, 0.8, 0.8, 0.15, 0.02, 0.15, 0.15,
  0.02,
]);

function createImageDataWithWatermark(config: WatermarkConfig): ImageData {
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
      const value = Math.round(255 * alpha + 80 * (1 - alpha));
      const index = ((position.y + row) * width + position.x + col) * 4;
      data[index] = value;
      data[index + 1] = value;
      data[index + 2] = value;
    }
  }

  return { data, width, height } as ImageData;
}

function createTestAnchorOption(config: WatermarkConfig): WatermarkAnchorOption {
  return {
    config,
    alphaMap: TEST_ALPHA_MAP,
  };
}

describe('watermarkEngine config detection', () => {
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
});
