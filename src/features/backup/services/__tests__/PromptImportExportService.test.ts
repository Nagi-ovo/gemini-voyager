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

  describe('validatePayload', () => {
    it('rejects an exported file with no prompts and one whose prompts are all unusable', () => {
      expect(
        PromptImportExportService.validatePayload({
          format: 'gemini-voyager.prompts.v1',
          items: [],
        }).success,
      ).toBe(false);
      expect(
        PromptImportExportService.validatePayload({
          format: 'gemini-voyager.prompts.v1',
          items: [{ text: '   ', tags: [] }],
        }).success,
      ).toBe(false);
    });

    it('accepts a legacy file that is only an items list, normalising its tags', () => {
      const result = PromptImportExportService.validatePayload({
        items: [{ text: 'Use TypeScript', tags: ['Code', 'Code'] }],
      });

      expect(result.success).toBe(true);
      if (!result.success) return;
      expect(result.data.items).toEqual([
        expect.objectContaining({ text: 'Use TypeScript', tags: ['code'] }),
      ]);
    });

    it('keeps a trimmed name, and drops a blank or non-string one', () => {
      const result = PromptImportExportService.validatePayload({
        items: [
          { text: 'A', name: '  Custom  ' },
          { text: 'B', name: '   ' },
          { text: 'C', name: 42 },
        ],
      });

      expect(result.success).toBe(true);
      if (!result.success) return;
      expect(result.data.items.map((item) => item.name)).toEqual(['Custom', undefined, undefined]);
    });
  });
});
