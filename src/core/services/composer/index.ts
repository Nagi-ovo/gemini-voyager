import type { SiteAdapter } from '@/features/plugins/types';

import { insertQuillText, replaceQuillText } from './quill';
import { setTextFieldValue } from './textField';

export type ComposerInsertMode = 'append' | 'replace' | 'insertAtCursor';

export interface FindComposerOptions {
  readonly doc?: Document;
  /** Native health probes may count a folded composer as present. */
  readonly requireVisible?: boolean;
  /** Handoffs refuse ambiguous main composers instead of choosing one. */
  readonly requireUnique?: boolean;
}

const UNAVAILABLE = '[hidden], [inert], [aria-hidden="true"], [aria-disabled="true"]';
const TEXT_INPUT_TYPES = new Set(['text', 'search', 'email', 'url', 'tel', 'password']);

function isTextField(field: HTMLElement): field is HTMLTextAreaElement | HTMLInputElement {
  return (
    field instanceof HTMLTextAreaElement ||
    (field instanceof HTMLInputElement && TEXT_INPUT_TYPES.has(field.type))
  );
}

function isEditable(field: HTMLElement): boolean {
  if (field.matches(':disabled, [readonly]') || field.closest(UNAVAILABLE)) return false;
  return (
    isTextField(field) ||
    field.isContentEditable ||
    field.contentEditable === 'true' ||
    field.contentEditable === 'plaintext-only' ||
    field.matches('[contenteditable="true"], [contenteditable="plaintext-only"]')
  );
}

function isVisible(field: HTMLElement): boolean {
  if (field.getBoundingClientRect().height <= 0) return false;
  const view = field.ownerDocument.defaultView;
  for (let node: HTMLElement | null = field; node; node = node.parentElement) {
    const style = view?.getComputedStyle(node);
    if (
      style?.display === 'none' ||
      style?.visibility === 'hidden' ||
      style?.visibility === 'collapse'
    )
      return false;
  }
  return true;
}

/** Resolve only the adapter's composer, or an explicitly supplied selector. */
export function findComposer(
  adapterOrSelector: Pick<SiteAdapter, 'selectors'> | string | null,
  options: FindComposerOptions = {},
): HTMLElement | null {
  const selector =
    typeof adapterOrSelector === 'string'
      ? adapterOrSelector
      : adapterOrSelector?.selectors.composer;
  if (!selector) return null;
  const doc = options.doc ?? document;
  let candidates: HTMLElement[];
  try {
    candidates = Array.from(doc.querySelectorAll<HTMLElement>(selector)).filter(isEditable);
  } catch {
    return null;
  }
  const visible = candidates.filter(isVisible);
  const usable = visible.length > 0 || options.requireVisible !== false ? visible : candidates;
  if (options.requireUnique && usable.length !== 1) return null;
  return usable[0] ?? null;
}

function domText(node: Node): string {
  if (node.nodeType === Node.TEXT_NODE) return node.nodeValue ?? '';
  if (
    node instanceof Element &&
    /^(P|DIV)$/.test(node.tagName) &&
    node.childNodes.length === 1 &&
    node.firstChild instanceof Element &&
    node.firstChild.tagName === 'BR'
  )
    return '';
  if (node instanceof Element && node.tagName === 'BR') {
    return node.classList.contains('ProseMirror-trailingBreak') ? '' : '\n';
  }
  const children = Array.from(node.childNodes);
  return children
    .map((child, index) => {
      const isBlock = (candidate: Node) =>
        candidate instanceof Element && /^(P|DIV|LI)$/.test(candidate.tagName);
      const separator = index > 0 && (isBlock(child) || isBlock(children[index - 1])) ? '\n' : '';
      return separator + domText(child);
    })
    .join('');
}

/** Plain text only; attachment/mention emptiness remains the receiver's stricter check. */
export function readComposer(field: HTMLElement): string {
  if (isTextField(field)) return field.value;
  // innerText separates paragraphs with a blank line, so a read-back draft would grow on every restore.
  const text = domText(field)
    .replace(/\r\n?/g, '\n')
    .replace(/\u00a0/g, ' ');
  // An empty ProseMirror paragraph contributes a layout newline, not draft text.
  if (
    text.trim().length === 0 &&
    !field.textContent?.replace(/[\u200b\ufeff]/g, '') &&
    field.children.length <= 1 &&
    !field.querySelector('p p, p div, br + br')
  )
    return '';
  return text;
}

export function isQuillComposer(field: HTMLElement): boolean {
  return (
    !isTextField(field) &&
    (field.matches('.ql-editor, .ql-blank') || field.closest('rich-textarea') !== null)
  );
}

function insertTextField(
  field: HTMLTextAreaElement | HTMLInputElement,
  text: string,
  mode: ComposerInsertMode,
): void {
  field.focus();
  const current = field.value;
  const start =
    mode === 'replace'
      ? 0
      : mode === 'append'
        ? current.length
        : (field.selectionStart ?? current.length);
  const end =
    mode === 'replace'
      ? current.length
      : mode === 'append'
        ? current.length
        : (field.selectionEnd ?? start);
  const next = current.slice(0, start) + text + current.slice(end);
  if (next === current) return;
  setTextFieldValue(field, next, start + text.length);
}

function insertContentEditable(field: HTMLElement, text: string, mode: ComposerInsertMode): void {
  const doc = field.ownerDocument;
  const selection = doc.getSelection();
  if (!selection) return;
  const current = selection.rangeCount > 0 ? selection.getRangeAt(0) : null;
  const useCurrent =
    mode === 'insertAtCursor' && current && field.contains(current.commonAncestorContainer);
  const range = useCurrent ? current.cloneRange() : doc.createRange();
  if (!useCurrent) {
    range.selectNodeContents(field);
    if (mode !== 'replace') range.collapse(false);
  }
  field.focus();
  selection.removeAllRanges();
  selection.addRange(range);
  try {
    // ProseMirror needs a native editing transaction; DOM/beforeinput fallbacks lose host state.
    if (mode === 'replace' && text.length === 0) doc.execCommand('delete', false);
    else doc.execCommand('insertText', false, text);
  } catch {
    // Unavailable editing commands leave the host document unchanged.
  }
}

/** Edit only: no keyboard events, send-button clicks or form submission. */
export function insertIntoComposer(
  field: HTMLElement,
  text: string,
  mode: ComposerInsertMode,
): boolean {
  if (!isEditable(field) || (text.length === 0 && mode !== 'replace')) return false;
  const before = readComposer(field);
  if (isTextField(field)) {
    insertTextField(field, text, mode);
  } else if (isQuillComposer(field)) {
    if (mode === 'replace') replaceQuillText(field, text);
    else insertQuillText(field, text, mode);
  } else {
    insertContentEditable(field, text, mode);
  }
  return readComposer(field) !== before;
}
