import type { PluginScope } from '@/features/plugins/runtime/pluginScope';

import { startQuoteAction } from './quoteAction';

/** Own only Quote's action; the toolbar and styling of sent quotes remain page services. */
export function activateGeminiQuoteReply(scope: PluginScope): void {
  scope.effect(() => {
    const unregister = startQuoteAction();
    let stopped = false;
    const stopOnce = () => {
      if (stopped) return;
      stopped = true;
      scope.signal.removeEventListener('abort', stopOnce);
      unregister();
    };
    // Abort precedes async ledger disposal: stop accepting quotes immediately, keep accepted edits.
    scope.signal.addEventListener('abort', stopOnce, { once: true });
    if (scope.signal.aborted) stopOnce();
    return stopOnce;
  }, 'gemini-quote-reply');
}
