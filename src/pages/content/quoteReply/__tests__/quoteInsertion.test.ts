import { afterEach, describe, expect, it, onTestFinished, vi } from 'vitest';

import { expandInputCollapseIfNeeded } from '../../inputCollapse/index';
import { startSelectionToolbarHost } from '../../selectionToolbar/host';
import { startQuoteAction } from '../quoteAction';
import { insertQuotedSelection } from '../quoteInsertion';

vi.mock('../../inputCollapse/index', () => ({ expandInputCollapseIfNeeded: vi.fn() }));

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  document.body.replaceChildren();
});

it('delays insertion, reads the updated composer and preserves the textarea caret', () => {
  vi.useFakeTimers();
  document.body.innerHTML = '<p>Hello</p><textarea></textarea>';
  const range = document.createRange();
  range.selectNodeContents(document.querySelector('p')!);
  const input = document.querySelector('textarea')!;
  vi.spyOn(input, 'getBoundingClientRect').mockReturnValue({ height: 20 } as DOMRect);
  input.scrollIntoView = vi.fn();
  const onInput = vi.fn();
  input.addEventListener('input', onInput);

  expect(insertQuotedSelection(range)).toBe(true);
  expect(expandInputCollapseIfNeeded).toHaveBeenCalledOnce();
  vi.advanceTimersByTime(199);
  expect(input.value).toBe('');
  input.value = 'Typed during expansion';
  // Selection may change after acceptance without changing the scheduled quote.
  range.selectNodeContents(input);
  vi.advanceTimersByTime(1);
  expect(input.value).toBe('Typed during expansion\n\n> Hello\n');
  expect(input.selectionStart).toBe(input.value.length);
  expect(input.selectionEnd).toBe(input.value.length);
  expect(document.activeElement).toBe(input);
  expect(onInput).toHaveBeenCalledOnce();
});

it('leaves a hidden editor outside input collapse untouched when quoting', () => {
  vi.useFakeTimers();
  document.body.innerHTML = '<p>Hello</p><textarea style="visibility:hidden">Draft</textarea>';
  const range = document.createRange();
  range.selectNodeContents(document.querySelector('p')!);
  const input = document.querySelector('textarea')!;
  vi.spyOn(input, 'getBoundingClientRect').mockReturnValue({ height: 20 } as DOMRect);
  input.scrollIntoView = vi.fn();
  const selection = window.getSelection()!;
  selection.removeAllRanges();
  selection.addRange(range);

  expect(insertQuotedSelection(range)).toBe(false);
  vi.advanceTimersByTime(200);
  expect(input.value).toBe('Draft');
  expect(selection.toString()).toBe('Hello');
});

it('does not drop quoted text from a React-controlled textarea', () => {
  vi.useFakeTimers();
  document.body.innerHTML = '<p>Hello</p><textarea>Draft</textarea>';
  const range = document.createRange();
  range.selectNodeContents(document.querySelector('p')!);
  const input = document.querySelector('textarea')!;
  vi.spyOn(input, 'getBoundingClientRect').mockReturnValue({ height: 20 } as DOMRect);
  input.scrollIntoView = vi.fn();
  const nativeValue = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!;
  let tracked = input.value;
  let hostDraft = input.value;
  Object.defineProperty(input, 'value', {
    get: () => nativeValue.get!.call(input),
    set: (next: string) => {
      tracked = next;
      nativeValue.set!.call(input, next);
    },
  });
  input.addEventListener('input', () => {
    if (tracked === input.value) return;
    hostDraft = tracked = input.value;
  });

  expect(insertQuotedSelection(range)).toBe(true);
  vi.advanceTimersByTime(200);
  expect(hostDraft).toBe('Draft\n\n> Hello\n');
  expect(input.selectionStart).toBe(input.value.length);
  expect(input.selectionEnd).toBe(input.value.length);
});

