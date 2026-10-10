const LONG_PRESS_DURATION_MS = 550;
const LONG_PRESS_MOVE_TOLERANCE_PX = 6;
const LONG_PRESS_CLICK_SUPPRESSION_MS = 350;

export class TimelinePreviewPress {
  private pressTargetItem: HTMLElement | null = null;
  private pressStartPosition: { x: number; y: number } | null = null;
  private longPressTimer: number | null = null;
  private longPressTriggeredTurnId: string | null = null;
  private suppressClickUntil = 0;
  private suppressClickTurnId: string | null = null;

  constructor(
    private readonly listElement: HTMLElement,
    private readonly onToggleStar: ((turnId: string) => void | Promise<void>) | null,
  ) {
    this.listElement.addEventListener('pointerdown', this.onListPointerDown);
    this.listElement.addEventListener('pointerleave', this.onListPointerLeave);
    window.addEventListener('pointermove', this.onWindowPointerMove, { passive: true });
    window.addEventListener('pointerup', this.onWindowPointerUp, { passive: true });
    window.addEventListener('pointercancel', this.onWindowPointerCancel, { passive: true });
  }

  cancelPending(): void {
    if (this.longPressTimer !== null) {
      clearTimeout(this.longPressTimer);
      this.longPressTimer = null;
    }
    this.pressTargetItem?.classList.remove('holding');
    this.pressTargetItem = null;
    this.pressStartPosition = null;
  }

  reset(): void {
    this.cancelPending();
    this.longPressTriggeredTurnId = null;
    this.suppressClickTurnId = null;
    this.suppressClickUntil = 0;
  }

  consumeClick(turnId: string, event: MouseEvent): boolean {
    if (this.suppressClickTurnId !== turnId || Date.now() >= this.suppressClickUntil) return false;
    event.preventDefault();
    event.stopPropagation();
    this.suppressClickTurnId = null;
    this.suppressClickUntil = 0;
    return true;
  }

  destroy(): void {
    this.reset();
    this.listElement.removeEventListener('pointerdown', this.onListPointerDown);
    this.listElement.removeEventListener('pointerleave', this.onListPointerLeave);
    window.removeEventListener('pointermove', this.onWindowPointerMove);
    window.removeEventListener('pointerup', this.onWindowPointerUp);
    window.removeEventListener('pointercancel', this.onWindowPointerCancel);
  }

  private readonly onListPointerDown = (event: PointerEvent): void => {
    if (!this.onToggleStar || event.isPrimary === false) return;
    if (event.button !== 0) return;
    const target = event.target;
    if (!(target instanceof Element)) return;
    const item = target.closest<HTMLElement>('.timeline-preview-item');
    if (!item || !this.listElement.contains(item)) return;

    this.cancelPending();
    this.longPressTriggeredTurnId = null;
    this.pressTargetItem = item;
    this.pressStartPosition = { x: event.clientX, y: event.clientY };
    item.classList.add('holding');
    this.longPressTimer = window.setTimeout(async () => {
      const pressedItem = this.pressTargetItem;
      const turnId = pressedItem?.dataset.turnId;
      this.longPressTimer = null;
      this.pressTargetItem = null;
      this.pressStartPosition = null;
      pressedItem?.classList.remove('holding');
      if (!turnId || !this.onToggleStar) return;

      this.longPressTriggeredTurnId = turnId;
      try {
        await this.onToggleStar(turnId);
      } catch (error) {
        console.error('[TimelinePreviewPanel] Failed to toggle star:', error);
      }
    }, LONG_PRESS_DURATION_MS);
  };

  private readonly onListPointerLeave = (): void => this.cancelPending();

  private readonly onWindowPointerMove = (event: PointerEvent): void => {
    if (!this.pressTargetItem || !this.pressStartPosition) return;
    const dx = event.clientX - this.pressStartPosition.x;
    const dy = event.clientY - this.pressStartPosition.y;
    if (dx * dx + dy * dy > LONG_PRESS_MOVE_TOLERANCE_PX * LONG_PRESS_MOVE_TOLERANCE_PX) {
      this.cancelPending();
    }
  };

  private readonly onWindowPointerUp = (): void => {
    if (this.longPressTriggeredTurnId) {
      this.suppressClickTurnId = this.longPressTriggeredTurnId;
      this.suppressClickUntil = Date.now() + LONG_PRESS_CLICK_SUPPRESSION_MS;
      this.longPressTriggeredTurnId = null;
    }
    this.cancelPending();
  };

  private readonly onWindowPointerCancel = (): void => {
    this.longPressTriggeredTurnId = null;
    this.cancelPending();
  };
}
