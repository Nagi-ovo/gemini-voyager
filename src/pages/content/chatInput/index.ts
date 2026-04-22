const CHAT_INPUT_SELECTORS = [
  'rich-textarea [contenteditable="true"]',
  'div[contenteditable="true"][role="textbox"]',
  '.input-area textarea',
  'textarea[placeholder*="Ask"]',
  'textarea',
] as const;

function isVisibleElement(element: Element): element is HTMLElement {
  return element instanceof HTMLElement && element.getBoundingClientRect().height > 0;
}

interface FindChatInputOptions {
  requireVisible?: boolean;
}

function isRangeInsideInput(range: Range, input: HTMLElement): boolean {
  return input.contains(range.commonAncestorContainer);
}

function createCollapsedRangeAtEnd(input: HTMLElement): Range {
  const range = document.createRange();
  range.selectNodeContents(input);
  range.collapse(false);
  return range;
}

function placeSelection(input: HTMLElement, range: Range): Selection | null {
  const selection = window.getSelection();
  if (!selection) return null;

  input.focus();
  selection.removeAllRanges();
  selection.addRange(range);
  return selection;
}

function insertTextIntoContentEditable(input: HTMLElement, text: string): boolean {
  const selection = window.getSelection();
  const currentRange =
    selection && selection.rangeCount > 0 && isRangeInsideInput(selection.getRangeAt(0), input)
      ? selection.getRangeAt(0).cloneRange()
      : createCollapsedRangeAtEnd(input);

  const activeSelection = placeSelection(input, currentRange);
  if (!activeSelection) return false;

  let inserted = false;
  try {
    inserted = document.execCommand('insertText', false, text);
  } catch {
    inserted = false;
  }

  if (!inserted) {
    input.classList.remove('ql-blank');

    const fallbackRange =
      activeSelection.rangeCount > 0
        ? activeSelection.getRangeAt(0)
        : createCollapsedRangeAtEnd(input);

    fallbackRange.deleteContents();
    const textNode = document.createTextNode(text);
    fallbackRange.insertNode(textNode);

    const caretRange = document.createRange();
    caretRange.setStartAfter(textNode);
    caretRange.collapse(true);
    activeSelection.removeAllRanges();
    activeSelection.addRange(caretRange);
  }

  input.dispatchEvent(new Event('input', { bubbles: true }));
  return true;
}

function insertTextIntoTextarea(input: HTMLTextAreaElement, text: string): boolean {
  input.focus();

  const start = input.selectionStart ?? input.value.length;
  const end = input.selectionEnd ?? start;

  if (typeof input.setRangeText === 'function') {
    input.setRangeText(text, start, end, 'end');
  } else {
    input.value = `${input.value.slice(0, start)}${text}${input.value.slice(end)}`;
    const caret = start + text.length;
    input.selectionStart = caret;
    input.selectionEnd = caret;
  }

  input.dispatchEvent(new Event('input', { bubbles: true }));
  return true;
}

export function findChatInput(options: FindChatInputOptions = {}): HTMLElement | null {
  const requireVisible = options.requireVisible ?? true;
  let fallback: HTMLElement | null = null;

  for (const selector of CHAT_INPUT_SELECTORS) {
    const elements = document.querySelectorAll(selector);
    for (const element of Array.from(elements)) {
      if (element instanceof HTMLElement && !fallback) {
        fallback = element;
      }

      if (isVisibleElement(element)) {
        return element;
      }
    }
  }

  return requireVisible ? null : fallback;
}

export function insertTextIntoChatInput(text: string, input = findChatInput()): boolean {
  if (!input || text.length === 0) return false;

  if (input instanceof HTMLTextAreaElement) {
    return insertTextIntoTextarea(input, text);
  }

  return insertTextIntoContentEditable(input, text);
}
