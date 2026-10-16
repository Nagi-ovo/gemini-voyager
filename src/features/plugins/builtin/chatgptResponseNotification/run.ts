import type { SiteAdapter } from '@/features/plugins/types';
import {
  createResponseFingerprinter,
  sendCompletionNotification,
  shouldNotifyForBackgroundCompletion,
} from '@/pages/content/responseNotification/completionDelivery';
import {
  type CompletionPort,
  completionEffects,
  startCompletion,
} from '@/pages/content/responseNotification/completionMachine';
import { ResponseCompletionDetector } from '@/pages/content/responseNotification/detector';
import { createForegroundCompletionToast } from '@/pages/content/responseNotification/foregroundCompletionToast';
import { watchRouteChanges } from '@/pages/content/utils/routeWatcher';

import {
  createChatGptPage,
  getChatGptConversationTitle,
  getReplyIdentity,
  hasReplyActions,
  isSameConversation,
  readConversationId,
} from './page';

const EVALUATE_DEBOUNCE_MS = 250;
const STARTUP_DELAY_MS = 1000;

export interface ChatGptResponseNotificationRunOptions {
  /** Aborting it stops the run, like calling the returned stop. */
  readonly signal?: AbortSignal;
  /** The site adapter the host resolved; its selectors name the page's parts. */
  readonly adapter?: SiteAdapter | null;
}

/**
 * One ChatGPT completion run while the plugin is mounted. ChatGPT has no
 * network observer here. A reply is being written while a prompt sent from
 * this page still waits for it, or while a stop control under a known label
 * shows; the reply counts once that is over and its action row has rendered.
 */
