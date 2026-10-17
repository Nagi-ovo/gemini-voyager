/**
 * The optional `bridge` section of a `site.json` (Local Bridge spec §3.5): the
 * remote kill switch for the Local Bridge. It lists the ops the extension may
 * run for `voyager serve` on this site; an op missing from `allow` is denied.
 *
 * A broken section never invalidates the site: the adapter keeps updating
 * without it, and a missing section means deny. Only fatal problems drop the
 * section; an op name this build does not know is reported but skipped, so a
 * newer catalog naming a future op does not switch the bridge off for older
 * builds. `catalog:build` fails on any reported issue.
 */
import { OP_NAMES, type OpName, isOpName } from '@/features/bridge/protocol';

import type { ManifestIssue } from '../../manifest/validate';

export const BRIDGE_POLICY_FORMATS = [1] as const;
export type BridgePolicyFormat = (typeof BRIDGE_POLICY_FORMATS)[number];

export interface BridgePolicySection {
  readonly format: BridgePolicyFormat;
  /** Ops the remote policy allows, in the order the data lists them. */
  readonly allow: readonly OpName[];
}

/** A future catalog may list a few new ops; anything far beyond the known set is junk. */
const MAX_ALLOW_ENTRIES = OP_NAMES.length * 4;
const MAX_OP_NAME_LENGTH = 64;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export interface BridgePolicySectionRead {
  /** Absent when the section is missing or unusable: the bridge is denied. */
  readonly policy?: BridgePolicySection;
  readonly issues: readonly ManifestIssue[];
}

/** Read `site.bridge`. `raw === undefined` (no section) is not an issue, but yields no policy. */
export function readBridgePolicySection(raw: unknown, path = 'bridge'): BridgePolicySectionRead {
  if (raw === undefined) return { issues: [] };
  if (!isRecord(raw)) return { issues: [{ path, message: 'must be an object' }] };

  const issues: ManifestIssue[] = [];
  const format = raw.format;
  if (!BRIDGE_POLICY_FORMATS.some((known) => known === format)) {
    return { issues: [{ path: `${path}.format`, message: 'unknown format' }] };
  }
  const list = raw.allow;
  if (!Array.isArray(list) || list.length > MAX_ALLOW_ENTRIES) {
    return {
      issues: [
        { path: `${path}.allow`, message: `must be an array of up to ${MAX_ALLOW_ENTRIES}` },
      ],
    };
  }

  const allow: OpName[] = [];
  const seen = new Set<string>();
  let fatal = false;
  list.forEach((entry, index) => {
    const at = `${path}.allow[${index}]`;
    if (typeof entry !== 'string' || entry.length === 0 || entry.length > MAX_OP_NAME_LENGTH) {
      issues.push({ path: at, message: 'must be an op name' });
      fatal = true;
      return;
    }
    if (seen.has(entry)) {
      issues.push({ path: at, message: 'duplicate op' });
      fatal = true;
      return;
    }
    seen.add(entry);
    if (!isOpName(entry)) {
      // Non-fatal: an op this build cannot run is simply not allowed here.
      issues.push({ path: at, message: 'unknown op' });
      return;
    }
    allow.push(entry);
  });
  if (fatal) return { issues };
  return { policy: { format: format as BridgePolicyFormat, allow }, issues };
}

/** JSON form for publishing and caching; `readBridgePolicySection` reads it back unchanged. */
export function bridgePolicySectionToData(section: BridgePolicySection): BridgePolicySection {
  return { format: section.format, allow: [...section.allow] };
}
