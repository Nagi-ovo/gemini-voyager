// Transcripts stay in expiring extension records; page storage holds only a tab token.
// Duplicating a tab copies that token, so verify the tab id before reading or removing its record.
import browser from 'webextension-polyfill';

import { createHandoffTabToken, type HandoffDelivery } from './handoffPlan';
import {
  CHATGPT_HANDOFF_CANCEL_EXPIRY_MESSAGE,
  CHATGPT_HANDOFF_GET_TAB_ID_MESSAGE,
  CHATGPT_HANDOFF_SCHEDULE_EXPIRY_MESSAGE,
  PENDING_HANDOFF_KEY,
  PENDING_HANDOFF_STORAGE_PREFIX,
  PENDING_HANDOFF_TAB_KEY,
  PENDING_HANDOFF_TTL_MS,
} from './storage';

export interface PendingHandoff {
  readonly delivery: HandoffDelivery;
  readonly draft?: string;
  readonly storedAt: number;
  readonly accountScope: string;
  readonly tabId: number;
  readonly deliveredRoute?: string;
}

let deliveredPendingToken: string | null = null;

export function readAccountScope(): string {
  try {
    const routeAccount = /^\/u\/([^/]+)(?:\/|$)/.exec(new URL(location.href).pathname)?.[1];
    return routeAccount ? `route:${routeAccount}` : 'route:default';
  } catch {
    return 'route:default';
  }
}

export function readHandoffRoute(): string {
  try {
    return new URL(location.href).pathname || '/';
  } catch {
    return '/';
  }
}

function readPendingTabToken(): string | null {
  try {
    const token = sessionStorage.getItem(PENDING_HANDOFF_TAB_KEY);
    return token && /^[a-z0-9-]{4,80}$/i.test(token) ? token : null;
  } catch {
    return null;
  }
}

function pendingStorageKey(token: string): string {
  return `${PENDING_HANDOFF_STORAGE_PREFIX}${token}`;
}

function shouldSweepPendingHandoff(value: unknown, now: number): boolean {
  if (!value || typeof value !== 'object') return true;
  const storedAt = (value as Partial<PendingHandoff>).storedAt;
  return (
    typeof storedAt !== 'number' ||
    !Number.isFinite(storedAt) ||
    now - storedAt > PENDING_HANDOFF_TTL_MS ||
    storedAt > now + 5_000
  );
}

async function sweepExpiredPendingHandoffs(now = Date.now()): Promise<void> {
  const stored = await browser.storage.local.get();
  const expiredKeys = Object.entries(stored)
    .filter(
      ([key, value]) =>
        key.startsWith(PENDING_HANDOFF_STORAGE_PREFIX) && shouldSweepPendingHandoff(value, now),
    )
    .map(([key]) => key);
  if (expiredKeys.length > 0) await browser.storage.local.remove(expiredKeys);
}

function ensurePendingTabToken(): string {
  const existing = readPendingTabToken();
  if (existing) return existing;
  const token = createHandoffTabToken();
  sessionStorage.setItem(PENDING_HANDOFF_TAB_KEY, token);
  return token;
}

function detachPendingHandoffTab(): void {
  deliveredPendingToken = null;
  try {
    sessionStorage.removeItem(PENDING_HANDOFF_TAB_KEY);
    sessionStorage.removeItem(PENDING_HANDOFF_KEY);
  } catch {
    // Storage can be unavailable in locked-down browsing contexts.
  }
}

async function readCurrentExtensionTabId(): Promise<number | null> {
  try {
    const response = (await browser.runtime.sendMessage({
      type: CHATGPT_HANDOFF_GET_TAB_ID_MESSAGE,
    })) as { ok?: unknown; tabId?: unknown } | undefined;
    return response?.ok === true &&
      typeof response.tabId === 'number' &&
      Number.isInteger(response.tabId) &&
      response.tabId >= 0
      ? response.tabId
      : null;
  } catch {
    return null;
  }
}

export async function discardPendingHandoff(): Promise<void> {
  const token = readPendingTabToken();
  detachPendingHandoffTab();
  if (!token) {
    return;
  }
  const storageKey = pendingStorageKey(token);
  try {
    const [currentTabId, stored] = await Promise.all([
      readCurrentExtensionTabId(),
      browser.storage.local.get(storageKey),
    ]);
    const ownerTabId = (stored[storageKey] as Partial<PendingHandoff> | undefined)?.tabId;
    if (currentTabId === null || (typeof ownerTabId === 'number' && ownerTabId !== currentTabId)) {
      return;
    }
  } catch {
    return;
  }
  let removed = false;
  try {
    await browser.storage.local.remove(storageKey);
    removed = true;
  } catch {
    // The tab token is already invalidated, so a later plugin lifecycle cannot replay it.
  }
  if (!removed) return;
  try {
    await browser.runtime.sendMessage({
      type: CHATGPT_HANDOFF_CANCEL_EXPIRY_MESSAGE,
      payload: { storageKey },
    });
  } catch {
    // A stale alarm only attempts to remove the already-deleted storage key.
  }
}

