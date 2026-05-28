export type StatusToastLevel = 'info' | 'warning' | 'success' | 'error';

type ToastRecord = {
  id: string;
  element: HTMLDivElement;
  isFinal: boolean;
  timeoutId: ReturnType<typeof setTimeout> | null;
};

type ToastOptions = {
  autoDismissMs?: number;
  pending?: boolean;
  markFinal?: boolean;
};

export type StatusToastManager = {
  addToast: (message: string, level: StatusToastLevel, options?: ToastOptions) => string;
  removeToast: (id: string) => boolean;
  updateToast: (
    id: string,
    message: string,
    level: StatusToastLevel,
    options?: ToastOptions,
  ) => boolean;
  updateLatestPending: (
    message: string,
    level: StatusToastLevel,
    options?: ToastOptions,
  ) => boolean;
  setAnchorElement: (element: HTMLElement | null) => void;
  getToastElements: () => HTMLDivElement[];
};

type StatusToastManagerOptions = {
  containerId?: string;
  anchorTtlMs?: number;
  maxToasts?: number;
};

const STYLE_ID = 'gv-status-toast-style';
const DEFAULT_CONTAINER_ID = 'gv-status-toast-container';
const LEVEL_CLASSES: StatusToastLevel[] = ['info', 'warning', 'success', 'error'];

