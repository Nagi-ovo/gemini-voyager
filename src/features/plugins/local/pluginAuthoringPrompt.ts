import { ALLOWED_ATTRIBUTE_NAMES, ALLOWED_ATTRIBUTE_PREFIXES } from '../manifest/sinkGuards';
/**
 * The self-contained prompt for "describe a change in one sentence": the user
 * copies it into any AI they choose, and pastes the reply back into the popup
 * (`pluginReply.ts`). Voyager itself never sends, opens or reads anything.
 *
 * The contract is generated from the gate, not copied from it: the op list is
 * `OP_KINDS` (minus `native`), the attribute allowlist and the required fields
 * come from the validator, the anchors are the site adapter's semantic keys,
 * and the embedded example is built per site and asserted to pass
 * `validateLocalManifest` in tests. A new op kind fails to compile here until it
 * gets a template, so the prompt cannot silently drift from what imports.
 *
 * The text is machine-facing and stays in English; it asks for `name` and
 * `description` in the language of the user's request.
 */
import { OP_KINDS, REQUIRED_STRINGS } from '../manifest/validate';
import { SiteRegistry, DEFAULT_ADAPTERS } from '../sites/registry';
import {
  SEMANTIC_KEY_DESCRIPTIONS,
  SEMANTIC_SELECTOR_KEYS,
  type SemanticSelectorKey,
} from '../sites/semanticKeys';
import type { SiteAdapter } from '../types';
import { LOCAL_PLUGIN_ID_PREFIX } from './localPluginId';

/** Ceiling on the one-sentence request. */
export const MAX_PLUGIN_REQUEST_CHARS = 1000;

/** The `domOps[].op` kinds the prompt offers: every validator op except `native`. */
export type AuthoringOpKind = Exclude<(typeof OP_KINDS)[number], 'native'>;
export const AUTHORING_OP_KINDS: readonly AuthoringOpKind[] = OP_KINDS.filter(
  (op): op is AuthoringOpKind => op !== 'native',
);

type SemanticTarget = { readonly kind: 'semantic'; readonly key: SemanticSelectorKey };

/** One filled example of each offered op; the record type forces a template per kind. */
export const AUTHORING_OP_TEMPLATES: Readonly<
  Record<AuthoringOpKind, (target: SemanticTarget) => Record<string, unknown>>
> = {
  addClass: (target) => ({ op: 'addClass', target, className: 'gv-plugin-my-change' }),
  setAttribute: (target) => ({
    op: 'setAttribute',
    target,
    name: 'data-gv-plugin',
    value: 'my-change',
  }),
  setStyle: (target) => ({ op: 'setStyle', target, styles: { 'max-width': '960px' } }),
  hide: (target) => ({ op: 'hide', target }),
};

/** Sites a plugin may target: every plugin platform and native surface this build knows. */
export function authoringSites(): readonly SiteAdapter[] {
  return DEFAULT_ADAPTERS;
}

/** The supported site of a page URL, or null. */
export function authoringSiteForUrl(url: string | undefined): SiteAdapter | null {
  if (!url) return null;
  return SiteRegistry.createDefault().resolveByUrl(url);
}

/** Semantic keys the site defines, in vocabulary order. */
export function siteAnchors(site: SiteAdapter): readonly SemanticSelectorKey[] {
  return SEMANTIC_SELECTOR_KEYS.filter((key) => typeof site.selectors[key] === 'string');
}

function exampleTarget(site: SiteAdapter): SemanticTarget | string {
  const key = siteAnchors(site)[0];
  return key ? { kind: 'semantic', key } : 'main';
}

/** A minimal manifest for `site` that the local gate accepts. */
export function buildPluginExample(site: SiteAdapter): Record<string, unknown> {
  return {
    id: 'me.rounded-turns',
    name: 'Rounded turns',
    version: '1.0.0',
    description: 'Round the corners of each message',
    author: 'me',
    category: 'readability',
    license: 'MIT',
    engine: '>=1.0.0',
    tier: 'declarative',
    matches: [...site.matches],
    contributes: {
      styles: [
        {
          css:
            '.gv-plugin-rounded-turn{border-radius:16px}' +
            "html[data-gv-scheme='dark'] .gv-plugin-rounded-turn{outline:1px solid #ffffff22}",
        },
      ],
      domOps: [
        { op: 'addClass', target: exampleTarget(site), className: 'gv-plugin-rounded-turn' },
      ],
    },
  };
}

