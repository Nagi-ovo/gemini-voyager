import { describe, expect, it } from 'vitest';

import type { PluginManifest } from '../types';
import { pluginsToOriginPatterns } from './siteRegistration';

function mk(matches: string[]): PluginManifest {
  return {
    id: 'x',
    name: 'x',
    version: '1.0.0',
    description: 'd',
    author: 'a',
    category: 'render-fix',
    license: 'MIT',
    engine: '>=1.0.0',
    tier: 'declarative',
    matches,
    contributes: {},
  };
}

describe('pluginsToOriginPatterns', () => {
  it('derives an origin pattern from a match pattern', () => {
    expect(pluginsToOriginPatterns([mk(['https://claude.ai/*'])])).toEqual(['https://claude.ai/*']);
  });

  it('dedupes and sorts origins across plugins', () => {
    const result = pluginsToOriginPatterns([
      mk(['https://claude.ai/*']),
      mk(['https://chatgpt.com/*', 'https://claude.ai/*']),
    ]);
    expect(result).toEqual(['https://chatgpt.com/*', 'https://claude.ai/*']);
  });

  it('normalizes a scheme wildcard to https', () => {
    expect(pluginsToOriginPatterns([mk(['*://claude.ai/*'])])).toEqual(['https://claude.ai/*']);
  });

  it('ignores <all_urls>', () => {
    expect(pluginsToOriginPatterns([mk(['<all_urls>'])])).toEqual([]);
  });
});
