/**
 * Plugin status machine (plan §4.2, D8).
 *
 * `PluginHost` reports a status for every plugin that targets the page
 * instead of silently filtering incompatible ones, so the popup can show a
 * disabled toggle WITH a reason:
 *
 *   needs-form-factor  the plugin does not run on this kind of device (a
 *                    phone, say); `requires.formFactors` names where it does.
 *                    The user's switch and its sync are untouched
 *   needs-engine     the manifest's `engine` range is above this build
 *   needs-handler    a primitive it invokes, or the scripted runtime it needs,
 *                    is not in this build
 *   needs-semantic   the site adapter lacks a semantic key it relies on
 *   needs-site-data  the site adapter lacks a `site.json` section (or its
 *                    format) one of its primitives reads, such as `folders`
 *   ready            compatible, not enabled (or enabled and not yet mounted)
 *   mounted          enabled and running on this page
 *   no-effect        mounted, but the health signal found no targets (D12);
 *                    a mounted plugin with only some ops finding nothing stays
 *                    `mounted` and names them in `zeroOps`
 *   blocked          compatible, but something else keeps it off this page;
 *                    `blockedReason` says what (see `PluginBlockedReason`)
 *
 * `needs-permission` (a new origin not yet granted) is decided by the popup,
 * which owns the permission flow; a content script that is running already
 * has its permission.
 */
import type { FormFactor } from '@/core/types/formFactor';

import { resolveEngineVersion } from '../engineVersion';
import { acceptedSemanticKeyParamValues } from '../manifest/semanticKeyParams';
import { engineSatisfied } from '../semver';
import type { PluginManifest, SiteAdapter } from '../types';
import {
  EFFECTIVE_PLUGIN_ENGINE_VERSION,
  type PrimitiveSiteSection,
  getPrimitiveContract,
} from '../verbs/contracts';
import type { OpDiagnostic } from './opDiagnostics';

export type PluginStatusKind =
  | 'needs-form-factor'
  | 'needs-engine'
  | 'needs-handler'
  | 'needs-semantic'
  | 'needs-site-data'
  | 'ready'
  | 'mounted'
  | 'no-effect'
  | 'blocked';

/**
 * Why a compatible plugin does not run here. The user's on/off is untouched:
 * a blocked plugin starts by itself once the reason goes away.
 *
 *   host-policy      this build does not let its theme or a `native` op run on
 *                    this site (Gemini / AI Studio); reported enabled or not
 *   duplicate-claim  the manifest starts one page-wide runtime twice (two
 *                    `vimInput` ops, say); reported enabled or not
 *   conflict         enabled, but `blockedBy` holds (or, as a packaged official
 *                    plugin awaiting start-up, reserves) a runtime it needs
 *   releasing        enabled and next in line, waiting for `blockedBy` to finish
 *                    shutting that runtime down
 *   pending          enabled, but `blockedBy` (a packaged official plugin that
 *                    needs the same runtime) is still reading the legacy switch
 *                    that decides whether it runs. Transient: it ends by itself
 *                    once that read lands (the official plugin then holds,
 *                    reserves or lets go of the runtime) or fails (it lets go);
 *                    not the user's off
 */
export type PluginBlockedReason =
  | 'host-policy'
  | 'duplicate-claim'
  | 'conflict'
  | 'releasing'
  | 'pending';

export interface PluginStatus {
  readonly id: string;
  readonly version: string;
  readonly kind: PluginStatusKind;
  /** For needs-form-factor: the device class this page runs on, which the plugin does not support. */
  readonly formFactor?: FormFactor;
  /** For needs-engine: the range the manifest asks for. */
  readonly requiredEngine?: string;
  /** For needs-handler: primitives this build does not ship (none for a scripted plugin). */
  readonly missingHandlers?: readonly string[];
  /** For needs-semantic: keys the site adapter does not define. */
  readonly missingSemantic?: readonly string[];
  /** For needs-site-data: `site.json` sections the site adapter lacks or reads in an older format. */
  readonly missingSections?: readonly string[];
  /**
   * A newer version arrived while this page kept the old one mounted (plan
   * D7: primitive-backed plugins switch on the next full page load).
   */
  readonly pendingVersion?: string;
  /** For blocked: why. */
  readonly blockedReason?: PluginBlockedReason;
  /** For blocked by conflict, releasing or pending: the other plugin's id. */
  readonly blockedBy?: string;
  /**
   * For a plugin that can run here (ready, mounted, no-effect, blocked) with
   * targeted DOM ops: what each op finds on the page right now.
   */
  readonly ops?: readonly OpDiagnostic[];
  /**
   * For mounted / no-effect: the `ops` indexes the health check found nothing
   * for although the page shows what they need (`missingOps`). Present only
   * when there is at least one.
   */
  readonly zeroOps?: readonly number[];
}

export interface PluginIncompatibility {
  readonly id: string;
  readonly version: string;
  readonly kind:
    | 'needs-form-factor'
    | 'needs-engine'
    | 'needs-handler'
    | 'needs-semantic'
    | 'needs-site-data';
  readonly formFactor?: FormFactor;
  readonly requiredEngine?: string;
  readonly missingHandlers?: readonly string[];
  readonly missingSemantic?: readonly string[];
  readonly missingSections?: readonly string[];
}

