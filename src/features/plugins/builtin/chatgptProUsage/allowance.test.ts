import { describe, expect, it } from 'vitest';

import { resolveAllowance, tierOfPlan } from './allowance';

const BEFORE_CUT = new Date(2026, 9, 29, 23, 59).getTime();
const AFTER_CUT = new Date(2026, 9, 30, 0, 0).getTime();

describe('resolveAllowance', () => {
  it('takes the limit ChatGPT named over the setting and the plan', () => {
    expect(
      resolveAllowance({ chatgptLimit: 15, manualLimit: 30, tier: 'pro', now: BEFORE_CUT }),
    ).toEqual({ limit: 15, source: 'chatgpt' });
  });

  it('takes the setting over the plan default', () => {
    expect(
      resolveAllowance({ chatgptLimit: null, manualLimit: 30, tier: 'pro', now: BEFORE_CUT }),
    ).toEqual({ limit: 30, source: 'setting' });
  });

  it('defaults Pro Lite to 50 and Pro to 200, then 100 from 30 October 2026 local time', () => {
    const auto = (tier: 'pro-lite' | 'pro', now: number) =>
      resolveAllowance({ chatgptLimit: null, manualLimit: null, tier, now })?.limit;
    expect(auto('pro-lite', BEFORE_CUT)).toBe(50);
    expect(auto('pro', BEFORE_CUT)).toBe(200);
    expect(auto('pro', AFTER_CUT)).toBe(100);
  });

  it('has no allowance for Pro Max or an unknown plan', () => {
    for (const tier of ['pro-max', 'unknown'] as const) {
      expect(
        resolveAllowance({ chatgptLimit: null, manualLimit: null, tier, now: BEFORE_CUT }),
      ).toBeNull();
    }
  });
});

describe('tierOfPlan', () => {
  it('reads the tier from the two plan strings, never from a display name', () => {
    const plan = (planType: string | null, subscriptionPlan: string | null) =>
      tierOfPlan({ planType, subscriptionPlan, observedAt: 1 });
    expect(plan('prolite', 'chatgptprolite')).toBe('pro-lite');
    expect(plan('pro', 'chatgptpro')).toBe('pro');
    expect(plan('promax', null)).toBe('pro-max');
    expect(plan('plus', null)).toBe('unknown');
    expect(tierOfPlan(null)).toBe('unknown');
  });
});
