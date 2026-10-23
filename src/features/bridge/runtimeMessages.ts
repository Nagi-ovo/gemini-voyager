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
/** Allow or stop jobs running side by side, each in its own tab, or change how many at once. */
export interface BridgeSetParallelMessage {
  type: 'gv.bridge.setParallel';
  enabled?: boolean;
  /** 2–10 (`MIN_PARALLEL_JOBS`–`MAX_PARALLEL_JOBS`). */
  jobs?: number;
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
/**
 * One chunk of an attachment the running `composer.attach` pulls (spec §2.7),
 * answered with {@link BridgeBlobReadReply}. Only the task's holder document may
 * read, and only the blobs its params name.
 */
export interface BridgeBlobReadMessage {
  type: 'gv.bridge.blob.read';
  taskId: string;
  docNonce: string;
  blobId: string;
  offset: number;
  length: number;
}
/** `base64` decodes to exactly the requested length. */
export type BridgeBlobReadReply = { ok: true; base64: string } | { ok: false; error: BridgeError };
/**
 * A file the running `files.download` fetched, handed to `voyager serve` in
 * three steps (create, one write per chunk from offset 0, commit). Only the
 * task's holder document may send them, and only for the one blob its create
 * opened. Answered with the matching reply below.
 */
export interface BridgeBlobCreateMessage {
  type: 'gv.bridge.blob.create';
  taskId: string;
  docNonce: string;
  name: string;
  size: number;
  sha256: string;
  mime: string;
}
export type BridgeBlobCreateReply =
  | { ok: true; blobId: string }
  | { ok: false; error: BridgeError };
export interface BridgeBlobWriteMessage {
  type: 'gv.bridge.blob.write';
  taskId: string;
  docNonce: string;
  blobId: string;
  offset: number;
  base64: string;
}
export type BridgeBlobWriteReply = { ok: true } | { ok: false; error: BridgeError };
export interface BridgeBlobCommitMessage {
  type: 'gv.bridge.blob.commit';
  taskId: string;
  docNonce: string;
  blobId: string;
}
/** What `voyager serve` stored; the background has checked it against the create. */
export type BridgeBlobCommitReply =
  | { ok: true; blobId: string; size: number; sha256: string }
  | { ok: false; error: BridgeError };

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
/**
 * Stops a running op on the page; the op terminates with zero further page
 * events, and a later `op.start` for the same task is refused. Answered with
 * {@link BridgeOpCancelReply}.
 */
export interface BridgeOpCancelMessage {
  type: 'gv.bridge.op.cancel';
  taskId: string;
  reason: 'cli-cancel' | 'job-timeout' | 'policy-denied' | 'unpaired';
}
/**
 * Asks the page to send its `gv.bridge.hello` again: the first one can arrive
 * before the background has recorded the tab it just opened.
 */
export interface BridgeHelloRequestMessage {
  type: 'gv.bridge.hello.request';
}

/** Synchronous replies from the content runtime. */
export interface BridgeOpStartAck {
  accepted: boolean;
  reason?: 'doc-mismatch' | 'busy' | 'not-attached' | 'cancelled';
}
export interface BridgeLeaseProbeReply {
  stopped: boolean;
}
/** `stopped: true`: this document will cause no further page event for the task. */
export interface BridgeOpCancelReply {
  stopped: boolean;
}

export type BridgePopupMessage =
  | BridgePairIntentMessage
  | BridgePairMessage
  | BridgeUnpairMessage
  | BridgeStatusMessage
  | BridgeEnableRefreshMessage
  | BridgeSetParallelMessage;
export type BridgeContentToBackgroundMessage =
  | BridgeHelloMessage
  | BridgeOpProgressMessage
  | BridgeOpDoneMessage
  | BridgeBlobReadMessage
  | BridgeBlobCreateMessage
  | BridgeBlobWriteMessage
  | BridgeBlobCommitMessage;
export type BridgeBackgroundToContentMessage =
  | BridgeOpStartMessage
  | BridgeLeaseProbeMessage
  | BridgeOpCancelMessage
  | BridgeHelloRequestMessage;

/**
 * Ops that dispatch page events and therefore need a lease (spec §3.2).
 * `conversation.ready` clicks the page's own mode switch when the tab is in
 * the other mode, so it is leased too. A background tab runs every one of them.
 */
export const LEASED_OPS: ReadonlySet<OpName> = new Set<OpName>([
  'conversation.ready',
  'model.select',
  'composer.attach',
  'composer.send',
  'turns.approve',
  'project.create',
  'project.open',
  'project.files',
  'project.upload',
  'project.remove',
]);

export function isBridgeMessageType(type: unknown): type is `gv.bridge.${string}` {
  return typeof type === 'string' && type.startsWith(BRIDGE_MESSAGE_PREFIX);
}
