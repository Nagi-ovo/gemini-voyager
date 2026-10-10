/**
 * Expand-all / collapse-all controls of the `codeCollapse` primitive: one
 * small bar right before the first collapsible block in document order, shown
 * once a page has two or more, acting on every block through the shared engine.
 */
import { createCollapseAllIcon, createExpandAllIcon } from '@/core/icons/codeCollapseIcons';
import type { CodeBlockCollapse } from '@/pages/content/codeBlockCollapse/engine';
import { isCollapsed } from '@/pages/content/codeBlockCollapse/toggle';
import { getTranslationSync } from '@/utils/i18n';

export const COLLAPSE_ALL_CLASS = 'gv-code-collapse-all';

export interface CollapseAllBar {
  /** Places, shows or hides the bar and its enabled states for the engine's current blocks. */
  sync(): void;
  relabel(): void;
  remove(): void;
}

function firstInDocument(blocks: readonly HTMLElement[]): HTMLElement {
  return blocks.reduce((first, block) =>
    first.compareDocumentPosition(block) & Node.DOCUMENT_POSITION_PRECEDING ? block : first,
  );
}

export function createCollapseAllBar(
  doc: Document,
  engine: () => CodeBlockCollapse,
): CollapseAllBar {
  const bar = doc.createElement('div');
  bar.className = COLLAPSE_ALL_CLASS;
  const button = (icon: SVGSVGElement, collapse: boolean): HTMLButtonElement => {
    const element = doc.createElement('button');
    element.type = 'button';
    element.append(icon);
    element.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      engine().setAllCollapsed(collapse);
    });
    bar.append(element);
    return element;
  };
  const expandAll = button(createExpandAllIcon(), false);
  const collapseAll = button(createCollapseAllIcon(), true);

  const relabel = (): void => {
    for (const [element, key] of [
      [expandAll, 'codeBlockExpandAll'],
      [collapseAll, 'codeBlockCollapseAll'],
    ] as const) {
      const label = getTranslationSync(key);
      element.title = label;
      element.setAttribute('aria-label', label);
    }
  };
  relabel();

  return {
    sync() {
      const blocks = engine().blocks();
      if (blocks.length < 2) {
        bar.remove();
        return;
      }
      const first = firstInDocument(blocks);
      if (bar.nextElementSibling !== first) first.before(bar);
      const collapsed = blocks.filter(isCollapsed).length;
      expandAll.disabled = collapsed === 0;
      collapseAll.disabled = collapsed === blocks.length;
    },
    relabel,
    remove: () => bar.remove(),
  };
}
