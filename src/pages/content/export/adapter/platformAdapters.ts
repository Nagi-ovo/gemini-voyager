/**
 * Export adapter composition root.
 *
 * Host-specific DOM logic lives in one module per platform. Adding an exporter
 * takes a new platform module, its factory in `EXPORT_ADAPTER_FACTORIES`, and
 * its export site under the same id in `sites/resolveExportSite.ts` (the
 * `ExportHostId` type makes that second registration a compile error to skip).
 * Shared export services never check the host.
 */
import { SiteRegistry } from '@/features/plugins/sites/registry';
import type { SiteAdapter } from '@/features/plugins/types';

import { buildChatGptAdapter } from './platform/chatgpt';
import type { ExportPlatformAdapter } from './platform/contract';
import { buildGeminiAdapter } from './platform/gemini';

export type { ExportPlatformAdapter } from './platform/contract';

type ExportAdapterFactory = (site: SiteAdapter) => ExportPlatformAdapter;

const EXPORT_ADAPTER_FACTORIES = {
  gemini: buildGeminiAdapter,
  chatgpt: buildChatGptAdapter,
} satisfies Record<string, ExportAdapterFactory>;

/** A site id with a registered exporter. */
export type ExportHostId = keyof typeof EXPORT_ADAPTER_FACTORIES;

export interface ExportHost {
  readonly id: ExportHostId;
  readonly adapter: ExportPlatformAdapter;
}

const siteRegistry = SiteRegistry.createDefault();
const GEMINI_FALLBACK_URL = 'https://gemini.google.com/';

function isExportHostId(id: string): id is ExportHostId {
  return Object.hasOwn(EXPORT_ADAPTER_FACTORIES, id);
}

/** The exporter registered for the current site. */
export function resolveExportHost(): ExportHost {
  const site = siteRegistry.resolveByUrl(window.location.href);
  if (site && isExportHostId(site.id)) {
    return { id: site.id, adapter: EXPORT_ADAPTER_FACTORIES[site.id](site) };
  }

  // Preserve Voyager's historical behavior on the native Gemini entry point.
  // Future platforms must register an explicit factory instead of inheriting
  // Gemini's DOM rules by accident.
  const geminiSite = siteRegistry.resolveByUrl(GEMINI_FALLBACK_URL);
  if (!geminiSite) throw new Error('Gemini site adapter is unavailable');
  return { id: 'gemini', adapter: buildGeminiAdapter(geminiSite) };
}

/** Resolve the export implementation for the current site. */
export function resolveExportAdapter(): ExportPlatformAdapter {
  return resolveExportHost().adapter;
}
