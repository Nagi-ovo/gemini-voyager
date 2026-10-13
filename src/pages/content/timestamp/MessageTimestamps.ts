import type { TurnId } from '@/core/types/common';
import {
  buildConversationIdFromUrl,
  extractConversationIdFromUrl,
} from '@/core/utils/conversationIdentity';
import type { TimelineMarker } from '@/features/timeline/types';

import { getLegacyTurnIndex } from '../fork/turnId';
import type { TimestampService } from './TimestampService';
import {
  subscribeHistoryTimestamps,
  whenHistoryTimestampsReady,
} from './historyTimestampPageService';
import { type HistoryTimestampStore, historyTimestampStore } from './historyTimestamps';
import { buildTimestampConversationId } from './messageTimestampIdentity';
import { getLocalMessageTimestamp } from './messageTimestampLookup';

interface HistoryTimestampMatchKey {
  nativeConversationId: string;
  timestampConversationId: string;
  storeRevision: number;
  markerRevision: number;
}

interface MessageTimestampsContext {
  getMarkers(): readonly TimelineMarker[];
  getTurnText(element: HTMLElement): string;
  getTurnAliases(turnId: string): readonly string[];
}

interface MessageTimestampsOptions {
  previousUrl?: string | null;
  enabled?: boolean;
}

/** Owns one conversation's timestamp tracking, history subscription and message labels. */
export class MessageTimestamps {
  readonly url = window.location.href;
  readonly conversationId = buildConversationIdFromUrl(this.url);
  private readonly nativeConversationId = extractConversationIdFromUrl(this.url);
  private readonly timestampConversationId = buildTimestampConversationId(this.url);
  private historyTimestampStore: HistoryTimestampStore | null = null;
  private historyTimestampUnsubscribe: (() => void) | null = null;
  private historyTimestampMarkerRevision = 0;
  private lastHistoryTimestampMatch: HistoryTimestampMatchKey | null = null;
  private enabledValue = false;
  private destroyed = false;
  private readonly lifetime = new AbortController();
  private readonly initialTimestampSnapshotDelay = 800;
  private readonly draftTimestampAdoptionWindowMs = 5 * 60 * 1000;
  private timestampTrackingReady = false;
  private timestampStartupTimer: number | null = null;
  private readonly seenTurnIds = new Set<string>();
  private pendingDraftTimestampSourceConversationId: string | null;

  constructor(
    private readonly context: MessageTimestampsContext,
    private readonly timestampService: TimestampService,
    options: MessageTimestampsOptions = {},
  ) {
    this.enabledValue = options.enabled === true;
    const previousUrl = options.previousUrl;
    this.pendingDraftTimestampSourceConversationId =
      previousUrl && !extractConversationIdFromUrl(previousUrl) && this.nativeConversationId
        ? buildTimestampConversationId(previousUrl)
        : null;
  }

  async init(): Promise<void> {
    if (!this.isCurrent) return;
    this.historyTimestampStore = historyTimestampStore;
    // The page service owns the store's lifetime; this conversation only waits and subscribes.
    const ready = await whenHistoryTimestampsReady(this.lifetime.signal);
    if (!ready || !this.isCurrent) return;
    this.historyTimestampUnsubscribe = subscribeHistoryTimestamps((updatedCids) => {
      if (
        this.destroyed ||
        this.conversationId !== buildConversationIdFromUrl(window.location.href)
      )
        return;
      if (!this.nativeConversationId || !updatedCids.includes(`c_${this.nativeConversationId}`))
        return;
      if (this.applyHistoryTimestamps()) this.render();
    });
  }

  get enabled(): boolean {
    return this.enabledValue;
  }

  setEnabled(enabled: boolean): void {
    if (!this.isCurrent) return;
    this.enabledValue = enabled;
    this.lastHistoryTimestampMatch = null;
    if (enabled) this.applyHistoryTimestamps();
    this.render();
  }

  update(previousMarkers: readonly TimelineMarker[], nextMarkers: readonly TimelineMarker[]): void {
    if (!this.isCurrent) return;
    if (nextMarkers.length === 0) {
      this.updateTimestampTracking([]);
      this.clearLabels();
      return;
    }
    if (this.didHistoryTimestampMarkerInputsChange(previousMarkers, nextMarkers)) {
      this.historyTimestampMarkerRevision++;
    }
    const markerIds = nextMarkers.map((marker) => marker.id);
    this.maybeAdoptDraftRouteTimestamps(markerIds);
    this.updateTimestampTracking(markerIds);
    // History writes update TimestampService memory synchronously, so this pass renders them.
    this.applyHistoryTimestamps();
    this.render();
  }

  formatTooltipTimestamp(turnId: string): string | null {
    if (!this.enabledValue || !this.timestampService || !turnId) return null;
    const marker = this.context.getMarkers().find((item) => item.id === turnId);
    const timestamp = marker
      ? this.getTimestampForMarker(marker)
      : this.timestampService.getTimestamp(this.timestampConversationId, turnId as TurnId);
    return timestamp == null ? null : this.timestampService.formatAbsoluteTime(timestamp);
  }

