/**
 * Shared utility for setting text in the Gemini chat input.
 *
 * Extracted from draftSave/index.ts to centralize the input-setting logic
 * used by draft restore and make it available for reuse by other features.
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

  const selection = window.getSelection();
  if (selection) {
    const range = document.createRange();
    range.selectNodeContents(input);
    selection.removeAllRanges();
    selection.addRange(range);
  }

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

  if (selection) {
    selection.selectAllChildren(input);
    selection.collapseToEnd();
  }
}
