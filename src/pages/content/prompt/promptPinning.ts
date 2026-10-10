/* Pinning for the Prompt Manager list.
 *
 * A pin is a timestamp on the prompt itself, not a separate list, so it rides
 * along with every path that already moves a prompt: storage, export, and the
 * cloud merge, which resolves by `updatedAt` and therefore carries the pin as
 * long as pinning bumps it.
 *
 * Pinned prompts render as a group above the rest. Within each group the manual
 * array order still decides, so pinning and dragging stay independent: pinning
 * chooses the group, dragging chooses the position inside it.
 */

export type Pinnable = { id: string; pinnedAt?: number | null; updatedAt?: number };

export function isPinned(item: Pinnable): boolean {
  return typeof item.pinnedAt === 'number' && Number.isFinite(item.pinnedAt);
}

/** Display order: pinned first, each group keeping the order of the source array. */
export function sortPinnedFirst<T extends Pinnable>(items: T[]): T[] {
  const pinned: T[] = [];
  const rest: T[] = [];
  for (const item of items) (isPinned(item) ? pinned : rest).push(item);
  return pinned.length === 0 || rest.length === 0 ? items : [...pinned, ...rest];
}

/** How many leading rows of `sortPinnedFirst` output are pinned. */
export function pinnedCount(items: Pinnable[]): number {
  return items.reduce((total, item) => (isPinned(item) ? total + 1 : total), 0);
}

/**
 * Flips one prompt's pin. `updatedAt` is bumped so the cloud merge treats the
 * change as newer than whatever the other device holds; without that a pin made
 * here would lose to a stale copy on the next sync.
 */
export function togglePin<T extends Pinnable>(items: T[], id: string, now: number): T[] {
  let changed = false;
  const next = items.map((item) => {
    if (item.id !== id) return item;
    changed = true;
    // An unpin writes `null`: a merge reads an absent field as "no pin information".
    return { ...item, pinnedAt: isPinned(item) ? null : now, updatedAt: now };
  });
  return changed ? next : items;
}

/** Groups a prompt for a drag session: a drop may not cross the divider. */
export function pinGroupOf(items: Pinnable[], id: string): 'pinned' | 'rest' {
  const item = items.find((candidate) => candidate.id === id);
  return item && isPinned(item) ? 'pinned' : 'rest';
}
