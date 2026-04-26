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

function execInsertText(text: string): boolean {
  try {
    return document.execCommand('insertText', false, text);
  } catch {
    return false;
  }
}

// Gemini's Quill editor silently drops "\n" passed via insertText, so multi-line
// prompts must be inserted segment-by-segment with insertParagraph between them.
function insertMultilineViaExecCommand(text: string): boolean {
  const segments = text.split('\n');
  for (let i = 0; i < segments.length; i++) {
    if (i > 0) {
      let paragraphInserted = false;
      try {
        paragraphInserted = document.execCommand('insertParagraph', false);
      } catch {
        paragraphInserted = false;
      }
      if (!paragraphInserted) return false;
    }
    const segment = segments[i];
    if (segment.length > 0 && !execInsertText(segment)) {
      return false;
    }
  }
  return true;
}

function insertTextViaDomFallback(
  input: HTMLElement,
  activeSelection: Selection,
  text: string,
): void {
  input.classList.remove('ql-blank');

  const fallbackRange =
    activeSelection.rangeCount > 0
      ? activeSelection.getRangeAt(0)
      : createCollapsedRangeAtEnd(input);

  fallbackRange.deleteContents();

  const fragment = document.createDocumentFragment();
  const lines = text.split('\n');
  let lastNode: Node | null = null;
  lines.forEach((line, index) => {
    if (index > 0) {
      const br = document.createElement('br');
      fragment.appendChild(br);
      lastNode = br;
    }
    if (line.length > 0) {
      const textNode = document.createTextNode(line);
      fragment.appendChild(textNode);
      lastNode = textNode;
    }
  });

  fallbackRange.insertNode(fragment);

  if (lastNode) {
    const caretRange = document.createRange();
    caretRange.setStartAfter(lastNode);
    caretRange.collapse(true);
    activeSelection.removeAllRanges();
    activeSelection.addRange(caretRange);
  }
}

function insertTextIntoContentEditable(input: HTMLElement, text: string): boolean {
  const selection = window.getSelection();
  const currentRange =
    selection && selection.rangeCount > 0 && isRangeInsideInput(selection.getRangeAt(0), input)
      ? selection.getRangeAt(0).cloneRange()
      : createCollapsedRangeAtEnd(input);

  const activeSelection = placeSelection(input, currentRange);
  if (!activeSelection) return false;

  const inserted = text.includes('\n') ? insertMultilineViaExecCommand(text) : execInsertText(text);

  if (!inserted) {
    insertTextViaDomFallback(input, activeSelection, text);
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
