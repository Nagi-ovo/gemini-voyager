type ExportToastOptions = {
  autoDismissMs?: number;
};

const TOAST_SELECTOR = '.gv-export-toast';
const TOAST_TRANSITION_MS = 300;
const DEFAULT_AUTO_DISMISS_MS = 2200;

let dismissTimer: ReturnType<typeof setTimeout> | null = null;

function getOrCreateToast(): HTMLDivElement {
  const existing = document.querySelector(TOAST_SELECTOR);
  if (existing instanceof HTMLDivElement) {
    return existing;
  }

  const toast = document.createElement('div');
  toast.className = 'gv-notification gv-notification-info gv-export-toast';
  document.body.appendChild(toast);
  return toast;
}

export function showExportToast(message: string, options?: ExportToastOptions): void {
  if (!message) return;

  const toast = getOrCreateToast();
  toast.textContent = message;
  toast.classList.add('show');

  if (dismissTimer) {
    clearTimeout(dismissTimer);
    dismissTimer = null;
  }

  const autoDismissMs = Math.max(options?.autoDismissMs ?? DEFAULT_AUTO_DISMISS_MS, 0);
  dismissTimer = setTimeout(() => {
    toast.classList.remove('show');
    setTimeout(() => {
      if (!toast.classList.contains('show')) {
        toast.remove();
      }
    }, TOAST_TRANSITION_MS);
  }, autoDismissMs);
}
