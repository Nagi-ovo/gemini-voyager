/**
 * Which documents a catalog `sendShortcut` owns the composer's Enter key on.
 *
 * While it does, no Enter reaches the host: the shortcut turns it into a
 * newline or clicks the send button itself. Other primitives that infer a
 * send from Enter (`draftSave`) read this at event time instead of relying on
 * whose capture listener was registered first, and take the click as the send.
 */
const owners = new WeakMap<Document, number>();

/** Marks `doc` as owned until the returned release runs; each claim releases once. */
export function claimComposerEnter(doc: Document): () => void {
  owners.set(doc, (owners.get(doc) ?? 0) + 1);
  let released = false;
  return () => {
    if (released) return;
    released = true;
    const remaining = (owners.get(doc) ?? 1) - 1;
    if (remaining > 0) owners.set(doc, remaining);
    else owners.delete(doc);
  };
}

/** Whether a send shortcut owns the composer's Enter key on `doc`. */
export function composerEnterIsOwned(doc: Document): boolean {
  return (owners.get(doc) ?? 0) > 0;
}
