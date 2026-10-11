/**
 * Every `verbs/<name>/contract.ts`, keyed by glob path to its `contract`
 * export. Vite-only: Bun has no `import.meta.glob`, so Bun scripts and the
 * `create-voyager-plugin` build swap this module for one listing the same
 * files read from disk (`scripts/lib/primitiveContractsSeam.ts`).
 */
export const PRIMITIVE_CONTRACT_MODULES: Readonly<Record<string, unknown>> = import.meta.glob(
  './*/contract.ts',
  { eager: true, import: 'contract' },
);
