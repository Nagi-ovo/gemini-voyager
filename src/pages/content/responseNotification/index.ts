import { StorageKeys } from '@/core/types/common';
import { isExtensionContextInvalidatedError } from '@/core/utils/extensionContext';
import { getAssistantTurnSelectors } from '@/core/utils/selectors';

import { ResponseCompletionDetector } from './detector';

const LOG_PREFIX = '[ResponseNotification]';
const PAGE_OBSERVER_SOURCE = 'gemini-voyager-response-complete-observer';
const PAGE_OBSERVER_SCRIPT_ID = 'gv-response-complete-observer-script';
const FOREGROUND_TOAST_ID = 'gv-response-complete-toast';
const FOREGROUND_TOAST_TEXT = '新对话已完成';
const EVALUATE_DEBOUNCE_MS = 250;
const STARTUP_DELAY_MS = 1000;
const FOREGROUND_TOAST_VISIBLE_MS = 3200;
const MAX_FINGERPRINT_TEXT_LENGTH = 400;
const LATEST_RESPONSE_VISIBLE_MARGIN_PX = 96;
const BOTTOM_SCROLL_THRESHOLD_PX = 160;
const PROMPT_SELECTORS = 'rich-textarea, textarea, [contenteditable="true"], div[role="textbox"]';

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
let toastHideTimer: number | null = null;
let latestCompletedResponse: HTMLElement | null = null;
const foregroundToastArmedConversationKeys = new Set<string>();
const suppressedInitialForegroundToastConversationKeys = new Set<string>();
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

function isPromptInteractionTarget(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false;
  return !!target.closest(PROMPT_SELECTORS);
}

function markForegroundToastArmed(): void {
  foregroundToastArmedConversationKeys.add(getConversationKey());
}

function shouldSuppressInitialForegroundToast(): boolean {
  const conversationKey = getConversationKey();
  if (foregroundToastArmedConversationKeys.has(conversationKey)) return false;
  if (suppressedInitialForegroundToastConversationKeys.has(conversationKey)) return false;

  suppressedInitialForegroundToastConversationKeys.add(conversationKey);
  return true;
}

function handlePromptInteraction(event: Event): void {
  if (isPromptInteractionTarget(event.target)) {
    markForegroundToastArmed();
  }
}

function getPromptContainerRect(): DOMRect | null {
  const promptElements = Array.from(document.querySelectorAll<HTMLElement>(PROMPT_SELECTORS));
  let bestRect: DOMRect | null = null;
  let bestScore = -Infinity;

  for (const promptElement of promptElements) {
    let current: HTMLElement | null = promptElement;

    for (let depth = 0; current && depth < 10; depth += 1) {
      const rect = current.getBoundingClientRect();
      const isVisible =
        rect.width > 280 &&
        rect.height >= 44 &&
        rect.height <= 260 &&
        rect.top > 0 &&
        rect.bottom <= window.innerHeight + 8 &&
        rect.right > 0 &&
        rect.left < window.innerWidth;

      if (isVisible) {
        const style = window.getComputedStyle(current);
        const borderRadius = Number.parseFloat(style.borderTopLeftRadius || '0');
        const distanceFromBottom = Math.abs(window.innerHeight - rect.bottom - 72);
        const widthScore = Math.min(rect.width, 900) / 10;
        const roundedScore = Math.min(borderRadius, 36) * 4;
        const bottomScore = Math.max(0, 220 - distanceFromBottom);
        const depthPenalty = depth * 8;
        const fullPagePenalty = rect.width > window.innerWidth * 0.95 ? 180 : 0;
        const score = widthScore + roundedScore + bottomScore - depthPenalty - fullPagePenalty;

        if (score > bestScore) {
          bestScore = score;
          bestRect = rect;
        }
      }

      current = current.parentElement;
    }
  }

  return bestRect;
}

function getDocumentScrollRoot(): HTMLElement {
  return document.scrollingElement instanceof HTMLElement
    ? document.scrollingElement
    : document.documentElement;
}

function getScrollRoot(anchor: Element | null = null): HTMLElement {
  let current = anchor?.parentElement ?? null;

  while (current && current !== document.body) {
    const style = window.getComputedStyle(current);
    const hasScrollableOverflow = /auto|scroll|overlay/.test(style.overflowY);
    if (
      hasScrollableOverflow &&
      current.scrollHeight - current.clientHeight > BOTTOM_SCROLL_THRESHOLD_PX
    ) {
      return current;
    }
    current = current.parentElement;
  }

  return getDocumentScrollRoot();
}

function getRemainingScrollDistance(anchor: Element | null = null): number {
  const scrollRoot = getScrollRoot(anchor);
  return Math.max(0, scrollRoot.scrollHeight - scrollRoot.scrollTop - scrollRoot.clientHeight);
}

