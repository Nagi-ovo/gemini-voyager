/**
 * Validators for HTTP bodies. The server checks what the extension and the
 * CLI send; the extension checks what the server answers, including every
 * task's params before any page code sees them.
 */
import { readAccountPlan } from '../account';
import { categoryOf, ERROR_CODES, isErrorCode, type BridgeError } from '../errors';
import {
  PAIRING_CODE_PATTERN,
  PAIRING_TOKEN_PATTERN,
  MAX_BLOB_CHUNK_BASE64,
  MAX_BLOB_CHUNK_BYTES,
  MAX_INFLIGHT_TASKS,
  base64DecodedLength,
  POLICY_STATES,
  type BlobChunk,
  type BlobChunkRange,
  type BlobCommitResponse,
  type BlobCreateRequest,
  type BlobCreateResponse,
  type CallRequest,
  type Envelope,
  type HelloRequest,
  type HelloResponse,
  type JobSubmitRequest,
  type OpCapability,
  type PairRequest,
  type PairResponse,
  type PollRequest,
  type PollResponse,
  type TaskProgressRequest,
  type TaskResultRequest,
  type ValidatedBridgeTask,
} from '../http';
import { isOpName, OP_NAMES } from '../ops';
import {
  at,
  fail,
  ID_PATTERN,
  isRecord,
  optionalRecord,
  readObject,
  requireArray,
  requireBoolean,
  requireInt,
  requireLiteral,
  requireRecord,
  requireString,
  SHA256_PATTERN,
  validateWith,
  type Reader,
  type Validation,
} from '../read';
import type { ProtocolRange } from '../version';
import { opParamsReader } from './ops';

const VERSION = { maxLength: 64 } as const;
const ID = { pattern: ID_PATTERN } as const;
const MAX_PROTOCOL_VERSION = 10_000;

const readProtocolRange: Reader<ProtocolRange> = (raw, path, issues) => {
  const rec = readObject(raw, path, issues);
  const range = { max: MAX_PROTOCOL_VERSION, min: 1 };
  const min = requireInt(rec, 'min', path, issues, range);
  const max = requireInt(rec, 'max', path, issues, range);
  if (min > max) fail(issues, path, 'min must not exceed max');
  return { min, max };
};

const readBridgeError: Reader<BridgeError> = (raw, path, issues) => {
  const rec = readObject(raw, path, issues);
  const code = requireLiteral(rec, 'code', path, issues, ERROR_CODES);
  const category = requireLiteral(rec, 'category', path, issues, [
    'user-action',
    'data',
    'transient',
  ] as const);
  // A mismatched pair would tell an agent the wrong next step, so it is refused.
  if (isErrorCode(rec.code) && category !== categoryOf(code)) {
    fail(issues, at(path, 'category'), `must be ${categoryOf(code)} for ${code}`);
  }
  const message = requireString(rec, 'message', path, issues, {
    maxLength: 4_000,
    allowEmpty: true,
  });
  const details = optionalRecord(rec, 'details', path, issues);
  return details === undefined ? { code, category, message } : { code, category, message, details };
};

/** Reader for `{ok:true,data}` / `{ok:false,error}`, with `data` checked by `data`. */
export function envelopeReader<T>(data: Reader<T>): Reader<Envelope<T>> {
  return (raw, path, issues) => {
    const rec = readObject(raw, path, issues);
    if (rec.ok === true) return { ok: true, data: data(rec.data, at(path, 'data'), issues) };
    if (rec.ok !== false) fail(issues, at(path, 'ok'), 'must be a boolean');
    return { ok: false, error: readBridgeError(rec.error, at(path, 'error'), issues) };
  };
}

const anyData: Reader<unknown> = (raw) => raw;

/**
 * Lenient, like `account`: a value this side cannot use counts as one task, and a newer
 * extension that offers more than `inflight` can list is held to what fits.
 */
function readMaxTasks(raw: unknown): number {
  if (typeof raw !== 'number' || !Number.isSafeInteger(raw) || raw < 1) return 1;
  return Math.min(raw, MAX_INFLIGHT_TASKS);
}

const readOpCapability: Reader<OpCapability> = (raw, path, issues) => {
  const rec = readObject(raw, path, issues);
  return {
    name: requireLiteral(rec, 'name', path, issues, OP_NAMES),
    v: requireInt(rec, 'v', path, issues, { min: 1 }),
  };
};

