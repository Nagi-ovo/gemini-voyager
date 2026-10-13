import type { PluginScope } from '@/features/plugins/runtime/pluginScope';

import { claimPreventAutoScroll } from './bridge';

/** Own only the prevention flag; the bridge and MAIN-world hooks remain page services. */
export function activateGeminiPreventAutoScroll(scope: PluginScope): void {
  scope.effect(() => {
    const release = claimPreventAutoScroll();
    let stopped = false;
    const stopOnce = () => {
      if (stopped) return;
      stopped = true;
      scope.signal.removeEventListener('abort', stopOnce);
      release();
    };
    // Abort releases the flag before the scope can wait for unrelated asynchronous disposal.
    scope.signal.addEventListener('abort', stopOnce, { once: true });
    if (scope.signal.aborted) stopOnce();
    return stopOnce;
  }, 'gemini-prevent-auto-scroll');
}
