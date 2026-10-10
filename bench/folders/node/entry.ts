/**
 * Node entry for the data benchmarks; `run.ts` bundles and runs it. Prints one
 * JSON object on stdout. Arguments: `--datasets=a,b` and `--scale=<n>`.
 */
import './shims';
import { runDataBenchmarks } from '../dataCases';
import { DATASET_NAMES, type DatasetName } from '../datasets';

function argument(name: string): string | undefined {
  const prefix = `--${name}=`;
  return process.argv.find((arg) => arg.startsWith(prefix))?.slice(prefix.length);
}

async function main(): Promise<void> {
  const datasets = (argument('datasets')?.split(',') ?? DATASET_NAMES).filter(
    (name): name is DatasetName => (DATASET_NAMES as string[]).includes(name),
  );
  const runScale = Number(argument('scale') ?? '1') || 1;
  // The modules log every backup; printing it would time the terminal, not them.
  const quiet = () => {};
  Object.assign(console, { log: quiet, info: quiet, warn: quiet, error: quiet });
  const results = await runDataBenchmarks({ datasets, runScale });
  process.stdout.write(
    `${JSON.stringify({ runtime: `node ${process.version}`, v8: process.versions.v8, results })}\n`,
  );
}

main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? (error.stack ?? error.message) : error}\n`);
  process.exit(1);
});
