/**
 * Primitive checks that relate a validated manifest to the primitives this
 * build ships (plan §5, §8). Data only: reads `verbs/contracts.ts`, never the
 * implementations, so the catalog scripts (Bun, no DOM) and the popup's local
 * plugin importer apply exactly the same rules.
 */
import { resolveEngineVersion } from '../engineVersion';
import { requiredHandlers } from '../runtime/pluginStatus';
import { engineSatisfied, parseSemver } from '../semver';
import { SEMANTIC_SELECTOR_KEYS } from '../sites/semanticKeys';
import type { NativeOperation, PluginManifest, SettingsSchema } from '../types';
import {
  type PrimitiveContract,
  type PrimitiveParamSpec,
  getPrimitiveContract,
} from '../verbs/contracts';
import {
  NATIVE_PARAM_SETTINGS_SINCE_ENGINE,
  collectNativeParamSettingReferences,
  hasNativeParamTemplates,
  nativeParamSettingIssues,
  renderNativeParams,
} from './nativeParamSettings';
import { semanticKeyParamValues } from './semanticKeyParams';
import type { ManifestIssue } from './validate';

/**
 * The lowest engine version a range admits, or null when it admits every
 * version (`*`, empty) or cannot be parsed. Ranges are `*`, an exact `x.y.z`,
 * or `>=x.y.z` — see `semver.ts`.
 */
