/**
 * The neutral primitives the extension executes (spec §3.4). The extension
 * knows nothing about `ask` or `pro`: a CLI model preset reaches it as
 * `{ preset }` and the site data expands it. Every op, including the ones the
 * service worker runs itself, has to be in the site's `bridge.allow`, except
 * the {@link POLICY_EXEMPT_OPS}.
 */

import { PROJECT_OP_NAMES, type ProjectOpParamsMap, type ProjectOpResultMap } from './projectOps';

export const OP_NAMES = [
  'conversation.open',
  'conversation.close',
  'conversation.ready',
  'model.inspect',
  'model.select',
  'composer.attach',
  'composer.send',
  'turns.waitReply',
  'turns.approve',
  'turns.read',
  'files.download',
  'catalog.refresh',
  ...PROJECT_OP_NAMES,
] as const;

export type OpName = (typeof OP_NAMES)[number];

export function isOpName(value: unknown): value is OpName {
  return typeof value === 'string' && (OP_NAMES as readonly string[]).includes(value);
}

/**
 * Ops the site policy does not gate. The policy comes from the cached catalog,
 * so an op that re-fetches the catalog must run while that policy is stale,
 * broken or silent about it; the bridge still has to be on and paired.
 */
export const POLICY_EXEMPT_OPS: readonly OpName[] = ['catalog.refresh'];

export function isPolicyExemptOp(op: unknown): boolean {
  return (POLICY_EXEMPT_OPS as readonly unknown[]).includes(op);
}

export const MAX_ATTACHMENTS = 10;
/** Largest single attachment, zipped folders included (spec Q8). */
export const MAX_ATTACHMENT_BYTES = 64 * 1024 * 1024;
/**
 * A reply's hard cap. A reply ChatGPT is still working on is waited for until
 * then; the real limit is {@link WAIT_REPLY_DEFAULT_STALL_MS} without activity.
 */
export const WAIT_REPLY_MAX_TIMEOUT_MS = 12 * 60 * 60_000;
export const WAIT_REPLY_DEFAULT_TIMEOUT_MS = WAIT_REPLY_MAX_TIMEOUT_MS;
/** How long a reply may show no activity at all before it fails `reply-stalled`. */
export const WAIT_REPLY_DEFAULT_STALL_MS = 20 * 60_000;
export const WAIT_REPLY_DEFAULT_STABLE_MS = 1_500;

/** Facts an op saw on the page, kept for diagnosis; never interpreted by the caller. */
export type Evidence = Readonly<Record<string, unknown>>;

export type ChatMode = 'chat' | 'work' | 'unknown';

// conversation.open / conversation.close (run by the service worker)

export type ConversationOpenParams = { readonly new: true } | { readonly conversationId: string };

export interface ConversationOpenResult {
  readonly tabId: number;
  readonly url: string;
  /** Chrome only; Firefox identifies the document by `docNonce` alone. */
  readonly documentId?: string;
  readonly docNonce: string;
  readonly ready: ConversationReadyResult;
}

export interface ConversationCloseParams {
  readonly tabId: number;
}

export interface ConversationCloseResult {
  /** False when the person had already closed the tab; that is not a failure. */
  readonly closed: boolean;
  /**
   * Present when the bridge had switched the tab's mode (see
   * `ConversationReadyResult.switchedMode`) and tried to switch it back before
   * closing; false when that could not be confirmed. The tab closes either way.
   */
  readonly restoredMode?: boolean;
}

// conversation.ready

/** The modes a page can be switched to; `unknown` is only ever an observation. */
export type SwitchableMode = Exclude<ChatMode, 'unknown'>;

export interface ConversationReadyParams {
  readonly expect?: { readonly conversationId?: string };
  /**
   * The mode the page must end in; defaults to `chat`. A page positively seen
   * in the other mode is switched with its own mode control, under a lease.
   */
  readonly ensureMode?: SwitchableMode;
  /**
   * The switch back before a bridge tab closes. It may click in a background
   * tab: a long reply leaves the tab behind the person's own.
   */
  readonly restore?: boolean;
}

export interface ConversationReadyResult {
  readonly url: string;
  readonly conversationId: string | null;
  readonly loggedIn: boolean;
  readonly mode: ChatMode;
  readonly evidence: Evidence;
  /** Present when this op switched the page's mode; `from` is what to restore later. */
  readonly switchedMode?: { readonly from: SwitchableMode; readonly to: SwitchableMode };
}

// model.inspect (read-only: never opens the menu)

export type ModelInspectParams = Readonly<Record<string, never>>;

