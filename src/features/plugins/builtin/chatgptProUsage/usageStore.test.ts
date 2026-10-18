import { describe, expect, it } from 'vitest';

import {
  EMPTY_BUCKET,
  EMPTY_PRO_USAGE,
  type ProUsageBucket,
  type ProUsageStore,
  UNKNOWN_ACCOUNT,
  applyProQuota,
  bucketOf,
  isProSend,
  noteAccount,
  parseInitQuota,
  readProUsageStore,
  recordProSend,
  summarizeProUsage,
} from './usageStore';

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const NOW = Date.parse('2026-10-18T12:00:00Z');
const RESET = '2026-10-21T08:00:00Z';

function bucketWith(times: readonly number[], extra: Partial<ProUsageBucket> = {}): ProUsageBucket {
  return { ...EMPTY_BUCKET, sends: times.map((at) => ({ at, key: null })), ...extra };
}

function storeWith(key: string, bucket: ProUsageBucket): ProUsageStore {
  return { version: 2, accounts: { [key]: bucket }, lastAccount: key };
}

describe('isProSend', () => {
  it('counts the measured gpt-6-pro and the ledger-known -pro-chat slug', () => {
    expect(isProSend({ model: 'gpt-6-pro', mode: null })).toBe(true);
    expect(isProSend({ model: 'gpt-6-pro-chat', mode: null })).toBe(true);
  });

  it('does not count a non-Pro model', () => {
    expect(isProSend({ model: 'gpt-6', mode: null })).toBe(false);
    expect(isProSend({ model: 'gpt-6-thinking', mode: null })).toBe(false);
    expect(isProSend({ model: 'gpt-6-promo', mode: null })).toBe(false);
  });

  it('counts a Pro send in a normal chat and in a project chat', () => {
    expect(isProSend({ model: 'gpt-6-pro', mode: 'primary_assistant' })).toBe(true);
    expect(isProSend({ model: 'gpt-6-pro', mode: 'gizmo_interaction' })).toBe(true);
  });

  it('does not count a Pro model sent in a non-chat mode', () => {
    expect(isProSend({ model: 'gpt-6-pro', mode: 'agent' })).toBe(false);
  });
});

describe('recordProSend', () => {
  it('counts one send once when the same turn is reported again within 20 seconds', () => {
    const first = recordProSend(EMPTY_PRO_USAGE, 'acct', { at: NOW, key: 'k1' }, NOW);
    expect(bucketOf(first!, 'acct').sends).toHaveLength(1);
    expect(recordProSend(first!, 'acct', { at: NOW + 19_000, key: 'k1' }, NOW + 19_000)).toBeNull();
  });

  it('counts the same key again after 20 seconds and different keys at once', () => {
    const first = recordProSend(EMPTY_PRO_USAGE, 'acct', { at: NOW, key: 'k1' }, NOW)!;
    const other = recordProSend(first, 'acct', { at: NOW + 1_000, key: 'k2' }, NOW + 1_000)!;
    const later = recordProSend(first, 'acct', { at: NOW + 21_000, key: 'k1' }, NOW + 21_000)!;
    expect(bucketOf(other, 'acct').sends).toHaveLength(2);
    expect(bucketOf(later, 'acct').sends).toHaveLength(2);
  });

  it('never merges sends that carry no key', () => {
    const first = recordProSend(EMPTY_PRO_USAGE, 'acct', { at: NOW, key: null }, NOW)!;
    expect(
      bucketOf(recordProSend(first, 'acct', { at: NOW, key: null }, NOW)!, 'acct').sends,
    ).toHaveLength(2);
  });

  it('keeps only the last 45 days of sends', () => {
    const old = storeWith('acct', bucketWith([NOW - 46 * DAY, NOW - 44 * DAY]));
    const next = recordProSend(old, 'acct', { at: NOW, key: null }, NOW)!;
    expect(bucketOf(next, 'acct').sends.map((send) => send.at)).toEqual([NOW - 44 * DAY, NOW]);
  });

  it('keeps each account in its own bucket', () => {
    const a = recordProSend(EMPTY_PRO_USAGE, 'a', { at: NOW, key: 'k' }, NOW)!;
    const both = recordProSend(a, 'b', { at: NOW, key: 'k' }, NOW)!;
    expect(bucketOf(both, 'a').sends).toHaveLength(1);
    expect(bucketOf(both, 'b').sends).toHaveLength(1);
    expect(both.lastAccount).toBe('b');
  });
});

describe('account migration', () => {
  it('reads the single-account version 1 store as the unknown account', () => {
    const store = readProUsageStore({
      version: 1,
      sends: [{ at: NOW, key: 'a' }],
      limit: 15,
      resetsAt: NOW + DAY,
    });
    expect(bucketOf(store, UNKNOWN_ACCOUNT)).toEqual({
      sends: [{ at: NOW, key: 'a' }],
      limit: 15,
      resetsAt: NOW + DAY,
      blockedUntil: null,
      plan: null,
    });
  });

  it('hands sends counted before any account was known to the first named account', () => {
    const legacy = readProUsageStore({ version: 1, sends: [{ at: NOW, key: 'a' }] });
    const adopted = noteAccount(legacy, 'acct')!;
    expect(Object.keys(adopted.accounts)).toEqual(['acct']);
    expect(bucketOf(adopted, 'acct').sends).toHaveLength(1);
    // Once a named account exists, another one starts empty.
    const second = noteAccount(adopted, 'other')!;
    expect(bucketOf(second, 'other').sends).toEqual([]);
    expect(bucketOf(second, 'acct').sends).toHaveLength(1);
  });

  it('drops malformed entries and falls back to an empty store for foreign data', () => {
    expect(readProUsageStore('nope')).toEqual(EMPTY_PRO_USAGE);
    expect(
      readProUsageStore({
        version: 2,
        accounts: { acct: { sends: [{ at: NOW, key: 'a' }, { at: 'x' }, null] } },
        lastAccount: 'acct',
      }),
    ).toEqual(storeWith('acct', { ...EMPTY_BUCKET, sends: [{ at: NOW, key: 'a' }] }));
  });
});

