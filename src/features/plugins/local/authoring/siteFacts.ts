/**
 * What an author needs to know about one target site, read from its adapter:
 * the URL patterns `matches` may use, the semantic anchors it declares with
 * today's selectors, and what a local plugin may and may not bring there.
 */
import { patternWithinAny } from '../../sites/matchPattern';
import { NATIVE_SURFACE_MATCHES } from '../../sites/nativeSurfaces';
import {
  SEMANTIC_KEY_DESCRIPTIONS,
  SEMANTIC_SELECTOR_KEYS,
  type SemanticSelectorKey,
} from '../../sites/semanticKeys';
import type { SiteAdapter } from '../../types';

const SELECTOR_PREVIEW_CHARS = 240;

/**
 * Caveats no adapter field carries. Keyed by site id; a site without notes
 * needs none.
 */
const SITE_NOTES: Readonly<Record<string, readonly string[]>> = {
  gemini: [
    'The `sidebar` anchor also matches Voyager’s own folder panel (`.gv-folder-container`). To change only Gemini’s navigation rail, target `bard-sidenav` with a CSS selector.',
    'Gemini already runs Voyager’s timeline, formula copy and Vim natively, so primitives are not available here.',
  ],
  aistudio: [
    'The `sidebar` anchor is Voyager’s own folder panel on AI Studio, not AI Studio’s navigation. Use a CSS selector for AI Studio’s own panels.',
    'Voyager’s AI Studio switch governs plugins too: while Voyager is off on AI Studio, nothing mounts.',
  ],
};

/** Semantic keys the site declares, in vocabulary order. */
export function siteAnchors(site: SiteAdapter): readonly SemanticSelectorKey[] {
  return SEMANTIC_SELECTOR_KEYS.filter((key) => typeof site.selectors[key] === 'string');
}

/** Gemini and AI Studio: no `theme` and no `native` op there. */
export function isNativeSurfaceSite(site: SiteAdapter): boolean {
  return site.matches.some((pattern) => patternWithinAny(pattern, NATIVE_SURFACE_MATCHES));
}

function clip(selector: string): string {
  return selector.length > SELECTOR_PREVIEW_CHARS
    ? `${selector.slice(0, SELECTOR_PREVIEW_CHARS - 1)}…`
    : selector;
}

/** One bullet per declared anchor: what it names and the selector behind it today. */
export function anchorLines(site: SiteAdapter): string[] {
  const anchors = siteAnchors(site);
  if (anchors.length === 0) return ['- (none: use a CSS selector string as the target)'];
  return anchors.map(
    (key) =>
      `- ${key}: ${SEMANTIC_KEY_DESCRIPTIONS[key]} (today it matches \`${clip(site.selectors[key] ?? '')}\`)`,
  );
}

/** The facts section body for one site. */
export function siteFactLines(site: SiteAdapter, options: { primitives: boolean }): string[] {
  const missing = SEMANTIC_SELECTOR_KEYS.filter((key) => typeof site.selectors[key] !== 'string');
  const native = isNativeSurfaceSite(site);
  const notes = SITE_NOTES[site.id] ?? [];
  return [
    '"matches" must use these URL patterns (all of them, or a subset):',
    ...site.matches.map((pattern) => `- ${pattern}`),
    '',
    `Semantic anchors ${site.label} declares (use them as { "kind": "semantic", "key": … }):`,
    ...anchorLines(site),
    ...(missing.length > 0
      ? [
          '',
          `${site.label} does not declare ${missing.join(', ')}: a plugin that relies on one of these is refused. Use a CSS selector instead.`,
        ]
      : []),
    ...(native
      ? ['', `No "theme" and no "native" op on ${site.label}: CSS and the four page changes only.`]
      : options.primitives
        ? [
            '',
            `Primitives (native ops) and an optional "theme" accent are allowed on ${site.label}.`,
          ]
        : []),
    ...(notes.length > 0 ? ['', ...notes.map((note) => `- ${note}`)] : []),
  ];
}
