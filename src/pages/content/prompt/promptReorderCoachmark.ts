import { promptStorageService } from '@/core/services/StorageService';
import { StorageKeys } from '@/core/types/common';
import type { PromptItem } from '@/core/types/sync';
import { getTranslationSync, initI18n } from '@/utils/i18n';
import type { TranslationKey } from '@/utils/translations';

import {
  type CoachmarkProgress,
  type CoachmarkResult,
  type CoachmarkSequenceStep,
  showCoachmark,
} from '../coachmark';
import { PROMPT_TRIGGER_ELEMENT_ID } from './triggerClearance';

export const PROMPT_REORDER_COACHMARK_ID = 'prompt-reorder-intro';
export const PROMPT_REORDER_COACHMARK_DEBUG_EVENT = 'gv:debug:promptReorderCoachmark';

/**
 * Below this, ordering has nothing to say: a list you can take in at a glance
 * does not need pinning or dragging, and the guide would only be noise.
 */
const MIN_PROMPTS_TO_INTRODUCE = 3;

const t = (key: TranslationKey, fallback: string): string => {
  try {
    const value = getTranslationSync(key);
    return value && value !== key ? value : fallback;
  } catch {
    return fallback;
  }
};

async function loadSavedPrompts(): Promise<PromptItem[]> {
  const stored = await promptStorageService.get<PromptItem[]>(StorageKeys.PROMPT_ITEMS);
  return stored.success && Array.isArray(stored.data) ? stored.data : [];
}

function findTrigger(): HTMLElement | null {
  return document.getElementById(PROMPT_TRIGGER_ELEMENT_ID);
}

export async function isPromptReorderCoachmarkEligible(): Promise<boolean> {
  if (!findTrigger()) return false;
  const prompts = await loadSavedPrompts();
  return prompts.length >= MIN_PROMPTS_TO_INTRODUCE;
}

/**
 * A row at rest shows nothing at all — the handle and the star only appear on
 * hover — so this guide is the only place the list says it can be ordered.
 */
export async function maybeShowPromptReorderCoachmark(
  options: { force?: boolean; progress?: CoachmarkProgress } = {},
): Promise<CoachmarkResult> {
  const trigger = findTrigger();
  if (!trigger) return 'skipped';

  if (!options.force) {
    const prompts = await loadSavedPrompts();
    if (prompts.length < MIN_PROMPTS_TO_INTRODUCE) return 'skipped';
  }

  try {
    await initI18n();
  } catch {
    /* fall back to literals */
  }

  return showCoachmark({
    id: PROMPT_REORDER_COACHMARK_ID,
    once: !options.force,
    scrim: true,
    title: t('promptReorderCoachmarkTitle', 'New: put your prompts in order'),
    body: t(
      'promptReorderCoachmarkBody',
      'Drag a row by its handle to reorder the list, or use the star to pin a prompt above the rest.',
    ),
    placement: 'top',
    anchor: findTrigger,
    dismissLabel: t('coachmarkDismiss', 'Done'),
    nextLabel: t('coachmarkNext', 'Next'),
    closeLabel: t('coachmarkClose', 'Close'),
    progress: options.progress,
    focusOnOpen: false,
  });
}

export const promptReorderCoachmarkStep: CoachmarkSequenceStep = {
  id: PROMPT_REORDER_COACHMARK_ID,
  isEligible: isPromptReorderCoachmarkEligible,
  show: (progress) => maybeShowPromptReorderCoachmark({ progress }),
};

const showDebugPromptReorderCoachmark = () => void maybeShowPromptReorderCoachmark({ force: true });

// Debug from the page console:
// document.dispatchEvent(new Event('gv:debug:promptReorderCoachmark'))
try {
  (window as unknown as Record<string, unknown>).__gvPromptReorderCoachmark =
    showDebugPromptReorderCoachmark;
  document.addEventListener(PROMPT_REORDER_COACHMARK_DEBUG_EVENT, showDebugPromptReorderCoachmark);
} catch {
  /* ignore */
}
