// @vitest-environment jsdom
// @vitest-environment-options { "url": "https://claude.ai/recents" }
/**
 * Turning Claude's folders off through `PluginHost`: at every point of their
 * start-up, and with Claude's row menu open or closing.
 */
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { VOYAGER_DRAG_MIME } from '@/pages/content/folder/dragPayload';
import { fakeTransfer } from '@/pages/content/folder/floatingTree/__tests__/treeDriver';
import { settle } from '@/tests/memoryStorage';
import { initI18n } from '@/utils/i18n';

import { siteFolderLeases } from '../siteSession';
import {
  type ClaudeSidebar,
  DATA,
  ENTRY,
  FAB,
  FILED_ATTRIBUTE,
  PANEL,
  PICKER,
  type Page,
  RECENTS,
  SECTION,
  installStorage,
  mountSidebar,
  nextPass,
  openPage,
  restoreStorage,
} from './claudeHarness';

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

const TARGET = RECENTS[1];
let page: Page | null = null;
let sidebar: ClaudeSidebar;

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
  expect(siteFolderLeases('claude')).toBe(0);
  const menu = sidebar.openMenu(TARGET.id);
  await nextPass();
  expect(menu.querySelector(ENTRY)).toBeNull();
  menu.closest('[data-base-ui-portal]')?.remove();
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

/** What a drag started at `at` carries as Voyager's drag data. */
function dragFrom(at: Element): string {
  const event = new Event('dragstart', { bubbles: true, cancelable: true, composed: true });
  const transfer = fakeTransfer({ 'text/uri-list': 'https://claude.ai/' });
  Object.defineProperty(event, 'dataTransfer', { value: transfer });
  at.dispatchEvent(event);
  return transfer.getData(VOYAGER_DRAG_MIME);
}

beforeAll(async () => {
  installStorage(false);
  await initI18n();
  restoreStorage();
});

beforeEach(() => {
  history.replaceState(null, '', '/recents');
  sidebar = mountSidebar();
});

afterEach(async () => {
  await page?.close();
  page = null;
  document.body.replaceChildren();
  restoreStorage();
  vi.restoreAllMocks();
});

describe('Claude folders turned off', () => {
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

  it("takes its entry out of Claude's open menu and stops adding one", async () => {
    page = await openPage(installStorage(true));
    await nextPass();
    const menu = sidebar.openMenu(TARGET.id);
    await nextPass();
    expect(menu.querySelectorAll(ENTRY)).toHaveLength(1);

    await page.setPlugin(false);
    await nextPass();

    expect(menu.querySelector(ENTRY)).toBeNull();
    menu.closest('[data-base-ui-portal]')?.remove();
    await expectGone();
  });

  it('opens no picker when turned off while the menu is still closing', async () => {
    page = await openPage(installStorage(true));
    await nextPass();
    const menu = sidebar.openMenu(TARGET.id);
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

describe('Claude rows dragged onto a folder', () => {
  it("carry the row's chat from its link, and nothing from its menu button", async () => {
    page = await openPage(installStorage(true));
    await nextPass();
    const row = document.querySelector(
      `[data-testid="sidebar"] [data-row-key="chat:${TARGET.id}"]`,
    )!;

    expect(dragFrom(row.querySelector('[data-row-label] span')!)).toContain(
      `claude:conv:${TARGET.id}`,
    );
    expect(dragFrom(row.querySelector('button')!)).toBe('');
  });
});
