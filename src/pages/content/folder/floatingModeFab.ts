import { getTranslationSyncUnsafe } from '@/utils/i18n';

export const FLOATING_FAB_CLASS = 'gv-floating-fab';

const FAB_DIAMETER = 52;
const MIN_MARGIN = 8;
const DRAG_MOVE_THRESHOLD = 4; // px — below this we treat pointerup as a click, not a drag

export type FloatingFabPos = { x: number; y: number };

type MountArgs = {
  onClick: () => void;
  storedPos?: FloatingFabPos | null;
  onPosChange?: (pos: FloatingFabPos) => void;
};

function clampPos(pos: FloatingFabPos): FloatingFabPos {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  return {
    x: Math.max(MIN_MARGIN, Math.min(pos.x, Math.max(MIN_MARGIN, vw - FAB_DIAMETER - MIN_MARGIN))),
    y: Math.max(MIN_MARGIN, Math.min(pos.y, Math.max(MIN_MARGIN, vh - FAB_DIAMETER - MIN_MARGIN))),
  };
}

function defaultPos(): FloatingFabPos {
  return {
    x: Math.max(MIN_MARGIN, window.innerWidth - FAB_DIAMETER - 24),
    y: Math.max(MIN_MARGIN, window.innerHeight - FAB_DIAMETER - 24),
  };
}

/**
 * Mounts the persistent floating-mode re-entry button. Draggable (pointer),
 * position persists via `onPosChange`, idempotent.
 */
export function mountFloatingFab({
  onClick,
  storedPos,
  onPosChange,
}: MountArgs): HTMLElement | null {
  const existing = document.querySelector(`.${FLOATING_FAB_CLASS}`);
  if (existing) return existing as HTMLElement;

  const label = getTranslationSyncUnsafe('floatingFabLabel');

  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = FLOATING_FAB_CLASS;
  btn.setAttribute('aria-label', label);
  btn.title = label;
  // Composition: halo ring for an ambient glow, inner body for the icon, icon
  // itself. Separated so we can animate hover on the inner and the halo
  // independently without layout shifts.
  btn.innerHTML = `
    <span class="${FLOATING_FAB_CLASS}__halo" aria-hidden="true"></span>
    <span class="${FLOATING_FAB_CLASS}__inner">
      <svg class="${FLOATING_FAB_CLASS}__icon" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" xmlns="http://www.w3.org/2000/svg">
        <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7z"/>
      </svg>
    </span>
  `;

  const initialPos = clampPos(storedPos ?? defaultPos());
  btn.style.left = `${initialPos.x}px`;
  btn.style.top = `${initialPos.y}px`;

  let dragState: {
    startX: number;
    startY: number;
    offsetX: number;
    offsetY: number;
    moved: boolean;
  } | null = null;

  const onPointerDown = (e: PointerEvent) => {
    if (e.button !== 0) return;
    const rect = btn.getBoundingClientRect();
    dragState = {
      startX: e.clientX,
      startY: e.clientY,
      offsetX: e.clientX - rect.left,
      offsetY: e.clientY - rect.top,
      moved: false,
    };
    btn.setPointerCapture(e.pointerId);
  };

  const onPointerMove = (e: PointerEvent) => {
    if (!dragState) return;
    const dx = e.clientX - dragState.startX;
    const dy = e.clientY - dragState.startY;
    if (!dragState.moved && Math.hypot(dx, dy) < DRAG_MOVE_THRESHOLD) return;
    dragState.moved = true;
    btn.classList.add(`${FLOATING_FAB_CLASS}--dragging`);
    const next = clampPos({
      x: e.clientX - dragState.offsetX,
      y: e.clientY - dragState.offsetY,
    });
    btn.style.left = `${next.x}px`;
    btn.style.top = `${next.y}px`;
  };

  const onPointerUp = (e: PointerEvent) => {
    if (!dragState) return;
    const moved = dragState.moved;
    dragState = null;
    try {
      btn.releasePointerCapture(e.pointerId);
    } catch {}
    btn.classList.remove(`${FLOATING_FAB_CLASS}--dragging`);
    if (moved) {
      onPosChange?.({ x: btn.offsetLeft, y: btn.offsetTop });
    } else {
      // Treat as a click.
      onClick();
    }
  };

  btn.addEventListener('pointerdown', onPointerDown);
  btn.addEventListener('pointermove', onPointerMove);
  btn.addEventListener('pointerup', onPointerUp);
  btn.addEventListener('pointercancel', () => {
    dragState = null;
    btn.classList.remove(`${FLOATING_FAB_CLASS}--dragging`);
  });

  // Keyboard accessibility — Enter/Space should still open the panel when
  // the button is focused via Tab.
  btn.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onClick();
    }
  });

  const onResize = () => {
    const clamped = clampPos({ x: btn.offsetLeft, y: btn.offsetTop });
    btn.style.left = `${clamped.x}px`;
    btn.style.top = `${clamped.y}px`;
  };
  window.addEventListener('resize', onResize);
  // Stash cleanup handle on the element so unmount can reliably remove it.
  (btn as HTMLElement & { __gvResizeCleanup?: () => void }).__gvResizeCleanup = () => {
    window.removeEventListener('resize', onResize);
  };

  document.body.appendChild(btn);
  requestAnimationFrame(() => btn.classList.add(`${FLOATING_FAB_CLASS}--show`));
  return btn;
}

export function unmountFloatingFab(): void {
  const el = document.querySelector(`.${FLOATING_FAB_CLASS}`);
  if (!el) return;
  const cleanup = (el as HTMLElement & { __gvResizeCleanup?: () => void }).__gvResizeCleanup;
  if (cleanup) cleanup();
  el.remove();
}

export function isFloatingFabMounted(): boolean {
  return !!document.querySelector(`.${FLOATING_FAB_CLASS}`);
}
