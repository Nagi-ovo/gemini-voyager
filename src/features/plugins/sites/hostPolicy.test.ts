import { describe, expect, it } from 'vitest';

import manifest from '../../../../manifest.json';
import type { PluginManifest } from '../types';
import { listPrimitiveNames } from '../verbs/registry';
import { aistudioAdapter } from './adapters/aistudio';
import { chatgptAdapter } from './adapters/chatgpt';
import { geminiAdapter } from './adapters/gemini';
import {
  PACKAGED_HOST_POLICIES,
  allowedPrimitivesForSite,
  allowsNativeHandler,
  allowsPluginTheme,
  allowsPluginThemeForSite,
  allowsRemoteCatalog,
  hostPolicyRefusal,
  isStaticallyInjectedHost,
  manifestHostPolicyIssues,
  packagedSiteForUrl,
  usesCatalogDataStores,
} from './hostPolicy';

const PACKAGED_HOSTS = [
  'gemini.google.com',
  'business.gemini.google',
  'aistudio.google.com',
  'aistudio.google.cn',
];

type Contributes = PluginManifest['contributes'];

function plugin(
  matches: string[],
  contributes: Contributes,
  theme?: PluginManifest['theme'],
): Pick<PluginManifest, 'matches' | 'theme' | 'contributes'> {
  return { matches, contributes, ...(theme ? { theme } : {}) };
}

const nativeOp = (handler: string) => ({ op: 'native' as const, handler, params: {} });
const hideOp = { op: 'hide' as const, target: { kind: 'css' as const, selector: '.x' } };

describe('packaged host policy', () => {
  it('covers exactly the hosts the manifest injects the main content script into and grants', () => {
    const contentScript = manifest.content_scripts.find((script) =>
      script.js.includes('src/pages/content/index.tsx'),
    );
    const policyMatches = PACKAGED_HOST_POLICIES.flatMap((policy) => policy.matches);
    expect([...(contentScript?.matches ?? [])].sort()).toEqual([...policyMatches].sort());
    for (const pattern of policyMatches) {
      expect(manifest.host_permissions).toContain(pattern);
    }
  });

  it('recognizes the statically injected hosts and nothing else', () => {
    expect(isStaticallyInjectedHost('gemini.google.com')).toBe(true);
    expect(isStaticallyInjectedHost('Business.Gemini.Google')).toBe(true);
    expect(isStaticallyInjectedHost(' aistudio.google.cn ')).toBe(true);
    expect(isStaticallyInjectedHost('claude.ai')).toBe(false);
    expect(isStaticallyInjectedHost('google.com')).toBe(false);
  });

  it('never allows the remote catalog or a plugin theme on the four Google hosts', () => {
    for (const host of PACKAGED_HOSTS) {
      expect(allowsRemoteCatalog(host)).toBe(false);
      expect(allowsPluginTheme(`https://${host}/app`)).toBe(false);
    }
    expect(allowsRemoteCatalog('chatgpt.com')).toBe(true);
    expect(allowsPluginTheme('https://chatgpt.com/c/1')).toBe(true);
  });

  it('judges a page by its real hostname, not by text in the URL', () => {
    expect(packagedSiteForUrl('https://gemini.google.com/app/abc')).toBe('gemini');
    expect(packagedSiteForUrl('https://business.gemini.google/u/1/')).toBe('gemini');
    expect(packagedSiteForUrl('https://AISTUDIO.google.com/prompts/new_chat')).toBe('aistudio');
    expect(packagedSiteForUrl('https://gemini.google.com.evil.test/')).toBeNull();
    expect(packagedSiteForUrl('https://evil.test/?next=https://gemini.google.com/')).toBeNull();
    expect(packagedSiteForUrl('not a url')).toBeNull();
  });

  it('keeps catalog data stores off the packaged sites by id', () => {
    expect(usesCatalogDataStores('gemini')).toBe(false);
    expect(usesCatalogDataStores('aistudio')).toBe(false);
    for (const site of ['chatgpt', 'claude', 'deepseek']) {
      expect(usesCatalogDataStores(site)).toBe(true);
    }
  });

  it('refuses every shipped primitive on Gemini and AI Studio while their features stay native', () => {
    const primitives = listPrimitiveNames();
    expect(primitives.length).toBeGreaterThan(0);
    for (const handler of primitives) {
      expect(allowsNativeHandler('gemini', handler)).toBe(false);
      expect(allowsNativeHandler('aistudio', handler)).toBe(false);
      expect(allowsNativeHandler('chatgpt', handler)).toBe(true);
    }
    expect(allowedPrimitivesForSite(geminiAdapter)).toEqual(new Set());
    expect(allowedPrimitivesForSite(aistudioAdapter)).toEqual(new Set());
    expect(allowedPrimitivesForSite(chatgptAdapter)).toBe('all');
  });

  it('forbids a theme on a site adapter that reaches a packaged site', () => {
    expect(allowsPluginThemeForSite(geminiAdapter)).toBe(false);
    expect(allowsPluginThemeForSite(aistudioAdapter)).toBe(false);
    expect(allowsPluginThemeForSite(chatgptAdapter)).toBe(true);
  });
});

