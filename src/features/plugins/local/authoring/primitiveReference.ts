/**
 * The one place the local-plugin gate and the authoring material read
 * primitive contracts. Everything else in `local/` asks this module, so when
 * the contracts' source changes, only this import does.
 */
import { PRIMITIVE_CONTRACTS } from '../../verbs/contracts';

export interface PrimitiveParamReference {
  readonly name: string;
  readonly type: string;
  readonly required: boolean;
  /** Engine version that added the param, when later than its primitive. */
  readonly sinceEngine?: string;
  readonly description: string;
}

export interface PrimitiveReference {
  readonly name: string;
  readonly sinceEngine: string;
  readonly description: string;
  /** Semantic keys the primitive reads from the site adapter. */
  readonly semantic: readonly string[];
  readonly params: readonly PrimitiveParamReference[];
}

/** Every primitive this build ships, sorted by name. */
export function listPrimitiveReferences(): readonly PrimitiveReference[] {
  return PRIMITIVE_CONTRACTS.map((contract) => ({
    name: contract.name,
    sinceEngine: contract.sinceEngine,
    description: contract.description,
    semantic: [...contract.semantic],
    params: Object.entries(contract.params).map(([name, spec]) => ({
      name,
      type: spec.type,
      required: spec.required,
      ...(spec.sinceEngine ? { sinceEngine: spec.sinceEngine } : {}),
      description: spec.description,
    })),
  }));
}

/** Semantic keys a primitive reads; empty for an unknown name. */
export function getPrimitiveSemanticKeys(name: string): readonly string[] {
  return PRIMITIVE_CONTRACTS.find((contract) => contract.name === name)?.semantic ?? [];
}
