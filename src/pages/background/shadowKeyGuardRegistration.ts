/**
 * Registers the shadow-panel key guard at document_start on plugin sites whose
 * enabled plugin mounts a Voyager shadow-root panel that takes typing.
 *
 * The guard must run before the page's own scripts add their capture-phase key
 * listeners, which the plugin host (document_idle) cannot do. The manifest
 * already ships the guard as a self-contained classic script for Gemini and AI
 * Studio; this registers that same file, found in the built manifest, under its
 * own id and its own `registerContentScripts` call, so a failure here never
 * touches the plugin host's registration. Nothing here imports the guard: it
 * stays a single self-contained script.
 *
 * Tabs already open when the plugin is turned on get the guard only on their
 * next load; until then the panel's own bubble-phase interception applies.
 */
import {
  partitionPluginOriginPatterns,
  pluginsToOriginPatterns,
} from '@/features/plugins/runtime/siteRegistration';
import type { PluginManifest } from '@/features/plugins/types';

import {
  type ContentScriptRegistry,
  unregisterRegisteredContentScripts,
} from './contentScriptRegistration';

export const SHADOW_KEY_GUARD_SCRIPT_ID = 'gv-shadow-key-guard';

/** Plugins whose pages host a shadow-root panel with text fields. */
export const SHADOW_KEY_GUARD_PLUGIN_IDS: ReadonlySet<string> = new Set([
  'voyager.chatgpt-folders',
]);

/** The emitted file name keeps the entry's name; see `selfContainedContentScripts`. */
const GUARD_ENTRY_NAME = 'shadowKeyGuardEntry';

type Scripting = ContentScriptRegistry & Pick<typeof chrome.scripting, 'registerContentScripts'>;

export interface ShadowKeyGuardSync {
  scripting: Scripting | undefined;
  manifest: chrome.runtime.Manifest;
  enabledPlugins: readonly PluginManifest[];
  /** Keeps the patterns the user has granted host access to. */
  filterGranted: (patterns: string[]) => Promise<string[]>;
  /** Maps a manifest resource to the path `registerContentScripts` takes (Firefox differs). */
  toResource: (path: string) => string;
}

/** The guard's script files in the built manifest, or `null` if it ships none. */
export function findShadowKeyGuardScript(manifest: chrome.runtime.Manifest): string[] | null {
  for (const script of manifest.content_scripts ?? []) {
    const js = script.js ?? [];
    if (script.run_at === 'document_start' && js.length === 1 && js[0].includes(GUARD_ENTRY_NAME)) {
      return js;
    }
  }
  return null;
}

export async function syncShadowKeyGuardRegistration({
  scripting,
  manifest,
  enabledPlugins,
  filterGranted,
  toResource,
}: ShadowKeyGuardSync): Promise<void> {
  if (!scripting?.registerContentScripts) return;
  try {
    await unregisterRegisteredContentScripts(scripting, [SHADOW_KEY_GUARD_SCRIPT_ID]);
    const js = findShadowKeyGuardScript(manifest);
    if (!js) return;
    const guarded = enabledPlugins.filter((plugin) => SHADOW_KEY_GUARD_PLUGIN_IDS.has(plugin.id));
    const { topFrameOrigins } = partitionPluginOriginPatterns(pluginsToOriginPatterns(guarded));
    const matches = await filterGranted(topFrameOrigins);
    if (!matches.length) return;
    await scripting.registerContentScripts([
      {
        id: SHADOW_KEY_GUARD_SCRIPT_ID,
        js: js.map(toResource),
        matches,
        allFrames: false,
        runAt: 'document_start',
        persistAcrossSessions: true,
      },
    ]);
  } catch (error) {
    console.warn('[Background] Failed to register the shadow key guard:', error);
  }
}
