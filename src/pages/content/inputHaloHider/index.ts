/**
 * Input Halo Hider — toggle Gemini's blue radial-gradient halo behind the
 * input box (the `chat-window::before` pseudo-element + the blurred
 * `.nl-canvas` blobs at the top of the chat surface).
 *
 * Pure CSS toggle: flips a `gv-hide-input-halo` class on <body> based on
 * `StorageKeys.INPUT_HALO_HIDDEN`. The CSS rules live in
 * public/contentStyle.css and are gated on that class.
 */
import { StorageKeys } from '@/core/types/common';
import { isExtensionContextInvalidatedError } from '@/core/utils/extensionContext';

import type { StopNativeFeature } from '../featureLifecycle';

const BODY_CLASS = 'gv-hide-input-halo';

async function readInitialState(): Promise<boolean> {
  try {
    const res = await chrome.storage?.sync?.get({ [StorageKeys.INPUT_HALO_HIDDEN]: false });
    return res?.[StorageKeys.INPUT_HALO_HIDDEN] === true;
  } catch {
    return false;
  }
}

export function startInputHaloHider(): StopNativeFeature {
  if (location.hostname !== 'gemini.google.com') return () => {};

  let disposed = false;
  // Bumped by every live change, so a startup read that resolves after one
  // never overwrites it.
  let revision = 0;
  let onDomReady: (() => void) | null = null;

  const cancelDomReady = (): void => {
    if (!onDomReady) return;
    document.removeEventListener('DOMContentLoaded', onDomReady);
    onDomReady = null;
  };

  const apply = (hidden: boolean): void => {
    cancelDomReady();
    if (document.body) {
      document.body.classList.toggle(BODY_CLASS, hidden);
      return;
    }
    const ready = (): void => {
      onDomReady = null;
      document.body?.classList.toggle(BODY_CLASS, hidden);
    };
    onDomReady = ready;
    document.addEventListener('DOMContentLoaded', ready, { once: true });
  };

  const onStorageChanged = (
    changes: Record<string, chrome.storage.StorageChange>,
    area: string,
  ): void => {
    if (disposed || area !== 'sync') return;
    const change = changes[StorageKeys.INPUT_HALO_HIDDEN];
    if (!change) return;
    revision += 1;
    apply(change.newValue === true);
  };

  const stop: StopNativeFeature = () => {
    if (disposed) return;
    disposed = true;
    try {
      chrome.storage?.onChanged?.removeListener(onStorageChanged);
    } catch {
      // Context may be gone; nothing left to remove.
    }
    cancelDomReady();
    document.body?.classList.remove(BODY_CLASS);
  };

  // Listen before reading: a toggle that lands while the read is in flight wins.
  try {
    chrome.storage?.onChanged?.addListener(onStorageChanged);
  } catch (error) {
    if (isExtensionContextInvalidatedError(error)) return stop;
    throw error;
  }

  const readRevision = revision;
  void readInitialState().then((hidden) => {
    if (disposed || revision !== readRevision) return;
    apply(hidden);
  });

  return stop;
}
