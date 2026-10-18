/**
 * Keeps the bench runnable as src/ moves on (`bun run bench:check`, part of
 * `verify:pr`): bundles both entries and runs the node data cases once on the
 * smallest dataset. It times nothing, starts no browser and writes no results.
 */
import { spawnSync } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { bundle } from './build';

async function main(): Promise<void> {
  await bundle('browser/entry.ts', 'browser');
  const dir = await mkdtemp(path.join(os.tmpdir(), 'voyager-folder-bench-'));
  try {
    const file = path.join(dir, 'node-bench.mjs');
    await writeFile(file, await bundle('node/entry.ts', 'node'));
    const child = spawnSync(
      process.env.NODE_BIN ?? 'node',
      [file, '--datasets=normal', '--scale=0.1'],
      {
        encoding: 'utf8',
        maxBuffer: 64 * 1024 * 1024,
      },
    );
    if (child.status !== 0) throw new Error(`node data cases failed:\n${child.stderr}`);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
  process.stderr.write('[folder-bench] check: both entries bundle and the data cases run\n');
}

main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? (error.stack ?? error.message) : error}\n`);
  process.exit(1);
});
