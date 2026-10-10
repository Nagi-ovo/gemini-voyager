import { describe, expect, it } from 'vitest';

import { PRIMITIVE_CONTRACTS } from '../../verbs/contracts';
import { readLocalPluginFiles } from '../localPluginFiles';
import { authoringSites } from '../pluginAuthoringPrompt';
import { validateLocalManifest } from '../validateLocalManifest';
import type { ContractAudience } from './contractRules';
import { formatJson } from './jsonText';
import { buildPluginContract, renderExample, renderSections } from './pluginContract';
import type { PluginExample } from './pluginExamples';
import { isNativeSurfaceSite } from './siteFacts';

const sites = authoringSites();
const audiences: readonly ContractAudience[] = ['chat', 'agent'];
const cases = sites.flatMap((site) =>
  audiences.map((audience) => [site.label, audience, site] as const),
);

/** What the popup would import for an example: inline JSON, or the picked plugin.json + style.css. */
async function importedManifest(example: PluginExample): Promise<unknown> {
  if (example.css === undefined) return JSON.parse(formatJson(example.manifest));
  const read = await readLocalPluginFiles([
    { name: 'plugin.json', text: formatJson(example.manifest) },
    { name: 'style.css', text: example.css },
  ]);
  if (!read.success) throw new Error(JSON.stringify(read.error));
  return read.data;
}

describe('plugin contract', () => {
  it.each(cases)('teaches only examples the local gate accepts on %s (%s)', async (...args) => {
    const [, audience, site] = args;
    const { examples } = buildPluginContract(site, { audience });
    expect(examples.length).toBeGreaterThan(1);
    for (const example of examples) {
      const result = validateLocalManifest(await importedManifest(example));
      expect(result.success ? [] : result.error).toEqual([]);
    }
  });

  it('offers a primitive example to a coding agent only where primitives run', () => {
    for (const site of sites) {
      const agentOps = buildPluginContract(site, { audience: 'agent' }).examples.flatMap(
        (example) => (example.manifest.contributes as { domOps?: { op: string }[] }).domOps ?? [],
      );
      expect(agentOps.some((op) => op.op === 'native')).toBe(!isNativeSurfaceSite(site));
      const chat = renderSections(buildPluginContract(site, { audience: 'chat' }).sections);
      expect(chat.join('\n')).not.toContain('"op": "native"');
    }
  });

  it('documents every primitive and its params for a coding agent', () => {
    const claude = sites.find((site) => site.id === 'claude')!;
    const text = renderSections(buildPluginContract(claude, { audience: 'agent' }).sections).join(
      '\n',
    );
    for (const contract of PRIMITIVE_CONTRACTS) {
      expect(text).toContain(`- ${contract.name} (sinceEngine ${contract.sinceEngine}): `);
      for (const param of Object.keys(contract.params)) {
        expect(text).toContain(`  - ${param} (`);
      }
    }
  });

  it('tells the author to say NOT POSSIBLE instead of inventing fields', () => {
    for (const audience of audiences) {
      const text = renderSections(buildPluginContract(sites[0], { audience }).sections).join('\n');
      expect(text).toContain('"NOT POSSIBLE: <what and why>"');
      expect(text).toContain('It cannot run JavaScript');
    }
  });

  it('warns that a site lacks the anchors other sites declare', () => {
    const claude = sites.find((site) => site.id === 'claude')!;
    const text = renderSections(buildPluginContract(claude, { audience: 'chat' }).sections).join(
      '\n',
    );
    expect(text).toMatch(/Claude does not declare [^\n]*thinkingBlock/);
  });

  it('renders file examples as plugin.json and style.css blocks that parse back', () => {
    const [example] = buildPluginContract(sites[0], { audience: 'agent' }).examples;
    const text = renderExample(example).join('\n');
    const json = /```json\n([\s\S]*?)\n```/.exec(text)![1];
    expect(JSON.parse(json)).toEqual(example.manifest);
    expect(text).toContain(`\`\`\`css\n${example.css!.trimEnd()}\n\`\`\``);
  });
});
