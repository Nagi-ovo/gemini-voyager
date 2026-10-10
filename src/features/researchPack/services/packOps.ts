/**
 * Edits to a research pack expressed as data, so one owner (the extension
 * background) can apply every tab's edits in order against the latest stored
 * pack instead of each tab writing back a whole pack it read earlier.
 */
import { addItem, clearItems, moveItem, removeItem, setInstruction } from './packModel';
import type { AddItemOutcome, ResearchPack, ResearchPackDraftItem } from './types';

export type ResearchPackOp =
  | { kind: 'add'; draft: ResearchPackDraftItem }
  | { kind: 'remove'; id: string }
  | { kind: 'move'; id: string; delta: number }
  | { kind: 'setInstruction'; instruction: string }
  | { kind: 'clear' };

export interface ResearchPackOpResult {
  pack: ResearchPack;
  /** The add outcome for `add`; null for every other op. */
  outcome: AddItemOutcome | null;
}

export function applyResearchPackOp(
  pack: ResearchPack,
  op: ResearchPackOp,
  now: number,
): ResearchPackOpResult {
  switch (op.kind) {
    case 'add': {
      const next = addItem(pack, op.draft, now);
      return { pack: next.pack, outcome: next.outcome };
    }
    case 'remove':
      return { pack: removeItem(pack, op.id, now), outcome: null };
    case 'move':
      return { pack: moveItem(pack, op.id, op.delta, now), outcome: null };
    case 'setInstruction':
      return { pack: setInstruction(pack, op.instruction, now), outcome: null };
    case 'clear':
      return { pack: clearItems(pack, now), outcome: null };
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parseDraft(value: unknown): ResearchPackDraftItem | null {
  if (!isRecord(value)) return null;
  const { text, excerpt, prompt, sourceTitle, sourceUrl, platform, citations } = value;
  if (
    typeof text !== 'string' ||
    typeof excerpt !== 'boolean' ||
    typeof prompt !== 'string' ||
    typeof sourceTitle !== 'string' ||
    typeof sourceUrl !== 'string' ||
    typeof platform !== 'string' ||
    !Array.isArray(citations)
  ) {
    return null;
  }
  return {
    text,
    excerpt,
    prompt,
    sourceTitle,
    sourceUrl,
    platform,
    citations: citations.filter(isRecord).map((link) => ({
      url: typeof link.url === 'string' ? link.url : '',
      title: typeof link.title === 'string' ? link.title : '',
    })),
  };
}

/** Validate an op received over a message boundary; null when malformed. */
export function parseResearchPackOp(value: unknown): ResearchPackOp | null {
  if (!isRecord(value)) return null;
  switch (value.kind) {
    case 'add': {
      const draft = parseDraft(value.draft);
      return draft ? { kind: 'add', draft } : null;
    }
    case 'remove':
      return typeof value.id === 'string' ? { kind: 'remove', id: value.id } : null;
    case 'move':
      return typeof value.id === 'string' && Number.isInteger(value.delta)
        ? { kind: 'move', id: value.id, delta: value.delta as number }
        : null;
    case 'setInstruction':
      return typeof value.instruction === 'string'
        ? { kind: 'setInstruction', instruction: value.instruction }
        : null;
    case 'clear':
      return { kind: 'clear' };
    default:
      return null;
  }
}
