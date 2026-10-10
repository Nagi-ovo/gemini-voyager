/**
 * Where the Prompt Manager panel sits.
 *
 * Unlocked, the panel is anchored to the trigger and follows it, and its
 * header drags it for the moment. Locked, it stays where it was when locked
 * (persisted across pages), clamped into the viewport so a narrower window can
 * never strand the unlock button off-screen (#635).
 */
import { createLockIcon, createLockOpenIcon } from '@/core/icons/promptManagerIcons';
import { StorageKeys } from '@/core/types/common';
import type { TranslationKey } from '@/utils/translations';

import { computeAnchoredPosition } from './anchoredPanelPosition';
import { readPromptPref, writePromptPref } from './promptPrefs';

type PanelPosition = { top: number; left: number };

const VIEWPORT_PAD = 8;

export interface PanelPlacement {
  /** Places a panel that was just made visible. */
  place: () => void;
  /** Re-anchors the open panel, or keeps a locked one inside the viewport. Runs on page scroll by itself. */
  reposition: () => void;
  /** Updates the lock button's icon and labels. */
  applyTexts: () => void;
  destroy: () => void;
}

export interface PanelPlacementOptions {
  panel: HTMLElement;
  anchor: HTMLElement;
  lockButton: HTMLButtonElement;
  isOpen: () => boolean;
  t: (key: TranslationKey) => string;
}

/** Reads the saved lock state and position, then takes over the panel's placement. */
export async function createPanelPlacement({
  panel,
  anchor,
  lockButton,
  isOpen,
  t,
}: PanelPlacementOptions): Promise<PanelPlacement> {
  let locked = !!(await readPromptPref<boolean>(StorageKeys.PROMPT_PANEL_LOCKED, false));
  let savedPos = await readPromptPref<PanelPosition | null>(
    StorageKeys.PROMPT_PANEL_POSITION,
    null,
  );
  let dragging = false;
  let dragOffset = { x: 0, y: 0 };

  function anchorToTrigger(): void {
    const pos = computeAnchoredPosition(anchor, panel);
    panel.style.left = `${pos.left}px`;
    panel.style.top = `${pos.top}px`;
  }

  function place(): void {
    if (locked && savedPos) {
      // Clamp the saved position to the current viewport. Without this, a
      // panel pinned on a wider screen renders past the edge after the user
      // narrows the window — and since dragging/the unlock button are gated
      // on `!locked`, the user gets stuck. See #635.
      const rect = panel.getBoundingClientRect();
      const panelW = rect.width || 320;
      const panelH = rect.height || 360;
      const left = Math.max(
        VIEWPORT_PAD,
        Math.min(savedPos.left, window.innerWidth - panelW - VIEWPORT_PAD),
      );
      const top = Math.max(
        VIEWPORT_PAD,
        Math.min(savedPos.top, window.innerHeight - panelH - VIEWPORT_PAD),
      );
      panel.style.left = `${Math.round(left)}px`;
      panel.style.top = `${Math.round(top)}px`;
    } else {
      // measure after making visible
      anchorToTrigger();
    }
  }

  function reposition(): void {
    if (!isOpen()) return;
    if (locked) {
      // Don't re-anchor when locked, but do keep the panel inside the viewport
      // so a window resize can't strand the unlock button off-screen (#635).
      const rect = panel.getBoundingClientRect();
      const left = Math.max(
        VIEWPORT_PAD,
        Math.min(rect.left, window.innerWidth - rect.width - VIEWPORT_PAD),
      );
      const top = Math.max(
        VIEWPORT_PAD,
        Math.min(rect.top, window.innerHeight - rect.height - VIEWPORT_PAD),
      );
      if (left !== rect.left || top !== rect.top) {
        panel.style.left = `${Math.round(left)}px`;
        panel.style.top = `${Math.round(top)}px`;
      }
      return;
    }
    anchorToTrigger();
  }

  function applyTexts(): void {
    lockButton.classList.toggle('active', locked);
    lockButton.setAttribute('aria-pressed', locked ? 'true' : 'false');
    lockButton.replaceChildren(locked ? createLockIcon(15) : createLockOpenIcon(15));
    lockButton.title = locked ? t('pm_unlock') || 'Unlock' : t('pm_lock') || 'Lock';
    lockButton.setAttribute('aria-label', lockButton.title);
    panel.classList.toggle('gv-locked', locked);
  }

  async function rememberCurrentPosition(): Promise<void> {
    const rect = panel.getBoundingClientRect();
    savedPos = { left: rect.left, top: rect.top };
    await writePromptPref(StorageKeys.PROMPT_PANEL_POSITION, savedPos);
  }

  lockButton.addEventListener('click', async (ev) => {
    ev.preventDefault();
    ev.stopPropagation();
    locked = !locked;
    await writePromptPref(StorageKeys.PROMPT_PANEL_LOCKED, locked);
    applyTexts();
    try {
      (ev.currentTarget as HTMLButtonElement)?.blur?.();
    } catch {}
    if (locked) {
      await rememberCurrentPosition();
    } else {
      reposition();
    }
  });

  panel.addEventListener('pointerdown', (ev: PointerEvent) => {
    const target = ev.target as HTMLElement;
    if (!target.closest('.gv-pm-drag') || locked) return;
    dragging = true;
    const rect = panel.getBoundingClientRect();
    dragOffset = { x: ev.clientX - rect.left, y: ev.clientY - rect.top };
    try {
      panel.setPointerCapture?.(ev.pointerId);
    } catch {}
  });

  const onPointerMove = (ev: PointerEvent): void => {
    if (!dragging) return;
    const x = ev.clientX - dragOffset.x;
    const y = ev.clientY - dragOffset.y;
    panel.style.left = `${Math.round(x)}px`;
    panel.style.top = `${Math.round(y)}px`;
  };

  const onPointerUp = async (): Promise<void> => {
    if (!dragging) return;
    dragging = false;
    await rememberCurrentPosition();
  };

  window.addEventListener('pointermove', onPointerMove, { passive: true });
  window.addEventListener('pointerup', onPointerUp, { passive: true });
  window.addEventListener('scroll', reposition, { passive: true });

  return {
    place,
    reposition,
    applyTexts,
    destroy: () => {
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      window.removeEventListener('scroll', reposition);
    },
  };
}
