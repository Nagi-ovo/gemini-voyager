/**
 * Deletes /library prompts one by one through AI Studio's own row menu and
 * confirmation dialog, as a user would, with a progress toast meanwhile.
 */
import type { Toaster } from '@/core/ui/toast/types';
import { normalizeText } from '@/core/utils/text';

import { findLibraryPromptRow } from './aistudioLibraryTable';

const TIMING = {
  DELAY_BETWEEN_DELETIONS: 500,
  MENU_APPEAR_DELAY: 300,
  DIALOG_APPEAR_DELAY: 300,
  DELETION_COMPLETE_DELAY: 500,
  MAX_BUTTON_WAIT_TIME: 3000,
  BUTTON_CHECK_INTERVAL: 100,
} as const;
const MORE_BUTTON_SELECTOR =
  'button[aria-label="More options"], button[aria-label*="More"], button.ms-button-icon';
const MENU_ITEM_SELECTOR =
  '.cdk-overlay-container button[role="menuitem"], .cdk-overlay-container [role="menuitem"], .mat-mdc-menu-content button';
const MENU_ICON_SELECTOR =
  '.cdk-overlay-container mat-icon, .cdk-overlay-container .material-icons, .cdk-overlay-container .google-symbols';
const DELETE_ICONS = ['delete', 'delete_forever', 'delete_outline'];

export type BatchDeleteResult = { successCount: number; failedCount: number };

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isVisible(element: HTMLElement): boolean {
  const style = window.getComputedStyle(element);
  return (
    style.display !== 'none' &&
    style.visibility !== 'hidden' &&
    style.opacity !== '0' &&
    element.offsetParent !== null
  );
}

/** Polls `find` until it clicks something or the wait runs out. */
async function pollAndClick(find: () => HTMLElement | null): Promise<boolean> {
  for (let elapsed = 0; elapsed < TIMING.MAX_BUTTON_WAIT_TIME;) {
    const target = find();
    if (target) {
      target.click();
      return true;
    }
    await delay(TIMING.BUTTON_CHECK_INTERVAL);
    elapsed += TIMING.BUTTON_CHECK_INTERVAL;
  }
  return false;
}

function matchesDeleteLabel(text: string, keywords: string[], shortOnly: boolean): boolean {
  return keywords.some(
    (keyword) => text === keyword || (text.includes(keyword) && (!shortOnly || text.length < 20)),
  );
}

function findDeleteMenuItem(keywords: string[]): HTMLElement | null {
  const byTestId = Array.from(
    document.querySelectorAll<HTMLElement>('[data-test-id="delete-button"]'),
  ).find(isVisible);
  if (byTestId) return byTestId;

  for (const item of document.querySelectorAll<HTMLElement>(MENU_ITEM_SELECTOR)) {
    if (!isVisible(item)) continue;
    if (matchesDeleteLabel(normalizeText(item.textContent).toLowerCase(), keywords, true)) {
      return item;
    }
  }

  const icon = Array.from(document.querySelectorAll<HTMLElement>(MENU_ICON_SELECTOR)).find(
    (candidate) => {
      const text = normalizeText(candidate.textContent).toLowerCase();
      const fontIcon = normalizeText(candidate.getAttribute('fonticon')).toLowerCase();
      return DELETE_ICONS.includes(text || fontIcon);
    },
  );
  const button = icon?.closest<HTMLElement>('button, [role="menuitem"]');
  return button && isVisible(button) ? button : null;
}

function findConfirmButton(keywords: string[]): HTMLElement | null {
  const byTestId = document.querySelector<HTMLElement>(
    '[data-test-id*="confirm"], [data-test-id*="delete"]:not([data-test-id="delete-button"])',
  );
  if (byTestId && isVisible(byTestId)) return byTestId;

  const buttons = Array.from(
    document.querySelectorAll<HTMLElement>(
      '.cdk-overlay-container button, .mat-mdc-dialog-container button',
    ),
  ).filter(isVisible);
  const labelled = buttons.find((button) =>
    matchesDeleteLabel(normalizeText(button.textContent).toLowerCase(), keywords, false),
  );
  if (labelled) return labelled;

  const actions = document
    .querySelector('.mat-mdc-dialog-actions, .mat-dialog-actions')
    ?.querySelectorAll<HTMLElement>('button');
  const last = actions && actions.length >= 2 ? actions[actions.length - 1] : null;
  return last && isVisible(last) ? last : null;
}

/** One deletion: open the row's menu, choose Delete, confirm. False when the row or menu fails. */
async function deletePrompt(conversationId: string, keywords: string[]): Promise<boolean> {
  const moreButton =
    findLibraryPromptRow(conversationId)?.querySelector<HTMLElement>(MORE_BUTTON_SELECTOR);
  if (!moreButton) return false;

  moreButton.click();
  await delay(TIMING.MENU_APPEAR_DELAY);
  if (!(await pollAndClick(() => findDeleteMenuItem(keywords)))) {
    document.querySelector<HTMLElement>('.cdk-overlay-backdrop')?.click();
    return false;
  }
  await delay(TIMING.DIALOG_APPEAR_DELAY);
  await pollAndClick(() => findConfirmButton(keywords));
  await delay(TIMING.DELETION_COMPLETE_DELAY);
  return true;
}

const PROGRESS_CHANNEL = 'batch-delete';

/** Runs batch deletions and shows their progress. */
export class LibraryBatchDeleter {
  constructor(
    private readonly t: (key: string) => string,
    private readonly toaster: Toaster,
  ) {}

  async run(conversationIds: readonly string[]): Promise<BatchDeleteResult> {
    const keywords = (this.t('batch_delete_match_patterns') || '')
      .split(/[,，、；;]+/)
      .map((value) => value.trim().toLowerCase())
      .filter(Boolean);
    const result: BatchDeleteResult = { successCount: 0, failedCount: 0 };
    try {
      this.showProgress(0, conversationIds.length);
      for (let index = 0; index < conversationIds.length; index++) {
        this.showProgress(index + 1, conversationIds.length);
        if (await deletePrompt(conversationIds[index], keywords)) result.successCount++;
        else result.failedCount++;
        if (index < conversationIds.length - 1) await delay(TIMING.DELAY_BETWEEN_DELETIONS);
      }
    } finally {
      this.hideProgress();
    }
    return result;
  }

  hideProgress(): void {
    this.toaster.dismiss(PROGRESS_CHANNEL);
  }

  private showProgress(current: number, total: number): void {
    const message = this.t('batch_delete_in_progress')
      .replace('{current}', String(current))
      .replace('{total}', String(total));
    this.toaster.show({ message, pending: true, durationMs: null, channel: PROGRESS_CHANNEL });
  }
}
