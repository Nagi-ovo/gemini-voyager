import { vi } from 'vitest';

/**
 * Replace `MutationObserver` with one that records which observers are
 * observing, so a test can tell whether a preparation stopped watching.
 * Restore with `vi.unstubAllGlobals()`.
 */
export function trackMutationObservers(): ReadonlySet<MutationObserver> {
  const observing = new Set<MutationObserver>();

  class TrackedMutationObserver extends MutationObserver {
    override observe(target: Node, options?: MutationObserverInit): void {
      observing.add(this);
      super.observe(target, options);
    }

    override disconnect(): void {
      observing.delete(this);
      super.disconnect();
    }
  }

  vi.stubGlobal('MutationObserver', TrackedMutationObserver);
  return observing;
}
