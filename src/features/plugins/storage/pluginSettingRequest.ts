/**
 * Plugin setting writes from content scripts.
 *
 * A content script cannot hold the plugin-storage lock (its Web Locks belong to
 * the page's origin, see `pluginStorageLock.ts`), so a whole-map write from a
 * page could land after a local-plugin re-import and switch the new, unreviewed
 * version back on. Pages therefore ask the background, which writes under the
 * lock it shares with the popup. The request carries one setting value only: it
 * can never change a plugin's enable state.
 */
import { logger } from '@/core/services/LoggerService';
import { isExtensionContextInvalidatedError } from '@/core/utils/extensionContext';

import { PLUGIN_SET_SETTING_MESSAGE } from '../runtime/messages';
import type { PluginManifest, PluginSettingValue, SettingField } from '../types';

export interface PluginSettingRequest {
  readonly id: string;
  readonly key: string;
  readonly value: PluginSettingValue;
}

function isSafeKey(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.length > 0 &&
    value !== '__proto__' &&
    value !== 'prototype' &&
    value !== 'constructor'
  );
}

/** Validate an untrusted request payload; null when malformed. */
export function parsePluginSettingRequest(payload: unknown): PluginSettingRequest | null {
  if (typeof payload !== 'object' || payload === null) return null;
  const { id, key, value } = payload as Record<string, unknown>;
  if (!isSafeKey(id) || !isSafeKey(key)) return null;
  const valid =
    typeof value === 'string' ||
    typeof value === 'boolean' ||
    (typeof value === 'number' && Number.isFinite(value));
  return valid ? { id, key, value } : null;
}

function fitsField(field: SettingField, value: PluginSettingValue): boolean {
  switch (field.type) {
    case 'boolean':
      return typeof value === 'boolean';
    case 'number':
      return (
        typeof value === 'number' &&
        (field.min === undefined || value >= field.min) &&
        (field.max === undefined || value <= field.max)
      );
    case 'select':
      return typeof value === 'string' && (field.options ?? []).some((o) => o.value === value);
    default:
      return typeof value === 'string';
  }
}

/** True when `manifest` declares `request.key` as a setting `request.value` fits. */
export function isDeclaredPluginSetting(
  manifest: PluginManifest,
  request: PluginSettingRequest,
): boolean {
  const fields = manifest.contributes.settings ?? {};
  if (!Object.prototype.hasOwnProperty.call(fields, request.key)) return false;
  return fitsField(fields[request.key], request.value);
}

/**
 * Ask the background to persist one plugin setting. Resolves false, after
 * logging, when the background refused or failed to store it; never throws.
 */
export async function requestPluginSetting(
  id: string,
  key: string,
  value: PluginSettingValue,
): Promise<boolean> {
  try {
    const response: unknown = await chrome.runtime.sendMessage({
      type: PLUGIN_SET_SETTING_MESSAGE,
      payload: { id, key, value },
    });
    const ok = (response as { ok?: unknown } | undefined)?.ok === true;
    if (!ok) logger.warn('requestPluginSetting was not stored', { id, key, response });
    return ok;
  } catch (error) {
    if (!isExtensionContextInvalidatedError(error)) {
      logger.warn('requestPluginSetting failed', { id, key, error: String(error) });
    }
    return false;
  }
}
