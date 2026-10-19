/**
 * Hand a downloaded file to `voyager serve` through the background, the
 * reverse of `blobBytes.ts`: create the blob with its size and sha256, write
 * it chunk by chunk from offset 0, then commit and check that the server
 * stored exactly these bytes. Chunks are the reads' 1 MiB (`BLOB_CHUNK_BYTES`)
 * and go one after another, so the worker holds at most one in memory.
 */
import { type BridgeError, bridgeError } from '@/features/bridge/protocol';
import type {
  BridgeBlobCommitReply,
  BridgeBlobCreateReply,
  BridgeBlobWriteReply,
} from '@/features/bridge/runtimeMessages';

import type { OpContext } from '../opContext';
import { BLOB_CHUNK_BYTES } from './blobBytes';

const PROGRESS_EVERY_CHUNKS = 8;
/** `String.fromCharCode` takes its bytes as arguments; stay far below the engines' limit. */
const ENCODE_SLICE = 0x8000;

export interface UploadedFileMeta {
  readonly name: string;
  readonly size: number;
  readonly sha256: string;
  readonly mime: string;
}

export interface BlobWriter {
  create(meta: UploadedFileMeta): Promise<BridgeBlobCreateReply>;
  write(blobId: string, offset: number, base64: string): Promise<BridgeBlobWriteReply>;
  commit(blobId: string): Promise<BridgeBlobCommitReply>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readError(raw: unknown): BridgeError | null {
  if (!isRecord(raw) || raw.ok !== false || !isRecord(raw.error)) return null;
  const { code, message } = raw.error;
  return typeof code === 'string' && typeof message === 'string'
    ? (raw.error as unknown as BridgeError)
    : null;
}

const unrelayed = (): BridgeError =>
  bridgeError('server-unreachable', 'The extension did not relay the download.');

export function readBlobCreateReply(raw: unknown): BridgeBlobCreateReply {
  if (isRecord(raw) && raw.ok === true && typeof raw.blobId === 'string' && raw.blobId) {
    return { ok: true, blobId: raw.blobId };
  }
  return { ok: false, error: readError(raw) ?? unrelayed() };
}

export function readBlobWriteReply(raw: unknown): BridgeBlobWriteReply {
  if (isRecord(raw) && raw.ok === true) return { ok: true };
  return { ok: false, error: readError(raw) ?? unrelayed() };
}

export function readBlobCommitReply(raw: unknown): BridgeBlobCommitReply {
  if (
    isRecord(raw) &&
    raw.ok === true &&
    typeof raw.blobId === 'string' &&
    typeof raw.size === 'number' &&
    typeof raw.sha256 === 'string'
  ) {
    return { ok: true, blobId: raw.blobId, size: raw.size, sha256: raw.sha256 };
  }
  return { ok: false, error: readError(raw) ?? unrelayed() };
}

export function encodeBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let start = 0; start < bytes.length; start += ENCODE_SLICE) {
    binary += String.fromCharCode(...bytes.subarray(start, start + ENCODE_SLICE));
  }
  return btoa(binary);
}

/** The committed blob's id, or a failure carrying the background's or server's error. */
export async function uploadBlob(
  ctx: OpContext,
  bytes: Uint8Array,
  meta: UploadedFileMeta,
  writer: BlobWriter,
): Promise<string> {
  const stopped = (): void => {
    if (ctx.signal.aborted) ctx.fail('cancelled', 'The download was stopped.');
  };
  const created = await writer.create(meta);
  stopped();
  if (!created.ok) ctx.fail(created.error.code, created.error.message, { step: 'create' });
  const { blobId } = created;
  let chunks = 0;
  for (let offset = 0; offset < bytes.length; offset += BLOB_CHUNK_BYTES) {
    stopped();
    const chunk = bytes.subarray(offset, offset + BLOB_CHUNK_BYTES);
    const written = await writer.write(blobId, offset, encodeBase64(chunk));
    stopped();
    if (!written.ok) {
      ctx.fail(written.error.code, written.error.message, { step: 'write', offset });
    }
    chunks += 1;
    const done = offset + chunk.length;
    if (chunks % PROGRESS_EVERY_CHUNKS === 0 || done === bytes.length) {
      ctx.progress({ phase: 'transfer', bytes: done, total: bytes.length });
    }
  }
  const committed = await writer.commit(blobId);
  stopped();
  if (!committed.ok) ctx.fail(committed.error.code, committed.error.message, { step: 'commit' });
  if (
    committed.blobId !== blobId ||
    committed.size !== meta.size ||
    committed.sha256 !== meta.sha256
  ) {
    ctx.fail('hash-mismatch', 'voyager serve stored other bytes than the page sent.', {
      expected: { size: meta.size, sha256: meta.sha256 },
      observed: { size: committed.size, sha256: committed.sha256 },
    });
  }
  return blobId;
}
