/**
 * Folder performance baseline: one command for the whole run.
 *
 *   bun bench/folders/run.ts [--only=node|browser] [--datasets=normal,large]
 *                            [--scale=1] [--cpu-throttle=1] [--chrome=/path/to/chrome]
 *
 * 1. Bundles `node/entry.ts` and runs the data cases in node.
 * 2. Bundles `browser/entry.ts`, serves it on 127.0.0.1 with
 *    `public/contentStyle.css`, starts a headless Chrome with a throwaway
 *    profile, runs every surface over the DevTools protocol, then closes it.
 * 3. Writes `.results/latest.json` and `.results/latest.md` next to this file.
 *
 * Opens no existing browser window and touches no real site.
 */
import { spawn, spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { type Server, createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import os from 'node:os';
import path from 'node:path';

import { BENCH_DIR, REPO_ROOT, bundle } from './build';
import {
  DATASETS,
  DATASET_NAMES,
  type DatasetName,
  generateFolderData,
  summarize,
} from './datasets';
import { type BenchReport, toMarkdown } from './report';
import type { BenchResult } from './stats';

const RESULTS_DIR = path.join(BENCH_DIR, '.results');

function argument(name: string): string | undefined {
  const prefix = `--${name}=`;
  return process.argv.find((arg) => arg.startsWith(prefix))?.slice(prefix.length);
}

function log(message: string): void {
  process.stderr.write(`[folder-bench] ${message}\n`);
}

const only = argument('only');
const datasets = (argument('datasets')?.split(',') ?? DATASET_NAMES).filter(
  (name): name is DatasetName => (DATASET_NAMES as string[]).includes(name),
);
const runScale = Number(argument('scale') ?? '1') || 1;
const cpuThrottle = Number(argument('cpu-throttle') ?? '1') || 1;

// --- node -------------------------------------------------------------------

async function runNode(): Promise<{ runtime: string; results: BenchResult[] }> {
  const file = path.join(RESULTS_DIR, 'node-bench.mjs');
  await writeFile(file, await bundle('node/entry.ts', 'node'));
  log(`node: running data cases for ${datasets.join(', ')}`);
  const node = process.env.NODE_BIN ?? 'node';
  const child = spawnSync(node, [file, `--datasets=${datasets.join(',')}`, `--scale=${runScale}`], {
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  });
  if (child.status !== 0) throw new Error(`node bench failed:\n${child.stderr}`);
  const parsed = JSON.parse(child.stdout.trim().split('\n').pop() ?? '{}') as {
    runtime: string;
    v8: string;
    results: BenchResult[];
  };
  return { runtime: `${parsed.runtime} (V8 ${parsed.v8})`, results: parsed.results };
}

// --- browser ----------------------------------------------------------------

const PAGE = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>Voyager folder bench</title>
<link rel="stylesheet" href="/contentStyle.css">
<style>html,body{margin:0;font:14px system-ui,sans-serif}</style>
</head><body><script type="module" src="/bench.js"></script></body></html>`;

async function serve(script: string): Promise<Server> {
  const css = await readFile(path.join(REPO_ROOT, 'public/contentStyle.css'), 'utf8');
  const files: Record<string, [string, string]> = {
    '/': ['text/html', PAGE],
    '/bench.js': ['text/javascript', script],
    '/contentStyle.css': ['text/css', css],
  };
  const server = createServer((request, response) => {
    const file = files[(request.url ?? '/').split('?')[0]];
    if (!file) {
      response.writeHead(404).end();
      return;
    }
    // Cross-origin isolation gives performance.now() 5 µs resolution instead of 100 µs.
    response.writeHead(200, {
      'content-type': `${file[0]}; charset=utf-8`,
      'cross-origin-opener-policy': 'same-origin',
      'cross-origin-embedder-policy': 'require-corp',
      'cache-control': 'no-store',
    });
    response.end(file[1]);
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  return server;
}

function findChrome(): string {
  const candidates = [
    argument('chrome'),
    process.env.CHROME_PATH,
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/usr/bin/google-chrome',
    '/usr/bin/google-chrome-stable',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  ];
  const found = candidates.find((candidate) => candidate && existsSync(candidate));
  if (!found) throw new Error('Chrome not found: pass --chrome=<path> or set CHROME_PATH');
  return found;
}

type CdpMessage = {
  id?: number;
  result?: Record<string, unknown>;
  error?: { message: string };
};

class Cdp {
  private nextId = 0;
  private readonly pending = new Map<number, (message: CdpMessage) => void>();
  private constructor(private readonly socket: WebSocket) {
    socket.addEventListener('message', (event) => {
      const message = JSON.parse(String(event.data)) as CdpMessage;
      if (message.id !== undefined) this.pending.get(message.id)?.(message);
    });
  }
  static async connect(url: string): Promise<Cdp> {
    const socket = new WebSocket(url);
    await new Promise<void>((resolve, reject) => {
      socket.addEventListener('open', () => resolve(), { once: true });
      socket.addEventListener('error', () => reject(new Error(`cannot connect to ${url}`)), {
        once: true,
      });
    });
    return new Cdp(socket);
  }
  send<T = Record<string, unknown>>(
    method: string,
    params: Record<string, unknown> = {},
    sessionId?: string,
  ): Promise<T> {
    const id = ++this.nextId;
    return new Promise<T>((resolve, reject) => {
      this.pending.set(id, (message) => {
        this.pending.delete(id);
        if (message.error) reject(new Error(`${method}: ${message.error.message}`));
        else resolve((message.result ?? {}) as T);
      });
      this.socket.send(JSON.stringify({ id, method, params, sessionId }));
    });
  }
  close(): void {
    this.socket.close();
  }
}

async function waitForFile(file: string, timeoutMs: number): Promise<string> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (existsSync(file)) {
      const text = await readFile(file, 'utf8');
      if (text.includes('\n')) return text;
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`timed out waiting for ${file}`);
}

interface BrowserRun {
  browser: string;
  userAgent: string;
  crossOriginIsolated: boolean;
  longTasksSupported: boolean;
  results: BenchResult[];
}

async function runBrowser(): Promise<BrowserRun> {
  const script = await bundle('browser/entry.ts', 'browser');
  const server = await serve(script);
  const { port } = server.address() as AddressInfo;
  const profile = await mkdtemp(path.join(os.tmpdir(), 'voyager-folder-bench-'));
  const chrome = spawn(
    findChrome(),
    [
      '--headless=new',
      '--remote-debugging-port=0',
      `--user-data-dir=${profile}`,
      '--no-first-run',
      '--no-default-browser-check',
      '--disable-extensions',
      '--disable-background-timer-throttling',
      '--disable-renderer-backgrounding',
      '--disable-backgrounding-occluded-windows',
      '--window-size=1280,900',
      'about:blank',
    ],
    { stdio: 'ignore' },
  );
  let cdp: Cdp | null = null;
  const cleanup = async () => {
    try {
      await cdp?.send('Browser.close');
    } catch {
      // Already gone.
    }
    cdp?.close();
    if (chrome.exitCode === null) chrome.kill('SIGKILL');
    server.close();
    await rm(profile, { recursive: true, force: true });
  };
  const onSignal = () => {
    void cleanup().finally(() => process.exit(130));
  };
  process.once('SIGINT', onSignal);
  process.once('SIGTERM', onSignal);
  try {
    const [debugPort, browserPath] = (
      await waitForFile(path.join(profile, 'DevToolsActivePort'), 20_000)
    ).split('\n');
    cdp = await Cdp.connect(`ws://127.0.0.1:${debugPort}${browserPath}`);
    const version = await cdp.send<{ product: string }>('Browser.getVersion');
    log(`browser: ${version.product}, serving http://127.0.0.1:${port}/`);
    const { targetId } = await cdp.send<{ targetId: string }>('Target.createTarget', {
      url: `http://127.0.0.1:${port}/`,
    });
    const { sessionId } = await cdp.send<{ sessionId: string }>('Target.attachToTarget', {
      targetId,
      flatten: true,
    });
    const evaluate = async <T>(expression: string): Promise<T> => {
      const reply = await cdp!.send<{
        result: { value?: T };
        exceptionDetails?: { exception?: { description?: string }; text: string };
      }>('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }, sessionId);
      if (reply.exceptionDetails) {
        throw new Error(
          reply.exceptionDetails.exception?.description ?? reply.exceptionDetails.text,
        );
      }
      return reply.result.value as T;
    };
    const ready = Date.now() + 20_000;
    while ((await evaluate<string>('typeof window.__folderBench')) !== 'object') {
      if (Date.now() > ready) throw new Error('bench page did not load');
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    if (cpuThrottle > 1) {
      await cdp.send('Emulation.setCPUThrottlingRate', { rate: cpuThrottle }, sessionId);
    }
    log(`browser: running surfaces for ${datasets.join(', ')} (this takes a few minutes)`);
    const outcome = await evaluate<Omit<BrowserRun, 'browser'>>(
      `window.__folderBench.run(${JSON.stringify({ datasets, runScale })})`,
    );
    return { browser: version.product, ...outcome };
  } finally {
    process.off('SIGINT', onSignal);
    process.off('SIGTERM', onSignal);
    await cleanup();
  }
}

// --- report -----------------------------------------------------------------

function describeMachine(): string {
  const cpus = os.cpus();
  return `${cpus[0]?.model ?? 'unknown CPU'} (${cpus.length} cores), ${(os.totalmem() / 2 ** 30).toFixed(0)} GiB, ${os.type()} ${os.release()} ${os.arch()}`;
}

function currentCommit(): string {
  const result = spawnSync('git', ['rev-parse', '--short', 'HEAD'], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
  });
  const dirty = spawnSync('git', ['status', '--porcelain', '--', 'src'], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
  });
  return `${result.stdout.trim() || 'unknown'}${dirty.stdout.trim() ? ' (src modified)' : ''}`;
}

