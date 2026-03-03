import { describe, expect, it } from 'vitest';

import { getFirstLines, isTruncated, normalizeText, truncateText } from '../text';

describe('normalizeText', () => {
  it('collapses multiple spaces into a single space', () => {
    expect(normalizeText('hello   world')).toBe('hello world');
  });

  it('trims leading and trailing whitespace', () => {
    expect(normalizeText('  hello world  ')).toBe('hello world');
  });

  it('returns empty string for null input', () => {
    expect(normalizeText(null as unknown as string)).toBe('');
  });

  it('returns empty string for undefined input', () => {
    expect(normalizeText(undefined as unknown as string)).toBe('');
  });

  it('returns the string unchanged when already single-spaced', () => {
    expect(normalizeText('hello world')).toBe('hello world');
  });

  it('normalizes mixed whitespace (tabs, newlines) to single spaces', () => {
    expect(normalizeText('hello\t\nworld')).toBe('hello world');
  });
});

describe('truncateText', () => {
  it('returns the original string when shorter than maxLength', () => {
    expect(truncateText('hello', 10)).toBe('hello');
  });

  it('truncates and appends ellipsis (U+2026) when longer than maxLength', () => {
    const result = truncateText('hello world', 8);
    expect(result.endsWith('…')).toBe(true);
    expect(result.length).toBe(8);
  });

  it('does not truncate when length exactly equals maxLength', () => {
    const text = 'exactly10!';
    expect(text.length).toBe(10);
    expect(truncateText(text, 10)).toBe(text);
  });

  it('does not throw on empty string', () => {
    expect(() => truncateText('', 5)).not.toThrow();
    expect(truncateText('', 5)).toBe('');
  });
});

describe('getFirstLines', () => {
  it('returns the first N non-empty lines', () => {
    const text = 'line1\nline2\nline3\nline4';
    expect(getFirstLines(text, 2)).toBe('line1\nline2');
  });

  it('filters out blank lines', () => {
    const text = 'line1\n\nline2\n\nline3';
    expect(getFirstLines(text, 2)).toBe('line1\nline2');
  });

  it('returns all lines when count exceeds available non-empty lines', () => {
    const text = 'line1\nline2';
    expect(getFirstLines(text, 100)).toBe('line1\nline2');
  });

  it('does not throw on empty string', () => {
    expect(() => getFirstLines('', 3)).not.toThrow();
    expect(getFirstLines('', 3)).toBe('');
  });

  it('trims whitespace from individual lines', () => {
    const text = '  line1  \n  line2  ';
    expect(getFirstLines(text, 2)).toBe('line1\nline2');
  });
});

describe('isTruncated', () => {
  function createElement(
    scrollWidth: number,
    clientWidth: number,
    scrollHeight: number,
    clientHeight: number,
  ): HTMLElement {
    const el = document.createElement('div');
    Object.defineProperty(el, 'scrollWidth', { value: scrollWidth, configurable: true });
    Object.defineProperty(el, 'clientWidth', { value: clientWidth, configurable: true });
    Object.defineProperty(el, 'scrollHeight', { value: scrollHeight, configurable: true });
    Object.defineProperty(el, 'clientHeight', { value: clientHeight, configurable: true });
    return el;
  }

  it('returns true when scrollWidth > clientWidth', () => {
    const el = createElement(200, 100, 50, 50);
    expect(isTruncated(el)).toBe(true);
  });

  it('returns true when scrollHeight > clientHeight', () => {
    const el = createElement(100, 100, 200, 100);
    expect(isTruncated(el)).toBe(true);
  });

  it('returns false when neither dimension overflows', () => {
    const el = createElement(100, 100, 100, 100);
    expect(isTruncated(el)).toBe(false);
  });

  it('returns false when scroll dimensions are smaller than client dimensions', () => {
    const el = createElement(50, 100, 50, 100);
    expect(isTruncated(el)).toBe(false);
  });
});
