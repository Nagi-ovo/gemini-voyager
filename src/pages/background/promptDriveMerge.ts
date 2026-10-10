/**
 * The prompts-only Drive merges, run through the prompt-library owner so a
 * template or prompt saved while Drive answers is merged with, not dropped.
 */
import { PromptImportExportService } from '@/features/backup/services/PromptImportExportService';
import type { PromptItem } from '@/features/backup/types/backup';
import {
  type PromptLibraryOwner,
  applyPromptLibraryOp,
} from '@/features/prompt/library/promptLibraryOwner';

export type PromptPullOutcome =
  | { ok: true; empty: true }
  | { ok: boolean; imported: number; duplicates: number; nameConflicts: number };

/** Merge the cloud prompts into the library. A cloud file with no prompts changes nothing. */
export async function mergeCloudPrompts(
  owner: PromptLibraryOwner,
  cloudPayload: unknown,
): Promise<PromptPullOutcome> {
  const validated = PromptImportExportService.validatePayload(cloudPayload);
  if (!validated.success) return { ok: true, empty: true };
  try {
    const result = await owner.apply({ kind: 'import', items: validated.data.items });
    return {
      ok: true,
      imported: result.added,
      duplicates: result.skipped,
      nameConflicts: result.nameConflicts,
    };
  } catch {
    return { ok: false, imported: 0, duplicates: 0, nameConflicts: 0 };
  }
}

/**
 * Merge the cloud prompts into the library and return the library to upload,
 * read in the same turn of the queue, or null when it could not be merged.
 */
export async function mergeCloudPromptsForUpload(
  owner: PromptLibraryOwner,
  cloudPayload: unknown,
): Promise<PromptItem[] | null> {
  const validated = PromptImportExportService.validatePayload(cloudPayload);
  try {
    return await owner.transact((stored) => {
      if (!validated.success) return { items: null, result: stored as PromptItem[] };
      const merged = applyPromptLibraryOp(stored, {
        kind: 'import',
        items: validated.data.items,
      });
      const items = (merged.items ?? stored) as PromptItem[];
      return { items, result: items };
    });
  } catch {
    return null;
  }
}
