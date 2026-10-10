import { afterEach, expect, it, vi } from 'vitest';

import { expandInputCollapseIfNeeded } from '../../inputCollapse/index';
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
