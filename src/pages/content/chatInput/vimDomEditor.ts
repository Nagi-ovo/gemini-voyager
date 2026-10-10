import { clamp } from './vimMotions';
import type { PendingOperator } from './vimOperators';

interface BlockLineEntry {
  element: HTMLElement;
  start: number;
  end: number;
  isEmpty: boolean;
}

const MAX_UNDO_DEPTH = 50;

export function getInputText(input: HTMLElement): string {
  if (input instanceof HTMLTextAreaElement) {
    return input.value;
  }

  const blocks = getLineBlockElements(input);
  if (blocks.length > 0) {
    return blocks
      .map((block) => (isEmptyLineBlock(block) ? '' : getLineBlockText(block)))
      .join('\n');
  }

  return input.innerText ?? input.textContent ?? '';
}

function isLineBlockElement(element: Element): element is HTMLElement {
  return (
    element instanceof HTMLElement &&
    (element.tagName === 'P' || element.tagName === 'DIV' || element.tagName === 'LI')
  );
}

function getLineBlockElements(input: HTMLElement): HTMLElement[] {
  return Array.from(input.children).filter(isLineBlockElement);
}

export function getLineBlockText(element: HTMLElement): string {
  return element.textContent?.replace(/\u200b/g, '') ?? '';
}

function isEmptyLineBlock(element: HTMLElement): boolean {
  return getLineBlockText(element).trim().length === 0;
}

export function getBlockLineEntries(input: HTMLElement): BlockLineEntry[] {
  const blocks = getLineBlockElements(input);
  if (blocks.length === 0) return [];

  const entries: BlockLineEntry[] = [];
  let offset = 0;

  blocks.forEach((element, index) => {
    const text = isEmptyLineBlock(element) ? '' : getLineBlockText(element);
    const start = offset;
    const end = start + text.length;

    entries.push({
      element,
      start,
      end,
      isEmpty: text.length === 0,
    });

    offset = end;
    if (index < blocks.length - 1) {
      offset += 1;
    }
  });

  return entries;
}

function getBlockLineIndexAtOffset(entries: BlockLineEntry[], offset: number): number {
  const directIndex = entries.findIndex((entry) => offset >= entry.start && offset <= entry.end);
  if (directIndex >= 0) return directIndex;

  for (let index = entries.length - 1; index >= 0; index--) {
    if (offset >= entries[index].start) return index;
  }

  return 0;
}

function clearLineBlockElement(element: HTMLElement): void {
  element.textContent = '';
  element.appendChild(document.createElement('br'));
}

function setInputText(input: HTMLElement, text: string): void {
  if (input instanceof HTMLTextAreaElement) {
    input.value = text;
  } else {
    input.classList.toggle('ql-blank', text.length === 0);
    input.textContent = text;
  }

  input.dispatchEvent(new Event('input', { bubbles: true }));
}

function findBlockLineEntry(input: HTMLElement, node: Node): BlockLineEntry | null {
  const element = node instanceof HTMLElement ? node : node.parentElement;
  if (!element) return null;

  return (
    getBlockLineEntries(input).find(
      (entry) => entry.element === element || entry.element.contains(element),
    ) ?? null
  );
}

function getRangePointOffset(input: HTMLElement, node: Node, offset: number): number | null {
  const entry = findBlockLineEntry(input, node);
  if (!entry) return null;

  if (entry.isEmpty) return entry.start;

  const range = document.createRange();
  range.selectNodeContents(entry.element);
  range.setEnd(node, offset);
  return clamp(entry.start + range.toString().length, entry.start, entry.end);
}