const SELECTOR_PREVIEW_CHARS = 240;

function anchorLines(site: SiteAdapter): string[] {
  const anchors = siteAnchors(site);
  if (anchors.length === 0) return ['- (none: use a CSS selector string as the target)'];
  return anchors.map((key) => {
    const selector = site.selectors[key] ?? '';
    const shown =
      selector.length > SELECTOR_PREVIEW_CHARS
        ? `${selector.slice(0, SELECTOR_PREVIEW_CHARS - 1)}…`
        : selector;
    return `- ${key}: ${SEMANTIC_KEY_DESCRIPTIONS[key]} (today it matches \`${shown}\`)`;
  });
}

function opLines(site: SiteAdapter): string[] {
  const key = siteAnchors(site)[0] ?? 'userTurn';
  const target: SemanticTarget = { kind: 'semantic', key };
  return AUTHORING_OP_KINDS.map(
    (kind) => `  - ${kind}: ${JSON.stringify(AUTHORING_OP_TEMPLATES[kind](target))}`,
  );
}

/** The full prompt for one request and target site. */
export function buildPluginAuthoringPrompt(request: string, site: SiteAdapter): string {
  const attributes = [
    ...ALLOWED_ATTRIBUTE_NAMES,
    ...ALLOWED_ATTRIBUTE_PREFIXES.map((prefix) => `${prefix}*`),
  ].join(', ');
  const example = JSON.stringify(buildPluginExample(site), null, 2);
  return [
    'Write a Voyager local plugin for the request below. Voyager is a browser extension that',
    'applies a declarative JSON manifest (CSS plus reversible page changes) to a web page. It runs',
    'the manifest through a strict validator, so follow this contract exactly.',
    '',
    'The request, verbatim between the markers:',
    '----- BEGIN REQUEST -----',
    request.trim(),
    '----- END REQUEST -----',
    '',
    `## Target site: ${site.label}`,
    '"matches" must use these URL patterns (all of them, or a subset):',
    ...site.matches.map((pattern) => `- ${pattern}`),
    '',
    '## Manifest contract',
    `- Required non-empty string fields: ${REQUIRED_STRINGS.join(', ')}. Also "tier": "declarative",`,
    '  "matches" (above) and "contributes".',
    '- "id": a short lowercase reverse-dotted slug such as "me.short-name" (a-z, 0-9, ".", "_",',
    `  "-"). Voyager stores it as "${LOCAL_PLUGIN_ID_PREFIX}<id>".`,
    '- "version": "1.0.0". "engine": ">=1.0.0". "author": "me". "license": "MIT".',
    '- Write "name" and "description" in the language of the request.',
    '- "contributes.styles": a list of { "css": "..." } with the CSS inlined as a string. No',
    '  @import, image-set(), image(), cross-fade() or src(), and url() only with a #fragment or a',
    '  png, jpeg, gif, webp or avif data: URI (never SVG): CSS may not load anything, not even from',
    '  the same site.',
    `- "contributes.domOps": reversible page changes. Allowed "op" values: ${AUTHORING_OP_KINDS.join(', ')}.`,
    '  One example of each:',
    ...opLines(site),
    '- "target": prefer { "kind": "semantic", "key": <anchor> } with an anchor listed below. Use a',
    '  plain CSS selector string only for something no anchor names; it breaks on a redesign.',
    `- setAttribute "name" must be one of: ${attributes}. Never href, src, on*, class or id.`,
    '- Every class you add or style starts with "gv-plugin-". Add it with addClass on an anchor,',
    '  then style that class in "contributes.styles".',
    "- Light or dark only rules: scope them with html[data-gv-scheme='dark'] or",
    "  html[data-gv-scheme='light'], never with the site's own theme classes.",
    '- Do not add "theme", "settings", "requires", any "native" op, links or JavaScript.',
    '',
    `## Stable anchors on ${site.label}`,
    ...anchorLines(site),
    '',
    '## A valid example (adapt it; do not copy its purpose)',
    '```json',
    example,
    '```',
    '',
    '## Reply format',
    'Reply with exactly one ```json fenced code block that holds the complete manifest. Put no',
    'other code block in the reply.',
    '',
  ].join('\n');
}
