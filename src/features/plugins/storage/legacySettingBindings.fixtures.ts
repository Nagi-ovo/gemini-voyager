import type { PluginManifest } from '../types';

/** A minimal Gemini plugin manifest, with `settings` when given. */
export function testManifest(
  id: string,
  settings?: PluginManifest['contributes']['settings'],
): PluginManifest {
  return {
    id,
    name: id,
    version: '1.0.0',
    description: '',
    author: 'test',
    category: 'utility',
    license: 'MIT',
    engine: '>=1.0.0',
    tier: 'declarative',
    matches: ['https://gemini.google.com/*'],
    contributes: settings ? { settings } : {},
  };
}
