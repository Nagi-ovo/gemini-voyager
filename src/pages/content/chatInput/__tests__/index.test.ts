import { beforeEach, describe, expect, it, vi } from 'vitest';

import { findChatInput, insertTextIntoChatInput } from '../index';

function setVisibleRect(element: HTMLElement): void {
  element.getBoundingClientRect = () =>
    ({
      height: 20,
      width: 200,
      top: 0,
      left: 0,
      right: 200,
      bottom: 20,
      x: 0,
      y: 0,
      toJSON: () => {},
    }) as DOMRect;
}

function mockInsertTextCommand(): void {
  Object.defineProperty(document, 'execCommand', {
    configurable: true,
    value: vi.fn((command: string, _showUi?: boolean, value?: string) => {
      if (command !== 'insertText' || typeof value !== 'string') {
        return false;
      }

      const selection = window.getSelection();
      if (!selection || selection.rangeCount === 0) {
        return false;
      }

      const range = selection.getRangeAt(0);
      range.deleteContents();

      const textNode = document.createTextNode(value);
      range.insertNode(textNode);

      const caretRange = document.createRange();
      caretRange.setStartAfter(textNode);
      caretRange.collapse(true);
      selection.removeAllRanges();
      selection.addRange(caretRange);

      return true;
    }),
  });
}

describe('chat input helpers', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    mockInsertTextCommand();
  });

  it('finds the visible Gemini input element', () => {
    document.body.innerHTML = `
      <rich-textarea>
        <div id="hidden-input" contenteditable="true"></div>
      </rich-textarea>
      <div id="input-area">
        <div id="visible-input" contenteditable="true" role="textbox"></div>
      </div>
    `;

    const hiddenInput = document.getElementById('hidden-input');
    const visibleInput = document.getElementById('visible-input');
    if (!(hiddenInput instanceof HTMLElement) || !(visibleInput instanceof HTMLElement)) {
      throw new Error('Expected test inputs.');
    }

    hiddenInput.getBoundingClientRect = () =>
      ({
        height: 0,
        width: 0,
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        x: 0,
        y: 0,
        toJSON: () => {},
      }) as DOMRect;
    setVisibleRect(visibleInput);

    expect(findChatInput()).toBe(visibleInput);
  });

  it('still prefers visible input when hidden matches are allowed', () => {
    document.body.innerHTML = `
      <rich-textarea>
        <div id="hidden-input" contenteditable="true"></div>
      </rich-textarea>
      <rich-textarea>
        <div id="visible-input" contenteditable="true" role="textbox"></div>
      </rich-textarea>
    `;

    const hiddenInput = document.getElementById('hidden-input');
    const visibleInput = document.getElementById('visible-input');
    if (!(hiddenInput instanceof HTMLElement) || !(visibleInput instanceof HTMLElement)) {
      throw new Error('Expected test inputs.');
    }

    hiddenInput.getBoundingClientRect = () =>
      ({
        height: 0,
        width: 0,
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        x: 0,
        y: 0,
        toJSON: () => {},
      }) as DOMRect;
    setVisibleRect(visibleInput);

    expect(findChatInput({ requireVisible: false })).toBe(visibleInput);
  });

  it('replaces the current contenteditable selection and dispatches input', () => {
    document.body.innerHTML = `
      <rich-textarea>
        <div id="input" contenteditable="true" role="textbox">Hello world</div>
      </rich-textarea>
    `;

    const input = document.getElementById('input');
    if (!(input instanceof HTMLElement) || !(input.firstChild instanceof Text)) {
      throw new Error('Expected contenteditable input.');
    }

    setVisibleRect(input);
    input.focus = vi.fn();

    const onInput = vi.fn();
    input.addEventListener('input', onInput);

    const range = document.createRange();
    range.setStart(input.firstChild, 6);
    range.setEnd(input.firstChild, 11);
    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);

    expect(insertTextIntoChatInput('Gemini', input)).toBe(true);
    expect(input.textContent).toBe('Hello Gemini');
    expect(onInput).toHaveBeenCalledTimes(1);
  });

  it('appends to the end when the current selection is outside the contenteditable input', () => {
    document.body.innerHTML = `
      <main>
        <p id="source">Outside selection</p>
      </main>
      <rich-textarea>
        <div id="input" contenteditable="true" role="textbox">Hello</div>
      </rich-textarea>
    `;

    const source = document.getElementById('source');
    const input = document.getElementById('input');
    if (
      !(source instanceof HTMLElement) ||
      !(source.firstChild instanceof Text) ||
      !(input instanceof HTMLElement)
    ) {
      throw new Error('Expected test elements.');
    }

    setVisibleRect(input);
    input.focus = vi.fn();

    const outsideRange = document.createRange();
    outsideRange.setStart(source.firstChild, 0);
    outsideRange.setEnd(source.firstChild, 7);
    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(outsideRange);

    expect(insertTextIntoChatInput(' Gemini', input)).toBe(true);
    expect(input.textContent).toBe('Hello Gemini');
  });

  it('replaces the current textarea selection and dispatches input', () => {
    document.body.innerHTML = '<textarea id="input">Hello world</textarea>';

    const input = document.getElementById('input');
    if (!(input instanceof HTMLTextAreaElement)) {
      throw new Error('Expected textarea input.');
    }

    setVisibleRect(input);
    input.focus = vi.fn();
    input.selectionStart = 6;
    input.selectionEnd = 11;

    const onInput = vi.fn();
    input.addEventListener('input', onInput);

    expect(insertTextIntoChatInput('Gemini', input)).toBe(true);
    expect(input.value).toBe('Hello Gemini');
    expect(input.selectionStart).toBe(12);
    expect(input.selectionEnd).toBe(12);
    expect(onInput).toHaveBeenCalledTimes(1);
  });

  it('falls back to manual contenteditable insertion when execCommand fails', () => {
    document.body.innerHTML = `
      <rich-textarea>
        <div id="input" class="ql-blank" contenteditable="true" role="textbox"></div>
      </rich-textarea>
    `;

    const input = document.getElementById('input');
    if (!(input instanceof HTMLElement)) {
      throw new Error('Expected contenteditable input.');
    }

    setVisibleRect(input);
    input.focus = vi.fn();

    vi.spyOn(document, 'execCommand').mockReturnValue(false);

    expect(insertTextIntoChatInput('Hello', input)).toBe(true);
    expect(input.textContent).toBe('Hello');
    expect(input.classList.contains('ql-blank')).toBe(false);
  });
});
