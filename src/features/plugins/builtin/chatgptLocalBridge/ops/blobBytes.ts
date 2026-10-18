/**
 * Pull an attachment's bytes from the background, chunk by chunk (spec §2.7,
 * candidate A), and check them against the blob's size and sha256 before
 * anything is shown to the page. Chunks are fetched one after another, so the
 * worker holds at most one in memory; the page holds the whole file once.
 */
import {
  type BlobRef,
  MAX_ATTACHMENT_BYTES,
  type BridgeError,
  bridgeError,
} from '@/features/bridge/protocol';
import type { BridgeBlobReadReply } from '@/features/bridge/runtimeMessages';

import type { OpContext } from '../opContext';

/** 1 MiB: well under the server's 4 MiB cap and the runtime message limit, once base64. */
export const BLOB_CHUNK_BYTES = 1024 * 1024;
const PROGRESS_EVERY_CHUNKS = 8;

export type BlobChunkReader = (
  blobId: string,
  offset: number,
  length: number,
) => Promise<BridgeBlobReadReply>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** What the background answered, or an error when it answered something else. */
export function readBlobReply(raw: unknown): BridgeBlobReadReply {
  if (isRecord(raw) && raw.ok === true && typeof raw.base64 === 'string') {
    return { ok: true, base64: raw.base64 };
  }
  if (isRecord(raw) && raw.ok === false && isRecord(raw.error)) {
    const { code, message } = raw.error;
    if (typeof code === 'string' && typeof message === 'string') {
      return { ok: false, error: raw.error as unknown as BridgeError };
    }
  }
  return {
    ok: false,
    error: bridgeError('server-unreachable', 'The extension did not relay the attachment.'),
  };
}

function decodeInto(target: Uint8Array, offset: number, base64: string): number {
  const binary = atob(base64);
  for (let index = 0; index < binary.length; index += 1) {
    target[offset + index] = binary.charCodeAt(index);
  }
  return binary.length;
}

export async function sha256OfBytes(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', bytes as Uint8Array<ArrayBuffer>);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

/**
 * The blob as a `File` with its own name and type, or a failure: no page
 * event has happened yet, so every failure here leaves the page untouched.
 */
export async function fetchBlobFile(
  ctx: OpContext,
  blob: BlobRef,
  read: BlobChunkReader,
  report: (bytes: number) => void,
): Promise<File> {
  if (blob.size > MAX_ATTACHMENT_BYTES) {
    ctx.fail('attachment-too-large', `${blob.name} is larger than the upload limit.`, {
      size: blob.size,
      limit: MAX_ATTACHMENT_BYTES,
    });
  }
  const bytes = new Uint8Array(blob.size);
  let offset = 0;
  let chunks = 0;
  while (offset < blob.size) {
    if (ctx.signal.aborted) ctx.fail('cancelled', 'The upload was stopped.');
    const length = Math.min(BLOB_CHUNK_BYTES, blob.size - offset);
    const reply = await read(blob.blobId, offset, length);
    if (ctx.signal.aborted) ctx.fail('cancelled', 'The upload was stopped.');
    if (!reply.ok) {
      ctx.fail(reply.error.code, reply.error.message, { blobId: blob.blobId, offset });
    }
    let decoded = -1;
    try {
      if (reply.base64.length <= Math.ceil(length / 3) * 4) {
        decoded = decodeInto(bytes, offset, reply.base64);
      }
    } catch {
      decoded = -1;
    }
    if (decoded !== length) {
      ctx.fail('hash-mismatch', `A chunk of ${blob.name} arrived damaged.`, { offset, length });
    }
    offset += length;
    chunks += 1;
    if (chunks % PROGRESS_EVERY_CHUNKS === 0 || offset === blob.size) report(offset);
  }
  const sha256 = await sha256OfBytes(bytes);
  if (sha256 !== blob.sha256) {
    ctx.fail('hash-mismatch', `${blob.name} does not match the file voyager registered.`, {
      expected: blob.sha256,
      observed: sha256,
    });
  }
  return new File([bytes], blob.name, { type: blob.mime });
}
