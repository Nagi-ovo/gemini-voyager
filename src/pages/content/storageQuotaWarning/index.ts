import type { StorageQuotaWarningPayload } from '@/features/storageQuotaWarning/background';
import { getTranslation } from '@/utils/i18n';

const TOAST_ID = 'gv-storage-quota-toast';
const SHOW_CLASS = 'gv-storage-quota-toast--show';
const WARNING_DISMISS_MS = 10_000;
const CRITICAL_DISMISS_MS = 15_000;

let messageListener: ((message: unknown) => void) | null = null;
let dismissTimer: ReturnType<typeof setTimeout> | null = null;
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

function createLucideIcon(name: 'database' | 'x'): SVGSVGElement {
  const namespace = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(namespace, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '2');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  svg.setAttribute('aria-hidden', 'true');

  const paths =
    name === 'database'
      ? [
          ['ellipse', { cx: '12', cy: '5', rx: '9', ry: '3' }],
          ['path', { d: 'M3 5v14a9 3 0 0 0 18 0V5' }],
          ['path', { d: 'M3 12a9 3 0 0 0 18 0' }],
        ]
      : [
          ['path', { d: 'M18 6 6 18' }],
          ['path', { d: 'm6 6 12 12' }],
        ];

  paths.forEach(([tag, attributes]) => {
    const child = document.createElementNS(namespace, tag as string);
    Object.entries(attributes as Record<string, string>).forEach(([key, value]) =>
      child.setAttribute(key, value),
    );
    svg.appendChild(child);
  });
  return svg;
}

function removeToast(): void {
  renderSequence += 1;
  if (dismissTimer) {
    clearTimeout(dismissTimer);
    dismissTimer = null;
  }
  const toast = document.getElementById(TOAST_ID);
  if (!(toast instanceof HTMLElement)) return;
  toast.classList.remove(SHOW_CLASS);
  window.setTimeout(() => {
    if (!toast.classList.contains(SHOW_CLASS)) toast.remove();
  }, 180);
}

async function showStorageQuotaWarning(payload: StorageQuotaWarningPayload): Promise<void> {
  if (!document.body) {
    window.setTimeout(() => void showStorageQuotaWarning(payload), 250);
    return;
  }

  const sequence = ++renderSequence;
  if (dismissTimer) {
    clearTimeout(dismissTimer);
    dismissTimer = null;
  }

  const [title, bodyTemplate, dismissLabel] = await Promise.all([
    getTranslation(payload.level === 'critical' ? 'storageQuotaCritical' : 'storageQuotaAttention'),
    getTranslation('storageQuotaWarningToast'),
    getTranslation('remoteAnnouncementDismiss'),
  ]);
  if (sequence !== renderSequence) return;

  document.getElementById(TOAST_ID)?.remove();
  const toast = document.createElement('div');
  toast.id = TOAST_ID;
  toast.className = `gv-storage-quota-toast gv-storage-quota-toast--${payload.level}`;
  toast.setAttribute('role', payload.level === 'critical' ? 'alert' : 'status');
  toast.setAttribute('aria-live', payload.level === 'critical' ? 'assertive' : 'polite');

  const icon = document.createElement('span');
  icon.className = 'gv-storage-quota-toast__icon';
  icon.appendChild(createLucideIcon('database'));

  const content = document.createElement('div');
  content.className = 'gv-storage-quota-toast__content';
  const heading = document.createElement('div');
  heading.className = 'gv-storage-quota-toast__title';
  heading.textContent = title;
  const body = document.createElement('div');
  body.className = 'gv-storage-quota-toast__body';
  body.textContent = bodyTemplate.replace('{percent}', String(payload.percent));
  content.append(heading, body);

  const dismiss = document.createElement('button');
  dismiss.type = 'button';
  dismiss.className = 'gv-storage-quota-toast__dismiss';
  dismiss.setAttribute('aria-label', dismissLabel);
  dismiss.title = dismissLabel;
  dismiss.appendChild(createLucideIcon('x'));
  dismiss.addEventListener('click', removeToast);

  toast.append(icon, content, dismiss);
  document.body.appendChild(toast);
  if (typeof window.requestAnimationFrame === 'function') {
    window.requestAnimationFrame(() => toast.classList.add(SHOW_CLASS));
  } else {
    window.setTimeout(() => toast.classList.add(SHOW_CLASS), 0);
  }

  if (dismissTimer) clearTimeout(dismissTimer);
  dismissTimer = setTimeout(
    removeToast,
    payload.level === 'critical' ? CRITICAL_DISMISS_MS : WARNING_DISMISS_MS,
  );
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

  messageListener = (message: unknown) => {
    if (typeof message !== 'object' || message === null) return;
    const data = message as { type?: unknown; payload?: unknown };
    if (data.type !== 'gv.storageQuota.warning' || !isWarningPayload(data.payload)) return;
    void showStorageQuotaWarning(data.payload);
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
    removeToast();
  };
}
