/**
 * Primitive contracts from their `verbs/<name>/contract.ts` modules, with no
 * file system and no bundler API. `contractModules.ts` feeds it what
 * `import.meta.glob` found (Vite and Vitest); Bun scripts and the
 * `create-voyager-plugin` build feed it the same files found on disk
 * (`scripts/lib/primitiveContractsSeam.ts`). Both therefore check and order
 * the contracts the same way.
 */
import type { PrimitiveContract } from './contractTypes';

const CONTRACT_PATH = /^\.\/([^/]+)\/contract\.ts$/;

/**
 * Contracts sorted by name, keyed in `modules` by glob path
 * (`./<name>/contract.ts`) to the module's `contract` export. A folder whose
 * contract is missing or names another primitive is a packaging error, so it
 * throws rather than shipping a build that silently lacks the primitive.
 */
export function loadPrimitiveContracts(
  modules: Readonly<Record<string, unknown>>,
): readonly PrimitiveContract[] {
  const contracts: PrimitiveContract[] = [];
  for (const [path, value] of Object.entries(modules)) {
    const folder = CONTRACT_PATH.exec(path)?.[1];
    if (!folder) throw new Error(`Unexpected primitive contract path ${path}`);
    const contract = value as Partial<PrimitiveContract> | undefined;
    if (typeof contract?.name !== 'string') {
      throw new Error(`verbs/${folder}/contract.ts must export a \`contract\``);
    }
    if (contract.name !== folder) {
      throw new Error(`verbs/${folder}/contract.ts names "${contract.name}"; rename one to match`);
    }
    contracts.push(contract as PrimitiveContract);
  }
  return contracts.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
}
