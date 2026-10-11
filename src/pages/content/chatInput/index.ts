import { findComposer, insertIntoComposer } from '@/core/services/composer';

import { nativeHealthReporter } from '../nativeHealth';
import { hasRenderedConversationContent } from '../nativeHealth/pageEvidence';

const CHAT_INPUT_SELECTORS = [
  '[data-testid="chat-input"][contenteditable="true"]',
  '#prompt-textarea[contenteditable="true"]',
  '[data-composer-markdown][contenteditable="true"]',
  'rich-textarea [contenteditable="true"]',
  'div[contenteditable="true"][role="textbox"]',
  '.input-area textarea',
  'textarea[placeholder*="Ask"]',
  'textarea',
] as const;

/** Every chat input candidate as one selector list, for layout-free matching. */
export const CHAT_INPUT_SELECTOR = CHAT_INPUT_SELECTORS.join(', ');

interface FindChatInputOptions {
  requireVisible?: boolean;
}

export function findChatInput(options: FindChatInputOptions = {}): HTMLElement | null {
  const requireVisible = options.requireVisible ?? true;
  let fallback: HTMLElement | null = null;

  for (const selector of CHAT_INPUT_SELECTORS) {
    const visible = findComposer(selector);
    if (visible) return visible;
    fallback ??= findComposer(selector, { requireVisible: false });
  }

  return requireVisible ? null : fallback;
}

/**
 * A prompt insertion that finds no composer is the probe. A miss counts only on a conversation
 * that has rendered, because the composer is attached late while the app loads and a new chat
 * offers no evidence of a loaded app that is independent of the composer. The verdict accepts a
 * hidden composer (input collapse can shrink it), so only a missing one counts. Other hosts never
 * start the reporter, so their insertions report nothing.
 */
function noteComposer(found: boolean): void {
  if (found) {
    nativeHealthReporter.reportFound('composer');
    return;
  }
  nativeHealthReporter.reportMissing('composer', {
    route: 'conversation',
    recheck: () => findChatInput({ requireVisible: false }) !== null,
    expected: () => hasRenderedConversationContent(),
  });
}

export function insertTextIntoChatInput(text: string, input = findChatInput()): boolean {
  if (text.length === 0) return false;
  noteComposer(input !== null);
  if (!input) return false;

  return insertIntoComposer(input, text, 'insertAtCursor');
}
