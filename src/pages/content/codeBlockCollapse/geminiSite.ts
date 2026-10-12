/**
 * Gemini's code blocks as the long code block collapse sees them, one source
 * for the native module and for the `codeCollapse` primitive's Gemini policy:
 * every `code-block` on the page (thinking included), the toggle in the
 * block's own button row, never a diagram block.
 */
import { DIAGRAM_OWNER_ATTR } from '@/features/plugins/verbs/diagramExportRegistry';

import type { CodeBlockCollapseSite } from './engine';

const CODE_SELECTOR = 'code[data-test-id="code-content"], code.code-container, pre > code';
/** Stamped by a diagram primitive (`verbs/codeBlockDiagram.ts`) on a block it draws. */
const DIAGRAM_OWNER_SELECTOR = `[${DIAGRAM_OWNER_ATTR}]`;

/**
 * A Mermaid or plugin-drawn diagram block. The language label also catches a
 * Mermaid block that is not drawn (renderer off, or still streaming).
 */
export function isGeminiDiagramBlock(host: HTMLElement): boolean {
  if (host.closest('.gv-mermaid-wrapper')) return true;
  if (host.closest(DIAGRAM_OWNER_SELECTOR) || host.querySelector(DIAGRAM_OWNER_SELECTOR)) {
    return true;
  }

  const language = host
    .querySelector('.code-block-decoration > span')
    ?.textContent?.trim()
    .toLowerCase();
  return language === 'mermaid';
}

/** The toggle joins Gemini's copy buttons, or the header when the row is missing. */
export function geminiCodeBlockActions(host: HTMLElement): HTMLElement | null {
  const decoration = host.querySelector<HTMLElement>('.code-block-decoration');
  return decoration?.querySelector<HTMLElement>('.buttons') ?? decoration;
}

/**
 * Long blocks stay expanded until the user collapses them; clipping and fade
 * come from `contentStyle.css`, keyed on the block's collapsed class.
 */
export function createGeminiCodeBlockSite(
  doc: Document,
  hostSelector: string,
): CodeBlockCollapseSite {
  return {
    root: () => doc.body,
    hostSelector,
    accepts: (host) => !isGeminiDiagramBlock(host),
    code: (host) => host.querySelector<HTMLElement>(CODE_SELECTOR),
    actions: geminiCodeBlockActions,
  };
}
