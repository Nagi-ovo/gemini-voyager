import { afterEach, describe, expect, it } from 'vitest';

import {
  extractUsagePayload,
  formatResetCountdown,
  formatResetLabel,
  formatUpdatedAgo,
  getUsagePillMode,
  hydrateUsageResetEpochs,
  isUsagePathname,
  mergeAutomaticUsageSnapshots,
  mergeUsageSnapshots,
  parseResetEpoch,
  parseUsageRpcResponse,
  scrapeUsageFromDocument,
  selectUsageSnapshotForAccount,
  usageAccountKeyFromPathname,
  usageCacheKeyForAccount,
  usageUrlForPathname,
} from '../index';

describe('getUsagePillMode', () => {
  it('shows an actionable empty pill before the first usage snapshot arrives', () => {
    expect(getUsagePillMode(true, 'gemini.google.com', null)).toBe('empty');
  });

  it('shows metrics once either usage bucket is available', () => {
    expect(
      getUsagePillMode(true, 'gemini.google.com', {
        accountKey: 'default',
        daily: { percent: 0, resetLabel: '9:47 PM' },
        weekly: null,
        updatedAt: Date.now(),
      }),
    ).toBe('ready');
  });

  it('stays hidden when disabled or outside Gemini', () => {
    expect(getUsagePillMode(false, 'gemini.google.com', null)).toBe('hidden');
    expect(getUsagePillMode(true, 'example.com', null)).toBe('hidden');
  });
});

/**
 * Build a /usage-like DOM into the live jsdom document and return it. Mirrors
 * the real Angular `usage-metrics-window` structure we scrape: a header with the
 * plan tier, a `.gxu-currently` (daily) block and a `.gxu-weekly` block, each
 * carrying an `N% used` line and a `reset-time` element.
 */
function mountUsage(opts: {
  lang?: string;
  tier?: string;
  daily?: { percent: string; reset: string };
  weekly?: { percent: string; reset: string };
  emptyWindow?: boolean;
}): Document {
  document.documentElement.lang = opts.lang ?? 'en';
  if (opts.emptyWindow) {
    document.body.innerHTML = `<usage-metrics-window></usage-metrics-window>`;
    return document;
  }
  const block = (cls: string, label: string, m?: { percent: string; reset: string }) =>
    m
      ? `<div class="${cls}">
           <div class="gxu-item-header"><p>${label}</p></div>
           <p class="gds-emphasized-body-l">${m.percent} used</p>
           <p class="reset-time-luminous">${m.reset}</p>
         </div>`
      : '';
  document.body.innerHTML = `
    <usage-metrics-window>
      <div class="usage-metrics-container">
        <div class="usage-metrics-header">
          <div class="header-title"><h2>Usage limits</h2></div>
          ${opts.tier ? `<span class="plan-badge">${opts.tier}</span>` : ''}
        </div>
        <div class="gxu-items-container">
          ${block('gxu-currently', 'Current usage', opts.daily)}
          ${block('gxu-weekly', 'Weekly limit', opts.weekly)}
        </div>
      </div>
    </usage-metrics-window>`;
  return document;
}

afterEach(() => {
  document.body.innerHTML = '';
  document.documentElement.lang = 'en';
});

describe('scrapeUsageFromDocument', () => {
  it('parses both buckets, percents, reset labels and the tier', () => {
    const now = new Date(2026, 6, 18, 1, 26).getTime();
    const snap = scrapeUsageFromDocument(
      mountUsage({
        tier: 'PRO',
        daily: { percent: '0%', reset: 'Resets at 12:47 AM' },
        weekly: { percent: '1%', reset: 'Resets Jun 16 at 10:47 PM' },
      }),
      now,
    );
    expect(snap).not.toBeNull();
    expect(snap?.tier).toBe('PRO');
    expect(snap?.daily).toEqual({
      percent: 0,
      resetLabel: '12:47 AM',
      resetEpoch: Math.floor(new Date(2026, 6, 19, 0, 47).getTime() / 1000),
    });
    expect(snap?.weekly).toEqual({
      percent: 1,
      resetLabel: 'Jun 16 at 10:47 PM',
      resetEpoch: Math.floor(new Date(2026, 5, 16, 22, 47).getTime() / 1000),
    });
    expect(snap?.updatedAt).toBe(now);
  });

  it('parses fractional percentages and clamps to 0-100', () => {
    const snap = scrapeUsageFromDocument(
      mountUsage({ daily: { percent: '12.5%', reset: 'Resets at 1:00 AM' } }),
    );
    expect(snap?.daily?.percent).toBe(12.5);
  });

  it('returns null when the usage component is absent', () => {
    document.body.innerHTML = `<div>some other page</div>`;
    expect(scrapeUsageFromDocument(document)).toBeNull();
  });

  it('returns null when the component is present but no bucket parses (transient render)', () => {
    expect(scrapeUsageFromDocument(mountUsage({ emptyWindow: true }))).toBeNull();
  });

  it('keeps a bucket that parses even if the other is missing', () => {
    const snap = scrapeUsageFromDocument(
      mountUsage({ weekly: { percent: '5%', reset: 'Resets Jun 16' } }),
    );
    expect(snap?.daily).toBeNull();
    expect(snap?.weekly).toEqual({ percent: 5, resetLabel: 'Jun 16' });
  });

  it('falls back to the raw reset text for non-English UI labels', () => {
    const snap = scrapeUsageFromDocument(
      mountUsage({ daily: { percent: '3%', reset: '重置时间 凌晨 12:47' } }),
    );
    // No English "Resets" prefix to strip — show it as-is.
    expect(snap?.daily?.resetLabel).toBe('重置时间 凌晨 12:47');
  });
});

