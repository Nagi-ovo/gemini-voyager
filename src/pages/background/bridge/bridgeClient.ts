/**
 * HTTP client for `voyager serve` on 127.0.0.1 (spec §2.1–§2.4). Only the
 * background calls it: the token never leaves this module's callers, and the
 * popup asks the background for status instead of fetching itself.
 *
 * Every JSON reply is an envelope (`{ok,data}` / `{ok:false,error}`) and is
 * validated with the protocol package before anything reads it; a poll that
 * ends with nothing is `204` and has no body.
 */
import { EXTENSION_VERSION } from '@/core/utils/version';
import {
  BRIDGE_HOST,
  BRIDGE_PATHS,
  type BlobChunk,
  type BlobChunkRange,
  type BlobCommitResponse,
  type BlobCreateRequest,
  type BlobCreateResponse,
  type BridgeError,
  type HelloResponse,
  type MessageKind,
  type MessageOf,
  PROTOCOL,
  PROTOCOL_HEADER,
  POLL_FETCH_TIMEOUT_MS,
  type PairRequest,
  type PairResponse,
  type PollRequest,
  type PollResponse,
  type TaskResultRequest,
  bridgeError,
  bridgePath,
  validateEnvelope,
} from '@/features/bridge/protocol';

export interface BridgeConnection {
  readonly port: number;
  readonly token?: string;
  /** Protocol version agreed at hello/pairing time. */
  readonly protocol?: number;
}

/** A connection of a stored pairing: results and tasks belong to its server. */
export interface PairedConnection extends BridgeConnection {
  readonly serverId: string;
}

export type ClientResult<T> =
  | { readonly ok: true; readonly status: number; readonly data: T }
  | { readonly ok: false; readonly status: number; readonly error: BridgeError };

const REQUEST_TIMEOUT_MS = 10_000;
/** One attachment chunk from 127.0.0.1; generous, since serve reads it from disk. */
const BLOB_READ_TIMEOUT_MS = 30_000;
/** A downloaded chunk to 127.0.0.1, or the commit that hashes the whole file on disk. */
const BLOB_WRITE_TIMEOUT_MS = 30_000;

export function bridgeBaseUrl(port: number): string {
  return `http://${BRIDGE_HOST}:${port}`;
}

export function isValidBridgePort(port: unknown): port is number {
  return typeof port === 'number' && Number.isInteger(port) && port >= 1024 && port <= 65535;
}

interface RequestOptions<K extends MessageKind | null> {
  readonly method: 'GET' | 'POST';
  readonly path: string;
  readonly body?: unknown;
  /** Validate `data` against this message kind; null accepts any payload. */
  readonly kind: K;
  readonly timeoutMs?: number;
  readonly signal?: AbortSignal;
}

type Payload<K extends MessageKind | null> = K extends MessageKind ? MessageOf<K> : unknown;

export interface BridgeClient {
  hello(port: number): Promise<ClientResult<HelloResponse>>;
  pair(connection: BridgeConnection, request: PairRequest): Promise<ClientResult<PairResponse>>;
  /** `null` data: the hold ended with nothing to do (204). */
  poll(
    connection: BridgeConnection,
    request: PollRequest,
    signal?: AbortSignal,
  ): Promise<ClientResult<PollResponse | null>>;
  ack(connection: BridgeConnection, taskId: string): Promise<ClientResult<unknown>>;
  progress(
    connection: BridgeConnection,
    taskId: string,
    seq: number,
    event: Readonly<Record<string, unknown>>,
  ): Promise<ClientResult<unknown>>;
  result(
    connection: BridgeConnection,
    taskId: string,
    result: TaskResultRequest,
  ): Promise<ClientResult<unknown>>;
  unpair(connection: BridgeConnection): Promise<ClientResult<unknown>>;
  /** One chunk of an upload blob, as base64 in the envelope (POST, so it carries the Origin). */
  blobRead(
    connection: BridgeConnection,
    blobId: string,
    range: BlobChunkRange,
  ): Promise<ClientResult<BlobChunk>>;
  /** A blob for a file the page downloaded: `POST /v1/ext/blobs`. */
  blobCreate(
    connection: BridgeConnection,
    request: BlobCreateRequest,
  ): Promise<ClientResult<BlobCreateResponse>>;
  /** One chunk of that file, in order from offset 0: `POST /v1/ext/blobs/:blobId`. */
  blobWrite(connection: BridgeConnection, chunk: BlobChunk): Promise<ClientResult<unknown>>;
  /** The file is whole: `POST /v1/ext/blobs/:blobId/commit`. */
  blobCommit(
    connection: BridgeConnection,
    blobId: string,
  ): Promise<ClientResult<BlobCommitResponse>>;
}

