/**
 * Selection/Cursor Helpers
 *
 * Provides utilities to get/set cursor position based on a logical text offset.
 * Paragraph/div boundaries and <br> elements are counted as logical newlines so
 * offsets survive Quill's block-oriented DOM updates after insertParagraph.
 */

const BLOCK_TAG_NAMES = new Set(['P', 'DIV']);

interface CaretPoint {
  node: Node;
  offset: number;
}

interface CaretAnchor {
  offset: number;
  point: CaretPoint;
  priority: number;
}

interface TextSegment {
  kind: 'text';
  node: Text;
  startOffset: number;
  endOffset: number;
  before: CaretPoint;
  after: CaretPoint;
}

interface NewlineSegment {
  kind: 'newline';
  startOffset: number;
  endOffset: number;
  before: CaretPoint;
  after: CaretPoint;
}

type LogicalSegment = TextSegment | NewlineSegment;

interface LogicalModel {
  anchors: CaretAnchor[];
  segments: LogicalSegment[];
  totalOffset: number;
}

/**
 * Get the current cursor position as a global text offset relative to the root element.
 */
export function getTextOffset(root: HTMLElement): number | null {
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0) return null;

  const range = selection.getRangeAt(0);
  if (range.endContainer !== root && !root.contains(range.endContainer)) return null;

  return getLogicalOffset(root, {
    node: range.endContainer,
    offset: range.endOffset,
  });
}

/**
 * Restore the cursor to a specific global text offset.
 */
export function setCaretPosition(root: HTMLElement, targetOffset: number): void {
  const selection = window.getSelection();
  if (!selection) return;

  const model = buildLogicalModel(root);
  const clampedOffset = Math.min(Math.max(targetOffset, 0), model.totalOffset);
  const point = findCaretPoint(model, clampedOffset) ?? {
    node: root,
    offset: root.childNodes.length,
  };

  const range = document.createRange();
  range.setStart(point.node, point.offset);
  range.collapse(true);

  selection.removeAllRanges();
  selection.addRange(range);
}

function buildLogicalModel(root: HTMLElement): LogicalModel {
  const anchors: CaretAnchor[] = [
    {
      offset: 0,
      point: { node: root, offset: 0 },
      priority: 0,
    },
  ];
  const segments: LogicalSegment[] = [];
  let currentOffset = 0;
  let hasVisualLine = false;

  const addAnchor = (offset: number, point: CaretPoint, priority: number): void => {
    anchors.push({ offset, point, priority });
  };

  const addNewline = (before: CaretPoint, after: CaretPoint): void => {
    const startOffset = currentOffset;
    currentOffset += 1;
    segments.push({
      kind: 'newline',
      startOffset,
      endOffset: currentOffset,
      before,
      after,
    });
    addAnchor(currentOffset, after, 2);
    hasVisualLine = true;
  };

  const addText = (node: Text): void => {
    const text = node.textContent ?? '';
    if (text.length === 0) return;

    const startOffset = currentOffset;
    currentOffset += text.length;
    segments.push({
      kind: 'text',
      node,
      startOffset,
      endOffset: currentOffset,
      before: { node, offset: 0 },
      after: { node, offset: text.length },
    });
    hasVisualLine = true;
  };

  const walkChildren = (parent: Node): void => {
    parent.childNodes.forEach((child, index) => walk(child, parent, index));
  };

  const walk = (node: Node, parent: Node, index: number): void => {
    if (node.nodeType === Node.TEXT_NODE) {
      addText(node as Text);
      return;
    }

    if (node instanceof HTMLBRElement) {
      if (isPlaceholderBreak(node, root)) {
        addAnchor(currentOffset, { node: parent, offset: index }, 1);
        return;
      }

      addNewline({ node: parent, offset: index }, { node: parent, offset: index + 1 });
      return;
    }

    if (!(node instanceof HTMLElement)) return;

    if (isBlockElement(node, root)) {
      if (hasVisualLine) {
        addNewline({ node: parent, offset: index }, { node, offset: 0 });
      } else {
        addAnchor(currentOffset, { node, offset: 0 }, 1);
      }

      const blockStartOffset = currentOffset;
      walkChildren(node);

      if (currentOffset === blockStartOffset) {
        addAnchor(currentOffset, { node, offset: 0 }, 3);
      }

      hasVisualLine = true;
      return;
    }

    walkChildren(node);
  };

  walkChildren(root);
  addAnchor(currentOffset, { node: root, offset: root.childNodes.length }, 0);

  return {
    anchors,
    segments,
    totalOffset: currentOffset,
  };
}

function getLogicalOffset(root: HTMLElement, point: CaretPoint): number {
  const model = buildLogicalModel(root);
  let offset = 0;

  for (const segment of model.segments) {
    if (segment.kind === 'text' && segment.node === point.node) {
      return segment.startOffset + Math.min(point.offset, segment.endOffset - segment.startOffset);
    }

    if (comparePoints(segment.after, point) <= 0) {
      offset = segment.endOffset;
      continue;
    }

    if (comparePoints(segment.before, point) <= 0) {
      return segment.startOffset;
    }

    break;
  }

  return offset;
}

function findCaretPoint(model: LogicalModel, targetOffset: number): CaretPoint | null {
  for (const segment of model.segments) {
    if (
      segment.kind === 'text' &&
      targetOffset >= segment.startOffset &&
      targetOffset <= segment.endOffset
    ) {
      return {
        node: segment.node,
        offset: targetOffset - segment.startOffset,
      };
    }
  }

  const newlineAfter = model.segments.find(
    (segment): segment is NewlineSegment =>
      segment.kind === 'newline' && segment.endOffset === targetOffset,
  );
  if (newlineAfter) return newlineAfter.after;

  const newlineBefore = model.segments.find(
    (segment): segment is NewlineSegment =>
      segment.kind === 'newline' && segment.startOffset === targetOffset,
  );
  if (newlineBefore) return newlineBefore.before;

  return (
    model.anchors
      .filter((anchor) => anchor.offset === targetOffset)
      .sort((a, b) => b.priority - a.priority)[0]?.point ?? null
  );
}

function comparePoints(first: CaretPoint, second: CaretPoint): number {
  const firstRange = document.createRange();
  firstRange.setStart(first.node, first.offset);
  firstRange.collapse(true);

  const secondRange = document.createRange();
  secondRange.setStart(second.node, second.offset);
  secondRange.collapse(true);

  return firstRange.compareBoundaryPoints(Range.START_TO_START, secondRange);
}

function isBlockElement(element: HTMLElement, root: HTMLElement): boolean {
  return element !== root && BLOCK_TAG_NAMES.has(element.tagName);
}

function isPlaceholderBreak(element: HTMLBRElement, root: HTMLElement): boolean {
  const parent = element.parentElement;
  if (!parent || parent === root || !BLOCK_TAG_NAMES.has(parent.tagName)) return false;

  const meaningfulChildren = Array.from(parent.childNodes).filter((child) => {
    if (child.nodeType !== Node.TEXT_NODE) return true;
    return (child.textContent ?? '').length > 0;
  });

  return meaningfulChildren.length === 1 && meaningfulChildren[0] === element;
}
