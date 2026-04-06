/**
 * Shared utility for setting text in the Gemini chat input.
 *
 * Extracted from draftSave/index.ts so that both draft restore and
 * folder-as-project instruction injection can reuse the same logic.
 */

/**
 * Set text content in the chat input.
 *
 * Handles both plain HTMLTextAreaElement and the Quill-based contenteditable
 * rich-textarea that Gemini uses.
 *
 * @param input - The editable element (textarea or contenteditable div)
 * @param text - The text to insert
 */
export function setInputText(input: HTMLElement, text: string): void {
  if (input instanceof HTMLTextAreaElement) {
    input.value = text;
    input.dispatchEvent(new Event('input', { bubbles: true }));
    return;
  }

  // For contenteditable (Quill editor)
  input.focus();

  // Check if Quill marks this as blank
  const isQuillBlank = input.classList.contains('ql-blank');
  if (isQuillBlank) {
    input.classList.remove('ql-blank');
  }

  // Use insertText to work with Quill's state management
  const success = document.execCommand('insertText', false, text);
  if (!success) {
    // Fallback: set textContent directly
    input.textContent = text;
  }

  input.dispatchEvent(new Event('input', { bubbles: true }));
}
