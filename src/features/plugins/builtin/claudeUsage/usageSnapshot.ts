export interface ClaudeUsageMetric {
  label: string;
  percent: number;
  resetLabel?: string;
  resetEpoch?: number;
}

export interface ClaudeUsageSnapshot {
  metrics: ClaudeUsageMetric[];
  plan?: string;
  lastUpdatedLabel?: string;
  updatedAt: number;
}

const MAX_METRICS = 3;
const WEEKDAYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

function pageText(doc: Document): string {
  return (doc.body as HTMLElement | null)?.innerText ?? doc.body?.textContent ?? '';
}

function compactLines(text: string): string[] {
  return text
    .split(/\n+/)
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .filter(Boolean);
}

function clampPercent(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value * 10) / 10));
}

function percentValues(text: string): number[] {
  return [...text.matchAll(/(\d+(?:\.\d+)?)\s*%\s*used/gi)]
    .map((match) => clampPercent(Number(match[1])))
    .filter((value) => Number.isFinite(value));
}

function percentAfterLabel(text: string, label: string): number | undefined {
  const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = text.match(
    new RegExp(`${escaped}[\\s\\S]{0,300}?(\\d+(?:\\.\\d+)?)\\s*%\\s*used`, 'i'),
  );
  const value = Number(match?.[1]);
  return Number.isFinite(value) ? clampPercent(value) : undefined;
}

function extractPlan(lines: string[]): string | undefined {
  const line = lines.find((entry) => /^Plan usage limits\b/i.test(entry));
  return line?.replace(/^Plan usage limits\s*/i, '').trim() || undefined;
}

function extractLastUpdated(text: string): string | undefined {
  return text.match(/Last updated:\s*([^\n]+)/i)?.[1]?.trim();
}

function extractReset(text: string, label: string): string | undefined {
  const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return text.match(new RegExp(`${escaped}\\s+Resets\\s+([^\\n%]+)`, 'i'))?.[1]?.trim();
}

function normalizeHour(hour: number, meridiem?: string): number {
  const lower = meridiem?.toLowerCase();
  if (lower === 'am') return hour === 12 ? 0 : hour;
  if (lower === 'pm') return hour === 12 ? 12 : hour + 12;
  return hour;
}

function dateWithTime(base: Date, hour: number, minute: number, meridiem?: string): Date {
  const next = new Date(base);
  next.setHours(normalizeHour(hour, meridiem), minute, 0, 0);
  return next;
}

