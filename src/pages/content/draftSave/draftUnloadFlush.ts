/** Page cleanup flushes before either native drafts or PluginHost can discard their pending tail. */
const flushers = new Set<() => void>();

export function registerDraftFlush(flush: () => void): () => void {
  flushers.add(flush);
  return () => {
    flushers.delete(flush);
  };
}

/** Initiates storage operations only; a closing browser cannot guarantee asynchronous completion. */
export function flushDraftsBeforeUnload(): void {
  // Snapshot because a flush can unregister another owner during page teardown.
  // oxlint-disable-next-line unicorn/no-useless-spread
  for (const flush of [...flushers]) {
    try {
      flush();
    } catch {
      /* One retired owner must not prevent another owner's best-effort save. */
    }
  }
}