export function getSelectionRange(input: HTMLElement): { start: number; end: number } {
  const text = getInputText(input);

  if (input instanceof HTMLTextAreaElement) {
    return {
      start: clamp(input.selectionStart ?? 0, 0, text.length),
      end: clamp(input.selectionEnd ?? input.selectionStart ?? 0, 0, text.length),
    };
  }

  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0) {
    return { start: text.length, end: text.length };
  }

  const activeRange = selection.getRangeAt(0);
  if (!input.contains(activeRange.commonAncestorContainer)) {
    return { start: text.length, end: text.length };
  }

  const blockStart = getRangePointOffset(
    input,
    activeRange.startContainer,
    activeRange.startOffset,
  );
  const blockEnd = getRangePointOffset(input, activeRange.endContainer, activeRange.endOffset);
  if (blockStart !== null && blockEnd !== null) {
    return {
      start: clamp(blockStart, 0, text.length),
      end: clamp(blockEnd, 0, text.length),
    };
  }

  const startRange = document.createRange();
  startRange.selectNodeContents(input);
  startRange.setEnd(activeRange.startContainer, activeRange.startOffset);

  const endRange = document.createRange();
  endRange.selectNodeContents(input);
  endRange.setEnd(activeRange.endContainer, activeRange.endOffset);

  return {
    start: clamp(startRange.toString().length, 0, text.length),
    end: clamp(endRange.toString().length, 0, text.length),
  };
}

export function findTextPositionInElement(
  root: HTMLElement,
  targetOffset: number,
): { node: Node; offset: number } {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let currentOffset = 0;
  let lastTextNode: Node | null = null;

  while (walker.nextNode()) {
    const node = walker.currentNode;
    lastTextNode = node;
    const length = node.textContent?.length ?? 0;

    if (currentOffset + length >= targetOffset) {
      return {
        node,
        offset: clamp(targetOffset - currentOffset, 0, length),
      };
    }

    currentOffset += length;
  }

  if (lastTextNode) {
    return { node: lastTextNode, offset: lastTextNode.textContent?.length ?? 0 };
  }

  return { node: root, offset: 0 };
}

function findBlockLineTextPosition(
  root: HTMLElement,
  targetOffset: number,
): { node: Node; offset: number } | null {
  const entries = getBlockLineEntries(root);
  if (entries.length === 0) return null;

  for (const entry of entries) {
    if (entry.isEmpty && targetOffset === entry.start) {
      return { node: entry.element, offset: 0 };
    }

    if (!entry.isEmpty && targetOffset >= entry.start && targetOffset <= entry.end) {
      return findTextPositionInElement(entry.element, targetOffset - entry.start);
    }
  }

  return null;
}

function findTextPosition(root: HTMLElement, targetOffset: number): { node: Node; offset: number } {
  return (
    findBlockLineTextPosition(root, targetOffset) ?? findTextPositionInElement(root, targetOffset)
  );
}

export function createRangeForTextOffsets(root: HTMLElement, start: number, end = start): Range {
  const text = getInputText(root);
  const range = document.createRange();
  const rangeStart = findTextPosition(root, clamp(start, 0, text.length));
  const rangeEnd = findTextPosition(root, clamp(end, 0, text.length));

  range.setStart(rangeStart.node, rangeStart.offset);
  range.setEnd(rangeEnd.node, rangeEnd.offset);
  return range;
}

export function getCaretOffset(input: HTMLElement): number {
  const range = getSelectionRange(input);
  return range.end;
}

