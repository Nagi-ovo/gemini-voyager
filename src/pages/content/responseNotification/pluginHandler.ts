import type { PluginScope } from '@/features/plugins/runtime/pluginScope';

import { createResponseNotificationRun } from './run';

/** Own one notification run; MAIN-world capture and notification permissions stay in core. */
export function activateGeminiResponseNotification(scope: PluginScope): void {
  // Abort must stop the run even while the ledger waits for a slower disposer.
  scope.effect(
    () => createResponseNotificationRun({ signal: scope.signal }).stop,
    'gemini-response-notification',
  );
}
