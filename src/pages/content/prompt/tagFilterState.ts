/**
 * Prompt-manager tag-filter persistence helper (#729).
 *
 * The set of tag chips a user has toggled to narrow the prompt list is stored
 * as a plain `string[]` in `chrome.storage.local` so it survives tab reloads
 * and new tabs. This module is the single guard for every read of that value:
 * it both validates the persisted shape and reconciles it against the tags
 * that actually exist right now.
 *
 * Why local-only and not part of cloud sync: the filter is a *view* over this
 * device's current prompt set, not a portable preference. Syncing it would let
 * a device whose prompts haven't synced yet restore tags it doesn't have,
 * leaving the list stuck on a chip-less "ghost" filter that hides everything.
 */

/**
 * Reconcile a persisted tag filter against the tags currently in use.
 *
 * - Non-array / corrupt input → empty filter. A malformed stored value must
 *   never throw; panel startup depends on this never breaking.
 * - Each entry is normalized to lowercase, matching how tags are stored on
 *   prompts (see `collectAllTags`).
 * - Only tags present in `knownTags` survive, so a deleted or renamed tag is
 *   dropped instead of stranding the list on a filter with no matching chip.
 * - Output is ordered and de-duplicated by `knownTags`, keeping the persisted
 *   array deterministic across writes.
 */
export function sanitizeSelectedTags(saved: unknown, knownTags: string[]): string[] {
  if (!Array.isArray(saved)) return [];
  const wanted = new Set(
    saved.filter((t): t is string => typeof t === 'string').map((t) => t.toLowerCase()),
  );
  if (wanted.size === 0) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of knownTags) {
    const tag = String(raw).toLowerCase();
    if (wanted.has(tag) && !seen.has(tag)) {
      seen.add(tag);
      out.push(tag);
    }
  }
  return out;
}
