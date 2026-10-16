import type { PluginScope } from '@/features/plugins/runtime/pluginScope';

import { startAIStudioBatchDelete } from './aistudio';
import { startGeminiBatchDelete } from './gemini';

/** Clear UI on abort; keep the host's release barrier until the confirmed run settles. */
function activate(scope: PluginScope, start: () => () => Promise<void>): void {
  scope.effect(() => {
    const stop = start();
    let stopped: Promise<void> | undefined;
    const release = () => (stopped ??= stop());
    const onAbort = () => void release();
    scope.signal.addEventListener('abort', onAbort, { once: true });
    return () => {
      scope.signal.removeEventListener('abort', onAbort);
      return release();
    };
  }, 'batch-delete');
}

export function activateGeminiBatchDelete(scope: PluginScope): void {
  activate(scope, startGeminiBatchDelete);
}

export function activateAIStudioBatchDelete(scope: PluginScope): void {
  activate(scope, startAIStudioBatchDelete);
}
