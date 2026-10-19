/** Which editable elements are prompt inputs, and the text a capture reads from them. */
import { findChatInput } from '../chatInput/index';
import type { PromptHistoryType } from './storage';

const PROMPT_INPUT_SELECTOR = '[contenteditable="true"], textarea';
const EDIT_CONTAINER_SELECTOR = 'chat-message, .query-content.edit-mode, .edit-container';
const MAIN_COMPOSER_SELECTOR =
  '.text-input-field, .input-area, ms-prompt-input-wrapper, ms-prompt-input, ms-chat-turn-input';
const VOYAGER_UI_SELECTOR = '.gv-ph-panel, .gv-pm-panel, [role="dialog"]';

export function readInputText(input: HTMLElement): string {
  if (input instanceof HTMLTextAreaElement) return input.value;
  return input.innerText ?? input.textContent ?? '';
}

function isVoyagerInput(input: HTMLElement): boolean {
  return Boolean(input.closest(VOYAGER_UI_SELECTOR));
}

export function isPromptInput(input: HTMLElement): boolean {
  if (isVoyagerInput(input)) return false;
  if (input.closest(EDIT_CONTAINER_SELECTOR)) return true;
  if (input.closest(MAIN_COMPOSER_SELECTOR)) return true;
  return findChatInput({ requireVisible: false }) === input;
}

export function promptTypeForInput(input: HTMLElement): PromptHistoryType {
  return input.closest(EDIT_CONTAINER_SELECTOR) ? 'edited' : 'sent';
}

export function inputFromTarget(target: EventTarget | null): HTMLElement | null {
  if (!(target instanceof Element)) return null;
  const input = target.closest<HTMLElement>(PROMPT_INPUT_SELECTOR);
  return input && isPromptInput(input) ? input : null;
}

export function findFormPromptInput(form: HTMLFormElement): HTMLElement | null {
  const active = document.activeElement;
  if (
    active instanceof HTMLElement &&
    form.contains(active) &&
    active.matches(PROMPT_INPUT_SELECTOR) &&
    isPromptInput(active)
  ) {
    return active;
  }
  return (
    Array.from(form.querySelectorAll<HTMLElement>(PROMPT_INPUT_SELECTOR)).find(isPromptInput) ??
    null
  );
}
