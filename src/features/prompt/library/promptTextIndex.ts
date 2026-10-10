/**
 * The prompts import's lookup by body: for each lower-cased text, the earliest
 * prompt holding it, in the order prompts were added to the index (the stored
 * library first, then the prompts the import adds). A body edit moves one
 * prompt between two buckets instead of rebuilding the whole index.
 */
import type { PromptItem } from '@/features/backup/types/backup';

export interface PromptTextIndex {
  /** Adds a prompt after every prompt already indexed. */
  add(item: PromptItem): void;
  /** The earliest indexed prompt with this lower-cased text. */
  get(key: string): PromptItem | undefined;
  /** Changes an indexed prompt's text and moves it to its new bucket. */
  setText(item: PromptItem, text: string): void;
}

const keyOf = (item: PromptItem): string => item.text.toLowerCase();

export function createPromptTextIndex(): PromptTextIndex {
  const rank = new Map<PromptItem, number>();
  /** Each bucket holds its prompts in rank order. */
  const buckets = new Map<string, PromptItem[]>();

  const insert = (key: string, item: PromptItem): void => {
    const bucket = buckets.get(key);
    if (!bucket) {
      buckets.set(key, [item]);
      return;
    }
    const itemRank = rank.get(item)!;
    let at = bucket.length;
    while (at > 0 && rank.get(bucket[at - 1])! > itemRank) at -= 1;
    bucket.splice(at, 0, item);
  };

  return {
    add(item) {
      rank.set(item, rank.size);
      insert(keyOf(item), item);
    },
    get(key) {
      return buckets.get(key)?.[0];
    },
    setText(item, text) {
      const from = keyOf(item);
      item.text = text;
      const to = keyOf(item);
      if (from === to) return;
      const bucket = buckets.get(from)!;
      bucket.splice(bucket.indexOf(item), 1);
      if (bucket.length === 0) buckets.delete(from);
      insert(to, item);
    },
  };
}
