/**
 * Message boundary between tabs and the background pack owner. Tabs read the
 * pack straight from storage and send every edit here as an op.
 */
import { parsePack } from './packModel';
import { type ResearchPackOp, parseResearchPackOp } from './packOps';
import {
  type ResearchPackApplyResult,
  type ResearchPackStorageArea,
  type ResearchPackStore,
  isResearchPackStorageKey,
  loadResearchPack,
} from './packStore';
import type { AddItemOutcome } from './types';

export const RESEARCH_PACK_APPLY_MESSAGE = 'gv.researchPack.apply';

export interface ResearchPackApplyRequest {
  type: typeof RESEARCH_PACK_APPLY_MESSAGE;
  payload: { key: string; op: ResearchPackOp };
}

export type ResearchPackApplyResponse =
  | { ok: true; pack: unknown; outcome: AddItemOutcome | null }
  | { ok: false; error: string };

const OUTCOMES: ReadonlySet<unknown> = new Set(['added', 'duplicate', 'full', 'empty', null]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function isResearchPackApplyMessage(message: unknown): boolean {
  return isRecord(message) && message.type === RESEARCH_PACK_APPLY_MESSAGE;
}

/** Background side: validate the request and apply it through the owner. */
export async function handleResearchPackApplyMessage(
  message: unknown,
  owner: ResearchPackStore,
): Promise<ResearchPackApplyResponse> {
  const payload = isRecord(message) && isRecord(message.payload) ? message.payload : null;
  const key = typeof payload?.key === 'string' ? payload.key : '';
  const op = parseResearchPackOp(payload?.op);
  if (!isResearchPackStorageKey(key) || !op) return { ok: false, error: 'invalid_payload' };
  try {
    const result = await owner.apply(key, op);
    return { ok: true, pack: result.pack, outcome: result.outcome };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

/** Tab side: reads from storage, sends edits to the background owner. */
export function createResearchPackClient(options: {
  area: ResearchPackStorageArea;
  send: (request: ResearchPackApplyRequest) => Promise<unknown>;
}): ResearchPackStore {
  return {
    load: (key) => loadResearchPack(options.area, key),
    async apply(key, op): Promise<ResearchPackApplyResult> {
      const response = await options.send({
        type: RESEARCH_PACK_APPLY_MESSAGE,
        payload: { key, op },
      });
      if (!isRecord(response) || response.ok !== true || !OUTCOMES.has(response.outcome)) {
        const error =
          isRecord(response) && typeof response.error === 'string' ? response.error : '';
        throw new Error(`Research pack update failed${error ? `: ${error}` : ''}`);
      }
      return {
        pack: parsePack(response.pack),
        outcome: response.outcome as AddItemOutcome | null,
      };
    },
  };
}
