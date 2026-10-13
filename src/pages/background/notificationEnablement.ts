import browser from 'webextension-polyfill';

import { StorageKeys } from '@/core/types/common';
import {
  NOTIFICATION_ENABLEMENT_MESSAGE,
  type NotificationEnablementPayload,
  type NotificationEnablementResult,
} from '@/core/types/notificationEnablement';
import { getVoyagerBuildTarget } from '@/core/utils/browser';
import { hasNotificationsPermission } from '@/core/utils/notificationsPermission';

import { isTrustedExtensionPageSender } from './runtimeMessageRouting';

interface PendingIntent {
  id: string;
  requestedAt: number;
}

// A permission prompt may outlive the popup/worker, but a denied prompt leaves its intent behind:
// a later notifications grant for another feature must not revive it.
export const NOTIFICATION_ENABLEMENT_TTL_MS = 2 * 60 * 1000;

function parseIntent(value: unknown): PendingIntent | null {
  if (!value || typeof value !== 'object') return null;
  const intent = value as Record<string, unknown>;
  return typeof intent.id === 'string' &&
    intent.id.length > 0 &&
    intent.id.length <= 128 &&
    typeof intent.requestedAt === 'number' &&
    Number.isFinite(intent.requestedAt)
    ? { id: intent.id, requestedAt: intent.requestedAt }
    : null;
}

function parsePayload(value: unknown): NotificationEnablementPayload | null {
  if (!value || typeof value !== 'object') return null;
  const payload = value as Record<string, unknown>;
  if (payload.action === 'disable') return { action: 'disable' };
  if (
    payload.action === 'reconcile' &&
    (payload.source === 'startup' || payload.source === 'popup')
  )
    return { action: 'reconcile', source: payload.source };
  if (
    typeof payload.requestId !== 'string' ||
    !payload.requestId.trim() ||
    payload.requestId.length > 128
  )
    return null;
  if (payload.action === 'begin') return { action: 'begin', requestId: payload.requestId };
  if (payload.action === 'finish' && typeof payload.granted === 'boolean')
    return { action: 'finish', requestId: payload.requestId, granted: payload.granted };
  return null;
}

/** Owns completion-notification intent, never the permission prompt or Safari's native path. */
export function createNotificationEnablement() {
  const pendingKey = StorageKeys.RESPONSE_NOTIFICATION_ENABLE_PENDING;
  const enabledKey = StorageKeys.RESPONSE_COMPLETE_NOTIFICATION_ENABLED;
  let revision = 0;
  let latestId: string | null | undefined;
  let queue: Promise<unknown> = Promise.resolve();
  let registered = false;
  let writingDisabled = false;

  const enqueue = <T>(run: () => Promise<T>): Promise<T> => {
    const result = queue.then(run, run);
    queue = result.catch(() => {});
    return result;
  };
  const current = (captured: number): boolean => captured === revision;
  const readIntent = async (): Promise<PendingIntent | null> => {
    const stored = await browser.storage.local.get(pendingKey);
    return parseIntent(stored[pendingKey]);
  };
  const writeIntent = async (intent: PendingIntent | null, captured: number): Promise<void> => {
    if (!current(captured)) return;
    if (intent) await browser.storage.local.set({ [pendingKey]: intent });
    else await browser.storage.local.remove(pendingKey);
  };
  const writeDisabled = async (): Promise<void> => {
    writingDisabled = true;
    try {
      await browser.storage.sync.set({ [enabledKey]: false });
    } finally {
      writingDisabled = false;
    }
  };
  const enabledResult = async (captured: number): Promise<NotificationEnablementResult> => {
    const stored = await browser.storage.sync.get({ [enabledKey]: false });
    if (!current(captured)) return { ok: true };
    return { ok: true, enabled: stored[enabledKey] === true };
  };

  const reconcilePending = async (
    captured: number,
    source: 'startup' | 'popup' | 'grant',
    requiredId?: string,
    granted = true,
  ): Promise<NotificationEnablementResult> => {
    const intent = await readIntent();
    if (!current(captured)) return { ok: true };
    if (!intent || (requiredId !== undefined && intent.id !== requiredId))
      return enabledResult(captured);
    if (latestId !== undefined && intent.id !== latestId) return { ok: true };
    latestId = intent.id;
    const age = Date.now() - intent.requestedAt;
    if (age < 0 || age > NOTIFICATION_ENABLEMENT_TTL_MS) {
      latestId = null;
      await writeIntent(null, captured);
      return enabledResult(captured);
    }
    const permission = granted && (await hasNotificationsPermission());
    // The popup can be gone; a newer disable/request must still beat this late permission read.
    if (!current(captured)) return { ok: true };
    if (!permission) {
      if (!granted || source === 'popup') {
        latestId = null;
        await writeIntent(null, captured);
      }
      return enabledResult(captured);
    }
    await browser.storage.sync.set({ [enabledKey]: true });
    if (!current(captured)) return { ok: true };
    latestId = null;
    await writeIntent(null, captured);
    if (!current(captured)) return { ok: true };
    return { ok: true, enabled: true };
  };

  const reconcile = (): Promise<void> => {
    const captured = revision;
    return enqueue(async () => {
      if (getVoyagerBuildTarget() === 'safari' || !current(captured)) return;
      await reconcilePending(captured, 'startup');
    });
  };
  const run = (payload: NotificationEnablementPayload): Promise<NotificationEnablementResult> => {
    if (payload.action === 'begin') {
      const captured = ++revision;
      latestId = payload.requestId;
      return enqueue(async () => {
        if (!current(captured)) return { ok: true };
        await writeIntent({ id: payload.requestId, requestedAt: Date.now() }, captured);
        if (!current(captured)) return { ok: true };
        // Firefox can grant before its fire-and-forget begin message reaches this worker.
        return reconcilePending(captured, 'grant', payload.requestId);
      });
    }
    if (payload.action === 'disable') {
      const captured = ++revision;
      latestId = null;
      return enqueue(async () => {
        if (!current(captured)) return { ok: true };
        await writeIntent(null, captured);
        if (!current(captured)) return { ok: true };
        await writeDisabled();
        if (!current(captured)) return { ok: true };
        return { ok: true, enabled: false };
      });
    }
    const captured = revision;
    return enqueue(async () => {
      if (!current(captured)) return { ok: true };
      return payload.action === 'finish'
        ? reconcilePending(captured, 'grant', payload.requestId, payload.granted)
        : reconcilePending(captured, payload.source);
    });
  };

  return {
    handle(
      message: { type: string; payload?: unknown },
      sender: chrome.runtime.MessageSender,
    ): Promise<NotificationEnablementResult> | null {
      if (message.type !== NOTIFICATION_ENABLEMENT_MESSAGE) return null;
      const payload = parsePayload(message.payload);
      if (!payload || !isTrustedExtensionPageSender(sender) || getVoyagerBuildTarget() === 'safari')
        return Promise.resolve({ ok: false });
      return run(payload);
    },
    registerListeners(): void {
      if (registered || getVoyagerBuildTarget() === 'safari') return;
      registered = true;
      browser.permissions.onAdded.addListener((permissions) => {
        if (!permissions.permissions?.includes('notifications')) return;
        const captured = revision;
        void enqueue(() => reconcilePending(captured, 'grant')).catch(() => {});
      });
      browser.storage.onChanged.addListener((changes, area) => {
        if (area === 'sync' && changes[enabledKey]?.newValue === false && !writingDisabled) {
          // An off from another settings writer cancels even an in-flight permission check.
          void run({ action: 'disable' }).catch(() => {});
        }
      });
    },
    reconcile,
  };
}
