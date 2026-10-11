import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { DEFAULT_ADAPTERS } from '../../sites/registry';
import { EFFECTIVE_PLUGIN_ENGINE_VERSION } from '../../verbs/contracts';
import { validateLocalManifest } from '../validateLocalManifest';
import { renderScaffoldAgents, renderWriteVoyagerPluginSkill } from './authoringDocs';
import { siteAnchors } from './siteFacts';
import { WRITE_PLUGIN_SKILL_NAME } from './skillLink';

const SKILL_FILE = join(process.cwd(), 'docs/public/skills', WRITE_PLUGIN_SKILL_NAME, 'SKILL.md');

function jsonBlocks(text: string): unknown[] {
  return [...text.matchAll(/```json\n([\s\S]*?)\n```/g)].map((match) => JSON.parse(match[1]));
}

describe('write-voyager-plugin skill', () => {
  it('is current: run `bun run skills:build` after changing sites, primitives or the contract', () => {
    expect(readFileSync(SKILL_FILE, 'utf8')).toBe(renderWriteVoyagerPluginSkill(DEFAULT_ADAPTERS));
  });

  it('opens with skill frontmatter an agent can parse', () => {
    const skill = renderWriteVoyagerPluginSkill(DEFAULT_ADAPTERS);
    const frontmatter = /^---\nname: ([^\n]+)\ndescription: ("[^\n]+")\n---\n/.exec(skill);
    expect(frontmatter?.[1]).toBe(WRITE_PLUGIN_SKILL_NAME);
    expect(JSON.parse(frontmatter![2])).toContain('Voyager');
  });

  it('gives local authors concrete primitive versions and this tree’s effective engine', () => {
    const skill = renderWriteVoyagerPluginSkill(DEFAULT_ADAPTERS);
    expect(skill).toContain(`plugin engine ${EFFECTIVE_PLUGIN_ENGINE_VERSION}`);
    expect(skill).not.toMatch(/sinceEngine next|>=next/);
    const primitiveFloors = [...skill.matchAll(/^- \w+ \(sinceEngine ([^)]+)\):/gm)];
    expect(primitiveFloors.length).toBeGreaterThan(0);
    for (const match of primitiveFloors) expect(match[1]).toMatch(/^\d+\.\d+\.\d+$/);
  });

  it('lists every site with its URL patterns and anchors', () => {
    const skill = renderWriteVoyagerPluginSkill(DEFAULT_ADAPTERS);
    for (const site of DEFAULT_ADAPTERS) {
      expect(skill).toContain(`### Target site: ${site.label}`);
      for (const pattern of site.matches) expect(skill).toContain(`- ${pattern}\n`);
      for (const key of siteAnchors(site)) expect(skill).toContain(`- ${key}: `);
    }
  });
});

describe('scaffold AGENTS.md', () => {
  it.each(DEFAULT_ADAPTERS.map((site) => [site.label, site] as const))(
    'shows %s examples whose manifests carry only what that site accepts',
    (_label, site) => {
      const agents = renderScaffoldAgents(site);
      const manifests = jsonBlocks(agents) as { matches: string[]; contributes: unknown }[];
      expect(manifests.length).toBeGreaterThan(1);
      for (const manifest of manifests) {
        expect(manifest.matches).toEqual(site.matches);
        // Style files are not inlined here; the gate checks the rest of the manifest.
        const inline = {
          ...manifest,
          contributes: { ...(manifest.contributes as object), styles: [] },
        };
        const result = validateLocalManifest(inline);
        expect(result.success ? [] : result.error).toEqual([]);
      }
    },
  );
});
