import { getPromptNameComparisonKey } from '@/core/utils/promptName';
/**
 * Research pack templates are Prompt Manager prompts tagged `research-pack`.
 *
 * A template is a named instruction, which is exactly what a prompt is, so it
 * lives in the prompt library (`gvPromptItems`) and travels in the library's
 * own `gemini-voyager.prompts.v1` file format. That gives templates the
 * prompt library's editing, Drive sync and backups, and a template file the
 * popup's prompt import also reads. Nothing from a pack (answers, prompts,
 * sources) is ever part of a template.
 *
 * A template file from someone else is untrusted. Importing keeps only each
 * template's name and text, checks them strictly, and only ever adds new
 * prompts: it never matches stored prompts by id, so a file cannot overwrite
 * or edit anything already in the library.
 */
import { PromptImportExportService } from '@/features/backup/services/PromptImportExportService';
import type {
  PromptLibraryOp,
  PromptLibraryResult,
} from '@/features/prompt/library/promptLibraryOwner';

import { RESEARCH_PACK_LIMITS } from './types';

/** Prompt Manager stores tags lowercased; this one marks a prompt as a pack template. */
export const RESEARCH_PACK_TEMPLATE_TAG = 'research-pack';

export const PROMPT_EXPORT_FORMAT = 'gemini-voyager.prompts.v1';

export const RESEARCH_PACK_TEMPLATE_LIMITS = {
  /** Checked on the file's size before it is read. */
  maxFileBytes: 64 * 1024,
  /** Entries in a file, templates or not. */
  maxFileItems: 50,
  maxNameChars: 100,
  /** A template fills the pack instruction, so it can be no longer than one. */
  maxTextChars: RESEARCH_PACK_LIMITS.maxInstructionChars,
} as const;

export interface ResearchPackTemplate {
  id: string;
  name: string;
  text: string;
}

/** A template as it arrives in a file: only what an import keeps. */
export interface TemplateDraft {
  name: string;
  text: string;
}

export type TemplateFileError =
  | 'too_large'
  | 'invalid_json'
  | 'wrong_format'
  | 'too_many'
  | 'invalid_template'
  | 'no_templates';

export type TemplateFileResult =
  | { ok: true; templates: TemplateDraft[] }
  | { ok: false; error: TemplateFileError };

/** What saving a draft would do: add it, or skip it because the library has it. */
export type TemplateSaveStatus = 'new' | 'duplicate_text' | 'name_taken';

