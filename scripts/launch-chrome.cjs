'use strict';

const fs = require('fs');
const net = require('net');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');

const TARGET_URL = process.env.CHROME_OPEN_URL || 'https://gemini.google.com/';
const BUILD_TIMEOUT_MS = Number(process.env.CHROME_OPEN_BUILD_TIMEOUT_MS) || 120000; // ms
const BUILD_POLL_INTERVAL_MS = Number(process.env.CHROME_OPEN_POLL_INTERVAL_MS) || 500; // ms

const repoRoot = path.resolve(__dirname, '..');
const distDir = path.join(repoRoot, 'dist_chrome');
const manifestPath = path.join(distDir, 'manifest.json');
const profileDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gemini-voyager-chrome-'));

let devProcess,
  chromeRunner,
  debugPort,
  reloadTimer,
  lastBuildTime = 0,
  shuttingDown = false;
let devtoolsCommandId = 0;

main().catch((error) => {
  log(`Fatal error: ${error.message}`);
  process.exit(1);
});

async function main() {
  debugPort = await getAvailablePort();

  devProcess = startDevBuild();
  await waitForManifest(Date.now());
  lastBuildTime = manifestMtime();

  chromeRunner = await launchChrome();
  attachProcessHandlers();
  log('Chrome launched with the latest build.');

  if (debugPort) startReloadWatcher();
}

function startDevBuild() {
  const args = ['run', 'dev:chrome'];
  log(`Starting dev build: bun ${args.join(' ')}`);
  const child = spawn('bun', args, { cwd: repoRoot, stdio: 'inherit', env: process.env });
  child.on('exit', (code, signal) => {
    if (shuttingDown) return;
    log(`Dev build process exited (${signal ? `signal ${signal}` : `code ${code}`}).`);
    process.exit(code ?? 0);
  });
  return child;
}

async function launchChrome() {
  const webExt = await import('web-ext-run').then((mod) => mod.default ?? mod);
  const args = ['--no-first-run', '--no-default-browser-check'];
  if (debugPort)
    args.push('--remote-debugging-address=127.0.0.1', `--remote-debugging-port=${debugPort}`);
  const config = {
    target: 'chromium',
    sourceDir: distDir,
    startUrl: [TARGET_URL],
    keepProfileChanges: true,
    chromiumProfile: profileDir,
    args,
    noInput: true,
  };
  if (process.env.CHROME_BIN) config.chromiumBinary = process.env.CHROME_BIN;
  log('Launching Chrome via web-ext-run.');
  return webExt.cmd.run(config, { shouldExitProgram: false });
}

function attachProcessHandlers() {
  const cleanup = () => {
    if (shuttingDown) return;
    shuttingDown = true;
    devProcess?.kill('SIGTERM');
    chromeRunner?.exit?.();
    if (reloadTimer) clearInterval(reloadTimer);
    fs.rmSync(profileDir, { recursive: true, force: true });
  };
  process.on('SIGINT', () => {
    cleanup();
    process.exit(0);
  });
  process.on('SIGTERM', () => {
    cleanup();
    process.exit(0);
  });
  process.on('exit', cleanup);
}

async function waitForManifest(startTime) {
  const deadline = Date.now() + BUILD_TIMEOUT_MS;
  while (Date.now() < deadline) {
    try {
      const stat = fs.statSync(manifestPath);
      if (stat.mtimeMs >= startTime && stat.size > 0) return;
    } catch {}
    await new Promise((r) => setTimeout(r, BUILD_POLL_INTERVAL_MS));
  }
  throw new Error('Timed out waiting for dist_chrome/manifest.json');
}

function startReloadWatcher() {
  if (reloadTimer) return;
  reloadTimer = setInterval(async () => {
    if (shuttingDown) return;
    const mtime = manifestMtime();
    if (mtime <= lastBuildTime) return;
    lastBuildTime = mtime;
    try {
      await reloadTargetTabs();
    } catch (error) {
      log(`Tab reload failed: ${error.message}`);
    }
  }, BUILD_POLL_INTERVAL_MS);
}

function manifestMtime() {
  try {
    return fs.statSync(manifestPath).mtimeMs;
  } catch {
    return 0;
  }
}

async function reloadTargetTabs() {
  const targets = await fetchJson(`http://127.0.0.1:${debugPort}/json`);
  const matches = Array.isArray(targets)
    ? targets.filter(
        (t) => t?.type === 'page' && typeof t?.url === 'string' && t.url.startsWith(TARGET_URL),
      )
    : [];
  if (matches.length === 0) return;
  await Promise.all(
    matches.map((t) =>
      t?.webSocketDebuggerUrl
        ? sendDevtoolsCommand(t.webSocketDebuggerUrl, 'Page.reload', { ignoreCache: true })
        : Promise.resolve(),
    ),
  );
}

async function fetchJson(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Devtools endpoint returned ${res.status}`);
  return res.json();
}

function sendDevtoolsCommand(url, method, params) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url);
    const id = (devtoolsCommandId += 1);
    let settled = false;
    const settle = (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeoutId);
      if (error) reject(error);
      else resolve();
    };
    const timeoutId = setTimeout(() => {
      settle(new Error(`Devtools command timeout: ${method}`));
      ws.close();
    }, 5000);

    ws.onopen = () => ws.send(JSON.stringify({ id, method, params }));
    ws.onmessage = (event) => {
      const payload =
        typeof event.data === 'string' ? event.data : (event.data?.toString?.() ?? '');
      if (!payload) return;
      try {
        if (JSON.parse(payload).id === id) {
          ws.close();
          settle();
        }
      } catch (error) {
        log(`Devtools message parse error: ${error.message}`);
      }
    };
    ws.onerror = (error) => settle(error);
    ws.onclose = () => settle(new Error('Devtools connection closed before response.'));
  });
}

function getAvailablePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address();
      const port = typeof addr === 'object' && addr ? addr.port : null;
      server.close(() =>
        port ? resolve(port) : reject(new Error('Unable to determine open port.')),
      );
    });
  });
}

function log(message) {
  console.log(`[chrome-open] ${message}`);
}
