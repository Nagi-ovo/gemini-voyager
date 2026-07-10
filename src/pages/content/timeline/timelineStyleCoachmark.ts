/**
 * One-time guided intro for the compact timeline style.
 *
 * The guide reveals a static replica of the compact rail so introducing the
 * feature never changes the user's preference by itself. The real timeline is
 * switched only when the user flips the inline toggle.
 */
import browser from 'webextension-polyfill';

import { StorageKeys } from '@/core/types/common';
import { getTranslationSync, initI18n } from '@/utils/i18n';
import type { TranslationKey } from '@/utils/translations';

import { showCoachmark } from '../coachmark';

const COACH_ID = 'timeline-compact-style-intro-v2';
const PREVIEW_TICK_COUNT = 14;
export const TIMELINE_STYLE_COACHMARK_DEBUG_EVENT = 'gv:debug:timelineStyleCoachmark';

const TIMELINE_ICON =
  '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M6 6.5h12M6 10.2h12M6 13.8h12M6 17.5h12" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>';

const t = (key: TranslationKey, fallback: string): string => {
  try {
    const value = getTranslationSync(key);
    return value && value !== key ? value : fallback;
  } catch {
    return fallback;
  }
};

async function loadCompactTimelineEnabled(): Promise<boolean> {
  try {
    const got = (await browser.storage.sync.get({
      [StorageKeys.TIMELINE_STYLE]: 'dots',
    })) as Record<string, unknown>;
    return got[StorageKeys.TIMELINE_STYLE] === 'compact';
  } catch {
    return false;
  }
}

async function setCompactTimelineEnabled(on: boolean): Promise<void> {
  try {
    await browser.storage.sync.set({
      [StorageKeys.TIMELINE_STYLE]: on ? 'compact' : 'dots',
    });
  } catch {
    /* non-critical */
  }
}

/** A non-interactive timeline replica that can morph between both styles. */
function buildTimelineStylePreview(compact: boolean): HTMLElement {
  const preview = document.createElement('div');
  preview.className = `gv-timeline-style-preview ${compact ? 'is-compact' : 'is-dots'}`;
  preview.setAttribute('aria-hidden', 'true');

  for (let index = 0; index < PREVIEW_TICK_COUNT; index += 1) {
    const tick = document.createElement('span');
    if (index === Math.floor(PREVIEW_TICK_COUNT / 2)) tick.className = 'active';
    preview.appendChild(tick);
  }

  document.body.appendChild(preview);
  return preview;
}

function setPreviewStyle(preview: HTMLElement | null, compact: boolean): void {
  if (!preview) return;
  preview.classList.toggle('is-compact', compact);
  preview.classList.toggle('is-dots', !compact);
}

/**
 * Show the compact-timeline intro once. `force` re-shows it for debugging and
 * bypasses the already-enabled short-circuit.
 */
export async function maybeShowTimelineStyleCoachmark(
  opts: { force?: boolean } = {},
): Promise<void> {
  if (location.hostname !== 'gemini.google.com') return;
  const enabled = await loadCompactTimelineEnabled();
  if (enabled && !opts.force) return;

  try {
    await initI18n();
  } catch {
    /* fall back to literals */
  }

  let preview: HTMLElement | null = null;
  let hiddenTimelineElements: HTMLElement[] = [];

  await showCoachmark({
    id: COACH_ID,
    once: !opts.force,
    scrim: true,
    icon: TIMELINE_ICON,
    title: t('timelineCoachmarkTitle', 'New: compact timeline'),
    body: t(
      'timelineCoachmarkBody',
      'Keep the right edge quiet. Hover the compact index to open every message in one panel.',
    ),
    placement: 'top',
    reveal: {
      mount: () => {
        hiddenTimelineElements = Array.from(
          document.querySelectorAll<HTMLElement>('.gemini-timeline-bar, .timeline-left-slider'),
        );
        hiddenTimelineElements.forEach((element) =>
          element.classList.add('gv-coach-timeline-hidden'),
        );
        preview = buildTimelineStylePreview(true);
        void setCompactTimelineEnabled(true);
        return preview;
      },
      unmount: (element) => {
        hiddenTimelineElements.forEach((timelineElement) =>
          timelineElement.classList.remove('gv-coach-timeline-hidden'),
        );
        hiddenTimelineElements = [];
        if (preview === element) preview = null;
        element.remove();
      },
    },
    anchor: () => null,
    toggle: {
      label: t('timelineCoachmarkToggle', 'Use compact timeline'),
      initial: true,
      onChange: (on) => {
        setPreviewStyle(preview, on);
        return setCompactTimelineEnabled(on);
      },
    },
    dismissLabel: t('coachmarkDismiss', 'Done'),
  });
}

const showDebugTimelineStyleCoachmark = () => void maybeShowTimelineStyleCoachmark({ force: true });

// Debug from the normal page console:
// document.dispatchEvent(new Event('gv:debug:timelineStyleCoachmark'))
try {
  (window as unknown as Record<string, unknown>).__gvTimelineStyleCoachmark =
    showDebugTimelineStyleCoachmark;
  document.addEventListener(TIMELINE_STYLE_COACHMARK_DEBUG_EVENT, showDebugTimelineStyleCoachmark);
} catch {
  /* ignore */
}
