import { beforeEach, describe, expect, it, vi } from 'vitest';

import { setInputText } from '../inputHelper';

// jsdom does not implement document.execCommand; stub it globally.
Object.defineProperty(document, 'execCommand', {
  value: vi.fn().mockReturnValue(true),
  writable: true,
  configurable: true,
});

describe('setInputText', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    vi.mocked(document.execCommand).mockReturnValue(true);
  });

  it('sets value on a textarea and dispatches input event', () => {
    const textarea = document.createElement('textarea');
    document.body.appendChild(textarea);
    const listener = vi.fn();
    textarea.addEventListener('input', listener);

    setInputText(textarea, 'Hello world');

    expect(textarea.value).toBe('Hello world');
    expect(listener).toHaveBeenCalledOnce();
  });

  it('does not steal focus or reset an unchanged textarea caret during draft replacement', () => {
    const textarea = document.createElement('textarea');
    const other = document.createElement('button');
    document.body.append(textarea, other);
    textarea.value = 'same draft';
    textarea.setSelectionRange(2, 4);
    other.focus();
    const listener = vi.fn();
    textarea.addEventListener('input', listener);

    setInputText(textarea, 'same draft');
    expect(document.activeElement).toBe(other);
    expect(textarea.selectionStart).toBe(2);
    expect(textarea.selectionEnd).toBe(4);
    expect(listener).toHaveBeenCalledOnce();
  });

  it('removes ql-blank class on a Quill contenteditable element', () => {
    const div = document.createElement('div');
    div.contentEditable = 'true';
    div.classList.add('ql-blank');
    document.body.appendChild(div);

    setInputText(div, 'some text');

    expect(div.classList.contains('ql-blank')).toBe(false);
  });

  it('dispatches input event on a contenteditable element', () => {
    const div = document.createElement('div');
    div.contentEditable = 'true';
    document.body.appendChild(div);
    const listener = vi.fn();
    div.addEventListener('input', listener);

    setInputText(div, 'test');

    expect(listener).toHaveBeenCalledOnce();
  });

  it('replaces existing content in a contenteditable element', () => {
    const div = document.createElement('div');
    div.contentEditable = 'true';
    div.textContent = 'old text';
    document.body.appendChild(div);

    setInputText(div, 'new text');

    expect(document.execCommand).toHaveBeenCalledWith('insertText', false, 'new text');
  });

  it('falls back to textContent when execCommand returns false', () => {
    const div = document.createElement('div');
    div.contentEditable = 'true';
    document.body.appendChild(div);
    vi.mocked(document.execCommand).mockReturnValue(false);

    setInputText(div, 'fallback text');

    // execCommand returned false, so textContent should be set as fallback
    expect(div.textContent).toBe('fallback text');
  });
});
