import { findComposer, insertIntoComposer } from '@/core/services/composer';
import { hasPendingComposerUpload } from '@/core/services/composer/sendGuards';

import { getPrimitiveContract } from '../contracts';
import type { Primitive } from '../types';

export type SendShortcutParams = Readonly<Record<string, never>>;

const DISABLED_SEND = ':disabled, [aria-disabled="true"], .ds-button--disabled';
const HIDDEN_CONTROL = '[hidden], [inert], [aria-hidden="true"], [aria-disabled="true"]';

function isEnabledSendControl(control: HTMLElement): boolean {
  if (control.matches(DISABLED_SEND) || control.closest(HIDDEN_CONTROL)) return false;
  const view = control.ownerDocument.defaultView;
  for (let element: HTMLElement | null = control; element; element = element.parentElement) {
    const style = view?.getComputedStyle(element);
    if (
      style?.display === 'none' ||
      style?.visibility === 'hidden' ||
      style?.visibility === 'collapse'
    )
      return false;
  }
  return true;
}

function insertEditorNewline(field: HTMLElement): void {
  const doc = field.ownerDocument;
  const selection = doc.getSelection();
  const current = selection?.rangeCount ? selection.getRangeAt(0) : null;
  const inside = current && field.contains(current.commonAncestorContainer);
  const range = inside ? current.cloneRange() : doc.createRange();
  if (!inside) {
    range.selectNodeContents(field);
    range.collapse(false);
  }
  field.focus();
  if (selection) {
    selection.removeAllRanges();
    selection.addRange(range);
  }
  // The host's measured Shift+Enter transaction inserts a real break without sending.
  const KeyEvent = doc.defaultView?.KeyboardEvent ?? KeyboardEvent;
  field.dispatchEvent(
    new KeyEvent('keydown', {
      key: 'Enter',
      code: 'Enter',
      keyCode: 13,
      which: 13,
      shiftKey: true,
      bubbles: true,
      cancelable: true,
    }),
  );
}

export const sendShortcutPrimitive: Primitive<SendShortcutParams> = {
  contract: getPrimitiveContract('sendShortcut')!,

  validateParams(raw: unknown) {
    if (raw !== undefined && (typeof raw !== 'object' || raw === null || Array.isArray(raw))) {
      return { success: false, error: [{ path: 'params', message: 'must be an object' }] };
    }
    const keys = Object.keys(raw ?? {});
    return keys.length > 0
      ? {
          success: false,
          error: keys.map((key) => ({ path: `params.${key}`, message: 'unknown parameter' })),
        }
      : { success: true, data: {} };
  },

  activate(scope, _params, context) {
    const { doc, adapter } = context;
    const composer = adapter?.selectors.composer;
    const composerRoot = adapter?.selectors.composerRoot;
    const sendButton = adapter?.selectors.sendButton;
    if (!composer || !composerRoot || !sendButton) return;
    context.setTargetCounter(() => doc.querySelectorAll(composer).length);

    scope.on(
      doc,
      'keydown',
      (event) => {
        if (
          event.defaultPrevented ||
          event.key !== 'Enter' ||
          event.isComposing ||
          event.keyCode === 229
        )
          return;
        // Shift+Enter belongs to the host, including the synthetic newline transaction below.
        if (event.shiftKey || event.altKey) return;
        const target = event.target;
        if (!(target instanceof Element)) return;
        const field = target.closest<HTMLElement>(composer);
        if (!(field instanceof HTMLElement) || field !== findComposer(adapter, { doc })) return;

        event.preventDefault();
        event.stopImmediatePropagation();
        if (event.ctrlKey || event.metaKey) {
          const root = field.closest(composerRoot);
          if (!root || hasPendingComposerUpload(root)) return;
          // Full adapter selectors can name the root itself; constrain their document matches here.
          const control = Array.from(doc.querySelectorAll<HTMLElement>(sendButton)).find(
            (candidate) =>
              candidate instanceof HTMLElement &&
              root.contains(candidate) &&
              isEnabledSendControl(candidate),
          );
          control?.click();
        } else if (field instanceof HTMLTextAreaElement) {
          insertIntoComposer(field, '\n', 'insertAtCursor');
        } else {
          insertEditorNewline(field);
        }
      },
      { capture: true },
    );
    return { updateSettings() {} };
  },
};
