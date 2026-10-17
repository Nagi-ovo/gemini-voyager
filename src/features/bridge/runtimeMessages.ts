// Extension-internal messages for the Local Bridge (spec §2.3, §3.1–§3.3).
// The background owns the lease and the server connection; the ChatGPT content
// runtime executes ops; the popup only talks to the background.
import type { BridgeError, BridgeTask, OpName } from './protocol';

export const BRIDGE_MESSAGE_PREFIX = 'gv.bridge.';

/** Issued by the background with each op; the content side checks it before every page event. */
export interface BridgeGrant {
  leaseId?: string;
  /** Absolute `Date.now()` deadline issued by the background arbiter. */
  deadline: number;
  docNonce: string;
}

export type BridgeOpOutcome<T = unknown> =
  | { ok: true; data: T }
  | { ok: false; error: BridgeError };

// popup → background (sender must pass isTrustedExtensionPageSender)
export interface BridgePairIntentMessage {
  type: 'gv.bridge.pairIntent';
  port: number;
  code: string;
}
export interface BridgePairMessage {
  type: 'gv.bridge.pair';
  port: number;
  code: string;
}
export interface BridgeUnpairMessage {
  type: 'gv.bridge.unpair';
}
export interface BridgeStatusMessage {
  type: 'gv.bridge.status';
}
export interface BridgeEnableRefreshMessage {
  type: 'gv.bridge.enableRefresh';
}

// content → background (sender must be the current task holder's top frame)
export interface BridgeHelloMessage {
  type: 'gv.bridge.hello';
  docNonce: string;
}
export interface BridgeOpProgressMessage {
  type: 'gv.bridge.op.progress';
  taskId: string;
  docNonce: string;
  progress: unknown;
}
export interface BridgeOpDoneMessage {
  type: 'gv.bridge.op.done';
  taskId: string;
  docNonce: string;
  outcome: BridgeOpOutcome;
}
export interface BridgeBlobReadMessage {
  type: 'gv.bridge.blob.read';
  taskId: string;
  blobId: string;
  offset: number;
  length: number;
}
export interface BridgeBlobWriteMessage {
  type: 'gv.bridge.blob.write';
  taskId: string;
  blobId: string;
  offset: number;
  base64: string;
}

// background → content (sent with { documentId } where supported)
export interface BridgeOpStartMessage {
  type: 'gv.bridge.op.start';
  task: BridgeTask;
  grant: BridgeGrant;
}
export interface BridgeLeaseProbeMessage {
  type: 'gv.bridge.lease.probe';
  leaseId: string;
}

/** Synchronous replies from the content runtime. */
export interface BridgeOpStartAck {
  accepted: boolean;
  reason?: 'doc-mismatch' | 'busy' | 'not-attached';
}
export interface BridgeLeaseProbeReply {
  stopped: boolean;
}

export type BridgePopupMessage =
  | BridgePairIntentMessage
  | BridgePairMessage
  | BridgeUnpairMessage
  | BridgeStatusMessage
  | BridgeEnableRefreshMessage;
export type BridgeContentToBackgroundMessage =
  | BridgeHelloMessage
  | BridgeOpProgressMessage
  | BridgeOpDoneMessage
  | BridgeBlobReadMessage
  | BridgeBlobWriteMessage;
export type BridgeBackgroundToContentMessage = BridgeOpStartMessage | BridgeLeaseProbeMessage;

/** Ops that dispatch page events and therefore need a lease (spec §3.2). */
export const LEASED_OPS: ReadonlySet<OpName> = new Set<OpName>([
  'model.select',
  'composer.attach',
  'composer.send',
]);

export function isBridgeMessageType(type: unknown): type is `gv.bridge.${string}` {
  return typeof type === 'string' && type.startsWith(BRIDGE_MESSAGE_PREFIX);
}
