// @vitest-environment jsdom
// @vitest-environment-options { "url": "https://chatgpt.com/c/conv-1" }
import { createHash } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { mountChatGptPage } from '../__tests__/chatgptPageFixture';
import { type Harness, createHarness, errorCode } from '../__tests__/harness';
import { type PageDataFeed, createPageDataFeed } from '../__tests__/pageDataFeed';
import type { PageDownloadReply, PageDownloadRequest } from '../pageData/download';
import { BLOB_CHUNK_BYTES } from './blobBytes';

vi.mock('@/utils/i18n', () => ({ getCurrentLanguage: vi.fn(async () => 'en') }));

const CANDIDATE = {
  kind: 'sandbox',
  label: 'report.csv',
  href: 'sandbox:/mnt/data/report.csv',
  controlRef: 'msg-link',
} as const;
const PARAMS = { conversationId: 'conv-1', assistantTurnKey: 'r-1', candidate: CANDIDATE };

/** 2.5 chunks of bytes that differ by position, so a misplaced chunk changes the digest. */
const FILE = Uint8Array.from(
  { length: BLOB_CHUNK_BYTES * 2 + BLOB_CHUNK_BYTES / 2 },
  (_, i) => i % 251,
);

let bridge: Harness;
let feed: PageDataFeed;
let asked: PageDownloadRequest[];
let written: { offset: number; bytes: Buffer }[];

/** Plays the background and `voyager serve`: one blob, its chunks, and a commit that hashes them. */
function background(message: Record<string, unknown>): unknown {
  if (message.type === 'gv.bridge.blob.create') return { ok: true, blobId: 'blob-1' };
  if (message.type === 'gv.bridge.blob.write') {
    written.push({
      offset: message.offset as number,
      bytes: Buffer.from(message.base64 as string, 'base64'),
    });
    return { ok: true };
  }
  if (message.type === 'gv.bridge.blob.commit') {
    const stored = Buffer.concat(written.map((chunk) => chunk.bytes));
    return {
      ok: true,
      blobId: 'blob-1',
      size: stored.length,
      sha256: createHash('sha256').update(stored).digest('hex'),
    };
  }
  return undefined;
}

function serveFile(failFor: ReadonlySet<string>): void {
  feed.answerDownloads((request): PageDownloadReply => {
    asked.push(request);
    const answering = request.messageIds.find((id) => !failFor.has(id));
    if (!answering) return { ok: false, reason: 'not-found', tried: request.messageIds.length };
    return {
      ok: true,
      bytes: FILE.slice().buffer,
      // ChatGPT numbers the name on every fetch; the saved file keeps the name the reply linked.
      name: 'report(1).csv',
      mime: 'text/csv',
      messageId: answering,
      tried: request.messageIds.indexOf(answering) + 1,
    };
  });
}

async function outcome(): Promise<ReturnType<Harness['outcome']>> {
  await vi.waitFor(() => expect(bridge.outcome()).toBeDefined(), { timeout: 5_000 });
  return bridge.outcome();
}

beforeEach(() => {
  asked = [];
  written = [];
  const page = mountChatGptPage({ route: '/c/conv-1' });
  page.addTurn({
    key: 'turn-1',
    user: 'make a report',
    reply: { text: 'Here it is.', turnState: 'complete', actions: true, replyId: 'r-1' },
  });
  feed = createPageDataFeed();
  feed.conversation('conv-1', 'r-1', [
    { id: 'u-0', role: 'user', links: [] },
    { id: 'r-0', role: 'assistant', links: [] },
    { id: 'u-1', role: 'user', links: [] },
    { id: 'msg-link', role: 'assistant', links: [{ label: 'report.csv', href: CANDIDATE.href }] },
    { id: 'tool-1', role: 'tool', links: [] },
    { id: 'r-1', role: 'assistant', links: [] },
  ]);
  bridge = createHarness(background);
});

afterEach(() => {
  const running = bridge.runtime.runningTaskId;
  if (running) bridge.runtime.abort(running);
});

describe('Local Bridge files.download', () => {
  it("asks the turn's other messages, newest first, after the link's own message answers 404", async () => {
    serveFile(new Set(['msg-link']));
    bridge.start('files.download', PARAMS);
    const done = await outcome();

    expect(asked.map((request) => request.messageIds)).toEqual([['msg-link', 'r-1', 'tool-1']]);
    expect(asked[0]).toMatchObject({
      conversationId: 'conv-1',
      sandboxPath: '/mnt/data/report.csv',
    });
    expect(done).toMatchObject({ ok: true, data: { name: 'report.csv', blobId: 'blob-1' } });
  });

  it('hands the whole file over in order and reports the size and digest of its bytes', async () => {
    serveFile(new Set());
    bridge.start('files.download', PARAMS);
    const done = await outcome();

    expect(written.map((chunk) => chunk.offset)).toEqual([
      0,
      BLOB_CHUNK_BYTES,
      BLOB_CHUNK_BYTES * 2,
    ]);
    expect(Buffer.concat(written.map((chunk) => chunk.bytes)).equals(Buffer.from(FILE))).toBe(true);
    const create = bridge.sent.find((message) => message.type === 'gv.bridge.blob.create');
    const digest = createHash('sha256').update(FILE).digest('hex');
    expect(create).toMatchObject({ size: FILE.length, sha256: digest, mime: 'text/csv' });
    expect(done).toEqual({
      ok: true,
      data: {
        name: 'report.csv',
        size: FILE.length,
        sha256: digest,
        mime: 'text/csv',
        blobId: 'blob-1',
      },
    });
  });

  it('fails not-found when no message of the turn has the file any more', async () => {
    serveFile(new Set(['msg-link', 'r-1', 'tool-1']));
    bridge.start('files.download', PARAMS);
    expect(errorCode(await outcome())).toBe('not-found');
    expect(bridge.sent.some((message) => message.type === 'gv.bridge.blob.create')).toBe(false);
  });

  it('refuses a candidate whose message belongs to another turn, without asking ChatGPT', async () => {
    serveFile(new Set());
    bridge.start('files.download', { ...PARAMS, candidate: { ...CANDIDATE, controlRef: 'r-0' } });
    expect(errorCode(await outcome())).toBe('bad-request');
    expect(asked).toEqual([]);
  });

  it('refuses a link that climbs out of the sandbox directory', async () => {
    serveFile(new Set());
    bridge.start('files.download', {
      ...PARAMS,
      candidate: { ...CANDIDATE, href: 'sandbox:/mnt/data/../../etc/passwd' },
    });
    expect(errorCode(await outcome())).toBe('bad-request');
    expect(asked).toEqual([]);
  });

  it('stops when voyager serve stored other bytes than the page sent', async () => {
    serveFile(new Set());
    bridge = createHarness((message) =>
      message.type === 'gv.bridge.blob.commit'
        ? { ok: true, blobId: 'blob-1', size: FILE.length, sha256: '0'.repeat(64) }
        : background(message),
    );
    bridge.start('files.download', PARAMS);
    expect(errorCode(await outcome())).toBe('hash-mismatch');
  });
});
