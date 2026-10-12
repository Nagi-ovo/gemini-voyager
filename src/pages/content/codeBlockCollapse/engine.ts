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

/**
 * The code-collapse engine holding a block. Every code block collapse (the
 * native module and each plugin activation) claims a block here before
 * touching it, so two of them never stack toggles on one block or clear each
 * other's classes. The generic `collapse` primitive does not take part.
 */
export const CODE_COLLAPSE_OWNER_ATTRIBUTE = 'data-gv-code-collapse-owner';

let ownerSerial = 0;

function createOwnerToken(): string {
  ownerSerial += 1;
  return `${ownerSerial}:${Math.random().toString(36).slice(2, 8)}`;
}

export interface CodeBlockCollapseSite extends Omit<
  CollapseSite,
  'content' | 'isLong' | 'claim' | 'release'
> {
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
  const owner = createOwnerToken();
  return createCollapseEngine(
    {
      ...site,
      content: (host) => site.code(host),
      isLong: isLongCodeBlock,
      claim(host) {
        const holder = host.getAttribute(CODE_COLLAPSE_OWNER_ATTRIBUTE);
        if (holder !== null) return holder === owner;
        host.setAttribute(CODE_COLLAPSE_OWNER_ATTRIBUTE, owner);
        return true;
      },
      release(host) {
        if (host.getAttribute(CODE_COLLAPSE_OWNER_ATTRIBUTE) === owner) {
          host.removeAttribute(CODE_COLLAPSE_OWNER_ATTRIBUTE);
        }
      },
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
