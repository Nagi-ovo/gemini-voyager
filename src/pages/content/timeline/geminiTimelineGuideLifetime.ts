import browser from 'webextension-polyfill';

import { StorageKeys } from '@/core/types/common';

import type { CoachmarkResult } from '../coachmark';

/** Own a single Gemini guide, including the settings/i18n work before its UI mounts. */
export async function withGeminiTimelineGuideLifetime(
  show: (signal: AbortSignal) => Promise<CoachmarkResult>,
  pageSignal?: AbortSignal,
): Promise<CoachmarkResult> {
  const controller = new AbortController();
  const stop = () => controller.abort();
  let revision = 0;
  const onChanged = (
    changes: Record<string, browser.Storage.StorageChange>,
    area: string,
  ): void => {
    if (area !== 'sync' || !Object.hasOwn(changes, StorageKeys.GV_TIMELINE_ENABLED)) return;
    revision += 1;
    if (changes[StorageKeys.GV_TIMELINE_ENABLED].newValue === false) stop();
  };
  // Subscribe before reading: an off while the snapshot is pending retires this guide for good.
  try {
    browser.storage.onChanged.addListener(onChanged);
  } catch {
    /* A retired extension context cannot deliver more setting changes. */
  }
  window.addEventListener('pagehide', stop, { once: true });
  pageSignal?.addEventListener('abort', stop, { once: true });
  if (pageSignal?.aborted) stop();
  try {
    const readRevision = revision;
    try {
      const stored = await browser.storage.sync.get({ [StorageKeys.GV_TIMELINE_ENABLED]: true });
      if (revision === readRevision && stored[StorageKeys.GV_TIMELINE_ENABLED] === false) stop();
    } catch {
      /* An unavailable setting keeps the established on-by-default guide behavior. */
    }
    if (controller.signal.aborted) return 'skipped';
    return await show(controller.signal);
  } finally {
    // Retained buttons from a closed guide cannot start another style write.
    stop();
    try {
      browser.storage.onChanged.removeListener(onChanged);
    } catch {
      /* The page signal and pagehide listener still need cleanup after an update. */
    }
    window.removeEventListener('pagehide', stop);
    pageSignal?.removeEventListener('abort', stop);
  }
}
