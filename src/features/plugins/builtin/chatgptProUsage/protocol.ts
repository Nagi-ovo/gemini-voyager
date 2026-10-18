/**
 * The postMessage protocol between the content script and the page-world
 * observer (`public/chatgpt-pro-usage-observer.js`, which repeats these two
 * source tags). The observer only reports; every rule lives on this side.
 */

/** Messages the page observer posts. */
export const OBSERVER_SOURCE = 'gv-chatgpt-pro-usage-observer';
/** Messages the content script posts: `arm` / `disarm`. */
export const CONTENT_SOURCE = 'gv-chatgpt-pro-usage';

const MAX_MODEL_LENGTH = 100;
const MAX_KEY_LENGTH = 64;
const MAX_LIST_LENGTH = 32;

/**
 * `account` is a hash of the page's `chatgpt-account-id` request header, or
 * null when the request carried none. `ready` carries the last one the
 * observer saw, when it has seen one.
 */
export type ObserverEvent =
  | { readonly type: 'ready'; readonly account?: string | null }
  | { readonly type: 'account'; readonly account: string | null }
  | {
      readonly type: 'send';
      readonly account: string | null;
      readonly model: string;
      readonly mode: string | null;
      readonly key: string | null;
      readonly at: number;
    }
  | {
      readonly type: 'quota';
      readonly account: string | null;
      readonly payload: {
        readonly model_limits: readonly unknown[];
        readonly blocked_features: readonly unknown[];
      };
    };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function boundedString(value: unknown, max: number): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= max;
}

function isAccount(value: unknown): value is string | null {
  return value === null || boundedString(value, MAX_KEY_LENGTH);
}

function boundedList(value: unknown): value is unknown[] {
  return Array.isArray(value) && value.length <= MAX_LIST_LENGTH;
}

/**
 * The observer's event, or null for anything else: another frame or origin,
 * another source tag, or a payload of the wrong shape. Page scripts can post
 * the same tag, so a valid message is still only a report, never trusted beyond its shape.
 */
export function readObserverMessage(
  event: MessageEvent,
  win: Window = window,
): ObserverEvent | null {
  if (event.source !== win || event.origin !== win.location.origin) return null;
  const data: unknown = event.data;
  if (!isRecord(data) || data.source !== OBSERVER_SOURCE) return null;
  const payload = data.payload;
  if (data.type === 'ready') {
    if (!isRecord(payload) || !('account' in payload)) return { type: 'ready' };
    return isAccount(payload.account) ? { type: 'ready', account: payload.account } : null;
  }
  if (!isRecord(payload) || !isAccount(payload.account)) return null;
  const { account } = payload;
  if (data.type === 'account') return { type: 'account', account };
  if (data.type === 'send') {
    const { model, mode, key, at } = payload;
    if (!boundedString(model, MAX_MODEL_LENGTH)) return null;
    if (mode !== null && !boundedString(mode, MAX_MODEL_LENGTH)) return null;
    if (key !== null && !boundedString(key, MAX_KEY_LENGTH)) return null;
    if (typeof at !== 'number' || !Number.isFinite(at)) return null;
    return { type: 'send', account, model, mode, key, at };
  }
  if (data.type === 'quota') {
    const { model_limits: modelLimits, blocked_features: blockedFeatures } = payload;
    if (!boundedList(modelLimits) || !boundedList(blockedFeatures)) return null;
    return {
      type: 'quota',
      account,
      payload: { model_limits: modelLimits, blocked_features: blockedFeatures },
    };
  }
  return null;
}

export function postToObserver(type: 'arm' | 'disarm', win: Window = window): void {
  try {
    win.postMessage({ source: CONTENT_SOURCE, type }, win.location.origin);
  } catch {
    // A closing page has nothing left to arm.
  }
}
