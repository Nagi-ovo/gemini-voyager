// @vitest-environment jsdom
// @vitest-environment-options { "url": "https://chatgpt.com/" }
import { createHash } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { BlobRef } from '@/features/bridge/protocol';

import { type ChatGptPageFixture, mountChatGptPage } from '../__tests__/chatgptPageFixture';
import { type Harness, createHarness, errorCode } from '../__tests__/harness';
import { BLOB_CHUNK_BYTES } from './blobBytes';

vi.mock('@/core/utils/userEvent', () => ({ isUserEvent: vi.fn(() => false) }));
vi.mock('@/utils/i18n', () => ({ getCurrentLanguage: vi.fn(async () => 'zh') }));

/** jsdom has no DataTransfer and only takes a native FileList; ChatGPT's page gets both. */
class FakeDataTransfer {
  private readonly list: File[] = [];
  readonly items = { add: (file: File) => this.list.push(file) };
  get files(): File[] {
    return [...this.list];
  }
}

interface UploadBehavior {
  /** Delay before the card renders; null never renders one. */
  previewAfterMs?: number | null;
  /** How long the card shows as uploading (aria-busy, send disabled); null never finishes. */
  uploadMs?: number | null;
  /** Whether the send control turns enabled once the upload is done. */
  enablesSend?: boolean;
}

let page: ChatGptPageFixture;
let bridge: Harness;
let input: HTMLInputElement;
let pageFiles: File[] = [];
let changes = 0;
let behavior: UploadBehavior = {};
let stored: Map<string, Uint8Array>;

const sha256 = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');

function blobOf(blobId: string, name: string, bytes: Uint8Array): BlobRef {
  stored.set(blobId, bytes);
  return { blobId, name, size: bytes.length, sha256: sha256(bytes), mime: 'application/zip' };
}

function bytesOf(size: number, seed = 7): Uint8Array {
  return Uint8Array.from({ length: size }, (_, index) => (index * seed + 3) % 251);
}

/** The background: serves stored blobs, chunk by chunk, as base64. */
function background(message: Record<string, unknown>): unknown {
  if (message.type !== 'gv.bridge.blob.read') return undefined;
  const bytes = stored.get(String(message.blobId));
  if (!bytes) return { ok: false, error: { code: 'bad-request', message: 'unknown blob' } };
  const offset = Number(message.offset);
  const chunk = bytes.subarray(offset, offset + Number(message.length));
  return { ok: true, base64: Buffer.from(chunk).toString('base64') };
}

/** ChatGPT's reaction to files on its input, as measured: a card, then an enabled send control. */
function renderUpload(): void {
  changes += 1;
  const names = pageFiles.map((file) => file.name);
  if (behavior.previewAfterMs === null) return;
  setTimeout(() => {
    for (const name of names) {
      const card = document.createElement('div');
      card.innerHTML = `<div aria-busy="true"><span></span><button type="button"></button></div>`;
      card.querySelector('span')!.textContent = name;
      card.querySelector('button')!.setAttribute('aria-label', `移除 ${name}`);
      page.form.prepend(card);
      if (behavior.uploadMs === null) continue;
      setTimeout(() => {
        card.firstElementChild!.removeAttribute('aria-busy');
        if (behavior.enablesSend !== false) page.sendButton.disabled = false;
      }, behavior.uploadMs ?? 2_000);
    }
  }, behavior.previewAfterMs ?? 1_000);
}

/** Let real async work (sha256) finish without moving the fake clock. */
async function untilSettled(done: () => boolean): Promise<void> {
  for (let round = 0; round < 500 && !done(); round += 1) {
    await new Promise((resolve) => setImmediate(resolve));
    await vi.advanceTimersByTimeAsync(0);
  }
}

/** jsdom's File has no `arrayBuffer()`. */
function readFile(file: File): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(new Uint8Array(reader.result as ArrayBuffer));
    reader.onerror = () => reject(reader.error);
    reader.readAsArrayBuffer(file);
  });
}

const reads = () => bridge.sent.filter((message) => message.type === 'gv.bridge.blob.read');

beforeEach(() => {
  vi.useFakeTimers({
    toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date'],
  });
  Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true });
  vi.stubGlobal('DataTransfer', FakeDataTransfer);
  page = mountChatGptPage();
  input = page.form.querySelector<HTMLInputElement>('input[type="file"]')!;
  pageFiles = [];
  changes = 0;
  behavior = {};
  stored = new Map();
  Object.defineProperty(input, 'files', {
    configurable: true,
    get: () => pageFiles,
    set: (files: File[]) => {
      pageFiles = [...files];
    },
  });
  input.addEventListener('change', renderUpload);
  bridge = createHarness(background);
});

