import type { PluginManifest, PluginSettings } from '../types';
import type { DeclarativeEngine } from './declarativeEngine';

/**
 * Mount a plugin the pass lets run. One already active gets its settings
 * pushed, but only when they changed since the last push (`pushed`, by id):
 * a state write for plugin A must not re-render every other active plugin.
 */
export function mountOrUpdate(
  engine: DeclarativeEngine,
  pushed: Map<string, string>,
  manifest: PluginManifest,
  settings: PluginSettings,
): void {
  const serialized = JSON.stringify(settings);
  if (!engine.isActive(manifest.id)) {
    engine.mount(manifest, settings);
  } else if (pushed.get(manifest.id) !== serialized) {
    engine.updateSettings(manifest.id, settings);
  } else {
    return;
  }
  pushed.set(manifest.id, serialized);
}

/** Unmount each running plugin of `manifests` that `drop` names, forgetting its last push. */
export function unmountWhere(
  engine: DeclarativeEngine,
  pushed: Map<string, string>,
  manifests: readonly PluginManifest[],
  drop: (id: string) => boolean,
): void {
  for (const manifest of manifests) {
    if (!engine.isActive(manifest.id) || !drop(manifest.id)) continue;
    void engine.unmount(manifest.id);
    pushed.delete(manifest.id);
  }
}
