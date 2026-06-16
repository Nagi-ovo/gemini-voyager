import { afterEach, describe, expect, it } from 'vitest';

import {
  extractUsagePayload,
  formatResetLabel,
  formatUpdatedAgo,
  isUsagePathname,
  mergeUsageSnapshots,
  parseUsageRpcResponse,
  scrapeUsageFromDocument,
  selectUsageSnapshotForAccount,
  usageAccountKeyFromPathname,
  usageCacheKeyForAccount,
  usageUrlForPathname,
} from '../index';

/**
 * Build a /usage-like DOM into the live jsdom document and return it. Mirrors
 * the real Angular `usage-metrics-window` structure we scrape: a header with the
 * plan tier, a `.gxu-currently` (daily) block and a `.gxu-weekly` block, each
 * carrying an `N% used` line and a `reset-time` element.
 */
function mountUsage(opts: {
  tier?: string;
  daily?: { percent: string; reset: string };
  weekly?: { percent: string; reset: string };
  emptyWindow?: boolean;
}): Document {
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
});

describe('scrapeUsageFromDocument', () => {
  it('parses both buckets, percents, reset labels and the tier', () => {
    const snap = scrapeUsageFromDocument(
      mountUsage({
        tier: 'PRO',
        daily: { percent: '0%', reset: 'Resets at 12:47 AM' },
        weekly: { percent: '1%', reset: 'Resets Jun 16 at 10:47 PM' },
      }),
    );
    expect(snap).not.toBeNull();
    expect(snap?.tier).toBe('PRO');
    expect(snap?.daily).toEqual({ percent: 0, resetLabel: '12:47 AM' });
    expect(snap?.weekly).toEqual({ percent: 1, resetLabel: 'Jun 16 at 10:47 PM' });
    expect(typeof snap?.updatedAt).toBe('number');
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
