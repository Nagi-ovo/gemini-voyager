/**
 * Primitive checks that relate a validated manifest to the primitives this
 * build ships (plan §5, §8). Data only: reads `verbs/contracts.ts`, never the
 * implementations, so the catalog scripts (Bun, no DOM) and the popup's local
 * plugin importer apply exactly the same rules.
 */
import { requiredHandlers } from '../runtime/pluginStatus';
import { engineSatisfied, parseSemver } from '../semver';
import type { PluginManifest } from '../types';
import { type PrimitiveContract, getPrimitiveContract } from '../verbs/contracts';
import type { ManifestIssue } from './validate';

/**
 * The lowest engine version a range admits, or null when it admits every
 * version (`*`, empty) or cannot be parsed. Ranges are `*`, an exact `x.y.z`,
 * or `>=x.y.z` — see `semver.ts`.
 */
export function engineRangeMinimum(range: string): string | null {
  const trimmed = range.trim();
  if (trimmed === '' || trimmed === '*') return null;
  const minimum = parseSemver(trimmed.startsWith('>=') ? trimmed.slice(2) : trimmed);
  if (!minimum) return null;
  return `${minimum.major}.${minimum.minor}.${minimum.patch}`;
}

/** The later of two versions; used to name the primitive that sets the floor. */
function laterVersion(a: string, b: string): string {
  return engineSatisfied(`>=${b}`, a) ? a : b;
}

/**
 * A plugin may only invoke primitives this build ships, and its `engine`
 * range must exclude every build that predates them. Getting the range right
 * is what makes an old Voyager report `needs-engine` ("update Voyager")
 * instead of `needs-handler`, which is meant to mean a configuration mistake.
 *
 * A param added after its primitive shipped raises the floor the same way: an
 * older engine rejects params it does not know and skips the whole op.
 */
export function primitiveShippabilityIssues(manifest: PluginManifest): ManifestIssue[] {
  const issues: ManifestIssue[] = [];
  const contracts: PrimitiveContract[] = [];
  for (const handler of requiredHandlers(manifest)) {
    const contract = getPrimitiveContract(handler);
    if (!contract) {
      issues.push({
        path: 'requires.handlers',
        message: `unknown primitive handler "${handler}" — no contract in verbs/contracts.ts`,
      });
      continue;
    }
    contracts.push(contract);
  }
  if (issues.length > 0 || contracts.length === 0) return issues;

  const needs = contracts.map((contract) => ({
    version: contract.sinceEngine,
    source: `primitive "${contract.name}"`,
  }));
  for (const op of manifest.contributes.domOps ?? []) {
    if (op.op !== 'native') continue;
    const contract = getPrimitiveContract(op.handler);
    for (const param of Object.keys(op.params ?? {})) {
      const since = contract?.params[param]?.sinceEngine;
      if (since)
        needs.push({ version: since, source: `primitive "${op.handler}" param "${param}"` });
    }
  }
  const floor = needs.reduce(
    (highest, need) => laterVersion(highest, need.version),
    needs[0].version,
  );
  const minimum = engineRangeMinimum(manifest.engine);
  if (minimum === null) {
    issues.push({
      path: 'engine',
      message: `engine "${manifest.engine}" admits any build, but the plugin uses primitives that need at least ${floor} — set engine to ">=${floor}"`,
    });
    return issues;
  }
  if (!engineSatisfied(`>=${floor}`, minimum)) {
    const source = needs.find((need) => need.version === floor)?.source ?? floor;
    issues.push({
      path: 'engine',
      message: `engine "${manifest.engine}" admits builds older than ${floor}, the sinceEngine of ${source} — set engine to ">=${floor}"`,
    });
  }
  return issues;
}

/**
 * `native` op params checked against the primitive's published parameter
 * spec: no unknown keys and the declared value type. The primitive's own
 * `validateParams` guard still runs in the engine before activation; this is
 * the data-only part a page without the implementations can check.
 */
export function primitiveParamIssues(manifest: PluginManifest): ManifestIssue[] {
  const issues: ManifestIssue[] = [];
  (manifest.contributes.domOps ?? []).forEach((op, index) => {
    if (op.op !== 'native') return;
    const contract = getPrimitiveContract(op.handler);
    if (!contract) return;
    for (const [key, value] of Object.entries(op.params)) {
      const path = `contributes.domOps[${index}].params.${key}`;
      const spec = contract.params[key];
      if (!spec) {
        issues.push({ path, message: `unknown parameter for primitive "${op.handler}"` });
        continue;
      }
      const ok =
        spec.type === 'string[]'
          ? Array.isArray(value) &&
            value.every((item) => typeof item === 'string' && item.trim().length > 0)
          : spec.type === 'number'
            ? typeof value === 'number' && Number.isFinite(value)
            : spec.type === 'boolean'
              ? typeof value === 'boolean'
              : typeof value === 'string' && value.trim().length > 0;
      if (!ok) issues.push({ path, message: `must be a ${spec.type}` });
    }
  });
  return issues;
}
