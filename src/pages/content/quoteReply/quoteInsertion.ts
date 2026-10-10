import { getBrowserName } from '@/core/utils/browser';

import { findChatInput } from '../chatInput/index';
import { expandInputCollapseIfNeeded } from '../inputCollapse/index';

const INSERTION_DELAY_MS = 200;

function countLineBreaks(raw: string): number {
  return (raw.match(/\n/g) || []).length;
}

interface SeparatorInsertResult {
  inserted: boolean;
  insertedBreaks: number;
}

function getContenteditableQuoteSeparator(): string {
  // Firefox + Quill contenteditable tends to render an extra visual break
  // for double-newline insertion, so we use a single newline separator there.
  return getBrowserName() === 'Firefox' ? '\n' : '\n\n';
}

function getPlaceholderCandidates(input: HTMLElement): string[] {
  const richTextarea = input.closest('rich-textarea');
  const candidates = [
    input.getAttribute('data-placeholder'),
    input.getAttribute('aria-placeholder'),
    input.getAttribute('placeholder'),
    richTextarea?.getAttribute('data-placeholder'),
    richTextarea?.getAttribute('aria-placeholder'),
    richTextarea?.getAttribute('placeholder'),
  ];

  return candidates.filter((value): value is string => Boolean(value)).map((value) => value.trim());
}

function isChatInputEmpty(input: HTMLElement | HTMLTextAreaElement): boolean {
  if (input instanceof HTMLTextAreaElement) {
    return input.value.trim().length === 0;
  }

  const rawContent = input.innerText ?? input.textContent ?? '';
  const trimmedContent = rawContent.trim();

  // If visible text exists and it's not placeholder text, treat as non-empty even if
  // Quill's `ql-blank` class lags behind DOM updates.
  if (trimmedContent.length > 0) {
    const placeholders = getPlaceholderCandidates(input);
    const isPlaceholderText = placeholders.some(
      (placeholder) => placeholder.length > 0 && placeholder === trimmedContent,
    );
    if (!isPlaceholderText) {
      return false;
    }
  }

  // Gemini currently uses Quill internals. `ql-blank` is its canonical empty marker.
  if (input.classList.contains('ql-blank')) {
    return true;
  }

  return trimmedContent.length === 0;
}

/**
 * Attempts to insert separator text via execCommand and reports whether
 * content changed plus how many line breaks were observed as inserted.
 */
function tryInsertQuoteSeparator(input: HTMLElement, separator: string): SeparatorInsertResult {
  const beforeVisible = input.innerText ?? '';
  const beforeRaw = input.textContent ?? '';
  const beforeVisibleLineBreakCount = countLineBreaks(beforeVisible);
  const beforeRawLineBreakCount = countLineBreaks(beforeRaw);
  let ok = false;
  try {
    ok = document.execCommand('insertText', false, separator);
  } catch {
    ok = false;
  }
  if (!ok) return { inserted: false, insertedBreaks: 0 };

  const afterVisible = input.innerText ?? '';
  const afterRaw = input.textContent ?? '';
  if (afterVisible === beforeVisible && afterRaw === beforeRaw) {
    return { inserted: false, insertedBreaks: 0 };
  }

  const visibleLineBreakDelta = countLineBreaks(afterVisible) - beforeVisibleLineBreakCount;
  const rawLineBreakDelta = countLineBreaks(afterRaw) - beforeRawLineBreakCount;
  const insertedBreaks = Math.max(0, visibleLineBreakDelta, rawLineBreakDelta);
  return { inserted: true, insertedBreaks };
}

function focusChatInput(input: HTMLElement | HTMLTextAreaElement): void {
  if (document.activeElement === input) {
    return;
  }

  try {
    input.focus({ preventScroll: true });
  } catch {
    input.focus();
  }
}

/**
 * Replace math elements in a cloned DOM tree with LaTeX text nodes.
 * Gemini uses `.math-inline` / `.math-block` containers with `[data-math]` children.
 */
function replaceMathWithLatex(root: DocumentFragment): void {
  // 1. Replace .math-inline / .math-block containers
  for (const container of Array.from(root.querySelectorAll('.math-inline, .math-block'))) {
    const dataMathEl = container.querySelector('[data-math]');
    const latex = dataMathEl?.getAttribute('data-math');
    if (latex) {
      const isBlock = container.classList.contains('math-block');
      container.replaceWith(document.createTextNode(isBlock ? `$$${latex}$$` : `$${latex}$`));
    }
  }

  // 2. Handle any remaining [data-math] elements not inside a container
  for (const el of Array.from(root.querySelectorAll('[data-math]'))) {
    const latex = el.getAttribute('data-math');
    if (latex) {
      el.replaceWith(document.createTextNode(`$${latex}$`));
    }
  }
}

/**
 * Extract text from a Range, preserving LaTeX math syntax.
 *
 * `Range.toString()` returns visually rendered text, which loses LaTeX
 * delimiters (e.g. `U∈[0,1)` instead of `$U \in [0, 1)$`). This function
 * clones the range contents, replaces math elements with their `$...$` /
 * `$$...$$` LaTeX source, then returns the resulting text.
 */
