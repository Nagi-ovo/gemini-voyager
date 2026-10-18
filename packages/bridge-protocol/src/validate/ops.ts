/**
 * Validators for op params (server → extension; the page acts on them) and op
 * results (extension → server; the CLI writes files from them). Ids that end
 * up in URLs (`conversationId`, blob ids) are restricted to URL-safe tokens.
 */
import {
  CATALOG_HOST_PATTERN,
  MAX_ATTACHMENT_BYTES,
  MAX_ATTACHMENTS,
  WAIT_REPLY_MAX_TIMEOUT_MS,
  type BlobRef,
  type CatalogRefreshStatus,
  type ChatMode,
  type ConversationReadyResult,
  type FileCandidate,
  type FilesDownloadResult,
  type ModelSelection,
  type ModelTarget,
  type OpName,
  type OpParamsMap,
  type OpResultMap,
  type SwitchableMode,
  type WaitReplyProgress,
} from '../ops';
import {
  at,
  fail,
  ID_PATTERN,
  nullableInt,
  nullableString,
  optionalArray,
  optionalBoolean,
  optionalInt,
  optionalLiteral,
  optionalString,
  readObject,
  requireArray,
  requireBoolean,
  requireInt,
  requireLiteral,
  requireRecord,
  requireString,
  SHA256_PATTERN,
  stringItem,
  validateWith,
  type Issue,
  type Reader,
  type Validation,
} from '../read';
import { PROJECT_PARAM_READERS, PROJECT_RESULT_READERS } from './projectOps';

