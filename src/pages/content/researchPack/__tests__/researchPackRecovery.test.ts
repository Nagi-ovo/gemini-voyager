import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { buildScopedStorageKey } from '@/core/services/AccountIsolationService';
import { StorageKeys } from '@/core/types/common';
import { createEmptyPack } from '@/features/researchPack/services/packModel';
import type { ResearchPackStore } from '@/features/researchPack/services/packStore';

import { startResearchPack } from '../index';
import {
  clickAdd,
  emitStorageChange,
  flush,
  geminiPageUrl,
  packOf,
  sharedStorage,
  shownItems,
  turn,
} from './fixtures';

const GLOBAL = StorageKeys.RESEARCH_PACK;

const loadError = () => document.querySelector<HTMLElement>('.gv-rp-load-error')!;
const retryButton = () => loadError().querySelector<HTMLButtonElement>('button')!;
const instructionBox = () => document.querySelector<HTMLTextAreaElement>('#gv-rp-instruction')!;
const footerButtons = () =>
  Array.from(document.querySelectorAll<HTMLButtonElement>('.gv-rp-actions button'));
const launcher = () => document.querySelector<HTMLButtonElement>('.gv-rp-launcher')!;
const closeButton = () => document.querySelector<HTMLButtonElement>('.gv-rp-close')!;
const isShown = (element: HTMLElement): boolean => element.closest('[hidden]') === null;

/** Click as a user can: only what is on screen. */
function press(element: HTMLElement): void {
  expect(isShown(element), `${element.className} is on screen`).toBe(true);
  element.click();
}

