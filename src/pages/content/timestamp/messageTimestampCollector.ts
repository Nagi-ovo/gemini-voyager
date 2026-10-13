import { extractConversationIdFromUrl } from '@/core/utils/conversationIdentity';
import type { TimelineMarker } from '@/features/timeline/types';

import { getLegacyTurnIndex } from '../fork/turnId';
import { GeminiTimelineTurnSource } from '../timeline/GeminiTimelineTurnSource';
import { MessageTimestamps } from './MessageTimestamps';
import type { TimestampService } from './TimestampService';
import { historyTimestampStore } from './historyTimestamps';

const routeOf = (url: string): string => url.split('#')[0];

function isTimestampMutation(record: MutationRecord): boolean {
  const withinLabel = (node: Node): boolean =>
    (node instanceof Element ? node : node.parentElement)?.closest('.gv-timestamp') != null;
  if (withinLabel(record.target)) return true;
  if (record.type !== 'childList') return false;
  const changed = [...record.addedNodes, ...record.removedNodes];
  return changed.length > 0 && changed.every(withinLabel);
}

/** One route's DOM discovery; it never owns or rehydrates the page's durable timestamp cache. */
export class MessageTimestampCollector {
  private readonly url = location.href;
  private readonly lifetime = new AbortController();
  private readonly source = new GeminiTimelineTurnSource(false);
  private markers: TimelineMarker[] = [];
  private observer: MutationObserver | null = null;
  private readonly timestamps: MessageTimestamps;

  constructor(service: TimestampService, enabled: boolean, previousUrl: string | null) {
    const nativeCid = extractConversationIdFromUrl(this.url);
    this.timestamps = new MessageTimestamps(
      {
        getMarkers: () => this.markers,
        getTurnText: (element) => this.source.text.getTurnTextCached(element),
        getTurnAliases: (id) => {
          // A mounted window index never proves the corresponding full-history turn.
          if (getLegacyTurnIndex(id) !== null) return [];
          if (!nativeCid) return [id];
          const aliases = historyTimestampStore.getTurnIdAliases(nativeCid, id);
          return aliases.length > 0 ? aliases : [id];
        },
      },
      service,
      { enabled, previousUrl },
    );
  }

  async start(): Promise<void> {
    await this.timestamps.init();
    if (!this.isCurrent) return;
    await this.source.initialize(this.lifetime.signal);
    if (!this.isCurrent) return;
    // Observe the body too: an observer on Gemini's old main cannot see its replacement.
    this.observer = new MutationObserver((records) => {
      if (!this.isCurrent) {
        this.stop();
        return;
      }
      const root = this.source.root;
      this.source.refresh();
      const relevant = records.filter((record) => !isTimestampMutation(record));
      // Own label insertions must not keep restarting the 800ms first-seen baseline.
      if (
        relevant.length > 0 &&
        (root !== this.source.root ||
          !root?.isConnected ||
          relevant.some((record) => root.contains(record.target)))
      )
        this.scan();
    });
    this.observer.observe(document.body, { childList: true, subtree: true, characterData: true });
    this.scan();
  }

  setEnabled(enabled: boolean): void {
    this.timestamps.setEnabled(enabled);
  }

  private get isCurrent(): boolean {
    return !this.lifetime.signal.aborted && routeOf(this.url) === routeOf(location.href);
  }

  private scan(): void {
    if (!this.isCurrent) return;
    this.source.refresh();
    const previous = this.markers;
    this.markers = this.source.root?.isConnected ? this.source.read(previous).markers : [];
    this.timestamps.update(previous, this.markers);
  }

  stop(): void {
    if (this.lifetime.signal.aborted) return;
    this.lifetime.abort();
    this.observer?.disconnect();
    this.observer = null;
    this.source.stop();
    this.timestamps.destroy();
  }
}
