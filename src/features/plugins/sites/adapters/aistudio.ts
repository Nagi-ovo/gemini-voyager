import type { SiteAdapter, SiteCapability } from '../../types';

/**
 * Google AI Studio adapter. AI Studio toggles theme on <body> rather than the
 * `.theme-host` element Gemini uses.
 */
export const aistudioAdapter: SiteAdapter = {
  id: 'aistudio',
  label: 'AI Studio',
  matches: ['https://aistudio.google.com/*', 'https://aistudio.google.cn/*'],
  selectors: {
    userTurn: '.user-prompt-container, [data-turn-role="User"]',
    assistantTurn: '.model-prompt-container, [data-turn-role="Model"]',
    composer: 'ms-chunk-input textarea, textarea[aria-label]',
    sidebar: '.gv-aistudio .gv-folder-container',
  },
  theme: {
    hostSelector: 'body',
    lightSelector: 'body.light-theme',
    darkSelector: 'body.dark-theme',
  },
  capabilities: new Set<SiteCapability>(['chat', 'sidebar', 'composer', 'darkMode']),
};
