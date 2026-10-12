/**
 * Gemini input collapse as the packaged builtin plugin
 * `voyager.gemini-input-collapse` runs it: the native module's collapse
 * session, owned by the plugin's scope.
 *
 * The plugin host mounts this only while `gvInputCollapseEnabled` is on and
 * fills `collapseWhenNotEmpty` from `gvInputCollapseWhenNotEmpty`; a change of
 * that value arrives through `updateGeminiInputCollapseSettings` and lands in
 * place, without restarting the session. The expand and collapse helpers
 * other features call stay module-level, so they work with the plugin off.
 */
import type { PluginScope } from '@/features/plugins/runtime/pluginScope';
import type { PluginSettings } from '@/features/plugins/types';

import { setCollapseWhenNotEmpty, startCollapseSession } from './runtime';

const collapseWhenNotEmptyOf = (settings: PluginSettings): boolean =>
  settings.collapseWhenNotEmpty === true;

export function activateGeminiInputCollapse(scope: PluginScope, settings: PluginSettings): void {
  scope.effect(() => startCollapseSession(collapseWhenNotEmptyOf(settings)), 'input-collapse');
}

export function updateGeminiInputCollapseSettings(settings: PluginSettings): void {
  setCollapseWhenNotEmpty(collapseWhenNotEmptyOf(settings));
}
