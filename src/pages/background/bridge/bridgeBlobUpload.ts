/**
 * Download relay, the reverse of `bridgeBlobRelay.ts`: the page running
 * `files.download` hands the file it fetched to `voyager serve` in three
 * steps, each a runtime message this module answers by calling the server
 * with the pairing token, which never leaves the worker:
 *   - `gv.bridge.blob.create` → `POST /v1/ext/blobs` (name, size, sha256, mime);
 *   - `gv.bridge.blob.write`  → `POST /v1/ext/blobs/:blobId`, one chunk;
 *   - `gv.bridge.blob.commit` → `POST /v1/ext/blobs/:blobId/commit`.
 *
 * Each is served only to the document holding the running download task. A
 * task creates one blob and writes and commits only that one, within its size;
 * the server keeps the chunks in order and checks the whole file's sha256.
 */
import {
  type BridgeError,
  MAX_ATTACHMENT_BYTES,
  MAX_BLOB_CHUNK_BYTES,
  base64DecodedLength,
  bridgeError,
  validateMessage,
} from '@/features/bridge/protocol';
import type {
  BridgeBlobCommitReply,
  BridgeBlobCreateReply,
  BridgeBlobWriteReply,
} from '@/features/bridge/runtimeMessages';

import type { BridgeClient, PairedConnection } from './bridgeClient';
import { senderIsHolder } from './bridgeTabs';
import type { BridgeTaskRecord, BridgeTaskStore } from './bridgeTaskStore';

interface HolderRequest {
  readonly taskId: string;
  readonly docNonce: string;
}

export interface BlobCreateMessageFields extends HolderRequest {
  readonly name: unknown;
  readonly size: unknown;
  readonly sha256: unknown;
  readonly mime: unknown;
}

export interface BlobWriteMessageFields extends HolderRequest {
  readonly blobId: unknown;
  readonly offset: unknown;
  readonly base64: unknown;
}

export interface BlobCommitMessageFields extends HolderRequest {
  readonly blobId: unknown;
}

export interface BlobUploadDeps {
  readonly store: Pick<BridgeTaskStore, 'getTask' | 'updateTask'>;
  readonly client: Pick<BridgeClient, 'blobCreate' | 'blobWrite' | 'blobCommit'>;
  readonly connection: () => Promise<PairedConnection | null>;
  readonly ready: () => Promise<void>;
  readonly now?: () => number;
}

export interface BlobUploadRelay {
  create(
    sender: chrome.runtime.MessageSender,
    request: BlobCreateMessageFields,
  ): Promise<BridgeBlobCreateReply>;
  write(
    sender: chrome.runtime.MessageSender,
    request: BlobWriteMessageFields,
  ): Promise<BridgeBlobWriteReply>;
  commit(
    sender: chrome.runtime.MessageSender,
    request: BlobCommitMessageFields,
  ): Promise<BridgeBlobCommitReply>;
}

type Refusal = { readonly ok: false; readonly error: BridgeError };
const refuse = (error: BridgeError): Refusal => ({ ok: false, error });

export function createBlobUploadRelay(deps: BlobUploadDeps): BlobUploadRelay {
  const now = deps.now ?? (() => Date.now());

  /** The running download this sender holds, with the server it came from; else a refusal. */
  const holderTask = async (
    sender: chrome.runtime.MessageSender,
    request: HolderRequest,
  ): Promise<{ record: BridgeTaskRecord; connection: PairedConnection } | Refusal> => {
    await deps.ready();
    const record = await deps.store.getTask(request.taskId);
    if (
      !record ||
      record.op !== 'files.download' ||
      record.state !== 'running' ||
      record.cancelling !== undefined ||
      !senderIsHolder(sender, request.docNonce, record)
    ) {
      return refuse(bridgeError('unauthorized', 'No running download holds this page.'));
    }
    const connection = await deps.connection();
    // A task of an earlier pairing never writes to the server paired since.
    if (!connection || connection.serverId !== record.serverId) {
      return refuse(bridgeError('not-paired', 'The bridge is not paired.'));
    }
    return { record, connection };
  };

  /** The blob this task created, when `blobId` names it. */
  const ownBlob = (record: BridgeTaskRecord, blobId: unknown) =>
    record.download && record.download.blobId === blobId ? record.download : null;

  return {
    async create(sender, request) {
      const held = await holderTask(sender, request);
      if ('error' in held) return held;
      const { record, connection } = held;
      if (record.download) {
        return refuse(bridgeError('bad-request', 'This task has already created its blob.'));
      }
      const body = validateMessage('blobCreateRequest', {
        jobId: record.jobId,
        taskId: record.taskId,
        name: request.name,
        size: request.size,
        sha256: request.sha256,
        mime: request.mime,
      });
      if (!body.ok) {
        return refuse(
          bridgeError('bad-request', 'The download does not describe a file.', {
            issues: body.issues.slice(0, 5),
          }),
        );
      }
      if (body.value.size > MAX_ATTACHMENT_BYTES) {
        return refuse(
          bridgeError('attachment-too-large', 'The download is larger than the bridge carries.', {
            size: body.value.size,
            limit: MAX_ATTACHMENT_BYTES,
          }),
        );
      }
      const reply = await deps.client.blobCreate(connection, body.value);
      if (!reply.ok) return refuse(reply.error);
      const { blobId } = reply.data;
      const kept = await deps.store.updateTask(
        record.taskId,
        { download: { blobId, size: body.value.size }, lastProgressAt: now() },
        (current) => current.download === undefined && current.cancelling === undefined,
      );
      if (!kept) return refuse(bridgeError('cancelled', 'The download task ended meanwhile.'));
      return { ok: true, blobId };
    },

    async write(sender, request) {
      const held = await holderTask(sender, request);
      if ('error' in held) return held;
      const { record, connection } = held;
      const blob = ownBlob(record, request.blobId);
      if (!blob) return refuse(bridgeError('bad-request', 'This task did not create that blob.'));
      const chunk = validateMessage('blobChunk', {
        blobId: blob.blobId,
        offset: request.offset,
        base64: request.base64,
      });
      const length = chunk.ok ? base64DecodedLength(chunk.value.base64) : undefined;
      if (
        !chunk.ok ||
        length === undefined ||
        length === 0 ||
        length > MAX_BLOB_CHUNK_BYTES ||
        chunk.value.offset + length > blob.size
      ) {
        return refuse(bridgeError('bad-request', 'The chunk lies outside the blob.'));
      }
      const reply = await deps.client.blobWrite(connection, chunk.value);
      if (!reply.ok) return refuse(reply.error);
      // A long hand-over is progress too: the silence probe must not take it for a lost page.
      await deps.store.updateTask(record.taskId, { lastProgressAt: now() });
      return { ok: true };
    },

    async commit(sender, request) {
      const held = await holderTask(sender, request);
      if ('error' in held) return held;
      const { record, connection } = held;
      const blob = ownBlob(record, request.blobId);
      if (!blob) return refuse(bridgeError('bad-request', 'This task did not create that blob.'));
      const reply = await deps.client.blobCommit(connection, blob.blobId);
      if (!reply.ok) return refuse(reply.error);
      const stored = reply.data;
      if (stored.blobId !== blob.blobId || stored.size !== blob.size) {
        return refuse(
          bridgeError('hash-mismatch', 'voyager serve committed another blob than was written.'),
        );
      }
      await deps.store.updateTask(record.taskId, { lastProgressAt: now() });
      return { ok: true, blobId: stored.blobId, size: stored.size, sha256: stored.sha256 };
    },
  };
}
