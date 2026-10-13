import type { PluginScope } from '@/features/plugins/runtime/pluginScope';

import { startHighlightAction } from './highlightAction';

/** Own Highlight's action and annotation UI; storage and the shared toolbar stay in core. */
export function activateGeminiHighlight(scope: PluginScope): void {
  scope.effect(() => {
    const stop = startHighlightAction();
    let stopped = false;
    const stopOnce = () => {
      if (stopped) return;
      stopped = true;
      scope.signal.removeEventListener('abort', stopOnce);
      stop();
    };
    // Abort must destroy a manager still initializing before async ledger disposal can wait.
    scope.signal.addEventListener('abort', stopOnce, { once: true });
    if (scope.signal.aborted) stopOnce();
    return stopOnce;
  }, 'gemini-highlight');
}
