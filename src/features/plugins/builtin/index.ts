import type { PluginManifest } from '../types';

/**
 * Built-in (bundled-in-the-extension) plugins — first-party data, NOT from the
 * remote marketplace.
 *
 * Use this only for genuinely first-party features that need JS and so can't be
 * expressed as remote declarative data — a "native function plugin": the
 * manifest declares no styles/domOps, and the content script binds the actual
 * behaviour by calling `registerNativeHandler(<same id>, { start, stop })` (see
 * runtime/nativeHandlers). The engine runs that handler in lockstep with the
 * plugin's mount/unmount, so the feature is visible + toggleable in the plugin
 * list and scoped by `matches`, while the code stays first-party.
 *
 * Like every plugin, builtin plugins ship DISABLED by default — the user turns
 * them on in the popup.
 */
export const BUILTIN_PLUGINS: readonly PluginManifest[] = [
  {
    id: 'voyager.formula-copy',
    name: 'Formula Copy',
    version: '1.0.0',
    description: "Click an inline or block formula to copy its LaTeX; hover shows it's clickable.",
    author: 'voyager-official',
    category: 'productivity',
    license: 'GPL-3.0-or-later',
    engine: '>=1.1.0',
    tier: 'declarative',
    matches: ['https://claude.ai/*', 'https://chatgpt.com/*', 'https://chat.openai.com/*'],
    contributes: {},
  },
];
