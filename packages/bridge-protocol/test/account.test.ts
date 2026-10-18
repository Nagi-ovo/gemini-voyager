import { describe, expect, it } from 'vitest';

import { accountTier, readAccountPlan, validateMessage } from '../src';

const POLL = {
  capabilities: { ops: [] },
  inflight: [],
  policy: { revision: 1, state: 'allowed' },
};

const PLAN = {
  planType: 'pro',
  planDisplayName: 'Pro',
  subscriptionPlan: 'chatgptpro',
  structure: 'personal',
  workspaceType: null,
  hasActiveSubscription: true,
  billingPeriod: 'monthly',
  renewsAt: '2026-11-09T10:00:00Z',
  expiresAt: '2026-11-09T10:00:00Z',
  cancelsAt: null,
  scheduledPlanChange: null,
  observedAt: 1_792_000_000_000,
};

describe('the account plan on a poll', () => {
  it('carries the plan fields as ChatGPT named them', () => {
    const checked = validateMessage('pollRequest', { ...POLL, account: PLAN });
    expect(checked.ok && checked.value.account).toEqual(PLAN);
  });

  it('drops anything but the plan fields, such as an e-mail, a token or an id', () => {
    const checked = validateMessage('pollRequest', {
      ...POLL,
      account: { ...PLAN, email: 'jesse@example.com', accessToken: 'eyJ…', accountId: 'acc-1' },
    });
    expect(checked.ok && checked.value.account).toEqual(PLAN);
  });

  it('never fails the poll over an odd plan, and keeps the fields that are fine', () => {
    const checked = validateMessage('pollRequest', {
      ...POLL,
      account: { planType: 'pro', billingPeriod: 12, renewsAt: 'x'.repeat(500), observedAt: -1 },
    });
    expect(checked.ok).toBe(true);
    expect(checked.ok && checked.value.account).toEqual({ planType: 'pro' });
    expect(validateMessage('pollRequest', { ...POLL, account: 'pro' }).ok).toBe(true);
  });

  it('reads a plan with no usable field as none', () => {
    expect(readAccountPlan({ observedAt: 5, email: 'a@b.c' })).toBeNull();
    expect(readAccountPlan(null)).toBeNull();
  });
});

describe('the Pro tier', () => {
  it('tells Pro Lite from Pro by plan type and subscription, not by the shared display name', () => {
    expect(
      accountTier({
        planType: 'prolite',
        subscriptionPlan: 'chatgptprolite',
        planDisplayName: 'Pro',
      }),
    ).toBe('pro-lite');
    expect(
      accountTier({ planType: 'pro', subscriptionPlan: 'chatgptpro', planDisplayName: 'Pro' }),
    ).toBe('pro');
    expect(accountTier({ subscriptionPlan: 'chatgptprolite' })).toBe('pro-lite');
  });

  it('names Pro Max by its plan type, whatever unknown subscription string comes with it', () => {
    expect(accountTier({ planType: 'promax', subscriptionPlan: 'chatgptpromax' })).toBe('pro-max');
    expect(accountTier({ planType: 'promax', subscriptionPlan: 'chatgptpro' })).toBe('unknown');
  });

  it('says unknown for any other value, a disagreement, or a display name alone', () => {
    expect(accountTier({ planType: 'plus', subscriptionPlan: 'chatgptplus' })).toBe('unknown');
    expect(accountTier({ planType: 'pro', subscriptionPlan: 'chatgptpromax' })).toBe('unknown');
    expect(accountTier({ planType: 'prolite', subscriptionPlan: 'chatgptpro' })).toBe('unknown');
    expect(accountTier({ planDisplayName: 'Pro' })).toBe('unknown');
    expect(accountTier(null)).toBe('unknown');
  });
});
