import { PluginHost } from '@/features/plugins/runtime/PluginHost';
import { getNativeHandler, registerNativeHandler } from '@/features/plugins/runtime/nativeHandlers';
import { createOfficialAdmission } from '@/features/plugins/runtime/officialAdmission';
import { OFFICIAL_PLUGIN_IDS } from '@/features/plugins/sites/featureOwners';
import { BuiltinPluginSource } from '@/features/plugins/sources/BuiltinPluginSource';

import { activateGeminiUsageStatus } from '../pluginHandler';

export async function flushUsagePlugin(): Promise<void> {
  for (let round = 0; round < 100; round++) await Promise.resolve();
}

/** Real official switch and scope lifecycle, replacing the retired native wrapper fixture. */
export async function startUsagePlugin(): Promise<() => void> {
  const id = OFFICIAL_PLUGIN_IDS.geminiUsageStatus;
  if (!getNativeHandler(id)) registerNativeHandler(id, { activate: activateGeminiUsageStatus });
  const admission = createOfficialAdmission();
  admission.admit('gemini', 'usageStatus');
  admission.close();
  const host = new PluginHost({
    url: location.href,
    doc: document,
    sources: [new BuiltinPluginSource()],
    admission,
    isTopFrame: true,
    requestCatalogRefresh: () => {},
  });
  await host.start();
  await flushUsagePlugin();
  return () => host.stop();
}
