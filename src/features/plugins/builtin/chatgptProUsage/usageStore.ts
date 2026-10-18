/**
 * The Pro send ledger, as pure data (chrome.storage.local, never synced or
 * backed up). Approach inspired by Temult/chatgpt-pro-quota-ledger (MIT):
 * count the page's own successful sends, and learn the real limit only from
 * `conversation/init`, which names it once Pro is used up (measured
 * 2026-10-18: both limit lists are empty before that).
 *
 * One bucket per ChatGPT account: the observer hashes the page's
 * `chatgpt-account-id` request header, and a page that sends none counts in
 * `UNKNOWN_ACCOUNT`.
 */

/** Which sends count, in one place (measured: `body.model === "gpt-6-pro"`, no effort field). */
export const PRO_MODEL_PATTERN = /(?:^|-)pro(?:-|$)/;
/**
 * Conversation modes that are a Pro chat turn: a normal chat, and a chat in a
 * project (measured: `{ kind: "gizmo_interaction", gizmo_id: "g-p-…" }`).
 * No mode at all is a normal chat too.
 */
export const PRO_CHAT_MODES: ReadonlySet<string> = new Set([
  'primary_assistant',
  'gizmo_interaction',
]);
/** The same turn reported twice within this window (a retry, two endpoints) counts once. */
export const SEND_DEDUPE_MS = 20_000;
export const RETENTION_MS = 45 * 86_400_000;
export const WEEK_MS = 7 * 86_400_000;
/** A reset time further than this from now is not one ChatGPT meant. */
const RESET_HORIZON_MS = 30 * 86_400_000;
/** The bucket for sends whose page named no account. */
export const UNKNOWN_ACCOUNT = 'unknown';
const MAX_SENDS = 5_000;
const MAX_ACCOUNTS = 20;
const MAX_KEY_LENGTH = 64;
const MAX_LIMIT = 10_000;
const MAX_PLAN_LENGTH = 100;

export interface ProUsageSend {
  readonly at: number;
  /** A hash of conversation + last message id; null when the page named neither. */
  readonly key: string | null;
}

/** The two plan strings the page's own `accounts/check` response named, and when. */
export interface ProUsagePlan {
  readonly planType: string | null;
  readonly subscriptionPlan: string | null;
  readonly observedAt: number;
}

export interface ProUsageBucket {
  /** Oldest first, at most 45 days old. */
  readonly sends: readonly ProUsageSend[];
  /** Pro sends per cycle, once ChatGPT has named it. */
  readonly limit: number | null;
  /** Epoch ms of the cycle reset ChatGPT last named. */
  readonly resetsAt: number | null;
  /** Until this time ChatGPT has said Pro is used up, whatever this browser counted. */
  readonly blockedUntil: number | null;
  readonly plan: ProUsagePlan | null;
}

export interface ProUsageStore {
  readonly version: 2;
  /** Keyed by account hash, or `UNKNOWN_ACCOUNT`. */
  readonly accounts: Readonly<Record<string, ProUsageBucket>>;
  /** The account the last report came from: shown until the page names its own. */
  readonly lastAccount: string | null;
}

export interface ProQuota {
  readonly limit: number | null;
  readonly resetsAt: number | null;
}

export interface ProUsageSummary {
  readonly usedThisWeek: number;
  readonly limit: number | null;
  readonly resetsAt: number | null;
  readonly windowStart: number;
  /** ChatGPT has said Pro is used up until `resetsAt`. */
  readonly blocked: boolean;
  /** 0 while blocked, else limit − used when the limit is known. */
  readonly remaining: number | null;
}

