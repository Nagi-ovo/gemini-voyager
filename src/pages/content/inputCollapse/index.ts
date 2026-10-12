import { StorageKeys } from '@/core/types/common';

import type { NativeFeatureToggle } from '../featureLifecycle';
import { getInputContainer } from './dom';
import { collapseInputNow, collapseWhenNotEmpty, expand, startCollapseSession } from './runtime';

/**
 * Public surface of input collapse. Vim, prompt history, quote reply and the
 * Prompt Manager call the expand/collapse helpers whether or not the feature
 * runs, so they stay module-level and independent of the runtime's lifetime.
 */

/**
 * The native module's reading of `gvInputCollapseEnabled`: a key never stored
 * is off (its startup read defaulted to `false`), and any stored value but
 * `false` is on.
 */
export function isInputCollapseEnabledValue(stored: unknown): boolean {
  return stored !== undefined && stored !== false;
}

export const INPUT_COLLAPSE_TOGGLE: NativeFeatureToggle = {
  key: StorageKeys.INPUT_COLLAPSE_ENABLED,
  isEnabled: isInputCollapseEnabledValue,
  areas: ['sync'],
};

/**
 * Starts the native input collapse with the current "collapse with content"
 * value; the popup switch is followed by the caller (`inputStartup.ts`).
 * Returns the stop that removes every listener, timer and DOM change it owns;
 * a stop from an earlier start never touches a later one.
 */
export function startInputCollapse(): () => void {
  return startCollapseSession(collapseWhenNotEmpty());
}

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
