/**
 * One Voyager content script per document.
 *
 * Reloading or updating the extension orphans the running content script: its
 * runtime is invalidated, but its DOM, observers and listeners stay alive.
 * The background then injects a fresh copy into the open tab, so without a
 * handoff both copies run side by side (two timeline preview panels on
 * ChatGPT, twice the observer work). The page DOM is the only channel both
 * copies share, so a new copy announces itself there and the earlier copy
 * retires.
 */
export const CONTENT_SCRIPT_HANDOFF_EVENT = 'gv:content-script-handoff';

/**
 * Retire any earlier copy in `doc`, then stay ready to be retired by a later
 * one once this copy is orphaned. Returns a function that stops listening.
 */
export function claimContentScript(
  retire: () => void,
  isOrphaned: () => boolean,
  doc: Document = document,
): () => void {
  doc.dispatchEvent(new Event(CONTENT_SCRIPT_HANDOFF_EVENT));
  const onHandoff = (): void => {
    // The page can dispatch this event too; only a copy whose extension is gone steps aside.
    if (!isOrphaned()) return;
    doc.removeEventListener(CONTENT_SCRIPT_HANDOFF_EVENT, onHandoff);
    retire();
  };
  // Added after dispatching, so a copy never retires itself.
  doc.addEventListener(CONTENT_SCRIPT_HANDOFF_EVENT, onHandoff);
  return () => doc.removeEventListener(CONTENT_SCRIPT_HANDOFF_EVENT, onHandoff);
}
