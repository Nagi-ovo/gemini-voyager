/**
 * Platform capability detection for the plugin runtime.
 *
 * The `scripted` tier (arbitrary JS) can only run through the MV3
 * `chrome.userScripts` API, which:
 *  - is **absent on Safari** (Safari Web Extensions don't expose it, and the
 *    App Store review forbids running non-reviewed code), and
 *  - is **undefined on Chrome/Firefox until the user enables it** (Chrome 138+
 *    per-extension "Allow User Scripts" toggle; earlier Chrome: Developer mode).
 *
 * So this check doubles as a runtime availability gate: if it returns false, the
 * host must not attempt to execute a scripted plugin's code.
 */
import { isSafari } from '@/core/utils/browser';

export function isScriptedTierSupported(): boolean {
  if (isSafari()) return false;
  const g = globalThis as { chrome?: { userScripts?: unknown } };
  return typeof g.chrome?.userScripts !== 'undefined';
}
