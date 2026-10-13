/**
 * Shared harness for tests that run the bundled catalog plugins for real
 * through `DeclarativeEngine`: the single-plugin lifecycle test and the
 * pairwise combination matrix.
 */
import { type Mock } from 'vitest';

import { matchesAnyPattern } from '../../sites/matchPattern';
import { DEFAULT_ADAPTERS } from '../../sites/registry';
import type { PluginManifest, PluginSettingValue, SiteAdapter } from '../../types';

function probeUrl(pattern: string): string {
  return pattern.replace(/^(\w+):\/\/\*\./, '$1://x.').replace(/\*$/, '');
}

/** The bundled site adapter whose `matches` cover the plugin's. */
export function adapterFor(manifest: PluginManifest): SiteAdapter {
  const adapter = DEFAULT_ADAPTERS.find((candidate) =>
    manifest.matches.some((pattern) => matchesAnyPattern(probeUrl(pattern), candidate.matches)),
  );
  if (!adapter) throw new Error(`${manifest.id}: no bundled site adapter covers its matches`);
  return adapter;
}

export function defaultSettings(manifest: PluginManifest): Record<string, PluginSettingValue> {
  return Object.fromEntries(
    Object.entries(manifest.contributes.settings ?? {}).map(([key, field]) => [key, field.default]),
  );
}

/**
 * The formula service reads its copy format through webextension-polyfill,
 * which waits for chrome's callback: answer it, as storage would.
 */
export function answerSyncStorageReads(): void {
  (chrome.storage.sync.get as unknown as Mock).mockImplementation(
    (_keys: unknown, callback?: (items: Record<string, unknown>) => void) => {
      callback?.({});
      return Promise.resolve({});
    },
  );
}

/**
 * No background page answers in jsdom: reply to every runtime message with
 * nothing, as a background without that handler would, so callers waiting on
 * a callback (the timeline's starred-message reads) carry on with their defaults.
 */
export function answerRuntimeMessages(): void {
  (chrome.runtime.sendMessage as unknown as Mock).mockImplementation(
    (_message: unknown, callback?: (response: unknown) => void) => {
      callback?.(undefined);
      return Promise.resolve(undefined);
    },
  );
}
