/** Pure helpers of the dispatcher: results, page acks and the page's outcome checked. */
import {
  type ErrorCode,
  type OpName,
  type TaskResultRequest,
  bridgeError,
  validateMessage,
  validateOpResult,
} from '@/features/bridge/protocol';
import type { BridgeOpCancelMessage, BridgeOpStartAck } from '@/features/bridge/runtimeMessages';

import type { ContentHolder } from './bridgeTabs';
import type { BridgeTabRecord, BridgeTaskRecord } from './bridgeTaskStore';
import type { PageLease } from './pageLease';

export const fail = (code: ErrorCode, message: string, details?: Record<string, unknown>) =>
  ({ ok: false, error: bridgeError(code, message, details) }) as const;

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Why the page has to stop, in the content runtime's vocabulary. */
export function cancelReason(code: ErrorCode): BridgeOpCancelMessage['reason'] {
  if (code === 'timeout') return 'job-timeout';
  if (code === 'not-paired') return 'unpaired';
  if (
    code === 'policy-denied' ||
    code === 'policy-stale' ||
    code === 'bridge-disabled' ||
    code === 'permission-missing'
  ) {
    return 'policy-denied';
  }
  return 'cli-cancel';
}

export function holderOf(record: BridgeTaskRecord | BridgeTabRecord): ContentHolder | null {
  if (record.tabId === undefined || !record.docNonce) return null;
  return {
    tabId: record.tabId,
    docNonce: record.docNonce,
    ...(record.documentId ? { documentId: record.documentId } : {}),
  };
}

export function parseAck(reply: unknown): BridgeOpStartAck {
  if (isRecord(reply) && reply.accepted === true) return { accepted: true };
  const reason = isRecord(reply) ? reply.reason : undefined;
  return reason === 'doc-mismatch' ||
    reason === 'busy' ||
    reason === 'not-attached' ||
    reason === 'cancelled'
    ? { accepted: false, reason }
    : { accepted: false };
}

export function refusal(ack: BridgeOpStartAck, sendFailed: boolean): TaskResultRequest {
  if (sendFailed || ack.reason === 'doc-mismatch') {
    return fail('document-lost', 'The bridge tab no longer holds the document this task was for.');
  }
  if (ack.reason === 'busy') return fail('busy', 'The page is already running an op.');
  if (ack.reason === 'not-attached')
    return fail('bridge-disabled', 'The page bridge is not running.');
  if (ack.reason === 'cancelled') return fail('cancelled', 'The task was stopped before it ran.');
  return fail('document-lost', 'The page did not accept the op.');
}

/** Check what the page reported: a well-formed error, or data shaped like `op`'s result. */
export function normalizeOutcome(op: OpName, outcome: unknown): TaskResultRequest {
  if (!isRecord(outcome)) return fail('unverified', 'The page returned no outcome.');
  if (outcome.ok === false) {
    const error = validateMessage('bridgeError', outcome.error);
    return error.ok
      ? { ok: false, error: error.value }
      : fail('unverified', 'The page returned a malformed error.');
  }
  if (outcome.ok !== true) return fail('unverified', 'The page returned no outcome.');
  const data = validateOpResult(op, outcome.data);
  return data.ok
    ? { ok: true, data: data.value }
    : fail('unverified', 'The page returned a malformed result.', {
        issues: data.issues.slice(0, 5),
      });
}

/** Ops whose page side is `conversation.ready` (open and close run it as a step). */
export const runsReady = (op: OpName): boolean =>
  op === 'conversation.ready' || op === 'conversation.open' || op === 'conversation.close';

export const notCancelling = (record: BridgeTaskRecord): boolean => record.cancelling === undefined;

export type LeaseOutcome = { readonly lease: PageLease } | { readonly refused: TaskResultRequest };
