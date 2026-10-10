import { hashValue } from '@/core/utils/canonicalHash';
/**
 * Multi-key bundles (DESIGN-v2 §9, addendum P3P4 R3.1–R3.6, R4.1–R4.3, R5.2).
 * Dormant: nothing produces a bundle until the cloud merge moves to the owner
 * (P4); turns reading its keys resolve an open one first.
 *
 * A bundle writes several keys, one of them an owned K's meta, as one
 * transaction with respect to queue participants. The intent records every
 * key's `prevHash` and `nextHash` and holds the values not landed yet, so a
 * crash at any point either rolls forward to all next values or, when a key
 * is at neither hash, is abandoned. The client's op stays `bundle_pending`
 * in the next meta until every value has landed; a meta-only flip then makes
 * it `saved`, and an abandon makes it `interrupted` (never a false `saved`).
 */
import type { StorageBudget } from '@/features/storage/storageBudget';
import { storedItemBytes, storedItemsBytes } from '@/features/storage/storageBudget';

import type { FolderAuthority } from './authority';
import { INTERRUPTED, type OpOutcome, type StoredOutcome } from './folderOps';
import { type FolderSite, siteOfFolderKey } from './folderOwnerPolicy';
import type { FolderOwnerMeta, FolderOwnerStorageArea } from './folderOwnerState';

export const BUNDLE_INTENT_KEY = 'gvFolderOwner:bundleIntent';
const BUNDLE_VERSION = 1;
const OWNER_PREFIX = 'gvFolderOwner:';
const META_PREFIX = `${OWNER_PREFIX}meta:`;
const MIN_MARGIN_BYTES = 512 * 1024;
const MARGIN_RATIO = 0.1;
const SAVED: OpOutcome = { kind: 'saved' };

type Authority = Readonly<Record<FolderSite, FolderAuthority>>;

/** The free space a bundle must leave under a hard quota: `M = max(512 KiB, 10% of Q)` (R3.1). */
export const bundleMargin = (quotaBytes: number): number =>
  Math.max(MIN_MARGIN_BYTES, Math.ceil(quotaBytes * MARGIN_RATIO));

/** The frozen intent schema (R3.3). */
export interface OpenBundle {
  v: 1;
  txId: string;
  status: 'open';
  site: FolderSite;
  seq: number;
  clientId: string;
  keys: Record<string, { prevHash: string; nextHash: string }>;
  /** The next values of the keys that have not landed yet (R3.5 drops the landed ones). */
  values: Record<string, unknown>;
  at: number;
}

export interface BundleRequest {
  txId: string;
  site: FolderSite;
  seq: number;
  clientId: string;
  /** Every next value, including the K's meta whose `outcomes[seq]` is `bundle_pending`. */
  values: Record<string, unknown>;
  at: number;
}

export type BundleResult =
  | { kind: 'saved' }
  /** Nothing landed: the seq is unapplied and the client still holds its payload (R3.4). */
  | { kind: 'refused'; reason: 'quota' | 'unmeasurable' | 'read_failed' | 'write_failed' }
  /** The intent is open; the next queue turn's resolution finishes or abandons it. */
  | { kind: 'pending' };

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** Whether a stored intent value is open, whatever its version. */
export const isOpenStatus = (value: unknown): boolean => isRecord(value) && value.status === 'open';

function isOpenBundle(value: unknown): value is OpenBundle {
  return (
    isRecord(value) &&
    value.v === BUNDLE_VERSION &&
    value.status === 'open' &&
    typeof value.txId === 'string' &&
    typeof value.site === 'string' &&
    typeof value.seq === 'number' &&
    typeof value.clientId === 'string' &&
    isRecord(value.keys) &&
    Object.values(value.keys).every(
      (hashes) =>
        isRecord(hashes) &&
        typeof hashes.prevHash === 'string' &&
        typeof hashes.nextHash === 'string',
    ) &&
    isRecord(value.values)
  );
}

/** A storage error that reports the quota (Chrome's `QUOTA_BYTES`; Safari's shape is LC9). */
export function isQuotaError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  return error.name === 'QuotaExceededError' || /quota/i.test(error.message);
}

const siteOfKey = (key: string): FolderSite | null =>
  siteOfFolderKey(key.startsWith(META_PREFIX) ? key.slice(META_PREFIX.length) : key);

/** Whether this build may roll `intent` forward: its site, and every folder key it writes, are owned. */
function ownedBy(intent: OpenBundle, authority: Authority): boolean {
  if (authority[intent.site] !== 'owner') return false;
  return Object.keys(intent.keys).every((key) => {
    const site = siteOfKey(key);
    return site === null || authority[site] === 'owner';
  });
}