describe('research pack recovery', () => {
  let stop: (() => void) | null = null;

  beforeEach(() => {
    document.body.innerHTML = '';
    vi.mocked(chrome.storage.onChanged.addListener).mockClear();
    history.replaceState(null, '', '/u/0/app');
  });

  afterEach(() => {
    stop?.();
    stop = null;
    document.body.innerHTML = '';
    history.replaceState(null, '', '/');
  });

  describe('when the scope cannot be resolved at first', () => {
    const failingOnce = () => {
      let calls = 0;
      return vi.fn(async () => {
        calls += 1;
        if (calls === 1) throw new Error('isolation setting unreadable');
        return GLOBAL;
      });
    };

    it('resolves it again when the user adds an answer', async () => {
      const shared = sharedStorage();
      const host = turn('<p>Added after storage recovered.</p>');
      stop = startResearchPack({
        pageUrl: geminiPageUrl,
        store: shared.store,
        resolveKey: failingOnce(),
      });
      await flush();
      expect(launcher().dataset.state).toBe('error');

      clickAdd(host);
      await flush();

      expect(shared.at(GLOBAL).map((item) => item.text)).toEqual([
        'Added after storage recovered.',
      ]);
      expect(shownItems()).toEqual(['Added after storage recovered.']);
      expect(isShown(loadError())).toBe(false);
      expect(launcher().dataset.state).toBeUndefined();
    });

    it('keeps the launcher on screen and resolves it again from Retry', async () => {
      const shared = sharedStorage({ [GLOBAL]: { ...createEmptyPack(), instruction: 'Keep' } });
      stop = startResearchPack({
        pageUrl: geminiPageUrl,
        store: shared.store,
        resolveKey: failingOnce(),
      });
      await flush();

      // Nothing is in the pack, yet the launcher stays to show the failure.
      expect(launcher().dataset.state).toBe('error');
      press(launcher());
      expect(isShown(loadError())).toBe(true);
      // Closing the panel keeps the way back in.
      press(closeButton());
      press(launcher());
      press(retryButton());
      await flush();

      expect(isShown(loadError())).toBe(false);
      expect(instructionBox().disabled).toBe(false);
      expect(instructionBox().value).toBe('Keep');
      // Recovered and still empty: the launcher goes back to showing only with items.
      press(closeButton());
      expect(isShown(launcher())).toBe(false);
    });
  });

  it('shows a load failure with Retry, and keeps editing blocked until a load succeeds', async () => {
    const shared = sharedStorage({ [GLOBAL]: { ...packOf('stored item'), instruction: 'Keep' } });
    let failLoads = 2;
    const store: ResearchPackStore = {
      load: async (key) => {
        if (failLoads > 0) {
          failLoads -= 1;
          throw new Error('storage.local unavailable');
        }
        return shared.store.load(key);
      },
      apply: (key, op) => shared.store.apply(key, op),
    };
    stop = startResearchPack({ pageUrl: geminiPageUrl, store, resolveKey: async () => GLOBAL });
    await flush();

    expect(launcher().dataset.state).toBe('error');
    press(launcher());
    expect(isShown(loadError())).toBe(true);
    expect(instructionBox().disabled).toBe(true);
    expect(footerButtons().every((button) => button.disabled)).toBe(true);

    press(retryButton());
    await flush();
    expect(isShown(loadError())).toBe(true);
    expect(instructionBox().disabled).toBe(true);

    press(retryButton());
    await flush();
    expect(isShown(loadError())).toBe(false);
    expect(shownItems()).toEqual(['stored item']);
    expect(instructionBox().disabled).toBe(false);
    expect(instructionBox().value).toBe('Keep');
    press(closeButton());
    expect(isShown(launcher())).toBe(true);
    expect(launcher().dataset.state).toBeUndefined();
  });

  describe('when the pack is removed', () => {
    const ISOLATION = StorageKeys.GV_ACCOUNT_ISOLATION_ENABLED_GEMINI;
    const ACCOUNT_A = buildScopedStorageKey(StorageKeys.RESEARCH_PACK, 'route:0');
    const draftOf = (text: string) => ({ ...packOf(text).items[0] });

    /** A store whose next load or apply does its work at once but answers only when released. */
    const holdable = (inner: ResearchPackStore) => {
      const holding = { load: false, apply: false };
      const releases: Array<() => void> = [];
      const answerLater = async <T>(work: Promise<T>): Promise<T> => {
        const result = await work;
        await new Promise<void>((resolve) => releases.push(resolve));
        return result;
      };
      const store: ResearchPackStore = {
        load: (key) => {
          if (!holding.load) return inner.load(key);
          holding.load = false;
          return answerLater(inner.load(key));
        },
        apply: (key, op) => {
          if (!holding.apply) return inner.apply(key, op);
          holding.apply = false;
          return answerLater(inner.apply(key, op));
        },
      };
      return {
        store,
        holdNext: (kind: 'load' | 'apply') => {
          holding[kind] = true;
        },
        release: () => releases.shift()?.(),
      };
    };

    const removeShown = (shared: ReturnType<typeof sharedStorage>): void => {
      const removed = shared.stored(GLOBAL);
      shared.remove(GLOBAL);
      emitStorageChange({ [GLOBAL]: { oldValue: removed } }, 'local');
    };

    const recreate = async (shared: ReturnType<typeof sharedStorage>, text: string) => {
      const result = await shared.store.apply(GLOBAL, { kind: 'add', draft: draftOf(text) });
      emitStorageChange({ [GLOBAL]: { newValue: result.pack } }, 'local');
      return result;
    };

    it('shows the recreated pack, whatever revision it starts again from', async () => {
      // The pack had reached revision 101 and the owner's clock reads 100.
      const shared = sharedStorage(
        { [GLOBAL]: { ...packOf('old item'), revision: 101 } },
        { now: () => 100 },
      );
      stop = startResearchPack({
        pageUrl: geminiPageUrl,
        store: shared.store,
        resolveKey: async () => GLOBAL,
      });
      await flush();
      expect(shownItems()).toEqual(['old item']);

      // Clearing extension data removes the pack; it stays editable while empty.
      removeShown(shared);
      expect(shownItems()).toEqual([]);
      expect(instructionBox().disabled).toBe(false);

      const recreated = await recreate(shared, 'new item');
      expect(recreated.pack.revision).toBe(1);
      expect(shownItems()).toEqual(['new item']);

      await recreate(shared, 'newer item');
      expect(shownItems()).toEqual(['new item', 'newer item']);
    });

    it('drops a read that started before the removal', async () => {
      const shared = sharedStorage({ [GLOBAL]: { ...packOf('old item'), revision: 101 } });
      const held = holdable(shared.store);
      held.holdNext('load');
      stop = startResearchPack({
        pageUrl: geminiPageUrl,
        store: held.store,
        resolveKey: async () => GLOBAL,
      });
      await flush();

      removeShown(shared);
      held.release();
      await flush();
      expect(shownItems()).toEqual([]);
      expect(instructionBox().disabled).toBe(false);

      await recreate(shared, 'new item');
      expect(shownItems()).toEqual(['new item']);
    });

    it('drops a write answered after the pack was removed and recreated', async () => {
      const shared = sharedStorage({ [GLOBAL]: { ...packOf('old item'), revision: 101 } });
      const held = holdable(shared.store);
      const host = turn('<p>Added just before the removal.</p>');
      stop = startResearchPack({
        pageUrl: geminiPageUrl,
        store: held.store,
        resolveKey: async () => GLOBAL,
      });
      await flush();

      // Saved as revision 102 just before the removal; the answer is slow.
      held.holdNext('apply');
      clickAdd(host);
      await flush();
      expect(shared.stored(GLOBAL)?.revision).toBe(102);

      removeShown(shared);
      await recreate(shared, 'new item');
      expect(shownItems()).toEqual(['new item']);

      held.release();
      await flush();
      expect(shownItems()).toEqual(['new item']);
    });

    it('drops a read from before switching away once the pack is shown again', async () => {
      const shared = sharedStorage({
        [GLOBAL]: { ...packOf('old item'), revision: 101 },
        [ACCOUNT_A]: packOf('A item'),
      });
      const held = holdable(shared.store);
      held.holdNext('load');
      let isolated = false;
      stop = startResearchPack({
        pageUrl: geminiPageUrl,
        store: held.store,
        resolveKey: async () => (isolated ? ACCOUNT_A : GLOBAL),
      });
      await flush();

      isolated = true;
      emitStorageChange({ [ISOLATION]: { newValue: true } }, 'sync');
      await flush();
      expect(shownItems()).toEqual(['A item']);

      // Removed and recreated while another pack is on screen.
      removeShown(shared);
      await recreate(shared, 'new item');

      isolated = false;
      emitStorageChange({ [ISOLATION]: { newValue: false } }, 'sync');
      await flush();
      expect(shownItems()).toEqual(['new item']);

      held.release();
      await flush();
      expect(shownItems()).toEqual(['new item']);
    });
  });
});
