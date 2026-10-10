import {
  getInputText,
  getCaretOffset,
  getBlockLineEntries,
  getLineBlockText,
  createRangeForTextOffsets,
  findTextPositionInElement,
} from './vimDomEditor';
import {
  clamp,
  getGraphemeRanges,
  getNextGraphemeOffset,
  getPreviousGraphemeOffset,
  getLogicalLines,
} from './vimMotions';
import type { GraphemeRange } from './vimMotions';

interface RenderedCharacter {
  start: number;
  end: number;
  rect: DOMRect;
  centerX: number;
  isEmptyLine?: boolean;
}

interface RenderedLine {
  top: number;
  bottom: number;
  items: RenderedCharacter[];
}

const CARET_SCROLL_PADDING = 12;
const TEXTAREA_MIRROR_CLASS = 'gv-input-vim-textarea-mirror';
const TEXTAREA_MARKER_CLASS = 'gv-input-vim-textarea-marker';
const TEXTAREA_MIRROR_STYLE_PROPERTIES = [
  'border-bottom-width',
  'border-left-width',
  'border-right-width',
  'border-top-width',
  'direction',
  'font-family',
  'font-feature-settings',
  'font-kerning',
  'font-size',
  'font-stretch',
  'font-style',
  'font-variant',
  'font-weight',
  'letter-spacing',
  'line-height',
  'padding-bottom',
  'padding-left',
  'padding-right',
  'padding-top',
  'tab-size',
  'text-align',
  'text-indent',
  'text-rendering',
  'text-transform',
  'word-break',
  'word-spacing',
] as const;

function hasScrollableContent(element: HTMLElement): boolean {
  return element.scrollHeight > element.clientHeight || element.scrollWidth > element.clientWidth;
}

function getScrollContainer(input: HTMLElement): HTMLElement | null {
  if (hasScrollableContent(input)) return input;

  for (
    let element = input.parentElement;
    element && element !== document.body;
    element = element.parentElement
  ) {
    if (hasScrollableContent(element)) return element;
  }

  return null;
}

function scrollRectIntoContainer(container: HTMLElement, rect: DOMRect): void {
  const containerRect = container.getBoundingClientRect();
  const scrollTop = container.scrollTop;
  const scrollLeft = container.scrollLeft;
  const maxScrollTop = Math.max(0, container.scrollHeight - container.clientHeight);
  const maxScrollLeft = Math.max(0, container.scrollWidth - container.clientWidth);

  if (rect.bottom > containerRect.bottom - CARET_SCROLL_PADDING) {
    container.scrollTop = clamp(
      scrollTop + (rect.bottom - containerRect.bottom) + CARET_SCROLL_PADDING,
      0,
      maxScrollTop,
    );
  } else if (rect.top < containerRect.top + CARET_SCROLL_PADDING) {
    container.scrollTop = clamp(
      scrollTop - (containerRect.top - rect.top) - CARET_SCROLL_PADDING,
      0,
      maxScrollTop,
    );
  }

  if (rect.right > containerRect.right - CARET_SCROLL_PADDING) {
    container.scrollLeft = clamp(
      scrollLeft + (rect.right - containerRect.right) + CARET_SCROLL_PADDING,
      0,
      maxScrollLeft,
    );
  } else if (rect.left < containerRect.left + CARET_SCROLL_PADDING) {
    container.scrollLeft = clamp(
      scrollLeft - (containerRect.left - rect.left) - CARET_SCROLL_PADDING,
      0,
      maxScrollLeft,
    );
  }
}

export function scrollCaretIntoView(input: HTMLElement, offset: number): void {
  const container = getScrollContainer(input);
  if (!container) return;

  const rect = getCaretRect(input, offset);
  if (!rect) return;

  scrollRectIntoContainer(container, rect);
}

function isUsableRect(rect: DOMRect | undefined): rect is DOMRect {
  return Boolean(
    rect &&
    Number.isFinite(rect.left) &&
    Number.isFinite(rect.top) &&
    Number.isFinite(rect.width) &&
    Number.isFinite(rect.height) &&
    rect.width + rect.height > 0,
  );
}