function extractTextWithLatex(range: Range): string {
  const fragment = range.cloneContents();

  // Short-circuit: no math elements → use native Range.toString()
  if (!fragment.querySelector('.math-inline, .math-block, [data-math]')) {
    return range.toString();
  }

  replaceMathWithLatex(fragment);

  // Use a temporary element to get innerText (preserves newlines from block elements / <br>)
  const temp = document.createElement('div');
  temp.style.position = 'fixed';
  temp.style.left = '-9999px';
  temp.style.opacity = '0';
  temp.style.pointerEvents = 'none';
  temp.appendChild(fragment);
  document.body.appendChild(temp);
  // innerText preserves newlines from block elements / <br>; textContent is the fallback
  const text = temp.innerText ?? temp.textContent ?? '';
  temp.remove();

  return text;
}

function prepareContenteditableQuote(input: HTMLElement, quote: string, isInputEmpty: boolean) {
  // Try to insert a separator via execCommand in one shot.
  // If the command succeeds and mutates content, only the quote body
  // (or missing part of it) remains to be inserted.
  // If insertion does not mutate content, fall back to prepending separator.
  if (isInputEmpty) return { contentToInsert: quote, forceRangeInsertion: false };
  const quoteSeparator = getContenteditableQuoteSeparator();
  const requiredSeparatorBreaks = countLineBreaks(quoteSeparator);
  let contentToInsert: string;
  let forceRangeInsertion = false;
  const separatorResult = tryInsertQuoteSeparator(input, quoteSeparator);
  if (separatorResult.inserted) {
    const missingBreaks = Math.max(0, requiredSeparatorBreaks - separatorResult.insertedBreaks);
    contentToInsert = missingBreaks > 0 ? `${'\n'.repeat(missingBreaks)}${quote}` : quote;
    // Avoid re-running execCommand after partial mutation to prevent duplicate separators.
    forceRangeInsertion = missingBreaks > 0;
  } else {
    contentToInsert = `${quoteSeparator}${quote}`;
  }

  return { contentToInsert, forceRangeInsertion };
}

function appendContenteditableQuote(
  input: HTMLElement,
  quote: string,
  isInputEmpty: boolean,
): void {
  const sel = window.getSelection();

  // For empty editors, insert from start.
  if (sel) {
    const range = document.createRange();
    range.selectNodeContents(input);
    if (isInputEmpty) {
      range.collapse(true);
    } else {
      range.collapse(false); // Move cursor to very end
    }
    sel.removeAllRanges();
    sel.addRange(range);
  }

  const { contentToInsert, forceRangeInsertion } = prepareContenteditableQuote(
    input,
    quote,
    isInputEmpty,
  );

  // Quill handles text insertion better with native insertText command.
  // Fallback to manual Range insertion when command is unavailable.
  let inserted = false;
  if (!forceRangeInsertion) {
    try {
      inserted = document.execCommand('insertText', false, contentToInsert);
    } catch {
      inserted = false;
    }
  }

  if (!inserted) {
    const textNode = document.createTextNode(contentToInsert);
    if (sel && forceRangeInsertion) {
      const endRange = document.createRange();
      endRange.selectNodeContents(input);
      endRange.collapse(false);
      sel.removeAllRanges();
      sel.addRange(endRange);
    }

    if (sel && sel.rangeCount > 0) {
      const insertRange = sel.getRangeAt(0);
      insertRange.insertNode(textNode);

      // Move cursor to after the inserted text
      insertRange.setStartAfter(textNode);
      insertRange.setEndAfter(textNode);
      sel.removeAllRanges();
      sel.addRange(insertRange);
    } else {
      // Fallback: just append to the input
      input.appendChild(textNode);
    }
  }
}

function appendQuote(input: HTMLElement, quoteBody: string): void {
  // Resolve emptiness after the expansion delay; the user may have typed meanwhile.
  focusChatInput(input);
  const isInputEmpty = isChatInputEmpty(input);
  const quote = `${quoteBody}\n`;
  if (input instanceof HTMLTextAreaElement) {
    const prefix = isInputEmpty ? '' : '\n\n';
    input.value += `${prefix}${quote}`;
    input.selectionStart = input.selectionEnd = input.value.length;
  } else {
    appendContenteditableQuote(input, quote, isInputEmpty);
  }
  input.dispatchEvent(new Event('input', { bubbles: true }));
}

/** Schedule a quote in the live composer; false leaves the selection untouched. */
export function insertQuotedSelection(range: Range): boolean {
  const selectedText = extractTextWithLatex(range).trim();
  if (!selectedText) return false;

  const input = findChatInput();
  if (input) {
    expandInputCollapseIfNeeded();

    // Format: > selection
    // Prepare quote body (without leading/trailing newlines - those are added at insertion time)
    const quoteBody = selectedText
      .split('\n')
      .map((line) => `> ${line}`)
      .join('\n');

    // Ensure the input is visible
    input.scrollIntoView({ behavior: 'smooth', block: 'center' });

    // Wait for expansion while leaving focus/selection alone until insertion.
    setTimeout(() => appendQuote(input, quoteBody), INSERTION_DELAY_MS);

    return true;
  } else {
    console.warn('[Gemini Voyager] Could not find chat input.');
    return false;
  }
}
