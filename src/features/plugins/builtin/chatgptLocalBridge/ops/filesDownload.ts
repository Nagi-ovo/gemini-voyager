/**
 * `files.download` (passive; no page event): fetch one sandbox file a reply
 * links and hand it to `voyager serve` as a blob. It runs only when the CLI
 * asks: no polling, no prefetch.
 *
 * The page-world observer makes the requests ChatGPT's own page makes, with
 * the page's headers, and returns only the bytes (`pageData/download.ts`).
 * ChatGPT sometimes answers 404 "Library file not found" for the message that
 * holds the link while another message of the same turn answers 200 for the
 * same path (measured 2026-10-19), so the candidate's message is asked first,
 * then the turn's other messages, newest first. A Pro reply may run python in
 * a sub-agent, so every message of the turn is asked, not only tool output.
 */
import {
  type FilesDownloadParams,
  type FilesDownloadResult,
  MAX_ATTACHMENT_BYTES,
} from '@/features/bridge/protocol';

import type { OpContext } from '../opContext';
import type { PageDownloadReply, PageDownloader } from '../pageData/download';
import type { PageData } from '../pageData/store';
import { sha256OfBytes } from './blobBytes';
import { type BlobWriter, uploadBlob } from './blobUpload';
import { requirePageObserver } from './pageObserver';
import { findReplyByKey, replyIdOf, settledConversationId } from './pageReaders';
import { downloadFileName, sandboxPathOf, turnMessages } from './sandboxFiles';

/** The largest file this hands over: the upload cap, so the CLI can send it back as is. */
export const MAX_DOWNLOAD_BYTES = MAX_ATTACHMENT_BYTES;
const FALLBACK_MIME = 'application/octet-stream';
const MAX_MIME = 255;

/** The turn's message id ChatGPT's answer knows: the key itself, else the reply it names. */
function anchorOf(messageIds: ReadonlySet<string>, key: string): string | null {
  if (messageIds.has(key)) return key;
  const found = findReplyByKey(key);
  const replyId = found ? replyIdOf(found.reply) : null;
  return replyId && messageIds.has(replyId) ? replyId : null;
}

function failDownload(
  ctx: OpContext,
  reply: Extract<PageDownloadReply, { ok: false }>,
  name: string,
): never {
  const details = {
    reason: reply.reason,
    ...(reply.status === undefined ? {} : { status: reply.status }),
    ...(reply.tried === undefined ? {} : { tried: reply.tried }),
  };
  switch (reply.reason) {
    // Every message of the turn answered 404: ChatGPT no longer has the file (its sandbox
    // expires). `not-found` is the protocol's code for an HTTP 404 of an unknown id; `gone`
    // means a job or task that ended, which this is not.
    case 'not-found':
      return ctx.fail('not-found', `ChatGPT no longer has ${name}.`, details);
    case 'unauthorized':
      return ctx.fail('login-required', 'ChatGPT refused the download; sign in again.', details);
    case 'too-large':
      return ctx.fail('attachment-too-large', `${name} is larger than the download limit.`, {
        ...details,
        ...(reply.size === undefined ? {} : { size: reply.size }),
        limit: MAX_DOWNLOAD_BYTES,
      });
    case 'cancelled':
      return ctx.fail('cancelled', 'The download was stopped.', details);
    default:
      if (reply.status === 429) {
        return ctx.fail('rate-limited', 'ChatGPT is limiting requests.', details);
      }
      return ctx.fail('unverified', `ChatGPT did not hand over ${name}.`, details);
  }
}

export async function runFilesDownload(
  ctx: OpContext,
  params: FilesDownloadParams,
  pageData: PageData,
  download: PageDownloader,
  writer: BlobWriter,
): Promise<FilesDownloadResult> {
  const { conversationId, assistantTurnKey, candidate } = params;
  const sandboxPath = sandboxPathOf(candidate);
  if (!sandboxPath) {
    ctx.fail('bad-request', 'The candidate is not a file in the sandbox (sandbox:/mnt/data/…).', {
      kind: candidate.kind,
    });
  }
  if (settledConversationId() !== conversationId) {
    ctx.fail('unverified', 'The tab shows another conversation.', {
      expected: conversationId,
      actual: settledConversationId(),
    });
  }
  await requirePageObserver(ctx, pageData);
  const messages = pageData.messages(conversationId);
  if (!messages) {
    ctx.fail('unverified', "ChatGPT's answer for this conversation was not seen in the page.", {
      reason: 'conversation-unobserved',
    });
  }
  const anchor = anchorOf(new Set(messages.map((message) => message.id)), assistantTurnKey);
  const turn = anchor ? turnMessages(messages, anchor) : null;
  if (!turn) {
    ctx.fail('unverified', "ChatGPT's answer for this conversation does not hold the turn.", {
      reason: 'turn-unobserved',
    });
  }
  if (!turn.some((message) => message.id === candidate.controlRef)) {
    ctx.fail('bad-request', 'The candidate does not belong to this reply.', {
      reason: 'foreign-control-ref',
    });
  }
  const messageIds = [
    candidate.controlRef,
    ...turn
      .map((message) => message.id)
      .filter((id) => id !== candidate.controlRef)
      .reverse(),
  ];

  const label = downloadFileName(null, sandboxPath);
  const reply = await download(
    { conversationId, messageIds, sandboxPath, maxBytes: MAX_DOWNLOAD_BYTES },
    ctx.signal,
  );
  if (!reply.ok) failDownload(ctx, reply, label);

  const bytes = new Uint8Array(reply.bytes);
  const meta = {
    name: downloadFileName(reply.name, sandboxPath),
    size: bytes.length,
    sha256: await sha256OfBytes(bytes),
    mime: reply.mime?.trim().slice(0, MAX_MIME) || FALLBACK_MIME,
  };
  const blobId = await uploadBlob(ctx, bytes, meta, writer);
  return { ...meta, blobId };
}
