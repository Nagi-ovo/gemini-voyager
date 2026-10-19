/**
 * `files.download`'s one request to the page-world observer: fetch a sandbox
 * file the way ChatGPT's page does and hand back its bytes. The observer keeps
 * the page's headers and access token to itself; its reply carries only the
 * bytes (transferred), the file's name and type, and which message id answered.
 *
 * Page scripts can post the observer's tag too, so a reply is taken only for
 * this request's random id and checked down to its shape.
 */
import { DATA_CONTENT_SOURCE, DATA_OBSERVER_SOURCE } from './protocol';

export interface PageDownloadRequest {
  readonly conversationId: string;
  /** Tried in order until one answers 200. */
  readonly messageIds: readonly string[];
  /** `/mnt/data/…`, without the `sandbox:` scheme. */
  readonly sandboxPath: string;
  readonly maxBytes: number;
}

/** Why the observer got no file; see the observer's `download` section. */
export type PageDownloadFailure =
  | 'not-found'
  | 'unauthorized'
  | 'http'
  | 'too-large'
  | 'bad-answer'
  | 'off-origin'
  | 'network'
  | 'cancelled';

export type PageDownloadReply =
  | {
      readonly ok: true;
      readonly bytes: ArrayBuffer;
      readonly name: string | null;
      readonly mime: string | null;
      readonly messageId: string;
      /** How many message ids were asked, the one that answered included. */
      readonly tried: number;
    }
  | {
      readonly ok: false;
      readonly reason: PageDownloadFailure;
      readonly status?: number;
      readonly tried?: number;
      readonly size?: number;
    };

export type PageDownloader = (
  request: PageDownloadRequest,
  signal: AbortSignal,
) => Promise<PageDownloadReply>;

const FAILURES: readonly PageDownloadFailure[] = [
  'not-found',
  'unauthorized',
  'http',
  'too-large',
  'bad-answer',
  'off-origin',
  'network',
  'cancelled',
];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

const isCount = (value: unknown): value is number =>
  typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;

// The buffer comes from the page's realm: `instanceof` can miss it across worlds.
const isArrayBuffer = (value: unknown): value is ArrayBuffer =>
  Object.prototype.toString.call(value) === '[object ArrayBuffer]';

const optionalText = (value: unknown): string | null | undefined =>
  value === null || value === undefined ? null : typeof value === 'string' ? value : undefined;

/** The observer's reply to `requestId`, or null for anything else. */
export function readDownloadReply(raw: unknown, requestId: string): PageDownloadReply | null {
  if (!isRecord(raw) || raw.source !== DATA_OBSERVER_SOURCE || raw.type !== 'download') return null;
  const payload = raw.payload;
  if (!isRecord(payload) || payload.requestId !== requestId) return null;
  if (payload.ok === true) {
    const name = optionalText(payload.name);
    const mime = optionalText(payload.mime);
    if (!isArrayBuffer(payload.bytes) || name === undefined || mime === undefined) return null;
    if (typeof payload.messageId !== 'string' || !isCount(payload.tried)) return null;
    return {
      ok: true,
      bytes: payload.bytes,
      name,
      mime,
      messageId: payload.messageId,
      tried: payload.tried,
    };
  }
  if (payload.ok !== false || !FAILURES.includes(payload.reason as PageDownloadFailure)) {
    return null;
  }
  return {
    ok: false,
    reason: payload.reason as PageDownloadFailure,
    ...(isCount(payload.status) ? { status: payload.status } : {}),
    ...(isCount(payload.tried) ? { tried: payload.tried } : {}),
    ...(isCount(payload.size) ? { size: payload.size } : {}),
  };
}

/** Ask the observer for the file; settles once it answers, or rejects when `signal` aborts. */
export function createPageDownloader(win: Window = window): PageDownloader {
  return (request, signal) =>
    new Promise<PageDownloadReply>((resolve, reject) => {
      const requestId = crypto.randomUUID();
      const post = (type: 'download' | 'download-cancel', payload: unknown): void => {
        try {
          win.postMessage({ source: DATA_CONTENT_SOURCE, type, payload }, win.location.origin);
        } catch {
          // A closing page answers nothing; the abort or the op's deadline ends the wait.
        }
      };
      const stop = (): void => {
        win.removeEventListener('message', onMessage);
        signal.removeEventListener('abort', onAbort);
      };
      const onMessage = (event: MessageEvent): void => {
        if (event.source !== win || event.origin !== win.location.origin) return;
        const reply = readDownloadReply(event.data, requestId);
        if (!reply) return;
        stop();
        resolve(reply);
      };
      const onAbort = (): void => {
        stop();
        post('download-cancel', { requestId });
        reject(signal.reason);
      };
      if (signal.aborted) {
        reject(signal.reason);
        return;
      }
      win.addEventListener('message', onMessage);
      signal.addEventListener('abort', onAbort, { once: true });
      post('download', { requestId, ...request, messageIds: [...request.messageIds] });
    });
}
