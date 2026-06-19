import React, { act } from 'react';
import { type Root, createRoot } from 'react-dom/client';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { StorageKeys } from '@/core/types/common';

import { GemsPinSettings } from '../GemsPinSettings';

vi.mock('@/contexts/LanguageContext', () => ({
  useLanguage: () => ({
    language: 'en',
    setLanguage: vi.fn(),
    t: (key: string) => key,
  }),
}));

type MockedChrome = typeof chrome;

interface ChromeMockOptions {
  cacheItems?: unknown;
  mruEntries?: unknown;
  pinned?: unknown;
}

function createChromeMock(options: ChromeMockOptions): {
  chrome: MockedChrome;
  syncSet: ReturnType<typeof vi.fn>;
} {
  const syncSet = vi.fn();
  const mock = {
    storage: {
      local: {
        get: vi.fn().mockImplementation((_keys: unknown, cb: (r: unknown) => void) => {
          cb({
            [StorageKeys.GV_GEMS_LIST_CACHE]: { items: options.cacheItems ?? [], cachedAt: 1 },
            [StorageKeys.GV_GEMS_MRU]: { entries: options.mruEntries ?? [] },
          });
        }),
      },
      sync: {
        get: vi.fn().mockImplementation((_defaults: unknown, cb: (r: unknown) => void) => {
          cb({ [StorageKeys.GV_GEMS_PINNED]: options.pinned ?? [] });
        }),
        set: syncSet,
      },
    },
  } as unknown as MockedChrome;
  return { chrome: mock, syncSet };
}

const gem = (id: string, name: string) => ({ id, name, href: `/gem/${id}` });

async function flushMicrotasks(): Promise<void> {
  await act(async () => {
    await Promise.resolve();
  });
}

describe('GemsPinSettings', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  afterEach(() => {
    if (root) {
      act(() => {
        root.unmount();
      });
    }
    document.body.innerHTML = '';
    vi.clearAllMocks();
  });

  async function renderWith(options: ChromeMockOptions) {
    const { chrome: mock, syncSet } = createChromeMock(options);
    (globalThis as { chrome: MockedChrome }).chrome = mock;
    await act(async () => {
      root = createRoot(container);
      root.render(<GemsPinSettings />);
    });
    await flushMicrotasks();
    return { syncSet };
  }

  it('shows the empty-state hint when no gems are cached', async () => {
    await renderWith({});
    expect(container.textContent).toContain('gemsPinnedEmpty');
  });

  it('lists cached gems as available and pins one on click', async () => {
    const { syncSet } = await renderWith({
      cacheItems: [gem('a', 'Alpha'), gem('b', 'Beta')],
    });

    expect(container.textContent).toContain('Alpha');
    expect(container.textContent).toContain('Beta');

    const pinButtons = container.querySelectorAll<HTMLButtonElement>('[title="gemsPinnedPin"]');
    expect(pinButtons).toHaveLength(2);
    await act(async () => {
      pinButtons[1].click();
    });

    expect(syncSet).toHaveBeenCalledWith({ [StorageKeys.GV_GEMS_PINNED]: ['b'] });
  });

  it('renders pinned gems first with reorder controls and persists a move', async () => {
    const { syncSet } = await renderWith({
      cacheItems: [gem('a', 'Alpha'), gem('b', 'Beta'), gem('c', 'Gamma')],
      pinned: ['a', 'b'],
    });

    const downButtons = container.querySelectorAll<HTMLButtonElement>(
      '[title="gemsPinnedMoveDown"]',
    );
    expect(downButtons).toHaveLength(2);
    await act(async () => {
      downButtons[0].click();
    });

    expect(syncSet).toHaveBeenCalledWith({ [StorageKeys.GV_GEMS_PINNED]: ['b', 'a'] });
  });

  it('unpins a gem and keeps unresolved ids from other devices', async () => {
    const { syncSet } = await renderWith({
      cacheItems: [gem('a', 'Alpha'), gem('b', 'Beta')],
      pinned: ['a', 'ghost-from-other-device', 'b'],
    });

    const unpinButtons = container.querySelectorAll<HTMLButtonElement>('[title="gemsPinnedUnpin"]');
    expect(unpinButtons).toHaveLength(2);
    await act(async () => {
      unpinButtons[0].click();
    });

    expect(syncSet).toHaveBeenCalledWith({
      [StorageKeys.GV_GEMS_PINNED]: ['b', 'ghost-from-other-device'],
    });
  });

  it('merges MRU-only gems (e.g. premade) into the available list', async () => {
    await renderWith({
      cacheItems: [gem('a', 'Alpha')],
      mruEntries: [{ ...gem('premade-x', 'Brainstormer'), lastUsedAt: 5 }],
    });

    expect(container.textContent).toContain('Brainstormer');
    expect(container.textContent).toContain('Alpha');
  });
});