function getFirstRangeRect(range: Range): DOMRect | null {
  const clientRect = Array.from(range.getClientRects()).find(isUsableRect);
  if (clientRect) return clientRect;

  const boundingRect = range.getBoundingClientRect();
  return isUsableRect(boundingRect) ? boundingRect : null;
}

function makeDomRect(left: number, top: number, width: number, height: number): DOMRect {
  return {
    height,
    width,
    top,
    left,
    right: left + width,
    bottom: top + height,
    x: left,
    y: top,
    toJSON: () => {},
  } as DOMRect;
}

function createTextareaMirror(input: HTMLTextAreaElement): {
  inputRect: DOMRect;
  mirror: HTMLDivElement;
} {
  const inputRect = input.getBoundingClientRect();
  const computedStyle = getComputedStyle(input);
  const mirror = document.createElement('div');

  mirror.className = TEXTAREA_MIRROR_CLASS;
  mirror.setAttribute('aria-hidden', 'true');

  for (const property of TEXTAREA_MIRROR_STYLE_PROPERTIES) {
    mirror.style.setProperty(property, computedStyle.getPropertyValue(property));
  }

  const borderLeft = Number.parseFloat(computedStyle.borderLeftWidth) || 0;
  const borderRight = Number.parseFloat(computedStyle.borderRightWidth) || 0;
  const measuredWidth =
    input.clientWidth > 0 ? input.clientWidth + borderLeft + borderRight : inputRect.width;

  mirror.style.position = 'fixed';
  mirror.style.top = '0';
  mirror.style.left = '0';
  mirror.style.zIndex = '-1';
  mirror.style.boxSizing = 'border-box';
  mirror.style.width = `${measuredWidth}px`;
  mirror.style.height = 'auto';
  mirror.style.minHeight = '0';
  mirror.style.overflow = 'hidden';
  mirror.style.overflowWrap = 'break-word';
  mirror.style.whiteSpace = input.wrap === 'off' ? 'pre' : 'pre-wrap';
  mirror.style.visibility = 'hidden';
  mirror.style.pointerEvents = 'none';

  return { inputRect, mirror };
}

function translateTextareaMarkerRect(
  input: HTMLTextAreaElement,
  inputRect: DOMRect,
  mirrorRect: DOMRect,
  markerRect: DOMRect,
  width: number,
): DOMRect {
  const left = inputRect.left + (markerRect.left - mirrorRect.left) - input.scrollLeft;
  const top = inputRect.top + (markerRect.top - mirrorRect.top) - input.scrollTop;
  return makeDomRect(left, top, width, markerRect.height);
}

function getTextareaTextRangeRect(
  input: HTMLTextAreaElement,
  start: number,
  end: number,
): DOMRect | null {
  const text = input.value;
  const rangeStart = clamp(start, 0, text.length);
  const rangeEnd = clamp(end, rangeStart, text.length);
  if (text.slice(rangeStart, rangeEnd).includes('\n')) return null;

  const { inputRect, mirror } = createTextareaMirror(input);
  const marker = document.createElement('span');
  marker.className = TEXTAREA_MARKER_CLASS;
  marker.dataset.gvVimOffset = String(rangeStart);

  mirror.append(document.createTextNode(text.slice(0, rangeStart)));
  marker.textContent = text.slice(rangeStart, rangeEnd) || '\u200b';
  mirror.append(marker);
  document.body.append(mirror);

  try {
    const mirrorRect = mirror.getBoundingClientRect();
    const markerRect = marker.getBoundingClientRect();

    if (!isUsableRect(markerRect)) return null;

    return translateTextareaMarkerRect(
      input,
      inputRect,
      mirrorRect,
      markerRect,
      rangeStart === rangeEnd ? 0 : markerRect.width,
    );
  } finally {
    mirror.remove();
  }
}

