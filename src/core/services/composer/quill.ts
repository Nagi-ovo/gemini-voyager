/** Gemini compatibility: keep cursor and replacement command sequences distinct. */
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

export function insertQuillText(
  input: HTMLElement,
  text: string,
  mode: 'append' | 'insertAtCursor',
): boolean {
  const selection = window.getSelection();
  const currentRange =
    mode === 'insertAtCursor' &&
    selection &&
    selection.rangeCount > 0 &&
    isRangeInsideInput(selection.getRangeAt(0), input)
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

export function replaceQuillText(input: HTMLElement, text: string): void {
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
