import { isExtensionContextInvalidatedError } from '@/core/utils/extensionContext';
import type { PresentedRemoteAnnouncement } from '@/features/announcements';

const CONTAINER_ID = 'gv-remote-announcement';
const SHOW_CLASS = 'gv-remote-announcement--show';
const DEFAULT_TITLE_KEY = 'remoteAnnouncementDefaultTitle';
const OPEN_KEY = 'remoteAnnouncementOpen';
const DISMISS_KEY = 'remoteAnnouncementDismiss';
const DEFAULT_TITLE_FALLBACK = 'Voyager announcement';
const OPEN_FALLBACK = 'Open';
const DISMISS_FALLBACK = 'Dismiss';

let messageListener:
  | ((message: unknown, sender: chrome.runtime.MessageSender, sendResponse: () => void) => void)
  | null = null;
let currentAnnouncementId: string | null = null;

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

function removeAnnouncement(): void {
  currentAnnouncementId = null;
  const existing = document.getElementById(CONTAINER_ID);
  if (!(existing instanceof HTMLElement)) return;
  existing.classList.remove(SHOW_CLASS);
  window.setTimeout(() => existing.remove(), 180);
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

function createAnnouncementElement(announcement: PresentedRemoteAnnouncement): HTMLDivElement {
  const container = document.createElement('div');
  container.id = CONTAINER_ID;
  container.className = `gv-remote-announcement gv-remote-announcement--${announcement.level}`;
  container.setAttribute('role', 'status');
  container.setAttribute('aria-live', announcement.level === 'critical' ? 'assertive' : 'polite');

  const content = document.createElement('div');
  content.className = 'gv-remote-announcement__content';

  const title = document.createElement('div');
  title.className = 'gv-remote-announcement__title';
  title.textContent =
    announcement.title || getI18nMessage(DEFAULT_TITLE_KEY, DEFAULT_TITLE_FALLBACK);

  const body = document.createElement('div');
  body.className = 'gv-remote-announcement__body';
  body.textContent = announcement.body;

  content.appendChild(title);
  content.appendChild(body);

  const actions = document.createElement('div');
  actions.className = 'gv-remote-announcement__actions';

  if (announcement.link) {
    const link = document.createElement('button');
    link.type = 'button';
    link.className = 'gv-remote-announcement__link';
    link.textContent = announcement.linkLabel || getI18nMessage(OPEN_KEY, OPEN_FALLBACK);
    link.addEventListener('click', () => {
      window.open(announcement.link, '_blank', 'noopener,noreferrer');
      void acknowledge(announcement.id);
      removeAnnouncement();
    });
    actions.appendChild(link);
  }

  if (!announcement.requiresAction) {
    const dismiss = document.createElement('button');
    dismiss.type = 'button';
    dismiss.className = 'gv-remote-announcement__dismiss';
    dismiss.textContent = getI18nMessage(DISMISS_KEY, DISMISS_FALLBACK);
    dismiss.addEventListener('click', () => {
      void acknowledge(announcement.id);
      removeAnnouncement();
    });
    actions.appendChild(dismiss);
  }

  container.appendChild(content);
  container.appendChild(actions);
  return container;
}

function showAnnouncement(announcement: PresentedRemoteAnnouncement): void {
  if (!document.body) {
    window.setTimeout(() => showAnnouncement(announcement), 250);
    return;
  }

  if (currentAnnouncementId === announcement.id && document.getElementById(CONTAINER_ID)) return;
  document.getElementById(CONTAINER_ID)?.remove();
  currentAnnouncementId = announcement.id;
  const element = createAnnouncementElement(announcement);
  document.body.appendChild(element);
  window.requestAnimationFrame(() => element.classList.add(SHOW_CLASS));
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
    removeAnnouncement();
  };
}
