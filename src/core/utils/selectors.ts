/**
 * DOM selector utilities
 * Centralized selectors (was duplicated in multiple files)
 */
import { getGeminiTurnSelectors } from '@/core/gemini/turnSelectors';

/**
 * Gemini user-turn selectors, including the Angular host elements. Read at query time; the
 * bundled lists live in `@/core/gemini/turnSelectors`.
 */
export function getUserTurnSelectors(): string[] {
  return getGeminiTurnSelectors('turn.userWithHosts');
}

/**
 * Gemini assistant-turn selectors, including bare response hosts and the list-item fallback.
 */
export function getAssistantTurnSelectors(): string[] {
  return getGeminiTurnSelectors('turn.assistantWithHosts');
}

/**
 * Get conversation selectors
 */
export function getConversationSelectors(): string[] {
  return ['[data-test-id="conversation"]', '[data-test-id^="history-item"]', '.conversation-card'];
}

/**
 * Get conversation link selectors
 */
export function getConversationLinkSelectors(): string[] {
  return ['a[href*="/app/"]', 'a[href*="/gem/"]'];
}

/**
 * Build combined selector string
 */
export function combineSelectors(selectors: string[]): string {
  return selectors.join(', ');
}