const metaKeyOf = (intent: Pick<OpenBundle, 'keys'>): string | undefined =>
  Object.keys(intent.keys).find((key) => key.startsWith(META_PREFIX));

/**
 * `meta` with the bundle's `bundle_pending{txId}` outcome replaced by
 * `outcome` as a meta-only commit (rev + 1), or `null` when that outcome is
 * not there: a flip never touches any other outcome.
 */
export function settleBundleOutcome(
  meta: unknown,
  intent: Pick<OpenBundle, 'txId' | 'seq' | 'clientId'>,
  outcome: OpOutcome,
): FolderOwnerMeta | null {
  if (!isRecord(meta) || !isRecord(meta.clients) || typeof meta.rev !== 'number') return null;
  const client = meta.clients[intent.clientId];
  if (!isRecord(client) || !isRecord(client.outcomes)) return null;
  const stored = client.outcomes[intent.seq] as StoredOutcome | undefined;
  if (stored?.kind !== 'bundle_pending' || stored.txId !== intent.txId) return null;
  const typed = meta as unknown as FolderOwnerMeta;
  return {
    ...typed,
    rev: typed.rev + 1,
    clients: {
      ...typed.clients,
      [intent.clientId]: {
        ...typed.clients[intent.clientId],
        outcomes: { ...typed.clients[intent.clientId].outcomes, [intent.seq]: outcome },
      },
    },
  };
}

/**
 * Replaces every `bundle_pending` outcome in `meta` with `interrupted` (R4.3).
 * Called once no bundle of this K is open, so any left is stale.
 */
export function interruptStaleBundles(meta: FolderOwnerMeta): FolderOwnerMeta | null {
  let changed = false;
  const clients = Object.fromEntries(
    Object.entries(meta.clients).map(([id, client]) => {
      const outcomes = Object.fromEntries(
        Object.entries(client.outcomes).map(([seq, outcome]) => {
          if (outcome.kind !== 'bundle_pending') return [seq, outcome];
          changed = true;
          return [seq, INTERRUPTED];
        }),
      );
      return [id, { ...client, outcomes }];
    }),
  );
  return changed ? { ...meta, rev: meta.rev + 1, clients } : null;
}

const settledStatus = (txId: string, status: 'closed' | 'aborted' | 'abandoned', at: number) => ({
  [BUNDLE_INTENT_KEY]: { v: BUNDLE_VERSION, txId, status, at },
});

type KeyState = 'prev' | 'next' | 'flipped' | 'neither';

async function classify(
  intent: OpenBundle,
  current: Record<string, unknown>,
): Promise<Record<string, KeyState>> {
  const metaKey = metaKeyOf(intent);
  const states: Record<string, KeyState> = {};
  for (const [key, { prevHash, nextHash }] of Object.entries(intent.keys)) {
    const hash = await hashValue(current[key]);
    if (hash === nextHash) states[key] = 'next';
    // A prev key whose value the intent no longer holds cannot be rolled forward.
    else if (hash === prevHash) states[key] = key in intent.values ? 'prev' : 'neither';
    else if (key === metaKey && (await isFlipped(intent, current[key]))) states[key] = 'flipped';
    else states[key] = 'neither';
  }
  return states;
}

/** Whether `value` is the next meta with this bundle's outcome already flipped to `saved`. */
async function isFlipped(intent: OpenBundle, value: unknown): Promise<boolean> {
  const metaKey = metaKeyOf(intent);
  if (!metaKey || !isRecord(value) || typeof value.rev !== 'number') return false;
  const clients = isRecord(value.clients) ? value.clients : null;
  const client = clients?.[intent.clientId];
  if (!clients || !isRecord(client) || !isRecord(client.outcomes)) return false;
  const outcome = client.outcomes[intent.seq];
  if (!isRecord(outcome) || outcome.kind !== 'saved') return false;
  // Undo the flip and compare with the next meta's hash.
  const unflipped = {
    ...value,
    rev: value.rev - 1,
    clients: {
      ...clients,
      [intent.clientId]: {
        ...client,
        outcomes: {
          ...client.outcomes,
          [intent.seq]: { kind: 'bundle_pending', txId: intent.txId },
        },
      },
    },
  };
  return (await hashValue(unflipped)) === intent.keys[metaKey].nextHash;
}

/**
 * R4.2 then R5.2: the durable `interrupted` outcome first (only when the
 * meta holds this bundle's pending outcome), then the status-only abandon.
 */
