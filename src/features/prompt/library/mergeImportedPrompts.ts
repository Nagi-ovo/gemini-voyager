/**
 * How the prompts import merges a file (or a Drive copy) into the library.
 * The background owner applies it inside its queue; nothing else calls it.
 */
import { getPromptNameConflictIds } from '@/core/utils/promptName';
import { isNewerPromptCopy, promptEditTime } from '@/core/utils/promptRevision';
import type { PromptItem } from '@/features/backup/types/backup';

import { createPromptTextIndex } from './promptTextIndex';

export interface PromptImportStats {
  imported: number;
  duplicates: number;
  nameConflicts: number;
  total: number;
}

/**
 * Merge imported prompts into a library, as the prompts import always has:
 * a prompt matching a stored one by id (or else by text) merges tags into it,
 * and a same-id copy that wins (`isNewerPromptCopy`) replaces its text, name and
 * pin and brings its edit time. A winner's `pinnedAt: null` unpins; a winner
 * without the field (an older version's copy) leaves the pin alone. Anything else is added as it came. A merge never
 * stamps the time it ran. `stored` is the freshly read library; its prompts are
 * updated in place.
 *
 * Array position is the manual order, so stored prompts keep their positions.
 * An added prompt goes right after the stored prompt it follows in `incoming`
 * (the nearest earlier one that matched), or to the front when none did;
 * prompts sharing a place keep their incoming order.
 */
export function mergeImportedPrompts(
  stored: PromptItem[],
  incoming: PromptItem[],
): PromptImportStats & { items: PromptItem[] } {
  const storedItems = new Set(stored);
  /** Added prompts by the stored prompt they follow; `null` is the front. */
  const placed = new Map<PromptItem | null, PromptItem[]>();
  let anchor: PromptItem | null = null;

  // Index one merge target per body without using the map as the final
  // collection. Historical stores may themselves contain duplicates and
  // must never be collapsed by a later import.
  const existingByText = createPromptTextIndex();
  const existingById = new Map<string, PromptItem>();
  for (const item of stored) {
    existingByText.add(item);
    if (!existingById.has(item.id)) existingById.set(item.id, item);
  }

  let imported = 0;
  let duplicates = 0;

  for (const item of incoming) {
    const key = item.text.toLowerCase();
    const existingWithId = existingById.get(item.id);
    const existing = existingWithId ?? existingByText.get(key);
    if (existing) {
      // Merge tags if duplicate
      const mergedTags = Array.from(new Set([...(existing.tags || []), ...(item.tags || [])]));
      existing.tags = mergedTags;
      const shouldApplySameIdUpdate =
        existingWithId === existing && isNewerPromptCopy(item, existing);

      if (item.name && (shouldApplySameIdUpdate || !existing.name)) {
        existing.name = item.name;
      }

      if (shouldApplySameIdUpdate) {
        existing.updatedAt = promptEditTime(item);
        existingByText.setText(existing, item.text);
        // Pinning bumps `updatedAt`, so the winner's pin is the newer choice.
        if (item.pinnedAt !== undefined) existing.pinnedAt = item.pinnedAt;
      }
      duplicates++;
      // A prompt this import added is placed already; only a stored one is an anchor.
      if (storedItems.has(existing)) anchor = existing;
    } else {
      const importedItem = { ...item };
      existingByText.add(importedItem);
      existingById.set(importedItem.id, importedItem);
      const group = placed.get(anchor);
      if (group) group.push(importedItem);
      else placed.set(anchor, [importedItem]);
      imported++;
    }
  }

  const mergedItems = [
    ...(placed.get(null) ?? []),
    ...stored.flatMap((item) => [item, ...(placed.get(item) ?? [])]),
  ];
  const nameConflicts = getPromptNameConflictIds(mergedItems).size;
  return {
    items: mergedItems,
    imported,
    duplicates,
    nameConflicts,
    total: mergedItems.length,
  };
}
