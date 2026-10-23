import { type Mock, afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { FormFactor } from '@/core/types/formFactor';

import type { PluginManifest, PluginSource } from '../types';
import { PluginHost } from './PluginHost';

const URL = 'https://chat.deepseek.com/a/chat/s/1';

function manifest(id: string, formFactors?: readonly FormFactor[]): PluginManifest {
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
    matches: ['https://chat.deepseek.com/*'],
    contributes: {
      domOps: [
        { op: 'addClass', target: { kind: 'css', selector: 'body' }, className: `gv-${id}` },
      ],
    },
    ...(formFactors ? { requires: { formFactors } } : {}),
  };
}

const DESKTOP_ONLY = manifest('desktop-only');
const EVERYWHERE = manifest('everywhere', ['desktop', 'mobile']);

const source: PluginSource = {
  id: 'test',
  async list() {
    return [DESKTOP_ONLY, EVERYWHERE];
  },
};

async function startOn(formFactor: FormFactor): Promise<PluginHost> {
  const host = new PluginHost({
    url: URL,
    sources: [source],
    doc: document,
    requestCatalogRefresh: () => {},
    surfaceSwitch: null,
    formFactor: async () => formFactor,
  });
  await host.start();
  return host;
}

beforeEach(() => {
  document.body.className = '';
  (chrome.storage.local.get as unknown as Mock).mockResolvedValue({
    gvPluginsState: {
      'desktop-only': { enabled: true, installedAt: 1 },
      everywhere: { enabled: true, installedAt: 1 },
    },
  });
});

afterEach(() => {
  (chrome.storage.local.get as unknown as Mock).mockReset?.();
  (chrome.storage.local.set as unknown as Mock).mockClear?.();
});

describe('PluginHost on a phone', () => {
  it('leaves an enabled desktop-only plugin off and says why, without touching its switch', async () => {
    const host = await startOn('mobile');
    try {
      expect(document.body.classList.contains('gv-desktop-only')).toBe(false);
      expect(document.body.classList.contains('gv-everywhere')).toBe(true);
      const byId = Object.fromEntries(host.getStatuses().map((status) => [status.id, status]));
      expect(byId['desktop-only']).toMatchObject({
        kind: 'needs-form-factor',
        formFactor: 'mobile',
      });
      expect(byId.everywhere).toMatchObject({ kind: 'mounted' });
      // The user's choice stays as stored, so the desktop it syncs to keeps running it.
      expect(chrome.storage.local.set).not.toHaveBeenCalled();
    } finally {
      host.stop();
    }
  });

  it('runs the same plugins as before on a desktop', async () => {
    const host = await startOn('desktop');
    try {
      expect(document.body.classList.contains('gv-desktop-only')).toBe(true);
      expect(document.body.classList.contains('gv-everywhere')).toBe(true);
      expect(host.getStatuses().map((status) => status.kind)).toEqual(['mounted', 'mounted']);
    } finally {
      host.stop();
    }
  });
});
