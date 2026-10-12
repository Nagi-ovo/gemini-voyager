/**
 * The native usage status module: the usage runtime plus the popup switch.
 *
 * `gvUsageStatusEnabled` only hides the pill and pauses silent refresh here;
 * while the switch is off the module still scrapes Gemini's `/usage` page into
 * the account cache, so the pill has fresh numbers when it is turned back on.
 */
import browser from 'webextension-polyfill';

import { StorageKeys } from '@/core/types/common';

import { runUsageStatus } from './runtime';
import type { UsageStatusSwitch } from './runtime';

async function loadEnabled(): Promise<boolean> {
  try {
    const sync = await browser.storage.sync.get({ [StorageKeys.USAGE_STATUS_ENABLED]: false });
    return (sync as Record<string, unknown>)[StorageKeys.USAGE_STATUS_ENABLED] === true;
  } catch {
    return false;
  }
}

/** Only an explicit `true` in sync storage shows the pill. */
const NATIVE_USAGE_SWITCH: UsageStatusSwitch = {
  load: loadEnabled,
  read: (changes, areaName) => {
    const change = areaName === 'sync' ? changes[StorageKeys.USAGE_STATUS_ENABLED] : undefined;
    return change ? change.newValue === true : undefined;
  },
};

let nativeRun: AbortController | null = null;

export async function startUsageStatus(): Promise<() => void> {
  if (nativeRun) return () => {};
  const controller = new AbortController();
  nativeRun = controller;
  await runUsageStatus({ signal: controller.signal, usageSwitch: NATIVE_USAGE_SWITCH });
  return () => {
    if (nativeRun === controller) nativeRun = null;
    controller.abort();
  };
}
