/** A mark another feature pins to a turn of the conversation, drawn as a tick on the rail. */
export interface TimelineAnnotation {
  readonly id: string;
  /** Timeline marker id of the turn holding it (`TimelineMarker.id`, e.g. Gemini's `s-<16hex>`). */
  readonly turnId: string;
  /** Where in that turn it sits, 0 = turn top, 1 = turn bottom. */
  readonly progress: number;
  /** CSS color of the tick. */
  readonly color: string;
  /** Accessible name of the tick. */
  readonly label: string;
  /** Hover text; the label when omitted. */
  readonly title?: string;
}

export interface PublishedAnnotation {
  readonly source: string;
  readonly annotation: TimelineAnnotation;
}

interface SourceEntry {
  annotations: readonly TimelineAnnotation[];
  activate: (id: string) => void;
}

function sameAnnotations(
  left: readonly TimelineAnnotation[],
  right: readonly TimelineAnnotation[],
): boolean {
  return (
    left.length === right.length &&
    left.every((annotation, index) => {
      const other = right[index];
      return (
        annotation.id === other.id &&
        annotation.turnId === other.turnId &&
        Object.is(annotation.progress, other.progress) &&
        annotation.color === other.color &&
        annotation.label === other.label &&
        annotation.title === other.title
      );
    })
  );
}

/**
 * Page-wide meeting point between features that annotate turns (highlights) and whichever
 * timeline rail is mounted. Publishers hand over plain data; the rail decides where it goes, so
 * neither side reads the other's DOM.
 */
class TimelineAnnotations {
  private readonly sources = new Map<string, SourceEntry>();
  private readonly listeners = new Set<() => void>();

  /** Replaces `source`'s annotations; an empty list withdraws them. */
  publish(
    source: string,
    annotations: readonly TimelineAnnotation[],
    activate: (id: string) => void,
  ): void {
    const previous = this.sources.get(source)?.annotations ?? [];
    if (annotations.length === 0) this.sources.delete(source);
    else this.sources.set(source, { annotations: [...annotations], activate });
    // Publishers republish on every DOM settle; only a real change may re-render the rail.
    if (!sameAnnotations(previous, annotations)) this.listeners.forEach((listener) => listener());
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  snapshot(): readonly PublishedAnnotation[] {
    return Array.from(this.sources, ([source, entry]) =>
      entry.annotations.map((annotation) => ({ source, annotation })),
    ).flat();
  }

  /** Hands a clicked tick back to the feature that published it. */
  activate(source: string, id: string): void {
    const entry = this.sources.get(source);
    if (entry?.annotations.some((annotation) => annotation.id === id)) entry.activate(id);
  }
}

export const timelineAnnotations = new TimelineAnnotations();
