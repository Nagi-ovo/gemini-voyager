/**
 * DOM selector utilities
 * Centralized selectors (was duplicated in multiple files)
 */

/**
 * Get selectors for user query elements
 */
export function getUserTurnSelectors(): string[] {
  return [
    // Angular-based Gemini UI user bubble (primary)
    '.user-query-bubble-with-background',
    // Angular containers (fallbacks)
    '.user-query-bubble-container',
    '.user-query-container',
    'user-query-content .user-query-bubble-with-background',
    'user-query-content',
    'user-query',
    // Attribute-based fallbacks
    'div[aria-label="User message"]',
    'article[data-author="user"]',
    'article[data-turn="user"]',
    '[data-message-author-role="user"]',
    'div[role="listitem"][data-user="true"]',
  ];
}

/**
 * Get selectors for assistant/model response elements
 */
export function getAssistantTurnSelectors(): string[] {
  return [
    // Attribute-based roles (most reliable)
    '[aria-label="Gemini response"]',
    '[data-message-author-role="assistant"]',
    '[data-message-author-role="model"]',
    'article[data-author="assistant"]',
    'article[data-turn="assistant"]',
    'article[data-turn="model"]',
    // Common Gemini containers
    'model-response',
    '.model-response',
    'response-container',
    '.response-container',
    '.presented-response-container',
    'div[role="listitem"]:not([data-user="true"])',
  ];
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
