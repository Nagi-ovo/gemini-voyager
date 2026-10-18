import { isAccountKey } from '@/features/bridge/accountPlanStore';
/**
 * The postMessage protocol between the Local Bridge content script and the
 * page-world account observer (`public/chatgpt-account-observer.js`, which
 * repeats the two source tags). Page scripts can post the same tags, so a
 * message is only ever a report of plan fields, checked down to its shape.
 */
import { type AccountPlan, readAccountPlan } from '@/features/bridge/protocol';

/** Messages the page observer posts. */
export const ACCOUNT_OBSERVER_SOURCE = 'gv-chatgpt-account-observer';
/** Messages the content script posts: `arm` / `disarm`. */
export const ACCOUNT_CONTENT_SOURCE = 'gv-chatgpt-account';

const MAX_ACCOUNTS = 16;

export type AccountObserverEvent =
  | { readonly type: 'ready' }
  | { readonly type: 'account'; readonly account: string }
  | {
      readonly type: 'plans';
      readonly plans: Readonly<Record<string, AccountPlan>>;
      readonly current: string | null;
    };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** The observer's event, or null for another frame, origin, tag or shape. */
export function readAccountObserverMessage(
  event: MessageEvent,
  win: Window = window,
): AccountObserverEvent | null {
  if (event.source !== win || event.origin !== win.location.origin) return null;
  const data: unknown = event.data;
  if (!isRecord(data) || data.source !== ACCOUNT_OBSERVER_SOURCE) return null;
  if (data.type === 'ready') return { type: 'ready' };
  const payload = data.payload;
  if (!isRecord(payload)) return null;
  if (data.type === 'account') {
    return isAccountKey(payload.account) ? { type: 'account', account: payload.account } : null;
  }
  if (data.type !== 'plans' || !Array.isArray(payload.accounts)) return null;
  if (payload.accounts.length > MAX_ACCOUNTS) return null;
  const plans: Record<string, AccountPlan> = {};
  for (const entry of payload.accounts) {
    if (!isRecord(entry) || !isAccountKey(entry.account)) return null;
    // Only the plan fields survive, whatever else a page script put in.
    const plan = readAccountPlan(entry.plan);
    if (plan) {
      const { observedAt: _observedAt, ...fields } = plan;
      plans[entry.account] = fields;
    }
  }
  const current = isAccountKey(payload.current) && plans[payload.current] ? payload.current : null;
  return Object.keys(plans).length ? { type: 'plans', plans, current } : null;
}

export function postToAccountObserver(type: 'arm' | 'disarm', win: Window = window): void {
  try {
    win.postMessage({ source: ACCOUNT_CONTENT_SOURCE, type }, win.location.origin);
  } catch {
    // A closing page has nothing left to arm.
  }
}
