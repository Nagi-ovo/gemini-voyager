/**
 * HTTP surface of `voyager serve` (spec §2.1–§2.4): endpoints, envelope, task
 * delivery and the CLI-side job model. `serve` binds 127.0.0.1 only.
 */
import type { AccountPlan } from './account';
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
/**
 * Most tasks a poll's `inflight` lists, and so most an extension runs at once (`maxTasks`).
 * Serve 0.4.0 and older refuse a poll listing more than 8, but never run more than one task,
 * so an extension lists at most that one plus its outbox to them.
 */
export const MAX_INFLIGHT_TASKS = 16;
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

/**
 * Where the extension's bridge policy stands (spec §3.5). `denied` and `stale`
 * are told apart so the server can report `policy-denied` or `policy-stale`.
 */
export type PolicyState = 'allowed' | 'denied' | 'stale';

export const POLICY_STATES: readonly PolicyState[] = ['allowed', 'denied', 'stale'];

export interface PolicyReport {
  readonly revision: number;
  readonly state: PolicyState;
}

export interface PollRequest {
  /** Ops the code supports, intersected with the ops the policy allows, plus `POLICY_EXEMPT_OPS`. */
  readonly capabilities: { readonly ops: readonly OpCapability[] };
  readonly inflight: readonly { readonly taskId: string; readonly state: InflightState }[];
  readonly policy: PolicyReport;
  /** The plan the ChatGPT pages last showed; null when none was seen yet. */
  readonly account?: AccountPlan | null;
  /**
   * How many tasks, each of another job and in that job's own tab, the extension runs at
   * once. Absent: one, as every extension before this field.
   */
  readonly maxTasks?: number;
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

// Blobs. Uploads (composer.attach, project.upload): the page reads chunks with
// `POST /v1/ext/blobs/:blobId/read`. Downloads (files.download): the service
// worker sends `POST /v1/ext/blobs` (BlobCreateRequest), then each BlobChunk in
// order to `POST /v1/ext/blobs/:blobId`, then `POST /v1/ext/blobs/:blobId/commit`;
// serve accepts them only from the running files.download task of that job.

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

/**
 * A chunk as JSON (candidate A, spec §2.7): the `data` of
 * `POST /v1/ext/blobs/:blobId/read`, which the service worker relays to the
 * page unchanged. The page checks the whole blob's size and sha256.
 */
export interface BlobChunk {
  readonly blobId: string;
  readonly offset: number;
  readonly base64: string;
}

/** Longest `base64` a chunk of `MAX_BLOB_CHUNK_BYTES` encodes to. */
export const MAX_BLOB_CHUNK_BASE64 = Math.ceil(MAX_BLOB_CHUNK_BYTES / 3) * 4;

/** Bytes a padded base64 string decodes to, or undefined when its length cannot be base64. */
export function base64DecodedLength(base64: string): number | undefined {
  if (base64.length % 4 !== 0) return undefined;
  const padding = base64.endsWith('==') ? 2 : base64.endsWith('=') ? 1 : 0;
  return (base64.length / 4) * 3 - padding;
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
    readonly policy: PolicyReport | null;
    /** The ChatGPT plan the extension last reported; null before it reported one. */
    readonly account?: AccountPlan | null;
  };
  readonly activeJob?: { readonly jobId: string; readonly op?: OpName };
  /** Every running job, `activeJob` first; more than one only while the extension allows parallel jobs. */
  readonly activeJobs?: readonly { readonly jobId: string; readonly op?: OpName }[];
  /** Jobs that may run at once now: 1 until the extension allows parallel jobs. */
  readonly maxJobs?: number;
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
