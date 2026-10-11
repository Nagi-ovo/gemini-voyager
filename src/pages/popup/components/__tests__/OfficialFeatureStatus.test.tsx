import { act } from 'react';
import { type Root, createRoot } from 'react-dom/client';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import enMessages from '@locales/en/messages.json';

import type { PluginStatus } from '@/features/plugins/runtime/pluginStatus';
import { OFFICIAL_PLUGIN_IDS } from '@/features/plugins/sites/featureOwners';
import type { PluginManifest } from '@/features/plugins/types';
import type { TranslationKey } from '@/utils/translations';

import { OfficialFeatureStatus } from '../OfficialFeatureStatus';

const t = (key: TranslationKey): string =>
  (enMessages as Record<string, { message: string } | undefined>)[key]?.message ?? key;

const OFFICIAL = OFFICIAL_PLUGIN_IDS.geminiFormulaCopy;

const localFormula: PluginManifest = {
  id: 'local.me.formula',
  name: 'My formula copy',
  version: '1.0.0',
  description: 'd',
  author: 'me',
  category: 'other',
  license: 'MIT',
  engine: '>=1.0.0',
  tier: 'declarative',
  matches: ['https://gemini.google.com/*'],
  i18n: { ja: { name: '自分の数式コピー' } },
  contributes: {},
};

function blocked(extra: Partial<PluginStatus>): PluginStatus {
  return { id: OFFICIAL, version: '1.0.0', kind: 'blocked', ...extra };
}

describe('OfficialFeatureStatus', () => {
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

  const render = (statuses: readonly PluginStatus[], language = 'en') =>
    act(() =>
      root.render(
        <OfficialFeatureStatus
          pluginId={OFFICIAL}
          statuses={statuses}
          manifests={[localFormula]}
          language={language}
          t={t}
        />,
      ),
    );

  it('names the local plugin that holds the feature, in the popup language', () => {
    render([blocked({ blockedReason: 'conflict', blockedBy: localFormula.id })]);
    expect(container.textContent).toBe(
      enMessages.officialFeaturePausedByLocal.message.replace('{name}', 'My formula copy'),
    );

    render([blocked({ blockedReason: 'conflict', blockedBy: localFormula.id })], 'ja');
    expect(container.textContent).toContain('“自分の数式コピー”');
  });

  it('says it is waiting while the previous run shuts down', () => {
    render([blocked({ blockedReason: 'releasing', blockedBy: localFormula.id })]);
    expect(container.textContent).toBe(enMessages.pluginBlockedReleasing.message);

    render([blocked({ blockedReason: 'releasing', blockedBy: OFFICIAL })]);
    expect(container.textContent).toBe(enMessages.pluginBlockedReleasing.message);
  });

  it('shows nothing while the legacy implementation owns the feature and the tab reports no status for it', () => {
    render([]);
    expect(container.innerHTML).toBe('');

    render([
      { id: localFormula.id, version: '1.0.0', kind: 'mounted' },
      { id: OFFICIAL_PLUGIN_IDS.geminiVimInput, version: '1.0.0', kind: 'blocked' },
    ]);
    expect(container.innerHTML).toBe('');
  });

  it('shows nothing once the official plugin runs', () => {
    render([{ id: OFFICIAL, version: '1.0.0', kind: 'mounted' }]);
    expect(container.innerHTML).toBe('');
  });
});
