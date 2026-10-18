/**
 * The ChatGPT plan each account's pages last showed (`StorageKeys.BRIDGE_ACCOUNT_PLANS`,
 * chrome.storage.local): `{ version: 1, accounts: { <hash>: AccountPlan }, current }`.
 * The key is a hash of the account id the page used, never the id; a plan holds
 * only the protocol's plan fields. The Local Bridge content script writes it from
 * what the page observer reports; the background hands the current one to `voyager
 * serve` with each poll.
 */
import { type AccountPlan, readAccountPlan } from '@/features/bridge/protocol';

export interface AccountPlanStore {
  readonly version: 1;
  readonly accounts: Readonly<Record<string, AccountPlan>>;
  /** The account the pages used last, when they named one. */
  readonly current: string | null;
}

export const EMPTY_ACCOUNT_PLANS: AccountPlanStore = { version: 1, accounts: {}, current: null };

/** A store keeps this many accounts, the most recently seen ones. */
export const MAX_STORED_ACCOUNTS = 16;
const ACCOUNT_KEY = /^[0-9a-f]{8,64}$/;

export function isAccountKey(value: unknown): value is string {
  return typeof value === 'string' && ACCOUNT_KEY.test(value);
}

function newestFirst(accounts: Record<string, AccountPlan>): Record<string, AccountPlan> {
  const entries = Object.entries(accounts)
    .sort(([, a], [, b]) => (b.observedAt ?? 0) - (a.observedAt ?? 0))
    .slice(0, MAX_STORED_ACCOUNTS);
  return Object.fromEntries(entries);
}

/** The stored value, keeping only well-formed accounts; anything else reads as empty. */
export function readAccountPlanStore(raw: unknown): AccountPlanStore {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return EMPTY_ACCOUNT_PLANS;
  const record = raw as Record<string, unknown>;
  if (record.version !== 1) return EMPTY_ACCOUNT_PLANS;
  const accounts: Record<string, AccountPlan> = {};
  const listed = record.accounts;
  if (typeof listed === 'object' && listed !== null && !Array.isArray(listed)) {
    for (const [key, value] of Object.entries(listed)) {
      const plan = isAccountKey(key) ? readAccountPlan(value) : null;
      if (plan) accounts[key] = plan;
    }
  }
  const kept = newestFirst(accounts);
  const current = isAccountKey(record.current) && kept[record.current] ? record.current : null;
  return { version: 1, accounts: kept, current };
}

/** `plans` seen at `observedAt` (`current` among them, or null when the page did not say). */
export function recordAccountPlans(
  store: AccountPlanStore,
  plans: Readonly<Record<string, AccountPlan>>,
  current: string | null,
  observedAt: number,
): AccountPlanStore {
  const accounts: Record<string, AccountPlan> = { ...store.accounts };
  for (const [key, plan] of Object.entries(plans)) {
    if (isAccountKey(key)) accounts[key] = { ...plan, observedAt };
  }
  const kept = newestFirst(accounts);
  const next = current !== null && kept[current] ? current : store.current;
  return { version: 1, accounts: kept, current: next !== null && kept[next] ? next : null };
}

/** The pages moved to another known account. */
export function switchAccount(store: AccountPlanStore, current: string): AccountPlanStore {
  return store.accounts[current] && store.current !== current ? { ...store, current } : store;
}

/**
 * The plan to report: the current account's, or the only account's when the pages
 * never said which one they use. With several accounts and none named, there is no
 * honest answer, so none.
 */
export function currentAccountPlan(store: AccountPlanStore): AccountPlan | null {
  if (store.current !== null) return store.accounts[store.current] ?? null;
  const plans = Object.values(store.accounts);
  return plans.length === 1 ? plans[0] : null;
}
