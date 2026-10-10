/**
 * The chat composer read as one string, whether it is a `<textarea>` or a
 * contenteditable editor.
 *
 * Offsets everywhere in slash completion are plain-text offsets into
 * `readText(input)`. This module turns them into DOM ranges and caret
 * positions and back, and owns the one rule that makes inline tokens safe:
 * a placed token's DOM text is its whole prompt body, so slash parsing only
 * reads what was typed after the last token.
 */
import { type PromptItem } from '@/core/types/sync';

export const TOKEN_CLASS = 'gv-pm-slash-token';
export const TOKEN_SPACER = '\u00a0';

export interface PromptQuery {
  input: HTMLElement;
  query: string;
  start: number;
  end: number;
  range: Range | null;
}

/** Where a placed prompt's name sits in the composer text. */
export interface PromptOccurrence {
  id: string;
  name: string;
  start: number;
}

/**
 * A prompt as it reaches a token: `text` is already resolved, and
 * `gvSourceText` is the body it was resolved from, present only when a template
 * was filled. The preview needs both to say which words the reader supplied.
 */
export type TokenPrompt = PromptItem & { gvSourceText?: string };

export function readText(input: HTMLElement): string {
  return input instanceof HTMLTextAreaElement
    ? input.value
    : input.innerText || input.textContent || '';
}

function getCaretOffset(input: HTMLElement): {
  prefix: string;
  range: Range | null;
  baseOffset: number;
} {
  if (input instanceof HTMLTextAreaElement) {
    const end = input.selectionStart ?? input.value.length;
    return { prefix: input.value.slice(0, end), range: null, baseOffset: 0 };
  }

  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0) {
    return { prefix: readText(input), range: null, baseOffset: 0 };
  }
  const selectionRange = selection.getRangeAt(0);
  if (!input.contains(selectionRange.commonAncestorContainer)) {
    return { prefix: readText(input), range: null, baseOffset: 0 };
  }

  const prefixRange = selectionRange.cloneRange();
  prefixRange.selectNodeContents(input);
  prefixRange.setEnd(selectionRange.endContainer, selectionRange.endOffset);
  const fullPrefix = prefixRange.toString();

  // An inserted token's real DOM text is the full prompt body. Slash parsing
  // must only inspect text typed after the last token, otherwise a URL or path
  // inside that hidden body could reopen completion immediately.
  const tokens = Array.from(input.querySelectorAll<HTMLElement>(`.${TOKEN_CLASS}`));
  for (let index = tokens.length - 1; index >= 0; index--) {
    const tokenRange = document.createRange();
    tokenRange.selectNode(tokens[index]);
    if (tokenRange.compareBoundaryPoints(Range.END_TO_END, selectionRange) > 0) continue;
    const suffixRange = selectionRange.cloneRange();
    suffixRange.setStartAfter(tokens[index]);
    const prefix = suffixRange.toString();
    return {
      prefix,
      range: selectionRange.cloneRange(),
      baseOffset: fullPrefix.length - prefix.length,
    };
  }

  return { prefix: fullPrefix, range: selectionRange.cloneRange(), baseOffset: 0 };
}

export function getPromptQuery(input: HTMLElement): PromptQuery | null {
  const { prefix, range, baseOffset } = getCaretOffset(input);
  const slashIndex = prefix.lastIndexOf('/');
  if (slashIndex < 0) return null;
  const previous = slashIndex === 0 ? '' : prefix[slashIndex - 1];
  if (previous && !/\s/.test(previous)) return null;

  const query = prefix.slice(slashIndex + 1);
  if (/^\s/.test(query) || /[\r\n]/.test(query) || query.includes('/')) return null;
  const end = baseOffset + prefix.length;
  return { input, query, start: baseOffset + slashIndex, end, range };
}

function allTextNodes(root: Node): Text[] {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const nodes: Text[] = [];
  let current = walker.nextNode();
  while (current) {
    nodes.push(current as Text);
    current = walker.nextNode();
  }
  return nodes;
}

