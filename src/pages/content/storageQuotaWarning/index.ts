import { createToaster } from '@/core/ui/toast/toaster';
import type { Toaster } from '@/core/ui/toast/types';
import type { StorageQuotaWarningPayload } from '@/features/storageQuotaWarning/background';
import { getTranslation } from '@/utils/i18n';

const CHANNEL = 'storage-quota';
const WARNING_DISMISS_MS = 10_000;
const CRITICAL_DISMISS_MS = 15_000;

let messageListener: ((message: unknown) => void) | null = null;
let renderSequence = 0;

function isWarningPayload(value: unknown): value is StorageQuotaWarningPayload {
  if (typeof value !== 'object' || value === null) return false;
  const payload = value as Partial<StorageQuotaWarningPayload>;
  return (
    (payload.level === 'warning' || payload.level === 'critical') &&
    typeof payload.percent === 'number' &&
    Number.isFinite(payload.percent)
  );
}

async function showStorageQuotaWarning(
  owner: Toaster,
  payload: StorageQuotaWarningPayload,
): Promise<void> {
  // A newer warning, or a stop, supersedes this one while its strings load.
  const sequence = ++renderSequence;
  const critical = payload.level === 'critical';
  const [title, bodyTemplate, dismissLabel] = await Promise.all([
    getTranslation(critical ? 'storageQuotaCritical' : 'storageQuotaAttention'),
    getTranslation('storageQuotaWarningToast'),
    getTranslation('remoteAnnouncementDismiss'),
  ]);
  if (sequence !== renderSequence) return;

  owner.show({
    channel: CHANNEL,
    title,
    message: bodyTemplate.replace('{percent}', String(payload.percent)),
    tone: critical ? 'error' : 'warning',
    dismissLabel,
    onDismiss: () => {
      // Dismissing the visible warning also cancels a replacement whose strings are still loading.
      renderSequence += 1;
    },
    durationMs: critical ? CRITICAL_DISMISS_MS : WARNING_DISMISS_MS,
  });
}

function notifyReady(): void {
  if (document.visibilityState !== 'visible') return;
  try {
    const request = chrome.runtime?.sendMessage?.({ type: 'gv.storageQuota.ready' });
    if (request) void request.catch(() => undefined);
  } catch {
    // Extension reloads should not affect the host page.
  }
}

export function startStorageQuotaWarningToast(): () => void {
  if (messageListener) return () => {};

  const owner = createToaster();
  messageListener = (message: unknown) => {
    if (typeof message !== 'object' || message === null) return;
    const data = message as { type?: unknown; payload?: unknown };
    if (data.type !== 'gv.storageQuota.warning' || !isWarningPayload(data.payload)) return;
    void showStorageQuotaWarning(owner, data.payload);
  };
  chrome.runtime?.onMessage?.addListener?.(messageListener);
  document.addEventListener('visibilitychange', notifyReady);
  notifyReady();

  return () => {
    if (messageListener) {
      try {
        chrome.runtime?.onMessage?.removeListener?.(messageListener);
      } catch {
        // Context may already be invalidated.
      }
      messageListener = null;
    }
    document.removeEventListener('visibilitychange', notifyReady);
    renderSequence += 1;
    owner.destroy();
  };
}
