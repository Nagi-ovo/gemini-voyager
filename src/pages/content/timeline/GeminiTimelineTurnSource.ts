import {
  getGeminiTurnSelectors,
  getGeminiUserTurnObserverScope,
} from '@/core/gemini/turnSelectors';
import type { TimelineTurnSource, TimelineTurnSnapshot } from '@/features/timeline/TimelineAdapter';
import type { TimelineMarker } from '@/features/timeline/types';

import { nativeHealthReporter } from '../nativeHealth';
import { hasRenderedConversationContent } from '../nativeHealth/pageEvidence';
import { TimelineTurns } from './TimelineTurns';

export class GeminiTimelineTurnSource implements TimelineTurnSource {
  constructor(private readonly reportHealth = true) {}
  readonly navigation = 'mounted';
  readonly text = new TimelineTurns();
  private conversationContainer: HTMLElement | null = null;
  private userTurnSelector = '';
  get root(): HTMLElement | null {
    return this.conversationContainer;
  }
  get anchor(): HTMLElement | null {
    return document.querySelector<HTMLElement>(this.userTurnSelector) || this.root;
  }
  count(): number {
    return this.userTurnSelector ? document.querySelectorAll(this.userTurnSelector).length : 0;
  }
  read(previous: TimelineMarker[]): TimelineTurnSnapshot {
    const mountedCount = this.root?.querySelectorAll(this.userTurnSelector).length ?? 0;
    if (this.reportHealth && mountedCount) nativeHealthReporter.reportFound('timeline');
    else if (this.reportHealth)
      nativeHealthReporter.reportMissing('timeline', {
        route: 'conversation',
        recheck: () => !!this.userTurnSelector && !!this.root?.querySelector(this.userTurnSelector),
        expected: () => hasRenderedConversationContent(),
      });
    return {
      mountedCount,
      markers: this.root ? this.text.collect(this.root, this.userTurnSelector, previous) : [],
    };
  }
  refresh(): boolean {
    if (!this.userTurnSelector || !document.querySelector(this.userTurnSelector)) return false;
    this.conversationContainer = document.querySelector<HTMLElement>('main') || document.body;
    return true;
  }
  observe(callback: MutationCallback): MutationObserver {
    const observer = new MutationObserver(callback);
    if (this.root) observer.observe(this.root, { childList: true, subtree: true });
    return observer;
  }
  stop(): void {
    if (this.reportHealth) nativeHealthReporter.withdraw('timeline');
  }
  private waitForAnyElement(
    selectors: string[],
    signal: AbortSignal,
    timeoutMs = 5000,
  ): Promise<{ element: Element; selector: string } | null> {
    const find = () => {
      for (const selector of selectors) {
        const element = document.querySelector(selector);
        if (element) return { element, selector };
      }
      return null;
    };
    const found = find();
    if (found || signal.aborted) return Promise.resolve(found);
    return new Promise((resolve) => {
      const finish = (result: ReturnType<typeof find>) => {
        observer.disconnect();
        clearTimeout(timer);
        signal.removeEventListener('abort', onAbort);
        resolve(result);
      };
      const observer = new MutationObserver(() => {
        const result = find();
        if (result) finish(result);
      });
      const onAbort = () => finish(null);
      const timer = window.setTimeout(() => finish(null), timeoutMs);
      observer.observe(document.body, { childList: true, subtree: true });
      signal.addEventListener('abort', onAbort, { once: true });
    });
  }
  async initialize(signal: AbortSignal): Promise<boolean> {
    let userOverride = '';
    let autoDetected = '';
    try {
      userOverride = localStorage.getItem('geminiTimelineUserTurnSelector') || '';
      autoDetected = localStorage.getItem('geminiTimelineUserTurnSelectorAuto') || '';
    } catch {}
    const defaultCandidates = getGeminiTurnSelectors('turn.user');
    // Compatibility strategy:
    // - Keep explicit user override as highest priority.
    // - Prefer built-in defaults over auto-detected cache, so stale auto cache can self-heal after refresh.
    let candidates = [...defaultCandidates];
    if (userOverride.length) {
      candidates = [userOverride, ...defaultCandidates.filter((s) => s !== userOverride)];
    } else {
      const cached = autoDetected;
      if (cached && !candidates.includes(cached)) candidates.push(cached);
    }
    let firstTurn: Element | null = null;
    let matchedSelector = '';
    const found = await this.waitForAnyElement(candidates, signal, 4000);
    if (found) {
      firstTurn = found.element;
      matchedSelector = found.selector;
      this.userTurnSelector = matchedSelector;
    }
    if (!firstTurn) {
      this.conversationContainer =
        (document.querySelector('main') as HTMLElement) || (document.body as HTMLElement);
      this.userTurnSelector = defaultCandidates.join(',');
    } else {
      // Scope selection/observers:
      // - Broad scope (main/body) if the user's explicit override matched, or the matched
      //   selector belongs to Gemini's Angular layout, where turns are not siblings
      // - Otherwise, scope to the immediate parent for performance
      const needsConversationScope =
        getGeminiUserTurnObserverScope(matchedSelector) === 'conversation';
      if ((userOverride && matchedSelector === userOverride) || needsConversationScope) {
        this.conversationContainer =
          (document.querySelector('main') as HTMLElement) || (document.body as HTMLElement);
      } else {
        const parent = firstTurn.parentElement as HTMLElement | null;
        if (!parent) return false;
        this.conversationContainer = parent;
      }
      // Persist auto-detected selector for future sessions when no explicit user override exists
      if (!userOverride && matchedSelector) {
        try {
          localStorage.setItem('geminiTimelineUserTurnSelectorAuto', matchedSelector);
        } catch {}
      }
      // If a stale user override failed (matchedSelector differs), clear it so we don't keep retrying it
      if (userOverride && matchedSelector && matchedSelector !== userOverride) {
        try {
          localStorage.removeItem('geminiTimelineUserTurnSelector');
        } catch {}
      }
    }
    return true;
  }
}
