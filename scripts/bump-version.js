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
const xcodeProjectPath = path.resolve(__dirname, '../Voyager/Voyager.xcodeproj/project.pbxproj');

const args = process.argv.slice(2);
const explicitVersion = args.find((arg) => !arg.startsWith('--'));
const shouldFormat = !args.includes('--no-format');

// Helper to read JSON file
function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function updateJsonVersion(filePath, version) {
  const source = fs.readFileSync(filePath, 'utf8');
  const updated = source.replace(/("version"\s*:\s*")[^"]+("\s*)/, `$1${version}$2`);
  if (updated === source && readJson(filePath).version !== version) {
    throw new Error(`Version field not found in ${filePath}`);
  }
  fs.writeFileSync(filePath, updated);
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

    const newVersion = explicitVersion ?? bumpVersion(currentVersion);
    if (!/^\d+\.\d+\.\d+$/.test(newVersion)) {
      throw new Error(`Invalid version: ${newVersion}`);
    }
    console.log(`New version:     ${newVersion}`);

    // Update package.json
    updateJsonVersion(packageJsonPath, newVersion);
    console.log('Updated package.json');

    // Update manifest.json
    if (fs.existsSync(manifestJsonPath)) {
      updateJsonVersion(manifestJsonPath, newVersion);
      console.log('Updated manifest.json');
    } else {
      console.warn('manifest.json not found, skipping...');
    }

    // Update manifest.dev.json
    if (fs.existsSync(manifestDevJsonPath)) {
      updateJsonVersion(manifestDevJsonPath, newVersion);
      console.log('Updated manifest.dev.json');
    }

    const xcodeProject = fs.readFileSync(xcodeProjectPath, 'utf8');
    if (
      !xcodeProject.includes('MARKETING_VERSION =') ||
      !xcodeProject.includes('CURRENT_PROJECT_VERSION =')
    ) {
      throw new Error('Xcode version settings not found');
    }
    const updatedXcodeProject = xcodeProject.replace(
      /(MARKETING_VERSION|CURRENT_PROJECT_VERSION) = [^;]+;/g,
      `$1 = ${newVersion};`,
    );
    fs.writeFileSync(xcodeProjectPath, updatedXcodeProject);
    console.log('Updated Xcode app and extension versions');

    console.log('Version bump complete! 🚀');

    if (shouldFormat) {
      console.log('Running format...');
      execSync('bun run format', { stdio: 'inherit' });
      console.log('Format complete! ✨');
    }
  } catch (error) {
    console.error('Error bumping version:', error);
    process.exit(1);
  }
}

main();