export interface ModelInspectResult {
  readonly triggerText: string;
  /** Raw `data-selected-reasoning-effort`; recorded, never used as evidence. */
  readonly triggerEffortAttr: string | null;
  readonly triggerExpanded: boolean;
  readonly mode: ChatMode;
}

// model.select

export type ModelTarget =
  | { readonly preset: string }
  | { readonly mode: 'chat'; readonly model: string; readonly effort?: string }
  /** Only for restoring a selection captured earlier. */
  | { readonly mode: 'chat'; readonly model: string; readonly effortIndex: number };

export interface ModelSelectParams {
  readonly target: ModelTarget;
  readonly capturePrevious?: boolean;
}

export interface ModelSelection {
  readonly modelId: string | null;
  readonly modelLabel: string;
  readonly effortIndex: number | null;
  readonly effortMax: number | null;
}

export interface ModelSelectResult {
  readonly changed: boolean;
  readonly previous?: ModelSelection;
  readonly observed: ModelSelection;
  readonly evidence: Evidence;
}

// composer.attach

/** A blob the server holds; the page pulls its bytes in chunks (spec §2.7). */
export interface BlobRef {
  readonly blobId: string;
  readonly name: string;
  readonly size: number;
  readonly sha256: string;
  readonly mime: string;
}

export type AttachMethod = 'paste' | 'input';

export interface ComposerAttachParams {
  readonly blobs: readonly BlobRef[];
  readonly method?: 'auto' | AttachMethod;
}

export interface ComposerAttachResult {
  readonly attached: readonly { readonly name: string; readonly method: AttachMethod }[];
  readonly evidence: Evidence;
}

// composer.send

export interface ComposerSendParams {
  readonly text: string;
  readonly expectAttachments?: readonly string[];
  /**
   * The existing conversation the prompt must go to. The page refuses before
   * any page event when the tab shows another one; omitted for a new chat.
   */
  readonly expect?: { readonly conversationId: string };
}

export interface ComposerSendResult {
  readonly conversationId: string;
  readonly url: string;
  readonly userTurnKey: string;
}

// turns.waitReply (passive)

/**
 * Waits while ChatGPT is still working on the reply: its stop control or a
 * thinking marker shows, or its text keeps changing. Fails `reply-stalled` after
 * `stallMs` with none of these, and `timeout` at `timeoutMs` whatever happens.
 */
export interface TurnsWaitReplyParams {
  readonly conversationId: string;
  readonly afterUserTurnKey: string;
  /** Hard cap. Default and maximum `WAIT_REPLY_MAX_TIMEOUT_MS`. */
  readonly timeoutMs?: number;
  /** Default `WAIT_REPLY_DEFAULT_STALL_MS`, at most `WAIT_REPLY_MAX_TIMEOUT_MS`. */
  readonly stallMs?: number;
  /** Default `WAIT_REPLY_DEFAULT_STABLE_MS`. */
  readonly stableMs?: number;
  /**
   * Fail `approval-required` as soon as the reply shows an app's approval card
   * (ChatGPT asking the person to let Google Drive, GitHub… run a tool), with
   * {@link ApprovalCardEvidence} as its details. Without it, the wait goes on
   * while the card waits for a click; an older extension ignores this.
   */
  readonly stopOnApproval?: boolean;
}

export interface TurnsWaitReplyResult {
  readonly assistantTurnKey: string;
  readonly status: 'complete';
  readonly elapsedMs: number;
  readonly evidence: Evidence;
}

/** The `event` of a `turns.waitReply` progress report, sent every 15 s. */
export interface WaitReplyProgress {
  readonly phase: 'thinking' | 'streaming' | 'finalizing';
  readonly textLength: number;
  readonly elapsedMs: number;
}

/** The details of an `approval-required` failure: what the card in the reply asks for. */
export interface ApprovalCardEvidence {
  /** The app the card names, e.g. `Google Drive`; empty when it names none. */
  readonly app: string;
  /** The card's text, whitespace collapsed, at most 300 characters. */
  readonly text: string;
  /** The answers the card offers that `turns.approve` can click. */
  readonly choices: readonly ApprovalChoice[];
}

// turns.approve (leased): answer an app's approval card in the reply

/** `always` is ChatGPT's own "Always allow": it keeps that tool allowed in the person's settings. */
export type ApprovalChoice = 'always' | 'once';

export interface TurnsApproveParams {
  readonly conversationId: string;
  /** The prompt whose reply shows the card, as for `turns.waitReply`. */
  readonly afterUserTurnKey: string;
  readonly choice: ApprovalChoice;
}

