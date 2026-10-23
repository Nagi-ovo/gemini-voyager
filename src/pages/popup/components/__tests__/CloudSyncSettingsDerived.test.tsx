import React, { act } from 'react';
import { type Root, createRoot } from 'react-dom/client';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { PLATFORM_LOGOS } from '@/core/icons/platformLogos';
import { DEFAULT_SYNC_STATE } from '@/core/types/sync';

import { CloudSyncSettings } from '../CloudSyncSettings';
import { createCloudSyncChromeMock } from './cloudSyncChromeMock';

vi.mock('@/contexts/LanguageContext', () => ({
  useLanguage: () => ({ language: 'en', t: (key: string) => key }),
}));

vi.mock('@/features/plugins/catalog/sites', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/features/plugins/catalog/sites')>();
  const template = actual.BUNDLED_SITE_ADAPTERS.find((site) => site.id === 'deepseek');
  if (!template) throw new Error('Missing folder site fixture');
  return {
    ...actual,
    BUNDLED_SITE_ADAPTERS: [
      ...actual.BUNDLED_SITE_ADAPTERS,
      ...[
        { id: 'kimi', label: 'Kimi fixture', host: 'www.kimi.com' },
        { id: 'unknown-chat', label: 'Unknown Chat', host: 'chat.unknown.example' },
      ].map(({ id, label, host }) => ({
        ...template,
        id,
        label,
        matches: [`https://${host}/*`],
      })),
    ],
  };
});

describe('CloudSyncSettings derived folder sites', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  async function mount(url: string) {
    const chromeMock = createCloudSyncChromeMock(
      vi.fn(async () => ({ ok: true, state: { ...DEFAULT_SYNC_STATE, mode: 'manual' } })),
    );
    vi.mocked(
      chromeMock.tabs.query as (query: chrome.tabs.QueryInfo) => Promise<chrome.tabs.Tab[]>,
    ).mockResolvedValue([{ id: 3, url } as chrome.tabs.Tab]);
    vi.stubGlobal('chrome', chromeMock);
    await act(async () => root.render(<CloudSyncSettings />));
  }

  it('does not crash the cloud sync card for a folder site without a preset', async () => {
    await mount('https://www.kimi.com/a/conversation');
    const summary = container.querySelector('[data-testid="sync-platform-summary"]');
    expect(summary?.textContent).toContain('Kimi fixture');
    expect(summary?.querySelector('svg')?.getAttribute('viewBox')).toBe(
      PLATFORM_LOGOS.kimi.viewBox,
    );
    expect(summary?.querySelector('path')?.getAttribute('d')).toBe(PLATFORM_LOGOS.kimi.paths[0]);
  });

  it('does not crash the cloud sync card for a folder site without a logo', async () => {
    await mount('https://chat.unknown.example/a/conversation');
    const summary = container.querySelector('[data-testid="sync-platform-summary"]');
    expect(summary?.textContent).toContain('Unknown Chat');
    expect(container.querySelector('[data-testid="sync-platform-mark"] svg')).not.toBeNull();
  });
});
