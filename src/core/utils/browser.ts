/**
 * Browser detection utilities
 * Provides reliable browser detection for Safari-specific handling
 */

import browser from 'webextension-polyfill';

/**
 * Detect if the current browser is Safari
 *
 * Detection strategy:
 * 1. Check for Safari-specific vendor string
 * 2. Ensure it's not Chrome/Chromium (which also has webkit)
 * 3. Check for browser.runtime (extension context)
 *
 * @returns true if running in Safari
 */
export function isSafari(): boolean {
  // In extension context, check if browser object exists (Safari uses browser, not chrome)
  if (typeof browser !== 'undefined' && typeof chrome === 'undefined') {
    return true;
  }

  // Fallback: Check user agent and vendor
  const ua = navigator.userAgent.toLowerCase();
  const vendor = navigator.vendor.toLowerCase();

  // Safari has 'Apple' vendor and 'safari' in UA, but not 'chrome'
  const isAppleVendor = vendor.includes('apple');
  const hasSafariUA = ua.includes('safari');
  const notChrome = !ua.includes('chrome') && !ua.includes('chromium');

  return isAppleVendor && hasSafariUA && notChrome;
}

/**
 * Get browser name for debugging
 */
export function getBrowserName(): string {
  if (isSafari()) return 'Safari';
  if (typeof chrome !== 'undefined') return 'Chrome/Chromium';
  if (typeof browser !== 'undefined') return 'Firefox';
  return 'Unknown';
}
