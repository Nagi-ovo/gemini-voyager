// @vitest-environment jsdom
// @vitest-environment-options { "url": "https://chat.deepseek.com/" }
/**
 * Turning DeepSeek's folders off and on through `PluginHost`, at every point
 * of their start-up and while a write is still landing.
 */
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { StorageKeys } from '@/core/types/common';
import { fakeTransfer } from '@/pages/content/folder/floatingTree/__tests__/treeDriver';
import { settle } from '@/tests/memoryStorage';
import { initI18n } from '@/utils/i18n';

import { siteFolderLeases } from '../siteSession';
import {
  DATA,
  FAB,
  FILED_ATTRIBUTE,
  PANEL,
  type Page,
  ROWS,
  SECTION,
  installStorage,
  mountSidebar,
  nextPass,
  openPage,
  restoreStorage,
} from './deepseekHarness';

vi.mock('webextension-polyfill', () => ({
  default: {
    get storage() {
      return globalThis.chrome.storage;
    },
    runtime: { id: 'test-extension-id', getURL: (path: string) => path },
    i18n: { getUILanguage: () => 'en' },
  },
}));

type Area = { get: (keys?: unknown) => Promise<Record<string, unknown>> };

let page: Page | null = null;

const filedIds = (data: typeof DATA): string[] =>
  Object.values(data.folderContents).flatMap((bucket) =>
    bucket.map((entry) => entry.conversationId),
  );
const filed = (open: Page): string[] => filedIds(open.stored());

/** Nothing of the folders is on the page and no folder session is held. */
function expectGone(): void {
  expect(document.querySelector(SECTION)).toBeNull();
  expect(document.querySelector(FAB)).toBeNull();
  expect(document.querySelector(PANEL)).toBeNull();
  expect(document.querySelector(`[${FILED_ATTRIBUTE}]`)).toBeNull();
  expect(siteFolderLeases('deepseek')).toBe(0);
}

/**
 * Counts every storage read from now on; with `hold`, the read numbered
 * `hold` waits until `release()`.
 */
function watchReads(hold?: number) {
  let reads = 0;
  let release: () => void = () => {};
  const held = new Promise<void>((resolve) => (release = resolve));
  let reached: () => void = () => {};
  const atHold = new Promise<void>((resolve) => (reached = resolve));
  for (const area of [page!.memory.api.local, page!.memory.api.sync] as unknown as Area[]) {
    const get = area.get.bind(area);
    area.get = async (keys) => {
      reads += 1;
      if (reads === hold) {
        reached();
        await held;
      }
      return get(keys);
    };
  }
  return { reads: () => reads, atHold, release };
}

beforeAll(async () => {
  installStorage(false);
  await initI18n();
  restoreStorage();
});

beforeEach(() => {
  history.replaceState(null, '', '/');
  mountSidebar();
});

afterEach(async () => {
  await page?.close();
  page = null;
  document.body.replaceChildren();
  restoreStorage();
  vi.restoreAllMocks();
});

describe('DeepSeek folders turned off and on', () => {
  it('leaves nothing behind when turned off during any await of its start-up', async () => {
    // How many reads turning the folders on takes, with nothing held.
    page = await openPage(installStorage(false, { hideFiledChats: true }));
    await nextPass();
    const count = watchReads();
    await page.setPlugin(true, { hideFiledChats: true });
    await nextPass();
    expect(document.querySelector(SECTION)).not.toBeNull();
    const reads = count.reads();
    expect(reads).toBeGreaterThan(0);
    await page.close();

    for (let hold = 1; hold <= reads; hold += 1) {
      page = await openPage(installStorage(false, { hideFiledChats: true }));
      await nextPass();
      const watch = watchReads(hold);
      await page.setPlugin(true, { hideFiledChats: true });
      await Promise.race([watch.atHold, nextPass()]);
      await page.setPlugin(false, { hideFiledChats: true });
      await settle(5);
      watch.release();
      await nextPass();

      // At most the filed row's title was brought up to date before turning off.
      expect(page.stored().folders, `read ${hold}`).toMatchObject(DATA.folders);
      expect(filed(page), `read ${hold}`).toEqual(filedIds(DATA));
      expectGone();
      await page.close();
      page = null;
    }
  });

  it('lands a write still in flight before turning back on, and keeps only the new surfaces', async () => {
    page = await openPage(installStorage(true));
    await nextPass();
    const { memory } = page;
    // Hold the next folder save, the one the drop below starts.
    const local = memory.api.local as unknown as { set: (items: object) => Promise<void> };
    const set = local.set.bind(local);
    let landSave: () => void = () => {};
    local.set = async (items) => {
      if (StorageKeys.FOLDER_DATA_DEEPSEEK in items) {
        local.set = set;
        await new Promise<void>((resolve) => (landSave = resolve));
      }
      return set(items);
    };

    const target = ROWS[1];
    const transfer = fakeTransfer({ 'text/uri-list': 'https://chat.deepseek.com/' });
    const drag = (type: string, at: EventTarget) => {
      const event = new Event(type, { bubbles: true, cancelable: true, composed: true });
      Object.defineProperties(event, { dataTransfer: { value: transfer }, clientY: { value: 10 } });
      at.dispatchEvent(event);
    };
    drag('dragstart', document.querySelector(`.list a[href$="${target.id}"] .title`)!);
    const folder = document
      .querySelector(SECTION)!
      .shadowRoot!.querySelector('.gv-floating-folder-panel__folder-header')!;
    drag('dragover', folder);
    drag('drop', folder);
    await settle(10);

    await page.setPlugin(false);
    await settle(5);
    await page.setPlugin(true);
    await nextPass();
    // The successor waits for the save, so it cannot load the bucket without it.
    expect(filed(page)).toEqual(filedIds(DATA));

    landSave();
    await nextPass();
    await nextPass();

    expect(page.stored().folderContents.f1.map((entry) => entry.conversationId)).toContain(
      `deepseek:conv:${target.id}`,
    );
    const sections = document.querySelectorAll(SECTION);
    expect(sections).toHaveLength(1);
    expect(
      [...sections[0].shadowRoot!.querySelectorAll('a.gv-floating-folder-panel__conv-title')].map(
        (title) => title.getAttribute('href'),
      ),
    ).toContain(`https://chat.deepseek.com/a/chat/s/${target.id}`);
    expect(siteFolderLeases('deepseek')).toBe(1);
  });
});
