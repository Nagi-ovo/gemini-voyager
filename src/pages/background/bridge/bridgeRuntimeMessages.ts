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
import { type BridgeBlobReadReply, isBridgeMessageType } from '@/features/bridge/runtimeMessages';

import { isTrustedExtensionPageSender } from '../runtimeMessageRouting';
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
  readonly activeTask?: { readonly jobId: string; readonly op: OpName };
  /** Kept until the next successful poll or pairing. */
  readonly lastError?: { readonly code: ErrorCode; readonly upgrade?: UpgradeSide };
}

export type BridgeStatusReply = Envelope<BridgeStatusData>;
export type BridgePairReply = Envelope<{ readonly serverId?: string; readonly pending?: boolean }>;
export type BridgeUnpairReply = Envelope<{ readonly unpaired: true }>;
export type BridgeEnableRefreshReply = Envelope<{ readonly policy: BridgeStatusData['policy'] }>;

/** What the background owner does for each message, once the sender has passed. */
export interface BridgeMessageOwner {
  status(): Promise<BridgeStatusReply>;
  pairIntent(port: unknown, code: unknown): Promise<BridgePairReply>;
  pair(port: unknown, code: unknown): Promise<BridgePairReply>;
  unpair(): Promise<BridgeUnpairReply>;
  enableRefresh(): Promise<BridgeEnableRefreshReply>;
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
}

/** Message types the background answers; the routing table lists the same set. */
export const BRIDGE_POPUP_MESSAGE_TYPES = [
  'gv.bridge.pairIntent',
  'gv.bridge.pair',
  'gv.bridge.unpair',
  'gv.bridge.status',
  'gv.bridge.enableRefresh',
] as const;
export const BRIDGE_CONTENT_MESSAGE_TYPES = [
  'gv.bridge.hello',
  'gv.bridge.op.progress',
  'gv.bridge.op.done',
  'gv.bridge.blob.read',
  'gv.bridge.blob.write',
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
      if (type === 'gv.bridge.blob.read') {
        if (!isId(fields.taskId) || !isId(fields.docNonce)) return Promise.resolve({ ok: false });
        return owner.blobRead(sender, {
          taskId: fields.taskId,
          docNonce: fields.docNonce,
          blobId: fields.blobId,
          offset: fields.offset,
          length: fields.length,
        });
      }
      // Downloads (page → serve) arrive with files.download.
      return Promise.resolve({
        ok: false,
        error: bridgeError('unsupported-op', 'Blob upload is not available in this build.'),
      });
    }
    return null;
  };
}
