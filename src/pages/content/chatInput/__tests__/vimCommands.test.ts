import { afterEach, describe, expect, it } from 'vitest';

import { createVimCommands } from '../vimCommands';
import { createVimEditor } from '../vimDomEditor';

function composer(text: string, caret: number) {
  const input = document.createElement('textarea');
  input.value = text;
  input.selectionStart = input.selectionEnd = caret;
  document.body.append(input);
  const editor = createVimEditor(() => {});
  const commands = createVimCommands(editor, () => input, {
    modeChanged: () => {},
    commandChanged: () => {},
  });
  commands.enterMode('normal');
  const key = (value: string): boolean =>
    commands.handleKey(new KeyboardEvent('keydown', { key: value }), input) !== null;
  return { input, commands, key };
}

afterEach(() => {
  document.body.innerHTML = '';
});

describe('Vim command sequences', () => {
  it.each([
    { keys: ['2', 'd', 'w'], text: 'three four', caret: 0, mode: 'normal' },
    { keys: ['c', 'w'], text: 'two three four', caret: 0, mode: 'insert' },
    { keys: ['w', 'd', '$'], text: 'one ', caret: 3, mode: 'normal' },
    { keys: ['w', 'c', '$'], text: 'one ', caret: 4, mode: 'insert' },
    { keys: ['w', 'e', 'd', '0'], text: 'o three four', caret: 0, mode: 'normal' },
    { keys: ['w', 'b'], text: 'one two three four', caret: 0, mode: 'normal' },
    { keys: ['2', 'w'], text: 'one two three four', caret: 8, mode: 'normal' },
    { keys: ['g', 'g'], text: 'one two three four', caret: 0, mode: 'normal' },
  ])('executes $keys with its count and operator', ({ keys, text, caret, mode }) => {
    const { input, commands, key } = composer('one two three four', 0);
    for (const value of keys) expect(key(value)).toBe(true);
    expect(input.value).toBe(text);
    expect(input.selectionStart).toBe(caret);
    expect(commands.mode).toBe(mode);
    expect(commands.buffer).toBe('');
  });

  it('deletes and pastes whole emoji and combining graphemes, then undoes each edit', () => {
    const text = 'a👩‍💻e\u0301b';
    const { input, key } = composer(text, 1);
    for (const value of ['2', 'x']) key(value);
    expect(input.value).toBe('ab');
    key('P');
    expect(input.value).toBe(text);
    expect(input.selectionStart).toBe(8);
    key('u');
    expect(input.value).toBe('ab');
    key('u');
    expect(input.value).toBe(text);
  });

  it('keeps the desired logical column through a short line and resets it on horizontal motion', () => {
    const { input, key } = composer('abcdef\nx\nuvwxyz', 4);
    key('j');
    expect(input.selectionStart).toBe(7);
    key('j');
    expect(input.selectionStart).toBe(13);
    key('l');
    key('k');
    expect(input.selectionStart).toBe(7);
    key('k');
    expect(input.selectionStart).toBe(5);
  });

  it.each(['h', 'H', 'ArrowLeft', 'l', 'L', 'ArrowRight'])(
    'shares %s between normal and visual mode',
    (motion) => {
      const { input, commands, key } = composer('abcdef', 2);
      key(motion);
      const normalTarget = input.selectionStart;
      input.selectionStart = input.selectionEnd = 0;
      key('v');
      input.selectionStart = input.selectionEnd = 2;
      key(motion);
      expect(input.selectionEnd).toBe(normalTarget);
      expect(commands.mode).toBe('visual');
    },
  );

  it('keeps a count when paste has no register and clears it on an unsupported key', () => {
    const { input, commands, key } = composer('abcdef', 2);
    key('3');
    key('p');
    expect(commands.buffer).toBe('3');
    expect(input.value).toBe('abcdef');
    key('q');
    expect(commands.buffer).toBe('');
  });

  it('retains the yank register across command resets', () => {
    const { input, commands, key } = composer('abc', 1);
    key('x');
    input.value = 'other';
    input.selectionStart = input.selectionEnd = 0;
    commands.resetCommandState();
    key('P');
    expect(input.value).toBe('bother');
  });
});
