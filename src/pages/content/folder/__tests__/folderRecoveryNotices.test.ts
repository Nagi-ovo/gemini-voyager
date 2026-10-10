import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { DataBackupService } from '@/core/services/DataBackupService';
import { StorageKeys } from '@/core/types/common';
import type { FolderData } from '@/core/types/folder';
import { validateFolderData } from '@/features/folder/model/folderData';
import { toastDriver } from '@/tests/toastDriver';

import { FolderManager } from '../manager';

vi.mock('webextension-polyfill', () => ({ default: chrome }));

const restored: FolderData = {
  folders: [
    { id: 'saved', name: 'Saved', parentId: null, isExpanded: true, createdAt: 1, updatedAt: 1 },
  ],
  folderContents: { saved: [] },
};
let manager: FolderManager;
let stored: Record<string, unknown>;

beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
  localStorage.clear();
  document.body.replaceChildren();
  stored = { [StorageKeys.FOLDER_DATA]: { folders: 'corrupt', folderContents: {} } };
  vi.mocked(chrome.storage.sync.get).mockImplementation(async () => ({
    [StorageKeys.LANGUAGE]: 'zh',
    // Gemini loads its store before deciding whether to mount the sidebar.
    geminiFolderEnabled: false,
  }));
  vi.mocked(chrome.storage.local.get).mockImplementation(async (keys: unknown) =>
    Object.fromEntries(
      (typeof keys === 'string' ? [keys] : Array.isArray(keys) ? keys : []).map((key) => [
        key,
        structuredClone(stored[key]),
      ]),
    ),
  );
  vi.mocked(chrome.storage.local.set).mockImplementation(async (values) => {
    Object.assign(stored, structuredClone(values));
  });
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  manager?.destroy();
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.restoreAllMocks();
  document.body.replaceChildren();
});

it.each([
  { outcome: 'recovered', message: '已从备份恢复文件夹数据。', tone: 'warning', duration: 7000 },
  {
    outcome: 'lost',
    message:
      '⚠️ 警告：无法加载文件夹数据。您的文件夹可能已损坏。请检查浏览器控制台以获取详细信息，并在可用时尝试从备份恢复。',
    tone: 'error',
    duration: 10000,
  },
  {
    outcome: 'unreadable',
    message: '无法加载文件夹数据，暂时只能查看，无法编辑。',
    tone: 'error',
    duration: 10000,
  },
])('Gemini shows its $outcome notice in the selected Chinese language', async (notice) => {
  if (notice.outcome === 'recovered') {
    await new DataBackupService<FolderData>(
      'gemini-folders',
      validateFolderData,
    ).createPrimaryBackup(restored);
  } else if (notice.outcome === 'unreadable') {
    vi.mocked(chrome.storage.local.get).mockImplementation(async (keys: unknown) => {
      if (keys === StorageKeys.FOLDER_DATA) throw new Error('Storage unavailable');
      return {};
    });
  }
  manager = new FolderManager();
  await manager.init();

  expect(toastDriver.all()).toMatchObject([{ message: notice.message, tone: notice.tone }]);
  expect(manager.getFolders().map(({ id }) => id)).toEqual(
    notice.outcome === 'recovered' ? ['saved'] : [],
  );
  await vi.advanceTimersByTimeAsync(notice.duration - 1);
  expect(toastDriver.messages()).toContain(notice.message);
  await vi.advanceTimersByTimeAsync(1);
  expect(toastDriver.messages()).toEqual([]);
});
