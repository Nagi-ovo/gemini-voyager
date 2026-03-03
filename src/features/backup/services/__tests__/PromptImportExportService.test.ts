import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { AppError, ErrorCode } from '@/core/errors/AppError';
import { promptStorageService } from '@/core/services/StorageService';
import { StorageKeys } from '@/core/types/common';
import type { PromptExportPayload, PromptItem } from '../../types/backup';
import { PromptImportExportService } from '../PromptImportExportService';

// ---------------------------------------------------------------------------
// Module mock — replace the chrome-backed singleton with a plain vi.fn() pair
// ---------------------------------------------------------------------------

vi.mock('@/core/services/StorageService', () => ({
  promptStorageService: {
    get: vi.fn(),
    set: vi.fn(),
  },
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeItem(overrides?: Partial<PromptItem>): PromptItem {
  return {
    id: 'item-1',
    text: 'sample prompt text',
    tags: ['tag1'],
    createdAt: 1_000_000,
    ...overrides,
  };
}

function makePayload(items: PromptItem[], version = '1.0.0'): PromptExportPayload {
  return {
    format: 'gemini-voyager.prompts.v1',
    exportedAt: new Date().toISOString(),
    version,
    items,
  };
}

/**
 * Wire the in-memory store into the mocked service for a single test.
 * Returns a `seed` helper to pre-populate the store before calling the service.
 */
function setupMemoryStore(initialItems?: PromptItem[]) {
  const store = new Map<string, unknown>();
  if (initialItems) {
    store.set(StorageKeys.PROMPT_ITEMS, initialItems);
  }

  vi.mocked(promptStorageService.get).mockImplementation(async (key: string) => {
    if (!store.has(key)) {
      return {
        success: false,
        error: new AppError(ErrorCode.STORAGE_READ_FAILED, `Key not found: ${key}`, { key }),
      } as never;
    }
    return { success: true, data: store.get(key) } as never;
  });

  vi.mocked(promptStorageService.set).mockImplementation(async (key: string, value: unknown) => {
    store.set(key, value);
    return { success: true, data: undefined } as never;
  });

  return { store };
}

// ---------------------------------------------------------------------------
// loadPrompts
// ---------------------------------------------------------------------------

describe('loadPrompts', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  it('returns empty array when storage has no entry for the key', async () => {
    setupMemoryStore();

    const result = await PromptImportExportService.loadPrompts();

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toEqual([]);
    }
  });

  it('returns stored items when storage has valid data', async () => {
    const items = [makeItem({ id: 'a', text: 'hello' }), makeItem({ id: 'b', text: 'world' })];
    setupMemoryStore(items);

    const result = await PromptImportExportService.loadPrompts();

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toEqual(items);
    }
  });

  it('returns empty array when stored value is not an array', async () => {
    const store = new Map<string, unknown>();
    store.set(StorageKeys.PROMPT_ITEMS, { not: 'an array' });

    vi.mocked(promptStorageService.get).mockResolvedValue({
      success: true,
      data: { not: 'an array' },
    } as never);

    const result = await PromptImportExportService.loadPrompts();

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toEqual([]);
    }
  });

  it('propagates a storage parse failure', async () => {
    vi.mocked(promptStorageService.get).mockResolvedValue({
      success: false,
      error: new AppError(ErrorCode.STORAGE_PARSE_FAILED, 'Failed to parse stored value'),
    } as never);

    const result = await PromptImportExportService.loadPrompts();

    expect(result.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// savePrompts
// ---------------------------------------------------------------------------

describe('savePrompts', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  it('persists items so that loadPrompts retrieves them', async () => {
    setupMemoryStore();

    const items = [makeItem({ id: 'p1', text: 'persist me' })];
    const saveResult = await PromptImportExportService.savePrompts(items);
    const loadResult = await PromptImportExportService.loadPrompts();

    expect(saveResult.success).toBe(true);
    expect(loadResult.success).toBe(true);
    if (loadResult.success) {
      expect(loadResult.data).toEqual(items);
    }
  });

  it('overwrites previously saved items', async () => {
    setupMemoryStore([makeItem({ text: 'first' })]);

    await PromptImportExportService.savePrompts([makeItem({ text: 'second' })]);
    const result = await PromptImportExportService.loadPrompts();

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toHaveLength(1);
      expect(result.data[0].text).toBe('second');
    }
  });

  it('returns a failure result when the storage layer rejects the write', async () => {
    setupMemoryStore();

    vi.mocked(promptStorageService.set).mockResolvedValueOnce({
      success: false,
      error: new AppError(ErrorCode.STORAGE_WRITE_FAILED, 'QuotaExceededError'),
    } as never);

    const result = await PromptImportExportService.savePrompts([makeItem()]);

    expect(result.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// validatePayload
// ---------------------------------------------------------------------------

describe('validatePayload', () => {
  it('rejects null', () => {
    expect(PromptImportExportService.validatePayload(null).success).toBe(false);
  });

  it('rejects a non-object primitive', () => {
    expect(PromptImportExportService.validatePayload('string').success).toBe(false);
  });

  it('rejects a payload with wrong format string', () => {
    const bad = { format: 'unknown-format', items: [] };
    expect(PromptImportExportService.validatePayload(bad).success).toBe(false);
  });

  it('rejects a payload where items is not an array', () => {
    const bad = { format: 'gemini-voyager.prompts.v1', items: 'oops' };
    expect(PromptImportExportService.validatePayload(bad).success).toBe(false);
  });

  it('rejects an item missing the text field', () => {
    const bad = {
      format: 'gemini-voyager.prompts.v1',
      items: [{ id: 'x', tags: [] }],
    };
    expect(PromptImportExportService.validatePayload(bad).success).toBe(false);
  });

  it('rejects an item whose text field is not a string', () => {
    const bad = {
      format: 'gemini-voyager.prompts.v1',
      items: [{ id: 'x', text: 42, tags: [] }],
    };
    expect(PromptImportExportService.validatePayload(bad).success).toBe(false);
  });

  it('rejects an item missing the tags field', () => {
    const bad = {
      format: 'gemini-voyager.prompts.v1',
      items: [{ id: 'x', text: 'hello' }],
    };
    expect(PromptImportExportService.validatePayload(bad).success).toBe(false);
  });

  it('rejects an item whose tags field is not an array', () => {
    const bad = {
      format: 'gemini-voyager.prompts.v1',
      items: [{ id: 'x', text: 'hello', tags: 'not-an-array' }],
    };
    expect(PromptImportExportService.validatePayload(bad).success).toBe(false);
  });

  it('accepts a well-formed payload with items', () => {
    const good = makePayload([makeItem()]);
    const result = PromptImportExportService.validatePayload(good);
    expect(result.success).toBe(true);
  });

  it('accepts a well-formed payload with an empty items array', () => {
    const good = makePayload([]);
    expect(PromptImportExportService.validatePayload(good).success).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// exportToPayload
// ---------------------------------------------------------------------------

describe('exportToPayload', () => {
  it('returns a payload with the correct format identifier', () => {
    const payload = PromptImportExportService.exportToPayload([]);
    expect(payload.format).toBe('gemini-voyager.prompts.v1');
  });

  it('embeds the supplied items unchanged', () => {
    const items = [makeItem({ text: 'embed me' })];
    const payload = PromptImportExportService.exportToPayload(items);
    expect(payload.items).toEqual(items);
  });

  it('sets a valid ISO exportedAt timestamp', () => {
    const before = Date.now();
    const payload = PromptImportExportService.exportToPayload([]);
    const after = Date.now();

    const ts = new Date(payload.exportedAt).getTime();
    expect(isNaN(ts)).toBe(false);
    expect(ts).toBeGreaterThanOrEqual(before);
    expect(ts).toBeLessThanOrEqual(after);
  });
});

// ---------------------------------------------------------------------------
// exportToJSON
// ---------------------------------------------------------------------------

describe('exportToJSON', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('returns a JSON string that round-trips to a valid payload', async () => {
    const items = [makeItem({ text: 'export me' })];
    setupMemoryStore(items);

    const result = await PromptImportExportService.exportToJSON();

    expect(result.success).toBe(true);
    if (result.success) {
      const parsed = JSON.parse(result.data) as PromptExportPayload;
      expect(parsed.format).toBe('gemini-voyager.prompts.v1');
      expect(parsed.items).toEqual(items);
    }
  });

  it('returns an empty items array when storage is empty', async () => {
    setupMemoryStore();

    const result = await PromptImportExportService.exportToJSON();

    expect(result.success).toBe(true);
    if (result.success) {
      const parsed = JSON.parse(result.data) as PromptExportPayload;
      expect(parsed.items).toEqual([]);
    }
  });
});

// ---------------------------------------------------------------------------
// generateExportFilename
// ---------------------------------------------------------------------------

describe('generateExportFilename', () => {
  it('returns a filename matching the expected pattern', () => {
    const filename = PromptImportExportService.generateExportFilename();
    expect(filename).toMatch(/^gemini-voyager-prompts-\d{8}-\d{6}\.json$/);
  });

  it('includes the current year in the filename', () => {
    const filename = PromptImportExportService.generateExportFilename();
    expect(filename).toContain(String(new Date().getFullYear()));
  });
});

// ---------------------------------------------------------------------------
// importFromPayload
// ---------------------------------------------------------------------------

describe('importFromPayload', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  it('imports new items and returns correct counts', async () => {
    setupMemoryStore();

    const newItems = [makeItem({ id: 'n1', text: 'alpha' }), makeItem({ id: 'n2', text: 'beta' })];
    const result = await PromptImportExportService.importFromPayload(makePayload(newItems));

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.imported).toBe(2);
      expect(result.data.duplicates).toBe(0);
      expect(result.data.total).toBe(2);
    }
  });

  it('deduplicates items with identical text (case-insensitive)', async () => {
    setupMemoryStore([makeItem({ id: 'e1', text: 'Hello World', tags: ['old'] })]);

    const incoming = [makeItem({ id: 'e2', text: 'hello world', tags: ['new'] })];
    const result = await PromptImportExportService.importFromPayload(makePayload(incoming));

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.imported).toBe(0);
      expect(result.data.duplicates).toBe(1);
      expect(result.data.total).toBe(1);
    }
  });

  it('merges tags when a duplicate is found', async () => {
    setupMemoryStore([makeItem({ id: 'x', text: 'shared', tags: ['tagA'] })]);

    const incoming = [makeItem({ id: 'y', text: 'SHARED', tags: ['tagB'] })];
    await PromptImportExportService.importFromPayload(makePayload(incoming));

    const loadResult = await PromptImportExportService.loadPrompts();
    expect(loadResult.success).toBe(true);
    if (loadResult.success) {
      const mergedTags = loadResult.data[0].tags;
      expect(mergedTags).toContain('tagA');
      expect(mergedTags).toContain('tagB');
    }
  });

  it('preserves existing items that are not in the import payload', async () => {
    setupMemoryStore([makeItem({ id: 'keep', text: 'keep me' })]);

    const incoming = [makeItem({ id: 'new1', text: 'brand new' })];
    const result = await PromptImportExportService.importFromPayload(makePayload(incoming));

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.total).toBe(2);
    }
  });

  it('handles a mix of new and duplicate items', async () => {
    setupMemoryStore([makeItem({ id: 'e', text: 'existing' })]);

    const incoming = [
      makeItem({ id: 'dup', text: 'existing' }), // duplicate
      makeItem({ id: 'nov', text: 'novel item' }), // new
    ];
    const result = await PromptImportExportService.importFromPayload(makePayload(incoming));

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.imported).toBe(1);
      expect(result.data.duplicates).toBe(1);
      expect(result.data.total).toBe(2);
    }
  });
});
