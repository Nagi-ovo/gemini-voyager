/**
 * Browser detection utilities
 * Provides reliable browser detection for Safari-specific handling
 */

/**
 * Detect if the current browser is Safari
 *
 * Detection strategy:
 * 1. Check for Safari-specific vendor string (Apple Inc.)
 * 2. Ensure 'safari' is in user agent
 * 3. Ensure it's not Chrome/Chromium (which also uses webkit)
 *
 * Note: Do not rely on global objects (browser/chrome) for detection,
 * as webextension-polyfill makes browser available in all browsers,
 * and Firefox provides both browser and chrome objects.
 *
 * @returns true if running in Safari
 */
export function isSafari(): boolean {
  // Reliable detection using user agent and vendor
  const ua = navigator.userAgent.toLowerCase();
  const vendor = navigator.vendor.toLowerCase();

  // Safari has 'Apple' vendor and 'safari' in UA, but not 'chrome'
  const isAppleVendor = vendor.includes('apple');
  const hasSafariUA = ua.includes('safari');
  const notChrome = !ua.includes('chrome') && !ua.includes('chromium');

  return isAppleVendor && hasSafariUA && notChrome;
}

/**
 * Check if update reminders should be shown on Safari
 * This is controlled by the ENABLE_SAFARI_UPDATE_CHECK environment variable at build time
 *
 * @returns true if Safari update reminders are enabled
 */
export function shouldShowSafariUpdateReminder(): boolean {
  if (!isSafari()) return false;

  // Check build-time flag (injected via vite config)
  // Default: false (disabled)
  try {
    return import.meta.env.ENABLE_SAFARI_UPDATE_CHECK === 'true';
  } catch {
    return false;
  }
}

/**
 * Get browser name for debugging
 * Uses user agent detection for reliability
 */
export function getBrowserName(): string {
  if (isSafari()) return 'Safari';

  const ua = navigator.userAgent.toLowerCase();

  // Firefox has 'firefox' in UA
  if (ua.includes('firefox')) return 'Firefox';

  // Chrome/Edge/Brave have 'chrome' or 'chromium' in UA
  if (ua.includes('chrome') || ua.includes('chromium')) {
    if (ua.includes('edg')) return 'Edge';
    return 'Chrome/Chromium';
  }

  return 'Unknown';
}