export function createStatusToastManager(
  options: StatusToastManagerOptions = {},
): StatusToastManager {
  const containerId = options.containerId ?? DEFAULT_CONTAINER_ID;
  const anchorTtlMs = options.anchorTtlMs ?? 8000;
  const maxToasts = options.maxToasts ?? 4;
  const toasts: ToastRecord[] = [];
  let anchorElement: HTMLElement | null = null;
  let anchorUpdatedAt = 0;
  let positionRaf: number | null = null;

  const ensureStyles = (): void => {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
.gv-status-toast-container {
  position: fixed;
  z-index: 2147483647;
  display: flex;
  flex-direction: column;
  gap: 6px;
  pointer-events: none;
  max-width: min(340px, calc(100vw - 32px));
  isolation: isolate;
}

.gv-status-toast {
  pointer-events: auto;
  font-family: "Google Sans Text", "Google Sans", Roboto, -apple-system,
    BlinkMacSystemFont, "Segoe UI", sans-serif;
  font-size: 13px;
  font-weight: 450;
  line-height: 1.45;
  letter-spacing: -0.005em;
  padding: 9px 13px 9px 11px;
  border-radius: 12px;
  display: flex;
  align-items: center;
  gap: 9px;
  width: fit-content;
  cursor: default;

  /* Light defaults — matches --timeline-tooltip-* tokens */
  background: rgba(255, 255, 255, 0.86);
  color: #0f172a;
  border: 1px solid rgba(226, 232, 240, 0.72);
  box-shadow:
    0 12px 32px rgba(2, 8, 23, 0.10),
    0 2px 6px rgba(2, 8, 23, 0.05);
  backdrop-filter: blur(10px) saturate(140%);
  -webkit-backdrop-filter: blur(10px) saturate(140%);

  opacity: 0;
  transform: translateY(4px) scale(0.985);
  transition:
    opacity 180ms cubic-bezier(0.16, 1, 0.3, 1),
    transform 180ms cubic-bezier(0.16, 1, 0.3, 1),
    background-color 180ms, border-color 180ms, color 180ms;
}

.gv-status-toast.show {
  opacity: 1;
  transform: translateY(0) scale(1);
}

/* Status indicator: a small 6px dot (replaces the bright left border + emoji) */
.gv-status-toast::before {
  content: "";
  flex: 0 0 auto;
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: #94a3b8; /* slate-400 — neutral default */
}

/**
 * Dot colors are phase-coded, not just level-coded, so adjacent toasts in the
 * download → process → success flow are visually distinct at a glance:
 *   • info (passive, just reporting)   → slate-400 grey
 *   • info + pending (active compute)  → sky-500 cool blue
 *   • warning (caution)                → amber
 *   • success                          → emerald (project's timeline-active)
 *   • error                            → red
 */
.gv-status-toast--info::before {
  background: #94a3b8;
}
.gv-status-toast--warning::before {
  background: #f59e0b; /* matches --timeline-star-color */
}
.gv-status-toast--success::before {
  background: oklch(0.55 0.17 155); /* matches --timeline-dot-active-color */
}
.gv-status-toast--error::before {
  background: #dc2626;
}

/* Pending: cool-blue accent + soft pulse to signal in-progress compute.
 * Selector doubled (.gv-status-toast.gv-status-toast--pending) to win
 * over the dark-theme info-override that follows below. */
@keyframes gv-status-toast-pulse {
  0%, 100% { opacity: 0.55; transform: scale(1); }
  50%      { opacity: 1;    transform: scale(1.3); }
}
.gv-status-toast.gv-status-toast--pending::before {
  background: #0ea5e9; /* sky-500 — distinct from passive slate info */
  animation: gv-status-toast-pulse 1.4s cubic-bezier(0.4, 0, 0.6, 1) infinite;
}

/* Dark theme — system preference. Dot override is scoped to --info only so
 * warning/success/error/pending dots keep their level color. */
@media (prefers-color-scheme: dark) {
  .gv-status-toast {
    background: rgba(11, 18, 32, 0.82);
    color: #e2e8f0;
    border-color: rgba(31, 41, 55, 0.78);
    box-shadow:
      0 12px 32px rgba(0, 0, 0, 0.40),
      0 2px 6px rgba(0, 0, 0, 0.22);
  }
  .gv-status-toast--info::before {
    background: #64748b; /* slate-500 — slightly cooler grey in dark */
  }
}

/* Dark theme — Gemini's class (covers html, body, theme-host placements) */
html.dark-theme .gv-status-toast,
body.dark-theme .gv-status-toast,
.theme-host.dark-theme .gv-status-toast {
  background: rgba(11, 18, 32, 0.82);
  color: #e2e8f0;
  border-color: rgba(31, 41, 55, 0.78);
  box-shadow:
    0 12px 32px rgba(0, 0, 0, 0.40),
    0 2px 6px rgba(0, 0, 0, 0.22);
}
html.dark-theme .gv-status-toast--info::before,
body.dark-theme .gv-status-toast--info::before,
.theme-host.dark-theme .gv-status-toast--info::before {
  background: #64748b;
}

/* Light theme — Gemini's class (force-light override) */
html.light-theme .gv-status-toast,
body.light-theme .gv-status-toast,
.theme-host.light-theme .gv-status-toast {
  background: rgba(255, 255, 255, 0.86);
  color: #0f172a;
  border-color: rgba(226, 232, 240, 0.72);
  box-shadow:
    0 12px 32px rgba(2, 8, 23, 0.10),
    0 2px 6px rgba(2, 8, 23, 0.05);
}
`;
    document.head.appendChild(style);
  };

  const ensureContainer = (): HTMLDivElement => {
    const existing = document.getElementById(containerId);
    if (existing instanceof HTMLDivElement) return existing;
    const container = document.createElement('div');
    container.id = containerId;
    container.className = 'gv-status-toast-container';
    document.body.appendChild(container);
    return container;
  };

  const getAnchorRect = (): DOMRect | null => {
    if (!anchorElement || !anchorElement.isConnected) return null;
    if (Date.now() - anchorUpdatedAt > anchorTtlMs) return null;
    return anchorElement.getBoundingClientRect();
  };

  const schedulePositionUpdate = (): void => {
    if (positionRaf !== null) return;
    positionRaf = window.requestAnimationFrame(() => {
      positionRaf = null;
      positionContainer();
    });
  };

  const positionContainer = (): void => {
    const container = ensureContainer();
    const anchorRect = getAnchorRect();
    if (!anchorRect) {
      container.style.right = '24px';
      container.style.bottom = '80px';
      container.style.left = 'auto';
      container.style.top = 'auto';
      return;
    }

    const rect = container.getBoundingClientRect();
    const estimatedToastHeight = 52;
    const width = rect.width || container.offsetWidth || 300;
    const height =
      rect.height ||
      container.offsetHeight ||
      Math.max(
        estimatedToastHeight,
        toasts.length * estimatedToastHeight + (toasts.length - 1) * 10,
      );
    const gap = 14;
    const padding = 12;

    let left = anchorRect.right + gap;
    if (left + width + padding > window.innerWidth) {
      left = anchorRect.left - gap - width;
    }
    left = Math.max(padding, Math.min(left, window.innerWidth - width - padding));

    const anchorCenterY = anchorRect.top + anchorRect.height / 2;
    let top = anchorCenterY - height / 2;
    top = Math.max(padding, Math.min(top, window.innerHeight - height - padding));

    container.style.left = `${left}px`;
    container.style.top = `${top}px`;
    container.style.right = 'auto';
    container.style.bottom = 'auto';
  };

  const applyLevelClass = (element: HTMLElement, level: StatusToastLevel): void => {
    element.classList.remove(...LEVEL_CLASSES.map((value) => `gv-status-toast--${value}`));
    element.classList.add(`gv-status-toast--${level}`);
  };

  const removeToast = (toast: ToastRecord): void => {
    if (toast.timeoutId) {
      clearTimeout(toast.timeoutId);
      toast.timeoutId = null;
    }
    toast.element.remove();
    const index = toasts.findIndex((item) => item.id === toast.id);
    if (index >= 0) {
      toasts.splice(index, 1);
    }
    schedulePositionUpdate();
  };

  const scheduleDismiss = (toast: ToastRecord, autoDismissMs: number): void => {
    if (toast.timeoutId) clearTimeout(toast.timeoutId);
    toast.timeoutId = setTimeout(() => removeToast(toast), autoDismissMs);
  };

  const addToast = (
    message: string,
    level: StatusToastLevel,
    options: ToastOptions = {},
  ): string => {
    ensureStyles();
    const container = ensureContainer();

    const toast = document.createElement('div');
    toast.className = 'gv-status-toast';
    if (options.pending) {
      toast.classList.add('gv-status-toast--pending');
    }
    toast.textContent = message;
    applyLevelClass(toast, level);
    container.appendChild(toast);

    const id = `gv-toast-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const record: ToastRecord = {
      id,
      element: toast,
      isFinal: options.pending ? false : true,
      timeoutId: null,
    };
    toasts.push(record);
    toast.addEventListener('click', () => removeToast(record));

    if (toasts.length > maxToasts) {
      removeToast(toasts[0]);
    }

    window.requestAnimationFrame(() => toast.classList.add('show'));
    schedulePositionUpdate();

    if (options.autoDismissMs && options.autoDismissMs > 0) {
      scheduleDismiss(record, options.autoDismissMs);
    }
    return id;
  };

  const removeToastById = (id: string): boolean => {
    const record = toasts.find((toast) => toast.id === id);
    if (!record) return false;
    removeToast(record);
    return true;
  };

  const updateToast = (
    id: string,
    message: string,
    level: StatusToastLevel,
    options: ToastOptions = {},
  ): boolean => {
    const record = toasts.find((toast) => toast.id === id);
    if (!record) return false;
    record.element.textContent = message;
    applyLevelClass(record.element, level);
    if (options.markFinal) {
      record.isFinal = true;
      record.element.classList.remove('gv-status-toast--pending');
    }
    if (options.autoDismissMs && options.autoDismissMs > 0) {
      scheduleDismiss(record, options.autoDismissMs);
    }
    schedulePositionUpdate();
    return true;
  };

  const updateLatestPending = (
    message: string,
    level: StatusToastLevel,
    options: ToastOptions = {},
  ): boolean => {
    const record = [...toasts].reverse().find((toast) => !toast.isFinal);
    if (!record) return false;

    record.element.textContent = message;
    applyLevelClass(record.element, level);
    if (options.markFinal) {
      record.isFinal = true;
      record.element.classList.remove('gv-status-toast--pending');
    }
    if (options.autoDismissMs && options.autoDismissMs > 0) {
      scheduleDismiss(record, options.autoDismissMs);
    }
    schedulePositionUpdate();
    return true;
  };

  const setAnchorElement = (element: HTMLElement | null): void => {
    if (!element) return;
    anchorElement = element;
    anchorUpdatedAt = Date.now();
    schedulePositionUpdate();
  };

  return {
    addToast,
    removeToast: removeToastById,
    updateToast,
    updateLatestPending,
    setAnchorElement,
    getToastElements: () => toasts.map((toast) => toast.element),
  };
}