export function findTextBoundary(
  root: HTMLElement,
  offset: number,
): { node: Text; offset: number } | null {
  let remaining = Math.max(0, offset);
  for (const node of allTextNodes(root)) {
    if (remaining <= node.data.length) return { node, offset: remaining };
    remaining -= node.data.length;
  }
  const last = allTextNodes(root).at(-1);
  return last ? { node: last, offset: last.data.length } : null;
}

function placeCaretAtTextOffset(input: HTMLElement, offset: number): void {
  if (input instanceof HTMLTextAreaElement) {
    input.focus();
    input.setSelectionRange(offset, offset);
    return;
  }

  const range = document.createRange();
  const boundary = findTextBoundary(input, offset);
  if (boundary) {
    range.setStart(boundary.node, boundary.offset);
    range.collapse(true);
  } else {
    range.selectNodeContents(input);
    range.collapse(true);
  }
  const selection = window.getSelection();
  if (!selection) return;
  input.focus();
  selection.removeAllRanges();
  selection.addRange(range);
}

export function placeCaretAtInputStart(input: HTMLElement): void {
  if (input instanceof HTMLTextAreaElement) {
    input.focus();
    input.setSelectionRange(0, 0);
    return;
  }

  const range = document.createRange();
  const firstToken = input.querySelector<HTMLElement>(`.${TOKEN_CLASS}`);
  if (firstToken) {
    const prefixRange = document.createRange();
    prefixRange.selectNodeContents(input);
    prefixRange.setEndBefore(firstToken);
    if (prefixRange.toString() === '') {
      range.setStartBefore(firstToken);
      range.collapse(true);
    } else {
      const boundary = findTextBoundary(input, 0);
      if (boundary) range.setStart(boundary.node, boundary.offset);
    }
  } else {
    const boundary = findTextBoundary(input, 0);
    if (boundary) range.setStart(boundary.node, boundary.offset);
  }
  range.collapse(true);

  const selection = window.getSelection();
  if (!selection) return;
  input.focus();
  selection.removeAllRanges();
  selection.addRange(range);
}

export function restoreCaretAfterInput(input: HTMLElement, offset: number): void {
  const prefix = readText(input).slice(0, offset);
  placeCaretAtTextOffset(input, offset);

  // Gemini can reconcile the editor in a microtask after handling `input` and
  // reset its selection to the end. Reapply only while this edit still owns
  // focus and the text before the deletion point is unchanged.
  queueMicrotask(() => {
    if (
      input.isConnected &&
      document.activeElement === input &&
      readText(input).slice(0, offset) === prefix
    ) {
      placeCaretAtTextOffset(input, offset);
    }
  });
}

export function restoreCaretAfterPrompt(
  input: HTMLElement,
  token: HTMLElement | null,
  offset: number,
): void {
  const prefix = readText(input).slice(0, offset);
  const place = () => {
    if (!input.isConnected) return;
    if (token?.isConnected) {
      const range = document.createRange();
      range.setStartAfter(token);
      range.collapse(true);
      const selection = window.getSelection();
      if (!selection) return;
      input.focus();
      selection.removeAllRanges();
      selection.addRange(range);
      return;
    }
    placeCaretAtTextOffset(input, offset);
  };
  place();
  queueMicrotask(() => {
    if (document.activeElement === input && readText(input).slice(0, offset) === prefix) place();
  });
}

export function createQueryRange(query: PromptQuery): Range | null {
  if (query.input instanceof HTMLTextAreaElement) return null;
  const selectionRange = query.range;
  if (!selectionRange) return null;
  const start = findTextBoundary(query.input, query.start);
  const end = findTextBoundary(query.input, query.end);
  if (!start || !end) return null;
  const range = document.createRange();
  range.setStart(start.node, start.offset);
  range.setEnd(end.node, end.offset);
  return range;
}

