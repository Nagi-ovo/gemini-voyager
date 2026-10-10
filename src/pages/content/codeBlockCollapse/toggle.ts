/**
 * DOM pieces of the code block collapse engine: the classes it stamps and the
 * icon-only toggle button. Kept apart from `engine.ts` so the engine reads as
 * state and observers only.
 */
import { createCodeBlockToggleIcon } from '@/core/icons/codeCollapseIcons';
import { getTranslationSync } from '@/utils/i18n';

export const CODE_BLOCK_TOGGLE_CLASS = 'gv-code-block-toggle';
export const CODE_BLOCK_COLLAPSIBLE_CLASS = 'gv-code-block-collapsible';
export const CODE_BLOCK_COLLAPSED_CLASS = 'gv-code-block-collapsed';
/** On the element a plugin site clips while its block is collapsed. */
export const CODE_BLOCK_CLIP_CLASS = 'gv-code-block-clip';

/** Elements that had no class attribute before Voyager added one. */
const classless = new WeakSet<Element>();

export function addClass(element: Element, className: string): void {
  if (!element.hasAttribute('class')) classless.add(element);
  element.classList.add(className);
}

/** Removes Voyager's classes and, if the host had none, the then-empty attribute too. */
export function removeClasses(element: Element, ...classNames: string[]): void {
  element.classList.remove(...classNames);
  if (classless.has(element) && element.classList.length === 0) {
    element.removeAttribute('class');
    classless.delete(element);
  }
}

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
  const button = doc.createElement('button');
  button.type = 'button';
  button.className = CODE_BLOCK_TOGGLE_CLASS;
  button.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopPropagation();
    onToggle();
  });
  return button;
}
