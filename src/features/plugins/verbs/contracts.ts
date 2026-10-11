/**
 * Primitive ("verb") contracts — DATA ONLY (plan §2 layer 2, §5).
 *
 * A primitive is first-party behaviour shipped inside the extension that a
 * declarative plugin can invoke through `{ "op": "native", "handler": "<name>",
 * "params": {…} }`. Each `verbs/<name>/contract.ts` states what it is called,
 * which engine version first shipped it and what parameters it accepts; this
 * module collects them, sorted by name, without importing any implementation,
 * so that:
 *   - `scripts/build-plugin-catalog.ts` (Bun, no DOM) can check a manifest's
 *     `requires.handlers` and `engine` against it (plan §5, §8);
 *   - `verbs/contracts.test.ts` can enforce D9 (a published parameter never
 *     changes type or becomes required) against each folder's committed
 *     `paramsBaseline.json`.
 *
 * Adding a primitive is adding its folder; nothing here lists them.
 */
import { PRIMITIVE_CONTRACT_MODULES } from './contractModules';
import type { PrimitiveContract } from './contractTypes';
import { loadPrimitiveContracts } from './loadContracts';

export type { PrimitiveContract, PrimitiveParamSpec, PrimitiveParamType } from './contractTypes';
export { PRIMITIVE_NAME_PATTERN } from './contractTypes';

export const PRIMITIVE_CONTRACTS: readonly PrimitiveContract[] = loadPrimitiveContracts(
  PRIMITIVE_CONTRACT_MODULES,
);

export function getPrimitiveContract(name: string): PrimitiveContract | undefined {
  return PRIMITIVE_CONTRACTS.find((contract) => contract.name === name);
}
