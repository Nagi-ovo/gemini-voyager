#!/usr/bin/env bun
/**
 * `bun run catalog:build [--out <dir>] [--now <ISO>]` — see
 * `lib/buildPluginCatalog.ts` for what it publishes and checks.
 *
 * The build reaches `verbs/contracts.ts`, which finds each primitive's contract
 * with Vite's `import.meta.glob`. Bun has none, so the seam that feeds those
 * contracts from disk is installed first and the build is imported only
 * afterwards: a Bun plugin cannot reach modules that are already loaded.
 */
import { installPrimitiveContractsSeam } from './lib/primitiveContractsSeam';

installPrimitiveContractsSeam();
const publisher = await import('./lib/buildPluginCatalog');

export type {
  BuildOptions,
  CliOptions,
  HostCatalogFile,
  WriteOptions,
  WrittenHostCatalog,
} from './lib/buildPluginCatalog';
export const {
  DEFAULT_CATALOG_DIR,
  DEFAULT_OUT_DIR,
  buildHostCatalogs,
  parseArgs,
  writeHostCatalogs,
} = publisher;

if ((import.meta as unknown as { main?: boolean }).main) {
  publisher.main().catch((error: unknown) => {
    console.error(error);
    process.exit(1);
  });
}
