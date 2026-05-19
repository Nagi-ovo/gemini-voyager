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

const BODY_CLASS = 'gv-hide-input-halo';

function applyState(hidden: boolean): void {
  document.body?.classList.toggle(BODY_CLASS, hidden);
}

async function readInitialState(): Promise<boolean> {
  try {
    const res = await chrome.storage?.sync?.get({ [StorageKeys.INPUT_HALO_HIDDEN]: false });
    return res?.[StorageKeys.INPUT_HALO_HIDDEN] === true;
  } catch {
    return false;
  }
}

export function startInputHaloHider(): void {
  if (location.hostname !== 'gemini.google.com') return;

  const apply = (hidden: boolean) => {
    if (document.body) {
      applyState(hidden);
    } else {
      document.addEventListener('DOMContentLoaded', () => applyState(hidden), { once: true });
    }
  };

  void readInitialState().then(apply);

  try {
    chrome.storage?.onChanged?.addListener((changes, area) => {
      if (area !== 'sync') return;
      const change = changes[StorageKeys.INPUT_HALO_HIDDEN];
      if (!change) return;
      apply(change.newValue === true);
    });
  } catch (error) {
    if (isExtensionContextInvalidatedError(error)) return;
    throw error;
  }
}
