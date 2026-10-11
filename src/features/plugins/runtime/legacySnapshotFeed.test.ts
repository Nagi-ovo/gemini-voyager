import { describe, expect, it, vi } from 'vitest';

import { StorageKeys } from '@/core/types/common';

import { OFFICIAL_PLUGIN_IDS } from '../sites/featureOwners';
import type { LegacySettingSnapshot } from '../storage/legacySettingBindings';
import { isPluginWanted, openLegacySnapshotFeed } from './legacySnapshotFeed';
import { CLOSED_ADMISSION, type OfficialAdmission } from './officialAdmission';

const FORMULA_ID = OFFICIAL_PLUGIN_IDS.geminiFormulaCopy;
const FORMULA_KEY = StorageKeys.FORMULA_COPY_ENABLED;
const OPEN: OfficialAdmission = { stateOf: () => 'admitted', subscribe: () => () => {} };

describe('isPluginWanted', () => {
  it('keeps a bound plugin off until its legacy key has been read', () => {
    expect(isPluginWanted({}, null, OPEN, FORMULA_ID)).toBe(false);
    expect(isPluginWanted({}, {}, OPEN, FORMULA_ID)).toBe(true);
  });

  it('keeps an unadmitted plugin off whatever its switch says', () => {
    expect(isPluginWanted({}, { [FORMULA_KEY]: true }, CLOSED_ADMISSION, FORMULA_ID)).toBe(false);
  });

  it('leaves unbound plugins to their plugin-state entry, snapshot or not', () => {
    const state = { 'local.me.tweak': { enabled: true, installedAt: 1 } };
    expect(isPluginWanted(state, null, CLOSED_ADMISSION, 'local.me.tweak')).toBe(true);
    expect(isPluginWanted({}, null, CLOSED_ADMISSION, 'local.me.tweak')).toBe(false);
  });
});

describe('openLegacySnapshotFeed', () => {
  function source(loaded: Promise<LegacySettingSnapshot>) {
    let listener: ((changed: LegacySettingSnapshot) => void) | null = null;
    const unsubscribe = vi.fn();
    return {
      unsubscribe,
      fire: (changed: LegacySettingSnapshot) => listener?.(changed),
      source: {
        load: () => loaded,
        subscribe: (callback: (changed: LegacySettingSnapshot) => void) => {
          listener = callback;
          return unsubscribe;
        },
      },
    };
  }

  const settle = () => new Promise((r) => setTimeout(r, 0));

  it('lays changes seen before the read landed over the read, and later ones over the snapshot', async () => {
    let resolve: (snapshot: LegacySettingSnapshot) => void = () => {};
    const s = source(new Promise((r) => (resolve = r)));
    const onChange = vi.fn();
    const feed = openLegacySnapshotFeed(s.source, onChange);

    s.fire({ [FORMULA_KEY]: false });
    expect(feed.current()).toBeNull();
    resolve({ [FORMULA_KEY]: true, other: 1 });
    await settle();
    expect(feed.current()).toEqual({ [FORMULA_KEY]: false, other: 1 });
    expect(onChange).toHaveBeenCalledTimes(2); // the change, then the landed read

    s.fire({ [FORMULA_KEY]: undefined });
    expect(feed.current()).toEqual({ [FORMULA_KEY]: undefined, other: 1 });
    expect(onChange).toHaveBeenCalledTimes(3);

    feed.stop();
    expect(s.unsubscribe).toHaveBeenCalledTimes(1);
  });

  it('stays unread for good, without an unhandled rejection, when the extension context is gone', async () => {
    const s = source(Promise.reject(new Error('Extension context invalidated.')));
    const onChange = vi.fn();
    const feed = openLegacySnapshotFeed(s.source, onChange);
    expect(feed.phase()).toBe('loading');
    await settle();
    // The failure is announced once, so whoever waited for the read stops waiting.
    expect(feed.phase()).toBe('failed');
    expect(onChange).toHaveBeenCalledTimes(1);
    s.fire({ [FORMULA_KEY]: true });
    expect(feed.current()).toBeNull();
    expect(feed.phase()).toBe('failed');
  });

  it('reports the read as loaded once it lands', async () => {
    const feed = openLegacySnapshotFeed(source(Promise.resolve({})).source, () => {});
    expect(feed.phase()).toBe('loading');
    await settle();
    expect(feed.phase()).toBe('loaded');
  });

  it('ignores a read that lands after stop()', async () => {
    let resolve: (snapshot: LegacySettingSnapshot) => void = () => {};
    const s = source(new Promise((r) => (resolve = r)));
    const onChange = vi.fn();
    const feed = openLegacySnapshotFeed(s.source, onChange);
    feed.stop();
    resolve({ [FORMULA_KEY]: true });
    await settle();
    expect(feed.current()).toBeNull();
    expect(onChange).not.toHaveBeenCalled();
  });
});
