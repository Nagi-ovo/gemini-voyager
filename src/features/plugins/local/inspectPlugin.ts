/**
 * What a validated plugin will do, in the terms the popup's inspect view shows
 * before the user enables it: the sites it matches, how much CSS it injects,
 * every DOM operation, the first-party primitives it invokes (with their
 * params) and the settings it declares. Pure; shared by the UI and tests.
 */
import { patternWithinAny } from '../sites/matchPattern';
import { DEFAULT_ADAPTERS } from '../sites/registry';
import type { DomOperation, PluginManifest, SelectorRef, SiteAdapter } from '../types';

export interface PluginInspectionSite {
  readonly pattern: string;
  /** Label of the supported site the pattern falls in, when there is one. */
  readonly site: string | null;
}

export interface PluginInspectionPrimitive {
  readonly handler: string;
  /** Params as compact JSON (`{}` when none). */
  readonly params: string;
}

export interface PluginInspectionSetting {
  readonly key: string;
  readonly type: string;
  readonly label: string;
  readonly defaultValue: string;
}

export interface PluginInspection {
  readonly id: string;
  readonly name: string;
  readonly version: string;
  readonly author: string;
  readonly sites: readonly PluginInspectionSite[];
  readonly styleSheets: number;
  /** Total characters across every stylesheet. */
  readonly cssChars: number;
  /** Every stylesheet's source, in order: CSS can do anything, so it is shown as is. */
  readonly css: readonly string[];
  /** One readable line per non-native DOM operation. */
  readonly domOps: readonly string[];
  readonly primitives: readonly PluginInspectionPrimitive[];
  readonly settings: readonly PluginInspectionSetting[];
  readonly themeBrand?: string;
}

const MAX_LINE = 160;

function clip(text: string): string {
  return text.length > MAX_LINE ? `${text.slice(0, MAX_LINE - 1)}…` : text;
}

function describeTarget(target: SelectorRef): string {
  return target.kind === 'semantic' ? `semantic:${target.key}` : target.selector;
}

/** Inline style values stay whole: a long declaration must not push a hiding one out of view. */
function describeOp(op: Exclude<DomOperation, { op: 'native' }>): string {
  const target = describeTarget(op.target);
  switch (op.op) {
    case 'addClass':
      return clip(`addClass ${op.className} → ${target}`);
    case 'setAttribute':
      return op.name === 'style'
        ? `setAttribute style="${op.value}" → ${clip(target)}`
        : clip(`setAttribute ${op.name}="${op.value}" → ${target}`);
    case 'setStyle':
      return `setStyle ${Object.entries(op.styles)
        .map(([prop, value]) => `${prop}: ${value}`)
        .join('; ')} → ${clip(target)}`;
    case 'hide':
      return clip(`hide → ${target}`);
  }
}

export function inspectPlugin(
  manifest: PluginManifest,
  sites: readonly SiteAdapter[] = DEFAULT_ADAPTERS,
): PluginInspection {
  const styles = manifest.contributes.styles ?? [];
  const domOps: string[] = [];
  const primitives: PluginInspectionPrimitive[] = [];
  for (const op of manifest.contributes.domOps ?? []) {
    if (op.op === 'native') {
      primitives.push({ handler: op.handler, params: clip(JSON.stringify(op.params)) });
    } else {
      domOps.push(describeOp(op));
    }
  }
  return {
    id: manifest.id,
    name: manifest.name,
    version: manifest.version,
    author: manifest.author,
    sites: manifest.matches.map((pattern) => ({
      pattern,
      site: sites.find((site) => patternWithinAny(pattern, site.matches))?.label ?? null,
    })),
    styleSheets: styles.length,
    cssChars: styles.reduce((sum, style) => sum + style.css.length, 0),
    css: styles.map((style) => style.css),
    domOps,
    primitives,
    settings: Object.entries(manifest.contributes.settings ?? {}).map(([key, field]) => ({
      key,
      type: field.type,
      label: field.label,
      defaultValue: String(field.default),
    })),
    ...(manifest.theme ? { themeBrand: manifest.theme.brand } : {}),
  };
}
