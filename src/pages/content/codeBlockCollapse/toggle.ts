/**
 * DOM pieces of the code block collapse engine: the classes it stamps and the
 * icon-only toggle button. Kept apart from `engine.ts` so the engine reads as
 * state and observers only.
 */
import { createCodeBlockToggleIcon } from '@/core/icons/codeCollapseIcons';
import { createCollapseToggle } from '@/core/ui/collapse/toggle';
import { getTranslationSync } from '@/utils/i18n';

export { addClass, removeClasses } from '@/core/ui/collapse/classes';

export const CODE_BLOCK_TOGGLE_CLASS = 'gv-code-block-toggle';
export const CODE_BLOCK_COLLAPSIBLE_CLASS = 'gv-code-block-collapsible';
export const CODE_BLOCK_COLLAPSED_CLASS = 'gv-code-block-collapsed';
/** On the element a plugin site clips while its block is collapsed. */
export const CODE_BLOCK_CLIP_CLASS = 'gv-code-block-clip';

export function isCollapsed(host: Element): boolean {
  return host.classList.contains(CODE_BLOCK_COLLAPSED_CLASS);
}

export function updateToggle(host: HTMLElement, button: HTMLButtonElement): void {
  const collapsed = isCollapsed(host);
  const state = collapsed ? 'collapsed' : 'expanded';
  const label = getTranslationSync(collapsed ? 'pm_expand' : 'pm_collapse');

  if (button.dataset.state !== state) {
    button.dataset.state = state;
    button.replaceChildren(createCodeBlockToggleIcon(collapsed));
  }
  if (button.title !== label) button.title = label;
  if (button.getAttribute('aria-label') !== label) button.setAttribute('aria-label', label);
  button.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
}

export function createToggle(doc: Document, onToggle: () => void): HTMLButtonElement {
  return createCollapseToggle(doc, CODE_BLOCK_TOGGLE_CLASS, onToggle);
}
