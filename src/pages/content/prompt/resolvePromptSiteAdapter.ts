import type { HighlightPlatform } from '@/core/types/highlight';
import { SiteRegistry } from '@/features/plugins/sites/registry';
import type { PromptSiteAdapter, PromptTriggerSpot } from '@/features/prompt/PromptSiteAdapter';

import { insertTextIntoChatInput } from '../chatInput/index';
import { expandInputCollapseIfNeeded } from '../inputCollapse/index';
import { getScheme } from '../platformTheme/scheme';
import { detectPageScheme } from './pageScheme';

type SiteFacts = Omit<PromptSiteAdapter, 'highlightPlatform'>;

/**
 * Beside the Angular Material button nearest the bottom-right corner: Gemini's
 * and AI Studio's floating action button, when the page has one.
 */
function besideMaterialFab(ballHeight: number): PromptTriggerSpot | null {
  const fab = Array.from(document.querySelectorAll('span.mat-mdc-button-touch-target'))
    .map((el) => el.getBoundingClientRect())
    .filter((r) => r.width > 0 && r.height > 0)
    .sort((a, b) => a.bottom + a.right - (b.bottom + b.right))
    .at(-1);
  if (!fab) return null;
  const gap = 10;
  return {
    right: Math.max(6, Math.round(window.innerWidth - fab.left + gap)),
    bottom: Math.max(
      6,
      Math.round(window.innerHeight - (fab.top + fab.height / 2 + ballHeight / 2)),
    ),
  };
}

/** gemini.google.com and business.gemini.google: the only composers whose send path slash expands. */
const GEMINI: SiteFacts = {
  slash: true,
  insert(text) {
    // Input collapse folds only Gemini's composer; a folded one has no height to insert into.
    expandInputCollapseIfNeeded();
    return insertTextIntoChatInput(text);
  },
  scheme: detectPageScheme,
  defaultTriggerSpot: besideMaterialFab,
};

/** AI Studio and custom websites. */
const OTHER: SiteFacts = {
  slash: false,
  insert: insertTextIntoChatInput,
  scheme: detectPageScheme,
  defaultTriggerSpot: besideMaterialFab,
};

/** ChatGPT and Claude: no Material button to sit beside. */
const CATALOG: SiteFacts = {
  ...OTHER,
  defaultTriggerSpot: () => null,
};

/**
 * DeepSeek marks its theme with `body.dark` / `body.light`, which the generic
 * markers miss, so the panel opened light on a dark page. The page-wide scheme
 * bridge already reads DeepSeek's site descriptor.
 */
const DEEPSEEK: SiteFacts = {
  ...CATALOG,
  scheme: () => getScheme(),
};

function siteFacts(url: string): SiteFacts {
  switch (SiteRegistry.createDefault().resolveByUrl(url)?.id) {
    case 'gemini':
      return GEMINI;
    case 'chatgpt':
    case 'claude':
      return CATALOG;
    case 'deepseek':
      return DEEPSEEK;
    default:
      return OTHER;
  }
}

/** Highlights live under Gemini's scope everywhere except an `aistudio.` host. */
function highlightPlatformOf(url: string): HighlightPlatform {
  return new URL(url).hostname.startsWith('aistudio.') ? 'aistudio' : 'gemini';
}

export function resolvePromptSiteAdapter(url: string): PromptSiteAdapter {
  return { ...siteFacts(url), highlightPlatform: highlightPlatformOf(url) };
}
