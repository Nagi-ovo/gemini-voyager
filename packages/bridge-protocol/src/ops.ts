/**
 * The neutral primitives the extension executes (spec §3.4). The extension
 * knows nothing about `ask` or `pro`: a CLI model preset reaches it as
 * `{ preset }` and the site data expands it. Every op, including the ones the
 * service worker runs itself, has to be in the site's `bridge.allow`.
 */

export const OP_NAMES = [
  'conversation.open',
  'conversation.close',
  'conversation.ready',
  'model.inspect',
  'model.select',
  'composer.attach',
  'composer.send',
  'turns.waitReply',
  'turns.read',
  'files.download',
] as const;

export type OpName = (typeof OP_NAMES)[number];

export function isOpName(value: unknown): value is OpName {
  return typeof value === 'string' && (OP_NAMES as readonly string[]).includes(value);
}

export const MAX_ATTACHMENTS = 10;
/** Largest single attachment, zipped folders included (spec Q8). */
export const MAX_ATTACHMENT_BYTES = 64 * 1024 * 1024;
export const WAIT_REPLY_DEFAULT_TIMEOUT_MS = 90 * 60_000;
export const WAIT_REPLY_MAX_TIMEOUT_MS = 180 * 60_000;
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
}

export interface ComposerSendResult {
  readonly conversationId: string;
  readonly url: string;
  readonly userTurnKey: string;
}

// turns.waitReply (passive)

export interface TurnsWaitReplyParams {
  readonly conversationId: string;
  readonly afterUserTurnKey: string;
  /** Default `WAIT_REPLY_DEFAULT_TIMEOUT_MS`, at most `WAIT_REPLY_MAX_TIMEOUT_MS`. */
  readonly timeoutMs?: number;
  /** Default `WAIT_REPLY_DEFAULT_STABLE_MS`. */
  readonly stableMs?: number;
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

// turns.read (passive)

export interface TurnsReadParams {
  readonly conversationId: string;
  readonly assistantTurnKey: string;
}

export type FileCandidateKind = 'sandbox' | 'estuary' | 'button';

export interface FileCandidate {
  readonly kind: FileCandidateKind;
  readonly label: string;
  readonly href?: string;
  /** Opaque handle the page side uses to find the control again. */
  readonly controlRef: string;
}

export interface TurnsReadResult {
  readonly markdown: string;
  readonly turnKey: string;
  readonly messageId?: string;
  readonly textSha256: string;
  readonly files: readonly FileCandidate[];
}

// files.download (transport decided by spec Q3)

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

export interface OpParamsMap {
  'conversation.open': ConversationOpenParams;
  'conversation.close': ConversationCloseParams;
  'conversation.ready': ConversationReadyParams;
  'model.inspect': ModelInspectParams;
  'model.select': ModelSelectParams;
  'composer.attach': ComposerAttachParams;
  'composer.send': ComposerSendParams;
  'turns.waitReply': TurnsWaitReplyParams;
  'turns.read': TurnsReadParams;
  'files.download': FilesDownloadParams;
}

export interface OpResultMap {
  'conversation.open': ConversationOpenResult;
  'conversation.close': ConversationCloseResult;
  'conversation.ready': ConversationReadyResult;
  'model.inspect': ModelInspectResult;
  'model.select': ModelSelectResult;
  'composer.attach': ComposerAttachResult;
  'composer.send': ComposerSendResult;
  'turns.waitReply': TurnsWaitReplyResult;
  'turns.read': TurnsReadResult;
  'files.download': FilesDownloadResult;
}
