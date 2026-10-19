import { relative, resolve } from 'node:path';

import { assembleContentStyle, listContentStyleParts } from '../../scripts/lib/contentStyle';

const repoRoot = resolve(__dirname, '../..');

/** The shipped `contentStyle.css`, assembled from its parts exactly as the build emits it. */
export function readContentStyle(): string {
  return assembleContentStyle(repoRoot);
}

/** Repo-relative paths of its parts, in cascade order, for checks that name the file to fix. */
export function contentStylePartPaths(): string[] {
  return listContentStyleParts(repoRoot).map((path) => relative(repoRoot, path));
}
