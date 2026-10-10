import { describe, expect, it } from 'vitest';

import { StorageKeys } from '@/core/types/common';
import type { PromptItem } from '@/core/types/sync';
import { PromptImportExportService } from '@/features/backup/services/PromptImportExportService';
import {
  createPromptLibraryClient,
  handlePromptLibraryApplyMessage,
} from '@/features/prompt/library/promptLibraryMessages';
import {
  type PromptLibraryArea,
  createPromptLibraryOwner,
} from '@/features/prompt/library/promptLibraryOwner';
import { createTemplateLibrary } from '@/features/researchPack/services/templates';
import { mergeCloudPrompts } from '@/pages/background/promptDriveMerge';

import { type PromptLibraryState, createPromptLibraryState } from '../promptLibraryState';

const KEY = StorageKeys.PROMPT_ITEMS;
const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const prompt = (id: string, text: string, extra: Partial<PromptItem> = {}): PromptItem => ({
  id,
  name: id.toUpperCase(),
  text,
  tags: [],
  createdAt: 1,
  ...extra,
});

/**
 * One browser profile: chrome.storage.local whose reads and writes take a
 * moment, so overlapping writers can race, and which tells every open tab
 * about each write as `storage.onChanged` does. One background owner.
 */
function profile(initial: unknown) {
  let stored: unknown = structuredClone(initial);
  const tabs: PromptLibraryState[] = [];
  /** Storage calls and change events still on their way. */
  let busy = 0;
  const later = async <T>(ms: number, run: () => T): Promise<T> => {
    busy += 1;
    try {
      await wait(ms);
      return run();
    } finally {
      busy -= 1;
    }
  };
  const area: PromptLibraryArea = {
    get: (key) =>
      later(0, () =>
        key === KEY && stored !== undefined ? { [KEY]: structuredClone(stored) } : {},
      ),
    set: (items) =>
      later(5, () => {
        stored = structuredClone(items[KEY]);
        // onChanged reaches each tab a little later, as an event does.
        const value = structuredClone(stored);
        void later(1, () => {
          for (const tab of tabs) tab.receive(structuredClone(value));
        });
      }),
  };
  const owner = createPromptLibraryOwner({ area });
  const send = createPromptLibraryClient((request) =>
    handlePromptLibraryApplyMessage(structuredClone(request), owner),
  ).apply;
  let id = 0;

  /** A Prompt Manager tab on any site. */
  async function openTab(clock = () => 100): Promise<PromptLibraryState> {
    const state = createPromptLibraryState({
      read: async () => ((await area.get(KEY))[KEY] ?? []) as PromptItem[],
      apply: send,
      now: clock,
      makeId: () => `pm-${++id}`,
    });
    await state.load();
    tabs.push(state);
    return state;
  }

  /** Waits until no storage call or change event is left, however long that takes. */
  async function settle(): Promise<void> {
    for (let idle = 0; idle < 3;) {
      await wait(0);
      idle = busy === 0 ? idle + 1 : 0;
    }
  }

  return { owner, area, send, openTab, settle, stored: () => stored as PromptItem[] };
}

describe('Prompt Manager writes alongside other writers', () => {
  it('keeps a Prompt Manager edit and a template saved in another tab', async () => {
    const browser = profile([prompt('a', 'Alpha'), prompt('b', 'Beta')]);
    const pm = await browser.openTab();
    const templates = createTemplateLibrary({
      area: browser.area,
      key: KEY,
      apply: browser.send,
      makeId: () => 'template',
    });

    await Promise.all([
      pm.edit('a', { name: 'A', text: 'Alpha, edited', tags: [] }),
      templates.save([{ name: 'Review', text: 'Compare the sources.' }]),
    ]);
    await browser.settle();

    const stored = browser.stored();
    expect(stored.map((item) => item.id).sort()).toEqual(['a', 'b', 'template']);
    expect(stored.find((item) => item.id === 'a')?.text).toBe('Alpha, edited');
    expect(pm.items).toEqual(stored);
  });

  it('keeps every prompt when a reorder and a Drive merge overlap, and a later reorder holds', async () => {
    const browser = profile([prompt('a', 'A'), prompt('b', 'B'), prompt('c', 'C')]);
    const pm = await browser.openTab();

    // The drop lands while the merge is already reading the library.
    const merging = mergeCloudPrompts(
      browser.owner,
      PromptImportExportService.exportToPayload([prompt('cloud', 'From Drive')]),
    );
    await wait(1);
    pm.reorder([pm.items[2], pm.items[0], pm.items[1]]);
    await merging;
    await browser.settle();
    const ids = browser.stored().map((item) => item.id);
    expect([...ids].sort()).toEqual(['a', 'b', 'c', 'cloud']);
    expect(ids.filter((id) => id !== 'cloud')).toEqual(['c', 'a', 'b']);
    expect(pm.items).toEqual(browser.stored());

    // A reorder made after the merge is what stays.
    const order = ['c', 'a', 'cloud', 'b'];
    pm.reorder(order.map((id) => pm.items.find((item) => item.id === id)!));
    await browser.settle();
    expect(browser.stored().map((item) => item.id)).toEqual(order);
    expect(pm.items).toEqual(browser.stored());
  });

  it('keeps edits that two Prompt Manager tabs make to different prompts', async () => {
    const browser = profile([prompt('a', 'Alpha'), prompt('b', 'Beta')]);
    const first = await browser.openTab();
    const second = await browser.openTab();

    await Promise.all([
      first.edit('a', { name: 'A', text: 'Alpha from tab one', tags: [] }),
      second.edit('b', { name: 'B', text: 'Beta from tab two', tags: [] }),
    ]);
    await browser.settle();

    expect(browser.stored().map((item) => item.text)).toEqual([
      'Alpha from tab one',
      'Beta from tab two',
    ]);
    expect(first.items).toEqual(browser.stored());
    expect(second.items).toEqual(browser.stored());
  });

  it('keeps pins, deletes and adds made in quick succession on two tabs', async () => {
    const browser = profile([prompt('a', 'A'), prompt('b', 'B'), prompt('c', 'C')]);
    const first = await browser.openTab();
    const second = await browser.openTab();

    first.togglePin('a');
    second.remove('b');
    const added = first.add({ name: 'D', text: 'D', tags: [] });
    second.togglePin('c');
    await added;
    await browser.settle();

    const stored = browser.stored();
    expect(stored.map((item) => item.id).sort()).toEqual(['a', 'c', 'pm-1']);
    expect(
      stored
        .filter((item) => item.pinnedAt !== undefined)
        .map((item) => item.id)
        .sort(),
    ).toEqual(['a', 'c']);
    expect(first.items).toEqual(stored);
    expect(second.items).toEqual(stored);
  });
});
