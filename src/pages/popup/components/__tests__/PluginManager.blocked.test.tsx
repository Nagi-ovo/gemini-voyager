import './pluginManagerHarness';
import { act } from 'react';

import { beforeEach, describe, expect, it } from 'vitest';

import enMessages from '@locales/en/messages.json';

import type { PluginStatus } from '@/features/plugins/runtime/pluginStatus';
import { OFFICIAL_PLUGIN_IDS } from '@/features/plugins/sites/featureOwners';
import type { PluginManifest } from '@/features/plugins/types';

import {
  PLUGIN_ID,
  container,
  mockLanguage,
  mockMessages,
  pluginState,
  renderManager,
  resetRoot,
  root,
  widthPlugin,
} from './pluginManagerHarness';

const BLOCKED: PluginStatus = { id: PLUGIN_ID, version: widthPlugin.version, kind: 'blocked' };

const holder: PluginManifest = {
  ...widthPlugin,
  id: 'local.me.formula',
  name: 'My formula copy',
  i18n: { zh: { name: '我的公式复制' } },
};

/** The packaged official plugin, which no plugin list shows: its switch is a native setting. */
const officialFormula: PluginManifest = {
  ...widthPlugin,
  id: OFFICIAL_PLUGIN_IDS.geminiFormulaCopy,
  name: 'Gemini · Formula Copy',
};

const officialVim: PluginManifest = {
  ...widthPlugin,
  id: OFFICIAL_PLUGIN_IDS.geminiVimInput,
  name: 'Gemini · Vim Input',
};

const en = (key: keyof typeof enMessages): string => enMessages[key].message;

function pluginToggle(): HTMLInputElement {
  const input = container.querySelector<HTMLInputElement>('input[aria-label="Test · Width"]');
  if (!input) throw new Error('Expected the plugin toggle');
  return input;
}

async function rerender(enabled: boolean, props: Parameters<typeof renderManager>[0]) {
  pluginState.current = { [PLUGIN_ID]: { enabled, installedAt: 0 } };
  await act(async () => root.unmount());
  resetRoot();
  await renderManager(props);
}

describe('PluginManager blocked plugins', () => {
  beforeEach(() => {
    mockMessages.current = {
      pluginBlockedByPlugin: enMessages.pluginBlockedByPlugin.message,
      pluginBlockedReleasing: enMessages.pluginBlockedReleasing.message,
      pluginBlockedUnavailableHere: enMessages.pluginBlockedUnavailableHere.message,
      pluginBlockedDuplicateClaim: enMessages.pluginBlockedDuplicateClaim.message,
      pluginBlockedByOfficialSetting: enMessages.pluginBlockedByOfficialSetting.message,
      pluginBlockedPending: enMessages.pluginBlockedPending.message,
      enableFormulaCopy: enMessages.enableFormulaCopy.message,
      formulaCopyFormat: enMessages.formulaCopyFormat.message,
      pluginsTitle: enMessages.pluginsTitle.message,
      timelineEnable: enMessages.timelineEnable.message,
      timelineOptions: enMessages.timelineOptions.message,
    };
  });

  it.each([
    ['host-policy', {}, enMessages.pluginBlockedUnavailableHere.message],
    ['duplicate-claim', {}, enMessages.pluginBlockedDuplicateClaim.message],
    [
      'conflict',
      { blockedBy: holder.id },
      enMessages.pluginBlockedByPlugin.message.replace('{name}', holder.name),
    ],
    ['releasing', { blockedBy: holder.id }, enMessages.pluginBlockedReleasing.message],
    [
      'pending',
      { blockedBy: OFFICIAL_PLUGIN_IDS.geminiFormulaCopy },
      en('pluginBlockedPending').replace('{name}', en('enableFormulaCopy')),
    ],
  ] as const)(
    'explains a %s block and leaves the toggle movable whether the plugin is on or off',
    async (blockedReason, extra, expected) => {
      const props = {
        statuses: [{ ...BLOCKED, blockedReason, ...extra }],
        nameSources: [widthPlugin, holder],
      };
      await rerender(true, props);
      expect(container.textContent).toContain(expected);
      expect(pluginToggle().checked).toBe(true);
      expect(pluginToggle().disabled).toBe(false);

      await rerender(false, props);
      expect(container.textContent).toContain(expected);
      expect(pluginToggle().checked).toBe(false);
      expect(pluginToggle().disabled).toBe(false);
    },
  );

  it('names the holder in the popup language from a manifest outside the listed ones', async () => {
    mockLanguage.current = 'zh';
    // The native popup lists only local plugins; the holder comes from `nameSources`.
    await renderManager({
      manifests: [widthPlugin],
      nameSources: [widthPlugin, holder],
      statuses: [{ ...BLOCKED, blockedReason: 'conflict', blockedBy: holder.id }],
    });

    expect(container.textContent).toContain('“我的公式复制”');
    expect(container.textContent).not.toContain('{name}');
  });

  it('falls back to the holder id when no loaded manifest names it', async () => {
    await renderManager({
      statuses: [{ ...BLOCKED, blockedReason: 'conflict', blockedBy: 'local.gone.formula' }],
    });

    expect(container.textContent).toContain('“local.gone.formula”');
  });

  it('says a plugin waiting on its own previous run is releasing, not in conflict with itself', async () => {
    await renderManager({
      statuses: [{ ...BLOCKED, blockedReason: 'conflict', blockedBy: PLUGIN_ID }],
    });

    expect(container.textContent).toContain(enMessages.pluginBlockedReleasing.message);
    expect(container.textContent).not.toContain('Paused here');
  });
});

