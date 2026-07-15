/**
 * First consumer of the reusable {@link showCoachmark} primitive: a one-time
 * guided intro for the opt-in usage pill (#690).
 *
 * Flow (fired once, right after the changelog modal is dismissed on update):
 * reveal a non-interactive PREVIEW of the pill at its real spot, float a bubble
 * above it with a one-line intro and an inline switch — flipping the switch
 * enables the real feature live (the pill's storage listener mounts it
 * immediately). The guide stays open until the user confirms the selection or
 * continues using the page. Either way it never shows again.
 */
import browser from 'webextension-polyfill';

import { StorageKeys } from '@/core/types/common';
import { getTranslationSync, initI18n } from '@/utils/i18n';
import type { TranslationKey } from '@/utils/translations';

import {
  type CoachmarkProgress,
  type CoachmarkResult,
  type CoachmarkSequenceStep,
  showCoachmark,
} from '../coachmark';
import { USAGE_REFRESH_ICON } from './icons';

export const USAGE_COACHMARK_ID = 'usage-pill-intro';
export const USAGE_COACHMARK_DEBUG_EVENT = 'gv:debug:usageCoachmark';

const t = (key: TranslationKey, fallback: string): string => {
  try {
    const v = getTranslationSync(key);
    return v && v !== key ? v : fallback;
  } catch {
    return fallback;
  }
};

// Mini progress-bar glyph — echoes the pill's own bars.
const USAGE_ICON =
  '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><rect x="3" y="10" width="18" height="4" rx="2" fill="currentColor" opacity="0.28"/><rect x="3" y="10" width="11" height="4" rx="2" fill="currentColor"/></svg>';
const OPEN_ICON =
  '<svg viewBox="0 -960 960 960" fill="currentColor" aria-hidden="true"><path d="M200-120q-33 0-56.5-23.5T120-200v-560q0-33 23.5-56.5T200-840h280v80H200v560h560v-280h80v280q0 33-23.5 56.5T760-120H200Zm188-212-56-56 372-372H560v-80h280v280h-80v-144L388-332Z"/></svg>';

async function loadUsageEnabled(): Promise<boolean> {
  try {
    const got = (await browser.storage.sync.get({
      [StorageKeys.USAGE_STATUS_ENABLED]: false,
    })) as Record<string, unknown>;
    return got[StorageKeys.USAGE_STATUS_ENABLED] === true;
  } catch {
    return false;
  }
}

async function setUsageEnabled(on: boolean): Promise<void> {
  try {
    await browser.storage.sync.set({ [StorageKeys.USAGE_STATUS_ENABLED]: on });
  } catch {
    /* non-critical */
  }
}

function buildMetric(kind: 'daily' | 'weekly', label: string, percent: number): HTMLElement {
  const seg = document.createElement('div');
  seg.className = 'gv-usage-metric';
  seg.dataset.kind = kind;
  if (percent >= 90) seg.classList.add('gv-usage-high');
  else if (percent >= 70) seg.classList.add('gv-usage-mid');

  const name = document.createElement('span');
  name.className = 'gv-usage-label';
  name.textContent = label;

  const track = document.createElement('span');
  track.className = 'gv-usage-track';
  const fill = document.createElement('span');
  fill.className = 'gv-usage-fill';
  fill.style.width = `${percent}%`;
  track.appendChild(fill);

  const pct = document.createElement('span');
  pct.className = 'gv-usage-pct';
  pct.textContent = `${percent}%`;

  seg.append(name, track, pct);
  return seg;
}

/** A static, non-interactive replica of the pill at its default bottom-centre spot. */
function buildPreviewPill(): HTMLElement {
  const el = document.createElement('div');
  el.className = 'gv-usage-pill gv-usage-preview';
  el.setAttribute('role', 'group');
  el.setAttribute('aria-hidden', 'true');
  // Mirror positionPill()'s default branch (bottom-centre).
  el.style.left = '50%';
  el.style.bottom = '20px';
  el.style.top = 'auto';
  el.style.right = 'auto';
  el.style.transform = 'translateX(-50%)';

  const tier = document.createElement('span');
  tier.className = 'gv-usage-tier';
  tier.textContent = 'PRO';
  el.appendChild(tier);

  el.appendChild(buildMetric('daily', t('usageStatusDaily', '5h'), 12));
  el.appendChild(buildMetric('weekly', t('usageStatusWeekly', 'Weekly'), 4));

  const refresh = document.createElement('span');
  refresh.className = 'gv-usage-refresh';
  refresh.innerHTML = USAGE_REFRESH_ICON;
  const open = document.createElement('span');
  open.className = 'gv-usage-open';
  open.innerHTML = OPEN_ICON;
  el.append(refresh, open);

  document.body.appendChild(el);
  return el;
}

/**
 * Show the usage-pill intro once. `force` re-shows it for debugging (ignores
 * both the once-flag and the already-enabled short-circuit).
 */
export async function maybeShowUsageCoachmark(
  opts: { force?: boolean; progress?: CoachmarkProgress } = {},
): Promise<CoachmarkResult> {
  if (location.hostname !== 'gemini.google.com') return 'skipped';
  const enabled = await loadUsageEnabled();
  if (enabled && !opts.force) return 'skipped'; // already using it — nothing to introduce

  try {
    await initI18n();
  } catch {
    /* fall back to literals */
  }

  return showCoachmark({
    id: USAGE_COACHMARK_ID,
    once: !opts.force,
    scrim: true,
    icon: USAGE_ICON,
    title: t('usageCoachmarkTitle', 'New: usage limits'),
    body: t(
      'usageCoachmarkBody',
      'Keep your remaining Gemini 5-hour and weekly limits in view, right by the chat box.',
    ),
    placement: 'top',
    reveal: { mount: buildPreviewPill, unmount: (el) => el?.remove() },
    anchor: () => null, // anchor to the revealed preview
    toggle: {
      label: t('usageCoachmarkToggle', 'Show the usage pill'),
      initial: enabled,
      onChange: (on) => setUsageEnabled(on),
    },
    dismissLabel: t('coachmarkDismiss', 'Done'),
    nextLabel: t('coachmarkNext', 'Next'),
    closeLabel: t('coachmarkClose', 'Close'),
    progress: opts.progress,
  });
}

export const usageCoachmarkStep: CoachmarkSequenceStep = {
  id: USAGE_COACHMARK_ID,
  isEligible: async () => location.hostname === 'gemini.google.com' && !(await loadUsageEnabled()),
  show: (progress) => maybeShowUsageCoachmark({ progress }),
};

const showDebugUsageCoachmark = () => void maybeShowUsageCoachmark({ force: true });

// Debug: from the normal page console, run:
// document.dispatchEvent(new Event('gv:debug:usageCoachmark'))
// The legacy __gvUsageCoachmark() helper still works from the content-script context.
try {
  (window as unknown as Record<string, unknown>).__gvUsageCoachmark = showDebugUsageCoachmark;
  document.addEventListener(USAGE_COACHMARK_DEBUG_EVENT, showDebugUsageCoachmark);
} catch {
  /* ignore */
}