export const EMPTY_BUCKET: ProUsageBucket = {
  sends: [],
  limit: null,
  resetsAt: null,
  blockedUntil: null,
  plan: null,
};
export const EMPTY_PRO_USAGE: ProUsageStore = { version: 2, accounts: {}, lastAccount: null };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function finiteOrNull(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function isAccountKey(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= MAX_KEY_LENGTH;
}

export function accountKey(account: string | null): string {
  return account ?? UNKNOWN_ACCOUNT;
}

export function isProSend(send: { readonly model: string; readonly mode: string | null }): boolean {
  if (send.mode !== null && !PRO_CHAT_MODES.has(send.mode)) return false;
  return PRO_MODEL_PATTERN.test(send.model.toLowerCase());
}

function readSend(value: unknown): ProUsageSend | null {
  if (!isRecord(value)) return null;
  const at = finiteOrNull(value.at);
  if (at === null) return null;
  const key = value.key ?? null;
  if (key !== null && !isAccountKey(key)) return null;
  return { at, key };
}

function planString(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 && value.length <= MAX_PLAN_LENGTH
    ? value
    : null;
}

export function readPlan(raw: unknown): ProUsagePlan | null {
  if (!isRecord(raw)) return null;
  const planType = planString(raw.planType);
  const subscriptionPlan = planString(raw.subscriptionPlan);
  const observedAt = finiteOrNull(raw.observedAt);
  if ((planType === null && subscriptionPlan === null) || observedAt === null) return null;
  return { planType, subscriptionPlan, observedAt };
}

function readBucket(raw: unknown): ProUsageBucket {
  if (!isRecord(raw)) return EMPTY_BUCKET;
  const sends = Array.isArray(raw.sends)
    ? raw.sends.map(readSend).filter((send): send is ProUsageSend => send !== null)
    : [];
  const limit = finiteOrNull(raw.limit);
  return {
    sends: sends.sort((a, b) => a.at - b.at),
    limit: limit !== null && limit >= 1 ? limit : null,
    resetsAt: finiteOrNull(raw.resetsAt),
    blockedUntil: finiteOrNull(raw.blockedUntil),
    plan: readPlan(raw.plan),
  };
}

/**
 * Whatever is stored, as a valid store: bad entries are dropped, foreign data
 * reads as empty, and the single-account version 1 becomes the unknown
 * account's bucket, which the first account the page names then adopts.
 */
export function readProUsageStore(raw: unknown): ProUsageStore {
  if (!isRecord(raw)) return EMPTY_PRO_USAGE;
  if (raw.version === 1) {
    return {
      version: 2,
      accounts: { [UNKNOWN_ACCOUNT]: readBucket(raw) },
      lastAccount: UNKNOWN_ACCOUNT,
    };
  }
  if (raw.version !== 2 || !isRecord(raw.accounts)) return EMPTY_PRO_USAGE;
  const accounts: Record<string, ProUsageBucket> = {};
  for (const [key, bucket] of Object.entries(raw.accounts).slice(0, MAX_ACCOUNTS)) {
    if (isAccountKey(key)) accounts[key] = readBucket(bucket);
  }
  const lastAccount = isAccountKey(raw.lastAccount) ? raw.lastAccount : null;
  return { version: 2, accounts, lastAccount };
}

export function bucketOf(store: ProUsageStore, key: string): ProUsageBucket {
  return Object.hasOwn(store.accounts, key) ? store.accounts[key] : EMPTY_BUCKET;
}

/**
 * The store as seen from `key`: the account becomes the last one, and the
 * first named account adopts sends counted before any account was known.
 */
function withAccount(store: ProUsageStore, key: string): ProUsageStore {
  let accounts = store.accounts;
  const keys = Object.keys(accounts);
  if (key !== UNKNOWN_ACCOUNT && keys.length === 1 && keys[0] === UNKNOWN_ACCOUNT) {
    accounts = { [key]: accounts[UNKNOWN_ACCOUNT] };
  }
  if (accounts === store.accounts && store.lastAccount === key) return store;
  return { ...store, accounts, lastAccount: key };
}

function withBucket(store: ProUsageStore, key: string, bucket: ProUsageBucket): ProUsageStore {
  const accounts = { ...store.accounts, [key]: bucket };
  const keys = Object.keys(accounts);
  // Keep the busiest-recent accounts when someone cycles through many.
  if (keys.length > MAX_ACCOUNTS) {
    const latest = (k: string): number => accounts[k].sends.at(-1)?.at ?? 0;
    for (const old of keys.filter((k) => k !== key).sort((a, b) => latest(a) - latest(b))) {
      if (Object.keys(accounts).length <= MAX_ACCOUNTS) break;
      delete accounts[old];
    }
  }
  return { ...store, accounts };
}

/** The store once the page has named its account, or null when nothing changes. */
export function noteAccount(store: ProUsageStore, account: string | null): ProUsageStore | null {
  const next = withAccount(store, accountKey(account));
  return next === store ? null : next;
}

/** The store with this send added and old ones pruned, or null when it repeats a recent turn. */
export function recordProSend(
  store: ProUsageStore,
  account: string | null,
  send: ProUsageSend,
  now: number,
): ProUsageStore | null {
  const key = accountKey(account);
  const current = withAccount(store, key);
  const bucket = bucketOf(current, key);
  if (
    send.key !== null &&
    bucket.sends.some(
      (seen) => seen.key === send.key && Math.abs(seen.at - send.at) < SEND_DEDUPE_MS,
    )
  ) {
    return null;
  }
  const sends = [...bucket.sends.filter((seen) => seen.at >= now - RETENTION_MS), send]
    .sort((a, b) => a.at - b.at)
    .slice(-MAX_SENDS);
  return withBucket(current, key, { ...bucket, sends });
}

/** Epoch ms within 30 days of now, else null (ISO string, or seconds / ms since the epoch). */
function parseTime(value: unknown, now: number): number | null {
  let ms: number | null = null;
  if (typeof value === 'string') {
    const parsed = Date.parse(value);
    ms = Number.isFinite(parsed) ? parsed : null;
  } else if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
    ms = value < 1e12 ? value * 1000 : value;
  }
  if (ms === null || Math.abs(ms - now) > RESET_HORIZON_MS) return null;
  return ms;
}

