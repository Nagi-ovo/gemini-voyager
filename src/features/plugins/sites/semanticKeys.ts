/**
 * The semantic selector vocabulary (D9).
 *
 * A site adapter maps these keys to site-specific CSS selectors; plugins and
 * primitives reference the KEY, never the selector, so a site redesign is a
 * one-file adapter fix. The list only ever grows: a key is never removed or
 * given a new meaning. The authoring checks reject a site.json that uses a key
 * outside this list, so authors cannot invent one silently; a runtime read
 * drops such a key instead, since a newer catalog may carry it (`siteAdapterData.ts`).
 * A new key also needs its `SEMANTIC_KEY_SINCE_VERSION` entry.
 *
 *   userTurn         a user message container
 *   assistantTurn    an assistant message container
 *   thinkingBlock    the reasoning / "thinking" section inside an assistant turn
 *   codeBlock        a rendered code block
 *   composer         the prompt input the user types into
 *   sidebar          the conversation list / navigation rail
 *   sidePanel        a secondary panel (artifacts, canvas, previews)
 *   headerActions    the top-right action cluster of the conversation view
 *   scrollContainer  the element that scrolls the conversation
 *   composerRoot     the container around the prompt input and its action buttons
 *   sendButton       the button that sends the prompt (may exist only while the prompt is non-empty)
 *
 * `conversationIdPattern` is NOT a selector: it is a path regular expression
 * carried on the adapter itself (see `SiteAdapter`).
 */
export const SEMANTIC_SELECTOR_KEYS = [
  'userTurn',
  'assistantTurn',
  'thinkingBlock',
  'codeBlock',
  'composer',
  'sidebar',
  'sidePanel',
  'headerActions',
  'scrollContainer',
  'composerRoot',
  'sendButton',
] as const;

export type SemanticSelectorKey = (typeof SEMANTIC_SELECTOR_KEYS)[number];

export function isSemanticSelectorKey(key: string): key is SemanticSelectorKey {
  return (SEMANTIC_SELECTOR_KEYS as readonly string[]).includes(key);
}

/** What each key names, in the words of the vocabulary above (machine-facing English). */
export const SEMANTIC_KEY_DESCRIPTIONS: Readonly<Record<SemanticSelectorKey, string>> = {
  userTurn: 'a user message container',
  assistantTurn: 'an assistant message container',
  thinkingBlock: 'the reasoning / "thinking" section inside an assistant turn',
  codeBlock: 'a rendered code block',
  composer: 'the prompt input the user types into',
  sidebar: 'the conversation list / navigation rail',
  sidePanel: 'a secondary panel (artifacts, canvas, previews)',
  headerActions: 'the top-right action cluster of the conversation view',
  scrollContainer: 'the element that scrolls the conversation',
  composerRoot: 'the container around the prompt input and its action buttons',
  sendButton: 'the button that sends the prompt (may exist only while the prompt is non-empty)',
};

/**
 * The first Voyager release (extension version, not engine) that reads each key
 * in a remote `site` section. The plugin engine stayed at 1.9.0 across releases
 * that reject an unknown key and the first one that drops it, so only the
 * extension version tells them apart. A new key gets the release it ships in;
 * `catalog:build` uses this through `semanticKeyPublishing.ts`.
 */
export const SEMANTIC_KEY_SINCE_VERSION: Readonly<Record<SemanticSelectorKey, string>> = {
  userTurn: '1.9.0',
  assistantTurn: '1.9.0',
  thinkingBlock: '1.9.0',
  codeBlock: '1.9.0',
  composer: '1.9.0',
  sidebar: '1.9.0',
  sidePanel: '1.9.0',
  headerActions: '1.9.0',
  scrollContainer: '1.9.0',
  composerRoot: '2.0.0',
  sendButton: '2.0.0',
};

/**
 * When a key's element is expected on the page, so finding none means the
 * site's selector no longer matches (the per-op health check):
 *
 *   page          on every page of the site once it has loaded, an empty chat included
 *   conversation  once the conversation shows at least one user turn
 *   transient     only sometimes (a code block, the send button), never judged
 */
export type SemanticKeyPresence = 'page' | 'conversation' | 'transient';

export const SEMANTIC_KEY_PRESENCE: Readonly<Record<SemanticSelectorKey, SemanticKeyPresence>> = {
  userTurn: 'conversation',
  assistantTurn: 'conversation',
  thinkingBlock: 'transient',
  codeBlock: 'transient',
  composer: 'page',
  sidebar: 'page',
  sidePanel: 'transient',
  headerActions: 'conversation',
  scrollContainer: 'conversation',
  composerRoot: 'page',
  sendButton: 'transient',
};
