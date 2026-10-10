import { StorageKeys } from '@/core/types/common';
import { getVoyagerBuildTarget } from '@/core/utils/browser';
import { isExtensionContextInvalidatedError } from '@/core/utils/extensionContext';
import { getAssistantTurnSelectors } from '@/core/utils/selectors';

import { ResponseCompletionDetector } from './detector';
import { createForegroundCompletionToast } from './foregroundCompletionToast';

const LOG_PREFIX = '[ResponseNotification]';
const PAGE_OBSERVER_SOURCE = 'gemini-voyager-response-complete-observer';
const PAGE_OBSERVER_SCRIPT_ID = 'gv-response-complete-observer-script';
const EVALUATE_DEBOUNCE_MS = 250;
const STARTUP_DELAY_MS = 1000;
const MAX_FINGERPRINT_TEXT_LENGTH = 400;
const MAX_NOTIFICATION_TITLE_LENGTH = 80;
const MAX_NOTIFICATION_PROMPT_LENGTH = 140;
const PROMPT_SELECTORS = 'rich-textarea, textarea, [contenteditable="true"], div[role="textbox"]';
// Anchored to the start, so it only strips leading invisible characters and can
// never split an emoji sequence in the label body.
const TURN_LABEL_PREFIXES =
  // oxlint-disable-next-line no-misleading-character-class
  /^[\u200B\u200C\u200D\u200E\u200F\uFEFF]*(?:you said|you wrote|user message|your prompt|you asked)[:\s]*/i;
const VISUALLY_HIDDEN_CLASS_FRAGMENT = 'visually-hidden';
const INJECTED_UI_SELECTOR = '.gv-fork-btn, .gv-fork-indicator-group';
const COMPLETION_ACTION_MAX_PARENT_DEPTH = 4;

const GENERATING_SELECTORS = [
  '[aria-busy="true"]',
  '[role="progressbar"]',
  '.mat-mdc-progress-spinner',
  '.mat-progress-spinner',
  'button[aria-label*="Stop"]',
  'button[aria-label*="Cancel"]',
  'button[aria-label*="停止"]',
  'button[aria-label*="取消"]',
  'button[data-test-id*="stop"]',
  'button[data-test-id*="cancel"]',
] as const;

const COMPLETION_ACTION_SELECTORS = [
  '[data-test-id="copy-button"]',
  '[data-test-id="more-menu-button"]',
  'button[aria-label^="Copy"]',
  'button[aria-label*="Copy response"]',
  'button[aria-label*="Good response"]',
  'button[aria-label*="Bad response"]',
  'button[aria-label*="复制"]',
  'button[aria-label*="更多"]',
  'mat-icon[fonticon="content_copy"]',
  'mat-icon[fonticon="thumb_up"]',
  'mat-icon[fonticon="thumb_down"]',
] as const;

const USER_PROMPT_SELECTORS = [
  '[data-message-author-role="user"]',
  '[data-testid*="user"]',
  '[data-test-id*="user"]',
  '[class*="user-query"]',
  '[class*="userQuery"]',
  'user-query',
] as const;

let enabled = false;
let observer: MutationObserver | null = null;
let evaluateTimer: number | null = null;
let startupTimer: number | null = null;
let pageObserverInjected = false;
let activeNetworkRequestCount = 0;
let hasPendingBackgroundCompletion = false;
let hasDeferredForegroundCompletion = false;
let latestCompletedResponse: HTMLElement | null = null;
const foregroundToastArmedConversationKeys = new Set<string>();
let storageListener:
  | ((changes: Record<string, chrome.storage.StorageChange>, areaName: string) => void)
  | null = null;

const detector = new ResponseCompletionDetector();
const foregroundToast = createForegroundCompletionToast({
  getScrollTarget: () => latestCompletedResponse ?? getLatestAssistantResponse(),
});

function getConversationKey(): string {
  return `${location.pathname}${location.search}`;
}

function shouldNotifyForBackgroundCompletion(): boolean {
  return document.visibilityState !== 'visible' || !document.hasFocus();
}

function isPromptInteractionTarget(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false;
  return !!target.closest(PROMPT_SELECTORS);
}

function markCompletionNotificationArmed(): void {
  foregroundToastArmedConversationKeys.add(getConversationKey());
}

function shouldSuppressWithoutPromptInteraction(): boolean {
  const conversationKey = getConversationKey();
  if (foregroundToastArmedConversationKeys.delete(conversationKey)) return false;
  return true;
}

