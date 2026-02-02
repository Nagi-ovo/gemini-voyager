import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Paths to the files containing the version
const packageJsonPath = path.resolve(__dirname, '../package.json');
const manifestJsonPath = path.resolve(__dirname, '../manifest.json');
const manifestDevJsonPath = path.resolve(__dirname, '../manifest.dev.json');

// Helper to read JSON file
function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

// Helper to write JSON file
function writeJson(filePath, data) {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2) + '\n');
}

// Logic to bump version with rollover at 10
function bumpVersion(version) {
  let [major, minor, patch] = version.split('.').map(Number);

  patch += 1;

  if (patch > 9) {
    patch = 0;
    minor += 1;
  }

  if (minor > 9) {
    minor = 0;
    major += 1;
  }

  return `${major}.${minor}.${patch}`;
}

async function main() {
  try {
    console.log('Reading current version...');
    const packageJson = readJson(packageJsonPath);
    const currentVersion = packageJson.version;

    console.log(`Current version: ${currentVersion}`);

    const newVersion = bumpVersion(currentVersion);
    console.log(`New version:     ${newVersion}`);

    // Update package.json
    packageJson.version = newVersion;
    writeJson(packageJsonPath, packageJson);
    console.log('Updated package.json');

    // Update manifest.json
    if (fs.existsSync(manifestJsonPath)) {
      const manifestJson = readJson(manifestJsonPath);
      manifestJson.version = newVersion;
      writeJson(manifestJsonPath, manifestJson);
      console.log('Updated manifest.json');
    } else {
      console.warn('manifest.json not found, skipping...');
    }

    // Update manifest.dev.json
    if (fs.existsSync(manifestDevJsonPath)) {
      const manifestDevJson = readJson(manifestDevJsonPath);
      manifestDevJson.version = newVersion;
      writeJson(manifestDevJsonPath, manifestDevJson);
      console.log('Updated manifest.dev.json');
    }

    console.log('Version bump complete! 🚀');

    console.log('Running format...');
    execSync('bun run format', { stdio: 'inherit' });
    console.log('Format complete! ✨');
  } catch (error) {
    console.error('Error bumping version:', error);
    process.exit(1);
  }
}

main();
