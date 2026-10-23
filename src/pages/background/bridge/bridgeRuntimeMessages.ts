/**
 * `gv.bridge.*` runtime messages into the background (spec §3.1). Every sender
 * is checked here before the owner sees the message:
 *   - popup messages come from an extension page (`isTrustedExtensionPageSender`);
 *   - content messages come from this extension's top-frame script on a
 *     chatgpt.com tab; the dispatcher then also requires the task holder's
 *     tab, docNonce and (Chrome) documentId.
 * Anything else is dropped. Replies to the popup are protocol envelopes.
 */
import { logger } from '@/core/services/LoggerService';
import {
  type Envelope,
  type ErrorCode,
  type OpName,
  type UpgradeSide,
  bridgeError,
} from '@/features/bridge/protocol';
import {
  type BridgeBlobCommitReply,
  type BridgeBlobCreateReply,
  type BridgeBlobReadReply,
  type BridgeBlobWriteReply,
  isBridgeMessageType,
} from '@/features/bridge/runtimeMessages';

import { isTrustedExtensionPageSender } from '../runtimeMessageRouting';
import type {
  BlobCommitMessageFields,
  BlobCreateMessageFields,
  BlobWriteMessageFields,
} from './bridgeBlobUpload';
import { isBridgeContentSender } from './bridgeTabs';

/** `data` of the `gv.bridge.status` reply (the popup card reads exactly this). */
export interface BridgeStatusData {
  /** The 127.0.0.1 host permission. */
  readonly permission: boolean;
  readonly paired: {
    readonly serverId: string;
    readonly port: number;
    readonly pairedAt: number;
  } | null;
  readonly server: 'online' | 'offline' | 'unknown';
  readonly lastPollAt?: number;
  readonly policy: 'allowed' | 'denied' | 'stale' | 'unknown';
  readonly onlineUpdatesEnabled: boolean;
  /** Jobs may run side by side, each in its own tab (the person's switch). */
  readonly parallel: boolean;
  /** How many at once while `parallel` is on; kept while it is off. */
  readonly parallelJobs: number;
  /** Every task in flight, oldest first: one per running job. */
  readonly activeTasks: readonly { readonly jobId: string; readonly op: OpName }[];
  /** Kept until the next successful poll or pairing. */
  readonly lastError?: { readonly code: ErrorCode; readonly upgrade?: UpgradeSide };
}

export type BridgeStatusReply = Envelope<BridgeStatusData>;
export type BridgePairReply = Envelope<{ readonly serverId?: string; readonly pending?: boolean }>;
export type BridgeUnpairReply = Envelope<{ readonly unpaired: true }>;
export type BridgeEnableRefreshReply = Envelope<{ readonly policy: BridgeStatusData['policy'] }>;
export type BridgeSetParallelReply = Envelope<{
  readonly parallel: boolean;
  readonly parallelJobs: number;
}>;

/** What the background owner does for each message, once the sender has passed. */
export interface BridgeMessageOwner {
  status(): Promise<BridgeStatusReply>;
  pairIntent(port: unknown, code: unknown): Promise<BridgePairReply>;
  pair(port: unknown, code: unknown): Promise<BridgePairReply>;
  unpair(): Promise<BridgeUnpairReply>;
  enableRefresh(): Promise<BridgeEnableRefreshReply>;
  setParallel(enabled: unknown, jobs: unknown): Promise<BridgeSetParallelReply>;
  hello(sender: chrome.runtime.MessageSender, docNonce: string): Promise<boolean>;
  progress(
    sender: chrome.runtime.MessageSender,
    message: { taskId: string; docNonce: string; progress: unknown },
  ): Promise<boolean>;
  done(
    sender: chrome.runtime.MessageSender,
    message: { taskId: string; docNonce: string; outcome: unknown },
  ): Promise<boolean>;
  blobRead(
    sender: chrome.runtime.MessageSender,
    message: {
      taskId: string;
      docNonce: string;
      blobId: unknown;
      offset: unknown;
      length: unknown;
    },
  ): Promise<BridgeBlobReadReply>;
  blobCreate(
    sender: chrome.runtime.MessageSender,
    message: BlobCreateMessageFields,
  ): Promise<BridgeBlobCreateReply>;
  blobWrite(
    sender: chrome.runtime.MessageSender,
    message: BlobWriteMessageFields,
  ): Promise<BridgeBlobWriteReply>;
  blobCommit(
    sender: chrome.runtime.MessageSender,
    message: BlobCommitMessageFields,
  ): Promise<BridgeBlobCommitReply>;
}

