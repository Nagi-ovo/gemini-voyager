/**
 * The version badge in the Prompt Manager header.
 *
 * Shows the installed version and opens its release notes, falling back to
 * the GitHub releases page when the notes cannot open. It is marked while
 * the trigger announces unread release notes, and when GitHub has a newer
 * release (checked at most every six hours, never on Safari unless its update
 * reminder is on).
 */
import browser from 'webextension-polyfill';

import { logger } from '@/core/services/LoggerService';
import { isSafari, shouldShowSafariUpdateReminder } from '@/core/utils/browser';
import { shouldShowUpdateReminderForCurrentVersion } from '@/core/utils/updateReminder';
import { compareVersions } from '@/core/utils/version';
import type { TranslationKey } from '@/utils/translations';

import { openChangelog } from '../changelog/index';
import type { PromptTrigger } from './promptTrigger';

const LATEST_VERSION_CACHE_KEY = 'gvLatestVersionCache';
const LATEST_VERSION_MAX_AGE = 1000 * 60 * 60 * 6; // 6 hours
const MARKED_CLASS = 'gv-pm-version-outdated';
const RELEASES_URL = 'https://github.com/voyager-crew/voyager/releases';

const pmLogger = logger.createChild('PromptManager');

export interface VersionBadge {
  readonly element: HTMLSpanElement;
  /** Mirrors the trigger's release-notes announcement. */
  setAttention: (active: boolean) => void;
}

export interface VersionBadgeOptions {
  t: (key: TranslationKey) => string;
  trigger: Pick<PromptTrigger, 'hasAttention' | 'consumeAttention'>;
  /** Called before the release notes open. */
  beforeOpen: () => void;
}

export function createVersionBadge({ t, trigger, beforeOpen }: VersionBadgeOptions): VersionBadge {
  const manifestVersion = chrome?.runtime?.getManifest?.()?.version;
  const currentVersionNormalized = normalizeVersionString(manifestVersion);
  const badge = document.createElement('span');
  badge.className = 'gv-pm-version';
  badge.style.cursor = 'pointer';
  badge.title = manifestVersion
    ? `${t('extensionVersion')} ${manifestVersion}`
    : t('extensionVersion');
  badge.textContent = manifestVersion ?? '...';

  badge.addEventListener('click', async (e) => {
    e.stopPropagation();
    beforeOpen();
    // The user explicitly asked for release notes: if the modal cannot
    // open (chunk load blocked, missing notes for this version, …) fall
    // back to the GitHub releases page instead of silently doing nothing,
    // and log the error so site-specific failures (e.g. on Claude/ChatGPT
    // custom websites) are diagnosable from the console.
    let shown = false;
    try {
      shown = trigger.hasAttention ? await trigger.consumeAttention() : await openChangelog();
    } catch (error) {
      logger.error('Changelog modal failed to open', { error: String(error) });
    }
    if (!shown) window.open(RELEASES_URL, '_blank', 'noopener');
  });

  if (trigger.hasAttention) {
    badge.classList.add(MARKED_CLASS);
  }

  // Check for newer version on GitHub (visual indicator only, no link)
  (async () => {
    const isSafariBrowser = isSafari();
    const safariUpdateReminderEnabled = isSafariBrowser && shouldShowSafariUpdateReminder();

    if (isSafariBrowser && !safariUpdateReminderEnabled) return;

    const shouldShowUpdateNotification = shouldShowUpdateReminderForCurrentVersion({
      currentVersion: currentVersionNormalized,
      isSafariBrowser,
      safariReminderEnabled: safariUpdateReminderEnabled,
    });
    if (!shouldShowUpdateNotification) return;

    const latest = await getLatestVersionCached();
    const latestNormalized = normalizeVersionString(latest);
    const hasUpdate =
      currentVersionNormalized && latestNormalized
        ? compareVersions(latestNormalized, currentVersionNormalized) > 0
        : false;

    if (!hasUpdate || !latestNormalized) return;

    badge.classList.add(MARKED_CLASS);
    badge.title = `${t('latestVersionLabel')}: v${latestNormalized}`;
  })();

  return {
    element: badge,
    setAttention: (active) => {
      badge.classList.toggle(MARKED_CLASS, active);
    },
  };
}

function normalizeVersionString(version?: string | null): string | null {
  if (!version) return null;
  const trimmed = version.trim();
  return trimmed ? trimmed.replace(/^v/i, '') : null;
}

async function getLatestVersionCached(): Promise<string | null> {
  try {
    if (!browser.runtime?.id) return null;

    const now = Date.now();
    const cache = await browser.storage.local.get(LATEST_VERSION_CACHE_KEY);
    const cached = cache?.[LATEST_VERSION_CACHE_KEY] as
      | { version?: string; fetchedAt?: number }
      | undefined;
    if (
      cached &&
      cached.version &&
      cached.fetchedAt &&
      now - cached.fetchedAt < LATEST_VERSION_MAX_AGE
    ) {
      return cached.version;
    }

    const resp = await fetch('https://api.github.com/repos/voyager-crew/voyager/releases/latest', {
      headers: { Accept: 'application/vnd.github+json' },
    });
    if (!resp.ok) {
      throw new Error(`HTTP ${resp.status}`);
    }

    const data = await resp.json();
    const candidate =
      typeof data.tag_name === 'string'
        ? data.tag_name
        : typeof data.name === 'string'
          ? data.name
          : null;

    if (candidate) {
      await browser.storage.local.set({
        [LATEST_VERSION_CACHE_KEY]: { version: candidate, fetchedAt: now },
      });
      return candidate;
    }
  } catch (error) {
    pmLogger.debug('Latest version check failed', { error });
  }
  return null;
}
