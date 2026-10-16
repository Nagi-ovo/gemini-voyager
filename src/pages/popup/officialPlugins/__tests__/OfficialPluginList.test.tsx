import React, { act } from 'react';
import { type Root, createRoot } from 'react-dom/client';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { OFFICIAL_PLUGIN_IDS } from '@/features/plugins/sites/featureOwners';
import { BundledCatalogPluginSource } from '@/features/plugins/sources/BundledCatalogPluginSource';
import type { TranslationKey } from '@/utils/translations';

import { OfficialPluginList } from '../OfficialPluginList';
import { officialPluginEntry } from '../officialPluginRegistry';

const translate = (key: TranslationKey): string => key;

describe('OfficialPluginList', () => {
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
  });

  async function render(language: string) {
    const packaged = await new BundledCatalogPluginSource().list();
    const manifest = packaged.find(({ id }) => id === OFFICIAL_PLUGIN_IDS.geminiMermaid)!;
    const entry = officialPluginEntry(manifest.id)!;
    // An Arabic popup listing a name that has no Arabic translation.
    const untranslated = { ...manifest, i18n: {} };
    act(() =>
      root.render(
        <OfficialPluginList
          rows={[
            {
              entry,
              manifest: untranslated,
              enabled: true,
              settings: {},
              usageHint: null,
              unmetRequirement: null,
            },
          ]}
          statuses={[]}
          nameSources={[]}
          isVisible={() => true}
          onToggle={vi.fn()}
          onSettingsChange={vi.fn()}
          language={language}
          t={translate}
        />,
      ),
    );
    return container.querySelector<HTMLElement>(`[data-official-plugin="${manifest.id}"]`)!;
  }

  it('mirrors the card in Arabic and keeps an English name in its own direction', async () => {
    const row = await render('ar');
    expect(row.closest('[dir]')?.getAttribute('dir')).toBe('rtl');
    const name = row.querySelector('label bdi');
    expect(name?.textContent).toMatch(/[A-Za-z]/);
  });

  it('leaves the direction to the popup in a left-to-right language', async () => {
    const row = await render('en');
    expect(row.closest('[dir]')).toBeNull();
  });
});
