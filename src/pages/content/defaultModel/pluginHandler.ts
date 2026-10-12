/**
 * Gemini's default model as the packaged builtin plugin
 * `voyager.gemini-default-model` runs it: one `DefaultModelSession`, owned by
 * the plugin's scope.
 *
 * The plugin host mounts this only while `gvDefaultModelAutoApply` is not
 * `false`, so the runtime never reads that switch. Unmounting aborts
 * `scope.signal`, which removes the stars, title wrappers, listeners and
 * timers, cancels a pick in flight, and leaves the stored default model and
 * thinking level in place.
 */
import type { PluginScope } from '@/features/plugins/runtime/pluginScope';

import { startDefaultModelRuntime } from './runtime';

export function activateGeminiDefaultModel(scope: PluginScope): Promise<void> {
  return startDefaultModelRuntime({ signal: scope.signal });
}
