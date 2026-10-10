import { getInputText, getCaretOffset, getSelectionRange } from './vimDomEditor';
import type { VimEditor } from './vimDomEditor';
import { getRenderedLineMotionOffset } from './vimLayout';
import {
  clamp,
  getColumn,
  getLineMotionOffset,
  getNormalModeCaretOffset,
  getMotionOffset as calculateMotionOffset,
  moveVertical,
} from './vimMotions';
import type { MotionKind, LineMotionKind } from './vimMotions';
import { createVimOperators } from './vimOperators';
import type { PendingOperator } from './vimOperators';

export type VimMode = 'insert' | 'normal' | 'visual';

interface CommandState {
  mode: VimMode;
  countBuffer: string;
  pendingOperator: PendingOperator | null;
  commandBuffer: string;
  visualAnchor: number | null;
  desiredColumn: number | null;
  desiredRenderedColumn: number | null;
}

type Motion =
  | { kind: 'text'; motion: MotionKind }
  | { kind: 'line'; motion: LineMotionKind }
  | { kind: 'vertical'; direction: -1 | 1 };
const MOTIONS = new Map(
  Object.entries({
    h: { kind: 'text', motion: 'char-left' },
    H: { kind: 'text', motion: 'char-left' },
    ArrowLeft: { kind: 'text', motion: 'char-left' },
    l: { kind: 'text', motion: 'char-right' },
    L: { kind: 'text', motion: 'char-right' },
    ArrowRight: { kind: 'text', motion: 'char-right' },
    w: { kind: 'text', motion: 'word-forward' },
    b: { kind: 'text', motion: 'word-backward' },
    e: { kind: 'text', motion: 'word-end' },
    j: { kind: 'vertical', direction: 1 },
    ArrowDown: { kind: 'vertical', direction: 1 },
    k: { kind: 'vertical', direction: -1 },
    ArrowUp: { kind: 'vertical', direction: -1 },
    '0': { kind: 'line', motion: 'line-start' },
    '^': { kind: 'line', motion: 'line-first-nonblank' },
    $: { kind: 'line', motion: 'line-end' },
  } satisfies Record<string, Motion>),
);

export function shouldIgnoreKey(event: KeyboardEvent): boolean {
  return (
    event.isComposing ||
    event.altKey ||
    (event.metaKey && event.key !== 'Enter' && !isBrowserEditingShortcut(event)) ||
    (event.ctrlKey &&
      event.key !== '[' &&
      event.key !== 'Enter' &&
      !isBrowserEditingShortcut(event))
  );
}

function isPlainPrintableKey(event: KeyboardEvent): boolean {
  return event.key.length === 1 && !event.altKey && !event.ctrlKey && !event.metaKey;
}

function isBrowserEditingShortcut(event: KeyboardEvent): boolean {
  if ((!event.ctrlKey && !event.metaKey) || event.altKey) return false;

  const key = event.key.toLowerCase();
  return key === 'a' || key === 'v' || key === 'x' || key === 'y' || key === 'z';
}

function isBlockedCommandModeEditingKey(event: KeyboardEvent): boolean {
  return event.key === 'Backspace' || event.key === 'Delete' || isBrowserEditingShortcut(event);
}

function isRepeatSensitiveCommandKey(key: string): boolean {
  return (
    key === 'd' ||
    key === 'c' ||
    key === 'x' ||
    key === 'X' ||
    key === 's' ||
    key === 'D' ||
    key === 'C' ||
    key === 'p' ||
    key === 'P' ||
    key === 'u' ||
    key === 'o' ||
    key === 'O'
  );
}

function isEscapeKey(event: KeyboardEvent): boolean {
  return event.key === 'Escape' || (event.ctrlKey && event.key === '[');
}

