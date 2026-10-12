/**
 * What an Enter keydown means in the composer, decided from the event alone.
 *
 * Pure: no DOM lookups and no side effects. Site differences live in the rule
 * a site policy hands in (`sendSitePolicies.ts`), so Gemini can keep sending on
 * Ctrl+Shift+Enter while AI Studio hands Shift and Alt back to the host.
 */

/** A main send mode: which Enter chord sends. */
export type SendKeyMode = 'ctrlEnterSends' | 'enterSends';

/** `send` clicks the send button, `newline` inserts a line break, `host` leaves the key alone. */
export type SendKeyIntent = 'send' | 'newline' | 'host';

/** One site's reading of each Enter chord, checked in this order: Ctrl/Cmd, Shift, Alt, plain. */
export interface SendKeyRule {
  /** Ctrl or Cmd held, whatever else is held. */
  readonly ctrlEnter: SendKeyIntent;
  readonly shiftEnter: SendKeyIntent;
  readonly altEnter: SendKeyIntent;
  readonly plainEnter: SendKeyIntent;
}

export type SendKeyEventLike = Pick<
  KeyboardEvent,
  'key' | 'isComposing' | 'ctrlKey' | 'metaKey' | 'shiftKey' | 'altKey'
> & { readonly keyCode?: number };

export function isImeKeyEvent(
  event: Pick<KeyboardEvent, 'key' | 'isComposing'> & { readonly keyCode?: number },
): boolean {
  // Safari may end composition before the candidate-confirming Enter arrives.
  return event.isComposing || event.key === 'Process' || event.keyCode === 229;
}

export function classifySendKey(event: SendKeyEventLike, rule: SendKeyRule): SendKeyIntent {
  // Issue 260: an Enter that confirms an IME candidate belongs to the IME.
  if (isImeKeyEvent(event) || event.key !== 'Enter') return 'host';
  if (event.ctrlKey || event.metaKey) return rule.ctrlEnter;
  if (event.shiftKey) return rule.shiftEnter;
  if (event.altKey) return rule.altEnter;
  return rule.plainEnter;
}
