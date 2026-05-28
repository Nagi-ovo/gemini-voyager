/**
 * Tiny semver helper — just enough to enforce a plugin's `engine` range against
 * the host `PLUGIN_ENGINE_VERSION`. Supports `*`, an exact `x.y.z`, and `>=x.y.z`
 * (the only forms our manifests use). Not a full semver implementation by design.
 */

export interface Semver {
  readonly major: number;
  readonly minor: number;
  readonly patch: number;
}

export function parseSemver(value: string): Semver | null {
  const match = /^(\d+)\.(\d+)\.(\d+)/.exec(value.trim());
  if (!match) return null;
  return { major: Number(match[1]), minor: Number(match[2]), patch: Number(match[3]) };
}

function compare(a: Semver, b: Semver): number {
  if (a.major !== b.major) return a.major - b.major;
  if (a.minor !== b.minor) return a.minor - b.minor;
  return a.patch - b.patch;
}

/** True if `version` satisfies `range`. Unparseable input fails closed (false). */
export function engineSatisfied(range: string, version: string): boolean {
  const trimmed = range.trim();
  if (trimmed === '' || trimmed === '*') return true;

  const target = parseSemver(version);
  if (!target) return false;

  if (trimmed.startsWith('>=')) {
    const min = parseSemver(trimmed.slice(2));
    return min !== null && compare(target, min) >= 0;
  }

  const exact = parseSemver(trimmed);
  return exact !== null && compare(target, exact) === 0;
}
