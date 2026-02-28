/**
 * RTL (Right-to-Left) detection utilities.
 * Used to adapt the extension's UI for RTL languages like Arabic.
 */

/** Language codes that use RTL text direction */
const RTL_LANGUAGES = new Set(['ar', 'he', 'fa', 'ur']);

/**
 * Returns true if the given BCP 47 language code is an RTL language.
 */
export function isRTLLanguage(lang: string): boolean {
  return RTL_LANGUAGES.has(lang.split('-')[0].toLowerCase());
}

/**
 * Detects if the current UI context is RTL.
 *
 * Checks in priority order:
 * 1. The `dir` attribute on the `<html>` element (set by the host page)
 * 2. The `lang` attribute on the `<html>` element
 * 3. The provided extension UI language setting
 */
export function detectRTL(extensionLanguage?: string | null): boolean {
  // 1. Page-level dir attribute is the most authoritative signal
  const pageDir = document.documentElement.dir || document.body.dir;
  if (pageDir === 'rtl') return true;
  if (pageDir === 'ltr') return false;

  // 2. Page language attribute
  const pageLang = document.documentElement.lang?.split('-')[0]?.toLowerCase();
  if (pageLang && RTL_LANGUAGES.has(pageLang)) return true;

  // 3. Extension UI language stored in settings
  if (extensionLanguage && isRTLLanguage(extensionLanguage)) return true;

  return false;
}

/** CSS class added to `document.body` to activate RTL layout overrides */
export const GV_RTL_CLASS = 'gv-rtl';

/**
 * Applies or removes the RTL body class based on the detected direction.
 * @returns true if RTL was applied, false otherwise
 */
export function applyRTLClass(extensionLanguage?: string | null): boolean {
  const rtl = detectRTL(extensionLanguage);
  document.body.classList.toggle(GV_RTL_CLASS, rtl);
  return rtl;
}
