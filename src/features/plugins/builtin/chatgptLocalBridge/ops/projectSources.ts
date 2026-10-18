/**
 * `project.files`, `project.upload` and `project.remove` (leased): a project's
 * sources view, on the project the tab already shows (`project.open` first).
 *
 * Two measured behaviours shape them:
 * - ChatGPT ignores an upload under a name the project already lists, without
 *   a word. `project.upload` refuses such a name before any page event, so an
 *   upload is never reported for a file that did not change; the caller
 *   removes the old file first. Success needs the new row, listed once, out of
 *   its uploading state, held for {@link SETTLE_MS}.
 * - 「删除」 in a row's menu removes the file at once: no confirmation, no
 *   toast, no undo. `project.remove` presses it once, for a name listed
 *   exactly once, and succeeds only when the row stays gone.
 */
import type {
  ProjectFilesParams,
  ProjectFilesResult,
  ProjectRemoveParams,
  ProjectRemoveResult,
  ProjectUploadParams,
  ProjectUploadResult,
} from '@/features/bridge/protocol';
import type { ProjectsSection } from '@/features/plugins/sites/sections/projectsData';
import type { SiteAdapter } from '@/features/plugins/types';
import { isRendered } from '@/pages/content/export/adapter/chatgptThread';

import type { OpContext } from '../opContext';
import { type BlobChunkReader, fetchBlobFile } from './blobBytes';
import {
  type FileRow,
  allLabels,
  ensureSourcesView,
  fileRows,
  filesOf,
  findUploadInput,
  requireProjectPage,
  requireProjectsData,
  timeLeft,
} from './projectPage';

export const SETTLE_MS = 1_500;
/** The list loads after the view; a project with no files shows no row at all. */
const LIST_SETTLE_MS = 2_000;
/** A row dated this long before the upload is an older file the page kept, not the upload. */
const OLDER_THAN_UPLOAD_MS = 10 * 60_000;
const LIST_TIMEOUT_MS = 10_000;
const MENU_TIMEOUT_MS = 3_000;
const REMOVE_TIMEOUT_MS = 10_000;
const UPLOAD_PROGRESS_EVERY_MS = 5_000;
/** Kept back from the grant so the op reports its own failure before the lease runs out. */
const DEADLINE_MARGIN_MS = 1_000;
const BUSY_SELECTOR = '[aria-busy="true"], [role="progressbar"], progress';

const signature = (rows: readonly FileRow[]): string =>
  JSON.stringify(rows.map((row) => [row.name, row.uploadedAt]));

/** The sources view's rows once they have stopped changing. */
async function settledRows(ctx: OpContext, data: ProjectsSection): Promise<FileRow[]> {
  let last = '';
  let since = ctx.now();
  await ctx.waitFor(
    () => {
      const now = signature(fileRows(data));
      if (now !== last) {
        last = now;
        since = ctx.now();
      }
      return ctx.now() - since >= LIST_SETTLE_MS;
    },
    { timeoutMs: timeLeft(ctx, LIST_TIMEOUT_MS) },
  );
  return fileRows(data);
}

async function openSources(
  ctx: OpContext,
  params: { readonly projectId: string },
  adapter: SiteAdapter | null,
): Promise<{ data: ProjectsSection; rows: FileRow[] }> {
  const data = requireProjectsData(ctx, adapter);
  requireProjectPage(ctx, data, params.projectId);
  await ensureSourcesView(ctx, data);
  return { data, rows: await settledRows(ctx, data) };
}

export async function runProjectFiles(
  ctx: OpContext,
  params: ProjectFilesParams,
  adapter: SiteAdapter | null,
): Promise<ProjectFilesResult> {
  const { rows } = await openSources(ctx, params, adapter);
  return { projectId: params.projectId, files: filesOf(rows) };
}