async function abandon(
  area: FolderOwnerStorageArea,
  intent: OpenBundle,
  current: Record<string, unknown>,
  at: number,
): Promise<void> {
  const metaKey = metaKeyOf(intent);
  const interrupted = metaKey ? settleBundleOutcome(current[metaKey], intent, INTERRUPTED) : null;
  if (metaKey && interrupted) await area.set({ [metaKey]: interrupted });
  await area.set(settledStatus(intent.txId, 'abandoned', at));
}

/**
 * Finishes `intent` from `current`: abandons it when a key is at neither hash,
 * else rolls forward shrink-first (R3.5) without consulting any budget, flips
 * the outcome to `saved` (R4.1) and closes. Throws on a storage failure; the
 * intent then stays open for the next turn.
 */
async function finish(
  area: FolderOwnerStorageArea,
  intent: OpenBundle,
  current: Record<string, unknown>,
  at: number,
): Promise<'saved' | 'abandoned'> {
  const states = await classify(intent, current);
  const metaKey = metaKeyOf(intent);
  // A durable saved flip proves completion; later companion edits must survive.
  if (metaKey && states[metaKey] === 'flipped') {
    await area.set(settledStatus(intent.txId, 'closed', at));
    return 'saved';
  }
  if (Object.values(states).includes('neither')) {
    await abandon(area, intent, current, at);
    return 'abandoned';
  }
  const remaining = Object.keys(intent.keys).filter((key) => states[key] === 'prev');
  const landed = Object.keys(intent.values).filter((key) => !remaining.includes(key));
  if (landed.length > 0 && remaining.length > 0) {
    // Shrink-first: the intent stops holding values that already landed.
    const values = Object.fromEntries(remaining.map((key) => [key, intent.values[key]]));
    await area.set({ [BUNDLE_INTENT_KEY]: { ...intent, values } });
  }
  const growth = (key: string) =>
    storedItemBytes(key, intent.values[key]) -
    (current[key] === undefined ? 0 : storedItemBytes(key, current[key]));
  for (const key of [...remaining].sort((a, b) => growth(a) - growth(b))) {
    await area.set({ [key]: intent.values[key] });
  }
  if (metaKey) {
    const nextMeta = remaining.includes(metaKey) ? intent.values[metaKey] : current[metaKey];
    const saved = settleBundleOutcome(nextMeta, intent, SAVED);
    if (saved) await area.set({ [metaKey]: saved });
  }
  await area.set(settledStatus(intent.txId, 'closed', at));
  return 'saved';
}

async function readKeys(area: FolderOwnerStorageArea, intent: OpenBundle) {
  return area.get(Object.keys(intent.keys));
}

/**
 * Writes `request` as one bundle. Callers run inside the queue. Its keys are
 * folder keys, their metas and companions such as the prompt library; any
 * other owner key throws. While an earlier intent is open, nothing is written
 * and the bundle is refused like a blocked turn. The admission (R3.1) is one
 * `data` step for the intent and every value, which must leave `M` free under
 * a hard quota; a value `set` refused on quota while every key is still at its
 * prev hash aborts with nothing landed (R3.4).
 */
export async function writeBundle(
  area: FolderOwnerStorageArea,
  request: BundleRequest,
  budget?: Pick<StorageBudget, 'run'>,
): Promise<BundleResult> {
  const keyList = Object.keys(request.values);
  // Turns declare only K and its meta as reads, so a bundle over any other owner key would go unseen.
  const sidecar = keyList.find(
    (key) => key.startsWith(OWNER_PREFIX) && !(key.startsWith(META_PREFIX) && siteOfKey(key)),
  );
  if (sidecar) throw new Error(`Not a bundle participant: ${sidecar}`);
  let prev: Record<string, unknown>;
  try {
    prev = await area.get([...keyList, BUNDLE_INTENT_KEY]);
  } catch {
    return { kind: 'refused', reason: 'read_failed' };
  }
  // A disjoint turn passes a stuck bundle; replacing its intent would lose its unlanded values.
  if (isOpenStatus(prev[BUNDLE_INTENT_KEY])) return { kind: 'refused', reason: 'write_failed' };
  const keys: OpenBundle['keys'] = {};
  for (const key of keyList) {
    keys[key] = {
      prevHash: await hashValue(prev[key]),
      nextHash: await hashValue(request.values[key]),
    };
  }
  const { values, ...rest } = request;
  const intent: OpenBundle = { v: BUNDLE_VERSION, status: 'open', ...rest, keys, values };
  const write = () => writeAdmitted(area, intent);
  if (!budget) return write();
  const admission = await budget.run(
    {
      kind: 'data',
      keys: [BUNDLE_INTENT_KEY, ...keyList],
      bytes: storedItemBytes(BUNDLE_INTENT_KEY, intent) + storedItemsBytes(values),
      margin: bundleMargin,
    },
    write,
  );
  return admission.admitted ? admission.value : { kind: 'refused', reason: admission.reason };
}

