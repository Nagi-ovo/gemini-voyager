import type { Dispose, PluginScope } from '@/features/plugins/runtime/pluginScope';

import { fixBrokenBoldTags } from './index';

/**
 * A mounted observer with a debounce has no interruptible workflow phases, so
 * PluginScope owns its lifetime directly (STATE_MACHINE_PLAN §2).
 * Repairs move Gemini-owned nodes: retain repaired DOM on disable rather than
 * replaying snapshots that could overwrite a host render or its live bindings.
 */
export function activateGeminiMarkdownFix(scope: PluginScope): void {
  if (scope.isDisposed) return;
  fixBrokenBoldTags(document.body);

  const pendingNodes = new Set<HTMLElement>();
  let cancelScan: Dispose | null = null;

  const scan = (): void => {
    cancelScan = null;
    if (scope.isDisposed) return;
    const nodes = Array.from(pendingNodes);
    pendingNodes.clear();
    for (const node of nodes) {
      if (node.isConnected) fixBrokenBoldTags(node);
    }
  };

  const stopObserving = scope.observe(
    document.body,
    { childList: true, subtree: true },
    (mutations) => {
      if (scope.isDisposed) return;
      for (const mutation of mutations) {
        for (const node of mutation.addedNodes) {
          if (node instanceof HTMLElement) pendingNodes.add(node);
        }
      }
      if (!pendingNodes.size) return;
      void cancelScan?.();
      cancelScan = scope.timer(scan, 100);
    },
  );

  // Abort precedes the asynchronous ledger drain: stop queued work immediately.
  scope.on(
    scope.signal,
    'abort',
    () => {
      void stopObserving();
      void cancelScan?.();
      cancelScan = null;
      pendingNodes.clear();
    },
    { once: true },
  );
}