export function createChatGptResponseNotificationRun({
  signal,
  adapter = null,
}: ChatGptResponseNotificationRunOptions = {}): () => void {
  if (signal?.aborted) return () => {};

  const page = createChatGptPage(adapter);
  let alive = true;
  let evaluateTimer: number | null = null;
  let evaluateDueAt = 0;
  let conversationId = readConversationId();
  // Bumped when the page leaves the conversation: a generation seen there must not finish here.
  let epoch = 0;
  let wasGenerating = false;
  // The user sent a prompt here: only then does a prompt without its reply mean writing,
  // since opening a conversation can render a prompt before its reply as well.
  let promptSent = false;
  // The latest reply when the generation began; a dictation or a stop with no new text is no reply.
  let replyAtStart: string | null = null;
  // A labelled stop control was seen this generation, so its going away marks the end.
  let sawLabelledStop = false;
  let latestCompletedReply: HTMLElement | null = null;

  const detector = new ResponseCompletionDetector();
  const responseFingerprint = createResponseFingerprinter();
  const foregroundToast = createForegroundCompletionToast({
    getScrollTarget: () => latestCompletedReply ?? page.getLatestReply(),
  });

  const deliveryEffects = completionEffects({
    notify: (reply) =>
      sendCompletionNotification({
        conversationTitle: getChatGptConversationTitle(),
        userPrompt: page.getPromptForReply(reply),
      }),
    showToast: (reply) => {
      latestCompletedReply = reply;
      foregroundToast.showIfNeeded(reply);
    },
    canFlush: () => {
      syncConversation();
      return !shouldNotifyForBackgroundCompletion();
    },
  } satisfies CompletionPort);
  // One delivery per generation: the next one stops it, with its stop or deferred toast.
  let delivery = startCompletion(deliveryEffects);

  /** A generation starts; a delivery still streaming is as good as a fresh one. */
  const beginGeneration = (): void => {
    if (delivery.state.status === 'streaming') return;
    void delivery.stop();
    delivery = startCompletion(deliveryEffects);
  };

  const clearEvaluateTimer = (): void => {
    if (evaluateTimer === null) return;
    clearTimeout(evaluateTimer);
    evaluateTimer = null;
  };

  const leaveConversation = (): void => {
    epoch += 1;
    wasGenerating = false;
    promptSent = false;
    replyAtStart = null;
    sawLabelledStop = false;
    latestCompletedReply = null;
    detector.reset();
    foregroundToast.stop();
    beginGeneration();
  };

  const syncConversation = (): void => {
    const current = readConversationId();
    if (isSameConversation(conversationId, current)) {
      conversationId = current;
      return;
    }
    conversationId = current;
    leaveConversation();
  };

  const isGenerating = (): boolean =>
    page.hasLabelledStopControl() || (promptSent && page.isAwaitingReply());

  const evaluate = (): void => {
    evaluateTimer = null;
    if (!alive) return;
    syncConversation();

    const generating = isGenerating();
    const reply = page.getLatestReply();
    if (generating && !wasGenerating) {
      beginGeneration();
      replyAtStart = reply ? getReplyIdentity(reply) : null;
      sawLabelledStop = false;
    }
    if (wasGenerating && !generating) promptSent = false;
    wasGenerating = generating;
    if (generating && page.hasLabelledStopControl()) sawLabelledStop = true;
    const isNewReply = !!reply && getReplyIdentity(reply) !== replyAtStart;
    // The action row marks a finished reply in any language, and renders in a hidden tab too.
    // A hidden tab may still hold it back, as Gemini's does; there a labelled stop control that
    // has gone is the end as well. Without one, a reply cut off mid-stream must not count.
    const hidden = document.visibilityState === 'hidden';
    const decision = detector.update({
      conversationKey: location.pathname,
      sessionEpoch: epoch,
      hasCompletedResponse:
        !!reply && isNewReply && (hasReplyActions(reply) || (hidden && sawLabelledStop)),
      isGenerating: generating,
      responseFingerprint: reply ? responseFingerprint(reply) : null,
      now: Date.now(),
    });
    const pendingDelay = detector.getPendingEvaluationDelay(Date.now());
    // The page may go quiet before the stability window ends, so recheck without a mutation.
    if (pendingDelay !== null) scheduleEvaluate(pendingDelay);
    if (decision.type !== 'notify' || !reply) return;
    delivery.send({ type: 'completed', reply, background: shouldNotifyForBackgroundCompletion() });
  };

  function scheduleEvaluate(delay = EVALUATE_DEBOUNCE_MS): void {
    if (!alive) return;
    const dueAt = Date.now() + delay;
    // Streaming mutations must not keep pushing an already scheduled check into the future.
    if (evaluateTimer !== null && evaluateDueAt <= dueAt) return;
    clearEvaluateTimer();
    evaluateDueAt = dueAt;
    evaluateTimer = window.setTimeout(evaluate, delay);
  }

  const noteSend = (): void => {
    promptSent = true;
    // Whatever reply a stopped generation left is not this send's; an empty Enter adds none.
    if (delivery.state.status === 'ended' && delivery.state.reason === 'stopped') {
      const reply = page.getLatestReply();
      replyAtStart = reply ? getReplyIdentity(reply) : null;
    }
    // A send right after stop, before any check saw the stop end, is a new generation.
    beginGeneration();
  };

  const handleSendGesture = (event: Event): void => {
    if (page.isSendGesture(event)) noteSend();
  };

  // A reply streaming in view under an unknown label no longer reads as generating, so a stop
  // click is taken whenever it lands; the next generation's delivery replaces it.
  const handleClick = (event: Event): void => {
    if (page.isSendGesture(event)) {
      noteSend();
      return;
    }
    if (page.isStopControlTarget(event.target))
      delivery.send({ type: 'abandoned', reason: 'stopped' });
  };

  // A short reply can show and drop the stop control between two checks (a hidden tab's timers
  // wait at least a second), so the start is latched as soon as a mutation shows it.
  const noteGenerationStart = (): void => {
    if (wasGenerating) return;
    syncConversation();
    if (!isGenerating()) return;
    beginGeneration();
    const reply = page.getLatestReply();
    replyAtStart = reply ? getReplyIdentity(reply) : null;
    sawLabelledStop = page.hasLabelledStopControl();
    wasGenerating = true;
    detector.update({
      conversationKey: location.pathname,
      sessionEpoch: epoch,
      hasCompletedResponse: false,
      isGenerating: true,
      responseFingerprint: null,
      now: Date.now(),
    });
  };

  const observer = new MutationObserver(() => {
    noteGenerationStart();
    scheduleEvaluate();
  });
  observer.observe(document.body ?? document.documentElement, {
    childList: true,
    subtree: true,
    characterData: true,
    attributes: true,
    attributeFilter: ['aria-label', 'class', 'style', 'hidden'],
  });
  const stopRouteWatch = watchRouteChanges(() => {
    syncConversation();
    scheduleEvaluate();
  });
  document.addEventListener('click', handleClick, true);
  document.addEventListener('keydown', handleSendGesture, true);
  scheduleEvaluate(STARTUP_DELAY_MS);

  const stop = (): void => {
    if (!alive) return;
    alive = false;
    signal?.removeEventListener('abort', stop);
    observer.disconnect();
    stopRouteWatch();
    document.removeEventListener('click', handleClick, true);
    document.removeEventListener('keydown', handleSendGesture, true);
    clearEvaluateTimer();
    detector.reset();
    foregroundToast.stop();
    void delivery.stop();
  };
  signal?.addEventListener('abort', stop, { once: true });
  return stop;
}
