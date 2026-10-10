import type { IconNode } from 'lucide-react';

import { createLucideIcon } from './lucideIcon';

/**
 * Per-block toggle glyphs. The geometry is the double chevron Gemini's code
 * block toggle has always drawn, kept so its toggle looks exactly as before.
 */
const EXPAND_BLOCK_ICON_NODE = [
  ['path', { d: 'M8 8l4 4 4-4', key: 'expand-top' }],
  ['path', { d: 'M8 13l4 4 4-4', key: 'expand-bottom' }],
] satisfies IconNode;

const COLLAPSE_BLOCK_ICON_NODE = [
  ['path', { d: 'M8 16l4-4 4 4', key: 'collapse-bottom' }],
  ['path', { d: 'M8 11l4-4 4 4', key: 'collapse-top' }],
] satisfies IconNode;

/** Lucide `chevrons-up-down` / `chevrons-down-up` from lucide-react v0.553.0. */
const CHEVRONS_UP_DOWN_ICON_NODE = [
  ['path', { d: 'm7 15 5 5 5-5', key: '1hf1tw' }],
  ['path', { d: 'm7 9 5-5 5 5', key: 'sgt6xg' }],
] satisfies IconNode;

const CHEVRONS_DOWN_UP_ICON_NODE = [
  ['path', { d: 'm7 20 5-5 5 5', key: '13a0gw' }],
  ['path', { d: 'm7 4 5 5 5-5', key: '1kwcof' }],
] satisfies IconNode;

/** The toggle of a collapsed block (it expands) or an expanded one (it collapses). */
export function createCodeBlockToggleIcon(collapsed: boolean, size = 16): SVGSVGElement {
  return collapsed
    ? createLucideIcon('chevrons-down', EXPAND_BLOCK_ICON_NODE, size)
    : createLucideIcon('chevrons-up', COLLAPSE_BLOCK_ICON_NODE, size);
}

export function createExpandAllIcon(size = 16): SVGSVGElement {
  return createLucideIcon('chevrons-up-down', CHEVRONS_UP_DOWN_ICON_NODE, size);
}

export function createCollapseAllIcon(size = 16): SVGSVGElement {
  return createLucideIcon('chevrons-down-up', CHEVRONS_DOWN_UP_ICON_NODE, size);
}
