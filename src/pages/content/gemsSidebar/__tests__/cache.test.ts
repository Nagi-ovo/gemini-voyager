/**
 * Regression tests for the gems catalog cache.
 *
 * M9: the cache is shared across every window of the browser profile, so a
 * window signed into account B must never render account A's custom gems
 * (clicking one 404s). catalogForAccount gates the render on the envelope's
 * accountSegment, tolerating legacy envelopes that predate the field.
 *
 * M10: saveCache must skip the storage write when the scraped content is
 * unchanged — every write fans out through storage.onChanged to all tabs.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import browser from 'webextension-polyfill';

import {
  type GemMetadata,
  catalogForAccount,
  gemItemsEqual,
  isSelfInflictedMutation,
  saveCache,
} from '../index';

vi.mock('webextension-polyfill', () => ({
  default: {
    storage: {
      local: {
        get: vi.fn().mockResolvedValue({}),
        set: vi.fn().mockResolvedValue(undefined),
        remove: vi.fn().mockResolvedValue(undefined),
      },
      sync: {
        get: vi.fn().mockResolvedValue({}),
        set: vi.fn().mockResolvedValue(undefined),
      },
      onChanged: { addListener: vi.fn(), removeListener: vi.fn() },
    },
  },
}));

const gem = (id: string, name = id): GemMetadata => ({ id, name, href: `/gem/${id}` });

const localSet = () => browser.storage.local.set as ReturnType<typeof vi.fn>;

describe('catalogForAccount (M9)', () => {
  const items = [gem('a'), gem('b')];

  it('returns the items when the account segment matches', () => {
    expect(catalogForAccount({ items, accountSegment: '/u/1' }, '/u/1')).toBe(items);
    expect(catalogForAccount({ items, accountSegment: '' }, '')).toBe(items);
  });

  it('returns an empty catalog when the cache belongs to another account', () => {
    expect(catalogForAccount({ items, accountSegment: '/u/0' }, '/u/1')).toEqual([]);
    expect(catalogForAccount({ items, accountSegment: '' }, '/u/1')).toEqual([]);
    expect(catalogForAccount({ items, accountSegment: '/u/1' }, '')).toEqual([]);
  });

  it('tolerates legacy envelopes without accountSegment (backward compatibility)', () => {
    expect(catalogForAccount({ items }, '/u/1')).toBe(items);
    expect(catalogForAccount({ items, accountSegment: undefined }, '')).toBe(items);
  });
});

describe('gemItemsEqual (M10)', () => {
  it('is true for identical content regardless of object identity', () => {
    expect(gemItemsEqual([gem('a'), gem('b')], [gem('a'), gem('b')])).toBe(true);
    expect(gemItemsEqual([], [])).toBe(true);
  });

  it('is false when length, order, or any field differs', () => {
    expect(gemItemsEqual([gem('a')], [gem('a'), gem('b')])).toBe(false);
    expect(gemItemsEqual([gem('a'), gem('b')], [gem('b'), gem('a')])).toBe(false);
    expect(gemItemsEqual([gem('a', 'Old name')], [gem('a', 'New name')])).toBe(false);
    expect(
      gemItemsEqual([{ ...gem('a'), iconLetter: 'A' }], [{ ...gem('a'), iconLetter: 'B' }]),
    ).toBe(false);
  });
});

describe('saveCache write skipping (M10)', () => {
  beforeEach(() => {
    localSet().mockClear();
    window.history.pushState({}, '', '/gems/view');
  });

  it('does not write storage again when the scraped content is unchanged', async () => {
    const items = [gem('a'), gem('b')];

    await saveCache(items);
    const writesAfterFirst = localSet().mock.calls.length;
    expect(writesAfterFirst).toBeGreaterThan(0);

    // Same content, fresh array/object identity — must be a no-op.
    await saveCache([gem('a'), gem('b')]);
    expect(localSet().mock.calls.length).toBe(writesAfterFirst);
  });

  it('writes again when the content actually changes', async () => {
    await saveCache([gem('a')]);
    const writesAfterFirst = localSet().mock.calls.length;

    await saveCache([gem('a', 'Renamed')]);
    expect(localSet().mock.calls.length).toBeGreaterThan(writesAfterFirst);
  });

  it('writes again when the account segment changes even with identical items', async () => {
    const items = [gem('a')];
    await saveCache(items);
    const writesAfterFirst = localSet().mock.calls.length;

    window.history.pushState({}, '', '/u/1/gems/view');
    await saveCache([gem('a')]);
    expect(localSet().mock.calls.length).toBeGreaterThan(writesAfterFirst);
  });
});

describe('isSelfInflictedMutation (M10)', () => {
  function record(partial: Partial<MutationRecord>): MutationRecord {
    return {
      type: 'childList',
      target: document.body,
      addedNodes: [] as unknown as NodeList,
      removedNodes: [] as unknown as NodeList,
      attributeName: null,
      attributeNamespace: null,
      nextSibling: null,
      oldValue: null,
      previousSibling: null,
      ...partial,
    } as unknown as MutationRecord;
  }

  function gvButton(): HTMLElement {
    const btn = document.createElement('button');
    btn.className = 'gv-gem-pin-toggle';
    btn.textContent = 'pin';
    return btn;
  }

  function nativeRow(): HTMLElement {
    const row = document.createElement('bot-list-row') as unknown as HTMLElement;
    row.textContent = 'My gem';
    return row;
  }

  it('exempts childList mutations that only add/remove our gv- nodes', () => {
    const btn = gvButton();
    expect(isSelfInflictedMutation([record({ addedNodes: [btn] as unknown as NodeList })])).toBe(
      true,
    );
    expect(isSelfInflictedMutation([record({ removedNodes: [btn] as unknown as NodeList })])).toBe(
      true,
    );
  });

  it('exempts characterData mutations inside our gv- nodes', () => {
    const btn = gvButton();
    const textNode = btn.firstChild as Node;
    expect(isSelfInflictedMutation([record({ type: 'characterData', target: textNode })])).toBe(
      true,
    );
  });

  it('schedules a scrape for native Gemini mutations', () => {
    const row = nativeRow();
    expect(isSelfInflictedMutation([record({ addedNodes: [row] as unknown as NodeList })])).toBe(
      false,
    );
    expect(
      isSelfInflictedMutation([record({ type: 'characterData', target: row.firstChild as Node })]),
    ).toBe(false);
  });

  it('schedules a scrape when a batch mixes gv- and native mutations', () => {
    expect(
      isSelfInflictedMutation([
        record({ addedNodes: [gvButton()] as unknown as NodeList }),
        record({ addedNodes: [nativeRow()] as unknown as NodeList }),
      ]),
    ).toBe(false);
  });

  it('schedules a scrape for empty childList batches (never over-exempt)', () => {
    expect(isSelfInflictedMutation([record({})])).toBe(false);
  });
});
