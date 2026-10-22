/**
 * The shape of a primitive contract — types and the name pattern only, so
 * every `verbs/<name>/contract.ts` can import it and stay data.
 *
 * Rules (plan D9): parameters are only ever added, and only as optional; a
 * breaking change ships under a NEW primitive name.
 */
import type { SemanticSelectorKey } from '../sites/semanticKeys';
import type { SettingField } from '../types';

/**
 * `semanticKey`: a key of the semantic vocabulary (`sites/semanticKeys.ts`)
 * that the primitive reads from the site adapter, so compatibility checks
 * require the key it names just like the contract's own `semantic` keys.
 */
export type PrimitiveParamType =
  | 'string'
  | 'string[]'
  | 'number'
  | 'boolean'
  | 'selector'
  | 'semanticKey';

export interface PrimitiveParamSpec {
  readonly type: PrimitiveParamType;
  readonly required: boolean;
  readonly description: string;
  /**
   * Engine version that added the param, when later than its primitive's
   * `sinceEngine`. An older engine rejects an unknown param and skips the whole
   * op, so a manifest setting it needs an `engine` floor at least this high.
   * Use `next` until release stamping assigns a concrete version.
   */
  readonly sinceEngine?: string;
  /** For a `semanticKey` param: the keys the primitive accepts; any vocabulary key when omitted. */
  readonly allowedKeys?: readonly SemanticSelectorKey[];
}

/** A `site.json` section a primitive can depend on; its reader lives in `sites/sections/`. */
export type PrimitiveSiteSection = 'folders';

/** The type a plugin setting must have for a primitive to read it. */
export type PrimitiveSettingType = SettingField['type'];

export interface PrimitiveContract {
  readonly name: string;
  /** First shipped engine, or `next` while unpublished; callers receive the resolved version. */
  readonly sinceEngine: string;
  /**
   * Semantic keys the primitive always reads from the site adapter (unless a
   * param overrides them). Keys a `semanticKey` param names are added per op.
   */
  readonly semantic: readonly SemanticSelectorKey[];
  readonly params: Readonly<Record<string, PrimitiveParamSpec>>;
  /**
   * `site.json` sections the primitive reads, each with the lowest format it
   * reads. A site that lacks one reports `needs-site-data`, as a missing key
   * reports `needs-semantic`, and the checks refuse to ship the plugin there.
   */
  readonly sections?: Readonly<Partial<Record<PrimitiveSiteSection, number>>>;
  /**
   * Plugin settings the primitive reads from `context.settings`, by key, with
   * their types. The checks refuse a declared setting of another type, and on a
   * plugin whose primitives all declare theirs, a setting nothing reads (a
   * misspelled key would otherwise leave the primitive on its default).
   */
  readonly settings?: Readonly<Record<string, PrimitiveSettingType>>;
  readonly description: string;
}

export const PRIMITIVE_NAME_PATTERN = /^[a-z][a-zA-Z0-9]{1,39}$/;
