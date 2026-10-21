import { afterEach, describe, expect, it } from 'vitest';

import type { PluginManifest, SiteAdapter } from '../types';
import { CLOSED_ADMISSION } from './officialAdmission';
import { type StatusInput, collectPluginStatuses } from './pluginStatuses';

const adapter: SiteAdapter = {
  id: 'claude',
  label: 'Claude',
  matches: ['https://claude.ai/*'],
  selectors: { userTurn: '.user-turn', sidebar: 'nav' },
  theme: { hostSelector: 'html', lightSelector: 'html.light', darkSelector: 'html.dark' },
  capabilities: new Set(['chat']),
};

const blur: PluginManifest = {
  id: 'local.blur',
  name: 'Blur',
  version: '1.0.0',
  description: 'd',
  author: 'a',
  category: 'other',
  license: 'MIT',
  engine: '>=1.0.0',
  tier: 'declarative',
  matches: ['https://claude.ai/*'],
  contributes: {
    domOps: [
      { op: 'addClass', target: { kind: 'css', selector: 'body' }, className: 'gv-x' },
      { op: 'addClass', target: { kind: 'semantic', key: 'sidebar' }, className: 'gv-y' },
    ],
  },
};

function input(engine: StatusInput['engine']): StatusInput {
  return {
    url: 'https://claude.ai/chat/1',
    manifests: [blur],
    frozen: new Map(),
    adapter,
    wish: { state: {}, legacy: null, legacyPhase: 'none', admission: CLOSED_ADMISSION },
    blocked: new Map(),
    engine,
    doc: document,
  };
}

afterEach(() => {
  document.body.innerHTML = '';
});

describe('collectPluginStatuses', () => {
  it('keeps a partly effective plugin mounted and names the op that found nothing', () => {
    const [status] = collectPluginStatuses(
      input({ isActive: () => true, getHealth: () => false, getZeroOps: () => [1] }),
    );

    expect(status).toMatchObject({ kind: 'mounted', zeroOps: [1] });
    expect(status.ops?.map((op) => op.label)).toEqual(['body', 'sidebar']);
  });

  it('leaves zeroOps out when every op found something', () => {
    document.body.innerHTML = '<nav></nav>';
    const [status] = collectPluginStatuses(
      input({ isActive: () => true, getHealth: () => false, getZeroOps: () => [] }),
    );

    expect(status.kind).toBe('mounted');
    expect(status).not.toHaveProperty('zeroOps');
    expect(status.ops?.map((op) => op.count)).toEqual([1, 1]);
  });
});
