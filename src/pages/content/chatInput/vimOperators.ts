import { getInputText, getCaretOffset, getSelectionRange } from './vimDomEditor';
import type { VimEditor } from './vimDomEditor';
import { getLineStart, getLineEnd, moveTextOffsetByGraphemes } from './vimMotions';

export type PendingOperator = 'd' | 'c' | 'y';
type OperatorMode = 'insert' | 'normal';

export function createVimOperators(editor: VimEditor) {
  let yankBuffer = '';
  let yankLinewise = false;

  function normalizeLinewiseText(text: string): string {
    return text.endsWith('\n') ? text : `${text}\n`;
  }

  function writeClipboard(text: string, linewise = false): void {
    if (!text) return;

    const nextText = linewise ? normalizeLinewiseText(text) : text;
    yankBuffer = nextText;
    yankLinewise = linewise;
    const writePromise = navigator.clipboard?.writeText?.(nextText);
    void writePromise?.catch(() => {
      // The in-memory buffer is enough for Vim paste when clipboard access is blocked.
    });
  }

  function openLine(input: HTMLElement, above: boolean, count: number): void {
    const text = getInputText(input);
    const caret = getCaretOffset(input);
    const insertAt = above ? getLineStart(text, caret) : getLineEnd(text, caret);
    const newlines = '\n'.repeat(Math.max(1, count));
    const nextCaret = above ? insertAt : insertAt + 1;

    editor.replaceRange(input, insertAt, insertAt, newlines);
    editor.setInputSelection(input, nextCaret);
  }

  function applyOperatorMotion(
    input: HTMLElement,
    operator: PendingOperator,
    target: number,
  ): OperatorMode {
    const caret = getCaretOffset(input);
    const text = getInputText(input);
    const from = Math.min(caret, target);
    const to = Math.max(caret, target);
    const selected = text.slice(from, to);

    if (operator === 'y') {
      writeClipboard(selected);
      editor.setInputSelection(input, caret);
      return 'normal';
    } else {
      yankBuffer = selected;
      yankLinewise = false;
      editor.replaceRange(input, from, to);
      return operator === 'c' ? 'insert' : 'normal';
    }
  }

  function applyOperatorLine(
    input: HTMLElement,
    operator: PendingOperator,
    count: number,
  ): OperatorMode | null {
    if (editor.applyBlockLines(input, operator, count, (text) => writeClipboard(text, true))) {
      return operator === 'c' ? 'insert' : null;
    }

    const text = getInputText(input);
    const caret = getCaretOffset(input);
    const start = getLineStart(text, caret);
    let end = start;

    for (let i = 0; i < count; i++) {
      const lineEnd = getLineEnd(text, end);
      end = operator === 'c' || lineEnd >= text.length ? lineEnd : lineEnd + 1;
    }

    const selected = text.slice(start, end);

    if (operator === 'y') {
      writeClipboard(selected, true);
      editor.setInputSelection(input, start);
    } else {
      writeClipboard(selected, true);
      editor.replaceRange(input, start, end);
    }

    return operator === 'c' ? 'insert' : null;
  }

  function deleteChars(input: HTMLElement, count: number): void {
    const caret = getCaretOffset(input);
    const text = getInputText(input);
    const end = moveTextOffsetByGraphemes(text, caret, 1, count);
    writeClipboard(text.slice(caret, end));
    editor.replaceRange(input, caret, end);
  }

  function deleteCharsBefore(input: HTMLElement, count: number): void {
    const caret = getCaretOffset(input);
    const text = getInputText(input);
    const start = moveTextOffsetByGraphemes(text, caret, -1, count);
    writeClipboard(text.slice(start, caret));
    editor.replaceRange(input, start, caret);
  }

  function paste(input: HTMLElement, before: boolean): boolean {
    if (!yankBuffer) return false;

    const text = getInputText(input);
    const caret = getCaretOffset(input);

    if (yankLinewise) {
      const lineStart = getLineStart(text, caret);
      const lineEnd = getLineEnd(text, caret);
      const buffer = normalizeLinewiseText(yankBuffer);

      if (before) {
        editor.replaceRange(input, lineStart, lineStart, buffer);
        editor.setInputSelection(input, lineStart);
        return true;
      }

      const isLastLine = lineEnd >= text.length;
      const insertAt = isLastLine ? text.length : lineEnd + 1;
      const prefix = isLastLine && text.length > 0 ? '\n' : '';
      const nextCaret = insertAt + prefix.length;
      editor.replaceRange(input, insertAt, insertAt, `${prefix}${buffer}`);
      editor.setInputSelection(input, nextCaret);
      return true;
    }

    const insertAt = before ? caret : moveTextOffsetByGraphemes(text, caret, 1, 1);
    editor.replaceRange(input, insertAt, insertAt, yankBuffer);
    return true;
  }

  function deleteToLineEnd(input: HTMLElement, change: boolean): OperatorMode {
    const text = getInputText(input);
    const caret = getCaretOffset(input);
    const end = getLineEnd(text, caret);
    writeClipboard(text.slice(caret, end));
    editor.replaceRange(input, caret, end);
    return change ? 'insert' : 'normal';
  }

  function applyVisualOperator(input: HTMLElement, operator: PendingOperator): OperatorMode {
    const range = getSelectionRange(input);
    const from = Math.min(range.start, range.end);
    const to = Math.max(range.start, range.end);
    const selected = getInputText(input).slice(from, to);

    if (operator === 'y') {
      writeClipboard(selected);
      editor.setInputSelection(input, from);
      return 'normal';
    } else {
      yankBuffer = selected;
      yankLinewise = false;
      editor.replaceRange(input, from, to);
      return operator === 'c' ? 'insert' : 'normal';
    }
  }

  return {
    openLine,
    applyOperatorMotion,
    applyOperatorLine,
    deleteChars,
    deleteCharsBefore,
    paste,
    deleteToLineEnd,
    applyVisualOperator,
  };
}