function isLatestResponseVisible(response: HTMLElement): boolean {
  const rect = response.getBoundingClientRect();
  if (rect.height <= 0 || rect.width <= 0) return false;

  return (
    rect.bottom >= LATEST_RESPONSE_VISIBLE_MARGIN_PX &&
    rect.top <= window.innerHeight - LATEST_RESPONSE_VISIBLE_MARGIN_PX
  );
}

function shouldShowForegroundCompletionToast(response: HTMLElement | null): boolean {
  if (!response) return false;
  if (isLatestResponseVisible(response)) return false;
  return getRemainingScrollDistance(response) > BOTTOM_SCROLL_THRESHOLD_PX;
}

function scrollToLatestResponse(): void {
  const target = latestCompletedResponse ?? getLatestAssistantResponse();

  if (target) {
    target.scrollIntoView({
      block: 'end',
      behavior: 'smooth',
    });
  } else {
    const scrollRoot = getScrollRoot();
    scrollRoot.scrollTo({
      top: scrollRoot.scrollHeight,
      behavior: 'smooth',
    });
  }

  hideForegroundCompletionToast();
}

function ensureForegroundToast(): HTMLDivElement {
  const existing = document.getElementById(FOREGROUND_TOAST_ID);
  if (existing instanceof HTMLDivElement) return existing;

  const toast = document.createElement('div');
  toast.id = FOREGROUND_TOAST_ID;
  toast.textContent = FOREGROUND_TOAST_TEXT;
  toast.setAttribute('role', 'button');
  toast.setAttribute('aria-live', 'polite');
  toast.tabIndex = 0;
  toast.addEventListener('click', scrollToLatestResponse);
  toast.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    event.preventDefault();
    scrollToLatestResponse();
  });
  Object.assign(toast.style, {
    position: 'fixed',
    left: '50%',
    bottom: '148px',
    transform: 'translate(-50%, 10px)',
    zIndex: '2147483647',
    minWidth: '150px',
    maxWidth: 'min(78vw, 280px)',
    boxSizing: 'border-box',
    padding: '10px 24px',
    borderRadius: '999px',
    background: 'rgba(232, 240, 254, 0.96)',
    color: '#1f1f1f',
    fontSize: '16px',
    lineHeight: '22px',
    fontWeight: '400',
    textAlign: 'center',
    boxShadow: '0 18px 48px rgba(60, 64, 67, 0.18)',
    opacity: '0',
    cursor: 'pointer',
    pointerEvents: 'auto',
    transition: 'opacity 180ms ease, transform 180ms ease',
    userSelect: 'none',
  } satisfies Partial<CSSStyleDeclaration>);

  document.body.appendChild(toast);
  return toast;
}

function hideForegroundCompletionToast(): void {
  const toast = document.getElementById(FOREGROUND_TOAST_ID);
  if (!(toast instanceof HTMLDivElement)) return;

  toast.style.opacity = '0';
  toast.style.transform = 'translate(-50%, 10px)';
}

function showForegroundCompletionToast(): void {
  const toast = ensureForegroundToast();
  const promptRect = getPromptContainerRect();
  if (promptRect !== null) {
    const centerX = Math.min(
      window.innerWidth - 24,
      Math.max(24, promptRect.left + promptRect.width / 2),
    );
    const bottom = Math.max(96, window.innerHeight - promptRect.top + 22);
    toast.style.left = `${centerX}px`;
    toast.style.bottom = `${bottom}px`;
  } else {
    toast.style.left = '50%';
    toast.style.bottom = '148px';
  }

  toast.textContent = FOREGROUND_TOAST_TEXT;
  toast.setAttribute('aria-label', FOREGROUND_TOAST_TEXT);
  toast.style.opacity = '1';
  toast.style.transform = 'translate(-50%, 0)';

  if (toastHideTimer !== null) {
    clearTimeout(toastHideTimer);
  }
  toastHideTimer = window.setTimeout(() => {
    toastHideTimer = null;
    hideForegroundCompletionToast();
  }, FOREGROUND_TOAST_VISIBLE_MS);
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
    latestCompletedResponse = latestResponse;
    if (shouldSuppressInitialForegroundToast()) return;
    if (shouldShowForegroundCompletionToast(latestResponse)) {
      showForegroundCompletionToast();
    }
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
  if (toastHideTimer !== null) {
    clearTimeout(toastHideTimer);
    toastHideTimer = null;
  }
  hideForegroundCompletionToast();
  activeNetworkRequestCount = 0;
  hasPendingBackgroundCompletion = false;
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
