import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { expandInputCollapseIfNeeded } from '../../inputCollapse/index';
import { startQuoteReply } from '../index';

vi.mock('../../inputCollapse/index', () => ({
  expandInputCollapseIfNeeded: vi.fn(),
}));

function selectSourceText(start = 0, end = 5) {
  const selection = window.getSelection();
  const textNode = document.getElementById('source')?.firstChild;
  if (!(textNode instanceof Text)) {
    throw new Error('Expected a Text node for quote selection.');
  }

  const range = document.createRange();
  range.setStart(textNode, start);
  range.setEnd(textNode, end);
  selection?.removeAllRanges();
  selection?.addRange(range);
}

function triggerQuoteReply() {
  selectSourceText();
  document.dispatchEvent(new MouseEvent('mouseup'));
  vi.runAllTimers();

  const quoteButton = document.querySelector<HTMLElement>('.gv-quote-btn');
  if (!(quoteButton instanceof HTMLElement)) {
    throw new Error('Expected quote button to be present.');
  }

  quoteButton.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
  vi.runAllTimers();
}

describe('quote reply', () => {
  beforeEach(() => {
    vi.useFakeTimers();

    document.body.innerHTML = `
      <main>
        <p id="source">Hello world</p>
      </main>
      <div id="input-container">
        <rich-textarea>
          <div id="input" contenteditable="true"></div>
        </rich-textarea>
      </div>
    `;

    const input = document.getElementById('input') as HTMLElement;
    input.getBoundingClientRect = () =>
      ({
        height: 20,
        width: 100,
        top: 0,
        left: 0,
        bottom: 20,
        right: 100,
        x: 0,
        y: 0,
        toJSON: () => { },
      }) as DOMRect;
    input.focus = vi.fn();
    input.scrollIntoView = vi.fn();

    Object.defineProperty(Range.prototype, 'getBoundingClientRect', {
      value: vi.fn(
        () =>
          ({
            height: 10,
            width: 10,
            top: 0,
            left: 0,
            bottom: 10,
            right: 10,
            x: 0,
            y: 0,
            toJSON: () => { },
          }) as DOMRect,
      ),
      configurable: true,
    });

    Object.defineProperty(document, 'execCommand', {
      value: vi.fn((command: string, _showUI?: boolean, value?: string) => {
        if (command !== 'insertText' || typeof value !== 'string') {
          return false;
        }
        const input = document.getElementById('input');
        if (!(input instanceof HTMLElement)) {
          return false;
        }
        input.textContent = (input.textContent ?? '') + value;
        return true;
      }),
      configurable: true,
    });
  });

  afterEach(() => {
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
    vi.restoreAllMocks();
    document.body.innerHTML = '';
  });

  it('expands input collapse when using quote reply', () => {
    const cleanup = startQuoteReply();
    triggerQuoteReply();

    expect(expandInputCollapseIfNeeded).toHaveBeenCalledTimes(1);

    cleanup();
  });

  it('treats ql-blank editor as empty even if placeholder text exists', () => {
    const cleanup = startQuoteReply();
    const input = document.getElementById('input');
    if (!(input instanceof HTMLElement)) {
      throw new Error('Expected quote input element.');
    }

    input.classList.add('ql-blank');
    input.setAttribute('data-placeholder', 'Message Gemini');
    input.textContent = 'Message Gemini';

    triggerQuoteReply();

    expect(input.textContent).toBe('Message Gemini> Hello\n');

    cleanup();
  });

  it('treats stale ql-blank with real user text as non-empty', () => {
    const cleanup = startQuoteReply();
    const input = document.getElementById('input');
    if (!(input instanceof HTMLElement)) {
      throw new Error('Expected quote input element.');
    }

    input.classList.add('ql-blank');
    input.setAttribute('data-placeholder', 'Message Gemini');
    input.textContent = '已有内容';

    triggerQuoteReply();

    expect(input.textContent).toBe('已有内容\n\n> Hello\n');

    cleanup();
  });

  it('adds a blank line when input has visible text', () => {
    const cleanup = startQuoteReply();
    const input = document.getElementById('input');
    if (!(input instanceof HTMLElement)) {
      throw new Error('Expected quote input element.');
    }

    input.textContent = 'Existing';

    triggerQuoteReply();

    expect(input.textContent).toBe('Existing\n\n> Hello\n');

    cleanup();
  });

  it('falls back to Range insertion when execCommand is unavailable', () => {
    const cleanup = startQuoteReply();
    const input = document.getElementById('input');
    if (!(input instanceof HTMLElement)) {
      throw new Error('Expected quote input element.');
    }

    const execCommandMock = vi.spyOn(document, 'execCommand').mockReturnValue(false);
    input.textContent = 'Existing';

    triggerQuoteReply();

    expect(execCommandMock).toHaveBeenCalledWith('insertText', false, '\n\n> Hello\n');
    expect(input.textContent).toBe('Existing\n\n> Hello\n');

    cleanup();
  });

  it('inserts explicit line break for non-empty input when leading newline is swallowed', () => {
    const cleanup = startQuoteReply();
    const input = document.getElementById('input');
    if (!(input instanceof HTMLElement)) {
      throw new Error('Expected quote input element.');
    }

    input.textContent = 'Existing';
    const execCommandMock = vi.spyOn(document, 'execCommand').mockImplementation(
      (command: string, _showUI?: boolean, value?: string) => {
        if (command === 'insertText' && typeof value === 'string') {
          const stripped = value.startsWith('\n') ? value.slice(1) : value;
          input.textContent = `${input.textContent ?? ''}${stripped}`;
          return true;
        }
        return false;
      },
    );

    triggerQuoteReply();

    expect(execCommandMock.mock.calls).toEqual(
      expect.arrayContaining([
        ['insertText', false, '\n\n'],
        ['insertText', false, '\n\n> Hello\n'],
      ]),
    );
    expect(input.textContent).toBe('Existing\n\n> Hello\n');

    cleanup();
  });

  it('keeps leading newline fallback when separator command does not change content', () => {
    const cleanup = startQuoteReply();
    const input = document.getElementById('input');
    if (!(input instanceof HTMLElement)) {
      throw new Error('Expected quote input element.');
    }

    input.textContent = 'Existing';
    const execCommandMock = vi.spyOn(document, 'execCommand').mockImplementation(
      (command: string, _showUI?: boolean, value?: string) => {
        if (command === 'insertText' && typeof value === 'string') {
          if (value === '\n\n') {
            return true; // Pretend success but do not mutate content
          }
          input.textContent = `${input.textContent ?? ''}${value}`;
          return true;
        }
        return false;
      },
    );

    triggerQuoteReply();

    expect(execCommandMock.mock.calls).toEqual(
      expect.arrayContaining([
        ['insertText', false, '\n\n'],
        ['insertText', false, '\n\n> Hello\n'],
      ]),
    );
    expect(input.textContent).toBe('Existing\n\n> Hello\n');

    cleanup();
  });

  it('treats separator as inserted when only innerText reflects line breaks', () => {
    const cleanup = startQuoteReply();
    const input = document.getElementById('input');
    if (!(input instanceof HTMLElement)) {
      throw new Error('Expected quote input element.');
    }

    const state = {
      visible: 'Existing',
      raw: 'Existing',
    };

    Object.defineProperty(input, 'innerText', {
      configurable: true,
      get: () => state.visible,
      set: (value: string) => {
        state.visible = value;
      },
    });

    Object.defineProperty(input, 'textContent', {
      configurable: true,
      get: () => state.raw,
      set: (value: string | null) => {
        state.raw = value ?? '';
      },
    });

    const execCommandMock = vi.spyOn(document, 'execCommand').mockImplementation(
      (command: string, _showUI?: boolean, value?: string) => {
        if (command !== 'insertText' || typeof value !== 'string') {
          return false;
        }

        if (value === '\n\n') {
          // Simulate Quill: visual line breaks changed, raw textContent unchanged.
          state.visible = `${state.visible}\n\n`;
          return true;
        }

        state.visible = `${state.visible}${value}`;
        state.raw = `${state.raw}${value.replace(/\n/g, '')}`;
        return true;
      },
    );

    triggerQuoteReply();

    expect(execCommandMock.mock.calls).toEqual(
      expect.arrayContaining([
        ['insertText', false, '\n\n'],
        ['insertText', false, '> Hello\n'],
      ]),
    );
    expect(execCommandMock).not.toHaveBeenCalledWith('insertText', false, '\n\n> Hello\n');
    expect(state.visible).toBe('Existing\n\n> Hello\n');

    cleanup();
  });
});
