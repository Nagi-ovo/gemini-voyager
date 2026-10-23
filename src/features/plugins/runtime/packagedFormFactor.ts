/**
 * Whether a packaged plugin runs on this device, for the few start paths that
 * serve a plugin's feature outside `PluginHost` (Folder-as-Project, a
 * feature's coachmark or notice, the watermark fetch interceptor). They follow
 * the plugin's own `requires.formFactors`, so adding `"mobile"` to its
 * manifest turns them on together with the plugin.
 */
import type { FormFactor } from '@/core/types/formFactor';
import { requestPageFormFactor } from '@/core/utils/formFactor';

import { BUILTIN_PLUGINS } from '../builtin';
import { BundledCatalogPluginSource } from '../sources/BundledCatalogPluginSource';
import type { PluginManifest } from '../types';
import { runsOnFormFactor } from './pluginStatus';

let bundled: Promise<readonly PluginManifest[]> | null = null;

async function packagedManifest(pluginId: string): Promise<PluginManifest | null> {
  const builtin = BUILTIN_PLUGINS.find((manifest) => manifest.id === pluginId);
  if (builtin) return builtin;
  bundled ??= new BundledCatalogPluginSource().list();
  return (await bundled).find((manifest) => manifest.id === pluginId) ?? null;
}

/** An id this build does not package runs nowhere but a desktop, as any manifest without the key. */
export async function packagedPluginRunsOn(
  pluginId: string,
  formFactor: FormFactor,
): Promise<boolean> {
  const manifest = await packagedManifest(pluginId);
  return manifest ? runsOnFormFactor(manifest, formFactor) : formFactor === 'desktop';
}

/** Content scripts: the same, on the device class the background reports for this page. */
export async function packagedPluginRunsHere(pluginId: string): Promise<boolean> {
  return packagedPluginRunsOn(pluginId, await requestPageFormFactor());
}