/** What a manifest without `requires.formFactors` runs on: plugins predate phones. */
export const DEFAULT_PLUGIN_FORM_FACTORS: readonly FormFactor[] = ['desktop'];

/**
 * Whether the plugin runs on `formFactor`. The popup asks this directly, since
 * on Firefox for Android it opens as its own tab and may get no page status.
 */
export function runsOnFormFactor(manifest: PluginManifest, formFactor: FormFactor): boolean {
  return (manifest.requires?.formFactors ?? DEFAULT_PLUGIN_FORM_FACTORS).includes(formFactor);
}

/** Primitives the plugin invokes: declared `requires.handlers` plus every `native` op. */
export function requiredHandlers(manifest: PluginManifest): readonly string[] {
  const names = new Set<string>(manifest.requires?.handlers ?? []);
  for (const op of manifest.contributes.domOps ?? []) {
    if (op.op === 'native') names.add(op.handler);
  }
  return [...names];
}

/**
 * Semantic keys the plugin relies on: declared `requires.semantic`, every
 * semantic selector target, what its primitives read from the adapter, and
 * the keys its `semanticKey` params name (each option of a select setting the
 * param reads, since the user may pick any of them).
 */
export function requiredSemanticKeys(manifest: PluginManifest): readonly string[] {
  const keys = new Set<string>(manifest.requires?.semantic ?? []);
  for (const op of manifest.contributes.domOps ?? []) {
    if (op.op === 'native') {
      const contract = getPrimitiveContract(op.handler);
      for (const key of contract?.semantic ?? []) keys.add(key);
      const settings = manifest.contributes.settings;
      for (const { value } of acceptedSemanticKeyParamValues(op, contract, settings)) {
        keys.add(value);
      }
    } else if (op.target.kind === 'semantic') {
      keys.add(op.target.key);
    }
  }
  return [...keys];
}

/** The format of each `site.json` section a primitive can require, as the adapter carries it. */
const SITE_SECTION_FORMAT: Readonly<
  Record<PrimitiveSiteSection, (adapter: SiteAdapter) => number | undefined>
> = {
  folders: (adapter) => adapter.folders?.format,
};

/** `site.json` sections the plugin's primitives read, with the highest format any of them needs. */
export function requiredSiteSections(
  manifest: PluginManifest,
): ReadonlyMap<PrimitiveSiteSection, number> {
  const sections = new Map<PrimitiveSiteSection, number>();
  for (const handler of requiredHandlers(manifest)) {
    const wanted = getPrimitiveContract(handler)?.sections ?? {};
    for (const [section, format] of Object.entries(wanted) as [PrimitiveSiteSection, number][]) {
      sections.set(section, Math.max(format, sections.get(section) ?? 0));
    }
  }
  return sections;
}

/** The required sections `adapter` lacks, or carries in a format older than needed. */
export function missingSiteSections(
  manifest: PluginManifest,
  adapter: SiteAdapter | null,
): readonly PrimitiveSiteSection[] {
  return [...requiredSiteSections(manifest)]
    .filter(([section, format]) => {
      const carried = adapter ? SITE_SECTION_FORMAT[section](adapter) : undefined;
      return carried === undefined || carried < format;
    })
    .map(([section]) => section);
}

export interface CompatibilityInput {
  readonly manifest: PluginManifest;
  readonly adapter: SiteAdapter | null;
  readonly hasPrimitive: (name: string) => boolean;
  readonly engineVersion?: string;
  /** The device class the page runs on (`core/utils/formFactor.ts`); desktop when absent. */
  readonly formFactor?: FormFactor;
}

/** The first blocking reason, or null when the plugin can run in this build on this site. */
export function findIncompatibility(input: CompatibilityInput): PluginIncompatibility | null {
  const { manifest } = input;
  const base = { id: manifest.id, version: manifest.version };
  // First: no update or site fix makes a desktop-only plugin run on a phone.
  const formFactor = input.formFactor ?? 'desktop';
  if (!runsOnFormFactor(manifest, formFactor)) {
    return { ...base, kind: 'needs-form-factor', formFactor };
  }
  const requiredEngine = resolveEngineVersion(manifest.engine);
  if (!engineSatisfied(requiredEngine, input.engineVersion ?? EFFECTIVE_PLUGIN_ENGINE_VERSION)) {
    return { ...base, kind: 'needs-engine', requiredEngine };
  }
  // No build ships a scripted runtime yet; the popup then says to update instead of offering a dead toggle.
  if (manifest.tier === 'scripted') return { ...base, kind: 'needs-handler' };
  const missingHandlers = requiredHandlers(manifest).filter((name) => !input.hasPrimitive(name));
  if (missingHandlers.length > 0) {
    return { ...base, kind: 'needs-handler', missingHandlers };
  }
  const selectors = input.adapter?.selectors ?? {};
  const missingSemantic = requiredSemanticKeys(manifest).filter((key) => !selectors[key]);
  if (missingSemantic.length > 0) {
    return { ...base, kind: 'needs-semantic', missingSemantic };
  }
  const missingSections = missingSiteSections(manifest, input.adapter);
  if (missingSections.length > 0) {
    return { ...base, kind: 'needs-site-data', missingSections };
  }
  return null;
}
