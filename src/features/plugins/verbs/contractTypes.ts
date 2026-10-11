/**
 * The shape of a primitive contract — types and the name pattern only, so
 * every `verbs/<name>/contract.ts` can import it and stay data.
 *
 * Rules (plan D9): parameters are only ever added, and only as optional; a
 * breaking change ships under a NEW primitive name.
 */
import type { SemanticSelectorKey } from '../sites/semanticKeys';

export type PrimitiveParamType = 'string' | 'string[]' | 'number' | 'boolean' | 'selector';

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
}

export interface PrimitiveContract {
  readonly name: string;
  /** First shipped engine, or `next` while unpublished; callers receive the resolved version. */
  readonly sinceEngine: string;
  /** Semantic keys the primitive reads from the site adapter (unless a param overrides them). */
  readonly semantic: readonly SemanticSelectorKey[];
  readonly params: Readonly<Record<string, PrimitiveParamSpec>>;
  readonly description: string;
}

export const PRIMITIVE_NAME_PATTERN = /^[a-z][a-zA-Z0-9]{1,39}$/;
