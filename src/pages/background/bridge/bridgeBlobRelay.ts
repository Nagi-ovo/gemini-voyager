/**
 * Upload relay (spec §2.7, candidate A): the page running `composer.attach`
 * pulls its attachment one chunk at a time; each pull is a
 * `gv.bridge.blob.read` this module answers by fetching the chunk from
 * `voyager serve` with the pairing token. The token never leaves the worker.
 *
 * A read is served only to the document holding the running attach task, and
 * only for a blob that task's params named, within that blob's size. The page
 * checks the assembled bytes against the blob's size and sha256; here a chunk
 * is only checked to have the requested length.
 */
import {
  type BridgeError,
  MAX_BLOB_CHUNK_BYTES,
  base64DecodedLength,
  bridgeError,
} from '@/features/bridge/protocol';
import type { BridgeBlobReadReply } from '@/features/bridge/runtimeMessages';

import type { BridgeClient, PairedConnection } from './bridgeClient';
import { senderIsHolder } from './bridgeTabs';
import type { BridgeTaskStore } from './bridgeTaskStore';

export interface BlobReadRequest {
  readonly taskId: string;
  readonly docNonce: string;
  readonly blobId: unknown;
  readonly offset: unknown;
  readonly length: unknown;
}

export interface BlobRelayDeps {
  readonly store: Pick<BridgeTaskStore, 'getTask' | 'updateTask'>;
  readonly client: Pick<BridgeClient, 'blobRead'>;
  readonly connection: () => Promise<PairedConnection | null>;
  readonly ready: () => Promise<void>;
  readonly now?: () => number;
}

export interface BlobRelay {
  read(
    sender: chrome.runtime.MessageSender,
    request: BlobReadRequest,
  ): Promise<BridgeBlobReadReply>;
}

const refuse = (error: BridgeError): BridgeBlobReadReply => ({ ok: false, error });

const isCount = (value: unknown): value is number =>
  typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;

export function createBlobRelay(deps: BlobRelayDeps): BlobRelay {
  const now = deps.now ?? (() => Date.now());
  return {
    async read(sender, request) {
      await deps.ready();
      const record = await deps.store.getTask(request.taskId);
      if (
        !record ||
        (record.op !== 'composer.attach' && record.op !== 'project.upload') ||
        record.state !== 'running' ||
        record.cancelling !== undefined ||
        !senderIsHolder(sender, request.docNonce, record)
      ) {
        return refuse(bridgeError('unauthorized', 'No running upload holds this page.'));
      }
      const blob = record.blobs?.find((entry) => entry.blobId === request.blobId);
      if (!blob) return refuse(bridgeError('bad-request', 'This task did not name that blob.'));
      const { offset, length } = request;
      if (
        !isCount(offset) ||
        !isCount(length) ||
        length === 0 ||
        length > MAX_BLOB_CHUNK_BYTES ||
        offset + length > blob.size
      ) {
        return refuse(bridgeError('bad-request', 'The chunk lies outside the blob.'));
      }
      const connection = await deps.connection();
      // A task of an earlier pairing never reads from the server paired since.
      if (!connection || connection.serverId !== record.serverId) {
        return refuse(bridgeError('not-paired', 'The bridge is not paired.'));
      }
      const reply = await deps.client.blobRead(connection, blob.blobId, { offset, length });
      if (!reply.ok) return refuse(reply.error);
      const chunk = reply.data;
      if (
        chunk.blobId !== blob.blobId ||
        chunk.offset !== offset ||
        base64DecodedLength(chunk.base64) !== length
      ) {
        return refuse(
          bridgeError('hash-mismatch', 'voyager serve answered a different chunk than asked.'),
        );
      }
      // A long upload is progress too: the silence probe must not take it for a lost page.
      await deps.store.updateTask(record.taskId, { lastProgressAt: now() });
      return { ok: true, base64: chunk.base64 };
    },
  };
}
