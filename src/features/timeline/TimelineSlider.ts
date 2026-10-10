interface TimelineSliderOptions {
  getLayout: () => { contentHeight: number; padding: number; rtl: boolean };
  onScroll: () => void;
}

/** Owns slider geometry, hover fading and the pointer gesture that scrolls the rail. */
export class TimelineSlider {
  private sliderDragging = false;
  private sliderFadeTimer: number | null = null;
  private readonly sliderFadeDelay = 1000;
  private sliderAlwaysVisible = false;
  private onSliderMove: ((ev: PointerEvent) => void) | null = null;
  private onSliderUp: ((ev: PointerEvent) => void) | null = null;
  private sliderStartClientY = 0;
  private sliderStartTop = 0;
  private sliderMaxTop = 0;
  private sliderScrollRange = 1;
  private readonly lifetime = new AbortController();

  constructor(
    private readonly bar: HTMLElement,
    private readonly track: HTMLElement,
    private readonly slider: HTMLElement,
    private readonly handle: HTMLElement | null,
    private readonly options: TimelineSliderOptions,
  ) {
    const signal = this.lifetime.signal;
    const onSliderDown = (ev: PointerEvent) => {
      if (!this.handle) return;
      try {
        this.handle.setPointerCapture(ev.pointerId);
      } catch {}
      this.sliderDragging = true;
      this.show();
      this.sliderStartClientY = ev.clientY;
      const rect = this.handle.getBoundingClientRect();
      this.sliderStartTop = rect.top;
      this.onSliderMove = (e: PointerEvent) => this.handleSliderDrag(e);
      this.onSliderUp = () => this.endSliderDrag();
      window.addEventListener('pointermove', this.onSliderMove, { signal });
      // Cancellation must release dragging so native scrolling can synchronize the rail again.
      window.addEventListener('pointerup', this.onSliderUp, { signal });
      window.addEventListener('pointercancel', this.onSliderUp, { signal });
    };
    this.handle?.addEventListener('pointerdown', onSliderDown, { signal });
    this.bar.addEventListener('pointerenter', () => this.show(), { signal });
    this.bar.addEventListener('pointerleave', () => this.hideSliderDeferred(), { signal });
    this.slider.addEventListener('pointerenter', () => this.show(), { signal });
    this.slider.addEventListener('pointerleave', () => this.hideSliderDeferred(), { signal });
  }

  get dragging(): boolean {
    return this.sliderDragging;
  }

  updateGeometry(): void {
    this.update();
    const barH = this.bar.clientHeight || 0;
    this.sliderAlwaysVisible = this.options.getLayout().contentHeight > barH + 1;
    if (this.sliderAlwaysVisible) this.show();
  }

  update(): void {
    if (!this.handle) return;
    const { contentHeight, padding: pad, rtl } = this.options.getLayout();
    if (!contentHeight) return;
    const barRect = this.bar.getBoundingClientRect();
    const barH = barRect.height || 0;
    const innerH = Math.max(0, barH - 2 * pad);
    if (contentHeight <= barH + 1 || innerH <= 0) {
      this.sliderAlwaysVisible = false;
      this.sliderMaxTop = 0;
      this.sliderScrollRange = 1;
      this.slider.classList.remove('visible');
      this.slider.style.opacity = '';
      return;
    }
    this.sliderAlwaysVisible = true;
    const railLen = Math.max(120, Math.min(240, Math.floor(barH * 0.45)));
    const railTop = Math.round(barRect.top + pad + (innerH - railLen) / 2);
    const railLeftGap = 8;
    const sliderWidth = 12;
    // In RTL the bar is on the left, so the slider belongs on its right.
    const left = rtl
      ? Math.round(barRect.right + railLeftGap)
      : Math.round(barRect.left - railLeftGap - sliderWidth);
    this.slider.style.left = `${left}px`;
    this.slider.style.top = `${railTop}px`;
    this.slider.style.height = `${railLen}px`;
    const handleH = 22;
    const maxTop = Math.max(0, railLen - handleH);
    const range = Math.max(1, contentHeight - barH);
    this.sliderMaxTop = maxTop;
    this.sliderScrollRange = range;
    this.handle.style.height = `${handleH}px`;
    this.updatePosition();
    this.slider.classList.add('visible');
    this.slider.style.opacity = '';
  }

  updatePosition(): void {
    if (!this.handle || !this.sliderAlwaysVisible) return;
    const st = this.track.scrollTop || 0;
    const ratio = Math.max(0, Math.min(1, st / this.sliderScrollRange));
    const top = `${Math.round(ratio * this.sliderMaxTop)}px`;
    if (this.handle.style.top !== top) this.handle.style.top = top;
  }

  show(): void {
    this.slider.classList.add('visible');
    if (this.sliderFadeTimer) {
      clearTimeout(this.sliderFadeTimer);
      this.sliderFadeTimer = null;
    }
    this.update();
  }

  private hideSliderDeferred(): void {
    if (this.sliderDragging || this.sliderAlwaysVisible) return;
    if (this.sliderFadeTimer) clearTimeout(this.sliderFadeTimer);
    this.sliderFadeTimer = window.setTimeout(() => {
      this.sliderFadeTimer = null;
      this.slider.classList.remove('visible');
    }, this.sliderFadeDelay);
  }

  private handleSliderDrag(e: PointerEvent): void {
    if (!this.sliderDragging) return;
    const barRect = this.bar.getBoundingClientRect();
    const barH = barRect.height || 0;
    const railLen =
      parseFloat(this.slider.style.height || '0') ||
      Math.max(120, Math.min(240, Math.floor(barH * 0.45)));
    const handleH = this.handle!.getBoundingClientRect().height || 22;
    const maxTop = Math.max(0, railLen - handleH);
    const delta = e.clientY - this.sliderStartClientY;
    const top = Math.max(
      0,
      Math.min(maxTop, this.sliderStartTop + delta - (parseFloat(this.slider.style.top) || 0)),
    );
    const r = maxTop > 0 ? top / maxTop : 0;
    const range = Math.max(1, this.options.getLayout().contentHeight - barH);
    this.track.scrollTop = Math.round(r * range);
    this.options.onScroll();
    // show() refreshes geometry after the rail's dots have rendered.
    this.show();
  }

  private endSliderDrag(): void {
    this.sliderDragging = false;
    if (this.onSliderMove) window.removeEventListener('pointermove', this.onSliderMove);
    if (this.onSliderUp) {
      window.removeEventListener('pointerup', this.onSliderUp);
      window.removeEventListener('pointercancel', this.onSliderUp);
    }
    this.onSliderMove = null;
    this.onSliderUp = null;
    this.hideSliderDeferred();
  }

  destroy(): void {
    this.lifetime.abort();
    if (this.sliderFadeTimer !== null) clearTimeout(this.sliderFadeTimer);
  }
}
