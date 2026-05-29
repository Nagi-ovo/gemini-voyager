import { type Mock, beforeEach, describe, expect, it, vi } from 'vitest';

import type { PluginManifest } from '../types';
import { subscribeCatalog } from './catalogCache';

const KEY = 'gvPluginCatalogCache';

function manifest(id: string): PluginManifest {
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
    matches: ['https://claude.ai/*'],
    contributes: {},
  };
}

function cached(manifests: PluginManifest[], fetchedAt: number) {
  return { manifests, fetchedAt };
}

/** Grab the listener subscribeCatalog registered on chrome.storage.onChanged. */
function registeredListener(): (
  changes: Record<string, chrome.storage.StorageChange>,
  area: string,
) => void {
  const addListener = chrome.storage.onChanged.addListener as unknown as Mock;
  return addListener.mock.calls[addListener.mock.calls.length - 1][0];
}

beforeEach(() => {
  (chrome.storage.onChanged.addListener as unknown as Mock).mockClear();
  (chrome.storage.onChanged.removeListener as unknown as Mock).mockClear();
});

describe('subscribeCatalog', () => {
  it('does NOT fire when only fetchedAt changed (background-refresh churn)', () => {
    const cb = vi.fn();
    subscribeCatalog(cb);
    const listener = registeredListener();

    const manifests = [manifest('a')];
    listener(
      { [KEY]: { oldValue: cached(manifests, 1), newValue: cached(manifests, 2) } },
      'local',
    );

    expect(cb).not.toHaveBeenCalled();
  });

  it('fires when the manifest content changed (a real catalog update)', () => {
    const cb = vi.fn();
    subscribeCatalog(cb);
    const listener = registeredListener();

    listener(
      {
        [KEY]: {
          oldValue: cached([manifest('a')], 1),
          newValue: cached([manifest('a'), manifest('b')], 2),
        },
      },
      'local',
    );

    expect(cb).toHaveBeenCalledTimes(1);
  });

  it('fires on first write (no prior cache)', () => {
    const cb = vi.fn();
    subscribeCatalog(cb);
    const listener = registeredListener();

    listener({ [KEY]: { newValue: cached([manifest('a')], 1) } }, 'local');

    expect(cb).toHaveBeenCalledTimes(1);
  });

  it('ignores changes to other keys and other storage areas', () => {
    const cb = vi.fn();
    subscribeCatalog(cb);
    const listener = registeredListener();

    listener({ someOtherKey: { newValue: 1 } }, 'local');
    listener({ [KEY]: { oldValue: cached([], 1), newValue: cached([manifest('a')], 2) } }, 'sync');

    expect(cb).not.toHaveBeenCalled();
  });

  it('unsubscribe removes the listener', () => {
    const cb = vi.fn();
    const unsubscribe = subscribeCatalog(cb);
    unsubscribe();
    expect(chrome.storage.onChanged.removeListener).toHaveBeenCalledTimes(1);
  });
});
