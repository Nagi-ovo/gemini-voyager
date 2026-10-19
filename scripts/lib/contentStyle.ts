import { readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';

/**
 * The shipped `contentStyle.css` is assembled from ordered parts so each source
 * file stays small enough to edit. Parts are concatenated in file-name order
 * (their numeric prefix sets the cascade order), one blank line between them.
 */
export const CONTENT_STYLE_FILE_NAME = 'contentStyle.css';
export const CONTENT_STYLE_PARTS_DIR = 'src/styles/contentStyle';

/** Absolute paths of the parts, in cascade order. */
export function listContentStyleParts(repoRoot: string): string[] {
  const dir = resolve(repoRoot, CONTENT_STYLE_PARTS_DIR);
  return readdirSync(dir)
    .filter((name) => name.endsWith('.css'))
    .sort()
    .map((name) => join(dir, name));
}

/** The full stylesheet exactly as the extension ships it. */
export function assembleContentStyle(repoRoot: string): string {
  return listContentStyleParts(repoRoot)
    .map((path) => readFileSync(path, 'utf8'))
    .join('\n');
}
