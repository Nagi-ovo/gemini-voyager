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

/** The toggle of a collapsed block (it expands) or an expanded one (it collapses). */
export function createCodeBlockToggleIcon(collapsed: boolean, size = 16): SVGSVGElement {
  return collapsed
    ? createLucideIcon('chevrons-down', EXPAND_BLOCK_ICON_NODE, size)
    : createLucideIcon('chevrons-up', COLLAPSE_BLOCK_ICON_NODE, size);
}
