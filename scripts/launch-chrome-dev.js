import { spawn, execSync } from 'child_process';
import path from 'path';
import fs from 'fs';
import os from 'os';
import { fileURLToPath } from 'url';

// ESM dirname equivalent
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, '..');

// Configuration
const USER_DATA_DIR = path.join(PROJECT_ROOT, '.chrome-dev-data');
const CHROME_FLAGS = [
  '--remote-debugging-port=9222',
  '--no-first-run',
  '--no-default-browser-check',
  '--disable-background-networking',
  '--disable-client-side-phishing-detection',
  '--disable-default-apps',
  '--disable-hang-monitor',
  '--disable-popup-blocking',
  '--disable-prompt-on-repost',
  '--disable-sync',
  '--disable-translate',
  '--metrics-recording-only',
  '--safebrowsing-disable-auto-update',
  `--user-data-dir=${USER_DATA_DIR}`
];

const TARGET_URL = 'https://gemini.google.com';
const EXTENSION_PATH = path.join(PROJECT_ROOT, 'dist_chrome');

/**
 * Detect Chrome executable path based on OS
 */
function getChromePath() {
  const platform = os.platform();

  if (platform === 'win32') {
    const commonPaths = [
      process.env.LOCALAPPDATA + '\\Google\\Chrome\\Application\\chrome.exe',
      process.env.PROGRAMFILES + '\\Google\\Chrome\\Application\\chrome.exe',
      process.env['PROGRAMFILES(X86)'] + '\\Google\\Chrome\\Application\\chrome.exe'
    ];
    return commonPaths.find(p => fs.existsSync(p));
  } else if (platform === 'darwin') {
    return '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
  } else if (platform === 'linux') {
    return '/usr/bin/google-chrome';
  }
  return null;
}

/**
 * Cleanup existing Chrome instances running on the dev user dir
 */
function cleanupExistingProcess() {
  console.log('🧹 Cleaning up previous dev Chrome instances...');
  const platform = os.platform();

  try {
    if (platform === 'win32') {
      const result = execSync(
        `wmic process where "name='chrome.exe' and commandline like '%${USER_DATA_DIR.replace(/\\/g, '\\\\')}%'" get processid`,
        { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }
      );
      const lines = result.split('\n').filter(line => line.trim() && line.trim() !== 'ProcessId');
      for (const line of lines) {
        const pid = line.trim();
        if (pid && /^\d+$/.test(pid)) {
          console.log(`   Terminating Chrome process ${pid}...`);
          try {
            execSync(`taskkill /PID ${pid} /F`, { stdio: 'ignore' });
          } catch {
            // Process might already be gone
          }
        }
      }
    } else {
      try {
        execSync(`pkill -f "${USER_DATA_DIR}"`, { stdio: 'ignore' });
      } catch {
        // No matching process
      }
    }
    console.log('   Done.');
  } catch {
    console.log('   No existing dev Chrome processes found.');
  }
}

/**
 * Check if this is the first run (no profile exists yet or developer mode not enabled)
 */
function isFirstRun() {
  const prefsFile = path.join(USER_DATA_DIR, 'Default', 'Preferences');

  if (!fs.existsSync(prefsFile)) {
    return true;
  }

  try {
    const prefs = JSON.parse(fs.readFileSync(prefsFile, 'utf8'));
    return !prefs.extensions?.ui?.developer_mode;
  } catch {
    return true;
  }
}

/**
 * Main execution
 */
async function main() {
  const chromePath = getChromePath();
  if (!chromePath) {
    console.error('❌ Google Chrome not found on this system.');
    process.exit(1);
  }
  console.log(`✅ Found Chrome: ${chromePath}`);

  cleanupExistingProcess();

  const firstRun = isFirstRun();
  if (firstRun) {
    console.log('');
    console.log('⚠️  First time setup detected!');
    console.log('   After Chrome opens, please:');
    console.log('   1. Go to chrome://extensions');
    console.log('   2. Enable "Developer mode" toggle (top right)');
    console.log('   3. Click "Load unpacked" and select: dist_chrome');
    console.log('   4. Then navigate to https://gemini.google.com');
    console.log('');
    console.log('   This only needs to be done ONCE. Future runs will be automatic.');
    console.log('');
  }

  console.log('🚀 Starting build process...');
  const buildProcess = spawn('bun', [
    'x', 'nodemon',
    '--config', 'nodemon.chrome.json',
    '--exec', '"bun x vite build --config vite.config.chrome.ts --mode development"'
  ], {
    shell: true,
    cwd: PROJECT_ROOT,
    env: {
      ...process.env,
    },
    stdio: ['inherit', 'pipe', 'pipe']
  });

  buildProcess.stdout.pipe(process.stdout);
  buildProcess.stderr.pipe(process.stderr);

  let chromeLaunched = false;

  buildProcess.stdout.on('data', (data) => {
    const output = data.toString();
    if (!chromeLaunched && output.match(/built in \d+(?:\.\d+)?[ms]+/i)) {
      setTimeout(() => {
        launchChrome(chromePath, firstRun);
      }, 1000);
      chromeLaunched = true;
    }
  });

  process.on('SIGINT', () => {
    console.log('\n🛑 Stopping development environment...');
    buildProcess.kill();
    process.exit();
  });
}

function launchChrome(chromePath, firstRun) {
  console.log('🌐 Launching Chrome...');

  // Always try to load extension and open Gemini
  // On first run, also open extensions page for manual setup if needed
  const urls = firstRun
    ? ['chrome://extensions', TARGET_URL]
    : [TARGET_URL];

  const args = [
    `--load-extension=${EXTENSION_PATH}`,
    ...CHROME_FLAGS,
    ...urls
  ];

  console.log('   Extension path:', EXTENSION_PATH);
  console.log('   User data dir:', USER_DATA_DIR);
  if (firstRun) {
    console.log('   First run: Opening extensions page for setup + Gemini');
  }

  const chromeProcess = spawn(chromePath, args, {
    detached: true,
    stdio: 'ignore'
  });

  chromeProcess.unref();
  console.log('   Chrome launched successfully!');
}

main().catch(console.error);

