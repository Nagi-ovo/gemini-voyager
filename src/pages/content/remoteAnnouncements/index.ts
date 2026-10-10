import { createToaster } from '@/core/ui/toast/toaster';
import type { Toaster } from '@/core/ui/toast/types';
import { isExtensionContextInvalidatedError } from '@/core/utils/extensionContext';
import type { PresentedRemoteAnnouncement } from '@/features/announcements';

const CHANNEL = 'remote-announcement';
const TONE = { info: 'info', warning: 'warning', critical: 'error' } as const;
const DEFAULT_TITLE_KEY = 'remoteAnnouncementDefaultTitle';
const OPEN_KEY = 'remoteAnnouncementOpen';
const DISMISS_KEY = 'remoteAnnouncementDismiss';
const DEFAULT_TITLE_FALLBACK = 'Voyager announcement';
const OPEN_FALLBACK = 'Open';
const DISMISS_FALLBACK = 'Dismiss';

let messageListener:
  | ((message: unknown, sender: chrome.runtime.MessageSender, sendResponse: () => void) => void)
  | null = null;
let toaster: Toaster | null = null;

function getI18nMessage(key: string, fallback: string): string {
  try {
    return chrome.i18n?.getMessage?.(key) || fallback;
  } catch {
    return fallback;
  }
}

function normalizeAnnouncements(value: unknown): PresentedRemoteAnnouncement[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is PresentedRemoteAnnouncement => {
    if (typeof item !== 'object' || item === null) return false;
    const record = item as Partial<PresentedRemoteAnnouncement>;
    return (
      typeof record.id === 'string' &&
      typeof record.title === 'string' &&
      typeof record.body === 'string' &&
      typeof record.createdAt === 'number' &&
      (record.level === 'info' || record.level === 'warning' || record.level === 'critical') &&
      (typeof record.requiresAction === 'undefined' || typeof record.requiresAction === 'boolean')
    );
  });
}

async function acknowledge(id: string): Promise<void> {
  try {
    await chrome.runtime?.sendMessage?.({
      type: 'gv.remoteAnnouncement.ack',
      payload: { id },
    });
  } catch (error) {
    if (!isExtensionContextInvalidatedError(error)) {
      // Silent fallback: announcement UI should never disrupt the host page.
    }
  }
}

/** One announcement at a time; it stays until the user acts on it or dismisses it. */
function showAnnouncement(announcement: PresentedRemoteAnnouncement): void {
  const link = announcement.link;
  toaster?.show({
    channel: CHANNEL,
    title: announcement.title || getI18nMessage(DEFAULT_TITLE_KEY, DEFAULT_TITLE_FALLBACK),
    message: announcement.body,
    tone: TONE[announcement.level],
    durationMs: null,
    action: link
      ? {
          label: announcement.linkLabel || getI18nMessage(OPEN_KEY, OPEN_FALLBACK),
          run: (handle) => {
            window.open(link, '_blank', 'noopener,noreferrer');
            void acknowledge(announcement.id);
            handle.dismiss();
          },
        }
      : undefined,
    dismissLabel: announcement.requiresAction
      ? undefined
      : getI18nMessage(DISMISS_KEY, DISMISS_FALLBACK),
    onDismiss: () => void acknowledge(announcement.id),
  });
}

function showFirstPending(announcements: readonly PresentedRemoteAnnouncement[]): void {
  const [announcement] = announcements;
  if (announcement) showAnnouncement(announcement);
}

async function readPendingAnnouncements(): Promise<void> {
  try {
    const response = (await chrome.runtime?.sendMessage?.({
      type: 'gv.remoteAnnouncement.getPending',
    })) as { ok?: boolean; announcements?: unknown } | undefined;
    if (response?.ok) showFirstPending(normalizeAnnouncements(response.announcements));
  } catch (error) {
    if (!isExtensionContextInvalidatedError(error)) {
      // Silent by design.
    }
  }
}

export function startRemoteAnnouncements(): () => void {
  if (messageListener) return () => {};

  toaster = createToaster();
  messageListener = (message: unknown) => {
    if (typeof message !== 'object' || message === null) return;
    const data = message as { type?: unknown; payload?: { announcements?: unknown } };
    if (data.type !== 'gv.remoteAnnouncement.show') return;
    showFirstPending(normalizeAnnouncements(data.payload?.announcements));
  };

  chrome.runtime?.onMessage?.addListener?.(messageListener);
  void readPendingAnnouncements();

  return () => {
    if (messageListener) {
      try {
        chrome.runtime?.onMessage?.removeListener?.(messageListener);
      } catch {
        // Context may already be gone.
      }
      messageListener = null;
    }
    toaster?.destroy();
    toaster = null;
  };
}