describe('PluginManager blocked by a packaged official plugin', () => {
  beforeEach(() => {
    mockMessages.current = {
      pluginBlockedByPlugin: enMessages.pluginBlockedByPlugin.message,
      pluginBlockedByOfficialSetting: enMessages.pluginBlockedByOfficialSetting.message,
      pluginBlockedPending: enMessages.pluginBlockedPending.message,
      enableFormulaCopy: enMessages.enableFormulaCopy.message,
      formulaCopyFormat: enMessages.formulaCopyFormat.message,
      pluginsTitle: enMessages.pluginsTitle.message,
      timelineEnable: enMessages.timelineEnable.message,
      timelineOptions: enMessages.timelineOptions.message,
    };
  });

  it.each([
    [OFFICIAL_PLUGIN_IDS.geminiFormulaCopy, 'enableFormulaCopy', 'formulaCopyFormat'],
    [OFFICIAL_PLUGIN_IDS.aistudioFormulaCopy, 'enableFormulaCopy', 'formulaCopyFormat'],
    [OFFICIAL_PLUGIN_IDS.geminiTimeline, 'timelineEnable', 'timelineOptions'],
  ] as const)(
    'points a conflict with %s at its native switch, not at a plugin to find',
    async (blockedBy, setting, card) => {
      await renderManager({
        nameSources: [widthPlugin, officialFormula],
        statuses: [{ ...BLOCKED, blockedReason: 'conflict', blockedBy }],
      });

      expect(container.textContent).toContain(
        en('pluginBlockedByOfficialSetting')
          .replace('{setting}', en(setting))
          .replace('{card}', en(card)),
      );
      expect(container.textContent).not.toContain('Gemini · Formula Copy');
      expect(pluginToggle().disabled).toBe(false);
    },
  );

  it('points a conflict with a plugin listed in the Plugins card at its row there', async () => {
    await renderManager({
      nameSources: [widthPlugin, officialVim],
      statuses: [
        { ...BLOCKED, blockedReason: 'conflict', blockedBy: OFFICIAL_PLUGIN_IDS.geminiVimInput },
      ],
    });

    expect(container.textContent).toContain(
      en('pluginBlockedByOfficialSetting')
        .replace('{setting}', 'Vim Input')
        .replace('{card}', en('pluginsTitle')),
    );
    expect(pluginToggle().disabled).toBe(false);
  });

  it('says a pending block clears by itself, naming the switch being read', async () => {
    await renderManager({
      nameSources: [widthPlugin, officialVim],
      statuses: [
        { ...BLOCKED, blockedReason: 'pending', blockedBy: OFFICIAL_PLUGIN_IDS.geminiVimInput },
      ],
    });

    expect(container.textContent).toContain(
      en('pluginBlockedPending').replace('{name}', 'Vim Input'),
    );
    expect(container.textContent).not.toContain('{name}');
  });
});
