/**
 * Plugin status machine (plan §4.2, D8).
 *
 * `PluginHost` reports a status for every plugin that targets the page
 * instead of silently filtering incompatible ones, so the popup can show a
 * disabled toggle WITH a reason:
 *
 *   needs-engine     the manifest's `engine` range is above this build
 *   needs-handler    a primitive it invokes is not in this build
 *   needs-semantic   the site adapter lacks a semantic key it relies on
 *   ready            compatible, not enabled (or enabled and not yet mounted)
 *   mounted          enabled and running on this page
 *   no-effect        mounted, but the health signal found no targets (D12)
 *   blocked          compatible, but something else keeps it off this page;
 *                    `blockedReason` says what (see `PluginBlockedReason`)
 *
 * `needs-permission` (a new origin not yet granted) is decided by the popup,
 * which owns the permission flow; a content script that is running already
 * has its permission.
 */
import { resolveEngineVersion } from '../engineVersion';
import { acceptedSemanticKeyParamValues } from '../manifest/semanticKeyParams';
import { engineSatisfied } from '../semver';
import type { PluginManifest, SiteAdapter } from '../types';
import { EFFECTIVE_PLUGIN_ENGINE_VERSION, getPrimitiveContract } from '../verbs/contracts';

export type PluginStatusKind =
  | 'needs-engine'
  | 'needs-handler'
  | 'needs-semantic'
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
  /** For needs-engine: the range the manifest asks for. */
  readonly requiredEngine?: string;
  /** For needs-handler: primitives this build does not ship. */
  readonly missingHandlers?: readonly string[];
  /** For needs-semantic: keys the site adapter does not define. */
  readonly missingSemantic?: readonly string[];
  /**
   * A newer version arrived while this page kept the old one mounted (plan
   * D7: primitive-backed plugins switch on the next full page load).
   */
  readonly pendingVersion?: string;
  /** For blocked: why. */
  readonly blockedReason?: PluginBlockedReason;
  /** For blocked by conflict, releasing or pending: the other plugin's id. */
  readonly blockedBy?: string;
}

export interface PluginIncompatibility {
  readonly id: string;
  readonly version: string;
  readonly kind: 'needs-engine' | 'needs-handler' | 'needs-semantic';
  readonly requiredEngine?: string;
  readonly missingHandlers?: readonly string[];
  readonly missingSemantic?: readonly string[];
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

export interface CompatibilityInput {
  readonly manifest: PluginManifest;
  readonly adapter: SiteAdapter | null;
  readonly hasPrimitive: (name: string) => boolean;
  readonly engineVersion?: string;
}

/** The first blocking reason, or null when the plugin can run in this build on this site. */
export function findIncompatibility(input: CompatibilityInput): PluginIncompatibility | null {
  const { manifest } = input;
  const base = { id: manifest.id, version: manifest.version };
  const requiredEngine = resolveEngineVersion(manifest.engine);
  if (!engineSatisfied(requiredEngine, input.engineVersion ?? EFFECTIVE_PLUGIN_ENGINE_VERSION)) {
    return { ...base, kind: 'needs-engine', requiredEngine };
  }
  const missingHandlers = requiredHandlers(manifest).filter((name) => !input.hasPrimitive(name));
  if (missingHandlers.length > 0) {
    return { ...base, kind: 'needs-handler', missingHandlers };
  }
  const selectors = input.adapter?.selectors ?? {};
  const missingSemantic = requiredSemanticKeys(manifest).filter((key) => !selectors[key]);
  if (missingSemantic.length > 0) {
    return { ...base, kind: 'needs-semantic', missingSemantic };
  }
  return null;
}
