import type { PluginScope } from '@/features/plugins/runtime/pluginScope';

import { startMessageTimestampPageService } from './messageTimestampPageService';

/**
 * Collection has one activation lifetime, with existing abort/revision guards
 * for hydration and route settling. PluginScope suffices (STATE_MACHINE_PLAN §2);
 * there is no staged workflow for startMachine to own.
 */
export function activateGeminiMessageTimestamps(scope: PluginScope): void {
  if (scope.isDisposed) return;
  const stop = scope.effect(startMessageTimestampPageService, 'message-timestamps');
  // Abort removes labels before the scope's asynchronous disposal ledger drains.
  scope.on(scope.signal, 'abort', () => void stop(), { once: true });
}
