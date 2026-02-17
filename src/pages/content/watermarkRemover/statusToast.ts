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
  gap: 10px;
  pointer-events: none;
  max-width: min(380px, calc(100vw - 32px));
  /* Ensure it floats above everything */
  isolation: isolate;
}

.gv-status-toast {
  pointer-events: auto;
  font-family: "Google Sans", Roboto, -apple-system, BlinkMacSystemFont, sans-serif;
  font-size: 14px;
  font-weight: 500;
  line-height: 1.5;
  padding: 12px 16px;
  border-radius: 12px;
  
  /* Light Mode Default */
  background: rgba(255, 255, 255, 0.95);
  color: #1f2937;
  border: 1px solid rgba(226, 232, 240, 0.8);
  box-shadow: 
    0 4px 6px -1px rgba(0, 0, 0, 0.1), 
    0 2px 4px -1px rgba(0, 0, 0, 0.06),
    0 0 0 1px rgba(0,0,0,0.02);
  
  opacity: 0;
  transform: translateY(8px) scale(0.98);
  transition: 
    opacity 200ms cubic-bezier(0.16, 1, 0.3, 1), 
    transform 200ms cubic-bezier(0.16, 1, 0.3, 1),
    background-color 200ms, border-color 200ms, color 200ms;
    
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
  
  display: flex;
  align-items: center;
  gap: 12px;
  width: fit-content;
}

.gv-status-toast.show {
  opacity: 1;
  transform: translateY(0) scale(1);
}

/* Status Indicators via Left Border & Emoji */
.gv-status-toast--info {
  border-left: 4px solid #3b82f6; 
}
.gv-status-toast--info::before {
  content: "ℹ️";
}

.gv-status-toast--warning {
  border-left: 4px solid #f59e0b;
}
.gv-status-toast--warning::before {
  content: "⚠️";
}

.gv-status-toast--success {
  border-left: 4px solid #22c55e;
}
.gv-status-toast--success::before {
  content: "✅";
}

.gv-status-toast--error {
  border-left: 4px solid #ef4444;
}
.gv-status-toast--error::before {
  content: "❌";
}

/* Dark Mode Support (System & Class-based) */
@media (prefers-color-scheme: dark) {
  .gv-status-toast {
    background: rgba(30, 41, 59, 0.95);
    color: #f1f5f9;
    border-color: rgba(51, 65, 85, 0.8);
    box-shadow: 
      0 10px 15px -3px rgba(0, 0, 0, 0.5), 
      0 4px 6px -4px rgba(0, 0, 0, 0.5),
      0 0 0 1px rgba(255,255,255,0.05);
  }
}

/* Explicit .dark class support (if Gemini adds it to body) */
body.dark .gv-status-toast, 
html.dark .gv-status-toast {
  background: rgba(30, 41, 59, 0.95);
  color: #f1f5f9;
  border-color: rgba(51, 65, 85, 0.8);
  box-shadow: 
    0 10px 15px -3px rgba(0, 0, 0, 0.5), 
    0 4px 6px -4px rgba(0, 0, 0, 0.5),
    0 0 0 1px rgba(255,255,255,0.05);
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
