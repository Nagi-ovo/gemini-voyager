import { AdapterConfig } from '../types';

export const ADAPTERS: Record<string, AdapterConfig> = {
  // gemini
  'gemini.google.com': {
    user_selector: ['.query-content'],
    ai_selector: ['.response-content'],
  },
  // chatgpt
  'chatgpt.com': {
    selectors: ['[data-testid^="conversation-turn-"]'],
    aiMarkers: ['assistant'],
    userMarkers: ['user'],
  },
  // claude
  'claude.ai': {
    selectors: ['.font-user-message', '.font-claude-message'],
    aiMarkers: ['claude'],
    userMarkers: ['user'],
  },
  // default
  default: {
    selectors: ['div', 'p'],
    aiMarkers: ['ai', 'assistant'],
    userMarkers: ['user', 'human'],
  },
};

export function getMatchedAdapter(host: string): AdapterConfig {
  for (const key of Object.keys(ADAPTERS)) {
    if (host.includes(key)) {
      return ADAPTERS[key];
    }
  }
  return ADAPTERS.default;
}