/** Message types the background answers; the routing table lists the same set. */
export const BRIDGE_POPUP_MESSAGE_TYPES = [
  'gv.bridge.pairIntent',
  'gv.bridge.pair',
  'gv.bridge.unpair',
  'gv.bridge.status',
  'gv.bridge.enableRefresh',
  'gv.bridge.setParallel',
] as const;
export const BRIDGE_CONTENT_MESSAGE_TYPES = [
  'gv.bridge.hello',
  'gv.bridge.op.progress',
  'gv.bridge.op.done',
  'gv.bridge.blob.read',
  'gv.bridge.blob.create',
  'gv.bridge.blob.write',
  'gv.bridge.blob.commit',
] as const;

const MAX_ID_LENGTH = 128;
const isId = (value: unknown): value is string =>
  typeof value === 'string' && value.length > 0 && value.length <= MAX_ID_LENGTH;

const untrusted = (): Promise<Envelope<never>> =>
  Promise.resolve({ ok: false, error: bridgeError('unauthorized', 'Untrusted sender.') });

export function createBridgeRuntimeMessageHandler(
  owner: BridgeMessageOwner | null,
): (message: unknown, sender: chrome.runtime.MessageSender) => Promise<unknown> | null {
  return (message, sender) => {
    if (typeof message !== 'object' || message === null) return null;
    const fields = message as Record<string, unknown>;
    const type = fields.type;
    if (!isBridgeMessageType(type)) return null;

    if ((BRIDGE_POPUP_MESSAGE_TYPES as readonly string[]).includes(type)) {
      if (!isTrustedExtensionPageSender(sender)) return untrusted();
      if (!owner) {
        return Promise.resolve({
          ok: false,
          error: bridgeError(
            'bridge-disabled',
            'The local bridge is not available in this browser.',
          ),
        });
      }
      if (type === 'gv.bridge.status') return owner.status();
      if (type === 'gv.bridge.pairIntent') return owner.pairIntent(fields.port, fields.code);
      if (type === 'gv.bridge.pair') return owner.pair(fields.port, fields.code);
      if (type === 'gv.bridge.unpair') return owner.unpair();
      if (type === 'gv.bridge.setParallel') return owner.setParallel(fields.enabled, fields.jobs);
      return owner.enableRefresh();
    }

    if ((BRIDGE_CONTENT_MESSAGE_TYPES as readonly string[]).includes(type)) {
      if (!owner || !isBridgeContentSender(sender) || !isId(fields.docNonce ?? fields.taskId)) {
        logger.debug('Dropped a bridge message from an unexpected sender', { type });
        return Promise.resolve({ ok: false });
      }
      if (type === 'gv.bridge.hello') {
        if (!isId(fields.docNonce)) return Promise.resolve({ ok: false });
        return owner.hello(sender, fields.docNonce).then((ok) => ({ ok }));
      }
      if (type === 'gv.bridge.op.progress' || type === 'gv.bridge.op.done') {
        if (!isId(fields.taskId) || !isId(fields.docNonce)) return Promise.resolve({ ok: false });
        const base = { taskId: fields.taskId, docNonce: fields.docNonce };
        const handled =
          type === 'gv.bridge.op.done'
            ? owner.done(sender, { ...base, outcome: fields.outcome })
            : owner.progress(sender, { ...base, progress: fields.progress });
        return handled.then((ok) => ({ ok }));
      }
      // The blob messages all name their task and document; the owner checks both.
      if (!isId(fields.taskId) || !isId(fields.docNonce)) return Promise.resolve({ ok: false });
      const holder = { taskId: fields.taskId, docNonce: fields.docNonce };
      if (type === 'gv.bridge.blob.read') {
        return owner.blobRead(sender, {
          ...holder,
          blobId: fields.blobId,
          offset: fields.offset,
          length: fields.length,
        });
      }
      if (type === 'gv.bridge.blob.create') {
        return owner.blobCreate(sender, {
          ...holder,
          name: fields.name,
          size: fields.size,
          sha256: fields.sha256,
          mime: fields.mime,
        });
      }
      if (type === 'gv.bridge.blob.write') {
        return owner.blobWrite(sender, {
          ...holder,
          blobId: fields.blobId,
          offset: fields.offset,
          base64: fields.base64,
        });
      }
      return owner.blobCommit(sender, { ...holder, blobId: fields.blobId });
    }
    return null;
  };
}
