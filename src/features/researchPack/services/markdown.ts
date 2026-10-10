/**
 * Assemble a research pack into portable Markdown.
 *
 * The scaffolding is English on purpose: the reader is another model, and a
 * fixed structure keeps the pack predictable whatever language the excerpts
 * are in. The instruction goes last so the receiving model reads the context
 * before the task.
 */
import { safeHttpUrl } from './citations';
import type { ResearchPack, ResearchPackCitation } from './types';

/** A Map, not an object: a stored platform such as `constructor` must not hit Object.prototype. */
const PLATFORM_LABELS: ReadonlyMap<string, string> = new Map([
  ['gemini', 'Gemini'],
  ['aistudio', 'AI Studio'],
  ['chatgpt', 'ChatGPT'],
  ['claude', 'Claude'],
]);

export interface PackSourceEntry extends ResearchPackCitation {
  /** 1-based position in the pack-wide source list. */
  index: number;
}

export interface PackSourceIndex {
  sources: PackSourceEntry[];
  /** For each item (by position), the pack-wide numbers of the sources it cites. */
  refsByItem: number[][];
}

/**
 * Number every cited URL once across the whole pack, in first-seen order, and
 * record which numbers each item cites. A URL cited by three answers appears
 * once in the list and is referenced from all three.
 */
export function indexPackSources(pack: ResearchPack): PackSourceIndex {
  const byUrl = new Map<string, PackSourceEntry>();
  const refsByItem = pack.items.map((item) => {
    const refs: number[] = [];
    for (const citation of item.citations) {
      if (!safeHttpUrl(citation.url)) continue;
      let entry = byUrl.get(citation.url);
      if (!entry) {
        entry = { ...citation, index: byUrl.size + 1 };
        byUrl.set(citation.url, entry);
      } else if (!entry.title && citation.title) {
        entry.title = citation.title;
      }
      if (!refs.includes(entry.index)) refs.push(entry.index);
    }
    return refs;
  });
  return { sources: Array.from(byUrl.values()), refsByItem };
}

/**
 * Escape page- or storage-derived metadata (titles, prompts, labels) so it
 * stays literal text: no emphasis, no links, no raw HTML. Answer bodies are
 * left alone; they are Markdown the user chose to carry.
 */
export function escapeInlineMarkdown(text: string): string {
  return text.replace(/\s+/g, ' ').replace(/[\\`*_[\]<>&~]/g, '\\$&');
}

function escapeLinkUrl(url: string): string {
  return url
    .replace(/\(/g, '%28')
    .replace(/\)/g, '%29')
    .replace(/ /g, '%20')
    .replace(/</g, '%3C')
    .replace(/>/g, '%3E');
}

/** A Markdown link only for http(s) targets; anything else degrades to its escaped title. */
function link(title: string, url: string): string {
  const safeUrl = safeHttpUrl(url);
  if (!safeUrl) return escapeInlineMarkdown(title);
  if (!title) return `<${escapeLinkUrl(safeUrl)}>`;
  return `[${escapeInlineMarkdown(title)}](${escapeLinkUrl(safeUrl)})`;
}

function formatDate(now: number): string {
  return new Date(now).toISOString().slice(0, 10);
}

export function platformLabel(platform: string): string {
  return PLATFORM_LABELS.get(platform) ?? platform;
}

export function buildResearchPackMarkdown(pack: ResearchPack, now: number): string {
  const { sources, refsByItem } = indexPackSources(pack);
  const count = pack.items.length;
  const lines: string[] = [
    '# Research pack',
    '',
    `_${count} ${count === 1 ? 'excerpt' : 'excerpts'} from earlier AI conversations, assembled ${formatDate(now)}._`,
    '',
    'Treat the excerpts as context to check, not as established fact. Numbers in square brackets refer to the source list.',
  ];

  pack.items.forEach((item, position) => {
    const title = item.sourceTitle || `Answer ${position + 1}`;
    lines.push('', `## ${position + 1}. ${escapeInlineMarkdown(title)}`, '');
    lines.push(
      `- From: ${link(title, item.sourceUrl)} (${escapeInlineMarkdown(platformLabel(item.platform))})`,
    );
    if (item.prompt) lines.push(`- Prompt: ${escapeInlineMarkdown(item.prompt)}`);
    if (item.excerpt) lines.push('- Scope: selected part of the answer');
    const refs = refsByItem[position];
    if (refs.length > 0) lines.push(`- Cites: ${refs.map((ref) => `[${ref}]`).join(', ')}`);
    lines.push('', item.text);
  });

  if (sources.length > 0) {
    lines.push('', '## Sources', '');
    for (const source of sources) {
      lines.push(`${source.index}. ${link(source.title, source.url)}`);
    }
  }

  const instruction = pack.instruction.trim();
  if (instruction) {
    lines.push('', '## Instruction', '', instruction);
  }

  return `${lines.join('\n')}\n`;
}

/** Filesystem-safe download name, e.g. `research-pack-2026-10-01.md`. */
export function buildResearchPackFilename(now: number): string {
  return `research-pack-${formatDate(now)}.md`;
}