describe('parseResetEpoch', () => {
  const now = new Date(2026, 6, 18, 1, 26).getTime();

  it.each([
    ['Resets at 2:47 AM', 'en', new Date(2026, 6, 18, 2, 47)],
    ['重設時間：上午2:47', 'zh-TW', new Date(2026, 6, 18, 2, 47)],
    ['重置时间：02:47', 'zh-CN', new Date(2026, 6, 18, 2, 47)],
    ['將於上午9:12重設', 'zh-TW', new Date(2026, 6, 18, 9, 12)],
  ])('parses a localized time-only label: %s', (label, locale, expected) => {
    expect(parseResetEpoch(label, now, locale)).toBe(Math.floor(expected.getTime() / 1000));
  });

  it.each([
    ['Resets Jul 21 at 10:47 PM', 'en', new Date(2026, 6, 21, 22, 47)],
    ['重設時間：7月21日 下午10:47', 'zh-TW', new Date(2026, 6, 21, 22, 47)],
    ['重置时间：7月21日22:47', 'zh-CN', new Date(2026, 6, 21, 22, 47)],
  ])('parses a localized dated label: %s', (label, locale, expected) => {
    expect(parseResetEpoch(label, now, locale)).toBe(Math.floor(expected.getTime() / 1000));
  });

  it('rolls a time-only reset into the next day after that time has passed', () => {
    expect(parseResetEpoch('Resets at 12:47 AM', now, 'en')).toBe(
      Math.floor(new Date(2026, 6, 19, 0, 47).getTime() / 1000),
    );
  });

  it('upgrades an older label-only cache without revisiting the usage page', () => {
    const snapshot = {
      accountKey: 'default',
      daily: { percent: 0, resetLabel: '2:47 AM' },
      weekly: { percent: 1, resetLabel: 'Jul 21 at 10:47 PM' },
      updatedAt: now - 60_000,
    };

    expect(hydrateUsageResetEpochs(snapshot, now, ['zh-CN', 'en'])).toEqual({
      ...snapshot,
      daily: {
        ...snapshot.daily,
        resetEpoch: Math.floor(new Date(2026, 6, 18, 2, 47).getTime() / 1000),
      },
      weekly: {
        ...snapshot.weekly,
        resetEpoch: Math.floor(new Date(2026, 6, 21, 22, 47).getTime() / 1000),
      },
    });
  });
});

describe('isUsagePathname', () => {
  it('matches the usage route, including multi-account prefixes', () => {
    expect(isUsagePathname('/usage')).toBe(true);
    expect(isUsagePathname('/usage/')).toBe(true);
    expect(isUsagePathname('/u/0/usage')).toBe(true);
    expect(isUsagePathname('/u/12/usage/')).toBe(true);
  });

  it('does not match other routes', () => {
    expect(isUsagePathname('/app')).toBe(false);
    expect(isUsagePathname('/usages')).toBe(false);
    expect(isUsagePathname('/')).toBe(false);
  });
});

