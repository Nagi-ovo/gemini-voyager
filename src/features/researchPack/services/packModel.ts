/**
 * Pure operations on a research pack. Every function returns a new pack and
 * never mutates its input, so the store can apply them inside a
 * read-modify-write without sharing state with the UI.
 */
import { hashString } from '@/core/utils/hash';

import { dedupeCitations, safeHttpUrl } from './citations';
import {
  type AddItemOutcome,
  RESEARCH_PACK_LIMITS,
  RESEARCH_PACK_VERSION,
  type ResearchPack,
  type ResearchPackCitation,
  type ResearchPackDraftItem,
  type ResearchPackItem,
} from './types';

const TRUNCATION_MARK = '\n\n…[truncated]';

export function createEmptyPack(now = 0): ResearchPack {
  return {
    version: RESEARCH_PACK_VERSION,
    revision: 0,
    instruction: '',
    items: [],
    updatedAt: now,
  };
}

function clip(value: string, max: number): string {
  return value.length > max ? value.slice(0, max) : value;
}

function clipBody(text: string): string {
  const max = RESEARCH_PACK_LIMITS.maxItemChars;
  if (text.length <= max) return text;
  return `${text.slice(0, max - TRUNCATION_MARK.length)}${TRUNCATION_MARK}`;
}

function normalizeBody(text: string): string {
  return text
    .replace(/\r\n?/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** Identity of an item: the same text from the same conversation is the same item. */
export function buildItemId(sourceUrl: string, text: string): string {
  const conversation = sourceUrl.split(/[?#]/)[0];
  return `rp_${hashString(`${conversation}\n${normalizeBody(text)}`)}`;
}

export function addItem(
  pack: ResearchPack,
  draft: ResearchPackDraftItem,
  now: number,
): { pack: ResearchPack; outcome: AddItemOutcome } {
  const text = clipBody(normalizeBody(draft.text));
  if (!text) return { pack, outcome: 'empty' };

  const sourceUrl = safeHttpUrl(draft.sourceUrl) ?? '';
  const id = buildItemId(sourceUrl, text);
  if (pack.items.some((item) => item.id === id)) return { pack, outcome: 'duplicate' };
  if (pack.items.length >= RESEARCH_PACK_LIMITS.maxItems) return { pack, outcome: 'full' };

  const item: ResearchPackItem = {
    id,
    text,
    excerpt: draft.excerpt,
    prompt: clip(draft.prompt.replace(/\s+/g, ' ').trim(), RESEARCH_PACK_LIMITS.maxPromptChars),
    sourceTitle: clip(draft.sourceTitle.trim(), RESEARCH_PACK_LIMITS.maxTitleChars),
    sourceUrl,
    platform: draft.platform,
    citations: dedupeCitations(draft.citations),
    addedAt: now,
  };
  return {
    pack: { ...pack, items: [...pack.items, item], updatedAt: now },
    outcome: 'added',
  };
}

export function removeItem(pack: ResearchPack, id: string, now: number): ResearchPack {
  const items = pack.items.filter((item) => item.id !== id);
  if (items.length === pack.items.length) return pack;
  return { ...pack, items, updatedAt: now };
}

/** Move an item by `delta` positions; out-of-range moves are a no-op. */
export function moveItem(pack: ResearchPack, id: string, delta: number, now: number): ResearchPack {
  const from = pack.items.findIndex((item) => item.id === id);
  const to = from + delta;
  if (from < 0 || delta === 0 || to < 0 || to >= pack.items.length) return pack;
  const items = [...pack.items];
  const [moved] = items.splice(from, 1);
  items.splice(to, 0, moved);
  return { ...pack, items, updatedAt: now };
}

export function setInstruction(pack: ResearchPack, instruction: string, now: number): ResearchPack {
  const next = clip(instruction, RESEARCH_PACK_LIMITS.maxInstructionChars);
  if (next === pack.instruction) return pack;
  return { ...pack, instruction: next, updatedAt: now };
}

/** Empty the item list; the instruction is a reusable habit, so it stays. */
export function clearItems(pack: ResearchPack, now: number): ResearchPack {
  if (pack.items.length === 0) return pack;
  return { ...pack, items: [], updatedAt: now };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readString(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function parseCitations(value: unknown): ResearchPackCitation[] {
  if (!Array.isArray(value)) return [];
  const links = value
    .filter(isRecord)
    .map((entry) => ({ url: readString(entry.url), title: readString(entry.title) }));
  return dedupeCitations(links);
}

function parseItem(value: unknown): ResearchPackItem | null {
  if (!isRecord(value)) return null;
  const text = readString(value.text);
  // Stored data is untrusted too: only http(s) source links survive a load.
  const sourceUrl = safeHttpUrl(readString(value.sourceUrl)) ?? '';
  if (!text.trim()) return null;
  return {
    id: readString(value.id) || buildItemId(sourceUrl, text),
    text: clipBody(text),
    excerpt: value.excerpt === true,
    prompt: clip(readString(value.prompt), RESEARCH_PACK_LIMITS.maxPromptChars),
    sourceTitle: clip(readString(value.sourceTitle), RESEARCH_PACK_LIMITS.maxTitleChars),
    sourceUrl,
    platform: readString(value.platform) || 'unknown',
    citations: parseCitations(value.citations),
    addedAt: typeof value.addedAt === 'number' ? value.addedAt : 0,
  };
}

/** A pack written by a newer build; this build must neither show nor overwrite it. */
export function isNewerPackVersion(value: unknown): boolean {
  return (
    isRecord(value) && typeof value.version === 'number' && value.version > RESEARCH_PACK_VERSION
  );
}

/**
 * Read whatever is stored into a valid pack. Malformed entries are dropped
 * rather than failing the whole pack; a newer or unknown version reads as
 * empty (the store also refuses to write over a newer one).
 */
export function parsePack(value: unknown): ResearchPack {
  if (!isRecord(value)) return createEmptyPack();
  if (value.version !== RESEARCH_PACK_VERSION) return createEmptyPack();
  const seen = new Set<string>();
  const items: ResearchPackItem[] = [];
  for (const raw of Array.isArray(value.items) ? value.items : []) {
    const item = parseItem(raw);
    if (!item || seen.has(item.id)) continue;
    seen.add(item.id);
    items.push(item);
    if (items.length >= RESEARCH_PACK_LIMITS.maxItems) break;
  }
  const revision = value.revision;
  return {
    version: RESEARCH_PACK_VERSION,
    revision:
      Number.isSafeInteger(revision) && (revision as number) >= 0 ? (revision as number) : 0,
    instruction: clip(readString(value.instruction), RESEARCH_PACK_LIMITS.maxInstructionChars),
    items,
    updatedAt: typeof value.updatedAt === 'number' ? value.updatedAt : 0,
  };
}
