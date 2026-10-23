import { listBundledPluginEntries } from '../catalog/sites';
import { isRecord } from '../manifest/jsonGuards';

/**
 * Native callers in this build's catalog, never a runtime source listing.
 * Requirements alone do not mount a primitive or confer a packaged identity.
 */
export function bundledNativePluginIds(handler: string): ReadonlySet<string> {
  const ids = new Set<string>();
  for (const entry of listBundledPluginEntries()) {
    try {
      const manifest: unknown = JSON.parse(entry.manifestJson);
      if (!isRecord(manifest) || typeof manifest.id !== 'string' || !manifest.id.trim()) continue;
      const contributes = manifest.contributes;
      if (!isRecord(contributes) || !Array.isArray(contributes.domOps)) continue;
      if (
        contributes.domOps.some(
          (op: unknown) => isRecord(op) && op.op === 'native' && op.handler === handler,
        )
      ) {
        ids.add(manifest.id);
      }
    } catch {
      // Malformed bundled entries cannot grant an identity; catalog validation reports them.
    }
  }
  return ids;
}
