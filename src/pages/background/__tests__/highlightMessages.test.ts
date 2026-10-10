import { type Mock, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { accountIsolationService } from '@/core/services/AccountIsolationService';
import { getHighlightBucketStorageKey } from '@/core/services/highlightAnnotationData';
import type {
  HighlightAccountScope,
  HighlightCreateInput,
  HighlightRecordV1,
} from '@/core/types/highlight';

import { handleHighlightRuntimeMessage } from '../highlightMessages';

const storage = vi.hoisted(() => ({ items: {} as Record<string, unknown> }));
vi.mock('@/core/services/HighlightAnnotationService', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@/core/services/HighlightAnnotationService')>();
  let counter = 0;
  return {
    ...actual,
    highlightAnnotationService: new actual.HighlightAnnotationService({
      storage: {
        async get(keys) {
          if (keys === null) return structuredClone(storage.items);
          const requested = typeof keys === 'string' ? [keys] : keys;
          return Object.fromEntries(
            requested
              .filter((key) => key in storage.items)
              .map((key) => [key, structuredClone(storage.items[key])]),
          );
        },
        async set(items) {
          Object.assign(storage.items, structuredClone(items));
        },
        async remove(keys) {
          for (const key of typeof keys === 'string' ? [keys] : keys) delete storage.items[key];
        },
      },
      now: () => 1000 + counter,
      randomUUID: () => `00000000-0000-4000-8000-${String(++counter).padStart(12, '0')}`,
    }),
  };
});

const accountA: HighlightAccountScope = {
  platform: 'gemini',
  accountKey: 'email:a@example.com',
  accountId: 1,
  routeUserId: '0',
};
const accountB: HighlightAccountScope = {
  ...accountA,
  accountKey: 'email:b@example.com',
  accountId: 2,
  routeUserId: '1',
};
const conversationId = 'gemini:conv:abc';
const input: HighlightCreateInput = {
  conversationId,
  conversationUrl: 'https://gemini.google.com/u/0/app/abc',
  turnId: 'turn-1',
  role: 'assistant',
  anchor: {
    quote: { exact: 'Remember this passage', prefix: '', suffix: '' },
    position: { start: 0, end: 21 },
    sourceTextHash: 'source-hash',
  },
  note: 'Private account note',
};
const contentSender: chrome.runtime.MessageSender = {
  id: 'test-extension-id',
  tab: { id: 7, url: input.conversationUrl } as chrome.tabs.Tab,
};
const popupSender: chrome.runtime.MessageSender = {
  id: 'test-extension-id',
  url: 'chrome-extension://test-extension-id/popup.html',
};

beforeEach(() => {
  storage.items = {};
  (
    chrome.tabs.query as unknown as Mock<
      (query: chrome.tabs.QueryInfo) => Promise<chrome.tabs.Tab[]>
    >
  ).mockResolvedValue([]);
});
afterEach(() => vi.restoreAllMocks());

async function create(scope: HighlightAccountScope): Promise<HighlightRecordV1> {
  const response = await handleHighlightRuntimeMessage(
    {
      type: 'gv.highlight.create',
      payload: {
        scope,
        input: {
          ...input,
          conversationUrl:
            scope.platform === 'aistudio'
              ? 'https://aistudio.google.com/prompts/abc'
              : input.conversationUrl,
        },
      },
    },
    contentSender,
  );
  expect(response?.ok).toBe(true);
  return response?.record as HighlightRecordV1;
}

async function list(scope: HighlightAccountScope, includeDeleted = false) {
  return handleHighlightRuntimeMessage(
    { type: 'gv.highlight.list', payload: { scope, conversationId, includeDeleted } },
    contentSender,
  );
}

