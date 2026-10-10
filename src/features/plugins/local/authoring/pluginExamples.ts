/**
 * Worked examples and op templates the authoring material embeds. Each is
 * built per site from its adapter, and tests run every one through
 * `validateLocalManifest` for every site, so an example can never teach
 * something the import refuses. A new op kind fails to compile here until it
 * gets a template.
 */
import { OP_KINDS } from '../../manifest/validate';
import type { SemanticSelectorKey } from '../../sites/semanticKeys';
import type { SiteAdapter } from '../../types';
import { isNativeSurfaceSite, siteAnchors } from './siteFacts';

/** The `domOps[].op` kinds every site accepts: every validator op except `native`. */
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

/** How an example carries its CSS: inlined (Paste JSON, AI reply) or in `style.css`. */
export type ExampleStyles = 'inline' | 'file';

export interface PluginExample {
  readonly title: string;
  readonly manifest: Record<string, unknown>;
  /** `style.css` beside `plugin.json`, when the manifest references it. */
  readonly css?: string;
}

/** The first semantic anchor the site declares, as an op target. */
export function exampleTarget(site: SiteAdapter): SemanticTarget | string {
  const key = siteAnchors(site)[0];
  return key ? { kind: 'semantic', key } : 'main';
}

function manifestShell(
  site: SiteAdapter,
  fields: { id: string; name: string; description: string; engine?: string },
): Record<string, unknown> {
  return {
    id: fields.id,
    name: fields.name,
    version: '1.0.0',
    description: fields.description,
    author: 'me',
    category: 'readability',
    license: 'MIT',
    engine: fields.engine ?? '>=1.0.0',
    tier: 'declarative',
    matches: [...site.matches],
  };
}

function withStyles(
  title: string,
  manifest: Record<string, unknown>,
  contributes: Record<string, unknown>,
  css: string,
  styles: ExampleStyles,
): PluginExample {
  const style = styles === 'file' ? { file: 'style.css' } : { css };
  return {
    title,
    manifest: { ...manifest, contributes: { styles: [style], ...contributes } },
    ...(styles === 'file' ? { css } : {}),
  };
}

const ROUNDED_CSS =
  '.gv-plugin-rounded-turn{border-radius:16px}' +
  "html[data-gv-scheme='dark'] .gv-plugin-rounded-turn{outline:1px solid #ffffff22}";

/** A minimal manifest for `site` that the local gate accepts (CSS inlined). */
export function buildPluginExample(site: SiteAdapter): Record<string, unknown> {
  return buildMinimalExample(site, 'inline').manifest;
}

/** CSS on a class added to a semantic anchor: the shape most plugins take. */
export function buildMinimalExample(site: SiteAdapter, styles: ExampleStyles): PluginExample {
  const shell = manifestShell(site, {
    id: 'me.rounded-turns',
    name: 'Rounded turns',
    description: 'Round the corners of each message',
  });
  const domOps = [
    { op: 'addClass', target: exampleTarget(site), className: 'gv-plugin-rounded-turn' },
  ];
  return withStyles('A class on an anchor, styled by CSS', shell, { domOps }, ROUNDED_CSS, styles);
}

/** A number setting reaching the CSS through a custom property and a `{{token}}`. */
export function buildSettingsExample(site: SiteAdapter, styles: ExampleStyles): PluginExample {
  const target = exampleTarget(site);
  const shell = manifestShell(site, {
    id: 'me.turn-accent',
    name: 'Turn accent',
    description: 'A left border on each message, with an adjustable width',
  });
  const contributes = {
    settings: {
      width: {
        type: 'number',
        label: 'Border width (px)',
        default: 3,
        min: 1,
        max: 8,
        minLabel: 'Thin',
        maxLabel: 'Bold',
      },
    },
    domOps: [
      { op: 'addClass', target, className: 'gv-plugin-turn-accent' },
      { op: 'setStyle', target, styles: { '--gv-plugin-turn-accent-w': '{{width}}px' } },
    ],
  };
  const css =
    '.gv-plugin-turn-accent{border-left:var(--gv-plugin-turn-accent-w,3px) solid #8888}' +
    "html[data-gv-scheme='dark'] .gv-plugin-turn-accent{border-left-color:#fff6}";
  return withStyles('A setting the user adjusts in the popup', shell, contributes, css, styles);
}

/** A primitive invoked by name, on a site that allows one; null on Gemini and AI Studio. */
export function buildPrimitiveExample(site: SiteAdapter): PluginExample | null {
  if (isNativeSurfaceSite(site)) return null;
  return {
    title: 'A Voyager primitive (formula copy)',
    manifest: {
      ...manifestShell(site, {
        id: 'me.formula-copy',
        name: 'Formula copy',
        description: 'Click a formula to copy its LaTeX',
        engine: '>=1.3.0',
      }),
      contributes: { domOps: [{ op: 'native', handler: 'formulaCopy', params: {} }] },
    },
  };
}

/** Every example for `site` in the given style form. */
export function buildPluginExamples(
  site: SiteAdapter,
  options: { styles: ExampleStyles; primitives: boolean },
): readonly PluginExample[] {
  const primitive = options.primitives ? buildPrimitiveExample(site) : null;
  return [
    buildMinimalExample(site, options.styles),
    buildSettingsExample(site, options.styles),
    ...(primitive ? [primitive] : []),
  ];
}
