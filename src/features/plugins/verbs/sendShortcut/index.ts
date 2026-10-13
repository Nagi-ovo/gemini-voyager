import { findComposer, insertIntoComposer } from '@/core/services/composer';
import { hasPendingComposerUpload } from '@/core/services/composer/sendGuards';
import { getSendKeyCoordinator } from '@/core/services/composer/sendKeys/sendKeyCoordinator';
import { isImeKeyEvent, type SendKeyMode } from '@/core/services/composer/sendKeys/sendKeyIntent';
import { isGeminiEnterpriseEnvironment } from '@/core/utils/gemini';

import { claimComposerEnter } from '../composerEnterOwner';
import { getPrimitiveContract } from '../contracts';
import type { Primitive } from '../types';

export interface SendShortcutParams {
  readonly mode?: SendKeyMode;
}

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
    const config = (raw ?? {}) as Record<string, unknown>;
    const issues = Object.keys(config)
      .filter((key) => key !== 'mode')
      .map((key) => ({ path: `params.${key}`, message: 'unknown parameter' }));
    if (
      config.mode !== undefined &&
      config.mode !== 'ctrlEnterSends' &&
      config.mode !== 'enterSends'
    ) {
      issues.push({ path: 'params.mode', message: 'must be ctrlEnterSends or enterSends' });
    }
    return issues.length > 0
      ? { success: false, error: issues }
      : { success: true, data: config as SendShortcutParams };
  },

  activate(scope, params, context) {
    const { doc, adapter } = context;
    const mode = params.mode ?? 'ctrlEnterSends';
    const host = doc.location.hostname;
    const site =
      host === 'gemini.google.com' || host === 'business.gemini.google'
        ? 'gemini'
        : host === 'aistudio.google.com' || host === 'aistudio.google.cn'
          ? 'aistudio'
          : null;
    if (site) {
      if (site === 'gemini' && isGeminiEnterpriseEnvironment(doc.location, doc)) {
        throw new Error('Send shortcuts are unavailable on Gemini Enterprise');
      }
      // Packaged pages share element-capture handling so preparation readers run first.
      const coordinator = getSendKeyCoordinator(site);
      if (!coordinator) throw new Error('The page send key coordinator is not ready');
      scope.effect(
        () => coordinator.registerMainMode({ source: context.pluginId, mode }),
        'send-key-mode',
      );
      context.setTargetCounter(
        () => doc.querySelectorAll('[contenteditable="true"], [role="textbox"], textarea').length,
      );
      return { updateSettings() {} };
    }
    const composer = adapter?.selectors.composer;
    const composerRoot = adapter?.selectors.composerRoot;
    const sendButton = adapter?.selectors.sendButton;
    if (!composer || !composerRoot || !sendButton) return;
    context.setTargetCounter(() => doc.querySelectorAll(composer).length);
    // Claimed before the listener so the claim outlives it: teardown runs in reverse.
    scope.effect(() => claimComposerEnter(doc), 'send-shortcut:enter-owner');

    scope.on(
      doc,
      'keydown',
      (event) => {
        if (event.defaultPrevented || event.key !== 'Enter' || isImeKeyEvent(event)) return;
        // Shift+Enter belongs to the host, including the synthetic newline transaction below.
        if (event.shiftKey || event.altKey) return;
        const target = event.target;
        if (!(target instanceof Element)) return;
        const field = target.closest<HTMLElement>(composer);
        if (!(field instanceof HTMLElement) || field !== findComposer(adapter, { doc })) return;

        event.preventDefault();
        event.stopImmediatePropagation();
        const ctrl = event.ctrlKey || event.metaKey;
        if (mode === 'enterSends' ? !ctrl : ctrl) {
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
