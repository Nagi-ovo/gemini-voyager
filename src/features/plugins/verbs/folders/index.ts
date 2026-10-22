/**
 * `folders` primitive: a site's conversation folders, run from data. The
 * site's `site.json` `folders` section says where its sidebar and rows are
 * (`siteData.ts`), the core folder table what is written and where, and the
 * shared site folders runtime (`activate.ts`) does the rest; AI Studio, whose
 * folders sit as a panel in its nav over a session the page holds, runs its own
 * (`aistudio/`). Settings apply in place: hiding filed chats never reloads the
 * folders.
 */
import { folderSiteOf } from '@/features/folder/sites/folderSiteTable';

import type { ManifestIssue } from '../../manifest/validate';
import { getPrimitiveContract } from '../contracts';
import type { Primitive } from '../types';
import { startSiteFolders } from './activate';
import { startAIStudioFolders } from './aistudio/activate';
import { siteFoldersFromData } from './siteData';

export type FoldersParams = Readonly<Record<string, never>>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export const foldersPrimitive: Primitive<FoldersParams> = {
  contract: getPrimitiveContract('folders')!,

  validateParams(raw: unknown) {
    if (raw !== undefined && !isRecord(raw)) {
      return { success: false, error: [{ path: 'params', message: 'must be an object' }] };
    }
    const issues: ManifestIssue[] = Object.keys(raw ?? {}).map((key) => ({
      path: `params.${key}`,
      message: 'unknown parameter',
    }));
    return issues.length > 0 ? { success: false, error: issues } : { success: true, data: {} };
  },

  activate(scope, _params, context) {
    const { adapter } = context;
    // AI Studio's folders keep their own panel and /library, on its core folder session.
    if (adapter?.folders && folderSiteOf(adapter.id)?.extension === 'aistudio') {
      const aistudio = startAIStudioFolders(scope, adapter.folders, context.settings);
      context.setTargetCounter(() => aistudio?.onScreen() ?? 0);
      return aistudio
        ? { updateSettings: (settings) => aistudio.updateSettings(settings) }
        : undefined;
    }
    const site = siteFoldersFromData(adapter);
    if (!site) {
      context.setTargetCounter(() => 0);
      return;
    }
    const runtime = startSiteFolders(scope, site, context.settings, context.adapter);
    context.setTargetCounter(() => runtime.onScreen());
    return { updateSettings: (settings) => runtime.updateSettings(settings) };
  },
};