  private getTimestampForMarker(marker: TimelineMarker): number | null {
    return getLocalMessageTimestamp(
      this.timestampService,
      this.url,
      this.context.getTurnAliases(marker.id),
      this.context.getTurnText(marker.element),
    );
  }

  private readonly labels = new Map<string, HTMLElement>();

  private clearLabels(): void {
    // Owned nodes include detached roots; a stale stop must not remove its successor's labels.
    for (const label of this.labels.values()) label.remove();
    this.labels.clear();
  }

  private render(): void {
    if (!this.isCurrent) return;
    const timestampService = this.timestampService;
    if (!this.enabledValue) {
      this.clearLabels();
      return;
    }

    const activeTurnIds = new Set<string>();
    const existingTimestampEls = new Map(this.labels);

    // Use markers instead of querying DOM - markers already have the correct elements
    const renderedTurnIds = new Set<string>();
    this.context.getMarkers().forEach((marker) => {
      activeTurnIds.add(marker.id);
      if (renderedTurnIds.has(marker.id)) {
        return;
      }
      renderedTurnIds.add(marker.id);

      const msgEl = marker.element;
      const parent = msgEl.parentElement;
      if (!msgEl.isConnected || !parent) {
        existingTimestampEls.get(marker.id)?.remove();
        this.labels.delete(marker.id);
        existingTimestampEls.delete(marker.id);
        return;
      }

      let insertionParent: HTMLElement | null = parent;
      let insertionAnchor: HTMLElement = msgEl;
      const alignClass = 'gv-timestamp-user';
      const existingTimestampEl = existingTimestampEls.get(marker.id) ?? null;
      try {
        // Walk up to find the nearest horizontal row wrapper (avatar + bubble).
        // Then insert timestamp before that row so it is always above the whole message row.
        let rowWrapper: HTMLElement | null = null;
        let cursor: HTMLElement | null = parent;
        for (let i = 0; i < 4 && cursor; i++) {
          const style = getComputedStyle(cursor);
          if (style.display.includes('flex') && style.flexDirection.startsWith('row')) {
            rowWrapper = cursor;
            break;
          }
          cursor = cursor.parentElement;
        }
        if (rowWrapper && rowWrapper.parentElement) {
          insertionParent = rowWrapper.parentElement as HTMLElement;
          insertionAnchor = rowWrapper;
        }
      } catch {}
      if (!insertionParent) {
        return;
      }

      const timestamp = this.getTimestampForMarker(marker);
      if (timestamp == null) {
        existingTimestampEls.get(marker.id)?.remove();
        this.labels.delete(marker.id);
        existingTimestampEls.delete(marker.id);
        return;
      }

      const formattedTime = timestampService.formatAbsoluteTime(timestamp);
      const desiredClassName = `gv-timestamp ${alignClass}`;
      const timestampEl = existingTimestampEl ?? document.createElement('div');
      timestampEl.setAttribute('data-gv-turn-id', marker.id);
      if (timestampEl.className !== desiredClassName) {
        timestampEl.className = desiredClassName;
      }
      if (timestampEl.textContent !== formattedTime) {
        timestampEl.textContent = formattedTime;
      }

      if (
        timestampEl.parentElement !== insertionParent ||
        timestampEl.nextSibling !== insertionAnchor
      ) {
        // Render timestamp above the message container (outside the bubble)
        insertionParent.insertBefore(timestampEl, insertionAnchor);
      }

      this.labels.set(marker.id, timestampEl);
      existingTimestampEls.delete(marker.id);
    });

    existingTimestampEls.forEach((el, turnId) => {
      if (!activeTurnIds.has(turnId)) {
        el.remove();
        this.labels.delete(turnId);
      }
    });
  }

  private updateTimestampTracking(markerIds: string[]): void {
    if (!this.timestampTrackingReady) {
      markerIds.forEach((markerId) => this.seenTurnIds.add(markerId));
      const shouldResetDelay = markerIds.length > 0 || this.seenTurnIds.size > 0;
      this.scheduleTimestampTrackingReady(shouldResetDelay);
      return;
    }

    markerIds.forEach((markerId) => {
      if (this.seenTurnIds.has(markerId)) return;
      this.seenTurnIds.add(markerId);
      this.recordTimestampForTurn(markerId);
    });
  }

  private scheduleTimestampTrackingReady(resetDelay: boolean): void {
    if (this.timestampTrackingReady) return;

    if (resetDelay && this.timestampStartupTimer !== null) {
      clearTimeout(this.timestampStartupTimer);
      this.timestampStartupTimer = null;
    }

    if (this.timestampStartupTimer !== null) return;

    this.timestampStartupTimer = window.setTimeout(() => {
      this.timestampTrackingReady = true;
      this.timestampStartupTimer = null;
    }, this.initialTimestampSnapshotDelay);
  }

