import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { buildScopedStorageKey } from '@/core/services/AccountIsolationService';
import { StorageKeys } from '@/core/types/common';
import {
  type ResearchPackStorageArea,
  type ResearchPackStore,
  createResearchPackOwner,
} from '@/features/researchPack/services/packStore';
import type { ResearchPack } from '@/features/researchPack/services/types';
import { toastDriver } from '@/tests/toastDriver';

import { startResearchPack } from '../index';
import type { ResearchPackScopeContext } from '../scope';
import {
  clickAdd,
  emitStorageChange,
  flush,
  geminiPageUrl,
  packOf,
  sharedStorage,
  shownItems,
  turn,
  wait,
} from './fixtures';

const GLOBAL = StorageKeys.RESEARCH_PACK;
const ACCOUNT_A = buildScopedStorageKey(StorageKeys.RESEARCH_PACK, 'route:0');
const ACCOUNT_B = buildScopedStorageKey(StorageKeys.RESEARCH_PACK, 'route:1');

/** Wrap a store so loads or applies for chosen keys wait for an explicit release. */
function gated(store: ResearchPackStore, delayMs: { load?: string; apply?: string; ms: number }) {
  return {
    load: async (key: string) => {
      if (key === delayMs.load) await wait(delayMs.ms);
      return store.load(key);
    },
    apply: async (key: string, op: Parameters<ResearchPackStore['apply']>[1]) => {
      if (key === delayMs.apply) await wait(delayMs.ms);
      return store.apply(key, op);
    },
  } satisfies ResearchPackStore;
}

const ISOLATION_ON = { [StorageKeys.GV_ACCOUNT_ISOLATION_ENABLED_GEMINI]: { newValue: true } };

