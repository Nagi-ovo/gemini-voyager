/**
 * Gemini prompt history as the packaged builtin plugin
 * `voyager.gemini-prompt-history` runs it: the native module's runtime
 * (capture, panel, account-scoped storage), owned by the plugin's scope.
 *
 * The plugin host mounts this only while `gvPromptHistoryEnabled` is on, so the
 * runtime never reads that switch. Unmounting aborts `scope.signal`, which
 * removes the listeners and UI and leaves every stored record in place.
 */
import type { PluginScope } from '@/features/plugins/runtime/pluginScope';

import { startPromptHistoryRuntime } from './index';

export function activateGeminiPromptHistory(scope: PluginScope): Promise<void> {
  return startPromptHistoryRuntime({ signal: scope.signal });
}
