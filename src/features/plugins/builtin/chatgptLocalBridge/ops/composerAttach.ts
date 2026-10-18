/**
 * `composer.attach` (spec §3.4, leased): pull each blob through the
 * background, check its size and sha256, then hand all files to the composer
 * form's general file input at once (`DataTransfer` → `input.files` →
 * `input` + `change`, as measured live) and wait for ChatGPT to show and
 * finish them.
 *
 * Success needs positive evidence, held for {@link SETTLE_MS}: a card naming
 * every file (never the file input itself), no upload marker in the form, and
 * an enabled send control. A file never shown is `attachment-rejected`; shown
 * but never confirmed is `unverified` (or `timeout` while still uploading),
 * with what was seen. The input is dispatched once and nothing is retried.
 *
 * Like `composer.send`, the composer belongs to the person first: a draft,
 * files already attached, a reply being written, or their input in the last
 * {@link RECENT_INPUT_MS} make this `composer-busy` before any page event.
 */
import { readComposer } from '@/core/services/composer';
import type { ComposerAttachParams, ComposerAttachResult } from '@/features/bridge/protocol';
import { hasComposerAttachments } from '@/features/plugins/builtin/chatgptTemporaryHandoff/composerDelivery';
import type { SiteAdapter } from '@/features/plugins/types';

import type { OpContext } from '../opContext';
import {
  findAttachmentCard,
  findGeneralFileInput,
  rejectionNotice,
  uploadBusySignals,
} from './attachmentEvidence';
import { type BlobChunkReader, fetchBlobFile } from './blobBytes';
import { type ComposerActivity, RECENT_INPUT_MS } from './composerSend';
import {
  composerFormOf,
  findComposerField,
  findSendButton,
  hasStopControl,
  isEnabledButton,
  normalizeForCompare,
} from './pageReaders';

const COMPOSER_TIMEOUT_MS = 10_000;
/** No card for a file this long after the change event: the page did not take it. */
export const PREVIEW_TIMEOUT_MS = 25_000;
export const SETTLE_MS = 1_500;
/** A card that was shown and is gone this long: the page dropped the file. */
const CARD_LOST_MS = 3_000;
const UPLOAD_PROGRESS_EVERY_MS = 5_000;
/** Kept back from the grant so the op reports its own failure before the lease runs out. */
const DEADLINE_MARGIN_MS = 1_000;

function checkComposerFree(
  ctx: OpContext,
  field: HTMLElement,
  adapter: SiteAdapter | null,
  activity: ComposerActivity,
): void {
  if (normalizeForCompare(readComposer(field)) !== '') {
    ctx.fail('composer-busy', 'The composer holds a draft.', { reason: 'draft' });
  }
  if (hasComposerAttachments(composerFormOf(field))) {
    ctx.fail('composer-busy', 'The composer already holds attachments.', {
      reason: 'attachments',
    });
  }
  if (activity.hadRecentUserInput(RECENT_INPUT_MS)) {
    ctx.fail('composer-busy', 'The person is using the composer.', { reason: 'recent-input' });
  }
  if (hasStopControl(adapter)) {
    ctx.fail('composer-busy', 'ChatGPT is still writing a reply.', { reason: 'generating' });
  }
}

interface UploadView {
  readonly missing: readonly string[];
  readonly removeControls: number;
  readonly busy: readonly string[];
  readonly sendEnabled: boolean;
}

