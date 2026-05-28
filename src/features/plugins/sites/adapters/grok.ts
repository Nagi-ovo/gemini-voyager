import type { SiteAdapter, SiteCapability } from '../../types';

/**
 * Grok adapter (grok.com). Best-effort selectors (see chatgpt.ts caveat).
 */
export const grokAdapter: SiteAdapter = {
  id: 'grok',
  label: 'Grok',
  matches: ['https://grok.com/*'],
  selectors: {
    userTurn: '.message-bubble[data-author="user"], .items-end .message-bubble',
    assistantTurn: '.message-bubble[data-author="assistant"], .items-start .message-bubble',
    composer: 'textarea[aria-label], div[contenteditable="true"]',
    sidebar: 'aside, nav[aria-label]',
  },
  theme: {
    hostSelector: 'html',
    lightSelector: 'html.light',
    darkSelector: 'html.dark',
  },
  capabilities: new Set<SiteCapability>(['chat', 'composer']),
};