function handlePromptInteraction(event: Event): void {
  if (!isPromptInteractionTarget(event.target)) return;
  markCompletionNotificationArmed();
}

function isElementVisible(element: Element): boolean {
  if (!(element instanceof HTMLElement)) return false;
  return !!(element.offsetWidth || element.offsetHeight || element.getClientRects().length);
}

function hasGeneratingIndicator(): boolean {
  return GENERATING_SELECTORS.some((selector) => {
    try {
      return Array.from(document.querySelectorAll(selector)).some(isElementVisible);
    } catch {
      return false;
    }
  });
}

function getLatestAssistantResponse(): HTMLElement | null {
  const selector = getAssistantTurnSelectors().join(', ');
  const responses = Array.from(document.querySelectorAll<HTMLElement>(selector)).filter((element) =>
    element.textContent?.trim(),
  );
  return responses.at(-1) ?? null;
}

function hasCompletionActions(response: HTMLElement): boolean {
  let current: HTMLElement | null = response;
  for (let depth = 0; current && depth < COMPLETION_ACTION_MAX_PARENT_DEPTH; depth += 1) {
    const hasActions = COMPLETION_ACTION_SELECTORS.some((selector) => {
      try {
        return !!current?.querySelector(selector);
      } catch {
        return false;
      }
    });
    if (hasActions) return true;
    current = current.parentElement;
  }

  return false;
}

function getResponseFingerprint(response: HTMLElement): string | null {
  const text = response.textContent?.replace(/\s+/g, ' ').trim() ?? '';
  if (!text) return null;

  const boundedText =
    text.length > MAX_FINGERPRINT_TEXT_LENGTH ? text.slice(-MAX_FINGERPRINT_TEXT_LENGTH) : text;
  return `${text.length}:${boundedText}`;
}

function normalizeNotificationText(text: string | null | undefined, maxLength: number): string {
  const normalized = (text ?? '').replace(/\s+/g, ' ').trim().replace(TURN_LABEL_PREFIXES, '');
  if (!normalized) return '';
  return normalized.length > maxLength ? `${normalized.slice(0, maxLength - 1)}…` : normalized;
}

function getConversationTitle(): string {
  const titleFromDocument = normalizeNotificationText(
    document.title.replace(/\s*[-|]\s*Gemini\s*$/i, '').replace(/\s*[-|]\s*Google\s*$/i, ''),
    MAX_NOTIFICATION_TITLE_LENGTH,
  );
  if (titleFromDocument && !/^gemini$/i.test(titleFromDocument)) return titleFromDocument;

  const heading = Array.from(document.querySelectorAll<HTMLElement>('h1, h2, [role="heading"]'))
    .map((element) => normalizeNotificationText(element.textContent, MAX_NOTIFICATION_TITLE_LENGTH))
    .find((text) => text && !/^gemini$/i.test(text));

  return heading ?? '';
}

function isInsideAssistantResponse(element: Element): boolean {
  const selector = getAssistantTurnSelectors().join(', ');
  try {
    return !!element.closest(selector);
  } catch {
    return false;
  }
}

function hasVisuallyHiddenClass(element: Element): boolean {
  if (!(element instanceof HTMLElement) || element.classList.length === 0) return false;
  return Array.from(element.classList).some((className) =>
    className.toLowerCase().includes(VISUALLY_HIDDEN_CLASS_FRAGMENT),
  );
}

function getVisibleElementText(element: HTMLElement): string {
  try {
    const clone = element.cloneNode(true) as HTMLElement;
    if (hasVisuallyHiddenClass(clone)) return '';

    Array.from(clone.getElementsByTagName('*')).forEach((descendant) => {
      if (hasVisuallyHiddenClass(descendant)) descendant.remove();
    });
    clone.querySelectorAll(INJECTED_UI_SELECTOR).forEach((descendant) => descendant.remove());
    clone.querySelectorAll<HTMLElement>('[data-user-latex-original]').forEach((descendant) => {
      descendant.textContent = descendant.dataset.userLatexOriginal ?? '';
    });

    return clone.textContent ?? '';
  } catch {
    return element.textContent ?? '';
  }
}

