/**
 * `skill --out <dir>`: the write-voyager-plugin skill as the folder the docs
 * site serves, SKILL.md plus the site and primitive files it links. It only
 * writes; a file the skill no longer has is left for the repository's
 * staleness test to name, so `--out` never deletes anything in a folder the
 * caller chose.
 */
import { mkdirSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join, sep } from 'node:path';

import { renderWriteVoyagerPluginSkillFiles } from '../../../src/features/plugins/local/authoring/authoringDocs';
import type { SiteAdapter } from '../../../src/features/plugins/types';

/** Every Markdown file under `dir`, as sorted paths relative to it with `/` separators. */
export function listSkillMarkdown(dir: string): string[] {
  return readdirSync(dir, { recursive: true, encoding: 'utf8' })
    .filter((path) => path.endsWith('.md'))
    .map((path) => path.split(sep).join('/'))
    .sort();
}

export function writeSkillDir(dir: string, sites: readonly SiteAdapter[]): void {
  for (const [path, text] of renderWriteVoyagerPluginSkillFiles(sites)) {
    mkdirSync(dirname(join(dir, path)), { recursive: true });
    writeFileSync(join(dir, path), text);
  }
}
