import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { startStorageQuotaWarningToast } from './index';

vi.mock('@/utils/i18n', () => ({
  getTranslation: vi.fn(async (key: string) => {
    const messages: Record<string, string> = {
      storageQuotaAttention: 'Near limit',
      storageQuotaCritical: 'Almost full',
      storageQuotaWarningToast: 'Voyager storage is {percent}% full.',
      remoteAnnouncementDismiss: 'Dismiss',
    };
    return messages[key] ?? key;
  }),
}));

let cleanup: (() => void) | null = null;

beforeEach(() => {
  vi.clearAllMocks();
  document.body.innerHTML = '';
  Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' });
});

afterEach(() => {
  cleanup?.();
  cleanup = null;
  vi.useRealTimers();
});

function getMessageListener(): (message: unknown) => void {
  const addListener = chrome.runtime.onMessage.addListener as unknown as ReturnType<typeof vi.fn>;
  return addListener.mock.calls.at(-1)?.[0] as (message: unknown) => void;
}

describe('storage quota warning toast', () => {
  it('registers the current tab and renders a warning message', async () => {
    cleanup = startStorageQuotaWarningToast();
    expect(chrome.runtime.sendMessage).toHaveBeenCalledWith({ type: 'gv.storageQuota.ready' });

    getMessageListener()({
      type: 'gv.storageQuota.warning',
      payload: { level: 'warning', percent: 82 },
    });

    await vi.waitFor(() => {
      expect(document.querySelector('.gv-storage-quota-toast--warning')).not.toBeNull();
    });
    expect(document.getElementById('gv-storage-quota-toast')?.textContent).toContain('82%');
    expect(document.getElementById('gv-storage-quota-toast')?.textContent).toContain('Near limit');
  });

  it('replaces an existing warning with the critical state and supports dismissal', async () => {
    cleanup = startStorageQuotaWarningToast();
    const listener = getMessageListener();
    listener({
      type: 'gv.storageQuota.warning',
      payload: { level: 'warning', percent: 82 },
    });
    await vi.waitFor(() =>
      expect(document.getElementById('gv-storage-quota-toast')).not.toBeNull(),
    );

    listener({
      type: 'gv.storageQuota.warning',
      payload: { level: 'critical', percent: 96 },
    });
    await vi.waitFor(() => {
      expect(document.querySelector('.gv-storage-quota-toast--critical')).not.toBeNull();
    });
    expect(document.getElementById('gv-storage-quota-toast')?.textContent).toContain('Almost full');

    const dismiss = document.querySelector<HTMLButtonElement>('.gv-storage-quota-toast__dismiss');
    dismiss?.click();
    expect(document.getElementById('gv-storage-quota-toast')?.classList).not.toContain(
      'gv-storage-quota-toast--show',
    );
  });
});
