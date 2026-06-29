#!/usr/bin/env bun
import katex from 'katex';
import { type ChildProcessWithoutNullStreams, spawn } from 'node:child_process';
import {
  type PathLike,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { delimiter, dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { buildKatexExportStyles } from '../src/features/export/services/katexExportStyles';

type DevtoolsMessage = {
  id?: number;
  method?: string;
  params?: Record<string, unknown>;
  result?: Record<string, unknown>;
  error?: { message?: string };
};

type PendingCommand = {
  resolve: (value: Record<string, unknown>) => void;
  reject: (error: Error) => void;
};

type RectMetric = {
  display: string;
  height: number;
  marginBottom: string;
  marginTop: string;
  maxWidth: string;
  objectFit: string;
  overflow: string;
  position: string;
  textAlign: string;
  verticalAlign: string;
  whiteSpace: string;
  width: number;
  x: number;
  y: number;
};

type Metrics = {
  base: RectMetric | null;
  docClip: { height: number; width: number; x: number; y: number };
  fracLine: RectMetric | null;
  hideTail: RectMetric | null;
  katexImg: RectMetric | null;
  sqrt: RectMetric | null;
  svg: RectMetric | null;
  userAgent: string;
  vlist: RectMetric | null;
  vlistSpan: RectMetric | null;
  vlistT: RectMetric | null;
};

type Analysis = {
  checks: Record<string, boolean>;
  ok: boolean;
};

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const outputDir = resolve(repoRoot, 'output/katex-export-verify');
const katexCssHref = pathToFileURL(resolve(repoRoot, 'node_modules/katex/dist/katex.css')).href;
const htmlToImageHref = pathToFileURL(
  resolve(repoRoot, 'node_modules/html-to-image/dist/html-to-image.js'),
).href;

const CASES = [
  { label: 'sqrt', tex: String.raw`\sqrt{2} \approx 1.414` },
  { label: 'fraction', tex: String.raw`\frac{a}{b} = \frac{a}{b}` },
  { label: 'supsub', tex: String.raw`x_{n+1} = \frac{1}{2}\left(x_n + \frac{C}{x_n}\right)` },
];

class DevtoolsClient {
  private commandId = 0;
  private readonly events = new Map<string, Array<(params: Record<string, unknown>) => void>>();
  private readonly pending = new Map<number, PendingCommand>();
  private readonly ready: Promise<void>;
  private readonly ws: WebSocket;

  constructor(url: string) {
    this.ws = new WebSocket(url);
    this.ready = new Promise((resolveReady, rejectReady) => {
      this.ws.addEventListener('open', () => resolveReady());
      this.ws.addEventListener('error', () => rejectReady(new Error('DevTools WebSocket failed')));
    });

    this.ws.addEventListener('message', (event) => this.handleMessage(String(event.data)));
    this.ws.addEventListener('close', () => {
      for (const pending of this.pending.values()) {
        pending.reject(new Error('DevTools WebSocket closed'));
      }
      this.pending.clear();
    });
  }

  close(): void {
    this.ws.close();
  }

  async send(
    method: string,
    params: Record<string, unknown> = {},
  ): Promise<Record<string, unknown>> {
    await this.ready;
    const id = (this.commandId += 1);
    const message = JSON.stringify({ id, method, params });

    return new Promise((resolveCommand, rejectCommand) => {
      this.pending.set(id, { resolve: resolveCommand, reject: rejectCommand });
      this.ws.send(message);
    });
  }

  waitFor(method: string, timeoutMs = 10000): Promise<Record<string, unknown>> {
    return new Promise((resolveEvent, rejectEvent) => {
      const timer = setTimeout(() => {
        removeListener();
        rejectEvent(new Error(`Timed out waiting for ${method}`));
      }, timeoutMs);

      const listener = (params: Record<string, unknown>) => {
        clearTimeout(timer);
        removeListener();
        resolveEvent(params);
      };

      const removeListener = () => {
        const listeners = this.events.get(method) ?? [];
        this.events.set(
          method,
          listeners.filter((candidate) => candidate !== listener),
        );
      };

      this.events.set(method, [...(this.events.get(method) ?? []), listener]);
    });
  }

  private handleMessage(raw: string): void {
    const message = JSON.parse(raw) as DevtoolsMessage;

    if (typeof message.id === 'number') {
      const pending = this.pending.get(message.id);
      if (!pending) return;
      this.pending.delete(message.id);
      if (message.error) {
        pending.reject(new Error(message.error.message ?? 'DevTools command failed'));
      } else {
        pending.resolve(message.result ?? {});
      }
      return;
    }

    if (!message.method) return;
    for (const listener of this.events.get(message.method) ?? []) {
      listener(message.params ?? {});
    }
  }
}

async function main(): Promise<void> {
  mkdirSync(outputDir, { recursive: true });

  const chromePath = findChrome();
  if (!chromePath) {
    throw new Error('Chrome not found. Set CHROME_BIN=/path/to/chrome and run again.');
  }

  const brokenHtml = writeFixture('broken', false);
  const fixedHtml = writeFixture('fixed', true);

  const chrome = launchChrome(chromePath);
  let client: DevtoolsClient | null = null;

  try {
    const port = await waitForDevtoolsPort(chrome.userDataDir);
    const targetUrl = await createTarget(port);
    client = new DevtoolsClient(targetUrl);
    await client.send('Page.enable');
    await client.send('Runtime.enable');

    const brokenMetrics = await inspectFixture(client, brokenHtml, 'broken');
    const fixedMetrics = await inspectFixture(client, fixedHtml, 'fixed');
    const brokenAnalysis = analyze(brokenMetrics);
    const fixedAnalysis = analyze(fixedMetrics);

    await writePdf(client, fixedHtml, 'fixed.pdf');
    await writeHtmlToImagePng(client, fixedHtml, 'fixed-html-to-image.png');

    const summary = {
      broken: { analysis: brokenAnalysis, metrics: brokenMetrics },
      fixed: { analysis: fixedAnalysis, metrics: fixedMetrics },
      outputs: {
        brokenHtml,
        fixedHtml,
        fixedHtmlToImagePng: join(outputDir, 'fixed-html-to-image.png'),
        fixedPdf: join(outputDir, 'fixed.pdf'),
        fixedScreenshot: join(outputDir, 'fixed.png'),
      },
    };

    writeFileSync(join(outputDir, 'metrics.json'), JSON.stringify(summary, null, 2) + '\n');

    log(`KaTeX export verification written to ${outputDir}`);
    log(`broken checks: ${formatChecks(brokenAnalysis)}`);
    log(`fixed checks:  ${formatChecks(fixedAnalysis)}`);

    if (!fixedAnalysis.ok) {
      throw new Error('Fixed KaTeX export fixture failed layout checks.');
    }
  } finally {
    client?.close();
    chrome.process.kill('SIGTERM');
    cleanup(chrome.userDataDir);
  }
}

function writeFixture(name: string, fixed: boolean): string {
  const mathHtml = CASES.map(
    (testCase) => `
      <li data-case="${testCase.label}">
        <strong>${escapeHtml(testCase.label)}:</strong>
        <span class="math-inline" data-math="${escapeHtml(testCase.tex)}">
          ${renderGeminiKatex(testCase.tex)}
        </span>
      </li>`,
  ).join('\n');

  const printScope = 'body.gv-pdf-printing #gv-pdf-print-container';
  const exportCss = fixed
    ? `
        ${buildKatexExportStyles(printScope, true)}
        ${buildKatexExportStyles('.gv-image-export-doc')}
      `
    : '';

  const html = `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>Voyager KaTeX Export ${name}</title>
    <link rel="stylesheet" href="${katexCssHref}" />
    <script src="${htmlToImageHref}"></script>
    <style>
      body {
        margin: 0;
        background: #f5f1e8;
        color: #202124;
        font-family: Georgia, "Times New Roman", serif;
      }

      body.gv-pdf-printing #gv-pdf-print-container * {
        display: revert !important;
      }

      ${exportCss}

      #gv-pdf-print-container {
        padding: 32px;
      }

      .gv-image-export-doc {
        width: 760px;
        background: #fff;
        border: 1px solid #ddd;
        box-sizing: border-box;
        padding: 28px 32px;
      }

      .gv-image-export-content {
        font-size: 24px;
        line-height: 1.8;
      }

      .gv-image-export-content img {
        display: block;
        height: auto;
        margin: 12px 0;
        max-width: 100%;
      }

      .gv-print-turn-text img {
        display: block;
        height: auto;
        margin: 0.5em 0;
        max-width: 60%;
      }

      .gv-image-export-doc p {
        font-size: 24px;
        line-height: 1.8;
        margin: 0 0 18px;
      }

      .gv-image-export-doc .label {
        color: #666;
        display: inline-block;
        font-family: Arial, sans-serif;
        font-size: 12px;
        margin-right: 12px;
        text-transform: uppercase;
        vertical-align: middle;
        width: 74px;
      }
    </style>
  </head>
  <body class="gv-pdf-printing">
    <div id="gv-pdf-print-container">
      <div class="gv-print-turn-text">
        <div class="gv-image-export-doc">
          <div class="gv-image-export-content">
            <p>Gemini-style KaTeX radical images inside exported list content:</p>
            <ul>
              ${mathHtml}
            </ul>
          </div>
        </div>
      </div>
    </div>
  </body>
</html>
`;

  const filePath = join(outputDir, `${name}.html`);
  writeFileSync(filePath, html);
  return filePath;
}

async function inspectFixture(
  client: DevtoolsClient,
  fixturePath: string,
  name: string,
): Promise<Metrics> {
  await navigate(client, pathToFileURL(fixturePath).href);
  const metrics = await evaluate<Metrics>(
    client,
    `(() => {
      const asMetric = (element) => {
        if (!element) return null;
        const rect = element.getBoundingClientRect();
        const style = window.getComputedStyle(element);
        return {
          display: style.display,
          height: rect.height,
          marginBottom: style.marginBottom,
          marginTop: style.marginTop,
          maxWidth: style.maxWidth,
          objectFit: style.objectFit,
          overflow: style.overflow,
          position: style.position,
          textAlign: style.textAlign,
          verticalAlign: style.verticalAlign,
          whiteSpace: style.whiteSpace,
          width: rect.width,
          x: rect.x,
          y: rect.y,
        };
      };

      const root = document.querySelector('[data-case="sqrt"] .katex');
      const doc = document.querySelector('.gv-image-export-doc').getBoundingClientRect();
      return {
        base: asMetric(root && root.querySelector('.base')),
        docClip: {
          height: doc.height + 16,
          width: doc.width + 16,
          x: Math.max(0, doc.x - 8),
          y: Math.max(0, doc.y - 8),
        },
        fracLine: asMetric(document.querySelector('[data-case="fraction"] .mfrac .frac-line')),
        hideTail: asMetric(root && root.querySelector('.sqrt .hide-tail, .sqrt .stretchy')),
        katexImg: asMetric(root && root.querySelector('.sqrt img.katex-svg')),
        sqrt: asMetric(root && root.querySelector('.sqrt')),
        svg: asMetric(root && root.querySelector('.sqrt svg')),
        userAgent: navigator.userAgent,
        vlist: asMetric(root && root.querySelector('.vlist')),
        vlistSpan: asMetric(root && root.querySelector('.vlist > span')),
        vlistT: asMetric(root && root.querySelector('.vlist-t')),
      };
    })()`,
  );

  await writeScreenshot(client, metrics.docClip, `${name}.png`);
  return metrics;
}

async function writePdf(
  client: DevtoolsClient,
  fixturePath: string,
  fileName: string,
): Promise<void> {
  await navigate(client, pathToFileURL(fixturePath).href);
  const response = await client.send('Page.printToPDF', {
    marginBottom: 0.4,
    marginLeft: 0.4,
    marginRight: 0.4,
    marginTop: 0.4,
    printBackground: true,
  });
  const data = String(response.data ?? '');
  if (data.length < 1000) throw new Error('Chrome returned an unexpectedly small PDF');
  writeFileSync(join(outputDir, fileName), Buffer.from(data, 'base64'));
}

async function writeHtmlToImagePng(
  client: DevtoolsClient,
  fixturePath: string,
  fileName: string,
): Promise<void> {
  await navigate(client, pathToFileURL(fixturePath).href);
  const dataUrl = await evaluate<string>(
    client,
    `(async () => {
      await document.fonts.ready;
      const node = document.querySelector('.gv-image-export-doc');
      const dataUrl = await window.htmlToImage.toPng(node, {
        backgroundColor: '#fff',
        cacheBust: true,
        pixelRatio: 1,
        skipFonts: false,
      });
      return dataUrl;
    })()`,
  );

  const match = /^data:image\/png;base64,(.+)$/.exec(dataUrl);
  if (!match) throw new Error('html-to-image did not return a PNG data URL');
  writeFileSync(join(outputDir, fileName), Buffer.from(match[1], 'base64'));
}

async function writeScreenshot(
  client: DevtoolsClient,
  clip: Metrics['docClip'],
  fileName: string,
): Promise<void> {
  const response = await client.send('Page.captureScreenshot', {
    clip: {
      height: Math.ceil(clip.height),
      scale: 1,
      width: Math.ceil(clip.width),
      x: Math.floor(clip.x),
      y: Math.floor(clip.y),
    },
    format: 'png',
    fromSurface: true,
  });
  writeFileSync(join(outputDir, fileName), Buffer.from(String(response.data ?? ''), 'base64'));
}

function analyze(metrics: Metrics): Analysis {
  const checks = {
    baseLayout:
      metrics.base?.display === 'inline-block' &&
      metrics.base.position === 'relative' &&
      metrics.base.whiteSpace === 'nowrap',
    fractionLine: Boolean(
      metrics.fracLine && metrics.fracLine.height >= 1 && metrics.fracLine.width > 8,
    ),
    sqrtVisible: Boolean(metrics.sqrt && metrics.sqrt.height > 14 && metrics.sqrt.width > 16),
    radicalGraphicLayout: Boolean(
      (metrics.svg &&
        metrics.svg.display === 'block' &&
        metrics.svg.position === 'absolute' &&
        metrics.svg.height > 8 &&
        metrics.svg.width > 8) ||
        (metrics.katexImg &&
          metrics.katexImg.display === 'block' &&
          metrics.katexImg.position === 'absolute' &&
          metrics.katexImg.height > 8 &&
          metrics.katexImg.width > 8 &&
          metrics.katexImg.marginTop === '0px' &&
          metrics.katexImg.maxWidth === 'none'),
    ),
    tailLayout:
      metrics.hideTail?.overflow === 'hidden' &&
      metrics.hideTail.position === 'relative' &&
      metrics.hideTail.width > 8,
    vlistLayout:
      metrics.vlistT?.display === 'inline-table' &&
      metrics.vlist?.display === 'table-cell' &&
      Boolean(
        metrics.vlistSpan && metrics.vlistSpan.display === 'block' && metrics.vlistSpan.height < 1,
      ),
  };

  return { checks, ok: Object.values(checks).every(Boolean) };
}

async function navigate(client: DevtoolsClient, url: string): Promise<void> {
  const loaded = client.waitFor('Page.loadEventFired');
  await client.send('Page.navigate', { url });
  await loaded;
  await evaluate(
    client,
    `(async () => {
      await document.fonts.ready;
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      return true;
    })()`,
  );
}

async function evaluate<T>(client: DevtoolsClient, expression: string): Promise<T> {
  const response = await client.send('Runtime.evaluate', {
    awaitPromise: true,
    expression,
    returnByValue: true,
  });
  if (response.exceptionDetails) {
    throw new Error(`Runtime.evaluate failed: ${JSON.stringify(response.exceptionDetails)}`);
  }
  const result = response.result as { value?: T } | undefined;
  return result?.value as T;
}

function launchChrome(chromePath: string): {
  process: ChildProcessWithoutNullStreams;
  userDataDir: string;
} {
  const userDataDir = mkdtempSync(join(tmpdir(), 'gemini-voyager-katex-chrome-'));
  const child = spawn(chromePath, [
    '--headless=new',
    '--disable-gpu',
    '--disable-web-security',
    '--allow-file-access-from-files',
    '--no-default-browser-check',
    '--no-first-run',
    '--remote-debugging-address=127.0.0.1',
    '--remote-debugging-port=0',
    `--user-data-dir=${userDataDir}`,
    'about:blank',
  ]);

  let stderr = '';
  child.stderr.on('data', (chunk) => {
    stderr += String(chunk);
  });
  child.on('exit', (code, signal) => {
    if (code !== null && code !== 0) {
      console.error(`Chrome exited with code ${code}: ${stderr}`);
    } else if (signal && signal !== 'SIGTERM') {
      console.error(`Chrome exited via ${signal}: ${stderr}`);
    }
  });

  return { process: child, userDataDir };
}

async function waitForDevtoolsPort(userDataDir: string): Promise<number> {
  const activePortFile = join(userDataDir, 'DevToolsActivePort');
  const deadline = Date.now() + 15000;
  while (Date.now() < deadline) {
    if (existsSync(activePortFile)) {
      const [port] = readFileSync(activePortFile, 'utf8').trim().split('\n');
      return Number(port);
    }
    await sleep(50);
  }
  throw new Error('Timed out waiting for Chrome DevToolsActivePort');
}

async function createTarget(port: number): Promise<string> {
  const url = `http://127.0.0.1:${port}/json/new?${encodeURIComponent('about:blank')}`;
  const response = await fetch(url, { method: 'PUT' });
  if (!response.ok) throw new Error(`Chrome target creation failed with ${response.status}`);
  const payload = (await response.json()) as { webSocketDebuggerUrl?: string };
  if (!payload.webSocketDebuggerUrl) throw new Error('Chrome target has no WebSocket URL');
  return payload.webSocketDebuggerUrl;
}

function findChrome(): string | null {
  const candidates = [
    process.env.CHROME_BIN,
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Google Chrome Canary.app/Contents/MacOS/Google Chrome Canary',
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
    findOnPath('google-chrome'),
    findOnPath('chromium'),
    findOnPath('chromium-browser'),
  ].filter(Boolean) as string[];

  return candidates.find((candidate) => existsSync(candidate)) ?? null;
}

function findOnPath(command: string): string | null {
  for (const dir of (process.env.PATH ?? '').split(delimiter)) {
    const candidate = join(dir, command);
    if (existsSync(candidate)) return candidate;
  }
  return null;
}

function cleanup(path: PathLike): void {
  try {
    // The directory is a throwaway Chrome profile in the OS temp folder.
    rmSync(path, { force: true, recursive: true });
  } catch {}
}

function formatChecks(analysis: Analysis): string {
  return Object.entries(analysis.checks)
    .map(([name, pass]) => `${name}=${pass ? 'pass' : 'fail'}`)
    .join(', ');
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function renderGeminiKatex(tex: string): string {
  const html = katex.renderToString(tex, {
    displayMode: false,
    output: 'htmlAndMathml',
    throwOnError: false,
  });

  return html.replace(/<svg\b[^>]*>[\s\S]*?<\/svg>/g, (svg) => {
    const src = `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
    return `<img class="katex-svg" style="display:block;position:absolute;width:100%;height:inherit;" src="${escapeHtml(src)}">`;
  });
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolveSleep) => setTimeout(resolveSleep, ms));
}

function log(message: string): void {
  process.stdout.write(`${message}\n`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
