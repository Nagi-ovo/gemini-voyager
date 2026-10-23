import { afterEach, describe, expect, it } from 'vitest';

import { requireBundledSiteAdapter } from '../../catalog/sites';
import type { PluginStatus } from '../../runtime/pluginStatus';
import type { PluginManifest, SiteAdapter } from '../../types';
import type { PluginInspection } from '../types';
import { type ProbeResult, collectProbes, runProbes } from './probes';

interface SiteFixture {
  readonly name: string;
  readonly adapter: SiteAdapter;
  /** A page with a sidebar, a composer and `turns` user/assistant pairs. */
  page(turns: number): string;
}

const sites: SiteFixture[] = [
  {
    name: 'Claude',
    adapter: requireBundledSiteAdapter('claude'),
    page: (turns) =>
      '<nav aria-label="Sidebar"><div data-testid="sidebar"><div data-testid="sidebar-recents"></div>' +
      '<div data-row-key="chat:1"><a href="/chat/1">x</a></div></div></nav>' +
      '<div data-autoscroll-container="true">' +
      '<div data-testid="user-message">q</div><div data-testid="assistant-message">a</div>'.repeat(
        turns,
      ) +
      '</div><div data-composer-card-holder><div><div data-testid="chat-input" contenteditable="true"></div></div></div>',
  },
  {
    name: 'DeepSeek',
    adapter: requireBundledSiteAdapter('deepseek'),
    page: (turns) =>
      '<div><div class="ds-scroll-area"><div><div><a href="/a/chat/s/1">x</a></div></div></div></div>' +
      '<div class="ds-virtual-list ds-scroll-area">' +
      '<div class="ds-message"><div class="ds-collapsible-text">q</div></div><div class="ds-message"><div class="ds-assistant-message-main-content">a</div></div>'.repeat(
        turns,
      ) +
      '</div><div><div><textarea class="ds-scroll-area"></textarea></div></div>',
  },
];

function status(id: string, kind: PluginStatus['kind']): PluginStatus {
  return { id, version: '1.0.0', kind };
}

function manifest(id: string, domOps: PluginManifest['contributes']['domOps']): PluginManifest {
  return {
    id,
    name: id,
    version: '1.0.0',
    description: '',
    author: 'test',
    category: 'other',
    license: 'MIT',
    engine: '>=1.0.0',
    tier: 'declarative',
    matches: ['https://example.com/*'],
    contributes: { domOps },
  } as PluginManifest;
}

const find = (results: readonly ProbeResult[], source: string, name: string) =>
  results.find((result) => result.source === source && result.name === name);

afterEach(() => {
  document.body.innerHTML = '';
});

describe.each(sites)('site check probes on $name', ({ adapter, page }) => {
  it('counts every semantic key the site defines and marks the ones it finds', () => {
    document.body.innerHTML = page(2);
    const results = runProbes(collectProbes(adapter, null, 'self'), {
      doc: document,
      conversation: true,
    });
    const siteNames = results.filter((result) => result.source === 'site').map((r) => r.name);
    expect(new Set(siteNames)).toEqual(new Set(Object.keys(adapter.selectors)));
    expect(find(results, 'site', 'userTurn')).toMatchObject({ count: 2, verdict: 'ok' });
    expect(find(results, 'site', 'assistantTurn')).toMatchObject({ count: 2, verdict: 'ok' });
    expect(find(results, 'site', 'composer')).toMatchObject({ count: 1, verdict: 'ok' });
  });

  it('calls a page key that finds nothing broken, and a conversation key only in a conversation', () => {
    document.body.innerHTML = '<main></main>';
    const probes = collectProbes(adapter, null, 'self');
    const elsewhere = runProbes(probes, { doc: document, conversation: false });
    expect(find(elsewhere, 'site', 'composer')?.verdict).toBe('missing');
    expect(find(elsewhere, 'site', 'userTurn')?.verdict).toBe('not-here');
    expect(find(elsewhere, 'site', 'sendButton')?.verdict).toBe('not-judged');
    const inChat = runProbes(probes, { doc: document, conversation: true });
    expect(find(inChat, 'site', 'userTurn')?.verdict).toBe('missing');
  });

  it('adds what running plugins rely on, but not plugins that are off or the site check itself', () => {
    document.body.innerHTML = page(1);
    const inspection: PluginInspection = {
      statuses: [
        status('voyager.test-running', 'mounted'),
        status('voyager.test-off', 'ready'),
        status('voyager.self', 'mounted'),
      ],
      manifests: [
        manifest('voyager.test-running', [
          { op: 'addClass', target: { kind: 'semantic', key: 'userTurn' }, className: 'gv-x' },
          { op: 'hide', target: { kind: 'css', selector: '.gone-in-redesign' } },
          { op: 'native', handler: 'folders', params: {} },
        ]),
        manifest('voyager.test-off', [
          { op: 'hide', target: { kind: 'css', selector: '.never-counted' } },
        ]),
        manifest('voyager.self', [{ op: 'native', handler: 'siteCheck', params: {} }]),
      ],
    };
    const results = runProbes(collectProbes(adapter, inspection, 'voyager.self'), {
      doc: document,
      conversation: true,
    });
    const sources = new Set(results.map((result) => result.source));
    expect(sources).toEqual(new Set(['site', 'voyager.test-running']));
    expect(find(results, 'voyager.test-running', 'userTurn')).toMatchObject({ count: 1 });
    expect(find(results, 'voyager.test-running', 'domOps[1] hide')).toMatchObject({
      selector: '.gone-in-redesign',
      count: 0,
      verdict: 'not-judged',
    });
    // The folders primitive reads site.json's section: its rows are counted inside the sidebar.
    expect(find(results, 'voyager.test-running', 'folders.rows.row')?.count).toBeGreaterThan(0);
  });

  it('reports a key the site lacks as unresolved and a selector this browser rejects as invalid', () => {
    document.body.innerHTML = page(1);
    const inspection: PluginInspection = {
      statuses: [status('voyager.test', 'no-effect')],
      manifests: [
        manifest('voyager.test', [
          { op: 'hide', target: { kind: 'semantic', key: 'headerActions' } },
          { op: 'hide', target: { kind: 'css', selector: 'div[[' } },
        ]),
      ],
    };
    const results = runProbes(collectProbes(adapter, inspection, 'self'), {
      doc: document,
      conversation: true,
    });
    expect(find(results, 'voyager.test', 'headerActions')).toMatchObject({
      selector: null,
      verdict: 'unresolved',
    });
    expect(find(results, 'voyager.test', 'domOps[1] hide')?.verdict).toBe('invalid');
  });
});
