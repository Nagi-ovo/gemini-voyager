/**
 * `folders` primitive: a site's conversation folders, run from data. The
 * site's `site.json` `folders` section says where its sidebar and rows are
 * (`siteData.ts`), the core folder table what is written and where, and the
 * shared site folders runtime (`activate.ts`) does the rest. Settings apply in
 * place: hiding filed chats never reloads the folders.
 */
import type { ManifestIssue } from '../../manifest/validate';
import { getPrimitiveContract } from '../contracts';
import type { Primitive } from '../types';
import { startSiteFolders } from './activate';
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
    const site = siteFoldersFromData(context.adapter);
    if (!site) {
      context.setTargetCounter(() => 0);
      return;
    }
    const runtime = startSiteFolders(scope, site, context.settings, context.adapter);
    context.setTargetCounter(() => runtime.onScreen());
    return { updateSettings: (settings) => runtime.updateSettings(settings) };
  },
};