describe('research pack account scope', () => {
  let stop: (() => void) | null = null;

  beforeEach(() => {
    document.body.innerHTML = '';
    vi.mocked(chrome.storage.onChanged.addListener).mockClear();
    vi.mocked(chrome.storage.sync.get).mockClear();
    history.replaceState(null, '', '/u/0/app');
  });

  afterEach(() => {
    stop?.();
    stop = null;
    document.body.innerHTML = '';
    history.replaceState(null, '', '/');
  });

  it('swaps to the account pack when isolation turns on, and exports only that pack', async () => {
    const { store } = sharedStorage({
      [GLOBAL]: packOf('global item'),
      [ACCOUNT_A]: packOf('A item'),
    });
    let isolated = false;
    stop = startResearchPack({
      pageUrl: geminiPageUrl,
      store: gated(store, { load: ACCOUNT_A, ms: 40 }),
      resolveKey: async () => (isolated ? ACCOUNT_A : GLOBAL),
    });
    await flush();
    expect(shownItems()).toEqual(['global item']);

    isolated = true;
    emitStorageChange(ISOLATION_ON, 'sync');
    await flush();
    // The old scope's content is hidden before the new one has loaded.
    expect(shownItems()).toEqual([]);
    await wait(60);
    expect(shownItems()).toEqual(['A item']);

    const writeText = vi.fn(async (_text: string) => undefined);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    document.querySelectorAll<HTMLButtonElement>('.gv-rp-actions button')[1].click();
    expect(writeText.mock.calls[0][0]).toContain('A item');
    expect(writeText.mock.calls[0][0]).not.toContain('global item');
  });

  it('ignores a slow load for a scope that is no longer current', async () => {
    const shared = sharedStorage({
      [GLOBAL]: packOf('global item'),
      [ACCOUNT_A]: packOf('A item'),
    });
    let isolated = false;
    stop = startResearchPack({
      pageUrl: geminiPageUrl,
      store: gated(shared.store, { load: GLOBAL, ms: 40 }),
      resolveKey: async () => (isolated ? ACCOUNT_A : GLOBAL),
    });

    isolated = true;
    emitStorageChange(ISOLATION_ON, 'sync');
    await flush();
    expect(shownItems()).toEqual(['A item']);

    await wait(60);
    expect(shownItems()).toEqual(['A item']);
  });

  it('keeps a newer add on screen when an older load of the same scope lands after it', async () => {
    const shared = sharedStorage();
    // Each load reads storage at once but answers only when released, like a slow
    // storage read that was issued before the add was saved.
    const releases: Array<() => void> = [];
    const store: ResearchPackStore = {
      load: async (key) => {
        const snapshot = await shared.store.load(key);
        await new Promise<void>((resolve) => releases.push(resolve));
        return snapshot;
      },
      apply: (key, op) => shared.store.apply(key, op),
    };
    const writeText = vi.fn(async (_text: string) => undefined);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    const host = turn('<p>Fresh answer.</p>');
    stop = startResearchPack({ pageUrl: geminiPageUrl, store, resolveKey: async () => GLOBAL });
    await flush();

    clickAdd(host);
    await flush();
    expect(shared.at(GLOBAL)).toHaveLength(1);
    expect(shownItems()).toHaveLength(1);

    for (const release of releases.splice(0)) release();
    await flush();

    expect(shownItems()).toHaveLength(1);
    // Copy is the second footer button (Insert, Copy, Download, Clear).
    document.querySelectorAll<HTMLButtonElement>('.gv-rp-actions button')[1].click();
    expect(writeText.mock.calls[0][0]).toContain('Fresh answer.');
  });

  it('never puts an older snapshot back after a newer add has rendered', async () => {
    // Storage that reports every write like chrome.storage.onChanged does.
    const data = new Map<string, unknown>();
    const area: ResearchPackStorageArea = {
      get: async (key) => (data.has(key) ? { [key]: structuredClone(data.get(key)) } : {}),
      set: async (items) => {
        for (const [key, value] of Object.entries(items)) {
          const oldValue = data.get(key);
          data.set(key, structuredClone(value));
          emitStorageChange({ [key]: { oldValue, newValue: structuredClone(value) } }, 'local');
        }
      },
    };
    const owner = createResearchPackOwner({ area });
    // Every load after the first reads storage at once but answers late.
    const held: Array<() => void> = [];
    let loads = 0;
    const store: ResearchPackStore = {
      load: async (key) => {
        loads += 1;
        const snapshot = await owner.load(key);
        if (loads > 1) await new Promise<void>((resolve) => held.push(resolve));
        return snapshot;
      },
      apply: (key, op) => owner.apply(key, op),
    };
    const writeText = vi.fn(async (_text: string) => undefined);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    const first = turn('<p>First answer.</p>', 'First question?');
    const second = turn('<p>Second answer.</p>', 'Second question?');
    stop = startResearchPack({ pageUrl: geminiPageUrl, store, resolveKey: async () => GLOBAL });
    await flush();

    clickAdd(first);
    clickAdd(second);
    await wait(20);
    // The load started by the first write lands while the later one is still out.
    held.shift()?.();
    await flush();

    expect((data.get(GLOBAL) as ResearchPack).items).toHaveLength(2);
    expect(shownItems()).toHaveLength(2);
    document.querySelectorAll<HTMLButtonElement>('.gv-rp-actions button')[1].click();
    expect(writeText.mock.calls[0][0]).toContain('First answer.');
    expect(writeText.mock.calls[0][0]).toContain('Second answer.');
    for (const release of held.splice(0)) release();
  });

  it('writes an answer to the account it was added under, even if the page switches first', async () => {
    const shared = sharedStorage();
    const resolveKey = vi.fn(async (context: ResearchPackScopeContext) => {
      await wait(5);
      return context.routeUserId === '1' ? ACCOUNT_B : ACCOUNT_A;
    });
    const host = turn('<p>Asked under account 0.</p>');
    stop = startResearchPack({
      pageUrl: geminiPageUrl,
      store: gated(shared.store, { apply: ACCOUNT_A, ms: 40 }),
      resolveKey,
    });

    clickAdd(host);
    history.pushState(null, '', '/u/1/app');
    emitStorageChange(ISOLATION_ON, 'sync');
    await wait(80);

    expect(shared.at(ACCOUNT_A).map((item) => item.text)).toEqual(['Asked under account 0.']);
    expect(shared.at(ACCOUNT_B)).toEqual([]);
    // The late reply for account 0 must not show up in account 1's panel.
    expect(shownItems()).toEqual([]);
  });

  it('saves unsaved typing to the pack it was typed in, then clears the box for the new scope', async () => {
    const shared = sharedStorage({
      [GLOBAL]: packOf('global item'),
      [ACCOUNT_A]: packOf('A item'),
    });
    let isolated = false;
    stop = startResearchPack({
      pageUrl: geminiPageUrl,
      store: shared.store,
      resolveKey: async () => (isolated ? ACCOUNT_A : GLOBAL),
    });
    await flush();

    const textarea = document.querySelector<HTMLTextAreaElement>('#gv-rp-instruction')!;
    textarea.value = 'Typed for the global pack';
    textarea.dispatchEvent(new Event('input', { bubbles: true }));
    isolated = true;
    emitStorageChange(ISOLATION_ON, 'sync');
    await wait(10);

    expect(shared.instruction(GLOBAL)).toBe('Typed for the global pack');
    expect(shared.instruction(ACCOUNT_A)).toBe('');
    expect(textarea.value).toBe('');
  });

  it('reads and writes nothing on a page outside Gemini', async () => {
    const store: ResearchPackStore = { load: vi.fn(), apply: vi.fn() };
    const host = turn('<p>Not a Gemini page.</p>');
    // The real key resolver: no account platform, so no storage key.
    stop = startResearchPack({ pageUrl: () => 'https://example.com/u/0/app', store });
    await flush();

    clickAdd(host);
    await flush();

    expect(chrome.storage.sync.get).not.toHaveBeenCalled();
    expect(store.load).not.toHaveBeenCalled();
    expect(store.apply).not.toHaveBeenCalled();
    expect(toastDriver.all().map((toast) => toast.tone)).toEqual(['error']);
  });

  it('reads and writes nothing when the scope cannot be resolved', async () => {
    const store: ResearchPackStore = { load: vi.fn(), apply: vi.fn() };
    const host = turn('<p>Unscoped.</p>');
    stop = startResearchPack({
      pageUrl: geminiPageUrl,
      store,
      resolveKey: async () => {
        throw new Error('isolation setting unreadable');
      },
    });
    await flush();

    clickAdd(host);
    await flush();

    expect(store.load).not.toHaveBeenCalled();
    expect(store.apply).not.toHaveBeenCalled();
    expect(toastDriver.all().map((toast) => toast.tone)).toEqual(['error']);
  });

  describe('when the account email shows up after the scope was bound', () => {
    const ACCOUNT_B_EMAIL = buildScopedStorageKey(StorageKeys.RESEARCH_PACK, 'email:b');
    // A reused /u/0 route still aliases the previous account A until B's email is seen.
    const staleRouteAlias = async (context: ResearchPackScopeContext) =>
      context.email === 'b@example.com' ? ACCOUNT_B_EMAIL : ACCOUNT_A;
    const showEmail = (email: string): HTMLElement => {
      const account = document.createElement('div');
      account.setAttribute('aria-label', `Google Account (${email})`);
      document.body.appendChild(account);
      return account;
    };
    const copyButton = () =>
      document.querySelectorAll<HTMLButtonElement>('.gv-rp-actions button')[1];

    it('moves to the pack of the account the email names', async () => {
      const shared = sharedStorage({
        [ACCOUNT_A]: packOf('A item'),
        [ACCOUNT_B_EMAIL]: packOf('B item'),
      });
      const writeText = vi.fn(async (_text: string) => undefined);
      Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
      stop = startResearchPack({
        pageUrl: geminiPageUrl,
        store: shared.store,
        resolveKey: staleRouteAlias,
      });
      await flush();
      expect(shownItems()).toEqual(['A item']);

      showEmail('b@example.com');
      await wait(350);
      await flush();
      expect(shownItems()).toEqual(['B item']);

      const host = turn('<p>Answer for B.</p>');
      await wait(350);
      clickAdd(host);
      await flush();
      expect(shared.at(ACCOUNT_B_EMAIL).map((item) => item.text)).toEqual([
        'B item',
        'Answer for B.',
      ]);
      expect(shared.at(ACCOUNT_A).map((item) => item.text)).toEqual(['A item']);

      copyButton().click();
      expect(writeText.mock.calls[0][0]).toContain('B item');
      expect(writeText.mock.calls[0][0]).not.toContain('A item');
    });

    it('adds to the account the email names even before the page rescans', async () => {
      const shared = sharedStorage({ [ACCOUNT_A]: packOf('A item') });
      const host = turn('<p>Clicked as soon as the email appeared.</p>');
      stop = startResearchPack({
        pageUrl: geminiPageUrl,
        store: shared.store,
        resolveKey: staleRouteAlias,
      });
      await flush();

      showEmail('b@example.com');
      clickAdd(host);
      await flush();

      expect(shared.at(ACCOUNT_B_EMAIL).map((item) => item.text)).toEqual([
        'Clicked as soon as the email appeared.',
      ]);
      expect(shared.at(ACCOUNT_A).map((item) => item.text)).toEqual(['A item']);
    });

    it('adds to the account of the latest email while an older email is still being checked', async () => {
      const ACCOUNT_C_EMAIL = buildScopedStorageKey(StorageKeys.RESEARCH_PACK, 'email:c');
      const shared = sharedStorage({ [ACCOUNT_A]: packOf('A item') });
      const resolveKey = async (context: ResearchPackScopeContext) => {
        if (context.email === 'b@example.com') {
          await wait(80);
          return ACCOUNT_B_EMAIL;
        }
        return context.email === 'c@example.com' ? ACCOUNT_C_EMAIL : ACCOUNT_A;
      };
      const host = turn('<p>Asked as C.</p>');
      stop = startResearchPack({ pageUrl: geminiPageUrl, store: shared.store, resolveKey });
      await flush();

      const account = showEmail('b@example.com');
      // The rescan starts checking B, which takes 80ms; C signs in meanwhile.
      await wait(330);
      account.setAttribute('aria-label', 'Google Account (c@example.com)');
      clickAdd(host);
      await wait(120);

      expect(shared.at(ACCOUNT_C_EMAIL).map((item) => item.text)).toEqual(['Asked as C.']);
      expect(shared.at(ACCOUNT_B_EMAIL)).toEqual([]);
      expect(shared.at(ACCOUNT_A).map((item) => item.text)).toEqual(['A item']);
      await flush();
      expect(shownItems()).toEqual(['Asked as C.']);
    });

    it('locks editing until the new account pack has loaded, so the load cannot overwrite typing', async () => {
      const shared = sharedStorage({
        [ACCOUNT_A]: packOf('A item'),
        [ACCOUNT_B_EMAIL]: { ...packOf('B item'), instruction: 'B instruction' },
      });
      stop = startResearchPack({
        pageUrl: geminiPageUrl,
        store: gated(shared.store, { load: ACCOUNT_B_EMAIL, ms: 200 }),
        resolveKey: staleRouteAlias,
      });
      await flush();
      const textarea = document.querySelector<HTMLTextAreaElement>('#gv-rp-instruction')!;

      showEmail('b@example.com');
      // The rescan switches to B; B's pack is still loading.
      await wait(350);
      expect(shownItems()).toEqual([]);
      expect(textarea.value).toBe('');
      expect(textarea.disabled).toBe(true);
      expect(
        Array.from(document.querySelectorAll<HTMLButtonElement>('.gv-rp-actions button')).every(
          (button) => button.disabled,
        ),
      ).toBe(true);

      await wait(250);
      await flush();
      expect(shownItems()).toEqual(['B item']);
      expect(textarea.disabled).toBe(false);
      expect(textarea.value).toBe('B instruction');
      expect(shared.instruction(ACCOUNT_B_EMAIL)).toBe('B instruction');
    });

    it('keeps the panel and the typing untouched when the email resolves to the same pack', async () => {
      const shared = sharedStorage({ [GLOBAL]: packOf('global item') });
      const resolveKey = vi.fn(async (_context: ResearchPackScopeContext) => GLOBAL);
      stop = startResearchPack({ pageUrl: geminiPageUrl, store: shared.store, resolveKey });
      await flush();
      const textarea = document.querySelector<HTMLTextAreaElement>('#gv-rp-instruction')!;
      textarea.focus();
      textarea.value = 'Still typing';
      textarea.dispatchEvent(new Event('input', { bubbles: true }));

      showEmail('b@example.com');
      await wait(350);
      await flush();

      expect(resolveKey).toHaveBeenCalledWith(expect.objectContaining({ email: 'b@example.com' }));
      expect(shownItems()).toEqual(['global item']);
      expect(textarea.value).toBe('Still typing');
      expect(toastDriver.all()).toEqual([]);
    });

    it('still shows the first load when the email appears while it is in flight', async () => {
      const shared = sharedStorage({ [GLOBAL]: packOf('global item') });
      stop = startResearchPack({
        pageUrl: geminiPageUrl,
        store: gated(shared.store, { load: GLOBAL, ms: 400 }),
        resolveKey: async () => GLOBAL,
      });

      showEmail('b@example.com');
      await wait(450);
      await flush();

      expect(shownItems()).toEqual(['global item']);
    });
  });
});
