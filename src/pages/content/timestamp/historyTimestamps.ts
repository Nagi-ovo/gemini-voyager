/**
 * History timestamps — real server-side message times for the timeline.
 *
 * Gemini's conversation-load RPC (`hNvQHb` batchexecute) carries a
 * `[seconds, nanos]` server timestamp for every turn. The MAIN-world
 * `public/conversation-history-observer.js` captures those responses and
 * bridges them here via window.postMessage; this module parses them and the
 * TimelineManager matches the parsed turns to its markers so tooltips and
 * inline timestamps show when a message was actually sent — even for
 * conversations that happened on another device.
 *
 * Parsing is structural and defensive: Gemini's payload shape can change
 * without notice, so every access narrows `unknown` and any mismatch yields
 * an empty result (the feature silently falls back to first-seen recording).
 *
 * Observed turn shape (2026-07, see hNvQHb capture):
 * ```
 * [ [cid, rid],                         // ids; cid like "c_26dfc929fd75fe3d"
 *   [cid, rid, rcid],
 *   [[userText, ...], 2, null, 1, ...], // user query
 *   [[[rcid, [modelText], ...]]],       // model response candidates
 *   ...,
 *   [seconds, nanos] ]                  // ★ turn timestamp (a direct child)
 * ```
 */
import { decodeBatchExecute } from '@/core/utils/batchexecute';

// Bridge to the MAIN-world conversation-history-observer (document_start).
// Must match the `source` strings in public/conversation-history-observer.js.
const OBS_SRC = 'gv-history-observer';
const OBS_CMD = 'gv-history-observer-cmd';

// Epoch-seconds sanity window for a turn timestamp: 2015..2096.
const MIN_EPOCH_SEC = 1_420_000_000;
const MAX_EPOCH_SEC = 4_000_000_000;
const MAX_NANOS = 1_000_000_000;

export interface HistoryTurnTimestamp {
  /** User query text as the server stored it (whitespace-collapsed). */
  userText: string;
  /** Turn creation time in ms since epoch. */
  timestampMs: number;
}

