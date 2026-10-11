/** Code block policy over the shared collapse state and observer engine. */
import {
  type CollapseEngine,
  type CollapseSite,
  createCollapseEngine,
} from '@/core/ui/collapse/engine';

import {
  CODE_BLOCK_CLIP_CLASS,
  CODE_BLOCK_COLLAPSED_CLASS,
  CODE_BLOCK_COLLAPSIBLE_CLASS,
  createToggle,
  updateToggle,
} from './toggle';

export const LONG_CODE_BLOCK_MIN_LINES = 24;
export const LONG_CODE_BLOCK_MIN_HEIGHT = 520;

export interface CodeBlockCollapseSite extends Omit<CollapseSite, 'content' | 'isLong'> {
  /** The element holding the code text, measured for length. */
  code(host: HTMLElement): HTMLElement | null;
}

export type CodeBlockCollapse = CollapseEngine;

function lineCount(text: string): number {
  if (!text) return 0;
  return text.split(/\r\n?|\n/).length;
}

export function isLongCodeBlock(code: HTMLElement): boolean {
  if (lineCount(code.textContent ?? '') >= LONG_CODE_BLOCK_MIN_LINES) return true;

  const pre = code.closest('pre');
  const renderedHeight = Math.max(
    code.scrollHeight,
    pre instanceof HTMLElement ? pre.scrollHeight : 0,
  );

  return renderedHeight >= LONG_CODE_BLOCK_MIN_HEIGHT;
}

export function createCodeBlockCollapse(site: CodeBlockCollapseSite): CodeBlockCollapse {
  return createCollapseEngine(
    {
      ...site,
      content: (host) => site.code(host),
      isLong: isLongCodeBlock,
    },
    {
      collapsibleClass: CODE_BLOCK_COLLAPSIBLE_CLASS,
      collapsedClass: CODE_BLOCK_COLLAPSED_CLASS,
      clipClass: CODE_BLOCK_CLIP_CLASS,
      createToggle,
      updateToggle,
    },
  );
}
