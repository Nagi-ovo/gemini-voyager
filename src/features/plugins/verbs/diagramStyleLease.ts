/**
 * Page-level stylesheets (a fullscreen viewer's, by element id) that several
 * diagram activations share. Two plugins can draw the same kind of diagram on
 * different blocks; the style must stay until the last of them is gone, not
 * leave with whichever installed it first.
 *
 * A style this build finds already on the page (Gemini's native renderer
 * installs the same ids) is used but never removed.
 */

interface Lease {
  holders: number;
  /** Whether a lease created the element, so the last release removes it. */
  owned: boolean;
}

const leases = new WeakMap<Document, Map<string, Lease>>();

/**
 * Holds the style element `id` on `doc`, calling `create` (which must add an
 * element with that id) when none is there. The returned release is idempotent.
 */
export function leaseDiagramStyle(doc: Document, id: string, create: () => void): () => void {
  let byId = leases.get(doc);
  if (!byId) {
    byId = new Map();
    leases.set(doc, byId);
  }
  let lease = byId.get(id);
  if (!lease) {
    lease = { holders: 0, owned: false };
    byId.set(id, lease);
  }
  if (!doc.getElementById(id)) {
    create();
    lease.owned = true;
  }
  lease.holders += 1;

  const held = lease;
  const table = byId;
  let released = false;
  return () => {
    if (released) return;
    released = true;
    held.holders -= 1;
    if (held.holders > 0) return;
    table.delete(id);
    if (held.owned) doc.getElementById(id)?.remove();
  };
}
