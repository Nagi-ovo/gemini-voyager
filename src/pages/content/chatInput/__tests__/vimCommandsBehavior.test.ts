import { describe, expect, it, vi } from 'vitest';

import { setupVimTestEnvironment, createTextareaInput, commandsFor } from './vimHarness';

setupVimTestEnvironment();

describe('Vim command behavior', () => {
  it('opens a line above with O and enters insert mode', async () => {
    const input = createTextareaInput('hello\nworld');
    input.selectionStart = 7;
    input.selectionEnd = 7;

    const commands = commandsFor(input);

    commands.handleKey(new KeyboardEvent('keydown', { key: 'Escape' }), input);
    commands.handleKey(new KeyboardEvent('keydown', { key: 'O' }), input);

    expect(input.value).toBe('hello\n\nworld');
    expect(input.selectionStart).toBe(6);
    expect(commands.mode).toBe('insert');
  });

  it('opens a line below with o and enters insert mode', async () => {
    const input = createTextareaInput('hello\nworld');
    input.selectionStart = 1;
    input.selectionEnd = 1;

    const commands = commandsFor(input);

    commands.handleKey(new KeyboardEvent('keydown', { key: 'Escape' }), input);
    commands.handleKey(new KeyboardEvent('keydown', { key: 'o' }), input);

    expect(input.value).toBe('hello\n\nworld');
    expect(input.selectionStart).toBe(6);
    expect(commands.mode).toBe('insert');
  });

  it('clamps the normal-mode caret to the final character when leaving insert at EOF', async () => {
    const input = createTextareaInput('hello');
    input.selectionStart = 5;
    input.selectionEnd = 5;

    const commands = commandsFor(input);

    commands.handleKey(new KeyboardEvent('keydown', { key: 'Escape' }), input);

    expect(input.selectionStart).toBe(4);
    expect(input.selectionEnd).toBe(4);
  });

  it('keeps G on the final character in normal mode', async () => {
    const input = createTextareaInput('hello');
    input.selectionStart = 1;
    input.selectionEnd = 1;

    const commands = commandsFor(input);

    commands.handleKey(new KeyboardEvent('keydown', { key: 'Escape' }), input);
    commands.handleKey(new KeyboardEvent('keydown', { key: 'G' }), input);

    expect(input.selectionStart).toBe(4);
    expect(input.selectionEnd).toBe(4);
  });

  it('moves the textarea caret with h and l in normal mode', async () => {
    const input = createTextareaInput('hello');
    input.selectionStart = 2;
    input.selectionEnd = 2;

    const commands = commandsFor(input);

    commands.handleKey(new KeyboardEvent('keydown', { key: 'Escape' }), input);
    commands.handleKey(new KeyboardEvent('keydown', { key: 'h' }), input);
    expect(input.selectionStart).toBe(1);

    commands.handleKey(new KeyboardEvent('keydown', { key: 'l' }), input);
    expect(input.selectionStart).toBe(2);
  });

  it('substitutes the current character with s and enters insert mode', async () => {
    const input = createTextareaInput('hello');
    input.selectionStart = 1;
    input.selectionEnd = 1;

    const commands = commandsFor(input);

    commands.handleKey(new KeyboardEvent('keydown', { key: 'Escape' }), input);
    commands.handleKey(new KeyboardEvent('keydown', { key: 's' }), input);

    expect(input.value).toBe('hllo');
    expect(input.selectionStart).toBe(1);
    expect(commands.mode).toBe('insert');
  });

  it('clears the current line with cc and enters insert mode', async () => {
    const input = createTextareaInput('one\ntwo\nthree');
    input.selectionStart = 5;
    input.selectionEnd = 5;

    const commands = commandsFor(input);

    commands.handleKey(new KeyboardEvent('keydown', { key: 'Escape' }), input);
    commands.handleKey(new KeyboardEvent('keydown', { key: 'c' }), input);
    commands.handleKey(new KeyboardEvent('keydown', { key: 'c' }), input);

    expect(input.value).toBe('one\n\nthree');
    expect(input.selectionStart).toBe(4);
    expect(commands.mode).toBe('insert');
  });

  it('extends selection in visual mode and deletes it', async () => {
    const input = createTextareaInput('hello');
    input.selectionStart = 1;
    input.selectionEnd = 1;

    const commands = commandsFor(input);

    commands.handleKey(new KeyboardEvent('keydown', { key: 'Escape' }), input);
    commands.handleKey(new KeyboardEvent('keydown', { key: 'v' }), input);
    commands.handleKey(new KeyboardEvent('keydown', { key: 'l' }), input);
    commands.handleKey(new KeyboardEvent('keydown', { key: 'l' }), input);

    expect(input.selectionStart).toBe(1);
    expect(input.selectionEnd).toBe(3);

    commands.handleKey(new KeyboardEvent('keydown', { key: 'd' }), input);

    expect(input.value).toBe('hlo');
    expect(commands.mode).toBe('normal');
  });

  it('changes selected text with c in visual mode', async () => {
    const input = createTextareaInput('hello');
    input.selectionStart = 1;
    input.selectionEnd = 1;

    const commands = commandsFor(input);

    commands.handleKey(new KeyboardEvent('keydown', { key: 'Escape' }), input);
    commands.handleKey(new KeyboardEvent('keydown', { key: 'v' }), input);
    commands.handleKey(new KeyboardEvent('keydown', { key: 'l' }), input);
    commands.handleKey(new KeyboardEvent('keydown', { key: 'l' }), input);
    commands.handleKey(new KeyboardEvent('keydown', { key: 'c' }), input);

    expect(input.value).toBe('hlo');
    expect(commands.mode).toBe('insert');
  });

  it('copies selected text with y in visual mode', async () => {
    const input = createTextareaInput('hello');
    input.selectionStart = 1;
    input.selectionEnd = 1;
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText },
    });

    const commands = commandsFor(input);

    commands.handleKey(new KeyboardEvent('keydown', { key: 'Escape' }), input);
    commands.handleKey(new KeyboardEvent('keydown', { key: 'v' }), input);
    commands.handleKey(new KeyboardEvent('keydown', { key: 'l' }), input);
    commands.handleKey(new KeyboardEvent('keydown', { key: 'l' }), input);
    commands.handleKey(new KeyboardEvent('keydown', { key: 'y' }), input);

    expect(writeText).toHaveBeenCalledWith('el');
    expect(commands.mode).toBe('normal');
  });

  it('deletes the character before the caret with X', async () => {
    const input = createTextareaInput('hello');
    input.selectionStart = 2;
    input.selectionEnd = 2;

    const commands = commandsFor(input);

    commands.handleKey(new KeyboardEvent('keydown', { key: 'Escape' }), input);

    commands.handleKey(new KeyboardEvent('keydown', { key: 'X' }), input);

    expect(input.value).toBe('hllo');
    expect(input.selectionStart).toBe(1);
  });

  it('pastes a yy line above the current line with P', async () => {
    const input = createTextareaInput('one\ntwo\nthree');
    input.selectionStart = 5;
    input.selectionEnd = 5;

    const commands = commandsFor(input);

    commands.handleKey(new KeyboardEvent('keydown', { key: 'Escape' }), input);

    commands.handleKey(new KeyboardEvent('keydown', { key: 'y' }), input);
    commands.handleKey(new KeyboardEvent('keydown', { key: 'y' }), input);
    commands.handleKey(new KeyboardEvent('keydown', { key: 'P' }), input);

    expect(input.value).toBe('one\ntwo\ntwo\nthree');
    expect(input.selectionStart).toBe(4);
  });

  it('pastes a yy line below the current line with p', async () => {
    const input = createTextareaInput('one\ntwo\nthree');
    input.selectionStart = 5;
    input.selectionEnd = 5;

    const commands = commandsFor(input);

    commands.handleKey(new KeyboardEvent('keydown', { key: 'Escape' }), input);

    commands.handleKey(new KeyboardEvent('keydown', { key: 'y' }), input);
    commands.handleKey(new KeyboardEvent('keydown', { key: 'y' }), input);
    commands.handleKey(new KeyboardEvent('keydown', { key: 'p' }), input);

    expect(input.value).toBe('one\ntwo\ntwo\nthree');
    expect(input.selectionStart).toBe(8);
  });
});
