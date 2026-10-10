import type { TimelineStyle } from '@/core/types/common';

import type { ExtGlobal, TimelinePositionData } from './types';

interface TimelineRailPlacementOptions {
  storagePrefix?: string;
  getStyle: () => TimelineStyle;
  onWidthChange: () => void;
  onPositionRestore: () => void;
}

/** Owns rail resize/drag arbitration, responsive placement and persisted width/position. */
export class TimelineRailPlacement {
  barWidth = 4;
  readonly barWidthMin = 4;
  readonly barWidthMax = 24;
  savedPosition: TimelinePositionData | null = null;
  private bar: HTMLElement | null = null;
  private resizing = false;
  private onResizeMove: ((ev: PointerEvent) => void) | null = null;
  private onResizeUp: ((ev: PointerEvent) => void) | null = null;
  private draggable = false;
  private barDragging = false;
  private barStartPos = { x: 0, y: 0 };
  private barStartOffset = { x: 0, y: 0 };
  private onBarPointerMove: ((ev: PointerEvent) => void) | null = null;
  private onBarPointerUp: ((ev: PointerEvent) => void) | null = null;
  private readonly lifetime = new AbortController();

  constructor(private readonly options: TimelineRailPlacementOptions) {}

  restoreWidth(value: unknown): boolean {
    if (typeof value === 'number' && value >= this.barWidthMin && value <= this.barWidthMax) {
      this.barWidth = value;
      return true;
    }
    return false;
  }

  // Load position with auto-migration from v1 to v2
  restorePosition(position: TimelinePositionData | undefined): void {
    const g = globalThis as ExtGlobal;
    this.savedPosition = position ?? null;
    if (position) {
      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;

      // v2 format: use percentage (responsive)
      if (
        position.version === 2 &&
        position.topPercent !== undefined &&
        position.leftPercent !== undefined
      ) {
        const top = (position.topPercent / 100) * viewportHeight;
        const left = (position.leftPercent / 100) * viewportWidth;
        this.applyPosition(top, left);
        if (this.bar) this.options.onPositionRestore();
      }
      // v1 format: migrate to v2 (auto-upgrade)
      else if (position.top !== undefined && position.left !== undefined) {
        // Apply old position first
        this.applyPosition(position.top, position.left);
        if (this.bar) this.options.onPositionRestore();

        // Migrate to v2 format (percentage-based)
        const migratedPosition = {
          version: 2,
          topPercent: (position.top / viewportHeight) * 100,
          leftPercent: (position.left / viewportWidth) * 100,
        };
        this.savedPosition = migratedPosition;
        (g.chrome?.storage?.sync || g.browser?.storage?.sync)?.set?.({
          [`${this.options.storagePrefix ?? 'geminiTimeline'}Position`]: migratedPosition,
        });
      }
    }
  }

  updateSavedPosition(position: TimelinePositionData | null): void {
    this.savedPosition = position ?? null;
    if (!position) {
      if (this.bar) {
        this.bar.style.top = '';
        this.bar.style.left = '';
      }
      this.updateRulerDirection();
      this.options.onPositionRestore();
    }
  }

  mount(bar: HTMLElement): void {
    this.bar = bar;
    const signal = this.lifetime.signal;
    const onBarPointerDown = (ev: PointerEvent) => {
      if ((ev.target as HTMLElement).closest('.timeline-dot, .timeline-thumb')) return;
      // Resize takes priority over position drag, even when dragging is disabled.
      if (this.isInResizeEdge(ev)) {
        this.startResize(ev);
        return;
      }
      if (!this.draggable) return;
      this.barDragging = true;
      this.barStartPos = { x: ev.clientX, y: ev.clientY };
      const rect = this.bar!.getBoundingClientRect();
      this.barStartOffset = { x: rect.left, y: rect.top };
      this.bar!.setPointerCapture(ev.pointerId);
      this.onBarPointerMove = (e: PointerEvent) => this.handleBarDrag(e);
      this.onBarPointerUp = () => this.endBarDrag();
      window.addEventListener('pointermove', this.onBarPointerMove, { signal });
      // Cancellation follows pointerup, including saving the final position.
      window.addEventListener('pointerup', this.onBarPointerUp, { signal });
      window.addEventListener('pointercancel', this.onBarPointerUp, { signal });
    };
    this.bar.addEventListener('pointerdown', onBarPointerDown, { signal });
    const onBarCursorMove = (ev: PointerEvent) => {
      if (this.resizing || this.barDragging) return;
      if (this.isInResizeEdge(ev)) this.bar!.style.cursor = 'ew-resize';
      else if (this.draggable) this.bar!.style.cursor = 'move';
      else this.bar!.style.cursor = '';
    };
    this.bar.addEventListener('pointermove', onBarCursorMove, { signal });
  }

  /** The visual background is centered inside the 24px rail used by dots. */
  private isInResizeEdge(ev: PointerEvent): boolean {
    if (this.options.getStyle() !== 'dots') return false;
    if (!this.bar) return false;
    const rect = this.bar.getBoundingClientRect();
    const barCenter = rect.left + rect.width / 2;
    const halfWidth = this.barWidth / 2;
    const ZONE = 6;
    const leftEdge = barCenter - halfWidth;
    const rightEdge = barCenter + halfWidth;
    const nearLeft = ev.clientX >= leftEdge - 2 && ev.clientX <= leftEdge + ZONE;
    const nearRight = ev.clientX >= rightEdge - ZONE && ev.clientX <= rightEdge + 2;
    return nearLeft || nearRight;
  }