function getTextareaRenderedCharacters(input: HTMLTextAreaElement): RenderedCharacter[] {
  const text = input.value;
  const { inputRect, mirror } = createTextareaMirror(input);
  const markers: Array<{ element: HTMLSpanElement; range: GraphemeRange }> = [];

  for (const range of getGraphemeRanges(text)) {
    const segment = text.slice(range.start, range.end);
    if (segment === '\n') {
      mirror.append(document.createTextNode(segment));
      continue;
    }

    const marker = document.createElement('span');
    marker.className = TEXTAREA_MARKER_CLASS;
    marker.dataset.gvVimOffset = String(range.start);
    marker.textContent = segment;
    mirror.append(marker);
    markers.push({ element: marker, range });
  }

  document.body.append(mirror);

  try {
    const mirrorRect = mirror.getBoundingClientRect();
    const characters: RenderedCharacter[] = [];

    for (const { element, range } of markers) {
      const markerRect = element.getBoundingClientRect();
      if (!isUsableRect(markerRect)) continue;

      const rect = translateTextareaMarkerRect(
        input,
        inputRect,
        mirrorRect,
        markerRect,
        markerRect.width,
      );
      characters.push({
        ...range,
        rect,
        centerX: rect.left + rect.width / 2,
      });
    }

    return characters;
  } finally {
    mirror.remove();
  }
}

function getCollapsedTextOffsetRect(input: HTMLElement, offset: number): DOMRect | null {
  if (input instanceof HTMLTextAreaElement) {
    return getTextareaTextRangeRect(input, offset, offset);
  }

  const text = getInputText(input);
  const current = clamp(offset, 0, text.length);
  const range = createRangeForTextOffsets(input, current);
  return getFirstRangeRect(range);
}

function getTextRangeRect(input: HTMLElement, start: number, end: number): DOMRect | null {
  if (start === end || getInputText(input).slice(start, end).includes('\n')) return null;

  if (input instanceof HTMLTextAreaElement) {
    return getTextareaTextRangeRect(input, start, end);
  }

  const range = createRangeForTextOffsets(input, start, end);
  const rect = getFirstRangeRect(range);
  return rect && rect.width > 0 ? rect : null;
}

function getElementTextRangeRect(element: HTMLElement, start: number, end: number): DOMRect | null {
  if (start === end) return null;

  const range = document.createRange();
  const rangeStart = findTextPositionInElement(element, start);
  const rangeEnd = findTextPositionInElement(element, end);
  range.setStart(rangeStart.node, rangeStart.offset);
  range.setEnd(rangeEnd.node, rangeEnd.offset);

  const rect = getFirstRangeRect(range);
  return rect && rect.width > 0 ? rect : null;
}

export function getCharacterRect(
  input: HTMLElement,
  offset: number,
  direction: -1 | 1 = 1,
): DOMRect | null {
  const text = getInputText(input);
  const current = clamp(offset, 0, text.length);
  const start = direction < 0 ? getPreviousGraphemeOffset(text, current) : current;
  const end = direction < 0 ? current : getNextGraphemeOffset(text, current);

  if (start === end || text.slice(start, end) === '\n') return null;
  return getTextRangeRect(input, start, end);
}

function estimateRenderedLineHeight(input: HTMLElement, lines: RenderedLine[]): number {
  const measuredLine = lines.find((line) => line.bottom > line.top);
  const firstItemHeight = lines.flatMap((line) => line.items).find((item) => item.rect.height > 0)
    ?.rect.height;
  const measuredHeight = measuredLine ? measuredLine.bottom - measuredLine.top : undefined;
  const fallbackHeight = input.getBoundingClientRect().height || 18;

  return Math.max(16, firstItemHeight ?? measuredHeight ?? fallbackHeight);
}