describe('usage account scoping', () => {
  it('derives the Gemini account namespace from the route', () => {
    expect(usageAccountKeyFromPathname('/app')).toBe('default');
    expect(usageAccountKeyFromPathname('/usage')).toBe('default');
    expect(usageAccountKeyFromPathname('/u/0/app')).toBe('u/0');
    expect(usageAccountKeyFromPathname('/u/12/usage')).toBe('u/12');
  });

  it('uses per-account cache keys and usage urls', () => {
    expect(usageCacheKeyForAccount('default')).toBe('gvUsageCache:default');
    expect(usageCacheKeyForAccount('u/2')).toBe('gvUsageCache:u/2');
    expect(usageUrlForPathname('/app')).toBe('https://gemini.google.com/usage');
    expect(usageUrlForPathname('/u/2/app')).toBe('https://gemini.google.com/u/2/usage');
  });

  it('loads the scoped cache before the legacy single-account cache', () => {
    const scoped = {
      accountKey: 'u/1',
      daily: { percent: 20, resetLabel: '1:00 AM' },
      weekly: null,
      updatedAt: 2,
    };
    const legacy = {
      accountKey: 'default',
      daily: { percent: 90, resetLabel: '1:00 AM' },
      weekly: null,
      updatedAt: 1,
    };

    expect(selectUsageSnapshotForAccount(scoped, legacy, 'u/1')).toBe(scoped);
    expect(selectUsageSnapshotForAccount(null, legacy, 'u/1')).toBeNull();
  });
});

