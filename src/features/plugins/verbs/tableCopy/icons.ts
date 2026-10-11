import type { IconNode } from 'lucide-react';

import { createLucideIcon } from '@/core/icons/lucideIcon';

/** Lucide table-copy toolbar geometry from lucide-react v0.553.0. */
const COPY_ICON_NODE = [
  ['rect', { width: '14', height: '14', x: '8', y: '8', rx: '2', ry: '2', key: '17jyea' }],
  ['path', { d: 'M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2', key: 'zix9uf' }],
] satisfies IconNode;

const SHEET_ICON_NODE = [
  ['rect', { width: '18', height: '18', x: '3', y: '3', rx: '2', ry: '2', key: '1m3agn' }],
  ['line', { x1: '3', x2: '21', y1: '9', y2: '9', key: '1vqk6q' }],
  ['line', { x1: '3', x2: '21', y1: '15', y2: '15', key: 'o2sbyz' }],
  ['line', { x1: '9', x2: '9', y1: '9', y2: '21', key: '1ib60c' }],
  ['line', { x1: '15', x2: '15', y1: '9', y2: '21', key: '1n26ft' }],
] satisfies IconNode;

export function createCopyIcon(size = 16): SVGSVGElement {
  return createLucideIcon('copy', COPY_ICON_NODE, size);
}

export function createSheetIcon(size = 16): SVGSVGElement {
  return createLucideIcon('sheet', SHEET_ICON_NODE, size);
}
