import {
  type HighlightColor,
  type HighlightPresetColor,
  type HighlightRecordV1,
  getHighlightColorHex,
  isHighlightPresetColor,
} from '@/core/types/highlight';
import {
  type TimelineAnnotation,
  timelineAnnotations,
} from '@/features/timeline/timelineAnnotations';

import { readServerTurnId } from '../fork/turnId';
import { isVisibleHighlightMark } from './dom';
import { translate } from './messages';

const SOURCE = 'highlight';
/** The Gemini turn element whose id `readServerTurnId` turns into the timeline marker id. */
const TURN_CONTAINER_SELECTOR = '.conversation-container';
/** Deeper than the text tints: a tick a few pixels wide needs the extra contrast. */
const TICK_COLORS: Record<HighlightPresetColor, string> = {
  yellow: '#e8b400',
  green: '#24a148',
  blue: '#1a73e8',
  pink: '#d9468f',
};

function tickColor(color: HighlightColor): string {
  return isHighlightPresetColor(color) ? TICK_COLORS[color] : getHighlightColorHex(color);
}

/** How far down its turn the mark starts, 0 = turn top, 1 = turn bottom. */
function progressInTurn(mark: HTMLElement, turn: HTMLElement): number {
  const turnRect = turn.getBoundingClientRect();
  const progress = (mark.getBoundingClientRect().top - turnRect.top) / turnRect.height;
  return Number.isFinite(progress) ? Math.max(0, Math.min(1, progress)) : 0;
}

/** Publishes each visible highlight to the timeline, which places and draws its tick. */
export class HighlightTimelineAnnotations {
  private enabled = true;
  private destroyed = false;

  constructor(
    private readonly records: ReadonlyMap<string, HighlightRecordV1>,
    private readonly marks: ReadonlyMap<string, readonly HTMLElement[]>,
    private readonly onActivate: (id: string) => void,
  ) {}

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    this.render();
  }

  render(): void {
    const annotations: TimelineAnnotation[] = [];
    if (this.enabled && !this.destroyed) {
      for (const [id, record] of this.records) {
        const mark = this.marks.get(id)?.find(isVisibleHighlightMark);
        const turn = mark?.closest<HTMLElement>(TURN_CONTAINER_SELECTOR);
        const turnId = readServerTurnId(turn);
        if (!mark || !turn || !turnId) continue;
        annotations.push({
          id,
          turnId,
          progress: progressInTurn(mark, turn),
          color: tickColor(record.color),
          label: translate('highlightTimelineAriaLabel', 'Open saved highlight'),
          title: record.anchor.quote.exact.replace(/\s+/g, ' ').trim().slice(0, 160),
        });
      }
    }
    timelineAnnotations.publish(SOURCE, annotations, this.onActivate);
  }

  clear(): void {
    timelineAnnotations.publish(SOURCE, [], this.onActivate);
  }

  destroy(): void {
    this.destroyed = true;
    this.clear();
  }
}
