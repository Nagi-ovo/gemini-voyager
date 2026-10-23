/**
 * The storage and repository behind the repository resumption tests: a
 * `FolderRepository` per site on an in-memory `chrome.storage`, on fake timers,
 * that a test suspends by turning `feature.enabled` off and resumes with
 * `resume()`.
 *
 * Each test file maps `webextension-polyfill` to `chrome`, calls
 * `installFolderRepositoryResume()` and runs its cases over `RESUME_SITES`.
 */
import { afterEach, beforeEach, expect, vi } from 'vitest';

import type { FolderData } from '@/core/types/folder';
import { CHATGPT_FOLDER_CONFIG } from '@/pages/content/folder/pluginSiteFolderConfigs';
import { type MemoryStorage, createMemoryStorage, settle } from '@/tests/memoryStorage';

import { FolderRepository } from '../FolderRepository';
import {
  AISTUDIO_FOLDER_CONFIG,
  GEMINI_FOLDER_CONFIG,
  type PlatformFolderConfig,
} from '../platformFolderConfig';
import { AIStudioFolderStorageAdapter } from '../storage/AIStudioFolderStorageAdapter';
import { LocalStorageFolderAdapter } from '../storage/FolderStorageAdapter';

export const RESUME_SITES = [
  {
    site: 'Gemini',
    config: GEMINI_FOLDER_CONFIG,
    conversationId: 'gemini:conv:c1',
    url: 'https://gemini.google.com/app/c1',
  },
  {
    site: 'AI Studio',
    config: AISTUDIO_FOLDER_CONFIG,
    conversationId: 'c1',
    url: 'https://aistudio.google.com/prompts/c1',
  },
  {
    site: 'ChatGPT',
    config: CHATGPT_FOLDER_CONFIG,
    conversationId: 'c1',
    url: 'https://chatgpt.com/c/c1',
  },
];

export function data(name: string): FolderData {
  return {
    folders: [
      {
        id: 'folder',
        name,
        parentId: null,
        isExpanded: true,
        sortIndex: 0,
        createdAt: 1,
        updatedAt: 1,
      },
    ],
    folderContents: { folder: [] },
  };
}

export let memory: MemoryStorage;
let originalStorage: typeof chrome.storage;
export let repository: FolderRepository;
/** Whether the folder feature is on; a test turns it off to suspend the repository. */
export const feature = { enabled: true };

export function installFolderRepositoryResume(): void {
  beforeEach(() => {
    vi.useFakeTimers();
    memory = createMemoryStorage();
    originalStorage = chrome.storage;
    chrome.storage = memory.api;
    localStorage.clear();
    feature.enabled = true;
  });

  afterEach(async () => {
    repository?.destroy();
    await settle(30);
    chrome.storage = originalStorage;
    localStorage.clear();
    vi.restoreAllMocks();
    vi.clearAllTimers();
    vi.useRealTimers();
  });
}

export async function ready(
  config: PlatformFolderConfig,
  onRecovery = vi.fn(),
  initial = data('Initial'),
  storageKey = config.storageKey,
) {
  memory.values.local.set(storageKey, initial);
  repository = new FolderRepository(
    config,
    config.platform === 'gemini'
      ? new LocalStorageFolderAdapter()
      : new AIStudioFolderStorageAdapter(),
    {
      onChange: () => {},
      onRecovery,
      onExternalChange: () => {
        if (feature.enabled) void repository.loadData();
      },
      onAccountReleased: () => {},
      isEnabled: () => feature.enabled,
    },
  );
  await repository.init();
  await settle(30);
  expect(repository.canEdit).toBe(true);
}

export async function resume() {
  feature.enabled = true;
  await repository.refreshAccountScope();
  await repository.loadData();
  await settle(30);
}
