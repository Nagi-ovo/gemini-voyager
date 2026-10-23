// @vitest-environment jsdom
// @vitest-environment-options { "url": "https://chatgpt.com/" }
/**
 * Turning ChatGPT's folders off through `PluginHost`: at every point of their
 * start-up, and with ChatGPT's row menu open or closing.
 */
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { settle } from '@/tests/memoryStorage';
import { initI18n } from '@/utils/i18n';

import { siteFolderLeases } from '../siteSession';
import { type SidebarFixture, mountSidebarFixture } from './chatgpt/chatgptSidebarFixture';
import {
  DATA,
  ENTRY,
  FAB,
  FILED_ATTRIBUTE,
  PANEL,
  PICKER,
  type Page,
  ROWS,
  SECTION,
  TARGET,
  installStorage,
  nextPass,
  openPage,
  restoreStorage,
} from './chatgptHarness';

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
let sidebar: SidebarFixture;

const filedIds = (data: typeof DATA): string[] =>
  Object.values(data.folderContents).flatMap((bucket) =>
    bucket.map((entry) => entry.conversationId),
  );

/** Nothing of the folders is on the page, no folder session is held, and a menu gets no entry. */
async function expectGone(): Promise<void> {
  expect(document.querySelector(SECTION)).toBeNull();
  expect(document.querySelector(FAB)).toBeNull();
  expect(document.querySelector(PANEL)).toBeNull();
  expect(document.querySelector(PICKER)).toBeNull();
  expect(document.querySelector(ENTRY)).toBeNull();
  expect(document.querySelector(`[${FILED_ATTRIBUTE}]`)).toBeNull();
  expect(siteFolderLeases('chatgpt')).toBe(0);
  const menu = sidebar.openMenu(TARGET.id);
  await nextPass();
  expect(menu.querySelector(ENTRY)).toBeNull();
  menu.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
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
  sidebar = mountSidebarFixture(ROWS);
});

afterEach(async () => {
  await page?.close();
  page = null;
  sidebar.destroy();
  document.body.replaceChildren();
  restoreStorage();
  vi.restoreAllMocks();
});

describe('ChatGPT folders turned off', () => {
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

      expect(page.stored().folders, `read ${hold}`).toMatchObject(DATA.folders);
      expect(filedIds(page.stored()), `read ${hold}`).toEqual(filedIds(DATA));
      await expectGone();
      await page.close();
      page = null;
    }
  });

  it("takes its entry out of ChatGPT's open menu and stops adding one", async () => {
    page = await openPage(installStorage(undefined));
    await nextPass();
    const menu = sidebar.openMenu(TARGET.id);
    await nextPass();
    expect(menu.querySelectorAll(ENTRY)).toHaveLength(1);

    await page.setPlugin(false);
    await nextPass();

    expect(menu.querySelector(ENTRY)).toBeNull();
    menu.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await nextPass();
    await expectGone();
  });

  it('opens no picker when turned off while the menu is still closing', async () => {
    page = await openPage(installStorage(undefined));
    await nextPass();
    const menu = sidebar.openMenu(TARGET.id, { exitFrames: 5 });
    await nextPass();
    // Focus never returns to the trigger, so the move still waits when the folders go off.
    vi.spyOn(HTMLElement.prototype, 'focus').mockImplementation(() => {});
    menu.querySelector<HTMLElement>(ENTRY)!.click();

    await page.setPlugin(false);
    // Past the frames a closing menu is waited for.
    for (let i = 0; i < 40; i += 1) await new Promise((resolve) => requestAnimationFrame(resolve));
    await nextPass();

    expect(document.querySelector(PICKER)).toBeNull();
    expect(filedIds(page.stored())).toEqual(filedIds(DATA));
  });
});
