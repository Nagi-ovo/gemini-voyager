/**
 * `draftSave` primitive: unsent text in the adapter's `composer` survives a
 * refresh or a return to the same conversation (`session.ts`). Gemini keeps its
 * native `gvDraft_<pathname>` keys and account routes (`geminiDraftPolicy`);
 * catalog sites carry no account index, so their drafts are scoped to the site
 * and conversation id.
 */
import { findComposer } from '@/core/services/composer';
import { geminiDraftPolicy } from '@/pages/content/draftSave/geminiDraftPolicy';

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
    if (!adapter?.selectors.composer) return;
    // Gemini's policy itself rejects Enterprise; it must never fall through to catalog keys.
    const isGemini = adapter.id === 'gemini';
    if (!isGemini && !adapter.conversationIdPattern) return;
    startSiteDraftSave(
      scope,
      isGemini ? geminiDraftPolicy() : catalogDraftPolicy(adapter),
      context.doc,
    );
  },
};
