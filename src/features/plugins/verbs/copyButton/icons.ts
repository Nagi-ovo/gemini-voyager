import type { IconNode } from 'lucide-react';

import { createLucideIcon } from '@/core/icons/lucideIcon';

/** Lucide copy geometry from lucide-react v0.553.0. */
const COPY_ICON_NODE = [
  ['rect', { width: '14', height: '14', x: '8', y: '8', rx: '2', ry: '2', key: '17jyea' }],
  ['path', { d: 'M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2', key: 'zix9uf' }],
] satisfies IconNode;

export function createCopyIcon(size = 16): SVGSVGElement {
  return createLucideIcon('copy', COPY_ICON_NODE, size);
}
