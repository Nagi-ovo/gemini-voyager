import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { expandInputCollapseIfNeeded } from '../../inputCollapse/index';
import { startQuoteReply } from '../index';

vi.mock('../../inputCollapse/index', () => ({
  expandInputCollapseIfNeeded: vi.fn(),
}));

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
        toJSON: () => {},
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
            toJSON: () => {},
          }) as DOMRect,
      ),
      configurable: true,
    });

    Object.defineProperty(document, 'execCommand', {
      value: vi.fn().mockReturnValue(true),
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

    const selection = window.getSelection();
    const textNode = document.getElementById('source')?.firstChild;
    if (!(textNode instanceof Text)) {
      throw new Error('Expected a Text node for quote selection.');
    }

    const range = document.createRange();
    range.setStart(textNode, 0);
    range.setEnd(textNode, 5);
    selection?.removeAllRanges();
    selection?.addRange(range);

    document.dispatchEvent(new MouseEvent('mouseup'));
    vi.runAllTimers();

    const quoteButton = document.querySelector<HTMLElement>('.gv-quote-btn');
    expect(quoteButton).not.toBeNull();

    quoteButton?.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));

    expect(expandInputCollapseIfNeeded).toHaveBeenCalledTimes(1);

    cleanup();
  });
});