const CHAT_MODES: readonly ChatMode[] = ['chat', 'work', 'unknown'];
const SWITCHABLE_MODES: readonly SwitchableMode[] = ['chat', 'work'];
const HTTPS_URL = { pattern: /^https:\/\//, maxLength: 4096 } as const;
const TURN_KEY = { maxLength: 256 } as const;
const LABEL = { maxLength: 200, allowEmpty: true } as const;
const FILE_NAME = { pattern: /^[^/\\\0]+$/, maxLength: 255 } as const;
const MAX_FILE_CANDIDATES = 100;
const CATALOG_HOST = { pattern: CATALOG_HOST_PATTERN, maxLength: 253 } as const;
const CATALOG_STATUSES: readonly CatalogRefreshStatus[] = [
  'updated',
  'unchanged',
  'missing',
  'failed',
  'disabled',
];

function readConversationId(rec: Record<string, unknown>, path: string, issues: Issue[]): string {
  return requireString(rec, 'conversationId', path, issues, { pattern: ID_PATTERN });
}

const readBlobRef: Reader<BlobRef> = (raw, path, issues) => {
  const rec = readObject(raw, path, issues);
  return {
    blobId: requireString(rec, 'blobId', path, issues, { pattern: ID_PATTERN }),
    name: requireString(rec, 'name', path, issues, FILE_NAME),
    size: requireInt(rec, 'size', path, issues, { min: 1, max: MAX_ATTACHMENT_BYTES }),
    sha256: requireString(rec, 'sha256', path, issues, { pattern: SHA256_PATTERN }),
    mime: requireString(rec, 'mime', path, issues, { maxLength: 255 }),
  };
};

const readFileCandidate: Reader<FileCandidate> = (raw, path, issues) => {
  const rec = readObject(raw, path, issues);
  const href = optionalString(rec, 'href', path, issues, { maxLength: 4096 });
  return {
    kind: requireLiteral(rec, 'kind', path, issues, ['sandbox', 'estuary', 'button'] as const),
    label: requireString(rec, 'label', path, issues, { maxLength: 1_000, allowEmpty: true }),
    ...(href === undefined ? {} : { href }),
    controlRef: requireString(rec, 'controlRef', path, issues, { maxLength: 256 }),
  };
};

const readModelTarget: Reader<ModelTarget> = (raw, path, issues) => {
  const rec = readObject(raw, path, issues);
  if (rec.preset !== undefined) {
    if (rec.model !== undefined || rec.mode !== undefined) {
      fail(issues, path, 'give either preset or mode and model, not both');
    }
    return { preset: requireString(rec, 'preset', path, issues, { maxLength: 64 }) };
  }
  const mode = requireLiteral(rec, 'mode', path, issues, ['chat'] as const);
  const model = requireString(rec, 'model', path, issues, { maxLength: 200 });
  if (rec.effort !== undefined && rec.effortIndex !== undefined) {
    fail(issues, path, 'give either effort or effortIndex, not both');
  }
  if (rec.effortIndex !== undefined) {
    return { mode, model, effortIndex: requireInt(rec, 'effortIndex', path, issues, { max: 64 }) };
  }
  const effort = optionalString(rec, 'effort', path, issues, { maxLength: 64 });
  return effort === undefined ? { mode, model } : { mode, model, effort };
};

const readModelSelection: Reader<ModelSelection> = (raw, path, issues) => {
  const rec = readObject(raw, path, issues);
  return {
    modelId: nullableString(rec, 'modelId', path, issues, { maxLength: 200 }),
    modelLabel: requireString(rec, 'modelLabel', path, issues, LABEL),
    effortIndex: nullableInt(rec, 'effortIndex', path, issues, { max: 64 }),
    effortMax: nullableInt(rec, 'effortMax', path, issues, { max: 64 }),
  };
};

const readSwitchedMode: Reader<NonNullable<ConversationReadyResult['switchedMode']>> = (
  raw,
  path,
  issues,
) => {
  const rec = readObject(raw, path, issues);
  const from = requireLiteral(rec, 'from', path, issues, SWITCHABLE_MODES);
  const to = requireLiteral(rec, 'to', path, issues, SWITCHABLE_MODES);
  if (from === to) fail(issues, path, 'from and to must differ');
  return { from, to };
};

const readReady: Reader<ConversationReadyResult> = (raw, path, issues) => {
  const rec = readObject(raw, path, issues);
  const mode = requireLiteral(rec, 'mode', path, issues, CHAT_MODES);
  const switchedMode =
    rec.switchedMode === undefined
      ? undefined
      : readSwitchedMode(rec.switchedMode, at(path, 'switchedMode'), issues);
  if (switchedMode && switchedMode.to !== mode) {
    fail(issues, at(path, 'switchedMode'), 'to must be the reported mode');
  }
  return {
    url: requireString(rec, 'url', path, issues, HTTPS_URL),
    conversationId: nullableString(rec, 'conversationId', path, issues, { pattern: ID_PATTERN }),
    loggedIn: requireBoolean(rec, 'loggedIn', path, issues),
    mode,
    evidence: requireRecord(rec, 'evidence', path, issues),
    ...(switchedMode === undefined ? {} : { switchedMode }),
  };
};

const PARAM_READERS: { readonly [K in OpName]: Reader<OpParamsMap[K]> } = {
  ...PROJECT_PARAM_READERS,
  'conversation.open': (raw, path, issues) => {
    const rec = readObject(raw, path, issues);
    if (rec.new !== undefined) {
      if (rec.new !== true) fail(issues, at(path, 'new'), 'must be true');
      if (rec.conversationId !== undefined) {
        fail(issues, path, 'give either new or conversationId, not both');
      }
      return { new: true };
    }
    return { conversationId: readConversationId(rec, path, issues) };
  },
  'conversation.close': (raw, path, issues) => {
    const rec = readObject(raw, path, issues);
    return { tabId: requireInt(rec, 'tabId', path, issues) };
  },
  'conversation.ready': (raw, path, issues) => {
    const rec = readObject(raw, path, issues);
    const ensureMode = optionalLiteral(rec, 'ensureMode', path, issues, SWITCHABLE_MODES);
    const restore = optionalBoolean(rec, 'restore', path, issues);
    const withMode = {
      ...(ensureMode === undefined ? {} : { ensureMode }),
      ...(restore === undefined ? {} : { restore }),
    };
    if (rec.expect === undefined) return withMode;
    const expectPath = at(path, 'expect');
    const expect = readObject(rec.expect, expectPath, issues);
    const conversationId = optionalString(expect, 'conversationId', expectPath, issues, {
      pattern: ID_PATTERN,
    });
    return { expect: conversationId === undefined ? {} : { conversationId }, ...withMode };
  },
  'model.inspect': (raw, path, issues) => {
    readObject(raw, path, issues);
    return {};
  },
  'model.select': (raw, path, issues) => {
    const rec = readObject(raw, path, issues);
    const target = readModelTarget(rec.target, at(path, 'target'), issues);
    const capturePrevious = optionalBoolean(rec, 'capturePrevious', path, issues);
    return capturePrevious === undefined ? { target } : { target, capturePrevious };
  },
  'composer.attach': (raw, path, issues) => {
    const rec = readObject(raw, path, issues);
    const blobs = requireArray(rec, 'blobs', path, issues, readBlobRef, {
      min: 1,
      max: MAX_ATTACHMENTS,
    });
    const method = optionalLiteral(rec, 'method', path, issues, [
      'auto',
      'paste',
      'input',
    ] as const);
    return method === undefined ? { blobs } : { blobs, method };
  },
  'composer.send': (raw, path, issues) => {
    const rec = readObject(raw, path, issues);
    const text = requireString(rec, 'text', path, issues);
    const expectAttachments = optionalArray(
      rec,
      'expectAttachments',
      path,
      issues,
      stringItem(FILE_NAME),
      { max: MAX_ATTACHMENTS },
    );
    const withAttachments =
      expectAttachments === undefined ? { text } : { text, expectAttachments };
    if (rec.expect === undefined) return withAttachments;
    const expectPath = at(path, 'expect');
    const expect = readObject(rec.expect, expectPath, issues);
    return {
      ...withAttachments,
      expect: { conversationId: readConversationId(expect, expectPath, issues) },
    };
  },
  'turns.waitReply': (raw, path, issues) => {
    const rec = readObject(raw, path, issues);
    const timeoutMs = optionalInt(rec, 'timeoutMs', path, issues, {
      min: 1,
      max: WAIT_REPLY_MAX_TIMEOUT_MS,
    });
    const stallMs = optionalInt(rec, 'stallMs', path, issues, {
      min: 1,
      max: WAIT_REPLY_MAX_TIMEOUT_MS,
    });
    const stableMs = optionalInt(rec, 'stableMs', path, issues, { max: 60_000 });
    return {
      conversationId: readConversationId(rec, path, issues),
      afterUserTurnKey: requireString(rec, 'afterUserTurnKey', path, issues, TURN_KEY),
      ...(timeoutMs === undefined ? {} : { timeoutMs }),
      ...(stallMs === undefined ? {} : { stallMs }),
      ...(stableMs === undefined ? {} : { stableMs }),
    };
  },
  'turns.read': (raw, path, issues) => {
    const rec = readObject(raw, path, issues);
    const conversationId = readConversationId(rec, path, issues);
    if (rec.latest !== undefined) {
      if (rec.latest !== true) fail(issues, at(path, 'latest'), 'must be true');
      if (rec.assistantTurnKey !== undefined) {
        fail(issues, path, 'give either assistantTurnKey or latest, not both');
      }
      return { conversationId, latest: true };
    }
    return {
      conversationId,
      assistantTurnKey: requireString(rec, 'assistantTurnKey', path, issues, TURN_KEY),
    };
  },
  'files.download': (raw, path, issues) => {
    const rec = readObject(raw, path, issues);
    return {
      conversationId: readConversationId(rec, path, issues),
      assistantTurnKey: requireString(rec, 'assistantTurnKey', path, issues, TURN_KEY),
      candidate: readFileCandidate(rec.candidate, at(path, 'candidate'), issues),
    };
  },
  'catalog.refresh': (raw, path, issues) => {
    const rec = readObject(raw, path, issues);
    const host = optionalString(rec, 'host', path, issues, CATALOG_HOST);
    return host === undefined ? {} : { host };
  },
};

const readDownloaded: Reader<FilesDownloadResult> = (raw, path, issues) => {
  const rec = readObject(raw, path, issues);
  const file = {
    name: requireString(rec, 'name', path, issues, FILE_NAME),
    size: requireInt(rec, 'size', path, issues),
    sha256: requireString(rec, 'sha256', path, issues, { pattern: SHA256_PATTERN }),
    mime: requireString(rec, 'mime', path, issues, { maxLength: 255 }),
  };
  if ((rec.blobId === undefined) === (rec.path === undefined)) {
    fail(issues, path, 'must have exactly one of blobId or path');
    return { ...file, blobId: '' };
  }
  return rec.blobId !== undefined
    ? { ...file, blobId: requireString(rec, 'blobId', path, issues, { pattern: ID_PATTERN }) }
    : { ...file, path: requireString(rec, 'path', path, issues, { maxLength: 4096 }) };
};

const RESULT_READERS: { readonly [K in OpName]: Reader<OpResultMap[K]> } = {
  ...PROJECT_RESULT_READERS,
  'conversation.open': (raw, path, issues) => {
    const rec = readObject(raw, path, issues);
    const documentId = optionalString(rec, 'documentId', path, issues, { pattern: ID_PATTERN });
    return {
      tabId: requireInt(rec, 'tabId', path, issues),
      url: requireString(rec, 'url', path, issues, HTTPS_URL),
      ...(documentId === undefined ? {} : { documentId }),
      docNonce: requireString(rec, 'docNonce', path, issues, { pattern: ID_PATTERN }),
      ready: readReady(rec.ready, at(path, 'ready'), issues),
    };
  },
  'conversation.close': (raw, path, issues) => {
    const rec = readObject(raw, path, issues);
    const restoredMode = optionalBoolean(rec, 'restoredMode', path, issues);
    return {
      closed: requireBoolean(rec, 'closed', path, issues),
      ...(restoredMode === undefined ? {} : { restoredMode }),
    };
  },
  'conversation.ready': readReady,
  'model.inspect': (raw, path, issues) => {
    const rec = readObject(raw, path, issues);
    return {
      triggerText: requireString(rec, 'triggerText', path, issues, LABEL),
      triggerEffortAttr: nullableString(rec, 'triggerEffortAttr', path, issues, LABEL),
      triggerExpanded: requireBoolean(rec, 'triggerExpanded', path, issues),
      mode: requireLiteral(rec, 'mode', path, issues, CHAT_MODES),
    };
  },
  'model.select': (raw, path, issues) => {
    const rec = readObject(raw, path, issues);
    const previous =
      rec.previous === undefined
        ? undefined
        : readModelSelection(rec.previous, at(path, 'previous'), issues);
    return {
      changed: requireBoolean(rec, 'changed', path, issues),
      ...(previous === undefined ? {} : { previous }),
      observed: readModelSelection(rec.observed, at(path, 'observed'), issues),
      evidence: requireRecord(rec, 'evidence', path, issues),
    };
  },
  'composer.attach': (raw, path, issues) => {
    const rec = readObject(raw, path, issues);
    const attached = requireArray(
      rec,
      'attached',
      path,
      issues,
      (item, itemPath, list) => {
        const entry = readObject(item, itemPath, list);
        return {
          name: requireString(entry, 'name', itemPath, list, FILE_NAME),
          method: requireLiteral(entry, 'method', itemPath, list, ['paste', 'input'] as const),
        };
      },
      { max: MAX_ATTACHMENTS },
    );
    return { attached, evidence: requireRecord(rec, 'evidence', path, issues) };
  },
  'composer.send': (raw, path, issues) => {
    const rec = readObject(raw, path, issues);
    return {
      conversationId: readConversationId(rec, path, issues),
      url: requireString(rec, 'url', path, issues, HTTPS_URL),
      userTurnKey: requireString(rec, 'userTurnKey', path, issues, TURN_KEY),
    };
  },
  'turns.waitReply': (raw, path, issues) => {
    const rec = readObject(raw, path, issues);
    return {
      assistantTurnKey: requireString(rec, 'assistantTurnKey', path, issues, TURN_KEY),
      status: requireLiteral(rec, 'status', path, issues, ['complete'] as const),
      elapsedMs: requireInt(rec, 'elapsedMs', path, issues),
      evidence: requireRecord(rec, 'evidence', path, issues),
    };
  },
  'turns.read': (raw, path, issues) => {
    const rec = readObject(raw, path, issues);
    const messageId = optionalString(rec, 'messageId', path, issues, { maxLength: 256 });
    return {
      markdown: requireString(rec, 'markdown', path, issues, { allowEmpty: true }),
      turnKey: requireString(rec, 'turnKey', path, issues, TURN_KEY),
      ...(messageId === undefined ? {} : { messageId }),
      textSha256: requireString(rec, 'textSha256', path, issues, { pattern: SHA256_PATTERN }),
      files: requireArray(rec, 'files', path, issues, readFileCandidate, {
        max: MAX_FILE_CANDIDATES,
      }),
    };
  },
  'files.download': readDownloaded,
  'catalog.refresh': (raw, path, issues) => {
    const rec = readObject(raw, path, issues);
    const checkedAt = optionalInt(rec, 'checkedAt', path, issues);
    const reason = optionalString(rec, 'reason', path, issues, { maxLength: 1_000 });
    return {
      host: requireString(rec, 'host', path, issues, CATALOG_HOST),
      status: requireLiteral(rec, 'status', path, issues, CATALOG_STATUSES),
      revision: nullableInt(rec, 'revision', path, issues),
      ...(checkedAt === undefined ? {} : { checkedAt }),
      ...(reason === undefined ? {} : { reason }),
      extensionVersion: requireString(rec, 'extensionVersion', path, issues, { maxLength: 64 }),
    };
  },
};

/** Reader for `op`'s params, for embedding in a larger message (a task, a call). */
export function opParamsReader<K extends OpName>(op: K): Reader<OpParamsMap[K]> {
  return PARAM_READERS[op];
}

export function validateOpParams<K extends OpName>(
  op: K,
  raw: unknown,
): Validation<OpParamsMap[K]> {
  return validateWith(PARAM_READERS[op], raw);
}

export function validateOpResult<K extends OpName>(
  op: K,
  raw: unknown,
): Validation<OpResultMap[K]> {
  return validateWith(RESULT_READERS[op], raw);
}

export function validateWaitReplyProgress(raw: unknown): Validation<WaitReplyProgress> {
  return validateWith((value, path, issues) => {
    const rec = readObject(value, path, issues);
    return {
      phase: requireLiteral(rec, 'phase', path, issues, [
        'thinking',
        'streaming',
        'finalizing',
      ] as const),
      textLength: requireInt(rec, 'textLength', path, issues),
      elapsedMs: requireInt(rec, 'elapsedMs', path, issues),
    };
  }, raw);
}