describe('summarizeProUsage', () => {
  it('counts a rolling seven days when no reset time is known', () => {
    const bucket = bucketWith([NOW - 8 * DAY, NOW - 6 * DAY, NOW - HOUR]);
    expect(summarizeProUsage(bucket, NOW)).toEqual({
      usedThisWeek: 2,
      limit: null,
      resetsAt: null,
      windowStart: NOW - 7 * DAY,
      blocked: false,
      remaining: null,
    });
  });

  it('starts the week seven days before a known reset', () => {
    const resetsAt = NOW + 2 * DAY;
    const bucket = bucketWith([NOW - 6 * DAY, NOW - 4 * DAY, NOW - HOUR], { limit: 15, resetsAt });
    expect(summarizeProUsage(bucket, NOW)).toMatchObject({
      usedThisWeek: 2,
      resetsAt,
      windowStart: NOW - 5 * DAY,
      remaining: 13,
    });
  });

  it('rolls a reset time that has passed forward by whole weeks', () => {
    const bucket = bucketWith([NOW - 2 * DAY, NOW - HOUR], { resetsAt: NOW - 8 * DAY });
    const summary = summarizeProUsage(bucket, NOW);
    expect(summary.resetsAt).toBe(NOW + 6 * DAY);
    expect(summary.windowStart).toBe(NOW - DAY);
    expect(summary.usedThisWeek).toBe(1);
  });

  it('reports none left while ChatGPT says Pro is used up, whatever this browser counted', () => {
    const bucket = bucketWith([NOW - HOUR], {
      limit: 15,
      resetsAt: NOW + DAY,
      blockedUntil: NOW + DAY,
    });
    expect(summarizeProUsage(bucket, NOW)).toMatchObject({ blocked: true, remaining: 0 });
    expect(summarizeProUsage(bucket, NOW + 2 * DAY)).toMatchObject({ blocked: false });
  });
});

describe('parseInitQuota', () => {
  it('reads the Pro limit and reset time from a used-up init response', () => {
    const quota = parseInitQuota(
      {
        model_limits: [{ model_slug: 'gpt-6-pro', resets_after: RESET }],
        blocked_features: [{ name: 'reason', limit: 15, resets_after: RESET }],
      },
      NOW,
    );
    expect(quota).toEqual({ limit: 15, resetsAt: Date.parse(RESET) });
  });

  it('ignores the empty lists ChatGPT sends while Pro is not used up', () => {
    expect(parseInitQuota({ model_limits: [], blocked_features: [] }, NOW)).toBeNull();
  });

  it('ignores a limit that belongs to a non-Pro model', () => {
    expect(
      parseInitQuota(
        {
          model_limits: [{ model_slug: 'gpt-6', resets_after: RESET }],
          blocked_features: [{ name: 'reason', limit: 80 }],
        },
        NOW,
      ),
    ).toBeNull();
  });

  it('keeps the reset time when the block names no usable limit', () => {
    expect(
      parseInitQuota(
        {
          model_limits: [{ model_slug: 'gpt-6-pro', resets_after: RESET }],
          blocked_features: [{ name: 'reason', limit: 'many' }],
        },
        NOW,
      ),
    ).toEqual({ limit: null, resetsAt: Date.parse(RESET) });
  });

  it('prefers the entry for the model this page sent', () => {
    const quota = parseInitQuota(
      {
        model_limits: [
          { model_slug: 'gpt-6-astra-pro', resets_after: '2026-10-25T00:00:00Z' },
          { model_slug: 'gpt-6-pro', resets_after: RESET },
        ],
        blocked_features: [],
      },
      NOW,
      'gpt-6-pro',
    );
    expect(quota?.resetsAt).toBe(Date.parse(RESET));
  });

  it('drops a reset time that has passed or lies more than 30 days out', () => {
    for (const resetsAfter of ['2026-10-17T00:00:00Z', '2027-01-01T00:00:00Z', 'soon']) {
      expect(
        parseInitQuota(
          { model_limits: [{ model_slug: 'gpt-6-pro', resets_after: resetsAfter }] },
          NOW,
        ),
      ).toEqual({ limit: null, resetsAt: null });
    }
  });
});

describe('applyProQuota', () => {
  it('keeps a known limit when a later quota only carries a reset time', () => {
    const known = applyProQuota(EMPTY_PRO_USAGE, 'acct', { limit: 15, resetsAt: NOW + DAY })!;
    const next = applyProQuota(known, 'acct', { limit: null, resetsAt: NOW + 8 * DAY })!;
    expect(bucketOf(next, 'acct')).toMatchObject({
      limit: 15,
      resetsAt: NOW + 8 * DAY,
      blockedUntil: NOW + 8 * DAY,
    });
    expect(applyProQuota(next, 'acct', { limit: 15, resetsAt: NOW + 8 * DAY })).toBeNull();
  });
});
