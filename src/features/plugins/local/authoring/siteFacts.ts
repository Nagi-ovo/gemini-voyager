/**
 * What an author needs to know about one target site, read from its adapter:
 * the URL patterns `matches` may use, the semantic anchors it declares with
 * today's selectors, and what a local plugin may and may not bring there.
 */
import { handlerResources } from '../../runtime/resourceClaims';
import { FEATURE_OWNERS, type OwnedFeatureId } from '../../sites/featureOwners';
import {
  allowedPrimitivesForSite,
  allowsPluginThemeForSite,
  packagedSitesForPatterns,
} from '../../sites/hostPolicy';
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
  ],
  aistudio: [
    'The `sidebar` anchor is Voyager’s own folder panel on AI Studio, not AI Studio’s navigation. Use a CSS selector for AI Studio’s own panels.',
    'Voyager’s AI Studio switch governs plugins too: while Voyager is off on AI Studio, nothing mounts.',
  ],
};

/** The popup setting behind each feature a packaged official plugin runs. */
const OWNED_FEATURE_SETTINGS: Readonly<Record<OwnedFeatureId, string>> = {
  formulaCopy: 'Formula copy',
  vimInput: 'Input Vim mode',
  hideInputHalo: 'Hide input box halo',
  chatFontSize: 'Chat font size',
  chatLineHeight: 'Chat spacing',
  chatWidth: 'Chat width',
  userLatex: 'Render LaTeX in my messages',
  codeCollapse: 'Collapse long code blocks',
  waveDrom: 'WaveDrom timing diagram rendering',
  echarts: 'ECharts rendering',
  mermaid: 'Mermaid diagram rendering',
  promptHistory: 'Prompt history',
  inputCollapse: 'Input collapse',
  researchPack: 'Research Pack',
  defaultModel: 'Auto-apply default model on new chats',
};

/**
 * On a site where only some primitives are open, one line per open primitive
 * that also runs one of Voyager's own settings. A primitive with an exclusive
 * runtime (`runtime/resourceClaims.ts`) runs once per page: the setting goes
 * first on a fresh page or a free runtime, and a running one keeps it
 * (`runtime/resourceArbiter.ts`). The others claim element by element, so the
 * setting and a plugin run side by side.
 */
function sharedRuntimeLines(site: SiteAdapter, open: ReadonlySet<string>): string[] {
  const packaged = new Set<string>(packagedSitesForPatterns(site.matches));
  const settings = new Map<string, string>();
  for (const owned of FEATURE_OWNERS) {
    if (owned.owner !== 'plugin' || !packaged.has(owned.site)) continue;
    for (const handler of owned.handlers) {
      if (open.has(handler)) settings.set(handler, OWNED_FEATURE_SETTINGS[owned.feature]);
    }
  }
  return [...settings].map(([handler, setting]) =>
    handlerResources(handler).length > 0
      ? `- \`${handler}\` runs the same code as Voyager’s own ${setting} setting. Only one of them runs on a page. When the page loads, or while neither is running, the setting goes first: with it on, a plugin calling \`${handler}\` stays paused. Whichever is already running keeps running, and turning on the other leaves that one paused (the popup says why). Turn one off to hand the feature to the other.`
      : `- \`${handler}\` runs the same code as Voyager’s own ${setting} setting. Both can run on one page: each claims the elements it works on, and an element the other already holds is left to it.`,
  );
}

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
  const allowed = allowedPrimitivesForSite(site);
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
      : options.primitives && allowed !== 'all'
        ? [
            '',
            `${site.label} allows only these primitives (native ops): ${[...allowed].sort().join(', ')}.${forbidsTheme(site) ? ' No "theme".' : ''}`,
            ...sharedRuntimeLines(site, allowed),
          ]
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
