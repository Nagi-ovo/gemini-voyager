import { StorageKeys } from '@/core/types/common';
import { isExtensionContextInvalidatedError } from '@/core/utils/extensionContext';
import { getAssistantTurnSelectors } from '@/core/utils/selectors';

import { ResponseCompletionDetector } from './detector';

const LOG_PREFIX = '[ResponseNotification]';
const PAGE_OBSERVER_SOURCE = 'gemini-voyager-response-complete-observer';
const PAGE_OBSERVER_SCRIPT_ID = 'gv-response-complete-observer-script';
const EVALUATE_DEBOUNCE_MS = 250;
const STARTUP_DELAY_MS = 1000;
const MAX_FINGERPRINT_TEXT_LENGTH = 400;

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

let enabled = false;
let observer: MutationObserver | null = null;
let evaluateTimer: number | null = null;
let startupTimer: number | null = null;
let pageObserverInjected = false;
let activeNetworkRequestCount = 0;
let hasPendingBackgroundCompletion = false;
let storageListener:
  | ((changes: Record<string, chrome.storage.StorageChange>, areaName: string) => void)
  | null = null;

const detector = new ResponseCompletionDetector();

function getConversationKey(): string {
  return `${location.pathname}${location.search}`;
}

function shouldNotifyForBackgroundCompletion(): boolean {
  return document.visibilityState !== 'visible' || !document.hasFocus();
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
  for (let depth = 0; current && depth < 4; depth += 1) {
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

async function sendCompletionNotification(): Promise<void> {
  try {
    await chrome.runtime?.sendMessage?.({
      type: 'gv.responseComplete.notify',
      payload: {
        conversationUrl: location.href,
      },
    });
  } catch (error) {
    if (isExtensionContextInvalidatedError(error)) {
      return;
    }
    console.warn(LOG_PREFIX, 'Failed to send completion notification:', error);
  }
}

function injectPageObserver(): void {
  if (pageObserverInjected) return;
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

  void sendCompletionNotification();
  detector.reset();
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
    void sendCompletionNotification();
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
  activeNetworkRequestCount = 0;
  hasPendingBackgroundCompletion = false;
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
