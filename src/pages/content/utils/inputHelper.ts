import { replaceQuillText } from '@/core/services/composer/quill';
import { setTextFieldValue } from '@/core/services/composer/textField';

/** Gemini draft/folder replacement keeps its single-command Quill compatibility path. */
export function setInputText(input: HTMLElement, text: string): void {
  if (input instanceof HTMLTextAreaElement || input instanceof HTMLInputElement) {
    // Draft restore historically writes without stealing focus or resetting an unchanged caret.
    setTextFieldValue(input, text);
  } else {
    replaceQuillText(input, text);
  }
}
