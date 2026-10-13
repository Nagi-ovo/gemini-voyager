import { getInputContainer } from './dom';
import { collapseInputNow, expand } from './runtime';

/**
 * Public surface of input collapse. Vim, prompt history, quote reply and the
 * Prompt Manager call the expand/collapse helpers whether or not the feature
 * runs, so they stay module-level and independent of the runtime's lifetime.
 */

export function expandInputCollapseIfNeeded(): void {
  const container = getInputContainer();
  if (!container) return;
  expand(container);
}

/**
 * Expands the input area and moves cursor to the end (for keyboard shortcut)
 */
export function expandInputWithCursorAtEnd(): void {
  const container = getInputContainer();
  if (!container) return;
  expand(container, true); // true = move cursor to end
}

/**
 * Collapses the input area immediately (for keyboard shortcut)
 * This bypasses the delay and state checks in tryCollapse
 */
export function collapseInput(): void {
  collapseInputNow();
}