export function engineRangeMinimum(range: string): string | null {
  const trimmed = resolveEngineVersion(range).trim();
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
  if (
    manifest.contributes.domOps?.some(
      (op) => op.op === 'native' && hasNativeParamTemplates(op.params),
    )
  ) {
    needs.push({
      version: NATIVE_PARAM_SETTINGS_SINCE_ENGINE,
      source: 'native parameter setting references',
    });
  }
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
 * A `semanticKey` param must name an allowed vocabulary key. A select-setting
 * token is checked option by option, since the user may pick any of them;
 * another token is left to the primitive's `validateParams` at activation.
 */
function semanticKeyParamIssues(
  op: NativeOperation,
  contract: PrimitiveContract,
  param: string,
  spec: PrimitiveParamSpec,
  schema: SettingsSchema | undefined,
  path: string,
): ManifestIssue[] {
  if (typeof op.params[param] !== 'string') return [{ path, message: 'must be a semanticKey' }];
  const allowed: readonly string[] = spec.allowedKeys ?? SEMANTIC_SELECTOR_KEYS;
  return semanticKeyParamValues(op, contract, schema)
    .filter((candidate) => candidate.param === param && !allowed.includes(candidate.value))
    .map(({ value, setting }) => ({
      path,
      message: `${setting ? `setting "${setting}" offers "${value}"; ` : ''}must be one of ${allowed.join(', ')}`,
    }));
}

/**
 * `native` op params checked against the primitive's published parameter
 * spec: no unknown keys, every required param present and the declared value
 * type. The primitive's own `validateParams` guard still runs in the engine
 * before activation; this is the data-only part a page without the
 * implementations can check.
 */
function primitiveOpParamIssues(
  op: NativeOperation,
  schema: SettingsSchema | undefined,
  path: string,
): ManifestIssue[] {
  const contract = getPrimitiveContract(op.handler);
  if (!contract) return [];
  const rendered = renderNativeParams(op.params, schema, {}, path);
  if (!rendered.success) return rendered.error;
  const issues: ManifestIssue[] = [];
  for (const [key, value] of Object.entries(rendered.data)) {
    const paramPath = `${path}.${key}`;
    const spec = contract.params[key];
    if (!spec) {
      issues.push({ path: paramPath, message: `unknown parameter for primitive "${op.handler}"` });
      continue;
    }
    if (spec.type === 'semanticKey') {
      issues.push(...semanticKeyParamIssues(op, contract, key, spec, schema, paramPath));
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
    if (!ok) issues.push({ path: paramPath, message: `must be a ${spec.type}` });
  }
  // A `{{key}}` token counts as present: it always renders to the setting's value.
  for (const [key, spec] of Object.entries(contract.params)) {
    if (spec.required && !Object.hasOwn(rendered.data, key)) {
      issues.push({
        path: `${path}.${key}`,
        message: `missing required parameter for primitive "${op.handler}"`,
      });
    }
  }
  return issues;
}

export function primitiveParamIssues(manifest: PluginManifest): ManifestIssue[] {
  return (manifest.contributes.domOps ?? []).flatMap((op, index) =>
    op.op === 'native'
      ? primitiveOpParamIssues(
          op,
          manifest.contributes.settings,
          `contributes.domOps[${index}].params`,
        )
      : [],
  );
}

/**
 * A setting a primitive reads (`contract.settings`) must have the type it reads.
 * When every primitive the plugin calls declares what it reads, a setting that
 * none of them reads and that no `{{key}}` token or `enabledBy` rule uses is a
 * misspelling: the primitive would quietly run on its default.
 */
export function primitiveSettingIssues(manifest: PluginManifest): ManifestIssue[] {
  const handlers = requiredHandlers(manifest);
  const contracts = handlers.flatMap((handler) => getPrimitiveContract(handler) ?? []);
  const read = new Map<string, { type: string; primitive: string }>();
  for (const contract of contracts) {
    for (const [key, type] of Object.entries(contract.settings ?? {})) {
      if (!read.has(key)) read.set(key, { type, primitive: contract.name });
    }
  }
  const schema = manifest.contributes.settings ?? {};
  const issues: ManifestIssue[] = [];
  for (const [key, field] of Object.entries(schema)) {
    const wanted = read.get(key);
    if (wanted && field.type !== wanted.type) {
      issues.push({
        path: `contributes.settings.${key}.type`,
        message: `primitive "${wanted.primitive}" reads "${key}" as a ${wanted.type} setting`,
      });
    }
  }
  const allDeclare =
    contracts.length > 0 &&
    contracts.length === handlers.length &&
    contracts.every((contract) => contract.settings !== undefined);
  if (!allDeclare) return issues;
  const { settings: _settings, ...rest } = manifest.contributes;
  const templated = JSON.stringify([rest, manifest.theme ?? null]);
  const gating = new Set(Object.values(schema).flatMap((field) => field.enabledBy ?? []));
  for (const key of Object.keys(schema)) {
    if (read.has(key) || gating.has(key) || templated.includes(`{{${key}}}`)) continue;
    issues.push({
      path: `contributes.settings.${key}`,
      message: `nothing reads this setting: ${contracts
        .map(
          (contract) =>
            `"${contract.name}" reads ${Object.keys(contract.settings ?? {}).join(', ') || 'none'}`,
        )
        .join('; ')}, and no {{${key}}} token uses it`,
    });
  }
  return issues;
}

/** Template references are load-time configuration errors, even without a primitive implementation. */
export function nativeParamTemplateIssues(manifest: PluginManifest): ManifestIssue[] {
  const issues: ManifestIssue[] = [];
  let templated = false;
  (manifest.contributes.domOps ?? []).forEach((op, index) => {
    if (op.op !== 'native' || !hasNativeParamTemplates(op.params)) return;
    templated = true;
    const path = `contributes.domOps[${index}].params`;
    const schema = manifest.contributes.settings;
    const referenceIssues = nativeParamSettingIssues(op.params, schema, path);
    if (referenceIssues.length > 0) {
      issues.push(...referenceIssues);
      return;
    }
    const beforeTypes = issues.length;
    const contract = getPrimitiveContract(op.handler);
    if (!contract) return;
    for (const [param, value] of Object.entries(op.params)) {
      const spec = contract.params[param];
      const refs = collectNativeParamSettingReferences({ [param]: value }, path);
      if (!spec) continue; // The ordinary contract check reports unknown params.
      const expected =
        spec.type === 'selector' ||
        spec.type === 'semanticKey' ||
        (spec.type === 'string[]' && Array.isArray(value))
          ? 'string'
          : spec.type;
      for (const ref of refs) {
        if (!schema || !Object.hasOwn(schema, ref.key)) continue;
        const field = schema[ref.key];
        const provided =
          ref.wholeValue && (field.type === 'number' || field.type === 'boolean')
            ? field.type
            : 'string';
        if (provided !== expected) {
          issues.push({
            path: ref.path,
            message: `setting "${ref.key}" supplies ${provided}, but primitive "${op.handler}" requires ${expected}`,
          });
        }
      }
    }
    // Defaults must satisfy the same data-only contract checks as static values.
    if (issues.length === beforeTypes) issues.push(...primitiveOpParamIssues(op, schema, path));
  });
  if (templated) {
    const minimum = engineRangeMinimum(manifest.engine);
    if (minimum === null || !engineSatisfied(`>=${NATIVE_PARAM_SETTINGS_SINCE_ENGINE}`, minimum)) {
      issues.push({
        path: 'engine',
        message: `native parameter setting references need engine ">=${NATIVE_PARAM_SETTINGS_SINCE_ENGINE}" (catalog contributors may use ">=next")`,
      });
    }
  }
  return issues;
}
