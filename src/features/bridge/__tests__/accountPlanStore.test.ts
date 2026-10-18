import { describe, expect, it } from 'vitest';

import {
  EMPTY_ACCOUNT_PLANS,
  MAX_STORED_ACCOUNTS,
  currentAccountPlan,
  readAccountPlanStore,
  recordAccountPlans,
  switchAccount,
} from '../accountPlanStore';

const PRO = { planType: 'pro', planDisplayName: 'Pro' };
const TEAM = { planType: 'team', structure: 'workspace' };

describe('the account plan store', () => {
  it('keeps each account apart and reports the one the pages use', () => {
    let store = recordAccountPlans(
      EMPTY_ACCOUNT_PLANS,
      { aaaaaaaa: PRO, bbbbbbbb: TEAM },
      'aaaaaaaa',
      10,
    );
    expect(currentAccountPlan(store)).toEqual({ ...PRO, observedAt: 10 });

    store = switchAccount(store, 'bbbbbbbb');
    expect(currentAccountPlan(store)).toEqual({ ...TEAM, observedAt: 10 });

    // A later page of the first account updates only its own entry.
    store = recordAccountPlans(store, { aaaaaaaa: { planType: 'plus' } }, 'aaaaaaaa', 20);
    expect(store.accounts.bbbbbbbb).toEqual({ ...TEAM, observedAt: 10 });
    expect(currentAccountPlan(store)).toEqual({ planType: 'plus', observedAt: 20 });
  });

  it('names no plan when several accounts are known and none was named', () => {
    const store = recordAccountPlans(
      EMPTY_ACCOUNT_PLANS,
      { aaaaaaaa: PRO, bbbbbbbb: TEAM },
      null,
      10,
    );
    expect(currentAccountPlan(store)).toBeNull();
    expect(
      currentAccountPlan(recordAccountPlans(EMPTY_ACCOUNT_PLANS, { aaaaaaaa: PRO }, null, 1)),
    ).toEqual({ ...PRO, observedAt: 1 });
  });

  it('reads back only plan fields under hashed keys, and keeps the newest accounts', () => {
    const accounts: Record<string, unknown> = {};
    for (let i = 0; i < MAX_STORED_ACCOUNTS + 4; i += 1) {
      accounts[i.toString(16).padStart(8, '0')] = { planType: 'free', observedAt: i + 1 };
    }
    accounts['acct-real-id'] = PRO;
    accounts['ffffffff'] = { ...PRO, email: 'jesse@example.com', observedAt: 999 };
    const store = readAccountPlanStore({ version: 1, accounts, current: 'ffffffff' });

    expect(Object.keys(store.accounts)).toHaveLength(MAX_STORED_ACCOUNTS);
    expect(store.accounts['acct-real-id']).toBeUndefined();
    expect(store.accounts.ffffffff).toEqual({ ...PRO, observedAt: 999 });
    expect(store.current).toBe('ffffffff');
    expect(readAccountPlanStore('nonsense')).toEqual(EMPTY_ACCOUNT_PLANS);
  });
});
