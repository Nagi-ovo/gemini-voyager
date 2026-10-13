import type { ManifestIssue } from '../manifest/validate';
import type { PluginManifest } from '../types';
import { OFFICIAL_PLUGIN_IDS } from './featureOwners';
import { matchesAnyPattern, patternWithinAny } from './matchPattern';

export const SHARED_TIMELINE_MATCHES: readonly string[] = ['https://gemini.google.com/*'];

/** Native route, account and canonical turn identity cannot come from plugin-authored selectors. */
export const SHARED_TIMELINE_IDENTITY_PARAMS = [
  'turn',
  'turnItem',
  'conversationIdPattern',
  'conversationIdAttribute',
  'accountIdAttributes',
] as const;

type TimelineManifest = Pick<PluginManifest, 'matches' | 'contributes'>;

/** Pure import policy; the caller knows whether the manifest also reaches native Gemini. */
export function sharedTimelinePolicyIssues(
  manifest: TimelineManifest,
  requiresShared = false,
): ManifestIssue[] {
  const issues: ManifestIssue[] = [];
  (manifest.contributes.domOps ?? []).forEach((op, index) => {
    if (op.op !== 'native' || op.handler !== 'turnNavigator') return;
    const path = `contributes.domOps[${index}]`;
    const shared = op.params.dataBackend === 'shared';
    if (!shared) {
      if (requiresShared)
        issues.push({
          path,
          message: 'Gemini turnNavigator requires literal params.dataBackend: "shared"',
        });
      return;
    }
    // The shared native backend cannot turn a multi-site manifest into a catalog-data consumer.
    if (
      manifest.matches.length === 0 ||
      !manifest.matches.every((pattern) => patternWithinAny(pattern, SHARED_TIMELINE_MATCHES))
    ) {
      issues.push({
        path,
        message:
          'shared turnNavigator matches must stay within https://gemini.google.com/*; Business and catalog sites are not supported',
      });
    }
    for (const key of SHARED_TIMELINE_IDENTITY_PARAMS) {
      if (Object.hasOwn(op.params, key))
        issues.push({
          path: `${path}.params.${key}`,
          message:
            'shared turnNavigator uses Voyager’s native conversation, account and turn identity; remove this override',
        });
    }
  });
  return issues;
}

/** Local shared rails inherit the native timeline's real content-script start point. */
export function sharedTimelineAdmissionId(url: string, manifest: TimelineManifest): string | null {
  if (!matchesAnyPattern(url, SHARED_TIMELINE_MATCHES) || !matchesAnyPattern(url, manifest.matches))
    return null;
  if (
    !(manifest.contributes.domOps ?? []).some(
      (op) =>
        op.op === 'native' && op.handler === 'turnNavigator' && op.params.dataBackend === 'shared',
    )
  )
    return null;
  if (sharedTimelinePolicyIssues(manifest, true).length > 0) return null;
  return OFFICIAL_PLUGIN_IDS.geminiTimeline;
}