describe('mergeUsageSnapshots', () => {
  it('keeps the higher value when an older same-window snapshot tries to lower usage', () => {
    const current = {
      accountKey: 'u/0',
      daily: { percent: 42, resetLabel: '12:47 AM', resetEpoch: 1781135233 },
      weekly: { percent: 11, resetLabel: 'Jun 16', resetEpoch: 1781646433 },
      tier: 'PRO',
      updatedAt: 1000,
    };
    const staleLower = {
      accountKey: 'u/0',
      daily: { percent: 3, resetLabel: '12:47 AM', resetEpoch: 1781135233 },
      weekly: { percent: 5, resetLabel: 'Jun 16', resetEpoch: 1781646433 },
      tier: 'PRO',
      updatedAt: 2000,
    };

    expect(mergeUsageSnapshots(current, staleLower)).toEqual(current);
  });

  it('allows usage to drop after the reset window changes', () => {
    const current = {
      accountKey: 'u/0',
      daily: { percent: 95, resetLabel: '12:47 AM', resetEpoch: 1781135233 },
      weekly: { percent: 40, resetLabel: 'Jun 16', resetEpoch: 1781646433 },
      tier: 'PRO',
      updatedAt: 1000,
    };
    const afterReset = {
      accountKey: 'u/0',
      daily: { percent: 0, resetLabel: '1:47 AM', resetEpoch: 1781138833 },
      weekly: { percent: 41, resetLabel: 'Jun 16', resetEpoch: 1781646433 },
      tier: 'PRO',
      updatedAt: 2000,
    };

    expect(
      mergeUsageSnapshots(current, afterReset, { now: current.daily.resetEpoch * 1000 + 1 }),
    ).toEqual(afterReset);
  });

  it('blocks a large automatic drop before the previous reset boundary has passed', () => {
    const current = {
      accountKey: 'u/0',
      daily: { percent: 76, resetLabel: '12:47 AM', resetEpoch: 1781135233 },
      weekly: { percent: 40, resetLabel: 'Jun 16', resetEpoch: 1781646433 },
      tier: 'PRO',
      updatedAt: 1000,
    };
    const suspiciousLower = {
      accountKey: 'u/0',
      daily: { percent: 10, resetLabel: '1:47 AM', resetEpoch: 1781138833 },
      weekly: { percent: 10, resetLabel: 'Jun 17', resetEpoch: 1781732833 },
      tier: 'PRO',
      updatedAt: 2000,
    };

    const merged = mergeUsageSnapshots(current, suspiciousLower, {
      now: current.daily.resetEpoch * 1000 - 10 * 60_000,
    });

    expect(merged.daily).toEqual(current.daily);
    expect(merged.weekly).toEqual(current.weekly);
    expect(merged.updatedAt).toBe(current.updatedAt);
  });

  it('allows a manual refresh to accept a large drop immediately', () => {
    const current = {
      accountKey: 'u/0',
      daily: { percent: 76, resetLabel: '12:47 AM', resetEpoch: 1781135233 },
      weekly: { percent: 40, resetLabel: 'Jun 16', resetEpoch: 1781646433 },
      tier: 'PRO',
      updatedAt: 1000,
    };
    const manualLower = {
      accountKey: 'u/0',
      daily: { percent: 10, resetLabel: '1:47 AM', resetEpoch: 1781138833 },
      weekly: { percent: 10, resetLabel: 'Jun 17', resetEpoch: 1781732833 },
      tier: 'PRO',
      updatedAt: 2000,
    };

    expect(mergeUsageSnapshots(current, manualLower, { allowRegression: true })).toEqual(
      manualLower,
    );
  });

  it('does not merge snapshots from another Gemini account namespace', () => {
    const current = {
      accountKey: 'u/0',
      daily: { percent: 42, resetLabel: '12:47 AM', resetEpoch: 1781135233 },
      weekly: { percent: 11, resetLabel: 'Jun 16', resetEpoch: 1781646433 },
      tier: 'PRO',
      updatedAt: 1000,
    };
    const otherAccount = {
      accountKey: 'u/1',
      daily: { percent: 2, resetLabel: '12:47 AM', resetEpoch: 1781135233 },
      weekly: { percent: 1, resetLabel: 'Jun 16', resetEpoch: 1781646433 },
      tier: 'FREE',
      updatedAt: 2000,
    };

    expect(mergeUsageSnapshots(current, otherAccount)).toEqual(otherAccount);
  });

  it('rejects a replay response that started before the current snapshot', () => {
    const current = {
      accountKey: 'u/0',
      daily: { percent: 7, resetLabel: '3:41 PM', resetEpoch: 1784302860 },
      weekly: { percent: 9, resetLabel: 'Jul 21', resetEpoch: 1784652060 },
      sourceStartedAt: 3000,
      updatedAt: 3100,
    };
    const lateOlderResponse = {
      accountKey: 'u/0',
      daily: { percent: 1, resetLabel: '3:41 PM', resetEpoch: 1784302860 },
      weekly: { percent: 9, resetLabel: 'Jul 21', resetEpoch: 1784652060 },
      sourceStartedAt: 2000,
      updatedAt: 3200,
    };

    expect(mergeUsageSnapshots(current, lateOlderResponse)).toBe(current);
  });

  it('preserves future RPC reset epochs when a later DOM snapshot has no epochs', () => {
    const current = {
      accountKey: 'u/0',
      daily: { percent: 0, resetLabel: '02:47', resetEpoch: 1784302860 },
      weekly: { percent: 1, resetLabel: '7月21日 22:47', resetEpoch: 1784652060 },
      sourceStartedAt: 1000,
      updatedAt: 1100,
    };
    const domSnapshot = {
      accountKey: 'u/0',
      daily: { percent: 0, resetLabel: '2:47 AM' },
      weekly: { percent: 1, resetLabel: 'Jul 21 at 10:47 PM' },
      sourceStartedAt: 2000,
      updatedAt: 2100,
    };

    expect(
      mergeUsageSnapshots(current, domSnapshot, { now: (current.daily.resetEpoch - 60) * 1000 }),
    ).toEqual({
      ...domSnapshot,
      daily: { ...domSnapshot.daily, resetEpoch: current.daily.resetEpoch },
      weekly: { ...domSnapshot.weekly, resetEpoch: current.weekly.resetEpoch },
    });
  });

  it('does not preserve an expired RPC reset epoch in a later DOM snapshot', () => {
    const resetEpoch = 1784302860;
    const current = {
      accountKey: 'u/0',
      daily: { percent: 0, resetLabel: '02:47', resetEpoch },
      weekly: null,
      sourceStartedAt: 1000,
      updatedAt: 1100,
    };
    const domSnapshot = {
      accountKey: 'u/0',
      daily: { percent: 0, resetLabel: '3:47 AM' },
      weekly: null,
      sourceStartedAt: 2000,
      updatedAt: 2100,
    };

    expect(mergeUsageSnapshots(current, domSnapshot, { now: (resetEpoch + 1) * 1000 })).toEqual(
      domSnapshot,
    );
  });
});

