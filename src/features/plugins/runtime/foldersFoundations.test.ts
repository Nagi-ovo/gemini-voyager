/**
 * The plugin-platform pieces the `folders` primitive will stand on, proven
 * before the primitive exists: a contract that requires a `site.json` section
 * and declares the settings it reads, the `needs-site-data` status, the
 * exclusive `folders-surface` resource, and the rule that keeps local plugins
 * off Gemini and AI Studio folders.
 */
import { describe, expect, it, vi } from 'vitest';

import { validateLocalManifest } from '../local/validateLocalManifest';
import { primitiveSettingIssues } from '../manifest/primitiveChecks';
import { hostPolicyRefusal } from '../sites/hostPolicy';
import { validateSiteAdapterData } from '../sites/siteAdapterData';
import type { DomOperation, PluginManifest, SettingsSchema, SiteAdapter } from '../types';
import type { PrimitiveContract } from '../verbs/contracts';
import { findIncompatibility } from './pluginStatus';
import { arbitrate } from './resourceArbiter';
import { claimedResources } from './resourceClaims';

const FOLDERS_CONTRACT: PrimitiveContract = {
  name: 'folders',
  sinceEngine: '1.0.0',
  semantic: [],
  sections: { folders: 1 },
  settings: { hideFiledChats: 'boolean', search: 'boolean' },
  params: {},
  description: 'Test stand-in for the folders primitive.',
};

vi.mock('../verbs/contracts', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../verbs/contracts')>();
  return {
    ...actual,
    getPrimitiveContract: (name: string) =>
      name === 'folders' ? FOLDERS_CONTRACT : actual.getPrimitiveContract(name),
  };
});

// As steps 5 and 7 will: an owner entry opens `folders` to the official plugin on both sites.
vi.mock('../sites/featureOwners', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../sites/featureOwners')>();
  return {
    ...actual,
    pluginOwnedHandlers: (site: Parameters<typeof actual.pluginOwnedHandlers>[0]) => [
      ...actual.pluginOwnedHandlers(site),
      'folders',
    ],
  };
});

function plugin(
  id: string,
  matches: readonly string[],
  settings?: SettingsSchema,
  domOps: readonly DomOperation[] = [{ op: 'native', handler: 'folders', params: {} }],
): PluginManifest {
  return {
    id,
    name: id,
    version: '1.0.0',
    description: 'd',
    author: 'a',
    category: 'other',
    license: 'MIT',
    engine: '>=1.0.0',
    tier: 'declarative',
    matches,
    contributes: { ...(settings ? { settings } : {}), domOps },
  };
}

function site(folders?: unknown): SiteAdapter {
  const result = validateSiteAdapterData({
    id: 'deepseek',
    label: 'DeepSeek',
    matches: ['https://chat.deepseek.com/*'],
    selectors: {},
    theme: { hostSelector: 'body', lightSelector: 'body.light', darkSelector: 'body.dark' },
    ...(folders ? { folders } : {}),
  });
  if (!result.success) throw new Error('fixture must validate');
  return result.data;
}

const FOLDERS_SECTION = {
  format: 1,
  sidebar: 'nav',
  rows: { row: 'a[href^="/a/chat/s/"]', drag: 'link' },
  page: { placeholderTitles: { any: ['New chat'] } },
};

const DEEPSEEK = ['https://chat.deepseek.com/*'];
const hasPrimitive = () => true;

describe('a primitive that reads site data', () => {
  it('reports needs-site-data on a site without the section, and runs with it', () => {
    const manifest = plugin('voyager.deepseek-folders', DEEPSEEK);
    expect(findIncompatibility({ manifest, adapter: site(), hasPrimitive })).toMatchObject({
      kind: 'needs-site-data',
      missingSections: ['folders'],
    });
    expect(findIncompatibility({ manifest, adapter: site(FOLDERS_SECTION), hasPrimitive })).toBe(
      null,
    );
  });

  it('refuses a local plugin for a site that has no such section', () => {
    const result = validateLocalManifest(plugin('me.folders', DEEPSEEK), [site()]);
    expect(result.success ? [] : result.error.map((issue) => issue.message)).toContainEqual(
      expect.stringContaining('"folders" site data'),
    );
    expect(validateLocalManifest(plugin('me.folders', DEEPSEEK), [site(FOLDERS_SECTION)])).toEqual(
      expect.objectContaining({ success: true }),
    );
  });
});

describe('settings a primitive reads', () => {
  it('refuses a setting of the wrong type and a misspelled one', () => {
    const issues = primitiveSettingIssues(
      plugin('voyager.deepseek-folders', DEEPSEEK, {
        hideFiledChats: { type: 'number', label: 'Hide', default: 0 },
        hideFiledChat: { type: 'boolean', label: 'Hide', default: false },
      }),
    );
    expect(issues.map((issue) => issue.path)).toEqual([
      'contributes.settings.hideFiledChats.type',
      'contributes.settings.hideFiledChat',
    ]);
  });

  it('accepts the settings it reads and a setting a CSS token uses', () => {
    const manifest = plugin('voyager.deepseek-folders', DEEPSEEK, {
      hideFiledChats: { type: 'boolean', label: 'Hide', default: false },
      gap: { type: 'number', label: 'Gap', default: 4 },
    });
    const styled = {
      ...manifest,
      contributes: { ...manifest.contributes, styles: [{ css: '.gv-x{gap:{{gap}}px}' }] },
    };
    expect(primitiveSettingIssues(styled)).toEqual([]);
  });
});

describe('the folders-surface resource', () => {
  it('two plugins calling folders on one page give one runner and one conflict', () => {
    const official = plugin('voyager.deepseek-folders', DEEPSEEK);
    const local = plugin('local.me.folders', DEEPSEEK);
    expect(claimedResources(official)).toEqual(['folders-surface']);
    const result = arbitrate([local, official], [], new Set());
    expect([...result.granted]).toEqual([official.id]);
    expect(result.blocked.get(local.id)).toEqual({
      reason: 'conflict',
      by: official.id,
      resources: ['folders-surface'],
    });
  });
});

describe('local folders on Gemini and AI Studio, once an owner entry opens folders there', () => {
  it.each([['https://gemini.google.com/*'], ['https://aistudio.google.com/*']])(
    'refuses a local plugin calling folders on %s',
    (pattern) => {
      const result = validateLocalManifest(plugin('me.folders', [pattern]));
      expect(result.success ? [] : result.error.map((issue) => issue.message)).toContainEqual(
        expect.stringContaining('Voyager’s own'),
      );
    },
  );

  it('keeps a stored local folders plugin off the Gemini page, whatever its patterns say', () => {
    const stored = plugin('local.me.folders', ['https://*/*']);
    expect(hostPolicyRefusal('https://gemini.google.com/app', stored)).toEqual({
      kind: 'native-op',
      handlers: ['folders'],
    });
    expect(hostPolicyRefusal('https://chat.deepseek.com/', stored)).toBe(null);
    const official = plugin('voyager.gemini-folders', ['https://gemini.google.com/*']);
    expect(hostPolicyRefusal('https://gemini.google.com/app', official)).toBe(null);
  });
});