export function getCaretRect(input: HTMLElement, offset: number): DOMRect | null {
  if (input instanceof HTMLTextAreaElement) {
    return getTextareaTextRangeRect(input, offset, offset) ?? input.getBoundingClientRect();
  }

  const text = getInputText(input);
  const current = clamp(offset, 0, text.length);
  const renderedPosition = findRenderedLinePosition(getRenderedLines(input), current);
  const renderedLineRect = renderedPosition?.character.rect ?? null;

  if (renderedPosition?.character.isEmptyLine && renderedLineRect) {
    return renderedLineRect;
  }

  const rect = getCollapsedTextOffsetRect(input, current);
  if (rect) {
    return rect;
  }

  if (renderedLineRect) return renderedLineRect;

  if (current > 0) {
    const previousOffset = getPreviousGraphemeOffset(text, current);
    const previousText = text.slice(previousOffset, current);
    if (!previousText.includes('\n')) {
      const previousRect = getTextRangeRect(input, previousOffset, current);
      if (previousRect) return previousRect;
    }
  }

  return input.getBoundingClientRect();
}

function getRenderedCharacters(input: HTMLElement): RenderedCharacter[] {
  if (input instanceof HTMLTextAreaElement) return getTextareaRenderedCharacters(input);

  const blockEntries = getBlockLineEntries(input);
  if (blockEntries.length > 0) {
    const characters: RenderedCharacter[] = [];

    for (const entry of blockEntries) {
      if (entry.isEmpty) continue;

      const blockText = getLineBlockText(entry.element);
      for (const range of getGraphemeRanges(blockText)) {
        const rect = getElementTextRangeRect(entry.element, range.start, range.end);
        if (!rect) continue;

        characters.push({
          start: entry.start + range.start,
          end: entry.start + range.end,
          rect,
          centerX: rect.left + rect.width / 2,
        });
      }
    }

    return characters;
  }

  const text = getInputText(input);
  const characters: RenderedCharacter[] = [];

  for (const range of getGraphemeRanges(text)) {
    if (text.slice(range.start, range.end) === '\n') continue;

    const rect = getTextRangeRect(input, range.start, range.end);
    if (!rect) continue;

    characters.push({
      ...range,
      rect,
      centerX: rect.left + rect.width / 2,
    });
  }

  return characters;
}

function isRenderedCharacterOnLine(line: RenderedLine, character: RenderedCharacter): boolean {
  const centerY = character.rect.top + character.rect.height / 2;
  const tolerance = Math.max(2, character.rect.height * 0.25);
  return centerY >= line.top - tolerance && centerY <= line.bottom + tolerance;
}

function isRenderedItemAtOffset(item: RenderedCharacter, offset: number): boolean {
  return item.start === item.end
    ? offset === item.start
    : offset >= item.start && offset < item.end;
}

function isRectOnRenderedLine(rect: DOMRect, line: RenderedLine): boolean {
  const centerY = rect.top + rect.height / 2;
  const tolerance = Math.max(2, rect.height * 0.25);
  return centerY >= line.top - tolerance && centerY <= line.bottom + tolerance;
}

function createEmptyLineItemFromRect(
  input: HTMLElement,
  lines: RenderedLine[],
  offset: number,
  rect: DOMRect,
  allowOverlap = false,
): RenderedCharacter | null {
  const overlapsExistingLine =
    !allowOverlap && lines.some((line) => isRectOnRenderedLine(rect, line));
  if (overlapsExistingLine) return null;

  const lineHeight = estimateRenderedLineHeight(input, lines);
  const height = Math.max(16, rect.height || lineHeight);

  return {
    start: offset,
    end: offset,
    rect: makeDomRect(rect.left, rect.top, 0, height),
    centerX: rect.left,
    isEmptyLine: true,
  };
}

function createTextEmptyLineItem(
  input: HTMLElement,
  lines: RenderedLine[],
  offset: number,
): RenderedCharacter | null {
  const collapsedRect = getCollapsedTextOffsetRect(input, offset);
  return collapsedRect ? createEmptyLineItemFromRect(input, lines, offset, collapsedRect) : null;
}

function getLineFirstStart(line: RenderedLine): number {
  return line.items.reduce((first, item) => Math.min(first, item.start), Number.POSITIVE_INFINITY);
}