export interface PlannedTemplate extends TemplateDraft {
  status: TemplateSaveStatus;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function hasTemplateTag(value: unknown): boolean {
  return (
    Array.isArray(value) &&
    value.some(
      (tag) => typeof tag === 'string' && tag.trim().toLowerCase() === RESEARCH_PACK_TEMPLATE_TAG,
    )
  );
}

// Control characters other than tab and newline have no place in an instruction.
// oxlint-disable-next-line no-control-regex -- matching control characters is the point
const TEXT_CONTROL = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/;
// A name is one visible line that tells templates apart, so it also refuses
// what renders as nothing or reorders what follows: format characters
// (zero-width spaces and joiners, soft hyphens, BOM, bidi marks, embeddings,
// overrides and isolates), line and paragraph separators, and the blank
// Hangul fillers. Otherwise "Trusted" and "Trusted" plus a zero-width space
// would show as the same name.
const NAME_FORBIDDEN = /[\p{Cc}\p{Cf}\p{Zl}\p{Zp}\u034F\u115F\u1160\u3164\uFFA0]/u;

function normalizeNewlines(text: string): string {
  return text.replace(/\r\n?/g, '\n');
}

function textKey(text: string): string {
  return text.trim().toLowerCase();
}

/** A template's name and text, or null when either breaks a rule. */
export function checkTemplateDraft(name: unknown, text: unknown): TemplateDraft | null {
  if (typeof name !== 'string' || typeof text !== 'string') return null;
  const cleanName = name.trim();
  const cleanText = normalizeNewlines(text).trim();
  if (!cleanName || cleanName.length > RESEARCH_PACK_TEMPLATE_LIMITS.maxNameChars) return null;
  if (!cleanText || cleanText.length > RESEARCH_PACK_TEMPLATE_LIMITS.maxTextChars) return null;
  if (NAME_FORBIDDEN.test(cleanName) || TEXT_CONTROL.test(cleanText)) return null;
  return { name: cleanName, text: cleanText };
}

/** The pack templates in a stored prompt library, in library order. */
export function listTemplates(library: unknown): ResearchPackTemplate[] {
  if (!Array.isArray(library)) return [];
  const templates: ResearchPackTemplate[] = [];
  for (const item of library) {
    if (!isRecord(item) || !hasTemplateTag(item.tags)) continue;
    const { id, name, text } = item;
    if (typeof id !== 'string' || typeof text !== 'string' || !text.trim()) continue;
    const label =
      typeof name === 'string' && name.trim() ? name.trim() : text.trim().split('\n')[0];
    templates.push({ id, name: label, text });
  }
  return templates;
}

/**
 * Read a template file. Only the prompts format object is accepted, and only
 * its entries tagged as templates are read; other prompts in the file are
 * ignored. One broken template rejects the whole file.
 */
export function parseTemplateFile(content: string): TemplateFileResult {
  if (content.length > RESEARCH_PACK_TEMPLATE_LIMITS.maxFileBytes) {
    return { ok: false, error: 'too_large' };
  }
  let payload: unknown;
  try {
    payload = JSON.parse(content);
  } catch {
    return { ok: false, error: 'invalid_json' };
  }
  if (!isRecord(payload) || payload.format !== PROMPT_EXPORT_FORMAT) {
    return { ok: false, error: 'wrong_format' };
  }
  const items = payload.items;
  if (!Array.isArray(items)) return { ok: false, error: 'wrong_format' };
  if (items.length > RESEARCH_PACK_TEMPLATE_LIMITS.maxFileItems) {
    return { ok: false, error: 'too_many' };
  }
  const templates: TemplateDraft[] = [];
  for (const item of items) {
    if (!isRecord(item) || !hasTemplateTag(item.tags)) continue;
    const draft = checkTemplateDraft(item.name, item.text);
    if (!draft) return { ok: false, error: 'invalid_template' };
    templates.push(draft);
  }
  if (templates.length === 0) return { ok: false, error: 'no_templates' };
  return { ok: true, templates };
}

/**
 * Which drafts saving would add. Prompt Manager refuses a second prompt with
 * the same text (ignoring case) or the same name, so those are skipped, also
 * against drafts earlier in the same batch.
 */
export function planTemplateSave(library: unknown, drafts: TemplateDraft[]): PlannedTemplate[] {
  const stored = Array.isArray(library) ? library.filter(isRecord) : [];
  const texts = new Set(
    stored.flatMap((item) => (typeof item.text === 'string' ? [textKey(item.text)] : [])),
  );
  const names = new Set(
    stored.flatMap((item) =>
      typeof item.name === 'string' && item.name.trim()
        ? [getPromptNameComparisonKey(item.name)]
        : [],
    ),
  );
  return drafts.map((draft) => {
    const text = textKey(draft.text);
    const name = getPromptNameComparisonKey(draft.name);
    let status: TemplateSaveStatus = 'new';
    if (texts.has(text)) status = 'duplicate_text';
    else if (names.has(name)) status = 'name_taken';
    else {
      texts.add(text);
      names.add(name);
    }
    return { ...draft, status };
  });
}

export interface TemplateLibraryArea {
  get(key: string): Promise<Record<string, unknown>>;
}

export interface TemplateLibrary {
  /** The stored prompt library as it is, for listing and planning. */
  load(): Promise<unknown>;
  /**
   * Add the drafts that are still new against the library as it is now, ahead
   * of the existing prompts as Prompt Manager adds them. Returns how many were added.
   */
  save(drafts: TemplateDraft[]): Promise<number>;
}

function newPromptId(): string {
  return `prompt-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * The prompt library under `key`, read straight from storage. Saving goes
 * through `apply`, the prompt library's single writer, which adds the new
 * templates against the library as stored at that moment, so a save from
 * another tab, Prompt Manager or a Drive merge is never written over. A stored
 * value that is not a list is never overwritten.
 */
export function createTemplateLibrary(options: {
  area: TemplateLibraryArea;
  key: string;
  apply: (op: PromptLibraryOp) => Promise<PromptLibraryResult>;
  now?: () => number;
  makeId?: () => string;
}): TemplateLibrary {
  const now = options.now ?? Date.now;
  const makeId = options.makeId ?? newPromptId;
  const load = async (): Promise<unknown> => (await options.area.get(options.key))?.[options.key];
  return {
    load,
    async save(drafts) {
      const stored = await load();
      if (stored !== undefined && !Array.isArray(stored)) {
        throw new Error('The prompt library is not a list');
      }
      const createdAt = now();
      const items = planTemplateSave(stored ?? [], drafts)
        .filter((planned) => planned.status === 'new')
        .map(({ name, text }) => ({
          id: makeId(),
          name,
          text,
          tags: [RESEARCH_PACK_TEMPLATE_TAG],
          createdAt,
        }));
      if (items.length === 0) return 0;
      return (await options.apply({ kind: 'add', items })).added;
    },
  };
}

/**
 * A one-template file in the prompts format, carrying only the template's name
 * and text. The id is new on every export: the popup's prompt import matches
 * stored prompts by id and lets a newer copy replace their text, so a shared
 * file must never carry an id a recipient may already hold.
 */
export function buildTemplateFile(
  template: TemplateDraft,
  now: number,
  makeId: () => string = newPromptId,
): string {
  const payload = PromptImportExportService.exportToPayload([
    {
      id: makeId(),
      name: template.name,
      text: template.text,
      tags: [RESEARCH_PACK_TEMPLATE_TAG],
      createdAt: now,
    },
  ]);
  return `${JSON.stringify(payload, null, 2)}\n`;
}

/** e.g. `research-pack-template-2026-10-01.json`. */
export function buildTemplateFilename(now: number): string {
  return `research-pack-template-${new Date(now).toISOString().slice(0, 10)}.json`;
}
