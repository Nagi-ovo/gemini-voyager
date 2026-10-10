import {
  HIGHLIGHT_COLORS,
  type HighlightColor,
  type HighlightRecordV1,
  getHighlightColorHex,
  isHighlightPresetColor,
} from '@/core/types/highlight';

import { resolveHighlightAnchor } from './anchor';
import {
  collectHighlightTurns,
  resolveMountedHighlightTurnId,
  resolveStoredHighlightTurnId,
} from './dom';
import { translateWith } from './messages';

function unwrapMark(mark: HTMLElement): void {
  const parent = mark.parentNode;
  if (!parent) return;
  mark.replaceWith(...Array.from(mark.childNodes));
  parent.normalize();
}

function highlightColorBackground(color: HighlightColor, alpha = 0.3): string {
  const hex = getHighlightColorHex(color);
  const red = Number.parseInt(hex.slice(1, 3), 16);
  const green = Number.parseInt(hex.slice(3, 5), 16);
  const blue = Number.parseInt(hex.slice(5, 7), 16);
  return `rgba(${red}, ${green}, ${blue}, ${alpha})`;
}

function applyMarkColor(element: HTMLElement, color: HighlightColor): void {
  HIGHLIGHT_COLORS.forEach((candidate) =>
    element.classList.remove(`gv-highlight-mark-${candidate}`),
  );
  element.style.removeProperty('background-color');
  if (isHighlightPresetColor(color)) {
    element.classList.add(`gv-highlight-mark-${color}`);
  } else {
    element.style.backgroundColor = highlightColorBackground(color);
  }
}

function getRangeTextNodes(range: Range): Text[] {
  const root = range.commonAncestorContainer;
  if (root instanceof Text) return [root];
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const nodes: Text[] = [];
  let current = walker.nextNode();
  while (current) {
    if (current instanceof Text) {
      try {
        if (range.intersectsNode(current)) nodes.push(current);
      } catch {}
    }
    current = walker.nextNode();
  }
  return nodes;
}

function wrapHighlightRange(
  range: Range,
  id: string,
  color: HighlightColor,
  ariaLabel: string,
): HTMLElement[] {
  const textNodes = getRangeTextNodes(range);
  const marks: HTMLElement[] = [];

  for (const node of [...textNodes].reverse()) {
    const start = node === range.startContainer ? range.startOffset : 0;
    const end = node === range.endContainer ? range.endOffset : node.data.length;
    if (end <= start) continue;

    let selected = node;
    if (end < selected.data.length) selected.splitText(end);
    if (start > 0) selected = selected.splitText(start);

    const mark = document.createElement('mark');
    mark.className = 'gv-highlight-mark';
    applyMarkColor(mark, color);
    mark.dataset.gvHighlightId = id;
    mark.setAttribute('role', 'button');
    mark.setAttribute('aria-label', ariaLabel);
    mark.tabIndex = -1;
    selected.replaceWith(mark);
    mark.appendChild(selected);
    marks.unshift(mark);
  }

  if (marks[0]) marks[0].tabIndex = 0;
  return marks;
}

function setRecordColor(elements: HTMLElement[], color: HighlightColor): void {
  elements.forEach((element) => applyMarkColor(element, color));
}

/** Owns reversible text marks; records and observer suppression stay with the manager. */
export class HighlightMarks {
  private readonly marks = new Map<string, HTMLElement[]>();

  get elements(): ReadonlyMap<string, readonly HTMLElement[]> {
    return this.marks;
  }

  render(records: ReadonlyMap<string, HighlightRecordV1>): void {
    const turns = new Map(
      collectHighlightTurns().flatMap((turn) => {
        const resolved = resolveMountedHighlightTurnId(turn.turnId);
        return resolved ? [[resolved, turn] as const] : [];
      }),
    );
    for (const [id, record] of records) {
      const existing = (this.marks.get(id) ?? []).filter((mark) => mark.isConnected);
      const existingText = existing.map((mark) => mark.textContent ?? '').join('');
      if (existing.length > 0 && existingText === record.anchor.quote.exact) {
        this.marks.set(id, existing);
        setRecordColor(existing, record.color);
        continue;
      }

      existing.reverse().forEach(unwrapMark);

      this.marks.delete(id);
      const normalizedTurnId = resolveStoredHighlightTurnId(record.turnId);
      if (!normalizedTurnId) continue;
      const turn = turns.get(normalizedTurnId);
      if (!turn) continue;
      const range = resolveHighlightAnchor(turn.assistantRoot, record.anchor);
      if (!range) continue;
      const label = translateWith('highlightAriaLabel', 'Highlight: {text}', {
        text: record.anchor.quote.exact.slice(0, 120),
      });
      const rendered = wrapHighlightRange(range, id, record.color, label);
      if (rendered.length > 0) this.marks.set(id, rendered);
    }

    for (const [id, elements] of this.marks) {
      if (records.has(id)) continue;
      elements.forEach(unwrapMark);
      this.marks.delete(id);
    }
  }

  updateColor(id: string, color: HighlightColor): void {
    setRecordColor(this.marks.get(id) ?? [], color);
  }

  remove(id: string): void {
    (this.marks.get(id) ?? []).reverse().forEach(unwrapMark);
    this.marks.delete(id);
  }

  clear(): void {
    Array.from(this.marks.values())
      .flat()
      .filter((mark) => mark.isConnected)
      .reverse()
      .forEach(unwrapMark);
    this.marks.clear();
  }
}
