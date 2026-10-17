/**
 * HTTP surface of `voyager serve` (spec §2.1–§2.4): endpoints, envelope, task
 * delivery and the CLI-side job model. `serve` binds 127.0.0.1 only.
 */
import type { BridgeError, ErrorCode } from './errors';
import type { OpName, OpParamsMap } from './ops';
import type { ProtocolRange } from './version';

export const DEFAULT_PORT = 47321;
export const BRIDGE_HOST = '127.0.0.1';

/** The server holds a poll at most this long, then answers 204. */
export const POLL_HOLD_MS = 25_000;
/** The extension aborts a poll fetch after this long. */
export const POLL_FETCH_TIMEOUT_MS = 30_000;
/** A dispatched task has to be acked within this window. */
export const TASK_ACK_DEADLINE_MS = 10_000;
/** No poll for this long and the server reports `extension-offline`. */
export const EXTENSION_OFFLINE_MS = 90_000;
export const MAX_JSON_BODY_BYTES = 1024 * 1024;
export const MAX_BLOB_CHUNK_BYTES = 4 * 1024 * 1024;

/** Allowed `Origin` of a paired extension (spec §2.3). */
export const EXTENSION_ORIGIN_PATTERNS: readonly RegExp[] = [
  /^chrome-extension:\/\/[a-p]{32}$/,
  /^moz-extension:\/\/[0-9a-f-]{36}$/,
];

export function isExtensionOrigin(origin: string): boolean {
  return EXTENSION_ORIGIN_PATTERNS.some((pattern) => pattern.test(origin));
}

export const BRIDGE_PATHS = {
  hello: '/v1/hello',
  pair: '/v1/pair',
  extPoll: '/v1/ext/poll',
  extBlobs: '/v1/ext/blobs',
  extUnpair: '/v1/ext/unpair',
  status: '/v1/status',
  commands: '/v1/commands',
  pairingCodes: '/v1/pairing-codes',
  jobs: '/v1/jobs',
  call: '/v1/call',
} as const;

const segment = (id: string): string => encodeURIComponent(id);

export const bridgePath = {
  taskAck: (taskId: string) => `/v1/ext/tasks/${segment(taskId)}/ack`,
  taskProgress: (taskId: string) => `/v1/ext/tasks/${segment(taskId)}/progress`,
  taskResult: (taskId: string) => `/v1/ext/tasks/${segment(taskId)}/result`,
  /** `GET ?offset=&length=`; read and upload chunks go through `BlobChunkRange`. */
  blob: (blobId: string) => `/v1/ext/blobs/${segment(blobId)}`,
  /** POST fallback for reads if spike S1 shows extension GETs carry no Origin. */
  blobRead: (blobId: string) => `/v1/ext/blobs/${segment(blobId)}/read`,
  blobCommit: (blobId: string) => `/v1/ext/blobs/${segment(blobId)}/commit`,
  job: (jobId: string) => `/v1/jobs/${segment(jobId)}`,
  jobEvents: (jobId: string) => `/v1/jobs/${segment(jobId)}/events`,
  jobCancel: (jobId: string) => `/v1/jobs/${segment(jobId)}/cancel`,
  jobHarvest: (jobId: string) => `/v1/jobs/${segment(jobId)}/harvest`,
} as const;

// Envelope

export interface Ok<T> {
  readonly ok: true;
  readonly data: T;
}

export interface Err {
  readonly ok: false;
  readonly error: BridgeError;
}

export type Envelope<T> = Ok<T> | Err;

// Unauthenticated endpoints

export type BridgeClient = 'extension' | 'cli';
export type BridgeBrowser = 'chrome' | 'edge' | 'firefox';

export interface HelloRequest {
  readonly client: BridgeClient;
  readonly version: string;
  readonly protocol: ProtocolRange;
}

export interface HelloResponse {
  readonly serverId: string;
  readonly serverVersion: string;
  readonly protocol: ProtocolRange & { readonly selected: number };
  readonly paired: boolean;
}

export interface PairRequest {
  /** Eight digits, shown as `1234-5678`; see `normalizePairingCode`. */
  readonly code: string;
  readonly browser: BridgeBrowser;
  readonly extensionVersion: string;
}

export interface PairResponse {
  /** 32 random bytes, base64url; the server stores only its sha256. */
  readonly token: string;
  readonly serverId: string;
}

export const PAIRING_CODE_PATTERN = /^[0-9]{8}$/;
export const PAIRING_TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;

/** Accept what a person types (`1234-5678`, spaces); undefined unless eight digits remain. */
export function normalizePairingCode(input: string): string | undefined {
  const digits = input.replace(/[\s-]/g, '');
  return PAIRING_CODE_PATTERN.test(digits) ? digits : undefined;
}

