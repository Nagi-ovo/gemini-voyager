import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import manifestChrome from '../../../../manifest.json';

/**
 * Firefox silently drops unsupported CSS rules or custom properties, so features
 * newer than the declared floor must stay inside an `@supports` guard.
 *
 * Scope is the CSS reaching Firefox through the STATIC content scripts. Plugin
 * catalog stylesheets are excluded on purpose: they only load on sites
 * registered through optional host permissions, which Firefox honors from 128,
 * so they can never render below this floor.
 */
const STATIC_CONTENT_STYLESHEETS = [
  'public/contentStyle.css',
  'src/core/ui/tokens.css',
  'src/core/ui/confirm.css',
  'src/core/ui/toast/toast.css',
  'src/features/timeline/timeline.css',
  'src/features/timeline/timelinePreview.css',
  'src/pages/content/defaultModel/styles.css',
  'src/pages/content/folder/floatingPanel.css',
  'src/pages/content/folder/folderHeader/folderHeader.css',
  'src/pages/content/folder/folderHeader/folderHeaderMenu.css',
] as const;

/**
 * Features used by the stylesheets above and the Firefox that added each.
 * Patterns run against the whole file, not line by line: the formatter wraps
 * long values, and `oklch(\n  from ...)` is the reason this check exists.
 */
const FIREFOX_CSS_SUPPORT: ReadonlyArray<{
  feature: string;
  since: number;
  matches: RegExp;
}> = [
  {
    feature: 'relative color syntax',
    since: 128,
    matches: /\b(?:rgb|hsl|hwb|lab|lch|oklab|oklch|color)\(\s*from\s/i,
  },
  { feature: ':has()', since: 121, matches: /:has\(/ },
  { feature: 'native nesting', since: 117, matches: /^\s*&/m },
  { feature: 'color-mix()', since: 113, matches: /\bcolor-mix\(/i },
  { feature: 'oklch()', since: 113, matches: /\boklch\(/i },
];

const repoRoot = resolve(__dirname, '../../../..');

const manifestFloor = Number.parseInt(
  String(
    (manifestChrome as { browser_specific_settings?: { gecko?: { strict_min_version?: string } } })
      .browser_specific_settings?.gecko?.strict_min_version,
  ),
  10,
);

/** Comments never reach the parser, and they name the very features guarded below. */
function stripComments(css: string): string {
  return css.replace(/\/\*[\s\S]*?\*\//g, ' ');
}

/**
 * Drop every `@supports` block, prelude included, so what remains is the CSS
 * Firefox at the floor has to parse unconditionally.
 */
function stripSupportsBlocks(css: string): string {
  let out = '';
  let index = 0;

  for (;;) {
    const at = css.indexOf('@supports', index);
    if (at === -1) return out + css.slice(index);

    const open = css.indexOf('{', at);
    if (open === -1) return out + css.slice(index);

    let depth = 1;
    let cursor = open + 1;
    while (cursor < css.length && depth > 0) {
      if (css[cursor] === '{') depth++;
      else if (css[cursor] === '}') depth--;
      cursor++;
    }

    out += css.slice(index, at);
    index = cursor;
  }
}

describe('Firefox CSS compatibility floor', () => {
  it.each(STATIC_CONTENT_STYLESHEETS)(
    'guards every CSS feature in %s that is newer than the declared floor',
    (stylesheet) => {
      const unguarded = stripSupportsBlocks(
        stripComments(readFileSync(resolve(repoRoot, stylesheet), 'utf8')),
      );

      const tooNew = FIREFOX_CSS_SUPPORT.filter(
        ({ matches, since }) => matches.test(unguarded) && since > manifestFloor,
      ).map(({ feature, since }) => `${feature} needs Firefox ${since}`);

      expect(
        tooNew,
        `${stylesheet} uses CSS that Firefox ${manifestFloor} cannot resolve, outside any ` +
          '@supports guard. Either wrap the rule in @supports, or raise strict_min_version in ' +
          'manifest.json and vite.config.firefox.ts.',
      ).toEqual([]);
    },
  );

  it('declares the same floor in the base manifest and the Firefox build config', () => {
    // Read the config as source instead of importing it: the static contract is
    // the literal in the file, and importing it pulls in esbuild, which cannot
    // run under jsdom's realm.
    const config = readFileSync(resolve(repoRoot, 'vite.config.firefox.ts'), 'utf8');
    const declared = /strict_min_version:\s*'(\d+)/.exec(config);

    expect(declared).not.toBeNull();
    expect(Number.parseInt(declared![1], 10)).toBe(manifestFloor);
  });
});