function getLatestUserPrompt(): string {
  const candidates: HTMLElement[] = [];

  for (const selector of USER_PROMPT_SELECTORS) {
    try {
      candidates.push(...Array.from(document.querySelectorAll<HTMLElement>(selector)));
    } catch {
      // Ignore selectors that do not match the current Gemini DOM.
    }
  }

  const promptTexts = candidates
    .filter((element) => !isInsideAssistantResponse(element) && !isPromptInteractionTarget(element))
    .map((element) =>
      normalizeNotificationText(getVisibleElementText(element), MAX_NOTIFICATION_PROMPT_LENGTH),
    )
    .filter((text) => text.length > 0);

  return promptTexts.at(-1) ?? '';
}

async function sendCompletionNotification(): Promise<boolean> {
  try {
    const response = (await chrome.runtime?.sendMessage?.({
      type: 'gv.responseComplete.notify',
      payload: {
        conversationUrl: location.href,
        conversationTitle: getConversationTitle(),
        userPrompt: getLatestUserPrompt(),
      },
    })) as { ok?: boolean } | undefined;

    return response?.ok === true;
  } catch (error) {
    if (isExtensionContextInvalidatedError(error)) {
      return false;
    }
    console.warn(LOG_PREFIX, 'Failed to send completion notification:', error);
    return false;
  }
}

function queueDeferredForegroundCompletion(): void {
  hasDeferredForegroundCompletion = true;
}

function flushDeferredForegroundCompletion(): void {
  if (!enabled || !hasDeferredForegroundCompletion || shouldNotifyForBackgroundCompletion()) {
    return;
  }

  hasDeferredForegroundCompletion = false;
  latestCompletedResponse = getLatestAssistantResponse();
  foregroundToast.showIfNeeded(latestCompletedResponse);
}

async function notifyOrQueueForegroundFallback(): Promise<void> {
  const notified = await sendCompletionNotification();
  if (!notified) {
    queueDeferredForegroundCompletion();
  }
}

async function notifyLatestCompletedResponseNow(): Promise<void> {
  const latestResponse = getLatestAssistantResponse();
  const decision = detector.notifyImmediately({
    conversationKey: getConversationKey(),
    hasCompletedResponse: !!latestResponse && hasCompletionActions(latestResponse),
    isGenerating: hasGeneratingIndicator(),
    responseFingerprint: latestResponse ? getResponseFingerprint(latestResponse) : null,
    now: Date.now(),
  });

  if (decision.type !== 'notify') return;

  latestCompletedResponse = latestResponse;
  await notifyOrQueueForegroundFallback();
}

function injectPageObserver(): void {
  if (pageObserverInjected) return;
  if (getVoyagerBuildTarget() === 'safari') {
    pageObserverInjected = true;
    return;
  }
  if (document.getElementById(PAGE_OBSERVER_SCRIPT_ID)) {
    pageObserverInjected = true;
    return;
  }

  try {
    const script = document.createElement('script');
    script.id = PAGE_OBSERVER_SCRIPT_ID;
    script.src = chrome.runtime.getURL('response-complete-observer.js');
    script.async = false;
    (document.documentElement || document.head || document.body).appendChild(script);
    script.remove();
    pageObserverInjected = true;
  } catch (error) {
    if (isExtensionContextInvalidatedError(error)) {
      return;
    }
    console.warn(LOG_PREFIX, 'Failed to inject page observer:', error);
  }
}

function handlePageObserverMessage(event: MessageEvent): void {
  if (!enabled || event.source !== window) return;
  const data = event.data as {
    source?: string;
    type?: string;
    payload?: { requestId?: number; duration?: number; shouldNotify?: boolean };
  } | null;
  if (!data || data.source !== PAGE_OBSERVER_SOURCE) return;

  if (data.type === 'request-start') {
    activeNetworkRequestCount += 1;
    detector.update({
      conversationKey: getConversationKey(),
      hasCompletedResponse: false,
      isGenerating: true,
      responseFingerprint: null,
      now: Date.now(),
    });
    return;
  }

  if (data.type !== 'request-complete') return;

  activeNetworkRequestCount = Math.max(0, activeNetworkRequestCount - 1);
  hasPendingBackgroundCompletion =
    hasPendingBackgroundCompletion || data.payload?.shouldNotify === true;
  if (activeNetworkRequestCount > 0) return;
  if (!hasPendingBackgroundCompletion) return;
  hasPendingBackgroundCompletion = false;
  if (!shouldNotifyForBackgroundCompletion()) {
    scheduleEvaluate(0);
    return;
  }

  void notifyLatestCompletedResponseNow();
}