export function createBridgeClient(
  fetchImpl: typeof fetch = (...args) => fetch(...args),
): BridgeClient {
  async function request<K extends MessageKind | null>(
    connection: BridgeConnection,
    options: RequestOptions<K>,
  ): Promise<ClientResult<Payload<K> | null>> {
    const controller = new AbortController();
    const abort = () => controller.abort();
    options.signal?.addEventListener('abort', abort, { once: true });
    if (options.signal?.aborted) abort();
    const timer = setTimeout(abort, options.timeoutMs ?? REQUEST_TIMEOUT_MS);
    // Settles once the request is stopped, so a body that never ends cannot outlive it.
    const stopped = new Promise<never>((_resolve, reject) => {
      if (controller.signal.aborted) reject(new Error('aborted'));
      controller.signal.addEventListener('abort', () => reject(new Error('aborted')), {
        once: true,
      });
    });
    stopped.catch(() => undefined);
    const failure = (error: unknown): ClientResult<never> => {
      const aborted = options.signal?.aborted === true;
      return {
        ok: false,
        status: 0,
        error: bridgeError(
          aborted ? 'cancelled' : 'server-unreachable',
          aborted ? 'Request stopped.' : `voyager serve is not reachable: ${String(error)}`,
        ),
      };
    };
    const headers: Record<string, string> = {
      [PROTOCOL_HEADER]: String(connection.protocol ?? PROTOCOL.max),
    };
    if (options.body !== undefined) headers['Content-Type'] = 'application/json';
    if (connection.token) headers.Authorization = `Bearer ${connection.token}`;

    // The timer and the caller's abort cover the body too: headers alone do not end a request.
    try {
      let response: Response;
      try {
        response = await Promise.race([
          fetchImpl(`${bridgeBaseUrl(connection.port)}${options.path}`, {
            method: options.method,
            headers,
            ...(options.body !== undefined ? { body: JSON.stringify(options.body) } : {}),
            credentials: 'omit',
            cache: 'no-store',
            redirect: 'error',
            signal: controller.signal,
          }),
          stopped,
        ]);
      } catch (error) {
        return failure(error);
      }

      if (response.status === 204) return { ok: true, status: 204, data: null };
      let raw: unknown;
      try {
        raw = await Promise.race([response.json(), stopped]);
      } catch (error) {
        if (controller.signal.aborted) return failure(error);
        raw = undefined;
      }
      return readReply(response, raw, options.kind);
    } finally {
      clearTimeout(timer);
      options.signal?.removeEventListener('abort', abort);
    }
  }

  function readReply<K extends MessageKind | null>(
    response: Response,
    raw: unknown,
    kind: K,
  ): ClientResult<Payload<K> | null> {
    if (kind === null) {
      // The payload is not read; only a well-formed error envelope is surfaced.
      const envelope = validateEnvelope(raw, 'taskResult');
      if (envelope.ok && !envelope.value.ok) {
        return { ok: false, status: response.status, error: envelope.value.error };
      }
      if (response.ok) return { ok: true, status: response.status, data: raw as Payload<K> };
      return { ok: false, status: response.status, error: statusError(response.status) };
    }
    const envelope = validateEnvelope(raw, kind as MessageKind);
    if (!envelope.ok) {
      return {
        ok: false,
        status: response.status,
        error: response.ok
          ? bridgeError('bad-request', 'Unexpected reply from voyager serve.', {
              issues: envelope.issues.slice(0, 5),
            })
          : statusError(response.status),
      };
    }
    if (!envelope.value.ok)
      return { ok: false, status: response.status, error: envelope.value.error };
    return { ok: true, status: response.status, data: envelope.value.data as Payload<K> };
  }

  const nonNull = <T>(result: ClientResult<T | null>): ClientResult<T> =>
    result.ok && result.data === null
      ? { ok: false, status: result.status, error: bridgeError('bad-request', 'Empty reply.') }
      : (result as ClientResult<T>);

  const post = (
    connection: BridgeConnection,
    path: string,
    body: unknown = {},
  ): Promise<ClientResult<unknown>> =>
    request(connection, { method: 'POST', path, body, kind: null });

  return {
    hello: async (port) =>
      nonNull(
        await request(
          { port },
          {
            method: 'POST',
            path: BRIDGE_PATHS.hello,
            body: { client: 'extension', version: EXTENSION_VERSION, protocol: PROTOCOL },
            kind: 'helloResponse',
          },
        ),
      ),
    pair: async (connection, body) =>
      nonNull(
        await request(connection, {
          method: 'POST',
          path: BRIDGE_PATHS.pair,
          body,
          kind: 'pairResponse',
        }),
      ),
    poll: (connection, body, signal) =>
      request(connection, {
        method: 'POST',
        path: BRIDGE_PATHS.extPoll,
        body,
        kind: 'pollResponse',
        timeoutMs: POLL_FETCH_TIMEOUT_MS,
        ...(signal ? { signal } : {}),
      }),
    ack: (connection, taskId) => post(connection, bridgePath.taskAck(taskId)),
    progress: (connection, taskId, seq, event) =>
      post(connection, bridgePath.taskProgress(taskId), { seq, event }),
    result: (connection, taskId, result) => post(connection, bridgePath.taskResult(taskId), result),
    blobRead: async (connection, blobId, range) =>
      nonNull(
        await request(connection, {
          method: 'POST',
          path: bridgePath.blobRead(blobId),
          body: range,
          kind: 'blobChunk',
          timeoutMs: BLOB_READ_TIMEOUT_MS,
        }),
      ),
    blobCreate: async (connection, body) =>
      nonNull(
        await request(connection, {
          method: 'POST',
          path: BRIDGE_PATHS.extBlobs,
          body,
          kind: 'blobCreateResponse',
        }),
      ),
    blobWrite: (connection, chunk) =>
      request(connection, {
        method: 'POST',
        path: bridgePath.blob(chunk.blobId),
        body: chunk,
        kind: null,
        timeoutMs: BLOB_WRITE_TIMEOUT_MS,
      }),
    blobCommit: async (connection, blobId) =>
      nonNull(
        await request(connection, {
          method: 'POST',
          path: bridgePath.blobCommit(blobId),
          body: {},
          kind: 'blobCommitResponse',
          timeoutMs: BLOB_WRITE_TIMEOUT_MS,
        }),
      ),
    unpair: (connection) =>
      request(connection, {
        method: 'POST',
        path: BRIDGE_PATHS.extUnpair,
        body: {},
        kind: null,
        timeoutMs: 3_000,
      }),
  };
}

function statusError(status: number): BridgeError {
  if (status === 401 || status === 403) {
    return bridgeError('unauthorized', 'voyager serve refused this extension; pair again.');
  }
  if (status === 404) return bridgeError('not-found', 'Unknown task or endpoint.');
  if (status === 409) return bridgeError('busy', 'voyager serve is busy.');
  if (status === 410) return bridgeError('gone', 'The task has already ended.');
  return bridgeError('server-unreachable', `voyager serve answered HTTP ${status}.`);
}
