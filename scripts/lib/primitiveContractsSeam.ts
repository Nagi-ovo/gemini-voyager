/**
 * Bun seam for `src/features/plugins/verbs/contractModules.ts`.
 *
 * That module finds every `verbs/<name>/contract.ts` with Vite's
 * `import.meta.glob`, which Bun lacks. Under Bun it is swapped for generated
 * source that imports the same files found on disk and keys them exactly as
 * the glob does, so `loadPrimitiveContracts` sees identical input everywhere.
 *
 * Two feeders share it: the `create-voyager-plugin` build swaps the module in
 * its `Bun.build` plugin, and the Bun scripts call
 * `installPrimitiveContractsSeam` (a `Bun.plugin`). A Bun runtime plugin only
 * affects modules loaded after it is registered, so a script installs it first
 * and then imports the code that reaches the contracts dynamically.
 */
import { existsSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
export const VERBS_DIR = join(ROOT, 'src/features/plugins/verbs');
export const CONTRACT_MODULES_FILE = join(VERBS_DIR, 'contractModules.ts');

/** Primitive folder names (each holding a `contract.ts`), sorted. */
export function listPrimitiveFolders(verbsDir = VERBS_DIR): string[] {
  return readdirSync(verbsDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && existsSync(join(verbsDir, entry.name, 'contract.ts')))
    .map((entry) => entry.name)
    .sort();
}

/** What `import.meta.glob('./*\/contract.ts', { eager: true, import: 'contract' })` returns, as source. */
export function renderContractModulesSource(verbsDir = VERBS_DIR): string {
  const folders = listPrimitiveFolders(verbsDir);
  const imports = folders.map(
    (name, index) =>
      `import { contract as c${index} } from ${JSON.stringify(join(verbsDir, name, 'contract.ts'))};`,
  );
  const entries = folders.map(
    (name, index) => `  ${JSON.stringify(`./${name}/contract.ts`)}: c${index},`,
  );
  return `${imports.join('\n')}\nexport const PRIMITIVE_CONTRACT_MODULES = {\n${entries.join('\n')}\n};\n`;
}

let installed = false;

/** Register the seam for modules Bun loads from now on; a no-op outside Bun (Vitest). */
export function installPrimitiveContractsSeam(): void {
  if (installed || typeof Bun === 'undefined') return;
  installed = true;
  Bun.plugin({
    name: 'voyager-primitive-contracts',
    setup(build) {
      build.onLoad({ filter: /contractModules\.ts$/ }, (args) =>
        args.path === CONTRACT_MODULES_FILE
          ? { contents: renderContractModulesSource(), loader: 'ts' }
          : undefined,
      );
    },
  });
}