export interface TurnsApproveResult {
  /** False when no card was left to answer: the person, or another run, answered it first. */
  readonly clicked: boolean;
  readonly app: string;
  readonly evidence: Evidence;
}

// turns.read (passive)

/**
 * One finished reply: the one `turns.waitReply` named, or with `latest` the
 * conversation's last turn, which must have finished (a reply still being
 * written is `unverified`, never an earlier reply instead).
 */
export type TurnsReadParams =
  | { readonly conversationId: string; readonly assistantTurnKey: string }
  | { readonly conversationId: string; readonly latest: true };

export type FileCandidateKind = 'sandbox' | 'estuary' | 'button';

/** Most files one `turns.read` lists. */
export const MAX_FILE_CANDIDATES = 100;

export interface FileCandidate {
  readonly kind: FileCandidateKind;
  readonly label: string;
  readonly href?: string;
  /**
   * Opaque handle the page side uses to find the file again; for `sandbox`, the
   * id of the message whose text links it (`href` is `sandbox:/mnt/data/…`).
   */
  readonly controlRef: string;
}

export interface TurnsReadResult {
  readonly markdown: string;
  readonly turnKey: string;
  readonly messageId?: string;
  readonly textSha256: string;
  readonly files: readonly FileCandidate[];
}

// files.download: the bytes reach serve as a blob (see the Blobs section of http.ts)

export interface FilesDownloadParams {
  readonly conversationId: string;
  readonly assistantTurnKey: string;
  readonly candidate: FileCandidate;
}

interface DownloadedFile {
  readonly name: string;
  readonly size: number;
  readonly sha256: string;
  readonly mime: string;
}

export type FilesDownloadResult =
  /** (i) bytes fetched by the page and uploaded to a server blob. */
  | (DownloadedFile & { readonly blobId: string })
  /** (ii) the browser saved the file; the server copies it from this path. */
  | (DownloadedFile & { readonly path: string });

// catalog.refresh (run by the service worker; no tab, no page lease)

/** The host whose site data (`hosts/<host>.json`) a refresh fetches when none is given. */
export const CATALOG_REFRESH_DEFAULT_HOST = 'chatgpt.com';

/** A lowercase DNS hostname with at least one dot, at most 253 characters. */
export const CATALOG_HOST_PATTERN =
  /^(?=.{1,253}$)[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/;

export interface CatalogRefreshParams {
  /** Default {@link CATALOG_REFRESH_DEFAULT_HOST}. */
  readonly host?: string;
}

/**
 * - `updated` / `unchanged`: fetched; the cached site data changed or not;
 * - `missing`: nothing is published for the host (404);
 * - `failed`: the fetch or its data failed; the cache keeps what it had;
 * - `disabled`: this extension build has no online site data.
 */
export type CatalogRefreshStatus = 'updated' | 'unchanged' | 'missing' | 'failed' | 'disabled';

/** A fetch that failed is a result with `status: 'failed'`, not an error. */
export interface CatalogRefreshResult {
  readonly host: string;
  readonly status: CatalogRefreshStatus;
  /** The cached site's `catalogRevision` after the refresh; null when it has none. */
  readonly revision: number | null;
  readonly checkedAt?: number;
  /** Why it failed; diagnostic only. */
  readonly reason?: string;
  /** The running extension's version (the pairing only knows the one it paired with). */
  readonly extensionVersion: string;
}

export interface OpParamsMap extends ProjectOpParamsMap {
  'conversation.open': ConversationOpenParams;
  'conversation.close': ConversationCloseParams;
  'conversation.ready': ConversationReadyParams;
  'model.inspect': ModelInspectParams;
  'model.select': ModelSelectParams;
  'composer.attach': ComposerAttachParams;
  'composer.send': ComposerSendParams;
  'turns.waitReply': TurnsWaitReplyParams;
  'turns.approve': TurnsApproveParams;
  'turns.read': TurnsReadParams;
  'files.download': FilesDownloadParams;
  'catalog.refresh': CatalogRefreshParams;
}

export interface OpResultMap extends ProjectOpResultMap {
  'conversation.open': ConversationOpenResult;
  'conversation.close': ConversationCloseResult;
  'conversation.ready': ConversationReadyResult;
  'model.inspect': ModelInspectResult;
  'model.select': ModelSelectResult;
  'composer.attach': ComposerAttachResult;
  'composer.send': ComposerSendResult;
  'turns.waitReply': TurnsWaitReplyResult;
  'turns.approve': TurnsApproveResult;
  'turns.read': TurnsReadResult;
  'files.download': FilesDownloadResult;
  'catalog.refresh': CatalogRefreshResult;
}
