import { afterEach, beforeEach, vi } from 'vitest';

import { createWaveDromCodeBlocks } from '../codeBlock';
import { createWaveDromFullscreen } from '../fullscreen';
import { createWaveDromFeature } from '../index';
import { createWaveDromRenderer } from '../renderer';
import { createWaveDromView } from '../view';

// Realistic dark skin tree with the bundled near-black fills (same shape as
// the real skin — the module-level remap must rewrite these values).
export const DARK_SKIN_STYLE =
  '.s6{fill:#000000;stroke:none;fill-opacity:1}' +
  '.s8{color:#000;fill:#000;fill-opacity:1;stroke:none}' +
  '.s9{color:#000;fill:#0010c0;fill-opacity:1;stroke:none}' +
  '.s10{color:#000;fill:#2d6500;fill-opacity:1;stroke:none}' +
  '.s11{color:#000;fill:#870500;fill-opacity:1;stroke:none}' +
  '.s12{color:#000;fill:#007a80;fill-opacity:1;stroke:none}' +
  '.s13{color:#000;fill:#680066;fill-opacity:1;stroke:none}' +
  '.s14{color:#000;fill:#5f5f5f;fill-opacity:1;stroke:none}' +
  '.s15{color:#000;fill:#2e005e;fill-opacity:1;stroke:none}';

const MOCK_DARK_SKIN_TREE = [
  'svg',
  {},
  ['style', {}, DARK_SKIN_STYLE],
  ['defs', {}, ''],
  ['g', {}, ''],
];

vi.mock('wavedrom/render-any', () => ({
  default: vi.fn(() => ['svg', {}, '']),
}));

vi.mock('onml/stringify.js', () => ({
  default: vi.fn(() => '<svg viewBox="0 0 100 50"><g/></svg>'),
}));

// Mock shapes mirror what the runtime sees after CJS interop: the bundler
// wraps each skins file's module.exports as the namespace `.default`, so the
// loader receives `{ default: <collection> }`. renderAny reads `skin.default`
// / the first named key before indexing the tree, so a skin must always be a
// *collection* — a bare tree would select the first node and throw.
vi.mock('wavedrom/skins/dark.js', () => ({
  default: { dark: MOCK_DARK_SKIN_TREE },
}));

vi.mock('wavedrom/skins/default.js', () => ({
  default: { default: ['svg', {}, ['style', {}, ''], '', ''] },
}));

vi.mock('json5', () => ({
  default: { parse: (s: string) => JSON.parse(s) },
}));

export function createWaveDromFixture() {
  let renderer: ReturnType<typeof createWaveDromRenderer>;
  let blocks: ReturnType<typeof createWaveDromCodeBlocks>;
  let fullscreen: ReturnType<typeof createWaveDromFullscreen>;
  let feature: ReturnType<typeof createWaveDromFeature>;

  beforeEach(() => {
    vi.clearAllMocks();
    document.body.innerHTML = '';
    document.body.className = '';
    document.documentElement.className = '';
    document.documentElement.removeAttribute('data-theme');
    renderer = createWaveDromRenderer();
    fullscreen = createWaveDromFullscreen();
    const view = createWaveDromView(fullscreen);
    blocks = createWaveDromCodeBlocks(renderer, view);
    feature = createWaveDromFeature(blocks);
  });

  afterEach(() => {
    feature.stop();
    fullscreen.close();
    vi.useRealTimers();
  });

  return {
    get renderer() {
      return renderer;
    },
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
