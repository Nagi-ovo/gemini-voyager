/**
 * `draftSave` primitive: Gemini's draft auto-save on catalog sites. Unsent
 * text in the adapter's `composer` survives a refresh or a return to the same
 * conversation, keyed per site and per conversation id (`session.ts`).
 *
 * These sites carry no account index in their routes, so drafts are scoped to
 * the site and conversation, not to the signed-in account.
 */
import { findComposer } from '@/core/services/composer';

import type { ManifestIssue } from '../../manifest/validate';
import { getPrimitiveContract } from '../contracts';
import type { Primitive } from '../types';
import { catalogDraftPolicy } from './draftPolicy';
import { startSiteDraftSave } from './session';

export type DraftSaveParams = Readonly<Record<string, never>>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export const draftSavePrimitive: Primitive<DraftSaveParams> = {
  contract: getPrimitiveContract('draftSave')!,

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
    const adapter = context.adapter;
    context.setTargetCounter(() =>
      findComposer(adapter, { doc: context.doc, requireVisible: false }) ? 1 : 0,
    );
    // Without a conversation route every chat would share one draft; save nothing instead.
    if (!adapter?.selectors.composer || !adapter.conversationIdPattern) return;
    startSiteDraftSave(scope, catalogDraftPolicy(adapter), context.doc);
  },
};
