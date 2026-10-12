import { describe, expect, it } from 'vitest';

import { StorageKeys } from '@/core/types/common';

import { BundledCatalogPluginSource } from '../sources/BundledCatalogPluginSource';
import {
  LEGACY_VALUE_BINDINGS,
  acceptsLegacyLiveChange,
  deriveLegacyValueSettings,
  legacyValueKeys,
} from './legacyValueBindings';

const FONT_SIZE_ID = 'voyager.gemini-chat-font-size';
const LINE_HEIGHT_ID = 'voyager.gemini-chat-line-height';
const WIDTH_ID = 'voyager.gemini-chat-width';

describe('legacy value bindings', () => {
  it('falls back to the default for a non-numeric or non-finite stored value on the first read', () => {
    for (const stored of [undefined, null, '120', true, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(
        deriveLegacyValueSettings(FONT_SIZE_ID, { [StorageKeys.CHAT_FONT_SIZE]: stored }),
      ).toEqual({ fontSize: 100 });
      expect(
        deriveLegacyValueSettings(LINE_HEIGHT_ID, {
          [StorageKeys.CHAT_LINE_HEIGHT]: stored,
          [StorageKeys.CHAT_PARAGRAPH_SPACING]: stored,
        }),
      ).toEqual({ lineHeight: 160, paragraphSpacing: 12 });
      expect(deriveLegacyValueSettings(WIDTH_ID, { [StorageKeys.CHAT_WIDTH]: stored })).toEqual({
        widthPercent: 70,
      });
    }
    expect(deriveLegacyValueSettings(FONT_SIZE_ID, {})).toEqual({ fontSize: 100 });
  });

  it('rounds and clamps every value as the native modules do, reading an old px chat width as percent', () => {
    expect(
      deriveLegacyValueSettings(FONT_SIZE_ID, { [StorageKeys.CHAT_FONT_SIZE]: 112.6 }),
    ).toEqual({ fontSize: 113 });
    expect(deriveLegacyValueSettings(FONT_SIZE_ID, { [StorageKeys.CHAT_FONT_SIZE]: 400 })).toEqual({
      fontSize: 150,
    });
    expect(
      deriveLegacyValueSettings(LINE_HEIGHT_ID, {
        [StorageKeys.CHAT_LINE_HEIGHT]: 99,
        [StorageKeys.CHAT_PARAGRAPH_SPACING]: 7.5,
      }),
    ).toEqual({ lineHeight: 120, paragraphSpacing: 8 });
    // 960 px of the old 1200 px baseline is 80 %.
    expect(deriveLegacyValueSettings(WIDTH_ID, { [StorageKeys.CHAT_WIDTH]: 960 })).toEqual({
      widthPercent: 80,
    });
    expect(deriveLegacyValueSettings(WIDTH_ID, { [StorageKeys.CHAT_WIDTH]: 12 })).toEqual({
      widthPercent: 30,
    });
  });

  it('gives an id without value bindings no settings', () => {
    expect(deriveLegacyValueSettings('voyager.gemini-hide-input-halo', { anything: 1 })).toEqual(
      {},
    );
  });

  it('lets a value key change live only to a number, and every other key change freely', () => {
    expect(acceptsLegacyLiveChange(StorageKeys.CHAT_FONT_SIZE, 120)).toBe(true);
    expect(acceptsLegacyLiveChange(StorageKeys.CHAT_FONT_SIZE, Number.NaN)).toBe(true);
    expect(acceptsLegacyLiveChange(StorageKeys.CHAT_FONT_SIZE, '120')).toBe(false);
    expect(acceptsLegacyLiveChange(StorageKeys.CHAT_FONT_SIZE, null)).toBe(false);
    expect(acceptsLegacyLiveChange(StorageKeys.CHAT_FONT_SIZE, undefined)).toBe(false);
    expect(acceptsLegacyLiveChange(StorageKeys.CHAT_FONT_SIZE_ENABLED, undefined)).toBe(true);
    expect(acceptsLegacyLiveChange(StorageKeys.CHAT_FONT_SIZE_ENABLED, 'yes')).toBe(true);
  });

  it('lists each value key once', () => {
    expect([...legacyValueKeys()].sort()).toEqual(
      [
        StorageKeys.CHAT_FONT_SIZE,
        StorageKeys.CHAT_LINE_HEIGHT,
        StorageKeys.CHAT_PARAGRAPH_SPACING,
        StorageKeys.CHAT_WIDTH,
      ].sort(),
    );
  });

  it('fills only settings the packaged typography manifests declare, within their ranges', async () => {
    const packaged = await new BundledCatalogPluginSource().list();
    const manifests = packaged.filter((m) => m.id === FONT_SIZE_ID || m.id === LINE_HEIGHT_ID);
    expect(manifests).toHaveLength(2);
    for (const manifest of manifests) {
      const schema = manifest.contributes.settings ?? {};
      const bindings = LEGACY_VALUE_BINDINGS[manifest.id] ?? [];
      expect(bindings.map((entry) => entry.settingKey).sort()).toEqual(Object.keys(schema).sort());
      for (const entry of bindings) {
        const field = schema[entry.settingKey];
        expect(entry.read(undefined), entry.settingKey).toBe(field.default);
        expect(entry.read(-1e9), entry.settingKey).toBe(field.min);
        expect(entry.read(1e9), entry.settingKey).toBe(field.max);
      }
    }
  });
});
