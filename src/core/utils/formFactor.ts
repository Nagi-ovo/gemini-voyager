/**
 * Which device class this browser runs on: `mobile` on Android, `desktop`
 * everywhere else. Read from the system rather than the user agent or the
 * window width, because Firefox for Android's "Desktop site" switch rewrites
 * the user agent into a desktop one.
 *
 * Extension pages (background, popup) ask `runtime.getPlatformInfo()`. A
 * content script cannot, so it asks the background once per page and keeps
 * the answer. When no answer comes, the page guesses from what Desktop site
 * leaves alone (see `guessPageFormFactor`) instead of assuming a desktop.
 *
 * In the Chrome dev build only, `gvDevFormFactor: 'mobile'` in
 * `chrome.storage.local` makes a desktop act as a phone, for checks through
 * the dev settings bridge. Production builds drop that read.
 */
import { type FormFactor, isFormFactor } from '@/core/types/formFactor';

export type { FormFactor };

export const FORM_FACTOR_MESSAGE = 'gv.formFactor.get';

/** Dev builds only: a local storage value that overrides the detected form factor. */
export const DEV_FORM_FACTOR_KEY = 'gvDevFormFactor';

/**
 * How long a page waits for the background before guessing. A woken service
 * worker answers well inside it; a missing one should not hold plugins back.
 */
export const PAGE_FORM_FACTOR_TIMEOUT_MS = 1500;

export function formFactorFromOs(os: string | undefined): FormFactor {
  return os === 'android' ? 'mobile' : 'desktop';
}

/**
 * The page's own reading, for when the background cannot be asked. An
 * Android user agent is a phone; so is a page whose only pointer is coarse,
 * which Desktop site does not change. Anything with a mouse or trackpad stays
 * a desktop.
 */
export function guessPageFormFactor(): FormFactor {
  if (/\bAndroid\b/i.test(globalThis.navigator?.userAgent ?? '')) return 'mobile';
  try {
    const media = globalThis.matchMedia;
    if (
      typeof media === 'function' &&
      media('(pointer: coarse)').matches &&
      !media('(any-pointer: fine)').matches
    ) {
      return 'mobile';
    }
  } catch {
    // No media queries here (a worker): nothing to go on.
  }
  return 'desktop';
}

async function devOverride(): Promise<FormFactor | null> {
  if (!import.meta.env.VOYAGER_DEV_SETTINGS_BRIDGE) return null;
  try {
    const stored = await chrome.storage.local.get(DEV_FORM_FACTOR_KEY);
    const value: unknown = stored?.[DEV_FORM_FACTOR_KEY];
    return isFormFactor(value) ? value : null;
  } catch {
    return null;
  }
}

let platformReading: Promise<FormFactor> | null = null;

async function readPlatformInfo(): Promise<FormFactor> {
  try {
    const info = await chrome.runtime.getPlatformInfo();
    return formFactorFromOs(info?.os);
  } catch {
    return guessPageFormFactor();
  }
}

/** Background and popup: the system's answer, read once per context. */
export async function readPlatformFormFactor(): Promise<FormFactor> {
  platformReading ??= readPlatformInfo();
  // Read every time, so flipping the dev key applies on the next page load.
  return (await devOverride()) ?? platformReading;
}

let pageReading: Promise<FormFactor> | null = null;

async function askBackground(): Promise<FormFactor | null> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const timeout = new Promise<null>((resolve) => {
      timer = setTimeout(() => resolve(null), PAGE_FORM_FACTOR_TIMEOUT_MS);
    });
    const response: unknown = await Promise.race([
      chrome.runtime.sendMessage({ type: FORM_FACTOR_MESSAGE }),
      timeout,
    ]);
    const formFactor = (response as { formFactor?: unknown } | null | undefined)?.formFactor;
    return isFormFactor(formFactor) ? formFactor : null;
  } catch {
    // Extension context gone, or no background listening.
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** Content scripts: the background's answer, asked once per page, or the page's guess. */
export function requestPageFormFactor(): Promise<FormFactor> {
  pageReading ??= askBackground().then((answer) => answer ?? guessPageFormFactor());
  return pageReading;
}

/** The background's reply to `FORM_FACTOR_MESSAGE`. */
export async function formFactorResponse(): Promise<{ ok: true; formFactor: FormFactor }> {
  return { ok: true, formFactor: await readPlatformFormFactor() };
}