describe('mergeAutomaticUsageSnapshots', () => {
  const current = {
    accountKey: 'default',
    daily: { percent: 7, resetLabel: '3:41 PM', resetEpoch: 1784302860 },
    weekly: { percent: 9, resetLabel: 'Jul 21 at 4:41 PM', resetEpoch: 1784652060 },
    tier: 'PRO',
    sourceStartedAt: 1000,
    updatedAt: 1100,
  };

  const lower = (sourceStartedAt: number) => ({
    accountKey: 'default',
    daily: { percent: 1, resetLabel: '3:41 PM', resetEpoch: 1784302860 },
    weekly: { percent: 9, resetLabel: 'Jul 21 at 4:41 PM', resetEpoch: 1784652060 },
    tier: 'PRO',
    sourceStartedAt,
    updatedAt: sourceStartedAt + 100,
  });

  it('accepts the #820 7% -> 1% entitlement reset after a second fresh confirmation', () => {
    const first = mergeAutomaticUsageSnapshots(current, null, lower(2000));

    expect(first.snapshot.daily?.percent).toBe(7);
    expect(first.snapshot.weekly?.percent).toBe(9);
    expect(first.candidate?.daily?.percent).toBe(1);
    expect(first.needsConfirmation).toBe(true);

    const confirmed = mergeAutomaticUsageSnapshots(first.snapshot, first.candidate, lower(3000));

    expect(confirmed.snapshot.daily?.percent).toBe(1);
    expect(confirmed.snapshot.weekly?.percent).toBe(9);
    expect(confirmed.snapshot.regressionVerified).toBe(true);
    expect(confirmed.candidate).toBeNull();
    expect(confirmed.needsConfirmation).toBe(false);
  });

  it('also confirms a lower RPC value when the cached DOM metric has no reset epoch', () => {
    const domCurrent = {
      ...current,
      daily: { percent: 7, resetLabel: '3:41 PM' },
    };
    const first = mergeAutomaticUsageSnapshots(domCurrent, null, lower(2000));
    const confirmed = mergeAutomaticUsageSnapshots(first.snapshot, first.candidate, lower(3000));

    expect(first.snapshot.daily?.percent).toBe(7);
    expect(first.needsConfirmation).toBe(true);
    expect(confirmed.snapshot.daily?.percent).toBe(1);
    expect(confirmed.snapshot.regressionVerified).toBe(true);
  });

  it('does not confirm when the second response returns to the current value', () => {
    const first = mergeAutomaticUsageSnapshots(current, null, lower(2000));
    const recovered = mergeAutomaticUsageSnapshots(first.snapshot, first.candidate, {
      ...current,
      sourceStartedAt: 3000,
      updatedAt: 3100,
    });

    expect(recovered.snapshot.daily?.percent).toBe(7);
    expect(recovered.snapshot.regressionVerified).not.toBe(true);
    expect(recovered.candidate).toBeNull();
    expect(recovered.needsConfirmation).toBe(false);
  });

  it('lets other tabs accept a confirmed lower snapshot', () => {
    const first = mergeAutomaticUsageSnapshots(current, null, lower(2000));
    const confirmed = mergeAutomaticUsageSnapshots(first.snapshot, first.candidate, lower(3000));
    const mergedInOtherTab = mergeUsageSnapshots(current, confirmed.snapshot, {
      allowRegression: confirmed.snapshot.regressionVerified === true,
    });

    expect(mergedInOtherTab.daily?.percent).toBe(1);
    expect(mergedInOtherTab.sourceStartedAt).toBe(3000);
  });
});

// Verbatim batchexecute response captured from a real /usage cold load
// (rpcid jSf9Qc, args []). weekly = 0.57% (resets Jun 16), daily = 0% (resets sooner).
const REAL_USAGE_RESPONSE = `)]}'

198
[["wrb.fr","jSf9Qc","[2,[[48106,0.00572625,2,[[1781646433,197701000]]],[2400,0,1,[[1781135233,197509000]]]],false]",null,null,null,"generic"],["di",199],["af.httprm",199,"7026120334830552683",47]]
25
[["e",4,null,null,234]]
`;

describe('parseUsageRpcResponse (real captured response)', () => {
  it('extracts daily/weekly metrics and the rpcid', () => {
    const parsed = parseUsageRpcResponse(REAL_USAGE_RESPONSE);
    expect(parsed).not.toBeNull();
    expect(parsed?.rpcid).toBe('jSf9Qc');
    // daily resets sooner, weekly later (Jun 16)
    expect(parsed?.daily).toEqual({ percent: 0, resetEpoch: 1781135233 });
    expect(parsed?.weekly).toEqual({ percent: 1, resetEpoch: 1781646433 });
  });

  it('rounds the fraction to a percent like the Gemini UI does', () => {
    // 0.00572625 -> 0.57% -> "1% used" in the DOM
    expect(parseUsageRpcResponse(REAL_USAGE_RESPONSE)?.weekly?.percent).toBe(1);
  });

  it('returns null for non-usage batchexecute payloads', () => {
    const conversations = `)]}'\n\n42\n[["wrb.fr","MaZiqc","[null,[[\\"c_abc\\",\\"Title\\"]]]",null,null,null,"generic"]]\n`;
    expect(parseUsageRpcResponse(conversations)).toBeNull();
  });

  it('returns null for garbage input', () => {
    expect(parseUsageRpcResponse('not a batchexecute response')).toBeNull();
    expect(parseUsageRpcResponse('')).toBeNull();
  });
});

