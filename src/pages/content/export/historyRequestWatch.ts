/**
 * Gemini's history-page requests (`hNvQHb`), as announced by the MAIN-world
 * `public/conversation-history-observer.js` with `request` start/end messages.
 *
 * Gemini fetches an older page as soon as the topmost turn scrolls into view and
 * sends nothing once the conversation's first turn is loaded. The export preload
 * therefore keeps waiting while a page is on its way, however slow the network,
 * instead of reading a quiet second as the start of the conversation.
 */
import { OBS_SRC } from '../timestamp/historyTimestamps';

/**
 * Time the page gets to render a page after its body arrived: local work, measured at about
 * 50 ms. A changed page ends the wait at once, so the margin only costs time when nothing renders.
 */
const HISTORY_RENDER_GRACE_MS = 2000;

export interface HistoryRequestWatch {
  /** A history page is in flight, or arrived too recently to have rendered. */
  isLoading(): boolean;
  stop(): void;
}

export function watchHistoryRequests(): HistoryRequestWatch {
  let inFlight = 0;
  let lastEndAt: number | null = null;

  const onMessage = (ev: MessageEvent) => {
    if (ev.source !== window || ev.origin !== window.location.origin) return;
    const data = ev.data as { source?: unknown; type?: unknown; payload?: unknown } | null;
    if (!data || data.source !== OBS_SRC || data.type !== 'request') return;
    const phase = (data.payload as { phase?: unknown } | null)?.phase;
    if (phase === 'start') {
      inFlight += 1;
    } else if (phase === 'end') {
      inFlight = Math.max(0, inFlight - 1);
      lastEndAt = Date.now();
    }
  };
  window.addEventListener('message', onMessage);

  return {
    isLoading: () =>
      inFlight > 0 || (lastEndAt !== null && Date.now() - lastEndAt < HISTORY_RENDER_GRACE_MS),
    stop: () => window.removeEventListener('message', onMessage),
  };
}
