import { describe, expect, it } from 'vitest';

import { parseSegments } from '../index';

describe('parseSegments', () => {
  it('returns a single text segment for plain text without $', () => {
    const result = parseSegments('Hello world');
    expect(result).toEqual([{ kind: 'text', value: 'Hello world' }]);
  });

  it('returns empty array for empty string', () => {
    const result = parseSegments('');
    expect(result).toEqual([]);
  });

  describe('inline math ($...$)', () => {
    it('parses simple inline math', () => {
      const result = parseSegments('$E=mc^2$');
      expect(result).toEqual([{ kind: 'math', value: 'E=mc^2', display: false }]);
    });

    it('parses inline math starting with a letter', () => {
      const result = parseSegments('$x^2 + y^2 = r^2$');
      expect(result).toEqual([{ kind: 'math', value: 'x^2 + y^2 = r^2', display: false }]);
    });

    it('parses inline math with Greek letters', () => {
      const result = parseSegments('$\\alpha + \\beta$');
      expect(result).toEqual([{ kind: 'math', value: '\\alpha + \\beta', display: false }]);
    });

    it('parses text with inline math in the middle', () => {
      const result = parseSegments('The formula $E=mc^2$ is famous');
      expect(result).toEqual([
        { kind: 'text', value: 'The formula ' },
        { kind: 'math', value: 'E=mc^2', display: false },
        { kind: 'text', value: ' is famous' },
      ]);
    });

    it('parses multiple inline math segments', () => {
      const result = parseSegments('$a$ and $b$');
      expect(result).toEqual([
        { kind: 'math', value: 'a', display: false },
        { kind: 'text', value: ' and ' },
        { kind: 'math', value: 'b', display: false },
      ]);
    });

    it('parses digit-leading math like $2x+1$', () => {
      const result = parseSegments('$2x+1$');
      expect(result).toEqual([{ kind: 'math', value: '2x+1', display: false }]);
    });

    it('parses $10^2$ as math (not currency)', () => {
      const result = parseSegments('$10^2$');
      expect(result).toEqual([{ kind: 'math', value: '10^2', display: false }]);
    });

    it('parses $3\\times 4$ as math', () => {
      const result = parseSegments('$3\\times 4$');
      expect(result).toEqual([{ kind: 'math', value: '3\\times 4', display: false }]);
    });
  });

  describe('display math ($$...$$)', () => {
    it('parses simple display math', () => {
      const result = parseSegments('$$\\sum_{i=1}^{n} i$$');
      expect(result).toEqual([{ kind: 'math', value: '\\sum_{i=1}^{n} i', display: true }]);
    });

    it('parses text with display math', () => {
      const result = parseSegments('Here: $$x^2$$ done');
      expect(result).toEqual([
        { kind: 'text', value: 'Here: ' },
        { kind: 'math', value: 'x^2', display: true },
        { kind: 'text', value: ' done' },
      ]);
    });
  });

  describe('currency patterns (should NOT be parsed as math)', () => {
    it('skips $5 (currency)', () => {
      const result = parseSegments('I paid $5 for it');
      expect(result).toEqual([{ kind: 'text', value: 'I paid $5 for it' }]);
    });

    it('skips $100 followed by later $200', () => {
      const result = parseSegments('Cost $100 and $200');
      expect(result).toEqual([{ kind: 'text', value: 'Cost $100 and $200' }]);
    });

    it('skips purely numeric content like $5$', () => {
      const result = parseSegments('$5$');
      expect(result).toEqual([{ kind: 'text', value: '$5$' }]);
    });

    it('skips decimal currency like $3.50$', () => {
      const result = parseSegments('$3.50$');
      expect(result).toEqual([{ kind: 'text', value: '$3.50$' }]);
    });

    it('skips $100K as currency', () => {
      const result = parseSegments('Worth $100K today');
      expect(result).toEqual([{ kind: 'text', value: 'Worth $100K today' }]);
    });

    it('skips $5M followed by real math', () => {
      const result = parseSegments('Revenue $5M and $x^2$');
      expect(result).toEqual([
        { kind: 'text', value: 'Revenue $5M and ' },
        { kind: 'math', value: 'x^2', display: false },
      ]);
    });

    it('does not corrupt parsing after a skipped currency span', () => {
      const result = parseSegments('$5$ and $x$');
      expect(result).toEqual([
        { kind: 'text', value: '$5$ and ' },
        { kind: 'math', value: 'x', display: false },
      ]);
    });

    it('handles multiple currency spans followed by real math', () => {
      const result = parseSegments('$10 and $20 then $E=mc^2$');
      expect(result).toEqual([
        { kind: 'text', value: '$10 and $20 then ' },
        { kind: 'math', value: 'E=mc^2', display: false },
      ]);
    });

    it('preserves later math after standalone currency token', () => {
      const result = parseSegments('I have $5 and the equation $E=mc^2$ is cool');
      expect(result).toEqual([
        { kind: 'text', value: 'I have $5 and the equation ' },
        { kind: 'math', value: 'E=mc^2', display: false },
        { kind: 'text', value: ' is cool' },
      ]);
    });
  });

  describe('edge cases', () => {
    it('treats unclosed $ as plain text', () => {
      const result = parseSegments('only $one dollar');
      expect(result).toEqual([{ kind: 'text', value: 'only $one dollar' }]);
    });

    it('treats unclosed $$ as plain text', () => {
      const result = parseSegments('only $$unclosed');
      expect(result).toEqual([{ kind: 'text', value: 'only $$unclosed' }]);
    });

    it('skips empty inline math ($$ with no content)', () => {
      const result = parseSegments('$$ nothing');
      expect(result).toEqual([{ kind: 'text', value: '$$ nothing' }]);
    });

    it('handles inline $ not matching $$ delimiters', () => {
      // $x$ followed by $$y$$ — inline should not consume the $$ boundary
      const result = parseSegments('$x$ and $$y$$');
      expect(result).toEqual([
        { kind: 'math', value: 'x', display: false },
        { kind: 'text', value: ' and ' },
        { kind: 'math', value: 'y', display: true },
      ]);
    });

    it('does not let inline $ close on a $$ boundary', () => {
      // $x + $$y$$ — the inline $ should not close at the first $ of $$
      const result = parseSegments('$x + $$y$$');
      // The $ at position 0 cannot find a standalone closing $, so it's text
      // Then $$y$$ is parsed as display math
      expect(result).toEqual([
        { kind: 'text', value: '$x + ' },
        { kind: 'math', value: 'y', display: true },
      ]);
    });
  });
});
