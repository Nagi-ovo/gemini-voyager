import { describe, expect, it } from 'vitest';

import {
  HighlightAnnotationService,
  type HighlightStorageAdapter,
  createHighlightSourceTextHash,
  getHighlightAccountHash,
} from '@/core/services/HighlightAnnotationService';
import type { HighlightAccountScope, HighlightCreateInput } from '@/core/types/highlight';

import { HighlightImportExportService } from '../HighlightImportExportService';

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

class MemoryStorage implements HighlightStorageAdapter {
  private readonly items: Record<string, unknown> = {};

  async get(keys: null | string | readonly string[]): Promise<Record<string, unknown>> {
    if (keys === null) return clone(this.items);
    const requested = typeof keys === 'string' ? [keys] : keys;
    return Object.fromEntries(
      requested.filter((key) => key in this.items).map((key) => [key, clone(this.items[key])]),
    );
  }

  async set(items: Record<string, unknown>): Promise<void> {
    Object.assign(this.items, clone(items));
  }

  async remove(keys: string | readonly string[]): Promise<void> {
    for (const key of typeof keys === 'string' ? [keys] : keys) delete this.items[key];
  }

  async getBytesInUse(): Promise<number> {
    return new TextEncoder().encode(JSON.stringify(this.items)).byteLength;
  }
}

const SCOPE: HighlightAccountScope = {
  platform: 'gemini',
  accountKey: 'email:user@example.com',
  accountId: 1,
  routeUserId: '0',
};

function input(
  conversationId: string,
  exact: string,
  overrides: Partial<HighlightCreateInput> = {},
): HighlightCreateInput {
  return {
    conversationId,
    conversationUrl: `https://gemini.google.com/u/0/app/${conversationId.split(':').at(-1)}`,
    conversationTitle: conversationId === 'gemini:conv:abc' ? 'Alpha' : 'Beta',
    turnId: `turn-${conversationId}`,
    role: 'assistant',
    anchor: {
      quote: { exact, prefix: '', suffix: '' },
      position: { start: 0, end: exact.length },
      sourceTextHash: createHighlightSourceTextHash(`source:${conversationId}`),
    },
    color: 'yellow',
    ...overrides,
  };
}

function createHarness(startTime = 1_000) {
  const storage = new MemoryStorage();
  let id = 0;
  let now = startTime;
  const annotations = new HighlightAnnotationService({
    storage,
    now: () => now,
    randomUUID: () => `00000000-0000-4000-8000-${String(++id).padStart(12, '0')}`,
  });
  return {
    annotations,
    transfers: new HighlightImportExportService(annotations),
    advanceTime(value = 1) {
      now += value;
    },
  };
}

