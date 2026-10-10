import { describe, expect, it } from 'vitest';

import { attributeNameIssue } from '../manifest/sinkGuards';
import { OP_KINDS, REQUIRED_STRINGS } from '../manifest/validate';
import {
  AUTHORING_OP_KINDS,
  AUTHORING_OP_TEMPLATES,
  authoringSiteForUrl,
  authoringSites,
  buildPluginAuthoringPrompt,
  buildPluginExample,
  siteAnchors,
} from './pluginAuthoringPrompt';
import { validateLocalManifest } from './validateLocalManifest';

const sites = authoringSites();

/** The fenced example the prompt embeds, parsed back. */
function embeddedExample(prompt: string): unknown {
  const match = /```json\n([\s\S]*?)\n```/.exec(prompt);
  if (!match) throw new Error('no example block');
  return JSON.parse(match[1]);
}

describe('plugin authoring prompt contract', () => {
  it('covers every supported site, Gemini and AI Studio included', () => {
    expect(sites.map((site) => site.id)).toEqual(
      expect.arrayContaining(['gemini', 'aistudio', 'claude', 'chatgpt', 'deepseek']),
    );
  });

  it.each(sites.map((site) => [site.label, site] as const))(
    'embeds an example the local gate accepts on %s',
    (_label, site) => {
      const prompt = buildPluginAuthoringPrompt('Make my messages rounder', site);
      const example = embeddedExample(prompt);
      expect(example).toEqual(buildPluginExample(site));
      const result = validateLocalManifest(example);
      expect(result.success ? [] : result.error).toEqual([]);
    },
  );

  it.each(sites.map((site) => [site.label, site] as const))(
    'offers on %s only ops that import, each with a template the gate accepts',
    (_label, site) => {
      expect([...AUTHORING_OP_KINDS, 'native'].sort()).toEqual([...OP_KINDS].sort());
      const key = siteAnchors(site)[0];
      expect(key).toBeDefined();
      for (const kind of AUTHORING_OP_KINDS) {
        const op = AUTHORING_OP_TEMPLATES[kind]({ kind: 'semantic', key: key! });
        const manifest = {
          ...buildPluginExample(site),
          contributes: { styles: [{ css: '.gv-plugin-my-change{opacity:.9}' }], domOps: [op] },
        };
        const result = validateLocalManifest(manifest);
        expect(result.success ? [] : result.error).toEqual([]);
      }
    },
  );

  it('lists the request, the site, its anchors, the gate fields and the reply format', () => {
    const claude = sites.find((site) => site.id === 'claude')!;
    const prompt = buildPluginAuthoringPrompt('  Hide the sidebar  ', claude);
    expect(prompt).toContain(
      '----- BEGIN REQUEST -----\nHide the sidebar\n----- END REQUEST -----',
    );
    for (const pattern of claude.matches) expect(prompt).toContain(`- ${pattern}`);
    for (const key of siteAnchors(claude)) expect(prompt).toContain(`- ${key}: `);
    for (const field of REQUIRED_STRINGS) expect(prompt).toContain(field);
    for (const kind of AUTHORING_OP_KINDS) expect(prompt).toContain(`  - ${kind}: `);
    expect(prompt).toContain('"local.<id>"');
    expect(prompt).toContain('exactly one ```json fenced code block');
  });

  it('names only attributes the gate allows, and refuses href', () => {
    const prompt = buildPluginAuthoringPrompt('x', sites[0]);
    const line = prompt.split('\n').find((text) => text.includes('setAttribute "name" must be'));
    const names = line!
      .replace(/.*must be one of: /, '')
      .replace(/\. Never.*/, '')
      .split(', ')
      .map((name) => name.replace(/\*$/, 'x'));
    expect(names.length).toBeGreaterThan(2);
    for (const name of names) expect(attributeNameIssue(name)).toBeNull();
    expect(attributeNameIssue('href')).not.toBeNull();
  });

  it('defaults to the supported site of the active page', () => {
    expect(authoringSiteForUrl('https://claude.ai/chat/1')?.id).toBe('claude');
    expect(authoringSiteForUrl('https://gemini.google.com/app')?.id).toBe('gemini');
    expect(authoringSiteForUrl('https://example.com/')).toBeNull();
    expect(authoringSiteForUrl(undefined)).toBeNull();
  });
});
