import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { StorageKeys } from '@/core/types/common';
import { hashString } from '@/core/utils/hash';
import { getTimelineHierarchyStorageKey } from '@/pages/content/timeline/hierarchyStorage';

import { BackupService } from '../BackupService';

type MockedChrome = typeof chrome;

function createChromeMock(): MockedChrome {
  return {
    storage: {
      local: {
        get: vi.fn().mockResolvedValue({
          [StorageKeys.TIMELINE_HIERARCHY]: {
            conversations: {
              'gemini:conv:test': {
                conversationUrl: 'https://gemini.google.com/app/test',
                levels: { 'turn-1': 2 },
                collapsed: ['turn-2'],
                updatedAt: 1234,
              },
            },
          },
          [getTimelineHierarchyStorageKey(`email:${hashString('user@example.com')}`)]: {
            conversations: {
              'gemini:conv:scoped': {
                conversationUrl: 'https://gemini.google.com/u/1/app/scoped',
                levels: { 'turn-3': 3 },
                collapsed: [],
                updatedAt: 5678,
              },
            },
          },
        }),
        set: vi.fn().mockResolvedValue(undefined),
        remove: vi.fn().mockResolvedValue(undefined),
      },
    },
  } as unknown as MockedChrome;
}

describe('BackupService', () => {
  beforeEach(() => {
    localStorage.clear();
    (globalThis as { chrome: MockedChrome }).chrome = createChromeMock();

    localStorage.setItem(
      'gvPromptItems',
      JSON.stringify([
        {
          id: 'prompt-1',
          text: 'Test prompt',
          tags: ['test'],
          createdAt: 1,
        },
      ]),
    );

    localStorage.setItem(
      'gvFolderData',
      JSON.stringify({
        folders: [{ id: 'folder-1', name: 'Folder 1', color: 'default', createdAt: 1 }],
        folderContents: {
          'folder-1': [
            {
              conversationId: 'conv-1',
              url: 'https://gemini.google.com/app/conv-1',
              title: 'Conversation 1',
              position: 0,
            },
          ],
        },
      }),
    );
  });

  afterEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
  });

  it('includes timeline hierarchy data in generated backup files', async () => {
    const service = new BackupService();

    const result = await service.generateBackupFiles({
      enabled: true,
      intervalHours: 24,
      includePrompts: true,
      includeFolders: true,
    });

    expect(result.success).toBe(true);
    if (!result.success) return;

    const settingsFile = result.data.find((file) => file.name === 'settings.json');
    expect(settingsFile).toBeDefined();
    expect(JSON.parse(settingsFile?.content || '{}')).toEqual({
      format: 'gemini-voyager.settings.v1',
      exportedAt: expect.any(String),
      version: expect.any(String),
      data: expect.objectContaining({
        [StorageKeys.TIMELINE_SCROLL_MODE]: 'flow',
        [StorageKeys.CHAT_WIDTH]: 70,
        [StorageKeys.CONTEXT_SYNC_PORT]: 3030,
      }),
    });

    const timelineHierarchyFile = result.data.find(
      (file) => file.name === 'timeline-hierarchy.json',
    );
    expect(timelineHierarchyFile).toBeDefined();
    expect(JSON.parse(timelineHierarchyFile?.content || '{}')).toEqual({
      format: 'gemini-voyager.timeline-hierarchy.v1',
      exportedAt: expect.any(String),
      version: expect.any(String),
      data: {
        conversations: {
          'gemini:conv:test': {
            conversationUrl: 'https://gemini.google.com/app/test',
            levels: { 'turn-1': 2 },
            collapsed: ['turn-2'],
            updatedAt: 1234,
          },
          'gemini:conv:scoped': {
            conversationUrl: 'https://gemini.google.com/u/1/app/scoped',
            levels: { 'turn-3': 3 },
            collapsed: [],
            updatedAt: 5678,
          },
        },
      },
    });

    const metadataFile = result.data.find((file) => file.name === 'metadata.json');
    expect(JSON.parse(metadataFile?.content || '{}')).toEqual(
      expect.objectContaining({
        includesSettings: true,
        settingsCount: expect.any(Number),
        timelineHierarchyConversationCount: 2,
      }),
    );
  });
});