export function createVimEditor(onSelection: (input: HTMLElement, offset: number) => void) {
  let undoStack: string[] = [];

  function setInputSelection(input: HTMLElement, start: number, end = start): void {
    const text = getInputText(input);
    const nextStart = clamp(start, 0, text.length);
    const nextEnd = clamp(end, 0, text.length);

    if (input instanceof HTMLTextAreaElement) {
      input.selectionStart = nextStart;
      input.selectionEnd = nextEnd;
      input.focus();
      onSelection(input, nextEnd);
      return;
    }

    const selection = window.getSelection();
    if (!selection) return;

    const range = createRangeForTextOffsets(input, nextStart, nextEnd);
    selection.removeAllRanges();
    selection.addRange(range);

    try {
      input.focus({ preventScroll: true });
    } catch {
      input.focus();
    }

    onSelection(input, nextEnd);
  }

  function pushUndo(input: HTMLElement): void {
    const snapshot = getInputText(input);
    const previous = undoStack.at(-1);

    if (previous !== snapshot) {
      undoStack.push(snapshot);
      if (undoStack.length > MAX_UNDO_DEPTH) {
        undoStack.shift();
      }
    }
  }

  function clearUndoStack(): void {
    undoStack = [];
  }

  function restoreUndo(input: HTMLElement): void {
    const snapshot = undoStack.pop();
    if (typeof snapshot !== 'string') return;

    setInputText(input, snapshot);
    setInputSelection(input, snapshot.length);
  }

  function applyTextChange(input: HTMLElement, text: string, caret: number): void {
    pushUndo(input);
    setInputText(input, text);
    setInputSelection(input, caret);
  }

  function applyContentEditableRangeChange(
    input: HTMLElement,
    from: number,
    to: number,
    replacement: string,
  ): boolean {
    const selection = window.getSelection();
    if (!selection) return false;

    pushUndo(input);

    const range = createRangeForTextOffsets(input, from, to);
    selection.removeAllRanges();
    selection.addRange(range);
    range.deleteContents();

    if (replacement) {
      const textNode = document.createTextNode(replacement);
      range.insertNode(textNode);
    }

    input.classList.toggle('ql-blank', getInputText(input).length === 0);
    input.dispatchEvent(new Event('input', { bubbles: true }));
    setInputSelection(input, from + replacement.length);
    return true;
  }

  function replaceRange(input: HTMLElement, start: number, end: number, replacement = ''): void {
    const text = getInputText(input);
    const from = clamp(Math.min(start, end), 0, text.length);
    const to = clamp(Math.max(start, end), 0, text.length);

    if (
      !(input instanceof HTMLTextAreaElement) &&
      applyContentEditableRangeChange(input, from, to, replacement)
    ) {
      return;
    }

    applyTextChange(
      input,
      `${text.slice(0, from)}${replacement}${text.slice(to)}`,
      from + replacement.length,
    );
  }

  function applyBlockLines(
    input: HTMLElement,
    operator: PendingOperator,
    count: number,
    onYank: (text: string) => void,
  ): boolean {
    if (input instanceof HTMLTextAreaElement) return false;

    const entries = getBlockLineEntries(input);
    if (entries.length === 0) return false;

    const startIndex = getBlockLineIndexAtOffset(entries, getCaretOffset(input));
    const endIndex = clamp(startIndex + Math.max(1, count), startIndex + 1, entries.length);
    const targetEntries = entries.slice(startIndex, endIndex);
    const selected = targetEntries.map((entry) => getLineBlockText(entry.element)).join('\n');
    const clipboardText = selected.length === 0 ? '\n' : selected;

    if (operator === 'y') {
      onYank(clipboardText);
      setInputSelection(input, entries[startIndex].start);
      return true;
    }

    onYank(clipboardText);
    pushUndo(input);

    const shouldKeepFirstTarget = operator === 'c' || targetEntries.length === entries.length;
    const entriesToRemove = shouldKeepFirstTarget ? targetEntries.slice(1) : targetEntries;

    if (shouldKeepFirstTarget) {
      clearLineBlockElement(targetEntries[0].element);
    }

    for (const entry of entriesToRemove) {
      entry.element.remove();
    }

    input.classList.toggle('ql-blank', getInputText(input).length === 0);
    input.dispatchEvent(new Event('input', { bubbles: true }));

    const nextEntries = getBlockLineEntries(input);
    const nextIndex = clamp(startIndex, 0, Math.max(0, nextEntries.length - 1));
    const nextOffset = nextEntries[nextIndex]?.start ?? 0;
    setInputSelection(input, nextOffset);

    return true;
  }

  return { setInputSelection, clearUndoStack, restoreUndo, replaceRange, applyBlockLines };
}

export type VimEditor = ReturnType<typeof createVimEditor>;