describe('accepted quotes stay in the chat they were taken from', () => {
  function setup(): { range: Range; input: HTMLTextAreaElement } {
    vi.useFakeTimers();
    window.history.replaceState(null, '', '/u/0/app/first');
    document.body.innerHTML =
      '<span data-email="first@example.com"></span><p>Hello</p><textarea></textarea>';
    const range = document.createRange();
    range.selectNodeContents(document.querySelector('p')!);
    const input = document.querySelector('textarea')!;
    vi.spyOn(input, 'getBoundingClientRect').mockReturnValue({ height: 20 } as DOMRect);
    input.scrollIntoView = vi.fn();
    return { range, input };
  }

  afterEach(() => {
    window.history.replaceState(null, '', '/');
  });

  it('a quote clicked before turning quote off is still inserted in the same chat', () => {
    const { input } = setup();
    document.body.insertAdjacentHTML(
      'afterbegin',
      '<main><div class="conversation-container"><p id="answer">Answer</p></div></main>',
    );
    // jsdom has no Range geometry; the toolbar only needs a visible selection.
    Object.defineProperty(Range.prototype, 'getBoundingClientRect', {
      configurable: true,
      value: () => ({ width: 10, height: 10, top: 0, bottom: 10, left: 0 }) as DOMRect,
    });
    onTestFinished(() => {
      Reflect.deleteProperty(Range.prototype, 'getBoundingClientRect');
    });
    const stopHost = startSelectionToolbarHost();
    const stopQuote = startQuoteAction();
    const range = document.createRange();
    range.selectNodeContents(document.getElementById('answer')!);
    window.getSelection()!.removeAllRanges();
    window.getSelection()!.addRange(range);
    document.dispatchEvent(new MouseEvent('mouseup'));
    vi.advanceTimersByTime(250);

    document.querySelector<HTMLButtonElement>('.gv-quote-btn')!.click();
    stopQuote();
    stopHost();
    vi.advanceTimersByTime(200);

    expect(input.value).toBe('> Answer\n');
  });

  it('a pending quote is dropped after navigating to another chat', () => {
    const { range, input } = setup();
    expect(insertQuotedSelection(range)).toBe(true);

    window.history.pushState(null, '', '/u/0/app/second');
    vi.advanceTimersByTime(200);

    expect(input.value).toBe('');
  });

  it('still inserts when the first send gives a new chat its conversation route', () => {
    const { range, input } = setup();
    window.history.replaceState(null, '', '/u/0/app');
    expect(insertQuotedSelection(range)).toBe(true);

    window.history.replaceState(null, '', '/u/0/app/created');
    vi.advanceTimersByTime(200);

    expect(input.value).toBe('> Hello\n');
  });

  it('still inserts when Gemini rewrites /app/x into /u/0/app/x during the action', () => {
    const { range, input } = setup();
    window.history.replaceState(null, '', '/app/first');
    expect(insertQuotedSelection(range)).toBe(true);

    window.history.replaceState(null, '', '/u/0/app/first');
    vi.advanceTimersByTime(200);

    expect(input.value).toBe('> Hello\n');
  });

  it('a pending quote is dropped when /app/x turns into another account slot', () => {
    const { range, input } = setup();
    window.history.replaceState(null, '', '/app/first');
    expect(insertQuotedSelection(range)).toBe(true);

    window.history.replaceState(null, '', '/u/1/app/first');
    vi.advanceTimersByTime(200);

    expect(input.value).toBe('');
  });

  it('a pending quote is dropped after switching account', () => {
    const { range, input } = setup();
    expect(insertQuotedSelection(range)).toBe(true);

    document.querySelector('[data-email]')!.setAttribute('data-email', 'second@example.com');
    vi.advanceTimersByTime(200);

    expect(input.value).toBe('');
  });

  it('a pending quote is dropped when the composer is replaced', () => {
    const { range, input } = setup();
    expect(insertQuotedSelection(range)).toBe(true);

    const replacement = document.createElement('textarea');
    input.replaceWith(replacement);
    vi.advanceTimersByTime(200);

    expect(input.value).toBe('');
    expect(replacement.value).toBe('');
  });
});
