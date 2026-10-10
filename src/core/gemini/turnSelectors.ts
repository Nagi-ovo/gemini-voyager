/**
 * Bundled Gemini turn selectors: the one source every turn-finding owner reads.
 *
 * Content owners call `getGeminiTurnSelectors` when they query, so a later phase can prepend
 * remotely updated selectors here without touching them. The plugin site adapter
 * (`features/plugins/sites/adapters/gemini.ts`) still snapshots them at module load; route it
 * through here before relying on runtime updates there.
 *
 * The keys differ on purpose. Each one keeps the entries and order its owners used before the
 * lists were merged, because order is behavior in two places:
 * - timeline detection takes the first selector that matches and stores that single string;
 * - highlight concatenates matches selector by selector without re-sorting them.
 * Other owners join their list into one query or CSS rule, or only check that something matches
 * (export's readiness wait), so order does not change what they find.
 */

/** Gemini's Angular user bubble and its wrappers, tightest first. */
const USER_QUERY_BUBBLES = [
  '.user-query-bubble-with-background',
  '.user-query-bubble-container',
  '.user-query-container',
  'user-query-content .user-query-bubble-with-background',
] as const;

/** Angular host elements around a user turn. They also wrap the turn's controls. */
const USER_QUERY_HOSTS = ['user-query-content', 'user-query'] as const;

/** Attribute-based user turns from other Gemini variants. */
const USER_TURN_ATTRIBUTES = [
  'div[aria-label="User message"]',
  'article[data-author="user"]',
  'article[data-turn="user"]',
  '[data-message-author-role="user"]',
  'div[role="listitem"][data-user="true"]',
] as const;

/** Attribute-based assistant turns. */
const ASSISTANT_TURN_ATTRIBUTES = [
  '[aria-label="Gemini response"]',
  '[data-message-author-role="assistant"]',
  '[data-message-author-role="model"]',
  'article[data-author="assistant"]',
  'article[data-turn="assistant"]',
  'article[data-turn="model"]',
] as const;

/** Angular response containers, including the bare `response-container` host. */
const MODEL_RESPONSE_HOSTS = [
  'model-response',
  '.model-response',
  'response-container',
  '.response-container',
  '.presented-response-container',
] as const;

/** Any list item that is not a user turn: a last resort for unknown layouts. */
const ASSISTANT_LISTITEM_FALLBACK = 'div[role="listitem"]:not([data-user="true"])';

/**
 * Chat width injects these lists into `!important` width rules. It has never listed the user
 * bubble (its own `fit-content` rule sizes it), `data-turn` articles or list items, so keep them
 * out of the width rules until a live page shows they are safe to widen.
 */
const CHAT_WIDTH_UNLISTED: ReadonlySet<string> = new Set([
  '.user-query-bubble-with-background',
  'user-query-content .user-query-bubble-with-background',
  'article[data-turn="user"]',
  'div[role="listitem"][data-user="true"]',
  'article[data-turn="assistant"]',
  'article[data-turn="model"]',
]);

function listedForChatWidth(selectors: readonly string[]): string[] {
  return selectors.filter((selector) => !CHAT_WIDTH_UNLISTED.has(selector));
}

const BUNDLED_GEMINI_TURN_SELECTORS = {
  /**
   * One user turn per bubble, in detection priority. Timeline detection, export, fork and
   * highlight share it with the `geminiTimelineUserTurnSelector` override and its Auto cache;
   * each owner keeps its own precedence for those two values.
   */
  'turn.user': [...USER_QUERY_BUBBLES, ...USER_TURN_ATTRIBUTES],
  /**
   * `turn.user` plus the Angular hosts, for owners that only test membership: the Gemini plugin
   * adapter and Quote Reply, through `getUserTurnSelectors()`.
   */
  'turn.userWithHosts': [...USER_QUERY_BUBBLES, ...USER_QUERY_HOSTS, ...USER_TURN_ATTRIBUTES],
  /**
   * Assistant turns that pair with a user turn. Timeline previews use it alone; highlight tries
   * it before `turn.assistantFallback`; export and fork join both into one query. The order is
   * highlight's match order.
   */
  'turn.assistant': [
    ...ASSISTANT_TURN_ATTRIBUTES,
    '.model-response',
    'model-response',
    '.response-container',
  ],
  'turn.assistantFallback': [ASSISTANT_LISTITEM_FALLBACK],
  /**
   * Every assistant container, for owners that only test membership: the Gemini plugin adapter,
   * Quote Reply and response notifications, through `getAssistantTurnSelectors()`.
   */
  'turn.assistantWithHosts': [
    ...ASSISTANT_TURN_ATTRIBUTES,
    ...MODEL_RESPONSE_HOSTS,
    ASSISTANT_LISTITEM_FALLBACK,
  ],
  /** Containers chat width widens. These end up in CSS text, not in a query. */
  'chatWidth.userTurn': listedForChatWidth([
    ...USER_QUERY_BUBBLES,
    ...USER_QUERY_HOSTS,
    ...USER_TURN_ATTRIBUTES,
  ]),
  'chatWidth.assistantTurn': listedForChatWidth([
    ...MODEL_RESPONSE_HOSTS,
    ...ASSISTANT_TURN_ATTRIBUTES,
  ]),
} as const satisfies Record<string, readonly string[]>;

export type GeminiTurnSelectorKey = keyof typeof BUNDLED_GEMINI_TURN_SELECTORS;

/** The selectors for `key`, in priority order. Call it at query time; the result is a copy. */
export function getGeminiTurnSelectors(key: GeminiTurnSelectorKey): string[] {
  return [...BUNDLED_GEMINI_TURN_SELECTORS[key]];
}

/**
 * Where timeline observes once it has detected a user-turn selector.
 * - `conversation`: the Angular bubbles and hosts. Gemini wraps each turn in its own container, so
 *   the first turn's parent never holds the next one and the whole conversation must be watched.
 * - `parent`: attribute-based variants render turns as siblings under one parent.
 */
export type GeminiUserTurnObserverScope = 'conversation' | 'parent';

const CONVERSATION_SCOPED_USER_SELECTORS: ReadonlySet<string> = new Set([
  ...USER_QUERY_BUBBLES,
  ...USER_QUERY_HOSTS,
]);
const PARENT_SCOPED_USER_SELECTORS: ReadonlySet<string> = new Set(USER_TURN_ATTRIBUTES);

export function getGeminiUserTurnObserverScope(selector: string): GeminiUserTurnObserverScope {
  if (CONVERSATION_SCOPED_USER_SELECTORS.has(selector)) return 'conversation';
  if (PARENT_SCOPED_USER_SELECTORS.has(selector)) return 'parent';
  // A selector Voyager does not bundle, such as an Auto cache an older version wrote, keeps the
  // historical rule: anything naming `user-query` belongs to the Angular layout.
  return /user-query/i.test(selector) ? 'conversation' : 'parent';
}