  private recordTimestampForTurn(turnId: string): void {
    // Only record while the message-timestamps feature is enabled; existing
    // stored timestamps are kept untouched (backward compatibility).
    if (!this.isCurrent || !this.enabledValue) return;
    if (getLegacyTurnIndex(turnId) !== null) return;
    const timestampConversationId = this.timestampConversationId;
    if (!this.timestampService) return;
    if (this.timestampService.getTimestamp(timestampConversationId, turnId as TurnId) !== null)
      return;

    this.timestampService
      .recordTimestamp(timestampConversationId, turnId as TurnId)
      .catch(() => {});
  }

  private didHistoryTimestampMarkerInputsChange(
    previousMarkers: readonly TimelineMarker[],
    nextMarkers: readonly TimelineMarker[],
  ): boolean {
    if (previousMarkers.length !== nextMarkers.length) return true;

    for (let index = 0; index < nextMarkers.length; index++) {
      const previous = previousMarkers[index];
      const next = nextMarkers[index];
      if (previous.id !== next.id || previous.summary !== next.summary) return true;
    }

    return false;
  }

  /**
   * Overwrite first-seen timestamps with real server-side times captured from
   * Gemini's conversation-load RPC. Matching uses the same server turn id as
   * Timeline identity, so duplicate or edited prompt text is irrelevant.
   * Returns whether any stored timestamp changed.
   */
  private applyHistoryTimestamps(): boolean {
    const store = this.historyTimestampStore;
    const timestampService = this.timestampService;
    const markers = this.context.getMarkers();
    if (!store || !timestampService || markers.length === 0) return false;
    // Recording is opt-in via the feature toggle, same as recordTimestampForTurn.
    if (!this.isCurrent || !this.enabledValue) return false;

    const nativeConversationId = this.nativeConversationId;
    if (!nativeConversationId) return false;
    // Stale-manager guard: during an SPA conversation switch there is a window
    // where the URL already points at the next conversation while this instance
    // (and its markers) still belongs to the previous one.
    if (this.conversationId !== buildConversationIdFromUrl(window.location.href)) return false;
    const timestampConversationId = this.timestampConversationId;

    const storeRevision = store.getRevision(nativeConversationId);
    if (storeRevision === 0) return false;

    const matchKey: HistoryTimestampMatchKey = {
      nativeConversationId,
      timestampConversationId,
      storeRevision,
      markerRevision: this.historyTimestampMarkerRevision,
    };
    const previousMatch = this.lastHistoryTimestampMatch;
    if (
      previousMatch?.nativeConversationId === matchKey.nativeConversationId &&
      previousMatch.timestampConversationId === matchKey.timestampConversationId &&
      previousMatch.storeRevision === matchKey.storeRevision &&
      previousMatch.markerRevision === matchKey.markerRevision
    ) {
      return false;
    }

    const turns = store.getTurns(nativeConversationId);
    if (!turns) return false;

    const mountedTurnIds = new Set(markers.map((marker) => marker.id));
    this.lastHistoryTimestampMatch = matchKey;

    let changed = false;
    turns.forEach(({ turnId, timestampMs }) => {
      if (!turnId) return;
      if (!mountedTurnIds.has(turnId)) return;
      if (
        timestampService.getTimestamp(timestampConversationId, turnId as TurnId) === timestampMs
      ) {
        return;
      }
      changed = true;
      timestampService
        .recordTimestamp(timestampConversationId, turnId as TurnId, timestampMs)
        .catch(() => {});
    });
    return changed;
  }

  private maybeAdoptDraftRouteTimestamps(markerIds: string[]): void {
    if (
      !this.isCurrent ||
      !this.pendingDraftTimestampSourceConversationId ||
      markerIds.length === 0
    ) {
      return;
    }

    const sourceConversationId = this.pendingDraftTimestampSourceConversationId;
    const targetConversationId = this.timestampConversationId;

    const latestDraftTimestamp =
      this.timestampService.getLatestTimestampForConversation(sourceConversationId);

    this.pendingDraftTimestampSourceConversationId = null;

    if (
      latestDraftTimestamp == null ||
      Date.now() - latestDraftTimestamp > this.draftTimestampAdoptionWindowMs
    ) {
      return;
    }

    this.timestampService
      .adoptTimestamps(
        sourceConversationId,
        targetConversationId,
        markerIds.map((markerId) => markerId as TurnId),
      )
      .catch(() => {});
  }

  private get isCurrent(): boolean {
    // The route poller may lag navigation; the old owner must not touch the next chat or account DOM.
    return !this.destroyed && this.url.split('#')[0] === window.location.href.split('#')[0];
  }

  destroy(): void {
    if (this.destroyed) return;
    this.clearLabels();
    this.destroyed = true;
    this.lifetime.abort();
    if (this.timestampStartupTimer !== null) clearTimeout(this.timestampStartupTimer);
    this.timestampStartupTimer = null;
    this.historyTimestampUnsubscribe?.();
    this.historyTimestampUnsubscribe = null;
    this.historyTimestampStore = null;
  }
}