function getLineLastEnd(line: RenderedLine): number {
  return line.items.reduce((last, item) => Math.max(last, item.end), 0);
}

function findRenderedLineBefore(lines: RenderedLine[], offset: number): RenderedLine | null {
  return (
    lines
      .filter((line) => getLineFirstStart(line) < offset)
      .sort((left, right) => getLineFirstStart(right) - getLineFirstStart(left))[0] ?? null
  );
}

function findRenderedLineAfter(lines: RenderedLine[], offset: number): RenderedLine | null {
  return (
    lines
      .filter((line) => getLineLastEnd(line) > offset)
      .sort((left, right) => getLineFirstStart(left) - getLineFirstStart(right))[0] ?? null
  );
}

function createSyntheticEmptyLineItems(
  input: HTMLElement,
  lines: RenderedLine[],
  offsets: number[],
): RenderedCharacter[] {
  if (offsets.length === 0) return [];

  const previousLine = findRenderedLineBefore(lines, offsets[0]);
  const nextLine = findRenderedLineAfter(lines, offsets[offsets.length - 1]);
  const lineHeight = estimateRenderedLineHeight(input, lines);
  const inputRect = input.getBoundingClientRect();
  const left = previousLine?.items[0]?.rect.left ?? nextLine?.items[0]?.rect.left ?? inputRect.left;

  return offsets.map((offset, index) => {
    let top = inputRect.top + lineHeight * index;

    if (previousLine && nextLine) {
      const advance = Math.max(1, (nextLine.top - previousLine.top) / (offsets.length + 1));
      top = previousLine.top + advance * (index + 1);
    } else if (previousLine) {
      top = previousLine.top + lineHeight * (index + 1);
    } else if (nextLine) {
      top = nextLine.top - lineHeight * (offsets.length - index);
    }

    return {
      start: offset,
      end: offset,
      rect: makeDomRect(left, top, 0, lineHeight),
      centerX: left,
      isEmptyLine: true,
    };
  });
}

function pushEmptyLineItem(lines: RenderedLine[], item: RenderedCharacter | null): void {
  if (!item) return;

  lines.push({
    top: item.rect.top,
    bottom: item.rect.bottom,
    items: [item],
  });
}

function addBlockEmptyRenderedLines(input: HTMLElement, lines: RenderedLine[]): RenderedLine[] {
  const nextLines = [...lines];

  for (const entry of getBlockLineEntries(input)) {
    if (!entry.isEmpty) continue;

    const rect = entry.element.getBoundingClientRect();
    if (!isUsableRect(rect)) continue;

    pushEmptyLineItem(
      nextLines,
      createEmptyLineItemFromRect(input, nextLines, entry.start, rect, true),
    );
  }

  return nextLines;
}

function addTextEmptyRenderedLines(input: HTMLElement, lines: RenderedLine[]): RenderedLine[] {
  const text = getInputText(input);
  const nextLines = [...lines];
  const syntheticGroups: Array<Array<{ lineIndex: number; offset: number }>> = [];

  getLogicalLines(text).forEach((logicalLine, lineIndex) => {
    const isEmptyLineBetweenNewlines =
      logicalLine.start === logicalLine.end &&
      logicalLine.start > 0 &&
      text[logicalLine.start - 1] === '\n' &&
      text[logicalLine.start] === '\n';

    if (!isEmptyLineBetweenNewlines) return;

    const alreadyRepresented = nextLines.some((line) =>
      line.items.some((item) => isRenderedItemAtOffset(item, logicalLine.start)),
    );
    if (alreadyRepresented) return;

    const measuredItem = createTextEmptyLineItem(input, nextLines, logicalLine.start);
    if (measuredItem) {
      pushEmptyLineItem(nextLines, measuredItem);
      return;
    }

    const previousGroup = syntheticGroups.at(-1);
    const previousItem = previousGroup?.at(-1);
    if (previousGroup && previousItem?.lineIndex === lineIndex - 1) {
      previousGroup.push({ lineIndex, offset: logicalLine.start });
    } else {
      syntheticGroups.push([{ lineIndex, offset: logicalLine.start }]);
    }
  });

  for (const group of syntheticGroups) {
    for (const item of createSyntheticEmptyLineItems(
      input,
      nextLines,
      group.map(({ offset }) => offset),
    )) {
      pushEmptyLineItem(nextLines, item);
    }
  }

  return nextLines;
}

