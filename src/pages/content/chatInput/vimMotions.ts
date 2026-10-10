export type MotionKind = 'char-left' | 'char-right' | 'word-forward' | 'word-backward' | 'word-end';
export type LineMotionKind = 'line-start' | 'line-first-nonblank' | 'line-end';

export interface GraphemeRange {
  start: number;
  end: number;
}
interface LogicalLine {
  start: number;
  end: number;
}
interface SegmentLike {
  segment: string;
  index: number;
}
interface GraphemeSegmenter {
  segment(input: string): Iterable<SegmentLike>;
}
type IntlWithSegmenter = typeof Intl & {
  Segmenter?: new (
    locales?: string | string[],
    options?: { granularity: 'grapheme' },
  ) => GraphemeSegmenter;
};
export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function getGraphemeRanges(text: string): GraphemeRange[] {
  const ranges: GraphemeRange[] = [];
  const Segmenter = typeof Intl === 'undefined' ? undefined : (Intl as IntlWithSegmenter).Segmenter;

  if (Segmenter) {
    const segmenter = new Segmenter(undefined, { granularity: 'grapheme' });
    for (const segment of segmenter.segment(text)) {
      ranges.push({
        start: segment.index,
        end: segment.index + segment.segment.length,
      });
    }
    return ranges;
  }

  for (let index = 0; index < text.length;) {
    const codePoint = text.codePointAt(index);
    const nextIndex = index + (codePoint && codePoint > 0xffff ? 2 : 1);
    ranges.push({ start: index, end: nextIndex });
    index = nextIndex;
  }

  return ranges;
}

export function getNextGraphemeOffset(text: string, offset: number): number {
  const current = clamp(offset, 0, text.length);
  for (const range of getGraphemeRanges(text)) {
    if (current < range.start) return range.start;
    if (current < range.end) return range.end;
  }

  return text.length;
}

export function getPreviousGraphemeOffset(text: string, offset: number): number {
  const current = clamp(offset, 0, text.length);
  const ranges = getGraphemeRanges(text);

  for (let index = ranges.length - 1; index >= 0; index--) {
    const range = ranges[index];
    if (current > range.start) return range.start;
  }

  return 0;
}

export function moveTextOffsetByGraphemes(
  text: string,
  offset: number,
  direction: -1 | 1,
  count: number,
): number {
  let nextOffset = clamp(offset, 0, text.length);

  for (let index = 0; index < count; index++) {
    nextOffset =
      direction < 0
        ? getPreviousGraphemeOffset(text, nextOffset)
        : getNextGraphemeOffset(text, nextOffset);
  }

  return nextOffset;
}

export function getLogicalLines(text: string): LogicalLine[] {
  const lines: LogicalLine[] = [];
  let start = 0;

  for (let index = 0; index < text.length; index++) {
    if (text[index] !== '\n') continue;

    lines.push({ start, end: index });
    start = index + 1;
  }

  lines.push({ start, end: text.length });
  return lines;
}

export function getLineStart(text: string, offset: number): number {
  const index = text.lastIndexOf('\n', clamp(offset - 1, 0, text.length));
  return index < 0 ? 0 : index + 1;
}

export function getLineEnd(text: string, offset: number): number {
  const index = text.indexOf('\n', clamp(offset, 0, text.length));
  return index < 0 ? text.length : index;
}

export function getNormalModeCaretOffset(text: string, offset: number): number {
  const current = clamp(offset, 0, text.length);
  if (text.length === 0) return 0;

  const lineStart = getLineStart(text, current);
  const lineEnd = getLineEnd(text, current);
  if (lineStart === lineEnd) return lineStart;
  if (current >= lineEnd) return getPreviousGraphemeOffset(text, lineEnd);
  return current;
}

function getNextLineStart(text: string, offset: number): number {
  const currentEnd = getLineEnd(text, offset);
  return currentEnd >= text.length ? text.length : currentEnd + 1;
}

function getPreviousLineStart(text: string, offset: number): number {
  const currentStart = getLineStart(text, offset);
  if (currentStart === 0) return 0;
  return getLineStart(text, currentStart - 1);
}

export function getColumn(text: string, offset: number): number {
  return offset - getLineStart(text, offset);
}

export function getLineMotionOffset(text: string, offset: number, kind: LineMotionKind): number {
  const lineStart = getLineStart(text, offset);
  const lineEnd = getLineEnd(text, offset);

  if (kind === 'line-start') return lineStart;
  if (kind === 'line-end') return lineEnd;

  const line = text.slice(lineStart, lineEnd);
  const firstNonblank = line.search(/\S/);
  return firstNonblank < 0 ? lineStart : lineStart + firstNonblank;
}

export function moveVertical(
  text: string,
  offset: number,
  direction: -1 | 1,
  count: number,
  column: number,
): number {
  let targetLineStart = getLineStart(text, offset);

  for (let i = 0; i < count; i++) {
    targetLineStart =
      direction < 0
        ? getPreviousLineStart(text, targetLineStart)
        : getNextLineStart(text, targetLineStart);
  }

  const targetLineEnd = getLineEnd(text, targetLineStart);
  return clamp(targetLineStart + column, targetLineStart, targetLineEnd);
}

function isWordChar(char: string): boolean {
  if (!char) return false;
  return /[\p{L}\p{N}_]/u.test(char);
}

function findWordForward(text: string, offset: number, count: number): number {
  let index = clamp(offset, 0, text.length);

  for (let step = 0; step < count; step++) {
    if (index < text.length && isWordChar(text[index])) {
      while (index < text.length && isWordChar(text[index])) index++;
    }

    while (index < text.length && !isWordChar(text[index])) index++;
  }

  return index;
}

function findWordBackward(text: string, offset: number, count: number): number {
  let index = clamp(offset, 0, text.length);

  for (let step = 0; step < count; step++) {
    if (index > 0) index--;
    while (index > 0 && !isWordChar(text[index])) index--;
    while (index > 0 && isWordChar(text[index - 1])) index--;
  }

  return index;
}

function findWordEnd(text: string, offset: number, count: number): number {
  let index = clamp(offset, 0, text.length);

  for (let step = 0; step < count; step++) {
    if (index < text.length && isWordChar(text[index])) index++;
    while (index < text.length && !isWordChar(text[index])) index++;
    while (index + 1 < text.length && isWordChar(text[index + 1])) index++;
  }

  return clamp(index, 0, text.length);
}

export function getMotionOffset(
  text: string,
  caret: number,
  kind: MotionKind,
  count: number,
): number {
  if (kind === 'char-left') return moveTextOffsetByGraphemes(text, caret, -1, count);
  if (kind === 'char-right') return moveTextOffsetByGraphemes(text, caret, 1, count);
  if (kind === 'word-forward') return findWordForward(text, caret, count);
  if (kind === 'word-backward') return findWordBackward(text, caret, count);
  return findWordEnd(text, caret, count);
}
