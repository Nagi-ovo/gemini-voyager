import type { FolderOwnerCore } from './folderOwnerCore';
import {
  FOLDER_OWNER_MESSAGE,
  type FolderOwnerRequest,
  type FolderOwnerResponse,
} from './folderOwnerMessages';

const MESSAGE_TYPES: ReadonlySet<string> = new Set(Object.values(FOLDER_OWNER_MESSAGE));

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const isId = (value: unknown): value is string => typeof value === 'string' && value.length > 0;

const isWatermark = (value: unknown): value is number =>
  typeof value === 'number' && Number.isInteger(value) && value >= 0;

const isSeqOp = (value: unknown): value is { seq: number; body: unknown } =>
  isRecord(value) && Number.isInteger(value.seq) && (value.seq as number) > 0 && 'body' in value;

/** A message addressed to the folder owner, whatever its fields. */
export function isFolderOwnerMessage(message: unknown): message is { type: string } {
  return isRecord(message) && typeof message.type === 'string' && MESSAGE_TYPES.has(message.type);
}

/** The typed request, or `null` when a field is missing or malformed. Only the fields read are kept. */
export function parseFolderOwnerRequest(message: unknown): FolderOwnerRequest | null {
  if (!isFolderOwnerMessage(message)) return null;
  const m = message as Record<string, unknown>;
  if (!isId(m.key) || !isId(m.clientId)) return null;
  const { key, clientId } = m;
  switch (m.type) {
    case FOLDER_OWNER_MESSAGE.snapshot:
      return { type: FOLDER_OWNER_MESSAGE.snapshot, key, clientId };
    case FOLDER_OWNER_MESSAGE.ack:
      return isWatermark(m.ackedThrough)
        ? { type: FOLDER_OWNER_MESSAGE.ack, key, clientId, ackedThrough: m.ackedThrough }
        : null;
    case FOLDER_OWNER_MESSAGE.open:
      if (!isWatermark(m.ackedThrough) || (m.epoch !== undefined && !isId(m.epoch))) return null;
      return {
        type: FOLDER_OWNER_MESSAGE.open,
        key,
        clientId,
        ackedThrough: m.ackedThrough,
        ...(m.epoch === undefined ? {} : { epoch: m.epoch }),
      };
    case FOLDER_OWNER_MESSAGE.held:
      if (!isId(m.heldClientId) || (m.decision !== 'apply' && m.decision !== 'discard'))
        return null;
      return {
        type: FOLDER_OWNER_MESSAGE.held,
        key,
        clientId,
        heldClientId: m.heldClientId,
        decision: m.decision,
      };
    case FOLDER_OWNER_MESSAGE.adoptJournal:
      if (!isId(m.journalClientId) || !Array.isArray(m.ops) || !m.ops.every(isSeqOp)) return null;
      return {
        type: FOLDER_OWNER_MESSAGE.adoptJournal,
        key,
        clientId,
        journalClientId: m.journalClientId,
        ops: m.ops.map(({ seq, body }) => ({ seq, body })),
      };
    default:
      if (!isWatermark(m.ackedThrough) || !isId(m.epoch)) return null;
      if (!Array.isArray(m.ops) || !m.ops.every(isSeqOp)) return null;
      return {
        type: FOLDER_OWNER_MESSAGE.apply,
        key,
        clientId,
        epoch: m.epoch,
        ackedThrough: m.ackedThrough,
        ops: m.ops.map(({ seq, body }) => ({ seq, body })),
      };
  }
}

/** Runs a request that already passed the sender gate. */
export async function dispatchFolderOwnerRequest(
  request: FolderOwnerRequest,
  core: FolderOwnerCore,
): Promise<FolderOwnerResponse> {
  switch (request.type) {
    case FOLDER_OWNER_MESSAGE.open:
      return core.open(request);
    case FOLDER_OWNER_MESSAGE.apply:
      return core.apply(request);
    case FOLDER_OWNER_MESSAGE.snapshot:
      return core.snapshot(request);
    case FOLDER_OWNER_MESSAGE.ack:
      core.ack(request);
      return { kind: 'acknowledged' };
    case FOLDER_OWNER_MESSAGE.held:
      return core.held(request);
    case FOLDER_OWNER_MESSAGE.adoptJournal:
      return core.adoptJournal(request);
  }
}