export function getQueryAnchorRect(query: PromptQuery, inputRect: DOMRect): DOMRect {
  const range = createQueryRange(query);
  if (!range || typeof range.getBoundingClientRect !== 'function') return inputRect;

  const rect = range.getBoundingClientRect();
  const isVisibleInsideInput =
    rect.height > 0 &&
    rect.bottom >= inputRect.top &&
    rect.top <= inputRect.bottom &&
    rect.right >= inputRect.left &&
    rect.left <= inputRect.right;
  return isVisibleInsideInput ? rect : inputRect;
}

/**
 * Grow the typed query into the whole name, the way the completion drawn past
 * the caret says it will. Only the query text changes: this is Tab as it works
 * in a shell, not a commit - Enter still places the token, and a template still
 * gets to ask for its values first.
 */
export function completeQuery(query: PromptQuery, name: string): boolean {
  const completed = `/${name.trim()}`;
  if (query.input instanceof HTMLTextAreaElement) {
    query.input.focus();
    query.input.setRangeText(completed, query.start, query.end, 'end');
    dispatchInput(query.input);
    return true;
  }
  const range = createQueryRange(query);
  if (!range) return false;
  range.deleteContents();
  const text = document.createTextNode(completed);
  range.insertNode(text);
  setCaretAfter(query.input, text);
  dispatchInput(query.input);
  return true;
}

export function setCaretAfter(input: HTMLElement, node: Node): void {
  const range = document.createRange();
  range.selectNodeContents(node);
  range.collapse(false);
  const selection = window.getSelection();
  if (!selection) return;
  input.focus();
  selection.removeAllRanges();
  selection.addRange(range);
}

export function dispatchInput(input: HTMLElement): void {
  input.dispatchEvent(new Event('input', { bubbles: true }));
}

export function getPromptAnchor(
  input: HTMLElement,
  prompt: PromptOccurrence,
): { nativeToken: HTMLElement | null; rect: DOMRect | null; styleSource: Element } {
  const start = findTextBoundary(input, prompt.start);
  const end = findTextBoundary(input, prompt.start + prompt.name.length);
  if (!start || !end) return { nativeToken: null, rect: null, styleSource: input };

  const range = document.createRange();
  range.setStart(start.node, start.offset);
  range.setEnd(end.node, end.offset);
  const startElement = start.node.parentElement;
  const nativeToken =
    startElement?.closest<HTMLElement>(`.${TOKEN_CLASS}`) ||
    Array.from(input.querySelectorAll<HTMLElement>(`.${TOKEN_CLASS}`)).find(
      (token) => token.dataset.gvPromptId === prompt.id && range.intersectsNode(token),
    ) ||
    null;
  const styleSource = nativeToken || startElement || input;
  if (typeof range.getBoundingClientRect === 'function') {
    const rangeRect = range.getBoundingClientRect();
    if (rangeRect.width && rangeRect.height) return { nativeToken, rect: rangeRect, styleSource };
  }
  const tokenRect = nativeToken?.getBoundingClientRect();
  return {
    nativeToken,
    rect: tokenRect?.width && tokenRect.height ? tokenRect : null,
    styleSource,
  };
}

export function getInputSelectionOffsets(
  input: HTMLElement,
): { start: number; end: number } | null {
  if (input instanceof HTMLTextAreaElement) {
    const start = input.selectionStart;
    const end = input.selectionEnd;
    return start === null || end === null ? null : { start, end };
  }

  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0) return null;
  const range = selection.getRangeAt(0);
  if (!input.contains(range.startContainer) || !input.contains(range.endContainer)) return null;

  const startRange = document.createRange();
  startRange.selectNodeContents(input);
  startRange.setEnd(range.startContainer, range.startOffset);
  const endRange = document.createRange();
  endRange.selectNodeContents(input);
  endRange.setEnd(range.endContainer, range.endOffset);
  return { start: startRange.toString().length, end: endRange.toString().length };
}
