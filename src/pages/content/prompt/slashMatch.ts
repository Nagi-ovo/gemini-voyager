/**
 * Which saved Prompts slash completion offers, and in what order.
 *
 * Names are the only handle: a Prompt without one, or whose name collides with
 * another under the shared comparison key, is left out entirely so `/name`
 * never resolves to the wrong body.
 */
import { type PromptItem } from '@/core/types/sync';
import { getPromptNameComparisonKey, getPromptNameConflictIds } from '@/core/utils/promptName';

const MAX_RESULTS = 8;

export function isPromptItem(value: unknown): value is PromptItem {
  if (!value || typeof value !== 'object') return false;
  const item = value as Partial<PromptItem>;
  return typeof item.id === 'string' && typeof item.text === 'string';
}

function usablePrompts(items: PromptItem[]): PromptItem[] {
  const conflictIds = getPromptNameConflictIds(items);
  return items.filter(
    (item) => typeof item.name === 'string' && item.name.trim() !== '' && !conflictIds.has(item.id),
  );
}

/** Returns whether at least one saved Prompt can be addressed unambiguously by slash completion. */
export function hasSlashEligiblePrompts(items: PromptItem[]): boolean {
  return usablePrompts(items).length > 0;
}

/** Matches names only. Prompt body and tags are deliberately excluded. */
export function matchSlashPrompts(items: PromptItem[], query: string): PromptItem[] {
  const normalizedQuery = getPromptNameComparisonKey(query);
  return usablePrompts(items)
    .filter((item) => getPromptNameComparisonKey(item.name!).includes(normalizedQuery))
    .sort((left, right) => {
      const leftName = getPromptNameComparisonKey(left.name!);
      const rightName = getPromptNameComparisonKey(right.name!);
      const leftPrefix = leftName.startsWith(normalizedQuery) ? 0 : 1;
      const rightPrefix = rightName.startsWith(normalizedQuery) ? 0 : 1;
      return leftPrefix - rightPrefix || leftName.localeCompare(rightName);
    })
    .slice(0, MAX_RESULTS);
}

/** The completion `name` adds to what has been typed, or '' when it adds none. */
export function ghostSuffix(typed: string, name: string): string {
  const trimmed = name.trim();
  if (!typed || typed.length >= trimmed.length) return '';
  return trimmed.toLowerCase().startsWith(typed.toLowerCase()) ? trimmed.slice(typed.length) : '';
}