describe('highlight runtime operations', () => {
  it('keeps Gemini deletion tombstones in the originating account without deleting another account', async () => {
    const first = await create(accountA);
    const second = await create(accountB);
    expect(await list(accountA)).toMatchObject({ records: [{ id: first.id }] });
    expect(await list(accountB)).toMatchObject({ records: [{ id: second.id }] });

    expect(
      await handleHighlightRuntimeMessage(
        { type: 'gv.highlight.delete', payload: { scope: accountA, conversationId, id: first.id } },
        contentSender,
      ),
    ).toMatchObject({ ok: true, removed: true, tombstone: true });
    expect(await list(accountA)).toEqual({ ok: true, records: [] });
    expect(await list(accountA, true)).toMatchObject({
      records: [{ id: first.id, deletedAt: expect.any(Number) }],
    });
    expect(await list(accountB)).toMatchObject({ records: [{ id: second.id, note: input.note }] });
  });

  it('hard deletes AI Studio annotations, which do not participate in Drive sync', async () => {
    const scope: HighlightAccountScope = { ...accountA, platform: 'aistudio' };
    const added = await create(scope);
    expect(
      await handleHighlightRuntimeMessage(
        { type: 'gv.highlight.delete', payload: { scope, conversationId, id: added.id } },
        contentSender,
      ),
    ).toEqual({ ok: true, removed: true, tombstone: false });
    expect(await list(scope, true)).toEqual({ ok: true, records: [] });
  });

  it('refuses stored-scope and global operations from a content tab without changing data', async () => {
    const added = await create(accountA);
    const before = structuredClone(storage.items);
    for (const type of ['updateStored', 'deleteStored', 'listAll', 'clearAllAccounts']) {
      expect(
        await handleHighlightRuntimeMessage(
          {
            type: `gv.highlight.${type}`,
            payload: { ...added, patch: { note: 'Wrong note' } },
          },
          contentSender,
        ),
      ).toMatchObject({ ok: false, code: 'INVALID_SCOPE' });
    }
    expect(storage.items).toEqual(before);
    expect(
      await handleHighlightRuntimeMessage(
        { type: 'gv.highlight.updateStored', payload: { ...added, patch: { note: 'Updated' } } },
        popupSender,
      ),
    ).toMatchObject({ ok: true, record: { note: 'Updated' } });
  });

  it('resolves the requested page route before falling back to the sender tab', async () => {
    const resolve = vi
      .spyOn(accountIsolationService, 'resolveAccountScope')
      .mockResolvedValue({ ...accountB, emailHash: null });
    const pageUrl = 'https://gemini.google.com/u/1/app/abc';
    const response = await handleHighlightRuntimeMessage(
      { type: 'gv.highlight.create', payload: { input, pageUrl } },
      contentSender,
    );
    expect(resolve).toHaveBeenCalledWith({ pageUrl });
    expect(response).toMatchObject({ ok: true });
    expect(storage.items[getHighlightBucketStorageKey(accountA, conversationId)]).toBeUndefined();
    expect(storage.items[getHighlightBucketStorageKey(accountB, conversationId)]).toBeDefined();
  });

  it('publishes the persisted mutation to supported tabs and waits for notifications before responding', async () => {
    let release!: () => void;
    const sent = new Promise<void>((resolve) => {
      release = resolve;
    });
    (
      chrome.tabs.query as unknown as Mock<
        (query: chrome.tabs.QueryInfo) => Promise<chrome.tabs.Tab[]>
      >
    ).mockResolvedValue([
      { id: 7, url: input.conversationUrl },
      { id: 8, url: 'https://aistudio.google.cn/prompts/abc' },
      { id: 9, url: 'https://chatgpt.com/c/abc' },
    ] as chrome.tabs.Tab[]);
    const messages: unknown[] = [];
    vi.mocked(chrome.tabs.sendMessage).mockImplementation((_id, message) => {
      expect(storage.items[getHighlightBucketStorageKey(accountA, conversationId)]).toBeDefined();
      messages.push(message);
      return sent;
    });
    let settled = false;
    const operation = create(accountA).then(() => {
      settled = true;
    });
    await vi.waitFor(() => expect(messages).toHaveLength(2));
    expect(settled).toBe(false);
    expect(messages).toEqual([
      expect.objectContaining({
        type: 'gv.highlight.changed',
        payload: expect.objectContaining({ conversationId }),
      }),
      expect.objectContaining({
        type: 'gv.highlight.changed',
        payload: expect.objectContaining({ conversationId }),
      }),
    ]);
    release();
    await operation;
    expect(settled).toBe(true);
  });
});