function addEmptyRenderedLines(input: HTMLElement, lines: RenderedLine[]): RenderedLine[] {
  const withBlockEmptyLines =
    getBlockLineEntries(input).length > 0 ? addBlockEmptyRenderedLines(input, lines) : lines;
  return addTextEmptyRenderedLines(input, withBlockEmptyLines);
}

function getRenderedLines(input: HTMLElement): RenderedLine[] {
  const sortedCharacters = getRenderedCharacters(input).sort(
    (left, right) =>
      left.rect.top - right.rect.top ||
      left.rect.left - right.rect.left ||
      left.start - right.start,
  );
  const lines: RenderedLine[] = [];

  for (const character of sortedCharacters) {
    const existingLine = lines.find((line) => isRenderedCharacterOnLine(line, character));

    if (existingLine) {
      existingLine.top = Math.min(existingLine.top, character.rect.top);
      existingLine.bottom = Math.max(existingLine.bottom, character.rect.bottom);
      existingLine.items.push(character);
      continue;
    }

    lines.push({
      top: character.rect.top,
      bottom: character.rect.bottom,
      items: [character],
    });
  }

  return addEmptyRenderedLines(input, lines)
    .map((line) => ({
      ...line,
      items: line.items.sort(
        (left, right) => left.rect.left - right.rect.left || left.start - right.start,
      ),
    }))
    .sort((left, right) => {
      const topDelta = left.top - right.top;
      return Math.abs(topDelta) <= 4
        ? getLineFirstStart(left) - getLineFirstStart(right)
        : topDelta;
    });
}

function findRenderedLinePosition(
  lines: RenderedLine[],
  offset: number,
): { lineIndex: number; character: RenderedCharacter } | null {
  let previousMatch: { lineIndex: number; character: RenderedCharacter } | null = null;

  for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
    for (const character of lines[lineIndex].items) {
      if (isRenderedItemAtOffset(character, offset)) {
        return { lineIndex, character };
      }

      if (character.start <= offset) {
        previousMatch = { lineIndex, character };
      }
    }
  }

  return (
    previousMatch ?? (lines[0]?.items[0] ? { lineIndex: 0, character: lines[0].items[0] } : null)
  );
}

function findClosestRenderedCharacter(line: RenderedLine, targetX: number): RenderedCharacter {
  return line.items.reduce((closest, character) => {
    const closestDistance = Math.abs(closest.centerX - targetX);
    const nextDistance = Math.abs(character.centerX - targetX);
    return nextDistance < closestDistance ? character : closest;
  });
}

export function getRenderedLineMotionOffset(
  input: HTMLElement,
  direction: -1 | 1,
  count: number,
  desiredColumn: number | null,
): { offset: number; column: number } | null {
  const lines = getRenderedLines(input);
  if (lines.length < 2) return null;

  const currentPosition = findRenderedLinePosition(lines, getCaretOffset(input));
  if (!currentPosition) return null;

  const targetX =
    desiredColumn ?? currentPosition.character.rect.left + currentPosition.character.rect.width / 2;

  let targetLineIndex = currentPosition.lineIndex;
  for (let index = 0; index < count; index++) {
    targetLineIndex = clamp(targetLineIndex + direction, 0, lines.length - 1);
  }

  const offset =
    targetLineIndex === currentPosition.lineIndex
      ? getCaretOffset(input)
      : findClosestRenderedCharacter(lines[targetLineIndex], targetX).start;
  return { offset, column: targetX };
}
