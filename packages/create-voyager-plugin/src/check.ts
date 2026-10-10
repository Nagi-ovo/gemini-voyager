/**
 * `check [dir]`: read a plugin folder the way the popup's Import files reads
 * picked files, then run the popup's local-plugin gate. Only `plugin.json` and
 * the `*.css` files beside it are read, by bare file name, so another JSON
 * file in the folder (a package.json, a tsconfig) never changes the result.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

import { readLocalPluginFiles } from '../../../src/features/plugins/local/localPluginFiles';
import { validateLocalManifest } from '../../../src/features/plugins/local/validateLocalManifest';
import type { ManifestIssue } from '../../../src/features/plugins/manifest/validate';

export const MANIFEST_FILE = 'plugin.json';

export interface CheckOutcome {
  readonly issues: readonly ManifestIssue[];
  /** Set when the plugin would import. */
  readonly accepted?: { readonly id: string; readonly version: string };
}

function isFile(path: string): boolean {
  try {
    return statSync(path).isFile();
  } catch {
    return false;
  }
}

export async function checkPluginDir(dir: string): Promise<CheckOutcome> {
  if (!isFile(join(dir, MANIFEST_FILE))) {
    return { issues: [{ path: 'file', message: `no ${MANIFEST_FILE} in ${dir}` }] };
  }
  const names = [
    MANIFEST_FILE,
    ...readdirSync(dir)
      .filter((name) => name.toLowerCase().endsWith('.css') && isFile(join(dir, name)))
      .sort(),
  ];
  const files = names.map((name) => ({ name, text: readFileSync(join(dir, name), 'utf8') }));
  const read = await readLocalPluginFiles(files);
  if (!read.success) return { issues: read.error };
  const result = validateLocalManifest(read.data);
  if (!result.success) return { issues: result.error };
  const { manifest } = result.data;
  return { issues: [], accepted: { id: manifest.id, version: manifest.version } };
}

/** One `path: message` line per issue, the way the popup lists them. */
export function formatIssue(issue: ManifestIssue): string {
  return issue.path ? `${issue.path}: ${issue.message}` : issue.message;
}