describe('extractUsagePayload', () => {
  it('parses the [flag, [metric, metric], bool] shape', () => {
    const payload = [
      2,
      [
        [48106, 0.5, 2, [[1781646433, 0]]],
        [2400, 0.25, 1, [[1781135233, 0]]],
      ],
      false,
    ];
    const r = extractUsagePayload(payload);
    expect(r?.daily).toEqual({ percent: 25, resetEpoch: 1781135233 });
    expect(r?.weekly).toEqual({ percent: 50, resetEpoch: 1781646433 });
  });

  it('uses the period enum when weekly resets before the 5h window', () => {
    const payload = [
      2,
      [
        [48106, 0.5, 2, [[1781135233, 0]]],
        [2400, 0.25, 1, [[1781149633, 0]]],
      ],
      false,
    ];

    const r = extractUsagePayload(payload);

    expect(r?.daily).toEqual({ percent: 25, resetEpoch: 1781149633 });
    expect(r?.weekly).toEqual({ percent: 50, resetEpoch: 1781135233 });
  });

  it('does not guess bucket labels from reset order when the period enum is unknown', () => {
    const payload = [
      2,
      [
        [48106, 0.5, 20, [[1781135233, 0]]],
        [2400, 0.25, 10, [[1781149633, 0]]],
      ],
      false,
    ];

    expect(extractUsagePayload(payload)).toBeNull();
  });

  it('rejects shapes without valid metric tuples', () => {
    expect(extractUsagePayload([1, 2, 3])).toBeNull();
    expect(extractUsagePayload('nope')).toBeNull();
    expect(extractUsagePayload([2, [[1, 2]], false])).toBeNull();
  });
});

describe('formatResetLabel', () => {
  it('shows a time-only label when the reset is later today', () => {
    const now = new Date('2026-06-11T08:00:00').getTime();
    const reset = Math.floor(new Date('2026-06-11T23:47:00').getTime() / 1000);
    const label = formatResetLabel(reset, now);
    expect(label).toMatch(/\d{1,2}:\d{2}/);
  });

  it('includes the date when the reset is on another day', () => {
    const now = new Date('2026-06-11T08:00:00').getTime();
    const reset = Math.floor(new Date('2026-06-16T22:47:00').getTime() / 1000);
    const label = formatResetLabel(reset, now);
    // en locale renders a month abbreviation; just assert it's richer than time-only.
    expect(label.length).toBeGreaterThan(5);
  });
});

describe('formatUpdatedAgo', () => {
  const base = 1_000_000_000_000;
  it('shows "just updated" under a minute', () => {
    expect(formatUpdatedAgo(base, base + 30_000)).toBe('Just updated');
  });
  it('shows minutes, hours and days', () => {
    expect(formatUpdatedAgo(base, base + 5 * 60_000)).toBe('Updated 5m ago');
    expect(formatUpdatedAgo(base, base + 2 * 3_600_000)).toBe('Updated 2h ago');
    expect(formatUpdatedAgo(base, base + 3 * 86_400_000)).toBe('Updated 3d ago');
  });
  it('never goes negative for a future timestamp', () => {
    expect(formatUpdatedAgo(base + 10_000, base)).toBe('Just updated');
  });
});

describe('formatResetCountdown', () => {
  const now = new Date('2026-06-18T10:00:00Z').getTime();

  it('formats reset time as a compact duration', () => {
    expect(formatResetCountdown(Math.floor((now + 4 * 3_600_000) / 1000), now)).toBe('4h');
    expect(formatResetCountdown(Math.floor((now + (4 * 60 + 37) * 60_000) / 1000), now)).toBe(
      '4h37m',
    );
    expect(formatResetCountdown(Math.floor((now + (5 * 24 + 10) * 3_600_000) / 1000), now)).toBe(
      '5d10h',
    );
  });

  it('hides missing or expired reset times', () => {
    expect(formatResetCountdown(undefined, now)).toBe('');
    expect(formatResetCountdown(Math.floor((now - 1_000) / 1000), now)).toBe('');
    expect(formatResetCountdown(Math.floor((now + 30 * 60_000) / 1000), now)).toBe('30m');
  });
});