  private startResize(ev: PointerEvent): void {
    this.resizing = true;
    this.bar!.classList.add('timeline-resizing');
    this.bar!.setPointerCapture(ev.pointerId);
    const barRect = this.bar!.getBoundingClientRect();
    const barCenterX = barRect.left + barRect.width / 2;
    this.onResizeMove = (e: PointerEvent) => {
      const dist = Math.abs(e.clientX - barCenterX);
      this.barWidth = Math.max(this.barWidthMin, Math.min(this.barWidthMax, dist * 2));
      this.options.onWidthChange();
    };
    this.onResizeUp = () => {
      this.resizing = false;
      this.bar?.classList.remove('timeline-resizing');
      window.removeEventListener('pointermove', this.onResizeMove!);
      window.removeEventListener('pointerup', this.onResizeUp!);
      window.removeEventListener('pointercancel', this.onResizeUp!);
      this.onResizeMove = null;
      this.onResizeUp = null;
      this.saveBarWidth();
    };
    const signal = this.lifetime.signal;
    window.addEventListener('pointermove', this.onResizeMove, { signal });
    // A cancelled touch resize must end the gesture and persist its final width too.
    window.addEventListener('pointerup', this.onResizeUp, { signal });
    window.addEventListener('pointercancel', this.onResizeUp, { signal });
    ev.preventDefault();
    ev.stopPropagation();
  }

  private saveBarWidth(): void {
    const g = globalThis as ExtGlobal;
    const value = Math.round(this.barWidth);
    if (g.chrome?.storage?.sync?.set) {
      g.chrome.storage.sync.set({
        [`${this.options.storagePrefix ?? 'geminiTimeline'}BarWidth`]: value,
      });
    } else if (g.browser?.storage?.sync?.set) {
      g.browser.storage.sync.set({
        [`${this.options.storagePrefix ?? 'geminiTimeline'}BarWidth`]: value,
      });
    }
  }

  toggleDraggable(enabled: boolean): void {
    this.draggable = enabled;
    if (!this.bar) return;
    if (!this.draggable) this.bar.style.cursor = '';
  }

  private handleBarDrag(e: PointerEvent): void {
    if (!this.barDragging) return;
    const dx = e.clientX - this.barStartPos.x;
    const dy = e.clientY - this.barStartPos.y;
    const left = this.barStartOffset.x + dx;
    this.bar!.style.left = `${left}px`;
    this.bar!.style.top = `${this.barStartOffset.y + dy}px`;
    this.updateRulerDirection(left);
  }

  private endBarDrag(): void {
    this.barDragging = false;
    this.savePosition();
    try {
      if (this.onBarPointerMove) window.removeEventListener('pointermove', this.onBarPointerMove);
      if (this.onBarPointerUp) {
        window.removeEventListener('pointerup', this.onBarPointerUp);
        window.removeEventListener('pointercancel', this.onBarPointerUp);
      }
    } catch {}
    this.onBarPointerMove = null;
    this.onBarPointerUp = null;
  }

  private savePosition(): void {
    if (!this.bar) return;
    const rect = this.bar.getBoundingClientRect();
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const position = {
      version: 2,
      topPercent: (rect.top / viewportHeight) * 100,
      leftPercent: (rect.left / viewportWidth) * 100,
    };
    this.savedPosition = position;
    const g = globalThis as ExtGlobal;
    if (g.chrome?.storage?.sync?.set) {
      g.chrome.storage.sync.set({
        [`${this.options.storagePrefix ?? 'geminiTimeline'}Position`]: position,
      });
    } else if (g.browser?.storage?.sync?.set) {
      g.browser.storage.sync.set({
        [`${this.options.storagePrefix ?? 'geminiTimeline'}Position`]: position,
      });
    }
  }

  applyPosition(top: number, left: number): void {
    if (!this.bar) return;
    const barWidth = this.bar.offsetWidth || 24;
    const barHeight = this.bar.offsetHeight || 100;
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const padding = 10;
    const clampedTop = Math.max(padding, Math.min(top, viewportHeight - barHeight - padding));
    const clampedLeft = Math.max(padding, Math.min(left, viewportWidth - barWidth - padding));
    this.bar.style.top = `${clampedTop}px`;
    this.bar.style.left = `${clampedLeft}px`;
    this.updateRulerDirection(clampedLeft);
  }

  /** Grow ruler ticks toward page content, including when dragging across the viewport. */
  updateRulerDirection(left?: number): void {
    if (!this.bar) return;
    const barLeft = left ?? this.bar.getBoundingClientRect().left;
    const center = barLeft + (this.bar.offsetWidth || 24) / 2;
    this.bar.classList.toggle('gv-timeline-ruler-inward-right', center < window.innerWidth / 2);
  }

  /** Resize uses the cached position, never storage IPC. Legacy pixel positions stay absolute. */
  reapplyPosition(): boolean {
    if (!this.bar) return false;
    const position = this.savedPosition;
    if (!position) return false;
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    if (
      position.version === 2 &&
      position.topPercent !== undefined &&
      position.leftPercent !== undefined
    ) {
      const top = (position.topPercent / 100) * viewportHeight;
      const left = (position.leftPercent / 100) * viewportWidth;
      this.applyPosition(top, left);
      return true;
    } else if (position.top !== undefined && position.left !== undefined) {
      this.applyPosition(position.top, position.left);
      return true;
    }
    return false;
  }

  destroy(): void {
    this.lifetime.abort();
    this.bar = null;
  }
}
