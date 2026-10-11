/**
 * `buildPluginContract(site, options)`: everything an author (an AI in a chat
 * tab, or a coding agent) needs to write a local plugin for one site, as text
 * sections plus worked examples. The popup prompt, the scaffold's AGENTS.md
 * and the public SKILL.md are all rendered from it, and the examples are
 * tested against the import gate, so the four never disagree.
 */

import type { SiteAdapter } from '../../types';
import { EFFECTIVE_PLUGIN_ENGINE_VERSION } from '../../verbs/contracts';
import {
  type ContractAudience,
  type ContractSection,
  impossibleSection,
  localRulesSection,
  manifestSection,
  pageChangesSection,
  primitivesSection,
  selectorsSection,
  settingsSection,
  stylesSection,
} from './contractRules';
import { formatJson } from './jsonText';
import { type PluginExample, buildPluginExamples } from './pluginExamples';
import { isNativeSurfaceSite, siteAnchors, siteFactLines } from './siteFacts';

export interface PluginContractOptions {
  readonly audience: ContractAudience;
}

export interface PluginContract {
  readonly site: SiteAdapter;
  readonly engineVersion: string;
  readonly sections: readonly ContractSection[];
  readonly examples: readonly PluginExample[];
}

/** Whether a reader of this audience may use primitives on `site`. */
export function offersPrimitives(site: SiteAdapter, audience: ContractAudience): boolean {
  return audience === 'agent' && !isNativeSurfaceSite(site);
}

export function siteSection(site: SiteAdapter, audience: ContractAudience): ContractSection {
  return {
    title: `Target site: ${site.label}`,
    lines: siteFactLines(site, { primitives: offersPrimitives(site, audience) }),
  };
}

export function buildPluginContract(
  site: SiteAdapter,
  options: PluginContractOptions,
): PluginContract {
  const { audience } = options;
  const primitives = offersPrimitives(site, audience);
  const templateKey = siteAnchors(site)[0] ?? 'userTurn';
  return {
    site,
    engineVersion: EFFECTIVE_PLUGIN_ENGINE_VERSION,
    sections: [
      siteSection(site, audience),
      manifestSection(audience),
      stylesSection(audience),
      pageChangesSection(audience, templateKey),
      settingsSection(),
      localRulesSection(audience),
      ...(primitives ? [primitivesSection()] : []),
      ...(audience === 'agent' ? [selectorsSection()] : []),
      impossibleSection(audience, { primitives }),
    ],
    examples: buildPluginExamples(site, {
      styles: audience === 'agent' ? 'file' : 'inline',
      primitives,
    }),
  };
}

/** `## title` and its lines, sections separated by a blank line. */
export function renderSections(sections: readonly ContractSection[], level = 2): string[] {
  const hashes = '#'.repeat(level);
  return sections.flatMap((section) => [`${hashes} ${section.title}`, '', ...section.lines, '']);
}

/** An example as fenced blocks: plugin.json, then style.css when it has one. */
export function renderExample(example: PluginExample, level = 3): string[] {
  return [
    `${'#'.repeat(level)} ${example.title}`,
    '',
    ...(example.css !== undefined ? ['plugin.json:', ''] : []),
    '```json',
    formatJson(example.manifest),
    '```',
    '',
    ...(example.css !== undefined
      ? ['style.css:', '', '```css', example.css.trimEnd(), '```', '']
      : []),
  ];
}