export async function writePending(
  delivery: HandoffDelivery,
  accountScope: string,
  draft?: string,
): Promise<PendingHandoff> {
  try {
    deliveredPendingToken = null;
    await sweepExpiredPendingHandoffs();
    const tabId = await readCurrentExtensionTabId();
    if (tabId === null) throw new Error('Unable to bind pending handoff to the current tab');
    const copiedToken = readPendingTabToken();
    if (copiedToken) {
      const copiedKey = pendingStorageKey(copiedToken);
      const copied = await browser.storage.local.get(copiedKey);
      const copiedTabId = (copied[copiedKey] as Partial<PendingHandoff> | undefined)?.tabId;
      if (typeof copiedTabId === 'number' && copiedTabId !== tabId) detachPendingHandoffTab();
    }
    const token = ensurePendingTabToken();
    const storageKey = pendingStorageKey(token);
    const storedAt = Date.now();
    const pending = {
      delivery,
      ...(draft ? { draft } : {}),
      storedAt,
      accountScope,
      tabId,
    } satisfies PendingHandoff;
    await browser.storage.local.set({
      [storageKey]: pending,
    });
    const scheduled = (await browser.runtime.sendMessage({
      type: CHATGPT_HANDOFF_SCHEDULE_EXPIRY_MESSAGE,
      payload: { storageKey, expiresAt: storedAt + PENDING_HANDOFF_TTL_MS },
    })) as { ok?: unknown } | undefined;
    if (scheduled?.ok !== true) throw new Error('Unable to schedule pending handoff expiry');
    // Do not retain full transcripts written by earlier revisions in page storage.
    sessionStorage.removeItem(PENDING_HANDOFF_KEY);
    return pending;
  } catch (error) {
    await discardPendingHandoff();
    throw error;
  }
}

export async function markPendingDelivered(pending: PendingHandoff): Promise<void> {
  const token = readPendingTabToken();
  if (!token) return;
  const storageKey = pendingStorageKey(token);
  try {
    const stored = await browser.storage.local.get(storageKey);
    const current = stored[storageKey] as Partial<PendingHandoff> | undefined;
    if (current?.storedAt !== pending.storedAt || current.tabId !== pending.tabId) return;
    await browser.storage.local.set({
      [storageKey]: { ...pending, deliveredRoute: readHandoffRoute() } satisfies PendingHandoff,
    });
    if (readPendingTabToken() === token) deliveredPendingToken = token;
  } catch {
    // Delivery already succeeded. Invalidate recovery rather than risk replaying it on another route.
    await discardPendingHandoff();
  }
}

export async function readPending(): Promise<PendingHandoff | null> {
  try {
    const token = readPendingTabToken();
    if (!token) {
      sessionStorage.removeItem(PENDING_HANDOFF_KEY);
      return null;
    }
    const key = pendingStorageKey(token);
    const result = await browser.storage.local.get(key);
    const parsed = result[key] as Partial<PendingHandoff> | undefined;
    const tabId = await readCurrentExtensionTabId();
    if (tabId === null) {
      detachPendingHandoffTab();
      return null;
    }
    if (typeof parsed?.tabId === 'number' && parsed.tabId !== tabId) {
      detachPendingHandoffTab();
      return null;
    }
    if (
      !parsed ||
      typeof parsed.storedAt !== 'number' ||
      !Number.isFinite(parsed.storedAt) ||
      typeof parsed.accountScope !== 'string' ||
      typeof parsed.tabId !== 'number' ||
      !Number.isInteger(parsed.tabId) ||
      parsed.tabId < 0 ||
      (parsed.draft !== undefined && typeof parsed.draft !== 'string') ||
      (parsed.deliveredRoute !== undefined && typeof parsed.deliveredRoute !== 'string') ||
      !parsed.delivery
    ) {
      await discardPendingHandoff();
      return null;
    }
    if (shouldSweepPendingHandoff(parsed, Date.now())) {
      await discardPendingHandoff();
      return null;
    }
    const delivery = parsed.delivery;
    const draft = parsed.draft;
    if (parsed.deliveredRoute) deliveredPendingToken = token;
    else if (deliveredPendingToken === token) deliveredPendingToken = null;
    if (delivery.mode === 'inline' && typeof delivery.text === 'string') {
      return {
        delivery,
        draft,
        storedAt: parsed.storedAt,
        accountScope: parsed.accountScope,
        tabId: parsed.tabId,
        deliveredRoute: parsed.deliveredRoute,
      };
    }
    if (
      delivery.mode === 'attachment' &&
      typeof delivery.directive === 'string' &&
      typeof delivery.attachment === 'string' &&
      typeof delivery.filename === 'string'
    ) {
      return {
        delivery,
        draft,
        storedAt: parsed.storedAt,
        accountScope: parsed.accountScope,
        tabId: parsed.tabId,
        deliveredRoute: parsed.deliveredRoute,
      };
    }
    await discardPendingHandoff();
    return null;
  } catch {
    await discardPendingHandoff();
    return null;
  }
}

export function hasDeliveredPendingHandoff(): boolean {
  const token = readPendingTabToken();
  return !!token && token === deliveredPendingToken;
}