async function main(): Promise<void> {
  await mkdir(RESULTS_DIR, { recursive: true });
  const nodeRun = only === 'browser' ? null : await runNode();
  const browserRun = only === 'node' ? null : await runBrowser();
  const report: BenchReport = {
    meta: {
      date: new Date().toISOString(),
      commit: currentCommit(),
      machine: describeMachine(),
      node: nodeRun?.runtime,
      browser: browserRun?.browser,
      userAgent: browserRun?.userAgent,
      crossOriginIsolated: browserRun?.crossOriginIsolated,
      cpuThrottle,
      runScale,
    },
    datasets: datasets.map((name) => summarize(name, generateFolderData(DATASETS[name]))),
    node: nodeRun?.results ?? [],
    browser: browserRun?.results ?? [],
  };
  const stamp = report.meta.date.replace(/[:.]/g, '-');
  const json = `${JSON.stringify(report, null, 2)}\n`;
  const markdown = toMarkdown(report);
  await writeFile(path.join(RESULTS_DIR, `${stamp}.json`), json);
  await writeFile(path.join(RESULTS_DIR, 'latest.json'), json);
  await writeFile(path.join(RESULTS_DIR, 'latest.md'), markdown);
  process.stdout.write(markdown);
  log(`wrote ${path.relative(REPO_ROOT, path.join(RESULTS_DIR, 'latest.md'))}`);
}

main().catch((error: unknown) => {
  log(error instanceof Error ? (error.stack ?? error.message) : String(error));
  process.exit(1);
});