afterEach(() => {
  const running = bridge.runtime.runningTaskId;
  if (running) bridge.runtime.abort(running);
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('Local Bridge composer.attach', () => {
  it('hands the verified file to the composer and succeeds once its card has settled', async () => {
    const bytes = bytesOf(BLOB_CHUNK_BYTES * 2 + 1234);
    bridge.start('composer.attach', { blobs: [blobOf('b1', 'gemini-voyager.zip', bytes)] });
    await untilSettled(() => changes > 0);
    expect(changes).toBe(1);
    expect(pageFiles.map((file) => [file.name, file.type, file.size])).toEqual([
      ['gemini-voyager.zip', 'application/zip', bytes.length],
    ]);
    expect(sha256(await readFile(pageFiles[0]))).toBe(sha256(bytes));
    // Pulled in order, never more than a chunk at a time, by the task's own document.
    expect(reads().map((message) => [message.offset, message.length])).toEqual([
      [0, BLOB_CHUNK_BYTES],
      [BLOB_CHUNK_BYTES, BLOB_CHUNK_BYTES],
      [BLOB_CHUNK_BYTES * 2, 1234],
    ]);
    expect(reads().every((message) => message.taskId === bridge.taskId)).toBe(true);

    await vi.advanceTimersByTimeAsync(2_500);
    expect(bridge.outcome()).toBeUndefined(); // card shown, still uploading
    await vi.advanceTimersByTimeAsync(2_500);
    const outcome = bridge.outcome();
    expect(outcome?.ok).toBe(true);
    expect(outcome?.ok && outcome.data).toMatchObject({
      attached: [{ name: 'gemini-voyager.zip', method: 'input' }],
      evidence: { busySeen: true, removeControls: 1 },
    });
  });

  it('lets composer.send go out with the attachment it expects', async () => {
    bridge.start('composer.attach', { blobs: [blobOf('b1', 'proj.zip', bytesOf(4096))] });
    await untilSettled(() => changes > 0);
    await vi.advanceTimersByTimeAsync(5_000);
    expect(bridge.outcome()?.ok).toBe(true);

    bridge.start('composer.send', { text: 'Review this', expectAttachments: ['proj.zip'] });
    await vi.advanceTimersByTimeAsync(2_000);
    expect(bridge.outcome()).toMatchObject({ ok: true, data: { conversationId: 'conv-123' } });
    expect(page.events().clicks).toBe(1);
  });

  it('refuses bytes that do not match the registered sha256, before touching the page', async () => {
    const blob = { ...blobOf('b1', 'proj.zip', bytesOf(4096)), sha256: 'f'.repeat(64) };
    bridge.start('composer.attach', { blobs: [blob] });
    await untilSettled(() => bridge.outcome() !== undefined);
    expect(errorCode(bridge.outcome())).toBe('hash-mismatch');
    expect(changes).toBe(0);
    expect(pageFiles).toEqual([]);
  });

  it('fails with the background refusal of a chunk and never dispatches', async () => {
    const blob = blobOf('b1', 'proj.zip', bytesOf(4096));
    stored.delete('b1');
    bridge.start('composer.attach', { blobs: [blob] });
    await untilSettled(() => bridge.outcome() !== undefined);
    expect(errorCode(bridge.outcome())).toBe('bad-request');
    expect(changes).toBe(0);
  });

  it('reports attachment-rejected when no card ever shows the file', async () => {
    behavior = { previewAfterMs: null };
    bridge.start('composer.attach', { blobs: [blobOf('b1', 'proj.zip', bytesOf(4096))] });
    await untilSettled(() => changes > 0);
    await vi.advanceTimersByTimeAsync(26_000);
    const outcome = bridge.outcome();
    expect(errorCode(outcome)).toBe('attachment-rejected');
    expect(outcome?.ok === false && outcome.error.details).toMatchObject({
      missing: ['proj.zip'],
    });
  });

  it('fails closed as unverified when the card shows but the send control never enables', async () => {
    behavior = { enablesSend: false };
    bridge.start(
      'composer.attach',
      { blobs: [blobOf('b1', 'proj.zip', bytesOf(4096))] },
      { deadline: Date.now() + 20_000 },
    );
    await untilSettled(() => changes > 0);
    await vi.advanceTimersByTimeAsync(21_000);
    const outcome = bridge.outcome();
    expect(errorCode(outcome)).toBe('unverified');
    expect(outcome?.ok === false && outcome.error.details).toMatchObject({
      partial: true,
      sendEnabled: false,
    });
  });

  it('reports a timeout while the page still shows the upload running', async () => {
    behavior = { uploadMs: null };
    bridge.start(
      'composer.attach',
      { blobs: [blobOf('b1', 'proj.zip', bytesOf(4096))] },
      { deadline: Date.now() + 20_000 },
    );
    await untilSettled(() => changes > 0);
    await vi.advanceTimersByTimeAsync(21_000);
    expect(errorCode(bridge.outcome())).toBe('timeout');
  });

  it('leaves files the person attached alone and reads nothing', async () => {
    const own = document.createElement('div');
    own.setAttribute('data-attachment-id', 'mine');
    page.form.prepend(own);
    bridge.start('composer.attach', { blobs: [blobOf('b1', 'proj.zip', bytesOf(4096))] });
    await untilSettled(() => bridge.outcome() !== undefined);
    expect(errorCode(bridge.outcome())).toBe('composer-busy');
    expect(reads()).toEqual([]);
    expect(changes).toBe(0);
  });

  it('dispatches nothing after a cancel during the transfer', async () => {
    let release: () => void = () => {};
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    bridge = createHarness((message) =>
      message.type === 'gv.bridge.blob.read'
        ? gate.then(() => background(message))
        : background(message),
    );
    bridge.start('composer.attach', { blobs: [blobOf('b1', 'proj.zip', bytesOf(4096))] });
    await untilSettled(() => reads().length > 0);
    bridge.runtime.abort(bridge.taskId);
    release();
    await untilSettled(() => bridge.outcome() !== undefined);
    expect(errorCode(bridge.outcome())).toBe('cancelled');
    expect(changes).toBe(0);
  });
});
