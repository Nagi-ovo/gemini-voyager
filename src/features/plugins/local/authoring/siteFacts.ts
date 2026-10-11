/**
 * What an author needs to know about one target site, read from its adapter:
 * the URL patterns `matches` may use, the semantic anchors it declares with
 * today's selectors, and what a local plugin may and may not bring there.
 */
import { allowedPrimitivesForSite, allowsPluginThemeForSite } from '../../sites/hostPolicy';
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
    'Voyager’s own features (timeline, formula copy, Vim input) already run on Gemini, so a plugin cannot call primitives here.',
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

/** Gemini and AI Studio keep Voyager’s own accent: a plugin brings no `theme` there. */
export function forbidsTheme(site: SiteAdapter): boolean {
  return !allowsPluginThemeForSite(site);
}

/** Whether a plugin on `site` may call any primitive at all (a `native` op). */
export function allowsAnyPrimitive(site: SiteAdapter): boolean {
  const allowed = allowedPrimitivesForSite(site);
  return allowed === 'all' || allowed.size > 0;
}

/** Whether a plugin on `site` may call the `handler` primitive. */
export function allowsPrimitive(site: SiteAdapter, handler: string): boolean {
  const allowed = allowedPrimitivesForSite(site);
  return allowed === 'all' || allowed.has(handler);
}

/** A site with no restriction from the packaged host policy: any primitive, and a theme. */
export function isUnrestrictedSite(site: SiteAdapter): boolean {
  return !forbidsTheme(site) && allowedPrimitivesForSite(site) === 'all';
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
export function siteFactLines(
  site: SiteAdapter,
  options: { primitives: boolean; theme: boolean },
): string[] {
  const missing = SEMANTIC_SELECTOR_KEYS.filter((key) => typeof site.selectors[key] !== 'string');
  const restricted = forbidsTheme(site) && !allowsAnyPrimitive(site);
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
    ...(restricted
      ? ['', `No "theme" and no "native" op on ${site.label}: CSS and the four page changes only.`]
      : options.primitives
        ? [
            '',
            options.theme
              ? `Primitives (native ops) and an optional "theme" accent are allowed on ${site.label}.`
              : `Primitives (native ops) are allowed on ${site.label}.`,
          ]
        : []),
    ...(notes.length > 0 ? ['', ...notes.map((note) => `- ${note}`)] : []),
  ];
}
