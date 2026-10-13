import type { PluginScope } from '@/features/plugins/runtime/pluginScope';

import { startTimeline } from './index';

/** Only the rail belongs to this scope; timestamps and identity history remain page services. */
export function activateGeminiTimeline(scope: PluginScope): void {
  // Abort stops the rail before the ledger can wait for an unrelated asynchronous disposer.
  scope.effect(() => startTimeline(scope.signal), 'gemini-timeline');
}
