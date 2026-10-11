/**
 * Rules only local plugins follow, on top of the shared manifest gate. Each one
 * turns a manifest that would import and then do nothing (or less than its
 * author expects) into an import error the author can act on:
 *
 *   - `addClass` adds one `gv-` prefixed class (the content-script rule every
 *     injected class follows), so a plugin cannot restyle the page through the
 *     host's own class names;
 *   - every semantic key the plugin relies on is declared by every site it
 *     targets; otherwise the popup would only show it as `needs-semantic`;
 *   - settings are the kinds the popup can render (boolean, number, select): a
 *     string or color setting would import with no control to change it.
 */
import type { ManifestIssue } from '../manifest/validate';
import { requiredSemanticKeys } from '../runtime/pluginStatus';
import { patternWithinAny } from '../sites/matchPattern';
import { SEMANTIC_SELECTOR_KEYS, isSemanticSelectorKey } from '../sites/semanticKeys';
import type { PluginManifest, SiteAdapter } from '../types';
import {
  getNativeOpParamSemanticKeys,
  getPrimitiveSemanticKeys,
} from './authoring/primitiveReference';

/** Classes a local plugin adds: one class token that starts with `gv-`. */
export const LOCAL_CLASS_NAME_PATTERN = /^gv-[A-Za-z0-9_-]+$/;

/** Setting types the popup renders a control for; the rest are refused on import. */
export const LOCAL_SETTING_TYPES = ['boolean', 'number', 'select'] as const;

/** Sites whose `matches` contain at least one of the manifest's patterns. */
export function targetedSites(
  manifest: Pick<PluginManifest, 'matches'>,
  sites: readonly SiteAdapter[],
): readonly SiteAdapter[] {
  return sites.filter((site) =>
    manifest.matches.some((pattern) => patternWithinAny(pattern, site.matches)),
  );
}

function classNameIssues(manifest: PluginManifest): ManifestIssue[] {
  const issues: ManifestIssue[] = [];
  (manifest.contributes.domOps ?? []).forEach((op, index) => {
    if (op.op !== 'addClass' || LOCAL_CLASS_NAME_PATTERN.test(op.className)) return;
    issues.push({
      path: `contributes.domOps[${index}].className`,
      message: `"${op.className}" must be one class name starting with "gv-" (for example "gv-plugin-my-change")`,
    });
  });
  return issues;
}

function settingTypeIssues(manifest: PluginManifest): ManifestIssue[] {
  const allowed: readonly string[] = LOCAL_SETTING_TYPES;
  return Object.entries(manifest.contributes.settings ?? {}).flatMap(([key, field]) =>
    allowed.includes(field.type)
      ? []
      : [
          {
            path: `contributes.settings.${key}.type`,
            message: `"${field.type}" settings have no control in the popup yet: use ${LOCAL_SETTING_TYPES.join(', ')}`,
          },
        ],
  );
}

/** Why `key` cannot be relied on across these sites, or null when every one declares it. */
function semanticKeyProblem(key: string, sites: readonly SiteAdapter[]): string | null {
  if (!isSemanticSelectorKey(key)) {
    return `"${key}" is not a semantic key (the vocabulary is ${SEMANTIC_SELECTOR_KEYS.join(', ')})`;
  }
  const missing = sites.find((site) => typeof site.selectors[key] !== 'string');
  if (!missing) return null;
  const declared = SEMANTIC_SELECTOR_KEYS.filter((k) => typeof missing.selectors[k] === 'string');
  return `${missing.label} does not declare semantic key "${key}" (it declares ${declared.join(', ') || 'none'})`;
}

function semanticIssues(manifest: PluginManifest, sites: readonly SiteAdapter[]): ManifestIssue[] {
  const targeted = targetedSites(manifest, sites);
  const issues: ManifestIssue[] = [];
  const reported = new Set<string>();
  const report = (path: string, key: string, suffix = ''): void => {
    const problem = semanticKeyProblem(key, targeted);
    if (!problem) return;
    reported.add(key);
    issues.push({ path, message: `${problem}${suffix}` });
  };
  (manifest.contributes.domOps ?? []).forEach((op, index) => {
    if (op.op === 'native') {
      for (const key of getPrimitiveSemanticKeys(op.handler)) {
        report(`contributes.domOps[${index}]`, key, `, which primitive "${op.handler}" reads`);
      }
      for (const { param, key } of getNativeOpParamSemanticKeys(
        op,
        manifest.contributes.settings,
      )) {
        report(`contributes.domOps[${index}].params.${param}`, key);
      }
    } else if (op.target.kind === 'semantic') {
      report(
        `contributes.domOps[${index}].target.key`,
        op.target.key,
        ': target a CSS selector instead',
      );
    }
  });
  // `requires.semantic`: what the status machine would otherwise report as needs-semantic.
  for (const key of requiredSemanticKeys(manifest)) {
    if (!reported.has(key)) report('requires.semantic', key);
  }
  return issues;
}

/** Every local-only problem with a manifest the shared gate already accepted. */
export function localPluginRuleIssues(
  manifest: PluginManifest,
  sites: readonly SiteAdapter[],
): ManifestIssue[] {
  return [
    ...classNameIssues(manifest),
    ...semanticIssues(manifest, sites),
    ...settingTypeIssues(manifest),
  ];
}
