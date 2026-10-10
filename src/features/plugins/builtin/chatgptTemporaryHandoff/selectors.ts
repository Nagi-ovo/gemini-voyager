/** ChatGPT controls the temporary-chat handoff reads, leaves through and writes into. */

export const CHATGPT_TEMP_TOGGLE_SELECTOR = [
  '[data-testid="temporary-chat-toggle"]',
  'button[aria-label*="temporary chat" i]',
  'button[aria-label*="临时聊天"]',
  'button[aria-label*="暫時聊天"]',
].join(',');
// The current composer (measured live, October 2026) is the ProseMirror textbox
// in `form[data-chatgpt-composer]`; its submit button has only a localized
// aria-label. The other entries match earlier composers.
export const CHATGPT_COMPOSER_SELECTORS = [
  'form[data-chatgpt-composer] [contenteditable="true"][role="textbox"]',
  '#prompt-textarea',
  'form[data-type="unified-composer"] [contenteditable="true"][role="textbox"]',
  'form[data-testid*="composer" i] [contenteditable="true"][role="textbox"]',
] as const;
export const CHATGPT_GENERIC_COMPOSER_SELECTOR =
  'main form [contenteditable="true"][role="textbox"]';
export const CHATGPT_SEND_CONTROL_SELECTOR = [
  'button[data-testid="send-button"]',
  'button[data-testid="composer-submit-button"]',
  'form[data-chatgpt-composer] button[type="submit"]',
].join(',');
export const CHATGPT_COMPOSER_SELECTOR = [
  ...CHATGPT_COMPOSER_SELECTORS,
  CHATGPT_GENERIC_COMPOSER_SELECTOR,
].join(',');
export const CHATGPT_NEW_CHAT_SELECTOR =
  'a[data-testid="create-new-chat-button"], a[href="/"], a[href^="/u/"][href$="/"]';