function validLimit(value: unknown): number | null {
  return typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= MAX_LIMIT
    ? value
    : null;
}

function slugOf(entry: unknown): string | null {
  return isRecord(entry) && typeof entry.model_slug === 'string'
    ? entry.model_slug.toLowerCase()
    : null;
}

/**
 * The Pro limit and reset in an init response's `model_limits` /
 * `blocked_features`, or null when it names no Pro model. Shape per the
 * ledger: `model_limits[].model_slug` + `resets_after`, and a
 * `blocked_features[]` entry named `reason` with `limit` / `resets_after`.
 * The entry for `preferredModel` (the model this page last sent) wins over
 * any other Pro entry. A reset that has already passed is dropped.
 */
export function parseInitQuota(
  payload: unknown,
  now: number,
  preferredModel: string | null = null,
): ProQuota | null {
  if (!isRecord(payload) || !Array.isArray(payload.model_limits)) return null;
  const preferred = preferredModel?.toLowerCase() ?? null;
  const matching = (payload.model_limits.find(
    (entry) => preferred !== null && slugOf(entry) === preferred,
  ) ??
    payload.model_limits.find((entry) => {
      const slug = slugOf(entry);
      return slug !== null && PRO_MODEL_PATTERN.test(slug);
    })) as Record<string, unknown> | undefined;
  if (!matching) return null;
  const reason = (Array.isArray(payload.blocked_features) ? payload.blocked_features : []).find(
    (entry) => isRecord(entry) && entry.name === 'reason',
  ) as Record<string, unknown> | undefined;
  const resetsAt =
    parseTime(matching.resets_after, now) ?? parseTime(reason?.resets_after, now) ?? null;
  return {
    limit: validLimit(reason?.limit),
    resetsAt: resetsAt !== null && resetsAt > now ? resetsAt : null,
  };
}

/**
 * The store with what this quota names; fields it leaves out keep their
 * value. A Pro entry in the init lists means Pro is used up until its reset.
 * Null: no change.
 */
export function applyProQuota(
  store: ProUsageStore,
  account: string | null,
  quota: ProQuota,
): ProUsageStore | null {
  const key = accountKey(account);
  const current = withAccount(store, key);
  const bucket = bucketOf(current, key);
  const next: ProUsageBucket = {
    ...bucket,
    limit: quota.limit ?? bucket.limit,
    resetsAt: quota.resetsAt ?? bucket.resetsAt,
    blockedUntil: quota.resetsAt ?? bucket.blockedUntil,
  };
  if (
    current === store &&
    next.limit === bucket.limit &&
    next.resetsAt === bucket.resetsAt &&
    next.blockedUntil === bucket.blockedUntil
  ) {
    return null;
  }
  return withBucket(current, key, next);
}

/** The store with the plan this account's page reported, or null when it is unchanged. */
export function recordPlan(
  store: ProUsageStore,
  account: string | null,
  plan: ProUsagePlan,
): ProUsageStore | null {
  const key = accountKey(account);
  const current = withAccount(store, key);
  const bucket = bucketOf(current, key);
  if (
    current === store &&
    bucket.plan?.planType === plan.planType &&
    bucket.plan?.subscriptionPlan === plan.subscriptionPlan
  ) {
    return null;
  }
  return withBucket(current, key, { ...bucket, plan });
}

/**
 * The current week: seven days back from a known reset (rolled forward by
 * whole weeks once it has passed, on the assumption that the cycle is
 * weekly), else the last seven days.
 */
export function summarizeProUsage(bucket: ProUsageBucket, now: number): ProUsageSummary {
  let resetsAt = bucket.resetsAt;
  if (resetsAt !== null && resetsAt <= now) {
    resetsAt += (Math.floor((now - resetsAt) / WEEK_MS) + 1) * WEEK_MS;
  }
  const windowStart = resetsAt === null ? now - WEEK_MS : resetsAt - WEEK_MS;
  const usedThisWeek = bucket.sends.filter(
    (send) => send.at >= windowStart && send.at <= now,
  ).length;
  const blocked = bucket.blockedUntil !== null && bucket.blockedUntil > now;
  const remaining = blocked
    ? 0
    : bucket.limit === null
      ? null
      : Math.max(0, bucket.limit - usedThisWeek);
  return { usedThisWeek, limit: bucket.limit, resetsAt, windowStart, blocked, remaining };
}
