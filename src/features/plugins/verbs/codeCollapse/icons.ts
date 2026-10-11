import type { IconNode } from 'lucide-react';

import { createLucideIcon } from '@/core/icons/lucideIcon';

/** Lucide `chevrons-up-down` / `chevrons-down-up` from lucide-react v0.553.0. */
const CHEVRONS_UP_DOWN_ICON_NODE = [
  ['path', { d: 'm7 15 5 5 5-5', key: '1hf1tw' }],
  ['path', { d: 'm7 9 5-5 5 5', key: 'sgt6xg' }],
] satisfies IconNode;

const CHEVRONS_DOWN_UP_ICON_NODE = [
  ['path', { d: 'm7 20 5-5 5 5', key: '13a0gw' }],
  ['path', { d: 'm7 4 5 5 5-5', key: '1kwcof' }],
] satisfies IconNode;

export function createExpandAllIcon(size = 16): SVGSVGElement {
  return createLucideIcon('chevrons-up-down', CHEVRONS_UP_DOWN_ICON_NODE, size);
}

export function createCollapseAllIcon(size = 16): SVGSVGElement {
  return createLucideIcon('chevrons-down-up', CHEVRONS_DOWN_UP_ICON_NODE, size);
}
