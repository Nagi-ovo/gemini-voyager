import {
  combineSelectors,
  getAssistantTurnSelectors,
  getUserTurnSelectors,
} from '@/core/utils/selectors';

import type { SiteAdapter, SiteCapability } from '../../types';

/**
 * Gemini adapter. Reuses the centralized first-party selectors so the plugin
 * system and Voyager's own features share one source of truth.
 */
export const geminiAdapter: SiteAdapter = {
  id: 'gemini',
  label: 'Gemini',
  matches: ['https://gemini.google.com/*', 'https://business.gemini.google/*'],
  selectors: {
    userTurn: combineSelectors(getUserTurnSelectors()),
    assistantTurn: combineSelectors(getAssistantTurnSelectors()),
    composer: 'input-area-v2, rich-textarea, .text-input-field',
    sidebar: 'bard-sidenav, .gv-folder-container',
  },
  theme: {
    hostSelector: '.theme-host',
    lightSelector: '.theme-host.light-theme',
    darkSelector: '.theme-host.dark-theme',
  },
  capabilities: new Set<SiteCapability>(['chat', 'sidebar', 'composer', 'darkMode']),
};
