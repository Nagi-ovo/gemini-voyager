/**
 * Error codes (spec §2.5). The category tells the caller, or the agent driving
 * it, what to do next: `user-action` stops and asks a person, `data` means the
 * caller, the versions or the host page are wrong, `transient` means the run
 * lost its environment. No category means "retry automatically": every failure
 * is final for its job.
 */

export type ErrorCategory = 'user-action' | 'data' | 'transient';

export const ERROR_CATEGORIES = {
  // user-action: a person has to do something before anything else is tried.
  challenge: 'user-action',
  'login-required': 'user-action',
  'account-blocked': 'user-action',
  'rate-limited': 'user-action',
  'bridge-disabled': 'user-action',
  'not-paired': 'user-action',
  'permission-missing': 'user-action',
  'policy-denied': 'user-action',
  'policy-stale': 'user-action',
  'mode-unavailable': 'user-action',
  'mode-unknown': 'user-action',
  'model-not-found': 'user-action',
  'effort-unavailable': 'user-action',
  'composer-busy': 'user-action',
  'tab-hidden': 'user-action',
  'busy-stale': 'user-action',
  'extension-offline': 'user-action',
  /** Wrong or missing CLI token, or a request from a forbidden Origin/Host (HTTP 401/403). */
  unauthorized: 'user-action',

  // data: the caller, a version or the host page is wrong.
  'bad-request': 'data',
  'unsupported-op': 'data',
  'protocol-mismatch': 'data',
  'unsupported-data': 'data',
  'selector-missing': 'data',
  'menu-not-found': 'data',
  unverified: 'data',
  /** The send event went out but was not confirmed. Callers must never send again. */
  'send-unverified': 'data',
  'reply-failed': 'data',
  'attachment-too-large': 'data',
  'attachment-rejected': 'data',
  'hash-mismatch': 'data',
  'zip-invalid': 'data',
  'path-unsafe': 'data',
  /** Unknown job, task or blob id (HTTP 404). */
  'not-found': 'data',
  /** The job or task has already ended (HTTP 410). */
  gone: 'data',

  // transient: the run lost its environment; nothing retries on its own.
  busy: 'transient',
  timeout: 'transient',
  'tab-closed': 'transient',
  'document-lost': 'transient',
  'extension-reloaded': 'transient',
  'server-unreachable': 'transient',
  cancelled: 'transient',
} as const satisfies Record<string, ErrorCategory>;

export type ErrorCode = keyof typeof ERROR_CATEGORIES;

export const ERROR_CODES = Object.keys(ERROR_CATEGORIES) as ErrorCode[];

export function isErrorCode(value: unknown): value is ErrorCode {
  return typeof value === 'string' && Object.hasOwn(ERROR_CATEGORIES, value);
}

export function categoryOf(code: ErrorCode): ErrorCategory {
  return ERROR_CATEGORIES[code];
}

export interface BridgeError {
  readonly code: ErrorCode;
  readonly category: ErrorCategory;
  readonly message: string;
  readonly details?: Readonly<Record<string, unknown>>;
}

/** Build an error whose category always matches its code. */
export function bridgeError(
  code: ErrorCode,
  message: string,
  details?: Readonly<Record<string, unknown>>,
): BridgeError {
  return details === undefined
    ? { code, category: categoryOf(code), message }
    : { code, category: categoryOf(code), message, details };
}
