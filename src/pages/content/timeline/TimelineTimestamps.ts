import { extractConversationIdFromUrl } from '@/core/utils/conversationIdentity';
import type { TimelineMarker } from '@/features/timeline/types';

import {
  subscribeHistoryTimestamps,
  whenHistoryTimestampsReady,
} from '../timestamp/historyTimestampPageService';
import {
  formatMessageTimestamp,
  whenMessageTimestampsReady,
} from '../timestamp/messageTimestampPageService';

interface TimelineTimestampsContext {
  getMarkers(): readonly TimelineMarker[];
  getTurnText(element: HTMLElement): string;
  getTurnAliases(turnId: string): readonly string[];
  onIdentityChange(): void;
}

/** Read-only rail facade; the page timestamp service owns collection, settings, cache and labels. */
export class TimelineTimestamps {
  readonly url = location.href;
  private readonly nativeConversationId = extractConversationIdFromUrl(this.url);
  private readonly lifetime = new AbortController();
  private unsubscribe: (() => void) | null = null;

  constructor(private readonly context: TimelineTimestampsContext) {}

  async init(): Promise<void> {
    const signal = this.lifetime.signal;
    const ready = await whenHistoryTimestampsReady(signal);
    if (!ready || signal.aborted) return;
    this.unsubscribe = subscribeHistoryTimestamps((cids) => {
      if (signal.aborted || this.url.split('#')[0] !== location.href.split('#')[0]) return;
      if (!this.nativeConversationId || !cids.includes(`c_${this.nativeConversationId}`)) return;
      // Alias-dependent stars must refresh even while message time display is switched off.
      this.context.onIdentityChange();
    });
    await whenMessageTimestampsReady(signal);
  }

  update(): void {}

  formatTooltipTimestamp(id: string): string | null {
    if (this.lifetime.signal.aborted || this.url.split('#')[0] !== location.href.split('#')[0])
      return null;
    const marker = this.context.getMarkers().find((item) => item.id === id);
    return formatMessageTimestamp(
      this.url,
      id,
      marker ? this.context.getTurnAliases(id) : [id],
      marker ? this.context.getTurnText(marker.element) : '',
    );
  }

  destroy(): void {
    if (this.lifetime.signal.aborted) return;
    this.lifetime.abort();
    this.unsubscribe?.();
    this.unsubscribe = null;
  }
}
