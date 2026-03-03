import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { PromptImportExportService } from '../PromptImportExportService';
import type { PromptExportPayload, PromptItem } from '../../types/backup';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const STORAGE_KEY = 'gvPromptItems';

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

function seedStorage(items: PromptItem[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
}

// ---------------------------------------------------------------------------
// loadPrompts
// ---------------------------------------------------------------------------

describe('loadPrompts', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns empty array when storage has no entry', async () => {
    const result = await PromptImportExportService.loadPrompts();

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toEqual([]);
    }
  });

  it('returns stored items when storage has valid data', async () => {
    const items = [makeItem({ id: 'a', text: 'hello' }), makeItem({ id: 'b', text: 'world' })];
    seedStorage(items);

    const result = await PromptImportExportService.loadPrompts();

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toEqual(items);
    }
  });

  it('returns empty array when stored value is not an array', async () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ not: 'an array' }));

    const result = await PromptImportExportService.loadPrompts();

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toEqual([]);
    }
  });

  it('returns a failure result when stored value is invalid JSON', async () => {
    localStorage.setItem(STORAGE_KEY, 'not-valid-json{{');

    const result = await PromptImportExportService.loadPrompts();

    expect(result.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// savePrompts
// ---------------------------------------------------------------------------

describe('savePrompts', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('persists items so that loadPrompts retrieves them', async () => {
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
    const first = [makeItem({ text: 'first' })];
    const second = [makeItem({ text: 'second' })];

    await PromptImportExportService.savePrompts(first);
    await PromptImportExportService.savePrompts(second);

    const result = await PromptImportExportService.loadPrompts();
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toHaveLength(1);
      expect(result.data[0].text).toBe('second');
    }
  });

  it('returns a failure result when storage is unavailable', async () => {
    vi.spyOn(localStorage, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceededError');
    });

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
    localStorage.clear();
  });

  it('returns a JSON string that round-trips to a valid payload', async () => {
    const items = [makeItem({ text: 'export me' })];
    seedStorage(items);

    const result = await PromptImportExportService.exportToJSON();

    expect(result.success).toBe(true);
    if (result.success) {
      const parsed = JSON.parse(result.data) as PromptExportPayload;
      expect(parsed.format).toBe('gemini-voyager.prompts.v1');
      expect(parsed.items).toEqual(items);
    }
  });

  it('returns an empty items array when storage is empty', async () => {
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

  it('includes the current date in the filename', () => {
    const before = new Date();
    const filename = PromptImportExportService.generateExportFilename();
    const after = new Date();

    const year = before.getFullYear();
    expect(filename).toContain(String(year));

    const month = String(before.getMonth() + 1).padStart(2, '0');
    // Month in filename matches either before or after (in case of midnight boundary)
    const altMonth = String(after.getMonth() + 1).padStart(2, '0');
    expect(filename).toMatch(new RegExp(`${year}(${month}|${altMonth})`));
  });
});

// ---------------------------------------------------------------------------
// importFromPayload
// ---------------------------------------------------------------------------

describe('importFromPayload', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('imports new items and returns correct counts', async () => {
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
    const existing = [makeItem({ id: 'e1', text: 'Hello World', tags: ['old'] })];
    seedStorage(existing);

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
    const existing = [makeItem({ id: 'x', text: 'shared', tags: ['tagA'] })];
    seedStorage(existing);

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
    const existing = [makeItem({ id: 'keep', text: 'keep me' })];
    seedStorage(existing);

    const incoming = [makeItem({ id: 'new1', text: 'brand new' })];
    const result = await PromptImportExportService.importFromPayload(makePayload(incoming));

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.total).toBe(2);
    }
  });

  it('handles a mix of new and duplicate items', async () => {
    const existing = [makeItem({ id: 'e', text: 'existing' })];
    seedStorage(existing);

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
