// @vitest-environment-options { "url": "https://gemini.google.com/app" }
/**
 * Gemini's folder session as the page holds it, with no folder UI attached:
 * what keeps working while the folders are switched off.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { StorageKeys } from '@/core/types/common';
import type { FolderData } from '@/core/types/folder';
import { type MemoryStorage, createMemoryStorage, settle } from '@/tests/memoryStorage';

import { geminiFolderLeases, openGeminiFolderSession } from '../geminiFolderSessions';

vi.mock('webextension-polyfill', () => ({
  default: {
    get storage() {
      return chrome.storage;
    },
    get runtime() {
      return chrome.runtime;
    },
  },
}));

const KEY = StorageKeys.FOLDER_DATA;
const stored: FolderData = {
  folders: [
    {
      id: 'work',
      name: 'Work',
      parentId: null,
      isExpanded: true,
      sortIndex: 0,
      createdAt: 1,
      updatedAt: 1,
    },
  ],
  folderContents: {
    work: [
      {
        conversationId: 'c_0123456789abcdef',
        title: 'Older',
        url: 'https://gemini.google.com/app/0123456789abcdef',
        addedAt: 1,
        sortIndex: 0,
      },
    ],
  },
};

type Listener = (message: unknown, sender: unknown, reply: (value: unknown) => void) => unknown;

let memory: MemoryStorage;
let originalStorage: typeof chrome.storage;
const releases: Array<() => Promise<void>> = [];

function open() {
  const lease = openGeminiFolderSession();
  releases.push(lease.release);
  return lease;
}

/** The popup's message listener the session registered last. */
function popupListener(): Listener {
  const calls = vi.mocked(chrome.runtime.onMessage.addListener).mock.calls;
  return calls.at(-1)![0] as unknown as Listener;
}

beforeEach(() => {
  memory = createMemoryStorage();
  originalStorage = chrome.storage;
  chrome.storage = memory.api;
  localStorage.clear();
  vi.mocked(chrome.runtime.onMessage.addListener).mockClear();
  vi.mocked(chrome.runtime.onMessage.removeListener).mockClear();
  memory.values.local.set(KEY, structuredClone(stored));
  memory.values.sync.set(StorageKeys.FOLDER_ENABLED, false);
});

afterEach(async () => {
  await Promise.all(releases.splice(0).map((release) => release()));
  chrome.storage = originalStorage;
});

describe("Gemini's folder session with the folders off", () => {
  it('files a Folder-as-Project chat on top of its folder and saves it', async () => {
    const lease = open();
    await lease.ready;

    await lease.session.ensureDataLoaded();
    expect(lease.session.getFolders().map((folder) => folder.name)).toEqual(['Work']);
    lease.session.addConversationToFolderFromNative(
      'work',
      'fedcba9876543210',
      'First send',
      'https://gemini.google.com/app/fedcba9876543210',
      false,
      undefined,
      42,
    );
    await settle();

    const saved = memory.values.local.get(KEY) as FolderData;
    const byOrder = [...saved.folderContents.work].sort((a, b) => a.sortIndex! - b.sortIndex!);
    expect(byOrder.map((c) => c.title)).toEqual(['First send', 'Older']);
    expect(byOrder[0]).toMatchObject({
      conversationId: 'fedcba9876543210',
      url: 'https://gemini.google.com/app/fedcba9876543210',
      lastTurnAt: 42,
      lastOpenedAt: expect.any(Number),
    });
  });

  it("answers the popup's cloud sync until the page's last lease goes", async () => {
    const page = open();
    await page.ready;
    const ui = open();
    expect(ui.session).toBe(page.session);
    const listener = popupListener();

    const reply = vi.fn();
    expect(listener({ type: 'gv.sync.requestData' }, {}, reply)).toBe(true);
    expect(reply).toHaveBeenCalledWith(expect.objectContaining({ ok: true, data: stored }));

    await ui.release();
    expect(geminiFolderLeases()).toBe(1);
    expect(chrome.runtime.onMessage.removeListener).not.toHaveBeenCalled();

    await page.release();
    expect(chrome.runtime.onMessage.removeListener).toHaveBeenCalledWith(listener);
    expect(memory.writes.filter((write) => write.key === KEY)).toEqual([]);
  });
});
