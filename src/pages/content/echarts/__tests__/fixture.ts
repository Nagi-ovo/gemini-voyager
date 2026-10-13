import { afterEach, beforeEach, vi } from 'vitest';

import { requireBundledSiteAdapter } from '@/features/plugins/catalog/sites';
import manifest from '@/features/plugins/catalog/sites/gemini/plugins/echarts/plugin.json';
import { PluginScope } from '@/features/plugins/runtime/pluginScope';
import { echartsPrimitive } from '@/features/plugins/verbs/echarts';

import { createEChartsFullscreen } from '../fullscreen';

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

/** Uses the real primitive; the panel lives beside the untouched host in a shadow root. */
export function createEChartsFixture() {
  let scope: PluginScope | null = null;
  let fullscreen: ReturnType<typeof createEChartsFullscreen>;
  beforeEach(() => {
    vi.clearAllMocks();
    document.head.replaceChildren();
    document.body.replaceChildren();
    document.body.className = '';
    document.documentElement.className = '';
    document.documentElement.removeAttribute('data-theme');
    document.documentElement.setAttribute('data-gv-scheme', 'light');
    fullscreen = createEChartsFullscreen(() => {});
  });
  const stop = async () => {
    await scope?.dispose();
    scope = null;
  };
  afterEach(async () => {
    await stop();
    fullscreen.close();
    vi.useRealTimers();
    document.documentElement.removeAttribute('data-gv-scheme');
  });
  return {
    start() {
      if (scope) return;
      scope = new PluginScope();
      echartsPrimitive.activate(
        scope,
        { ...manifest.contributes.domOps[0].params, turn: 'body' },
        {
          doc: document,
          adapter: requireBundledSiteAdapter('gemini'),
          pluginId: manifest.id,
          settings: {},
          setTargetCounter: () => {},
        },
      );
    },
    stop,
    query<T extends Element = HTMLElement>(selector: string): T | null {
      const direct = document.querySelector<T>(selector);
      if (direct) return direct;
      for (const panel of document.querySelectorAll('.gv-diagram-panel')) {
        const found = panel.shadowRoot?.querySelector<T>(selector);
        if (found) return found;
      }
      return null;
    },
    get fullscreen() {
      return fullscreen;
    },
  };
}

export function waitFor<T>(callback: () => T): Promise<T> {
  return vi.waitFor(callback, { timeout: 3000 });
}