describe('manifestHostPolicyIssues', () => {
  it('passes CSS and reversible DOM ops on the packaged sites, and anything elsewhere', () => {
    expect(
      manifestHostPolicyIssues(plugin(['https://gemini.google.com/*'], { domOps: [hideOp] })),
    ).toEqual([]);
    expect(
      manifestHostPolicyIssues(
        plugin(['https://claude.ai/*'], { domOps: [nativeOp('vimInput')] }, { brand: '#ff0000' }),
      ),
    ).toEqual([]);
  });

  it('reports a theme once, whatever number of packaged sites the plugin targets', () => {
    const issues = manifestHostPolicyIssues(
      plugin(
        ['https://gemini.google.com/*', 'https://aistudio.google.com/*'],
        {},
        { brand: '#ff0000' },
      ),
    );
    expect(issues).toEqual([
      {
        path: 'theme',
        message: 'Gemini and AI Studio keep Voyager’s own accent: remove theme for these sites',
      },
    ]);
  });

  it('checks each target site on its own: one refusing site is enough', () => {
    const issues = manifestHostPolicyIssues(
      plugin(['https://chatgpt.com/*', 'https://gemini.google.com/app/*'], {
        domOps: [hideOp, nativeOp('formulaCopy')],
      }),
    );
    expect(issues).toEqual([
      {
        path: 'contributes.domOps[1]',
        message: 'the `formulaCopy` primitive is not available on Gemini in this Voyager version',
      },
    ]);
  });

  it('reports a native op once for every packaged site that refuses it', () => {
    const issues = manifestHostPolicyIssues(
      plugin(['https://gemini.google.com/*', 'https://aistudio.google.cn/*'], {
        domOps: [nativeOp('vimInput')],
      }),
    );
    expect(issues.map((issue) => issue.path)).toEqual([
      'contributes.domOps[0]',
      'contributes.domOps[0]',
    ]);
    expect(issues.map((issue) => issue.message)).toEqual([
      'the `vimInput` primitive is not available on Gemini in this Voyager version',
      'the `vimInput` primitive is not available on AI Studio in this Voyager version',
    ]);
  });
});

describe('hostPolicyRefusal', () => {
  it('refuses a theme or a kept primitive on a packaged page, naming each refused handler once', () => {
    expect(
      hostPolicyRefusal('https://gemini.google.com/app', plugin([], {}, { brand: '#ff0000' })),
    ).toEqual({ kind: 'theme' });
    expect(
      hostPolicyRefusal(
        'https://aistudio.google.com/prompts/1',
        plugin([], {
          domOps: [nativeOp('formulaCopy'), hideOp, nativeOp('formulaCopy'), nativeOp('vimInput')],
        }),
      ),
    ).toEqual({ kind: 'native-op', handlers: ['formulaCopy', 'vimInput'] });
  });

  it('refuses nothing for CSS-only plugins or on other sites', () => {
    expect(
      hostPolicyRefusal('https://gemini.google.com/app', plugin([], { domOps: [hideOp] })),
    ).toBeNull();
    expect(
      hostPolicyRefusal(
        'https://claude.ai/new',
        plugin([], { domOps: [nativeOp('vimInput')] }, { brand: '#ff0000' }),
      ),
    ).toBeNull();
  });
});