/** Collapse whitespace so DOM-derived and API-derived text compare equal. */
export function normalizeTurnText(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

function isConversationCid(value: unknown): value is string {
  return typeof value === 'string' && value.startsWith('c_');
}

/** A turn's timestamp is a `[seconds, nanos]` pair among its direct children. */
function findTurnTimestampMs(turn: unknown[]): number | null {
  for (let i = turn.length - 1; i >= 0; i--) {
    const child = turn[i];
    if (!Array.isArray(child) || child.length < 2) continue;
    const [sec, nanos] = child;
    if (typeof sec !== 'number' || !Number.isInteger(sec)) continue;
    if (typeof nanos !== 'number' || nanos < 0 || nanos >= MAX_NANOS) continue;
    if (sec < MIN_EPOCH_SEC || sec > MAX_EPOCH_SEC) continue;
    return sec * 1000 + Math.round(nanos / 1_000_000);
  }
  return null;
}

/** User text sits at turn[2][0][0]. */
function findTurnUserText(turn: unknown[]): string | null {
  const query = turn[2];
  if (!Array.isArray(query)) return null;
  const textWrap = query[0];
  if (!Array.isArray(textWrap)) return null;
  const text = textWrap[0];
  return typeof text === 'string' && text.trim() ? normalizeTurnText(text) : null;
}

function readTurn(value: unknown): { cid: string; turn: HistoryTurnTimestamp } | null {
  if (!Array.isArray(value)) return null;
  const idTuple = value[0];
  if (!Array.isArray(idTuple) || !isConversationCid(idTuple[0])) return null;

  const timestampMs = findTurnTimestampMs(value);
  const userText = findTurnUserText(value);
  if (timestampMs == null || userText == null) return null;

  return { cid: idTuple[0], turn: { userText, timestampMs } };
}

/**
 * Extract per-conversation turn timestamps from one decoded hNvQHb payload.
 * Turn order in the payload is not guaranteed chronological — matching goes
 * by text, with times sorted where it matters.
 */
export function extractHistoryTurns(payload: unknown): Map<string, HistoryTurnTimestamp[]> {
  const byCid = new Map<string, HistoryTurnTimestamp[]>();
  if (!Array.isArray(payload)) return byCid;

  const turnList = payload.find(
    (candidate): candidate is unknown[] =>
      Array.isArray(candidate) && candidate.some((item) => readTurn(item) !== null),
  );
  if (!turnList) return byCid;

  turnList.forEach((item) => {
    const read = readTurn(item);
    if (!read) return;
    const existing = byCid.get(read.cid);
    if (existing) {
      existing.push(read.turn);
    } else {
      byCid.set(read.cid, [read.turn]);
    }
  });
  return byCid;
}

export interface MarkerTextEntry {
  id: string;
  /** Normalized turn text (whitespace-collapsed, label prefixes stripped). */
  text: string;
}

// A prefix match needs enough characters to be meaningful; short texts must
// match exactly.
const MIN_PREFIX_MATCH_LENGTH = 16;

/**
 * Match API turns to timeline markers by user text.
 *
 * Markers arrive in DOM order (oldest first). Exact text matches consume the
 * earliest remaining timestamp for that text, so a question asked twice maps
 * chronologically. Markers left unmatched get one prefix-match attempt
 * (DOM text and API text can disagree in tails: lazy LaTeX rendering,
 * truncation, injected UI remnants) — only applied when exactly one API turn
 * qualifies, because a wrong timestamp is worse than none.
 */
export function matchTimestampsToMarkers(
  turns: HistoryTurnTimestamp[],
  markers: MarkerTextEntry[],
): Map<string, number> {
  const result = new Map<string, number>();
  if (turns.length === 0 || markers.length === 0) return result;

  const remaining = turns
    .map((turn) => ({ text: normalizeTurnText(turn.userText), timestampMs: turn.timestampMs }))
    .sort((a, b) => a.timestampMs - b.timestampMs);
  const consumed = new Set<number>();

  const unmatchedMarkers: Array<{ id: string; text: string }> = [];

  markers.forEach((marker) => {
    const text = normalizeTurnText(marker.text);
    if (!text) return;
    const index = remaining.findIndex((turn, i) => !consumed.has(i) && turn.text === text);
    if (index >= 0) {
      consumed.add(index);
      result.set(marker.id, remaining[index].timestampMs);
    } else {
      unmatchedMarkers.push({ id: marker.id, text });
    }
  });

  unmatchedMarkers.forEach((marker) => {
    const candidates: number[] = [];
    remaining.forEach((turn, i) => {
      if (consumed.has(i)) return;
      const prefixLength = Math.min(turn.text.length, marker.text.length);
      if (prefixLength < MIN_PREFIX_MATCH_LENGTH) return;
      if (turn.text.slice(0, prefixLength) === marker.text.slice(0, prefixLength)) {
        candidates.push(i);
      }
    });
    if (candidates.length !== 1) return;
    consumed.add(candidates[0]);
    result.set(marker.id, remaining[candidates[0]].timestampMs);
  });

  return result;
}

interface ObserverCapturePayload {
  url?: string;
  body?: string;
}

/**
 * Receives observer captures and keeps parsed turns per conversation cid.
 * Later captures for the same conversation (pagination, revisits) merge in;
 * duplicates dedupe on text+time.
 */
export class HistoryTimestampStore {
  private byCid = new Map<string, Map<string, HistoryTurnTimestamp>>();
  private handler: ((ev: MessageEvent) => void) | null = null;
  private onUpdate: ((cids: string[]) => void) | null = null;

  /** Attach the bridge listener and ask the observer to flush buffered captures. */
  init(onUpdate: (cids: string[]) => void): void {
    if (this.handler) return;
    this.onUpdate = onUpdate;
    this.handler = (ev: MessageEvent) => {
      if (ev.source !== window) return;
      const data = ev.data as { source?: string; type?: string; payload?: unknown } | null;
      if (!data || data.source !== OBS_SRC || data.type !== 'capture') return;
      this.ingest(data.payload as ObserverCapturePayload);
    };
    window.addEventListener('message', this.handler);
    try {
      window.postMessage({ source: OBS_CMD, type: 'flush' }, window.location.origin);
    } catch {
      // Observer absent (Safari, injection blocked) — captures just never arrive.
    }
  }

  dispose(): void {
    if (this.handler) {
      window.removeEventListener('message', this.handler);
      this.handler = null;
    }
    this.onUpdate = null;
    this.byCid.clear();
  }

  /**
   * Turns for a conversation, by the native id from the URL
   * (e.g. `26dfc929fd75fe3d` for cid `c_26dfc929fd75fe3d`).
   */
  getTurns(nativeConversationId: string): HistoryTurnTimestamp[] | null {
    const turns = this.byCid.get(`c_${nativeConversationId}`);
    if (!turns || turns.size === 0) return null;
    return Array.from(turns.values());
  }

  private ingest(payload: ObserverCapturePayload | null): void {
    const body = payload?.body;
    if (typeof body !== 'string' || !body) return;

    const updatedCids: string[] = [];
    decodeBatchExecute(body).forEach(({ payload: rpcPayload }) => {
      extractHistoryTurns(rpcPayload).forEach((turns, cid) => {
        let existing = this.byCid.get(cid);
        if (!existing) {
          existing = new Map<string, HistoryTurnTimestamp>();
          this.byCid.set(cid, existing);
        }
        let changed = false;
        turns.forEach((turn) => {
          const key = `${turn.timestampMs}|${turn.userText}`;
          if (existing!.has(key)) return;
          existing!.set(key, turn);
          changed = true;
        });
        if (changed) updatedCids.push(cid);
      });
    });

    if (updatedCids.length > 0) {
      this.onUpdate?.(updatedCids);
    }
  }
}