export function createVimCommands(
  editor: VimEditor,
  getActiveInput: () => HTMLElement | null,
  effects: { modeChanged: () => void; commandChanged: () => void },
) {
  const state: CommandState = {
    mode: 'insert',
    countBuffer: '',
    pendingOperator: null,
    commandBuffer: '',
    visualAnchor: null,
    desiredColumn: null,
    desiredRenderedColumn: null,
  };
  const operators = createVimOperators(editor);

  function completeCommand(preserveDesiredColumn = false): void {
    resetCommandState(preserveDesiredColumn);
    effects.commandChanged();
  }
  function resetCommandState(preserveDesiredColumn = false): void {
    state.countBuffer = '';
    state.pendingOperator = null;
    state.commandBuffer = '';
    if (!preserveDesiredColumn) {
      state.desiredColumn = null;
      state.desiredRenderedColumn = null;
    }
  }

  function getMotionOffset(input: HTMLElement, kind: MotionKind, count: number): number {
    state.desiredColumn = null;
    return calculateMotionOffset(getInputText(input), getCaretOffset(input), kind, count);
  }

  function getCount(): number {
    const count = Number.parseInt(state.countBuffer, 10);
    return Number.isFinite(count) && count > 0 ? count : 1;
  }

  function enterMode(mode: VimMode): void {
    const activeInput = getActiveInput();
    state.mode = mode;

    if (mode !== 'visual') {
      state.visualAnchor = null;
    }

    if (mode === 'normal' && activeInput) {
      const text = getInputText(activeInput);
      const caret = getCaretOffset(activeInput);
      const normalCaret = getNormalModeCaretOffset(text, caret);
      if (normalCaret !== caret) {
        editor.setInputSelection(activeInput, normalCaret);
      }
    }

    effects.modeChanged();
  }

  function setVisualSelection(input: HTMLElement, target: number): void {
    const text = getInputText(input);
    const anchor = state.visualAnchor ?? getCaretOffset(input);
    state.visualAnchor = anchor;

    editor.setInputSelection(input, anchor, clamp(target, 0, text.length));
  }

  function moveCaret(input: HTMLElement, target: number): void {
    if (state.mode === 'visual') {
      setVisualSelection(input, target);
      return;
    }

    editor.setInputSelection(input, target);
  }

  function handleMotion(input: HTMLElement, kind: MotionKind, count: number): void {
    const target = getMotionOffset(input, kind, count);

    if (state.pendingOperator) {
      enterMode(operators.applyOperatorMotion(input, state.pendingOperator, target));
      completeCommand();
      return;
    }

    moveCaret(
      input,
      state.mode === 'normal' ? getNormalModeCaretOffset(getInputText(input), target) : target,
    );
    completeCommand();
  }

  function handleLineMotion(input: HTMLElement, kind: LineMotionKind): void {
    const text = getInputText(input);
    const rawTarget = getLineMotionOffset(text, getCaretOffset(input), kind);

    if (state.pendingOperator) {
      enterMode(operators.applyOperatorMotion(input, state.pendingOperator, rawTarget));
      completeCommand();
      return;
    }

    const target = state.mode === 'normal' ? getNormalModeCaretOffset(text, rawTarget) : rawTarget;
    moveCaret(input, target);
    completeCommand();
  }

  function handleVerticalMotion(input: HTMLElement, direction: -1 | 1): void {
    const count = getCount();

    if (!state.pendingOperator) {
      const renderedTarget = getRenderedLineMotionOffset(
        input,
        direction,
        count,
        state.desiredRenderedColumn,
      );
      if (renderedTarget !== null) {
        state.desiredRenderedColumn = renderedTarget.column;
        moveCaret(
          input,
          state.mode === 'normal'
            ? getNormalModeCaretOffset(getInputText(input), renderedTarget.offset)
            : renderedTarget.offset,
        );
        completeCommand(true);
        return;
      }
    }

    const text = getInputText(input);
    const column = state.desiredColumn ?? getColumn(text, getCaretOffset(input));
    state.desiredColumn = column;
    const target = moveVertical(text, getCaretOffset(input), direction, count, column);

    if (state.pendingOperator) {
      enterMode(operators.applyOperatorMotion(input, state.pendingOperator, target));
      completeCommand();
      return;
    }

    moveCaret(input, state.mode === 'normal' ? getNormalModeCaretOffset(text, target) : target);
    completeCommand(true);
  }

  function appendDigit(key: string): boolean {
    if (key === '0' && state.countBuffer.length === 0) {
      return false;
    }

    state.countBuffer += key;
    state.commandBuffer = '';
    effects.commandChanged();
    return true;
  }

  function handleInsertMode(event: KeyboardEvent, input: HTMLElement): boolean {
    if (!isEscapeKey(event)) return false;

    const caret = getCaretOffset(input);
    editor.setInputSelection(input, caret);
    resetCommandState();
    enterMode('normal');
    effects.commandChanged();
    return true;
  }

  function handleMappedMotion(input: HTMLElement, key: string, count: number): boolean {
    const motion = MOTIONS.get(key);
    if (!motion) return false;
    if (motion.kind === 'text') handleMotion(input, motion.motion, count);
    else if (motion.kind === 'line') handleLineMotion(input, motion.motion);
    else handleVerticalMotion(input, motion.direction);
    return true;
  }

  function beginOperator(input: HTMLElement, operator: PendingOperator, count: number): void {
    if (state.pendingOperator === operator) {
      const mode = operators.applyOperatorLine(input, operator, count);
      if (mode) enterMode(mode);
      completeCommand();
      return;
    }
    state.pendingOperator = operator;
    state.commandBuffer = operator;
    effects.commandChanged();
  }

  function openLine(input: HTMLElement, above: boolean, count: number): void {
    operators.openLine(input, above, count);
    completeCommand();
    enterMode('insert');
  }

  function paste(input: HTMLElement, before: boolean): void {
    if (operators.paste(input, before)) completeCommand();
  }

  function deleteToLineEnd(input: HTMLElement, change: boolean): void {
    enterMode(operators.deleteToLineEnd(input, change));
    completeCommand();
  }

  const normalCommands = new Map(
    Object.entries({
      i: () => {
        resetCommandState();
        enterMode('insert');
      },
      a: (input) => {
        moveCaret(input, getMotionOffset(input, 'char-right', 1));
        resetCommandState();
        enterMode('insert');
      },
      I: (input) => {
        handleLineMotion(input, 'line-first-nonblank');
        enterMode('insert');
      },
      A: (input) => {
        const text = getInputText(input);
        editor.setInputSelection(
          input,
          getLineMotionOffset(text, getCaretOffset(input), 'line-end'),
        );
        resetCommandState();
        enterMode('insert');
      },
      o: (input, count) => openLine(input, false, count),
      O: (input, count) => openLine(input, true, count),
      v: (input) => {
        state.visualAnchor = getCaretOffset(input);
        resetCommandState();
        enterMode('visual');
      },
      u: (input) => {
        editor.restoreUndo(input);
        completeCommand();
      },
      x: (input, count) => {
        operators.deleteChars(input, count);
        completeCommand();
      },
      X: (input, count) => {
        operators.deleteCharsBefore(input, count);
        completeCommand();
      },
      s: (input, count) => {
        operators.deleteChars(input, count);
        completeCommand();
        enterMode('insert');
      },
      p: (input) => paste(input, false),
      P: (input) => paste(input, true),
      D: (input) => deleteToLineEnd(input, false),
      C: (input) => deleteToLineEnd(input, true),
      d: (input, count) => beginOperator(input, 'd', count),
      c: (input, count) => beginOperator(input, 'c', count),
      y: (input, count) => beginOperator(input, 'y', count),
      g: (input) => {
        if (state.commandBuffer === 'g') {
          editor.setInputSelection(input, 0);
          completeCommand();
        } else {
          state.commandBuffer = 'g';
          effects.commandChanged();
        }
      },
      G: (input) => {
        const text = getInputText(input);
        editor.setInputSelection(input, getNormalModeCaretOffset(text, text.length));
        completeCommand();
      },
    } satisfies Record<string, (input: HTMLElement, count: number) => void>),
  );

  function handleNormalMode(event: KeyboardEvent, input: HTMLElement): boolean {
    const key = event.key;
    const count = getCount();
    if (/^\d$/.test(key) && appendDigit(key)) return true;
    if (isEscapeKey(event)) {
      resetCommandState();
      enterMode('normal');
      return true;
    }
    const command = normalCommands.get(key);
    if (command) {
      command(input, count);
      return true;
    }
    return handleMappedMotion(input, key, count);
  }

  function handleVisualMode(event: KeyboardEvent, input: HTMLElement): boolean {
    const key = event.key;
    const count = getCount();
    if (isEscapeKey(event)) {
      const range = getSelectionRange(input);
      editor.setInputSelection(input, Math.min(range.start, range.end));
      resetCommandState();
      enterMode('normal');
      return true;
    }
    if (key === 'd' || key === 'c' || key === 'y') {
      enterMode(operators.applyVisualOperator(input, key));
      completeCommand();
      return true;
    }
    if (/^\d$/.test(key) && appendDigit(key)) return true;
    return handleMappedMotion(input, key, count);
  }

  function handleKey(event: KeyboardEvent, input: HTMLElement): 'command' | 'blocked' | null {
    const handled =
      state.mode === 'insert'
        ? handleInsertMode(event, input)
        : state.mode === 'visual'
          ? handleVisualMode(event, input)
          : handleNormalMode(event, input);
    if (handled) return 'command';
    if (
      state.mode !== 'insert' &&
      (isBlockedCommandModeEditingKey(event) || isPlainPrintableKey(event))
    ) {
      completeCommand();
      return 'blocked';
    }
    return null;
  }

  function isRepeatBlocked(event: KeyboardEvent): boolean {
    return (
      event.repeat &&
      state.mode !== 'insert' &&
      !state.pendingOperator &&
      isRepeatSensitiveCommandKey(event.key)
    );
  }

  return {
    get mode() {
      return state.mode;
    },
    get buffer() {
      return `${state.countBuffer}${state.pendingOperator ?? state.commandBuffer}`;
    },
    resetCommandState,
    enterMode,
    handleKey,
    isRepeatBlocked,
  };
}
