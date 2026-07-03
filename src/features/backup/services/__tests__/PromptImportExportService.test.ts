import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { StorageKeys } from '@/core/types/common';

import { PromptImportExportService } from '../PromptImportExportService';

type MockedChrome = typeof chrome;

function createChromeMock(initialStore: Record<string, unknown>) {
  const store = { ...initialStore };
  const chromeMock = {
    runtime: {
      lastError: null,
    },
    storage: {
      local: {
        get: vi.fn((keys: string[], callback: (items: Record<string, unknown>) => void) => {
          callback(Object.fromEntries(keys.map((key) => [key, store[key]])));
        }),
        set: vi.fn((items: Record<string, unknown>, callback?: () => void) => {
          Object.assign(store, items);
          callback?.();
        }),
      },
    },
  } as unknown as MockedChrome;

  return { chromeMock, store };
}

describe('PromptImportExportService', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
  });

  it('exports prompts from extension local storage', async () => {
    localStorage.setItem(
      StorageKeys.PROMPT_ITEMS,
      JSON.stringify([{ id: 'local', text: 'Legacy prompt', tags: [], createdAt: 1 }]),
    );
    const { chromeMock } = createChromeMock({
      [StorageKeys.PROMPT_ITEMS]: [
        { id: 'stored', text: 'Stored prompt', tags: ['tag'], createdAt: 2 },
      ],
    });
    (globalThis as { chrome: MockedChrome }).chrome = chromeMock;

    const result = await PromptImportExportService.exportToJSON();

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(JSON.parse(result.data)).toEqual(
      expect.objectContaining({
        format: 'gemini-voyager.prompts.v1',
        items: [{ id: 'stored', text: 'Stored prompt', tags: ['tag'], createdAt: 2 }],
      }),
    );
  });

  it('imports prompts by merging duplicate text into extension local storage', async () => {
    const { chromeMock, store } = createChromeMock({
      [StorageKeys.PROMPT_ITEMS]: [
        { id: 'existing', text: 'Same prompt', tags: ['local'], createdAt: 1 },
      ],
    });
    (globalThis as { chrome: MockedChrome }).chrome = chromeMock;
    const payload = PromptImportExportService.validatePayload({
      format: 'gemini-voyager.prompts.v1',
      items: [
        { text: 'Same prompt', tags: ['imported'], name: 'Imported title' },
        { text: 'New prompt', tags: ['new'] },
      ],
    });

    expect(payload.success).toBe(true);
    if (!payload.success) return;
    const result = await PromptImportExportService.importFromPayload(payload.data);

    expect(result.success).toBe(true);
    expect(store[StorageKeys.PROMPT_ITEMS]).toEqual([
      expect.objectContaining({ text: 'New prompt', tags: ['new'] }),
      expect.objectContaining({
        id: 'existing',
        text: 'Same prompt',
        tags: ['local', 'imported'],
        name: 'Imported title',
      }),
    ]);
  });
});
