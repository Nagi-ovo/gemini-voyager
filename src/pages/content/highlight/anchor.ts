import { createHighlightSourceTextHash } from '@/core/services/HighlightAnnotationService';
import { HIGHLIGHT_LIMITS, type HighlightRecordV1 } from '@/core/types/highlight';

export const HIGHLIGHT_CONTEXT_CHARS = HIGHLIGHT_LIMITS.contextCharacters;
export const HIGHLIGHT_EXACT_MAX_BYTES = HIGHLIGHT_LIMITS.exactBytes;

type HighlightAnchor = HighlightRecordV1['anchor'];

interface IndexedTextNode {
  node: Text;
  start: number;
  end: number;
}

function hasVoyagerUiAncestor(node: Node, root: HTMLElement): boolean {
  let element = node.parentElement;
  while (element && element !== root) {
    const voyagerClasses = Array.from(element.classList).filter((name) => name.startsWith('gv-'));
    if (
      voyagerClasses.length > 0 &&
      !voyagerClasses.every((name) => name.startsWith('gv-highlight-mark'))
    ) {
      return true;
    }
    element = element.parentElement;
  }
  return false;
}

function indexTextNodes(root: HTMLElement): IndexedTextNode[] {
  const indexed: IndexedTextNode[] = [];
  let offset = 0;
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      if (!(node instanceof Text) || hasVoyagerUiAncestor(node, root)) {
        return NodeFilter.FILTER_REJECT;
      }
      return NodeFilter.FILTER_ACCEPT;
    },
  });

  let current = walker.nextNode();
  while (current) {
    const node = current as Text;
    const length = node.data.length;
    indexed.push({ node, start: offset, end: offset + length });
    offset += length;
    current = walker.nextNode();
  }
  return indexed;
}

export function getHighlightableText(root: HTMLElement): string {
  return indexTextNodes(root)
    .map(({ node }) => node.data)
    .join('');
}

function boundaryToOffset(
  root: HTMLElement,
  indexed: IndexedTextNode[],
  container: Node,
  offset: number,
): number | null {
  const direct = indexed.find(({ node }) => node === container);
  if (direct) {
    return direct.start + Math.max(0, Math.min(offset, direct.node.data.length));
  }

  if (!root.contains(container) && container !== root) return null;

  try {
    const point = document.createRange();
    point.setStart(container, offset);
    point.collapse(true);

    for (const entry of indexed) {
      const nodeStart = document.createRange();
      nodeStart.setStart(entry.node, 0);
      nodeStart.collapse(true);
      const relation = point.compareBoundaryPoints(Range.START_TO_START, nodeStart);
      if (relation <= 0) return entry.start;
    }
    return indexed.at(-1)?.end ?? 0;
  } catch {
    return null;
  }
}

function offsetsToRange(indexed: IndexedTextNode[], start: number, end: number): Range | null {
  if (indexed.length === 0 || start < 0 || end <= start) return null;
  const totalLength = indexed.at(-1)?.end ?? 0;
  if (end > totalLength) return null;

  const startEntry = indexed.find((entry) => start >= entry.start && start <= entry.end);
  const endEntry = [...indexed].reverse().find((entry) => end >= entry.start && end <= entry.end);
  if (!startEntry || !endEntry) return null;

  try {
    const range = document.createRange();
    range.setStart(startEntry.node, start - startEntry.start);
    range.setEnd(endEntry.node, end - endEntry.start);
    return range;
  } catch {
    return null;
  }
}

export function buildHighlightAnchor(root: HTMLElement, range: Range): HighlightAnchor | null {
  if (
    (!root.contains(range.startContainer) && range.startContainer !== root) ||
    (!root.contains(range.endContainer) && range.endContainer !== root)
  ) {
    return null;
  }

  const indexed = indexTextNodes(root);
  const start = boundaryToOffset(root, indexed, range.startContainer, range.startOffset);
  const end = boundaryToOffset(root, indexed, range.endContainer, range.endOffset);
  if (start === null || end === null || end <= start) return null;

  const sourceText = indexed.map(({ node }) => node.data).join('');
  const exact = sourceText.slice(start, end);
  if (!exact.trim() || new TextEncoder().encode(exact).byteLength > HIGHLIGHT_EXACT_MAX_BYTES) {
    return null;
  }

  const prefixSource = sourceText.slice(0, start);
  const suffixSource = sourceText.slice(end);

  return {
    quote: {
      exact,
      prefix: Array.from(prefixSource).slice(-HIGHLIGHT_CONTEXT_CHARS).join(''),
      suffix: Array.from(suffixSource).slice(0, HIGHLIGHT_CONTEXT_CHARS).join(''),
    },
    position: { start, end },
    sourceTextHash: createHighlightSourceTextHash(sourceText),
  };
}

interface QuoteCandidate {
  start: number;
  end: number;
  contextScore: number;
}

function findQuoteCandidates(text: string, anchor: HighlightAnchor): QuoteCandidate[] {
  const { exact, prefix, suffix } = anchor.quote;
  if (!exact) return [];

  const candidates: QuoteCandidate[] = [];
  let fromIndex = 0;
  while (fromIndex <= text.length - exact.length) {
    const start = text.indexOf(exact, fromIndex);
    if (start < 0) break;
    const end = start + exact.length;
    const prefixMatches =
      prefix.length === 0 || text.slice(Math.max(0, start - prefix.length), start) === prefix;
    const suffixMatches = suffix.length === 0 || text.slice(end, end + suffix.length) === suffix;
    candidates.push({
      start,
      end,
      contextScore:
        Number(prefix.length > 0 && prefixMatches) + Number(suffix.length > 0 && suffixMatches),
    });
    fromIndex = start + 1;
  }
  return candidates;
}

/**
 * Resolve position first, then TextQuoteSelector context. Ambiguous quote-only
 * matches deliberately return null so a changed answer is never highlighted at
 * the wrong occurrence.
 */
export function resolveHighlightAnchor(root: HTMLElement, anchor: HighlightAnchor): Range | null {
  const indexed = indexTextNodes(root);
  const sourceText = indexed.map(({ node }) => node.data).join('');
  const { start, end } = anchor.position;
  const sourceMatches = createHighlightSourceTextHash(sourceText) === anchor.sourceTextHash;

  if (
    sourceMatches &&
    start >= 0 &&
    end > start &&
    sourceText.slice(start, end) === anchor.quote.exact
  ) {
    return offsetsToRange(indexed, start, end);
  }

  const candidates = findQuoteCandidates(sourceText, anchor);
  if (sourceMatches && candidates.length === 1) {
    return offsetsToRange(indexed, candidates[0].start, candidates[0].end);
  }
  if (candidates.length === 0) return null;

  const bestScore = Math.max(...candidates.map((candidate) => candidate.contextScore));
  // A changed answer needs bounded context evidence. Exact text alone can
  // survive at the same offset while its meaning changes.
  if (bestScore <= 0) return null;
  const best = candidates.filter((candidate) => candidate.contextScore === bestScore);
  if (best.length !== 1) return null;
  return offsetsToRange(indexed, best[0].start, best[0].end);
}
