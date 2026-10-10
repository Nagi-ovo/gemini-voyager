interface ChartFullscreenOptions {
  prefix: string;
  body: HTMLElement;
  closeLabel: string;
  hint: string;
  dialogLabel?: string;
  panZoom?: {
    content: HTMLElement;
    labels: readonly [string, string, string];
    fit: () => number | null;
  };
  onReveal?: () => void;
  onDestroy?: () => void;
}

/** Owns the modal's DOM, gestures, focus, listeners and delayed removal. */
export function createChartFullscreen() {
  let currentModal: HTMLElement | null = null;
  let destroyActive: (() => void) | null = null;

  function open(build: () => ChartFullscreenOptions): void {
    if (currentModal) return;
    const previousFocus =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const options = build();
    const { prefix, body, panZoom, dialogLabel } = options;
    const modal = document.createElement('div');
    modal.className = `${prefix}-modal`;
    if (dialogLabel !== undefined) {
      modal.setAttribute('role', 'dialog');
      modal.setAttribute('aria-modal', 'true');
      modal.setAttribute('aria-label', dialogLabel);
    }
    const toolbar = document.createElement('div');
    toolbar.className = `${prefix}-modal-toolbar`;
    const button = (text: string, title: string) => {
      const element = document.createElement('button');
      element.textContent = text;
      element.title = title;
      toolbar.appendChild(element);
      return element;
    };

    const viewport = panZoom
      ? {
          ...panZoom,
          zoomIn: button('+', panZoom.labels[0]),
          zoomOut: button('−', panZoom.labels[1]),
          reset: button('⊙', panZoom.labels[2]),
        }
      : null;
    const closeButton = button('✕', options.closeLabel);
    if (dialogLabel !== undefined) {
      closeButton.type = 'button';
      closeButton.setAttribute('aria-label', options.closeLabel);
    }
    const hint = document.createElement('div');
    hint.className = `${prefix}-modal-hint`;
    hint.textContent = options.hint;
    modal.append(toolbar, body, hint);
    document.body.appendChild(modal);
    currentModal = modal;

    const listeners: Array<() => void> = [];
    const on = <K extends keyof DocumentEventMap>(
      target: EventTarget,
      type: K,
      handler: (event: DocumentEventMap[K]) => void,
      listenerOptions?: AddEventListenerOptions,
    ) => {
      const listener = handler as EventListener;
      target.addEventListener(type, listener, listenerOptions);
      listeners.push(() => target.removeEventListener(type, listener, listenerOptions));
    };
    const removeListeners = () => {
      listeners.splice(0).forEach((remove) => remove());
    };

    let scale = 1;
    let initialScale = 1;
    let translateX = 0;
    let translateY = 0;
    let dragging = false;
    let startX = 0;
    let startY = 0;
    const applyTransform = () => {
      if (viewport) {
        viewport.content.style.transform = `translate(${translateX}px, ${translateY}px) scale(${scale})`;
      }
    };
    const endDrag = () => {
      dragging = false;
      viewport?.content.classList.remove('dragging');
    };

    let closing = false;
    let closeTimer: ReturnType<typeof setTimeout> | null = null;
    let revealFrame: number | null = null;
    const destroy = () => {
      if (closeTimer !== null) clearTimeout(closeTimer);
      if (revealFrame !== null) cancelAnimationFrame(revealFrame);
      removeListeners();
      endDrag();
      modal.remove();
      currentModal = null;
      destroyActive = null;
      options.onDestroy?.();
      if (dialogLabel !== undefined && previousFocus?.isConnected) {
        previousFocus.focus({ preventScroll: true });
      }
    };
    const close = () => {
      if (closing) return;
      closing = true;
      removeListeners();
      endDrag();
      modal.classList.remove('visible');
      closeTimer = setTimeout(destroy, 300);
    };
    destroyActive = destroy;
    on(closeButton, 'click', close);
    on(modal, 'click', (event) => {
      if (event.target === modal) close();
    });
    on(document, 'keydown', (event) => {
      if (event.key === 'Escape') close();
      if (dialogLabel !== undefined && event.key === 'Tab') {
        event.preventDefault();
        closeButton.focus({ preventScroll: true });
      }
    });
    if (dialogLabel !== undefined) {
      on(document, 'focusin', (event) => {
        if (!modal.contains(event.target as Node)) closeButton.focus({ preventScroll: true });
      });
      closeButton.focus({ preventScroll: true });
    }

    if (viewport) {
      on(viewport.zoomIn, 'click', () => {
        scale = Math.min(scale * 1.2, 10);
        applyTransform();
      });
      on(viewport.zoomOut, 'click', () => {
        scale = Math.max(scale / 1.2, 0.1);
        applyTransform();
      });
      on(viewport.reset, 'click', () => {
        scale = initialScale;
        translateX = 0;
        translateY = 0;
        applyTransform();
      });
      on(
        modal,
        'wheel',
        (event) => {
          event.preventDefault();
          scale = event.deltaY < 0 ? Math.min(scale * 1.1, 10) : Math.max(scale / 1.1, 0.1);
          applyTransform();
        },
        { passive: false },
      );
      on(viewport.content, 'mousedown', (event) => {
        dragging = true;
        startX = event.clientX - translateX;
        startY = event.clientY - translateY;
        viewport.content.classList.add('dragging');
      });
      on(document, 'mousemove', (event) => {
        if (!dragging) return;
        translateX = event.clientX - startX;
        translateY = event.clientY - startY;
        applyTransform();
      });
      on(document, 'mouseup', endDrag);
      const fitScale = viewport.fit();
      if (fitScale !== null) {
        scale = initialScale = fitScale;
        applyTransform();
      }
    }

    revealFrame = requestAnimationFrame(() => {
      revealFrame = null;
      options.onReveal?.();
      modal.classList.add('visible');
    });
  }

  return {
    open,
    close() {
      destroyActive?.();
    },
    get modal() {
      return currentModal;
    },
  };
}
