/**
 * Gemini's research pack as the packaged builtin plugin
 * `voyager.gemini-research-pack` runs it: the native module's runtime (pack
 * buttons, panel, Continue in), owned by the plugin's scope.
 *
 * The plugin host mounts this only while `gvResearchPackEnabled` is on, so the
 * runtime never reads that switch. Unmounting stops it: buttons and panel go,
 * an instruction typed but not yet saved is saved, a Continue-in click already
 * made still opens its tab, and the stored pack stays.
 */
import type { PluginScope } from '@/features/plugins/runtime/pluginScope';

import { startResearchPack } from './index';

export function activateGeminiResearchPack(scope: PluginScope): void {
  scope.effect(() => startResearchPack(), 'research-pack');
}
