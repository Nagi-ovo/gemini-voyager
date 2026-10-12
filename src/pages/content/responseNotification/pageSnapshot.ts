import { getAssistantTurnSelectors } from '@/core/utils/selectors';

/**
 * Read-only views of the Gemini page that the completion run inspects. Every
 * reader looks at the live document: a caller decides whether the page still
 * belongs to the session it is reporting on before reading it.
 */

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

export function isPromptInteractionTarget(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false;
  return !!target.closest(PROMPT_SELECTORS);
}

function isElementVisible(element: Element): boolean {
  if (!(element instanceof HTMLElement)) return false;
  return !!(element.offsetWidth || element.offsetHeight || element.getClientRects().length);
}

export function hasGeneratingIndicator(): boolean {
  return GENERATING_SELECTORS.some((selector) => {
    try {
      return Array.from(document.querySelectorAll(selector)).some(isElementVisible);
    } catch {
      return false;
    }
  });
}

export function getAssistantResponses(): HTMLElement[] {
  const selector = getAssistantTurnSelectors().join(', ');
  const responses = Array.from(document.querySelectorAll<HTMLElement>(selector)).filter((element) =>
    element.textContent?.trim(),
  );
  return responses;
}

export function getLatestAssistantResponse(): HTMLElement | null {
  return getAssistantResponses().at(-1) ?? null;
}

export function hasCompletionActions(response: HTMLElement): boolean {
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

export function getResponseFingerprint(response: HTMLElement): string | null {
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

export function getConversationTitle(): string {
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

export function getUserPromptElements(): HTMLElement[] {
  return Array.from(
    document.querySelectorAll<HTMLElement>(USER_PROMPT_SELECTORS.join(', ')),
  ).filter(
    (element) =>
      !isInsideAssistantResponse(element) &&
      !isPromptInteractionTarget(element) &&
      // Gemini's hidden "You said …" label is the last match in every turn; reading it emptied every prompt.
      !element.closest('[class*="visually-hidden" i]'),
  );
}

export function getLatestUserPromptSnapshot(): { element: HTMLElement; text: string } | null {
  // Include an empty last turn: a prior non-empty prompt must not stand in for it.
  const element = getUserPromptElements().at(-1);
  return element
    ? { element, text: normalizePromptIdentity(getVisibleElementText(element)) }
    : null;
}

export function getLatestUserPromptText(): string {
  return getLatestUserPromptSnapshot()?.text ?? '';
}

/** Display only: never use the truncated summary as a conversation identity. */
export function getLatestUserPrompt(): string {
  return normalizeNotificationText(getLatestUserPromptText(), MAX_NOTIFICATION_PROMPT_LENGTH);
}

export function normalizePromptIdentity(text: string): string {
  return normalizeNotificationText(text, Number.POSITIVE_INFINITY);
}