// Extension endpoints

export interface OpCapability {
  readonly name: OpName;
  readonly v: number;
}

export type InflightState = 'acked' | 'running';

export interface PollRequest {
  /** Ops the code supports, intersected with the ops the policy allows. */
  readonly capabilities: { readonly ops: readonly OpCapability[] };
  readonly inflight: readonly { readonly taskId: string; readonly state: InflightState }[];
  readonly policy: { readonly revision: number; readonly allowed: boolean };
}

/** Wire form of a task; `params` is checked against `op` on arrival. */
export interface BridgeTask {
  readonly taskId: string;
  readonly jobId: string;
  readonly op: OpName;
  readonly opVersion: number;
  readonly params: unknown;
  readonly deadlineMs: number;
  readonly issuedAt: number;
}

/** A task whose params have been validated; switching on `op` narrows `params`. */
export type ValidatedBridgeTask = {
  readonly [K in OpName]: Omit<BridgeTask, 'op' | 'params'> & {
    readonly op: K;
    readonly params: OpParamsMap[K];
  };
}[OpName];

/** `200` body of `POST /v1/ext/poll`; a hold that ends with nothing is `204` with no body. */
export type PollResponse =
  | { readonly kind: 'task'; readonly task: ValidatedBridgeTask }
  | { readonly kind: 'abort'; readonly taskId: string; readonly reason: ErrorCode }
  | { readonly kind: 'unpaired' };

export interface TaskProgressRequest {
  /** Strictly increasing per task; the server drops repeats. */
  readonly seq: number;
  readonly event: Readonly<Record<string, unknown>>;
}

/** Body of `POST /v1/ext/tasks/:taskId/result`; only the first one counts. */
export type TaskResultRequest = Envelope<unknown>;

// Blobs (placeholders until spike S3 and decision Q3 settle the transport)

export interface BlobCreateRequest {
  readonly jobId: string;
  readonly taskId: string;
  readonly name: string;
  readonly size: number;
  readonly sha256: string;
  readonly mime: string;
}

export interface BlobCreateResponse {
  readonly blobId: string;
}

/** One chunk of a blob: the `offset`/`length` query of a read, or the POST read body. */
export interface BlobChunkRange {
  readonly offset: number;
  /** At most `MAX_BLOB_CHUNK_BYTES`. */
  readonly length: number;
}

/** A chunk relayed between page and service worker as JSON (candidate A, spec §2.7). */
export interface BlobChunk {
  readonly blobId: string;
  readonly offset: number;
  readonly base64: string;
}

export interface BlobCommitResponse {
  readonly blobId: string;
  readonly size: number;
  readonly sha256: string;
}

// CLI endpoints

export type JobStatus =
  | 'running'
  | 'waiting-reply'
  | 'cancelling'
  | 'succeeded'
  | 'failed'
  | 'cancelled'
  | 'needs-user'
  | 'detached';

export interface StatusResponse {
  readonly extension: {
    readonly paired: boolean;
    readonly lastPollAt: number | null;
    readonly version: string | null;
    readonly browser: BridgeBrowser | null;
    readonly policy: { readonly revision: number; readonly allowed: boolean } | null;
  };
  readonly activeJob?: { readonly jobId: string; readonly op?: OpName };
  readonly serverVersion: string;
}

export interface CommandsResponse {
  readonly ops: readonly OpCapability[];
  readonly commands: readonly {
    readonly plugin: string;
    readonly command: string;
    readonly summary: string;
  }[];
}

export interface PairingCodeResponse {
  readonly code: string;
  readonly expiresAt: number;
}

export interface JobSubmitRequest {
  readonly plugin: string;
  readonly command: string;
  readonly input: unknown;
}

export interface JobSubmitResponse {
  readonly jobId: string;
}

export interface CallRequest {
  readonly op: OpName;
  readonly params: unknown;
}

export interface JobSummary {
  readonly jobId: string;
  readonly plugin: string;
  readonly command: string;
  readonly status: JobStatus;
  readonly createdAt: number;
  readonly updatedAt: number;
  readonly error?: BridgeError;
}

export type JobEventType = 'status' | 'progress' | 'checkpoint' | 'log' | 'done';

export interface JobEvent {
  readonly seq: number;
  readonly at: number;
  readonly type: JobEventType;
  readonly data: Readonly<Record<string, unknown>>;
}

/** `GET /v1/jobs/:id/events?after=&wait=`; a wait that times out returns no events. */
export interface JobEventsResponse {
  readonly events: readonly JobEvent[];
}
