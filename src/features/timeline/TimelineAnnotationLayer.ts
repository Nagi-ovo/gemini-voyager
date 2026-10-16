import type { TimelineDotLayer } from './TimelineDotLayer';
import { placeAnnotation } from './annotationPlacement';
import { timelineAnnotations } from './timelineAnnotations';

const ANNOTATION_CLASS = 'gv-timeline-annotation';

/** Draws the ticks other features publish to `timelineAnnotations`, beside the rail's dots. */
export class TimelineAnnotationLayer {
  private content: HTMLElement | null = null;
  private unsubscribe: (() => void) | null = null;
  private readonly ticks = new Map<string, HTMLButtonElement>();

  constructor(
    private readonly dots: Pick<TimelineDotLayer, 'railLayout'>,
    private readonly isCompact: () => boolean,
  ) {}

  mount(content: HTMLElement): void {
    this.content = content;
    this.unsubscribe = timelineAnnotations.subscribe(() => this.render());
    this.render();
  }

  /** Places every published annotation; call after the dots are laid out or rendered. */
  render(): void {
    const content = this.content;
    if (!content) return;
    const rail = this.dots.railLayout();
    // Compact hides its track from assistive technology and navigates from the preview panel.
    const tabIndex = this.isCompact() ? -1 : 0;
    const placed = new Set<string>();
    for (const { source, annotation } of timelineAnnotations.snapshot()) {
      const position = placeAnnotation(rail, annotation.turnId, annotation.progress);
      if (position === null || !Number.isFinite(position)) continue;
      const key = `${source}\u0000${annotation.id}`;
      placed.add(key);
      const element = this.ticks.get(key) ?? this.createTick(key, source, annotation.id);
      if (element.parentElement !== content) content.appendChild(element);
      element.dataset.annotationId = annotation.id;
      element.tabIndex = tabIndex;
      element.title = annotation.title ?? annotation.label;
      element.setAttribute('aria-label', annotation.label);
      element.style.setProperty('--gv-annotation-color', annotation.color);
      element.style.top = rail.dense
        ? `calc(50% ${position < 0 ? '-' : '+'} ${Math.abs(position)}px)`
        : `${Math.round(position)}px`;
    }
    for (const [key, tick] of this.ticks) {
      if (placed.has(key)) continue;
      tick.remove();
      this.ticks.delete(key);
    }
  }

  destroy(): void {
    this.unsubscribe?.();
    this.unsubscribe = null;
    this.ticks.forEach((tick) => tick.remove());
    this.ticks.clear();
    this.content = null;
  }

  private createTick(key: string, source: string, id: string): HTMLButtonElement {
    const element = document.createElement('button');
    element.type = 'button';
    element.className = ANNOTATION_CLASS;
    element.addEventListener('click', (event) => {
      // The compact bar's own click would otherwise toggle the preview panel.
      event.preventDefault();
      event.stopPropagation();
      timelineAnnotations.activate(source, id);
    });
    this.ticks.set(key, element);
    return element;
  }
}