export async function runProjectUpload(
  ctx: OpContext,
  params: ProjectUploadParams,
  adapter: SiteAdapter | null,
  readChunk: BlobChunkReader,
): Promise<ProjectUploadResult> {
  const { name } = params.blob;
  const { data, rows } = await openSources(ctx, params, adapter);
  const refuseListed = (listed: readonly FileRow[]): void => {
    if (!listed.some((row) => row.name === name)) return;
    ctx.fail(
      'bad-request',
      `${name} is already in the project; ChatGPT ignores an upload under a name it holds, so remove it first.`,
      { reason: 'name-exists', name },
    );
  };
  refuseListed(rows);
  if (!findUploadInput(data)) ctx.fail('selector-missing', 'The sources view has no file input.');

  // Every byte is checked before the page sees any of it.
  const file = await fetchBlobFile(ctx, params.blob, readChunk, (bytes) =>
    ctx.progress({ phase: 'transfer', bytes, total: params.blob.size }),
  );
  // The transfer can take a while: look again right before touching the page.
  const input = findUploadInput(data);
  if (!input) ctx.fail('selector-missing', 'The sources view file input went away.');
  refuseListed(fileRows(data));
  const transfer = new DataTransfer();
  transfer.items.add(file);
  ctx.guard();
  input.files = transfer.files;
  if (input.files?.length !== 1) {
    ctx.fail('unverified', 'The file input did not take the file.', { stage: 'input' });
  }
  // Measured: the sources input reacts to `change` alone.
  ctx.dispatch(input, new Event('change', { bubbles: true }));
  ctx.endPageEvents();
  const dispatchedAt = ctx.now();
  const budget = (): number => ctx.grant.deadline - DEADLINE_MARGIN_MS - ctx.now();

  let stableSince: number | null = null;
  let lastProgressAt = dispatchedAt;
  let shownAt: number | null = null;
  let busySeen = false;
  let copies = 0;
  let busy = false;
  const settled = await ctx.waitFor(
    () => {
      const at = ctx.now();
      const mine = fileRows(data).filter((row) => row.name === name);
      copies = mine.length;
      busy = mine.some(
        (row) => !!row.row.querySelector(BUSY_SELECTOR) || row.row.matches(BUSY_SELECTOR),
      );
      busySeen ||= busy;
      if (copies > 0) shownAt ??= at;
      if (at - lastProgressAt >= UPLOAD_PROGRESS_EVERY_MS) {
        lastProgressAt = at;
        ctx.progress({ phase: 'uploading', elapsedMs: at - dispatchedAt, shown: copies > 0, busy });
      }
      if (copies !== 1 || busy) {
        stableSince = null;
        return null;
      }
      stableSince ??= at;
      return at - stableSince >= SETTLE_MS ? mine[0] : null;
    },
    { timeoutMs: Math.max(0, budget()) },
  );
  const evidence = {
    bytes: params.blob.size,
    shownMs: shownAt === null ? null : shownAt - dispatchedAt,
    busySeen,
    copies,
  };
  if (!settled) {
    if (shownAt === null) {
      ctx.fail('attachment-rejected', 'ChatGPT did not list the uploaded file.', evidence);
    }
    ctx.fail(
      busy ? 'timeout' : 'unverified',
      copies > 1
        ? 'The project lists the uploaded name more than once.'
        : 'The upload could not be confirmed as finished.',
      evidence,
    );
  }
  const listedAt = settled.uploadedAt === null ? Number.NaN : Date.parse(settled.uploadedAt);
  // A list still loading at the name check can show the old file only now: it is no proof.
  if (listedAt < dispatchedAt - OLDER_THAN_UPLOAD_MS) {
    ctx.fail(
      'unverified',
      `The project lists an older ${name}; ChatGPT kept it and ignored the upload.`,
      {
        ...evidence,
        reason: 'older-file',
        uploadedAt: settled.uploadedAt,
      },
    );
  }
  return {
    projectId: params.projectId,
    uploaded: { name: settled.name, uploadedAt: settled.uploadedAt },
    files: filesOf(fileRows(data)),
    evidence: { ...evidence, settledMs: ctx.now() - dispatchedAt },
  };
}

/** Radix menus open on a primary-button pointerdown; jsdom has no `PointerEvent`. */
function pointer(type: 'pointerdown' | 'pointerup'): Event {
  const init = {
    bubbles: true,
    cancelable: true,
    composed: true,
    button: 0,
    buttons: type === 'pointerdown' ? 1 : 0,
  };
  return typeof PointerEvent === 'function'
    ? new PointerEvent(type, { ...init, pointerType: 'mouse', isPrimary: true, pointerId: 1 })
    : new MouseEvent(type, init);
}

function menuItem(data: ProjectsSection, trigger: HTMLButtonElement): HTMLElement | null {
  const id = trigger.getAttribute('aria-controls');
  const menu = id ? document.getElementById(id) : null;
  if (!menu || !isRendered(menu)) return null;
  const labels = allLabels(data.sources.removeLabels);
  const items = Array.from(menu.querySelectorAll<HTMLElement>('[role="menuitem"]')).filter(
    (item) => labels.includes((item.textContent ?? '').trim()) && isRendered(item),
  );
  return items.length === 1 ? items[0] : null;
}

export async function runProjectRemove(
  ctx: OpContext,
  params: ProjectRemoveParams,
  adapter: SiteAdapter | null,
): Promise<ProjectRemoveResult> {
  const { data, rows } = await openSources(ctx, params, adapter);
  const matching = rows.filter((row) => row.name === params.name);
  if (matching.length === 0) {
    ctx.fail('not-found', `${params.name} is not in the project.`, {
      name: params.name,
      files: rows.map((row) => row.name),
    });
  }
  if (matching.length > 1) {
    ctx.fail('unverified', `The project lists ${params.name} more than once.`, {
      reason: 'ambiguous',
      copies: matching.length,
    });
  }
  const trigger = matching[0].actions;
  ctx.dispatch(trigger, pointer('pointerdown'));
  ctx.dispatch(trigger, pointer('pointerup'));
  const item = await ctx.waitFor(() => menuItem(data, trigger), {
    timeoutMs: timeLeft(ctx, MENU_TIMEOUT_MS),
  });
  if (!item) ctx.fail('menu-not-found', "The file's menu did not offer to remove it.");
  ctx.click(item);
  // Removal is immediate and final: nothing more is pressed, whatever follows.
  ctx.endPageEvents();
  let goneSince: number | null = null;
  const gone = await ctx.waitFor(
    () => {
      const at = ctx.now();
      if (fileRows(data).some((row) => row.name === params.name)) {
        goneSince = null;
        return null;
      }
      goneSince ??= at;
      return at - goneSince >= SETTLE_MS;
    },
    { timeoutMs: timeLeft(ctx, REMOVE_TIMEOUT_MS) },
  );
  if (!gone) {
    ctx.fail('unverified', `${params.name} is still listed after the removal.`, {
      removed: 'unknown',
      dialog: !!document.querySelector('[role="alertdialog"], [role="dialog"]'),
    });
  }
  return {
    projectId: params.projectId,
    removed: params.name,
    files: filesOf(fileRows(data)),
    evidence: { menuItem: (item.textContent ?? '').trim() },
  };
}