async function writeAdmitted(
  area: FolderOwnerStorageArea,
  intent: OpenBundle,
): Promise<BundleResult> {
  try {
    await area.set({ [BUNDLE_INTENT_KEY]: intent });
  } catch (error) {
    // No value was sent, so every key is still prev whether or not the intent landed.
    try {
      await area.set(settledStatus(intent.txId, 'aborted', intent.at));
    } catch {
      return { kind: 'pending' };
    }
    return { kind: 'refused', reason: isQuotaError(error) ? 'quota' : 'write_failed' };
  }
  try {
    await area.set(intent.values);
  } catch (error) {
    return afterValueFailure(area, intent, isQuotaError(error));
  }
  try {
    const outcome = await finish(area, intent, await readKeys(area, intent), intent.at);
    return outcome === 'saved' ? { kind: 'saved' } : { kind: 'pending' };
  } catch {
    return { kind: 'pending' };
  }
}

async function afterValueFailure(
  area: FolderOwnerStorageArea,
  intent: OpenBundle,
  onQuota: boolean,
): Promise<BundleResult> {
  try {
    const current = await readKeys(area, intent);
    const states = await classify(intent, current);
    if (onQuota && Object.values(states).every((state) => state === 'prev')) {
      await area.set(settledStatus(intent.txId, 'aborted', intent.at));
      return { kind: 'refused', reason: 'quota' };
    }
    const outcome = await finish(area, intent, current, intent.at);
    return outcome === 'saved' ? { kind: 'saved' } : { kind: 'pending' };
  } catch {
    return { kind: 'pending' };
  }
}

/**
 * Settles an open bundle before a participant reads its keys. Unsupported
 * authority or version is abandoned with a status-only write (R5.2): a legacy
 * site's K and meta stay frozen. A quota failure releases space through
 * `releaseFor` (R3.6) and tries again. `readKeys` disjoint from a still-open
 * bundle's keys get `ok`; `onBlocked` is told whenever the bundle stays open.
 */
export async function resolveBundleIntent(
  area: FolderOwnerStorageArea,
  authority: Authority,
  now: () => number = Date.now,
  options: {
    readKeys?: readonly string[];
    /** Awaited once an intent is found open, before resolution writes anything (§3.3). */
    fence?: () => Promise<void>;
    /** The space release for a bundle stuck on quota (R3.6); without it, quota just blocks. */
    releaseFor?: (txId: string, participants: string[]) => () => Promise<boolean>;
    onBlocked?: () => void;
  } = {},
): Promise<'ok' | 'read_failed' | 'write_failed'> {
  let intent: unknown;
  try {
    intent = (await area.get([BUNDLE_INTENT_KEY]))[BUNDLE_INTENT_KEY];
  } catch {
    options.onBlocked?.();
    return 'read_failed';
  }
  if (!isOpenStatus(intent)) return 'ok';
  // An intent left open by a failed abandon still blocks only the turns that read its keys.
  const keys = isRecord(intent) && isRecord(intent.keys) ? Object.keys(intent.keys) : null;
  const blocked = (reason: 'read_failed' | 'write_failed') => {
    options.onBlocked?.();
    return keys && options.readKeys?.every((key) => !keys.includes(key)) ? 'ok' : reason;
  };
  try {
    await options.fence?.();
  } catch {
    return blocked('write_failed');
  }
  if (!isOpenBundle(intent) || !ownedBy(intent, authority)) {
    const txId = isRecord(intent) && typeof intent.txId === 'string' ? intent.txId : '';
    try {
      await area.set(settledStatus(txId, 'abandoned', now()));
    } catch {
      return blocked('write_failed');
    }
    return 'ok';
  }
  const release = options.releaseFor?.(intent.txId, Object.keys(intent.keys));
  for (;;) {
    let current: Record<string, unknown>;
    try {
      current = await readKeys(area, intent);
    } catch {
      return blocked('read_failed');
    }
    try {
      await finish(area, intent, current, now());
      return 'ok';
    } catch (error) {
      if (!isQuotaError(error)) return blocked('write_failed');
      try {
        if (!release || !(await release())) return blocked('write_failed');
      } catch {
        return blocked('write_failed');
      }
    }
  }
}