function evaluate(): void {
  evaluateTimer = null;
  if (!enabled) return;

  const latestResponse = getLatestAssistantResponse();
  const decision = detector.update({
    conversationKey: getConversationKey(),
    hasCompletedResponse: !!latestResponse && hasCompletionActions(latestResponse),
    isGenerating: hasGeneratingIndicator(),
    responseFingerprint: latestResponse ? getResponseFingerprint(latestResponse) : null,
    now: Date.now(),
  });

  if (decision.type === 'notify') {
    latestCompletedResponse = latestResponse;
    if (shouldNotifyForBackgroundCompletion()) {
      void notifyOrQueueForegroundFallback();
      return;
    }
    if (shouldSuppressWithoutPromptInteraction()) return;
    foregroundToast.showIfNeeded(latestResponse);
  }
}

function scheduleEvaluate(delay = EVALUATE_DEBOUNCE_MS): void {
  if (!enabled) return;
  if (evaluateTimer !== null) {
    clearTimeout(evaluateTimer);
  }
  evaluateTimer = window.setTimeout(evaluate, delay);
}

function startObserver(): void {
  if (observer || !document.body) return;

  injectPageObserver();
  window.addEventListener('message', handlePageObserverMessage);
  window.addEventListener('focus', flushDeferredForegroundCompletion);
  document.addEventListener('visibilitychange', flushDeferredForegroundCompletion);
  document.addEventListener('input', handlePromptInteraction, true);
  document.addEventListener('keydown', handlePromptInteraction, true);
  observer = new MutationObserver(() => scheduleEvaluate());
  observer.observe(document.body, {
    childList: true,
    subtree: true,
    characterData: true,
    attributes: true,
    attributeFilter: ['aria-busy', 'aria-label', 'data-test-id', 'class'],
  });
  scheduleEvaluate(STARTUP_DELAY_MS);
}

function stopObserver(): void {
  window.removeEventListener('message', handlePageObserverMessage);
  window.removeEventListener('focus', flushDeferredForegroundCompletion);
  document.removeEventListener('visibilitychange', flushDeferredForegroundCompletion);
  document.removeEventListener('input', handlePromptInteraction, true);
  document.removeEventListener('keydown', handlePromptInteraction, true);
  if (observer) {
    observer.disconnect();
    observer = null;
  }
  if (evaluateTimer !== null) {
    clearTimeout(evaluateTimer);
    evaluateTimer = null;
  }
  if (startupTimer !== null) {
    clearTimeout(startupTimer);
    startupTimer = null;
  }
  foregroundToast.stop();
  activeNetworkRequestCount = 0;
  hasPendingBackgroundCompletion = false;
  hasDeferredForegroundCompletion = false;
  latestCompletedResponse = null;
  detector.reset();
}

function reconcile(): void {
  if (enabled) {
    if (document.body) {
      startObserver();
      return;
    }

    if (startupTimer === null) {
      startupTimer = window.setTimeout(() => {
        startupTimer = null;
        reconcile();
      }, EVALUATE_DEBOUNCE_MS);
    }
    return;
  }

  stopObserver();
}

async function loadEnabledSetting(): Promise<void> {
  try {
    const result = await chrome.storage?.sync?.get({
      [StorageKeys.RESPONSE_COMPLETE_NOTIFICATION_ENABLED]: false,
    });
    enabled = result?.[StorageKeys.RESPONSE_COMPLETE_NOTIFICATION_ENABLED] === true;
  } catch (error) {
    if (isExtensionContextInvalidatedError(error)) {
      return;
    }
    console.warn(LOG_PREFIX, 'Failed to load setting:', error);
  }
}

function setupStorageListener(): void {
  if (storageListener) return;

  storageListener = (changes, areaName) => {
    if (areaName !== 'sync') return;
    const change = changes[StorageKeys.RESPONSE_COMPLETE_NOTIFICATION_ENABLED];
    if (!change) return;

    enabled = change.newValue === true;
    reconcile();
  };

  try {
    chrome.storage?.onChanged?.addListener(storageListener);
  } catch (error) {
    if (isExtensionContextInvalidatedError(error)) {
      return;
    }
    console.warn(LOG_PREFIX, 'Failed to attach storage listener:', error);
  }
}

function cleanup(): void {
  enabled = false;
  stopObserver();
  if (storageListener) {
    try {
      chrome.storage?.onChanged?.removeListener(storageListener);
    } catch {}
    storageListener = null;
  }
}

export async function startResponseCompleteNotification(): Promise<() => void> {
  setupStorageListener();
  await loadEnabledSetting();
  reconcile();
  return cleanup;
}
