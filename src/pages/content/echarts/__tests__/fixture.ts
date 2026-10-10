import { afterEach, beforeEach, vi } from 'vitest';

import { createEChartsCodeBlocks } from '../codeBlock';
import { createEChartsFullscreen } from '../fullscreen';
import { createEChartsFeature } from '../index';
import { createEChartsRenderer } from '../renderer';
import { createEChartsView } from '../view';

export function makeFakeInstance() {
  return {
    setOption: vi.fn(),
    getDataURL: vi.fn(() => 'data:image/png;base64,COMPOSITED'),
    resize: vi.fn(),
    dispose: vi.fn(),
  };
}

vi.mock('@/pages/content/echarts/runtime', () => ({
  init: vi.fn(() => makeFakeInstance()),
}));

// JSON5-lenient parse: strip comments and trailing commas before the strict
// parse, which is enough fidelity to exercise the renderer's lenient path.
vi.mock('json5', () => ({
  default: {
    parse: (s: string) => {
      const cleaned = s
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/\/\/[^\n]*/g, '')
        .replace(/,\s*([}\]])/g, '$1');
      return JSON.parse(cleaned);
    },
  },
}));

export const BAR_OPTION = `{
  "xAxis": { "type": "category", "data": ["A", "B"] },
  "yAxis": { "type": "value" },
  "series": [{ "type": "bar", "data": [1, 2] }]
}`;

export const PIE_OPTION = `{
  "series": [{ "type": "pie", "data": [{ "value": 1, "name": "a" }] }]
}`;

export function createEChartsFixture() {
  let blocks: ReturnType<typeof createEChartsCodeBlocks>;
  let fullscreen: ReturnType<typeof createEChartsFullscreen>;
  let feature: ReturnType<typeof createEChartsFeature>;

  beforeEach(() => {
    vi.clearAllMocks();
    document.body.innerHTML = '';
    document.body.className = '';
    document.documentElement.className = '';
    document.documentElement.removeAttribute('data-theme');
    const renderer = createEChartsRenderer();
    fullscreen = createEChartsFullscreen(renderer.resize);
    const view = createEChartsView(renderer, fullscreen);
    blocks = createEChartsCodeBlocks(renderer, view);
    feature = createEChartsFeature(blocks, renderer);
  });

  afterEach(() => {
    feature.stop();
    fullscreen.close();
    vi.useRealTimers();
  });

  return {
    get blocks() {
      return blocks;
    },
    get fullscreen() {
      return fullscreen;
    },
    get feature() {
      return feature;
    },
  };
}