const readTask: Reader<ValidatedBridgeTask> = (raw, path, issues) => {
  const rec = readObject(raw, path, issues);
  const base = {
    taskId: requireString(rec, 'taskId', path, issues, ID),
    jobId: requireString(rec, 'jobId', path, issues, ID),
    opVersion: requireInt(rec, 'opVersion', path, issues, { min: 1 }),
    deadlineMs: requireInt(rec, 'deadlineMs', path, issues),
    issuedAt: requireInt(rec, 'issuedAt', path, issues),
  };
  const op = requireLiteral(rec, 'op', path, issues, OP_NAMES);
  // Without a known op there is no shape to check the params against.
  const params = isOpName(rec.op) ? opParamsReader(op)(rec.params, at(path, 'params'), issues) : {};
  // `params` was read with `op`'s own reader; TypeScript cannot correlate the two.
  return { ...base, op, params } as ValidatedBridgeTask;
};

export interface MessageMap {
  helloRequest: HelloRequest;
  helloResponse: HelloResponse;
  pairRequest: PairRequest;
  pairResponse: PairResponse;
  pollRequest: PollRequest;
  pollResponse: PollResponse;
  bridgeTask: ValidatedBridgeTask;
  taskProgress: TaskProgressRequest;
  taskResult: TaskResultRequest;
  bridgeError: BridgeError;
  blobCreateRequest: BlobCreateRequest;
  blobCreateResponse: BlobCreateResponse;
  blobChunkRange: BlobChunkRange;
  blobChunk: BlobChunk;
  blobCommitResponse: BlobCommitResponse;
  jobSubmitRequest: JobSubmitRequest;
  callRequest: CallRequest;
}

export type MessageKind = keyof MessageMap;
export type MessageOf<K extends MessageKind> = MessageMap[K];

