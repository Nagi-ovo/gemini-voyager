const { spawn, execSync } = require('child_process');
const { existsSync, mkdirSync } = require('fs');
const { join } = require('path');
const os = require('os');

const IS_WIN = os.platform() === 'win32';
const ROOT = process.cwd();
const DIST = join(ROOT, 'dist_chrome');
const USER_DATA = join(ROOT, '.chrome-dev-profile');
const MANIFEST = join(DIST, 'manifest.json');

// Paths
const CHROME_BIN = IS_WIN
  ? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
  : (os.platform() === 'darwin'
    ? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
    : '/usr/bin/google-chrome');

// Utils
const sleep = ms => new Promise(r => setTimeout(r, ms));
const log = (c, msg) => console.log(`${c}${msg}\x1b[0m`);

async function main() {
  log('\x1b[36m', '\n🤖 Gemini Voyager Dev Launcher');

  // 1. Check Chrome
  if (!existsSync(CHROME_BIN)) {
    console.error(`❌ Chrome not found at: ${CHROME_BIN}`);
    process.exit(1);
  }
  if (!existsSync(USER_DATA)) mkdirSync(USER_DATA, { recursive: true });

  // 2. Kill old instances (Simple One-Liner for each OS)
  try {
    const cmd = IS_WIN
      ? `wmic process where "name='chrome.exe' and commandline like '%chrome-dev-profile%'" call terminate`
      : `pkill -f ".chrome-dev-profile"`; // pkill is cleaner than ps|grep|awk
    execSync(cmd, { stdio: 'ignore' });
    await sleep(500); // Wait for cleanup
  } catch (e) { /* Ignore if no process found */ }

  // 3. Wait for Build (Simple polling)
  log('\x1b[33m', '⏳ Waiting for build...');
  let attempts = 0;
  while (!existsSync(MANIFEST)) {
    if (attempts++ > 60) {
      console.error('❌ Timeout waiting for build.');
      process.exit(1);
    }
    await sleep(1000);
  }
  await sleep(1000); // Flush write buffers

  // 4. Launch
  log('\x1b[32m', '🚀 Launching Chrome...');
  const child = spawn(CHROME_BIN, [
    `--load-extension=${DIST}`,
    `--user-data-dir=${USER_DATA}`,
    '--no-first-run',
    '--no-default-browser-check',
    'https://gemini.google.com',
    'chrome://extensions'
  ], { detached: true, stdio: 'inherit' });

  child.unref();
}

main();