export interface ImportedPromptDraft {
  text: string;
  tags: string[];
  /**
   * Optional user-authored label. Preserved through import so round-tripping
   * an exported JSON doesn't silently drop the compact-mode headline users
   * set in the add/edit form.
   */
  name?: string;
}

export type PromptImportParseResult =
  | { status: 'invalid' }
  | { status: 'empty' }
  | { status: 'ok'; items: ImportedPromptDraft[] };

const PROMPT_EXPORT_FORMAT = 'gemini-voyager.prompts.v1';

function dedupeImportedTags(tags: string[]): string[] {
  const seen = new Set<string>();
  const output: string[] = [];

  for (const rawTag of tags) {
    const normalizedTag = rawTag.trim().toLowerCase();
    if (!normalizedTag || seen.has(normalizedTag)) continue;
    seen.add(normalizedTag);
    output.push(normalizedTag);
  }

  return output;
}

export function parsePromptImportPayload(payload: unknown): PromptImportParseResult {
  let sourceItems: unknown[] | null = null;

  if (Array.isArray(payload)) {
    sourceItems = payload;
  } else if (payload && typeof payload === 'object') {
    const candidate = payload as Record<string, unknown>;
    if (candidate.format !== PROMPT_EXPORT_FORMAT && !Array.isArray(candidate.items)) {
      return { status: 'invalid' };
    }
    sourceItems = Array.isArray(candidate.items) ? candidate.items : [];
  } else {
    return { status: 'invalid' };
  }

  if (sourceItems.length === 0) {
    return { status: 'empty' };
  }

  const validItems: ImportedPromptDraft[] = [];
  const seenKeys = new Set<string>();

  for (const item of sourceItems) {
    const candidate = item as Record<string, unknown>;
    const text = String(candidate?.text ?? '').trim();
    if (!text) continue;

    const tags = Array.isArray(candidate?.tags)
      ? candidate.tags.map((tag: unknown) => String(tag))
      : [];
    const normalizedTags = dedupeImportedTags(tags);
    const dedupeKey = `${text.toLowerCase()}|${[...normalizedTags].sort().join(',')}`;

    if (seenKeys.has(dedupeKey)) continue;
    seenKeys.add(dedupeKey);
    const rawName = typeof candidate?.name === 'string' ? candidate.name.trim() : '';
    const draft: ImportedPromptDraft = { text, tags: normalizedTags };
    if (rawName) draft.name = rawName;
    validItems.push(draft);
  }

  if (validItems.length === 0) {
    return { status: 'invalid' };
  }

  return {
    status: 'ok',
    items: validItems,
  };
}