describe('HighlightImportExportService', () => {
  it('round-trips versioned JSON without truncating quote anchors', async () => {
    const source = createHarness();
    const exact = 'Exact anchor text must survive export and import verbatim.';
    await source.annotations.add(SCOPE, input('gemini:conv:abc', exact, { note: 'Alpha note' }));
    source.advanceTime();
    await source.annotations.add(SCOPE, input('gemini:conv:def', 'Second quote'));

    const exported = await source.transfers.exportToJSON(SCOPE);
    expect(exported.success).toBe(true);
    if (!exported.success) return;
    const parsed = JSON.parse(exported.data) as unknown;
    const validated = HighlightImportExportService.validatePayload(parsed);
    expect(validated.success).toBe(true);
    if (!validated.success) return;
    expect(validated.data).toMatchObject({
      format: 'gemini-voyager.annotations.v1',
      accountScope: {
        platform: 'gemini',
        accountHash: getHighlightAccountHash(SCOPE),
      },
    });
    expect(validated.data.items.map((record) => record.anchor.quote.exact)).toContain(exact);
    expect(exported.data).not.toContain(SCOPE.accountKey);

    const target = createHarness(2_000);
    const firstImport = await target.transfers.importFromJSON(SCOPE, exported.data);
    expect(firstImport).toEqual({
      success: true,
      data: expect.objectContaining({ imported: 2, total: 2 }),
    });
    expect(
      (await target.annotations.getAll(SCOPE)).map((record) => record.anchor.quote.exact),
    ).toContain(exact);

    const secondImport = await target.transfers.importFromJSON(SCOPE, exported.data);
    expect(secondImport).toEqual({
      success: true,
      data: expect.objectContaining({ duplicates: 2, total: 2 }),
    });
  });

  it('exports readable Markdown grouped by conversation with per-highlight deep links', async () => {
    const { annotations, transfers } = createHarness();
    const alpha = await annotations.add(
      SCOPE,
      input('gemini:conv:abc', 'First line\nSecond line', { note: 'A useful note' }),
    );
    await annotations.add(SCOPE, input('gemini:conv:def', 'Beta quote'));
    const removed = await annotations.add(
      SCOPE,
      input('gemini:conv:abc', 'Deleted quote', {
        turnId: 'deleted-turn',
        anchor: {
          quote: { exact: 'Deleted quote', prefix: '', suffix: '' },
          position: { start: 50, end: 63 },
          sourceTextHash: createHighlightSourceTextHash('deleted-source'),
        },
      }),
    );
    await annotations.remove(SCOPE, removed.record.conversationId, removed.record.id, {
      tombstone: true,
    });

    const markdown = await transfers.exportToMarkdown(SCOPE);
    expect(markdown.success).toBe(true);
    if (!markdown.success) return;
    expect(markdown.data).toContain('## Alpha');
    expect(markdown.data).toContain('## Beta');
    expect(markdown.data).toContain('> First line\n> Second line');
    expect(markdown.data).toContain('A useful note');
    expect(markdown.data).toContain(`/u/0/app/abc#gv-highlight-${alpha.record.id}`);
    expect(markdown.data).not.toContain('Deleted quote');
  });

  it('rejects malformed, oversized and cross-account payloads without partial writes', async () => {
    const source = createHarness();
    await source.annotations.add(SCOPE, input('gemini:conv:abc', 'Valid quote'));
    const payloadResult = await source.transfers.exportToPayload(SCOPE);
    expect(payloadResult.success).toBe(true);
    if (!payloadResult.success) return;

    expect(
      HighlightImportExportService.validatePayload({
        ...payloadResult.data,
        format: 'gemini-voyager.annotations.v999',
      }),
    ).toMatchObject({ success: false });
    expect(
      HighlightImportExportService.validatePayload({
        ...payloadResult.data,
        items: [{ ...payloadResult.data.items[0], conversationUrl: 'javascript:alert(1)' }],
      }),
    ).toMatchObject({ success: false });
    expect(
      HighlightImportExportService.validatePayload({
        ...payloadResult.data,
        items: [
          {
            ...payloadResult.data.items[0],
            anchor: {
              ...payloadResult.data.items[0]?.anchor,
              quote: {
                ...payloadResult.data.items[0]?.anchor.quote,
                exact: 'x'.repeat(16 * 1024 + 1),
              },
            },
          },
        ],
      }),
    ).toMatchObject({ success: false });

    const target = createHarness();
    const otherScope: HighlightAccountScope = {
      ...SCOPE,
      accountKey: 'email:other@example.com',
      accountId: 2,
    };
    const mismatch = await target.transfers.importFromPayload(otherScope, payloadResult.data);
    expect(mismatch).toMatchObject({
      success: false,
      error: { code: 'ACCOUNT_MISMATCH' },
    });
    expect(await target.annotations.getAll(otherScope)).toEqual([]);
  });

  it('uses stable timestamped filenames', () => {
    const date = new Date(2026, 6, 12, 9, 8, 7);
    expect(HighlightImportExportService.generateExportFilename(date)).toBe(
      'gemini-voyager-highlights-20260712-090807.json',
    );
    expect(HighlightImportExportService.generateMarkdownFilename(date)).toBe(
      'gemini-voyager-highlights-20260712-090807.md',
    );
  });
});
