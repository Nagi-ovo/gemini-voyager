#!/usr/bin/env bun
/**
 * `bun run plugin:check [<plugin dir>...]` — see `lib/pluginCheck.ts` for the
 * rules it applies.
 *
 * The checker reaches `verbs/contracts.ts`, which finds each primitive's
 * contract with Vite's `import.meta.glob`. Bun has none, so the seam that feeds
 * those contracts from disk is installed first and the checker is imported
 * only afterwards: a Bun plugin cannot reach modules that are already loaded.
 */
import { installPrimitiveContractsSeam } from './lib/primitiveContractsSeam';

installPrimitiveContractsSeam();
const checker = await import('./lib/pluginCheck');

export type { PluginCheckResult } from './lib/pluginCheck';
export const {
  DEFAULT_CATALOG_SITES_DIR,
  REQUIRED_PLUGIN_LOCALES,
  checkPluginDir,
  displayPath,
  findPluginDirs,
  formatResult,
} = checker;

if ((import.meta as unknown as { main?: boolean }).main) {
  checker.main().catch((error: unknown) => {
    console.error(error);
    process.exit(1);
  });
}
