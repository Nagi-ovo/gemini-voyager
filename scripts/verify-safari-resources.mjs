import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const distDir = path.join(rootDir, 'dist_safari');
const projectPath = path.join(
  rootDir,
  'Voyager',
  'Voyager.xcodeproj',
  'project.pbxproj',
);

if (!fs.existsSync(distDir)) {
  throw new Error('dist_safari does not exist; run the Safari web build first');
}

const project = fs.readFileSync(projectPath, 'utf8');
const topLevelEntries = fs
  .readdirSync(distDir)
  .filter((name) => !name.startsWith('.'))
  .sort();

const missingReferences = topLevelEntries.filter(
  (name) => !project.includes(`../../dist_safari/${name}`),
);
const missingBuildResources = topLevelEntries.filter(
  (name) => !project.includes(`/* ${name} in Resources */`),
);

if (missingReferences.length || missingBuildResources.length) {
  if (missingReferences.length) {
    console.error(`Missing Xcode file references: ${missingReferences.join(', ')}`);
  }
  if (missingBuildResources.length) {
    console.error(`Missing Xcode resource entries: ${missingBuildResources.join(', ')}`);
  }
  process.exit(1);
}

function listFiles(directory, prefix = '') {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    if (entry.name.startsWith('.')) return [];
    const relativePath = path.join(prefix, entry.name);
    return entry.isDirectory()
      ? listFiles(path.join(directory, entry.name), relativePath)
      : [relativePath];
  });
}

const bundleResourcesDir = process.argv[2];
if (bundleResourcesDir) {
  const missingBundleFiles = listFiles(distDir).filter(
    (relativePath) => !fs.existsSync(path.join(bundleResourcesDir, relativePath)),
  );
  if (missingBundleFiles.length) {
    console.error(`Missing Safari extension bundle files:\n${missingBundleFiles.join('\n')}`);
    process.exit(1);
  }
}

console.log(
  bundleResourcesDir
    ? 'Safari Xcode resources and extension bundle are complete.'
    : 'Safari Xcode resource wiring is complete.',
);
