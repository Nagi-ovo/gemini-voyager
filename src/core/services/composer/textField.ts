/** Native value writes shared by normal insertion and Gemini's unfocused draft restore. */
export function setTextFieldValue(
  field: HTMLTextAreaElement | HTMLInputElement,
  text: string,
  caret?: number,
): void {
  const view = field.ownerDocument.defaultView;
  const prototype =
    field instanceof HTMLTextAreaElement
      ? (view?.HTMLTextAreaElement ?? HTMLTextAreaElement).prototype
      : (view?.HTMLInputElement ?? HTMLInputElement).prototype;
  // Bypass React's own value tracker so the bubbling input event observes a change.
  Object.getOwnPropertyDescriptor(prototype, 'value')?.set?.call(field, text);
  if (caret !== undefined) {
    try {
      field.setSelectionRange(caret, caret);
    } catch {
      // Some editable input types (email) have no selection API.
    }
  }
  field.dispatchEvent(new Event('input', { bubbles: true }));
}
