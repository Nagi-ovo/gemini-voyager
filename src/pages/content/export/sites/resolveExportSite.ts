import type { ExportPlatformAdapter } from '../adapter/platformAdapters';
import { type ExportHostId, resolveExportHost } from '../adapter/platformAdapters';
import type { ExportSite } from '../exportSite';
import { createChatGptExportSite } from './chatgpt';
import { createGeminiExportSite } from './gemini';

/** One export site per registered exporter, keyed like the adapter factories. */
const EXPORT_SITE_FACTORIES: Record<ExportHostId, (adapter: ExportPlatformAdapter) => ExportSite> =
  {
    gemini: createGeminiExportSite,
    chatgpt: createChatGptExportSite,
  };

/** The conversation export for the current host. */
export function resolveExportSite(): ExportSite {
  const { id, adapter } = resolveExportHost();
  return EXPORT_SITE_FACTORIES[id](adapter);
}
