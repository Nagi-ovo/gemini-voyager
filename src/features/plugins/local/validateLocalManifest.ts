/**
 * The one gate every user-imported plugin passes, on import and again on every
 * read by `LocalPluginSource`.
 *
 * It is the remote catalog's gate plus local-only rules, never a weaker one:
 *   - `validateManifest` with its CSS and rendered-sink guards, exactly as a
 *     remote catalog entry gets it;
 *   - the id is forced into the `local.*` namespace;
 *   - `tier` must be `declarative` (no plugin-supplied JS, ever);
 *   - every `native` op names a primitive this build ships, with params that
 *     match its published spec, and `engine` admits no build older than it
 *     (the same rule `plugin:check` applies to official plugins);
 *   - every match pattern stays inside a site Voyager already supports: a
 *     plugin platform (the D18 rule official plugins follow) or a native
 *     surface (Gemini, AI Studio), so enabling a local plugin can only ask for
 *     host access Voyager already has or an official plugin could ask for;
 *   - the packaged host policy (`manifestHostPolicyIssues`), checked for each
 *     native surface the patterns reach: no `theme` there (Gemini and AI Studio
 *     keep Voyager's own accent; the popup's accent picker changes it), and a
 *     `native` op only for a primitive that site has handed to plugins. Today
 *     that is none: a native Voyager feature still runs each one there, and a
 *     second copy would fight it;
 *   - the local-only rules in `localPluginRules.ts`: `gv-` classes, semantic
 *     keys every targeted site declares, and settings the popup can render.
 */
import type { Result } from '@/core/types/common';

import { primitiveParamIssues, primitiveShippabilityIssues } from '../manifest/primitiveChecks';
import { type ManifestIssue, validateManifest } from '../manifest/validate';
import { manifestHostPolicyIssues } from '../sites/hostPolicy';
import { patternWithinAny } from '../sites/matchPattern';
import { DEFAULT_ADAPTERS } from '../sites/registry';
import type { PluginManifest, SiteAdapter } from '../types';
import { toLocalPluginId } from './localPluginId';
import { localPluginRuleIssues } from './localPluginRules';

export interface ValidatedLocalPlugin {
  readonly manifest: PluginManifest;
  /** The input with its id namespaced: what the store persists. */
  readonly raw: Readonly<Record<string, unknown>>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function validateLocalManifest(
  input: unknown,
  sites: readonly SiteAdapter[] = DEFAULT_ADAPTERS,
): Result<ValidatedLocalPlugin, ManifestIssue[]> {
  if (!isRecord(input)) {
    return { success: false, error: [{ path: '', message: 'manifest must be a JSON object' }] };
  }
  const engine = typeof input.engine === 'string' ? input.engine.trim() : input.engine;
  if (engine === '>=next' || engine === 'next') {
    return {
      success: false,
      error: [
        {
          path: 'engine',
          message:
            'local plugins need a concrete engine version; replace ">=next" with ">=x.y.z" from the primitive reference',
        },
      ],
    };
  }
  const issues: ManifestIssue[] = [];
  let raw: Record<string, unknown> = input;
  if (typeof input.id === 'string' && input.id.trim() !== '') {
    const id = toLocalPluginId(input.id);
    if (id) {
      raw = { ...input, id };
    } else {
      issues.push({
        path: 'id',
        message: 'must be a lowercase reverse-dotted id (a-z, 0-9, ".", "_", "-"), up to 100 chars',
      });
    }
  }
  if (input.tier === 'scripted') {
    issues.push({ path: 'tier', message: 'local plugins must be declarative' });
  }

  const result = validateManifest(raw);
  if (!result.success) return { success: false, error: [...issues, ...result.error] };
  const manifest = result.data;

  issues.push(...primitiveShippabilityIssues(manifest), ...primitiveParamIssues(manifest));
  const supported = sites.flatMap((site) => site.matches);
  manifest.matches.forEach((pattern, index) => {
    if (patternWithinAny(pattern, supported)) return;
    issues.push({
      path: `matches[${index}]`,
      message: `"${pattern}" is outside the sites plugins can target (${supported.join(', ')})`,
    });
  });
  issues.push(...manifestHostPolicyIssues(manifest));
  issues.push(...localPluginRuleIssues(manifest, sites));

  return issues.length > 0
    ? { success: false, error: issues }
    : { success: true, data: { manifest, raw } };
}