const READERS: { readonly [K in MessageKind]: Reader<MessageMap[K]> } = {
  helloRequest: (raw, path, issues) => {
    const rec = readObject(raw, path, issues);
    return {
      client: requireLiteral(rec, 'client', path, issues, ['extension', 'cli'] as const),
      version: requireString(rec, 'version', path, issues, VERSION),
      protocol: readProtocolRange(rec.protocol, at(path, 'protocol'), issues),
    };
  },

  helloResponse: (raw, path, issues) => {
    const rec = readObject(raw, path, issues);
    const protocolPath = at(path, 'protocol');
    const range = readProtocolRange(rec.protocol, protocolPath, issues);
    const protocol = isRecord(rec.protocol) ? rec.protocol : {};
    const selected = requireInt(protocol, 'selected', protocolPath, issues, { min: 1 });
    if (selected < range.min || selected > range.max) {
      fail(issues, at(protocolPath, 'selected'), 'must lie within min and max');
    }
    return {
      serverId: requireString(rec, 'serverId', path, issues, ID),
      serverVersion: requireString(rec, 'serverVersion', path, issues, VERSION),
      protocol: { ...range, selected },
      paired: requireBoolean(rec, 'paired', path, issues),
    };
  },

  pairRequest: (raw, path, issues) => {
    const rec = readObject(raw, path, issues);
    return {
      code: requireString(rec, 'code', path, issues, { pattern: PAIRING_CODE_PATTERN }),
      browser: requireLiteral(rec, 'browser', path, issues, ['chrome', 'edge', 'firefox'] as const),
      extensionVersion: requireString(rec, 'extensionVersion', path, issues, VERSION),
    };
  },

  pairResponse: (raw, path, issues) => {
    const rec = readObject(raw, path, issues);
    return {
      token: requireString(rec, 'token', path, issues, { pattern: PAIRING_TOKEN_PATTERN }),
      serverId: requireString(rec, 'serverId', path, issues, ID),
    };
  },

  pollRequest: (raw, path, issues) => {
    const rec = readObject(raw, path, issues);
    const capsPath = at(path, 'capabilities');
    const caps = readObject(rec.capabilities, capsPath, issues);
    const policyPath = at(path, 'policy');
    const policy = readObject(rec.policy, policyPath, issues);
    // An op this protocol does not know is one a newer extension offers: skip it,
    // so a new op never stops an older serve from taking the rest of the poll.
    const offered = Array.isArray(caps.ops)
      ? caps.ops.filter((op) => !isRecord(op) || typeof op.name !== 'string' || isOpName(op.name))
      : caps.ops;
    return {
      capabilities: {
        ops: requireArray({ ops: offered }, 'ops', capsPath, issues, readOpCapability, {
          max: OP_NAMES.length,
        }),
      },
      inflight: requireArray(
        rec,
        'inflight',
        path,
        issues,
        (item, itemPath, list) => {
          const entry = readObject(item, itemPath, list);
          return {
            taskId: requireString(entry, 'taskId', itemPath, list, ID),
            state: requireLiteral(entry, 'state', itemPath, list, ['acked', 'running'] as const),
          };
        },
        { max: MAX_INFLIGHT_TASKS },
      ),
      policy: {
        revision: requireInt(policy, 'revision', policyPath, issues),
        state: requireLiteral(policy, 'state', policyPath, issues, POLICY_STATES),
      },
      // Lenient: an odd plan field is dropped and never fails the poll.
      ...(rec.account === undefined ? {} : { account: readAccountPlan(rec.account) }),
      ...(rec.maxTasks === undefined ? {} : { maxTasks: readMaxTasks(rec.maxTasks) }),
    };
  },

  pollResponse: (raw, path, issues) => {
    const rec = readObject(raw, path, issues);
    const kind = requireLiteral(rec, 'kind', path, issues, ['task', 'abort', 'unpaired'] as const);
    if (kind === 'task') return { kind, task: readTask(rec.task, at(path, 'task'), issues) };
    if (kind === 'abort') {
      return {
        kind,
        taskId: requireString(rec, 'taskId', path, issues, ID),
        reason: requireLiteral(rec, 'reason', path, issues, ERROR_CODES),
      };
    }
    return { kind };
  },

  bridgeTask: readTask,

  taskProgress: (raw, path, issues) => {
    const rec = readObject(raw, path, issues);
    return {
      seq: requireInt(rec, 'seq', path, issues),
      event: requireRecord(rec, 'event', path, issues),
    };
  },

  taskResult: envelopeReader(anyData),

  bridgeError: readBridgeError,

  blobCreateRequest: (raw, path, issues) => {
    const rec = readObject(raw, path, issues);
    return {
      jobId: requireString(rec, 'jobId', path, issues, ID),
      taskId: requireString(rec, 'taskId', path, issues, ID),
      name: requireString(rec, 'name', path, issues, { pattern: /^[^/\\\0]+$/, maxLength: 255 }),
      size: requireInt(rec, 'size', path, issues),
      sha256: requireString(rec, 'sha256', path, issues, { pattern: SHA256_PATTERN }),
      mime: requireString(rec, 'mime', path, issues, { maxLength: 255 }),
    };
  },

  blobCreateResponse: (raw, path, issues) => {
    const rec = readObject(raw, path, issues);
    return { blobId: requireString(rec, 'blobId', path, issues, ID) };
  },

  blobChunkRange: (raw, path, issues) => {
    const rec = readObject(raw, path, issues);
    return {
      offset: requireInt(rec, 'offset', path, issues),
      length: requireInt(rec, 'length', path, issues, { min: 1, max: MAX_BLOB_CHUNK_BYTES }),
    };
  },

  blobChunk: (raw, path, issues) => {
    const rec = readObject(raw, path, issues);
    // A repeated group, `(?:x{4})*`, recurses per match in V8 and overflows the stack on a full
    // chunk; a flat character class plus the length check is linear.
    const base64 = requireString(rec, 'base64', path, issues, {
      pattern: /^[A-Za-z0-9+/]*={0,2}$/,
      maxLength: MAX_BLOB_CHUNK_BASE64,
    });
    if (base64.length > 0 && base64DecodedLength(base64) === undefined) {
      fail(issues, at(path, 'base64'), 'must be padded base64');
    }
    return {
      blobId: requireString(rec, 'blobId', path, issues, ID),
      offset: requireInt(rec, 'offset', path, issues),
      base64,
    };
  },

  blobCommitResponse: (raw, path, issues) => {
    const rec = readObject(raw, path, issues);
    return {
      blobId: requireString(rec, 'blobId', path, issues, ID),
      size: requireInt(rec, 'size', path, issues),
      sha256: requireString(rec, 'sha256', path, issues, { pattern: SHA256_PATTERN }),
    };
  },

  jobSubmitRequest: (raw, path, issues) => {
    const rec = readObject(raw, path, issues);
    const name = { pattern: /^[a-z0-9][a-z0-9._-]{0,63}$/ } as const;
    return {
      plugin: requireString(rec, 'plugin', path, issues, {
        pattern: /^(@[a-z0-9._-]+\/)?[a-z0-9][a-z0-9._-]{0,127}$/,
      }),
      command: requireString(rec, 'command', path, issues, name),
      input: rec.input,
    };
  },

  callRequest: (raw, path, issues) => {
    const rec = readObject(raw, path, issues);
    const op = requireLiteral(rec, 'op', path, issues, OP_NAMES);
    const params = isOpName(rec.op)
      ? opParamsReader(op)(rec.params, at(path, 'params'), issues)
      : rec.params;
    return { op, params };
  },
};

export function validateMessage<K extends MessageKind>(
  kind: K,
  raw: unknown,
): Validation<MessageOf<K>> {
  return validateWith(READERS[kind], raw);
}

export function isMessageKind(value: unknown): value is MessageKind {
  return typeof value === 'string' && Object.hasOwn(READERS, value);
}

/** Envelope around a typed payload, e.g. `validateEnvelope(raw, 'pollResponse')`. */
export function validateEnvelope<K extends MessageKind>(
  raw: unknown,
  kind: K,
): Validation<Envelope<MessageOf<K>>> {
  return validateWith(envelopeReader(READERS[kind]), raw);
}