export async function runComposerAttach(
  ctx: OpContext,
  params: ComposerAttachParams,
  adapter: SiteAdapter | null,
  activity: ComposerActivity,
  readChunk: BlobChunkReader,
): Promise<ComposerAttachResult> {
  if (params.method === 'paste') {
    ctx.fail('bad-request', 'Only the file input is supported for uploads.', { method: 'paste' });
  }
  const names = params.blobs.map((blob) => blob.name);
  if (new Set(names.map((name) => name.toLowerCase())).size !== names.length) {
    ctx.fail('bad-request', 'Attachment names must differ.', { names });
  }

  const field = await ctx.waitFor(() => findComposerField(adapter), {
    timeoutMs: COMPOSER_TIMEOUT_MS,
  });
  if (!field) ctx.fail('selector-missing', 'The ChatGPT composer was not found.');
  const form = composerFormOf(field);
  if (!findGeneralFileInput(form)) {
    ctx.fail('selector-missing', 'The composer has no general file input.');
  }
  checkComposerFree(ctx, field, adapter, activity);

  // Every byte is checked before the page sees any of it.
  const total = params.blobs.reduce((sum, blob) => sum + blob.size, 0);
  let done = 0;
  const files: File[] = [];
  for (const blob of params.blobs) {
    const before = done;
    files.push(
      await fetchBlobFile(ctx, blob, readChunk, (bytes) => {
        done = before + bytes;
        ctx.progress({ phase: 'transfer', bytes: done, total });
      }),
    );
  }

  // The transfer can take a while: look again right before touching the page.
  const input = findGeneralFileInput(form);
  if (!input || !form.isConnected) {
    ctx.fail('selector-missing', 'The composer file input went away.');
  }
  if (files.length > 1 && !input.multiple) {
    ctx.fail('selector-missing', 'The composer file input takes one file at a time.');
  }
  checkComposerFree(ctx, field, adapter, activity);
  const transfer = new DataTransfer();
  for (const file of files) transfer.items.add(file);
  ctx.guard();
  input.files = transfer.files;
  if (input.files?.length !== files.length) {
    ctx.fail('unverified', 'The file input did not take the files.', { stage: 'input' });
  }
  ctx.dispatch(input, new Event('input', { bubbles: true }));
  ctx.dispatch(input, new Event('change', { bubbles: true }));
  // Only watching from here on: the lease can go to the next op as soon as this one ends.
  ctx.endPageEvents();
  const dispatchedAt = ctx.now();

  const view = (): UploadView => {
    const cards = names.map((name) => ({ name, ...findAttachmentCard(form, field, name) }));
    const button = findSendButton(field, adapter);
    return {
      missing: cards.filter((card) => !card.card).map((card) => card.name),
      removeControls: cards.filter((card) => card.removeControl).length,
      busy: uploadBusySignals(form, field),
      sendEnabled: !!button && isEnabledButton(button),
    };
  };
  const notice = (): string | null => {
    for (const name of names) {
      const text = rejectionNotice(form, name);
      if (text) return text;
    }
    return null;
  };
  const budget = (): number => ctx.grant.deadline - DEADLINE_MARGIN_MS - ctx.now();

  const shown = await ctx.waitFor(
    () => {
      const text = notice();
      if (text) return { notice: text };
      return view().missing.length === 0 ? { notice: null } : null;
    },
    { timeoutMs: Math.max(0, Math.min(PREVIEW_TIMEOUT_MS, budget())) },
  );
  if (!shown || shown.notice) {
    ctx.fail('attachment-rejected', 'ChatGPT did not take the attachment.', {
      missing: view().missing,
      ...(shown?.notice ? { notice: shown.notice } : {}),
    });
  }
  const previewMs = ctx.now() - dispatchedAt;

  let stableSince: number | null = null;
  let lostSince: number | null = null;
  let lastProgressAt = ctx.now();
  let busySeen = false;
  let last = view();
  const settled = await ctx.waitFor(
    () => {
      const at = ctx.now();
      last = view();
      busySeen ||= last.busy.length > 0;
      const text = notice();
      if (text) return { rejected: text };
      if (last.missing.length > 0) {
        lostSince ??= at;
        if (at - lostSince >= CARD_LOST_MS) return { rejected: null };
      } else {
        lostSince = null;
      }
      if (at - lastProgressAt >= UPLOAD_PROGRESS_EVERY_MS) {
        lastProgressAt = at;
        ctx.progress({ phase: 'uploading', elapsedMs: at - dispatchedAt, busy: last.busy });
      }
      const ready = last.missing.length === 0 && last.busy.length === 0 && last.sendEnabled;
      if (!ready) {
        stableSince = null;
        return null;
      }
      stableSince ??= at;
      return at - stableSince >= SETTLE_MS ? { rejected: undefined } : null;
    },
    { timeoutMs: Math.max(0, budget()) },
  );
  const evidence = {
    files: names.length,
    bytes: total,
    previewMs,
    removeControls: last.removeControls,
    busySeen,
    busy: last.busy,
    sendEnabled: last.sendEnabled,
    missing: last.missing,
  };
  if (settled && settled.rejected !== undefined) {
    ctx.fail('attachment-rejected', 'ChatGPT dropped the attachment.', {
      ...evidence,
      ...(settled.rejected ? { notice: settled.rejected } : {}),
    });
  }
  if (!settled) {
    // Still uploading when the time ran out is a timeout; anything else contradicts success.
    ctx.fail(
      last.busy.length > 0 ? 'timeout' : 'unverified',
      'The upload could not be confirmed as finished.',
      { ...evidence, partial: true },
    );
  }
  return {
    attached: names.map((name) => ({ name, method: 'input' as const })),
    evidence: { ...evidence, settledMs: ctx.now() - dispatchedAt },
  };
}
