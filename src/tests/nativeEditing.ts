import { vi } from 'vitest';

/** jsdom has no editing engine: mutate its real selection and emit the native input boundary. */
export function applyNativeEditingCommand(
  command: string,
  _showUI?: boolean,
  text?: string,
): boolean {
  const selection = document.getSelection();
  if (!selection?.rangeCount) return false;
  if (!['insertText', 'insertParagraph', 'delete'].includes(command)) return false;
  const range = selection.getRangeAt(0);
  let target =
    range.commonAncestorContainer instanceof HTMLElement
      ? range.commonAncestorContainer
      : range.commonAncestorContainer.parentElement;
  while (
    target &&
    target.contentEditable !== 'true' &&
    !target.matches('[contenteditable="true"]')
  ) {
    target = target.parentElement;
  }
  range.deleteContents();
  if (command !== 'delete') {
    const node = document.createTextNode(command === 'insertParagraph' ? '\n' : (text ?? ''));
    range.insertNode(node);
    range.setStartAfter(node);
    range.collapse(true);
    selection.removeAllRanges();
    selection.addRange(range);
  }
  target?.dispatchEvent(new Event('input', { bubbles: true }));
  return true;
}

/** Returns teardown so each suite restores document.execCommand exactly. */
export function installNativeEditingMock(): () => void {
  const previous = Object.getOwnPropertyDescriptor(document, 'execCommand');
  Object.defineProperty(document, 'execCommand', {
    configurable: true,
    writable: true,
    value: vi.fn(applyNativeEditingCommand),
  });
  return () => {
    if (previous) Object.defineProperty(document, 'execCommand', previous);
    else Reflect.deleteProperty(document, 'execCommand');
  };
}
