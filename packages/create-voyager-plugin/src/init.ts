/**
 * `init [dir] --site <site>`: a plugin folder that already passes `check`:
 * plugin.json, style.css and an AGENTS.md with the contract for that site.
 * It writes no other JSON file, because Import files takes exactly one.
 */
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';

import { renderScaffoldAgents } from '../../../src/features/plugins/local/authoring/authoringDocs';
import { formatJson } from '../../../src/features/plugins/local/authoring/jsonText';
import { buildMinimalExample } from '../../../src/features/plugins/local/authoring/pluginExamples';
import type { SiteAdapter } from '../../../src/features/plugins/types';
import { MANIFEST_FILE } from './check';

export const SCHEMA_URL = 'https://voyager.nagi.fun/plugin.schema.json';
const STYLE_FILE = 'style.css';
const AGENTS_FILE = 'AGENTS.md';

/** `My Plugin!` -> `my-plugin`; empty when nothing usable is left. */
function slug(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
}

export interface InitResult {
  readonly dir: string;
  readonly written: readonly string[];
}

export function initPluginDir(
  dir: string,
  site: SiteAdapter,
  options: { force: boolean },
): InitResult {
  const target = resolve(dir);
  const files = [MANIFEST_FILE, STYLE_FILE, AGENTS_FILE];
  const existing = files.filter((name) => existsSync(join(target, name)));
  if (existing.length > 0 && !options.force) {
    throw new Error(`${dir} already has ${existing.join(', ')} (use --force to overwrite)`);
  }
  const name = slug(basename(target)) || 'my-plugin';
  const example = buildMinimalExample(site, 'file');
  const manifest = {
    $schema: SCHEMA_URL,
    ...example.manifest,
    id: `me.${name}`,
    name: basename(target),
  };
  mkdirSync(target, { recursive: true });
  writeFileSync(join(target, MANIFEST_FILE), `${formatJson(manifest)}\n`);
  writeFileSync(join(target, STYLE_FILE), example.css ?? '');
  writeFileSync(join(target, AGENTS_FILE), renderScaffoldAgents(site));
  return { dir: target, written: files };
}
