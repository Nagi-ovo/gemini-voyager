import type { PluginScope } from '@/features/plugins/runtime/pluginScope';

import { startFork } from './index';

/** The host owns fork UI; handed-off first sends finish through the independent page owner. */
export function activateGeminiFork(scope: PluginScope): void {
  scope.effect(() => {
    const stop = startFork();
    let stopped = false;
    const stopOnce = () => {
      if (stopped) return;
      stopped = true;
      scope.signal.removeEventListener('abort', stopOnce);
      stop();
    };
    // Abort precedes async ledger disposal: fork controls must disappear in that gap too.
    scope.signal.addEventListener('abort', stopOnce, { once: true });
    if (scope.signal.aborted) stopOnce();
    return stopOnce;
  }, 'gemini-fork');
}
