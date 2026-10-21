import type { PluginScope } from '@/features/plugins/runtime/pluginScope';

import { startExportButton } from './index';

/**
 * Gemini's conversation export as the `voyager.gemini-export` official plugin.
 * The scope owns every entry point (menus, copy-as-image, logo dropdown or
 * toolbar) and the active run; a mount that finishes after the scope was
 * disposed is stopped as soon as it arrives. The first mount of a page also
 * resumes a run that Gemini's preload reload cut short.
 */
export function activateGeminiExport(scope: PluginScope): void {
  scope.effect(() => startExportButton({ signal: scope.signal }), 'gemini-export');
}
