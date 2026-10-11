import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { unreleasedPluginEngineIssues } from './lib/pluginEngineRelease';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

try {
  const issues = unreleasedPluginEngineIssues(root);
  if (issues.length > 0) {
    console.error('Unreleased plugin engine declarations remain; run bun run bump before release:');
    for (const issue of issues) console.error(`  ${issue}`);
    process.exitCode = 1;
  } else {
    console.log('Plugin release engine declarations are stamped.');
  }
} catch (error) {
  console.error('Plugin release engine check failed:', error);
  process.exitCode = 1;
}
