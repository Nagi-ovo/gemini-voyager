import { createExportEntrypoint } from '@/pages/content/export';
import { hasCatalogExport } from '@/pages/content/export/adapter/platform/catalog';
import { createCatalogExportSite } from '@/pages/content/export/sites/catalogSite';

import { getPrimitiveContract } from '../contracts';
import type { Primitive } from '../types';

export const conversationExportPrimitive: Primitive = {
  contract: getPrimitiveContract('conversationExport')!,
  validateParams(raw) {
    if (
      raw !== undefined &&
      (raw === null || typeof raw !== 'object' || Array.isArray(raw) || Object.keys(raw).length)
    ) {
      return { success: false, error: [{ path: 'params', message: 'must be an empty object' }] };
    }
    return { success: true, data: {} };
  },
  activate(scope, _params, context) {
    const site = context.adapter;
    context.setTargetCounter(
      () => context.doc.querySelectorAll('[data-gv-component="persistent-export-toolbar"]').length,
    );
    if (!site || !hasCatalogExport(site) || !site.conversationIdPattern) return;
    const start = createExportEntrypoint(createCatalogExportSite(site));
    scope.effect(() => start({ signal: scope.signal }), 'conversation-export');
  },
};
