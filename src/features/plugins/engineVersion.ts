import { PLUGIN_ENGINE_VERSION } from './constants';
import { parseSemver } from './semver';

/** Resolve contributor placeholders before a version or range reaches semver. */
export function resolveEngineVersion(
  value: string,
  releasedVersion = PLUGIN_ENGINE_VERSION,
): string {
  const trimmed = value.trim();
  if (trimmed !== 'next' && trimmed !== '>=next') return value;
  const released = parseSemver(releasedVersion);
  if (!released || !/^\d+\.\d+\.\d+$/.test(releasedVersion)) {
    throw new Error(`Cannot resolve next plugin engine from ${releasedVersion}`);
  }
  const next = `${released.major}.${released.minor + 1}.0`;
  return trimmed === 'next' ? next : `>=${next}`;
}

/** Only the manifest's engine field is authoring notation; other strings are user data. */
export function resolveManifestEngine(input: unknown): unknown {
  if (typeof input !== 'object' || input === null || Array.isArray(input)) return input;
  const manifest = input as Record<string, unknown>;
  if (typeof manifest.engine !== 'string') return input;
  const engine = resolveEngineVersion(manifest.engine);
  return engine === manifest.engine ? input : { ...manifest, engine };
}