function epochFromResetLabel(label: string | undefined, now: number): number | undefined {
  if (!label) return undefined;
  const text = label
    .replace(/\bat\b/gi, ' ')
    .replace(/,/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const time = '(\\d{1,2})(?::(\\d{2}))?\\s*(AM|PM)?';
  const relative = text.match(new RegExp(`^(Today|Tomorrow)\\s+${time}$`, 'i'));
  if (relative) {
    const base = new Date(now);
    if (/^tomorrow$/i.test(relative[1])) base.setDate(base.getDate() + 1);
    return Math.floor(
      dateWithTime(base, Number(relative[2]), Number(relative[3] ?? 0), relative[4]).getTime() /
        1000,
    );
  }

  const weekday = text.match(new RegExp(`^(${WEEKDAYS.join('|')})(?:day)?\\s+${time}$`, 'i'));
  if (weekday) {
    const base = new Date(now);
    const target = WEEKDAYS.indexOf(weekday[1].slice(0, 3).toLowerCase());
    const next = new Date(base);
    next.setDate(base.getDate() + ((target - base.getDay() + 7) % 7));
    const reset = dateWithTime(next, Number(weekday[2]), Number(weekday[3] ?? 0), weekday[4]);
    if (reset.getTime() <= now) reset.setDate(reset.getDate() + 7);
    return Math.floor(reset.getTime() / 1000);
  }

  const month = text.match(
    new RegExp(`^(${MONTHS.join('|')})[a-z]*\\s+(\\d{1,2})\\s+${time}$`, 'i'),
  );
  if (month) {
    const base = new Date(now);
    const reset = dateWithTime(
      new Date(
        base.getFullYear(),
        MONTHS.indexOf(month[1].slice(0, 3).toLowerCase()),
        Number(month[2]),
      ),
      Number(month[3]),
      Number(month[4] ?? 0),
      month[5],
    );
    if (reset.getTime() <= now) reset.setFullYear(reset.getFullYear() + 1);
    return Math.floor(reset.getTime() / 1000);
  }
  return undefined;
}

export function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

export function isUsageSnapshot(value: unknown): value is ClaudeUsageSnapshot {
  const data = asRecord(value);
  return Boolean(data && Array.isArray(data.metrics) && typeof data.updatedAt === 'number');
}

export function sameSnapshotData(a: ClaudeUsageSnapshot, b: ClaudeUsageSnapshot): boolean {
  return (
    a.plan === b.plan &&
    a.lastUpdatedLabel === b.lastUpdatedLabel &&
    a.metrics.length === b.metrics.length &&
    a.metrics.every(
      (metric, index) =>
        metric.label === b.metrics[index]?.label &&
        metric.percent === b.metrics[index]?.percent &&
        metric.resetLabel === b.metrics[index]?.resetLabel &&
        metric.resetEpoch === b.metrics[index]?.resetEpoch,
    )
  );
}

export function metricDisplayLabel(metric: ClaudeUsageMetric): string {
  return metric.label === 'All' ? 'Week' : metric.label;
}

// API and settings DOM can omit resets supplied by message_limit; keep them in the shared snapshot.
function withFallbackCountdowns(
  next: ClaudeUsageSnapshot,
  fallback: ClaudeUsageSnapshot | null,
): ClaudeUsageSnapshot {
  if (!fallback) return next;
  const previous = new Map(fallback.metrics.map((metric) => [metricDisplayLabel(metric), metric]));
  return {
    ...next,
    metrics: next.metrics.map((metric) => {
      if (typeof metric.resetEpoch === 'number') return metric;
      const match = previous.get(metricDisplayLabel(metric));
      return typeof match?.resetEpoch === 'number'
        ? {
            ...metric,
            resetEpoch: match.resetEpoch,
            resetLabel: match.resetLabel ?? metric.resetLabel,
          }
        : metric;
    }),
  };
}

function withFallbackPlan(
  next: ClaudeUsageSnapshot,
  fallback: ClaudeUsageSnapshot | null,
): ClaudeUsageSnapshot {
  return next.plan || !fallback?.plan ? next : { ...next, plan: fallback.plan };
}

function withSupplementalModelMetric(
  next: ClaudeUsageSnapshot,
  fallback: ClaudeUsageSnapshot | null,
): ClaudeUsageSnapshot {
  if (!fallback || next.metrics.length >= MAX_METRICS) return next;
  const existing = new Set(next.metrics.map((metric) => metricDisplayLabel(metric)));
  const modelMetric = fallback.metrics.find((metric) => {
    const label = metricDisplayLabel(metric);
    return label !== '5h' && label !== 'Week' && !existing.has(label);
  });
  return modelMetric
    ? { ...next, metrics: [...next.metrics, modelMetric].slice(0, MAX_METRICS) }
    : next;
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string')
    : [];
}

function formatClaudePlan(plan: string): string | undefined {
  const normalized = plan.toLowerCase();
  if (normalized.includes('max') && normalized.includes('5x')) return 'Max (5x)';
  if (normalized.includes('max') && normalized.includes('20x')) return 'Max (20x)';
  if (normalized === 'claude_max_5x') return 'Max (5x)';
  if (normalized === 'claude_max_20x') return 'Max (20x)';
  if (normalized.includes('team')) return 'Team';
  if (normalized.includes('pro')) return 'Pro';
  if (normalized.includes('free')) return 'Free';
  return undefined;
}

export function planFromClaudeBootstrap(raw: unknown, orgId: string): string | undefined {
  const data = asRecord(raw);
  const account = asRecord(data?.account);
  const memberships = Array.isArray(account?.memberships) ? account.memberships : [];
  const membership = memberships
    .map(asRecord)
    .find((entry) => asRecord(entry?.organization)?.uuid === orgId);
  const organization = asRecord(membership?.organization);
  if (!organization) return undefined;

  const rateLimitTier =
    typeof organization.rate_limit_tier === 'string' ? organization.rate_limit_tier : '';
  const direct = formatClaudePlan(rateLimitTier);
  if (direct) return direct;

  const capabilities = stringArray(organization.capabilities);
  if (organization.raven_type) return 'Team';
  if (capabilities.includes('claude_max')) {
    return rateLimitTier.includes('5x') ? 'Max (5x)' : 'Max (20x)';
  }
  if (capabilities.includes('claude_pro')) return 'Pro';
  return undefined;
}

function metricFromApi(raw: unknown, label: string, scale = 1): ClaudeUsageMetric | null {
  const item = asRecord(raw);
  if (!item) return null;
  const utilization = item?.utilization;
  if (typeof utilization !== 'number' || !Number.isFinite(utilization)) return null;
  const metric: ClaudeUsageMetric = { label, percent: clampPercent(utilization * scale) };
  const reset = item.resets_at ?? item.reset_at ?? item.resetsAt;
  const resetMs =
    typeof reset === 'string' ? Date.parse(reset) : typeof reset === 'number' ? reset * 1000 : NaN;
  if (Number.isFinite(resetMs)) {
    metric.resetEpoch = Math.floor(resetMs / 1000);
    metric.resetLabel = new Date(resetMs).toLocaleString();
  }
  return metric;
}

export function snapshotFromClaudeUsageApi(
  raw: unknown,
  now = Date.now(),
): ClaudeUsageSnapshot | null {
  const data = asRecord(raw);
  if (!data) return null;
  const metrics = [
    metricFromApi(data.five_hour, '5h'),
    metricFromApi(data.seven_day, 'Week'),
    // Claude currently reuses the former Opus-only weekly bucket for Fable.
    // Keep Sonnet as a fallback for accounts that expose that model bucket instead.
    metricFromApi(data.seven_day_opus, 'Fable') ?? metricFromApi(data.seven_day_sonnet, 'Sonnet'),
  ].filter((metric): metric is ClaudeUsageMetric => metric !== null);
  if (!metrics.length) return null;
  const rawPlan = typeof data.plan_name === 'string' ? data.plan_name : undefined;
  return {
    metrics: metrics.slice(0, MAX_METRICS),
    plan: rawPlan ? (formatClaudePlan(rawPlan) ?? rawPlan) : undefined,
    lastUpdatedLabel: 'just now',
    updatedAt: now,
  };
}

export function snapshotFromClaudeMessageLimit(
  raw: unknown,
  now = Date.now(),
): ClaudeUsageSnapshot | null {
  const data = asRecord(raw);
  const windows = asRecord(data?.windows);
  if (!windows) return null;
  const metrics = [
    metricFromApi(windows['5h'], '5h', 100),
    metricFromApi(windows['7d'], 'Week', 100),
  ].filter((metric): metric is ClaudeUsageMetric => metric !== null);
  if (!metrics.length) return null;
  return {
    metrics: metrics.slice(0, MAX_METRICS),
    lastUpdatedLabel: 'just now',
    updatedAt: now,
  };
}

export function scrapeClaudeUsageFromDocument(
  doc: Document = document,
  now = Date.now(),
): ClaudeUsageSnapshot | null {
  const text = pageText(doc);
  if (!/\bUsage\b/i.test(text) || !/%\s*used/i.test(text)) return null;

  const values = percentValues(text);
  if (!values.length) return null;

  const weeklyStart = text.search(/\bAll models\b/i);
  const weeklyTail = weeklyStart >= 0 ? text.slice(weeklyStart) : '';
  const creditsStart = weeklyTail.search(/\bUsage credits\b/i);
  const weeklyText = creditsStart >= 0 ? weeklyTail.slice(0, creditsStart) : weeklyTail;
  const modelLabel = ['Fable', 'Opus only', 'Opus', 'Sonnet only', 'Sonnet'].find((label) =>
    new RegExp(`\\b${label.replace(/\s+/g, '\\s+')}\\b`, 'i').test(weeklyText),
  );

  const candidates: Array<{
    label: string;
    percent?: number;
    resetLabel?: string;
    resetEpoch?: number;
  }> = [
    {
      label: '5h',
      percent: values[0],
      resetLabel: extractReset(text, 'Current session'),
    },
    { label: 'Week', percent: values[1], resetLabel: extractReset(text, 'All models') },
    ...(modelLabel && typeof percentAfterLabel(weeklyText, modelLabel) === 'number'
      ? [
          {
            label: /^fable$/i.test(modelLabel) ? 'Fable' : modelLabel.replace(/ only$/i, ''),
            percent: percentAfterLabel(weeklyText, modelLabel),
            resetLabel: extractReset(text, modelLabel),
          },
        ]
      : []),
  ].map((metric) => ({
    ...metric,
    resetEpoch: epochFromResetLabel(metric.resetLabel, now),
  }));
  const metrics = candidates.filter(
    (metric): metric is ClaudeUsageMetric => typeof metric.percent === 'number',
  );

  return {
    metrics: metrics.slice(0, MAX_METRICS),
    plan: extractPlan(compactLines(text)),
    lastUpdatedLabel: extractLastUpdated(text),
    updatedAt: now,
  };
}

export function hasCountdownData(data: ClaudeUsageSnapshot): boolean {
  return (
    data.metrics.length > 0 && data.metrics.every((metric) => typeof metric.resetEpoch === 'number')
  );
}

export function hasExpectedModelMetric(data: ClaudeUsageSnapshot): boolean {
  if (!/^Max\b/i.test(data.plan ?? '')) return true;
  return data.metrics.some((metric) => {
    const label = metricDisplayLabel(metric);
    return label !== '5h' && label !== 'Week';
  });
}

export function mergeUsageSnapshot(
  next: ClaudeUsageSnapshot,
  previous: ClaudeUsageSnapshot | null,
  source: 'cache' | 'scrape' | 'message-limit' | 'storage-change',
): ClaudeUsageSnapshot {
  const supplemented =
    source === 'message-limit' ? withSupplementalModelMetric(next, previous) : next;
  const planned =
    source === 'storage-change' ? supplemented : withFallbackPlan(supplemented, previous);
  return withFallbackCountdowns(planned, previous);
}
