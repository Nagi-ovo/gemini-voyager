/**
 * The ChatGPT plan of the account the bridge's pages last showed, as the page
 * itself was told (`GET /backend-api/accounts/check/…`, observed in the page,
 * never requested by Voyager). Only these fields cross the wire: no account
 * id, e-mail or token. Values are ChatGPT's own strings, passed on as they are
 * (`planType: "pro"`, `subscriptionPlan: "chatgptpro"`); nothing maps them to
 * a price or a limit. It is what the page saw when it last loaded, so it can
 * lag behind a change.
 */
import { isRecord } from './read';

export interface AccountPlan {
  readonly planType?: string | null;
  readonly planDisplayName?: string | null;
  readonly subscriptionPlan?: string | null;
  /** `personal`, or a workspace structure. */
  readonly structure?: string | null;
  readonly workspaceType?: string | null;
  readonly hasActiveSubscription?: boolean | null;
  /** `monthly`, `annual`, … as ChatGPT names it. */
  readonly billingPeriod?: string | null;
  /** ISO timestamps, as ChatGPT sends them. */
  readonly renewsAt?: string | null;
  readonly expiresAt?: string | null;
  readonly cancelsAt?: string | null;
  /** The plan a scheduled change moves to, when ChatGPT names one. */
  readonly scheduledPlanChange?: string | null;
  /** When the page saw these values (ms since the epoch). */
  readonly observedAt?: number;
}

export const ACCOUNT_PLAN_STRING_FIELDS = [
  'planType',
  'planDisplayName',
  'subscriptionPlan',
  'structure',
  'workspaceType',
  'billingPeriod',
  'renewsAt',
  'expiresAt',
  'cancelsAt',
  'scheduledPlanChange',
] as const;

export const MAX_ACCOUNT_PLAN_STRING = 100;
/** No control characters: a value is shown on a terminal as it is. */
function isPrintable(value: string): boolean {
  for (let i = 0; i < value.length; i += 1) {
    const code = value.charCodeAt(i);
    if (code < 0x20 || code === 0x7f) return false;
  }
  return true;
}

/**
 * An account plan from anywhere (the wire, storage, the page), keeping only the
 * fields above with sane values. Lenient on purpose: a field it does not like is
 * dropped, never an issue, so a page change cannot break the poll that carries it.
 * Null when nothing usable is left.
 */
export function readAccountPlan(raw: unknown): AccountPlan | null {
  if (!isRecord(raw)) return null;
  const plan: Record<string, unknown> = {};
  for (const key of ACCOUNT_PLAN_STRING_FIELDS) {
    const value = raw[key];
    if (value === null) plan[key] = null;
    else if (
      typeof value === 'string' &&
      value.length > 0 &&
      value.length <= MAX_ACCOUNT_PLAN_STRING &&
      isPrintable(value)
    ) {
      plan[key] = value;
    }
  }
  if (raw.hasActiveSubscription === null || typeof raw.hasActiveSubscription === 'boolean') {
    plan.hasActiveSubscription = raw.hasActiveSubscription;
  }
  const fields = Object.keys(plan).length;
  if (
    typeof raw.observedAt === 'number' &&
    Number.isSafeInteger(raw.observedAt) &&
    raw.observedAt > 0
  ) {
    plan.observedAt = raw.observedAt;
  }
  return fields === 0 ? null : (plan as AccountPlan);
}

/** The Pro tier read from ChatGPT's plan strings; anything not listed here is `unknown`. */
export type AccountTier = 'pro-lite' | 'pro' | 'pro-max' | 'unknown';

const TIER_BY_PLAN_TYPE: Readonly<Record<string, AccountTier>> = {
  // Measured live 2026-10-18.
  prolite: 'pro-lite',
  pro: 'pro',
  // From the Codex CLI source (openai/codex PR #47971, 2026-09-25); not seen in a real response.
  promax: 'pro-max',
};
// Measured live 2026-10-18. Pro Max's subscription string is not known.
const TIER_BY_SUBSCRIPTION: Readonly<Record<string, AccountTier>> = {
  chatgptprolite: 'pro-lite',
  chatgptpro: 'pro',
};

function tierOf(table: Readonly<Record<string, AccountTier>>, value: string | null | undefined) {
  if (value == null) return undefined;
  return Object.hasOwn(table, value) ? table[value] : 'unknown';
}

/**
 * `pro-lite` ($100), `pro` ($200) or `pro-max` ($500) from `planType` and
 * `subscriptionPlan`, never from the display name (ChatGPT shows "Pro" for both
 * $100 and $200). Both must agree when both are known; any other value is
 * `unknown`, and the raw values speak for themselves. Pro Max is named by its plan
 * type alone, since its subscription string is not known: only a subscription
 * naming another known tier overrules it.
 */
export function accountTier(plan: AccountPlan | null | undefined): AccountTier {
  if (!plan) return 'unknown';
  const byType = tierOf(TIER_BY_PLAN_TYPE, plan.planType);
  const bySubscription = tierOf(TIER_BY_SUBSCRIPTION, plan.subscriptionPlan);
  if (byType === 'pro-max') {
    return bySubscription === undefined || bySubscription === 'unknown' ? 'pro-max' : 'unknown';
  }
  const named = [byType, bySubscription].filter((tier) => tier !== undefined);
  if (named.length === 0) return 'unknown';
  return named.every((tier) => tier === named[0]) ? named[0] : 'unknown';
}
