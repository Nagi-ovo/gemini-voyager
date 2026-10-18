/**
 * The ring's denominator: the weekly Pro allowance, from the best source there is.
 *
 * 1. The limit ChatGPT itself named in `conversation/init` (only once Pro is used up).
 * 2. The user's own "weekly Pro allowance" setting (0 = automatic).
 * 3. A default for the plan the page's `accounts/check` named, read through the
 *    bridge protocol's `accountTier` (one mapping of ChatGPT's plan strings).
 * 4. Nothing: the ring draws no share and the card names only the count.
 */
import { type AccountTier, accountTier } from '@/features/bridge/protocol';

import type { ProUsagePlan } from './usageStore';

/**
 * Pro Lite ($100) and Pro ($200) weekly GPT-6 Pro messages. OpenAI's plan page
 * no longer lists numbers; these come from subscriber e-mails and press
 * coverage (October 2026): Pro gets 200 until 2026-10-30 00:00 local time and
 * 100 from then on, Pro Lite 50. Pro Max and unknown plans have no default.
 */
const PRO_LITE_WEEKLY = 50;
const PRO_WEEKLY_BEFORE_CUT = 200;
const PRO_WEEKLY_AFTER_CUT = 100;
const PRO_CUT_LOCAL = { year: 2026, monthIndex: 9, day: 30 } as const;

export type AllowanceSource = 'chatgpt' | 'setting' | 'plan';

export interface Allowance {
  readonly limit: number;
  readonly source: AllowanceSource;
}

export function tierOfPlan(plan: ProUsagePlan | null): AccountTier {
  return plan ? accountTier(plan) : 'unknown';
}

/** The plan's default weekly allowance at `now`, or null when there is none. */
export function tierDefaultLimit(tier: AccountTier, now: number): number | null {
  if (tier === 'pro-lite') return PRO_LITE_WEEKLY;
  if (tier === 'pro') {
    const cut = new Date(PRO_CUT_LOCAL.year, PRO_CUT_LOCAL.monthIndex, PRO_CUT_LOCAL.day).getTime();
    return now < cut ? PRO_WEEKLY_BEFORE_CUT : PRO_WEEKLY_AFTER_CUT;
  }
  return null;
}

export function resolveAllowance(input: {
  readonly chatgptLimit: number | null;
  /** The setting; null when it is left on automatic. */
  readonly manualLimit: number | null;
  readonly tier: AccountTier;
  readonly now: number;
}): Allowance | null {
  if (input.chatgptLimit !== null) return { limit: input.chatgptLimit, source: 'chatgpt' };
  if (input.manualLimit !== null) return { limit: input.manualLimit, source: 'setting' };
  const planLimit = tierDefaultLimit(input.tier, input.now);
  return planLimit === null ? null : { limit: planLimit, source: 'plan' };
}

/** Product names, shown as ChatGPT shows them. */
export const TIER_NAMES: Readonly<Record<Exclude<AccountTier, 'unknown'>, string>> = {
  'pro-lite': 'Pro Lite',
  pro: 'Pro',
  'pro-max': 'Pro Max',
};
