import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { buildVoyagerDiagnostics } from '@/core/services/DiagnosticsExportService';

import { requireBundledSiteAdapter } from '../../catalog/sites';
import { PluginScope } from '../../runtime/pluginScope';
import type { PluginManifest, SiteAdapter } from '../../types';
import type { PluginInspection } from '../types';
import { checkPage, siteCheckPrimitive } from './index';
import { buildIssueUrl } from './issueLink';
import { collectProbes, runProbes } from './probes';
import {
  LOCAL_SELECTOR_PLACEHOLDER,
  buildSiteCheckReport,
  describePick,
  formatSiteCheckMarkdown,
  pluginIds,
  serializeSiteCheckReport,
} from './report';

const SECRETS = [
  'Quarterly layoffs plan',
  'alice@example.com',
  'Alice Example',
  'secret-prompt-words',
  'private reply body',
  'avatar-secret.png',
  '6812a0f4-77aa-8000-b2c1-3d9e5f00aa11',
  'utm_secret',
];

const claude = requireBundledSiteAdapter('claude');

/** A Claude conversation whose every text and text-bearing attribute holds a secret. */
function conversationFixture(): void {
  document.title = 'Quarterly layoffs plan - Claude';
  document.body.innerHTML = `
    <nav aria-label="Alice Example's chats"><div data-testid="sidebar">
      <div data-row-key="chat:6812a0f4-77aa-8000-b2c1-3d9e5f00aa11" data-row-label="Quarterly layoffs plan">
        <a href="/chat/6812a0f4-77aa-8000-b2c1-3d9e5f00aa11" title="Quarterly layoffs plan">Quarterly layoffs plan</a>
      </div>
      <button aria-label="alice@example.com"><img src="https://cdn.example/avatar-secret.png" alt="Alice Example"></button>
    </div></nav>
    <div data-autoscroll-container="true">
      <div data-testid="user-message" data-author="Alice Example">secret-prompt-words</div>
      <div data-testid="assistant-message"><div class="font-claude-message" id="reply">
        <p data-title="Quarterly layoffs plan">private reply body</p>
        <input value="secret-prompt-words" placeholder="alice@example.com">
      </div></div>
    </div>
    <div data-composer-card-holder><div>
      <div data-testid="chat-input" contenteditable="true">secret-prompt-words</div>
    </div></div>`;
}

const diagnostics = buildVoyagerDiagnostics({
  extensionVersion: '2.2.1',
  buildTarget: 'chrome',
  userAgent:
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36',
  platform: 'MacIntel',
});

const URL_WITH_ID =
  'https://claude.ai/chat/6812a0f4-77aa-8000-b2c1-3d9e5f00aa11?utm_secret=alice@example.com#reply';

function localManifest(): PluginManifest {
  return {
    id: 'local.alice-example-tweaks',
    name: 'Alice Example tweaks',
    version: '1.0.0',
    description: '',
    author: 'alice@example.com',
    category: 'other',
    license: 'MIT',
    engine: '>=1.0.0',
    tier: 'declarative',
    matches: ['https://claude.ai/*'],
    contributes: {
      domOps: [{ op: 'hide', target: { kind: 'css', selector: '[aria-label="Alice Example"]' } }],
    },
  } as PluginManifest;
}

afterEach(() => {
  document.body.innerHTML = '';
  document.title = '';
});

describe('site check report privacy', () => {
  it('carries no text, title, account detail, full URL or local plugin name from the page', () => {
    conversationFixture();
    const inspection: PluginInspection = {
      statuses: [{ id: 'local.alice-example-tweaks', version: '1.0.0', kind: 'mounted' }],
      manifests: [localManifest()],
    };
    const probes = collectProbes(claude, inspection, 'voyager.claude-site-check');
    const ids = pluginIds(probes.map((probe) => probe.source));
    const picked = describePick(document.getElementById('reply')!, probes, ids);
    const results = runProbes(probes, { doc: document, conversation: true });
    expect(results.some((result) => result.source === 'local.alice-example-tweaks')).toBe(true);
    const report = buildSiteCheckReport({
      url: URL_WITH_ID,
      doc: document,
      adapter: claude,
      results,
      statuses: inspection.statuses,
      picked,
      diagnostics,
    });
    const outputs = [
      formatSiteCheckMarkdown(report),
      serializeSiteCheckReport(report),
      decodeURIComponent(buildIssueUrl(report)),
    ];
    for (const output of outputs) {
      for (const secret of SECRETS) expect(output).not.toContain(secret);
      expect(output).not.toContain('alice-example-tweaks');
    }
    expect(report.page.route).toBe('/chat/:id');
    expect(report.plugins).toEqual([{ id: 'local.#1', version: '1.0.0', status: 'mounted' }]);
    expect(report.selectors.find((row) => row.source === 'local.#1')?.selector).toBe(
      LOCAL_SELECTOR_PLACEHOLDER,
    );
    // The picked reply still says where it sits and which selector finds it.
    expect(picked.path.at(-1)?.matches).toContain('site · assistantTurn');
  });

  it('prefills the issue form with a short title and summary, never the report', () => {
    conversationFixture();
    const { report } = checkPage(
      { doc: document, adapter: claude, pluginId: 'voyager.claude-site-check' },
      null,
    );
    const url = new URL(buildIssueUrl({ ...report, extension: diagnostics.extension }));
    expect(url.origin + url.pathname).toBe('https://github.com/voyager-crew/voyager/issues/new');
    expect(url.searchParams.get('template')).toBe('bug_report.yml');
    expect(url.searchParams.get('title')).toMatch(/^\[Bug\] Claude: /);
    expect(url.searchParams.get('extension-version')).toBe('2.2.1');
    expect(url.toString().length).toBeLessThan(1000);
    expect(url.toString()).not.toContain('Selectors');
  });
});

describe('site check primitive', () => {
  let scope: PluginScope | undefined;
  const counters: Array<() => number> = [];

  function activate(adapter: SiteAdapter, inspection?: PluginInspection): void {
    scope = new PluginScope();
    void siteCheckPrimitive.activate(
      scope,
      {},
      {
        doc: document,
        adapter,
        pluginId: 'voyager.claude-site-check',
        settings: {},
        setTargetCounter: (count) => counters.push(count),
        inspectPlugins: inspection ? () => inspection : undefined,
      },
    );
  }

  const launcher = () =>
    document
      .querySelector('.gv-site-check-launcher')
      ?.shadowRoot?.querySelector<HTMLButtonElement>('button');
  const panel = () => document.querySelector('.gv-site-check-panel')?.shadowRoot;

  beforeEach(() => {
    conversationFixture();
    counters.length = 0;
  });

  afterEach(async () => {
    await scope?.dispose();
    scope = undefined;
  });

  it('rejects params, since it takes none', () => {
    expect(siteCheckPrimitive.validateParams({}).success).toBe(true);
    expect(siteCheckPrimitive.validateParams({ selector: 'x' }).success).toBe(false);
  });

  it('opens the panel from its launcher with the counted selectors, and closes on Escape', () => {
    activate(claude, { statuses: [], manifests: [] });
    expect(counters.map((count) => count())).toEqual([1]);
    launcher()!.click();
    const rows = [...panel()!.querySelectorAll('tbody tr')];
    expect(rows.length).toBe(Object.keys(claude.selectors).length);
    const composer = rows.find((row) => row.textContent?.includes('composer'));
    expect(composer?.getAttribute('data-verdict')).toBe('ok');
    expect(panel()!.querySelector('pre')?.textContent).toContain('### Voyager site check');

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(panel()).toBeUndefined();
  });

  it('adds the picked element to the report and removes everything when the plugin stops', async () => {
    activate(claude);
    launcher()!.click();
    const pick = [...panel()!.querySelectorAll('button')].find((button) =>
      button.textContent?.startsWith('Pick'),
    )!;
    pick.click();
    expect(panel()).toBeUndefined();
    const reply = document.getElementById('reply')!;
    reply.dispatchEvent(
      new MouseEvent('click', { bubbles: true, cancelable: true, composed: true }),
    );
    expect(panel()!.textContent).toContain('div.font-claude-message');

    // Pick again from the new panel, and stop the plugin mid-pick.
    [...panel()!.querySelectorAll('button')]
      .find((button) => button.textContent?.startsWith('Pick'))!
      .click();
    expect(document.querySelector('.gv-site-check-picker')).not.toBeNull();
    await scope?.dispose();
    expect(document.querySelector('[data-gv-layer].gv-site-check-launcher')).toBeNull();
    expect(document.querySelector('.gv-site-check-panel')).toBeNull();
    expect(document.querySelector('.gv-site-check-picker')).toBeNull();
    expect(document.documentElement.classList.contains('gv-site-check-picking')).toBe(false);
    // A page click after teardown reaches the page again.
    const pageClick = vi.fn();
    reply.addEventListener('click', pageClick);
    reply.click();
    expect(pageClick).toHaveBeenCalledTimes(1);
  });
});
